import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { isTeacherRoute } from "@/lib/auth";
import { getEnv, isSupabaseConfigured } from "@/lib/env";

function isPublicPath(pathname: string) {
  if (pathname.startsWith("/api")) return true;
  return pathname === "/login" || pathname === "/signup" || pathname.startsWith("/auth");
}

function mergeCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((c) => {
    to.cookies.set(c.name, c.value);
  });
  for (const key of ["cache-control", "expires", "pragma"] as const) {
    const value = from.headers.get(key);
    if (value) to.headers.set(key, value);
  }
}

export async function middleware(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  const env = getEnv();

  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  const {
    data: { user: authUser },
    error: authError,
  } = await supabase.auth.getUser();

  if (
    authError &&
    (authError.message.includes("Already Used") || authError.message.includes("Invalid Refresh Token"))
  ) {
    try {
      await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
  }

  const user = authError ? null : authUser;

  const pathname = request.nextUrl.pathname;

  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    const redirect = NextResponse.redirect(url);
    mergeCookies(response, redirect);
    return redirect;
  }

  if (user && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    const redirect = NextResponse.redirect(url);
    mergeCookies(response, redirect);
    return redirect;
  }

  if (user && !isPublicPath(pathname)) {
    await supabase.rpc("ensure_my_profile");

    const { data: profile } = await supabase.from("profiles").select("app_role").eq("id", user.id).maybeSingle();

    const meta = user.user_metadata?.app_role;
    const appRole =
      profile?.app_role === "teacher" || profile?.app_role === "student"
        ? profile.app_role
        : meta === "teacher" || meta === "student"
          ? meta
          : "teacher";

    if (appRole === "student" && isTeacherRoute(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      const redirect = NextResponse.redirect(url);
      mergeCookies(response, redirect);
      return redirect;
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
