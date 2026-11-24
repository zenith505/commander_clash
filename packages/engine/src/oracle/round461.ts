// Round 461's whole lines (compile.ts): Spy Kit's names (all-names.ts).
import type { CompiledCard } from "../abilities";
import { parseStatic } from "./statics";

const SPY_KIT = "Equipped creature gets +1/+1 and has all names of nonlegendary creature cards in addition to its name.";

/** One whole line of round 461's (compile.ts); false when it isn't one of these. */
export function round461Line(line: string, raw: string, out: CompiledCard): boolean {
  // Spy Kit: "Equipped creature gets +1/+1 and has all names of nonlegendary creature cards in addition to its name." The
  // +1/+1 is the usual one (layer 7c); the names are a text-changing effect (CR 612.7, 613.1c: layer 3), added to its own
  // name rather than replacing it (an effect that later sets its name takes them away, CR 612.8). Every check of a name
  // reads them through all-names.ts.
  if (line !== SPY_KIT) return false;
  const st = parseStatic("Equipped creature gets +1/+1.");
  if (!st || st.affects.kind !== "attached" || st.mods.length !== 1) {
    out.unsupported.push(raw);
    return true;
  }
  out.statics.push({ ...st, text: line }, { affects: { kind: "attached" }, mods: [{ kind: "allCardNames" }], text: line });
  return true;
}
