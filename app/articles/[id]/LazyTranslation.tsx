"use client";

import { useEffect, useState } from "react";

type LazyTranslationProps = {
  articleId: string;
  sourceHref: string;
};

export default function LazyTranslation({ articleId, sourceHref }: LazyTranslationProps) {
  const [state, setState] = useState<"queueing" | "queued" | "running" | "deferred" | "failed" | "ready">("queueing");

  useEffect(() => {
    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let pollCount = 0;
    const poll = async () => {
      if (!active) return;
      try {
        const response = await fetch(`/api/articles/${encodeURIComponent(articleId)}/translate`, { headers: { accept: "application/json" } });
        const payload = await response.json().catch(() => ({}));
        if (payload.cacheStatus === "fresh" || payload.cacheStatus === "already_target_language" || payload.status === "fresh" || payload.status === "already_target_language") {
          setState("ready");
          window.location.reload();
          return;
        }
        if (active) {
          if (payload.taskStatus === "running") setState("running");
          else if (payload.taskStatus === "deferred") setState("deferred");
          else if (payload.taskStatus === "failed") setState("failed");
          else if (payload.taskStatus === "queued") setState("queued");
        }
      } catch { /* keep the instant preview visible while the worker retries */ }
      if (!active) return;
      pollCount += 1;
      if (pollCount < 60) retryTimer = setTimeout(() => void poll(), 5_000);
    };
    const enqueue = async () => {
      try {
        const response = await fetch(`/api/articles/${encodeURIComponent(articleId)}/translate`, { method: "POST", headers: { accept: "application/json" } });
        if (response.ok && active) {
          const payload = await response.json().catch(() => ({}));
          if (payload.taskStatus === "running") setState("running");
          else if (payload.taskStatus === "deferred") setState("deferred");
          else if (payload.taskStatus === "failed") setState("failed");
          else setState("queued");
        }
      } catch { if (active) setState("queued"); }
      void poll();
    };
    void enqueue();
    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [articleId]);

  return <div className="translationUnavailable" role="status" aria-live="polite">
    <p>{state === "ready"
      ? "English version is ready. Refreshing…"
      : state === "running"
        ? "English preview shown; validated translation is processing."
        : state === "deferred"
          ? "English preview shown; translation is deferred for a later retry."
          : state === "failed"
            ? "English preview shown; validated translation failed after the retry limit."
            : "English preview shown; validated translation is queued."}</p>
    <a href={sourceHref}>View the Chinese original</a>
  </div>;
}
