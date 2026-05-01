import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  fetchKdsBoard,
  fetchKioskConfig,
  kdsWebSocketUrl,
  patchKdsLineStatus,
} from "../lib/api";
import {
  lineIsFullyDone,
  lineItemsNeedCollected,
  lineItemsNeedReady,
  statusLabel,
} from "../lib/status";
import {
  getXStoreIdHeaderValue,
  isStoreStillActive,
  readStoredStore,
} from "../lib/storeContext";
import type { KdsBoardPayload, KdsLine, OrderItemStatus, WsEnvelope } from "../lib/types";

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
          const sid = (msg.payload as { store_id?: number } | undefined)?.store_id;
          if (sid !== undefined && sid !== stored.storeId) return;
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

  async function patchLine(lineId: number, status: OrderItemStatus, quantity?: number) {
    if (!stored) return;
    setLineBusy(lineId);
    setLoadError(null);
    try {
      await patchKdsLineStatus(xStore, lineId, status, quantity);
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
          {(board?.orders?.length ?? 0) === 0 && board && (
            <p style={{ color: "var(--muted)" }}>No tickets on the board.</p>
          )}
          <div style={ticketGrid}>
            {board?.orders.map((order) => (
              <article key={order.id} style={ticket}>
                <div style={ticketHead}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                    <span style={kot}>{order.kot_code}</span>
                    {order.order_type && (
                      <span style={orderTypeBadge(order.order_type)}>{orderTypeShort(order.order_type)}</span>
                    )}
                  </div>
                  <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                    {new Date(order.created_at).toLocaleString()}
                  </span>
                </div>
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {order.lines.map((line) => (
                    <KdsLineRow
                      key={line.id}
                      line={line}
                      busy={lineBusy === line.id}
                      onPatch={(status, qty) => void patchLine(line.id, status, qty)}
                    />
                  ))}
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
              Clubbed totals = ordered volume across open lines (not “still cooking”). Use per-line kitchen counts
              above.
              <br />
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

function orderTypeShort(t: "DINEIN" | "TAKEAWAY"): string {
  return t === "DINEIN" ? "Dine-in" : "Takeaway";
}

function orderTypeBadge(t: "DINEIN" | "TAKEAWAY"): CSSProperties {
  return {
    fontSize: "0.7rem",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    padding: "0.15rem 0.4rem",
    borderRadius: 6,
    border: "1px solid var(--border)",
    color: t === "TAKEAWAY" ? "var(--prep)" : "var(--muted)",
  };
}

function KdsLineRow({
  line,
  busy,
  onPatch,
}: Readonly<{
  line: KdsLine;
  busy: boolean;
  onPatch: (status: OrderItemStatus, quantity?: number) => void;
}>) {
  const needReady = lineItemsNeedReady(line);
  const needCollect = lineItemsNeedCollected(line);
  const done = lineIsFullyDone(line);
  const [readyQty, setReadyQty] = useState(needReady > 0 ? needReady : 1);
  const [collectQty, setCollectQty] = useState(needCollect > 0 ? needCollect : 1);

  useEffect(() => {
    setReadyQty(needReady > 0 ? needReady : 1);
    setCollectQty(needCollect > 0 ? needCollect : 1);
  }, [needReady, needCollect, line.id]);

  const clampReady = Math.min(Math.max(1, readyQty), Math.max(1, needReady));
  const clampCollect = Math.min(Math.max(1, collectQty), Math.max(1, needCollect));

  return (
    <li style={lineRow}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>{line.item_name}</div>
        <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
          Ordered ×{line.quantity} · {statusLabel(line.order_status)}
        </div>
        {!done && (
          <div style={{ fontSize: "0.8rem", marginTop: 4, color: "var(--muted)" }}>
            Kitchen: <strong style={{ color: "var(--text)" }}>{needReady}</strong> · Counter:{" "}
            <strong style={{ color: "var(--text)" }}>{needCollect}</strong>
          </div>
        )}
        {line.order_status === "NOT_ACCEPTED" && (
          <div style={{ marginTop: 8 }}>
            <button type="button" style={advanceBtn} disabled={busy} onClick={() => onPatch("PREPARING")}>
              Start preparing
            </button>
          </div>
        )}
        {needReady > 0 && line.order_status !== "NOT_ACCEPTED" && (
          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: "0.4rem", alignItems: "center" }}>
            <label style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
              Ready qty{" "}
              <input
                type="number"
                min={1}
                max={needReady}
                value={needReady > 0 ? clampReady : 1}
                disabled={busy}
                onChange={(e) => setReadyQty(Number(e.target.value))}
                style={qtyInput}
              />
            </label>
            <button
              type="button"
              style={advanceBtn}
              disabled={busy}
              onClick={() => onPatch("READY", clampReady === needReady ? undefined : clampReady)}
            >
              Mark ready
            </button>
          </div>
        )}
        {needCollect > 0 && line.order_status !== "NOT_ACCEPTED" && (
          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: "0.4rem", alignItems: "center" }}>
            <label style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
              Collect qty{" "}
              <input
                type="number"
                min={1}
                max={needCollect}
                value={needCollect > 0 ? clampCollect : 1}
                disabled={busy}
                onChange={(e) => setCollectQty(Number(e.target.value))}
                style={qtyInput}
              />
            </label>
            <button
              type="button"
              style={{ ...advanceBtn, borderColor: "var(--ready)", background: "rgba(52, 168, 83, 0.12)" }}
              disabled={busy}
              onClick={() =>
                onPatch("COLLECTED", clampCollect === needCollect ? undefined : clampCollect)
              }
            >
              Mark collected
            </button>
          </div>
        )}
      </div>
      {done && <span style={{ color: "var(--muted)", fontSize: "0.85rem", whiteSpace: "nowrap" }}>Done</span>}
    </li>
  );
}

const qtyInput: CSSProperties = {
  width: "4.5rem",
  marginLeft: 6,
  padding: "0.25rem 0.35rem",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
};
