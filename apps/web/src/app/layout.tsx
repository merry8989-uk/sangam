import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sangam",
  description: "A homegrown, India-hosted social + video media platform."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
