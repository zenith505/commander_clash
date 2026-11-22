// Lane B round B293's lines, read by compileCard before the generic triggers and statics (after round B292's): Titania's
// Song's animation of noncreature artifacts that goes on to the end of the turn once it leaves the battlefield, and Soundwave,
// Sonic Spy's copy of a card from the damaged player's graveyard with mana value equal to the damage its tokens dealt.
import type { CompiledCard } from "../abilities";
import { parseBody } from "./body";
import { parseStatic } from "./statics";
import { parseTrigger } from "./triggers";

const SOUNDWAVE =
  "Whenever one or more creature tokens you control deal combat damage to a player, exile target instant or sorcery card with mana value equal to the damage dealt from their graveyard. Copy it. You may cast the copy without paying its mana cost. If you do, convert ~.";
const SONG =
  "Each noncreature artifact loses all abilities and becomes an artifact creature with power and toughness each equal to its mana value. If ~ leaves the battlefield, this effect continues until end of turn.";

/** One line of a card's text, compiled into `out`; false when it isn't one of these. */
export function roundB293Line(line: string, out: CompiledCard, isSpell: boolean): boolean {
  const fail = () => (out.unsupported.push(line), true);
  // Titania's Song: one static ability (CR 604.1) applying to each noncreature artifact on the battlefield, any player's, as
  // March of the Machines's does: it's a creature as well as an artifact, keeping its other types (CR 205.1b, layer 4), it
  // loses all abilities (layer 6) and its base power and toughness are its mana value (layer 7b, CR 613.4b), the set fixed
  // once it applies in layer 4 for the later layers (CR 613.6). Not locked in otherwise (CR 611.3a): an artifact that
  // enters or stops being a creature later is affected. "If ~ leaves the battlefield, this effect continues until end of
  // turn": the same effect, still not locked in (no rule or ruling locks the set: CR 611.2c is about effects of resolving
  // spells and abilities), kept to the cleanup step (CR 514.2) with its source's timestamp (CR 613.7a). It goes on only if
  // the Song had the ability as it left (laneb293.ts lingerOnLeaving).
  if (line === SONG) {
    if (isSpell) return fail();
    const st = parseStatic("Each noncreature artifact is an artifact creature with power and toughness each equal to its mana value.");
    if (!st || st.condition || st.affects.kind !== "filter" || st.affects.controller || st.affects.other) return fail();
    out.statics.push({ ...st, mods: [{ kind: "loseAllAbilities" }, ...st.mods], text: line, lingers: "endOfTurn" });
    return true;
  }
  // Soundwave, Sonic Spy: one trigger for each player the creature tokens its controller controls dealt combat damage to at
  // once (CR 510.2, 603.2c), "the damage dealt" the damage those tokens dealt that player (rulings: exactly that amount; the
  // engine's "that much" for this batch, TriggerEventInfo amount). Its target is an instant or sorcery card in that
  // player's graveyard with exactly that mana value (rulings), chosen as it's put on the stack (CR 603.3d) and checked
  // again as it resolves (CR 608.2b). The card is exiled and copied; the copy may be cast without paying its mana cost
  // as it resolves, timing ignored (CR 608.2g), or never: then it ceases to exist and the card stays exiled (CR 704.5e,
  // rulings). Only if it's cast does Soundwave convert (CR 701.28; transform's rules, 701.27f: not once it has left or
  // turned over since the ability triggered).
  if (line === SOUNDWAVE) {
    if (isSpell) return fail();
    const t = parseTrigger("Whenever one or more creature tokens you control deal combat damage to a player, exile target instant or sorcery card from a graveyard and copy it. You may cast the copy without paying its mana cost.");
    const conv = parseBody("Convert ~.", {});
    if (!t || t === "fail" || t.event !== "creaturesYouControlDealCombatDamageToPlayer" || !t.group?.token || t.body.targets.length !== 1 || t.body.effects.length !== 1) return fail();
    const tg = t.body.targets[0]!;
    const cast = t.body.effects[0]!;
    if (tg.kind !== "card" || tg.owner || tg.controller || tg.manaValue || tg.bound || cast.type !== "castFromAmong" || !cast.copies || cast.fromYard?.target !== 0) return fail();
    if (conv?.effects.length !== 1 || conv.effects[0]!.type !== "transform" || !conv.effects[0]!.convert) return fail();
    out.triggers.push({
      ...t,
      body: {
        targets: [{ ...tg, controller: "eventPlayer", bound: { key: "manaValue", at: "exact", amount: { count: { kind: "eventAmount" } } }, text: "target instant or sorcery card with mana value equal to the damage dealt from that player's graveyard" }],
        effects: [cast, { type: "if", cond: { kind: "castAmongThisWay" }, effects: conv.effects }],
        text: line.replace(/^[^,]+, /, ""),
      },
    });
    return true;
  }
  return false;
}
