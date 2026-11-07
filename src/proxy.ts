import { NextResponse, type NextRequest } from "next/server";

// Optimistic gate only: real checks happen in the Data Access Layer
// (src/lib/auth/dal.ts) on every page and action. This just avoids rendering
// app pages for visitors with no session cookie at all, and keeps the cookie's
// expiry rolling for active people.

const SESSION_COOKIE = "tamam_session";
const THIRTY_DAYS = 30 * 24 * 60 * 60;

export function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const { pathname, search } = request.nextUrl;

  if (!token && pathname.startsWith("/w/")) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  const res = NextResponse.next();
  if (token && pathname.startsWith("/w/")) {
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1",
      sameSite: "lax",
      path: "/",
      maxAge: THIRTY_DAYS,
    });
  }
  return res;
}

export const config = {
  matcher: ["/w/:path*"],
};
