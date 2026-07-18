import { NextResponse } from "next/server";
import { buildContainer } from "@/composition/build-container";
import { getCurrentUser } from "@/infra/current-user";
import { ensureRequiredText, ensureRole, ensureValidAggregation } from "@/core/domain/rules";
import { ValidationError } from "@/core/domain/models";
import { jsonError } from "@/infra/http";

type RouteContext = {
  params: Promise<{ indicatorId: string }>;
};

function parseMaturityLevel(value: unknown): number | null {
  if (value == null || String(value).trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new ValidationError("Maturidade deve estar entre 0 e 100.");
  }
  return parsed;
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    ensureRole(user, "executivo");
    const { indicatorId } = await context.params;
    const payload = await request.json();
    const aggregationType = String(payload.aggregationType ?? payload.aggregation_type ?? "");
    ensureValidAggregation(aggregationType);
    const indicator = await buildContainer().indicatorRepository.updateIndicator(
      ensureRequiredText(indicatorId, "indicator_id"),
      {
        areaId: ensureRequiredText(String(payload.areaId ?? payload.area_id ?? ""), "area"),
        name: ensureRequiredText(String(payload.name ?? ""), "nome do indicador"),
        description: String(payload.description ?? "").trim() || null,
        aggregationType,
        unitId: ensureRequiredText(String(payload.unitId ?? payload.unit_id ?? ""), "unidade"),
        maturityLevel: parseMaturityLevel(payload.maturityLevel ?? payload.maturity_level)
      }
    );
    return NextResponse.json(indicator);
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    ensureRole(user, "executivo");
    const { indicatorId } = await context.params;
    await buildContainer().indicatorRepository.deleteIndicatorWithHistory(ensureRequiredText(indicatorId, "indicator_id"));
    return NextResponse.json({ status: "deleted" });
  } catch (error) {
    return jsonError(error);
  }
}
