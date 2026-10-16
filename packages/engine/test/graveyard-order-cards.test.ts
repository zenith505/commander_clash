// Cards that read the order of a graveyard (CR 404.1-404.3; see graveyard.ts): "the top creature card of your
// graveyard" is the creature card put there most recently (rulings), "directly above" the next card put there after it.

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { botActions, castProblem, isFullySupported, objHasKeyword, planActivate, planCast, power, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

// Real oracle text (Scryfall).
const corpseDance = card("Corpse Dance", "Instant", "{2}{B}", { keywords: ["Buyback"], oracleText: "Buyback {2} (You may pay an additional {2} as you cast this spell. If you do, put this card into your hand as it resolves.)\nReturn the top creature card of your graveyard to the battlefield. That creature gains haste until end of turn. Exile it at the beginning of the next end step." });
const shallowGrave = card("Shallow Grave", "Instant", "{1}{B}", { oracleText: "Return the top creature card of your graveyard to the battlefield. That creature gains haste until end of turn. Exile it at the beginning of the next end step." });
const griffin = card("Mistmoon Griffin", "Creature — Griffin", "{3}{W}", { power: "2", toughness: "2", keywords: ["Flying"], oracleText: "Flying\nWhen this creature dies, exile it, then return the top creature card of your graveyard to the battlefield." });
const horror = card("Krovikan Horror", "Creature — Horror Spirit", "{3}{B}", { power: "2", toughness: "2", oracleText: "At the beginning of the end step, if this card is in your graveyard with a creature card directly above it, you may return this card to your hand.\n{1}, Sacrifice a creature: This creature deals 1 damage to any target." });
const deathSpark = card("Death Spark", "Instant", "{R}", { oracleText: "Death Spark deals 1 damage to any target.\nAt the beginning of your upkeep, if this card is in your graveyard with a creature card directly above it, you may pay {1}. If you do, return this card to your hand." });
const necratog = card("Necratog", "Creature — Atog", "{1}{B}{B}", { power: "1", toughness: "2", oracleText: "Exile the top creature card of your graveyard: this creature gets +2/+2 until end of turn." });
const scavengers = card("Zombie Scavengers", "Creature — Zombie", "{2}{B}", { power: "3", toughness: "1", keywords: ["Regenerate"], oracleText: "Exile the top creature card of your graveyard: Regenerate this creature." });
const alms = card("Alms", "Enchantment", "{W}", { oracleText: "{1}, Exile the top card of your graveyard: Prevent the next 1 damage that would be dealt to target creature this turn." });
const naturesKiss = card("Nature's Kiss", "Enchantment — Aura", "{1}{G}", { keywords: ["Enchant"], oracleText: "Enchant creature\n{1}, Exile the top card of your graveyard: Enchanted creature gets +1/+1 until end of turn." });
const spinning = card("Spinning Darkness", "Instant", "{4}{B}{B}", { oracleText: "You may exile the top three black cards of your graveyard rather than pay this spell's mana cost.\nSpinning Darkness deals 3 damage to target nonblack creature. You gain 3 life." });
const digger = card("Soldevi Digger", "Artifact", "{2}", { oracleText: "{2}: Put the top card of your graveyard on the bottom of your library." });
const guiding = card("Guiding Spirit", "Creature — Angel Spirit", "{1}{W}{U}", { power: "1", toughness: "2", keywords: ["Flying"], oracleText: "Flying\n{T}: If the top card of target player's graveyard is a creature card, put that card on top of that player's library." });
const furnace = card("Phyrexian Furnace", "Artifact", "{1}", { oracleText: "{T}: Exile the bottom card of target player's graveyard.\n{1}, Sacrifice this artifact: Exile target card from a graveyard. Draw a card." });
const ghoul = card("Barrow Ghoul", "Creature — Zombie", "{1}{B}", { power: "4", toughness: "4", oracleText: "At the beginning of your upkeep, sacrifice this creature unless you exile the top creature card of your graveyard." });
const boneDancer = card("Bone Dancer", "Creature — Zombie", "{1}{B}{B}", { power: "2", toughness: "2", oracleText: "Whenever this creature attacks and isn't blocked, you may put the top creature card of defending player's graveyard onto the battlefield under your control. If you do, this creature assigns no combat damage this turn." });
const fossil = card("Fossil Find", "Sorcery", "{R/G}", { oracleText: "Return a card at random from your graveyard to your hand, then reorder your graveyard as you choose." });
const survivors = card("Search for Survivors", "Sorcery", "{2}{R}", { oracleText: "Reorder your graveyard at random. An opponent chooses a card at random in your graveyard. If it's a creature card, put it onto the battlefield. Otherwise, exile it." });
const fengraf = card("Haunted Fengraf", "Land", "", { oracleText: "{T}: Add {C}.\n{3}, {T}, Sacrifice this land: Return a creature card at random from your graveyard to your hand." });
const dawn = card("Dawn of the Dead", "Enchantment", "{2}{B}{B}{B}", { oracleText: "At the beginning of your upkeep, you lose 1 life.\nAt the beginning of your upkeep, you may return target creature card from your graveyard to the battlefield. That creature gains haste until end of turn. Exile it at the beginning of the next end step." });
const atrocity = card("Balduvian Atrocity", "Creature — Phyrexian Berserker", "{2}{B}", { power: "2", toughness: "3", keywords: ["Menace", "Kicker"], oracleText: "Kicker {R} (You may pay an additional {R} as you cast this spell.)\nMenace\nWhen this creature enters, if it was kicked, return target creature card with mana value 3 or less from your graveyard to the battlefield. It gains haste. Sacrifice it at the beginning of the next end step." });
const pyre = card("Pyre Zombie", "Creature — Zombie", "{1}{B}{R}", { power: "2", toughness: "1", oracleText: "At the beginning of your upkeep, if this card is in your graveyard, you may pay {1}{B}{B}. If you do, return it to your hand.\n{1}{R}{R}, Sacrifice this creature: It deals 2 damage to any target." });
const ghoulraiser = card("Ghoulraiser", "Creature — Zombie", "{1}{B}{B}", { power: "2", toughness: "2", oracleText: "When this creature enters, return a Zombie card at random from your graveyard to your hand." });
const memoir = card("Surreal Memoir", "Sorcery", "{3}{R}", { keywords: ["Rebound"], oracleText: "Return an instant card at random from your graveyard to your hand.\nRebound (If you cast this spell from your hand, exile it as it resolves. At the beginning of your next upkeep, you may cast this card from exile without paying its mana cost.)" });
const devils = card("Charmbreaker Devils", "Creature — Devil", "{5}{R}", { power: "4", toughness: "4", oracleText: "At the beginning of your upkeep, return an instant or sorcery card at random from your graveyard to your hand.\nWhenever you cast an instant or sorcery spell, this creature gets +4/+0 until end of turn." });
const wrath = card("Wrath of God", "Sorcery", "{2}{W}{W}", { oracleText: "Destroy all creatures. They can't be regenerated." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const ritual = card("Dark Ritual", "Instant", "{B}", { oracleText: "Add {B}{B}{B}." });
const blackBear = (name: string) => card(name, "Creature — Zombie", "{1}{B}", { power: "2", toughness: "2" });

function run(s: GameState, plan: Action[] | null): GameState {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return s;
}
/** Pass until the stack and the trigger queue are empty or someone has to decide something. */
function settle(s: GameState): GameState {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}
const name = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]!.name;
/** A player's graveyard by name, top first. */
const yard = (s: GameState, pid: PlayerId) => [...s.players[pid]!.graveyard].reverse().map((id) => name(s, id));
/** Put these cards into `pid`'s graveyard, bottom first, so the last is on top. */
function bury(s: GameState, pid: PlayerId, ...defs: CardDef[]): string[] {
  return defs.map((d) => {
    const id = putOnBattlefield(s, pid, d);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "graveyard";
    s.players[pid]!.graveyard.push(id);
    return id;
  });
}

describe("cards that read graveyard order", () => {
  it("parse", () => {
    supported(corpseDance, shallowGrave, griffin, horror, deathSpark, necratog, scavengers, alms, naturesKiss, spinning, digger, guiding, furnace, ghoul, boneDancer, fossil, survivors, fengraf, dawn, atrocity, pyre, ghoulraiser, memoir, devils);
  });

  it("Corpse Dance: the top creature card, not the top card, returns with haste and is exiled at the next end step", () => {
    const { s: s0, ap, ids } = setup([corpseDance]);
    const [a, b] = bury(s0, ap, bear({ name: "Bear A" }), bear({ name: "Bear B" }), shock);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[b!]!.zone).toBe("battlefield");
    expect(s.objects[a!]!.zone).toBe("graveyard");
    expect(objHasKeyword(s, s.objects[b!]!, "Haste")).toBe(true);
    expect(yard(s, ap)).toEqual(["Corpse Dance", "Shock", "Bear A"]);
    s = settle(passUntil(s, "end", ap));
    expect(s.objects[b!]!.zone).toBe("exile");
  });

  it("Shallow Grave: nothing happens with no creature card in the graveyard", () => {
    const { s: s0, ap, ids } = setup([shallowGrave]);
    bury(s0, ap, shock);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.battlefield.some((id) => s.objects[id]!.owner === ap && name(s, id) === "Shock")).toBe(false);
    expect(yard(s, ap)).toEqual(["Shallow Grave", "Shock"]);
  });

  it("Mistmoon Griffin dying to Wrath of God: its owner orders the creatures, then the trigger returns the top creature card", () => {
    const { s: s0, ap, ids } = setup([wrath]);
    const g = putOnBattlefield(s0, ap, griffin);
    const [a, b] = [putOnBattlefield(s0, ap, bear({ name: "Bear A" })), putOnBattlefield(s0, ap, bear({ name: "Bear B" }))];
    let s = passAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "orderGraveyard", player: ap });
    s = settle(act(s, { type: "orderGraveyard", player: ap, order: [g, b!, a!] }));
    // Wrath of God went on top; the Griffin is exiled, then Bear B is the top creature card.
    expect(s.objects[g]!.zone).toBe("exile");
    expect(s.objects[b!]!.zone).toBe("battlefield");
    expect(yard(s, ap)).toEqual(["Wrath of God", "Bear A"]);
  });

  it("the bot puts its biggest creature card on top, and a Krovikan Horror under a creature card", () => {
    const { s: s0, ap, ids } = setup([wrath]);
    const h = putOnBattlefield(s0, ap, horror);
    putOnBattlefield(s0, ap, bear({ name: "Bear A" }));
    putOnBattlefield(s0, ap, card("Big", "Creature — Giant", "{5}{R}", { power: "5", toughness: "5" }));
    let s = passAll(run(s0, planCast(s0, ap, ids[0]!)));
    s = act(s, botActions(s, ap)[0]!);
    expect(yard(s, ap)).toEqual(["Wrath of God", "Big", "Krovikan Horror", "Bear A"]);
    expect(s.objects[h]!.zone).toBe("graveyard");
  });

  it("Krovikan Horror returns at an end step only with a creature card directly above it", () => {
    const { s: s0, ap } = setup([]);
    const [h] = bury(s0, ap, horror, bear());
    let s = settle(passUntil(s0, "end", ap));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[h!]!.zone).toBe("hand");

    const t = setup([]);
    bury(t.s, t.ap, horror, shock);
    const u = settle(passUntil(t.s, "end", t.ap));
    expect(u.pending).toBeNull();
    expect(u.stack).toHaveLength(0);
  });

  it("Death Spark: pay {1} at your upkeep to return it, with a creature card directly above it", () => {
    const { s: s0, ap } = setup([]);
    const [d] = bury(s0, ap, deathSpark, bear());
    let s = passUntil(s0, "end", ap);
    s = settle(passUntil(s, "upkeep", ap));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap, pay: { mana: "{1}" } });
    for (const a of botActions(s, ap)) s = act(s, a);
    s = settle(s);
    expect(s.objects[d!]!.zone).toBe("hand");
  });

  it("Pyre Zombie: does nothing if it left the graveyard before the trigger resolves (CR 603.4)", () => {
    const { s: s0, ap } = setup([]);
    const [z] = bury(s0, ap, pyre);
    let s = passUntil(s0, "end", ap);
    s = passUntil(s, "upkeep", ap);
    expect(s.stack.some((x) => x.sourceId === z)).toBe(true);
    // As if exiled in response: no longer in the graveyard, so nothing is paid.
    s.players[ap]!.graveyard = s.players[ap]!.graveyard.filter((x) => x !== z);
    s.objects[z!]!.zone = "exile";
    s.objects[z!]!.zoneChanges = (s.objects[z!]!.zoneChanges ?? 0) + 1;
    s.players[ap]!.exile.push(z!);
    s = settle(s);
    expect(s.pending).toBeNull();
    expect(s.objects[z!]!.zone).toBe("exile");
  });

  it("Necratog exiles the top creature card for +2/+2; with none, it can't", () => {
    const { s: s0, ap } = setup([]);
    const n = putOnBattlefield(s0, ap, necratog);
    const [a, , c] = bury(s0, ap, bear({ name: "Bear A" }), shock, bear({ name: "Bear C" }), shock);
    let s = settle(run(s0, planActivate(s0, ap, n, 0)));
    expect(s.objects[c!]!.zone).toBe("exile");
    expect(power(s, s.objects[n]!)).toBe(3);
    s = settle(run(s, planActivate(s, ap, n, 0)));
    expect(s.objects[a!]!.zone).toBe("exile");
    expect(planActivate(s, ap, n, 0)).toBeNull();
  });

  it("Alms exiles the top card of your graveyard, whatever it is", () => {
    const { s: s0, ap } = setup([]);
    const al = putOnBattlefield(s0, ap, alms);
    const b = putOnBattlefield(s0, ap, bear());
    const [, top] = bury(s0, ap, bear(), shock);
    const s = settle(run(s0, planActivate(s0, ap, al, 0, [target(b)])));
    expect(s.objects[top!]!.zone).toBe("exile");
    expect(s.players[ap]!.graveyard).toHaveLength(1);
  });

  it("Spinning Darkness for its alternative cost exiles the top three black cards, skipping the others", () => {
    const { s: s0, ap, ids, opp } = setup([spinning]);
    const victim = putOnBattlefield(s0, opp, bear());
    const [b1, , b2, b3, b4] = bury(s0, ap, blackBear("Z1"), shock, blackBear("Z2"), ritual, blackBear("Z3"));
    const alt = { alt: "alternative" as const };
    expect(castProblem(s0, ap, ids[0]!, [target(victim)], undefined, undefined, undefined, undefined, { ...alt, exileCards: [b1!, b2!, b3!] })).toMatch(/top 3 black cards/);
    const life = s0.players[ap]!.life;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(victim)], undefined, "auto", undefined, alt)));
    for (const id of [b2, b3, b4]) expect(s.objects[id!]!.zone).toBe("exile");
    expect(s.objects[b1!]!.zone).toBe("graveyard");
    expect(s.objects[victim]!.zone).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(life + 3);
    // Two black cards left: not enough.
    const t = setup([spinning]);
    bury(t.s, t.ap, blackBear("Z1"), blackBear("Z2"), shock);
    expect(castProblem(t.s, t.ap, t.ids[0]!, [target(putOnBattlefield(t.s, opp, bear()))], undefined, undefined, undefined, undefined, alt)).toMatch(/top 3 black cards/);
  });

  it("Soldevi Digger, Guiding Spirit and Phyrexian Furnace move the top or the bottom card", () => {
    const { s: s0, ap, opp } = setup([]);
    const dg = putOnBattlefield(s0, ap, digger);
    const gs = putOnBattlefield(s0, ap, guiding);
    const fu = putOnBattlefield(s0, ap, furnace);
    const [bottom, , top] = bury(s0, ap, bear({ name: "Bottom" }), shock, bear({ name: "Top" }));
    const [, oppTop] = bury(s0, opp, bear(), shock);
    let s = settle(run(s0, planActivate(s0, ap, dg, 0)));
    expect(s.players[ap]!.library.at(-1)).toBe(top);
    s = settle(run(s, planActivate(s, ap, fu, 0, [{ kind: "player", id: ap }])));
    expect(s.objects[bottom!]!.zone).toBe("exile");
    // The top card of the opponent's graveyard is Shock: Guiding Spirit does nothing.
    s = settle(run(s, planActivate(s, ap, gs, 0, [{ kind: "player", id: opp }])));
    expect(s.objects[oppTop!]!.zone).toBe("graveyard");
    expect(yard(s, ap)).toEqual(["Shock"]);
  });

  it("Guiding Spirit puts a creature card on top of its owner's library", () => {
    const { s: s0, ap, opp } = setup([]);
    const gs = putOnBattlefield(s0, ap, guiding);
    const [, top] = bury(s0, opp, shock, bear());
    const s = settle(run(s0, planActivate(s0, ap, gs, 0, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.library[0]).toBe(top);
  });

  it("Barrow Ghoul: exile the top creature card at upkeep, or it's sacrificed", () => {
    const { s: s0, ap } = setup([]);
    // An empty hand, so cleanup discards no creature cards on top of the graveyard.
    for (const id of s0.players[ap]!.hand.splice(0)) {
      s0.objects[id]!.zone = "library";
      s0.players[ap]!.library.push(id);
    }
    const g = putOnBattlefield(s0, ap, ghoul);
    bury(s0, ap, bear(), shock);
    let s = passUntil(s0, "end", ap);
    s = settle(passUntil(s, "upkeep", ap));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    // The top creature card now (cleanup may have discarded more creature cards on top of the buried one).
    const b = [...s.players[ap]!.graveyard].reverse().find((id) => s.cards[s.objects[id]!.cardId]!.types.includes("Creature"));
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[b!]!.zone).toBe("exile");
    expect(s.objects[g]!.zone).toBe("battlefield");
    // Next upkeep: no creature card left, so it's sacrificed.
    s = passUntil(s, "end", ap);
    s = settle(passUntil(s, "upkeep", ap));
    if (s.pending?.kind === "chooseMay") s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[g]!.zone).toBe("graveyard");
  });

  it("Bone Dancer, unblocked: takes the top creature card of the defending player's graveyard and deals no combat damage", () => {
    const { s: s0, ap, opp } = setup([]);
    const bd = putOnBattlefield(s0, ap, boneDancer);
    const [, top] = bury(s0, opp, bear({ name: "Old" }), bear({ name: "New" }), shock);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: bd, defender: opp }] });
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseMay"; i++) {
      if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    const life = s.players[opp]!.life;
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[top!]!.zone).toBe("battlefield");
    expect(s.objects[top!]!.controller).toBe(ap);
    s = settle(passUntil(s, "main2", ap));
    expect(s.players[opp]!.life).toBe(life);
  });

  it("Fossil Find returns a random card, then its caster reorders their whole graveyard", () => {
    const { s: s0, ap, ids } = setup([fossil]);
    const cards = bury(s0, ap, bear({ name: "A" }), shock, bear({ name: "C" }));
    let s = passAll(run(s0, planCast(s0, ap, ids[0]!)));
    const back = cards.find((id) => s.objects[id]!.zone === "hand");
    expect(back).toBeDefined();
    expect(s.pending).toMatchObject({ kind: "orderGraveyard", player: ap, whole: true });
    if (s.pending?.kind !== "orderGraveyard") throw new Error("no order");
    const order = [...s.pending.cards].reverse();
    s = settle(act(s, { type: "orderGraveyard", player: ap, order }));
    expect(yard(s, ap)).toEqual(["Fossil Find", ...order.map((id) => name(s, id))]);
  });

  it("Search for Survivors: a random creature card enters, anything else is exiled", () => {
    const { s: s0, ap, ids } = setup([survivors]);
    const [b] = bury(s0, ap, bear());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[b!]!.zone).toBe("battlefield");
    const t = setup([survivors]);
    const [sh] = bury(t.s, t.ap, shock);
    s = settle(run(t.s, planCast(t.s, t.ap, t.ids[0]!)));
    expect(s.objects[sh!]!.zone).toBe("exile");
  });

  it("Haunted Fengraf returns a creature card at random, never another kind", () => {
    const { s: s0, ap } = setup([]);
    const f = putOnBattlefield(s0, ap, fengraf);
    const [, b] = bury(s0, ap, shock, bear(), ritual);
    const s = settle(run(s0, planActivate(s0, ap, f, 0)));
    expect(s.objects[b!]!.zone).toBe("hand");
  });

  it("Dawn of the Dead returns a creature with haste until the end step; Balduvian Atrocity's is sacrificed then", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, dawn);
    const [b] = bury(s0, ap, bear());
    let s = passUntil(s0, "end", ap);
    s = passUntil(s, "upkeep", ap);
    for (let i = 0; i < 6 && (s.pending || s.stack.length || s.triggerQueue.length); i++) {
      if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [target(b!)] });
      else if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: ap, yes: true });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.objects[b!]!.zone).toBe("battlefield");
    expect(objHasKeyword(s, s.objects[b!]!, "Haste")).toBe(true);
    s = settle(passUntil(s, "end", ap));
    expect(s.objects[b!]!.zone).toBe("exile");

    const t = setup([atrocity]);
    const [c] = bury(t.s, t.ap, bear());
    let u = settle(run(t.s, planCast(t.s, t.ap, t.ids[0]!, undefined, undefined, "auto", undefined, { kicks: [0] })));
    if (u.pending?.kind === "chooseTargets") u = settle(act(u, { type: "chooseTargets", player: t.ap, targets: [target(c!)] }));
    expect(u.objects[c!]!.zone).toBe("battlefield");
    u = settle(passUntil(u, "end", t.ap));
    expect(u.objects[c!]!.zone).toBe("graveyard");
  });
});
