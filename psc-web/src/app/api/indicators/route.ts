import { NextRequest, NextResponse } from "next/server";
import { buildContainer } from "@/composition/build-container";
import { getCurrentUser } from "@/infra/current-user";
import { jsonError } from "@/infra/http";
import { ensureRequiredText, ensureRole, ensureValidAggregation } from "@/core/domain/rules";
import { ValidationError } from "@/core/domain/models";

export async function GET(request: NextRequest) {
  try {
    const year = Number(request.nextUrl.searchParams.get("year") ?? new Date().getFullYear());
    const user = await getCurrentUser();
    const rows = await buildContainer().listIndicators.execute(user, year);
    return NextResponse.json(rows);
  } catch (error) {
    return jsonError(error);
  }
}

function parseMaturityLevel(value: unknown): number | null {
  if (value == null || String(value).trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new ValidationError("Maturidade deve estar entre 0 e 100.");
  }
  return parsed;
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    ensureRole(user, "executivo");
    const payload = await request.json();
    const aggregationType = String(payload.aggregationType ?? payload.aggregation_type ?? "");
    ensureValidAggregation(aggregationType);
    const indicator = await buildContainer().indicatorRepository.createIndicator({
      areaId: ensureRequiredText(String(payload.areaId ?? payload.area_id ?? ""), "area"),
      name: ensureRequiredText(String(payload.name ?? ""), "nome do indicador"),
      description: String(payload.description ?? "").trim() || null,
      aggregationType,
      unitId: ensureRequiredText(String(payload.unitId ?? payload.unit_id ?? ""), "unidade"),
      maturityLevel: parseMaturityLevel(payload.maturityLevel ?? payload.maturity_level),
      createdBy: user.id
    });
    return NextResponse.json(indicator);
  } catch (error) {
    return jsonError(error);
  }
}
