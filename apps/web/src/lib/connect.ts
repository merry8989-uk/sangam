/**
 * The primary interaction on a profile or post: Connect, Follow or Subscribe.
 *
 * All three are stored on the same Follow row - a CONNECT is a row at PENDING
 * until the other person accepts, and SUBSCRIBE is marked by its kind. Keeping
 * them in one table means the existing follow graph, block checks and
 * notifications keep working.
 *
 * The state machine below is pure so it can be unit-tested without a database.
 */

import type { PrimaryAction } from "./postDisplay";

export type FollowKind = "FOLLOW" | "SUBSCRIBE" | "CONNECT";

/** Where the viewer stands with the target, whichever action is on offer. */
export type PrimaryState = "NONE" | "PENDING_OUT" | "PENDING_IN" | "ACTIVE";

type FollowRow = {
  followerId: string;
  followeeId: string;
  status: string;
  kind?: string | null;
} | null | undefined;

/**
 * Read the row from the viewer's side.
 *
 * The row may point either way: the viewer following the target, or the target
 * having sent a connect request the viewer has not answered yet. A pending row
 * the viewer sent is PENDING_OUT; one they received is PENDING_IN.
 */
export function primaryState(row: FollowRow, viewerId: string, targetId: string): PrimaryState {
  if (!row) return "NONE";
  if (row.status === "ACCEPTED") return "ACTIVE";
  if (row.status === "PENDING") {
    return row.followerId === viewerId ? "PENDING_OUT" : "PENDING_IN";
  }
  return "NONE";
}

/** What the button says, given the chosen action and where the viewer stands. */
export function primaryButtonLabel(action: PrimaryAction, state: PrimaryState): string {
  if (action === "CONNECT") {
    if (state === "ACTIVE") return "Connected";
    if (state === "PENDING_OUT") return "Requested";
    if (state === "PENDING_IN") return "Accept";
    return "Connect";
  }
  if (action === "SUBSCRIBE") {
    if (state === "PENDING_IN") return "Accept";
    return state === "ACTIVE" ? "Subscribed" : "Subscribe";
  }
  // FOLLOW
  if (state === "PENDING_IN") return "Accept";
  return state === "ACTIVE" ? "Following" : "Follow";
}

/** The action to POST when the button is pressed. */
export function primaryButtonAction(action: PrimaryAction, state: PrimaryState): string {
  if (state === "PENDING_IN") return "accept";
  if (state === "PENDING_OUT") return "cancel";
  if (state === "ACTIVE") {
    if (action === "CONNECT") return "disconnect";
    if (action === "SUBSCRIBE") return "unsubscribe";
    return "unfollow";
  }
  if (action === "CONNECT") return "connect";
  if (action === "SUBSCRIBE") return "subscribe";
  return "follow";
}

/** One line under the button, so the consequence is clear before pressing. */
export function primaryButtonHint(action: PrimaryAction, state: PrimaryState): string {
  if (state === "PENDING_OUT") return "Waiting for them to accept.";
  if (state === "PENDING_IN") return "They asked to connect. Accepting connects you both.";
  if (state === "ACTIVE") {
    if (action === "CONNECT") return "You are connected.";
    if (action === "SUBSCRIBE") return "You are subscribed to this channel.";
    return "You follow them.";
  }
  if (action === "CONNECT") return "Sends a request. You connect once they accept.";
  if (action === "SUBSCRIBE") return "Subscribe to this channel.";
  return "Follow straight away.";
}

/** Which notification the target should get for a given action. */
export function notifyTypeFor(action: string): "connect" | "subscribe" | "follow" | null {
  if (action === "connect") return "connect";
  if (action === "subscribe") return "subscribe";
  if (action === "follow") return "follow";
  return null;
}

/** The kind to stamp on the row. */
export function kindFor(action: PrimaryAction): FollowKind {
  if (action === "CONNECT") return "CONNECT";
  if (action === "SUBSCRIBE") return "SUBSCRIBE";
  return "FOLLOW";
}

/**
 * Whether the chosen action is offered on a given surface. A channel page can
 * offer Subscribe; a person's post cannot. Kept here so both the button and the
 * menu agree on the rule.
 */
export function actionAllowedOn(action: PrimaryAction, surface: "profile" | "post" | "channel"): boolean {
  if (action === "SUBSCRIBE") return surface === "channel";
  return true;
}
