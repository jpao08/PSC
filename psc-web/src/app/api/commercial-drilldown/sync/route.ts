import { NextResponse } from "next/server";
import { buildContainer } from "@/composition/build-container";
import { ensureCanStartCommercialSync } from "@/core/domain/rules";
import { getCurrentUser } from "@/infra/current-user";
import { jsonError } from "@/infra/http";

export async function POST() {
  try {
    const user = await getCurrentUser();
    ensureCanStartCommercialSync(user);
    const result = await buildContainer().commercialDrilldownRepository.startSync(user.id);
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
