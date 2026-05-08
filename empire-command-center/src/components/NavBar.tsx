"use client";

import Link from "next/link";
import { Home, FolderKanban, CheckSquare, Lightbulb, FileText, Settings } from "lucide-react";

export default function NavBar({ activeOrgName }: { activeOrgName?: string }) {
  return (
    <nav className="border-b border-empire-border bg-empire-surface sticky top-0 z-40 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 flex items-center justify-between h-14">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-empire-neon to-empire-violet shadow-neon" />
          <span className="font-semibold tracking-tight">
            Empire <span className="text-empire-neon">Command</span>
          </span>
          {activeOrgName && (
            <span className="hidden sm:inline-block text-xs text-empire-textMuted ml-3 px-2 py-1 rounded bg-empire-card border border-empire-border">
              {activeOrgName}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <NavLink href="/dashboard" icon={<Home size={16} />} label="Dashboard" />
          <NavLink href="/projects"  icon={<FolderKanban size={16} />} label="Projects" />
          <NavLink href="/tasks"     icon={<CheckSquare size={16} />} label="Tasks" />
          <NavLink href="/ideas"     icon={<Lightbulb size={16} />} label="Ideas" />
          <NavLink href="/documents" icon={<FileText size={16} />} label="Docs" />
          <NavLink href="/settings"  icon={<Settings size={16} />} label="" />
        </div>
      </div>
    </nav>
  );
}

function NavLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-empire-card hover:text-empire-neon transition-colors"
    >
      {icon}
      {label && <span className="hidden md:inline">{label}</span>}
    </Link>
  );
}
