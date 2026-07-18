import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/infra/session";

export async function POST() {
  await clearSessionCookie();
  return NextResponse.json({ status: "ok" });
}
