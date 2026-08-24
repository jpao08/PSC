// Supabase Edge Function for PSC Financial Units synchronization.
// Runs outside Vercel; PSC clients read the materialized `units` table.

type UnitRow = {
  name: string;
  bitrix_spa_item_id: string;
  bitrix_entity_type_id: number;
  bitrix_category_id: number;
  is_active: boolean;
  last_synced_at: string;
};

type SyncOptions = {
  debug: boolean;
  filterByCategory: boolean;
};

type FetchResult = {
  rows: UnitRow[];
  fetched: number;
  sampleKeys: string[];
  sampleItem: Record<string, unknown> | null;
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const bitrixWebhookUrl = Deno.env.get("BITRIX_WEBHOOK_URL") ?? "";
const entityTypeId = Number(Deno.env.get("FINANCIAL_UNITS_ENTITY_TYPE_ID") ?? "1070");
const categoryId = Number(Deno.env.get("FINANCIAL_UNITS_CATEGORY_ID") ?? "0");
const nameField = Deno.env.get("FINANCIAL_UNITS_NAME_FIELD") ?? "";
const activeField = Deno.env.get("FINANCIAL_UNITS_ACTIVE_FIELD") ?? "";
const defaultFilterByCategory = (Deno.env.get("FINANCIAL_UNITS_FILTER_BY_CATEGORY") ?? "false").toLowerCase() === "true";
const deactivateMissing = (Deno.env.get("FINANCIAL_UNITS_DEACTIVATE_MISSING") ?? "true").toLowerCase() !== "false";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
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

function parseBool(value: unknown, fallback = true): boolean {
  if (value == null || value === "") return fallback;
  return value === true || value === "Y" || value === "y" || value === "true" || value === 1 || value === "1";
}

function pickString(item: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = item[key];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return "";
}

async function supabaseRest(path: string, init: RequestInit = {}) {
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
  return JSON.parse(text);
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
  if (payload?.error) throw new Error(`Bitrix ${method}: ${payload.error_description ?? payload.error}`);
  return payload;
}

async function bitrixList(method: string, params: Record<string, unknown> = {}): Promise<any[]> {
  const items: any[] = [];
  let start: number | null = 0;
  while (start !== null) {
    const payload = await bitrix(method, { ...params, start });
    items.push(...asArray(payload));
    start = asNext(payload);
  }
  return items;
}

async function fetchFinancialUnits(options: SyncOptions): Promise<FetchResult> {
  const select = [
    "id",
    "title",
    "categoryId",
    "stageId",
    "createdTime",
    "updatedTime",
    ...(nameField ? [nameField] : []),
    ...(activeField ? [activeField] : []),
  ];
  const params: Record<string, unknown> = {
    entityTypeId,
    select,
  };
  if (options.filterByCategory) params.filter = { categoryId };
  const items = await bitrixList("crm.item.list", params);
  const syncedAt = new Date().toISOString();
  const rows = new Map<string, UnitRow>();
  for (const rawItem of items) {
    const item = rawItem as Record<string, unknown>;
    const id = pickString(item, ["id", "ID"]);
    if (!id) continue;
    const explicitNameKeys = nameField ? [nameField] : [];
    const name = pickString(item, [...explicitNameKeys, "title", "TITLE", "name", "NAME"]) || `Unidade ${id}`;
    const isActive = activeField ? parseBool(item[activeField], true) : true;
    rows.set(id, {
      name,
      bitrix_spa_item_id: id,
      bitrix_entity_type_id: entityTypeId,
      bitrix_category_id: Number(item.categoryId ?? item.CATEGORY_ID ?? categoryId),
      is_active: isActive,
      last_synced_at: syncedAt,
    });
  }
  const sampleItem = (items[0] as Record<string, unknown> | undefined) ?? null;
  return {
    rows: [...rows.values()],
    fetched: items.length,
    sampleKeys: sampleItem ? Object.keys(sampleItem).slice(0, 40) : [],
    sampleItem: options.debug && sampleItem ? Object.fromEntries(Object.entries(sampleItem).slice(0, 20)) : null,
  };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ detail: "expected POST" }, 405);
  if (!supabaseUrl || !serviceRoleKey) return json({ detail: "Supabase secrets missing" }, 500);
  if (!bitrixWebhookUrl) return json({ detail: "BITRIX_WEBHOOK_URL secret is missing" }, 500);

  try {
    const body = request.headers.get("content-type")?.includes("application/json")
      ? await request.json().catch(() => ({}))
      : {};
    const options: SyncOptions = {
      debug: body?.debug === true,
      filterByCategory: body?.filterByCategory ?? defaultFilterByCategory,
    };
    const result = await fetchFinancialUnits(options);
    const rows = result.rows;
    if (rows.length > 0) {
      await supabaseRest("units?on_conflict=bitrix_spa_item_id", {
        method: "POST",
        body: JSON.stringify(rows),
      });
    }

    let deactivated = 0;
    if (deactivateMissing) {
      const activeIds = rows.map((row) => row.bitrix_spa_item_id);
      const existing = await supabaseRest(
        `units?select=bitrix_spa_item_id&bitrix_entity_type_id=eq.${entityTypeId}&bitrix_category_id=eq.${categoryId}&is_active=eq.true`,
      );
      const missing = (existing as Array<{ bitrix_spa_item_id: string }>)
        .map((row) => row.bitrix_spa_item_id)
        .filter((id) => !activeIds.includes(id));
      if (missing.length > 0) {
        await supabaseRest(
          `units?bitrix_spa_item_id=in.(${missing.map(encodeURIComponent).join(",")})`,
          {
            method: "PATCH",
            body: JSON.stringify({ is_active: false, last_synced_at: new Date().toISOString() }),
          },
        );
        deactivated = missing.length;
      }
    }

    return json({
      processed: true,
      entityTypeId,
      categoryId,
      filterByCategory: options.filterByCategory,
      fetched: result.fetched,
      mapped: rows.length,
      upserted: rows.length,
      deactivated,
      sampleKeys: options.debug ? result.sampleKeys : undefined,
      sampleItem: options.debug ? result.sampleItem : undefined,
    });
  } catch (error) {
    return json({
      processed: false,
      entityTypeId,
      categoryId,
      detail: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
