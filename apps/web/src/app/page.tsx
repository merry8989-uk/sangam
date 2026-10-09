import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col items-start gap-6 px-6 py-20">
      <span className="rounded-full bg-brand-100 px-3 py-1 text-sm font-medium text-brand-700">
        Made in India · self-hosted
      </span>
      <h1 className="text-5xl font-bold tracking-tight">Sangam</h1>
      <p className="max-w-xl text-lg text-ink-700">
        One platform for posts, photos, short videos and long-form video -
        built on our own stack and hosted in India. No third-party social APIs.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href="/register" className="rounded-lg bg-brand-600 px-5 py-2.5 font-medium text-white hover:bg-brand-700">
          Create account
        </Link>
        <Link href="/feed" className="rounded-lg border border-slate-300 px-5 py-2.5 font-medium hover:bg-slate-100">
          Feed
        </Link>
        <Link href="/for-you" className="rounded-lg border border-slate-300 px-5 py-2.5 font-medium hover:bg-slate-100">
          For you
        </Link>
        <Link href="/shorts" className="rounded-lg border border-slate-300 px-5 py-2.5 font-medium hover:bg-slate-100">
          Shorts
        </Link>
      </div>
    </main>
  );
}
