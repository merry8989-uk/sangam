import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import AiBar from "@/components/AiBar";

export const metadata: Metadata = {
  title: "Sangam",
  description: "A homegrown, India-hosted social + video media platform."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body className="min-h-screen">
        <Nav />
        <div className="flex">
          <div className="min-w-0 flex-1">{children}</div>
          <AiBar />
        </div>
      </body>
    </html>
  );
}
