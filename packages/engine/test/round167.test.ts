// Round 167: the most played cards, in popularity order, starting with Lake of the Dead, Progenitor's Icon and Braids.

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, passUntil, pt, putOnBattlefield, scry, setup, swamp } from "./helpers";
import { abilitiesOf, botActions, characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

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
const player = (id: PlayerId) => ({ kind: "player", id }) as TargetChoice;
const kw = (s: GameState, id: string, k: string) => objHasKeyword(s, s.objects[id]!, k);
const pending = <T = Record<string, unknown>>(s: GameState) => s.pending as unknown as T;

// Real oracle text (Scryfall).
const lake = card("Lake of the Dead", "Land", "", { oracleText: "If this land would enter, sacrifice a Swamp instead. If you do, put this land onto the battlefield. If you don't, put it into its owner's graveyard.\n{T}: Add {B}.\n{T}, Sacrifice a Swamp: Add {B}{B}{B}{B}." });
const swamps = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name === "Swamp");

describe("Lake of the Dead", () => {
  it("is fully supported", () => supported(lake));
  it("enters only by sacrificing a Swamp, the one its controller picks", () => {
    let { s, ap, ids } = setup([lake]);
    const [a, b] = swamps(s, ap);
    s = act(s, { type: "playLand", player: ap, objectId: ids[0]! });
    expect(pending(s)).toMatchObject({ kind: "chooseOption", player: ap, what: "sacrificeInstead", options: expect.arrayContaining([a, b]) });
    expect(pending<{ options: string[] }>(s).options).toHaveLength(2);
    s = act(s, { type: "chooseOption", player: ap, choice: b! });
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(zone(s, b!)).toBe("graveyard");
    expect(zone(s, a!)).toBe("battlefield");
  });
  it("with one Swamp, sacrifices it; with none, goes to the graveyard without entering", () => {
    let { s, ap } = setup([]);
    const [a, b] = swamps(s, ap);
    s.battlefield.splice(s.battlefield.indexOf(b!), 1);
    delete s.objects[b!];
    invalidateCharacteristics(s);
    const one = into(s, ap, lake, "hand");
    s = act(s, { type: "playLand", player: ap, objectId: one });
    expect(s.pending).toBeFalsy();
    expect(zone(s, one)).toBe("battlefield");
    expect(zone(s, a!)).toBe("graveyard");
    // Next turn, no Swamp left: the next Lake goes straight to the graveyard.
    s = passUntil(passUntil(s, "upkeep", next(s, ap)), "main1", ap);
    const two = into(s, ap, lake, "hand");
    s = act(s, { type: "playLand", player: ap, objectId: two });
    expect(zone(s, two)).toBe("graveyard");
    expect(zone(s, one)).toBe("battlefield");
  });
  it("bots don't play it with no Swamp to sacrifice", () => {
    let { s, ap } = setup([]);
    for (const id of swamps(s, ap)) {
      s.battlefield.splice(s.battlefield.indexOf(id), 1);
      delete s.objects[id];
    }
    invalidateCharacteristics(s);
    const l = into(s, ap, lake, "hand");
    expect(botActions(s, ap).some((a) => a.type === "playLand" && a.objectId === l)).toBe(false);
  });
});

const braids = card("Braids, Conjurer Adept", "Legendary Creature — Human Wizard", "{2}{U}{U}", { cmc: 4, power: "2", toughness: "2", oracleText: "At the beginning of each player's upkeep, that player may put an artifact, creature, or land card from their hand onto the battlefield." });

describe("Braids, Conjurer Adept", () => {
  it("is fully supported", () => supported(braids));
  it("at each player's upkeep, that player may put an artifact, creature, or land card from their hand onto the battlefield", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, braids);
    const theirs = into(s, opp, bear({ name: "Their Bear" }), "hand");
    const spell = into(s, opp, card("Their Spell", "Instant", "{U}", { cmc: 1 }), "hand");
    s = passUntil(s, "upkeep", opp);
    s = resolveAll(s);
    expect(pending(s)).toMatchObject({ kind: "searchLibrary", player: opp, fromHand: true });
    expect(pending<{ cards: string[] }>(s).cards).toContain(theirs);
    expect(pending<{ cards: string[] }>(s).cards).not.toContain(spell);
    s = resolveAll(act(s, { type: "searchLibrary", player: opp, found: [theirs] }));
    expect(zone(s, theirs)).toBe("battlefield");
    expect(s.objects[theirs]!.controller).toBe(opp);
  });
});

const icon = card("Progenitor's Icon", "Artifact", "{3}", { cmc: 3, oracleText: "As this artifact enters, choose a creature type.\n{T}: Add one mana of any color.\n{T}: The next spell of the chosen type you cast this turn can be cast as though it had flash." });

describe("Progenitor's Icon", () => {
  it("is fully supported", () => supported(icon));
  it("the next spell of the chosen type you cast this turn can be cast as though it had flash, once", () => {
    let { s, ap, opp } = setup([bear({ name: "Bear One" }), bear({ name: "Bear Two" }), card("Test Elf", "Creature — Elf", "{G}", { cmc: 1, power: "1", toughness: "1" })]);
    const [one, two, elf] = s.players[ap]!.hand.slice(-3);
    const i = putOnBattlefield(s, ap, icon);
    s.objects[i]!.chosen = { type: "Bear" };
    s = passUntil(s, "end", ap);
    expect(planCast(s, ap, one!)).toBeNull(); // no flash yet
    s = resolveAll(run(s, planActivate(s, ap, i, 0)));
    expect(planCast(s, ap, elf!)).toBeNull(); // not of the chosen type
    s = resolveAll(run(s, planCast(s, ap, one!)));
    expect(zone(s, one!)).toBe("battlefield");
    expect(planCast(s, ap, two!)).toBeNull(); // used up
  });
  it("lasts only this turn", () => {
    let { s, ap, opp } = setup([bear()]);
    const b = s.players[ap]!.hand.at(-1)!;
    const i = putOnBattlefield(s, ap, icon);
    s.objects[i]!.chosen = { type: "Bear" };
    s = passUntil(s, "end", ap);
    s = resolveAll(run(s, planActivate(s, ap, i, 0)));
    s = passUntil(s, "upkeep", opp);
    expect(planCast(s, ap, b)).toBeNull();
  });
});

const elspeth = card("Elspeth Resplendent", "Legendary Planeswalker — Elspeth", "{3}{W}{W}", { cmc: 5, loyalty: "5", oracleText: "+1: Choose up to one target creature. Put a +1/+1 counter and a counter from among flying, first strike, lifelink, or vigilance on it.\n−3: Look at the top seven cards of your library. You may put a permanent card with mana value 3 or less from among them onto the battlefield with a shield counter on it. Put the rest on the bottom of your library in a random order.\n−7: Create five 3/3 white Angel creature tokens with flying." });

describe("Elspeth Resplendent", () => {
  it("is fully supported", () => supported(elspeth));
  it("+1: a +1/+1 counter and a flying, first strike, lifelink, or vigilance counter, the kind chosen as it resolves", () => {
    let { s, ap } = setup([]);
    const e = putOnBattlefield(s, ap, elspeth);
    s.objects[e]!.counters.loyalty = 5;
    const b = putOnBattlefield(s, ap, bear());
    s = resolveAll(run(s, planActivate(s, ap, e, 0, [tgt(b)])));
    expect(pending(s)).toMatchObject({ kind: "chooseOption", what: "counterKind", options: ["flying", "first strike", "lifelink", "vigilance"] });
    s = resolveAll(act(s, { type: "chooseOption", player: ap, choice: "lifelink" }));
    expect(s.objects[b]!.counters).toMatchObject({ "+1/+1": 1, lifelink: 1 });
    expect(kw(s, b, "Lifelink")).toBe(true);
    expect(pt(s, b)).toBe("3/3");
    expect(s.objects[e]!.counters.loyalty).toBe(6);
  });
  it("+1 with no target still adds loyalty", () => {
    let { s, ap } = setup([]);
    const e = putOnBattlefield(s, ap, elspeth);
    s.objects[e]!.counters.loyalty = 5;
    s = resolveAll(run(s, planActivate(s, ap, e, 0, [{ kind: "none" }])));
    expect(s.pending).toBeFalsy();
    expect(s.objects[e]!.counters.loyalty).toBe(6);
  });
});

const trinisphere = card("Trinisphere", "Artifact", "{3}", { cmc: 3, oracleText: "As long as this artifact is untapped, each spell that would cost less than three mana to cast costs three mana to cast. (Additional mana in the cost may be paid with any color of mana or colorless mana. For example, a spell that would cost {1}{B} to cast costs {2}{B} to cast instead.)" });
const tappedLands = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.objects[id]!.tapped && s.cards[s.objects[id]!.cardId]!.types.includes("Land")).length;

describe("Trinisphere", () => {
  it("is fully supported", () => supported(trinisphere));
  it("while untapped, each spell that would cost less than three mana costs three, whoever casts it", () => {
    let { s, ap, opp } = setup([bear(), bear({ name: "Second Bear" })]);
    const [one, two] = s.players[ap]!.hand.slice(-2);
    const t = putOnBattlefield(s, opp, trinisphere);
    s = resolveAll(run(s, planCast(s, ap, one!)));
    expect(zone(s, one!)).toBe("battlefield");
    expect(tappedLands(s, ap)).toBe(3); // {1}{G} became {2}{G}
    // Tapped, it does nothing.
    s.objects[t]!.tapped = true;
    s = resolveAll(run(s, planCast(s, ap, two!)));
    expect(tappedLands(s, ap)).toBe(5);
  });
  it("a spell cast without paying its mana cost costs three too (cascade), paid as it's cast", () => {
    const cascader = card("Test Cascader", "Creature — Elf", "{2}{R}{G}", { cmc: 4, power: "3", toughness: "2", keywords: ["Cascade"], oracleText: "Cascade" });
    let { s, ap, opp } = setup([cascader]);
    putOnBattlefield(s, opp, trinisphere);
    const b = into(s, ap, bear(), "library");
    s = run(s, planCast(s, ap, s.players[ap]!.hand.at(-1)!));
    s = resolveAll(s);
    expect(pending(s)).toMatchObject({ kind: "castFree", player: ap, objectId: b });
    expect(tappedLands(s, ap)).toBe(4);
    s = settle(run(s, botActions(s, ap)), ap);
    expect(zone(s, b)).toBe("battlefield");
    expect(tappedLands(s, ap)).toBe(7);
  });
  it("a spell that costs three or more is unchanged", () => {
    let { s, ap, opp } = setup([card("Test Giant", "Creature — Giant", "{3}{R}", { cmc: 4, power: "3", toughness: "3" })]);
    putOnBattlefield(s, opp, trinisphere);
    s = resolveAll(run(s, planCast(s, ap, s.players[ap]!.hand.at(-1)!)));
    expect(tappedLands(s, ap)).toBe(4);
  });
});

const shellGame = card("Sadistic Shell Game", "Sorcery", "{4}{B}", { cmc: 5, oracleText: "Starting with the next opponent in turn order, each player chooses a creature you don't control. Destroy the chosen creatures." });

describe("Sadistic Shell Game", () => {
  it("is fully supported", () => supported(shellGame));
  it("starting with the next opponent, each player must choose a creature the caster doesn't control; then they're destroyed", () => {
    let { s, ap, opp } = setup([shellGame]);
    const mine = putOnBattlefield(s, ap, bear({ name: "My Bear" }));
    const a = putOnBattlefield(s, opp, bear({ name: "Bear A" }));
    const b = putOnBattlefield(s, next(s, opp), bear({ name: "Bear B" }));
    const c = putOnBattlefield(s, next(s, next(s, opp)), bear({ name: "Bear C" }));
    s = resolveAll(run(s, planCast(s, ap, s.players[ap]!.hand.at(-1)!)));
    const order: PlayerId[] = [];
    const picks = [b, a, b, c];
    for (let i = 0; i < 4; i++) {
      const p = pending<{ kind: string; what: string; player: PlayerId; options: string[] }>(s);
      expect(p).toMatchObject({ kind: "chooseOption", what: "vote" });
      expect(p.options).not.toContain("none");
      expect(p.options.some((o) => o.startsWith(`${mine}@`))).toBe(false);
      order.push(p.player);
      s = resolveAll(act(s, { type: "chooseOption", player: p.player, choice: p.options.find((o) => o.startsWith(`${picks[i]}@`))! }));
    }
    expect(order).toEqual([opp, next(s, opp), next(s, next(s, opp)), ap]);
    expect([a, b, c].map((id) => zone(s, id))).toEqual(["graveyard", "graveyard", "graveyard"]);
    expect(zone(s, mine)).toBe("battlefield");
  });
  it("bots choose another player's best creature", () => {
    let { s, ap, opp } = setup([shellGame]);
    const theirs = putOnBattlefield(s, opp, bear({ name: "Their Bear" }));
    const big = putOnBattlefield(s, next(s, opp), bear({ name: "Big Bear", power: "6", toughness: "6" }));
    s = resolveAll(run(s, planCast(s, ap, s.players[ap]!.hand.at(-1)!)));
    expect(pending(s)).toMatchObject({ player: opp });
    const [pick] = botActions(s, opp);
    expect(pick).toMatchObject({ type: "chooseOption", choice: `${big}@0` });
    void theirs;
  });
});

const pride = card("The Pride of Hull Clade", "Legendary Creature — Crocodile Elk Turtle", "{10}{G}", { cmc: 11, power: "2", toughness: "15", keywords: ["Defender"], oracleText: "This spell costs {X} less to cast, where X is the total toughness of creatures you control.\nDefender\n{2}{U}{U}: Until end of turn, target creature you control gets +1/+0, gains \"Whenever this creature deals combat damage to a player, draw cards equal to its toughness,\" and can attack as though it didn't have defender." });

describe("The Pride of Hull Clade", () => {
  it("is fully supported", () => supported(pride));
  it("until end of turn: +1/+0, draws cards equal to its toughness when it deals combat damage to a player, and can attack despite defender", () => {
    let { s, ap, opp } = setup([]);
    const p = putOnBattlefield(s, ap, pride);
    s = resolveAll(run(s, planActivate(s, ap, p, 0, [tgt(p)])));
    expect(pt(s, p)).toBe("3/15");
    const hand = s.players[ap]!.hand.length;
    s = attack(s, ap, [{ attacker: p, defender: opp }]);
    s = passUntil(s, "end", ap);
    expect(s.players[opp]!.life).toBe(37);
    expect(s.players[ap]!.hand.length).toBe(hand + 15);
  });
});

const excruciator = card("Doomsday Excruciator", "Creature — Demon", "{B}{B}{B}{B}{B}{B}", { cmc: 6, power: "6", toughness: "6", keywords: ["Flying"], oracleText: "Flying\nWhen this creature enters, if it was cast, each player exiles all but the bottom six cards of their library face down.\nAt the beginning of your upkeep, draw a card." });

describe("Doomsday Excruciator", () => {
  it("is fully supported", () => supported(excruciator));
  it("cast, each player exiles all but the bottom six cards of their library face down", () => {
    let { s, ap, opp } = setup([excruciator]);
    for (let i = 0; i < 4; i++) putOnBattlefield(s, ap, swamp);
    const bottom = s.players[opp]!.library.slice(-6);
    // A player with six or fewer cards exiles none.
    const third = next(s, opp);
    for (const id of s.players[third]!.library.slice(0, -4)) delete s.objects[id];
    s.players[third]!.library = s.players[third]!.library.slice(-4);
    s = resolveAll(run(s, planCast(s, ap, s.players[ap]!.hand.at(-1)!)));
    expect(s.players[opp]!.library).toEqual(bottom);
    expect(s.players[ap]!.library).toHaveLength(6);
    expect(s.players[third]!.library).toHaveLength(4);
    const gone = s.players[opp]!.exile.map((id) => s.objects[id]!);
    expect(gone.length).toBeGreaterThan(50);
    expect(gone.every((o) => o.hiddenExile?.seen.length === 0)).toBe(true);
  });
  it("put onto the battlefield without being cast, it does nothing", () => {
    let { s, ap } = setup([card("Test Reanimate", "Sorcery", "{B}", { cmc: 1, oracleText: "Return target creature card from your graveyard to the battlefield." })]);
    const spell = s.players[ap]!.hand.at(-1)!;
    const e = into(s, ap, excruciator, "graveyard");
    const n = s.players[ap]!.library.length;
    s = resolveAll(run(s, planCast(s, ap, spell, [tgt(e)])));
    expect(zone(s, e)).toBe("battlefield");
    expect(s.players[ap]!.library.length).toBe(n);
  });
});

const nahiri = card("Nahiri, Forged in Fury", "Legendary Creature — Kor Artificer", "{4}{R}{W}", { cmc: 6, power: "5", toughness: "4", keywords: ["Affinity"], oracleText: "Affinity for Equipment (This spell costs {1} less to cast for each Equipment you control.)\nWhenever an equipped creature you control attacks, exile the top card of your library. You may play that card this turn. You may cast Equipment spells this way without paying their mana costs." });
const sword = (name = "Test Sword") => card(name, "Artifact — Equipment", "{3}", { cmc: 3, oracleText: "Equipped creature gets +1/+1.\nEquip {2}" });

describe("Nahiri, Forged in Fury", () => {
  it("is fully supported", () => supported(nahiri));
  it("an equipped creature attacks: exile the top card; an Equipment may be cast this turn without paying its mana cost", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, nahiri);
    const b = putOnBattlefield(s, ap, bear());
    const eq = putOnBattlefield(s, ap, sword("Worn Sword"));
    s.objects[eq]!.attachedTo = b;
    invalidateCharacteristics(s);
    const top = into(s, ap, sword(), "library");
    s = resolveAll(attack(s, ap, [{ attacker: b, defender: opp }]));
    expect(zone(s, top)).toBe("exile");
    s = passUntil(s, "main2", ap);
    const before = tappedLands(s, ap);
    s = resolveAll(run(s, planCast(s, ap, top)));
    expect(zone(s, top)).toBe("battlefield");
    expect(tappedLands(s, ap)).toBe(before);
  });
  it("any other card exiled this way is played for its costs", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, nahiri);
    const b = putOnBattlefield(s, ap, bear());
    const eq = putOnBattlefield(s, ap, sword("Worn Sword"));
    s.objects[eq]!.attachedTo = b;
    invalidateCharacteristics(s);
    const top = into(s, ap, bear({ name: "Top Bear" }), "library");
    s = resolveAll(attack(s, ap, [{ attacker: b, defender: opp }]));
    s = passUntil(s, "main2", ap);
    const before = tappedLands(s, ap);
    s = resolveAll(run(s, planCast(s, ap, top)));
    expect(zone(s, top)).toBe("battlefield");
    expect(tappedLands(s, ap)).toBe(before + 2);
  });
  it("an unequipped creature attacking doesn't trigger it", () => {
    let { s, ap, opp } = setup([]);
    const n = putOnBattlefield(s, ap, nahiri);
    const top = s.players[ap]!.library[0]!;
    s = resolveAll(attack(s, ap, [{ attacker: n, defender: opp }]));
    expect(zone(s, top)).toBe("library");
  });
});

const grishnakh = card("Grishnákh, Brash Instigator", "Legendary Creature — Goblin Soldier", "{2}{R}", { cmc: 3, power: "1", toughness: "1", keywords: ["Amass"], oracleText: "When Grishnákh enters, amass Orcs 2. When you do, until end of turn, gain control of target nonlegendary creature an opponent controls with power less than or equal to the amassed Army's power. Untap that creature. It gains haste until end of turn." });

describe("Grishnákh, Brash Instigator", () => {
  it("is fully supported", () => supported(grishnakh));
  it("amasses Orcs 2, then takes a nonlegendary creature with power up to the Army's until end of turn, untapped and hasty", () => {
    let { s, ap, opp } = setup([grishnakh]);
    const small = putOnBattlefield(s, opp, bear());
    s.objects[small]!.tapped = true;
    const big = putOnBattlefield(s, opp, bear({ name: "Big Bear", power: "3", toughness: "3" }));
    const legend = putOnBattlefield(s, opp, bear({ name: "Legend Bear", typeLine: "Legendary Creature — Bear", supertypes: ["Legendary"] }));
    s = resolveAll(run(s, planCast(s, ap, s.players[ap]!.hand.at(-1)!)));
    const army = s.battlefield.find((id) => s.objects[id]!.isToken)!;
    expect(pt(s, army)).toBe("2/2");
    expect(pending(s)).toMatchObject({ kind: "chooseTargets" });
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(big)] })).toThrow();
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(legend)] })).toThrow();
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [tgt(small)] }));
    expect(s.objects[small]!.tapped).toBe(false);
    expect(characteristics(s, s.objects[small]!).controller).toBe(ap);
    expect(kw(s, small, "Haste")).toBe(true);
    s = passUntil(s, "upkeep", next(s, ap));
    expect(characteristics(s, s.objects[small]!).controller).toBe(opp);
  });
});

const leylineRes = card("Leyline of Resonance", "Enchantment", "{2}{R}{R}", { cmc: 4, oracleText: "If this card is in your opening hand, you may begin the game with it on the battlefield.\nWhenever you cast an instant or sorcery spell that targets only a single creature you control, copy that spell. You may choose new targets for the copy." });
const growth = card("Giant Growth", "Instant", "{G}", { cmc: 1, oracleText: "Target creature gets +3/+3 until end of turn." });

describe("Leyline of Resonance", () => {
  it("is fully supported", () => supported(leylineRes, growth));
  it("an instant targeting only one creature you control is copied", () => {
    let { s, ap, ids } = setup([growth]);
    putOnBattlefield(s, ap, leylineRes);
    const b = putOnBattlefield(s, ap, bear());
    putOnBattlefield(s, ap, forest);
    s = run(s, planCast(s, ap, ids[0]!, [tgt(b)]));
    for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      if (s.pending?.kind === "copyTargets") s = act(s, { type: "copyTargets", player: s.pending.player });
      else if (s.pending) throw new Error(JSON.stringify(s.pending).slice(0, 300));
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(pt(s, b)).toBe("8/8");
  });
  it("a spell targeting an opponent's creature isn't copied", () => {
    let { s, ap, ids } = setup([growth]);
    putOnBattlefield(s, ap, leylineRes);
    const b = putOnBattlefield(s, next(s, ap), bear());
    putOnBattlefield(s, ap, forest);
    s = run(s, planCast(s, ap, ids[0]!, [tgt(b)]));
    expect(s.triggerQueue.length + s.stack.length).toBe(1);
    s = resolveAll(s);
    expect(pt(s, b)).toBe("5/5");
  });
});

const rush = card("Rush of Inspiration", "Instant", "{1}{U/R}{U/R}", { cmc: 3, oracleText: "Draw two cards. Then discard a card at random unless you pay {E}{E} (two energy counters)." });

describe("Rush of Inspiration", () => {
  it("is fully supported", () => supported(rush));
  const cast = (energy: number) => {
    let { s, ap, ids } = setup([rush, bear(), bear()]);
    s.players[ap]!.energy = energy;
    for (let i = 0; i < 3; i++) putOnBattlefield(s, ap, card("Island", "Basic Land — Island"));
    s = run(s, planCast(s, ap, ids[0]!, []));
    return { s: resolveAll(s, true), ap };
  };
  it("pays two energy to keep both cards", () => {
    let { s, ap } = cast(3);
    const hand = s.players[ap]!.hand.length;
    s = resolveAll(s, true);
    expect(s.players[ap]!.energy).toBe(1);
    expect(s.players[ap]!.graveyard.map((id) => s.cards[s.objects[id]!.cardId]!.name)).toEqual(["Rush of Inspiration"]);
    expect(s.players[ap]!.hand.length).toBe(hand);
  });
  it("without two energy, a card is discarded at random", () => {
    const { s, ap } = cast(1);
    expect(s.players[ap]!.energy).toBe(1);
    expect(s.players[ap]!.graveyard).toHaveLength(2);
  });
});

const cream = card("Cream of the Crop", "Enchantment", "{1}{G}", { cmc: 2, oracleText: "Whenever a creature you control enters, you may look at the top X cards of your library, where X is that creature's power. If you do, put one of those cards on top of your library and the rest on the bottom of your library in any order." });

describe("Cream of the Crop", () => {
  it("is fully supported", () => supported(cream));
  it("a 2-power creature enters: look at the top two, one goes back on top and the other to the bottom", () => {
    let { s, ap, ids } = setup([bear()]);
    putOnBattlefield(s, ap, cream);
    const top = into(s, ap, card("Top Card", "Sorcery", "{1}"), "library");
    const second = into(s, ap, card("Second Card", "Sorcery", "{1}"), "library");
    for (let i = 0; i < 2; i++) putOnBattlefield(s, ap, forest);
    s = run(s, planCast(s, ap, ids[0]!, []));
    s = resolveAll(s, true);
    expect(pending(s)).toMatchObject({ kind: "searchLibrary", player: ap, min: 1, max: 1 });
    expect(pending<{ cards: string[] }>(s).cards.sort()).toEqual([second, top].sort());
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [top] }), ap);
    const lib = s.players[ap]!.library;
    expect(lib[0]).toBe(top);
    expect(lib[lib.length - 1]).toBe(second);
  });
  it("may decline to look", () => {
    let { s, ap, ids } = setup([bear()]);
    putOnBattlefield(s, ap, cream);
    const lib = [...s.players[ap]!.library];
    for (let i = 0; i < 2; i++) putOnBattlefield(s, ap, forest);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [])), false);
    expect(s.pending).toBeFalsy();
    expect(s.players[ap]!.library).toEqual(lib);
  });
});

const wrexial = card("Wrexial, the Risen Deep", "Legendary Creature — Kraken", "{3}{U}{U}{B}", { cmc: 6, power: "5", toughness: "8", keywords: ["Islandwalk", "Swampwalk"], oracleText: "Islandwalk, swampwalk (This creature can't be blocked as long as defending player controls an Island or a Swamp.)\nWhenever Wrexial deals combat damage to a player, you may cast target instant or sorcery card from that player's graveyard without paying its mana cost. If that spell would be put into a graveyard, exile it instead." });
const divination = card("Divination", "Sorcery", "{2}{U}", { cmc: 3, oracleText: "Draw two cards." });

describe("Wrexial, the Risen Deep", () => {
  it("is fully supported", () => supported(wrexial, divination));
  it("casts an instant or sorcery card from the damaged player's graveyard for free, then exiles it", () => {
    let { s, ap } = setup([]);
    const w = putOnBattlefield(s, ap, wrexial);
    const opp = next(s, ap);
    const div = into(s, opp, divination, "graveyard");
    const hand = s.players[ap]!.hand.length;
    s = attack(s, ap, [{ attacker: w, defender: opp }]);
    for (let i = 0; i < 60 && zone(s, div) === "graveyard"; i++) {
      if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: s.pending.player, targets: [tgt(div)] } as Action);
      else if (s.pending?.kind === "castFree") s = run(s, planCast(s, ap, div));
      else if (s.pending && s.pending.player !== ap) s = run(s, botActions(s, s.pending.player));
      else if (s.pending) throw new Error(JSON.stringify(s.pending).slice(0, 300));
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(zone(s, div)).toBe("stack");
    s = resolveAll(s);
    expect(zone(s, div)).toBe("exile");
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
  });
});

const djeru = card("Djeru and Hazoret", "Legendary Creature — Human God", "{2}{R}{R}{W}", { cmc: 5, power: "5", toughness: "4", oracleText: "As long as you have one or fewer cards in hand, Djeru and Hazoret has vigilance and haste.\nWhenever Djeru and Hazoret attacks, look at the top six cards of your library. You may exile a legendary creature card from among them. Put the rest on the bottom of your library in a random order. Until end of turn, you may cast the exiled card without paying its mana cost." });
const legend = card("Some Legend", "Legendary Creature — Human", "{4}{W}{W}", { cmc: 6, power: "4", toughness: "4" });

describe("Djeru and Hazoret", () => {
  it("is fully supported", () => supported(djeru));
  it("has vigilance and haste only with one or fewer cards in hand", () => {
    const { s, ap } = setup([bear(), bear()]);
    const d = putOnBattlefield(s, ap, djeru);
    s.players[ap]!.hand.splice(0, s.players[ap]!.hand.length - 2);
    invalidateCharacteristics(s);
    expect(kw(s, d, "Haste")).toBe(false);
    s.players[ap]!.hand.pop();
    invalidateCharacteristics(s);
    expect(kw(s, d, "Haste")).toBe(true);
    expect(kw(s, d, "Vigilance")).toBe(true);
  });
  it("attacks: a legendary creature card exiled from the top six may be cast free this turn", () => {
    let { s, ap } = setup([]);
    const d = putOnBattlefield(s, ap, djeru);
    s.players[ap]!.hand.length = 0;
    const l = into(s, ap, legend, "library");
    invalidateCharacteristics(s);
    s = attack(s, ap, [{ attacker: d, defender: next(s, ap) }]);
    s = settle(s, ap);
    expect(pending(s)).toMatchObject({ kind: "searchLibrary", player: ap, min: 0, max: 1 });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [l] }), ap);
    expect(zone(s, l)).toBe("exile");
    expect(s.objects[l]!.mayPlay).toMatchObject({ free: true, castOnly: true, until: "thisTurn" });
    s = passUntil(s, "main2", ap);
    s = resolveAll(run(s, planCast(s, ap, l, [])));
    expect(zone(s, l)).toBe("battlefield");
  });
});

const paruns = card("Sword of the Paruns", "Artifact — Equipment", "{4}", { cmc: 4, oracleText: "As long as equipped creature is tapped, tapped creatures you control get +2/+0.\nAs long as equipped creature is untapped, untapped creatures you control get +0/+2.\n{3}: You may tap or untap equipped creature.\nEquip {3}" });

describe("Sword of the Paruns", () => {
  it("is fully supported", () => supported(paruns));
  it("pumps untapped creatures while the equipped one is untapped, tapped ones while it's tapped", () => {
    const { s, ap } = setup([]);
    const sw = putOnBattlefield(s, ap, paruns);
    const [a, b, c] = [1, 2, 3].map((i) => putOnBattlefield(s, ap, bear({ name: `Bear ${i}` })));
    invalidateCharacteristics(s);
    expect(pt(s, a!)).toBe("2/2"); // not attached: neither applies
    s.objects[sw]!.attachedTo = a;
    s.objects[c!]!.tapped = true;
    invalidateCharacteristics(s);
    expect([pt(s, a!), pt(s, b!), pt(s, c!)]).toEqual(["2/4", "2/4", "2/2"]);
    s.objects[a!]!.tapped = true;
    invalidateCharacteristics(s);
    expect([pt(s, a!), pt(s, b!), pt(s, c!)]).toEqual(["4/2", "2/2", "4/2"]);
  });
});

const inventor = card("Loyal Inventor", "Creature — Human Artificer", "{2}{U}", { cmc: 3, power: "2", toughness: "3", keywords: ["Vigilance"], oracleText: "Vigilance\nWhen this creature enters, you may search your library for an artifact card, reveal it, then shuffle. Put that card into your hand if you control an Assassin. Otherwise, put that card on top of your library." });
const trinket = card("Some Trinket", "Artifact", "{1}", { cmc: 1 });

describe("Loyal Inventor", () => {
  it("is fully supported", () => supported(inventor));
  const go = (assassin: boolean) => {
    let { s, ap, ids } = setup([inventor]);
    if (assassin) putOnBattlefield(s, ap, bear({ name: "Some Assassin", types: ["Creature"], subtypes: ["Human", "Assassin"], typeLine: "Creature — Human Assassin" }));
    const t = into(s, ap, trinket, "library");
    s.players[ap]!.library.push(s.players[ap]!.library.shift()!);
    for (let i = 0; i < 3; i++) putOnBattlefield(s, ap, card("Island", "Basic Land — Island"));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [])), true);
    expect(pending(s)).toMatchObject({ kind: "searchLibrary", player: ap });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [t] }), ap);
    return { s, ap, t };
  };
  it("without an Assassin, the artifact found goes on top after the shuffle", () => {
    const { s, ap, t } = go(false);
    expect(s.players[ap]!.library[0]).toBe(t);
  });
  it("with an Assassin, it goes into your hand", () => {
    const { s, t } = go(true);
    expect(zone(s, t)).toBe("hand");
  });
});

const mech = card("Mobilizer Mech", "Artifact — Vehicle", "{1}{U}", { cmc: 2, power: "3", toughness: "4", keywords: ["Flying", "Crew"], oracleText: "Flying\nWhenever this Vehicle becomes crewed, up to one other target Vehicle you control becomes an artifact creature until end of turn.\nCrew 3 (Tap any number of creatures you control with total power 3 or more: This Vehicle becomes an artifact creature until end of turn.)" });
const cart = card("Some Cart", "Artifact — Vehicle", "{2}", { cmc: 2, power: "4", toughness: "4", keywords: ["Crew"], oracleText: "Crew 5" });

describe("Mobilizer Mech", () => {
  it("is fully supported", () => supported(mech, cart));
  it("becoming crewed makes another Vehicle an artifact creature until end of turn", () => {
    let { s, ap } = setup([]);
    const m = putOnBattlefield(s, ap, mech);
    const c = putOnBattlefield(s, ap, cart);
    const b = putOnBattlefield(s, ap, bear({ power: "3" }));
    const i = abilitiesOf(s, s.objects[m]!).activated.findIndex((a) => a.crew !== undefined);
    s = run(s, planActivate(s, ap, m, i, undefined, undefined, [b]));
    s = resolveAll(s);
    expect(pending(s)).toMatchObject({ kind: "chooseTargets", player: ap });
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(c)] } as Action);
    s = resolveAll(s);
    expect(characteristics(s, s.objects[m]!).types).toContain("Creature");
    expect(characteristics(s, s.objects[c]!).types).toContain("Creature");
    expect(pt(s, c)).toBe("4/4");
  });
});

const photo = card("Flash Photography", "Sorcery", "{2}{U}{U}", { cmc: 4, keywords: ["Flashback"], oracleText: "You may cast this spell as though it had flash if it targets a permanent you control.\nCreate a token that's a copy of target permanent.\nFlashback {4}{U}{U} (You may cast this card from your graveyard for its flashback cost. Then exile it.)" });

describe("Flash Photography", () => {
  it("is fully supported", () => supported(photo));
  it("can be cast at instant speed only targeting a permanent you control", () => {
    let { s, ap, ids } = setup([photo]);
    const mine = putOnBattlefield(s, ap, bear({ name: "My Bear" }));
    const theirs = putOnBattlefield(s, next(s, ap), bear({ name: "Their Bear" }));
    for (let i = 0; i < 4; i++) putOnBattlefield(s, ap, card("Island", "Basic Land — Island"));
    s = passUntil(s, "beginCombat", ap);
    expect(() => run(s, planCast(s, ap, ids[0]!, [tgt(theirs)]))).toThrow(/sorcery speed|no plan/);
    expect(s.step).toBe("beginCombat");
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(mine)])));
    expect(s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "My Bear")).toHaveLength(2);
  });
});

const press = card("Press the Enemy", "Instant", "{2}{U}{U}", { cmc: 4, oracleText: "Return target spell or nonland permanent an opponent controls to its owner's hand. You may cast an instant or sorcery spell with equal or lesser mana value from your hand without paying its mana cost." });
const bigSorcery = card("Big Sorcery", "Sorcery", "{3}{U}", { cmc: 4, oracleText: "Draw three cards." });
const xSpell = card("Some X Spell", "Sorcery", "{X}{R}", { cmc: 1, oracleText: "Some X Spell deals X damage to any target." });

describe("Press the Enemy", () => {
  it("is fully supported", () => supported(press, bigSorcery, divination));
  const islands = (s: GameState, pid: PlayerId, n: number) => { for (let i = 0; i < n; i++) putOnBattlefield(s, pid, card("Island", "Basic Land — Island")); };
  it("returns a 3-mana permanent; only an instant or sorcery with mana value 3 or less may be cast free", () => {
    let { s, ap, ids } = setup([press, divination, bigSorcery]);
    const theirs = putOnBattlefield(s, next(s, ap), bear({ name: "Their Thing", manaCost: "{2}{G}", cmc: 3 }));
    islands(s, ap, 4);
    s = run(s, planCast(s, ap, ids[0]!, [tgt(theirs)]));
    s = resolveAll(s);
    expect(zone(s, theirs)).toBe("hand");
    expect(pending(s)).toMatchObject({ kind: "chooseOption", what: "castFromHand", options: [ids[1], "none"] });
  });
  it("a spell returned to hand counts the X it was cast with", () => {
    let { s, ap, ids } = setup([press, divination, bigSorcery]);
    const opp = next(s, ap);
    const x = into(s, opp, xSpell, "hand");
    islands(s, ap, 4);
    for (let i = 0; i < 4; i++) putOnBattlefield(s, opp, card("Mountain", "Basic Land — Mountain"));
    s = passUntil(s, "main1", opp);
    s = run(s, planCast(s, opp, x, [player(ap)], undefined, undefined, 3));
    s = act(s, { type: "passPriority", player: opp });
    expect(waitingOn(s)).toBe(next(s, opp));
    for (let i = 0; i < 4 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = run(s, planCast(s, ap, ids[0]!, [{ kind: "stack", id: s.stack.find((i) => i.objectId === x)!.id }]));
    for (let i = 0; i < 6 && s.stack.length > 1; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(zone(s, x)).toBe("hand");
    expect(pending<{ options: string[] }>(s).options.sort()).toEqual([ids[1], ids[2], "none"].sort());
  });
});

const glamdring = card("Glamdring", "Legendary Artifact — Equipment", "{2}", { cmc: 2, oracleText: "Equipped creature has first strike and gets +1/+0 for each instant and sorcery card in your graveyard.\nWhenever equipped creature deals combat damage to a player, you may cast an instant or sorcery spell from your hand with mana value less than or equal to that damage without paying its mana cost.\nEquip {3}" });
const crown = card("Crown of Gondor", "Legendary Artifact — Equipment", "{3}", { cmc: 3, oracleText: "Equipped creature gets +1/+1 for each creature you control.\nWhen a legendary creature you control enters, if there is no monarch, you become the monarch.\nEquip {4}. This ability costs {3} less to activate if you're the monarch." });

describe("Glamdring", () => {
  it("is fully supported", () => supported(glamdring));
  it("equipped creature has first strike and +1/+0 for each instant and sorcery card in your graveyard", () => {
    const { s, ap } = setup([]);
    const g = putOnBattlefield(s, ap, glamdring);
    const b = putOnBattlefield(s, ap, bear());
    s.objects[g]!.attachedTo = b;
    into(s, ap, divination, "graveyard");
    into(s, ap, growth, "graveyard");
    into(s, ap, bear({ name: "Dead Bear" }), "graveyard");
    invalidateCharacteristics(s);
    expect(pt(s, b)).toBe("4/2");
    expect(kw(s, b, "First strike")).toBe(true);
  });
});

describe("Crown of Gondor", () => {
  it("is fully supported", () => supported(crown));
  it("a legendary creature entering makes you the monarch if there is none; equip costs {1} then", () => {
    let { s, ap, ids } = setup([djeru]);
    const c = putOnBattlefield(s, ap, crown);
    for (const l of ["Mountain", "Mountain", "Plains", "Mountain", "Plains"]) putOnBattlefield(s, ap, card(l, `Basic Land — ${l}`));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [])));
    expect(s.monarch).toBe(ap);
    const d = ids[0]!;
    expect(s.objects[d]!.zone).toBe("battlefield");
    // Leave one land untapped: {1} is enough for the equip now.
    const lands = s.battlefield.filter((id) => s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.types.includes("Land"));
    lands.forEach((id, i) => (s.objects[id]!.tapped = i > 0));
    const eq = abilitiesOf(s, s.objects[c]!).activated.findIndex((a) => a.equip);
    s.monarch = undefined;
    expect(planActivate(s, ap, c, eq, [tgt(d)])).toBeNull();
    s.monarch = ap;
    s = resolveAll(run(s, planActivate(s, ap, c, eq, [tgt(d)])));
    expect(s.objects[c]!.attachedTo).toBe(d);
  });
  it("doesn't take the monarchy from another player", () => {
    let { s, ap, ids } = setup([djeru]);
    putOnBattlefield(s, ap, crown);
    s.monarch = next(s, ap);
    for (const l of ["Mountain", "Mountain", "Plains", "Mountain", "Plains"]) putOnBattlefield(s, ap, card(l, `Basic Land — ${l}`));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [])));
    expect(s.monarch).toBe(next(s, ap));
  });
});

const wisdom = card("Accumulate Wisdom", "Instant — Lesson", "{1}{U}", { cmc: 2, oracleText: "Look at the top three cards of your library. Put one of those cards into your hand and the rest on the bottom of your library in any order. Put each of those cards into your hand instead if there are three or more Lesson cards in your graveyard." });
const lesson = (i: number) => card(`Lesson ${i}`, "Sorcery — Lesson", "{1}", { cmc: 1 });

describe("Accumulate Wisdom", () => {
  it("is fully supported", () => supported(wisdom));
  const go = (lessons: number) => {
    let { s, ap, ids } = setup([wisdom]);
    for (let i = 0; i < lessons; i++) into(s, ap, lesson(i), "graveyard");
    const top = s.players[ap]!.library.slice(0, 3);
    for (let i = 0; i < 2; i++) putOnBattlefield(s, ap, card("Island", "Basic Land — Island"));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [])));
    return { s, ap, top };
  };
  it("with three Lessons in the graveyard, all three cards go to hand", () => {
    const { s, ap, top } = go(3);
    expect(s.pending).toBeFalsy();
    expect(top.every((id) => s.players[ap]!.hand.includes(id))).toBe(true);
  });
  it("with two, one of them", () => {
    const { s, ap } = go(2);
    expect(pending(s)).toMatchObject({ kind: "searchLibrary", player: ap, min: 1, max: 1 });
  });
});

const jacePM = card("Jace, the Perfected Mind", "Legendary Planeswalker — Jace", "{2}{U}{U/P}", { cmc: 4, loyalty: "5", keywords: ["Compleated"], oracleText: "Compleated ({U/P} can be paid with {U} or 2 life. If life was paid, this planeswalker enters with two fewer loyalty counters.)\n+1: Until your next turn, up to one target creature gets -3/-0.\n−2: Target player mills three cards. Then if a graveyard has twenty or more cards in it, you draw three cards. Otherwise, you draw a card.\n−X: Target player mills three times X cards." });

describe("Jace, the Perfected Mind", () => {
  it("is fully supported", () => supported(jacePM));
  const ready = () => {
    const { s, ap } = setup([]);
    const j = putOnBattlefield(s, ap, jacePM);
    s.objects[j]!.counters.loyalty = 5;
    const opp = next(s, ap);
    for (let i = 0; i < 30; i++) into(s, opp, bear({ name: `Lib ${i}` }), "library");
    return { s, ap, j, opp };
  };
  it("−2: mills three, then draws three once a graveyard has twenty cards", () => {
    let { s, ap, j, opp } = ready();
    for (let i = 0; i < 17; i++) into(s, opp, bear({ name: `Yard ${i}` }), "graveyard");
    const hand = s.players[ap]!.hand.length;
    s = resolveAll(run(s, planActivate(s, ap, j, 1, [player(opp)])));
    expect(s.players[opp]!.graveyard).toHaveLength(20);
    expect(s.players[ap]!.hand.length).toBe(hand + 3);
  });
  it("−2: otherwise draws one", () => {
    let { s, ap, j, opp } = ready();
    const hand = s.players[ap]!.hand.length;
    s = resolveAll(run(s, planActivate(s, ap, j, 1, [player(opp)])));
    expect(s.players[opp]!.graveyard).toHaveLength(3);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });
  it("−X: mills three times X", () => {
    let { s, ap, j, opp } = ready();
    s = resolveAll(run(s, planActivate(s, ap, j, 2, [player(opp)], undefined, undefined, 2)));
    expect(s.players[opp]!.graveyard).toHaveLength(6);
    expect(s.objects[j]!.counters.loyalty).toBe(3);
  });
});

const disorder = card("Disorder in the Court", "Instant", "{X}{W}{U}", { cmc: 2, oracleText: "Exile X target creatures, then investigate X times. Return the exiled cards to the battlefield tapped under their owners' control at the beginning of the next end step." });

describe("Disorder in the Court", () => {
  it("is fully supported", () => supported(disorder));
  it("exiles X creatures, investigates X times, and returns them tapped at the next end step", () => {
    let { s, ap, ids } = setup([disorder]);
    const mine = putOnBattlefield(s, ap, bear({ name: "My Bear" }));
    const theirs = putOnBattlefield(s, next(s, ap), bear({ name: "Their Bear" }));
    for (const l of ["Plains", "Island", "Island", "Island"]) putOnBattlefield(s, ap, card(l, `Basic Land — ${l}`));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(mine), tgt(theirs)], undefined, undefined, 2)));
    expect([zone(s, mine), zone(s, theirs)]).toEqual(["exile", "exile"]);
    expect(s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Clue"))).toHaveLength(2);
    s = settle(passUntil(s, "end", ap), ap);
    const back = s.battlefield.filter((id) => ["My Bear", "Their Bear"].includes(s.cards[s.objects[id]!.cardId]!.name));
    expect(back).toHaveLength(2);
    expect(back.every((id) => s.objects[id]!.tapped)).toBe(true);
    expect(back.map((id) => s.objects[id]!.controller).sort()).toEqual([ap, next(s, ap)].sort());
  });
});
