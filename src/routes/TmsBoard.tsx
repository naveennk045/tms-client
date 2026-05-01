import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { fetchTmsSnapshot, tmsEventSourceUrl } from "../lib/api";
import {
  lineItemsNeedCollected,
  lineItemsNeedReady,
  resolveTmsTokenFlags,
} from "../lib/status";
import { getXStoreIdHeaderValue, readStoredStore } from "../lib/storeContext";
import { primeSpeechSynthesis, speakTmsAnnouncement } from "../lib/speech";
import type { TmsAnnouncePayload, TmsSnapshotPayload, TmsToken, WsEnvelope } from "../lib/types";

export default function TmsBoard() {
  const stored = useMemo(() => readStoredStore(), []);
  const isSilk = useMemo(() => document.documentElement.dataset.browser === "silk", []);
  const [snapshot, setSnapshot] = useState<TmsSnapshotPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flashKot, setFlashKot] = useState<string | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(Boolean(document.fullscreenElement));
  const voiceRef = useRef(false);
  voiceRef.current = voiceEnabled;

  const xStore = stored ? getXStoreIdHeaderValue(stored) : "";

  const applySnapshot = useCallback((payload: TmsSnapshotPayload) => {
    setSnapshot(payload);
    setError(null);
  }, []);

  const loadSnapshot = useCallback(async () => {
    if (!stored) return;
    setError(null);
    try {
      const snap = await fetchTmsSnapshot(xStore);
      applySnapshot(snap);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load snapshot");
    }
  }, [stored, xStore, applySnapshot]);

  const requestFullscreen = useCallback(async () => {
    const el = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void>;
    };
    const fn = el.requestFullscreen ?? el.webkitRequestFullscreen;
    if (!fn) return;
    if (document.fullscreenElement) return;
    try {
      await fn.call(el);
    } catch {
      // ignore blocked fullscreen attempts
    }
  }, []);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  useEffect(() => {
    if (!stored) return;

    const url = tmsEventSourceUrl(stored.storeId);
    const es = new EventSource(url);

    const handleData = (raw: string) => {
      const line = raw.trim();
      if (!line || line.startsWith(":")) return;
      try {
        const msg = JSON.parse(line) as WsEnvelope<TmsSnapshotPayload | TmsAnnouncePayload>;
        if (msg.type === "SNAPSHOT" && msg.payload && "tokens" in msg.payload) {
          applySnapshot(msg.payload);
        } else if (msg.type === "BOARD_REFRESH" || msg.type === "ITEM_STATUS_CHANGED") {
          const sid = (msg.payload as { store_id?: number } | undefined)?.store_id;
          if (sid !== undefined && sid !== stored.storeId) return;
          void loadSnapshot();
        } else if (msg.type === "TMS_ANNOUNCE") {
          const p = msg.payload as TmsAnnouncePayload;
          setFlashKot(p.kot_code);
          globalThis.setTimeout(() => setFlashKot(null), 4500);
          if (voiceRef.current && p.speech) {
            speakTmsAnnouncement(p.speech);
          }
        }
      } catch {
        // ignore malformed SSE
      }
    };

    es.onmessage = (ev) => handleData(ev.data);
    es.onerror = () => {
      void loadSnapshot();
    };

    return () => {
      es.close();
    };
  }, [stored, applySnapshot, loadSnapshot]);

  useEffect(() => {
    if (!isSilk) return;

    const syncFullscreenState = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", syncFullscreenState);

    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
    };
  }, [isSilk]);

  useEffect(() => {
    if (!isSilk) return;

    const trigger = () => {
      void requestFullscreen();
    };

    globalThis.addEventListener("pointerdown", trigger, { once: true });
    globalThis.addEventListener("keydown", trigger, { once: true });

    return () => {
      globalThis.removeEventListener("pointerdown", trigger);
      globalThis.removeEventListener("keydown", trigger);
    };
  }, [isSilk, requestFullscreen]);

  if (!stored) {
    return <Navigate to="/setup" replace />;
  }

  return (
    <div className="app-shell app-shell-wide">
      <header className="page-head page-head-row tms-header">
        <div>
          <h1 className="page-title tms-brand">KTR</h1>
        </div>
        <nav className="action-row">
          {isSilk && !isFullscreen && (
            <button type="button" className="btn btn-outline" onClick={() => void requestFullscreen()}>
              Enter fullscreen
            </button>
          )}
          {!voiceEnabled && (
            <button
              type="button"
              className="btn btn-voice"
              onClick={() => {
                primeSpeechSynthesis();
                setVoiceEnabled(true);
              }}
            >
              Enable voice
            </button>
          )}
          {voiceEnabled && <span className="voice-on">Voice on</span>}
          <Link to="/setup" className="btn btn-outline">
            Outlet setup
          </Link>
        </nav>
      </header>

      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}

      {!snapshot && !error && <p className="muted-line">Loading…</p>}

      <ul className="tms-list">
        {snapshot?.tokens.map((token) => (
          <li key={token.order_id} className="tms-list__item">
            <OrderTile token={token} flash={flashKot === token.kot_code} />
          </li>
        ))}
      </ul>

      {snapshot?.tokens.length === 0 && <p className="muted-line">No active orders.</p>}
    </div>
  );
}

const MAX_ITEM_LINES = 10;

function OrderTile({ token, flash }: Readonly<{ token: TmsToken; flash: boolean }>) {
  const { has_ready_for_pickup: ready, has_in_kitchen: kitchen } = resolveTmsTokenFlags(
    token.lines,
    token.flags,
  );
  const lines = token.lines;
  const visible = lines.slice(0, MAX_ITEM_LINES);
  const overflow = lines.length - visible.length;

  return (
    <article
      className={`tms-tile ${flash ? "tms-tile--flash" : ""} ${ready ? "tms-tile--pickup" : ""}`}
      aria-label={`Order ${token.kot_code}`}
    >
      <header className="tms-tile__head">
        <span className="tms-tile__kot">{token.kot_code}</span>
        <div className="tms-tile__flags">
          {ready && <span className="tms-badge tms-badge--pickup">Pickup</span>}
          {kitchen && !ready && <span className="tms-badge tms-badge--kitchen">Kitchen</span>}
        </div>
      </header>

      <ul className="tms-tile__lines">
        {visible.map((line) => {
          const needReady = lineItemsNeedReady(line);
          const needCollect = lineItemsNeedCollected(line);
          const pickupHighlight = needCollect > 0 || line.order_status === "READY";
          return (
            <li
              key={line.id}
              className={`tms-tile__line ${pickupHighlight ? "tms-tile__line--ready" : ""}`}
            >
              <span className="tms-tile__name">{line.item_name}</span>
              <span className="tms-tile__qty tms-tile__qty--split">
                {needReady} <span className="tms-tile__qty-em">PREPARING</span>
                {" | "}
                {needCollect} to <span className="tms-tile__qty-em">COLLECT</span>
              </span>
            </li>
          );
        })}
      </ul>

      {overflow > 0 && (
        <p className="tms-tile__more">+{overflow} more item{overflow === 1 ? "" : "s"}</p>
      )}
    </article>
  );
}
