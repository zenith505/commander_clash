// Round 168: the most played cards, in popularity order, after round 167 (from Emperor of Bones and The Wandering
// Emperor on).

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, passUntil, pt, putOnBattlefield, setup, swamp } from "./helpers";
import { abilityProblem, botActions, parseManaCost, planMana, characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Says yes (or no) to a "you may" question, paying its mana first. */
const may = (s: GameState, yes: boolean) => {
  if (s.pending?.kind !== "chooseMay") throw new Error("no question");
  const pid = s.pending.player;
  if (yes && s.pending.pay?.mana) for (const a of planMana(s, pid, parseManaCost(s.pending.pay.mana))!) s = act(s, a);
  return act(s, { type: "chooseMay", player: pid, yes });
};
/** Everyone passes until the stack is empty; "you may" questions get `yes`. Stops at any other question. */
const resolveAll = (s: GameState, yes = true) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending?.kind === "chooseMay"); i++) {
    if (s.pending?.kind === "chooseMay") s = may(s, yes);
    else if (s.pending) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** A card put straight into a zone, not from the battlefield. */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "graveyard" | "hand" | "library" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else if (zone !== "exile") s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Like `resolveAll`, and other players' questions are answered by the bot. */
const settle = (s: GameState, me: PlayerId, yes = true) => {
  for (let i = 0; i < 40; i++) {
    s = resolveAll(s, yes);
    if (!s.pending || s.pending.player === me) return s;
    s = run(s, botActions(s, s.pending.player));
  }
  return s;
};
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const next = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % s.turnOrder.length]!;
const attack = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) => act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks });
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const kw = (s: GameState, id: string, k: string) => objHasKeyword(s, s.objects[id]!, k);
const pending = <T = Record<string, unknown>>(s: GameState) => s.pending as unknown as T;
const named = (s: GameState, id: string) => characteristics(s, s.objects[id]!).name;
/** Players pass until `pid` has priority, in this step. */
const priorityTo = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 8 && waitingOn(s) !== pid; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  expect(waitingOn(s)).toBe(pid);
  return s;
};
void [bear, card, pt, characteristics, kw, settle, zone, next, attack, tgt, pending, named, abilityProblem, passAll];

// Real oracle text (Scryfall).
const emperor = card("The Wandering Emperor", "Legendary Planeswalker", "{2}{W}{W}", { cmc: 4, loyalty: "3", oracleText: "Flash\nAs long as The Wandering Emperor entered this turn, you may activate her loyalty abilities any time you could cast an instant.\n+1: Put a +1/+1 counter on up to one target creature. It gains first strike until end of turn.\n−1: Create a 2/2 white Samurai creature token with vigilance.\n−2: Exile target tapped creature. You gain 2 life.", keywords: ["Flash"] });

describe("The Wandering Emperor", () => {
  it("is fully supported", () => supported(emperor));
  it("on the turn she entered, her loyalty abilities can be activated at instant speed, still only one", () => {
    let { s, ap, opp } = setup([]);
    s = priorityTo(passUntil(s, "upkeep", opp), ap);
    const ids = [into(s, ap, emperor, "hand")];
    s = run(s, planCast(s, ap, ids[0]!));
    s = resolveAll(s);
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(s.activePlayer).toBe(opp);
    // On an opponent's turn, with priority: the −1.
    s = priorityTo(s, ap);
    const idx = 1;
    expect(abilityProblem(s, ap, ids[0]!, idx)).toBeNull();
    s = resolveAll(run(s, planActivate(s, ap, ids[0]!, idx)));
    expect(s.battlefield.some((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Samurai"))).toBe(true);
    s = priorityTo(s, ap);
    expect(abilityProblem(s, ap, ids[0]!, 0)).toMatch(/already activated/);
    // The next turn it didn't enter: sorcery speed again.
    s = priorityTo(passUntil(s, "upkeep", next(s, opp)), ap);
    expect(abilityProblem(s, ap, ids[0]!, 0)).toMatch(/sorcery/);
  });
});

const operative = card("Undercover Operative", "Creature — Shapeshifter Rogue", "{2}{U}{U}", { cmc: 4, power: "0", toughness: "0", oracleText: "You may have this creature enter as a copy of any creature on the battlefield, except it enters with a shield counter on it if you control that creature. (If it would be dealt damage or destroyed, remove a shield counter from it instead.)" });

describe("Undercover Operative", () => {
  it("is fully supported", () => supported(operative));
  const enterAs = (mine: boolean) => {
    let { s, ap, ids, opp } = setup([operative]);
    const target = putOnBattlefield(s, mine ? ap : opp, bear({ name: "Copied Bear" }));
    s = run(s, planCast(s, ap, ids[0]!));
    for (let i = 0; i < 40 && !(s.pending?.kind === "chooseOption" && pending<{ what: string }>(s).what === "copy"); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "chooseOption", player: ap, choice: target });
    return { s, id: ids[0]! };
  };
  it("a copy of your own creature enters with a shield counter", () => {
    const { s, id } = enterAs(true);
    expect(named(s, id)).toBe("Copied Bear");
    expect(s.objects[id]!.counters.shield).toBe(1);
  });
  it("a copy of an opponent's creature doesn't", () => {
    const { s, id } = enterAs(false);
    expect(named(s, id)).toBe("Copied Bear");
    expect(s.objects[id]!.counters.shield ?? 0).toBe(0);
  });
});

const sabSunen = card("Sab-Sunen, Luxa Embodied", "Legendary Creature — God", "{3}{G}{U}", { cmc: 5, power: "6", toughness: "6", keywords: ["Reach", "Trample", "Indestructible"], oracleText: "Reach, trample, indestructible\nSab-Sunen can't attack or block unless it has an even number of counters on it. (Zero is even.)\nAt the beginning of your first main phase, put a +1/+1 counter on Sab-Sunen. Then if it has an odd number of counters on it, draw two cards." });

describe("Sab-Sunen, Luxa Embodied", () => {
  it("is fully supported", () => supported(sabSunen));
  it("draws two with an odd number of counters, and can attack only with an even number", () => {
    let { s, ap, opp } = setup([]);
    const sab = putOnBattlefield(s, ap, sabSunen);
    s = passUntil(passUntil(s, "upkeep", opp), "upkeep", ap);
    const hand = s.players[ap]!.hand.length;
    s = resolveAll(passUntil(s, "main1", ap));
    // Drew for the turn, then the counter: one, odd, two more cards.
    expect(s.objects[sab]!.counters["+1/+1"]).toBe(1);
    expect(s.players[ap]!.hand.length).toBe(hand + 3);
    expect(characteristics(s, s.objects[sab]!).cantAttack).toBe(true);
    expect(characteristics(s, s.objects[sab]!).cantBlock).toBe(true);
    // A second counter: even, so it can attack and block.
    s.objects[sab]!.counters["+1/+1"] = 2;
    invalidateCharacteristics(s);
    expect(characteristics(s, s.objects[sab]!).cantAttack).toBe(false);
    expect(characteristics(s, s.objects[sab]!).cantBlock).toBe(false);
    void opp;
  });
  it("with an even number after the counter, no cards", () => {
    let { s, ap, opp } = setup([]);
    const sab = putOnBattlefield(s, ap, sabSunen);
    s.objects[sab]!.counters["+1/+1"] = 1;
    s = passUntil(passUntil(s, "upkeep", opp), "upkeep", ap);
    const hand = s.players[ap]!.hand.length;
    s = resolveAll(passUntil(s, "main1", ap));
    expect(s.objects[sab]!.counters["+1/+1"]).toBe(2);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });
});

const zoyowa = card("Zoyowa's Justice", "Instant", "{1}{R}", { cmc: 2, oracleText: "The owner of target artifact or creature with mana value 1 or greater shuffles it into their library. Then that player discovers X, where X is its mana value. (They exile cards from the top of their library until they exile a nonland card with that mana value or less. They cast it without paying its mana cost or put it into their hand. They put the rest on the bottom in a random order.)" });

describe("Zoyowa's Justice", () => {
  it("is fully supported", () => supported(zoyowa));
  it("the owner shuffles it in, then discovers its mana value", () => {
    let { s, ap, ids, opp } = setup([zoyowa]);
    const big = putOnBattlefield(s, opp, card("Big Thing", "Creature — Beast", "{5}{G}", { cmc: 6, power: "6", toughness: "6" }));
    // Their library: a land, then a 7-drop, then a 3-mana sorcery on top of the rest.
    const sorcery = into(s, opp, card("Their Draw Spell", "Sorcery", "{2}{U}", { cmc: 3, oracleText: "Draw a card." }), "library");
    into(s, opp, card("Huge", "Creature — Giant", "{7}", { cmc: 7, power: "7", toughness: "7" }), "library");
    s.players[opp]!.library.unshift(s.players[opp]!.library.find((id) => named(s, id) === "Forest")!);
    s.players[opp]!.library = [...new Set(s.players[opp]!.library)];
    s = run(s, planCast(s, ap, ids[0]!, [tgt(big)]));
    s = resolveAll(s);
    // Shuffled in first, so the library order is random: whatever they find, it's theirs and mana value 6 or less.
    if (s.pending) {
      expect(pending(s)).toMatchObject({ kind: "castFree", player: opp });
      s = settle(s, ap);
    }
    expect(zone(s, big)).not.toBe("battlefield");
    expect(s.log.some((l) => /discovers 6/.test(typeof l === "string" ? l : JSON.stringify(l)))).toBe(true);
    void sorcery;
  });
});

const donAndres = card("Don Andres, the Renegade", "Legendary Creature — Vampire Pirate", "{1}{U}{B}{R}", { cmc: 4, power: "4", toughness: "3", oracleText: "Each creature you control but don't own gets +2/+2, has menace and deathtouch, and is a Pirate in addition to its other types.\nWhenever you cast a noncreature spell you don't own, create two tapped Treasure tokens." });

describe("Don Andres, the Renegade", () => {
  it("is fully supported", () => supported(donAndres));
  it("creatures you control but don't own get +2/+2, menace, deathtouch and are Pirates; yours don't", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, donAndres);
    const mine = putOnBattlefield(s, ap, bear({ name: "My Bear" }));
    const stolen = putOnBattlefield(s, opp, bear({ name: "Stolen Bear" }));
    s.objects[stolen]!.controller = ap;
    invalidateCharacteristics(s);
    expect(pt(s, stolen)).toBe("4/4");
    expect(kw(s, stolen, "Menace") && kw(s, stolen, "Deathtouch")).toBe(true);
    expect(characteristics(s, s.objects[stolen]!).subtypes).toContain("Pirate");
    expect(pt(s, mine)).toBe("2/2");
    expect(kw(s, mine, "Menace")).toBe(false);
    expect(characteristics(s, s.objects[mine]!).subtypes).not.toContain("Pirate");
  });
});

const lens = card("Glimmer Lens", "Artifact — Equipment", "{1}{W}", { cmc: 2, oracleText: "For Mirrodin! (When this Equipment enters, create a 2/2 red Rebel creature token, then attach this to it.)\nWhenever equipped creature and at least one other creature attack, draw a card.\nEquip {1}{W}", keywords: ["For Mirrodin!", "Equip"] });

describe("Glimmer Lens", () => {
  it("is fully supported", () => supported(lens));
  const attackWith = (n: number) => {
    let { s, ap, opp } = setup([]);
    const host = putOnBattlefield(s, ap, bear({ name: "Host" }));
    const others = Array.from({ length: n }, (_, i) => putOnBattlefield(s, ap, bear({ name: `Other ${i}` })));
    const l = putOnBattlefield(s, ap, lens);
    s.objects[l]!.attachedTo = host;
    invalidateCharacteristics(s);
    const hand = s.players[ap]!.hand.length;
    s = resolveAll(attack(s, ap, [host, ...others].map((attacker) => ({ attacker, defender: opp }))));
    return s.players[ap]!.hand.length - hand;
  };
  it("draws when the equipped creature attacks with another", () => expect(attackWith(1)).toBe(1));
  it("doesn't when it attacks alone", () => expect(attackWith(0)).toBe(0));
});

const shriekwood = card("Shriekwood Devourer", "Creature — Treefolk", "{5}{G}{G}", { cmc: 7, power: "7", toughness: "5", keywords: ["Trample"], oracleText: "Trample\nWhenever you attack with one or more creatures, untap up to X lands, where X is the greatest power among those creatures." });

describe("Shriekwood Devourer", () => {
  it("is fully supported", () => supported(shriekwood));
  it("untaps up to X lands, X the greatest power among the attackers", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, shriekwood);
    const a = putOnBattlefield(s, ap, card("Three Power", "Creature — Beast", "{2}", { power: "3", toughness: "3" }));
    const lands = s.battlefield.filter((id) => s.objects[id]!.controller === ap && characteristics(s, s.objects[id]!).types.includes("Land"));
    for (const id of lands) s.objects[id]!.tapped = true;
    s = attack(s, ap, [{ attacker: a, defender: opp }]);
    s = resolveAll(s);
    expect(pending(s)).toMatchObject({ kind: "pickPermanents", player: ap, action: "untap", count: 3 });
    s = resolveAll(act(s, { type: "pickPermanents", player: ap, ids: lands.slice(0, 3) }));
    expect(lands.filter((id) => !s.objects[id]!.tapped)).toHaveLength(3);
  });
});

const marshstalker = card("Persistent Marshstalker", "Creature — Rat Berserker", "{1}{B}", { cmc: 2, power: "3", toughness: "1", oracleText: "This creature gets +1/+0 for each other Rat you control.\nThreshold — Whenever you attack with one or more Rats, if there are seven or more cards in your graveyard, you may pay {2}{B}. If you do, return this card from your graveyard to the battlefield tapped and attacking." });
const alesha = card("Alesha, Who Smiles at Death", "Legendary Creature — Human Warrior", "{2}{R}", { cmc: 3, power: "3", toughness: "2", keywords: ["First strike"], oracleText: "First strike\nWhenever Alesha attacks, you may pay {W/B}{W/B}. If you do, return target creature card with power 2 or less from your graveyard to the battlefield tapped and attacking." });

describe("Persistent Marshstalker and Alesha", () => {
  it("are fully supported", () => supported(marshstalker, alesha));
  it("Marshstalker returns from the graveyard tapped and attacking with threshold, attacking whom its controller chooses", () => {
    let { s, ap, opp } = setup([]);
    const rat = putOnBattlefield(s, ap, card("Plain Rat", "Creature — Rat", "{B}", { power: "1", toughness: "1" }));
    const ms = into(s, ap, marshstalker, "graveyard");
    for (let i = 0; i < 6; i++) into(s, ap, bear({ name: `Dead ${i}` }), "graveyard");
    s = attack(s, ap, [{ attacker: rat, defender: opp }]);
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseOption" && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      if (s.pending?.kind === "chooseMay") s = may(s, true);
      else if (s.pending) break;
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(pending(s)).toMatchObject({ kind: "chooseOption", what: "attackWhom", player: ap });
    const other = pending<{ options: string[] }>(s).options.find((o) => o !== String(opp))!;
    s = resolveAll(act(s, { type: "chooseOption", player: ap, choice: other }));
    expect(zone(s, ms)).toBe("battlefield");
    expect(s.objects[ms]!.tapped).toBe(true);
    expect(String(s.objects[ms]!.attacking)).toBe(other);
  });
  it("Marshstalker stays without threshold", () => {
    let { s, ap, opp } = setup([]);
    const rat = putOnBattlefield(s, ap, card("Plain Rat", "Creature — Rat", "{B}", { power: "1", toughness: "1" }));
    const ms = into(s, ap, marshstalker, "graveyard");
    s = resolveAll(attack(s, ap, [{ attacker: rat, defender: opp }]));
    expect(zone(s, ms)).toBe("graveyard");
  });
  it("Alesha returns a small creature card tapped and attacking", () => {
    let { s, ap, opp } = setup([]);
    const a = putOnBattlefield(s, ap, alesha);
    const small = into(s, ap, bear({ name: "Small One" }), "graveyard");
    s = attack(s, ap, [{ attacker: a, defender: opp }]);
    for (let i = 0; i < 20 && !s.stack.length && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(small)] } as unknown as Action);
    for (let i = 0; i < 30 && (s.stack.length || s.pending); i++) {
      if (s.pending?.kind === "chooseMay") s = may(s, true);
      else if (s.pending?.kind === "chooseOption" && pending<{ what: string }>(s).what === "attackWhom") s = act(s, { type: "chooseOption", player: ap, choice: pending<{ options: string[] }>(s).options[0]! });
      else if (s.pending) break;
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(zone(s, small)).toBe("battlefield");
    expect(s.objects[small]!.tapped).toBe(true);
    expect(s.objects[small]!.attacking).toBeDefined();
  });
});

const tombTyrant = card("Tomb Tyrant", "Creature — Zombie Noble", "{3}{B}", { cmc: 4, power: "3", toughness: "3", oracleText: "Other Zombies you control get +1/+1.\n{2}{B}, {T}, Sacrifice a creature: Return a Zombie creature card at random from your graveyard to the battlefield. Activate only during your turn and only if there are at least three Zombie creature cards in your graveyard." });
const zombie = (name: string) => card(name, "Creature — Zombie", "{1}{B}", { power: "2", toughness: "2" });

describe("Tomb Tyrant", () => {
  it("is fully supported", () => supported(tombTyrant));
  it("needs three Zombie creature cards in the graveyard, then returns one at random", () => {
    let { s, ap } = setup([]);
    const tt = putOnBattlefield(s, ap, tombTyrant);
    const fodder = putOnBattlefield(s, ap, bear({ name: "Fodder" }));
    const z = [into(s, ap, zombie("Z1"), "graveyard"), into(s, ap, zombie("Z2"), "graveyard")];
    into(s, ap, bear({ name: "Dead Bear" }), "graveyard");
    expect(planActivate(s, ap, tt, 0, undefined, undefined, undefined, undefined, { sacrifice: [fodder] })).toBeNull();
    z.push(into(s, ap, zombie("Z3"), "graveyard"));
    s = resolveAll(run(s, planActivate(s, ap, tt, 0, undefined, undefined, undefined, undefined, { sacrifice: [fodder] })));
    expect(z.filter((id) => zone(s, id) === "battlefield")).toHaveLength(1);
    expect(zone(s, fodder)).toBe("graveyard");
  });
});

const chainer = card("Chainer, Dementia Master", "Legendary Creature — Human Minion", "{3}{B}{B}", { cmc: 5, power: "3", toughness: "3", oracleText: "All Nightmares get +1/+1.\n{B}{B}{B}, Pay 3 life: Put target creature card from a graveyard onto the battlefield under your control. That creature is black and is a Nightmare in addition to its other creature types.\nWhen Chainer leaves the battlefield, exile all Nightmares." });

describe("Chainer, Dementia Master", () => {
  it("is fully supported", () => supported(chainer));
  it("reanimates from any graveyard as a black Nightmare only", () => {
    let { s, ap, opp } = setup([]);
    const ch = putOnBattlefield(s, ap, chainer);
    putOnBattlefield(s, ap, swamp);
    const theirs = into(s, opp, card("Their Elf", "Creature — Elf", "{G}", { power: "1", toughness: "1" }), "graveyard");
    s = resolveAll(run(s, planActivate(s, ap, ch, 0, [tgt(theirs)])));
    expect(zone(s, theirs)).toBe("battlefield");
    expect(s.objects[theirs]!.controller).toBe(ap);
    const ch2 = characteristics(s, s.objects[theirs]!);
    expect(ch2.colors).toEqual(["B"]);
    expect(ch2.subtypes).toEqual(expect.arrayContaining(["Elf", "Nightmare"]));
    expect(pt(s, theirs)).toBe("2/2");
  });
});

const grimoire = card("Grimoire of the Dead", "Legendary Artifact — Book", "{4}", { cmc: 4, oracleText: "{1}, {T}, Discard a card: Put a study counter on Grimoire of the Dead.\n{T}, Remove three study counters from Grimoire of the Dead and sacrifice it: Put all creature cards from all graveyards onto the battlefield under your control. They're black Zombies in addition to their other colors and types." });

describe("Grimoire of the Dead", () => {
  it("is fully supported", () => supported(grimoire));
  it("puts every creature card from every graveyard onto the battlefield as black Zombies", () => {
    let { s, ap, opp } = setup([]);
    const g = putOnBattlefield(s, ap, grimoire);
    s.objects[g]!.counters.study = 3;
    const a = into(s, opp, card("Their Elf", "Creature — Elf", "{G}", { power: "1", toughness: "1" }), "graveyard");
    const b = into(s, ap, bear({ name: "My Bear" }), "graveyard");
    const spell = into(s, ap, card("Some Spell", "Sorcery", "{R}"), "graveyard");
    s = resolveAll(run(s, planActivate(s, ap, g, 1)));
    for (const id of [a, b]) {
      expect(zone(s, id)).toBe("battlefield");
      expect(s.objects[id]!.controller).toBe(ap);
      const c = characteristics(s, s.objects[id]!);
      expect(c.colors).toContain("B");
      expect(c.colors).toContain("G");
      expect(c.subtypes).toContain("Zombie");
    }
    expect(zone(s, spell)).toBe("graveyard");
    expect(zone(s, g)).toBe("graveyard");
  });
});

const karn = card("Karn, Scion of Urza", "Legendary Planeswalker — Karn", "{4}", { cmc: 4, loyalty: "5", oracleText: "+1: Reveal the top two cards of your library. An opponent chooses one of them. Put that card into your hand and exile the other with a silver counter on it.\n−1: Put a card you own with a silver counter on it from exile into your hand.\n−2: Create a 0/0 colorless Construct artifact creature token with \"This token gets +1/+1 for each artifact you control.\"" });

describe("Karn, Scion of Urza", () => {
  it("is fully supported", () => supported(karn));
  it("+1: an opponent picks one for your hand, the other is exiled with a silver counter; −1 gets it back", () => {
    let { s, ap } = setup([]);
    const k = putOnBattlefield(s, ap, karn);
    s.objects[k]!.counters.loyalty = 5;
    const top = [into(s, ap, card("Card B", "Sorcery", "{1}"), "library"), into(s, ap, card("Card A", "Sorcery", "{1}"), "library")].reverse();
    s = run(s, planActivate(s, ap, k, 0));
    s = resolveAll(s);
    expect(pending(s)).toMatchObject({ kind: "chooseOption", what: "opponent", player: ap });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: pending<{ options: string[] }>(s).options[0]! }), ap);
    const inHand = top.filter((id) => zone(s, id) === "hand");
    const exiled = top.filter((id) => zone(s, id) === "exile");
    expect(inHand).toHaveLength(1);
    expect(exiled).toHaveLength(1);
    expect(s.objects[exiled[0]!]!.counters.silver).toBe(1);
    // Next turn, −1: that card back.
    s = passUntil(passUntil(s, "upkeep", next(s, ap)), "main1", ap);
    s = resolveAll(run(s, planActivate(s, ap, k, 1)));
    expect(pending(s)).toMatchObject({ kind: "searchLibrary", player: ap, cards: exiled });
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: exiled }));
    expect(zone(s, exiled[0]!)).toBe("hand");
  });
});

const emperorOfBones = card("Emperor of Bones", "Creature — Skeleton Noble", "{1}{B}", { cmc: 2, power: "2", toughness: "2", oracleText: "At the beginning of combat on your turn, exile up to one target card from a graveyard.\n{1}{B}: Adapt 2. (If this creature has no +1/+1 counters on it, put two +1/+1 counters on it.)\nWhenever one or more +1/+1 counters are put on this creature, put a creature card exiled with this creature onto the battlefield under your control with a finality counter on it. It gains haste. Sacrifice it at the beginning of the next end step." });

describe("Emperor of Bones", () => {
  it("is fully supported", () => supported(emperorOfBones));
  it("exiles a creature card, then brings it back with haste and a finality counter when it adapts; sacrificed at the end step", () => {
    let { s, ap, opp } = setup([]);
    const e = putOnBattlefield(s, ap, emperorOfBones);
    const dead = into(s, opp, card("Their Giant", "Creature — Giant", "{4}{R}", { power: "5", toughness: "5" }), "graveyard");
    s = passUntil(s, "beginCombat", ap);
    for (let i = 0; i < 20 && !s.stack.length && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(dead)] } as unknown as Action);
    s = resolveAll(s);
    expect(zone(s, dead)).toBe("exile");
    s = priorityTo(s, ap);
    s = run(s, planActivate(s, ap, e, 0));
    s = resolveAll(s);
    if (s.pending?.kind === "searchLibrary") s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [dead] }));
    expect(zone(s, dead)).toBe("battlefield");
    expect(s.objects[dead]!.controller).toBe(ap);
    expect(s.objects[dead]!.counters.finality).toBe(1);
    expect(kw(s, dead, "Haste")).toBe(true);
    s = resolveAll(passUntil(s, "end", ap));
    // Sacrificed; with its finality counter it goes to exile instead of the graveyard.
    expect(zone(s, dead)).toBe("exile");
  });
});

const narset = card("Narset, Enlightened Exile", "Legendary Creature — Human Monk", "{1}{U}{R}{W}", { cmc: 4, power: "3", toughness: "4", oracleText: "Creatures you control have prowess.\nWhenever Narset attacks, exile target noncreature, nonland card with mana value less than Narset's power from a graveyard and copy it. You may cast the copy without paying its mana cost." });
const lifeSpell = (name: string, cost: string, cmc: number) => card(name, "Sorcery", cost, { cmc, oracleText: "You gain 3 life." });

describe("Narset, Enlightened Exile", () => {
  it("is fully supported", () => supported(narset));
  /** Narset attacks, targeting `target` (if it can); every copy offered is cast. */
  const narsetAttacks = (target: (s: GameState, ap: PlayerId, opp: PlayerId) => string) => {
    let { s, ap, opp } = setup([]);
    const n = putOnBattlefield(s, ap, narset);
    const t = target(s, ap, opp);
    const life = s.players[ap]!.life;
    s = attack(s, ap, [{ attacker: n, defender: opp }]);
    let targeted = false;
    for (let i = 0; i < 60 && (s.stack.length || s.pending || i < 4); i++) {
      const p = s.pending;
      if (p?.kind === "chooseTargets") {
        targeted = true;
        s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(t)] } as unknown as Action);
      } else if (p?.kind === "chooseOption" && p.what === "castFromAmong") s = act(s, { type: "chooseOption", player: ap, choice: p.options.find((o) => o !== "none")! });
      else if (p?.kind === "castFree") s = run(s, planCast(s, ap, p.objectId));
      else if (p) s = run(s, botActions(s, p.player));
      else if (s.stack.length || s.triggerQueue.length) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      else break;
    }
    return { s, t, gained: s.players[ap]!.life - life, targeted };
  };
  it("exiles a cheap noncreature card from an opponent's graveyard and casts a copy for free", () => {
    const { s, t, gained, targeted } = narsetAttacks((s, _ap, opp) => into(s, opp, lifeSpell("Cheap Gift", "{1}{W}", 2), "graveyard"));
    expect(targeted).toBe(true);
    expect(zone(s, t)).toBe("exile");
    expect(gained).toBe(3);
  });
  it("can't take a card with mana value equal to her power", () => {
    const { s, t, gained } = narsetAttacks((s, _ap, opp) => into(s, opp, lifeSpell("Dear Gift", "{2}{W}", 3), "graveyard"));
    expect(zone(s, t)).toBe("graveyard");
    expect(gained).toBe(0);
  });
});

/**
 * `ap` attacks with `attackers` (each at `opp`); every target question gets `target`, every "you may" is yes (paying
 * its mana), what a returned creature attacks is the first offered, every free cast is made. Stops when the stack is
 * empty after the triggers.
 */
const attackAndAnswer = (s: GameState, ap: PlayerId, opp: PlayerId, attackers: string[], target?: string) => {
  s = attack(s, ap, attackers.map((attacker) => ({ attacker, defender: opp })));
  let asked = 0;
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending || i < 4); i++) {
    const p = s.pending;
    if (p?.kind === "chooseTargets" && target) s = act(s, { type: "chooseTargets", player: p.player, targets: [tgt(target)] } as unknown as Action);
    else if (p?.kind === "chooseMay" && p.player === ap) (s = may(s, true)), asked++;
    else if (p?.kind === "chooseOption" && p.player === ap && (p.what === "attackWhom" || p.what === "castFromAmong")) s = act(s, { type: "chooseOption", player: ap, choice: p.options.find((o) => o !== "none")! });
    else if (p?.kind === "castFree" && p.player === ap) s = run(s, planCast(s, ap, p.objectId));
    else if (p) s = run(s, botActions(s, p.player));
    else if (s.stack.length || s.triggerQueue.length || waitingOn(s) && s.step === "declareAttackers" && i < 4) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    else break;
  }
  return { s, asked };
};

const phoenixChick = card("Phoenix Chick", "Creature — Phoenix", "{R}", { cmc: 1, power: "1", toughness: "1", keywords: ["Flying", "Haste"], oracleText: "Flying, haste\nThis creature can't block.\nWhenever you attack with three or more creatures, you may pay {R}{R}. If you do, return this card from your graveyard to the battlefield tapped and attacking with a +1/+1 counter on it." });

describe("Phoenix Chick", () => {
  it("is fully supported", () => supported(phoenixChick));
  const chickWith = (n: number) => {
    let { s, ap, opp } = setup([]);
    const chick = into(s, ap, phoenixChick, "graveyard");
    const bears = Array.from({ length: n }, (_, i) => putOnBattlefield(s, ap, bear({ name: `Bear ${i}` })));
    const r = attackAndAnswer(s, ap, opp, bears);
    return { s: r.s, chick };
  };
  it("returns from the graveyard tapped and attacking with a +1/+1 counter when you attack with three", () => {
    const { s, chick } = chickWith(3);
    expect(zone(s, chick)).toBe("battlefield");
    expect(s.objects[chick]!.tapped).toBe(true);
    expect(s.objects[chick]!.attacking).toBeDefined();
    expect(s.objects[chick]!.counters["+1/+1"]).toBe(1);
  });
  it("stays with only two attackers", () => {
    const { s, chick } = chickWith(2);
    expect(zone(s, chick)).toBe("graveyard");
  });
});

const yoreTiller = card("Yore-Tiller Nephilim", "Creature — Nephilim", "{W}{U}{B}{R}", { cmc: 4, power: "2", toughness: "2", oracleText: "Whenever this creature attacks, return target creature card from your graveyard to the battlefield tapped and attacking." });
const grimReaper = card("Grim Reaper, Lethal Legionnaire", "Legendary Creature — Human Villain", "{3}{B}", { cmc: 4, power: "3", toughness: "4", oracleText: "Whenever Grim Reaper attacks, you may pay {3}{B}. When you do, return target creature card from your graveyard to the battlefield tapped and attacking with a finality counter on it. (If a creature with a finality counter on it would die, exile it instead.)" });

describe("Yore-Tiller Nephilim and Grim Reaper", () => {
  it("are fully supported", () => supported(yoreTiller, grimReaper));
  it("Yore-Tiller returns a creature card tapped and attacking", () => {
    let { s, ap, opp } = setup([]);
    const y = putOnBattlefield(s, ap, yoreTiller);
    const big = into(s, ap, bear({ name: "Big One", power: "6", toughness: "6" }), "graveyard");
    s = attackAndAnswer(s, ap, opp, [y], big).s;
    expect(zone(s, big)).toBe("battlefield");
    expect(s.objects[big]!.tapped).toBe(true);
    expect(s.objects[big]!.attacking).toBeDefined();
  });
  it("Grim Reaper: after paying {3}{B}, it returns tapped and attacking with a finality counter", () => {
    let { s, ap, opp } = setup([]);
    const g = putOnBattlefield(s, ap, grimReaper);
    const big = into(s, ap, bear({ name: "Big One", power: "6", toughness: "6" }), "graveyard");
    const r = attackAndAnswer(s, ap, opp, [g], big);
    s = r.s;
    expect(r.asked).toBe(1);
    expect(zone(s, big)).toBe("battlefield");
    expect(s.objects[big]!.attacking).toBeDefined();
    expect(s.objects[big]!.counters.finality).toBe(1);
  });
});

const najeela = card("Najeela, the Blade-Blossom", "Legendary Creature — Human Warrior", "{2}{R}", { cmc: 3, power: "3", toughness: "2", oracleText: "Whenever a Warrior attacks, you may have its controller create a 1/1 white Warrior creature token that's tapped and attacking.\n{W}{U}{B}{R}{G}: Untap all attacking creatures. They gain trample, lifelink, and haste until end of turn. After this phase, there is an additional combat phase. Activate only during combat." });

describe("Najeela, the Blade-Blossom", () => {
  it("is fully supported", () => supported(najeela));
  it("each attacking Warrior makes an attacking 1/1 Warrior token for its controller; the tokens don't trigger it", () => {
    let { s, ap, opp } = setup([]);
    const n = putOnBattlefield(s, ap, najeela);
    const w = putOnBattlefield(s, ap, card("Test Warrior", "Creature — Human Warrior", "{1}{R}", { power: "2", toughness: "2" }));
    const r = attackAndAnswer(s, ap, opp, [n, w]);
    s = r.s;
    expect(r.asked).toBe(2);
    const tokens = s.battlefield.filter((id) => s.objects[id]!.isToken);
    expect(tokens).toHaveLength(2);
    for (const t of tokens) {
      expect(s.objects[t]!.controller).toBe(ap);
      expect(s.objects[t]!.tapped).toBe(true);
      expect(s.objects[t]!.attacking).toBeDefined();
      expect(characteristics(s, s.objects[t]!).subtypes).toContain("Warrior");
    }
  });
  it("an opponent's attacking Warrior makes the token for that opponent", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, najeela);
    const w = putOnBattlefield(s, opp, card("Test Warrior", "Creature — Human Warrior", "{1}{R}", { power: "2", toughness: "2" }));
    s.objects[w]!.enteredTurn = -1;
    s = passUntil(s, "declareAttackers", opp);
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: w, defender: ap }] });
    s = settle(s, ap);
    const tokens = s.battlefield.filter((id) => s.objects[id]!.isToken);
    expect(tokens).toHaveLength(1);
    expect(s.objects[tokens[0]!]!.controller).toBe(opp);
    expect(s.objects[tokens[0]!]!.attacking).toBeDefined();
  });
});

const ramirez = card("Ramirez DePietro, Pillager", "Legendary Creature — Human Pirate", "{2}{U}{B}", { cmc: 4, power: "4", toughness: "3", oracleText: "When Ramirez DePietro enters, you lose 2 life and create two Treasure tokens.\nWhenever one or more Pirates you control deal combat damage to a player, exile the top card of that player's library. You may cast that card for as long as it remains exiled." });

describe("Ramirez DePietro, Pillager", () => {
  it("is fully supported", () => supported(ramirez));
  it("exiles the top card of the damaged player's library; you may cast it while it stays exiled", () => {
    let { s, ap, opp } = setup([]);
    const r = putOnBattlefield(s, ap, ramirez);
    const top = into(s, opp, lifeSpell("Their Gift", "{1}{W}", 2), "library");
    s = attack(s, ap, [{ attacker: r, defender: opp }]);
    s = passUntil(s, "main2", ap);
    s = resolveAll(s);
    expect(zone(s, top)).toBe("exile");
    const life = s.players[ap]!.life;
    s = run(s, planCast(s, ap, top));
    s = resolveAll(s);
    expect(s.players[ap]!.life).toBe(life + 3);
  });
});

const cosmicCube = card("Cosmic Cube", "Artifact", "{5}", { cmc: 5, keywords: ["Ward"], oracleText: "Ward {2}\nWhenever you attack, look at the top six cards of your library. You may cast a spell from among them with mana value less than or equal to the greatest power among attacking creatures you control without paying its mana cost. Put the rest on the bottom of your library in a random order." });

describe("Cosmic Cube", () => {
  it("is fully supported", () => supported(cosmicCube));
  it("casts a spell from the top six with mana value up to the greatest attacking power, for free", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, cosmicCube);
    const b = putOnBattlefield(s, ap, bear({ name: "Strong Bear", power: "3", toughness: "3" }));
    const dear = into(s, ap, lifeSpell("Dear Gift", "{3}{W}", 4), "library");
    const cheap = into(s, ap, lifeSpell("Cheap Gift", "{2}{W}", 3), "library");
    const life = s.players[ap]!.life;
    s = attackAndAnswer(s, ap, opp, [b]).s;
    expect(s.players[ap]!.life).toBe(life + 3);
    expect(zone(s, cheap)).toBe("graveyard");
    expect(zone(s, dear)).toBe("library");
    expect(s.players[ap]!.library.slice(-5)).toContain(dear);
  });
});

const interceptor = card("Interceptor Mechan", "Artifact Creature — Robot", "{2}{B}{R}", { cmc: 4, power: "2", toughness: "2", keywords: ["Flying", "Void"], oracleText: "Flying\nWhen this creature enters, return target artifact or creature card from your graveyard to your hand.\nVoid — At the beginning of your end step, if a nonland permanent left the battlefield this turn or a spell was warped this turn, put a +1/+1 counter on this creature." });

describe("Interceptor Mechan", () => {
  it("is fully supported", () => supported(interceptor));
});

const viewpoint = card("Viewpoint Synchronization", "Sorcery", "{4}{G}", { cmc: 5, keywords: ["Freerunning"], oracleText: "Freerunning {2}{G} (You may cast this spell for its freerunning cost if you dealt combat damage to a player this turn with an Assassin or commander.)\nSearch your library for up to three basic land cards and reveal them. Put two of them onto the battlefield tapped and the other into your hand, then shuffle." });
const jarad = card("Jarad's Orders", "Sorcery", "{2}{B}{G}", { cmc: 4, oracleText: "Search your library for up to two creature cards and reveal them. Put one into your hand and the other into your graveyard. Then shuffle." });

describe("Searching for several cards, split: Viewpoint Synchronization, Jarad's Orders", () => {
  it("are fully supported", () => supported(viewpoint, jarad));
  /** Casts `def` and finds `pick(library)` when asked; returns where they went. */
  const castAndFind = (def: CardDef, pick: (s: GameState, ap: PlayerId) => string[]) => {
    let { s, ap, ids } = setup([def]);
    s = run(s, planCast(s, ap, ids[0]!));
    for (let i = 0; i < 20 && s.pending?.kind !== "searchLibrary"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const p = pending<{ firstN?: number; firstTo?: string; othersTo?: string }>(s);
    const found = pick(s, ap);
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found }));
    return { s, found, p };
  };
  const forests = (s: GameState, ap: PlayerId, n: number) => s.players[ap]!.library.filter((id) => named(s, id) === "Forest").slice(0, n);
  it("Viewpoint Synchronization: the first two found onto the battlefield tapped, the third into your hand", () => {
    const { s, found, p } = castAndFind(viewpoint, (s, ap) => forests(s, ap, 3));
    expect(p.firstN).toBe(2);
    expect(found.slice(0, 2).map((id) => [zone(s, id), s.objects[id]!.tapped])).toEqual([["battlefield", true], ["battlefield", true]]);
    expect(zone(s, found[2]!)).toBe("hand");
  });
  it("Viewpoint Synchronization: with two found, both go onto the battlefield", () => {
    const { s, found } = castAndFind(viewpoint, (s, ap) => forests(s, ap, 2));
    expect(found.map((id) => zone(s, id))).toEqual(["battlefield", "battlefield"]);
  });
  it("Jarad's Orders: one into your hand, the other into your graveyard; one alone goes to your hand", () => {
    const bears = (s: GameState, ap: PlayerId, n: number) => s.players[ap]!.library.filter((id) => named(s, id) === "Grizzly Bears").slice(0, n);
    const two = castAndFind(jarad, (s, ap) => bears(s, ap, 2));
    expect(two.found.map((id) => zone(two.s, id))).toEqual(["hand", "graveyard"]);
    const one = castAndFind(jarad, (s, ap) => bears(s, ap, 1));
    expect(zone(one.s, one.found[0]!)).toBe("hand");
  });
});

const continueCard = card("Continue?", "Instant", "{1}{W}", { cmc: 2, oracleText: "Choose up to four target creature cards in your graveyard that were put there from the battlefield this turn. Return them to the battlefield." });

describe("Continue?", () => {
  it("is fully supported", () => supported(continueCard));
  it("returns creature cards that died this turn, not ones already in the graveyard", () => {
    let { s, ap, ids } = setup([continueCard]);
    const old = into(s, ap, bear({ name: "Old Bear" }), "graveyard");
    const dead = [putOnBattlefield(s, ap, bear({ name: "Dead Bear 1" })), putOnBattlefield(s, ap, bear({ name: "Dead Bear 2" }))];
    for (const id of dead) {
      s.objects[id]!.damage = 5;
    }
    invalidateCharacteristics(s);
    s = act(s, { type: "passPriority", player: ap });
    s = priorityTo(s, ap);
    expect(dead.map((id) => zone(s, id))).toEqual(["graveyard", "graveyard"]);
    expect(planCast(s, ap, ids[0]!, [tgt(old), { kind: "none" }, { kind: "none" }, { kind: "none" }])).toBeNull();
    s = run(s, planCast(s, ap, ids[0]!, [...dead.map(tgt), { kind: "none" }, { kind: "none" }]));
    s = resolveAll(s);
    expect(dead.map((id) => zone(s, id))).toEqual(["battlefield", "battlefield"]);
    expect(zone(s, old)).toBe("graveyard");
  });
});

const changeOfFortune = card("Change of Fortune", "Sorcery", "{3}{R}", { cmc: 4, oracleText: "Discard your hand, then draw a card for each card you've discarded this turn." });

describe("Change of Fortune", () => {
  it("is fully supported", () => supported(changeOfFortune));
  it("draws for this discard and the ones earlier this turn", () => {
    let { s, ap, ids } = setup([changeOfFortune, bear({ name: "A" }), bear({ name: "B" }), bear({ name: "C" })]);
    s.turnLog = { ...s.turnLog, discards: [{ player: ap, cards: ["x"] }, { player: next(s, ap), cards: ["y", "z"] }] };
    // The opening hand and the three cards: all but Change of Fortune are discarded, plus the one earlier.
    const discarding = s.players[ap]!.hand.length - 1;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(ids.slice(1).map((id) => zone(s, id))).toEqual(["graveyard", "graveyard", "graveyard"]);
    expect(s.players[ap]!.hand).toHaveLength(discarding + 1);
  });
});

const glenElendra = card("Glen Elendra Guardian", "Creature — Faerie Wizard", "{2}{U}", { cmc: 3, power: "3", toughness: "4", keywords: ["Flying", "Flash"], oracleText: "Flash\nFlying\nThis creature enters with a -1/-1 counter on it.\n{1}{U}, Remove a counter from this creature: Counter target noncreature spell. Its controller draws a card." });

describe("Glen Elendra Guardian", () => {
  it("is fully supported", () => supported(glenElendra));
  it("removes a counter from itself to counter a noncreature spell; its controller draws; then it can't again", () => {
    let { s, ap, opp } = setup([]);
    const g = putOnBattlefield(s, ap, glenElendra);
    s.objects[g]!.counters["-1/-1"] = 1;
    invalidateCharacteristics(s);
    s = passUntil(s, "main1", opp);
    for (const l of [card("Plains", "Basic Land — Plains"), card("Plains", "Basic Land — Plains")]) putOnBattlefield(s, opp, l);
    const gift = into(s, opp, lifeSpell("Their Gift", "{1}{W}", 2), "hand");
    s = run(s, planCast(s, opp, gift));
    s = priorityTo(s, ap);
    const hand = s.players[opp]!.hand.length;
    const idx = 0;
    const target: TargetChoice[] = [{ kind: "stack", id: s.stack.at(-1)!.id }];
    s = run(s, planActivate(s, ap, g, idx, target, undefined, undefined, undefined, { counters: [{ id: g, kind: "-1/-1" }] }));
    expect(s.objects[g]!.counters["-1/-1"] ?? 0).toBe(0);
    s = resolveAll(s);
    expect(zone(s, gift)).toBe("graveyard");
    expect(s.players[opp]!.hand.length).toBe(hand + 1);
    expect(planActivate(s, ap, g, idx)).toBeNull();
  });
});

const avatarOfWoe = card("Avatar of Woe", "Creature — Avatar", "{6}{B}{B}", { cmc: 8, power: "6", toughness: "5", keywords: ["Fear"], oracleText: "If there are ten or more creature cards total in all graveyards, this spell costs {6} less to cast.\nFear (This creature can't be blocked except by artifact creatures and/or black creatures.)\n{T}: Destroy target creature. It can't be regenerated." });

describe("Avatar of Woe", () => {
  it("is fully supported", () => supported(avatarOfWoe));
  it("costs {6} less with ten creature cards among all graveyards", () => {
    const tryCast = (n: number) => {
      const { s, ap, ids, opp } = setup([avatarOfWoe]);
      // Only two Swamps: {B}{B} and no more.
      s.battlefield.filter((id) => s.objects[id]!.controller === ap && named(s, id) !== "Swamp").forEach((id) => (s.objects[id]!.tapped = true));
      for (let i = 0; i < n; i++) into(s, i % 2 ? ap : opp, bear({ name: `Dead ${i}` }), "graveyard");
      return planCast(s, ap, ids[0]!);
    };
    expect(tryCast(9)).toBeNull();
    expect(tryCast(10)).not.toBeNull();
  });
});

const mindGrind = card("Mind Grind", "Sorcery", "{X}{U}{B}", { cmc: 2, oracleText: "Each opponent reveals cards from the top of their library until they reveal X land cards, then puts all cards revealed this way into their graveyard. X can't be 0." });

describe("Mind Grind", () => {
  it("is fully supported", () => supported(mindGrind));
  it("each opponent reveals until X land cards and puts them all into their graveyard; X can't be 0", () => {
    let { s, ap, ids, opp } = setup([mindGrind]);
    expect(planCast(s, ap, ids[0]!, undefined, undefined, "auto", 0)).toBeNull();
    // Top of the opponent's library: bear, Forest, bear, bear, Forest, ...
    const order = [bear({ name: "T1" }), card("Forest", "Basic Land — Forest"), bear({ name: "T2" }), bear({ name: "T3" }), card("Forest", "Basic Land — Forest")];
    const top = [...order].reverse().map((d) => into(s, opp, d, "library")).reverse();
    const before = s.players[opp]!.library.length;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto", 2)));
    expect(top.map((id) => zone(s, id))).toEqual(["graveyard", "graveyard", "graveyard", "graveyard", "graveyard"]);
    expect(s.players[opp]!.library.length).toBe(before - 5);
    expect(s.players[ap]!.graveyard.filter((id) => named(s, id) !== "Mind Grind")).toHaveLength(0);
  });
});

const lifeDeath = card("Life // Death", "Sorcery // Sorcery", "{G} // {1}{B}", {
  cmc: 3,
  layout: "split",
  oracleText: "All lands you control become 1/1 creatures until end of turn. They're still lands.",
  faces: [
    { name: "Life", manaCost: "{G}", typeLine: "Sorcery", supertypes: [], types: ["Sorcery"], subtypes: [], oracleText: "All lands you control become 1/1 creatures until end of turn. They're still lands.", colors: ["G"] },
    { name: "Death", manaCost: "{1}{B}", typeLine: "Sorcery", supertypes: [], types: ["Sorcery"], subtypes: [], oracleText: "Return target creature card from your graveyard to the battlefield. You lose life equal to its mana value.", colors: ["B"] },
  ],
});

describe("Life // Death", () => {
  it("is fully supported", () => supported(lifeDeath));
  it("Death returns a creature card and you lose life equal to its mana value", () => {
    let { s, ap, ids } = setup([lifeDeath]);
    const big = into(s, ap, card("Big Thing", "Creature — Beast", "{4}{G}{G}", { cmc: 6, power: "6", toughness: "6" }), "graveyard");
    const life = s.players[ap]!.life;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(big)], undefined, "auto", undefined, { face: 1 })));
    expect(zone(s, big)).toBe("battlefield");
    expect(s.players[ap]!.life).toBe(life - 6);
  });
});

const watcher = card("The Watcher in the Water", "Legendary Creature — Kraken", "{3}{U}{U}", { cmc: 5, power: "9", toughness: "9", oracleText: "The Watcher in the Water enters tapped with nine stun counters on it. (If a permanent with a stun counter would become untapped, remove one from it instead.)\nWhenever you draw a card during an opponent's turn, create a 1/1 blue Tentacle creature token.\nWhenever a Tentacle you control dies, untap up to one target Kraken and put a stun counter on up to one target nonland permanent." });
const quickDraw = card("Quick Draw", "Instant", "{U}", { cmc: 1, oracleText: "Draw a card." });

describe("The Watcher in the Water", () => {
  it("is fully supported", () => supported(watcher));
  const tentacles = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid && characteristics(s, s.objects[id]!).subtypes.includes("Tentacle"));
  it("makes a Tentacle when you draw during an opponent's turn, not during yours", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, watcher);
    const mine = into(s, ap, quickDraw, "hand");
    s = resolveAll(run(s, planCast(s, ap, mine)));
    expect(tentacles(s, ap)).toHaveLength(0);
    s = priorityTo(passUntil(s, "upkeep", opp), ap);
    const theirs = into(s, ap, quickDraw, "hand");
    s = resolveAll(run(s, planCast(s, ap, theirs)));
    expect(tentacles(s, ap)).toHaveLength(1);
  });
});

const shusher = card("Vexing Shusher", "Creature — Goblin Shaman", "{R/G}{R/G}", { cmc: 2, power: "2", toughness: "2", oracleText: "This spell can't be countered.\n{R/G}: Target spell can't be countered." });
const counterspell = card("Counterspell", "Instant", "{U}{U}", { cmc: 2, oracleText: "Counter target spell." });

describe("Vexing Shusher", () => {
  it("is fully supported", () => supported(shusher));
  it("makes a spell on the stack uncounterable", () => {
    let { s, ap } = setup([]);
    const v = putOnBattlefield(s, ap, shusher);
    const gift = into(s, ap, lifeSpell("My Gift", "{1}{W}", 2), "hand");
    const cs = into(s, ap, counterspell, "hand");
    const life = s.players[ap]!.life;
    s = run(s, planCast(s, ap, gift));
    const spell = s.stack.at(-1)!.id;
    s = run(s, planActivate(s, ap, v, 0, [{ kind: "stack", id: spell }]));
    s = act(s, { type: "passPriority", player: ap });
    s = priorityTo(s, ap);
    expect(s.stack.at(-1)!.uncounterable).toBe(true);
    // Countering it does nothing to it.
    s = resolveAll(run(s, planCast(s, ap, cs, [{ kind: "stack", id: spell }])));
    expect(zone(s, gift)).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(life + 3);
  });
});

const fevered = card("Fevered Suspicion", "Sorcery", "{6}{B}{R}", { cmc: 8, keywords: ["Rebound"], oracleText: "Each opponent exiles cards from the top of their library until they exile a nonland card. You may cast any number of spells from among those nonland cards without paying their mana costs.\nRebound (If you cast this spell from your hand, exile it as it resolves. At the beginning of your next upkeep, you may cast this card from exile without paying its mana cost.)" });

describe("Fevered Suspicion", () => {
  it("is fully supported", () => supported(fevered));
  it("each opponent exiles down to a nonland card; you cast the ones you want for free, the rest stay exiled", () => {
    let { s, ap, ids, opp } = setup([fevered]);
    for (const l of [swamp, swamp, swamp, swamp]) putOnBattlefield(s, ap, l);
    const land = into(s, opp, card("Forest", "Basic Land — Forest"), "library");
    const gift = into(s, opp, lifeSpell("Their Gift", "{1}{W}", 2), "library");
    s.players[opp]!.library = [land, gift, ...s.players[opp]!.library.filter((id) => id !== land && id !== gift)];
    const life = s.players[ap]!.life;
    s = run(s, planCast(s, ap, ids[0]!));
    let offered: string[] = [];
    for (let i = 0; i < 80 && (s.pending || s.stack.length); i++) {
      const p = s.pending;
      if (p?.kind === "chooseOption" && p.what === "castFromAmong") {
        offered = [...offered, ...p.options];
        s = act(s, { type: "chooseOption", player: ap, choice: p.options.includes(gift) ? gift : "none" });
      } else if (p?.kind === "castFree") s = run(s, planCast(s, ap, p.objectId));
      else if (p) s = run(s, botActions(s, p.player));
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(offered).toContain(gift);
    expect(offered).not.toContain(land);
    expect(s.players[ap]!.life).toBe(life + 3);
    expect(zone(s, land)).toBe("exile");
    expect(zone(s, ids[0]!)).toBe("exile");
    // Nothing from your own library.
    expect(s.log.some((l) => /exiled from the top of each opponent's library/.test(l.text))).toBe(true);
  });
});
