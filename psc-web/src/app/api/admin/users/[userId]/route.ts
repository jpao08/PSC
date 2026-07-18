import { NextResponse } from "next/server";
import { buildContainer } from "@/composition/build-container";
import { getCurrentUser } from "@/infra/current-user";
import { ensureExecutiveAdmin } from "@/core/domain/rules";
import { jsonError } from "@/infra/http";

export async function DELETE(_request: Request, context: { params: Promise<{ userId: string }> }) {
  try {
    const admin = await getCurrentUser();
    ensureExecutiveAdmin(admin);
    const params = await context.params;
    await buildContainer().userRepository.deactivateUser(params.userId);
    return NextResponse.json({ status: "deactivated" });
  } catch (error) {
    return jsonError(error);
  }
}
