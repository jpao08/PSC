import { NextResponse } from "next/server";
import { buildContainer } from "@/composition/build-container";
import { getCurrentUser } from "@/infra/current-user";
import { jsonError } from "@/infra/http";
import { ensureCanViewIndicator, ensureRole, validateConfidenceLevel } from "@/core/domain/rules";
import { NotFoundError, ValidationError } from "@/core/domain/models";

function optionalNumber(value: unknown, fieldName: string): number | null {
  if (value == null || String(value).trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new ValidationError(`Campo ${fieldName} deve ser numerico.`);
  return parsed;
}

export async function POST(request: Request, context: { params: Promise<{ indicatorId: string }> }) {
  try {
    const user = await getCurrentUser();
    ensureRole(user, "executivo");
    const params = await context.params;
    const payload = await request.json();
    const year = Number(payload.year);
    if (!Number.isFinite(year) || year < 2000 || year > 2100) throw new ValidationError("Ano invalido.");

    const container = buildContainer();
    const indicator = await container.indicatorRepository.getById(params.indicatorId);
    if (!indicator) throw new NotFoundError("Indicador nao encontrado.");
    ensureCanViewIndicator(user, indicator);

    const annualTarget = optionalNumber(payload.annualTarget ?? payload.annual_target, "annualTarget");
    const confidenceLevel = validateConfidenceLevel(optionalNumber(payload.confidenceLevel ?? payload.confidence_level, "confidenceLevel"));
    await container.indicatorRepository.upsertYearPlanning(indicator.id, year, annualTarget, confidenceLevel, user.id);
    return NextResponse.json({
      indicatorId: indicator.id,
      year,
      annualTarget,
      confidenceLevel
    });
  } catch (error) {
    return jsonError(error);
  }
}
