"use client";
import { useState } from "react";

export default function LikeButton({
  postId,
  initialCount,
  initialLiked,
  showCount = true,
  showLabel = true
}: {
  postId: string;
  initialCount: number;
  initialLiked: boolean;
  /** The post display menu can hide the count but keep the button. */
  showCount?: boolean;
  /** Or drop the words and leave the icon. */
  showLabel?: boolean;
}) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    const optimistic = !liked;
    setLiked(optimistic);
    setCount((c) => c + (optimistic ? 1 : -1));
    try {
      const res = await fetch("/api/likes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId })
      });
      if (res.ok) {
        const d = await res.json();
        setLiked(d.liked);
        setCount(d.likeCount);
      } else {
        setLiked(!optimistic);
        setCount((c) => c + (optimistic ? -1 : 1));
      }
    } catch {
      setLiked(!optimistic);
      setCount((c) => c + (optimistic ? -1 : 1));
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={toggle}
      className={`rounded-lg px-3 py-1 text-sm font-medium ${
        liked ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-ink-700 hover:bg-slate-200"
      }`}
    >
      {showLabel ? (liked ? "Liked" : "Like") : liked ? "♥" : "♡"}
      {showCount ? ` · ${count}` : ""}
    </button>
  );
}
