import { buildSupabaseClient } from "@/adapters/output/supabase-client";
import {
  SupabaseActionPlanRepository,
  SupabaseCommercialDrilldownRepository,
  SupabaseIndicatorRepository,
  SupabaseIssueReportRepository,
  SupabaseUserRepository,
  SupabaseWinReportRepository
} from "@/adapters/output/supabase-repositories";
import { BitrixGateway } from "@/adapters/output/bitrix-gateway";
import { ListIndicators } from "@/core/use-cases/list-indicators";
import { ProvisionBitrixUser } from "@/core/use-cases/provision-bitrix-user";
import { ResolveBitrixLogin } from "@/core/use-cases/resolve-bitrix-login";
import { CreateActionPlan } from "@/core/use-cases/create-action-plan";

export function buildContainer() {
  const supabase = buildSupabaseClient();
  const userRepository = new SupabaseUserRepository(supabase);
  const indicatorRepository = new SupabaseIndicatorRepository(supabase);
  const actionPlanRepository = new SupabaseActionPlanRepository(supabase);
  const commercialDrilldownRepository = new SupabaseCommercialDrilldownRepository(supabase);
  const issueReportRepository = new SupabaseIssueReportRepository(supabase);
  const winReportRepository = new SupabaseWinReportRepository(supabase);
  const bitrixGateway = new BitrixGateway();

  return {
    userRepository,
    indicatorRepository,
    actionPlanRepository,
    commercialDrilldownRepository,
    issueReportRepository,
    winReportRepository,
    bitrixGateway,
    listIndicators: new ListIndicators(indicatorRepository),
    provisionBitrixUser: new ProvisionBitrixUser(userRepository),
    resolveBitrixLogin: new ResolveBitrixLogin(userRepository),
    createActionPlan: new CreateActionPlan(actionPlanRepository, indicatorRepository, bitrixGateway)
  };
}
