"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createRoom, joinRoom } from "@/lib/api";
import { saveSession } from "@/lib/session";

export function HomeClient() {
  const router = useRouter();
  const [mode, setMode] = useState<"home" | "create" | "join">("home");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submitCreate(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const session = await createRoom(name.trim());
      saveSession({ ...session, code: session.code });
      router.push(`/room/${session.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the room.");
    } finally { setBusy(false); }
  }

  async function submitJoin(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const session = await joinRoom(code.trim(), name.trim());
      saveSession({ ...session, code: session.code });
      router.push(`/room/${session.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not join the room.");
    } finally { setBusy(false); }
  }

  return (
    <main className="shell center-page">
      <div className="stack-lg">
        <section className="home-hero">
          <div className="row">
            <div className="brand-mark" aria-hidden="true">W?</div>
            <div><div className="eyebrow">Party game</div><div className="muted small">3–10 friends · one room</div></div>
          </div>
          <div className="stack">
            <h1 className="hero-title">WHO <span className="would">WOULD?</span></h1>
            <p className="hero-copy">Your friends vote. <strong style={{ color: "white" }}>The room decides.</strong></p>
            <p className="muted">No accounts. No explanations. Join, vote secretly, reveal the damage.</p>
          </div>
        </section>

        {mode === "home" && (
          <div className="stack-lg">
            <div className="home-actions">
              <button className="btn btn-primary" onClick={() => { setMode("create"); setError(""); }}>Create room</button>
              <button className="btn btn-secondary" onClick={() => { setMode("join"); setError(""); }}>Join room</button>
            </div>
            <div className="how-grid" aria-label="How to play">
              <div className="card-soft how-step"><span className="how-num">1</span><strong>Join the room</strong></div>
              <div className="card-soft how-step"><span className="how-num">2</span><strong>Vote secretly</strong></div>
              <div className="card-soft how-step"><span className="how-num">3</span><strong>Watch the group expose everyone</strong></div>
            </div>
          </div>
        )}

        {mode === "create" && (
          <form className="card card-pad stack" onSubmit={submitCreate}>
            <div className="row-between"><div><div className="eyebrow">Create room</div><h2 style={{ margin: "4px 0 0" }}>What should we call you?</h2></div><button className="btn btn-ghost btn-sm" type="button" onClick={() => setMode("home")}>Back</button></div>
            <div className="field"><label htmlFor="create-name">Your name</label><input id="create-name" className="input" maxLength={24} autoFocus autoComplete="nickname" placeholder="Rishi" value={name} onChange={(e) => setName(e.target.value)} /></div>
            {error && <div className="error" role="alert">{error}</div>}
            <button className="btn btn-primary btn-full" disabled={busy || name.trim().length < 2}>{busy ? "Creating…" : "Create room"}</button>
          </form>
        )}

        {mode === "join" && (
          <form className="card card-pad stack" onSubmit={submitJoin}>
            <div className="row-between"><div><div className="eyebrow">Join room</div><h2 style={{ margin: "4px 0 0" }}>Enter the code</h2></div><button className="btn btn-ghost btn-sm" type="button" onClick={() => setMode("home")}>Back</button></div>
            <div className="field"><label htmlFor="room-code">Room code</label><input id="room-code" className="input input-code" inputMode="numeric" pattern="[0-9]*" maxLength={4} placeholder="5832" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0,4))} /></div>
            <div className="field"><label htmlFor="join-name">Your name</label><input id="join-name" className="input" maxLength={24} autoComplete="nickname" placeholder="Aryan" value={name} onChange={(e) => setName(e.target.value)} /></div>
            {error && <div className="error" role="alert">{error}</div>}
            <button className="btn btn-primary btn-full" disabled={busy || code.length !== 4 || name.trim().length < 2}>{busy ? "Joining…" : "Join room"}</button>
          </form>
        )}
      </div>
    </main>
  );
}
