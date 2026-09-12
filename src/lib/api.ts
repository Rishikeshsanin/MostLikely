import type { Pack, RoomState } from "./types";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./supabase-public";

export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: string; code?: string; details?: unknown };

export async function gameApi<T>(payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/most_likely-game-api`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "x-client-info": "mostlikely-web"
    },
    cache: "no-store",
    body: JSON.stringify(payload)
  });
  const json = (await response.json().catch(() => ({ ok: false, error: "Unexpected server response." }))) as ApiResponse<T>;
  if (!response.ok || !json.ok) {
    throw new Error(json.ok ? "Request failed." : json.error || "Request failed.");
  }
  return json.data;
}

export async function createRoom(name: string) {
  return gameApi<{ code: string; playerId: string; token: string; name: string }>({ op: "create", name });
}

export async function joinRoom(code: string, name: string) {
  return gameApi<{ code: string; playerId: string; token: string; name: string }>({ op: "join", code, name });
}

export async function getRoomState(code: string, token: string) {
  return gameApi<RoomState>({ op: "state", code, token });
}

export async function roomAction(
  code: string,
  token: string,
  action: string,
  data: Record<string, unknown> = {}
) {
  return gameApi<{ state?: RoomState }>({ op: action, code, token, ...data });
}

export async function configureRoom(
  code: string,
  token: string,
  pack: Pack,
  customQuestions: RoomState["room"]["customQuestions"]
) {
  return roomAction(code, token, "configure", { pack, customQuestions });
}
