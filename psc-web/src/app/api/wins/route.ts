import { NextResponse } from "next/server";
import { buildContainer } from "@/composition/build-container";
import { getCurrentUser } from "@/infra/current-user";
import { ensureCanUseIssueReports, ensureRequiredText } from "@/core/domain/rules";
import { jsonError } from "@/infra/http";
import { ValidationError } from "@/core/domain/models";

export async function GET() {
  try {
    const user = await getCurrentUser();
    ensureCanUseIssueReports(user);
    const requesterFilter = user.role === "executivo" ? null : user.id;
    const wins = await buildContainer().winReportRepository.listWinReports(requesterFilter);
    return NextResponse.json(wins);
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

    const win = await buildContainer().winReportRepository.createWinReport({
      title: ensureRequiredText(String(payload.title ?? ""), "titulo"),
      requesterId: user.id,
      areaId,
      isOtherArea,
      ocorrencia: ensureRequiredText(String(payload.description ?? payload.ocorrencia ?? ""), "descricao"),
      identificacaoCausa: String(payload.identificacaoCausa ?? payload.identificacao_causa ?? "").trim(),
      propostaSolucao: String(payload.propostaSolucao ?? payload.proposta_solucao ?? "").trim()
    });
    return NextResponse.json(win);
  } catch (error) {
    return jsonError(error);
  }
}
