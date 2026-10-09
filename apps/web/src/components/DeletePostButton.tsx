"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DeletePostButton({ postId }: { postId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!window.confirm("Delete this post? This cannot be undone.")) return;
    setBusy(true);
    const res = await fetch(`/api/posts/${postId}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) router.push("/feed");
  }

  return (
    <button
      onClick={remove}
      disabled={busy}
      className="rounded-lg bg-slate-100 px-3 py-1 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
    >
      {busy ? "Deleting..." : "Delete"}
    </button>
  );
}
