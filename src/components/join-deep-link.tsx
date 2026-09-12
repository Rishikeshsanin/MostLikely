"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { joinRoom } from "@/lib/api";
import { loadSession, saveSession } from "@/lib/session";

export function JoinDeepLink({ code }: { code: string }) {
  const router = useRouter();
  const cleanCode = code.replace(/\D/g, "").slice(0, 4);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (loadSession(cleanCode)) router.replace(`/room/${cleanCode}`);
  }, [cleanCode, router]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const session = await joinRoom(cleanCode, name.trim());
      saveSession({ ...session, code: session.code });
      router.replace(`/room/${session.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not join the room.");
    } finally { setBusy(false); }
  }

  return (
    <main className="shell center-page">
      <form className="card card-pad stack-lg" onSubmit={submit}>
        <div className="row"><div className="brand-mark">W?</div><div><div className="eyebrow">You&apos;re invited</div><div className="muted small">WHO WOULD?</div></div></div>
        <div><div className="muted small">ROOM</div><div style={{ fontSize: "2.8rem", fontWeight: 950, letterSpacing: ".14em" }}>{cleanCode || "—"}</div></div>
        <div className="field"><label htmlFor="name">Your name</label><input id="name" className="input" autoFocus maxLength={24} autoComplete="nickname" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} /></div>
        {error && <div className="error" role="alert">{error}</div>}
        <button className="btn btn-primary btn-full" disabled={busy || cleanCode.length !== 4 || name.trim().length < 2}>{busy ? "Joining…" : "Join the room"}</button>
        <button className="btn btn-ghost btn-full" type="button" onClick={() => router.push("/")}>Back home</button>
      </form>
    </main>
  );
}
