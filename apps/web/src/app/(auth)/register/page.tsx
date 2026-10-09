"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", username: "", displayName: "", password: "" });
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });
    if (res.ok) router.push("/login");
    else setError((await res.json()).error ?? "Could not register");
  }

  const field = (k: keyof typeof form, type = "text", ph = "") => (
    <input
      type={type} required placeholder={ph} value={form[k]}
      onChange={(e) => setForm({ ...form, [k]: e.target.value })}
      className="w-full rounded-lg border border-slate-300 px-3 py-2"
    />
  );

  return (
    <main className="mx-auto max-w-sm px-6 py-20">
      <h1 className="mb-6 text-2xl font-semibold">Join Sangam</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        {field("displayName", "text", "Full name")}
        {field("username", "text", "Username")}
        {field("email", "email", "Email")}
        {field("password", "password", "Password")}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="w-full rounded-lg bg-brand-600 py-2.5 font-medium text-white hover:bg-brand-700">
          Create account
        </button>
      </form>
    </main>
  );
}
