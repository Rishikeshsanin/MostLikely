export type StoredSession = { code: string; playerId: string; token: string; name: string };

export function sessionKey(code: string) {
  return `mostlikely:session:${code.toUpperCase()}`;
}

export function saveSession(session: StoredSession) {
  if (typeof window === "undefined") return;
  localStorage.setItem(sessionKey(session.code), JSON.stringify(session));
}

export function loadSession(code: string): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(sessionKey(code));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed.token || !parsed.playerId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSession(code: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(sessionKey(code));
}
