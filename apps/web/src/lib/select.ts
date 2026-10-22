/**
 * What may leave the server about a person.
 *
 * The `User` row carries an email, a phone number, a bcrypt password hash, an
 * internal code and a role. `include: { author: true }` selects every one of
 * them, and a route that returns that object verbatim publishes them - which is
 * exactly what happened on the public feed and on the bookmarks list.
 *
 * So the rule is: never `include` a user. Always `select`, from here. Adding a
 * column to the schema then cannot leak it by accident, because nothing selects
 * it until someone deliberately adds it below.
 */

/** A person as anyone is allowed to see them. */
export const PUBLIC_USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  bio: true,
  avatarUrl: true,
  coverUrl: true,
  isVerified: true,
  createdAt: true
} as const;

/**
 * A person as the viewer sees themselves. Adds the contact details, which are
 * the viewer's own, and never the password hash or the internal code.
 */
export const SELF_USER_SELECT = {
  ...PUBLIC_USER_SELECT,
  email: true,
  phone: true,
  role: true
} as const;

/** The narrowest thing a list needs, for a feed or a comment thread. */
export const AUTHOR_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  isVerified: true
} as const;

/** Media as a client needs it to render. The key is required to build a URL. */
export const MEDIA_PUBLIC_SELECT = {
  id: true,
  kind: true,
  storageKey: true,
  mimeType: true,
  width: true,
  height: true,
  durationMs: true,
  thumbnailKey: true,
  hlsKey: true,
  previewKey: true,
  renditions: true
} as const;

/** The include shape for a post in a list: a narrow author, and its media. */
export const POST_INCLUDE_PUBLIC = {
  author: { select: AUTHOR_SELECT },
  media: { select: MEDIA_PUBLIC_SELECT }
} as const;

/** A list of the columns that must never be serialised to a client. */
export const NEVER_SELECT = [
  "passwordHash",
  "email",
  "phone",
  "code",
  "emailVerified",
  "backupPassphraseCipher"
] as const;
