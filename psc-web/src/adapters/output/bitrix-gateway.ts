import { BitrixGatewayPort } from "@/core/ports/repositories";
import { BitrixUser } from "@/core/domain/models";
import { getConfig } from "@/infra/env";

type AnyRecord = Record<string, unknown>;

function normalizeBitrixUser(row: AnyRecord, portalDomain: string | null = null): BitrixUser | null {
  const rawId = row.ID ?? row.id;
  if (rawId == null) return null;
  const firstName = String(row.NAME ?? row.name ?? "").trim();
  const lastName = String(row.LAST_NAME ?? row.last_name ?? "").trim();
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim() || String(rawId);
  const rawEmail = row.EMAIL ?? row.email;
  return {
    id: String(rawId),
    name: fullName,
    email: rawEmail ? String(rawEmail).trim() : null,
    portalDomain
  };
}

function bitrixRestBase(portalDomain: string | null): string {
  if (!portalDomain) return "https://oauth.bitrix.info/rest/";
  const clean = portalDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return `https://${clean}/rest/`;
}

export class BitrixGateway implements BitrixGatewayPort {
  async exchangeCode(code: string, redirectUri: string) {
    const config = getConfig();
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.bitrixClientId,
      client_secret: config.bitrixClientSecret,
      redirect_uri: redirectUri,
      code
    });
    const response = await fetch(config.bitrixTokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params
    });
    if (!response.ok) throw new Error("Falha ao trocar codigo OAuth do Bitrix.");
    const payload = (await response.json()) as AnyRecord;
    const clientEndpoint = payload.client_endpoint ? String(payload.client_endpoint) : "";
    const endpointHost = clientEndpoint ? new URL(clientEndpoint).host : null;
    const rawDomain = payload.domain ? String(payload.domain) : null;
    const portalDomain = endpointHost ?? (rawDomain && rawDomain !== "oauth.bitrix.info" ? rawDomain : null);
    return {
      accessToken: String(payload.access_token ?? ""),
      refreshToken: payload.refresh_token ? String(payload.refresh_token) : null,
      portalDomain
    };
  }

  async getCurrentUser(accessToken: string, portalDomain: string | null): Promise<BitrixUser> {
    const url = new URL("user.current.json", bitrixRestBase(portalDomain));
    url.searchParams.set("auth", accessToken);
    const response = await fetch(url);
    if (!response.ok) throw new Error("Falha ao ler usuario atual do Bitrix.");
    const payload = (await response.json()) as AnyRecord;
    const result = payload.result;
    const user = result && typeof result === "object" ? normalizeBitrixUser(result as AnyRecord, portalDomain) : null;
    if (!user) throw new Error("Resposta de usuario Bitrix invalida.");
    return user;
  }

  async searchUsers(query: string, limit: number): Promise<BitrixUser[]> {
    const config = getConfig();
    const cleanQuery = query.trim();
    if (!cleanQuery || !config.bitrixWebhookUrl) return [];
    const boundedLimit = Math.max(1, Math.min(limit, 20));
    const url = new URL(`${config.bitrixWebhookUrl.replace(/\/$/, "")}/user.search.json`);
    url.searchParams.set("filter[FIND]", cleanQuery);
    url.searchParams.set("filter[ACTIVE]", "Y");
    url.searchParams.set("select[0]", "ID");
    url.searchParams.set("select[1]", "NAME");
    url.searchParams.set("select[2]", "LAST_NAME");
    url.searchParams.set("select[3]", "EMAIL");
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error("Falha na busca de usuarios do Bitrix.");
    const payload = (await response.json()) as AnyRecord;
    const rows = Array.isArray(payload.result) ? payload.result : [];
    return rows
      .map((row) => (row && typeof row === "object" ? normalizeBitrixUser(row as AnyRecord) : null))
      .filter((item): item is BitrixUser => Boolean(item))
      .slice(0, boundedLimit);
  }

  async createTask(input: {
    title: string;
    description: string;
    responsibleBitrixUserId: string | null;
    dueDate: string | null;
  }): Promise<string | null> {
    const config = getConfig();
    if (!config.bitrixWebhookUrl) return null;
    const url = `${config.bitrixWebhookUrl.replace(/\/$/, "")}/tasks.task.add.json`;
    const fields: AnyRecord = {
      TITLE: input.title,
      DESCRIPTION: input.description
    };
    if (input.responsibleBitrixUserId) fields.RESPONSIBLE_ID = input.responsibleBitrixUserId;
    if (input.dueDate) fields.DEADLINE = `${input.dueDate}T18:00:00-03:00`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields })
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as AnyRecord;
    const result = payload.result;
    if (result && typeof result === "object") {
      const task = (result as AnyRecord).task;
      if (task && typeof task === "object" && (task as AnyRecord).id != null) return String((task as AnyRecord).id);
      if ((result as AnyRecord).id != null) return String((result as AnyRecord).id);
    }
    return result == null ? null : String(result);
  }
}
