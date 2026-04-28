"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Building2,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  Table,
  Camera,
  CreditCard,
  GitBranch,
  GraduationCap,
  HeartPulse,
  Home,
  Menu,
  Newspaper,
  UserPlus,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { getNavGroupsForRole, type NavIconName, type NavLink } from "@/lib/nav";
import type { AppRole } from "@/lib/auth";
import { LogoutButton } from "@/components/logout-button";
import { OrganizationSwitcher } from "@/components/organization-switcher";
import type { OrgSummary } from "@/lib/organization-server";
import { createClient } from "@/lib/supabase/client";

type AppShellProps = {
  userEmail: string | null;
  appRole: AppRole | null;
  children: React.ReactNode;
  footer: React.ReactNode;
  /** Organization name shown in the header (teachers); students see a generic label from layout. */
  headerTitle: string;
  organizations: OrgSummary[];
  activeOrganizationId: string | null;
};

const ICONS: Record<NavIconName, LucideIcon> = {
  home: Home,
  "user-plus": UserPlus,
  users: Users,
  "calendar-days": CalendarDays,
  "calendar-check": CalendarCheck,
  camera: Camera,
  newspaper: Newspaper,
  "heart-pulse": HeartPulse,
  "git-branch": GitBranch,
  wallet: Wallet,
  "credit-card": CreditCard,
  "building-2": Building2,
  table: Table,
  "clipboard-list": ClipboardList,
};

function linkActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href;
}

function SidebarLink({
  item,
  pathname,
  expanded,
  onClick,
}: {
  item: NavLink;
  pathname: string;
  expanded: boolean;
  onClick?: () => void;
}) {
  const Icon = ICONS[item.icon];
  const active = linkActive(pathname, item.href);

  return (
    <Link
      href={item.href}
      onClick={onClick}
      title={item.label}
      className={cn(
        "flex items-center rounded-md px-2 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
        expanded ? "gap-2.5 justify-start" : "justify-center",
        active && "bg-accent text-accent-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" />
      {expanded ? <span className="truncate">{item.label}</span> : <span className="sr-only">{item.label}</span>}
    </Link>
  );
}

export function AppShell({
  userEmail,
  appRole,
  children,
  footer,
  headerTitle,
  organizations,
  activeOrganizationId,
}: AppShellProps) {
  const pathname = usePathname();
  const navGroups = getNavGroupsForRole(appRole);
  const visibleNavGroups =
    appRole === "teacher"
      ? [
          { title: "Start", links: navGroups.find((group) => group.title === "Start")?.links ?? [] },
          { title: "Tutor", links: navGroups.find((group) => group.title === "Tutor")?.links ?? [] },
          { title: "Parent", links: navGroups.find((group) => group.title === "Parent")?.links ?? [] },
          { title: "Billing", links: navGroups.find((group) => group.title === "Billing")?.links ?? [] },
        ].filter((group) => group.links.length > 0)
      : navGroups;
  const [desktopExpanded, setDesktopExpanded] = useState(false);
  const [desktopHoverExpanded, setDesktopHoverExpanded] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const hoverOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sidebarExpanded = desktopExpanded || desktopHoverExpanded;
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHoverTimers = () => {
    if (hoverOpenTimerRef.current) clearTimeout(hoverOpenTimerRef.current);
    if (hoverCloseTimerRef.current) clearTimeout(hoverCloseTimerRef.current);
    hoverOpenTimerRef.current = null;
    hoverCloseTimerRef.current = null;
  };

  const onSidebarHoverStart = () => {
    if (desktopExpanded) return;
    clearHoverTimers();
    hoverOpenTimerRef.current = setTimeout(() => {
      setDesktopHoverExpanded(true);
    }, 220);
  };

  const onSidebarHoverEnd = () => {
    if (desktopExpanded) return;
    clearHoverTimers();
    hoverCloseTimerRef.current = setTimeout(() => {
      setDesktopHoverExpanded(false);
    }, 120);
  };
  const onToggleMenu = () => {
    if (window.matchMedia("(min-width: 768px)").matches) {
      setDesktopExpanded((v) => !v);
      return;
    }
    setMobileOpen((v) => !v);
  };

  useEffect(() => {
    if (!userEmail) return;
    const TEN_MINUTES = 10 * 60 * 1000;
    const events: Array<keyof WindowEventMap> = ["mousemove", "keydown", "click", "scroll", "touchstart"];

    const clearTimer = () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    };

    const logoutForInactivity = async () => {
      try {
        const supabase = createClient();
        if (supabase) {
          await supabase.auth.signOut();
        }
      } catch {
        /* ignore */
      }
      window.location.href = "/login?reason=idle";
    };

    const resetTimer = () => {
      clearTimer();
      idleTimerRef.current = setTimeout(() => {
        void logoutForInactivity();
      }, TEN_MINUTES);
    };

    resetTimer();
    for (const eventName of events) {
      window.addEventListener(eventName, resetTimer, { passive: true });
    }

    return () => {
      clearTimer();
      for (const eventName of events) {
        window.removeEventListener(eventName, resetTimer);
      }
    };
  }, [userEmail]);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              type="button"
              aria-label="Toggle menu"
              onClick={onToggleMenu}
            >
              <Menu className="size-5" />
            </Button>
            <Link
              href="/"
              className="flex min-w-0 items-center gap-2 font-semibold tracking-tight text-foreground hover:text-primary"
            >
              <GraduationCap className="size-6 shrink-0 text-primary" aria-hidden />
              <span className="truncate">{headerTitle}</span>
            </Link>
            <OrganizationSwitcher organizations={organizations} activeOrganizationId={activeOrganizationId} />
          </div>

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
          </div>
        </div>
      </header>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close menu overlay"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative z-10 flex h-full w-72 flex-col border-r border-border bg-background p-3 shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">Navigation</p>
              <Button variant="ghost" size="icon-sm" type="button" onClick={() => setMobileOpen(false)}>
                <X className="size-4" />
              </Button>
            </div>
            <nav className="space-y-4 overflow-y-auto" aria-label="Mobile sidebar">
              {visibleNavGroups.map((group) => (
                <div key={group.title} className="space-y-1">
                  {group.title !== "Start" ? (
                    <p className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</p>
                  ) : null}
                  {group.links.map((item) => (
                    <SidebarLink key={item.href} item={item} pathname={pathname} expanded onClick={() => setMobileOpen(false)} />
                  ))}
                </div>
              ))}
            </nav>
          </aside>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <aside
          className={cn(
            "relative hidden shrink-0 border-r border-border bg-muted/20 p-2 md:flex md:w-16 md:flex-col md:gap-4",
            /* Stay under the sticky header while the page scrolls */
            "md:sticky md:top-14 md:self-start",
            /* When expanded, stack above main so the flyout is not covered by the content column; hide aside border so only the flyout edge shows. */
            sidebarExpanded && "z-30 border-r-transparent",
          )}
          onMouseEnter={onSidebarHoverStart}
          onMouseLeave={onSidebarHoverEnd}
        >
          <nav
            className={cn(
              "space-y-3 overflow-y-auto transition-opacity",
              /* Keep layout height when expanded: absolute flyout does not affect aside height, and `hidden` would collapse the rail and break hover (flicker). */
              sidebarExpanded && "pointer-events-none opacity-0",
            )}
            aria-label="Sidebar compact"
            aria-hidden={sidebarExpanded}
            inert={sidebarExpanded ? true : undefined}
          >
            {visibleNavGroups.map((group) => (
              <div key={group.title} className="space-y-1">
                {group.links.map((item) => (
                  <SidebarLink key={item.href} item={item} pathname={pathname} expanded={false} />
                ))}
              </div>
            ))}
          </nav>

          {sidebarExpanded ? (
            <div
              className="fixed left-0 top-14 z-[35] flex h-[calc(100dvh-3.5rem)] w-64 flex-col border-r border-border bg-background p-2 shadow-lg"
              onMouseEnter={onSidebarHoverStart}
              onMouseLeave={onSidebarHoverEnd}
            >
              <nav className="flex flex-col space-y-3" aria-label="Sidebar expanded">
                {visibleNavGroups.map((group) => (
                  <div key={group.title} className="space-y-1">
                    {group.title !== "Start" ? (
                      <p className="px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</p>
                    ) : null}
                    {group.links.map((item) => (
                      <SidebarLink key={item.href} item={item} pathname={pathname} expanded />
                    ))}
                  </div>
                ))}
              </nav>
            </div>
          ) : null}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1">
            {children}
          </div>
          {footer}
        </div>
      </div>
    </div>
  );
}
