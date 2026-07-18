import { NextResponse } from "next/server";
import { buildContainer } from "@/composition/build-container";
import { getCurrentUser } from "@/infra/current-user";
import { ensureExecutiveIssueAccess, ensureRequiredText } from "@/core/domain/rules";
import { jsonError } from "@/infra/http";

type RouteContext = {
  params: Promise<{ winId: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    ensureExecutiveIssueAccess(user);
    const { winId } = await context.params;
    await buildContainer().winReportRepository.softDeleteWinReport(ensureRequiredText(winId, "win_id"), user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
