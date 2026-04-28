import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { fetchTmsSnapshot, tmsEventSourceUrl } from "../lib/api";
import { statusLabel } from "../lib/status";
import { getXStoreIdHeaderValue, readStoredStore } from "../lib/storeContext";
import { primeSpeechSynthesis, speakTmsAnnouncement } from "../lib/speech";
import type { TmsAnnouncePayload, TmsSnapshotPayload, TmsToken, WsEnvelope } from "../lib/types";

export default function TmsBoard() {
  const stored = useMemo(() => readStoredStore(), []);
  const [snapshot, setSnapshot] = useState<TmsSnapshotPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sseHint, setSseHint] = useState<string>("Connecting...");
  const [flashKot, setFlashKot] = useState<string | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
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

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  useEffect(() => {
    if (!stored) return;

    const url = tmsEventSourceUrl(stored.storeId);
    setSseHint("Live (SSE)");
    const es = new EventSource(url);

    const handleData = (raw: string) => {
      const line = raw.trim();
      if (!line || line.startsWith(":")) return;
      try {
        const msg = JSON.parse(line) as WsEnvelope<TmsSnapshotPayload | TmsAnnouncePayload>;
        if (msg.type === "SNAPSHOT" && msg.payload && "tokens" in msg.payload) {
          applySnapshot(msg.payload as TmsSnapshotPayload);
        } else if (msg.type === "BOARD_REFRESH" || msg.type === "ITEM_STATUS_CHANGED") {
          void loadSnapshot();
        } else if (msg.type === "TMS_ANNOUNCE") {
          const p = msg.payload as TmsAnnouncePayload;
          setFlashKot(p.kot_code);
          window.setTimeout(() => setFlashKot(null), 4500);
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
      setSseHint("SSE error - retrying snapshot...");
      void loadSnapshot();
    };

    return () => {
      es.close();
    };
  }, [stored, applySnapshot, loadSnapshot]);

  if (!stored) {
    return <Navigate to="/setup" replace />;
  }

  return (
    <div className="app-shell app-shell-wide">
      <header className="page-head page-head-row">
        <div>
          <h1 className="page-title">Token display management</h1>
          <div className="page-subtitle">
            {stored.storeName} ({stored.storeCode}) · {sseHint}
          </div>
        </div>
        <nav className="action-row">
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

      {!snapshot && !error && <p className="muted-line">Loading tokens...</p>}

      <div className="tms-grid">
        {snapshot?.tokens.map((token) => (
          <TokenCard key={token.order_id} token={token} flash={flashKot === token.kot_code} />
        ))}
      </div>

      {snapshot && snapshot.tokens.length === 0 && <p className="muted-line">No active tokens.</p>}
    </div>
  );
}

function TokenCard({ token, flash }: { token: TmsToken; flash: boolean }) {
  const ready = token.flags.has_ready_for_pickup;
  const kitchen = token.flags.has_in_kitchen;

  return (
    <article className={`tms-card ${flash ? "flash" : ""}`}>
      <div className="tms-card-head">
        <span className="kot-code">{token.kot_code}</span>
        {ready && <span className="badge-ready">Pickup</span>}
        {kitchen && !ready && <span className="badge-kitchen">In kitchen</span>}
      </div>

      <ul className="line-list">
        {token.lines.map((line) => (
          <li key={line.id} className={`line-row ${line.order_status === "READY" ? "line-ready" : ""}`}>
            <span className="line-name">
              {line.item_name} x{line.quantity}
            </span>
            <span className="line-status">{statusLabel(line.order_status)}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
