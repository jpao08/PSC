// Supabase Edge Function for PSC Marketing Drill Down synchronization.
// Runs outside Vercel; PSC clients read pre-calculated Supabase data and never call Bitrix24.

type Job = {
  job_id: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  processed_records: number;
  cursor?: {
    marketingNextMonth?: string;
    [key: string]: unknown;
  } | null;
};

type Stage = {
  stageId: string;
  categoryId: number;
  name: string;
  sortOrder: number | null;
  semanticId: string | null;
};

type Deal = {
  id: string;
  categoryId: number;
  title: string;
  stageId: string;
  stageSemanticId: string | null;
  assignedById: string | null;
  channel: string;
  sourceChannel: string | null;
  createdTime: string | null;
  updatedTime: string | null;
  movedTime: string | null;
  raw: Record<string, unknown>;
};

type StageHistory = {
  id: string;
  dealId: string;
  categoryId: number;
  stageId: string;
  semanticId: string | null;
  enteredAt: string;
};

type ChannelLookups = {
  sources: Map<string, string>;
};

type BitrixListProgress = {
  method: string;
  page: number;
  pageItems: number;
  totalItems: number;
  next: number | null;
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const bitrixWebhookUrl = Deno.env.get("BITRIX_WEBHOOK_URL") ?? "";
const syncSince = Deno.env.get("MARKETING_SYNC_SINCE") ?? "2026-01-01T00:00:00-03:00";
const sourceCategoryId = Number(Deno.env.get("MARKETING_SOURCE_CATEGORY_ID") ?? "95");
const outboundCategoryId = Number(Deno.env.get("MARKETING_OUTBOUND_CATEGORY_ID") ?? "125");
const crm95ChannelField = Deno.env.get("MARKETING_CRM95_CHANNEL_FIELD") ?? "sourceId";
const createdSince = Deno.env.get("MARKETING_CREATED_SINCE") ?? syncSince;
const staleJobMinutes = Number(Deno.env.get("MARKETING_SYNC_STALE_MINUTES") ?? "10");
const functionVersion = "marketing-sync-crm95-125-won-2026-08-01-3";

function json(body: unknown, status = 200): Response {
  const payload = typeof body === "object" && body !== null && !Array.isArray(body)
    ? { version: functionVersion, ...body }
    : { version: functionVersion, data: body };
  return new Response(JSON.stringify(payload), {
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

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function normalizeChannel(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "Outros";
  return raw;
}

function pickValue(item: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = item[key];
    if (value != null && String(value).trim()) return value;
  }
  return "";
}

function pickString(item: Record<string, unknown>, keys: string[]): string {
  const value = pickValue(item, keys);
  return value == null ? "" : String(value).trim();
}

function fieldKeyVariants(field: string): string[] {
  if (!field) return [];
  const lowerCamel = field
    .toLowerCase()
    .replace(/^uf_crm_deal/, "ufCrmDeal")
    .replace(/^uf_crm/, "ufCrm");
  return [field, field.toUpperCase(), field.toLowerCase(), lowerCamel];
}

function resolveLookupValue(value: unknown, lookup?: Map<string, string>): string {
  if (Array.isArray(value)) return value.map((item) => resolveLookupValue(item, lookup)).filter(Boolean).join(", ");
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return lookup?.get(raw) ?? raw;
}

function hasTitleTag(title: string, tag: string): boolean {
  return normalizeText(title).includes(`[${normalizeText(tag)}]`);
}

function isSiteLikeSource(source: string): boolean {
  const normalized = normalizeText(source);
  return ["site", "webform", "web form", "formulario", "formul", "td growth"].some((value) => normalized.includes(value));
}

function resolveRawSource(
  item: Record<string, unknown>,
  channelField: string,
  lookups?: ChannelLookups,
): string {
  const sourceKeys = [
    ...fieldKeyVariants(channelField),
    "sourceId",
    "SOURCE_ID",
    "sourceDescription",
    "SOURCE_DESCRIPTION",
  ];
  return resolveLookupValue(pickValue(item, sourceKeys), lookups?.sources);
}

function resolveSourceChannel(
  item: Record<string, unknown>,
  categoryId: number,
  channelField: string,
  lookups?: ChannelLookups,
): string {
  if (categoryId === outboundCategoryId) return "OUTBOUND";

  const source = resolveRawSource(item, channelField, lookups);
  const normalizedSource = normalizeText(source);
  const title = pickString(item, ["title", "TITLE"]);

  if (isSiteLikeSource(source)) {
    if (hasTitleTag(title, "META")) return "META ADS";
    if (hasTitleTag(title, "SEO")) return "SEO";
  }
  if (normalizedSource.includes("google ads")) return "GOOGLE ADS";
  if (normalizedSource.includes("parceiro comercial t&d") || normalizedSource.includes("parceiro comercial td")) {
    return "PARCEIROS COMERCIAIS";
  }
  return normalizeChannel(source);
}

function yearMonthSaoPaulo(value: string | null): { year: number; month: number } | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "numeric",
  }).formatToParts(date);
  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
  };
}

function timestamp(value: string | null): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.getTime();
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function monthStartIso(year: number, month: number): string {
  return `${year}-${pad2(month)}-01T00:00:00-03:00`;
}

function nextMonthParts(year: number, month: number): { year: number; month: number } {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

function nextMonthStartIso(year: number, month: number): string {
  const next = nextMonthParts(year, month);
  return monthStartIso(next.year, next.month);
}

function currentSaoPauloMonth(): { year: number; month: number } {
  const parts = yearMonthSaoPaulo(new Date().toISOString());
  return parts ?? { year: new Date().getUTCFullYear(), month: new Date().getUTCMonth() + 1 };
}

function monthFromCursor(value: string | undefined | null): { year: number; month: number } {
  const parts = yearMonthSaoPaulo(value ?? createdSince);
  return parts ?? { year: 2026, month: 1 };
}

function isWithinRange(value: string | null, startInclusive: string, endExclusive: string): boolean {
  const valueTime = timestamp(value);
  const startTime = timestamp(startInclusive);
  const endTime = timestamp(endExclusive);
  if (valueTime == null || startTime == null || endTime == null) return false;
  return valueTime >= startTime && valueTime < endTime;
}

function isBeforeDate(value: string | null, cutoff: string): boolean {
  const valueTime = timestamp(value);
  const cutoffTime = timestamp(cutoff);
  if (valueTime == null || cutoffTime == null) return false;
  return valueTime < cutoffTime;
}

function isWonStage(stageId: string | null, semanticId: string | null): boolean {
  const normalizedStage = String(stageId ?? "").toUpperCase();
  const normalizedSemantic = String(semanticId ?? "").toUpperCase();
  return normalizedSemantic === "S" || normalizedStage === "WON" || normalizedStage.endsWith(":WON");
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
  if (!response.ok) throw new Error(`Supabase REST ${response.status}: ${text}`);
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
  const bitrixError = Object.prototype.hasOwnProperty.call(payload, "error") ? payload["error"] : null;
  if (bitrixError) {
    const description = Object.prototype.hasOwnProperty.call(payload, "error_description")
      ? payload["error_description"]
      : bitrixError;
    throw new Error(`Bitrix ${method}: ${description}`);
  }
  return payload;
}

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

async function bitrixFirstPage(method: string, params: Record<string, unknown> = {}): Promise<any[]> {
  return asArray(await bitrix(method, { ...params, start: 0 }));
}

async function bitrixListCreatedSince(
  method: string,
  params: Record<string, unknown>,
  createdField: string,
  createdSince: string,
  createdBefore: string | null = null,
  onProgress?: (progress: BitrixListProgress) => Promise<void>,
): Promise<any[]> {
  const items: any[] = [];
  let start: number | null = 0;
  let page = 0;
  while (start !== null) {
    const payload = await bitrix(method, {
      ...params,
      order: { [createdField]: "DESC" },
      filter: {
        ...((params.filter as Record<string, unknown> | undefined) ?? {}),
        [`>=${createdField}`]: createdSince,
        ...(createdBefore ? { [`<${createdField}`]: createdBefore } : {}),
      },
      start,
    });
    const pageItems = asArray(payload);
    const relevantItems = pageItems.filter((item) => {
      const value = item[createdField] ?? item.CREATED_TIME;
      return !isBeforeDate(value, createdSince) && (!createdBefore || isBeforeDate(value, createdBefore));
    });
    items.push(...relevantItems);
    start = asNext(payload);
    page += 1;
    await onProgress?.({ method, page, pageItems: relevantItems.length, totalItems: items.length, next: start });
    if (pageItems.length > 0 && relevantItems.length === 0) break;
  }
  return items;
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

async function updateJob(jobId: string, payload: Record<string, unknown>) {
  await rest(`bitrix_sync_jobs?job_id=eq.${jobId}`, {
    method: "PATCH",
    body: JSON.stringify({ ...payload, updated_at: new Date().toISOString() }),
  });
}

async function expireStaleJobs() {
  const threshold = new Date(Date.now() - staleJobMinutes * 60 * 1000).toISOString();
  await rest(
    `bitrix_sync_jobs?status=eq.running&job_type=eq.marketing&updated_at=lt.${encodeURIComponent(threshold)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        status: "failed",
        finished_at: new Date().toISOString(),
        current_step: "expired",
        error_message: "Marketing sync expired after stale timeout.",
      }),
    },
  );
}

async function getActiveJob(): Promise<Job | null> {
  const rows = await rest(
    "bitrix_sync_jobs?select=job_id,status,processed_records,cursor&status=in.(pending,running)&job_type=eq.marketing&order=created_at.asc&limit=1",
  );
  return rows[0] ?? null;
}

async function syncStages(): Promise<Stage[]> {
  const rows = await bitrixList("crm.status.list", {
    order: { SORT: "ASC" },
    filter: { ENTITY_ID: "DEAL_STAGE" },
  });
  return rows
    .map((row) => ({
      stageId: String(row.STATUS_ID ?? ""),
      categoryId: Number(row.CATEGORY_ID ?? 0),
      name: String(row.NAME ?? row.STATUS_ID ?? ""),
      sortOrder: toNumber(row.SORT),
      semanticId: row.SEMANTICS == null ? null : String(row.SEMANTICS),
    }))
    .filter((stage) => [sourceCategoryId, outboundCategoryId].includes(stage.categoryId));
}

function mapDeal(rawItem: unknown, categoryId: number, lookups?: ChannelLookups): Deal | null {
  const item = rawItem as Record<string, unknown>;
  const id = pickString(item, ["id", "ID"]);
  if (!id) return null;
  const channel = resolveSourceChannel(item, categoryId, crm95ChannelField, lookups);
  const sourceChannel = categoryId === outboundCategoryId ? "OUTBOUND" : resolveRawSource(item, crm95ChannelField, lookups);
  return {
    id,
    categoryId: Number(item.categoryId ?? item.CATEGORY_ID ?? categoryId),
    title: pickString(item, ["title", "TITLE"]),
    stageId: pickString(item, ["stageId", "STAGE_ID"]),
    stageSemanticId: pickString(item, ["stageSemanticId", "STAGE_SEMANTIC_ID"]) || null,
    assignedById: pickString(item, ["assignedById", "ASSIGNED_BY_ID"]) || null,
    channel: normalizeChannel(channel),
    sourceChannel: sourceChannel || null,
    createdTime: pickString(item, ["createdTime", "CREATED_TIME"]) || null,
    updatedTime: pickString(item, ["updatedTime", "UPDATED_TIME"]) || null,
    movedTime: pickString(item, ["movedTime", "MOVED_TIME"]) || null,
    raw: item,
  };
}

function dealSelect(categoryId: number, debug = false): string[] {
  const baseSelect = [
    "id",
    "title",
    "categoryId",
    "stageId",
    "stageSemanticId",
    "assignedById",
    "createdTime",
    "updatedTime",
    "movedTime",
    "sourceId",
    "sourceDescription",
    "SOURCE_ID",
    "SOURCE_DESCRIPTION",
    ...(categoryId === sourceCategoryId && crm95ChannelField ? [crm95ChannelField] : []),
  ];
  return debug ? ["*", "UF_*"] : baseSelect;
}

async function fetchDeals(
  categoryId: number,
  options: {
    debug?: boolean;
    createdSince?: string | null;
    createdBefore?: string | null;
    onProgress?: (progress: BitrixListProgress) => Promise<void>;
  } = {},
  lookups?: ChannelLookups,
): Promise<Deal[]> {
  const debug = options.debug === true;
  const baseSelect = dealSelect(categoryId);
  const select = dealSelect(categoryId, debug);
  const filter = {
    categoryId,
    ...(options.createdSince ? { ">=createdTime": options.createdSince } : {}),
    ...(options.createdBefore ? { "<createdTime": options.createdBefore } : {}),
  };
  const listDeals = (requestedSelect: string[], requestedFilter: Record<string, unknown>) =>
    bitrixList("crm.item.list", {
      entityTypeId: 2,
      select: requestedSelect,
      filter: requestedFilter,
    });
  const listDealsSince = (requestedSelect: string[], createdField: string) =>
    bitrixListCreatedSince(
      "crm.item.list",
      {
        entityTypeId: 2,
        select: requestedSelect,
        filter: { categoryId },
      },
      createdField,
      options.createdSince!,
      options.createdBefore ?? null,
      options.onProgress,
    );

  let items: any[];
  try {
    items = options.createdSince ? await listDealsSince(select, "createdTime") : await listDeals(select, filter);
  } catch (error) {
    if (options.createdSince) {
      try {
        items = await listDealsSince(debug ? baseSelect : select, "CREATED_TIME");
      } catch (legacyError) {
        if (!debug) throw legacyError;
        items = await listDealsSince(baseSelect, "CREATED_TIME");
      }
    } else {
      if (!debug) throw error;
      items = await listDeals(baseSelect, filter);
    }
  }

  return items.map((rawItem) => mapDeal(rawItem, categoryId, lookups)).filter((deal): deal is Deal => deal !== null);
}

async function fetchDealsByIds(categoryId: number, ids: string[], lookups?: ChannelLookups): Promise<Deal[]> {
  const uniqueIds = [...new Set(ids)].filter(Boolean);
  const deals: Deal[] = [];
  for (const idPart of chunk(uniqueIds, 50)) {
    let items: any[];
    try {
      items = await bitrixList("crm.item.list", {
        entityTypeId: 2,
        select: dealSelect(categoryId),
        filter: { categoryId, id: idPart },
      });
    } catch {
      items = await bitrixList("crm.item.list", {
        entityTypeId: 2,
        select: dealSelect(categoryId),
        filter: { CATEGORY_ID: categoryId, ID: idPart },
      });
    }
    deals.push(...items.map((rawItem) => mapDeal(rawItem, categoryId, lookups)).filter((deal): deal is Deal => deal !== null));
  }
  return deals;
}

async function fetchDealsSample(categoryId: number, lookups?: ChannelLookups): Promise<Deal[]> {
  let items: any[];
  try {
    items = await bitrixFirstPage("crm.item.list", {
      entityTypeId: 2,
      select: ["*", "UF_*"],
      filter: { categoryId },
    });
  } catch {
    items = await bitrixFirstPage("crm.item.list", {
      entityTypeId: 2,
      select: [
        "id",
        "title",
        "categoryId",
        "stageId",
        "stageSemanticId",
        "assignedById",
        "createdTime",
        "updatedTime",
        "movedTime",
        "sourceId",
        "sourceDescription",
        "SOURCE_ID",
        "SOURCE_DESCRIPTION",
      ],
      filter: { categoryId },
    });
  }
  return items.slice(0, 10).map((rawItem) => mapDeal(rawItem, categoryId, lookups)).filter((deal): deal is Deal => deal !== null);
}

async function fetchDealFieldMetadata() {
  const payload = await bitrix("crm.deal.fields");
  const fields = payload?.result && typeof payload.result === "object" ? payload.result : {};
  return Object.entries(fields)
    .map(([key, value]) => {
      const field = value as Record<string, unknown>;
      return {
        key,
        title: field.title ?? field.formLabel ?? field.listLabel ?? field.filterLabel ?? null,
        type: field.type ?? null,
        isUserField: key.startsWith("UF_") || key.startsWith("uf"),
      };
    })
    .filter((field) => field.isUserField || normalizeText(field.title).includes("canal") || normalizeText(field.title).includes("fonte"))
    .slice(0, 120);
}

async function fetchChannelLookups(): Promise<ChannelLookups> {
  const sourceRows = await bitrixList("crm.status.list", {
    order: { SORT: "ASC" },
    filter: { ENTITY_ID: "SOURCE" },
  }).catch(() => []);
  const sources = new Map<string, string>();
  for (const rawSource of sourceRows) {
    const source = rawSource as Record<string, unknown>;
    const id = String(source.STATUS_ID ?? "");
    if (id) sources.set(id, String(source.NAME ?? id));
  }
  return { sources };
}

async function syncStageHistory(
  categoryId: number,
  startInclusive: string,
  endExclusive: string,
  onProgress?: (progress: BitrixListProgress) => Promise<void>,
): Promise<StageHistory[]> {
  const raw = await bitrixList(
    "crm.stagehistory.list",
    {
      entityTypeId: 2,
      order: { ID: "ASC" },
      filter: { ">=CREATED_TIME": startInclusive, "<CREATED_TIME": endExclusive, CATEGORY_ID: categoryId },
      select: ["ID", "OWNER_ID", "CREATED_TIME", "CATEGORY_ID", "STAGE_SEMANTIC_ID", "STAGE_ID"],
    },
    onProgress,
  );
  return raw
    .map((row) => ({
      id: String(row.ID ?? ""),
      dealId: String(row.OWNER_ID ?? ""),
      categoryId: Number(row.CATEGORY_ID ?? categoryId),
      stageId: String(row.STAGE_ID ?? ""),
      semanticId: row.STAGE_SEMANTIC_ID == null ? null : String(row.STAGE_SEMANTIC_ID),
      enteredAt: String(row.CREATED_TIME ?? ""),
    }))
    .filter((row) => Boolean(row.id && row.dealId && row.stageId && row.enteredAt));
}

function addCell(
  cells: Map<string, { quantity: number; numerator: number; denominator: number }>,
  year: number,
  month: number,
  metricKey: string,
  channel: string,
  contribution: { quantity?: number; numerator?: number; denominator?: number },
) {
  const key = `${year}|${month}|${metricKey}|${normalizeChannel(channel)}`;
  const cell = cells.get(key) ?? { quantity: 0, numerator: 0, denominator: 0 };
  cell.quantity += contribution.quantity ?? 0;
  cell.numerator += contribution.numerator ?? 0;
  cell.denominator += contribution.denominator ?? 0;
  cells.set(key, cell);
}

function addItem(
  items: Record<string, unknown>[],
  year: number,
  month: number,
  metricKey: string,
  deal: Deal,
  eventDate: string | null,
  stageId: string | null,
  contribution: { quantity?: number; numerator?: number; denominator?: number },
) {
  items.push({
    reference_year: year,
    reference_month: month,
    metric_key: metricKey,
    channel: deal.channel,
    bitrix_deal_id: deal.id,
    category_id: deal.categoryId,
    event_date: eventDate,
    stage_id: stageId,
    quantity_contribution: contribution.quantity ?? null,
    numerator_contribution: contribution.numerator ?? null,
    denominator_contribution: contribution.denominator ?? null,
  });
}

async function persistDeals(deals: Deal[]) {
  await upsert(
    "bitrix_marketing_deals",
    deals.map((deal) => ({
      bitrix_deal_id: deal.id,
      category_id: deal.categoryId,
      title: deal.title,
      stage_id: deal.stageId,
      stage_semantic_id: deal.stageSemanticId,
      channel: deal.channel,
      source_channel: deal.sourceChannel,
      assigned_by_id: deal.assignedById,
      created_time: deal.createdTime,
      updated_time: deal.updatedTime,
      moved_time: deal.movedTime,
      synced_at: new Date().toISOString(),
    })),
    "bitrix_deal_id",
  );
}

async function persistHistory(history: StageHistory[]) {
  await upsert(
    "bitrix_marketing_stage_history",
    history.map((row) => ({
      bitrix_history_id: row.id,
      bitrix_deal_id: row.dealId,
      category_id: row.categoryId,
      stage_id: row.stageId,
      stage_semantic_id: row.semanticId,
      entered_at: row.enteredAt,
      imported_at: new Date().toISOString(),
    })),
    "bitrix_history_id",
  );
}

function addWonContributions(
  deal: Deal,
  histories: StageHistory[],
  window: { year: number; month: number; start: string; end: string },
  cells: Map<string, { quantity: number; numerator: number; denominator: number }>,
  items: Record<string, unknown>[],
) {
  const wonRows = histories
    .filter((row) => isWonStage(row.stageId, row.semanticId))
    .sort((left, right) => (timestamp(left.enteredAt) ?? 0) - (timestamp(right.enteredAt) ?? 0));
  const wonEvent = wonRows[0];
  const fallbackEvent = !wonEvent && isWonStage(deal.stageId, deal.stageSemanticId) && isWithinRange(deal.movedTime, window.start, window.end)
    ? { enteredAt: deal.movedTime, stageId: deal.stageId }
    : null;
  const eventDate = wonEvent?.enteredAt ?? fallbackEvent?.enteredAt ?? null;
  const stageId = wonEvent?.stageId ?? fallbackEvent?.stageId ?? null;
  const parts = yearMonthSaoPaulo(eventDate);
  if (!parts || parts.year !== window.year || parts.month !== window.month || !isWithinRange(eventDate, window.start, window.end)) return;

  addCell(cells, parts.year, parts.month, "scheduled_meetings", deal.channel, { quantity: 1 });
  addCell(cells, parts.year, parts.month, "conversion_rate", deal.channel, { numerator: 1 });
  addItem(items, parts.year, parts.month, "scheduled_meetings", deal, eventDate, stageId, { quantity: 1 });
  addItem(items, parts.year, parts.month, "conversion_rate", deal, eventDate, stageId, { numerator: 1 });
}

function mergeDeals(...groups: Deal[][]): Deal[] {
  const byId = new Map<string, Deal>();
  for (const group of groups) {
    for (const deal of group) byId.set(deal.id, deal);
  }
  return [...byId.values()];
}

function wonDealIdsByCategory(history: StageHistory[]): Map<number, string[]> {
  const byCategory = new Map<number, Set<string>>();
  for (const row of history) {
    if (!isWonStage(row.stageId, row.semanticId)) continue;
    if (!byCategory.has(row.categoryId)) byCategory.set(row.categoryId, new Set());
    byCategory.get(row.categoryId)!.add(row.dealId);
  }
  return new Map([...byCategory.entries()].map(([categoryId, ids]) => [categoryId, [...ids]]));
}

async function rebuildMonthlyAggregates(
  deals: Deal[],
  history: StageHistory[],
  window: { year: number; month: number; start: string; end: string },
) {
  const cells = new Map<string, { quantity: number; numerator: number; denominator: number }>();
  const items: Record<string, unknown>[] = [];

  for (const deal of deals) {
    const parts = yearMonthSaoPaulo(deal.createdTime);
    if (!parts || parts.year !== window.year || parts.month !== window.month || !isWithinRange(deal.createdTime, window.start, window.end)) {
      continue;
    }
    addCell(cells, parts.year, parts.month, "leads_generated", deal.channel, { quantity: 1 });
    addCell(cells, parts.year, parts.month, "conversion_rate", deal.channel, { denominator: 1 });
    addItem(items, parts.year, parts.month, "leads_generated", deal, deal.createdTime, "created", { quantity: 1 });
    addItem(items, parts.year, parts.month, "conversion_rate", deal, deal.createdTime, "denominator", { denominator: 1 });
  }

  const historyByDeal = new Map<string, StageHistory[]>();
  for (const row of history) {
    if (!historyByDeal.has(row.dealId)) historyByDeal.set(row.dealId, []);
    historyByDeal.get(row.dealId)!.push(row);
  }

  for (const deal of deals) {
    addWonContributions(deal, historyByDeal.get(deal.id) ?? [], window, cells, items);
  }

  await deleteRows("marketing_drilldown_monthly", {
    reference_year: `eq.${window.year}`,
    reference_month: `eq.${window.month}`,
  });
  await deleteRows("marketing_drilldown_items", {
    reference_year: `eq.${window.year}`,
    reference_month: `eq.${window.month}`,
  });

  await insertRows(
    "marketing_drilldown_monthly",
    [...cells.entries()].map(([key, cell]) => {
      const [year, month, metric, channel] = key.split("|");
      return {
        reference_year: Number(year),
        reference_month: Number(month),
        metric_key: metric,
        channel,
        quantity_value: metric === "conversion_rate" ? null : cell.quantity,
        numerator_value: metric === "conversion_rate" ? cell.numerator : null,
        denominator_value: metric === "conversion_rate" ? cell.denominator : null,
        percentage_value: metric === "conversion_rate" && cell.denominator > 0 ? (cell.numerator / cell.denominator) * 100 : null,
        calculated_at: new Date().toISOString(),
      };
    }),
  );
  await insertRows("marketing_drilldown_items", items);
  return { cells: cells.size, items: items.length, years: [window.year], month: window.month };
}

async function debugPayload() {
  let currentStep = "sync_stages";
  try {
    const stages = await syncStages();
    currentStep = "fetch_deal_field_metadata";
    const dealFields = await fetchDealFieldMetadata().catch((error) => ([{
      key: "__metadata_error__",
      title: error instanceof Error ? error.message : String(error),
      type: null,
      isUserField: false,
    }]));
    const lookups = await fetchChannelLookups().catch(() => undefined);
    currentStep = "fetch_crm95_sample";
    const sourceDeals = await fetchDealsSample(sourceCategoryId, lookups);
    currentStep = "fetch_crm125_sample";
    const outboundDeals = await fetchDealsSample(outboundCategoryId, lookups);
    currentStep = "build_payload";
    return {
      sourceCategoryId,
      outboundCategoryId,
      crm95ChannelField,
      createdSince,
      syncSince,
      dealFields,
      stages,
      wonStages: stages.filter((stage) => isWonStage(stage.stageId, stage.semanticId)),
      samples: {
        crm95: {
          count: sourceDeals.length,
          sampleKeys: sourceDeals[0] ? Object.keys(sourceDeals[0].raw).slice(0, 80) : [],
          sampleItems: sourceDeals.map((deal) => ({
            id: deal.id,
            title: deal.title,
            channel: deal.channel,
            sourceChannel: deal.sourceChannel,
            stageId: deal.stageId,
            stageSemanticId: deal.stageSemanticId,
          })),
        },
        crm125: {
          count: outboundDeals.length,
          sampleKeys: outboundDeals[0] ? Object.keys(outboundDeals[0].raw).slice(0, 80) : [],
          sampleItems: outboundDeals.map((deal) => ({
            id: deal.id,
            title: deal.title,
            channel: deal.channel,
            sourceChannel: deal.sourceChannel,
            stageId: deal.stageId,
            stageSemanticId: deal.stageSemanticId,
          })),
        },
      },
    };
  } catch (error) {
    return {
      processed: false,
      debug: true,
      step: currentStep,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function debugTargetPayload(target: string) {
  const lookups = target === "fields" || target === "crm95" || target === "crm125" ? await fetchChannelLookups() : undefined;
  if (target === "stages") {
    const stages = await syncStages();
    return { debug: true, target, stages, wonStages: stages.filter((stage) => isWonStage(stage.stageId, stage.semanticId)) };
  }
  if (target === "fields") {
    return {
      debug: true,
      target,
      crm95ChannelField,
      sourceOptions: [...(lookups?.sources.entries() ?? [])].map(([id, label]) => ({ id, label })),
      dealFields: await fetchDealFieldMetadata(),
    };
  }
  if (target === "crm95") {
    const sourceDeals = await fetchDealsSample(sourceCategoryId, lookups);
    return {
      debug: true,
      target,
      sourceCategoryId,
      crm95ChannelField,
      createdSince,
      count: sourceDeals.length,
      sampleKeys: sourceDeals[0] ? Object.keys(sourceDeals[0].raw).slice(0, 100) : [],
      sampleItems: sourceDeals.map((deal) => Object.fromEntries(Object.entries(deal.raw).slice(0, 30))),
      resolvedChannels: sourceDeals.map((deal) => ({
        id: deal.id,
        title: deal.title,
        channel: deal.channel,
        sourceChannel: deal.sourceChannel,
      })),
    };
  }
  if (target === "crm125" || target === "outbound") {
    const outboundDeals = await fetchDealsSample(outboundCategoryId, lookups);
    return {
      debug: true,
      target,
      outboundCategoryId,
      count: outboundDeals.length,
      sampleKeys: outboundDeals[0] ? Object.keys(outboundDeals[0].raw).slice(0, 100) : [],
      sampleItems: outboundDeals.map((deal) => Object.fromEntries(Object.entries(deal.raw).slice(0, 30))),
      resolvedChannels: outboundDeals.map((deal) => ({
        id: deal.id,
        title: deal.title,
        channel: deal.channel,
        sourceChannel: deal.sourceChannel,
      })),
    };
  }
  return {
    debug: true,
    target,
    detail: "Use target=stages, fields, crm95, crm125 or outbound.",
  };
}

Deno.serve(async (request) => {
  let job: Job | null = null;
  try {
    const url = new URL(request.url);
    if (request.method === "GET") {
      const target = url.searchParams.get("target") ?? "stages";
      return json(await debugTargetPayload(target));
    }
    if (request.method !== "POST") return json({ detail: "expected POST" }, 405);
    if (!supabaseUrl || !serviceRoleKey) return json({ detail: "Supabase secrets missing" }, 500);
    if (!bitrixWebhookUrl) return json({ detail: "BITRIX_WEBHOOK_URL secret is missing." }, 500);

    const body = request.headers.get("content-type")?.includes("application/json")
      ? await request.json().catch(() => ({}))
      : {};
    if (body?.debug === true) return json(await debugPayload());

    await expireStaleJobs();
    job = await getActiveJob();
    if (!job) return json({ processed: false, detail: "no pending marketing job" });

    const currentMonth = currentSaoPauloMonth();
    const endExclusive = nextMonthStartIso(currentMonth.year, currentMonth.month);
    const month = monthFromCursor(job.cursor?.marketingNextMonth);
    const monthStart = monthStartIso(month.year, month.month);
    const monthEnd = nextMonthStartIso(month.year, month.month);

    if (!isBeforeDate(monthStart, endExclusive)) {
      await updateJob(job.job_id, {
        status: "completed",
        current_step: "completed",
        processed_records: job.processed_records,
        total_records: job.processed_records,
        cursor: {
          ...(job.cursor ?? {}),
          syncedAt: new Date().toISOString(),
          completedThroughMonth: monthStartIso(currentMonth.year, currentMonth.month),
        },
        finished_at: new Date().toISOString(),
      });
      return json({ processed: true, jobId: job.job_id, detail: "marketing sync already complete for current month" });
    }

    const baseProcessedRecords = job.processed_records ?? 0;
    await updateJob(job.job_id, {
      status: "running",
      ...(job.status === "pending" ? { started_at: new Date().toISOString() } : {}),
      current_step: `sync_month_${month.year}_${pad2(month.month)}_stages`,
      cursor: {
        ...(job.cursor ?? {}),
        marketingCurrentMonth: monthStart,
        marketingNextMonth: monthStart,
        syncEndExclusive: endExclusive,
      },
    });
    const stages = await syncStages();
    const lookups = await fetchChannelLookups();

    await updateJob(job.job_id, { current_step: `sync_month_${month.year}_${pad2(month.month)}_crm95_created_deals` });
    const sourceCreatedDeals = await fetchDeals(
      sourceCategoryId,
      {
        createdSince: monthStart,
        createdBefore: monthEnd,
        onProgress: async (progress) => {
          await updateJob(job!.job_id, {
            current_step: `sync_month_${month.year}_${pad2(month.month)}_crm95_created_deals`,
            processed_records: baseProcessedRecords + progress.totalItems,
            cursor: {
              ...(job!.cursor ?? {}),
              marketingCurrentMonth: monthStart,
              marketingNextMonth: monthStart,
              sourceDealsFetched: progress.totalItems,
              sourceDealsPage: progress.page,
              sourceDealsNext: progress.next,
            },
          });
        },
      },
      lookups,
    );

    await updateJob(job.job_id, {
      current_step: `sync_month_${month.year}_${pad2(month.month)}_crm125_created_deals`,
      processed_records: baseProcessedRecords + sourceCreatedDeals.length,
    });
    const outboundCreatedDeals = await fetchDeals(
      outboundCategoryId,
      {
        createdSince: monthStart,
        createdBefore: monthEnd,
        onProgress: async (progress) => {
          await updateJob(job!.job_id, {
            current_step: `sync_month_${month.year}_${pad2(month.month)}_crm125_created_deals`,
            processed_records: baseProcessedRecords + sourceCreatedDeals.length + progress.totalItems,
            cursor: {
              ...(job!.cursor ?? {}),
              marketingCurrentMonth: monthStart,
              marketingNextMonth: monthStart,
              outboundDealsFetched: progress.totalItems,
              outboundDealsPage: progress.page,
              outboundDealsNext: progress.next,
            },
          });
        },
      },
      lookups,
    );

    await updateJob(job.job_id, {
      current_step: `sync_month_${month.year}_${pad2(month.month)}_crm95_stage_history`,
      processed_records: baseProcessedRecords + sourceCreatedDeals.length + outboundCreatedDeals.length,
    });
    const sourceHistory = await syncStageHistory(sourceCategoryId, monthStart, monthEnd, async (progress) => {
      await updateJob(job!.job_id, {
        current_step: `sync_month_${month.year}_${pad2(month.month)}_crm95_stage_history`,
        processed_records: baseProcessedRecords + sourceCreatedDeals.length + outboundCreatedDeals.length + progress.totalItems,
        cursor: {
          ...(job!.cursor ?? {}),
          marketingCurrentMonth: monthStart,
          marketingNextMonth: monthStart,
          sourceHistoryFetched: progress.totalItems,
          sourceHistoryPage: progress.page,
          sourceHistoryNext: progress.next,
        },
      });
    });

    await updateJob(job.job_id, {
      current_step: `sync_month_${month.year}_${pad2(month.month)}_crm125_stage_history`,
      processed_records: baseProcessedRecords + sourceCreatedDeals.length + outboundCreatedDeals.length + sourceHistory.length,
    });
    const outboundHistory = await syncStageHistory(outboundCategoryId, monthStart, monthEnd, async (progress) => {
      await updateJob(job!.job_id, {
        current_step: `sync_month_${month.year}_${pad2(month.month)}_crm125_stage_history`,
        processed_records: baseProcessedRecords + sourceCreatedDeals.length + outboundCreatedDeals.length + sourceHistory.length + progress.totalItems,
        cursor: {
          ...(job!.cursor ?? {}),
          marketingCurrentMonth: monthStart,
          marketingNextMonth: monthStart,
          outboundHistoryFetched: progress.totalItems,
          outboundHistoryPage: progress.page,
          outboundHistoryNext: progress.next,
        },
      });
    });

    const history = [...sourceHistory, ...outboundHistory];
    const createdDeals = mergeDeals(sourceCreatedDeals, outboundCreatedDeals);
    const createdDealIds = new Set(createdDeals.map((deal) => deal.id));
    const wonIds = wonDealIdsByCategory(history);
    const missingSourceWonIds = (wonIds.get(sourceCategoryId) ?? []).filter((id) => !createdDealIds.has(id));
    const missingOutboundWonIds = (wonIds.get(outboundCategoryId) ?? []).filter((id) => !createdDealIds.has(id));

    await updateJob(job.job_id, {
      current_step: `sync_month_${month.year}_${pad2(month.month)}_won_deal_details`,
      processed_records: baseProcessedRecords + sourceCreatedDeals.length + outboundCreatedDeals.length + history.length,
      cursor: {
        ...(job.cursor ?? {}),
        marketingCurrentMonth: monthStart,
        marketingNextMonth: monthStart,
        missingSourceWonDeals: missingSourceWonIds.length,
        missingOutboundWonDeals: missingOutboundWonIds.length,
      },
    });
    const sourceWonDeals = await fetchDealsByIds(sourceCategoryId, missingSourceWonIds, lookups);
    const outboundWonDeals = await fetchDealsByIds(outboundCategoryId, missingOutboundWonIds, lookups);
    const deals = mergeDeals(createdDeals, sourceWonDeals, outboundWonDeals);
    const dealMap = new Map(deals.map((deal) => [deal.id, deal]));
    const relevantHistory = history.filter((row) => dealMap.has(row.dealId));

    await persistDeals(deals);
    await persistHistory(relevantHistory);

    await updateJob(job.job_id, { current_step: `sync_month_${month.year}_${pad2(month.month)}_rebuild_aggregates` });
    const result = await rebuildMonthlyAggregates(deals, relevantHistory, {
      year: month.year,
      month: month.month,
      start: monthStart,
      end: monthEnd,
    });

    const monthRecords = deals.length + relevantHistory.length;
    const nextMonth = nextMonthStartIso(month.year, month.month);
    const isComplete = !isBeforeDate(nextMonth, endExclusive);
    const nextCursor = {
      ...(job.cursor ?? {}),
      syncedAt: new Date().toISOString(),
      sourceCategoryId,
      outboundCategoryId,
      crm95ChannelField,
      createdSince,
      syncSince,
      syncEndExclusive: endExclusive,
      marketingCurrentMonth: monthStart,
      marketingNextMonth: nextMonth,
      sourceCreatedDeals: sourceCreatedDeals.length,
      outboundCreatedDeals: outboundCreatedDeals.length,
      sourceWonDeals: sourceWonDeals.length,
      outboundWonDeals: outboundWonDeals.length,
      stageHistory: relevantHistory.length,
      wonStageIds: stages.filter((stage) => isWonStage(stage.stageId, stage.semanticId)).map((stage) => stage.stageId),
      ...result,
    };

    await updateJob(job.job_id, {
      status: isComplete ? "completed" : "running",
      current_step: isComplete ? "completed" : `waiting_next_month_${nextMonth.slice(0, 7)}`,
      processed_records: baseProcessedRecords + monthRecords,
      total_records: isComplete ? baseProcessedRecords + monthRecords : null,
      cursor: nextCursor,
      ...(isComplete ? { finished_at: new Date().toISOString() } : {}),
    });
    return json({
      processed: true,
      jobId: job.job_id,
      status: isComplete ? "completed" : "running",
      processedMonth: monthStart.slice(0, 7),
      nextMonth: isComplete ? null : nextMonth.slice(0, 7),
      sourceDeals: sourceCreatedDeals.length + sourceWonDeals.length,
      outboundDeals: outboundCreatedDeals.length + outboundWonDeals.length,
      stageHistory: relevantHistory.length,
      sourceCategoryId,
      outboundCategoryId,
      crm95ChannelField,
      createdSince,
      syncSince,
      ...result,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (job) {
      await updateJob(job.job_id, {
        status: "failed",
        current_step: "failed",
        finished_at: new Date().toISOString(),
        error_message: detail,
      }).catch(() => undefined);
    }
    return json({ processed: false, jobId: job?.job_id, detail }, 500);
  }
});
