import { NextResponse } from "next/server";
import { buildContainer } from "@/composition/build-container";
import { AuthorizationError } from "@/core/domain/models";
import { ensureCanUseMarketingDrilldown } from "@/core/domain/rules";
import { getCurrentUser } from "@/infra/current-user";
import { jsonError } from "@/infra/http";

export async function POST() {
  try {
    const user = await getCurrentUser();
    ensureCanUseMarketingDrilldown(user);
    if (user.role !== "executivo" && !user.canAdminUsers) throw new AuthorizationError("Somente Admin pode iniciar sincronizacao de Marketing.");
    const result = await buildContainer().marketingDrilldownRepository.startSync(user.id);
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
