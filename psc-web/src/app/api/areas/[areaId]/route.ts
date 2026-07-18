import { NextResponse } from "next/server";
import { buildContainer } from "@/composition/build-container";
import { getCurrentUser } from "@/infra/current-user";
import { ensureHexColorOrNull, ensureRequiredText, ensureRole } from "@/core/domain/rules";
import { jsonError } from "@/infra/http";

type RouteContext = {
  params: Promise<{ areaId: string }>;
};

export async function PUT(request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    ensureRole(user, "executivo");
    const { areaId } = await context.params;
    const payload = await request.json();
    const area = await buildContainer().indicatorRepository.updateArea(
      ensureRequiredText(areaId, "area_id"),
      ensureRequiredText(String(payload.name ?? ""), "nome da area"),
      ensureHexColorOrNull(payload.hexColor ?? payload.hex_color ?? null, "cor da area")
    );
    return NextResponse.json(area);
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    ensureRole(user, "executivo");
    const { areaId } = await context.params;
    await buildContainer().indicatorRepository.deactivateArea(ensureRequiredText(areaId, "area_id"));
    return NextResponse.json({ status: "deleted" });
  } catch (error) {
    return jsonError(error);
  }
}
