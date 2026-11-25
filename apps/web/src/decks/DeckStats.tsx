// The deck builder's statistics: mana curve, colors, opening-hand lands, card types (engine deckbuilding/stats.ts).

import { useState, type ReactNode } from "react";
import { COLORS, type DeckStats as Stats } from "@cc/engine";
import { Pip } from "../Mana";

const pct = (p: number) => `${Math.round(p * 100)}%`;
const COLOR_NAME: Record<string, string> = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green", C: "Colorless" };

/** A chart's hover note: what the mark under the pointer stands for. */
function useTip() {
  const [tip, setTip] = useState<string | null>(null);
  const hover = (text: string) => ({ onMouseEnter: () => setTip(text), onMouseLeave: () => setTip(null), onFocus: () => setTip(text), onBlur: () => setTip(null), tabIndex: 0, "aria-label": text });
  const view = <div className="chart-tip" aria-hidden={!tip}>{tip ?? " "}</div>;
  return { hover, view };
}

function Tile({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="stat-tile">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {note && <div className="stat-note">{note}</div>}
    </div>
  );
}

export function DeckStats({ stats }: { stats: Stats }) {
  const curveTip = useTip();
  const handTip = useTip();
  const o = stats.opening;
  const curveMax = Math.max(1, ...stats.curve.map((c) => c.creatures + c.other));
  const handMax = Math.max(...o.distribution, 0.0001);
  const pipTotal = COLORS.reduce((n, c) => n + stats.pips[c], 0);
  const colorRows = [...COLORS, "C" as const].filter((c) => (c !== "C" && stats.pips[c] > 0) || stats.sources[c].lands + stats.sources[c].other > 0);
  return (
    <div className="deck-stats" data-testid="deck-stats">
      <div className="stat-tiles">
        <Tile label="Cards" value={<span data-stat="total">{stats.total} / 100</span>} />
        <Tile label="Lands" value={<span data-stat="lands">{stats.lands}</span>} note={stats.landFaces ? `+${stats.landFaces} with a land back face` : undefined} />
        <Tile label="Average mana value" value={<span data-stat="avg-mv">{stats.averageMv.toFixed(2)}</span>} note="nonland cards" />
        <Tile label="Lands in opening hand" value={<span data-stat="opening-lands">{o.expectedLands.toFixed(2)}</span>} note={stats.landFaces ? `${o.expectedLandsWithFaces.toFixed(2)} counting back faces` : "average of 7 cards"} />
        <Tile label="Game Changers" value={<span data-stat="game-changers">{stats.gameChangers.length}</span>} note={stats.gameChangers.length ? stats.gameChangers.join(", ") : "none"} />
      </div>

      <section className="stat-block">
        <h3>Mana curve</h3>
        <div className="legend">
          <span><i className="swatch s-creature" /> Creatures</span>
          <span><i className="swatch s-other" /> Other spells</span>
        </div>
        <div className="columns" role="list">
          {stats.curve.map((c) => {
            const n = c.creatures + c.other;
            const label = `${c.mv === 7 ? "7+" : c.mv} mana: ${n} card${n === 1 ? "" : "s"} (${c.creatures} creature${c.creatures === 1 ? "" : "s"}, ${c.other} other)`;
            return (
              <div key={c.mv} className="col" role="listitem" data-curve={c.mv} {...curveTip.hover(label)}>
                <div className="col-value">{n || ""}</div>
                <div className="col-bars">
                  {c.other > 0 && <div className="bar s-other" style={{ height: `${(c.other / curveMax) * 100}%` }} />}
                  {c.creatures > 0 && <div className="bar s-creature" style={{ height: `${(c.creatures / curveMax) * 100}%` }} />}
                </div>
                <div className="col-label">{c.mv === 7 ? "7+" : c.mv}</div>
              </div>
            );
          })}
        </div>
        {curveTip.view}
      </section>

      <section className="stat-block">
        <h3>Colors</h3>
        <p className="muted small">Share of colored mana symbols in costs, and how many cards can make each color.</p>
        <div className="color-rows">
          {colorRows.map((c) => {
            const share = c === "C" || !pipTotal ? 0 : stats.pips[c] / pipTotal;
            const src = stats.sources[c];
            return (
              <div key={c} className="color-row" data-color-row={c}>
                <Pip sym={c} />
                <span className="color-name">{COLOR_NAME[c]}</span>
                <div className="hbar-track" title={c === "C" ? "" : `${stats.pips[c]} ${COLOR_NAME[c]} symbols, ${pct(share)} of colored symbols`}>
                  {c !== "C" && <div className="hbar" style={{ width: `${share * 100}%`, background: `var(--mana-${c})` }} />}
                </div>
                <span className="color-share">{c === "C" ? "" : `${stats.pips[c]} (${pct(share)})`}</span>
                <span className="color-sources">
                  {src.lands} land{src.lands === 1 ? "" : "s"}
                  {src.other ? `, ${src.other} other` : ""}
                </span>
              </div>
            );
          })}
          {!colorRows.length && <p className="muted small">No colored mana symbols or mana sources yet.</p>}
        </div>
      </section>

      <section className="stat-block">
        <h3>Opening hand</h3>
        <p className="small">
          <strong data-stat="keepable">{pct(o.keepable)}</strong> chance of 2 to 4 lands in your opening seven ({stats.lands} lands in a {stats.librarySize}-card library).
        </p>
        <div className="columns short" role="list">
          {o.distribution.map((p, k) => (
            <div key={k} className="col" role="listitem" {...handTip.hover(`${k} land${k === 1 ? "" : "s"}: ${(p * 100).toFixed(1)}%`)}>
              <div className="col-value">{p === handMax ? pct(p) : ""}</div>
              <div className="col-bars">
                <div className="bar s-creature" style={{ height: `${(p / handMax) * 100}%` }} />
              </div>
              <div className="col-label">{k}</div>
            </div>
          ))}
        </div>
        {handTip.view}
        <table className="stat-table">
          <caption className="muted small">Chance of making every land drop (drawing each turn, CR 103.8c)</caption>
          <thead>
            <tr>
              <th>Turn</th>
              {o.landDrops.map((_, i) => (
                <th key={i}>{i + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>Lands</th>
              {o.landDrops.map((p, i) => (
                <td key={i} data-land-drop={i + 1}>
                  {pct(p)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </section>

      <section className="stat-block two">
        <div>
          <h3>Card types</h3>
          <table className="stat-table">
            <tbody>
              {stats.types.map((t) => (
                <tr key={t.type} data-type-count={t.type}>
                  <th>{t.type}</th>
                  <td>{t.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <h3>Rarity</h3>
          <table className="stat-table">
            <tbody>
              {["common", "uncommon", "rare", "mythic", "special", "bonus"]
                .filter((r) => stats.rarity[r])
                .map((r) => (
                  <tr key={r}>
                    <th>{r[0]!.toUpperCase() + r.slice(1)}</th>
                    <td>{stats.rarity[r]}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          <p className="muted small">Total mana value {stats.totalMv}</p>
        </div>
      </section>
    </div>
  );
}
