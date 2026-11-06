import { useEffect, useState } from "react";
import { imageUrl } from "../../lib/board";
import type { MenuMetaItem } from "../../lib/types";

export interface SpotlightContent {
  key: number;
  item: MenuMetaItem;
  badge: string;
  kicker: string;
  text: string;
}

/** Right-hand panel: dish photo, kicker, title and a typed-out story. */
export default function Spotlight({ spot }: Readonly<{ spot: SpotlightContent | null }>) {
  if (!spot) return <section className="lane spot" />;
  const src = imageUrl(spot.item.image);
  return (
    <section className="lane spot" aria-labelledby="spot-title">
      <div className="spot-media" key={`m${spot.key}`}>
        <div className="spot-badge">
          <span className="live" />
          {spot.badge}
        </div>
        {src ? <img alt={spot.item.name} src={src} /> : <div className="plaid-word">{spot.item.name}</div>}
      </div>
      <div className="spot-body">
        <div className="spot-kicker">{spot.kicker}</div>
        <h2 className="spot-title" id="spot-title">
          {spot.item.name}
        </h2>
        <Typewriter key={`t${spot.key}`} text={spot.text} />
        <div className="spot-cta">
          <div>
            <b>Tempted?</b> <span>Order at the kiosk, it's made fresh.</span>
          </div>
          <div className="spot-tags">
            {spot.item.signature && <span className="tag sig">Signature</span>}
            {spot.item.traditional && <span className="tag trad">Traditional</span>}
          </div>
        </div>
      </div>
    </section>
  );
}

function Typewriter({ text }: Readonly<{ text: string }>) {
  const reduce = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const [n, setN] = useState(reduce ? text.length : 0);
  useEffect(() => {
    if (n >= text.length) return;
    const t = globalThis.setTimeout(() => setN((x) => x + 2), 28);
    return () => globalThis.clearTimeout(t);
  }, [n, text.length]);
  return (
    <p className="spot-text">
      {text.slice(0, n)}
      {n < text.length && <span className="caret" />}
    </p>
  );
}
