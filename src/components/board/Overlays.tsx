import { useEffect, useState, type CSSProperties } from "react";
import { fmtClock, imageUrl, itemStage, lineIsReady, ordinal, STATE_LABEL, tokenReadyAt, ts, type CardState, type Menu } from "../../lib/board";
import { tokenNumber } from "../../lib/status";
import type { MenuMetaReelSlide, TmsMilestonePayload, TmsToken } from "../../lib/types";
import { CheckIcon, StateIcon } from "./icons";

/* ---------- Toasts ---------- */

export interface ToastData {
  id: number;
  token: string;
  tone: "" | "partial" | "ready";
  title: string;
  body: string;
}

export function Toasts({ toasts }: Readonly<{ toasts: ToastData[] }>) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <div className={`toast-tk ${t.tone}`}>{t.token}</div>
          <div>
            <div className="tt">{t.title}</div>
            <div className="tb">{t.body}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- Ticker ---------- */

export function Ticker({ facts }: Readonly<{ facts: { k: string; t: string }[] }>) {
  if (facts.length === 0) return null;
  return (
    <div className="ticker" aria-hidden="true">
      <div className="ticker-track">
        {facts.map((f) => (
          <span key={f.k}>
            <b>{f.k}</b>
            {f.t}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---------- "100th filter coffee" celebration ---------- */

const RAIN_COLORS = ["#fa7700", "#ffc41f", "#803a4d", "#4d5e21", "#f6dfc6", "#ffffff"];

export function MilestoneFlash({ ev, onClose }: Readonly<{ ev: TmsMilestonePayload; onClose: () => void }>) {
  const [count, setCount] = useState(Math.max(0, ev.n - 20));
  const [popped, setPopped] = useState(false);
  const [rain] = useState(() =>
    Array.from({ length: 70 }, (_, i) => ({
      left: `${(Math.random() * 100).toFixed(1)}%`,
      background: RAIN_COLORS[i % RAIN_COLORS.length],
      animationDelay: `${(Math.random() * 2.2).toFixed(2)}s`,
      animationDuration: `${(2.4 + Math.random() * 2).toFixed(2)}s`,
      "--r": `${Math.round(Math.random() * 720)}deg`,
    })),
  );

  useEffect(() => {
    const from = Math.max(0, ev.n - 20);
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / 1400);
      setCount(Math.round(from + (ev.n - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
      else setPopped(true);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [ev.n]);

  const src = imageUrl(ev.image);
  const label = ev.n === 1 ? ev.one : ev.many;
  const suffix = ordinal(count).slice(String(count).length);

  return (
    <div className="sflash on" onClick={onClose} role="presentation">
      <div className="sf-flash" />
      <div className="sf-rays">
        {Array.from({ length: 12 }, (_, r) => (
          <span key={r} style={{ transform: `rotate(${r * 30}deg)` }} />
        ))}
      </div>
      <div className="sf-rain">
        {rain.map((s, i) => (
          <i key={i} style={s as CSSProperties} />
        ))}
      </div>
      <div className="sf-card" role="alert">
        {src ? (
          <div className="sf-pic" style={{ backgroundImage: `url(${src})` }} />
        ) : (
          <div className="sf-pic pl">{ev.one.split(" ")[0]}</div>
        )}
        <div className="sf-k">Milestone unlocked</div>
        <div className={`sf-n ${popped ? "pop" : ""}`}>
          <span>{count}</span>
          <small>{suffix}</small>
        </div>
        <div className="sf-u">{label} served today</div>
        <p className="sf-t">
          It went to <b>token {ev.token_number}</b>. Thank you, Versova, for making our kitchen this busy!
        </p>
      </div>
    </div>
  );
}

/* ---------- Story reel (only while the board is empty) ---------- */

const REEL_MS = 8000;

export function StoryReel({ slides, onClose }: Readonly<{ slides: MenuMetaReelSlide[]; onClose: () => void }>) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = globalThis.setTimeout(() => setI((n) => (n + 1) % slides.length), REEL_MS);
    return () => globalThis.clearTimeout(t);
  }, [i, slides.length]);

  return (
    <div className="reel" onClick={onClose} role="presentation">
      {slides.map((s, n) => {
        const src = imageUrl(s.image);
        return (
          <div key={s.title} className={`reel-slide ${n === i ? "on" : ""}`} aria-hidden={n !== i}>
            {src ? <img src={src} alt="" /> : <div className="plaidbg" />}
            <div className="reel-copy">
              <span className="k">{s.kicker}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </div>
          </div>
        );
      })}
      <div className="reel-top">
        <div className="reel-bars">
          {slides.map((s, n) => (
            <i key={s.title} className={n < i ? "done" : n === i ? "cur" : ""} style={{ "--dur": `${REEL_MS}ms` } as CSSProperties}>
              <b key={n === i ? `c${i}` : "x"} />
            </i>
          ))}
        </div>
        <div className="reel-head">
          <img src="/img/logo.png" alt="KTR" />
          <button type="button" className="icon-btn reel-close" onClick={onClose}>
            Back to tokens
          </button>
        </div>
      </div>
      <div className="reel-foot">
        <span className="cta">
          Order at the kiosk. <b>Watch this screen</b> for your token.
        </span>
      </div>
    </div>
  );
}

/* ---------- Token details (tap a card) ---------- */

export function TokenModal({
  token,
  state,
  now,
  menu,
  onClose,
}: Readonly<{ token: TmsToken; state: CardState; now: number; menu: Menu; onClose: () => void }>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const created = ts(token.created_at) ?? now;
  const starts = token.lines.map((l) => ts(l.preparing_at)).filter((t): t is number => t !== null);
  const started = starts.length ? Math.min(...starts) : null;
  const readyAt = tokenReadyAt(token);
  const time = (t: number | null) =>
    t ? new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";
  const steps: [string, boolean, string][] = [
    ["Order received", true, time(created)],
    ["In the kitchen", started !== null || state !== "received", time(started)],
    ["Ready to collect", state === "ready" || state === "done", time(readyAt)],
    ["Collected", state === "done", ""],
  ];
  const feature = token.lines
    .map((l) => menu.item(l))
    .filter((m) => m && m.category !== "addon")
    .sort((a, b) => Number(b!.traditional) - Number(a!.traditional))[0];

  return (
    <div className="tk-modal" onClick={(e) => e.target === e.currentTarget && onClose()} role="presentation">
      <div className={`tkm-card tk-${state}`} role="dialog" aria-label={`Token ${tokenNumber(token)} details`}>
        <button type="button" className="tkm-x" onClick={onClose} aria-label="Close">
          ×
        </button>
        <div className="tkm-top">
          <span className="tkm-num">{tokenNumber(token)}</span>
          <div>
            <span className="tk-st">
              <StateIcon state={state} />
              {STATE_LABEL[state]}
            </span>
            <div className="tkm-sub">
              <span>{fmtClock(now - created)}</span> since order ·{" "}
              {token.order_type === "TAKEAWAY" ? "Parcel" : "Dine-in"}
            </div>
          </div>
        </div>
        <ol className="tkm-steps">
          {steps.map(([label, on, t]) => (
            <li key={label} className={on ? "on" : ""}>
              <b>{label}</b>
              <span>{on ? t : ""}</span>
            </li>
          ))}
        </ol>
        <ul className="tk-items">
          {token.lines.map((l) => {
            const ready = lineIsReady(l);
            const lr = ts(l.ready_at);
            return (
              <li key={l.id} className={`ti ti-${ready ? 3 : l.order_status === "NOT_ACCEPTED" ? 0 : 1}`}>
                <span className="ti-ic" aria-hidden="true">
                  {ready ? <CheckIcon /> : <i />}
                </span>
                <span className="ti-name">
                  <b>{l.quantity}×</b> {l.item_name}
                  {menu.item(l)?.short && <small>{menu.item(l)?.short}</small>}
                </span>
                <span className="ti-stage">{itemStage(l, menu)}</span>
                <span className={`ti-time ${ready ? "done" : ""}`}>
                  {ready ? (lr ? `Ready in ${fmtClock(lr - created)}` : "Ready") : fmtClock(now - created)}
                </span>
              </li>
            );
          })}
        </ul>
        {feature && (
          <p className="tkm-fact">
            <b>Did you know?</b> {feature.fact}
          </p>
        )}
      </div>
    </div>
  );
}
