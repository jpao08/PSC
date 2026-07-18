import { NextResponse } from "next/server";
import { getCurrentUser } from "@/infra/current-user";
import { jsonError } from "@/infra/http";

export async function GET() {
  try {
    const user = await getCurrentUser();
    return NextResponse.json(user);
  } catch (error) {
    return jsonError(error);
  }
}
