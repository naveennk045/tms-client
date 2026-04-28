import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { fetchKioskConfig } from "../lib/api";
import type { KioskStoreRow } from "../lib/types";
import {
  clearStoredStore,
  getXStoreIdHeaderValue,
  isStoreStillActive,
  readStoredStore,
  storeRowToContext,
  writeStoredStore,
} from "../lib/storeContext";

export default function Setup() {
  const [rows, setRows] = useState<KioskStoreRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [, setStoreRev] = useState(0);
  const stored = readStoredStore();

  const load = useCallback(async () => {
    setError(null);
    try {
      const list = await fetchKioskConfig();
      setRows(list);
      const current = readStoredStore();
      if (current && !isStoreStillActive(current, list)) {
        clearStoredStore();
        setStoreRev((n) => n + 1);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load kiosk config");
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!rows || rows.length !== 1) return;
    const existing = readStoredStore();
    if (existing && isStoreStillActive(existing, rows)) return;
    writeStoredStore(storeRowToContext(rows[0]!));
    setStoreRev((n) => n + 1);
  }, [rows]);

  function selectStore(row: KioskStoreRow) {
    setBusyId(row.store_id);
    try {
      writeStoredStore(storeRowToContext(row));
      setStoreRev((n) => n + 1);
    } finally {
      setBusyId(null);
    }
  }

  const activeStored = stored && rows && isStoreStillActive(stored, rows) ? stored : null;

  return (
    <div style={shell}>
      <header style={header}>
        <h1 style={{ margin: 0, fontSize: "1.5rem" }}>Outlet setup</h1>
        <p style={{ margin: "0.35rem 0 0", color: "var(--muted)", maxWidth: 560 }}>
          Loads active stores from <code>GET /admin/kiosk-config</code> and saves your choice in{" "}
          <code>localStorage</code> for KDS and TMS.
        </p>
      </header>

      {error && (
        <div style={bannerError} role="alert">
          {error}
        </div>
      )}

      {rows === null && <p style={{ color: "var(--muted)" }}>Loading stores…</p>}

      {rows && rows.length === 0 && !error && (
        <p style={{ color: "var(--muted)" }}>No active stores returned from the server.</p>
      )}

      {activeStored && (
        <section style={card}>
          <h2 style={h2}>Current outlet</h2>
          <p style={{ margin: 0 }}>
            <strong>{activeStored.storeName}</strong>{" "}
            <span style={{ color: "var(--muted)" }}>
              (id {activeStored.storeId}, code {activeStored.storeCode})
            </span>
          </p>
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem", color: "var(--muted)" }}>
            Header value: <code>X-Store-Id: {getXStoreIdHeaderValue(activeStored)}</code>
          </p>
          <nav style={{ display: "flex", gap: "0.75rem", marginTop: "1rem", flexWrap: "wrap" }}>
            <Link to="/kds" style={primaryLink}>
              Open KDS
            </Link>
            <Link to="/tms" style={primaryLink}>
              Open TMS
            </Link>
          </nav>
        </section>
      )}

      {rows && rows.length > 0 && (
        <section style={card}>
          <h2 style={h2}>Select outlet</h2>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {rows.map((row) => (
              <li
                key={row.store_id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "1rem",
                  padding: "0.65rem 0",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{row.store_name}</div>
                  <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                    {row.store_code} · id {row.store_id}
                  </div>
                </div>
                <button
                  type="button"
                  style={btn}
                  disabled={busyId === row.store_id}
                  onClick={() => selectStore(row)}
                >
                  Use this store
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {activeStored && (
        <button
          type="button"
          style={{ ...btn, marginTop: "1rem", background: "transparent", borderColor: "var(--border)" }}
          onClick={() => {
            clearStoredStore();
            setStoreRev((n) => n + 1);
          }}
        >
          Clear saved outlet
        </button>
      )}

      <p style={{ marginTop: "2rem", fontSize: "0.85rem", color: "var(--muted)" }}>
        API base: <code>{import.meta.env.VITE_API_BASE_URL || "http://localhost:8000 (default)"}</code>
      </p>
    </div>
  );
}

const shell: CSSProperties = {
  maxWidth: 720,
  margin: "0 auto",
  padding: "1.5rem",
};

const header: CSSProperties = { marginBottom: "1.25rem" };

const card: CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: "1rem 1.25rem",
  marginTop: "1rem",
};

const h2: CSSProperties = { margin: "0 0 0.75rem", fontSize: "1.1rem" };

const btn: CSSProperties = {
  padding: "0.45rem 0.85rem",
  borderRadius: 8,
  border: "1px solid var(--accent)",
  background: "var(--surface)",
  color: "var(--text)",
};

const primaryLink: CSSProperties = {
  display: "inline-block",
  padding: "0.5rem 1rem",
  borderRadius: 8,
  background: "var(--accent)",
  color: "#0b0d10",
  textDecoration: "none",
  fontWeight: 600,
};

const bannerError: CSSProperties = {
  background: "rgba(234, 67, 53, 0.12)",
  border: "1px solid var(--warn)",
  color: "#f8d7da",
  padding: "0.75rem 1rem",
  borderRadius: 8,
  marginBottom: "1rem",
};
