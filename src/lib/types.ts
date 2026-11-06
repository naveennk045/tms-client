export type OrderItemStatus = "NOT_ACCEPTED" | "PREPARING" | "READY" | "COLLECTED";

export interface KioskStoreRow {
  store_id: number;
  store_code: string;
  store_name: string;
  pinelabs_configured?: boolean;
  terminals?: unknown[];
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
  /** Hard-coded menu match from the server; null when the item is not in the menu copy. */
  menu_id?: string | null;
  category?: string | null;
  image?: string | null;
  short?: string | null;
  preparing_at?: string | null;
  ready_at?: string | null;
  has_addons?: boolean;
  first_of_day?: boolean;
}

export type BoardState = "received" | "cooking" | "partial" | "ready";

export type OrderType = "DINEIN" | "TAKEAWAY";

export interface TmsToken {
  kot_code: string;
  /** Short board number ("KTR-101" → "101"). Omitted on older servers. */
  token_number?: string;
  order_id: string;
  order_type?: OrderType | null;
  display_state?: "READY" | "PREPARING";
  board_state?: BoardState;
  /** e.g. "50th order of the day" */
  milestone?: string | null;
  created_at: string;
  lines: TmsLine[];
  /** Omitted on older servers; derive from lines when missing. */
  flags?: TmsTokenFlags;
}

export interface TmsSnapshotPayload {
  store_id: number;
  live_window_minutes: number;
  option: string;
  server_time?: string;
  stats?: TmsStats;
  tokens: TmsToken[];
}

export interface TmsStats {
  orders_today: number;
  category_counts: Record<string, number>;
  on_board: number;
}

export type WsEventType =
  | "SNAPSHOT"
  | "PING"
  | "BOARD_REFRESH"
  | "ITEM_STATUS_CHANGED"
  | "TMS_ANNOUNCE"
  | "TMS_MILESTONE";

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
  /** Batch size for this event, not the line total. */
  quantity: number;
  items_need_be_ready?: number;
  items_need_be_collected?: number;
  order_status: OrderItemStatus;
}

export interface TmsAnnouncePayload extends ItemStatusPayload {
  speech: string;
}

export interface TmsMilestonePayload {
  store_id: number;
  order_id: string;
  kot_code: string;
  token_number: string;
  n: number;
  one: string;
  many: string;
  image: string | null;
  menu_id: string;
  group: boolean;
}

export interface MenuMetaCategory {
  id: string;
  stage: string;
  name: string;
  short: string;
  image: string | null;
  fact: string;
}

export interface MenuMetaItem {
  id: string;
  category: string;
  name: string;
  image: string | null;
  short: string;
  lead: string;
  fact: string;
  signature: boolean;
  traditional: boolean;
  aliases: string[];
  pitch: string;
}

export interface MenuMetaReelSlide {
  image: string | null;
  kicker: string;
  title: string;
  body: string;
}

export interface MenuMetaGroup {
  one: string;
  many: string;
  image: string | null;
}

export interface MenuMetaPayload {
  categories: MenuMetaCategory[];
  items: MenuMetaItem[];
  groups: Record<string, MenuMetaGroup>;
  served_step: number;
  ticker: { k: string; t: string }[];
  reel: MenuMetaReelSlide[];
}
