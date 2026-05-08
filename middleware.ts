import { NextResponse, type NextRequest } from "next/server";

const ROLE_DASHBOARDS = {
  customer: "/customer/dashboard",
  employee: "/employee/dashboard",
  admin: "/admin/dashboard",
} as const;

const ROUTE_GROUP_TO_ROLE: Record<string, "customer" | "employee" | "admin"> = {
  "/customer": "customer",
  "/employee": "employee",
  "/admin": "admin",
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public routes — pass through unconditionally
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/magic-link") ||
    pathname.startsWith("/forgot") ||
    pathname.startsWith("/reset") ||
    pathname.startsWith("/verify") ||
    pathname.startsWith("/api/auth") ||
    pathname === "/" ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/api/cron")
  ) {
    return NextResponse.next();
  }

  // Determine which role-scoped area is being entered
  const matchedPrefix = Object.entries(ROUTE_GROUP_TO_ROLE).find(([prefix]) =>
    pathname.startsWith(prefix),
  );
  if (!matchedPrefix) return NextResponse.next();
  const requiredRole = matchedPrefix[1] as "customer" | "employee" | "admin";

  // Better Auth session check via the get-session endpoint
  const sessionRes = await fetch(`${req.nextUrl.origin}/api/auth/get-session`, {
    headers: { cookie: req.headers.get("cookie") ?? "" },
  });
  if (!sessionRes.ok) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  const session = (await sessionRes.json()) as { user?: { systemRole?: string } } | null;
  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  const actorRole = session.user.systemRole as keyof typeof ROLE_DASHBOARDS | undefined;
  if (!actorRole || !(actorRole in ROLE_DASHBOARDS)) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (actorRole !== requiredRole) {
    return NextResponse.redirect(new URL(ROLE_DASHBOARDS[actorRole], req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
