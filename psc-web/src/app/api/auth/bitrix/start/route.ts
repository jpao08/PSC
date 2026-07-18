import { NextResponse } from "next/server";
import { getConfig } from "@/infra/env";

export async function GET() {
  const config = getConfig();
  if (!config.bitrixPortalUrl) {
    return NextResponse.json({ detail: "Configure BITRIX_PORTAL_URL." }, { status: 500 });
  }
  const url = new URL(`${config.bitrixPortalUrl.replace(/\/$/, "")}/oauth/authorize/`);
  url.searchParams.set("client_id", config.bitrixClientId);
  url.searchParams.set("response_type", "code");
  return NextResponse.redirect(url);
}
