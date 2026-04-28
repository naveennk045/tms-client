import type { OrderItemStatus } from "./types";

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
