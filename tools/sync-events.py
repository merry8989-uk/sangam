#!/usr/bin/env python3
"""
Regenerate the mobile mirror of the event catalog.

The standard asks for one shared schema so app and web data joins cleanly. The
mobile app is not a workspace of the web app, so it cannot import the original;
the file is copied instead, and tools/check-events.py fails the build if the two
differ. This is the script that makes the copy.

Edit apps/web/src/lib/events.ts, then run this.
"""
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
WEB = os.path.join(ROOT, "apps", "web", "src", "lib", "events.ts")
MOBILE = os.path.join(ROOT, "apps", "mobile", "src", "events.ts")

HEADER = '''/**
 * The event catalog, and the rules that keep it a schema rather than a habit.
 *
 * ---------------------------------------------------------------------------
 * THIS FILE IS MIRRORED FROM apps/web/src/lib/events.ts. Do not edit it here.
 *
 * The standard asks for one shared schema so app and web data joins cleanly.
 * The mobile app is not a workspace of the web app, so it cannot import the
 * original; the file is copied instead, and `tools/check-events.py` fails the
 * build if the two ever differ. A mirror with a gate is a checked invariant; a
 * mirror without one is drift waiting to happen.
 *
 * Edit the web copy, then run:  python3 tools/sync-events.py
 * ---------------------------------------------------------------------------
 *
 * This is the shared standard for both the Android app and the web, so the two
 * can be joined and compared. It exists because of a specific failure: a
 * diagnostics log showed 71 "access fix requested" entries and not one "fix
 * result". The log proved a user was stuck in a loop and could not say why.
 *
 * The rule that came out of it, and the one this file enforces:
 *
 *   An event must carry intent, outcome and context together - not intent
 *   alone. `access_fix_requested` and `access_fix_result` share an `attempt_id`,
 *   so the two halves of one user action are one story.
 *
 * Kept pure. The validator runs in CI and again at the call site, and both use
 * the same rules, so an event cannot be valid in one place and invalid in the
 * other.
 */'''


def body(text):
    """Everything from the first export onward - the part that must match."""
    i = text.find("export const SCHEMA_VERSION")
    return text[i:] if i != -1 else ""


def main():
    web = open(WEB, encoding="utf8").read()
    b = body(web)
    if not b:
        print("could not find the body in the web copy")
        return 1
    with open(MOBILE, "w", encoding="utf8") as f:
        f.write(HEADER + "\n\n" + b)
    print(f"wrote {os.path.relpath(MOBILE, ROOT)} from the web copy")
    return 0


if __name__ == "__main__":
    sys.exit(main())
