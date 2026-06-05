import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Empire Command Center",
  description: "Scene-based AI video generation orchestrator",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <Link href="/" className="brand">
            EMPIRE<span>COMMAND CENTER</span>
          </Link>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
