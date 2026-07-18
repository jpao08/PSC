import { NextRequest, NextResponse } from "next/server";
import { buildContainer } from "@/composition/build-container";
import { getConfig } from "@/infra/env";
import { issueSession, setSessionCookie } from "@/infra/session";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const config = getConfig();
  if (!code) return NextResponse.redirect(`${config.appUrl}/login?error=missing_code`);

  try {
    const container = buildContainer();
    const redirectUri = `${config.appUrl}/api/auth/bitrix/callback`;
    const token = await container.bitrixGateway.exchangeCode(code, redirectUri);
    const bitrixUser = await container.bitrixGateway.getCurrentUser(token.accessToken, token.portalDomain);
    const user = await container.resolveBitrixLogin.execute(bitrixUser, token.portalDomain);
    await setSessionCookie(await issueSession(user.id));
    return NextResponse.redirect(`${config.appUrl}/dashboard`);
  } catch {
    return NextResponse.redirect(`${config.appUrl}/access-denied`);
  }
}
