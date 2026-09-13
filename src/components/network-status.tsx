"use client";

import { useEffect, useState } from "react";

export function NetworkStatus() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  if (online) return null;

  return (
    <div className="network-banner" role="status" aria-live="polite">
      You&apos;re offline. We&apos;ll reconnect when your internet comes back.
    </div>
  );
}
