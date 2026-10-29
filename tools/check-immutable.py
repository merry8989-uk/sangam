#!/usr/bin/env python3
"""
Fail the build if a sent anonymous message could be changed.

The requirement is explicit: once a message is sent it cannot be edited. That is
easy to honour today and easy to break in six months by adding a PATCH route
because something needed one.

Three locks, and this is the third:

  1. the schema has no `updatedAt` on AnonMessage
  2. there is no update handler in the API
  3. this check, which fails if one appears

A rule that lives only in a document gets broken by the next person. A rule with
a test does not.
"""
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
API = os.path.join(ROOT, "apps", "web", "src", "app", "api", "anon")
SCHEMA = os.path.join(ROOT, "apps", "web", "prisma", "schema.prisma")

problems = []


def main():
    # ---- no update handler anywhere under /api/anon ----
    if os.path.isdir(API):
        for dirpath, _dirnames, filenames in os.walk(API):
            for f in filenames:
                if f != "route.ts":
                    continue
                path = os.path.join(dirpath, f)
                src = open(path, encoding="utf8").read()
                rel = os.path.relpath(path, ROOT).replace("\\", "/")
                for verb in ("PATCH", "PUT"):
                    if re.search(rf"^export\s+(async\s+function|const)\s+{verb}\b", src, re.M):
                        problems.append(f"{rel} exports {verb} - a sent message must not be changeable")
                # An update to a message row anywhere under /api/anon.
                if re.search(r"anonMessage\.update", src):
                    problems.append(f"{rel} updates an AnonMessage - messages are write-once")

    # ---- the schema has no updatedAt on AnonMessage ----
    schema = open(SCHEMA, encoding="utf8").read()
    m = re.search(r"model AnonMessage \{.*?\n\}", schema, re.S)
    if not m:
        problems.append("model AnonMessage is missing from the schema")
    elif re.search(r"^\s*updatedAt\b", m.group(0), re.M):
        problems.append("AnonMessage has an updatedAt - that is a field waiting for an edit")

    # ---- the pure rule still says no ----
    lib = os.path.join(ROOT, "apps", "web", "src", "lib", "anon.ts")
    if os.path.exists(lib):
        src = open(lib, encoding="utf8").read()
        if not re.search(r"export function canEditMessage\(\)\s*:\s*false", src):
            problems.append("canEditMessage no longer returns a literal false")

    if problems:
        for p in problems:
            print(f"  FAIL {p}")
        print(f"\nIMMUTABILITY CHECK FAILED: {len(problems)} problem(s)")
        return 1
    print("messages are write-once: no update handler, no updatedAt, and the rule still says no")
    return 0


if __name__ == "__main__":
    sys.exit(main())
