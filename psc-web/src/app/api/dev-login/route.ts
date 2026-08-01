import { NextRequest, NextResponse } from "next/server";
import { issueSession, setSessionCookie } from "@/infra/session";

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ detail: "Dev login unavailable in production." }, { status: 404 });
  }

  const userId = process.env.DEV_LOGIN_USER_ID?.trim();
  if (!userId) {
    return NextResponse.json({ detail: "DEV_LOGIN_USER_ID is not configured." }, { status: 500 });
  }

  await setSessionCookie(await issueSession(userId));
  return NextResponse.redirect(new URL("/dashboard", request.url));
}
