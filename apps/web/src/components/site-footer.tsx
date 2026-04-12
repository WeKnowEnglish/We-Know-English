import Link from "next/link";
import { flattenNavLinksForRole } from "@/lib/nav";
import type { AppRole } from "@/lib/auth";

type SiteFooterProps = {
  appRole: AppRole | null;
};

export function SiteFooter({ appRole }: SiteFooterProps) {
  const links = flattenNavLinksForRole(appRole);

  return (
    <footer className="mt-auto border-t border-border bg-muted/30">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Quick return</p>
            <Link href="/" className="mt-2 inline-flex text-sm text-primary underline-offset-4 hover:underline">
              ← Back to home
            </Link>
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">All pages</p>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
              {links.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-8 text-center text-xs text-muted-foreground">
          WKE Student Tracker — sign in to access your role (teacher or student). Use the left menu to move between
          sections.
        </p>
      </div>
    </footer>
  );
}
