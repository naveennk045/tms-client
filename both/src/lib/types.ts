export type OrderItemStatus =
  | "NOT_ACCEPTED"
  | "PREPARING"
  | "READY"
  | "COLLECTED";

export interface KioskStoreRow {
  store_id: number;
  store_code: string;
  store_name: string;
  pinelabs_configured?: boolean;
  terminals?: unknown[];
}

export type OrderType = "DINEIN" | "TAKEAWAY";

export interface KdsLine {
  id: number;
  sku_code?: string;
  item_name: string;
  /** Total units ordered on this line (not the PATCH batch size). */
  quantity: number;
  /** Units still to be marked READY in kitchen. */
  items_need_be_ready?: number;
  /** Units ready at counter, not yet COLLECTED. */
  items_need_be_collected?: number;
  order_status: OrderItemStatus;
}

export interface KdsOrder {
  id: number;
  store_id: number;
  order_id: string;
  order_type?: OrderType;
  kot_code: string;
  kot_number?: number;
  kot_date?: string;
  created_at: string;
  lines: KdsLine[];
}

export interface ClubbedTotal {
  item_name: string;
  quantity: number;
}

export interface KdsBoardPayload {
  store_id: number;
  live_window_minutes: number;
  option: string;
  max_rows: number;
  orders: KdsOrder[];
  clubbed_totals: ClubbedTotal[];
}

export interface TmsTokenFlags {
  has_ready_for_pickup: boolean;
  has_in_kitchen: boolean;
}

export interface TmsLine {
  id: number;
  item_name: string;
  quantity: number;
  items_need_be_ready?: number;
  items_need_be_collected?: number;
  order_status: OrderItemStatus;
}

export interface TmsToken {
  kot_code: string;
  order_id: string;
  created_at: string;
  lines: TmsLine[];
  /** Omitted on older servers; derive from lines when missing. */
  flags?: TmsTokenFlags;
}

export interface TmsSnapshotPayload {
  store_id: number;
  live_window_minutes: number;
  option: string;
  tokens: TmsToken[];
}

export type WsEventType =
  | "SNAPSHOT"
  | "PING"
  | "BOARD_REFRESH"
  | "ITEM_STATUS_CHANGED"
  | "TMS_ANNOUNCE";

export interface WsEnvelope<T = unknown> {
  type: WsEventType | string;
  payload: T;
}

export interface ItemStatusPayload {
  store_id: number;
  line_id: number;
  order_id: string;
  kot_code: string;
  item_name: string;
  /** Batch size for this event/PATCH response, not the line total. */
  quantity: number;
  items_need_be_ready?: number;
  items_need_be_collected?: number;
  order_status: OrderItemStatus;
}

export interface TmsAnnouncePayload extends ItemStatusPayload {
  speech: string;
}

/** Response from PATCH /kds/items/{line_id}/status — `quantity` is this batch, not line total. */
export interface KdsPatchLineResponse {
  store_id: number;
  line_id: number;
  order_id: string;
  kot_code: string;
  item_name: string;
  quantity: number;
  items_need_be_ready: number;
  items_need_be_collected: number;
  order_status: OrderItemStatus;
}
