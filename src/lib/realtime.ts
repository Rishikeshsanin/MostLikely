import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./supabase-public";

let client: ReturnType<typeof createClient> | null = null;

function getClient() {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
  }
  return client;
}

export function subscribeToRoom(code: string, onChange: () => void): () => void {
  const supabase = getClient();
  let channel: RealtimeChannel | null = supabase.channel(`most_likely:room:${code.toUpperCase()}`, {
    config: { private: false, broadcast: { self: false } }
  });
  channel.on("broadcast", { event: "state_changed" }, () => onChange()).subscribe();
  return () => {
    if (channel) void supabase.removeChannel(channel);
    channel = null;
  };
}
