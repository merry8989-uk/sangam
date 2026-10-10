#!/usr/bin/env python3
"""
Apply the Prisma schema to a real PostgreSQL and report what came out.

Why this exists
---------------
`prisma db push` is the normal way to check that the schema is sound, but the
Prisma CLI bundles a WebAssembly build of the schema engine and instantiates it
at load time. On a small machine (a 2 GB container, a CI runner, a laptop with
other things running) that allocation fails with:

    RangeError: WebAssembly.Instance(): Out of memory

and the CLI never gets far enough to read the schema at all.

Prisma also ships the schema engine as a *native* binary, and that one has no
such problem. This script drives it directly over its JSON-RPC interface, which
is exactly what `prisma db push` does under the hood. The result is the same
DDL, without the WASM allocation.

Usage
-----
    # against a database you already have
    DATABASE_URL=postgresql://user:pass@host:5432/db python tools/verify-schema.py

    # or let it start a throwaway PostgreSQL of its own
    pip install pgserver
    python tools/verify-schema.py

Exit code is 0 when every model became a table with no warnings and nothing
unexecutable, 1 otherwise. That makes it usable as a CI gate.
"""

from __future__ import annotations

import glob
import json
import os
import subprocess
import sys
import threading
import time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
SCHEMA_PATH = os.path.join(REPO, "apps", "web", "prisma", "schema.prisma")

# The engine prints one JSON object per line; this is how long to wait for the
# reply to a single request. A large schema takes a while on first push.
REPLY_TIMEOUT = 180


def find_schema_engine() -> str | None:
    """Locate the native schema-engine binary inside node_modules."""
    patterns = [
        os.path.join(REPO, "**", "@prisma", "engines", "schema-engine-*"),
        os.path.join(REPO, "node_modules", "@prisma", "engines", "schema-engine-*"),
        "/scratch/work/prisma-cli/node_modules/@prisma/engines/schema-engine-*",
    ]
    for pat in patterns:
        hits = [p for p in glob.glob(pat, recursive=True) if os.access(p, os.X_OK)]
        if hits:
            return hits[0]
    return None


def start_local_postgres():
    """Start a throwaway PostgreSQL on TCP, using pgserver's bundled binaries.

    TCP matters: the schema engine reads a `?host=/path` socket URL as a host
    named after the path, so a socket connection fails. pgserver's own
    `get_uri()` returns a socket URL, so we start the server ourselves with the
    binaries it ships instead.

    Returns (url, pgdata) or (None, None) when pgserver is unavailable.
    """
    try:
        import pgserver  # noqa: PLC0415
    except ImportError:
        return None, None

    pkg = os.path.dirname(os.path.abspath(pgserver.__file__))
    bin_dir = os.path.join(pkg, "pginstall", "bin")
    initdb = os.path.join(bin_dir, "initdb")
    pg_ctl = os.path.join(bin_dir, "pg_ctl")
    if not (os.path.exists(initdb) and os.path.exists(pg_ctl)):
        return None, None

    data = os.path.join(REPO, ".schema-check-pgdata")
    port = os.environ.get("SCHEMA_CHECK_PORT", "5433")

    if not os.path.exists(os.path.join(data, "PG_VERSION")):
        os.makedirs(data, exist_ok=True)
        subprocess.run([initdb, "-D", data, "-U", "postgres", "--auth=trust"],
                       capture_output=True, text=True)

    subprocess.run([pg_ctl, "-D", data, "-o",
                    f"-c listen_addresses=127.0.0.1 -p {port} -k /tmp",
                    "-l", os.path.join(data, "server.log"), "start"],
                   capture_output=True, text=True)
    time.sleep(2)
    return f"postgresql://postgres@127.0.0.1:{port}/postgres", data


def engine_request(engine: str, method: str, params: dict, url: str) -> dict:
    """Send one JSON-RPC request to the schema engine and return its reply."""
    env = dict(os.environ, DATABASE_URL=url)
    proc = subprocess.Popen(
        [engine, "--datamodels", SCHEMA_PATH],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, bufsize=1, env=env,
    )
    lines: list[str] = []
    threading.Thread(target=lambda: [lines.append(l) for l in proc.stdout], daemon=True).start()

    proc.stdin.write(json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}) + "\n")
    proc.stdin.flush()

    deadline = time.time() + REPLY_TIMEOUT
    reply = None
    while time.time() < deadline and not reply:
        for line in list(lines):
            try:
                obj = json.loads(line)
            except ValueError:
                continue
            if obj.get("id") == 1:
                reply = obj
                break
        time.sleep(0.4)

    proc.kill()
    if reply is None:
        raise RuntimeError("the schema engine did not reply in time")
    return reply


def main() -> int:
    if not os.path.exists(SCHEMA_PATH):
        print(f"schema not found at {SCHEMA_PATH}")
        return 1

    engine = find_schema_engine()
    if not engine:
        print("native schema engine not found. Run `npm install` in apps/web first,")
        print("or point PRISMA_SCHEMA_ENGINE at the binary.")
        return 1
    print(f"engine : {os.path.basename(engine)}")

    url = os.environ.get("DATABASE_URL")
    server = None
    if url:
        print("target : DATABASE_URL from the environment")
    else:
        url, server = start_local_postgres()
        if not url:
            print("no DATABASE_URL and pgserver is not installed.")
            print("Either set DATABASE_URL, or `pip install pgserver`.")
            return 1
        print(f"target : throwaway PostgreSQL at {url}")

    schema = open(SCHEMA_PATH, encoding="utf-8").read()
    params = {"force": False, "schema": {"files": [{"path": SCHEMA_PATH, "content": schema}]}}

    try:
        reply = engine_request(engine, "schemaPush", params, url)
    except RuntimeError as exc:
        print(f"FAILED: {exc}")
        return 1

    if "error" in reply:
        err = reply["error"]
        detail = err.get("data", {}).get("message") or err.get("message", "")
        print(f"FAILED: {detail}")
        return 1

    result = reply.get("result", {})
    steps = result.get("executedSteps", 0)
    warnings = result.get("warnings") or []
    unexecutable = result.get("unexecutable") or []

    print(f"steps  : {steps} statement(s) applied")
    print(f"warnings     : {len(warnings)}")
    for w in warnings:
        print(f"   - {w}")
    print(f"unexecutable : {len(unexecutable)}")
    for u in unexecutable:
        print(f"   - {u}")

    if warnings or unexecutable:
        print("\nRESULT: schema applied, but with issues to look at.")
        return 1

    print("\nRESULT: schema is valid. Every model became a table.")
    if server is not None:
        print("(stop it with pg_ctl -D .schema-check-pgdata stop, then rm -rf the folder)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
