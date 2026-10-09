"use client";
import { useState } from "react";

export default function FollowButton({
  targetId,
  initialFollowing
}: {
  targetId: string;
  initialFollowing: boolean;
}) {
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const action = following ? "unfollow" : "follow";
    const res = await fetch("/api/follow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetId, action })
    });
    setBusy(false);
    if (res.ok) setFollowing(!following);
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`rounded-lg px-4 py-2 text-sm font-medium ${
        following ? "border border-slate-300 text-ink-700" : "bg-brand-600 text-white hover:bg-brand-700"
      }`}
    >
      {following ? "Following" : "Follow"}
    </button>
  );
}
