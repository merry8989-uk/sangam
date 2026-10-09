"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function CreateGroupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState("PUBLIC");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, visibility })
    });
    setBusy(false);
    if (res.ok) {
      const d = await res.json();
      router.push(`/groups/${d.slug}`);
    } else {
      setError("Could not create group");
    }
  }

  const field = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

  return (
    <form onSubmit={create} className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 font-semibold">Create a group</h2>
      <input className={field} placeholder="Group name" value={name} onChange={(e) => setName(e.target.value)} />
      <textarea
        className={`${field} mt-2`}
        rows={2}
        placeholder="What is it about?"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <div className="mt-2 flex items-center gap-3">
        <select className={field} value={visibility} onChange={(e) => setVisibility(e.target.value)}>
          <option value="PUBLIC">Public</option>
          <option value="PRIVATE">Private</option>
        </select>
        <button
          disabled={busy}
          className="shrink-0 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {busy ? "Creating..." : "Create"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </form>
  );
}
