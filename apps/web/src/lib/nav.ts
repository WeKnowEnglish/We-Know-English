import type { AppRole } from "@/lib/auth";

export type NavLink = {
  href: string;
  label: string;
  icon: NavIconName;
  /** Shown on the home hub cards */
  description?: string;
};

export type NavGroup = { title: string; links: NavLink[] };
export type NavIconName =
  | "home"
  | "user-plus"
  | "users"
  | "calendar-days"
  | "calendar-check"
  | "camera"
  | "newspaper"
  | "heart-pulse"
  | "git-branch"
  | "wallet"
  | "credit-card"
  | "building-2"
  | "table"
  | "clipboard-list";

/** Single source of truth for site navigation */
export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Start",
    links: [
      { href: "/", label: "Home", icon: "home", description: "This hub — pick any workflow below." },
      {
        href: "/onboarding",
        label: "Classes",
        icon: "user-plus",
        description: "Create classes and set up student rosters.",
      },
    ],
  },
  {
    title: "Tutor",
    links: [
      {
        href: "/schedule",
        label: "Schedule",
        icon: "calendar-days",
        description: "Month calendar of class sessions across all classes.",
      },
      {
        href: "/attendance",
        label: "Attendance",
        icon: "calendar-check",
        description: "Mark all present, then toggle individuals (kiosk + list).",
      },
      {
        href: "/attendance/report",
        label: "Attendance report",
        icon: "table",
        description: "Date-range roster log and Excel export.",
      },
      {
        href: "/attendance/missed",
        label: "Missed attendance",
        icon: "clipboard-list",
        description: "Catch up on past sessions not finalized yet.",
      },
      {
        href: "/moments",
        label: "Moments",
        icon: "camera",
        description: "Mobile-first photos with session tagging.",
      },
      {
        href: "/feed",
        label: "Class Feed",
        icon: "newspaper",
        description: "Post class updates, tag students, and publish to parent pulse.",
      },
      {
        href: "/students",
        label: "Students",
        icon: "users",
        description: "View and manage student records, class assignments, and level movement.",
      },
    ],
  },
  {
    title: "Parent",
    links: [
      {
        href: "/parent/pulse",
        label: "Daily Pulse",
        icon: "heart-pulse",
        description: "Chronological feed from the feed table, by student.",
      },
      {
        href: "/student/skill-tree",
        label: "Skill Tree",
        icon: "git-branch",
        description: "Visualize skills_points as milestones.",
      },
    ],
  },
  {
    title: "Billing",
    links: [
      {
        href: "/billing",
        label: "Ledger",
        icon: "wallet",
        description: "Family credits and invoice-style summary.",
      },
      {
        href: "/billing/monthly",
        label: "Monthly Stripe",
        icon: "credit-card",
        description: "Server action + cron hook for the billing period.",
      },
      {
        href: "/organizations",
        label: "Organizations",
        icon: "building-2",
        description: "Create a center, request to join an existing one (owner approves), or open your org page.",
      },
    ],
  },
];

export function flattenNavLinks(): NavLink[] {
  return NAV_GROUPS.flatMap((g) => g.links);
}

/** Students only see Home + Parent (Daily Pulse, Skill Tree). Teachers see the full map. */
export function getNavGroupsForRole(role: AppRole | null): NavGroup[] {
  if (role === "student") {
    return [
      {
        title: "Start",
        links: [NAV_GROUPS[0].links[0]],
      },
      NAV_GROUPS[2],
    ];
  }
  return NAV_GROUPS;
}

export function flattenNavLinksForRole(role: AppRole | null): NavLink[] {
  return getNavGroupsForRole(role).flatMap((g) => g.links);
}
