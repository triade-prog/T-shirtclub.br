"use client";

import { useEffect } from "react";

/** Registra o service worker da casca (só em produção: no desenvolvimento ele atrapalha). */
export function RegistrarServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
  }, []);
  return null;
}
