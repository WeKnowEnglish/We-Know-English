"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, GraduationCap, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { getNavGroupsForRole } from "@/lib/nav";
import type { AppRole } from "@/lib/auth";
import { LogoutButton } from "@/components/logout-button";

function linkActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href;
}

type SiteHeaderProps = {
  userEmail: string | null;
  appRole: AppRole | null;
};

export function SiteHeader({ userEmail, appRole }: SiteHeaderProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const navGroups = getNavGroupsForRole(appRole);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0 md:hidden"
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
          <Link
            href="/"
            className="flex min-w-0 items-center gap-2 font-semibold tracking-tight text-foreground hover:text-primary"
            onClick={() => setOpen(false)}
          >
            <GraduationCap className="size-6 shrink-0 text-primary" aria-hidden />
            <span className="truncate">WKE Tracker</span>
          </Link>
        </div>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {navGroups.map((group, gi) => (
            <div key={group.title} className="flex items-center gap-1">
              {gi > 0 ? <Separator orientation="vertical" className="mx-1 h-6" /> : null}
              <span className="sr-only">{group.title}</span>
              {group.links.map((item) => {
                const active = linkActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                      active && "bg-accent text-accent-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="flex min-w-0 shrink-0 items-center gap-2">
          {userEmail ? (
            <>
              <div className="hidden min-w-0 flex-col items-end sm:flex">
                <span className="truncate text-xs text-muted-foreground" title={userEmail}>
                  {userEmail}
                </span>
                {appRole ? (
                  <Badge variant="secondary" className="text-[10px] capitalize">
                    {appRole}
                  </Badge>
                ) : null}
              </div>
              <LogoutButton />
            </>
          ) : (
            <Link href="/login" className={cn(buttonVariants({ variant: "default", size: "sm" }))}>
              Log in
            </Link>
          )}
          <Link
            href="/"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "hidden sm:inline-flex")}
          >
            <ArrowLeft className="size-4" data-icon="inline-start" />
            Home
          </Link>
        </div>
      </div>

      {open ? (
        <div className="border-t border-border bg-background md:hidden">
          <nav
            className="mx-auto max-h-[min(70vh,calc(100dvh-3.5rem))] max-w-6xl space-y-4 overflow-y-auto px-4 py-4"
            aria-label="Mobile"
          >
            {navGroups.map((group) => (
              <div key={group.title}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</p>
                <ul className="space-y-1">
                  {group.links.map((item) => {
                    const active = linkActive(pathname, item.href);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className={cn(
                            "block rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-accent",
                            active && "bg-accent",
                          )}
                          onClick={() => setOpen(false)}
                        >
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            <Separator />
            <Link
              href="/"
              className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-accent"
              onClick={() => setOpen(false)}
            >
              <ArrowLeft className="size-4" />
              Back to home
            </Link>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
