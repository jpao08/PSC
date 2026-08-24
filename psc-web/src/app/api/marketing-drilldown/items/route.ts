import { NextRequest, NextResponse } from "next/server";
import { buildContainer } from "@/composition/build-container";
import { ValidationError } from "@/core/domain/models";
import { ensureCanUseMarketingDrilldown, ensureMonth } from "@/core/domain/rules";
import { getCurrentUser } from "@/infra/current-user";
import { jsonError } from "@/infra/http";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    ensureCanUseMarketingDrilldown(user);
    const year = Number(request.nextUrl.searchParams.get("year"));
    const month = Number(request.nextUrl.searchParams.get("month"));
    const metricKey = String(request.nextUrl.searchParams.get("metricKey") ?? "").trim();
    const channel = request.nextUrl.searchParams.get("channel");
    const query = request.nextUrl.searchParams.get("q");
    const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") ?? "1"));
    const pageSize = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get("pageSize") ?? "25")));
    const sort = request.nextUrl.searchParams.get("sort") ?? "date_desc";
    ensureMonth(month);
    if (!Number.isFinite(year) || year < 2000 || year > 2100) throw new ValidationError("Ano invalido.");
    if (!metricKey) throw new ValidationError("Metrica obrigatoria.");

    const items = await buildContainer().marketingDrilldownRepository.getItems({
      year,
      month,
      metricKey,
      channel: channel === "__total__" ? null : channel,
      query,
      page,
      pageSize,
      sort
    });
    return NextResponse.json(items);
  } catch (error) {
    return jsonError(error);
  }
}
