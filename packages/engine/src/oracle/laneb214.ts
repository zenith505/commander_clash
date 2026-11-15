// Lane B round B214's lines, read by compileCard before its triggers and activated abilities (after round B213's).
import type { CompiledCard, Effect, TargetSpec } from "../abilities";
import { parseActivated } from "./activated";
import { parseBody } from "./body";
import { parseStatic } from "./statics";
import { parseTrigger } from "./triggers";

/** A trigger line read the usual way, or null. */
const trig = (text: string) => {
  const t = parseTrigger(text);
  return t && t !== "fail" ? t : null;
};

/** One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these. */
export function roundB214Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  const fail = () => {
    out.unsupported.push(raw);
    return true;
  };
  // All Hallow's Eve: "At the beginning of your upkeep, if this card is exiled with a scream counter on it, remove a scream
  // counter from it. If there are no more scream counters on it, put it into your graveyard and each player returns all
  // creature cards from their graveyard to the battlefield.": an ability of the card in exile, its owner controlling it (CR
  // 113.6, 113.8), with an intervening if (CR 603.4: it triggers only once it's exiled with a scream counter, which only its
  // own resolution gives it, rulings). With the last counter gone it goes to its owner's graveyard, then every creature card
  // in each graveyard returns at once under its owner's control (rulings, CR 110.2).
  if (line === "At the beginning of your upkeep, if ~ is exiled with a scream counter on it, remove a scream counter from it. If there are no more scream counters on it, put it into your graveyard and each player returns all creature cards from their graveyard to the battlefield.") {
    const t = trig("At the beginning of your upkeep, draw a card.");
    const back = parseBody("Each player returns all creature cards from their graveyard to the battlefield.", {});
    const ret = back?.effects[0];
    if (!isSpell || !t || t.event !== "yourUpkeep" || t.zone || t.ifCond || !back || back.targets.length || back.effects.length !== 1 || ret?.type !== "returnAllFromGraveyard") return fail();
    const effects: Effect[] = [{ type: "removeCounterThenReturn", counter: "scream", toGraveyard: true }, { type: "if", cond: { kind: "youDid" }, effects: [ret] }];
    out.triggers.push({ ...t, zone: "exile", ifCond: { kind: "selfInExile", counter: "scream" }, body: { targets: [], effects, text: line.replace(/^At the beginning of your upkeep, /, "") } });
    return true;
  }
  if (isSpell) return false;
  // Ice Cave: "Whenever a player casts a spell, any other player may pay that spell's mana cost. If a player does, counter
  // the spell.": each player other than its caster, in turn order (CR 101.4), until one pays; the spell's mana cost as it is
  // on the stack, colors included, its X as announced (CR 107.3h), without cost increases or reductions (rulings).
  if (line === "Whenever a player casts a spell, any other player may pay that spell's mana cost. If a player does, counter the spell.") {
    const t = trig("Whenever a player casts a spell, draw a card.");
    if (!t || t.event !== "castSpell" || t.cast?.by !== "any" || t.cast.spell.kind !== "spell" || Object.keys(t.cast.spell).some((k) => k !== "kind" && k !== "text")) return fail();
    out.triggers.push({ ...t, body: { targets: [], effects: [{ type: "othersPaySpellCostToCounter" }], text: "any other player may pay that spell's mana cost. If a player does, counter the spell." } });
    return true;
  }
  // Tidal Flats: "{U}{U}: For each attacking creature without flying, its controller may pay {1}. If that player doesn't,
  // creatures you control blocking that creature gain first strike until end of turn.": the attackers and blockers as it
  // resolves, the payments made then (rulings); each payment stops only this activation (rulings).
  if (line === "{U}{U}: For each attacking creature without flying, its controller may pay {1}. If that player doesn't, creatures you control blocking that creature gain first strike until end of turn.") {
    const a = parseActivated("{U}{U}: Tap all attacking creatures without flying.");
    const tap = a && a !== "fail" ? a.body.effects[0] : undefined;
    if (!a || a === "fail" || a.tap || a.manaCost !== "{U}{U}" || (a.costs ?? []).length || a.body.effects.length !== 1 || tap?.type !== "tap" || tap.what.ref !== "each") return fail();
    const filter: TargetSpec = { ...tap.what.filter, text: "attacking creature without flying" };
    const text = "For each attacking creature without flying, its controller may pay {1}. If that player doesn't, creatures you control blocking that creature gain first strike until end of turn.";
    out.activated.push({ ...a, text: line, body: { targets: [], effects: [{ type: "attackersPayOrBlockersGain", filter, cost: "{1}", keyword: "First strike" }], text } });
    return true;
  }
  // Alpine Moon: "Lands your opponents control with the chosen name lose all land types and abilities, and they gain "{T}:
  // Add one mana of any color."": the name chosen as it entered (CR 614.12); their land types go (layer 4) and so do their
  // other abilities, then they have that mana ability (layer 6, in the order written), the same lands in both layers (CR 613.6); supertypes and card types stay
  // (rulings). Its "enters tapped" and "as it enters" abilities are gone before they'd apply (rulings, CR 614.12).
  if (line === 'Lands your opponents control with the chosen name lose all land types and abilities, and they gain "{T}: Add one mana of any color."') {
    const st = parseStatic('Lands your opponents control have "{T}: Add one mana of any color."');
    const spec = st?.affects.kind === "filter" ? st.affects.spec : undefined;
    if (!out.entersChoose?.some((c) => c.what === "cardName") || !st || !spec || st.condition || st.mods.length !== 1 || st.mods[0]!.kind !== "addAbility") return fail();
    const named: TargetSpec = { ...spec, chosen: "name", text: "lands your opponents control with the chosen name" };
    out.statics.push({ ...st, affects: { ...st.affects, kind: "filter", types: [], spec: named }, mods: [{ kind: "setLandTypes", subtypes: [] }, { kind: "loseAllAbilities" }, st.mods[0]!], text: line });
    return true;
  }
  return false;
}
