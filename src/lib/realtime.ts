import { createClient, type RealtimeChannel } from "@supabase/supabase-js";

let client: ReturnType<typeof createClient> | null = null;

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
  }
  return client;
}

export function subscribeToRoom(code: string, onChange: () => void): () => void {
  const supabase = getClient();
  if (!supabase) return () => undefined;
  let channel: RealtimeChannel | null = supabase.channel(`most_likely:room:${code.toUpperCase()}`, {
    config: { private: false, broadcast: { self: false } }
  });
  channel.on("broadcast", { event: "state_changed" }, () => onChange()).subscribe();
  return () => {
    if (channel) void supabase.removeChannel(channel);
    channel = null;
  };
}
