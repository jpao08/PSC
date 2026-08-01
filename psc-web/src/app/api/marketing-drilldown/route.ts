import { NextRequest, NextResponse } from "next/server";
import { buildContainer } from "@/composition/build-container";
import { ensureCanUseMarketingDrilldown } from "@/core/domain/rules";
import { getCurrentUser } from "@/infra/current-user";
import { jsonError } from "@/infra/http";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    ensureCanUseMarketingDrilldown(user);
    const year = Number(request.nextUrl.searchParams.get("year") ?? new Date().getFullYear());
    const dashboard = await buildContainer().marketingDrilldownRepository.getDashboard(year);
    return NextResponse.json(dashboard);
  } catch (error) {
    return jsonError(error);
  }
}
