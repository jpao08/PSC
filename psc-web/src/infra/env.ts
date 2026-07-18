export type AppConfig = {
  appUrl: string;
  sessionSecret: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  bitrixClientId: string;
  bitrixClientSecret: string;
  bitrixPortalUrl: string;
  bitrixTokenUrl: string;
  bitrixWebhookUrl: string;
};

export function getConfig(): AppConfig {
  return {
    appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    sessionSecret: process.env.APP_SESSION_SECRET || "change-me-with-at-least-32-characters",
    supabaseUrl: process.env.SUPABASE_URL || "",
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    bitrixClientId: process.env.BITRIX_CLIENT_ID || "",
    bitrixClientSecret: process.env.BITRIX_CLIENT_SECRET || "",
    bitrixPortalUrl: process.env.BITRIX_PORTAL_URL || "",
    bitrixTokenUrl: process.env.BITRIX_OAUTH_TOKEN_URL || "https://oauth.bitrix.info/oauth/token/",
    bitrixWebhookUrl: process.env.BITRIX_WEBHOOK_URL || ""
  };
}
