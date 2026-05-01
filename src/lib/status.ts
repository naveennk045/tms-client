import type { OrderItemStatus, TmsLine, TmsTokenFlags } from "./types";

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

export function lineItemsNeedReady(line: Pick<TmsLine, "quantity" | "order_status" | "items_need_be_ready">): number {
  if (typeof line.items_need_be_ready === "number") return line.items_need_be_ready;
  if (line.order_status === "COLLECTED" || line.order_status === "READY") return 0;
  return line.quantity;
}

export function lineItemsNeedCollected(
  line: Pick<TmsLine, "quantity" | "order_status" | "items_need_be_collected">,
): number {
  if (typeof line.items_need_be_collected === "number") return line.items_need_be_collected;
  if (line.order_status === "COLLECTED") return 0;
  if (line.order_status === "READY") return line.quantity;
  return 0;
}

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
