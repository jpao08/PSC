import { NextResponse } from "next/server";
import { buildContainer } from "@/composition/build-container";
import { getCurrentUser } from "@/infra/current-user";
import { ensureCanUseIssueReports, ensureExecutiveIssueAccess, ensureHexColorOrNull, ensureRequiredText } from "@/core/domain/rules";
import { jsonError } from "@/infra/http";

export async function GET() {
  try {
    const user = await getCurrentUser();
    ensureCanUseIssueReports(user);
    const tags = await buildContainer().winReportRepository.listWinTags();
    return NextResponse.json(tags);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    ensureExecutiveIssueAccess(user);
    const payload = await request.json();
    const tag = await buildContainer().winReportRepository.createWinTag(
      ensureRequiredText(String(payload.name ?? ""), "nome da tag"),
      ensureHexColorOrNull(String(payload.color ?? ""), "cor da tag"),
      user.id
    );
    return NextResponse.json(tag);
  } catch (error) {
    return jsonError(error);
  }
}
