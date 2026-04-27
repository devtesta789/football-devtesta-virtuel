import { supabase } from "@/integrations/supabase/client";

interface UserConfig {
  eventCategoryId: string | null;
  leagueId: string;
  defaultSeason: string | null;
}

const DEFAULT: UserConfig = {
  eventCategoryId: null,
  leagueId: "8035",
  defaultSeason: null,
};

let configCache: UserConfig | null = null;

async function getUserId(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

export async function getUserConfig(): Promise<UserConfig> {
  if (configCache) return configCache;
  const userId = await getUserId();
  if (!userId) return { ...DEFAULT };

  const { data } = await supabase
    .from("user_config")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) {
    await supabase.from("user_config").insert({ user_id: userId, league_id: DEFAULT.leagueId });
    configCache = { ...DEFAULT };
    return configCache;
  }

  configCache = {
    eventCategoryId: data.event_category_id,
    leagueId: data.league_id,
    defaultSeason: data.default_season,
  };
  return configCache;
}

export async function updateUserConfig(patch: Partial<UserConfig>): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;
  const current = await getUserConfig();
  const updated = { ...current, ...patch };
  await supabase.from("user_config").upsert(
    {
      user_id: userId,
      event_category_id: updated.eventCategoryId,
      league_id: updated.leagueId,
      default_season: updated.defaultSeason,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  configCache = updated;
}

export async function setEventCategoryId(id: string): Promise<void> {
  await updateUserConfig({ eventCategoryId: id });
}

export function clearUserConfigCache() {
  configCache = null;
}
