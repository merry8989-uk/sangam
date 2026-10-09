import Link from "next/link";
import NotificationBell from "./NotificationBell";

const links = [
  { href: "/ai", label: "AI" },
  { href: "/feed", label: "Feed" },
  { href: "/explore", label: "Explore" },
  { href: "/search", label: "Search" },
  { href: "/for-you", label: "For you" },
  { href: "/shorts", label: "Shorts" },
  { href: "/following", label: "Following" },
  { href: "/studio", label: "Studio" },
  { href: "/moderation", label: "Moderation" },
  { href: "/messages", label: "Messages" },
  { href: "/settings", label: "Settings" }
];

export default function Nav() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <nav className="mx-auto flex max-w-5xl items-center gap-1 px-4 py-3">
        <Link href="/" className="mr-4 font-bold tracking-tight text-brand-700">
          Sangam
        </Link>
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-slate-100"
          >
            {l.label}
          </Link>
        ))}
        <NotificationBell />
      </nav>
    </header>
  );
}
