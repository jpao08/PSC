import { NextResponse } from "next/server";
import { buildContainer } from "@/composition/build-container";
import { getCurrentUser } from "@/infra/current-user";
import { jsonError } from "@/infra/http";
import { ensureCanEditWeeklyValue, ensureMonth } from "@/core/domain/rules";
import { NotFoundError, ValidationError } from "@/core/domain/models";

export async function POST(request: Request, context: { params: Promise<{ indicatorId: string }> }) {
  try {
    const user = await getCurrentUser();
    const params = await context.params;
    const payload = await request.json();
    const year = Number(payload.year);
    const month = Number(payload.month);
    const notApplicable = Boolean(payload.notApplicable ?? payload.not_applicable);

    ensureMonth(month);
    if (!Number.isFinite(year) || year < 2000 || year > 2100) throw new ValidationError("Ano invalido.");

    const container = buildContainer();
    const indicator = await container.indicatorRepository.getById(params.indicatorId);
    if (!indicator) throw new NotFoundError("Indicador nao encontrado.");
    ensureCanEditWeeklyValue(user, indicator);

    await container.indicatorRepository.setMonthNotApplicable(indicator.id, year, month, notApplicable, user.id);
    return NextResponse.json({
      indicatorId: indicator.id,
      year,
      month,
      notApplicable
    });
  } catch (error) {
    return jsonError(error);
  }
}
