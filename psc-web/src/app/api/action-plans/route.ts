import { NextRequest, NextResponse } from "next/server";
import { buildContainer } from "@/composition/build-container";
import { getCurrentUser } from "@/infra/current-user";
import { jsonError } from "@/infra/http";

export async function GET(request: NextRequest) {
  try {
    await getCurrentUser();
    const indicatorId = request.nextUrl.searchParams.get("indicator_id");
    if (!indicatorId) return NextResponse.json({ detail: "indicator_id obrigatorio." }, { status: 422 });
    const plans = await buildContainer().actionPlanRepository.listActionPlans(indicatorId);
    return NextResponse.json(plans);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    const payload = await request.json();
    const plan = await buildContainer().createActionPlan.execute(user, payload);
    return NextResponse.json(plan);
  } catch (error) {
    return jsonError(error);
  }
}
