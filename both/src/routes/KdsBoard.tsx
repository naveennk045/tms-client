import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  fetchKdsBoard,
  fetchKioskConfig,
  kdsWebSocketUrl,
  patchKdsLineStatus,
} from "../lib/api";
import { nextOrderItemStatus, statusLabel } from "../lib/status";
import {
  getXStoreIdHeaderValue,
  isStoreStillActive,
  readStoredStore,
} from "../lib/storeContext";
import type { KdsBoardPayload, KdsLine, WsEnvelope } from "../lib/types";

const POLL_MS = 10_000;
const DEFAULT_MAX_ROWS = 20;

export default function KdsBoard() {
  const stored = useMemo(() => readStoredStore(), []);
  const [forbidden, setForbidden] = useState(false);
  const [board, setBoard] = useState<KdsBoardPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [wsHint, setWsHint] = useState<string>("Connecting…");
  const [lineBusy, setLineBusy] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const xStore = stored ? getXStoreIdHeaderValue(stored) : "";

  const refetch = useCallback(async () => {
    if (!stored) return;
    setLoadError(null);
    try {
      const rows = await fetchKioskConfig();
      if (!isStoreStillActive(stored, rows)) {
        setForbidden(true);
        return;
      }
      const b = await fetchKdsBoard(xStore, DEFAULT_MAX_ROWS);
      setBoard(b);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load board");
    }
  }, [stored, xStore]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  useEffect(() => {
    if (!stored || forbidden) return;

    let cancelled = false;
    const clearPoll = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };

    const startPoll = () => {
      clearPoll();
      pollRef.current = setInterval(() => {
        void refetch();
      }, POLL_MS);
      setWsHint("Polling (WebSocket unavailable)");
    };

    const url = kdsWebSocketUrl(stored.storeId, DEFAULT_MAX_ROWS);
    setWsHint("Connecting…");
    const ws = new WebSocket(url);

    ws.onopen = () => {
      if (cancelled) return;
      setWsHint("Live (WebSocket)");
      clearPoll();
    };

    ws.onmessage = (ev) => {
      if (cancelled) return;
      try {
        const msg = JSON.parse(String(ev.data)) as WsEnvelope<KdsBoardPayload | Record<string, unknown>>;
        if (msg.type === "SNAPSHOT" && msg.payload && "orders" in msg.payload) {
          setBoard(msg.payload as KdsBoardPayload);
          setLoadError(null);
        } else if (msg.type === "BOARD_REFRESH" || msg.type === "ITEM_STATUS_CHANGED") {
          void refetch();
        } else if (msg.type === "PING") {
          /* ignore */
        }
      } catch {
        /* ignore malformed frames */
      }
    };

    ws.onerror = () => {
      if (cancelled) return;
      startPoll();
    };

    ws.onclose = () => {
      if (cancelled) return;
      startPoll();
    };

    return () => {
      cancelled = true;
      clearPoll();
      ws.close();
    };
  }, [stored, forbidden, refetch]);

  async function advanceLine(line: KdsLine) {
    if (!stored) return;
    const next = nextOrderItemStatus(line.order_status);
    if (!next) return;
    setLineBusy(line.id);
    setLoadError(null);
    try {
      await patchKdsLineStatus(xStore, line.id, next);
      await refetch();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setLineBusy(null);
    }
  }

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
          <h1 style={{ margin: 0, fontSize: "1.35rem" }}>Kitchen display</h1>
          <div style={{ color: "var(--muted)", fontSize: "0.9rem", marginTop: 4 }}>
            {stored.storeName} · {wsHint}
          </div>
        </div>
        <nav style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <Link to="/" style={linkMuted}>
            Setup
          </Link>
          <Link to="/tms" style={linkMuted}>
            TMS
          </Link>
        </nav>
      </header>

      {loadError && (
        <div style={errBox} role="alert">
          {loadError}
        </div>
      )}

      <div className="kds-layout" style={layout}>
        <main style={mainCol}>
          {!board && !loadError && <p style={{ color: "var(--muted)" }}>Loading board…</p>}
          {board && board.orders.length === 0 && (
            <p style={{ color: "var(--muted)" }}>No tickets on the board.</p>
          )}
          <div style={ticketGrid}>
            {board?.orders.map((order) => (
              <article key={order.id} style={ticket}>
                <div style={ticketHead}>
                  <span style={kot}>{order.kot_code}</span>
                  <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                    {new Date(order.created_at).toLocaleString()}
                  </span>
                </div>
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {order.lines.map((line) => {
                    const next = nextOrderItemStatus(line.order_status);
                    return (
                      <li key={line.id} style={lineRow}>
                        <div>
                          <div style={{ fontWeight: 600 }}>{line.item_name}</div>
                          <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                            ×{line.quantity} · {statusLabel(line.order_status)}
                          </div>
                        </div>
                        {next ? (
                          <button
                            type="button"
                            style={advanceBtn}
                            disabled={lineBusy === line.id}
                            onClick={() => void advanceLine(line)}
                          >
                            → {statusLabel(next)}
                          </button>
                        ) : (
                          <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Done</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </article>
            ))}
          </div>
        </main>

        <aside className="kds-aside" style={aside}>
          <h2 style={{ margin: "0 0 0.75rem", fontSize: "1rem" }}>Clubbed totals</h2>
          {!board || board.clubbed_totals.length === 0 ? (
            <p style={{ color: "var(--muted)", margin: 0 }}>No open items.</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {board.clubbed_totals.map((row) => (
                <li
                  key={row.item_name}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "0.35rem 0",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <span>{row.item_name}</span>
                  <strong>{row.quantity}</strong>
                </li>
              ))}
            </ul>
          )}
          {board && (
            <p style={{ marginTop: "1rem", fontSize: "0.8rem", color: "var(--muted)" }}>
              Window {board.live_window_minutes}m · max {board.max_rows} tickets
            </p>
          )}
        </aside>
      </div>
    </div>
  );
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
const errBox: CSSProperties = {
  background: "rgba(234, 67, 53, 0.12)",
  border: "1px solid var(--warn)",
  padding: "0.65rem 0.85rem",
  borderRadius: 8,
  marginBottom: "1rem",
};
const layout: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr minmax(220px, 280px)",
  gap: "1.25rem",
  alignItems: "start",
};
const mainCol: CSSProperties = { minWidth: 0 };
const aside: CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: "1rem",
  position: "sticky",
  top: "1rem",
};
const ticketGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
  gap: "1rem",
};
const ticket: CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: "0.85rem 1rem",
};
const ticketHead: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  marginBottom: "0.65rem",
  gap: "0.5rem",
};
const kot: CSSProperties = { fontSize: "1.25rem", fontWeight: 700, color: "var(--accent)" };
const lineRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "0.75rem",
  padding: "0.5rem 0",
  borderTop: "1px solid var(--border)",
};
const advanceBtn: CSSProperties = {
  padding: "0.35rem 0.65rem",
  borderRadius: 8,
  border: "1px solid var(--prep)",
  background: "rgba(249, 171, 0, 0.12)",
  color: "var(--text)",
  whiteSpace: "nowrap",
};
