// Round 169: the most played cards, in popularity order, after round 168 (from Obsessive Pursuit, rank 5,745, on).

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, passUntil, pt, putOnBattlefield, setup, swamp } from "./helpers";
import { abilityProblem, blockProblem, botActions, controllerOf, parseManaCost, planMana, characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

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
const yours = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && named(s, id) === name);
const clues = (s: GameState, pid: PlayerId) => yours(s, pid, "Clue Token").length;
const handOf = (s: GameState, pid: PlayerId) => s.players[pid]!.hand;
/** Empties a player's hand into their library's bottom (so "who can't discard" is testable). */
const emptyHand = (s: GameState, pid: PlayerId) => {
  for (const id of [...handOf(s, pid)]) {
    s.players[pid]!.hand.splice(s.players[pid]!.hand.indexOf(id), 1);
    s.objects[id]!.zone = "library";
    s.players[pid]!.library.push(id);
  }
};

const absence = card("Fateful Absence", "Instant", "{1}{W}", { cmc: 2, oracleText: "Destroy target creature or planeswalker. Its controller investigates. (They create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")", keywords: ["Investigate"] });

describe("Fateful Absence", () => {
  it("is fully supported", () => supported(absence));
  it("destroys the creature and its controller investigates", () => {
    let { s, ap, ids, opp } = setup([absence]);
    const b = putOnBattlefield(s, opp, bear());
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(b)])));
    expect(zone(s, b)).toBe("graveyard");
    expect(clues(s, opp)).toBe(1);
    expect(clues(s, ap)).toBe(0);
  });
});

const liliana = card("Liliana, Waker of the Dead", "Legendary Planeswalker — Liliana", "{2}{B}{B}", { cmc: 4, loyalty: "4", oracleText: "+1: Each player discards a card. Each opponent who can't loses 3 life.\n−3: Target creature gets -X/-X until end of turn, where X is the number of cards in your graveyard.\n−7: You get an emblem with \"At the beginning of combat on your turn, put target creature card from a graveyard onto the battlefield under your control. It gains haste.\"" });
const battlecruiser = card("Entropic Battlecruiser", "Artifact — Spacecraft", "{3}{B}", { cmc: 4, power: "3", toughness: "10", oracleText: "Station (Tap another creature you control: Put charge counters equal to its power on this Spacecraft. Station only as a sorcery. It's an artifact creature at 8+.)\n1+ | Whenever an opponent discards a card, they lose 3 life.\n8+ | Flying, deathtouch\nWhenever this Spacecraft attacks, each opponent discards a card. Each opponent who can't loses 3 life.", keywords: ["Station"] });

describe("Liliana, Waker of the Dead and Entropic Battlecruiser", () => {
  it("are fully supported", () => supported(liliana, battlecruiser));
  it("+1: each player discards a card; each opponent who can't loses 3 life", () => {
    let { s, ap, opp } = setup([]);
    const lili = putOnBattlefield(s, ap, liliana);
    s.objects[lili]!.counters.loyalty = 4;
    emptyHand(s, opp);
    const others = s.turnOrder.filter((p) => p !== ap && p !== opp);
    const hands = Object.fromEntries(s.turnOrder.map((p) => [p, handOf(s, p).length]));
    const life = Object.fromEntries(s.turnOrder.map((p) => [p, s.players[p]!.life]));
    s = settle(run(s, planActivate(s, ap, lili, 0)), ap);
    if (s.pending?.kind === "discard") s = act(s, { type: "discard", player: ap, objectIds: handOf(s, ap).slice(0, 1) });
    s = settle(s, ap);
    expect(s.players[opp]!.life).toBe(life[opp]! - 3);
    for (const p of others) {
      expect(handOf(s, p).length).toBe(hands[p]! - 1);
      expect(s.players[p]!.life).toBe(life[p]);
    }
    expect(s.players[ap]!.life).toBe(life[ap]);
  });
});

const windgrace = card("Lord Windgrace", "Legendary Planeswalker — Windgrace", "{2}{B}{R}{G}", { cmc: 5, loyalty: "5", oracleText: "+2: Discard a card, then draw a card. If a land card is discarded this way, draw an additional card.\n−3: Return up to two target land cards from your graveyard to the battlefield.\n−11: Destroy up to six target nonland permanents, then create six 2/2 green Cat Warrior creature tokens with forestwalk.\nLord Windgrace can be your commander." });

describe("Lord Windgrace", () => {
  it("is fully supported", () => supported(windgrace));
  const plus2 = (discard: CardDef) => {
    let { s, ap } = setup([discard]);
    const wg = putOnBattlefield(s, ap, windgrace);
    s.objects[wg]!.counters.loyalty = 5;
    const card0 = handOf(s, ap)[handOf(s, ap).length - 1]!;
    const before = handOf(s, ap).length;
    s = run(s, planActivate(s, ap, wg, 0));
    s = resolveAll(s);
    expect(s.pending?.kind).toBe("discard");
    s = resolveAll(act(s, { type: "discard", player: ap, objectIds: [card0] }));
    return handOf(s, ap).length - (before - 1);
  };
  it("+2: discarding a land draws two cards", () => expect(plus2(swamp)).toBe(2));
  it("+2: discarding a nonland card draws one", () => expect(plus2(bear())).toBe(1));
});

const miasma = card("Psychic Miasma", "Sorcery", "{1}{B}", { cmc: 2, oracleText: "Target player discards a card. If a land card is discarded this way, return Psychic Miasma to its owner's hand." });

describe("Psychic Miasma", () => {
  it("is fully supported", () => supported(miasma));
  it("returns to its owner's hand when a land card is discarded", () => {
    let { s, ap, ids, opp } = setup([miasma]);
    emptyHand(s, opp);
    const land = into(s, opp, swamp, "hand");
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }])), ap);
    expect(zone(s, land)).toBe("graveyard");
    expect(zone(s, ids[0]!)).toBe("hand");
  });
  it("goes to the graveyard when a nonland card is discarded", () => {
    let { s, ap, ids, opp } = setup([miasma]);
    emptyHand(s, opp);
    const b = into(s, opp, bear(), "hand");
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }])), ap);
    expect(zone(s, b)).toBe("graveyard");
    expect(zone(s, ids[0]!)).toBe("graveyard");
  });
});

const tellingTime = card("Telling Time", "Instant", "{1}{U}", { cmc: 2, oracleText: "Look at the top three cards of your library. Put one of those cards into your hand, one on top of your library, and one on the bottom of your library." });

describe("Telling Time", () => {
  it("is fully supported", () => supported(tellingTime));
  it("puts one of the top three into your hand, one on top and one on the bottom", () => {
    let { s, ap, ids } = setup([tellingTime]);
    const top = [bear({ name: "T1" }), bear({ name: "T2" }), bear({ name: "T3" })].reverse().map((c) => into(s, ap, c, "library")).reverse();
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.pending?.kind).toBe("searchLibrary");
    s = act(s, { type: "searchLibrary", player: ap, found: [top[1]!] });
    expect(s.pending?.kind).toBe("searchLibrary");
    expect(pending<{ cards: string[] }>(s).cards.sort()).toEqual([top[0]!, top[2]!].sort());
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [top[2]!] }));
    expect(zone(s, top[1]!)).toBe("hand");
    const lib = s.players[ap]!.library;
    expect(lib[0]).toBe(top[2]);
    expect(lib[lib.length - 1]).toBe(top[0]);
  });
});

const farsight = card("Elven Farsight", "Sorcery", "{G}", { cmc: 1, oracleText: "Scry 3, then you may reveal the top card of your library. If a creature card is revealed this way, draw a card.", keywords: ["Scry"] });

describe("Elven Farsight", () => {
  it("is fully supported", () => supported(farsight));
  it("scries 3, then draws a card if you reveal a creature card on top", () => {
    let { s, ap, ids } = setup([farsight]);
    const top = [bear({ name: "T1" }), swamp, swamp].reverse().map((c) => into(s, ap, c, "library")).reverse();
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.pending?.kind).toBe("arrangeTop");
    s = act(s, { type: "arrangeTop", player: ap, top: [top[0]!, top[1]!, top[2]!], away: [] });
    const hand = handOf(s, ap).length;
    s = resolveAll(s, true);
    expect(handOf(s, ap)).toContain(top[0]);
    expect(handOf(s, ap).length).toBe(hand + 1);
  });
  it("with a land on top, no card", () => {
    let { s, ap, ids } = setup([farsight]);
    const top = [swamp, swamp, swamp].map((c) => into(s, ap, c, "library"));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    s = act(s, { type: "arrangeTop", player: ap, top: [...top].reverse(), away: [] });
    const hand = handOf(s, ap).length;
    s = resolveAll(s, true);
    expect(handOf(s, ap).length).toBe(hand);
  });
});

const grimgrin = card("Grimgrin, Corpse-Born", "Legendary Creature — Zombie Warrior", "{3}{U}{B}", { cmc: 5, power: "5", toughness: "5", oracleText: "Grimgrin enters tapped and doesn't untap during your untap step.\nSacrifice another creature: Untap Grimgrin and put a +1/+1 counter on it.\nWhenever Grimgrin attacks, destroy target creature defending player controls, then put a +1/+1 counter on Grimgrin." });

describe("Grimgrin, Corpse-Born", () => {
  it("is fully supported", () => supported(grimgrin));
  it("sacrificing another creature untaps it and puts a +1/+1 counter on it", () => {
    let { s, ap } = setup([]);
    const g = putOnBattlefield(s, ap, grimgrin);
    s.objects[g]!.tapped = true;
    const fodder = putOnBattlefield(s, ap, bear());
    s = resolveAll(run(s, planActivate(s, ap, g, 0, undefined, undefined, undefined, undefined, { sacrifice: [fodder] })));
    expect(zone(s, fodder)).toBe("graveyard");
    expect(s.objects[g]!.tapped).toBe(false);
    expect(s.objects[g]!.counters["+1/+1"]).toBe(1);
  });
});

const tenza = card("Tenza, Godo's Maul", "Legendary Artifact — Equipment", "{3}", { cmc: 3, oracleText: "Equipped creature gets +1/+1. As long as it's legendary, it gets an additional +2/+2. As long as it's red, it has trample.\nEquip {1} ({1}: Attach to target creature you control. Equip only as a sorcery.)", keywords: ["Equip"] });

describe("Tenza, Godo's Maul", () => {
  it("is fully supported", () => supported(tenza));
  const equipped = (host: CardDef) => {
    const { s, ap } = setup([]);
    const t = putOnBattlefield(s, ap, tenza);
    const h = putOnBattlefield(s, ap, host);
    s.objects[t]!.attachedTo = h;
    invalidateCharacteristics(s);
    return { s, h };
  };
  it("a legendary red creature gets +3/+3 in all and trample", () => {
    const { s, h } = equipped(card("Red Legend", "Legendary Creature — Human", "{R}", { power: "2", toughness: "2" }));
    expect(pt(s, h)).toBe("5/5");
    expect(kw(s, h, "Trample")).toBe(true);
  });
  it("a nonlegendary green creature only +1/+1", () => {
    const { s, h } = equipped(bear());
    expect(pt(s, h)).toBe("3/3");
    expect(kw(s, h, "Trample")).toBe(false);
  });
});

const oranRief = card("Oran-Rief Hydra", "Creature — Hydra", "{4}{G}{G}", { cmc: 6, power: "5", toughness: "5", oracleText: "Trample\nLandfall — Whenever a land you control enters, put a +1/+1 counter on this creature. If that land is a Forest, put two +1/+1 counters on this creature instead.", keywords: ["Trample","Landfall"] });
const akoum = card("Akoum Hellkite", "Creature — Dragon", "{4}{R}{R}", { cmc: 6, power: "4", toughness: "4", oracleText: "Flying\nLandfall — Whenever a land you control enters, this creature deals 1 damage to any target. If that land is a Mountain, this creature deals 2 damage instead.", keywords: ["Landfall","Flying"] });

describe("Oran-Rief Hydra and Akoum Hellkite", () => {
  it("are fully supported", () => supported(oranRief, akoum));
  const landfall = (land: CardDef) => {
    let { s, ap, ids } = setup([land]);
    const h = putOnBattlefield(s, ap, oranRief);
    s = resolveAll(act(s, { type: "playLand", player: ap, objectId: ids[0]! }));
    return s.objects[h]!.counters["+1/+1"];
  };
  it("a Forest puts two +1/+1 counters on the Hydra", () => expect(landfall(card("Forest", "Basic Land — Forest"))).toBe(2));
  it("another land one", () => expect(landfall(swamp)).toBe(1));
  it("the Hellkite deals 2 damage for a Mountain, 1 for another land", () => {
    for (const [land, dmg] of [[card("Mountain", "Basic Land — Mountain"), 2], [swamp, 1]] as const) {
      let { s, ap, ids, opp } = setup([land]);
      putOnBattlefield(s, ap, akoum);
      const life = s.players[opp]!.life;
      s = act(s, { type: "playLand", player: ap, objectId: ids[0]! });
      for (let i = 0; i < 5 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      expect(s.pending?.kind).toBe("chooseTargets");
      s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
      expect(s.players[opp]!.life).toBe(life - dmg);
    }
  });
});

const kaheera = card("Kaheera, the Orphanguard", "Legendary Creature — Cat Beast", "{1}{G/W}{G/W}", { cmc: 3, power: "3", toughness: "2", oracleText: "Companion — Each creature card in your starting deck is a Cat, Elemental, Nightmare, Dinosaur, or Beast card. (If this card is your chosen companion, you may put it into your hand from outside the game for {3} as a sorcery.)\nVigilance\nEach other creature you control that's a Cat, Elemental, Nightmare, Dinosaur, or Beast gets +1/+1 and has vigilance.", keywords: ["Vigilance","Companion"] });

describe("Kaheera, the Orphanguard", () => {
  it("is fully supported", () => supported(kaheera));
  it("gives each other Cat, Elemental, Nightmare, Dinosaur or Beast you control +1/+1 and vigilance", () => {
    const { s, ap, opp } = setup([]);
    const k = putOnBattlefield(s, ap, kaheera);
    const cat = putOnBattlefield(s, ap, bear({ name: "Cat", typeLine: "Creature — Cat", subtypes: ["Cat"] }));
    const beast = putOnBattlefield(s, ap, bear({ name: "Beast", typeLine: "Creature — Beast", subtypes: ["Beast"] }));
    const b = putOnBattlefield(s, ap, bear());
    const theirs = putOnBattlefield(s, opp, bear({ name: "Their Cat", typeLine: "Creature — Cat", subtypes: ["Cat"] }));
    expect([pt(s, cat), pt(s, beast), pt(s, b), pt(s, theirs), pt(s, k)]).toEqual(["3/3", "3/3", "2/2", "2/2", "3/2"]);
    expect(kw(s, cat, "Vigilance")).toBe(true);
    expect(kw(s, b, "Vigilance")).toBe(false);
  });
});

const ivora = card("Ivora, Insatiable Heir", "Legendary Creature — Vampire Warrior", "{1}{R}", { cmc: 2, power: "1", toughness: "1", oracleText: "Trample\nWhen Ivora enters and whenever it deals combat damage to a player, create a Blood token. (It's an artifact with \"{1}, {T}, Discard a card, Sacrifice this token: Draw a card.\")\nWhenever you discard a card, put a +1/+1 counter on Ivora.", keywords: ["Trample"] });

describe("Ivora, Insatiable Heir", () => {
  it("is fully supported", () => supported(ivora));
  it("creates a Blood token as it enters and when it deals combat damage to a player", () => {
    let { s, ap, ids, opp } = setup([ivora]);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(yours(s, ap, "Blood Token")).toHaveLength(1);
    s.objects[ids[0]!]!.controlledSinceTurn = -1;
    s = attack(s, ap, [{ attacker: ids[0]!, defender: opp }]);
    s = settle(s, ap);
    s = resolveAll(passUntil(s, "main2", ap));
    expect(yours(s, ap, "Blood Token")).toHaveLength(2);
  });
});

const kariZev = card("Kari Zev, Skyship Raider", "Legendary Creature — Human Pirate", "{1}{R}", { cmc: 2, power: "1", toughness: "3", oracleText: "First strike, menace\nWhenever Kari Zev attacks, create Ragavan, a legendary 2/1 red Monkey creature token. Ragavan enters tapped and attacking. Exile that token at end of combat.", keywords: ["First strike","Menace"] });

describe("Kari Zev, Skyship Raider", () => {
  it("is fully supported", () => supported(kariZev));
  it("creates Ragavan tapped and attacking, exiled at end of combat", () => {
    let { s, ap, opp } = setup([]);
    const k = putOnBattlefield(s, ap, kariZev);
    s = attack(s, ap, [{ attacker: k, defender: opp }]);
    s = settle(s, ap);
    if (s.pending?.kind === "chooseOption") s = act(s, { type: "chooseOption", player: ap, choice: String(opp) });
    s = settle(s, ap);
    const rag = yours(s, ap, "Ragavan");
    expect(rag).toHaveLength(1);
    expect(s.objects[rag[0]!]!.tapped).toBe(true);
    expect(s.objects[rag[0]!]!.attacking).toBeDefined();
    expect(characteristics(s, s.objects[rag[0]!]!).supertypes).toContain("Legendary");
    s = resolveAll(passUntil(s, "main2", ap));
    expect(yours(s, ap, "Ragavan")).toHaveLength(0);
  });
});

const wallOfJunk = card("Wall of Junk", "Artifact Creature — Wall", "{2}", { cmc: 2, power: "0", toughness: "7", oracleText: "Defender (This creature can't attack.)\nWhen this creature blocks, return it to its owner's hand at end of combat. (Return it only if it's on the battlefield.)", keywords: ["Defender"] });

describe("Wall of Junk", () => {
  it("is fully supported", () => supported(wallOfJunk));
  it("returns to its owner's hand at end of combat after it blocks", () => {
    let { s, ap, opp } = setup([]);
    const w = putOnBattlefield(s, opp, wallOfJunk);
    const a = putOnBattlefield(s, ap, bear());
    s = attack(s, ap, [{ attacker: a, defender: opp }]);
    s = passUntil(s, "declareBlockers", ap);
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: w, attacker: a }] });
    s = resolveAll(passUntil(s, "main2", ap));
    expect(zone(s, w)).toBe("hand");
    expect(s.players[opp]!.hand).toContain(w);
  });
});

const expansion = card("Expansion Algorithm", "Sorcery", "{X}{U}{U}", { cmc: 2, oracleText: "Proliferate X times. (To proliferate, choose any number of permanents and/or players, then give each another counter of each kind already there.)", keywords: ["Proliferate"] });

describe("Expansion Algorithm", () => {
  it("is fully supported", () => supported(expansion));
  it("proliferates X times", () => {
    let { s, ap, ids } = setup([expansion]);
    const b = putOnBattlefield(s, ap, bear());
    s.objects[b]!.counters["+1/+1"] = 1;
    s = run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto", 3));
    for (let i = 0; i < 20 && (s.stack.length || s.pending); i++) {
      if (s.pending?.kind === "pickPermanents") s = act(s, { type: "pickPermanents", player: ap, ids: [b] });
      else if (s.pending) s = run(s, botActions(s, s.pending.player));
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.objects[b]!.counters["+1/+1"]).toBe(4);
  });
});

const sleep = card("Sleep", "Sorcery", "{2}{U}{U}", { cmc: 4, oracleText: "Tap all creatures target player controls. Those creatures don't untap during that player's next untap step." });

describe("Sleep", () => {
  it("is fully supported", () => supported(sleep));
  it("taps all creatures target player controls; they don't untap during that player's next untap step", () => {
    let { s, ap, ids, opp } = setup([sleep]);
    const a = putOnBattlefield(s, opp, bear());
    const b = putOnBattlefield(s, opp, bear());
    const mine = putOnBattlefield(s, ap, bear());
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect([a, b, mine].map((id) => s.objects[id]!.tapped)).toEqual([true, true, false]);
    s = passUntil(s, "upkeep", opp);
    expect([a, b].map((id) => s.objects[id]!.tapped)).toEqual([true, true]);
    s = passUntil(passUntil(s, "upkeep", next(s, opp)), "upkeep", opp);
    expect([a, b].map((id) => s.objects[id]!.tapped)).toEqual([false, false]);
  });
});

const tangle = card("Tangle", "Instant", "{1}{G}", { cmc: 2, oracleText: "Prevent all combat damage that would be dealt this turn.\nEach attacking creature doesn't untap during its controller's next untap step." });

describe("Tangle", () => {
  it("is fully supported", () => supported(tangle));
  it("prevents all combat damage this turn, and each attacking creature doesn't untap next time", () => {
    let { s, ap, opp } = setup([]);
    const a = putOnBattlefield(s, opp, bear());
    const t = into(s, ap, tangle, "hand");
    for (const l of [card("Forest", "Basic Land — Forest"), card("Forest", "Basic Land — Forest")]) putOnBattlefield(s, ap, l);
    s = passUntil(s, "main1", opp);
    s = attack(s, opp, [{ attacker: a, defender: ap }]);
    s = priorityTo(s, ap);
    const life = s.players[ap]!.life;
    s = resolveAll(run(s, planCast(s, ap, t)));
    s = resolveAll(passUntil(s, "main2", opp));
    expect(s.players[ap]!.life).toBe(life);
    s = passUntil(passUntil(s, "upkeep", next(s, opp)), "upkeep", opp);
    expect(s.objects[a]!.tapped).toBe(true);
  });
});

const direTactics = card("Dire Tactics", "Instant", "{W}{B}", { cmc: 2, oracleText: "Exile target creature. If you don't control a Human, you lose life equal to that creature's toughness." });
const perimeterCaptain = card("Perimeter Captain", "Creature — Human Soldier", "{W}", { cmc: 1, power: "0", toughness: "4", oracleText: "Defender\nWhenever a creature you control with defender blocks, you may gain 2 life.", keywords: ["Defender"] });
const waveKnight = card("Vodalian Wave-Knight", "Creature — Merfolk Knight", "{2}{W}{U}", { cmc: 4, power: "3", toughness: "3", oracleText: "Whenever you draw a card, put a +1/+1 counter on each other Merfolk and/or Knight you control." });
const sarkhan = card("Sarkhan's Unsealing", "Enchantment", "{3}{R}", { cmc: 4, oracleText: "Whenever you cast a creature spell with power 4, 5, or 6, this enchantment deals 4 damage to any target.\nWhenever you cast a creature spell with power 7 or greater, this enchantment deals 4 damage to each opponent and each creature and planeswalker they control." });
const pestRescuer = card("Pest Rescuer", "Creature — Dryad Druid", "{2}{G}", { cmc: 3, power: "2", toughness: "2", oracleText: "At the beginning of each upkeep, if you don't control a Pest creature token, create a 1/1 black and green Pest creature token with \"When this token dies, you gain 1 life.\"\nIf you would gain life, you gain that much life plus 1 instead." });
const lockAndLoad = card("Lock and Load", "Sorcery", "{2}{U}", { cmc: 3, oracleText: "Draw a card, then draw a card for each other instant and sorcery spell you've cast this turn.\nPlot {3}{U} (You may pay {3}{U} and exile this card from your hand. Cast it as a sorcery on a later turn without paying its mana cost. Plot only as a sorcery.)", keywords: ["Plot"] });
const dragonologist = card("Dragonologist", "Creature — Human Wizard", "{2}{U}", { cmc: 3, power: "1", toughness: "3", oracleText: "When this creature enters, look at the top six cards of your library. You may reveal an instant, sorcery, or Dragon card from among them and put it into your hand. Put the rest on the bottom of your library in a random order.\nUntapped Dragons you control have hexproof." });
const incBlight = card("Incremental Blight", "Sorcery", "{3}{B}{B}", { cmc: 5, oracleText: "Put a -1/-1 counter on target creature, two -1/-1 counters on another target creature, and three -1/-1 counters on a third target creature." });
const ironApprentice = card("Iron Apprentice", "Artifact Creature — Construct", "{1}", { cmc: 1, power: "0", toughness: "0", oracleText: "This creature enters with a +1/+1 counter on it.\nWhen this creature dies, if it had counters on it, put those counters on target creature you control." });
const sanctuary = card("Blessed Sanctuary", "Enchantment", "{3}{W}{W}", { cmc: 5, oracleText: "Prevent all noncombat damage that would be dealt to you and creatures you control.\nWhenever a nontoken creature you control enters, create a 2/2 white Unicorn creature token." });
const wheelDeal = card("Wheel and Deal", "Instant", "{3}{U}", { cmc: 4, oracleText: "Any number of target opponents each discard their hands, then draw seven cards.\nDraw a card." });
const murder = card("Murder", "Instant", "{1}{B}{B}", { cmc: 3, oracleText: "Destroy target creature." });
const shock = card("Shock", "Instant", "{R}", { cmc: 1, oracleText: "Shock deals 2 damage to any target." });
const opt = card("Opt", "Instant", "{U}", { cmc: 1, oracleText: "Draw a card." });
const human = (name = "Human") => bear({ name, typeLine: "Creature — Human", subtypes: ["Human"] });

describe("Dire Tactics", () => {
  it("is fully supported", () => supported(direTactics));
  it("exiles the creature; without a Human you lose life equal to its toughness", () => {
    for (const withHuman of [false, true]) {
      let { s, ap, ids, opp } = setup([direTactics]);
      if (withHuman) putOnBattlefield(s, ap, human());
      const b = putOnBattlefield(s, opp, bear({ toughness: "3" }));
      const life = s.players[ap]!.life;
      s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(b)])));
      expect(zone(s, b)).toBe("exile");
      expect(s.players[ap]!.life).toBe(withHuman ? life : life - 3);
    }
  });
});

describe("Perimeter Captain", () => {
  it("is fully supported", () => supported(perimeterCaptain));
  it("its controller may gain 2 life when a creature with defender they control blocks", () => {
    for (const withDefender of [true, false]) {
      let { s, ap, opp } = setup([]);
      putOnBattlefield(s, opp, perimeterCaptain);
      const blocker = putOnBattlefield(s, opp, withDefender ? card("Wall", "Creature — Wall", "{1}", { power: "0", toughness: "5", oracleText: "Defender", keywords: ["Defender"] }) : bear({ toughness: "5" }));
      const a = putOnBattlefield(s, ap, bear());
      const life = s.players[opp]!.life;
      s = attack(s, ap, [{ attacker: a, defender: opp }]);
      s = passUntil(s, "declareBlockers", ap);
      s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker, attacker: a }] });
      s = resolveAll(s, true);
      expect(s.players[opp]!.life).toBe(withDefender ? life + 2 : life);
    }
  });
});

describe("Vodalian Wave-Knight", () => {
  it("is fully supported", () => supported(waveKnight));
  it("puts a +1/+1 counter on each other Merfolk and/or Knight you control when you draw", () => {
    let { s, ap, ids } = setup([opt]);
    const wk = putOnBattlefield(s, ap, waveKnight);
    const merfolk = putOnBattlefield(s, ap, bear({ name: "Merfolk", typeLine: "Creature — Merfolk", subtypes: ["Merfolk"] }));
    const knight = putOnBattlefield(s, ap, bear({ name: "Knight", typeLine: "Creature — Human Knight", subtypes: ["Human", "Knight"] }));
    const b = putOnBattlefield(s, ap, bear());
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect([merfolk, knight, b, wk].map((id) => s.objects[id]!.counters["+1/+1"] ?? 0)).toEqual([1, 1, 0, 0]);
  });
});

describe("Sarkhan's Unsealing", () => {
  it("is fully supported", () => supported(sarkhan));
  const big = (power: string) => card(`Power ${power}`, "Creature — Giant", "{G}", { cmc: 1, power, toughness: "8" });
  it("a creature spell with power 4 through 6 deals 4 damage to any target", () => {
    let { s, ap, ids, opp } = setup([big("5")]);
    putOnBattlefield(s, ap, sarkhan);
    const life = s.players[opp]!.life;
    s = run(s, planCast(s, ap, ids[0]!));
    for (let i = 0; i < 5 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind).toBe("chooseTargets");
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(s.players[opp]!.life).toBe(life - 4);
  });
  it("power 3 does nothing; power 7 deals 4 to each opponent and their creatures", () => {
    let { s, ap, ids, opp } = setup([big("3"), big("7")]);
    putOnBattlefield(s, ap, sarkhan);
    const theirs = putOnBattlefield(s, opp, bear({ toughness: "4" }));
    const mine = putOnBattlefield(s, ap, bear({ toughness: "4" }));
    const life = s.players[opp]!.life;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.players[opp]!.life).toBe(life);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(s.players[opp]!.life).toBe(life - 4);
    expect(zone(s, theirs)).toBe("graveyard");
    expect(zone(s, mine)).toBe("battlefield");
  });
});

describe("Pest Rescuer", () => {
  it("is fully supported", () => supported(pestRescuer));
  it("creates a Pest each upkeep only if you control none, and life gain gets +1", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, pestRescuer);
    const nx = next(s, ap);
    s = resolveAll(passUntil(s, "draw", nx));
    expect(yours(s, ap, "Pest Token")).toHaveLength(1);
    s = resolveAll(passUntil(s, "draw", next(s, nx)));
    expect(yours(s, ap, "Pest Token")).toHaveLength(1);
    const life = s.players[ap]!.life;
    const pest = yours(s, ap, "Pest Token")[0]!;
    s.objects[pest]!.damage = 1;
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }), ap);
    expect(zone(s, pest)).toBeUndefined();
    expect(s.players[ap]!.life).toBe(life + 2);
  });
});

describe("Lock and Load", () => {
  it("is fully supported", () => supported(lockAndLoad));
  it("draws one card plus one for each other instant and sorcery cast this turn", () => {
    let { s, ap, ids } = setup([opt, lockAndLoad]);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    const hand = handOf(s, ap).length;
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(handOf(s, ap).length).toBe(hand - 1 + 2);
  });
});

describe("Dragonologist", () => {
  it("is fully supported", () => supported(dragonologist));
  it("puts an instant, sorcery or Dragon card from the top six into your hand", () => {
    let { s, ap, ids } = setup([dragonologist]);
    const dragon = into(s, ap, bear({ name: "Dragon", typeLine: "Creature — Dragon", subtypes: ["Dragon"] }), "library");
    const inst = into(s, ap, opt, "library");
    const b = into(s, ap, bear({ name: "Plain Bear" }), "library");
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.pending?.kind).toBe("searchLibrary");
    const p = pending<{ cards: string[]; filter?: unknown }>(s);
    expect(p.cards.sort()).toEqual([dragon, inst].sort());
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [dragon] }));
    expect(zone(s, dragon)).toBe("hand");
    const lib = s.players[ap]!.library;
    expect(lib.slice(-5)).toContain(inst);
    expect(lib.slice(-5)).toContain(b);
  });
  it("can't take a plain creature card", () => {
    let { s, ap, ids } = setup([dragonologist]);
    const b = into(s, ap, bear({ name: "Plain Bear" }), "library");
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [b] })).toThrow();
  });
});

describe("Incremental Blight", () => {
  it("is fully supported", () => supported(incBlight));
  it("puts one, two and three -1/-1 counters on three different creatures", () => {
    let { s, ap, ids, opp } = setup([incBlight]);
    const t = [1, 2, 3].map((i) => putOnBattlefield(s, opp, bear({ name: `B${i}`, power: "4", toughness: "4" })));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, t.map(tgt))));
    expect(t.map((id) => s.objects[id]!.counters["-1/-1"])).toEqual([1, 2, 3]);
  });
});

describe("Iron Apprentice", () => {
  it("is fully supported", () => supported(ironApprentice));
  it("moves its counters to target creature you control when it dies", () => {
    let { s, ap, ids } = setup([ironApprentice, murder]);
    const b = putOnBattlefield(s, ap, bear());
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(1);
    s = run(s, planCast(s, ap, ids[1]!, [tgt(ids[0]!)]));
    for (let i = 0; i < 8 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind).toBe("chooseTargets");
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [tgt(b)] }));
    expect(s.objects[b]!.counters["+1/+1"]).toBe(1);
  });
  it("without counters, nothing triggers", () => {
    let { s, ap } = setup([]);
    const ia = putOnBattlefield(s, ap, ironApprentice);
    delete s.objects[ia]!.counters["+1/+1"];
    putOnBattlefield(s, ap, bear());
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(zone(s, ia)).toBe("graveyard");
    expect(s.triggerQueue.length + s.stack.length).toBe(0);
    expect(s.pending?.kind).not.toBe("chooseTargets");
  });
});

describe("Blessed Sanctuary", () => {
  it("is fully supported", () => supported(sanctuary));
  it("prevents noncombat damage to you and your creatures, not to others", () => {
    let { s, ap, ids, opp } = setup([shock, shock, shock]);
    putOnBattlefield(s, ap, sanctuary);
    const mine = putOnBattlefield(s, ap, bear());
    const theirs = putOnBattlefield(s, opp, bear());
    const life = s.players[ap]!.life;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: ap }])));
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(mine)])));
    s = resolveAll(run(s, planCast(s, ap, ids[2]!, [tgt(theirs)])));
    expect(s.players[ap]!.life).toBe(life);
    expect(zone(s, mine)).toBe("battlefield");
    expect(zone(s, theirs)).toBe("graveyard");
  });
  it("creates a Unicorn when a nontoken creature you control enters", () => {
    let { s, ap, ids } = setup([bear()]);
    putOnBattlefield(s, ap, sanctuary);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(yours(s, ap, "Unicorn Token")).toHaveLength(1);
  });
});

describe("Wheel and Deal", () => {
  it("is fully supported", () => supported(wheelDeal));
  it("target opponents discard their hands and draw seven; you draw a card", () => {
    let { s, ap, ids, opp } = setup([wheelDeal]);
    const other = s.turnOrder.find((p) => p !== ap && p !== opp)!;
    const third = s.turnOrder.find((p) => p !== ap && p !== opp && p !== other)!;
    const oldHand = [...handOf(s, opp)];
    const thirdHand = handOf(s, third).length;
    const mine = handOf(s, ap).length;
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }, { kind: "player", id: other }])), ap);
    expect(handOf(s, opp)).toHaveLength(7);
    expect(handOf(s, other)).toHaveLength(7);
    for (const id of oldHand) expect(zone(s, id)).toBe("graveyard");
    expect(handOf(s, third)).toHaveLength(thirdHand);
    expect(handOf(s, ap)).toHaveLength(mine - 1 + 1);
  });
});

const nobleStand = card("Noble Stand", "Enchantment", "{4}{W}", { cmc: 5, oracleText: "Whenever a creature you control blocks, you gain 2 life." });
const scolding = card("Scolding Administrator", "Creature — Dwarf Cleric", "{W}{B}", { cmc: 2, power: "2", toughness: "2", oracleText: "Menace (This creature can't be blocked except by two or more creatures.)\nRepartee — Whenever you cast an instant or sorcery spell that targets a creature, put a +1/+1 counter on this creature.\nWhen this creature dies, if it had counters on it, put those counters on up to one target creature.", keywords: ["Menace","Repartee"] });
const cinderWall = card("Cinder Wall", "Creature — Wall", "{R}", { cmc: 1, power: "3", toughness: "3", oracleText: "Defender\nWhen this creature blocks, destroy it at end of combat.", keywords: ["Defender"] });
const stoicEph = card("Stoic Ephemera", "Creature — Spirit", "{2}{W}", { cmc: 3, power: "5", toughness: "5", oracleText: "Defender (This creature can't attack.)\nFlying\nWhen this creature blocks, sacrifice it at end of combat.", keywords: ["Flying","Defender"] });
const zephyr = card("Zephyr Spirit", "Creature — Spirit", "{5}{U}", { cmc: 6, power: "0", toughness: "6", oracleText: "When this creature blocks, return it to its owner's hand." });
const pantherPounce = card("Panther Pounce", "Instant", "{W}", { cmc: 1, oracleText: "Target player investigates. Target creature gets +1/+0 and gains flying until end of turn. Untap it. (To investigate, create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")", keywords: ["Investigate"] });
const butterbur = card("Butterbur, Bree Innkeeper", "Legendary Creature — Human Peasant", "{2}{G}{W}", { cmc: 4, power: "3", toughness: "3", oracleText: "At the beginning of your end step, if you don't control a Food, create a Food token. (It's an artifact with \"{2}, {T}, Sacrifice this token: You gain 3 life.\")", keywords: ["Food"] });
const errandRider = card("Errand-Rider of Gondor", "Creature — Human Soldier", "{2}{W}", { cmc: 3, power: "3", toughness: "2", oracleText: "When this creature enters, draw a card. Then if you don't control a legendary creature, put a card from your hand on the bottom of your library." });
const glimmerSeeker = card("Glimmer Seeker", "Creature — Human Survivor", "{2}{W}", { cmc: 3, power: "3", toughness: "3", oracleText: "Survival — At the beginning of your second main phase, if this creature is tapped, draw a card if you control a Glimmer creature. If you don't control a Glimmer creature, create a 1/1 white Glimmer enchantment creature token.", keywords: ["Survival"] });
const diabolist = card("Maestros Diabolist", "Creature — Vampire Warrior", "{U}{B}{R}", { cmc: 3, power: "1", toughness: "4", oracleText: "Deathtouch, haste\nWhenever this creature attacks, if you don't control a Devil token, create a tapped and attacking 1/1 red Devil creature token with \"When this token dies, it deals 1 damage to any target.\"", keywords: ["Haste","Deathtouch"] });
const wick = card("Wick, the Whorled Mind", "Legendary Creature — Rat Warlock", "{3}{B}", { cmc: 4, power: "2", toughness: "4", oracleText: "Whenever Wick or another Rat you control enters, create a 1/1 black Snail creature token if you don't control a Snail. Otherwise, put a +1/+1 counter on a Snail you control.\n{U}{B}{R}, Sacrifice a Snail: Wick deals damage equal to the sacrificed creature's power to each opponent. Then draw cards equal to the sacrificed creature's power." });
const ajani = card("Ajani, Mentor of Heroes", "Legendary Planeswalker — Ajani", "{3}{G}{W}", { cmc: 5, loyalty: "4", oracleText: "+1: Distribute three +1/+1 counters among one, two, or three target creatures you control.\n+1: Look at the top four cards of your library. You may reveal an Aura, creature, or planeswalker card from among them and put it into your hand. Put the rest on the bottom of your library in any order.\n−8: You gain 100 life." });
const cowabunga = card("Cowabunga!", "Sorcery", "{G}", { cmc: 1, oracleText: "Look at the top four cards of your library. You may reveal a Mutant, Ninja, Turtle, or land card from among them and put it into your hand. Put the rest on the bottom of your library in a random order." });

const incidental = [nobleStand, scolding, cinderWall, stoicEph, zephyr, pantherPounce, butterbur, errandRider, glimmerSeeker, diabolist, wick, ajani, cowabunga];
describe("Other cards this round", () => {
  it("are fully supported", () => supported(...incidental));
});

const serraWings = card("On Serra's Wings", "Legendary Enchantment — Aura", "{3}{W}", { cmc: 4, oracleText: "Enchant creature\nEnchanted creature is legendary, gets +1/+1, and has flying, vigilance, and lifelink.", keywords: ["Enchant"] });
const cruel = card("Cruel Ultimatum", "Sorcery", "{U}{U}{B}{B}{B}{R}{R}", { cmc: 7, oracleText: "Target opponent sacrifices a creature of their choice, discards three cards, then loses 5 life. You return a creature card from your graveyard to your hand, draw three cards, then gain 5 life." });
const getOut = card("Get Out", "Instant", "{U}{U}", { cmc: 2, oracleText: "Choose one —\n• Counter target creature or enchantment spell.\n• Return one or two target creatures and/or enchantments you own to your hand." });
const aberrant = card("Aberrant Return", "Sorcery", "{4}{B}{B}", { cmc: 6, oracleText: "Put one, two, or three target creature cards from graveyards onto the battlefield under your control. Each of them enters with an additional -1/-1 counter on it." });
const kratos = card("Kratos, God of War", "Legendary Creature — God Warrior", "{R}{R}{R}", { cmc: 3, power: "2", toughness: "3", oracleText: "Double strike\nAll creatures have haste.\nAt the beginning of each player's end step, Kratos deals damage to that player equal to the number of creatures that player controls that didn't attack this turn.", keywords: ["Double strike"] });
const byrke = card("Byrke, Long Ear of the Law", "Legendary Creature — Rabbit Soldier", "{4}{G}{W}", { cmc: 6, power: "4", toughness: "4", oracleText: "Vigilance\nWhen Byrke enters, put a +1/+1 counter on each of up to two target creatures.\nWhenever a creature you control with a +1/+1 counter on it attacks, double the number of +1/+1 counters on it.", keywords: ["Vigilance","Double"] });
const venser = card("Venser, the Sojourner", "Legendary Planeswalker — Venser", "{3}{W}{U}", { cmc: 5, loyalty: "3", oracleText: "+2: Exile target permanent you own. Return it to the battlefield under your control at the beginning of the next end step.\n−1: Creatures can't be blocked this turn.\n−8: You get an emblem with \"Whenever you cast a spell, exile target permanent.\"" });
const hiddenBlade = card("Hidden Blade", "Artifact — Equipment", "{2}", { cmc: 2, oracleText: "Flash\nWhen this Equipment enters, attach it to target creature you control. If that creature is an Assassin, it gains deathtouch until end of turn.\nEquipped creature gets +1/+0 and has first strike.\nEquip {2}", keywords: ["Equip","Flash"] });
const scaleguard = card("Elite Scaleguard", "Creature — Human Soldier", "{4}{W}", { cmc: 5, power: "2", toughness: "3", oracleText: "When this creature enters, bolster 2. (Choose a creature with the least toughness among creatures you control and put two +1/+1 counters on it.)\nWhenever a creature you control with a +1/+1 counter on it attacks, tap target creature defending player controls.", keywords: ["Bolster"] });
const rageForger = card("Rage Forger", "Creature — Elemental Shaman", "{2}{R}", { cmc: 3, power: "2", toughness: "2", oracleText: "When this creature enters, put a +1/+1 counter on each other Shaman creature you control.\nWhenever a creature you control with a +1/+1 counter on it attacks, you may have that creature deal 1 damage to target player or planeswalker." });
const savingGrasp = card("Saving Grasp", "Instant", "{U}", { cmc: 1, oracleText: "Return target creature you own to your hand.\nFlashback {W} (You may cast this card from your graveyard for its flashback cost. Then exile it.)", keywords: ["Flashback"] });
const inkcaster = card("Tenured Inkcaster", "Creature — Vampire Warlock", "{4}{B}", { cmc: 5, power: "2", toughness: "2", oracleText: "When this creature enters, put a +1/+1 counter on target creature.\nWhenever a creature you control with a +1/+1 counter on it attacks, each opponent loses 1 life and you gain 1 life." });
const forsaken = card("Forsaken Wastes", "World Enchantment", "{2}{B}", { cmc: 3, oracleText: "Players can't gain life.\nAt the beginning of each player's upkeep, that player loses 1 life.\nWhenever this enchantment becomes the target of a spell, that spell's controller loses 5 life." });
const undercity = card("Undercity Plague", "Sorcery", "{4}{B}{B}", { cmc: 6, oracleText: "Target player loses 1 life, discards a card, then sacrifices a permanent of their choice.\nCipher (Then you may exile this spell card encoded on a creature you control. Whenever that creature deals combat damage to a player, its controller may cast a copy of the encoded card without paying its mana cost.)", keywords: ["Cipher"] });
const bonecrusher = card("Bonecrusher Giant", "Creature — Giant", "{2}{R}", { cmc: 3, power: "4", toughness: "3", oracleText: "Whenever this creature becomes the target of a spell, this creature deals 2 damage to that spell's controller." });
const assassin = (name = "Assassin") => bear({ name, typeLine: "Creature — Human Assassin", subtypes: ["Human", "Assassin"] });
/** Players pass until `pid`'s end step, answering the end step triggers. */
const toEnd = (s: GameState, pid: PlayerId) => settle(passUntil(s, "end", pid), pid);

describe("On Serra's Wings", () => {
  it("is fully supported", () => supported(serraWings));
  it("makes the enchanted creature legendary, +1/+1, with flying, vigilance and lifelink", () => {
    const { s, ap } = setup([]);
    const b = putOnBattlefield(s, ap, bear());
    const aura = putOnBattlefield(s, ap, serraWings);
    s.objects[aura]!.attachedTo = b;
    invalidateCharacteristics(s);
    expect(characteristics(s, s.objects[b]!).supertypes).toContain("Legendary");
    expect(pt(s, b)).toBe("3/3");
    for (const k of ["Flying", "Vigilance", "Lifelink"]) expect(kw(s, b, k)).toBe(true);
  });
});

describe("Cruel Ultimatum", () => {
  it("is fully supported", () => supported(cruel));
  it("the opponent sacrifices, discards three and loses 5; you return a creature card, draw three and gain 5", () => {
    let { s, ap, ids, opp } = setup([cruel]);
    putOnBattlefield(s, ap, swamp);
    const theirs = putOnBattlefield(s, opp, bear());
    const dead = into(s, ap, bear({ name: "Dead Bear" }), "graveyard");
    const life = [s.players[ap]!.life, s.players[opp]!.life];
    const hands = [handOf(s, ap).length, handOf(s, opp).length];
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }])), ap);
    for (let i = 0; i < 5 && s.pending; i++) s = settle(run(s, botActions(s, s.pending.player)), ap);
    expect(zone(s, theirs)).toBe("graveyard");
    expect(handOf(s, opp).length).toBe(hands[1]! - 3);
    expect(s.players[opp]!.life).toBe(life[1]! - 5);
    expect(zone(s, dead)).toBe("hand");
    expect(handOf(s, ap).length).toBe(hands[0]! - 1 + 1 + 3);
    expect(s.players[ap]!.life).toBe(life[0]! + 5);
  });
});

describe("Bonecrusher Giant", () => {
  it("is fully supported", () => supported(bonecrusher));
  it("deals 2 damage to the controller of a spell that targets it", () => {
    let { s, ap, ids } = setup([shock]);
    const g = putOnBattlefield(s, ap, bonecrusher);
    const life = s.players[ap]!.life;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(g)])));
    expect(s.players[ap]!.life).toBe(life - 2);
    expect(s.objects[g]!.damage).toBe(2);
  });
});

describe("Forsaken Wastes", () => {
  it("is fully supported", () => supported(forsaken));
  it("the controller of a spell that targets it loses 5 life", () => {
    let { s, ap, ids } = setup([card("Disenchant", "Instant", "{1}{W}", { cmc: 2, oracleText: "Destroy target artifact or enchantment." })]);
    const w = putOnBattlefield(s, ap, forsaken);
    const life = s.players[ap]!.life;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(w)])));
    expect(s.players[ap]!.life).toBe(life - 5);
    expect(zone(s, w)).toBe("graveyard");
  });
});

describe("Get Out", () => {
  it("is fully supported", () => supported(getOut));
  it("returns one or two target creatures and/or enchantments you own, even ones another player controls", () => {
    let { s, ap, ids, opp } = setup([getOut]);
    const mine = putOnBattlefield(s, ap, bear());
    const stolen = putOnBattlefield(s, ap, bear({ name: "Stolen Bear" }));
    s.objects[stolen]!.controller = opp;
    const theirs = putOnBattlefield(s, opp, bear({ name: "Their Bear" }));
    invalidateCharacteristics(s);
    expect(planCast(s, ap, ids[0]!, [tgt(theirs)], [1])).toBeNull();
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(mine), tgt(stolen)], [1])));
    expect(zone(s, mine)).toBe("hand");
    expect(zone(s, stolen)).toBe("hand");
    expect(handOf(s, ap)).toContain(stolen);
  });
});

describe("Aberrant Return", () => {
  it("is fully supported", () => supported(aberrant));
  it("puts up to three creature cards from graveyards onto the battlefield under your control, each with a -1/-1 counter", () => {
    let { s, ap, ids, opp } = setup([aberrant]);
    const a = into(s, ap, bear({ name: "A", power: "3", toughness: "3" }), "graveyard");
    const b = into(s, opp, bear({ name: "B", power: "3", toughness: "3" }), "graveyard");
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(a), tgt(b), { kind: "none" }])));
    for (const id of [a, b]) {
      expect(zone(s, id)).toBe("battlefield");
      expect(s.objects[id]!.controller).toBe(ap);
      expect(pt(s, id)).toBe("2/2");
    }
  });
});

describe("Kratos, God of War", () => {
  it("is fully supported", () => supported(kratos));
  it("deals damage to each player at their end step for each creature they control that didn't attack", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, kratos);
    const attacker = putOnBattlefield(s, ap, bear());
    putOnBattlefield(s, ap, bear({ name: "Stay Home" }));
    const life = s.players[ap]!.life;
    s = attack(s, ap, [{ attacker, defender: opp }]);
    s = toEnd(s, ap);
    // Kratos and the bear that stayed home.
    expect(s.players[ap]!.life).toBe(life - 2);
  });
});

describe("Byrke, Long Ear of the Law", () => {
  it("is fully supported", () => supported(byrke));
  it("doubles the +1/+1 counters on an attacking creature you control that has one", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, byrke);
    const a = putOnBattlefield(s, ap, bear());
    const plain = putOnBattlefield(s, ap, bear({ name: "Plain Bear" }));
    s.objects[a]!.counters["+1/+1"] = 2;
    s = settle(attack(s, ap, [{ attacker: a, defender: opp }, { attacker: plain, defender: opp }]), ap);
    expect(s.objects[a]!.counters["+1/+1"]).toBe(4);
    expect(s.objects[plain]!.counters["+1/+1"] ?? 0).toBe(0);
  });
});

describe("Tenured Inkcaster", () => {
  it("is fully supported", () => supported(inkcaster, scaleguard, rageForger));
  it("drains each opponent for 1 when a creature you control with a +1/+1 counter attacks", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, inkcaster);
    const a = putOnBattlefield(s, ap, bear());
    s.objects[a]!.counters["+1/+1"] = 1;
    const life = Object.fromEntries(s.turnOrder.map((p) => [p, s.players[p]!.life]));
    s = settle(attack(s, ap, [{ attacker: a, defender: opp }]), ap);
    for (const p of s.turnOrder) expect(s.players[p]!.life).toBe(p === ap ? life[p]! + 1 : life[p]! - 1);
  });
});

describe("Venser, the Sojourner", () => {
  it("is fully supported", () => supported(venser));
  it("−1: creatures can't be blocked this turn, also ones that arrive later", () => {
    let { s, ap, opp } = setup([]);
    const v = putOnBattlefield(s, ap, venser);
    s.objects[v]!.counters.loyalty = 3;
    const blocker = putOnBattlefield(s, opp, bear());
    s = resolveAll(run(s, planActivate(s, ap, v, 1)));
    const later = putOnBattlefield(s, ap, bear({ name: "Later" }));
    s.objects[later]!.attacking = opp;
    expect(blockProblem(s, s.objects[blocker]!, s.objects[later]!)).toMatch(/can't be blocked/);
    s = passUntil(s, "upkeep", next(s, ap));
    expect(blockProblem(s, s.objects[blocker]!, s.objects[later]!)).toBeNull();
  });
});

describe("Hidden Blade", () => {
  it("is fully supported", () => supported(hiddenBlade));
  it("attaches to target creature you control, which gains deathtouch if it's an Assassin", () => {
    for (const isAssassin of [true, false]) {
      let { s, ap, ids } = setup([hiddenBlade]);
      const c = putOnBattlefield(s, ap, isAssassin ? assassin() : bear());
      s = run(s, planCast(s, ap, ids[0]!));
      for (let i = 0; i < 8 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [tgt(c)] }));
      expect(s.objects[ids[0]!]!.attachedTo).toBe(c);
      expect(kw(s, c, "First strike")).toBe(true);
      expect(kw(s, c, "Deathtouch")).toBe(isAssassin);
    }
  });
});

describe("More cards this round", () => {
  it("are fully supported", () => supported(savingGrasp, undercity));
});

const goatnap = card("Goatnap", "Sorcery", "{2}{R}", { cmc: 3, oracleText: "Gain control of target creature until end of turn. Untap that creature. It gains haste until end of turn. If that creature is a Goat, it also gets +3/+0 until end of turn." });
const justiciar = card("Holy Justiciar", "Creature — Human Cleric", "{3}{W}", { cmc: 4, power: "2", toughness: "1", oracleText: "{2}{W}, {T}: Tap target creature. If that creature is a Zombie, exile it." });
const leonin = card("Ingenious Leonin", "Creature — Cat Soldier", "{4}{W}", { cmc: 5, power: "4", toughness: "4", oracleText: "{3}{W}: Put a +1/+1 counter on another target attacking creature you control. If that creature is a Cat, it gains first strike until end of turn. (It deals combat damage before creatures without first strike.)" });
const kaseto = card("Kaseto, Orochi Archmage", "Legendary Creature — Snake Wizard", "{1}{G}{U}", { cmc: 3, power: "2", toughness: "2", oracleText: "{G}{U}: Target creature can't be blocked this turn. If that creature is a Snake, it gets +2/+2 until end of turn." });
const littleBear = card("Little Bear", "Creature — Bear", "{2}{G}", { cmc: 3, power: "3", toughness: "2", oracleText: "Flash\nWhen this creature enters, untap another target creature you control. If that creature is a Bear, put a +1/+1 counter on it.", keywords: ["Flash"] });
const yipYip = card("Yip Yip!", "Instant — Lesson", "{W}", { cmc: 1, oracleText: "Target creature you control gets +2/+2 until end of turn. If that creature is an Ally, it also gains flying until end of turn." });

describe("If that creature is a ... (Goatnap, Little Bear and others)", () => {
  it("are fully supported", () => supported(goatnap, justiciar, leonin, kaseto, littleBear, yipYip));
  it("Little Bear: untaps another creature, and puts a +1/+1 counter on it if it's a Bear", () => {
    for (const isBear of [true, false]) {
      let { s, ap, ids } = setup([littleBear]);
      const c = putOnBattlefield(s, ap, isBear ? bear() : human());
      s.objects[c]!.tapped = true;
      s = run(s, planCast(s, ap, ids[0]!));
      for (let i = 0; i < 8 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [tgt(c)] }));
      expect(s.objects[c]!.tapped).toBe(false);
      expect(s.objects[c]!.counters["+1/+1"] ?? 0).toBe(isBear ? 1 : 0);
    }
  });
  it("Goatnap: a Goat also gets +3/+0", () => {
    for (const isGoat of [true, false]) {
      let { s, ap, ids, opp } = setup([goatnap]);
      const c = putOnBattlefield(s, opp, isGoat ? bear({ name: "Goat", typeLine: "Creature — Goat", subtypes: ["Goat"] }) : bear());
      s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(c)])));
      expect(controllerOf(s, s.objects[c]!)).toBe(ap);
      expect(pt(s, c)).toBe(isGoat ? "5/2" : "2/2");
      expect(kw(s, c, "Haste")).toBe(true);
    }
  });
});
