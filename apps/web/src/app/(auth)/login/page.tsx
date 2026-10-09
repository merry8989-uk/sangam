"use client";
import { signIn } from "next-auth/react";
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await signIn("credentials", { email, password, redirect: true, callbackUrl: "/feed" });
    if (res?.error) setError("Invalid email or password");
  }

  return (
    <main className="mx-auto max-w-sm px-6 py-20">
      <h1 className="mb-6 text-2xl font-semibold">Log in to Sangam</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        <input
          type="email" required placeholder="Email" value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        />
        <input
          type="password" required placeholder="Password" value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="w-full rounded-lg bg-brand-600 py-2.5 font-medium text-white hover:bg-brand-700">
          Log in
        </button>
      </form>
    </main>
  );
}
