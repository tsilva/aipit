import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { GEO_COUNTRY_COOKIE, readCountryCodeFromHeaders } from "@/lib/region";

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const countryCode = readCountryCodeFromHeaders(request.headers);

  if (countryCode) {
    response.cookies.set({
      name: GEO_COUNTRY_COOKIE,
      value: countryCode,
      path: "/",
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
    });
  } else {
    response.cookies.delete(GEO_COUNTRY_COOKIE);
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
