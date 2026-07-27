// Supabase Edge Function for PSC Commercial Drill Down synchronization.
// Runs outside Vercel; PSC clients read pre-calculated Supabase data and never call Bitrix24.

type Job = {
  job_id: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  processed_records: number;
};

type Deal = {
  id: string;
  title: string;
  categoryId: number;
  stageId: string;
  stageSemanticId: string;
  assignedById: string | null;
  opportunity: number | null;
  currencyId: string;
  createdTime: string | null;
  updatedTime: string | null;
  movedTime: string | null;
  closed: boolean;
};

type StageHistory = {
  id: string;
  dealId: string;
  typeId: string | null;
  categoryId: number;
  stageId: string;
  semanticId: string;
  enteredAt: string;
};

type Cycle = {
  cycleId: string;
  dealId: string;
  cycleNumber: number;
  startedAt: string;
  endedAt: string | null;
  startReason: string;
  endReason: string | null;
};

type MetricKey =
  | "initial_meetings"
  | "presented_proposals"
  | "initial_pipe"
  | "semi_qualified_pipeline"
  | "qualified_pipe"
  | "closed_contracts"
  | "total_cards";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const bitrixWebhookUrl = Deno.env.get("BITRIX_WEBHOOK_URL") ?? "";
const syncSince = Deno.env.get("COMMERCIAL_SYNC_SINCE") ?? "2026-01-01T00:00:00-03:00";
const categoryId = Number(Deno.env.get("COMMERCIAL_BITRIX_CATEGORY_ID") ?? "0");
const staleJobMinutes = Number(Deno.env.get("COMMERCIAL_SYNC_STALE_MINUTES") ?? "10");

const stageGroups = {
  initial_pipe: new Set(["9", "6", "8", "7", "UC_83I1JS", "4", "10", "NEW", "11", "5"]),
  semi_qualified_pipeline: new Set(["PREPARATION", "12", "3", "13"]),
  qualified_pipe: new Set(["UC_AUIF39", "14", "15", "16", "1", "17"]),
  total_cards_extra: new Set(["UC_99GOPG"]),
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function encodeQuery(value: Record<string, string | number | boolean>): string {
  const params = new URLSearchParams();
  for (const [key, raw] of Object.entries(value)) params.set(key, String(raw));
  return params.toString();
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

function asArray(payload: any): any[] {
  if (Array.isArray(payload?.result?.items)) return payload.result.items;
  if (Array.isArray(payload?.result)) return payload.result;
  if (Array.isArray(payload)) return payload;
  return [];
}

function asNext(payload: any): number | null {
  const next = payload?.next ?? payload?.result?.next;
  return next == null ? null : Number(next);
}

function toNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSemantic(value: unknown): string {
  const raw = String(value ?? "").toUpperCase();
  if (raw === "PROCESS") return "P";
  if (raw === "SUCCESS") return "S";
  if (raw === "FAILURE") return "F";
  if (["P", "S", "F"].includes(raw)) return raw;
  return raw || "P";
}

function parseBool(value: unknown): boolean {
  return value === true || value === "Y" || value === "true" || value === 1 || value === "1";
}

function monthEndSaoPaulo(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 1, 2, 59, 59, 999));
}

function currentSaoPauloParts(): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "numeric",
  }).formatToParts(new Date());
  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
  };
}

function todaySaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function metricValue(metric: MetricKey, deal: Deal): { quantity: number | null; monetary: number | null } {
  if (metric === "semi_qualified_pipeline" || metric === "qualified_pipe" || metric === "closed_contracts") {
    return { quantity: null, monetary: deal.opportunity ?? 0 };
  }
  return { quantity: 1, monetary: null };
}

async function rest(path: string, init: RequestInit = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      prefer: "return=representation,resolution=merge-duplicates",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase REST ${response.status}: ${text}`);
  }
  if (!text.trim()) return [];
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Supabase REST ${response.status} returned non-JSON: ${text.slice(0, 300)}`);
  }
}

async function bitrix(method: string, params: Record<string, unknown> = {}) {
  const response = await fetch(`${bitrixWebhookUrl.replace(/\/$/, "")}/${method}.json`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  const text = await response.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Bitrix ${method} returned non-JSON HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
  if (!response.ok) throw new Error(`Bitrix ${method} HTTP ${response.status}: ${text.slice(0, 300)}`);
  if (payload == null || typeof payload !== "object") {
    throw new Error(`Bitrix ${method} returned empty/invalid payload HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
  if (payload.error) throw new Error(`Bitrix ${method}: ${payload.error_description ?? payload.error}`);
  return payload;
}

type BitrixListProgress = {
  method: string;
  page: number;
  pageItems: number;
  totalItems: number;
  next: number | null;
};

async function bitrixList(
  method: string,
  params: Record<string, unknown> = {},
  onProgress?: (progress: BitrixListProgress) => Promise<void>,
): Promise<any[]> {
  const items: any[] = [];
  let start: number | null = 0;
  let page = 0;
  while (start !== null) {
    const payload = await bitrix(method, { ...params, start });
    const pageItems = asArray(payload);
    items.push(...pageItems);
    start = asNext(payload);
    page += 1;
    await onProgress?.({ method, page, pageItems: pageItems.length, totalItems: items.length, next: start });
  }
  return items;
}

async function expireStaleJobs() {
  const cutoff = new Date(Date.now() - Math.max(staleJobMinutes, 1) * 60_000).toISOString();
  await rest(`bitrix_sync_jobs?status=in.(pending,running)&updated_at=lt.${encodeURIComponent(cutoff)}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "failed",
      current_step: "stale_timeout",
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      error_message: `Sincronizacao interrompida sem finalizar por mais de ${staleJobMinutes} minutos. Crie uma nova sincronizacao.`,
    }),
  });
}

async function getPendingJob(): Promise<Job | null> {
  const jobs = await rest("bitrix_sync_jobs?status=eq.pending&order=created_at.asc&limit=1");
  return jobs[0] ?? null;
}

async function updateJob(jobId: string, payload: Record<string, unknown>) {
  await rest(`bitrix_sync_jobs?job_id=eq.${jobId}`, {
    method: "PATCH",
    body: JSON.stringify({ ...payload, updated_at: new Date().toISOString() }),
  });
}

async function upsert(table: string, rows: Record<string, unknown>[], onConflict: string) {
  for (const part of chunk(rows, 500)) {
    if (part.length === 0) continue;
    await rest(`${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
      method: "POST",
      body: JSON.stringify(part),
    });
  }
}

async function insertRows(table: string, rows: Record<string, unknown>[]) {
  for (const part of chunk(rows, 500)) {
    if (part.length === 0) continue;
    await rest(table, {
      method: "POST",
      body: JSON.stringify(part),
      headers: { prefer: "return=minimal" },
    });
  }
}

async function deleteRows(table: string, filters: Record<string, string | number | boolean>) {
  await rest(`${table}?${encodeQuery(filters)}`, { method: "DELETE" });
}

async function syncStages() {
  const rows = await bitrixList("crm.status.list", {
    order: { SORT: "ASC" },
    filter: { ENTITY_ID: "DEAL_STAGE" },
  });
  await upsert(
    "bitrix_crm_stages",
    rows.map((row) => ({
      stage_id: String(row.STATUS_ID),
      category_id: Number(row.CATEGORY_ID ?? categoryId),
      name: String(row.NAME ?? row.STATUS_ID),
      sort_order: toNumber(row.SORT),
      semantic_id: normalizeSemantic(row.SEMANTICS ?? row.EXTRA?.SEMANTICS),
      active: true,
      synced_at: new Date().toISOString(),
    })),
    "stage_id,category_id",
  );
}

async function syncUsers(): Promise<Map<string, any>> {
  const users = await bitrixList("user.get", { SORT: "ID", ORDER: "asc" });
  const rows = users.map((user) => ({
    bitrix_user_id: String(user.ID),
    full_name: [user.NAME, user.LAST_NAME].filter(Boolean).join(" ").trim() || String(user.ID),
    email: user.EMAIL ?? null,
    active: parseBool(user.ACTIVE),
    synced_at: new Date().toISOString(),
  }));
  await upsert("bitrix_crm_users", rows, "bitrix_user_id");
  return new Map(users.map((user) => [String(user.ID), user]));
}

async function syncDeals(jobId: string): Promise<Map<string, Deal>> {
  const items = await bitrixList("crm.item.list", {
    entityTypeId: 2,
    select: [
      "id",
      "title",
      "categoryId",
      "stageId",
      "stageSemanticId",
      "assignedById",
      "opportunity",
      "currencyId",
      "createdTime",
      "updatedTime",
      "movedTime",
      "closed",
    ],
    filter: { categoryId },
  }, async (progress) => {
    await updateJob(jobId, {
      current_step: "sync_deals",
      processed_records: progress.totalItems,
      cursor: { bitrixMethod: progress.method, page: progress.page, next: progress.next },
    });
  });
  const deals = items.map((item) => {
    const assignedById = item.assignedById ?? item.ASSIGNED_BY_ID;
    const deal: Deal = {
      id: String(item.id ?? item.ID),
      title: String(item.title ?? item.TITLE ?? ""),
      categoryId: Number(item.categoryId ?? item.CATEGORY_ID ?? categoryId),
      stageId: String(item.stageId ?? item.STAGE_ID ?? ""),
      stageSemanticId: normalizeSemantic(item.stageSemanticId ?? item.STAGE_SEMANTIC_ID),
      assignedById: assignedById == null || assignedById === "" ? null : String(assignedById),
      opportunity: toNumber(item.opportunity ?? item.OPPORTUNITY),
      currencyId: String(item.currencyId ?? item.CURRENCY_ID ?? "BRL"),
      createdTime: item.createdTime ?? item.CREATED_TIME ?? null,
      updatedTime: item.updatedTime ?? item.UPDATED_TIME ?? null,
      movedTime: item.movedTime ?? item.MOVED_TIME ?? null,
      closed: parseBool(item.closed ?? item.CLOSED),
    };
    return deal;
  });
  await upsert(
    "bitrix_crm_deals",
    deals.map((deal) => ({
      bitrix_deal_id: deal.id,
      title: deal.title,
      category_id: deal.categoryId,
      stage_id: deal.stageId,
      stage_semantic_id: deal.stageSemanticId,
      assigned_by_id: deal.assignedById,
      opportunity: deal.opportunity,
      currency_id: deal.currencyId,
      created_time: deal.createdTime,
      updated_time: deal.updatedTime,
      moved_time: deal.movedTime,
      closed: deal.closed,
      is_deleted: false,
      last_seen_at: new Date().toISOString(),
      synced_at: new Date().toISOString(),
    })),
    "bitrix_deal_id",
  );
  return new Map(deals.map((deal) => [deal.id, deal]));
}

async function persistCurrentSnapshots(deals: Map<string, Deal>) {
  const snapshotDate = todaySaoPaulo();
  await upsert(
    "bitrix_crm_deal_snapshots",
    [...deals.values()].map((deal) => ({
      snapshot_date: snapshotDate,
      bitrix_deal_id: deal.id,
      category_id: deal.categoryId,
      stage_id: deal.stageId,
      stage_semantic_id: deal.stageSemanticId,
      assigned_by_id: deal.assignedById,
      opportunity: deal.opportunity,
      currency_id: deal.currencyId,
      captured_at: new Date().toISOString(),
    })),
    "snapshot_date,bitrix_deal_id",
  );
}

async function syncStageHistory(jobId: string, deals: Map<string, Deal>): Promise<StageHistory[]> {
  const raw = await bitrixList("crm.stagehistory.list", {
    entityTypeId: 2,
    order: { ID: "ASC" },
    filter: { ">=CREATED_TIME": syncSince, CATEGORY_ID: categoryId },
    select: ["ID", "TYPE_ID", "OWNER_ID", "CREATED_TIME", "CATEGORY_ID", "STAGE_SEMANTIC_ID", "STAGE_ID"],
  }, async (progress) => {
    await updateJob(jobId, {
      current_step: "sync_stage_history",
      processed_records: deals.size + progress.totalItems,
      total_records: deals.size,
      cursor: { bitrixMethod: progress.method, page: progress.page, next: progress.next },
    });
  });
  const history = raw
    .map((row) => ({
      id: String(row.ID),
      dealId: String(row.OWNER_ID),
      typeId: row.TYPE_ID == null ? null : String(row.TYPE_ID),
      categoryId: Number(row.CATEGORY_ID ?? categoryId),
      stageId: String(row.STAGE_ID ?? ""),
      semanticId: normalizeSemantic(row.STAGE_SEMANTIC_ID),
      enteredAt: String(row.CREATED_TIME),
    }))
    .filter((row) => deals.has(row.dealId));
  await upsert(
    "bitrix_crm_stage_history",
    history.map((row) => ({
      bitrix_history_id: row.id,
      bitrix_deal_id: row.dealId,
      movement_type: row.typeId,
      category_id: row.categoryId,
      stage_id: row.stageId,
      stage_semantic_id: row.semanticId,
      entered_at: row.enteredAt,
      imported_at: new Date().toISOString(),
    })),
    "bitrix_history_id",
  );
  return history;
}

function buildCycles(history: StageHistory[], deals: Map<string, Deal>): Cycle[] {
  const byDeal = new Map<string, StageHistory[]>();
  for (const row of history) {
    if (!byDeal.has(row.dealId)) byDeal.set(row.dealId, []);
    byDeal.get(row.dealId)!.push(row);
  }
  const cycles: Cycle[] = [];
  for (const [dealId, rows] of byDeal) {
    rows.sort((left, right) => new Date(left.enteredAt).getTime() - new Date(right.enteredAt).getTime());
    let active: Cycle | null = null;
    let cycleNumber = 0;
    let previousSemantic: string | null = null;
    for (const row of rows) {
      const startsCycle = row.semanticId === "P" && (!active || previousSemantic === "S" || previousSemantic === "F" || row.typeId === "1" || row.typeId === "5");
      if (startsCycle) {
        cycleNumber += 1;
        active = {
          cycleId: crypto.randomUUID(),
          dealId,
          cycleNumber,
          startedAt: row.enteredAt,
          endedAt: null,
          startReason: row.typeId === "5" ? "category_change" : previousSemantic === "S" || previousSemantic === "F" ? "reactivation" : "created",
          endReason: null,
        };
        cycles.push(active);
      }
      if (active && (row.semanticId === "S" || row.semanticId === "F")) {
        active.endedAt = row.enteredAt;
        active.endReason = row.semanticId === "S" ? "success" : "failure";
        active = null;
      }
      previousSemantic = row.semanticId;
    }
    if (!cycles.some((cycle) => cycle.dealId === dealId)) {
      const deal = deals.get(dealId)!;
      cycles.push({
        cycleId: crypto.randomUUID(),
        dealId,
        cycleNumber: 1,
        startedAt: deal.createdTime ?? syncSince,
        endedAt: deal.stageSemanticId === "P" ? null : deal.movedTime,
        startReason: "current_state",
        endReason: deal.stageSemanticId === "S" ? "success" : deal.stageSemanticId === "F" ? "failure" : null,
      });
    }
  }
  for (const deal of deals.values()) {
    if (cycles.some((cycle) => cycle.dealId === deal.id)) continue;
    cycles.push({
      cycleId: crypto.randomUUID(),
      dealId: deal.id,
      cycleNumber: 1,
      startedAt: deal.createdTime ?? syncSince,
      endedAt: deal.stageSemanticId === "P" ? null : deal.movedTime,
      startReason: "current_state",
      endReason: deal.stageSemanticId === "S" ? "success" : deal.stageSemanticId === "F" ? "failure" : null,
    });
  }
  return cycles;
}

async function persistCycles(cycles: Cycle[]) {
  await upsert(
    "bitrix_crm_deal_cycles",
    cycles.map((cycle) => ({
      cycle_id: cycle.cycleId,
      bitrix_deal_id: cycle.dealId,
      cycle_number: cycle.cycleNumber,
      started_at: cycle.startedAt,
      ended_at: cycle.endedAt,
      start_reason: cycle.startReason,
      end_reason: cycle.endReason,
    })),
    "bitrix_deal_id,cycle_number",
  );
}

function cycleForEvent(cycles: Cycle[], dealId: string, eventAt: string): Cycle | null {
  const timestamp = new Date(eventAt).getTime();
  return cycles.find((cycle) =>
    cycle.dealId === dealId &&
    new Date(cycle.startedAt).getTime() <= timestamp &&
    (cycle.endedAt == null || timestamp <= new Date(cycle.endedAt).getTime())
  ) ?? null;
}

function stageAt(rows: StageHistory[], cutoff: Date, fallback: Deal): StageHistory | null {
  let latest: StageHistory | null = null;
  for (const row of rows) {
    if (new Date(row.enteredAt).getTime() <= cutoff.getTime()) latest = row;
    else break;
  }
  if (latest) return latest;
  if (fallback.createdTime && new Date(fallback.createdTime).getTime() <= cutoff.getTime()) {
    return {
      id: `current-${fallback.id}`,
      dealId: fallback.id,
      typeId: null,
      categoryId: fallback.categoryId,
      stageId: fallback.stageId,
      semanticId: fallback.stageSemanticId,
      enteredAt: fallback.movedTime ?? fallback.createdTime,
    };
  }
  return null;
}

type AggregateCell = {
  quantity: number;
  monetary: number;
  currency: string;
  itemKeys: Set<string>;
};

function addAggregate(
  cells: Map<string, AggregateCell>,
  items: Record<string, unknown>[],
  year: number,
  month: number,
  metric: MetricKey,
  responsibleId: string | null,
  deal: Deal,
  cycleId: string | null,
  eventDate: string | null,
  referenceDate: string | null,
  stageId: string | null,
) {
  const key = `${year}|${month}|${metric}|${responsibleId ?? "__none__"}`;
  const contribution = metricValue(metric, deal);
  const cell = cells.get(key) ?? { quantity: 0, monetary: 0, currency: deal.currencyId, itemKeys: new Set<string>() };
  cell.quantity += contribution.quantity ?? 0;
  cell.monetary += contribution.monetary ?? 0;
  const itemKey = `${deal.id}|${cycleId ?? ""}`;
  if (!cell.itemKeys.has(itemKey)) {
    cell.itemKeys.add(itemKey);
    items.push({
      reference_year: year,
      reference_month: month,
      metric_key: metric,
      responsible_id: responsibleId,
      bitrix_deal_id: deal.id,
      cycle_id: cycleId,
      event_date: eventDate,
      reference_date: referenceDate,
      stage_id: stageId,
      quantity_contribution: contribution.quantity,
      monetary_contribution: contribution.monetary,
    });
  }
  cells.set(key, cell);
}

async function rebuildAggregates(deals: Map<string, Deal>, history: StageHistory[], cycles: Cycle[]) {
  const { year: currentYear, month: currentMonth } = currentSaoPauloParts();
  const startYear = 2026;
  const byDeal = new Map<string, StageHistory[]>();
  for (const row of history) {
    if (!byDeal.has(row.dealId)) byDeal.set(row.dealId, []);
    byDeal.get(row.dealId)!.push(row);
  }
  for (const rows of byDeal.values()) {
    rows.sort((left, right) => new Date(left.enteredAt).getTime() - new Date(right.enteredAt).getTime());
  }

  const cells = new Map<string, AggregateCell>();
  const items: Record<string, unknown>[] = [];

  for (let year = startYear; year <= currentYear; year += 1) {
    const monthLimit = year === currentYear ? currentMonth : 12;
    for (let month = 1; month <= monthLimit; month += 1) {
      const cutoff = year === currentYear && month === currentMonth ? new Date() : monthEndSaoPaulo(year, month);
      for (const deal of deals.values()) {
        const rows = byDeal.get(deal.id) ?? [];
        const state = stageAt(rows, cutoff, deal);
        if (!state || state.categoryId !== categoryId) continue;
        const responsibleId = deal.assignedById;
        const referenceDate = cutoff.toISOString();
        if (stageGroups.initial_pipe.has(state.stageId)) {
          addAggregate(cells, items, year, month, "initial_pipe", responsibleId, deal, null, null, referenceDate, state.stageId);
        }
        if (stageGroups.semi_qualified_pipeline.has(state.stageId)) {
          addAggregate(cells, items, year, month, "semi_qualified_pipeline", responsibleId, deal, null, null, referenceDate, state.stageId);
        }
        if (stageGroups.qualified_pipe.has(state.stageId)) {
          addAggregate(cells, items, year, month, "qualified_pipe", responsibleId, deal, null, null, referenceDate, state.stageId);
        }
        if (state.semanticId === "P" || stageGroups.total_cards_extra.has(state.stageId)) {
          addAggregate(cells, items, year, month, "total_cards", responsibleId, deal, null, null, referenceDate, state.stageId);
        }
      }
    }
  }

  const firstEventByCycle = new Set<string>();
  for (const row of history) {
    const eventDate = new Date(row.enteredAt);
    const eventYear = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric" }).format(eventDate));
    const eventMonth = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", month: "numeric" }).format(eventDate));
    if (eventYear < startYear) continue;
    const deal = deals.get(row.dealId);
    if (!deal) continue;
    const cycle = cycleForEvent(cycles, row.dealId, row.enteredAt);
    const cycleId = cycle?.cycleId ?? null;
    if (row.semanticId === "P" && (row.typeId === "1" || row.typeId === "5" || cycle?.startReason === "reactivation")) {
      const key = `initial_meetings|${cycleId ?? row.dealId}`;
      if (!firstEventByCycle.has(key)) {
        firstEventByCycle.add(key);
        addAggregate(cells, items, eventYear, eventMonth, "initial_meetings", deal.assignedById, deal, cycleId, row.enteredAt, null, row.stageId);
      }
    }
    if (row.stageId === "13") {
      const key = `presented_proposals|${cycleId ?? row.dealId}`;
      if (!firstEventByCycle.has(key)) {
        firstEventByCycle.add(key);
        addAggregate(cells, items, eventYear, eventMonth, "presented_proposals", deal.assignedById, deal, cycleId, row.enteredAt, null, row.stageId);
      }
    }
    if (row.stageId === "WON") {
      const key = `closed_contracts|${cycleId ?? row.dealId}`;
      if (!firstEventByCycle.has(key)) {
        firstEventByCycle.add(key);
        addAggregate(cells, items, eventYear, eventMonth, "closed_contracts", deal.assignedById, deal, cycleId, row.enteredAt, null, row.stageId);
      }
    }
  }

  for (let year = startYear; year <= currentYear; year += 1) {
    await deleteRows("commercial_drilldown_monthly", { reference_year: `eq.${year}` });
    await deleteRows("commercial_drilldown_items", { reference_year: `eq.${year}` });
  }

  await insertRows(
    "commercial_drilldown_monthly",
    [...cells.entries()].map(([key, cell]) => {
      const [year, month, metric, responsible] = key.split("|");
      return {
        reference_year: Number(year),
        reference_month: Number(month),
        metric_key: metric,
        responsible_id: responsible === "__none__" ? null : responsible,
        quantity_value: cell.quantity || null,
        monetary_value: cell.monetary || null,
        currency_id: cell.currency,
        calculated_at: new Date().toISOString(),
      };
    }),
  );
  await insertRows("commercial_drilldown_items", items);
  return { cells: cells.size, items: items.length };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ detail: "expected POST" }, 405);
  if (!supabaseUrl || !serviceRoleKey) return json({ detail: "Supabase secrets missing" }, 500);
  await expireStaleJobs();
  const job = await getPendingJob();
  if (!job) return json({ processed: false, detail: "no pending job" });

  try {
    await updateJob(job.job_id, {
      status: "running",
      started_at: new Date().toISOString(),
      current_step: "validating_secrets",
    });
    if (!bitrixWebhookUrl) throw new Error("BITRIX_WEBHOOK_URL secret is missing.");

    await updateJob(job.job_id, { current_step: "sync_stages" });
    await syncStages();

    await updateJob(job.job_id, { current_step: "sync_users" });
    await syncUsers();

    await updateJob(job.job_id, { current_step: "sync_deals" });
    const deals = await syncDeals(job.job_id);
    await persistCurrentSnapshots(deals);

    await updateJob(job.job_id, { current_step: "sync_stage_history", total_records: deals.size });
    const history = await syncStageHistory(job.job_id, deals);

    await updateJob(job.job_id, { current_step: "rebuild_cycles" });
    const cycles = buildCycles(history, deals);
    await persistCycles(cycles);

    await updateJob(job.job_id, { current_step: "rebuild_aggregates" });
    const result = await rebuildAggregates(deals, history, cycles);

    await updateJob(job.job_id, {
      status: "completed",
      current_step: "completed",
      processed_records: deals.size + history.length,
      total_records: deals.size + history.length,
      cursor: { syncedAt: new Date().toISOString(), ...result },
      finished_at: new Date().toISOString(),
    });
    return json({ processed: true, jobId: job.job_id, deals: deals.size, history: history.length, ...result });
  } catch (error) {
    await updateJob(job.job_id, {
      status: "failed",
      current_step: "failed",
      finished_at: new Date().toISOString(),
      error_message: error instanceof Error ? error.message : String(error),
    });
    return json({ processed: false, jobId: job.job_id, detail: "sync failed" }, 500);
  }
});
