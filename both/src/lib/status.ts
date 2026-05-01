import type { KdsLine, OrderItemStatus, TmsLine, TmsTokenFlags } from "./types";

/** Accepts JSON numbers and numeric strings from some backends. */
export function readOptionalNonNegativeInt(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.floor(value));
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return Math.max(0, Math.floor(n));
  }
  return undefined;
}

const CHAIN: OrderItemStatus[] = [
  "NOT_ACCEPTED",
  "PREPARING",
  "READY",
  "COLLECTED",
];

export function nextOrderItemStatus(
  current: OrderItemStatus,
): OrderItemStatus | null {
  const i = CHAIN.indexOf(current);
  if (i === -1 || i >= CHAIN.length - 1) return null;
  return CHAIN[i + 1] ?? null;
}

export function statusLabel(s: OrderItemStatus): string {
  switch (s) {
    case "NOT_ACCEPTED":
      return "New";
    case "PREPARING":
      return "Preparing";
    case "READY":
      return "Ready";
    case "COLLECTED":
      return "Collected";
    default:
      return s;
  }
}

/** Infer counters when the API omits them (older backends). */
export function lineItemsNeedReady(line: Pick<KdsLine | TmsLine, "quantity" | "order_status" | "items_need_be_ready">): number {
  const explicit = readOptionalNonNegativeInt(line.items_need_be_ready);
  if (explicit !== undefined) return explicit;
  if (line.order_status === "COLLECTED" || line.order_status === "READY") return 0;
  return line.quantity;
}

export function lineItemsNeedCollected(
  line: Pick<KdsLine | TmsLine, "quantity" | "order_status" | "items_need_be_collected">,
): number {
  const explicit = readOptionalNonNegativeInt(line.items_need_be_collected);
  if (explicit !== undefined) return explicit;
  if (line.order_status === "COLLECTED") return 0;
  if (line.order_status === "READY") return line.quantity;
  return 0;
}

export function lineIsFullyDone(line: Pick<KdsLine | TmsLine, "quantity" | "order_status" | "items_need_be_ready" | "items_need_be_collected">): boolean {
  return lineItemsNeedReady(line) === 0 && lineItemsNeedCollected(line) === 0;
}

/** Matches server `flags` when present; otherwise derives from line counters and status. */
export function tmsTokenFlagsFromLines(lines: TmsLine[]): TmsTokenFlags {
  let has_ready_for_pickup = false;
  let has_in_kitchen = false;
  for (const line of lines) {
    const needReady = lineItemsNeedReady(line);
    const needCollect = lineItemsNeedCollected(line);
    if (needCollect > 0 || line.order_status === "READY") has_ready_for_pickup = true;
    if (needReady > 0 || line.order_status === "NOT_ACCEPTED" || line.order_status === "PREPARING") {
      has_in_kitchen = true;
    }
  }
  return { has_ready_for_pickup, has_in_kitchen };
}

export function resolveTmsTokenFlags(lines: TmsLine[], flags?: TmsTokenFlags): TmsTokenFlags {
  return flags ?? tmsTokenFlagsFromLines(lines);
}
