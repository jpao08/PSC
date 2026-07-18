import { NextResponse } from "next/server";
import { buildContainer } from "@/composition/build-container";
import { getCurrentUser } from "@/infra/current-user";
import { ensureExecutiveIssueAccess, ensureRequiredText } from "@/core/domain/rules";
import { jsonError } from "@/infra/http";

type RouteContext = {
  params: Promise<{ winId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    ensureExecutiveIssueAccess(user);
    const { winId } = await context.params;
    const payload = await request.json();
    const tagIds = Array.isArray(payload.tagIds ?? payload.tag_ids) ? payload.tagIds ?? payload.tag_ids : [];
    const win = await buildContainer().winReportRepository.replaceWinTags(
      ensureRequiredText(winId, "win_id"),
      tagIds.map((tagId: unknown) => ensureRequiredText(String(tagId), "tag_id")),
      user.id
    );
    return NextResponse.json(win);
  } catch (error) {
    return jsonError(error);
  }
}
