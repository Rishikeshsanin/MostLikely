export default function Loading() {
  return (
    <main className="shell center-page">
      <div className="state-page stack" style={{ textAlign: "center", placeItems: "center" }}>
        <div className="brand-mark brand-mark-lg waiting" aria-hidden="true">W?</div>
        <div className="muted">Getting the room ready…</div>
      </div>
    </main>
  );
}
