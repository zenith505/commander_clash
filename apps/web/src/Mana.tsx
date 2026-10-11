import type { ManaType } from "@cc/engine";

const COLOR_ORDER: ManaType[] = ["W", "U", "B", "R", "G", "C"];

/** One mana symbol, drawn in CSS so it works offline. `sym` is the inside of {…}: "G", "3", "W/U", "B/P", "X". */
export function Pip({ sym, size }: { sym: string; size?: "sm" | "lg" }) {
  const parts = sym.split("/");
  const cls = ["pip", size ?? ""];
  if (parts.length === 2 && parts[1] !== "P") {
    // Hybrid: split the circle between the two halves.
    return (
      <span className={cls.join(" ")} title={`{${sym}}`} style={{ background: `linear-gradient(135deg, var(--mana-${parts[0]}) 50%, var(--mana-${parts[1]}) 50%)` }}>
        <span className="pip-label">{parts[0] === "2" ? "2" : ""}</span>
      </span>
    );
  }
  const base = parts[0]!;
  if (base === "T" || base === "Q")
    return (
      <span className={[...cls, "pip-tap"].join(" ")} title={base === "T" ? "Tap" : "Untap"}>
        <span className="pip-label">{base === "T" ? "↷" : "↶"}</span>
      </span>
    );
  if (base === "E")
    return (
      <span className={[...cls, "pip-energy"].join(" ")} title="Energy">
        <span className="pip-label">⚡</span>
      </span>
    );
  const isColor = /^[WUBRGC]$/.test(base);
  return (
    <span className={[...cls, isColor ? `pip-${base}` : "pip-generic"].join(" ")} title={`{${sym}}`}>
      <span className="pip-label">{isColor ? (parts[1] === "P" ? "Φ" : base) : base}</span>
    </span>
  );
}

/** A printed mana cost like "{2}{G}{G}" as a row of pips. */
export function ManaCost({ cost, size }: { cost: string; size?: "sm" | "lg" }) {
  const syms = [...cost.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]!);
  if (!syms.length) return null;
  return (
    <span className="mana-cost">
      {syms.map((s, i) => (
        <Pip key={i} sym={s} size={size} />
      ))}
    </span>
  );
}

/**
 * A mana pool as pips: up to 4 of a color are drawn as repeated pips,
 * more than 4 shows the count in front of a single pip.
 */
export function ManaPoolView({ pool }: { pool: Record<ManaType, number> }) {
  const entries = COLOR_ORDER.filter((c) => pool[c] > 0);
  if (!entries.length) return <span className="muted small">Mana pool empty</span>;
  return (
    <span className="mana-pool">
      {entries.map((c) =>
        pool[c] > 4 ? (
          <span key={c} className="pool-group">
            <span className="pool-count">{pool[c]}</span>
            <Pip sym={c} size="lg" />
          </span>
        ) : (
          <span key={c} className="pool-group">
            {Array.from({ length: pool[c] }, (_, i) => (
              <Pip key={i} sym={c} size="lg" />
            ))}
          </span>
        ),
      )}
    </span>
  );
}

/** Text with mana and tap symbols ("{2}{G}, {T}: ...") drawn as pips. */
export function RulesText({ text }: { text: string }) {
  const parts = text.split(/(\{[^}]+\})/);
  if (parts.length === 1) return <>{text}</>;
  return (
    <>
      {parts.map((part, i) => {
        const m = /^\{([^}]+)\}$/.exec(part);
        return m ? <Pip key={i} sym={m[1]!} size="sm" /> : part;
      })}
    </>
  );
}
