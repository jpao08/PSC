import { SupabaseClient } from "@supabase/supabase-js";
import {
  ActionPlan,
  AggregationType,
  Area,
  BitrixUser,
  CommercialDrilldownDashboard,
  CommercialDrilldownItemsPage,
  CommercialSyncStartResult,
  Indicator,
  IndicatorTableRow,
  IndicatorUnit,
  IndicatorValue,
  IssueReport,
  IssueTag,
  User,
  WinReport,
  WinTag
} from "@/core/domain/models";
import {
  ActionPlanRepositoryPort,
  AdminUserPayload,
  CommercialDrilldownRepositoryPort,
  IndicatorRepositoryPort,
  IssueReportRepositoryPort,
  UserRepositoryPort,
  WinReportRepositoryPort
} from "@/core/ports/repositories";
import {
  calculateAchievementPercent,
  calculateAnnualValue,
  calculateMonthlyValue,
  classifyPerformance,
  getUserAreaIds
} from "@/core/domain/rules";

type Row = Record<string, unknown>;

function asString(value: unknown): string {
  return String(value ?? "");
}

function asNullableString(value: unknown): string | null {
  return value == null || value === "" ? null : String(value);
}

function asNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export class SupabaseCommercialDrilldownRepository implements CommercialDrilldownRepositoryPort {
  constructor(private readonly client: SupabaseClient) {}

  async getDashboard(year: number): Promise<CommercialDrilldownDashboard> {
    const { data, error } = await this.client.rpc("get_commercial_drilldown_dashboard", {
      target_year: year
    });
    if (error) throw error;
    return data as CommercialDrilldownDashboard;
  }

  async getItems(input: {
    year: number;
    month: number;
    metricKey: string;
    responsibleId: string | null;
    query: string | null;
    page: number;
    pageSize: number;
    sort: string;
  }): Promise<CommercialDrilldownItemsPage> {
    const { data, error } = await this.client.rpc("get_commercial_drilldown_items", {
      target_year: input.year,
      target_month: input.month,
      target_metric_key: input.metricKey,
      target_responsible_id: input.responsibleId,
      q: input.query,
      page: input.page,
      page_size: input.pageSize,
      sort: input.sort
    });
    if (error) throw error;
    return data as CommercialDrilldownItemsPage;
  }

  async startSync(triggeredByUserId: string): Promise<CommercialSyncStartResult> {
    const { data, error } = await this.client.rpc("start_commercial_sync", {
      triggered_by_user_id: triggeredByUserId
    });
    if (error) throw error;
    return data as CommercialSyncStartResult;
  }

  async getSyncStatus(): Promise<Pick<CommercialDrilldownDashboard, "lastSuccessfulSyncAt" | "activeJob">> {
    const { data, error } = await this.client.rpc("get_commercial_sync_status");
    if (error) throw error;
    return data as Pick<CommercialDrilldownDashboard, "lastSuccessfulSyncAt" | "activeJob">;
  }
}

export class SupabaseUserRepository implements UserRepositoryPort {
  constructor(private readonly client: SupabaseClient) {}

  async getById(userId: string): Promise<User | null> {
    const { data, error } = await this.client.from("users").select("*").eq("id", userId).limit(1);
    if (error) throw error;
    return data?.[0] ? this.toUser(data[0]) : null;
  }

  async getByBitrixIdentity(bitrixUserId: string, portalDomain: string | null): Promise<User | null> {
    let query = this.client.from("users").select("*").eq("bitrix_user_id", bitrixUserId);
    if (portalDomain) query = query.eq("bitrix_portal_domain", portalDomain);
    const { data, error } = await query.limit(1);
    if (error) throw error;
    return data?.[0] ? this.toUser(data[0]) : null;
  }

  async listByNormalizedEmail(email: string): Promise<User[]> {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return [];
    const { data, error } = await this.client.from("users").select("*").ilike("email", normalized);
    if (error) throw error;
    const users = await Promise.all((data ?? []).map((row) => this.toUser(row)));
    return users.filter((user) => user.email.trim().toLowerCase() === normalized);
  }

  async listUsers(): Promise<User[]> {
    const { data, error } = await this.client.from("users").select("*").order("name");
    if (error) throw error;
    const users = await Promise.all((data ?? []).map((row) => this.toUser(row)));
    return users;
  }

  async upsertFromBitrix(payload: AdminUserPayload): Promise<User> {
    const existingByIdentity = await this.getByBitrixIdentity(payload.bitrixUser.id, payload.bitrixUser.portalDomain ?? null);
    const existingByEmail = payload.bitrixUser.email
      ? await this.listByNormalizedEmail(payload.bitrixUser.email)
      : [];
    const distinctByEmail = existingByEmail.filter((user) => user.id !== existingByIdentity?.id);
    if ((existingByIdentity && distinctByEmail.length > 0) || distinctByEmail.length > 1) {
      throw new Error("Email ja esta associado a multiplos usuarios PSC. Resolva a duplicidade antes de habilitar acesso Web.");
    }
    const existing = existingByIdentity ?? distinctByEmail[0] ?? null;
    const areaIds = [...new Set(payload.areaIds.filter(Boolean))];
    const userPayload = {
      bitrix_user_id: payload.bitrixUser.id,
      bitrix_portal_domain: payload.bitrixUser.portalDomain ?? null,
      email: payload.bitrixUser.email ?? `${payload.bitrixUser.id}@bitrix.local`,
      name: payload.bitrixUser.name,
      role: payload.role,
      area_id: areaIds[0] ?? null,
      is_active: payload.isActive,
      can_edit_projected_value: payload.canEditProjectedValue,
      can_edit_indicator_maturity: payload.canEditIndicatorMaturity,
      can_use_issue_reports: payload.canUseIssueReports,
      can_admin_users: payload.canAdminUsers,
      password_hash: ""
    };

    const query = existing
      ? this.client.from("users").update(userPayload).eq("id", existing.id).select("*").single()
      : this.client.from("users").insert(userPayload).select("*").single();
    const { data, error } = await query;
    if (error) throw error;
    const userId = asString(data.id);
    await this.replaceUserAreas(userId, areaIds);
    return this.toUser(data);
  }

  async deactivateUser(userId: string): Promise<void> {
    const { error } = await this.client.from("users").update({ is_active: false }).eq("id", userId);
    if (error) throw error;
  }

  private async replaceUserAreas(userId: string, areaIds: string[]): Promise<void> {
    const deleteResult = await this.client.from("user_area_access").delete().eq("user_id", userId);
    if (deleteResult.error) throw deleteResult.error;
    const rows = areaIds.map((areaId) => ({ user_id: userId, area_id: areaId }));
    if (rows.length === 0) return;
    const insertResult = await this.client.from("user_area_access").insert(rows);
    if (insertResult.error) throw insertResult.error;
  }

  private async listAreaIds(userId: string, fallbackAreaId: string | null): Promise<string[]> {
    const { data, error } = await this.client.from("user_area_access").select("area_id").eq("user_id", userId);
    if (error) throw error;
    const ids = (data ?? []).map((row) => asString(row.area_id)).filter(Boolean);
    if (fallbackAreaId && !ids.includes(fallbackAreaId)) ids.push(fallbackAreaId);
    return ids;
  }

  private async toUser(row: Row): Promise<User> {
    const id = asString(row.id);
    const areaId = asNullableString(row.area_id);
    return {
      id,
      email: asString(row.email),
      name: asString(row.name),
      role: asString(row.role) as User["role"],
      areaId,
      areaIds: await this.listAreaIds(id, areaId),
      isActive: Boolean(row.is_active ?? true),
      canEditProjectedValue: Boolean(row.can_edit_projected_value ?? false),
      canEditIndicatorMaturity: Boolean(row.can_edit_indicator_maturity ?? false),
      canUseIssueReports: Boolean(row.can_use_issue_reports ?? false),
      canAdminUsers: Boolean(row.can_admin_users ?? false),
      bitrixUserId: asNullableString(row.bitrix_user_id),
      bitrixPortalDomain: asNullableString(row.bitrix_portal_domain)
    };
  }
}

export class SupabaseIndicatorRepository implements IndicatorRepositoryPort {
  constructor(private readonly client: SupabaseClient) {}

  async listAreas(): Promise<Area[]> {
    const { data, error } = await this.client.from("areas").select("id,name,hex_color,is_active").eq("is_active", true).order("name");
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: asString(row.id),
      name: asString(row.name),
      hexColor: asNullableString(row.hex_color),
      isActive: Boolean(row.is_active ?? true)
    }));
  }

  async listUnits(): Promise<IndicatorUnit[]> {
    const { data, error } = await this.client.from("indicator_units").select("id,code,label").eq("is_active", true).order("label");
    if (error) throw error;
    return (data ?? []).map((row) => ({ id: asString(row.id), code: asString(row.code), label: asString(row.label) }));
  }

  async createArea(name: string, hexColor: string | null): Promise<Area> {
    const { data, error } = await this.client
      .from("areas")
      .insert({ name, hex_color: hexColor, is_active: true })
      .select("id,name,hex_color,is_active")
      .single();
    if (error) throw error;
    return {
      id: asString(data.id),
      name: asString(data.name),
      hexColor: asNullableString(data.hex_color),
      isActive: Boolean(data.is_active ?? true)
    };
  }

  async updateArea(areaId: string, name: string, hexColor: string | null): Promise<Area> {
    const { data, error } = await this.client
      .from("areas")
      .update({ name, hex_color: hexColor })
      .eq("id", areaId)
      .select("id,name,hex_color,is_active")
      .single();
    if (error) throw error;
    return {
      id: asString(data.id),
      name: asString(data.name),
      hexColor: asNullableString(data.hex_color),
      isActive: Boolean(data.is_active ?? true)
    };
  }

  async deactivateArea(areaId: string): Promise<void> {
    const { error } = await this.client.from("areas").update({ is_active: false }).eq("id", areaId);
    if (error) throw error;
  }

  async listActive(areaIds?: string[] | null): Promise<Indicator[]> {
    let query = this.client
      .from("indicators")
      .select("*, areas(name,hex_color), indicator_units(id,code,label)")
      .eq("is_active", true);
    if (areaIds && areaIds.length > 0) query = query.in("area_id", areaIds);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((row) => this.toIndicator(row));
  }

  async getById(indicatorId: string): Promise<Indicator | null> {
    const { data, error } = await this.client
      .from("indicators")
      .select("*, areas(name,hex_color), indicator_units(id,code,label)")
      .eq("id", indicatorId)
      .limit(1);
    if (error) throw error;
    return data?.[0] ? this.toIndicator(data[0]) : null;
  }

  async createIndicator(input: {
    areaId: string;
    name: string;
    description: string | null;
    aggregationType: AggregationType;
    unitId: string;
    maturityLevel: number | null;
    createdBy: string;
  }): Promise<Indicator> {
    const unit = (await this.listUnits()).find((item) => item.id === input.unitId) ?? null;
    const { data, error } = await this.client
      .from("indicators")
      .insert({
        area_id: input.areaId,
        name: input.name,
        description: input.description,
        aggregation_type: input.aggregationType,
        unit_id: input.unitId,
        unit: unit?.label ?? null,
        maturity_level: input.maturityLevel,
        created_by: input.createdBy,
        is_active: true
      })
      .select("*, areas(name,hex_color), indicator_units(id,code,label)")
      .single();
    if (error) throw error;
    return this.toIndicator(data);
  }

  async updateIndicator(indicatorId: string, input: {
    areaId: string;
    name: string;
    description: string | null;
    aggregationType: AggregationType;
    unitId: string;
    maturityLevel: number | null;
  }): Promise<Indicator> {
    const unit = (await this.listUnits()).find((item) => item.id === input.unitId) ?? null;
    const { data, error } = await this.client
      .from("indicators")
      .update({
        area_id: input.areaId,
        name: input.name,
        description: input.description,
        aggregation_type: input.aggregationType,
        unit_id: input.unitId,
        unit: unit?.label ?? null,
        maturity_level: input.maturityLevel
      })
      .eq("id", indicatorId)
      .select("*, areas(name,hex_color), indicator_units(id,code,label)")
      .single();
    if (error) throw error;
    return this.toIndicator(data);
  }

  async updateIndicatorMaturity(indicatorId: string, maturityLevel: number | null): Promise<Indicator> {
    const { data, error } = await this.client
      .from("indicators")
      .update({ maturity_level: maturityLevel })
      .eq("id", indicatorId)
      .select("*, areas(name,hex_color), indicator_units(id,code,label)")
      .single();
    if (error) throw error;
    return this.toIndicator(data);
  }

  async deleteIndicatorWithHistory(indicatorId: string): Promise<void> {
    const actionPlans = await this.client.from("action_plans").select("id").eq("indicator_id", indicatorId);
    if (actionPlans.error) throw actionPlans.error;
    const actionPlanIds = (actionPlans.data ?? []).map((row) => asString(row.id)).filter(Boolean);
    if (actionPlanIds.length > 0) {
      const historyDelete = await this.client.from("action_plan_history").delete().in("action_plan_id", actionPlanIds);
      if (historyDelete.error) throw historyDelete.error;
    }

    const tables = [
      "action_plans",
      "indicator_month_not_applicable",
      "indicator_month_projections",
      "indicator_month_targets",
      "indicator_value_history",
      "indicator_values"
    ];
    for (const table of tables) {
      const result = await this.client.from(table).delete().eq("indicator_id", indicatorId);
      if (result.error) throw result.error;
    }
    const deleteIndicator = await this.client.from("indicators").delete().eq("id", indicatorId);
    if (deleteIndicator.error) throw deleteIndicator.error;
  }

  async listWeeklyValues(indicatorIds: string[], year: number, month?: number): Promise<IndicatorValue[]> {
    if (indicatorIds.length === 0) return [];
    let query = this.client.from("indicator_values").select("*").in("indicator_id", indicatorIds).eq("year", year);
    if (month) query = query.eq("month", month);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((row) => ({
      indicatorId: asString(row.indicator_id),
      year: Number(row.year),
      month: Number(row.month),
      weekNumber: Number(row.week_number),
      value: Number(row.value),
      sourceUserId: asString(row.source_user_id)
    }));
  }

  async upsertWeeklyValue(value: IndicatorValue): Promise<void> {
    const { error } = await this.client.from("indicator_values").upsert(
      {
        indicator_id: value.indicatorId,
        year: value.year,
        month: value.month,
        week_number: value.weekNumber,
        value: value.value,
        source_user_id: value.sourceUserId
      },
      { onConflict: "indicator_id,year,month,week_number" }
    );
    if (error) throw error;
  }

  async listMonthTargets(indicatorIds: string[], year: number) {
    if (indicatorIds.length === 0) return [];
    const { data, error } = await this.client.from("indicator_month_targets").select("*").in("indicator_id", indicatorIds).eq("year", year);
    if (error) throw error;
    return (data ?? []).map((row) => ({ indicatorId: asString(row.indicator_id), month: Number(row.month), targetValue: Number(row.target_value) }));
  }

  async listMonthProjections(indicatorIds: string[], year: number) {
    if (indicatorIds.length === 0) return [];
    const { data, error } = await this.client.from("indicator_month_projections").select("*").in("indicator_id", indicatorIds).eq("year", year);
    if (error) throw error;
    return (data ?? []).map((row) => ({ indicatorId: asString(row.indicator_id), month: Number(row.month), projectedValue: Number(row.projected_value) }));
  }

  async listMonthNotApplicable(indicatorIds: string[], year: number) {
    if (indicatorIds.length === 0) return [];
    const { data, error } = await this.client.from("indicator_month_not_applicable").select("*").in("indicator_id", indicatorIds).eq("year", year);
    if (error) throw error;
    return (data ?? []).map((row) => ({ indicatorId: asString(row.indicator_id), month: Number(row.month) }));
  }

  async listYearPlanning(indicatorIds: string[], year: number) {
    if (indicatorIds.length === 0) return [];
    const { data, error } = await this.client.from("indicator_year_planning").select("*").in("indicator_id", indicatorIds).eq("year", year);
    if (error) throw error;
    return (data ?? []).map((row) => ({
      indicatorId: asString(row.indicator_id),
      annualTarget: asNumber(row.annual_target),
      confidenceLevel: asNumber(row.confidence_level)
    }));
  }

  async upsertMonthProjection(indicatorId: string, year: number, month: number, projectedValue: number, userId: string): Promise<void> {
    const { error } = await this.client.from("indicator_month_projections").upsert(
      {
        indicator_id: indicatorId,
        year,
        month,
        projected_value: projectedValue,
        created_by: userId,
        updated_by: userId
      },
      { onConflict: "indicator_id,year,month" }
    );
    if (error) throw error;
  }

  async deleteMonthProjection(indicatorId: string, year: number, month: number): Promise<void> {
    const { error } = await this.client
      .from("indicator_month_projections")
      .delete()
      .eq("indicator_id", indicatorId)
      .eq("year", year)
      .eq("month", month);
    if (error) throw error;
  }

  async upsertMonthTarget(indicatorId: string, year: number, month: number, targetValue: number, userId: string): Promise<void> {
    const { error } = await this.client.from("indicator_month_targets").upsert(
      {
        indicator_id: indicatorId,
        year,
        month,
        target_value: targetValue,
        created_by: userId,
        updated_by: userId
      },
      { onConflict: "indicator_id,year,month" }
    );
    if (error) throw error;
  }

  async deleteMonthTarget(indicatorId: string, year: number, month: number): Promise<void> {
    const { error } = await this.client
      .from("indicator_month_targets")
      .delete()
      .eq("indicator_id", indicatorId)
      .eq("year", year)
      .eq("month", month);
    if (error) throw error;
  }

  async setMonthNotApplicable(indicatorId: string, year: number, month: number, notApplicable: boolean, userId: string): Promise<void> {
    if (!notApplicable) {
      const { error } = await this.client
        .from("indicator_month_not_applicable")
        .delete()
        .eq("indicator_id", indicatorId)
        .eq("year", year)
        .eq("month", month);
      if (error) throw error;
      return;
    }

    const { error } = await this.client.from("indicator_month_not_applicable").upsert(
      {
        indicator_id: indicatorId,
        year,
        month,
        marked_by: userId
      },
      { onConflict: "indicator_id,year,month" }
    );
    if (error) throw error;
  }

  async upsertYearPlanning(indicatorId: string, year: number, annualTarget: number | null, confidenceLevel: number | null, userId: string): Promise<void> {
    const { error } = await this.client.from("indicator_year_planning").upsert(
      {
        indicator_id: indicatorId,
        year,
        annual_target: annualTarget,
        confidence_level: confidenceLevel,
        updated_by: userId,
        created_by: userId
      },
      { onConflict: "indicator_id,year" }
    );
    if (error) throw error;
  }

  async listIndicatorTable(user: User, year: number): Promise<IndicatorTableRow[]> {
    const areaFilter = ["gestor_area", "gestor_tatico", "gestor_operacional"].includes(user.role) ? getUserAreaIds(user) : null;
    const indicators = await this.listActive(areaFilter);
    const ids = indicators.map((indicator) => indicator.id);
    const values = await this.listWeeklyValues(ids, year);
    const targets = await this.listMonthTargets(ids, year);
    const projections = await this.listMonthProjections(ids, year);
    const notApplicable = await this.listMonthNotApplicable(ids, year);
    const yearPlanning = await this.listYearPlanning(ids, year);

    return indicators
      .map((indicator) => {
        const planning = yearPlanning.find((item) => item.indicatorId === indicator.id) ?? null;
        const months = Array.from({ length: 12 }, (_, index) => {
          const month = index + 1;
          const isNotApplicable = notApplicable.some((item) => item.indicatorId === indicator.id && item.month === month);
          const monthlyValue = isNotApplicable
            ? null
            : calculateMonthlyValue(
                values.filter((item) => item.indicatorId === indicator.id && item.month === month),
                indicator.aggregationType,
                year,
                month
              );
          const monthlyTarget = targets.find((item) => item.indicatorId === indicator.id && item.month === month)?.targetValue ?? null;
          const projectedValue = projections.find((item) => item.indicatorId === indicator.id && item.month === month)?.projectedValue ?? null;
          return {
            month,
            value: monthlyValue,
            projectedValue,
            monthlyTarget,
            notApplicable: isNotApplicable,
            belowTarget: !isNotApplicable && monthlyValue != null && monthlyTarget != null && monthlyValue < monthlyTarget
          };
        });
        const annualReal = calculateAnnualValue(
          months.filter((item) => item.value != null).map((item) => ({ month: item.month, value: item.value as number })),
          indicator.aggregationType
        );
        const annualProjected = calculateAnnualValue(
          months
            .filter((item) => item.value != null || item.projectedValue != null)
            .map((item) => ({ month: item.month, value: (item.value ?? item.projectedValue) as number })),
          indicator.aggregationType
        );
        const projectedAchievementPercent = calculateAchievementPercent(annualProjected, planning?.annualTarget ?? null);
        return {
          indicatorId: indicator.id,
          indicatorName: indicator.name,
          areaId: indicator.areaId,
          areaName: indicator.areaName,
          areaHexColor: indicator.areaHexColor,
          description: indicator.description,
          aggregationType: indicator.aggregationType,
          unitId: indicator.unitId,
          unit: indicator.unit,
          maturityLevel: indicator.maturityLevel,
          annualTarget: planning?.annualTarget ?? null,
          annualProjected,
          annualReal,
          confidenceLevel: planning?.confidenceLevel ?? null,
          projectedAchievementPercent,
          maturityClassification: classifyPerformance(indicator.maturityLevel),
          confidenceClassification: classifyPerformance(planning?.confidenceLevel ?? null),
          projectedAchievementClassification: classifyPerformance(projectedAchievementPercent),
          months
        };
      })
      .sort((left, right) => `${left.areaName ?? left.areaId} ${left.indicatorName}`.localeCompare(`${right.areaName ?? right.areaId} ${right.indicatorName}`));
  }

  private toIndicator(row: Row): Indicator {
    const areas = row.areas as Row | null | undefined;
    const unit = row.indicator_units as Row | null | undefined;
    return {
      id: asString(row.id),
      areaId: asString(row.area_id),
      areaName: asNullableString(areas?.name),
      areaHexColor: asNullableString(areas?.hex_color),
      name: asString(row.name),
      description: asNullableString(row.description),
      aggregationType: asString(row.aggregation_type) as Indicator["aggregationType"],
      unitId: asNullableString(row.unit_id),
      unit: asNullableString(unit?.label ?? row.unit),
      maturityLevel: asNumber(row.maturity_level),
      isActive: Boolean(row.is_active ?? true)
    };
  }
}

export class SupabaseActionPlanRepository implements ActionPlanRepositoryPort {
  constructor(private readonly client: SupabaseClient) {}

  async listActionPlans(indicatorId: string): Promise<ActionPlan[]> {
    const { data, error } = await this.client.from("action_plans").select("*").eq("indicator_id", indicatorId).order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => this.toActionPlan(row));
  }

  async createActionPlan(input: Omit<ActionPlan, "id" | "bitrixTaskId" | "status"> & { bitrixTaskId: string | null; status: string }): Promise<ActionPlan> {
    const { data, error } = await this.client
      .from("action_plans")
      .insert({
        indicator_id: input.indicatorId,
        title: input.title,
        ocorrencia: input.ocorrencia,
        identificacao_causa: input.identificacaoCausa,
        proposta_solucao: input.propostaSolucao,
        bitrix_responsible_id: input.bitrixResponsibleId,
        responsible_name: input.responsibleName,
        responsible_email: input.responsibleEmail,
        due_date: input.dueDate,
        bitrix_task_id: input.bitrixTaskId,
        status: input.status,
        created_by: input.createdBy
      })
      .select("*")
      .single();
    if (error) throw error;
    return this.toActionPlan(data);
  }

  async addHistory(actionPlanId: string, eventType: string, description: string, createdBy: string): Promise<void> {
    const { error } = await this.client.from("action_plan_history").insert({
      action_plan_id: actionPlanId,
      event_type: eventType,
      event_description: description,
      created_by: createdBy
    });
    if (error) throw error;
  }

  private toActionPlan(row: Row): ActionPlan {
    return {
      id: asString(row.id),
      indicatorId: asString(row.indicator_id),
      title: asString(row.title),
      ocorrencia: asString(row.ocorrencia),
      identificacaoCausa: asString(row.identificacao_causa),
      propostaSolucao: asString(row.proposta_solucao),
      bitrixResponsibleId: asNullableString(row.bitrix_responsible_id),
      responsibleName: asString(row.responsible_name),
      responsibleEmail: asNullableString(row.responsible_email),
      dueDate: asNullableString(row.due_date),
      bitrixTaskId: asNullableString(row.bitrix_task_id),
      status: asString(row.status),
      createdBy: asString(row.created_by)
    };
  }
}

export class SupabaseIssueReportRepository implements IssueReportRepositoryPort {
  constructor(private readonly client: SupabaseClient) {}

  async createIssueReport(input: {
    title: string;
    requesterId: string;
    areaId: string | null;
    isOtherArea: boolean;
    requesterGravity: number;
    requesterUrgency: number;
    requesterTendency: number;
    ocorrencia: string;
    identificacaoCausa: string;
    propostaSolucao: string;
  }): Promise<IssueReport> {
    const { data, error } = await this.client
      .from("issue_reports")
      .insert({
        title: input.title,
        requester_id: input.requesterId,
        area_id: input.areaId,
        is_other_area: input.isOtherArea,
        requester_gravity: input.requesterGravity,
        requester_urgency: input.requesterUrgency,
        requester_tendency: input.requesterTendency,
        ocorrencia: input.ocorrencia,
        identificacao_causa: input.identificacaoCausa,
        proposta_solucao: input.propostaSolucao,
        problem_description: input.ocorrencia,
        observed_impact: input.identificacaoCausa,
        attempted_solution: "-",
        requested_action: input.propostaSolucao
      })
      .select("*")
      .single();
    if (error) throw error;
    return this.toIssueReport(data, null, null, []);
  }

  async listIssueReports(requesterId?: string | null): Promise<IssueReport[]> {
    let query = this.client.from("issue_reports").select("*").eq("is_deleted", false).order("created_at", { ascending: false });
    if (requesterId) query = query.eq("requester_id", requesterId);
    const { data, error } = await query;
    if (error) throw error;
    const rows = data ?? [];
    const requesterIds = [...new Set(rows.map((row) => asString(row.requester_id)).filter(Boolean))];
    const areaIds = [...new Set(rows.map((row) => asString(row.area_id)).filter(Boolean))];
    const [userMap, areaMap, tagMap] = await Promise.all([
      this.listUserNameMap(requesterIds),
      this.listAreaNameMap(areaIds),
      this.listIssueTagsMap(rows.map((row) => asString(row.id)).filter(Boolean))
    ]);
    return rows.map((row) =>
      this.toIssueReport(
        row,
        userMap.get(asString(row.requester_id)) ?? null,
        areaMap.get(asString(row.area_id)) ?? null,
        tagMap.get(asString(row.id)) ?? []
      )
    );
  }

  async updateExecutiveReview(input: {
    issueId: string;
    executiveGravity: number | null;
    executiveUrgency: number | null;
    executiveTendency: number | null;
    status: string | null;
    reviewedBy: string;
  }): Promise<IssueReport> {
    const payload: Row = {
      reviewed_by: input.reviewedBy,
      reviewed_at: new Date().toISOString()
    };
    if (input.executiveGravity !== null) payload.executive_gravity = input.executiveGravity;
    if (input.executiveUrgency !== null) payload.executive_urgency = input.executiveUrgency;
    if (input.executiveTendency !== null) payload.executive_tendency = input.executiveTendency;
    if (input.status !== null) payload.status = input.status;
    const { error } = await this.client.from("issue_reports").update(payload).eq("id", input.issueId);
    if (error) throw error;
    return this.getIssueReportById(input.issueId);
  }

  async softDeleteIssueReport(issueId: string, deletedBy: string): Promise<void> {
    const { error } = await this.client
      .from("issue_reports")
      .update({
        is_deleted: true,
        deleted_by: deletedBy,
        deleted_at: new Date().toISOString()
      })
      .eq("id", issueId);
    if (error) throw error;
  }

  async replaceIssueTags(issueId: string, tagIds: string[], updatedBy: string): Promise<IssueReport> {
    const deleteResult = await this.client.from("issue_report_tags").delete().eq("issue_id", issueId);
    if (deleteResult.error) throw deleteResult.error;
    const rows = [...new Set(tagIds.filter(Boolean))].map((tagId) => ({
      issue_id: issueId,
      tag_id: tagId,
      created_by: updatedBy
    }));
    if (rows.length > 0) {
      const insertResult = await this.client.from("issue_report_tags").insert(rows);
      if (insertResult.error) throw insertResult.error;
    }
    return this.getIssueReportById(issueId);
  }

  async listIssueTags(): Promise<IssueTag[]> {
    const { data, error } = await this.client.from("issue_tags").select("*").eq("is_active", true).order("name");
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: asString(row.id),
      name: asString(row.name),
      color: asNullableString(row.color),
      isActive: Boolean(row.is_active ?? true)
    }));
  }

  async createIssueTag(name: string, color: string | null, createdBy: string): Promise<IssueTag> {
    const { data, error } = await this.client
      .from("issue_tags")
      .insert({ name, color, created_by: createdBy, updated_by: createdBy })
      .select("*")
      .single();
    if (error) throw error;
    return this.toIssueTag(data);
  }

  async updateIssueTag(tagId: string, name: string, color: string | null): Promise<IssueTag> {
    const { data, error } = await this.client
      .from("issue_tags")
      .update({ name, color })
      .eq("id", tagId)
      .select("*")
      .single();
    if (error) throw error;
    return this.toIssueTag(data);
  }

  async deactivateIssueTag(tagId: string): Promise<void> {
    const { error } = await this.client.from("issue_tags").update({ is_active: false }).eq("id", tagId);
    if (error) throw error;
  }

  private async getIssueReportById(issueId: string): Promise<IssueReport> {
    const { data, error } = await this.client.from("issue_reports").select("*").eq("id", issueId).single();
    if (error) throw error;
    const requesterId = asString(data.requester_id);
    const areaId = asNullableString(data.area_id);
    const [userMap, areaMap, tagMap] = await Promise.all([
      this.listUserNameMap(requesterId ? [requesterId] : []),
      this.listAreaNameMap(areaId ? [areaId] : []),
      this.listIssueTagsMap([issueId])
    ]);
    return this.toIssueReport(
      data,
      userMap.get(requesterId) ?? null,
      areaId ? areaMap.get(areaId) ?? null : null,
      tagMap.get(issueId) ?? []
    );
  }

  private async listUserNameMap(userIds: string[]): Promise<Map<string, string>> {
    if (userIds.length === 0) return new Map();
    const { data, error } = await this.client.from("users").select("id,name").in("id", userIds);
    if (error) throw error;
    return new Map((data ?? []).map((row) => [asString(row.id), asString(row.name)]));
  }

  private async listAreaNameMap(areaIds: string[]): Promise<Map<string, string>> {
    if (areaIds.length === 0) return new Map();
    const { data, error } = await this.client.from("areas").select("id,name").in("id", areaIds);
    if (error) throw error;
    return new Map((data ?? []).map((row) => [asString(row.id), asString(row.name)]));
  }

  private async listIssueTagsMap(issueIds: string[]): Promise<Map<string, IssueTag[]>> {
    if (issueIds.length === 0) return new Map();
    const { data, error } = await this.client
      .from("issue_report_tags")
      .select("issue_id, issue_tags(id,name,color,is_active)")
      .in("issue_id", issueIds);
    if (error) throw error;
    const tagMap = new Map<string, IssueTag[]>();
    for (const row of data ?? []) {
      const issueId = asString(row.issue_id);
      const rawRelation = row.issue_tags as Row | Row[] | null | undefined;
      const rawTag = Array.isArray(rawRelation) ? rawRelation[0] : rawRelation;
      if (!rawTag) continue;
      const tag = this.toIssueTag(rawTag);
      tagMap.set(issueId, [...(tagMap.get(issueId) ?? []), tag]);
    }
    return tagMap;
  }

  private toIssueTag(row: Row): IssueTag {
    return {
      id: asString(row.id),
      name: asString(row.name),
      color: asNullableString(row.color),
      isActive: Boolean(row.is_active ?? true)
    };
  }

  private toIssueReport(row: Row, requesterName: string | null, areaName: string | null, tags: IssueTag[]): IssueReport {
    return {
      id: asString(row.id),
      title: asString(row.title),
      requesterId: asString(row.requester_id),
      requesterName,
      areaId: asNullableString(row.area_id),
      areaName,
      isOtherArea: Boolean(row.is_other_area),
      requesterGravity: Number(row.requester_gravity),
      requesterUrgency: Number(row.requester_urgency),
      requesterTendency: Number(row.requester_tendency),
      requesterPriorityScore: Number(row.requester_priority_score),
      executiveGravity: asNumber(row.executive_gravity),
      executiveUrgency: asNumber(row.executive_urgency),
      executiveTendency: asNumber(row.executive_tendency),
      executivePriorityScore: asNumber(row.executive_priority_score),
      ocorrencia: asString(row.ocorrencia),
      identificacaoCausa: asString(row.identificacao_causa),
      propostaSolucao: asString(row.proposta_solucao),
      status: asString(row.status) as IssueReport["status"],
      createdAt: asString(row.created_at),
      reviewedBy: asNullableString(row.reviewed_by),
      reviewedAt: asNullableString(row.reviewed_at),
      tags
    };
  }
}

export class SupabaseWinReportRepository implements WinReportRepositoryPort {
  constructor(private readonly client: SupabaseClient) {}

  async createWinReport(input: {
    title: string;
    requesterId: string;
    areaId: string | null;
    isOtherArea: boolean;
    ocorrencia: string;
    identificacaoCausa?: string;
    propostaSolucao?: string;
  }): Promise<WinReport> {
    const { data, error } = await this.client
      .from("wins")
      .insert({
        title: input.title,
        requester_id: input.requesterId,
        area_id: input.areaId,
        is_other_area: input.isOtherArea,
        requester_gravity: 1,
        requester_urgency: 1,
        requester_tendency: 1,
        ocorrencia: input.ocorrencia,
        identificacao_causa: input.identificacaoCausa ?? "",
        proposta_solucao: input.propostaSolucao ?? ""
      })
      .select("*")
      .single();
    if (error) throw error;
    return this.toWinReport(data, null, null, []);
  }

  async listWinReports(requesterId?: string | null): Promise<WinReport[]> {
    let query = this.client.from("wins").select("*").eq("is_deleted", false).order("created_at", { ascending: false });
    if (requesterId) query = query.eq("requester_id", requesterId);
    const { data, error } = await query;
    if (error) throw error;
    const rows = data ?? [];
    const requesterIds = [...new Set(rows.map((row) => asString(row.requester_id)).filter(Boolean))];
    const areaIds = [...new Set(rows.map((row) => asString(row.area_id)).filter(Boolean))];
    const [userMap, areaMap, tagMap] = await Promise.all([
      this.listUserNameMap(requesterIds),
      this.listAreaNameMap(areaIds),
      this.listWinTagsMap(rows.map((row) => asString(row.id)).filter(Boolean))
    ]);
    return rows.map((row) =>
      this.toWinReport(
        row,
        userMap.get(asString(row.requester_id)) ?? null,
        areaMap.get(asString(row.area_id)) ?? null,
        tagMap.get(asString(row.id)) ?? []
      )
    );
  }

  async updateExecutiveReview(input: {
    winId: string;
    executiveGravity: number | null;
    executiveUrgency: number | null;
    executiveTendency: number | null;
    status: string | null;
    reviewedBy: string;
  }): Promise<WinReport> {
    const payload: Row = {
      reviewed_by: input.reviewedBy,
      reviewed_at: new Date().toISOString()
    };
    if (input.executiveGravity !== null) payload.executive_gravity = input.executiveGravity;
    if (input.executiveUrgency !== null) payload.executive_urgency = input.executiveUrgency;
    if (input.executiveTendency !== null) payload.executive_tendency = input.executiveTendency;
    if (input.status !== null) payload.status = input.status;
    const { error } = await this.client.from("wins").update(payload).eq("id", input.winId);
    if (error) throw error;
    return this.getWinReportById(input.winId);
  }

  async softDeleteWinReport(winId: string, deletedBy: string): Promise<void> {
    const { error } = await this.client
      .from("wins")
      .update({
        is_deleted: true,
        deleted_by: deletedBy,
        deleted_at: new Date().toISOString()
      })
      .eq("id", winId);
    if (error) throw error;
  }

  async replaceWinTags(winId: string, tagIds: string[], updatedBy: string): Promise<WinReport> {
    const deleteResult = await this.client.from("win_report_tags").delete().eq("win_id", winId);
    if (deleteResult.error) throw deleteResult.error;
    const rows = [...new Set(tagIds.filter(Boolean))].map((tagId) => ({
      win_id: winId,
      tag_id: tagId,
      created_by: updatedBy
    }));
    if (rows.length > 0) {
      const insertResult = await this.client.from("win_report_tags").insert(rows);
      if (insertResult.error) throw insertResult.error;
    }
    return this.getWinReportById(winId);
  }

  async listWinTags(): Promise<WinTag[]> {
    const { data, error } = await this.client.from("win_tags").select("*").eq("is_active", true).order("name");
    if (error) throw error;
    return (data ?? []).map((row) => this.toWinTag(row));
  }

  async createWinTag(name: string, color: string | null, createdBy: string): Promise<WinTag> {
    const { data, error } = await this.client
      .from("win_tags")
      .insert({ name, color, created_by: createdBy, updated_by: createdBy })
      .select("*")
      .single();
    if (error) throw error;
    return this.toWinTag(data);
  }

  async updateWinTag(tagId: string, name: string, color: string | null): Promise<WinTag> {
    const { data, error } = await this.client
      .from("win_tags")
      .update({ name, color })
      .eq("id", tagId)
      .select("*")
      .single();
    if (error) throw error;
    return this.toWinTag(data);
  }

  async deactivateWinTag(tagId: string): Promise<void> {
    const { error } = await this.client.from("win_tags").update({ is_active: false }).eq("id", tagId);
    if (error) throw error;
  }

  private async getWinReportById(winId: string): Promise<WinReport> {
    const { data, error } = await this.client.from("wins").select("*").eq("id", winId).single();
    if (error) throw error;
    const requesterId = asString(data.requester_id);
    const areaId = asNullableString(data.area_id);
    const [userMap, areaMap, tagMap] = await Promise.all([
      this.listUserNameMap(requesterId ? [requesterId] : []),
      this.listAreaNameMap(areaId ? [areaId] : []),
      this.listWinTagsMap([winId])
    ]);
    return this.toWinReport(
      data,
      userMap.get(requesterId) ?? null,
      areaId ? areaMap.get(areaId) ?? null : null,
      tagMap.get(winId) ?? []
    );
  }

  private async listUserNameMap(userIds: string[]): Promise<Map<string, string>> {
    if (userIds.length === 0) return new Map();
    const { data, error } = await this.client.from("users").select("id,name").in("id", userIds);
    if (error) throw error;
    return new Map((data ?? []).map((row) => [asString(row.id), asString(row.name)]));
  }

  private async listAreaNameMap(areaIds: string[]): Promise<Map<string, string>> {
    if (areaIds.length === 0) return new Map();
    const { data, error } = await this.client.from("areas").select("id,name").in("id", areaIds);
    if (error) throw error;
    return new Map((data ?? []).map((row) => [asString(row.id), asString(row.name)]));
  }

  private async listWinTagsMap(winIds: string[]): Promise<Map<string, WinTag[]>> {
    if (winIds.length === 0) return new Map();
    const { data, error } = await this.client
      .from("win_report_tags")
      .select("win_id, win_tags(id,name,color,is_active)")
      .in("win_id", winIds);
    if (error) throw error;
    const tagMap = new Map<string, WinTag[]>();
    for (const row of data ?? []) {
      const winId = asString(row.win_id);
      const rawRelation = row.win_tags as Row | Row[] | null | undefined;
      const rawTag = Array.isArray(rawRelation) ? rawRelation[0] : rawRelation;
      if (!rawTag) continue;
      const tag = this.toWinTag(rawTag);
      tagMap.set(winId, [...(tagMap.get(winId) ?? []), tag]);
    }
    return tagMap;
  }

  private toWinTag(row: Row): WinTag {
    return {
      id: asString(row.id),
      name: asString(row.name),
      color: asNullableString(row.color),
      isActive: Boolean(row.is_active ?? true)
    };
  }

  private toWinReport(row: Row, requesterName: string | null, areaName: string | null, tags: WinTag[]): WinReport {
    return {
      id: asString(row.id),
      title: asString(row.title),
      requesterId: asString(row.requester_id),
      requesterName,
      areaId: asNullableString(row.area_id),
      areaName,
      isOtherArea: Boolean(row.is_other_area),
      requesterGravity: Number(row.requester_gravity),
      requesterUrgency: Number(row.requester_urgency),
      requesterTendency: Number(row.requester_tendency),
      requesterPriorityScore: Number(row.requester_priority_score),
      executiveGravity: asNumber(row.executive_gravity),
      executiveUrgency: asNumber(row.executive_urgency),
      executiveTendency: asNumber(row.executive_tendency),
      executivePriorityScore: asNumber(row.executive_priority_score),
      ocorrencia: asString(row.ocorrencia),
      identificacaoCausa: asString(row.identificacao_causa),
      propostaSolucao: asString(row.proposta_solucao),
      status: asString(row.status) as WinReport["status"],
      createdAt: asString(row.created_at),
      reviewedBy: asNullableString(row.reviewed_by),
      reviewedAt: asNullableString(row.reviewed_at),
      tags
    };
  }
}
