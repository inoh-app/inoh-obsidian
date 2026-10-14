import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Tells Inoh's backend that a signed-in user opened the plugin, so PostHog can
 * count weekly active Obsidian users. The backend records it at most once per
 * user per day; the README's network use disclosure describes it.
 *
 * Reason: Obsidian's developer policies forbid client-side telemetry, so the
 * plugin never talks to PostHog itself. Failures are only logged, because a
 * missed count must never get in the way of highlighting.
 *
 * @param supabase - Signed-in Supabase client
 * @param pluginVersion - The installed release, from the plugin manifest
 */
export async function recordClientOpened(
  supabase: SupabaseClient,
  pluginVersion: string,
): Promise<void> {
  const { error } = await supabase.rpc("capture_client_opened", {
    p_client: "obsidian",
    p_client_version: pluginVersion,
  });
  if (error) {
    console.error("Inoh: could not record that the plugin opened", error);
  }
}
