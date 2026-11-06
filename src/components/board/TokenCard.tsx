import {
  STATE_LABEL,
  fmtClock,
  itemStage,
  lineIsReady,
  mentionsFor,
  progress,
  tokenReadyAt,
  ts,
  type CardState,
  type Menu,
} from "../../lib/board";
import { tokenNumber } from "../../lib/status";
import type { TmsToken } from "../../lib/types";
import { CheckIcon, Confetti, StarIcon, StateIcon } from "./icons";

export interface CardFlags {
  fresh: boolean;
  changed: boolean;
  justReadyLines: Set<number>;
  found: boolean;
}

interface Props {
  token: TmsToken;
  state: CardState;
  now: number;
  menu: Menu;
  servedMs?: string;
  doneAt?: number;
  flags: CardFlags;
  onOpen: (orderId: string) => void;
}

export default function TokenCard({ token, state, now, menu, servedMs, doneAt, flags, onOpen }: Readonly<Props>) {
  const created = ts(token.created_at) ?? now;
  const readyAt = tokenReadyAt(token);
  const num = tokenNumber(token);
  const mentions = mentionsFor(token, menu, servedMs);
  const cls = [
    "tk",
    `tk-${state}`,
    token.milestone ? "is-ms" : "",
    flags.fresh ? "fresh" : "",
    flags.changed ? "changed" : "",
    flags.found ? "found" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article
      className={cls}
      data-tk={num}
      tabIndex={0}
      aria-label={`Token ${num}: ${STATE_LABEL[state]}. Tap for details.`}
      onClick={() => onOpen(token.order_id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(token.order_id);
        }
      }}
    >
      <header className="tk-head">
        <span className="tk-num">{num}</span>
        <div className="tk-meta">
          <span className="tk-st">
            <StateIcon state={state} />
            {STATE_LABEL[state]}
          </span>
          <span className="tk-timer">
            {state === "done" ? (
              <>Placed {new Date(created).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</>
            ) : (
              <>
                <span>{fmtClock(now - created)}</span> since order
              </>
            )}{" "}
            · <b className="tk-type">{token.order_type === "TAKEAWAY" ? "Parcel" : "Dine-in"}</b>
          </span>
        </div>
      </header>

      {mentions.length > 0 && (
        <div className="tk-mentions">
          {mentions.map((m) => (
            <span key={m.text} className={`mn mn-${m.kind}`}>
              {m.kind === "ms" && <StarIcon />}
              {m.text}
            </span>
          ))}
        </div>
      )}

      <ul className="tk-items">
        {token.lines.map((l) => {
          const ready = lineIsReady(l);
          const lineReady = ts(l.ready_at);
          const step = ready ? 3 : l.order_status === "NOT_ACCEPTED" && l.items_need_be_collected === 0 ? 0 : 1;
          return (
            <li key={l.id} className={`ti ti-${step} ${flags.justReadyLines.has(l.id) ? "just" : ""}`}>
              <span className="ti-ic" aria-hidden="true">
                {ready ? <CheckIcon /> : <i />}
              </span>
              <span className="ti-name">
                <b>{l.quantity}×</b> {l.item_name}
                {l.category === "addon" && <em>add-on</em>}
              </span>
              <span className="ti-stage">{itemStage(l, menu)}</span>
              {ready ? (
                <span className="ti-time done">{lineReady ? `Ready in ${fmtClock(lineReady - created)}` : "Ready"}</span>
              ) : (
                <span className="ti-time">{fmtClock(now - created)}</span>
              )}
            </li>
          );
        })}
      </ul>

      {state === "done" ? (
        <div className="tk-done-sum">
          <span className="tds-k">Completed in</span>
          <span className="tds-v">{fmtClock((doneAt ?? now) - created)}</span>
          <span className="tds-s">
            {readyAt ? `Kitchen time ${fmtClock(readyAt - created)} · ` : ""}Enjoy your tiffin!
          </span>
        </div>
      ) : state === "ready" ? (
        <div className="tk-foot ready">
          Please collect at the counter
          {readyAt && <span>Ready in {fmtClock(readyAt - created)}</span>}
        </div>
      ) : (
        <div className="tk-bar">
          <i style={{ width: `${Math.max(6, progress(token))}%` }} />
        </div>
      )}

      {flags.changed && state === "ready" && <Confetti count={18} radius={[70, 180]} className="tk-confetti" />}
    </article>
  );
}
