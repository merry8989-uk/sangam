/**
 * Post display preferences.
 *
 * These are the settings the three-dot menu on a post writes: which action the
 * primary button offers, which metadata is visible, and which interface
 * elements are drawn at all.
 *
 * Kept as plain functions with no database or framework imports so the resolve
 * rules can be unit-tested directly.
 */

export const PRIMARY_ACTIONS = ["CONNECT", "FOLLOW", "SUBSCRIBE"] as const;
export type PrimaryAction = (typeof PRIMARY_ACTIONS)[number];

/**
 * What the primary button says. The first word is the action; once it is on,
 * the button shows the state instead, so the user can see where they stand.
 */
export function primaryActionLabel(action: PrimaryAction, active: boolean): string {
  switch (action) {
    case "CONNECT":
      return active ? "Connected" : "Connect";
    case "FOLLOW":
      return active ? "Following" : "Follow";
    case "SUBSCRIBE":
      return active ? "Subscribed" : "Subscribe";
    default:
      return "Connect";
  }
}

/** A short line explaining what the button will do, for the settings list. */
export function primaryActionHint(action: PrimaryAction): string {
  switch (action) {
    case "CONNECT":
      return "Ask to connect - the other person accepts before you follow each other.";
    case "FOLLOW":
      return "Follow straight away. No approval needed.";
    case "SUBSCRIBE":
      return "Subscribe to a channel for its posts and videos.";
    default:
      return "";
  }
}

export type DisplayGroup = "metadata" | "elements";

export interface DisplayToggle {
  key: DisplayKey;
  /** The column this toggle writes to on UserSettings. */
  settingKey: string;
  label: string;
  group: DisplayGroup;
  /** Shown under the label in the menu. */
  hint: string;
}

export type DisplayKey =
  | "caption"
  | "likeCount"
  | "commentCount"
  | "viewCount"
  | "shareCount"
  | "saveCount"
  | "authorAvatar"
  | "authorHandle"
  | "timestamp"
  | "mediaBadges"
  | "primaryActionButton"
  | "likeButton"
  | "commentButton"
  | "shareButton"
  | "saveButton"
  | "actionLabels"
  | "compact";

/** The full set of toggles, in the order the menu lists them. */
export const DISPLAY_TOGGLES: DisplayToggle[] = [
  { key: "caption", settingKey: "showCaption", label: "Captions", group: "metadata", hint: "The words the author wrote under the post." },
  { key: "likeCount", settingKey: "showLikeCount", label: "Like counts", group: "metadata", hint: "How many people loved it." },
  { key: "commentCount", settingKey: "showCommentCount", label: "Comment counts", group: "metadata", hint: "How many comments are on it." },
  { key: "viewCount", settingKey: "showViewCount", label: "View counts", group: "metadata", hint: "How many times it was watched." },
  { key: "shareCount", settingKey: "showShareCount", label: "Share counts", group: "metadata", hint: "How many times it was shared." },
  { key: "saveCount", settingKey: "showSaveCount", label: "Saved counts", group: "metadata", hint: "How many people saved it." },

  { key: "authorAvatar", settingKey: "showAuthorAvatar", label: "Author photo", group: "elements", hint: "The profile picture beside the name." },
  { key: "authorHandle", settingKey: "showAuthorHandle", label: "Author name", group: "elements", hint: "The @handle on each post." },
  { key: "timestamp", settingKey: "showTimestamp", label: "Time posted", group: "elements", hint: "When it was posted." },
  { key: "mediaBadges", settingKey: "showMediaBadges", label: "Media badges", group: "elements", hint: "LIVE and duration labels over the video." },
  { key: "primaryActionButton", settingKey: "showPrimaryAction", label: "Primary button", group: "elements", hint: "Connect, Follow or Subscribe, per your choice." },
  { key: "likeButton", settingKey: "showLikeButton", label: "Love button", group: "elements", hint: "Hide the love button itself." },
  { key: "commentButton", settingKey: "showCommentButton", label: "Comment button", group: "elements", hint: "Hide the comment button itself." },
  { key: "shareButton", settingKey: "showShareButton", label: "Share button", group: "elements", hint: "Hide the share button itself." },
  { key: "saveButton", settingKey: "showSaveButton", label: "Save button", group: "elements", hint: "Hide the save button itself." },
  { key: "actionLabels", settingKey: "showActionLabels", label: "Button words", group: "elements", hint: "Show words next to the icons. Off = icons only." },
  { key: "compact", settingKey: "compactFeed", label: "Compact posts", group: "elements", hint: "Tighter spacing, less padding per post." }
];

export type PostDisplay = {
  primaryAction: PrimaryAction;
  focusMode: boolean;
} & Record<DisplayKey, boolean>;

/** Every switch on, the primary action set to Connect. */
export const DEFAULT_DISPLAY: PostDisplay = {
  primaryAction: "CONNECT",
  focusMode: false,
  caption: true,
  likeCount: true,
  commentCount: true,
  viewCount: true,
  shareCount: true,
  saveCount: true,
  authorAvatar: true,
  authorHandle: true,
  timestamp: true,
  mediaBadges: true,
  primaryActionButton: true,
  likeButton: true,
  commentButton: true,
  shareButton: true,
  saveButton: true,
  actionLabels: true,
  compact: false
};

const COUNT_KEYS: DisplayKey[] = ["likeCount", "commentCount", "viewCount", "shareCount", "saveCount"];

/** Anything that looks like a settings row. Read defensively - the row may be a
 *  partial object, or a value that predates a later field. */
type SettingsLike = Partial<Record<string, unknown>> | null | undefined;

function boolFrom(settings: SettingsLike, key: string, fallback: boolean): boolean {
  const v = settings ? settings[key] : undefined;
  return typeof v === "boolean" ? v : fallback;
}

function actionFrom(settings: SettingsLike): PrimaryAction {
  const v = settings ? settings.primaryAction : undefined;
  return (PRIMARY_ACTIONS as readonly string[]).includes(v as string)
    ? (v as PrimaryAction)
    : DEFAULT_DISPLAY.primaryAction;
}

/**
 * Turn a settings row into the object the post components render from.
 *
 * Two rules live here rather than in the components:
 *  - Focus mode wins over the individual count switches. Turning it on hides
 *    every count; turning it off restores whatever the switches say.
 *  - The three-dot menu is never hidden. It is the way back to this menu, so a
 *    setting that could remove it would strand the user with no way to undo.
 */
export function resolveDisplay(settings: SettingsLike): PostDisplay {
  const focusMode = boolFrom(settings, "focusMode", DEFAULT_DISPLAY.focusMode);

  const out: PostDisplay = {
    primaryAction: actionFrom(settings),
    focusMode
  } as PostDisplay;

  for (const t of DISPLAY_TOGGLES) {
    out[t.key] = boolFrom(settings, t.settingKey, DEFAULT_DISPLAY[t.key]);
  }

  if (focusMode) {
    for (const k of COUNT_KEYS) out[k] = false;
  }

  return out;
}

/** Is this particular count visible? Handy inside the post components. */
export function countVisible(display: PostDisplay, key: DisplayKey): boolean {
  return display[key] === true;
}

/** True when every count is hidden, however it happened. */
export function countsAllHidden(display: PostDisplay): boolean {
  return COUNT_KEYS.every((k) => display[k] === false);
}

/** The toggles for one group, in menu order. */
export function togglesFor(group: DisplayGroup): DisplayToggle[] {
  return DISPLAY_TOGGLES.filter((t) => t.group === group);
}

/**
 * Only the keys that are actually part of this feature, so the menu can PUT a
 * minimal body instead of echoing the whole settings row back.
 */
export function displayPatch(display: PostDisplay): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    primaryAction: display.primaryAction,
    focusMode: display.focusMode
  };
  // Keyed by the settings column, because this body goes straight to the API.
  for (const t of DISPLAY_TOGGLES) patch[t.settingKey] = display[t.key];
  return patch;
}
