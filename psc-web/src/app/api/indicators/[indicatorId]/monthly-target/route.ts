import { NextResponse } from "next/server";
import { buildContainer } from "@/composition/build-container";
import { getCurrentUser } from "@/infra/current-user";
import { jsonError } from "@/infra/http";
import { ensureCanViewIndicator, ensureMonth, ensureRole } from "@/core/domain/rules";
import { NotFoundError, ValidationError } from "@/core/domain/models";

export async function POST(request: Request, context: { params: Promise<{ indicatorId: string }> }) {
  try {
    const user = await getCurrentUser();
    ensureRole(user, "executivo");
    const params = await context.params;
    const payload = await request.json();
    const year = Number(payload.year);
    const month = Number(payload.month);
    const rawTargetValue = payload.targetValue ?? payload.target_value;

    ensureMonth(month);
    if (!Number.isFinite(year) || year < 2000 || year > 2100) throw new ValidationError("Ano invalido.");

    const container = buildContainer();
    const indicator = await container.indicatorRepository.getById(params.indicatorId);
    if (!indicator) throw new NotFoundError("Indicador nao encontrado.");
    ensureCanViewIndicator(user, indicator);

    if (rawTargetValue == null || String(rawTargetValue).trim() === "") {
      await container.indicatorRepository.deleteMonthTarget(indicator.id, year, month);
      return NextResponse.json({
        indicatorId: indicator.id,
        year,
        month,
        targetValue: null,
        status: "deleted"
      });
    }

    const targetValue = Number(rawTargetValue);
    if (!Number.isFinite(targetValue)) throw new ValidationError("Campo targetValue deve ser numerico.");

    await container.indicatorRepository.upsertMonthTarget(indicator.id, year, month, targetValue, user.id);
    return NextResponse.json({
      indicatorId: indicator.id,
      year,
      month,
      targetValue
    });
  } catch (error) {
    return jsonError(error);
  }
}
