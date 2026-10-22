#!/usr/bin/env python3
"""
Fail the build if a route can serialise a user's private columns.

The bug this guards against really happened: the public feed used
`include: { author: true }`, which selects every column of the User row, and
returned it verbatim. Anyone could read the bcrypt hash, the email address and
the phone number of every post author.

Two rules, both cheap to check:

  1. A relation to a person must be selected, never included whole. `author:
     true` selects everything; `author: { select: ... }` selects what is listed.
  2. A select must not name a column that must never leave the server.

Run it in CI. It is deliberately blunt: a false positive costs one line of
explanation, and a false negative costs a data breach.
"""
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "apps", "web", "src")

# Relations that point at a User row. `include: { author: true }` on any of these
# pulls the whole row.
PERSON_RELATIONS = [
    "author", "user", "owner", "follower", "followee", "reporter",
    "sender", "recipient", "actor", "member", "participant", "createdBy",
    "uploadedBy", "moderator", "reviewer", "assignedTo",
]

# Columns that must never reach a client, whatever the context.
FORBIDDEN_COLUMNS = [
    "passwordHash", "backupPassphraseCipher", "emailVerified",
]

# Columns that are fine for the owner but not for anyone else. Flagged with a
# note rather than an error, so the check stays useful.
OWNER_ONLY_COLUMNS = ["email", "phone", "code"]

# Files that legitimately mention these, and why.
# Files that legitimately read a secret server-side. Reading is not returning:
# a login must compare against the hash, and a restore must open the sealed
# passphrase. These are allow-listed by name so a NEW file that reads one still
# fails the check.
EXEMPT = {
    "lib/select.ts": "defines the allowed shapes",
    "lib/diagnostics.ts": "redaction rules name the fields it strips",
    "lib/backupCrypto.ts": "seals and opens the passphrase",
    "lib/backupRestore.ts": "validates a backup, which is hostile input",
    "lib/backupRun.ts": "reads the sealed passphrase to run a backup",
    "lib/backupRestoreRun.ts": "reads the sealed passphrase to restore",
    "lib/auth.ts": "NextAuth compares the password against the hash",
    "api/register/route.ts": "hashes the password on sign-up",
    "api/mobile/login/route.ts": "compares the password against the hash",
    "api/settings/route.ts": "seals the passphrase, and strips it from the response",
}

bad = []
warn = []


def rel(path):
    return os.path.relpath(path, os.path.dirname(ROOT)).replace("\\", "/")


def exempt(path):
    return any(key in path.replace("\\", "/") for key in EXEMPT)


def walk():
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in ("node_modules", ".next", "dist")]
        for f in filenames:
            if f.endswith((".ts", ".tsx")):
                yield os.path.join(dirpath, f)


def main():
    for path in walk():
        if exempt(path):
            continue
        src = open(path, encoding="utf8").read()
        lines = src.split("\n")
        for i, line in enumerate(lines, 1):
            stripped = line.strip()
            if stripped.startswith("//") or stripped.startswith("*"):
                continue
            # rule 1: a bare `relation: true` on a person
            for name in PERSON_RELATIONS:
                if re.search(rf"\b{name}\s*:\s*true\b", line):
                    bad.append((path, i, f"`{name}: true` selects every column of the user row; use a select"))
            # rule 2: a forbidden column named anywhere, except where it is
            # only being reduced to a boolean - `Boolean(row.secretCipher)` is
            # a "is it set?" check and returns no secret.
            reduces_to_boolean = bool(re.search(r"\bBoolean\s*\(", line))
            for col in FORBIDDEN_COLUMNS:
                if re.search(rf"\b{col}\b", line) and not reduces_to_boolean:
                    bad.append((path, i, f"`{col}` must never be selected or returned"))
            for col in OWNER_ONLY_COLUMNS:
                if re.search(rf"\b{col}\s*:\s*true\b", line):
                    warn.append((path, i, f"`{col}` selected - make sure only the owner sees this"))

    for path, line, note in bad:
        print(f"  FAIL {rel(path)}:{line}")
        print(f"       {note}")
    for path, line, note in warn:
        print(f"  warn {rel(path)}:{line}")
        print(f"       {note}")

    print()
    if bad:
        print(f"LEAK CHECK FAILED: {len(bad)} problem(s)")
        return 1
    print(f"leak check passed ({len(warn)} warning(s) to eyeball)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
