import { NextRequest, NextResponse } from "next/server";
import { buildContainer } from "@/composition/build-container";
import { ValidationError } from "@/core/domain/models";
import { ensureCanUseCommercialDrilldown } from "@/core/domain/rules";
import { getCurrentUser } from "@/infra/current-user";
import { jsonError } from "@/infra/http";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    ensureCanUseCommercialDrilldown(user);
    const year = Number(request.nextUrl.searchParams.get("year") ?? new Date().getFullYear());
    const month = Number(request.nextUrl.searchParams.get("month"));
    const metricKey = String(request.nextUrl.searchParams.get("metricKey") ?? "").trim();
    if (!Number.isInteger(month) || month < 1 || month > 12) throw new ValidationError("Mes invalido.");
    if (!metricKey) throw new ValidationError("Indicador comercial obrigatorio.");
    const items = await buildContainer().commercialDrilldownRepository.getItems({
      year,
      month,
      metricKey,
      responsibleId: request.nextUrl.searchParams.get("responsibleId") || null,
      query: request.nextUrl.searchParams.get("q") || null,
      page: Number(request.nextUrl.searchParams.get("page") ?? 1),
      pageSize: Number(request.nextUrl.searchParams.get("pageSize") ?? 25),
      sort: request.nextUrl.searchParams.get("sort") || "date_desc"
    });
    return NextResponse.json(items);
  } catch (error) {
    return jsonError(error);
  }
}
