// Round 147: the most played cards, in popularity order, starting with The Legend of Roku.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, scry, setup } from "./helpers";
import { abilitiesOf, characteristics, gainLife, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type Step, type TargetChoice } from "../src";
import { nextRandom } from "../src/rng";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; "you may" questions get `yes`. Stops at any other question. */
const resolveAll = (s: GameState, yes = true) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending?.kind === "chooseMay"); i++) {
    if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: s.pending.player, yes });
    else if (s.pending) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Passes (resolving everything on the way, "you may" answered `yes`) until `step` of `active`'s turn. */
const advance = (s: GameState, step: Step, active: PlayerId, yes = true) => {
  for (let i = 0; i < 3000; i++) {
    if (s.step === step && s.activePlayer === active && !s.stack.length && !s.triggerQueue.length && !s.pending) return s;
    const p = s.pending;
    if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes });
    else if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: waitingOn(s)!, attacks: [] });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: waitingOn(s)!, blocks: [] });
    else if (p?.kind === "discardToHandSize") s = act(s, { type: "discard", player: p.player, objectIds: s.players[p.player]!.hand.slice(0, p.count) });
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  throw new Error(`never reached ${step}`);
};
/** Passes (no attacks or blocks) until someone is asked something. */
const untilAsked = (s: GameState) => {
  for (let i = 0; i < 3000 && (!s.pending || ["declareAttackers", "declareBlockers", "discardToHandSize"].includes(s.pending.kind)); i++) {
    const p = s.pending;
    if (p?.kind === "discardToHandSize") s = act(s, { type: "discard", player: p.player, objectIds: s.players[p.player]!.hand.slice(0, p.count) });
    else if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: waitingOn(s)!, attacks: [] });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: waitingOn(s)!, blocks: [] });
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** A card put straight into a zone, not from the battlefield. */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "graveyard" | "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const obj = (id: string): TargetChoice => ({ kind: "object", id });
const next = (s: GameState, pid: PlayerId, k = 1) => s.turnOrder[(s.turnOrder.indexOf(pid) + k) % s.turnOrder.length]!;
/** Sets the game's random state so the next flips come out as `wins` (true: won). */
function rig(s: GameState, ...wins: boolean[]) {
  for (let x = 1; x < 1_000_000; x++) {
    const r = { rngState: x };
    if (wins.every((w) => nextRandom(r) < 0.5 === w)) {
      s.rngState = x;
      return;
    }
  }
  throw new Error("no such state");
}

// Real oracle text (Scryfall).
const roku = scry("transform", [
  { name: "The Legend of Roku", mana_cost: "{2}{R}{R}", type_line: "Enchantment — Saga", oracle_text: "(As this Saga enters and after your draw step, add a lore counter.)\nI — Exile the top three cards of your library. Until the end of your next turn, you may play those cards.\nII — Add one mana of any color.\nIII — Exile this Saga, then return it to the battlefield transformed under your control." },
  { name: "Avatar Roku", type_line: "Legendary Creature — Avatar", power: "4", toughness: "4", oracle_text: "Firebending 4 (Whenever this creature attacks, add {R}{R}{R}{R}. This mana lasts until end of combat.)\n{8}: Create a 4/4 red Dragon creature token with flying and firebending 4." },
], { keywords: ["Firebending", "Transform"] });

describe("The Legend of Roku // Avatar Roku", () => {
  it("is fully supported; Avatar Roku's Dragon has flying and firebending 4", () => {
    supported(roku);
    const { s: s0, ap } = setup([]);
    const r = putOnBattlefield(s0, ap, roku);
    s0.objects[r]!.face = 1;
    invalidateCharacteristics(s0);
    const make = abilitiesOf(s0, s0.objects[r]!).activated.findIndex((a) => a.body.effects.some((e) => e.type === "createToken"));
    let s = resolveAll(run(s0, planActivate(s0, ap, r, make)));
    const dragon = s.battlefield.find((id) => s.objects[id]!.isToken)!;
    expect(characteristics(s, s.objects[dragon]!).subtypes).toEqual(["Dragon"]);
    expect(pt(s, dragon)).toBe("4/4");
    expect(objHasKeyword(s, s.objects[dragon]!, "Flying")).toBe(true);
    // Firebending 4: attacking adds {R}{R}{R}{R}.
    s.objects[dragon]!.controlledSinceTurn = -1;
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: dragon, defender: next(s, ap) }] });
    s = resolveAll(s);
    expect(s.players[ap]!.manaPool.R).toBe(4);
  });
});

const amalia = card("Amalia Benavides Aguirre", "Legendary Creature — Vampire Scout", "{W}{B}", { power: "2", toughness: "2", keywords: ["Ward"], oracleText: "Ward—Pay 3 life.\nWhenever you gain life, Amalia Benavides Aguirre explores. Then destroy all other creatures if its power is exactly 20. (To have this creature explore, reveal the top card of your library. Put that card into your hand if it's a land. Otherwise, put a +1/+1 counter on this creature, then put the card back or put it into your graveyard.)" });

describe("Amalia Benavides Aguirre", () => {
  const gain = (counters: number, land: boolean) => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, amalia);
    s0.objects[a]!.counters["+1/+1"] = counters;
    const mine = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    into(s0, ap, land ? card("Test Plains", "Basic Land — Plains") : bear({ name: "Top Bear" }), "library");
    invalidateCharacteristics(s0);
    gainLife(s0, ap, 1);
    return { s: resolveAll(s0, false), a, mine, theirs };
  };

  it("is fully supported; exploring to power exactly 20 destroys all other creatures", () => {
    supported(amalia);
    const { s, a, mine, theirs } = gain(17, false);
    expect(pt(s, a)).toBe("20/20");
    expect(s.objects[a]!.zone).toBe("battlefield");
    expect(s.objects[mine]!.zone).toBe("graveyard");
    expect(s.objects[theirs]!.zone).toBe("graveyard");
  });

  it("at any other power after exploring, nothing is destroyed", () => {
    const over = gain(18, false);
    expect(pt(over.s, over.a)).toBe("21/21");
    expect(over.s.objects[over.theirs]!.zone).toBe("battlefield");
    const land = gain(17, true);
    expect(pt(land.s, land.a)).toBe("19/19");
    expect(land.s.objects[land.theirs]!.zone).toBe("battlefield");
    // A land revealed at power 20 already: it's exactly 20 after exploring.
    const at20 = gain(18, true);
    expect(at20.s.objects[at20.theirs]!.zone).toBe("graveyard");
  });
});

const alms = card("Alms Collector", "Creature — Cat Cleric", "{3}{W}", { power: "3", toughness: "4", keywords: ["Flash"], oracleText: "Flash\nIf an opponent would draw two or more cards, instead you and that player each draw a card." });
const divination = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });
const opt = card("Test Opt", "Instant", "{U}", { oracleText: "Draw a card." });

describe("Alms Collector", () => {
  it("is fully supported; an opponent's draw two becomes one card for them and one for you", () => {
    supported(alms, divination);
    const { s: s0, ap, ids, opp } = setup([divination]);
    putOnBattlefield(s0, opp, alms);
    const [mine, theirs] = [s0.players[ap]!.hand.length, s0.players[opp]!.hand.length];
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.players[ap]!.hand.length).toBe(mine - 1 + 1);
    expect(s.players[opp]!.hand.length).toBe(theirs + 1);
    // The active player draws first (CR 121.2c).
    expect(s.log.some((l) => /each draw a card instead \(Alms Collector\)/.test(l.text))).toBe(true);
  });

  it("doesn't change a single draw, or its controller's own draws", () => {
    const { s: s0, ap, ids, opp } = setup([opt, divination]);
    putOnBattlefield(s0, opp, alms);
    const [mine, theirs] = [s0.players[ap]!.hand.length, s0.players[opp]!.hand.length];
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.players[ap]!.hand.length).toBe(mine - 1 + 1);
    expect(s.players[opp]!.hand.length).toBe(theirs);
    // Its controller drawing two: still two.
    const { s: s1, ap: ap1, ids: ids1 } = setup([divination]);
    putOnBattlefield(s1, ap1, alms);
    const before = s1.players[ap1]!.hand.length;
    s = resolveAll(run(s1, planCast(s1, ap1, ids1[0]!)));
    expect(s.players[ap1]!.hand.length).toBe(before - 1 + 2);
  });

  it("with two Collectors, each controller's own draw two is changed by the other's (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([divination]);
    putOnBattlefield(s0, ap, alms);
    putOnBattlefield(s0, opp, alms);
    const [mine, theirs] = [s0.players[ap]!.hand.length, s0.players[opp]!.hand.length];
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.players[ap]!.hand.length).toBe(mine - 1 + 1);
    expect(s.players[opp]!.hand.length).toBe(theirs + 1);
  });
});

const mirrorMarch = card("Mirror March", "Enchantment", "{5}{R}", { oracleText: "Whenever a nontoken creature you control enters, flip a coin until you lose a flip. For each flip you won, create a token that's a copy of that creature. Those tokens gain haste. Exile them at the beginning of the next end step." });

describe("Mirror March", () => {
  it("is fully supported; a token copy with haste for each flip won, exiled at the next end step", () => {
    supported(mirrorMarch);
    const { s: s0, ap, ids } = setup([bear({ name: "Marching Bear" })]);
    putOnBattlefield(s0, ap, mirrorMarch);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    // The Bear resolves; the trigger goes on the stack, then flips: win, win, lose.
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    for (let i = 0; i < 8 && s.stack.length && s.stack[0]!.kind === "spell"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    rig(s, true, true, false);
    s = resolveAll(s);
    const copies = s.battlefield.filter((id) => s.objects[id]!.isToken);
    expect(copies).toHaveLength(2);
    for (const c of copies) {
      expect(characteristics(s, s.objects[c]!).name).toBe("Marching Bear");
      expect(objHasKeyword(s, s.objects[c]!, "Haste")).toBe(true);
    }
    s = advance(s, "end", ap);
    s = resolveAll(s);
    expect(s.battlefield.filter((id) => s.objects[id]!.isToken)).toHaveLength(0);
    // Losing the first flip makes none.
    const { s: s1, ap: ap1, ids: ids1 } = setup([bear()]);
    putOnBattlefield(s1, ap1, mirrorMarch);
    let t = run(s1, planCast(s1, ap1, ids1[0]!));
    for (let i = 0; i < 8 && t.stack.length && t.stack[0]!.kind === "spell"; i++) t = act(t, { type: "passPriority", player: waitingOn(t)! });
    rig(t, false);
    t = resolveAll(t);
    expect(t.battlefield.filter((id) => t.objects[id]!.isToken)).toHaveLength(0);
  });
});

const beastbinder = card("Azure Beastbinder", "Creature — Rat Rogue", "{1}{U}", { power: "1", toughness: "3", keywords: ["Vigilance"], oracleText: "Vigilance\nThis creature can't be blocked by creatures with power 2 or greater.\nWhenever this creature attacks, up to one target artifact, creature, or planeswalker an opponent controls loses all abilities until your next turn. If it's a creature, it also has base power and toughness 2/2 until your next turn." });
const flyer = card("Test Roc", "Creature — Bird", "{4}{W}", { power: "5", toughness: "5", keywords: ["Flying"], oracleText: "Flying" });
const relic = card("Test Relic", "Artifact", "{2}", { oracleText: "{T}: You gain 1 life." });

describe("Azure Beastbinder", () => {
  const attack = (def: CardDef) => {
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, ap, beastbinder);
    const t = putOnBattlefield(s0, opp, def);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    return { s, ap, opp, b, t };
  };

  it("is fully supported; a creature loses all abilities and is a 2/2 until your next turn", () => {
    supported(beastbinder);
    const { s: s0, ap, t } = attack(flyer);
    // The trigger targets the Roc (the bot-free plan picks it as the only target).
    let s = s0;
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [obj(t)] });
    s = resolveAll(s);
    expect(pt(s, t)).toBe("2/2");
    expect(objHasKeyword(s, s.objects[t]!, "Flying")).toBe(false);
    // Still so on the next player's turn, and over on yours.
    s = advance(s, "upkeep", next(s, ap));
    expect(pt(s, t)).toBe("2/2");
    s = advance(s, "upkeep", ap);
    expect(pt(s, t)).toBe("5/5");
    expect(objHasKeyword(s, s.objects[t]!, "Flying")).toBe(true);
  });

  it("a noncreature artifact only loses its abilities", () => {
    const { s: s0, ap, t } = attack(relic);
    let s = s0;
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [obj(t)] });
    s = resolveAll(s);
    expect(abilitiesOf(s, s.objects[t]!).activated).toHaveLength(0);
    expect(characteristics(s, s.objects[t]!).types).toEqual(["Artifact"]);
  });
});

const dawn = card("Dawn of a New Age", "Enchantment", "{1}{W}", { oracleText: "This enchantment enters with a hope counter on it for each creature you control.\nAt the beginning of your end step, remove a hope counter from this enchantment. If you do, draw a card. Then if this enchantment has no hope counters on it, sacrifice it and you gain 4 life." });

describe("Dawn of a New Age", () => {
  it("is fully supported; each end step a hope counter comes off for a card; with none left, it's sacrificed for 4 life", () => {
    supported(dawn);
    const { s: s0, ap } = setup([dawn]);
    putOnBattlefield(s0, ap, bear());
    putOnBattlefield(s0, ap, bear());
    let s = resolveAll(run(s0, planCast(s0, ap, s0.players[ap]!.hand[s0.players[ap]!.hand.length - 1]!)));
    const d = s.battlefield.find((id) => characteristics(s, s.objects[id]!).name === "Dawn of a New Age")!;
    expect(s.objects[d]!.counters.hope).toBe(2);
    const [hand, life] = [s.players[ap]!.hand.length, s.players[ap]!.life];
    s = resolveAll(advance(s, "end", ap));
    expect(s.objects[d]!.counters.hope).toBe(1);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.objects[d]!.zone).toBe("battlefield");
    s = resolveAll(advance(advance(s, "upkeep", next(s, ap)), "end", ap));
    expect(s.objects[d]!.zone).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(life + 4);
  });

  it("with no hope counter to remove, no card: it's just sacrificed", () => {
    const { s: s0, ap } = setup([]);
    const d = putOnBattlefield(s0, ap, dawn);
    const [hand, life] = [s0.players[ap]!.hand.length, s0.players[ap]!.life];
    const s = resolveAll(advance(s0, "end", ap));
    expect(s.objects[d]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(s.players[ap]!.life).toBe(life + 4);
  });
});

const tymna = card("Tymna the Weaver", "Legendary Creature — Human Cleric", "{1}{W}{B}", { power: "2", toughness: "2", keywords: ["Lifelink", "Partner"], oracleText: "Lifelink\nAt the beginning of each of your postcombat main phases, you may pay X life, where X is the number of opponents that were dealt combat damage this turn. If you do, draw X cards.\nPartner (You can have two commanders if both have partner.)" });

describe("Tymna the Weaver", () => {
  it("is fully supported; pay X life to draw X, X the opponents dealt combat damage this turn", () => {
    supported(tymna);
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, tymna);
    const a = putOnBattlefield(s0, ap, bear({ name: "Bear A" }));
    const b = putOnBattlefield(s0, ap, bear({ name: "Bear B" }));
    const c = putOnBattlefield(s0, ap, bear({ name: "Bear C" }));
    let s = passUntil(s0, "declareAttackers", ap);
    // Two attack one opponent, one another: two opponents dealt combat damage.
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: next(s, ap) }, { attacker: b, defender: next(s, ap) }, { attacker: c, defender: next(s, ap, 2) }] });
    s = advance(s, "main2", ap, false);
    // The trigger: declined above, so nothing yet; check the next turn-less case by answering now.
    expect(s.players[ap]!.life).toBe(40);
    const { s: t0, ap: ap1 } = setup([]);
    putOnBattlefield(t0, ap1, tymna);
    const a1 = putOnBattlefield(t0, ap1, bear({ name: "Bear A" }));
    const c1 = putOnBattlefield(t0, ap1, bear({ name: "Bear C" }));
    let t = passUntil(t0, "declareAttackers", ap1);
    t = act(t, { type: "declareAttackers", player: ap1, attacks: [{ attacker: a1, defender: next(t, ap1) }, { attacker: c1, defender: next(t, ap1, 2) }] });
    const hand = t.players[ap1]!.hand.length;
    t = advance(t, "main2", ap1, true);
    expect(t.players[ap1]!.life).toBe(38);
    expect(t.players[ap1]!.hand.length).toBe(hand + 2);
  });
});

const barrowgoyf = card("Barrowgoyf", "Creature — Lhurgoyf", "{2}{B}", { power: "*", toughness: "1+*", keywords: ["Deathtouch", "Lifelink"], oracleText: "Deathtouch, lifelink\nBarrowgoyf's power is equal to the number of card types among cards in all graveyards and its toughness is equal to that number plus 1.\nWhenever this creature deals combat damage to a player, you may mill that many cards. If you do, you may put a creature card from among them into your hand." });

describe("Barrowgoyf", () => {
  it("is fully supported; mill that many, then a creature card from among them may go to your hand", () => {
    supported(barrowgoyf);
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, barrowgoyf);
    // Two card types in graveyards: a 2/3.
    into(s0, opp, card("Test Land", "Land"), "graveyard");
    into(s0, opp, card("Test Shock", "Instant", "{R}"), "graveyard");
    into(s0, ap, card("Top Land", "Land"), "library");
    const beast = into(s0, ap, bear({ name: "Milled Bear" }), "library");
    expect(pt(s0, g)).toBe("2/3");
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: g, defender: opp }] });
    for (let i = 0; i < 400 && !(s.pending && s.pending.kind !== "declareBlockers"); i++) {
      if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: waitingOn(s)!, blocks: [] });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    // The milled Bear is offered; take it.
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, cards: [beast], min: 0, max: 1 });
    s = act(s, { type: "searchLibrary", player: ap, found: [beast] });
    expect(s.objects[beast]!.zone).toBe("hand");
  });
});

const assaultSuit = card("Assault Suit", "Artifact — Equipment", "{4}", { keywords: ["Equip"], oracleText: "Equipped creature gets +2/+2, has haste, can't attack you or planeswalkers you control, and can't be sacrificed.\nAt the beginning of each opponent's upkeep, you may have that player gain control of equipped creature until end of turn. If you do, untap it.\nEquip {3}" });
const sacOutlet = card("Test Altar", "Artifact", "{1}", { oracleText: "Sacrifice a creature: You gain 1 life." });

describe("Assault Suit", () => {
  const suited = () => {
    const { s, ap } = setup([]);
    const holder = putOnBattlefield(s, ap, bear({ name: "Suited Bear" }));
    const suit = putOnBattlefield(s, ap, assaultSuit);
    s.objects[suit]!.attachedTo = holder;
    s.objects[holder]!.tapped = true;
    invalidateCharacteristics(s);
    return { s, ap, holder, suit };
  };

  it("is fully supported; +2/+2, haste, and it can't be sacrificed", () => {
    supported(assaultSuit);
    const { s, ap, holder } = suited();
    expect(pt(s, holder)).toBe("4/4");
    expect(objHasKeyword(s, s.objects[holder]!, "Haste")).toBe(true);
    const altar = putOnBattlefield(s, ap, sacOutlet);
    expect(planActivate(s, ap, altar, 0, undefined, undefined, undefined, undefined, { sacrifice: [holder] })).toBeNull();
  });

  it("each opponent's upkeep: that player may be given the creature until end of turn, untapped; it can't attack you", () => {
    const { s: s0, ap, holder, suit } = suited();
    const opp = next(s0, ap);
    let s = untilAsked(s0);
    expect(s.activePlayer).toBe(opp);
    expect(s.step).toBe("upkeep");
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = resolveAll(s, true);
    expect(characteristics(s, s.objects[holder]!).controller).toBe(opp);
    expect(s.objects[holder]!.tapped).toBe(false);
    expect(s.objects[suit]!.attachedTo).toBe(holder);
    s = passUntil(s, "declareAttackers", opp);
    expect(() => act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: holder, defender: ap }] })).toThrow();
    const t = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: holder, defender: next(s, ap, 2) }] });
    expect(t.objects[holder]!.attacking).toBe(next(s, ap, 2));
    // Back to you at the end of the turn.
    const u = advance(t, "upkeep", next(t, opp), false);
    expect(characteristics(u, u.objects[holder]!).controller).toBe(ap);
  });

  it("declining keeps the creature", () => {
    const { s: s0, ap, holder } = suited();
    const s = resolveAll(untilAsked(s0), false);
    expect(characteristics(s, s.objects[holder]!).controller).toBe(ap);
  });
});

const goblinShadow = card("Shadow of the Goblin", "Enchantment", "{1}{R}", { oracleText: "Unreliable Visions — At the beginning of your first main phase, discard a card. If you do, draw a card.\nUndying Vengeance — Whenever you play a land or cast a spell from anywhere other than your hand, this enchantment deals 1 damage to each opponent." });

describe("Shadow of the Goblin", () => {
  it("is fully supported; your first main phase: discard a card, and if you do, draw one", () => {
    supported(goblinShadow);
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, goblinShadow);
    let s = advance(s0, "draw", ap);
    s = untilAsked(s);
    expect(s.step).toBe("main1");
    expect(s.pending).toMatchObject({ kind: "discard", player: ap });
    const hand = s.players[ap]!.hand.length;
    const card0 = s.players[ap]!.hand[0]!;
    s = resolveAll(act(s, { type: "discard", player: ap, objectIds: [card0] }));
    expect(s.objects[card0]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand);
  });

  it("with an empty hand, nothing is discarded and no card is drawn", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, goblinShadow);
    let s = advance(s0, "draw", ap);
    // Empty the hand after the draw.
    for (const id of [...s.players[ap]!.hand]) {
      s.players[ap]!.hand.splice(s.players[ap]!.hand.indexOf(id), 1);
      s.objects[id]!.zone = "exile";
    }
    s = advance(s, "main1", ap);
    expect(s.players[ap]!.hand).toHaveLength(0);
  });

  it("a land played or a spell cast from anywhere but your hand deals 1 damage to each opponent", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, goblinShadow);
    const fromYard = into(s0, ap, card("Test Flashback Bolt", "Instant", "{R}", { oracleText: "Test Flashback Bolt deals 1 damage to any target.\nFlashback {R}" , keywords: ["Flashback"] }), "graveyard");
    const handLand = into(s0, ap, card("Test Mountain", "Basic Land — Mountain"), "hand");
    let s = act(s0, { type: "playLand", player: ap, objectId: handLand });
    s = resolveAll(s);
    expect(s.players[next(s, ap)]!.life).toBe(40);
    s = run(s, planCast(s, ap, fromYard, [{ kind: "player", id: ap }], undefined, "auto", undefined, { via: "flashback" } as never));
    s = resolveAll(s);
    for (const p of [1, 2, 3]) expect(s.players[next(s, ap, p)]!.life).toBe(39);
  });
});

const decree = card("Norn's Decree", "Enchantment", "{2}{W}", { oracleText: "Whenever one or more creatures an opponent controls deal combat damage to you, that opponent gets a poison counter.\nWhenever a player attacks, if one or more players being attacked are poisoned, the attacking player draws a card." });

describe("Norn's Decree", () => {
  it("is fully supported; an opponent's creatures dealing you combat damage give that opponent a poison counter, once", () => {
    supported(decree);
    const { s: s0, ap } = setup([]);
    const victim = next(s0, ap);
    putOnBattlefield(s0, victim, decree);
    const a = putOnBattlefield(s0, ap, bear({ name: "Bear A" }));
    const b = putOnBattlefield(s0, ap, bear({ name: "Bear B" }));
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: victim }, { attacker: b, defender: victim }] });
    s = advance(s, "main2", ap);
    expect(s.players[ap]!.poison ?? 0).toBe(1);
    expect(s.players[victim]!.life).toBe(36);
  });

  it("a player attacking a poisoned player draws a card; attacking only unpoisoned players, none", () => {
    const { s: s0, ap } = setup([]);
    const owner = next(s0, ap);
    putOnBattlefield(s0, owner, decree);
    const a = putOnBattlefield(s0, ap, bear({ name: "Bear A" }));
    s0.players[next(s0, ap, 2)]!.poison = 1;
    let s = passUntil(s0, "declareAttackers", ap);
    const hand = s.players[ap]!.hand.length;
    const t = resolveAll(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: owner }] }));
    expect(t.players[ap]!.hand.length).toBe(hand);
    s = resolveAll(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: next(s, ap, 2) }] }));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });
});
