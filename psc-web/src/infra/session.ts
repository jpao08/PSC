import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { getConfig } from "./env";

const cookieName = "psc_session";

type SessionPayload = {
  userId: string;
};

function secretKey(): Uint8Array {
  return new TextEncoder().encode(getConfig().sessionSecret);
}

export async function issueSession(userId: string): Promise<string> {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(secretKey());
}

export async function readSessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const result = await jwtVerify(token, secretKey());
    const userId = result.payload.userId;
    if (typeof userId !== "string" || !userId) return null;
    return { userId };
  } catch {
    return null;
  }
}

export async function getSessionUserId(): Promise<string | null> {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  const payload = await readSessionToken(token);
  return payload?.userId ?? null;
}

export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(cookieName);
}
