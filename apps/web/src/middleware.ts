import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "cervello_visivo_auth";

export function middleware(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  const { pathname } = request.nextUrl;

  const isProtected =
    pathname.startsWith("/dashboard") || pathname.startsWith("/admin");
  const isLoginPage = pathname.startsWith("/login");

  // Route protetta senza token → redirect a /login
  if (isProtected && !token) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Già loggato e va su /login → redirect a /dashboard
  if (isLoginPage && token) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/login"],
};
