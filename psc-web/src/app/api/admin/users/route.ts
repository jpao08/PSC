import { NextResponse } from "next/server";
import { buildContainer } from "@/composition/build-container";
import { getCurrentUser } from "@/infra/current-user";
import { jsonError } from "@/infra/http";
import { ensureExecutiveAdmin } from "@/core/domain/rules";

export async function GET() {
  try {
    const admin = await getCurrentUser();
    ensureExecutiveAdmin(admin);
    const users = await buildContainer().userRepository.listUsers();
    return NextResponse.json(users);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await getCurrentUser();
    const payload = await request.json();
    const user = await buildContainer().provisionBitrixUser.execute(admin, payload);
    return NextResponse.json(user);
  } catch (error) {
    return jsonError(error);
  }
}
