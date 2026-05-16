"use client";

import * as React from "react";
import Link from "next/link";
import {
  CheckSquare,
  Clock,
  FilePlus2,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

// Icon registry — keyed by string name. The server layout cannot pass icon
// components across the RSC boundary (lucide-react icons are forwardRef
// exotic components and trip "Functions cannot be passed directly to Client
// Components"). Pass the icon NAME instead and resolve here.
export type NavIcon =
  | "dashboard"
  | "projects"
  | "tasks"
  | "time"
  | "requests"
  | "work-requests";

const ICON_MAP: Record<NavIcon, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  projects: FolderKanban,
  tasks: CheckSquare,
  time: Clock,
  requests: FilePlus2,
  "work-requests": Inbox,
};

export type MobileNavLink = {
  href: string;
  label: string;
  icon: NavIcon;
};

export function MobileNavSheet({ links }: { links: MobileNavLink[] }) {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const sheet = document.getElementById("mobile-nav-sheet");
      if (sheet && !sheet.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100",
          "md:hidden",
          "dark:text-slate-300 dark:hover:bg-slate-800",
        )}
        aria-label="Open menu"
      >
        <Menu className="h-4 w-4" />
      </button>

      {open && (
        <div className="fixed inset-0 z-40 bg-slate-900/30 dark:bg-slate-950/60">
          <aside
            id="mobile-nav-sheet"
            className={cn(
              "fixed left-0 top-0 z-50 h-full w-64 bg-white p-4 shadow-lg",
              "dark:bg-slate-900 dark:shadow-none dark:border-r dark:border-slate-700",
            )}
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                Menu
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-50"
                aria-label="Close menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="flex flex-col gap-1">
              {links.map((link) => {
                const Icon = ICON_MAP[link.icon];
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="inline-flex items-center gap-2 rounded-md px-2 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <Icon className="h-4 w-4" />
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </aside>
        </div>
      )}
    </>
  );
}
