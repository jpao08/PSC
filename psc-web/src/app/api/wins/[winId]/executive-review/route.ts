import { NextResponse } from "next/server";
import { buildContainer } from "@/composition/build-container";
import { getCurrentUser } from "@/infra/current-user";
import {
  ensureExecutiveIssueAccess,
  ensureIssueGutValue,
  ensureIssueStatus,
  ensureRequiredText
} from "@/core/domain/rules";
import { ValidationError } from "@/core/domain/models";
import { jsonError } from "@/infra/http";

type RouteContext = {
  params: Promise<{ winId: string }>;
};

function nullableNumber(value: unknown, fieldName: string): number | null {
  if (value == null || value === "") return null;
  return ensureIssueGutValue(Number(value), fieldName);
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    ensureExecutiveIssueAccess(user);
    const { winId } = await context.params;
    const payload = await request.json();
    const executiveGravity = nullableNumber(payload.executiveGravity ?? payload.executive_gravity, "gravidade executiva");
    const executiveUrgency = nullableNumber(payload.executiveUrgency ?? payload.executive_urgency, "urgencia executiva");
    const executiveTendency = nullableNumber(payload.executiveTendency ?? payload.executive_tendency, "tendencia executiva");
    const status = payload.status == null || payload.status === "" ? null : ensureIssueStatus(String(payload.status));

    if (executiveGravity === null && executiveUrgency === null && executiveTendency === null && status === null) {
      throw new ValidationError("Informe status ou GUT executivo para atualizar a Win.");
    }

    const win = await buildContainer().winReportRepository.updateExecutiveReview({
      winId: ensureRequiredText(winId, "win_id"),
      executiveGravity,
      executiveUrgency,
      executiveTendency,
      status,
      reviewedBy: user.id
    });
    return NextResponse.json(win);
  } catch (error) {
    return jsonError(error);
  }
}
