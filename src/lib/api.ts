import type { KioskStoreRow, TmsSnapshotPayload } from "./types";
import { getApiBaseUrl } from "./storeContext";

function buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
  const base = getApiBaseUrl();
  const url = new URL(path.startsWith("/") ? path : `/${path}`, `${base}/`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    throw new Error(text || `${res.status} ${res.statusText}`);
  }
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

export async function fetchKioskConfig(): Promise<KioskStoreRow[]> {
  const res = await fetch(buildUrl("/admin/kiosk-config"));
  return parseJson<KioskStoreRow[]>(res);
}

export async function fetchTmsSnapshot(xStoreId: string): Promise<TmsSnapshotPayload> {
  const res = await fetch(buildUrl("/tms/snapshot"), {
    headers: { "X-Store-Id": xStoreId },
  });
  return parseJson<TmsSnapshotPayload>(res);
}

export function tmsEventSourceUrl(storeId: number): string {
  return buildUrl("/tms/stream", { store_id: storeId });
}
