import Link from "next/link";
import NotificationBell from "./NotificationBell";
import NavMore from "./NavMore";

const primary = [
  { href: "/feed", label: "Feed" },
  { href: "/explore", label: "Explore" },
  { href: "/shorts", label: "Shorts" },
  { href: "/live", label: "Live" },
  { href: "/messages", label: "Messages" },
  { href: "/drive", label: "Drive" },
  { href: "/ai", label: "AI" },
  { href: "/settings", label: "Settings" }
];

// Everything that is real but reached less often.
const more = [
  { href: "/search", label: "Search" },
  { href: "/for-you", label: "For you" },
  { href: "/following", label: "Following" },
  { href: "/studio", label: "Studio" },
  { href: "/groups", label: "Groups" },
  { href: "/saved", label: "Saved" },
  { href: "/history", label: "History" },
  { href: "/moderation", label: "Moderation" },
  { href: "/ops", label: "Ops" }
];

export default function Nav() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-1 gap-y-1 px-4 py-3">
        <Link href="/" className="mr-4 font-bold tracking-tight text-brand-700">
          Sangam
        </Link>
        {primary.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-slate-100"
          >
            {l.label}
          </Link>
        ))}
        <NavMore links={more} />
        <NotificationBell />
      </nav>
    </header>
  );
}
