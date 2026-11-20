// Lane B round B276's lines, read by compileCard before the generic triggers and statics (after round B275's): Secret
// Invasion's enters trigger and Runesword's activated ability.
import type { CompiledCard } from "../abilities";
import { parseActivated } from "./activated";
import { parseTrigger } from "./triggers";

const INVASION =
  "When ~ enters, exile up to one target creature other than enchanted creature until ~ leaves the battlefield. Enchanted creature becomes a copy of that creature until ~ leaves the battlefield.";

const RUNESWORD =
  "{3}, {T}: Target attacking creature gets +2/+0 until end of turn. When that creature leaves the battlefield this turn, sacrifice ~. If the creature deals damage to a creature this turn, the creature dealt damage can't be regenerated this turn. If a creature dealt damage by the targeted creature would die this turn, exile that creature instead.";

/** One line of a card's text, compiled into `out`; false when it isn't one of these. */
export function roundB276Line(line: string, out: CompiledCard, isSpell: boolean): boolean {
  const fail = () => (out.unsupported.push(line), true);
  // Secret Invasion: the exile until ~ leaves the battlefield (CR 610.3; nothing is exiled if ~ has already left, 610.3b),
  // then the creature ~ enchants as this resolves becomes a copy of the exiled creature: of its copiable values as it last
  // existed on the battlefield, since the effect has moved it out of the zone it was expected to be in (CR 608.2h, 707.2),
  // a token too. The copy effect lasts until ~ leaves the battlefield (CopyEffect.until untilLeaves) and does nothing if ~
  // has already left, the event ending its duration having already happened (CR 610.3b, 611.2b). With no target chosen
  // ("up to one", CR 115.1d) there's no "that creature" to copy.
  if (line === INVASION) {
    const t = isSpell ? undefined : parseTrigger("When ~ enters, exile up to one target creature other than enchanted creature until ~ leaves the battlefield.");
    const ex = t && t !== "fail" ? t.body.effects[0] : undefined;
    const target = t && t !== "fail" ? t.body.targets[0] : undefined;
    if (!t || t === "fail" || t.event !== "selfEnters" || t.ifCond || t.body.effects.length !== 1 || ex?.type !== "exile" || ex.until !== "sourceLeaves" || ex.what.ref !== "target" || ex.what.n || t.body.targets.length !== 1 || target?.kind !== "object" || !target.optional || !target.notSourceHost || out.enchant?.kind !== "object") return fail();
    out.triggers.push({ ...t, body: { ...t.body, effects: [ex, { type: "becomeCopy", what: { ref: "attached" }, of: { ref: "target", index: 0 }, duration: "untilSourceLeaves" }], text: line.replace(/^When ~ enters, /, "") } });
    return true;
  }
  // Runesword: the pump and the delayed "leaves the battlefield this turn" trigger about the target (CR 603.7c), then, for
  // the rest of the turn, the target as the object it is now (CR 400.7) marks each creature it deals damage to this turn
  // (Effect runeswordMark, TurnLog.runesword): such a creature can't be regenerated this turn (game.ts damagedNoRegen,
  // CR 701.19c) and is exiled instead if it would die this turn (a replacement effect, CR 614.1a; game.ts
  // exiledByWhatDamagedIt), whether or not Runesword is still on the battlefield.
  if (line === RUNESWORD) {
    const a = isSpell ? null : parseActivated("{3}, {T}: Target attacking creature gets +2/+0 until end of turn. When that creature leaves the battlefield this turn, sacrifice ~.");
    if (!a || a === "fail" || a.body.targets.length !== 1 || a.body.effects.length !== 2 || a.body.effects[0]?.type !== "continuous" || a.body.effects[1]?.type !== "delayed") return fail();
    out.activated.push({ ...a, text: line, body: { ...a.body, effects: [...a.body.effects, { type: "runeswordMark" }], text: line.replace(/^\{3\}, \{T\}: /, "") } });
    return true;
  }
  return false;
}
