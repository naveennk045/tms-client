import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, Navigate } from "react-router-dom";
import { fetchKioskConfig, fetchTmsSnapshot, tmsEventSourceUrl } from "../lib/api";
import {
  lineItemsNeedCollected,
  lineItemsNeedReady,
  resolveTmsTokenFlags,
} from "../lib/status";
import {
  getXStoreIdHeaderValue,
  isStoreStillActive,
  readStoredStore,
} from "../lib/storeContext";
import { primeSpeechSynthesis, speakTmsAnnouncement } from "../lib/speech";
import type { TmsAnnouncePayload, TmsSnapshotPayload, TmsToken, WsEnvelope } from "../lib/types";

export default function TmsBoard() {
  const stored = useMemo(() => readStoredStore(), []);
  const [forbidden, setForbidden] = useState(false);
  const [snapshot, setSnapshot] = useState<TmsSnapshotPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sseHint, setSseHint] = useState<string>("Connecting…");
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
      const rows = await fetchKioskConfig();
      if (!isStoreStillActive(stored, rows)) {
        setForbidden(true);
        return;
      }
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
    if (!stored || forbidden) return;

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
          const sid = (msg.payload as { store_id?: number } | undefined)?.store_id;
          if (sid !== undefined && sid !== stored.storeId) return;
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
        /* ignore */
      }
    };

    es.onmessage = (ev) => handleData(ev.data);
    es.onerror = () => {
      setSseHint("SSE error — retrying snapshot…");
      void loadSnapshot();
    };

    return () => {
      es.close();
    };
  }, [stored, forbidden, applySnapshot, loadSnapshot]);

  if (!stored) {
    return <Navigate to="/" replace />;
  }

  if (forbidden) {
    return <Navigate to="/" replace />;
  }

  return (
    <div style={page}>
      <header style={topBar}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.35rem" }}>Token display</h1>
          <div style={{ color: "var(--muted)", fontSize: "0.9rem", marginTop: 4 }}>
            {stored.storeName} · {sseHint}
          </div>
        </div>
        <nav style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          {!voiceEnabled && (
            <button
              type="button"
              style={voiceBtn}
              onClick={() => {
                primeSpeechSynthesis();
                setVoiceEnabled(true);
              }}
            >
              Enable voice announcements
            </button>
          )}
          {voiceEnabled && (
            <span style={{ color: "var(--ready)", fontSize: "0.85rem" }}>Voice on</span>
          )}
          <Link to="/" style={linkMuted}>
            Setup
          </Link>
          <Link to="/kds" style={linkMuted}>
            KDS
          </Link>
        </nav>
      </header>

      {error && (
        <div style={errBox} role="alert">
          {error}
        </div>
      )}

      {!snapshot && !error && <p style={{ color: "var(--muted)" }}>Loading tokens…</p>}

      <div style={grid}>
        {snapshot?.tokens.map((token) => (
          <TokenCard key={token.order_id} token={token} flash={flashKot === token.kot_code} />
        ))}
      </div>

      {snapshot && snapshot.tokens.length === 0 && (
        <p style={{ color: "var(--muted)", marginTop: "1rem" }}>No active tokens.</p>
      )}
    </div>
  );
}

function TokenCard({ token, flash }: { token: TmsToken; flash: boolean }) {
  const { has_ready_for_pickup: ready, has_in_kitchen: kitchen } = resolveTmsTokenFlags(
    token.lines,
    token.flags,
  );
  return (
    <article
      style={{
        ...card,
        outline: flash ? "2px solid var(--ready)" : ready ? "2px solid rgba(52, 168, 83, 0.5)" : undefined,
        boxShadow: flash ? "0 0 24px rgba(52, 168, 83, 0.35)" : undefined,
      }}
    >
      <div style={head}>
        <span style={kot}>{token.kot_code}</span>
        {ready && <span style={badgeReady}>Pickup</span>}
        {kitchen && !ready && <span style={badgeKitchen}>In kitchen</span>}
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {token.lines.map((line) => {
          const needReady = lineItemsNeedReady(line);
          const needCollect = lineItemsNeedCollected(line);
          const pickupHighlight = needCollect > 0 || line.order_status === "READY";
          return (
            <li
              key={line.id}
              className={pickupHighlight ? "tms-token-line tms-token-line--pickup" : "tms-token-line"}
              style={lineStyle(line.order_status, pickupHighlight)}
            >
              <span>{line.item_name}</span>
              <span className="tms-qty-wrap">
                {needReady} <span className="tms-qty-em">PREPARING</span>
                {" | "}
                {needCollect} to <span className="tms-qty-em">COLLECT</span>
              </span>
            </li>
          );
        })}
      </ul>
    </article>
  );
}

function lineStyle(status: string, pickupHighlight: boolean): CSSProperties {
  return {
    display: "flex",
    justifyContent: "space-between",
    gap: "0.5rem",
    padding: "0.4rem 0",
    borderTop: "1px solid var(--border)",
    color: pickupHighlight || status === "READY" ? "var(--ready)" : "var(--text)",
    fontWeight: pickupHighlight || status === "READY" ? 600 : 400,
  };
}

const page: CSSProperties = { minHeight: "100vh", padding: "1rem 1.25rem" };
const topBar: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "1rem",
  marginBottom: "1rem",
  flexWrap: "wrap",
};
const linkMuted: CSSProperties = { color: "var(--muted)" };
const voiceBtn: CSSProperties = {
  padding: "0.4rem 0.75rem",
  borderRadius: 8,
  border: "1px solid var(--ready)",
  background: "rgba(52, 168, 83, 0.12)",
  color: "var(--text)",
};
const errBox: CSSProperties = {
  background: "rgba(234, 67, 53, 0.12)",
  border: "1px solid var(--warn)",
  padding: "0.65rem 0.85rem",
  borderRadius: 8,
  marginBottom: "1rem",
};
const grid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
  gap: "1rem",
};
const card: CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: "0.85rem 1rem",
  transition: "box-shadow 0.2s ease, outline 0.2s ease",
};
const head: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.5rem",
  marginBottom: "0.5rem",
};
const kot: CSSProperties = { fontSize: "1.4rem", fontWeight: 800, letterSpacing: "0.02em" };
const badgeReady: CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 700,
  textTransform: "uppercase",
  color: "var(--bg)",
  background: "var(--ready)",
  padding: "0.2rem 0.45rem",
  borderRadius: 6,
};
const badgeKitchen: CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 600,
  color: "var(--prep)",
  border: "1px solid var(--prep)",
  padding: "0.2rem 0.45rem",
  borderRadius: 6,
};
