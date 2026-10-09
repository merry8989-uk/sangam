import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import AiLauncher from "@/components/AiLauncher";

export const metadata: Metadata = {
  title: "Sangam",
  description: "A homegrown, India-hosted social + video media platform."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body className="min-h-screen">
        <Nav />
        {children}
        <AiLauncher />
      </body>
    </html>
  );
}
