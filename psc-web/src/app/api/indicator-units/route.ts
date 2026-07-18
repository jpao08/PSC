import { NextResponse } from "next/server";
import { buildContainer } from "@/composition/build-container";
import { getCurrentUser } from "@/infra/current-user";
import { ensureRole } from "@/core/domain/rules";
import { jsonError } from "@/infra/http";

export async function GET() {
  try {
    const user = await getCurrentUser();
    ensureRole(user, "executivo");
    const units = await buildContainer().indicatorRepository.listUnits();
    return NextResponse.json(units);
  } catch (error) {
    return jsonError(error);
  }
}
