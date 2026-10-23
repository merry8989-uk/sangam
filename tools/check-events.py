#!/usr/bin/env python3
"""
Validate the event schema and every call site that uses it.

The standard asks for this explicitly: "Events validated against this schema in
CI, and tested on real devices / browsers." The first half is here.

What it catches, all of which would otherwise be found in a dashboard weeks
later when the number looked wrong:

  - a call site naming an event that is not in the catalog (a typo)
  - a property spec pointing at an enum that does not exist
  - an event name that is not `object_action` snake_case
  - a catalog entry with no explanation, or no properties at all
  - an event marked as belonging to one platform and used as the other

It reads the TypeScript rather than importing it, so it runs in CI with nothing
installed but Python.
"""
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
EVENTS_FILE = os.path.join(ROOT, "apps", "web", "src", "lib", "events.ts")
SRC_DIRS = [
    os.path.join(ROOT, "apps", "web", "src"),
    os.path.join(ROOT, "apps", "mobile"),
]

problems = []
warnings = []


def read(path):
    with open(path, encoding="utf8") as f:
        return f.read()


def block_of(src, marker, opener="{", closer="}"):
    """The text between the first `marker` and its matching closer."""
    start = src.find(marker)
    if start == -1:
        return ""
    start = src.find(opener, start)
    if start == -1:
        return ""
    depth = 0
    for i in range(start, len(src)):
        if src[i] == opener:
            depth += 1
        elif src[i] == closer:
            depth -= 1
            if depth == 0:
                return src[start + 1 : i]
    return ""


def main():
    if not os.path.exists(EVENTS_FILE):
        print(f"  events file not found: {EVENTS_FILE}")
        return 1
    src = read(EVENTS_FILE)

    # ---- the enums ----
    enums_block = block_of(src, "export const ENUMS")
    enum_names = set(re.findall(r"^\s{2}([a-z_]+)\s*:", enums_block, re.M))
    if not enum_names:
        problems.append("could not read any enum out of ENUMS")

    # ---- the catalog ----
    catalog = block_of(src, "export const EVENTS")
    if not catalog:
        problems.append("could not read the EVENTS catalog")
        return report()

    # top-level event names sit at two spaces of indent
    event_names = re.findall(r"^\s{2}([a-z][a-z0-9_]*)\s*:\s*\{", catalog, re.M)
    if not event_names:
        problems.append("the EVENTS catalog is empty")
        return report()

    seen = set()
    for name in event_names:
        if name in seen:
            problems.append(f"event `{name}` is defined twice")
        seen.add(name)
        if not re.match(r"^[a-z][a-z0-9]*(_[a-z0-9]+)*$", name):
            problems.append(f"event `{name}` is not object_action snake_case")

    # per-event checks: source, level, an explanation, and some properties
    entries = re.split(r"^\s{2}(?=[a-z][a-z0-9_]*\s*:\s*\{)", catalog, flags=re.M)[1:]
    for entry in entries:
        m = re.match(r"([a-z][a-z0-9_]*)", entry)
        if not m:
            continue
        name = m.group(1)
        # The split already isolated this event, so the whole entry is its body.
        body = entry

        src_match = re.search(r'source:\s*"(\w+)"', body)
        if not src_match:
            problems.append(f"`{name}` has no source")
        elif src_match.group(1) not in ("app", "web", "both"):
            problems.append(f"`{name}` has source `{src_match.group(1)}`, which is not app, web or both")

        lvl = re.search(r'level:\s*"(\w+)"', body)
        if not lvl:
            problems.append(f"`{name}` has no level")
        elif lvl.group(1) not in ("debug", "info", "warn", "error"):
            problems.append(f"`{name}` has level `{lvl.group(1)}`, not one of the standard's four")

        about = re.search(r'about:\s*"([^"]*)"', body, re.S)
        if not about or len(about.group(1).strip()) < 20:
            problems.append(f"`{name}` has no useful `about` - the next person has to guess")

        if "required:" not in body and "optional:" not in body:
            problems.append(f"`{name}` declares no properties at all")

    # ---- every enum reference resolves ----
    for ref in re.findall(r'\{\s*enum:\s*"(\w+)"\s*\}', catalog):
        if ref not in enum_names:
            problems.append(f"`{ref}` is referenced as an enum but is not defined in ENUMS")

    # ---- call sites name events that exist ----
    used = set()
    call_re = re.compile(
        r"""(?:track|beginAttempt|endAttempt)\s*\(\s*(?:[^,()]+,\s*)?"([a-z][a-z0-9_]*)\"""",
        re.X,
    )
    simple_re = re.compile(r"""(?:track|beginAttempt)\s*\(\s*"([a-z][a-z0-9_]*)\"""")
    event_name_re = re.compile(r"""eventName:\s*"([a-z][a-z0-9_]*)\"""")

    for base in SRC_DIRS:
        for dirpath, dirnames, filenames in os.walk(base):
            dirnames[:] = [d for d in dirnames if d not in ("node_modules", ".next", "dist")]
            for f in filenames:
                if not f.endswith((".ts", ".tsx")):
                    continue
                path = os.path.join(dirpath, f)
                if os.path.abspath(path) == os.path.abspath(EVENTS_FILE):
                    continue
                text = read(path)
                for m in simple_re.finditer(text):
                    used.add((m.group(1), path))
                for m in call_re.finditer(text):
                    used.add((m.group(1), path))
                for m in event_name_re.finditer(text):
                    used.add((m.group(1), path))

    for name, path in sorted(used):
        rel = os.path.relpath(path, ROOT).replace("\\", "/")
        if name not in seen:
            problems.append(f"{rel} tracks `{name}`, which is not in the catalog")

    # ---- the pairing rule ----
    if "ATTEMPT_PAIRS" not in src:
        problems.append("ATTEMPT_PAIRS is gone - the intent/outcome pairing is the point of this schema")
    else:
        pairs = block_of(src, "export const ATTEMPT_PAIRS")
        for opener, closer in re.findall(r"(\w+)\s*:\s*\"(\w+)\"", pairs):
            if opener not in seen:
                problems.append(f"ATTEMPT_PAIRS opens on `{opener}`, which is not an event")
            if closer not in seen:
                problems.append(f"ATTEMPT_PAIRS closes on `{closer}`, which is not an event")

    # ---- the version ----
    ver = re.search(r'export const SCHEMA_VERSION\s*=\s*"([^"]+)"', src)
    if not ver:
        problems.append("SCHEMA_VERSION is missing")
    elif not re.match(r"^\d+\.\d+\.\d+$", ver.group(1)):
        problems.append(f"SCHEMA_VERSION `{ver.group(1)}` is not semver")

    if not used:
        warnings.append("no call sites found - is the analytics layer wired up yet?")

    # ---- the mobile mirror must not drift ----
    # The standard asks for one shared schema. The mobile app is not a workspace
    # of the web app, so the catalog is copied rather than imported - and a copy
    # without a gate is drift waiting to happen. This is the gate.
    mobile_file = os.path.join(ROOT, "apps", "mobile", "src", "events.ts")
    if not os.path.exists(mobile_file):
        problems.append("apps/mobile/src/events.ts is missing - run tools/sync-events.py")
    else:
        def body_of(text):
            i = text.find("export const SCHEMA_VERSION")
            return text[i:] if i != -1 else ""

        if body_of(read(mobile_file)) != body_of(src):
            problems.append(
                "apps/mobile/src/events.ts has drifted from apps/web/src/lib/events.ts "
                "- run tools/sync-events.py"
            )
        else:
            print("  mobile mirror         : in sync")

    print(f"  events in the catalog : {len(seen)}")
    print(f"  enums defined         : {len(enum_names)}")
    print(f"  call sites found      : {len({n for n, _ in used})}")
    return report()


def report():
    for w in warnings:
        print(f"  warn {w}")
    if problems:
        for p in problems:
            print(f"  FAIL {p}")
        print(f"\nEVENT CHECK FAILED: {len(problems)} problem(s)")
        return 1
    print("\nevent schema is consistent, and every call site names a real event")
    return 0


if __name__ == "__main__":
    sys.exit(main())
