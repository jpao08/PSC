import { NextResponse } from "next/server";
import { buildContainer } from "@/composition/build-container";
import { getCurrentUser } from "@/infra/current-user";
import { ensureExecutiveIssueAccess, ensureRequiredText } from "@/core/domain/rules";
import { jsonError } from "@/infra/http";

type RouteContext = {
  params: Promise<{ issueId: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    ensureExecutiveIssueAccess(user);
    const { issueId } = await context.params;
    await buildContainer().issueReportRepository.softDeleteIssueReport(ensureRequiredText(issueId, "issue_id"), user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
