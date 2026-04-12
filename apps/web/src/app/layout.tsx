import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import { SiteFooter } from "@/components/site-footer";
import { SupabaseSetupBanner } from "@/components/supabase-setup-banner";
import { getOrganizationShellContext } from "@/lib/organization-server";
import { getSession } from "@/lib/session";
import { fetchMissedAttendanceOccurrences } from "@/lib/tracker-queries";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WKE Student Tracker",
  description: "Tutor-first student tracking, updates, and family billing.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { user, appRole } = await getSession();
  const orgCtx = await getOrganizationShellContext({ userId: user?.id ?? null, appRole });
  const missedAttendance =
    user && appRole === "teacher" && orgCtx.activeOrganizationId
      ? await fetchMissedAttendanceOccurrences(orgCtx.activeOrganizationId)
      : [];

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <SupabaseSetupBanner />
        <AppShell
          userEmail={user?.email ?? null}
          appRole={appRole}
          footer={<SiteFooter appRole={appRole} />}
          headerTitle={orgCtx.headerTitle}
          organizations={orgCtx.organizations}
          activeOrganizationId={orgCtx.activeOrganizationId}
          missedAttendance={missedAttendance}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
