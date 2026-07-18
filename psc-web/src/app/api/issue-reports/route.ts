import { NextResponse } from "next/server";
import { buildContainer } from "@/composition/build-container";
import { getCurrentUser } from "@/infra/current-user";
import { ensureCanUseIssueReports, ensureIssueGutValue, ensureRequiredText } from "@/core/domain/rules";
import { jsonError } from "@/infra/http";
import { ValidationError } from "@/core/domain/models";

export async function GET() {
  try {
    const user = await getCurrentUser();
    ensureCanUseIssueReports(user);
    const requesterFilter = user.role === "executivo" ? null : user.id;
    const issues = await buildContainer().issueReportRepository.listIssueReports(requesterFilter);
    return NextResponse.json(issues);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    ensureCanUseIssueReports(user);
    const payload = await request.json();
    const isOtherArea = Boolean(payload.isOtherArea ?? payload.is_other_area);
    const areaId = isOtherArea ? null : String(payload.areaId ?? payload.area_id ?? "").trim();
    if (!isOtherArea && !areaId) throw new ValidationError("Selecione uma area ou marque Outras.");

    const issue = await buildContainer().issueReportRepository.createIssueReport({
      title: ensureRequiredText(String(payload.title ?? ""), "titulo"),
      requesterId: user.id,
      areaId,
      isOtherArea,
      requesterGravity: ensureIssueGutValue(Number(payload.requesterGravity ?? payload.requester_gravity), "gravidade"),
      requesterUrgency: ensureIssueGutValue(Number(payload.requesterUrgency ?? payload.requester_urgency), "urgencia"),
      requesterTendency: ensureIssueGutValue(Number(payload.requesterTendency ?? payload.requester_tendency), "tendencia"),
      ocorrencia: ensureRequiredText(String(payload.ocorrencia ?? ""), "ocorrencia"),
      identificacaoCausa: ensureRequiredText(String(payload.identificacaoCausa ?? payload.identificacao_causa ?? ""), "identificacao da causa"),
      propostaSolucao: ensureRequiredText(String(payload.propostaSolucao ?? payload.proposta_solucao ?? ""), "proposta de solucao")
    });
    return NextResponse.json(issue);
  } catch (error) {
    return jsonError(error);
  }
}
