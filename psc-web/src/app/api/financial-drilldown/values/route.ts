import { NextResponse } from "next/server";
import { buildContainer } from "@/composition/build-container";
import { ValidationError } from "@/core/domain/models";
import { ensureCanEditFinancialDrilldown } from "@/core/domain/rules";
import { getCurrentUser } from "@/infra/current-user";
import { jsonError } from "@/infra/http";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    ensureCanEditFinancialDrilldown(user);
    const payload = await request.json();
    const year = Number(payload.year);
    const month = Number(payload.month);
    const rawValue = payload.value;
    const value = rawValue == null || rawValue === "" ? null : Number(rawValue);
    if (!payload.financialIndicatorId) throw new ValidationError("Indicador financeiro obrigatorio.");
    if (!payload.unitId) throw new ValidationError("Unidade obrigatoria.");
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new ValidationError("Ano invalido.");
    if (!Number.isInteger(month) || month < 1 || month > 12) throw new ValidationError("Mes invalido.");
    if (value !== null && !Number.isFinite(value)) throw new ValidationError("Valor financeiro invalido.");
    await buildContainer().financialDrilldownRepository.upsertValue({
      financialIndicatorId: String(payload.financialIndicatorId),
      unitId: String(payload.unitId),
      year,
      month,
      value,
      userId: user.id
    });
    return NextResponse.json({ status: "saved" });
  } catch (error) {
    return jsonError(error);
  }
}
