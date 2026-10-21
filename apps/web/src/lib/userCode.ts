/**
 * The user code.
 *
 * A short, stable, pseudonymous label for an account, in the shape `SG-7K2M4P`.
 * It exists so a diagnostics report can be traced back to one account without
 * carrying a name, an email address, a phone number or a database id - the
 * logging standard this project follows asks for a pseudonymous identifier and
 * nothing else.
 *
 * It is generated once and stored, rather than derived from the identity. A
 * derived code would change the day the salt changes, and support needs a code
 * that still means the same thing six months later.
 *
 * The alphabet and its decode rules follow Crockford Base32, which is designed
 * for exactly this: a code that survives being read off a screen and typed back
 * in. `I` and `L` are not in the alphabet and are read as `1`; `O` is not in it
 * and is read as `0`. Nothing else is ambiguous.
 *
 * Kept pure so the generator and the parser can be tested directly.
 */

/** 0-9 plus A-Z, without I, L and O. */
export const USER_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTUVWXYZ";

export const USER_CODE_PREFIX = "SG-";
export const USER_CODE_LENGTH = 6;

const BODY = `[${USER_CODE_ALPHABET}]{${USER_CODE_LENGTH}}`;

/** Is this already in canonical form? */
export function isUserCode(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return new RegExp(`^${USER_CODE_PREFIX}${BODY}$`).test(value);
}

/** The characters that are not in the alphabet, and what they were meant to be. */
const CONFUSABLE: Record<string, string> = { I: "1", L: "1", O: "0" };

/**
 * Turn whatever the user typed into the canonical form, or "" if it cannot be.
 *
 * Support will get this from a screenshot, a chat message or a phone call, so
 * it has to survive lower case, stray spaces and dashes, a missing prefix, and
 * the three letters that are not in the alphabet.
 */
export function normaliseUserCode(input: string): string {
  const source = String(input ?? "");
  // A written separator is a statement of intent: "SG-7K2M" means a body of
  // "7K2M", which is too short, and must not be re-read as the body "SG7K2M".
  const explicitPrefix = /^\s*SG[-\s]/i.test(source);

  const raw = source.toUpperCase().replace(/[^0-9A-Z]/g, "");

  // Without a separator it is genuinely ambiguous, so both readings are tried.
  // "SG7K2M4P" is eight characters, and so is a body that happens to start with
  // those two letters; the first reading that yields a full-length body wins.
  const bodies: string[] = [];
  if (explicitPrefix) {
    bodies.push(raw.slice(2));
  } else {
    if (raw.startsWith("SG")) bodies.push(raw.slice(2));
    bodies.push(raw);
  }

  for (const body of bodies) {
    const mapped = body.replace(/[ILO]/g, (ch) => CONFUSABLE[ch] ?? ch);
    if (mapped.length === USER_CODE_LENGTH) return `${USER_CODE_PREFIX}${mapped}`;
  }
  return "";
}

/**
 * Generate a code.
 *
 * `random` is a source of numbers in [0, 1), injectable so a test can drive it.
 * Modulo bias is irrelevant here: a code is a label, not a secret.
 */
export function generateUserCode(random: () => number = Math.random): string {
  const alphabet = USER_CODE_ALPHABET;
  let out = "";
  for (let i = 0; i < USER_CODE_LENGTH; i++) {
    out += alphabet[Math.floor(random() * alphabet.length) % alphabet.length];
  }
  return `${USER_CODE_PREFIX}${out}`;
}

/** A code that is not a code, for a report sent with no account. */
export const ANONYMOUS_CODE = "SG-ANON";

/**
 * The code to put in a report. An anonymous report gets a fixed label rather
 * than a blank, so a report is never ambiguous about whether it had an account.
 */
export function codeForReport(code: string | null | undefined): string {
  if (code && isUserCode(code)) return code;
  return ANONYMOUS_CODE;
}

/** A short line explaining the code to the user. */
export const USER_CODE_EXPLANATION =
  "A short label for your account. It is what support sees instead of your name or email address.";
