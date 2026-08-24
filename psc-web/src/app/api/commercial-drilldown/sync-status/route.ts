import { NextResponse } from "next/server";
import { buildContainer } from "@/composition/build-container";
import { ensureCanUseCommercialDrilldown } from "@/core/domain/rules";
import { getCurrentUser } from "@/infra/current-user";
import { jsonError } from "@/infra/http";

export async function GET() {
  try {
    const user = await getCurrentUser();
    ensureCanUseCommercialDrilldown(user);
    const status = await buildContainer().commercialDrilldownRepository.getSyncStatus();
    return NextResponse.json(status);
  } catch (error) {
    return jsonError(error);
  }
}
