import { NextRequest, NextResponse } from "next/server";
import { buildContainer } from "@/composition/build-container";
import { getCurrentUser } from "@/infra/current-user";
import { ensureExecutiveAdmin } from "@/core/domain/rules";
import { jsonError } from "@/infra/http";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    ensureExecutiveAdmin(user);
    const query = request.nextUrl.searchParams.get("query") ?? "";
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? 10);
    const users = await buildContainer().bitrixGateway.searchUsers(query, limit);
    return NextResponse.json(users);
  } catch (error) {
    return jsonError(error);
  }
}
