import { NextResponse } from "next/server";
import { buildContainer } from "@/composition/build-container";
import { getCurrentUser } from "@/infra/current-user";
import { ensureExecutiveIssueAccess, ensureRequiredText } from "@/core/domain/rules";
import { ValidationError } from "@/core/domain/models";
import { jsonError } from "@/infra/http";

type RouteContext = {
  params: Promise<{ issueId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    ensureExecutiveIssueAccess(user);
    const { issueId } = await context.params;
    const payload = await request.json();
    const rawTagIds = payload.tagIds ?? payload.tag_ids;
    if (!Array.isArray(rawTagIds)) throw new ValidationError("tagIds deve ser uma lista.");
    const tagIds = rawTagIds.map((tagId) => String(tagId).trim()).filter(Boolean);
    const issue = await buildContainer().issueReportRepository.replaceIssueTags(
      ensureRequiredText(issueId, "issue_id"),
      tagIds,
      user.id
    );
    return NextResponse.json(issue);
  } catch (error) {
    return jsonError(error);
  }
}
