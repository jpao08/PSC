import { NextResponse } from "next/server";
import { buildContainer } from "@/composition/build-container";
import { getCurrentUser } from "@/infra/current-user";
import { ensureExecutiveIssueAccess, ensureHexColorOrNull, ensureRequiredText } from "@/core/domain/rules";
import { jsonError } from "@/infra/http";

type RouteContext = {
  params: Promise<{ tagId: string }>;
};

export async function PUT(request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    ensureExecutiveIssueAccess(user);
    const { tagId } = await context.params;
    const payload = await request.json();
    const tag = await buildContainer().winReportRepository.updateWinTag(
      ensureRequiredText(tagId, "tag_id"),
      ensureRequiredText(String(payload.name ?? ""), "nome da tag"),
      ensureHexColorOrNull(String(payload.color ?? ""), "cor da tag")
    );
    return NextResponse.json(tag);
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    ensureExecutiveIssueAccess(user);
    const { tagId } = await context.params;
    await buildContainer().winReportRepository.deactivateWinTag(ensureRequiredText(tagId, "tag_id"));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
