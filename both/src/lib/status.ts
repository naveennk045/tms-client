import type { OrderItemStatus } from "./types";

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
