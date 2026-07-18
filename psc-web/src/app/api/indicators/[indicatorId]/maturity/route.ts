import { NextResponse } from "next/server";
import { buildContainer } from "@/composition/build-container";
import { getCurrentUser } from "@/infra/current-user";
import { ensureCanEditIndicatorMaturity, ensureRequiredText } from "@/core/domain/rules";
import { NotFoundError, ValidationError } from "@/core/domain/models";
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

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    const { indicatorId } = await context.params;
    const cleanIndicatorId = ensureRequiredText(indicatorId, "indicator_id");
    const payload = await request.json();
    const container = buildContainer();
    const indicator = await container.indicatorRepository.getById(cleanIndicatorId);
    if (!indicator) throw new NotFoundError("Indicador nao encontrado.");
    ensureCanEditIndicatorMaturity(user, indicator);
    const updated = await container.indicatorRepository.updateIndicatorMaturity(
      cleanIndicatorId,
      parseMaturityLevel(payload.maturityLevel ?? payload.maturity_level)
    );
    return NextResponse.json(updated);
  } catch (error) {
    return jsonError(error);
  }
}
