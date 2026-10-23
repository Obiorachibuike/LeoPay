import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "leopay_session";

/**
 * Edge middleware: adds security headers and performs a cheap authentication
 * gate. Real authorization always happens again on the server (layout, page and
 * action), so a missing cookie is only an early redirect.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (!hasSession && (pathname.startsWith("/dashboard") || pathname.startsWith("/admin"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next();
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  response.headers.set("X-DNS-Prefetch-Control", "off");

  const isProduction = process.env.NODE_ENV === "production";
  // The hosted checkout pages are embedded by merchants, and the platform
  // preview runs in an iframe during development, so framing is denied only in
  // production for the app shell.
  if (isProduction && !pathname.startsWith("/pay") && !pathname.startsWith("/i/") && !pathname.startsWith("/store")) {
    response.headers.set("X-Frame-Options", "DENY");
  }

  const csp = [
    "default-src 'self'",
    // Next.js injects inline bootstrap scripts; the theme script is inline too.
    "script-src 'self' 'unsafe-inline'" + (isProduction ? "" : " 'unsafe-eval'"),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self'" + (isProduction ? "" : " ws: wss:"),
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join("; ");
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
