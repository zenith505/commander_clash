import type { ManaType } from "@cc/engine";

const COLOR_ORDER: ManaType[] = ["W", "U", "B", "R", "G", "C"];

/** One mana symbol, drawn in CSS so it works offline. `sym` is the inside of {…}: "G", "3", "W/U", "B/P", "X". */
export function Pip({ sym, size }: { sym: string; size?: "sm" | "lg" }) {
  const parts = sym.split("/");
  const cls = ["pip", size ?? ""];
  if ((parts.length === 2 && parts[1] !== "P") || (parts.length === 3 && parts[2] === "P")) {
    // Hybrid: split the circle between the two halves; a hybrid Phyrexian one ({G/W/P}) is marked Φ.
    return (
      <span className={cls.join(" ")} title={`{${sym}}`} style={{ background: `linear-gradient(135deg, var(--mana-${parts[0]}) 50%, var(--mana-${parts[1]}) 50%)` }}>
        <span className="pip-label">{parts[0] === "2" ? "2" : parts.length === 3 ? "Φ" : ""}</span>
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
  if (base === "S")
    return (
      <span className={[...cls, "pip-generic"].join(" ")} title="{S}: one mana from a snow source">
        <span className="pip-label">❄</span>
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

/** Up to 4 of a color drawn as repeated pips; more than 4 shows the count in front of a single pip. */
function PoolGroup({ c, n, title, restricted }: { c: ManaType; n: number; title?: string; restricted?: boolean }) {
  return (
    <span className={restricted ? "pool-group pool-restricted" : "pool-group"} title={title}>
      {n > 4 ? (
        <>
          <span className="pool-count">{n}</span>
          <Pip sym={c} size="lg" />
        </>
      ) : (
        Array.from({ length: n }, (_, i) => <Pip key={i} sym={c} size="lg" />)
      )}
    </span>
  );
}

/** A mana pool as pips. Mana that can only be spent some ways (CR 106.6) is ringed, and says how on hover. */
export function ManaPoolView({ pool, restricted: lots = [] }: { pool: Record<ManaType, number>; restricted?: { mana: ManaType; n: number; only: { text: string } }[] }) {
  const free = { ...pool };
  for (const r of lots) free[r.mana] -= r.n;
  // Mana restricted the same way is one group, whatever its sources were.
  const restricted: typeof lots = [];
  for (const r of lots) {
    const same = restricted.find((x) => x.mana === r.mana && x.only.text === r.only.text);
    if (same) same.n += r.n;
    else restricted.push({ ...r });
  }
  const entries = COLOR_ORDER.filter((c) => free[c] > 0);
  if (!entries.length && !restricted.length) return <span className="muted small">Mana pool empty</span>;
  return (
    <span className="mana-pool">
      {entries.map((c) => (
        <PoolGroup key={c} c={c} n={free[c]} />
      ))}
      {restricted.map((r, i) => (
        <PoolGroup key={`r${i}`} c={r.mana} n={r.n} title={r.only.text} restricted />
      ))}
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
