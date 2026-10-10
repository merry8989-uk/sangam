/**
 * Post display preferences, for the mobile app.
 *
 * Mirrors apps/web/src/lib/postDisplay.ts: same toggles, same settings column
 * names, same resolve rules. It is duplicated rather than shared because the
 * two apps are separate packages with no shared build step - keep the two in
 * step when you change one.
 */

export const PRIMARY_ACTIONS = ["CONNECT", "FOLLOW", "SUBSCRIBE"] as const;
export type PrimaryAction = (typeof PRIMARY_ACTIONS)[number];

export function primaryActionLabel(action: PrimaryAction, active: boolean): string {
  if (action === "CONNECT") return active ? "Connected" : "Connect";
  if (action === "FOLLOW") return active ? "Following" : "Follow";
  return active ? "Subscribed" : "Subscribe";
}

export function primaryActionHint(action: PrimaryAction): string {
  if (action === "CONNECT") return "Ask to connect. They accept before you follow each other.";
  if (action === "FOLLOW") return "Follow straight away.";
  return "Subscribe to a channel for its posts and videos.";
}

export type DisplayGroup = "metadata" | "elements";

export type DisplayKey =
  | "caption" | "likeCount" | "commentCount" | "viewCount" | "shareCount" | "saveCount"
  | "authorAvatar" | "authorHandle" | "timestamp" | "mediaBadges"
  | "primaryActionButton" | "likeButton" | "commentButton" | "shareButton" | "saveButton"
  | "actionLabels" | "compact";

export type DisplayToggle = {
  key: DisplayKey;
  settingKey: string;
  label: string;
  group: DisplayGroup;
  hint: string;
};

export const DISPLAY_TOGGLES: DisplayToggle[] = [
  { key: "caption", settingKey: "showCaption", label: "Captions", group: "metadata", hint: "The words under the post." },
  { key: "likeCount", settingKey: "showLikeCount", label: "Like counts", group: "metadata", hint: "How many people loved it." },
  { key: "commentCount", settingKey: "showCommentCount", label: "Comment counts", group: "metadata", hint: "How many comments." },
  { key: "viewCount", settingKey: "showViewCount", label: "View counts", group: "metadata", hint: "How many times it was watched." },
  { key: "shareCount", settingKey: "showShareCount", label: "Share counts", group: "metadata", hint: "How many times it was shared." },
  { key: "saveCount", settingKey: "showSaveCount", label: "Saved counts", group: "metadata", hint: "How many people saved it." },
  { key: "authorAvatar", settingKey: "showAuthorAvatar", label: "Author photo", group: "elements", hint: "The picture beside the name." },
  { key: "authorHandle", settingKey: "showAuthorHandle", label: "Author name", group: "elements", hint: "The @handle on each post." },
  { key: "timestamp", settingKey: "showTimestamp", label: "Time posted", group: "elements", hint: "When it was posted." },
  { key: "mediaBadges", settingKey: "showMediaBadges", label: "Media badges", group: "elements", hint: "Duration labels over the video." },
  { key: "primaryActionButton", settingKey: "showPrimaryAction", label: "Primary button", group: "elements", hint: "Connect, Follow or Subscribe." },
  { key: "likeButton", settingKey: "showLikeButton", label: "Love button", group: "elements", hint: "Hide the love button." },
  { key: "commentButton", settingKey: "showCommentButton", label: "Comment button", group: "elements", hint: "Hide the comment button." },
  { key: "shareButton", settingKey: "showShareButton", label: "Share button", group: "elements", hint: "Hide the share button." },
  { key: "saveButton", settingKey: "showSaveButton", label: "Save button", group: "elements", hint: "Hide the save button." },
  { key: "actionLabels", settingKey: "showActionLabels", label: "Button words", group: "elements", hint: "Words next to the icons." },
  { key: "compact", settingKey: "compactFeed", label: "Compact posts", group: "elements", hint: "Tighter spacing per post." }
];

export type PostDisplay = { primaryAction: PrimaryAction; focusMode: boolean } & Record<DisplayKey, boolean>;

export const DEFAULT_DISPLAY: PostDisplay = {
  primaryAction: "CONNECT",
  focusMode: false,
  caption: true, likeCount: true, commentCount: true, viewCount: true, shareCount: true, saveCount: true,
  authorAvatar: true, authorHandle: true, timestamp: true, mediaBadges: true,
  primaryActionButton: true, likeButton: true, commentButton: true, shareButton: true, saveButton: true,
  actionLabels: true, compact: false
};

const COUNT_KEYS: DisplayKey[] = ["likeCount", "commentCount", "viewCount", "shareCount", "saveCount"];

type SettingsLike = Partial<Record<string, unknown>> | null | undefined;

function boolFrom(settings: SettingsLike, key: string, fallback: boolean): boolean {
  const v = settings ? settings[key] : undefined;
  return typeof v === "boolean" ? v : fallback;
}

export function resolveDisplay(settings: SettingsLike): PostDisplay {
  const focusMode = boolFrom(settings, "focusMode", false);
  const raw = settings ? settings.primaryAction : undefined;
  const out = {
    primaryAction: (PRIMARY_ACTIONS as readonly string[]).includes(raw as string)
      ? (raw as PrimaryAction)
      : DEFAULT_DISPLAY.primaryAction,
    focusMode
  } as PostDisplay;
  for (const t of DISPLAY_TOGGLES) out[t.key] = boolFrom(settings, t.settingKey, DEFAULT_DISPLAY[t.key]);
  // focus mode hides every count, whatever the individual switches say
  if (focusMode) for (const k of COUNT_KEYS) out[k] = false;
  return out;
}

export function togglesFor(group: DisplayGroup): DisplayToggle[] {
  return DISPLAY_TOGGLES.filter((t) => t.group === group);
}

/** The body to PUT to /api/settings, keyed by the settings column names. */
export function displayPatch(display: PostDisplay): Record<string, unknown> {
  const patch: Record<string, unknown> = { primaryAction: display.primaryAction, focusMode: display.focusMode };
  for (const t of DISPLAY_TOGGLES) patch[t.settingKey] = display[t.key];
  return patch;
}
