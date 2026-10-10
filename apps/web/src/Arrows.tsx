import { useEffect, useRef, useState } from "react";
import type { TargetChoice } from "@cc/engine";

/**
 * Targeting arrows drawn over the whole table. Each arrow runs from a source element to a
 * target element (or to the mouse while you're choosing), found by CSS selector so the
 * arrows follow cards wherever the layout puts them.
 */
export interface ArrowSpec {
  key: string;
  /** Selectors tried in order; the first one on screen is used. */
  from: string[];
  to: string[] | "cursor";
  color: string;
  /** Faint and dashed: someone is still aiming (not yet on the stack). */
  aiming?: boolean;
}

/** Selector for a target choice's element on screen. */
export function targetSelectors(t: TargetChoice): string[] {
  // In an open picker window first (that's where you're looking), else on the table.
  if (t.kind === "object") return [`[data-pick="${t.id}"]`, `[data-obj="${t.id}"]`];
  if (t.kind === "player") return [`[data-player="${t.id}"]`];
  if (t.kind === "none") return []; // an "up to" target left unchosen
  return [`[data-stack="${t.id}"]`, "[data-stack-tab]"];
}

/**
 * The choices an element on screen could stand for, innermost first: a card or stack item,
 * then the player whose seat it's in (aiming at a player can land anywhere in their area).
 */
function choicesAt(el: Element | null): TargetChoice[] {
  const out: TargetChoice[] = [];
  const hit = el?.closest("[data-obj],[data-pick],[data-stack]") as HTMLElement | null | undefined;
  const id = hit?.dataset.obj ?? hit?.dataset.pick; // data-pick: a card in a picker window (e.g. a graveyard)
  if (id) out.push({ kind: "object", id });
  else if (hit?.dataset.stack) out.push({ kind: "stack", id: hit.dataset.stack });
  const seat = el?.closest("[data-player],[data-seat]") as HTMLElement | null | undefined;
  if (seat) out.push({ kind: "player", id: Number(seat.dataset.player ?? seat.dataset.seat) });
  return out;
}

interface Drawn {
  key: string;
  d: string;
  x2: number;
  y2: number;
  color: string;
  aiming: boolean;
  ring: boolean;
}

function find(selectors: string[]): DOMRect | null {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return r;
  }
  return null;
}

/** An arc bowing upward between two points, ending just short of the target. */
function arc(x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy) || 1;
  // Normal pointing "up" the screen.
  let nx = -dy / dist;
  let ny = dx / dist;
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  const bow = Math.min(220, dist * 0.35);
  const cx = (x1 + x2) / 2 + nx * bow;
  const cy = (y1 + y2) / 2 + ny * bow;
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

export function Arrows({ arrows, snap }: { arrows: ArrowSpec[]; snap?: (t: TargetChoice) => boolean }) {
  const [drawn, setDrawn] = useState<Drawn[]>([]);
  // Always know where the mouse is, so an arrow can start following it the moment you click.
  const mouse = useRef<{ x: number; y: number } | null>(null);
  const spec = useRef({ arrows, snap });
  spec.current = { arrows, snap };

  useEffect(() => {
    const move = (e: MouseEvent) => (mouse.current = { x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", move);
    window.addEventListener("mousedown", move);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mousedown", move);
    };
  }, []);

  // Re-measure every frame: cards move as the layout changes, hover lifts them, panels scroll.
  useEffect(() => {
    let frame = 0;
    let last = "";
    const tick = () => {
      const out: Drawn[] = [];
      for (const a of spec.current.arrows) {
        const from = find(a.from);
        if (!from) continue;
        const x1 = from.left + from.width / 2;
        const y1 = from.top + from.height / 2;
        let x2: number;
        let y2: number;
        let ring = true;
        if (a.to === "cursor") {
          const m = mouse.current;
          if (!m) continue;
          // Snap onto a legal target under the mouse.
          const snap = spec.current.snap;
          const c = snap && choicesAt(document.elementFromPoint(m.x, m.y)).find(snap);
          const r = c ? find(targetSelectors(c)) : null;
          if (r) {
            x2 = r.left + r.width / 2;
            y2 = r.top + r.height / 2;
          } else {
            x2 = m.x;
            y2 = m.y;
            ring = false;
          }
        } else {
          const to = find(a.to);
          if (!to) continue;
          x2 = to.left + to.width / 2;
          y2 = to.top + to.height / 2;
        }
        out.push({ key: a.key, d: arc(x1, y1, x2, y2), x2, y2, color: a.color, aiming: !!a.aiming, ring });
      }
      const sig = JSON.stringify(out);
      if (sig !== last) {
        last = sig;
        setDrawn(out);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  if (!drawn.length) return null;
  const colors = [...new Set(drawn.map((a) => a.color))];
  const markerId = (c: string) => `arrowhead-${c.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg className="arrows" aria-hidden>
      <defs>
        {colors.map((c) => (
          <marker key={c} id={markerId(c)} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={c} />
          </marker>
        ))}
      </defs>
      {drawn.map((a) => (
        <g key={a.key} className={a.aiming ? "arrow aiming" : "arrow"}>
          <path d={a.d} className="arrow-glow" stroke={a.color} />
          <path d={a.d} className="arrow-line" stroke={a.color} markerEnd={`url(#${markerId(a.color)})`} pathLength={1} />
          {a.ring && <circle cx={a.x2} cy={a.y2} r={16} className="arrow-ring" stroke={a.color} />}
        </g>
      ))}
    </svg>
  );
}
