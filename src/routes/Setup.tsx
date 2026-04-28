import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchKioskConfig } from "../lib/api";
import type { KioskStoreRow } from "../lib/types";
import {
  clearStoredStore,
  getXStoreIdHeaderValue,
  readStoredStore,
  storeRowToContext,
  writeStoredStore,
} from "../lib/storeContext";

export default function Setup() {
  const [rows, setRows] = useState<KioskStoreRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [storeRev, setStoreRev] = useState(0);
  const stored = readStoredStore();

  useEffect(() => {
    const load = async () => {
      setError(null);
      try {
        const list = await fetchKioskConfig();
        setRows(list);
        if (!stored && list.length === 1) {
          writeStoredStore(storeRowToContext(list[0]!));
          setStoreRev((n) => n + 1);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load outlet list");
        setRows([]);
      }
    };

    void load();
  }, [stored, storeRev]);

  function selectStore(row: KioskStoreRow) {
    setBusyId(row.store_id);
    try {
      writeStoredStore(storeRowToContext(row));
      setStoreRev((n) => n + 1);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="app-shell">
      <header className="page-head">
        <h1 className="page-title">TMS outlet setup</h1>
        <p className="page-subtitle">
          Select once and continue daily without setup. Store details are saved in localStorage.
        </p>
      </header>

      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}

      {stored && (
        <section className="panel">
          <h2 className="section-title">Saved outlet</h2>
          <p className="meta-line">
            <strong>{stored.storeName}</strong> ({stored.storeCode}) · id {stored.storeId}
          </p>
          <p className="muted-line">
            Header value: <code>X-Store-Id: {getXStoreIdHeaderValue(stored)}</code>
          </p>
          <div className="action-row">
            <Link className="btn btn-primary" to="/tms">
              Open TMS board
            </Link>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                clearStoredStore();
                setStoreRev((n) => n + 1);
              }}
            >
              Clear saved outlet
            </button>
          </div>
        </section>
      )}

      <section className="panel">
        <h2 className="section-title">All available outlets</h2>
        {rows === null && <p className="muted-line">Loading outlets...</p>}
        {rows && rows.length === 0 && !error && <p className="muted-line">No active outlet found.</p>}

        {rows && rows.length > 0 && (
          <ul className="store-list">
            {rows.map((row) => (
              <li key={row.store_id} className="store-row">
                <div>
                  <div className="store-name">{row.store_name}</div>
                  <div className="store-meta">
                    {row.store_code} · id {row.store_id}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={busyId === row.store_id}
                  onClick={() => selectStore(row)}
                >
                  Use this outlet
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
