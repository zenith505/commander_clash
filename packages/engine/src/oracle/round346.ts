// Round 346's whole lines (compile.ts, after round 345's).
import type { CompiledCard } from "../abilities";
import { parseActivated } from "./activated";
import { parseTargetPhrase } from "./targets";

/** Round 346's whole lines: true when the line is one of them (supported, or pushed to `out.unsupported`). */
export function round346Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Greater Gargadon: "Sacrifice an artifact, creature, or land: Remove a time counter from ~. Activate only if ~ is
  // suspended.": an ability that works only while the card is suspended, in exile with suspend and a time counter on it
  // (CR 702.62b, 113.6m, rulings), by its owner (CR 602.1); face up there (CR 702.62a). Removing the last counter this way
  // triggers suspend's cast (CR 702.62a, rulings: whatever removed it).
  const suspended = /^([^:]+): Remove a time counter from ~\. Activate only if ~ is suspended\.$/.exec(line);
  if (suspended && !isSpell) {
    const a = parseActivated(`${suspended[1]}: Remove a time counter from ~.`);
    const e = a && a !== "fail" ? a.body.effects : [];
    if (!a || a === "fail" || a.zone || a.tap || a.sacrificeSelf || a.manaCost || a.body.targets.length || e.length !== 1 || e[0]!.type !== "removeCounters" || e[0]!.counter !== "time" || e[0]!.n !== 1 || JSON.stringify(e[0]!.what) !== '{"ref":"self"}') out.unsupported.push(raw);
    // "This card": the card in exile, while it's still that object there (ObjRef selfCard, CR 400.7).
    else out.activated.push({ ...a, zone: "graveyard", orExile: true, onlyExile: true, suspendedOnly: true, body: { ...a.body, effects: [{ ...e[0]!, what: { ref: "selfCard" } }] }, text: line });
    return true;
  }
  // Festival of Embers: "During your turn, you may cast instant and sorcery spells from your graveyard by paying 1 life in
  // addition to their other costs.": any number of them, during its controller's turn only, paying their costs and the
  // life and following the timing rules (as Noctis, Prince of Lucis's and Hades's permissions; CR 601.2f, h).
  const lifeYard = /^During your turn, you may cast instant and sorcery spells from your graveyard by paying (\d+) life in addition to their other costs\.$/.exec(line);
  if (lifeYard && !isSpell) {
    const f = parseTargetPhrase("instant or sorcery card from a graveyard");
    if (f?.kind !== "card") out.unsupported.push(raw);
    else {
      const { owner: _, ...rest } = f;
      (out.graveyardGrants ??= []).push({ filter: { ...rest, text: "instant and sorcery cards" }, way: { kind: "permission", costs: [{ kind: "payLife", n: Number(lifeYard[1]) }], exile: false }, yourTurn: true });
    }
    return true;
  }
  return false;
}
