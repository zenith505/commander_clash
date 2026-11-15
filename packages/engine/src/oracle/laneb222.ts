// Lane B round B222's lines, read by compileCard before its triggers and activated abilities (after round B221's), and its
// whole spells (chained from round B221's).
import type { AbilityBody, CompiledCard, Effect, TargetSpec } from "../abilities";
import { parseActivated } from "./activated";
import { parseBody } from "./body";
import { parseTrigger } from "./triggers";

/** A trigger line read the usual way, or null. */
const trig = (text: string) => {
  const t = parseTrigger(text);
  return t && t !== "fail" ? t : null;
};

const SPLICER = "{2}, {T}, Choose flying, first strike, trample, or shadow: Until end of turn, target creature with the chosen ability loses it and another target creature gains it.";
const EXPRESSIONIST = /^(?:Magecraft — )?Whenever you cast or copy an instant or sorcery spell, choose target creature you control\. Until end of turn, it gains "If ~ would leave the battlefield, exile it instead of putting it anywhere else" and "When ~ is put into exile, create a 4\/4 blue and red Elemental creature token\."$/;
const REAPER = /^(?:Consume Anomaly — )?Whenever ~ deals combat damage to a player, put target face-up card they own in exile on the bottom of their library\. If you do, you gain 3 life\.$/;
const EQUIPOISE = "At the beginning of your upkeep, for each land target player controls in excess of the number you control, choose a land that player controls, then the chosen permanents phase out. Repeat this process for artifacts and creatures.";

/** One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these. */
export function roundB222Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  const fail = () => {
    out.unsupported.push(raw);
    return true;
  };
  // Phyrexian Splicer: "{2}, {T}, Choose flying, first strike, trample, or shadow: Until end of turn, target creature with the
  // chosen ability loses it and another target creature gains it.": the keyword is chosen as the ability is activated, before
  // its targets, which depend on it (CR 602.2b, 601.2b-c), and a copy of the ability keeps it (CR 707.10); read as four
  // modes, one for each keyword. Each target is checked on its own as it resolves: with the first one gone or without the
  // keyword, the second still gains it (rulings, CR 608.2b).
  if (!isSpell && line === SPLICER) {
    const kws = ["flying", "first strike", "trample", "shadow"];
    const parsed = kws.map((k) => parseActivated(`{2}, {T}: Target creature with ${k} loses ${k} until end of turn. Another target creature gains ${k} until end of turn.`));
    const modes: AbilityBody[] = [];
    for (const [i, a] of parsed.entries()) {
      if (!a || a === "fail" || a.body.modal || a.body.targets.length !== 2 || a.body.effects.length !== 2 || !a.body.targets[0]!.keywords?.length || !a.body.targets[1]!.distinctFrom?.length) return fail();
      const k = kws[i]!;
      modes.push({ ...a.body, text: `${k.charAt(0).toUpperCase()}${k.slice(1)}: until end of turn, target creature with ${k} loses it and another target creature gains it.` });
    }
    const a = parsed[0] as Exclude<(typeof parsed)[0], null | "fail">;
    const body: AbilityBody = { targets: [], effects: [], text: "Choose flying, first strike, trample, or shadow. Until end of turn, target creature with the chosen ability loses it and another target creature gains it.", modal: { min: 1, max: 1, modes } };
    out.activated.push({ ...a, body, text: line });
    return true;
  }
  // Elemental Expressionist: "Magecraft — Whenever you cast or copy an instant or sorcery spell, choose target creature you
  // control. Until end of turn, it gains "If this creature would leave the battlefield, exile it instead of putting it
  // anywhere else" and "When this creature is put into exile, create a 4/4 blue and red Elemental creature token."": both
  // granted until end of turn (CR 611.2a); the trigger works only while it's on the battlefield, so it's going from the
  // battlefield to exile, for any reason (rulings: whoever exiles it), and a token exiled triggers it too before it ceases to
  // exist (rulings, CR 603.10a, 111.7). Granted twice, it triggers twice (rulings).
  if (!isSpell && EXPRESSIONIST.test(line)) {
    const t = trig('Magecraft — Whenever you cast or copy an instant or sorcery spell, target creature you control gains "If ~ would leave the battlefield, exile it instead of putting it anywhere else" until end of turn.');
    const [gain] = t?.body.effects ?? [];
    if (!t || t.body.effects.length !== 1 || gain?.type !== "continuous" || gain.mods.length !== 1 || gain.mods[0]!.kind !== "addAbility" || t.body.targets.length !== 1) return fail();
    const exiled = trig("When ~ is put into exile from the battlefield, create a 4/4 blue and red Elemental creature token.");
    if (exiled?.event !== "selfExiled") return fail();
    const both: Effect = { ...gain, mods: [...gain.mods, { kind: "addAbility", text: "When ~ is put into exile from the battlefield, create a 4/4 blue and red Elemental creature token." }] };
    out.triggers.push({ ...t, body: { ...t.body, effects: [both], text: line.replace(/^Magecraft — Whenever you cast or copy an instant or sorcery spell, /, "") } });
    return true;
  }
  // Time Reaper: "Whenever ~ deals combat damage to a player, put target face-up card they own in exile on the bottom of their
  // library. If you do, you gain 3 life.": a card that player owns in exile, face up (rulings: a face-down one, foretold and
  // the like, can't be chosen, CR 406.3); "If you do": it's in that library now (a commander put into the command zone
  // instead isn't, CR 903.9b).
  if (!isSpell && REAPER.test(line)) {
    const t = trig("Whenever ~ deals combat damage to a player, put target card from that player's graveyard on the bottom of its owner's library.");
    const [put] = t?.body.effects ?? [];
    const spec = t?.body.targets[0];
    if (!t || t.body.targets.length !== 1 || spec?.kind !== "card" || spec.controller !== "eventPlayer" || t.body.effects.length !== 1 || put?.type !== "putInLibrary" || put.position !== "bottom") return fail();
    const target: TargetSpec = { ...spec, inExile: true, text: "target face-up card they own in exile" };
    const text = line.replace(/^Consume Anomaly — Whenever ~ deals combat damage to a player, /, "");
    out.triggers.push({ ...t, body: { targets: [target], effects: [put, { type: "if", cond: { kind: "targetExiled", index: 0, to: "library" }, effects: [{ type: "gainLife", who: { ref: "you" }, n: 3 }] }], text } });
    return true;
  }
  // Equipoise: "At the beginning of your upkeep, for each land target player controls in excess of the number you control,
  // choose a land that player controls, then the chosen permanents phase out. Repeat this process for artifacts and
  // creatures.": lands, then artifacts, then creatures, each counted after the last pass phased out (an artifact creature
  // phased out with the artifacts isn't counted with the creatures, rulings); any player may be the target, you too (rulings).
  if (!isSpell && line === EQUIPOISE) {
    const t = trig("At the beginning of your upkeep, target player loses 1 life.");
    const who = t?.body.targets[0];
    if (!t || t.body.targets.length !== 1 || who?.kind !== "player" || who.opponent) return fail();
    out.triggers.push({ ...t, body: { targets: [{ ...who, text: "target player" }], effects: [{ type: "phaseOutExcess", who: { ref: "target", index: 0 }, types: ["Land", "Artifact", "Creature"] }], text: line.replace(/^At the beginning of your upkeep, /, "") } });
    return true;
  }
  return false;
}

/** Round B222's whole spells: the body, null when it's one of these but can't be read, undefined when it isn't. */
export function roundB222Spell(text: string): AbilityBody | null | undefined {
  // Meeting of the Five: "Exile the top ten cards of your library. You may cast spells with exactly three colors from among
  // them this turn. Add {W}{W}{U}{U}{B}{B}{R}{R}{G}{G}. Spend this mana only to cast spells with exactly three colors.": spells
  // that are exactly three colors as they're cast (CR 105.2, 202.2), not the same three for each (rulings), with their normal
  // timing and costs; the mana pays any part of such a spell's costs, additional costs too (rulings, CR 106.6).
  if (text === "Exile the top ten cards of your library. You may cast spells with exactly three colors from among them this turn. Add {W}{W}{U}{U}{B}{B}{R}{R}{G}{G}. Spend this mana only to cast spells with exactly three colors.") {
    const exile = parseBody("Exile the top ten cards of your library. Until end of turn, you may cast spells from among them.", { spell: true });
    const mana = parseBody("Add {W}{W}{U}{U}{B}{B}{R}{R}{G}{G}. Spend this mana only to cast multicolored spells.", { spell: true });
    const [imp] = exile?.effects ?? [];
    const [add] = mana?.effects ?? [];
    if (!exile || !mana || exile.effects.length !== 1 || imp?.type !== "impulse" || !imp.castOnly || imp.until !== "thisTurn" || imp.spellFilter || mana.effects.length !== 1 || add?.type !== "addMana" || add.only?.spells?.colorCount !== "multicolored") return null;
    const three: TargetSpec = { kind: "spell", types: [], colorCount: "three", text: "spell with exactly three colors" };
    return { targets: [], effects: [{ ...imp, spellFilter: { ...three, kind: "card", text: "card with exactly three colors" } }, { ...add, only: { ...add.only, text: "Spend this mana only to cast spells with exactly three colors.", spells: { ...add.only.spells, ...three, text: "spells with exactly three colors" } } }], text };
  }
  return undefined;
}
