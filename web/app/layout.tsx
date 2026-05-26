import type { Metadata } from "next";
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
          <a href="/" className="brand">
            EMPIRE<span>COMMAND CENTER</span>
          </a>
          <nav className="row" style={{ marginLeft: "auto", gap: 18 }}>
            <a href="/" className="muted">
              Projects
            </a>
            <a href="/manager" className="muted">
              Manager bot
            </a>
          </nav>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
