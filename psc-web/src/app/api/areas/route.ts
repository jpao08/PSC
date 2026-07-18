import { NextResponse } from "next/server";
import { buildContainer } from "@/composition/build-container";
import { getCurrentUser } from "@/infra/current-user";
import { AuthorizationError } from "@/core/domain/models";
import { jsonError } from "@/infra/http";
import { ensureHexColorOrNull, ensureRequiredText, ensureRole } from "@/core/domain/rules";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (user.role !== "executivo" && !user.canAdminUsers && !user.canUseIssueReports) {
      throw new AuthorizationError("Usuario sem permissao para listar areas.");
    }
    const areas = await buildContainer().indicatorRepository.listAreas();
    return NextResponse.json(areas);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    ensureRole(user, "executivo");
    const payload = await request.json();
    const area = await buildContainer().indicatorRepository.createArea(
      ensureRequiredText(String(payload.name ?? ""), "nome da area"),
      ensureHexColorOrNull(payload.hexColor ?? payload.hex_color ?? null, "cor da area")
    );
    return NextResponse.json(area);
  } catch (error) {
    return jsonError(error);
  }
}
