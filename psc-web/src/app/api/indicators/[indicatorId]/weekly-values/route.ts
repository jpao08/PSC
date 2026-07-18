import { NextRequest, NextResponse } from "next/server";
import { buildContainer } from "@/composition/build-container";
import { getCurrentUser } from "@/infra/current-user";
import { jsonError } from "@/infra/http";
import { ensureCanEditWeeklyValue, ensureCanViewIndicator, ensureMonth, ensureWeek, getMonthRanges } from "@/core/domain/rules";
import { NotFoundError, ValidationError } from "@/core/domain/models";

export async function GET(request: NextRequest, context: { params: Promise<{ indicatorId: string }> }) {
  try {
    const user = await getCurrentUser();
    const params = await context.params;
    const year = Number(request.nextUrl.searchParams.get("year"));
    const month = Number(request.nextUrl.searchParams.get("month"));
    ensureMonth(month);
    const container = buildContainer();
    const indicator = await container.indicatorRepository.getById(params.indicatorId);
    if (!indicator) throw new NotFoundError("Indicador nao encontrado.");
    ensureCanViewIndicator(user, indicator);
    const values = await container.indicatorRepository.listWeeklyValues([indicator.id], year, month);
    return NextResponse.json({
      indicatorId: indicator.id,
      year,
      month,
      weeks: getMonthRanges(year, month).map(([weekNumber, startDay, endDay]) => ({
        weekNumber,
        label: `Faixa ${weekNumber} (${startDay}-${endDay})`,
        startDay,
        endDay,
        value: values.find((item) => item.weekNumber === weekNumber)?.value ?? null
      }))
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ indicatorId: string }> }) {
  try {
    const user = await getCurrentUser();
    const params = await context.params;
    const payload = await request.json();
    const year = Number(payload.year);
    const month = Number(payload.month);
    const weekNumber = Number(payload.weekNumber ?? payload.week_number);
    const value = Number(payload.value);
    ensureMonth(month);
    ensureWeek(weekNumber);
    if (!Number.isFinite(year) || year < 2000 || year > 2100) throw new ValidationError("Ano invalido.");
    if (!Number.isFinite(value)) throw new ValidationError("Campo value deve ser numerico.");

    const container = buildContainer();
    const indicator = await container.indicatorRepository.getById(params.indicatorId);
    if (!indicator) throw new NotFoundError("Indicador nao encontrado.");
    ensureCanEditWeeklyValue(user, indicator);
    await container.indicatorRepository.upsertWeeklyValue({
      indicatorId: indicator.id,
      year,
      month,
      weekNumber,
      value,
      sourceUserId: user.id
    });
    return NextResponse.json({ indicatorId: indicator.id, year, month, weekNumber, value });
  } catch (error) {
    return jsonError(error);
  }
}
