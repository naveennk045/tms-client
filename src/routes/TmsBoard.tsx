import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { fetchMenuMeta, fetchTmsSnapshot, tmsEventSourceUrl } from "../lib/api";
import { boardState, featuredItem, itemsText, lineIsReady, Menu, ordinal, ts, type CardState } from "../lib/board";
import { shortKot, tokenNumber } from "../lib/status";
import { getXStoreIdHeaderValue, readStoredStore } from "../lib/storeContext";
import { announceToken, primeSpeechSynthesis, speakTmsAnnouncement, type AnnounceLang } from "../lib/speech";
import type {
  MenuMetaPayload,
  TmsAnnouncePayload,
  TmsMilestonePayload,
  TmsSnapshotPayload,
  TmsToken,
  WsEnvelope,
} from "../lib/types";
import TokenCard, { type CardFlags } from "../components/board/TokenCard";
import Spotlight, { type SpotlightContent } from "../components/board/Spotlight";
import { MilestoneFlash, StoryReel, Ticker, TokenModal, Toasts, type ToastData } from "../components/board/Overlays";
import { FullscreenIcon, SearchIcon, SoundIcon } from "../components/board/icons";

const DONE_SHOW_MS = 9000;
const FLAG_MS = 1600;
const TOAST_MS = 9000;
const SPOT_ROTATE_MS = 14000;
const SPOT_BUSY_MS = 25000;
const MILESTONE_MS = 7500;
const IDLE_REEL_MS = 60000;
const REMINDER_MS = 2 * 60 * 1000;
const REFETCH_DEBOUNCE_MS = 250;
const PAGE_MS = 8000;
const LANG_KEY = "ktr_tms_announce_lang";
const LANG_LABEL: Record<AnnounceLang, string> = { en: "English", hi: "हिंदी", both: "English + हिंदी" };
const LANG_NEXT: Record<AnnounceLang, AnnounceLang> = { en: "both", both: "hi", hi: "en" };

function readLang(): AnnounceLang {
  try {
    const v = localStorage.getItem(LANG_KEY);
    if (v === "en" || v === "hi" || v === "both") return v;
  } catch {
    // storage blocked
  }
  return "en";
}

type Filter = "all" | "making" | "ready";

interface Finishing {
  token: TmsToken;
  doneAt: number;
}

interface Prev {
  state: CardState;
  readyLines: Set<number>;
  token: TmsToken;
}

export default function TmsBoard() {
  const stored = useMemo(() => readStoredStore(), []);
  const isSilk = useMemo(() => document.documentElement.dataset.browser === "silk", []);
  const xStore = stored ? getXStoreIdHeaderValue(stored) : "";

  const [snapshot, setSnapshot] = useState<TmsSnapshotPayload | null>(null);
  const [meta, setMeta] = useState<MenuMetaPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(Boolean(document.fullscreenElement));
  const [now, setNow] = useState(() => Date.now());
  const [finishing, setFinishing] = useState<Finishing[]>([]);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [changed, setChanged] = useState<Set<string>>(new Set());
  const [justReady, setJustReady] = useState<Set<number>>(new Set());
  const [servedMs, setServedMs] = useState<Map<string, string>>(new Map());
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const [spot, setSpot] = useState<SpotlightContent | null>(null);
  const [milestones, setMilestones] = useState<TmsMilestonePayload[]>([]);
  const [reelOpen, setReelOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [find, setFind] = useState("");
  const [modalId, setModalId] = useState<string | null>(null);
  const [lang, setLang] = useState<AnnounceLang>(readLang);
  const [page, setPage] = useState({ cur: 1, total: 1 });

  const menu = useMemo(() => new Menu(meta), [meta]);
  const menuRef = useRef(menu);
  menuRef.current = menu;
  const voiceRef = useRef(false);
  voiceRef.current = voiceEnabled;
  const langRef = useRef(lang);
  langRef.current = lang;
  const reminders = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const prevRef = useRef<Map<string, Prev> | null>(null);
  const seq = useRef(0);
  const spotBusyUntil = useRef(0);
  const spotIdx = useRef(0);
  const lastOrderAt = useRef(Date.now());

  /* ---------- helpers that animate one-off moments ---------- */

  const flash = useCallback(<T,>(setter: (fn: (s: Set<T>) => Set<T>) => void, ids: T[]) => {
    if (ids.length === 0) return;
    setter((s) => new Set([...s, ...ids]));
    globalThis.setTimeout(() => {
      setter((s) => {
        const next = new Set(s);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    }, FLAG_MS);
  }, []);

  const pushToast = useCallback((t: Omit<ToastData, "id">, ms = TOAST_MS) => {
    seq.current += 1;
    const id = seq.current;
    setToasts((list) => [...list, { ...t, id }].slice(-3));
    globalThis.setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), ms);
  }, []);

  const showSpot = useCallback((content: Omit<SpotlightContent, "key">, busy: boolean) => {
    seq.current += 1;
    setSpot({ ...content, key: seq.current });
    if (busy) spotBusyUntil.current = Date.now() + SPOT_BUSY_MS;
  }, []);

  const rotateSpot = useCallback(() => {
    if (Date.now() < spotBusyUntil.current) return;
    const picks = menuRef.current.items.filter((m) => m.signature || m.traditional);
    if (picks.length === 0) return;
    const item = picks[spotIdx.current++ % picks.length]!;
    showSpot(
      {
        item,
        badge: item.traditional ? "Taste of Karnataka" : "House favourite",
        kicker: "Have you tried",
        text: `The ${item.name}: ${item.pitch}`,
      },
      false,
    );
  }, [showSpot]);

  /** Calls a ready token once more if it is still waiting at the counter after two minutes. */
  const scheduleReminder = useCallback(
    (orderId: string, num: string) => {
      if (reminders.current.has(orderId)) return;
      const t = globalThis.setTimeout(() => {
        reminders.current.delete(orderId);
        if (prevRef.current?.get(orderId)?.state !== "ready") return;
        pushToast({ token: num, tone: "ready", title: `Token ${num}, a gentle reminder`, body: "Your order is waiting at the counter. Please collect it while it's hot!" });
        if (voiceRef.current) {
          announceToken(num, `Token ${num}, just a gentle reminder. Your food is waiting for you at the counter. Please collect it while it's hot!`, langRef.current, true);
        }
      }, REMINDER_MS);
      reminders.current.set(orderId, t);
    },
    [pushToast],
  );

  useEffect(() => {
    const timers = reminders.current;
    return () => timers.forEach((t) => globalThis.clearTimeout(t));
  }, []);

  /* ---------- snapshot diffing ---------- */

  const applySnapshot = useCallback(
    (payload: TmsSnapshotPayload) => {
      const serverNow = ts(payload.server_time);
      if (serverNow) offsetRef.current = serverNow - Date.now();
      setSnapshot(payload);
      setError(null);

      const next = new Map<string, Prev>();
      for (const t of payload.tokens) {
        next.set(t.order_id, {
          state: boardState(t),
          readyLines: new Set(t.lines.filter(lineIsReady).map((l) => l.id)),
          token: t,
        });
      }
      const prev = prevRef.current;
      prevRef.current = next;
      if (prev === null) return;

      const freshIds: string[] = [];
      const changedIds: string[] = [];
      const readyLineIds: number[] = [];
      for (const [id, cur] of next) {
        const before = prev.get(id);
        const num = tokenNumber(cur.token);
        if (!before) {
          freshIds.push(id);
          lastOrderAt.current = Date.now();
          setReelOpen(false);
          const feature = featuredItem(cur.token, menuRef.current);
          pushToast({
            token: num,
            tone: "",
            title: `Token ${num} · ${itemsText(cur.token)}`,
            body: feature ? `Did you know? ${feature.fact}` : "Fresh from the kitchen in a few minutes.",
          });
          if (feature) {
            showSpot(
              {
                item: feature,
                badge: "Just ordered",
                kicker: `Token ${num} picked`,
                text: `Token ${num} just ordered the ${feature.name}, ${feature.pitch}`,
              },
              true,
            );
          }
          continue;
        }
        cur.readyLines.forEach((lid) => {
          if (!before.readyLines.has(lid)) readyLineIds.push(lid);
        });
        if (before.state === cur.state) continue;
        changedIds.push(id);
        if (cur.state === "partial") {
          const done = cur.token.lines.filter(lineIsReady).map((l) => l.item_name);
          const wait = cur.token.lines.filter((l) => !lineIsReady(l)).map((l) => l.item_name);
          pushToast({
            token: num,
            tone: "partial",
            title: `Token ${num}: part of your order is ready`,
            body: `${done.join(", ") || "Some items"} ready. ${wait.join(", ")} coming up next.`,
          });
        } else if (cur.state === "ready") {
          pushToast({
            token: num,
            tone: "ready",
            title: `Token ${num} is ready`,
            body: `Please collect ${itemsText(cur.token)} at the counter.`,
          });
          scheduleReminder(id, num);
        }
      }

      // Tokens that left the snapshot were collected: show a "Completed" card briefly.
      const gone = [...prev.values()].filter((p) => !next.has(p.token.order_id));
      if (gone.length) {
        const doneAt = Date.now() + offsetRef.current;
        setFinishing((f) => [...f, ...gone.map((p) => ({ token: p.token, doneAt }))]);
        const ids = new Set(gone.map((p) => p.token.order_id));
        globalThis.setTimeout(() => setFinishing((f) => f.filter((x) => !ids.has(x.token.order_id))), DONE_SHOW_MS);
      }

      flash(setFresh, freshIds);
      flash(setChanged, changedIds);
      flash(setJustReady, readyLineIds);
    },
    [flash, pushToast, showSpot, scheduleReminder],
  );

  const loadSnapshot = useCallback(async () => {
    if (!stored) return;
    try {
      applySnapshot(await fetchTmsSnapshot(xStore));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load snapshot");
    }
  }, [stored, xStore, applySnapshot]);

  /** Bursts of kitchen events collapse into one fetch; the server caches the snapshot per change. */
  const scheduleRefetch = useCallback(() => {
    if (refetchTimer.current) globalThis.clearTimeout(refetchTimer.current);
    refetchTimer.current = globalThis.setTimeout(() => {
      refetchTimer.current = null;
      void loadSnapshot();
    }, REFETCH_DEBOUNCE_MS);
  }, [loadSnapshot]);

  useEffect(() => {
    void loadSnapshot();
    fetchMenuMeta()
      .then(setMeta)
      .catch(() => setMeta(null));
  }, [loadSnapshot]);

  /* ---------- live stream ---------- */

  useEffect(() => {
    if (!stored) return;
    const es = new EventSource(tmsEventSourceUrl(stored.storeId));

    es.onmessage = (ev) => {
      const line = ev.data.trim();
      if (!line || line.startsWith(":")) return;
      let msg: WsEnvelope<unknown>;
      try {
        msg = JSON.parse(line) as WsEnvelope<unknown>;
      } catch {
        return;
      }
      const sid = (msg.payload as { store_id?: number } | undefined)?.store_id;
      if (sid !== undefined && sid !== stored.storeId) return;

      if (msg.type === "SNAPSHOT" && msg.payload && typeof msg.payload === "object" && "tokens" in msg.payload) {
        applySnapshot(msg.payload as TmsSnapshotPayload);
      } else if (msg.type === "BOARD_REFRESH") {
        // ITEM_STATUS_CHANGED is always followed by BOARD_REFRESH, so only that one refetches.
        scheduleRefetch();
      } else if (msg.type === "TMS_ANNOUNCE") {
        const p = msg.payload as TmsAnnouncePayload;
        const num = shortKot(p.kot_code);
        pushToast({ token: num, tone: "ready", title: `Calling token ${num}`, body: "Please collect your order at the counter." }, 6000);
        if (voiceRef.current && p.speech) announceToken(num, p.speech, langRef.current);
      } else if (msg.type === "TMS_MILESTONE") {
        const p = msg.payload as TmsMilestonePayload;
        setServedMs((m) => new Map(m).set(p.order_id, `${ordinal(p.n)} ${p.one} served`));
        setMilestones((q) => [...q, p]);
        setReelOpen(false);
        if (voiceRef.current) {
          speakTmsAnnouncement(
            `Celebration time! That's our ${ordinal(p.n)} ${p.one} served today, and it went to token ${p.token_number}. Thank you, Versova!`,
            true,
          );
        }
      }
    };
    es.onerror = () => {
      scheduleRefetch();
    };
    return () => es.close();
  }, [stored, applySnapshot, scheduleRefetch, pushToast]);

  /* ---------- timers ---------- */

  useEffect(() => {
    const t = globalThis.setInterval(() => setNow(Date.now() + offsetRef.current), 1000);
    return () => globalThis.clearInterval(t);
  }, []);

  useEffect(() => {
    if (!meta) return;
    rotateSpot();
    const t = globalThis.setInterval(rotateSpot, SPOT_ROTATE_MS);
    return () => globalThis.clearInterval(t);
  }, [meta, rotateSpot]);

  const currentMilestone = milestones[0] ?? null;
  const dismissMilestone = useCallback(() => setMilestones((q) => q.slice(1)), []);
  useEffect(() => {
    if (!currentMilestone) return;
    const t = globalThis.setTimeout(dismissMilestone, MILESTONE_MS);
    return () => globalThis.clearTimeout(t);
  }, [currentMilestone, dismissMilestone]);

  useEffect(() => {
    if ((meta?.reel.length ?? 0) === 0) return;
    const t = globalThis.setInterval(() => {
      if (Date.now() - lastOrderAt.current > IDLE_REEL_MS) setReelOpen(true);
    }, 5000);
    return () => globalThis.clearInterval(t);
  }, [meta]);

  /* ---------- auto-page when cards overflow the lane ---------- */

  const syncPage = useCallback(() => {
    const g = gridRef.current;
    if (!g) return;
    const total = Math.max(1, Math.ceil((g.scrollHeight - 1) / g.clientHeight));
    const cur = Math.min(total, Math.floor((g.scrollTop + 1) / g.clientHeight) + 1);
    setPage((p) => (p.cur === cur && p.total === total ? p : { cur, total }));
  }, []);

  useEffect(() => {
    const t = globalThis.setInterval(() => {
      const g = gridRef.current;
      if (!g || find.trim() || modalId) return;
      if (g.scrollHeight <= g.clientHeight + 4) {
        if (g.scrollTop) g.scrollTo({ top: 0 });
        return;
      }
      // Next page starts at the first card cut off by the bottom edge, so cards never split.
      const viewBottom = g.scrollTop + g.clientHeight;
      const slots = Array.from(g.querySelectorAll<HTMLElement>(".tk-slot"));
      const next = slots.find((el) => el.offsetTop + el.offsetHeight > viewBottom + 1);
      const top = next && next.offsetTop > g.scrollTop + 1 ? next.offsetTop - 4 : 0;
      g.scrollTo({ top, behavior: "smooth" });
    }, PAGE_MS);
    return () => globalThis.clearInterval(t);
  }, [find, modalId]);

  useEffect(() => {
    syncPage();
  });

  const closeReel = useCallback(() => {
    lastOrderAt.current = Date.now();
    setReelOpen(false);
  }, []);

  /* ---------- fullscreen (Silk TV browser asks on first touch) ---------- */

  const requestFullscreen = useCallback(async () => {
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
    const fn = el.requestFullscreen ?? el.webkitRequestFullscreen;
    if (!fn || document.fullscreenElement) return;
    try {
      await fn.call(el);
    } catch {
      // ignore blocked fullscreen attempts
    }
  }, []);

  useEffect(() => {
    const sync = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  useEffect(() => {
    if (!isSilk) return;
    const trigger = () => void requestFullscreen();
    globalThis.addEventListener("pointerdown", trigger, { once: true });
    globalThis.addEventListener("keydown", trigger, { once: true });
    return () => {
      globalThis.removeEventListener("pointerdown", trigger);
      globalThis.removeEventListener("keydown", trigger);
    };
  }, [isSilk, requestFullscreen]);

  /* ---------- find my token ---------- */

  const cards = useMemo(() => {
    const live = (snapshot?.tokens ?? []).map((t) => ({ token: t, state: boardState(t) as CardState, doneAt: undefined as number | undefined }));
    const done = finishing.map((f) => ({ token: f.token, state: "done" as CardState, doneAt: f.doneAt }));
    // Ready tokens lead so they are always on the first page of a busy board.
    const rank: Record<CardState, number> = { ready: 0, partial: 1, cooking: 2, received: 2, done: 3 };
    return [...live, ...done].sort(
      (a, b) => rank[a.state] - rank[b.state] || (ts(a.token.created_at) ?? 0) - (ts(b.token.created_at) ?? 0),
    );
  }, [snapshot, finishing]);

  const query = find.trim();
  const foundId = query ? cards.find((c) => tokenNumber(c.token) === query)?.token.order_id ?? null : null;
  useEffect(() => {
    if (!foundId) return;
    document.querySelector(`[data-order="${CSS.escape(foundId)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [foundId]);

  if (!stored) {
    return <Navigate to="/setup" replace />;
  }

  const visible = cards.filter((c) => {
    if (filter === "making") return c.state === "received" || c.state === "cooking" || c.state === "partial";
    if (filter === "ready") return c.state === "ready" || c.state === "done";
    return true;
  });
  const making = cards.filter((c) => c.state === "received" || c.state === "cooking" || c.state === "partial").length;
  const readyCount = cards.filter((c) => c.state === "ready").length;
  const hint = [
    making ? `${making} being made` : "",
    readyCount ? `${readyCount} ready` : "",
    page.total > 1 ? `Page ${page.cur} of ${page.total}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const stats = snapshot?.stats;
  const modalCard = modalId ? cards.find((c) => c.token.order_id === modalId) : undefined;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src="/img/logo.png" alt="KTR" />
          <div className="brand-sub">
            <b>Karnataka Tiffin Room</b>
            <span>{stored.storeName.replace(/^KTR\s*/i, "") || stored.storeCode} · Token board</span>
          </div>
        </div>
        {stats && (
          <div className="stats">
            <span className="stat">
              Orders today <b>{stats.orders_today}</b>
            </span>
            <span className="stat">
              Davangere Doses <b>{stats.category_counts.davangere ?? 0}</b>
            </span>
            <span className="stat">
              On the board <b>{stats.on_board}</b>
            </span>
          </div>
        )}
        <time className="clock">{new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
        <div className="controls">
          <button
            className="icon-btn"
            type="button"
            aria-pressed={voiceEnabled}
            title="Call out ready tokens by voice"
            onClick={() => {
              if (!voiceEnabled) primeSpeechSynthesis();
              setVoiceEnabled((v) => !v);
            }}
          >
            <SoundIcon />
            {voiceEnabled ? "Announcements on" : "Announcements"}
          </button>
          {voiceEnabled && (
            <button
              className="icon-btn"
              type="button"
              title="Announcement language"
              onClick={() => {
                const next = LANG_NEXT[lang];
                setLang(next);
                try {
                  localStorage.setItem(LANG_KEY, next);
                } catch {
                  // storage blocked
                }
              }}
            >
              {LANG_LABEL[lang]}
            </button>
          )}
          {!isFullscreen && (
            <button className="icon-btn" type="button" onClick={() => void requestFullscreen()}>
              <FullscreenIcon />
              Full screen
            </button>
          )}
          <Link className="icon-btn" to="/setup">
            Setup
          </Link>
        </div>
      </header>

      {error && (
        <div className="board-error" role="alert">
          Can't reach the server. Retrying… <small>{error.slice(0, 140)}</small>
        </div>
      )}

      <main className="board">
        <section className="lane status-lane" aria-labelledby="h-status">
          <div className="lane-head">
            <h2 id="h-status">
              <span className="dot" />
              Order status
            </h2>
            <span className="hint">{hint}</span>
          </div>
          <div className="tk-tools">
            <div className="seg" role="group" aria-label="Show">
              {(
                [
                  ["all", "All"],
                  ["making", "Being made"],
                  ["ready", "Ready"],
                ] as [Filter, string][]
              ).map(([k, label]) => (
                <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>
                  {label}
                </button>
              ))}
            </div>
            <label className="tk-find">
              <SearchIcon />
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                placeholder="Find my token"
                aria-label="Find my token"
                value={find}
                onChange={(e) => {
                  setFind(e.target.value.replace(/\D/g, ""));
                  setFilter("all");
                }}
              />
              {query && !foundId && <span className="tk-find-miss">Not on the board</span>}
            </label>
          </div>
          <div className="status-grid" ref={gridRef} onScroll={syncPage}>
            {snapshot === null && <p className="empty">Loading tokens…</p>}
            {snapshot !== null && visible.length === 0 && (
              <p className="empty">
                {filter === "ready" ? "Nothing ready yet. Your token shows up here the moment it is." : "No orders on the board right now."}
              </p>
            )}
            {visible.map((c) => {
              const flags: CardFlags = {
                fresh: fresh.has(c.token.order_id),
                changed: changed.has(c.token.order_id),
                justReadyLines: justReady,
                found: foundId === c.token.order_id,
              };
              return (
                <div key={c.token.order_id} data-order={c.token.order_id} className="tk-slot">
                  <TokenCard
                    token={c.token}
                    state={c.state}
                    now={now}
                    menu={menu}
                    servedMs={servedMs.get(c.token.order_id)}
                    doneAt={c.doneAt}
                    flags={flags}
                    onOpen={setModalId}
                  />
                </div>
              );
            })}
          </div>
        </section>
        <Spotlight spot={spot} />
      </main>

      <Ticker facts={meta?.ticker ?? []} />
      <Toasts toasts={toasts} />

      {modalCard && (
        <TokenModal token={modalCard.token} state={modalCard.state} now={now} menu={menu} onClose={() => setModalId(null)} />
      )}
      {reelOpen && !currentMilestone && meta && (
        <StoryReel
          slides={meta.reel}
          readyTokens={cards.filter((c) => c.state === "ready").map((c) => tokenNumber(c.token))}
          onClose={closeReel}
        />
      )}
      {currentMilestone && <MilestoneFlash key={`${currentMilestone.order_id}-${currentMilestone.n}-${currentMilestone.one}`} ev={currentMilestone} onClose={dismissMilestone} />}
    </div>
  );
}

