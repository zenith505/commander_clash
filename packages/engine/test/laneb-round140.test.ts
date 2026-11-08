// Lane B round B140: Riftmarked Knight (a token with flanking), Break the Ice ("snow or could produce {C}", CR 106.7),
// Earthbind (an Aura gaining a static ability, CR 613.7a), Bewitching Leechcraft (a granted untap replacement, CR
// 614.1a), Cycle of Life ("creature you cast this turn"), Rasputin Dreamweaver ("started the turn untapped", CR 122.4),
// Soul Separator, Circling Vultures (discarding it is a special action, CR 116.2e) and Sword of the Ages (sacrificing
// any number of creatures as a cost).

import { describe, expect, it } from "vitest";
import { act, addEffect, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, applyAction, botActions, characteristics, discardAnyTimeProblem, invalidateCharacteristics, isFullySupported, legalActions, objHasKeyword, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

// Real oracle text (Scryfall).
const knight = card("Riftmarked Knight", "Creature — Human Rebel Knight", "{1}{W}{W}", { power: "2", toughness: "2", keywords: ["Flanking", "Suspend", "Protection"], oracleText: "Protection from black; flanking (Whenever a creature without flanking blocks this creature, the blocking creature gets -1/-1 until end of turn.)\nSuspend 3—{1}{W}{W}\nWhen the last time counter is removed from this card while it's exiled, create a 2/2 black Knight creature token with flanking, protection from white, and haste." });
const breakIce = card("Break the Ice", "Sorcery", "{B}{B}", { keywords: ["Overload"], oracleText: 'Destroy target land that is snow or could produce {C}.\nOverload {4}{B}{B} (You may cast this spell for its overload cost. If you do, change "target" in its text to "each.")' });
const earthbind = card("Earthbind", "Enchantment — Aura", "{R}", { keywords: ["Enchant"], oracleText: 'Enchant creature\nWhen this Aura enters, if enchanted creature has flying, this Aura deals 2 damage to that creature and this Aura gains "Enchanted creature loses flying."' });
const leechcraft = card("Bewitching Leechcraft", "Enchantment — Aura", "{1}{U}", { keywords: ["Enchant"], oracleText: 'Enchant creature\nWhen this Aura enters, tap enchanted creature.\nEnchanted creature has "If this creature would untap during your untap step, remove a +1/+1 counter from it instead. If you do, untap it." (Otherwise, it doesn\'t untap.)' });
const cycle = card("Cycle of Life", "Enchantment", "{1}{G}{G}", { oracleText: "Return this enchantment to its owner's hand: Target creature you cast this turn has base power and toughness 0/1 until your next upkeep. At the beginning of your next upkeep, put a +1/+1 counter on that creature." });
const rasputin = card("Rasputin Dreamweaver", "Legendary Creature — Human Wizard", "{4}{W}{U}", { power: "4", toughness: "1", oracleText: "Rasputin enters with seven dream counters on it.\nRemove a dream counter from Rasputin: Add {C}.\nRemove a dream counter from Rasputin: Prevent the next 1 damage that would be dealt to Rasputin this turn.\nAt the beginning of your upkeep, if Rasputin started the turn untapped, put a dream counter on it.\nRasputin can't have more than seven dream counters on it." });
const separator = card("Soul Separator", "Artifact", "{3}", { oracleText: "{5}, {T}, Sacrifice this artifact: Exile target creature card from your graveyard. Create a token that's a copy of that card, except it's 1/1, it's a Spirit in addition to its other types, and it has flying. Create a black Zombie creature token with power equal to that card's power and toughness equal to that card's toughness." });
const vultures = card("Circling Vultures", "Creature — Bird", "{B}", { power: "3", toughness: "2", keywords: ["Flying"], oracleText: "Flying\nYou may discard this card any time you could cast an instant.\nAt the beginning of your upkeep, sacrifice this creature unless you exile the top creature card of your graveyard." });
const sword = card("Sword of the Ages", "Artifact", "{6}", { oracleText: "This artifact enters tapped.\n{T}, Sacrifice this artifact and any number of creatures you control: This artifact deals X damage to any target, where X is the total power of the creatures sacrificed this way, then exile this artifact and those creature cards." });

const flyer = card("Wind Drake", "Creature — Drake", "{2}{U}", { power: "2", toughness: "2", keywords: ["Flying"], oracleText: "Flying" });
const bigFlyer = card("Serra Angel", "Creature — Angel", "{3}{W}{W}", { power: "4", toughness: "4", keywords: ["Flying", "Vigilance"], oracleText: "Flying, vigilance" });
const snowForest = card("Snow-Covered Forest", "Basic Snow Land — Forest", "", { supertypes: ["Basic", "Snow"], oracleText: "({T}: Add {G}.)" });
const wastes = card("Wastes", "Basic Land", "", { supertypes: ["Basic"], oracleText: "{T}: Add {C}." });
const painland = card("Adarkar Wastes", "Land", "", { oracleText: "{T}: Add {C}.\n{T}: Add {W} or {U}. Adarkar Wastes deals 1 damage to you." });
const sage = card("Sage of Ancient Lore", "Creature — Human Shaman Werewolf", "{4}{G}", { power: "*", toughness: "*", oracleText: "Sage of Ancient Lore's power and toughness are each equal to the number of cards in your hand." });
const giant = card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" });
const madness = card("Bog Wraith Payoff", "Enchantment", "{B}", { oracleText: "Whenever you discard a card, you gain 1 life." });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
/** Everyone passes until the stack is empty; questions of the players in `me` stop it, others the bots answer. */
const settle = (s: GameState, opts: { me?: PlayerId[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && opts.me?.includes(p.player)) return s;
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Plays on (nobody attacks or blocks) until `stop`; other questions are answered as the bots would. */
const goUntil = (s: GameState, stop: (s: GameState) => boolean) => {
  for (let i = 0; i < 3000; i++) {
    if (stop(s)) return s;
    const p = s.pending;
    const pid = waitingOn(s)!;
    if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: pid });
  }
  throw new Error("never got there");
};
/** Puts `def` into `pid`'s graveyard (or exile). */
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "exile" | "hand") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
const tokensNamed = (s: GameState, name: string) => s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).name === name);

describe("Riftmarked Knight: the token its suspend makes has flanking", () => {
  it("parses", () => supported(knight));

  it("when the last time counter is removed in exile: a 2/2 black Knight with flanking, protection from white and haste", () => {
    const { s: s0, ap } = setup([]);
    const k = into(s0, ap, knight, "exile");
    s0.objects[k]!.counters.time = 1;
    let s = goUntil(s0, (x) => x.activePlayer === ap && x.step === "upkeep" && x.turn > s0.turn);
    for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      const p = s.pending;
      if ((p?.kind === "chooseMay" || p?.kind === "castFree") && p.player === ap) s = act(s, { type: "chooseMay", player: ap, yes: false });
      else if (p && p.player === ap) throw new Error(`unexpected ${p.kind}`);
      else if (p) s = act(s, botActions(s, p.player)[0]!);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    const [tok] = tokensNamed(s, "Knight Token");
    expect(tok).toBeDefined();
    const c = characteristics(s, s.objects[tok!]!);
    expect(c.colors).toEqual(["B"]);
    expect(pt(s, tok!)).toBe("2/2");
    for (const k of ["Flanking", "Protection from white", "Haste"]) expect(objHasKeyword(s, s.objects[tok!]!, k), k).toBe(true);
    // Flanking is its trigger too (CR 702.25a).
    expect(abilitiesOf(s, s.objects[tok!]!).triggers.some((t) => t.event === "selfBlockedByCreature")).toBe(true);
  });

  it("the token's flanking: a creature without flanking blocking it gets -1/-1 until end of turn (CR 702.25a)", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = into(s0, ap, knight, "exile");
    s0.objects[k]!.counters.time = 1;
    let s = goUntil(s0, (x) => x.activePlayer === ap && x.step === "upkeep" && x.turn > s0.turn);
    for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      const p = s.pending;
      if ((p?.kind === "chooseMay" || p?.kind === "castFree") && p.player === ap) s = act(s, { type: "chooseMay", player: ap, yes: false });
      else if (p) s = act(s, botActions(s, p.player)[0]!);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    const tok = tokensNamed(s, "Knight Token")[0]!;
    const plain = putOnBattlefield(s, opp, giant);
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: tok, defender: opp }] });
    for (let i = 0; i < 50 && s.pending?.kind !== "declareBlockers"; i++) s = s.pending ? settle(s) : act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: plain, attacker: tok }] });
    s = settle(s);
    expect(pt(s, plain)).toBe("2/2");
  });
});

describe("Break the Ice: a land that is snow or could produce {C}", () => {
  it("parses", () => supported(breakIce));

  it("targets a snow land, or one whose abilities could produce {C}, tapped or not (rulings), but not a plain Forest", () => {
    const { s: s0, ap, ids, opp } = setup([breakIce]);
    const snow = putOnBattlefield(s0, opp, snowForest);
    const w = putOnBattlefield(s0, opp, wastes);
    const pain = putOnBattlefield(s0, opp, painland);
    s0.objects[pain]!.tapped = true;
    const plainForest = putOnBattlefield(s0, opp, card("Forest", "Basic Land — Forest"));
    for (const t of [snow, w, pain]) expect(planCast(s0, ap, ids[0]!, [tgt(t)]), characteristics(s0, s0.objects[t]!).name).not.toBeNull();
    expect(planCast(s0, ap, ids[0]!, [tgt(plainForest)])).toBeNull();
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(pain)])));
    expect(zone(s, pain)).toBe("graveyard");
  });

  it("overloaded: each such land, anyone's, and no other", () => {
    const { s: s0, ap, ids, opp } = setup([breakIce]);
    const third = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    const snow = putOnBattlefield(s0, opp, snowForest);
    const w = putOnBattlefield(s0, third, wastes);
    const plainForest = putOnBattlefield(s0, opp, card("Forest", "Basic Land — Forest"));
    const plan = planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { alt: "overload" });
    expect(plan).not.toBeNull();
    const s = settle(run(s0, plan));
    expect(zone(s, snow)).toBe("graveyard");
    expect(zone(s, w)).toBe("graveyard");
    expect(zone(s, plainForest)).toBe("battlefield");
  });
});

describe("Earthbind: 2 damage and the Aura gains \"Enchanted creature loses flying\"", () => {
  it("parses", () => supported(earthbind));

  it("on a flyer: 2 damage and it loses flying; flying gained later still applies (timestamps, rulings); off it, flying is back", () => {
    const { s: s0, ap, ids, opp } = setup([earthbind]);
    const angel = putOnBattlefield(s0, opp, bigFlyer);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(angel)])));
    expect(s.objects[angel]!.damage).toBe(2);
    expect(objHasKeyword(s, s.objects[angel]!, "Flying")).toBe(false);
    expect(objHasKeyword(s, s.objects[angel]!, "Vigilance")).toBe(true);
    // A later effect giving it flying applies after Earthbind's (CR 613.7a: the ability's timestamp is when it was gained).
    addEffect(s, opp, [angel], [{ kind: "addKeywords", keywords: ["Flying"] }]);
    expect(objHasKeyword(s, s.objects[angel]!, "Flying")).toBe(true);
    s.effects.pop();
    invalidateCharacteristics(s);
    expect(objHasKeyword(s, s.objects[angel]!, "Flying")).toBe(false);
    // An effect from before Earthbind gained its ability doesn't beat it.
    const aura = s.battlefield.find((id) => characteristics(s, s.objects[id]!).name === "Earthbind")!;
    // Earthbind leaves: the creature has flying again.
    s.battlefield.splice(s.battlefield.indexOf(aura), 1);
    s.objects[aura]!.zone = "graveyard";
    s.players[ap]!.graveyard.push(aura);
    invalidateCharacteristics(s);
    expect(objHasKeyword(s, s.objects[angel]!, "Flying")).toBe(true);
  });

  it("on a creature without flying: no damage and no ability (the intervening if, CR 603.4)", () => {
    const { s: s0, ap, ids, opp } = setup([earthbind]);
    const ogre = putOnBattlefield(s0, opp, giant);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(ogre)])));
    expect(s.objects[ogre]!.damage).toBe(0);
    const aura = s.battlefield.find((id) => characteristics(s, s.objects[id]!).name === "Earthbind")!;
    expect(characteristics(s, s.objects[aura]!).grantedAbilities ?? []).toEqual([]);
    // Flying gained afterwards stays: the Aura never gained the ability.
    addEffect(s, opp, [ogre], [{ kind: "addKeywords", keywords: ["Flying"] }], "game");
    expect(objHasKeyword(s, s.objects[ogre]!, "Flying")).toBe(true);
  });

  it("a 2/2 flyer dies to the damage", () => {
    const { s: s0, ap, ids, opp } = setup([earthbind]);
    const drake = putOnBattlefield(s0, opp, flyer);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(drake)])));
    expect(zone(s, drake)).toBe("graveyard");
  });
});

describe("Bewitching Leechcraft: untapping costs a +1/+1 counter", () => {
  it("parses", () => supported(leechcraft));

  it("taps the creature; in its controller's untap step it untaps only by losing a +1/+1 counter", () => {
    const { s: s0, ap, ids, opp } = setup([leechcraft]);
    const target = putOnBattlefield(s0, opp, bear());
    s0.objects[target]!.counters["+1/+1"] = 1;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(target)])));
    expect(s.objects[target]!.tapped).toBe(true);
    // Its controller's untap step: the counter goes, it untaps.
    s = goUntil(s, (x) => x.activePlayer === opp && x.step === "upkeep");
    expect(s.objects[target]!.tapped).toBe(false);
    expect(s.objects[target]!.counters["+1/+1"] ?? 0).toBe(0);
    // Tapped again with no counter: it stays tapped the next time.
    s.objects[target]!.tapped = true;
    s = goUntil(s, (x) => x.activePlayer === opp && x.step === "upkeep" && x.turn > s0.turn + 4);
    expect(s.objects[target]!.tapped).toBe(true);
  });

  it("an untapped creature doesn't untap, so it keeps its counter", () => {
    const { s: s0, ap, ids, opp } = setup([leechcraft]);
    const target = putOnBattlefield(s0, opp, bear());
    s0.objects[target]!.counters["+1/+1"] = 2;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(target)])));
    s.objects[target]!.tapped = false; // untapped by something else
    s = goUntil(s, (x) => x.activePlayer === opp && x.step === "upkeep");
    expect(s.objects[target]!.counters["+1/+1"]).toBe(2);
  });

  it("two of them: each takes a counter (CR 616.1); with one counter it stays tapped", () => {
    const { s: s0, ap, ids, opp } = setup([leechcraft, leechcraft]);
    const target = putOnBattlefield(s0, opp, bear());
    s0.objects[target]!.counters["+1/+1"] = 1;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(target)])));
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(target)])));
    expect(abilitiesOf(s, s.objects[target]!).untapRemovesOwnCounter).toBe(2);
    s = goUntil(s, (x) => x.activePlayer === opp && x.step === "upkeep");
    expect(s.objects[target]!.tapped).toBe(true);
    expect(s.objects[target]!.counters["+1/+1"] ?? 0).toBe(0);
  });
});

describe("Cycle of Life: a creature you cast this turn becomes 0/1 until your next upkeep, then gets a +1/+1 counter", () => {
  it("parses", () => supported(cycle));

  it("only a creature you cast this turn can be the target, not one put onto the battlefield (rulings) or an opponent's", () => {
    const { s: s0, ap, ids, opp } = setup([giant]);
    const cyc = putOnBattlefield(s0, ap, cycle);
    const put = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, bear());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(planActivate(s, ap, cyc, 0, [tgt(put)])).toBeNull();
    expect(planActivate(s, ap, cyc, 0, [tgt(theirs)])).toBeNull();
    s = settle(run(s, planActivate(s, ap, cyc, 0, [tgt(ids[0]!)])));
    expect(zone(s, cyc)).toBe("hand");
    expect(pt(s, ids[0]!)).toBe("0/1");
    // At your next upkeep: back to 3/3 and a +1/+1 counter, 4/4.
    s = goUntil(s, (x) => x.activePlayer === ap && x.step === "upkeep" && x.turn > s0.turn);
    s = settle(s);
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(1);
    expect(pt(s, ids[0]!)).toBe("4/4");
  });

  it("not on a later turn: the creature was cast on an earlier one", () => {
    const { s: s0, ap, ids } = setup([giant]);
    const cyc = putOnBattlefield(s0, ap, cycle);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = goUntil(s, (x) => x.activePlayer === ap && x.step === "main1" && x.turn > s0.turn);
    expect(planActivate(s, ap, cyc, 0, [tgt(ids[0]!)])).toBeNull();
  });
});

describe("Rasputin Dreamweaver: a dream counter if it started the turn untapped, never more than seven", () => {
  it("parses", () => supported(rasputin));

  it("enters with seven; one used for mana comes back at your upkeep if it started the turn untapped", () => {
    const { s: s0, ap } = setup([]);
    const r = putOnBattlefield(s0, ap, rasputin);
    s0.objects[r]!.counters.dream = 6;
    let s = goUntil(s0, (x) => x.activePlayer === ap && x.step === "upkeep" && x.turn > s0.turn);
    s = settle(s);
    expect(s.objects[r]!.counters.dream).toBe(7);
  });

  it("no counter if it started the turn tapped, even though its untap step untapped it", () => {
    const { s: s0, ap } = setup([]);
    const r = putOnBattlefield(s0, ap, rasputin);
    s0.objects[r]!.counters.dream = 5;
    let s = goUntil(s0, (x) => x.activePlayer !== ap && x.step === "main1");
    s.objects[r]!.tapped = true;
    s = goUntil(s, (x) => x.activePlayer === ap && x.step === "upkeep");
    expect(s.objects[r]!.tapped).toBe(false);
    s = settle(s);
    expect(s.objects[r]!.counters.dream).toBe(5);
  });

  it("at seven, the eighth is removed as a state-based action (CR 122.4, 704.5r)", () => {
    const { s: s0, ap } = setup([]);
    const r = putOnBattlefield(s0, ap, rasputin);
    s0.objects[r]!.counters.dream = 7;
    let s = goUntil(s0, (x) => x.activePlayer === ap && x.step === "upkeep" && x.turn > s0.turn);
    s = settle(s);
    expect(s.objects[r]!.counters.dream).toBe(7);
    // Ten put on at once: down to seven.
    s.objects[r]!.counters.dream = 10;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[r]!.counters.dream).toBe(7);
  });
});

describe("Soul Separator: a 1/1 flying Spirit copy and a Zombie with the card's power and toughness", () => {
  it("parses", () => supported(separator));

  it("exiles the card; the Spirit copy is 1/1 with flying, the Zombie 3/3", () => {
    const { s: s0, ap } = setup([]);
    const ss = putOnBattlefield(s0, ap, separator);
    const dead = into(s0, ap, giant, "graveyard");
    const s = settle(run(s0, planActivate(s0, ap, ss, 0, [tgt(dead)])));
    expect(zone(s, dead)).toBe("exile");
    const spirit = tokensNamed(s, "Hill Giant")[0]!;
    expect(spirit).toBeDefined();
    const c = characteristics(s, s.objects[spirit]!);
    expect(c.subtypes).toEqual(expect.arrayContaining(["Giant", "Spirit"]));
    expect(pt(s, spirit)).toBe("1/1");
    expect(objHasKeyword(s, s.objects[spirit]!, "Flying")).toBe(true);
    const zombie = tokensNamed(s, "Zombie Token")[0]!;
    expect(pt(s, zombie)).toBe("3/3");
    expect(characteristics(s, s.objects[zombie]!).colors).toEqual(["B"]);
  });

  it("a characteristic-defining power and toughness counts in the graveyard (rulings): Sage of Ancient Lore", () => {
    const { s: s0, ap } = setup([bear(), bear()]);
    const ss = putOnBattlefield(s0, ap, separator);
    const dead = into(s0, ap, sage, "graveyard");
    const n = s0.players[ap]!.hand.length;
    const s = settle(run(s0, planActivate(s0, ap, ss, 0, [tgt(dead)])));
    const zombie = tokensNamed(s, "Zombie Token")[0]!;
    expect(pt(s, zombie)).toBe(`${n}/${n}`);
    // The Spirit copy is still 1/1 (rulings).
    expect(pt(s, tokensNamed(s, "Sage of Ancient Lore")[0]!)).toBe("1/1");
  });
});

describe("Circling Vultures: discarding it is a special action (CR 116.2e)", () => {
  it("parses", () => supported(vultures));

  it("discarded any time you have priority, with a spell on the stack too; you get priority again (CR 116.3)", () => {
    const { s: s0, ap, ids, opp } = setup([vultures, card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." })]);
    putOnBattlefield(s0, ap, madness);
    expect(legalActions(s0, ap)).toContainEqual({ type: "discardAnyTime", player: ap, objectId: ids[0]! });
    // With Shock on the stack.
    let s = run(s0, planCast(s0, ap, ids[1]!, [{ kind: "player", id: opp }]));
    expect(s.stack.length).toBe(1);
    expect(discardAnyTimeProblem(s, ap, ids[0]!)).toBeNull();
    const life = s.players[ap]!.life;
    s = act(s, { type: "discardAnyTime", player: ap, objectId: ids[0]! });
    expect(zone(s, ids[0]!)).toBe("graveyard");
    // It's a discard: "whenever you discard a card" triggers.
    expect(waitingOn(s)).toBe(ap);
    s = settle(s);
    expect(s.players[ap]!.life).toBe(life + 1);
  });

  it("not without priority, not from the battlefield, not another player's", () => {
    const { s: s0, ap, ids, opp } = setup([vultures]);
    expect(discardAnyTimeProblem(s0, opp, ids[0]!)).not.toBeNull();
    const onField = putOnBattlefield(s0, ap, vultures);
    expect(discardAnyTimeProblem(s0, ap, onField)).not.toBeNull();
    expect(() => act(s0, { type: "discardAnyTime", player: opp, objectId: ids[0]! })).toThrow();
    const s = act(s0, { type: "passPriority", player: ap });
    expect(discardAnyTimeProblem(s, ap, ids[0]!)).not.toBeNull();
  });
});

describe("Sword of the Ages: sacrifice it and any number of creatures, damage equal to their total power", () => {
  it("parses", () => supported(sword));

  it("two creatures sacrificed: their total power as they last existed (rulings) to any target, then it and those cards are exiled", () => {
    const { s: s0, ap, opp } = setup([]);
    const sw = putOnBattlefield(s0, ap, sword);
    const a = putOnBattlefield(s0, ap, giant);
    const b = putOnBattlefield(s0, ap, bear());
    const tok = putOnBattlefield(s0, ap, bear({ name: "Bear Token" }));
    s0.objects[tok]!.isToken = true;
    addEffect(s0, ap, [b], [{ kind: "modifyPT", power: 2, toughness: 0 }]);
    const life = s0.players[opp]!.life;
    let s = run(s0, planActivate(s0, ap, sw, 0, [{ kind: "player", id: opp }], undefined, undefined, 3, { sacrifice: [a, b, tok] }));
    expect(zone(s, sw)).toBe("graveyard");
    s = settle(s);
    // 3 + 4 + 2.
    expect(s.players[opp]!.life).toBe(life - 9);
    expect(zone(s, sw)).toBe("exile");
    expect(zone(s, a)).toBe("exile");
    expect(zone(s, b)).toBe("exile");
    expect(s.objects[tok]?.zone ?? "gone").not.toBe("battlefield");
  });

  it("with no creatures: 0 damage, the Sword still exiled", () => {
    const { s: s0, ap, opp } = setup([]);
    const sw = putOnBattlefield(s0, ap, sword);
    const life = s0.players[opp]!.life;
    const s = settle(run(s0, planActivate(s0, ap, sw, 0, [{ kind: "player", id: opp }], undefined, undefined, 0, { sacrifice: [] })));
    expect(s.players[opp]!.life).toBe(life);
    expect(zone(s, sw)).toBe("exile");
  });

  it("a creature card that left the graveyard before it resolves stays where it went", () => {
    const { s: s0, ap, opp } = setup([]);
    const sw = putOnBattlefield(s0, ap, sword);
    const a = putOnBattlefield(s0, ap, giant);
    let s = run(s0, planActivate(s0, ap, sw, 0, [{ kind: "player", id: opp }], undefined, undefined, 1, { sacrifice: [a] }));
    // Something returns the card to its owner's hand in response.
    s.players[ap]!.graveyard.splice(s.players[ap]!.graveyard.indexOf(a), 1);
    s.objects[a]!.zone = "hand";
    s.objects[a]!.zoneChanges = (s.objects[a]!.zoneChanges ?? 0) + 1;
    s.players[ap]!.hand.push(a);
    s = settle(s);
    expect(zone(s, a)).toBe("hand");
  });
});
