import { lineItemsNeedReady } from "./status";
import type { BoardState, MenuMetaItem, MenuMetaPayload, TmsLine, TmsToken } from "./types";

export type CardState = BoardState | "done";

export const STATE_LABEL: Record<CardState, string> = {
  received: "Order received",
  cooking: "Being made",
  partial: "Partly ready",
  ready: "Ready to collect",
  done: "Completed",
};

/** m:ss for a duration in ms. */
export function fmtClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export function ordinal(n: number): string {
  const v = n % 100;
  const suffix = v >= 11 && v <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}

export function ts(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/** Server sends ``board_state``; older servers only send line counters. */
export function boardState(token: TmsToken): BoardState {
  if (token.board_state) return token.board_state;
  const need = token.lines.reduce((n, l) => n + lineItemsNeedReady(l), 0);
  if (need === 0) return "ready";
  if (token.lines.some((l) => lineItemsNeedReady(l) < l.quantity)) return "partial";
  if (token.lines.some((l) => l.order_status === "PREPARING")) return "cooking";
  return "received";
}

export function lineReadyQty(line: TmsLine): number {
  return Math.max(0, line.quantity - lineItemsNeedReady(line));
}

export function lineIsReady(line: TmsLine): boolean {
  return lineItemsNeedReady(line) === 0;
}

/** 0 queued · 1 cooking · 3 ready, weighted by ready portions (matches the design's bar). */
export function progress(token: TmsToken): number {
  if (token.lines.length === 0) return 0;
  let t = 0;
  for (const l of token.lines) {
    const readyShare = l.quantity > 0 ? lineReadyQty(l) / l.quantity : 0;
    t += readyShare * 3;
    if (readyShare < 1 && l.order_status !== "NOT_ACCEPTED") t += (1 - readyShare) * 1;
  }
  return Math.round((t / (token.lines.length * 3)) * 100);
}

export class Menu {
  private byId = new Map<string, MenuMetaItem>();
  private byName = new Map<string, MenuMetaItem>();
  readonly stageByCat = new Map<string, string>();

  constructor(readonly meta: MenuMetaPayload | null) {
    for (const item of meta?.items ?? []) {
      this.byId.set(item.id, item);
      for (const n of [item.name, ...item.aliases]) {
        const k = normalise(n);
        if (!this.byName.has(k)) this.byName.set(k, item);
      }
    }
    for (const c of meta?.categories ?? []) this.stageByCat.set(c.id, c.stage);
  }

  item(line: Pick<TmsLine, "menu_id" | "item_name">): MenuMetaItem | null {
    if (line.menu_id) return this.byId.get(line.menu_id) ?? null;
    return this.byName.get(normalise(line.item_name)) ?? null;
  }

  get items(): MenuMetaItem[] {
    return this.meta?.items ?? [];
  }
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function itemStage(line: TmsLine, menu: Menu): string {
  if (lineIsReady(line)) return "Ready";
  const ready = lineReadyQty(line);
  if (line.order_status === "NOT_ACCEPTED" && ready === 0) return "In queue";
  const stage = (line.category && menu.stageByCat.get(line.category)) || "Being made";
  return ready > 0 ? `${ready} of ${line.quantity} ready · ${stage}` : stage;
}

/** The dish a spotlight or fact should feature: traditional first, add-ons last. */
export function featuredItem(token: TmsToken, menu: Menu): MenuMetaItem | null {
  const items = token.lines
    .map((l) => menu.item(l))
    .filter((m): m is MenuMetaItem => m !== null && m.category !== "addon");
  items.sort((a, b) => Number(b.traditional) - Number(a.traditional) || Number(b.signature) - Number(a.signature));
  return items[0] ?? null;
}

export interface Mention {
  kind: "ms" | "first" | "feast" | "sig";
  text: string;
}

const CLASSIC_CATS = new Set(["rice", "vada", "dessert"]);

export function mentionsFor(token: TmsToken, menu: Menu, servedMs?: string): Mention[] {
  const out: Mention[] = [];
  if (servedMs) out.push({ kind: "ms", text: `${servedMs}!` });
  if (token.milestone) out.push({ kind: "ms", text: token.milestone });
  const first = token.lines.find((l) => l.first_of_day && l.category !== "addon");
  if (first) out.push({ kind: "first", text: `First ${menu.item(first)?.name ?? first.item_name} of the day` });
  const dishes = token.lines.reduce((n, l) => n + (l.category === "addon" ? 0 : l.quantity), 0);
  if (dishes >= 5) out.push({ kind: "feast", text: `Feast mode: ${dishes} dishes` });
  const classic = token.lines
    .map((l) => menu.item(l))
    .find((m) => m && m.traditional && (CLASSIC_CATS.has(m.category) || m.id === "rc-puli"));
  if (classic && out.length < 2) out.push({ kind: "sig", text: `Karnataka classic: ${classic.name}` });
  if (token.lines.some((l) => l.has_addons) && out.length < 2) out.push({ kind: "first", text: "Made your way" });
  return out.slice(0, 3);
}

export function itemsText(token: TmsToken, onlyReady = false): string {
  return token.lines
    .filter((l) => !onlyReady || lineReadyQty(l) > 0)
    .map((l) => `${l.quantity > 1 ? `${l.quantity} × ` : ""}${l.item_name}`)
    .join(", ");
}

export function tokenReadyAt(token: TmsToken): number | null {
  const all = token.lines.map((l) => ts(l.ready_at));
  if (all.some((t) => t === null)) return null;
  return Math.max(...(all as number[]));
}

export function imageUrl(key: string | null | undefined): string | null {
  return key ? `/img/${key}.jpg` : null;
}
