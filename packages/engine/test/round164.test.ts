// Round 164: the most played cards, in popularity order, starting with Arwen, Timeline Culler and Evercoat Ursine.

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { nextRandom } from "../src/rng";
import { abilitiesOf, botActions, castProblem, characteristics, legalActions, potentialAttackers, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

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
/** Answers a blight question (CR 701.68a): the -1/-1 counters go on `on`. */
const blight = (s: GameState, on: string) => {
  if (s.pending?.kind !== "pickPermanents") return s; // the only creature: no question
  expect(s.pending).toMatchObject({ counter: "-1/-1" });
  return act(s, { type: "pickPermanents", player: (s.pending as { player: PlayerId }).player, ids: [on] });
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
const tokens = (s: GameState, pid: PlayerId, subtype: string) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid && characteristics(s, s.objects[id]!).subtypes.includes(subtype));

// Real oracle text (Scryfall).
const arwen = card("Arwen, Mortal Queen", "Legendary Creature — Elf Noble", "{1}{G}{W}", { cmc: 3, power: "2", toughness: "2", oracleText: "Arwen enters with an indestructible counter on her.\n{1}, Remove an indestructible counter from Arwen: Another target creature gains indestructible until end of turn. Put a +1/+1 counter and a lifelink counter on that creature and a +1/+1 counter and a lifelink counter on Arwen." });
const culler = card("Timeline Culler", "Creature — Drix Warlock", "{B}{B}", { cmc: 2, power: "2", toughness: "2", keywords: ["Haste", "Warp"], oracleText: "Haste\nYou may cast this card from your graveyard using its warp ability.\nWarp—{B}, Pay 2 life. (You may cast this card from your hand or graveyard for its warp cost. If you do, exile this creature at the beginning of the next end step, then you may cast it from exile on a later turn.)" });
const ursine = card("Evercoat Ursine", "Creature — Elemental Bear", "{4}{G}", { cmc: 5, power: "6", toughness: "5", keywords: ["Trample", "Hideaway"], oracleText: "Trample\nHideaway 3, hideaway 3 (When this creature enters, look at the top three cards of your library, exile one face down, then put the rest on the bottom in a random order. Then do it again.)\nWhenever this creature deals combat damage to a player, if there are cards exiled with it, you may play one of them without paying its mana cost." });

const shock = card("Test Shock", "Instant", "{R}", { cmc: 1, oracleText: "Test Shock deals 2 damage to any target." });
const divination = card("Test Divination", "Sorcery", "{2}{U}", { cmc: 3, oracleText: "Draw two cards." });
const ogre = card("Test Ogre", "Creature — Ogre", "{2}{R}", { cmc: 3, power: "3", toughness: "3" });

describe("round 164 cards", () => {
  it("are fully supported", () => supported(arwen, culler, ursine));
});

describe("Arwen, Mortal Queen", () => {
  it("removes her indestructible counter: the target gains indestructible, and both get a +1/+1 and a lifelink counter", () => {
    const { s: s0, ap, ids } = setup([arwen]);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    const a = ids[0]!;
    expect(s.objects[a]!.counters.indestructible).toBe(1);
    const ogreId = putOnBattlefield(s, ap, ogre);
    s = resolveAll(run(s, planActivate(s, ap, a, 0, [tgt(ogreId)])));
    expect(s.objects[a]!.counters.indestructible ?? 0).toBe(0);
    expect(kw(s, ogreId, "Indestructible")).toBe(true);
    for (const id of [a, ogreId]) expect(s.objects[id]!.counters).toMatchObject({ "+1/+1": 1, lifelink: 1 });
    expect(pt(s, a)).toBe("3/3");
    expect(kw(s, a, "Lifelink")).toBe(true);
    // No counter left: it can't be activated again.
    expect(planActivate(s, ap, a, 0, [tgt(ogreId)])).toBeNull();
  });

  it("doesn't target herself, and an illegal target means no counters on Arwen either (rulings)", () => {
    const { s: s0, ap, opp, ids } = setup([arwen, shock]);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    const a = ids[0]!;
    expect(planActivate(s, ap, a, 0, [tgt(a)])).toBeNull();
    const ogreId = putOnBattlefield(s, opp, ogre);
    s = run(s, planActivate(s, ap, a, 0, [tgt(ogreId)]));
    s.battlefield.splice(s.battlefield.indexOf(ogreId), 1);
    s.objects[ogreId]!.zone = "graveyard";
    s.players[opp]!.graveyard.push(ogreId);
    invalidateCharacteristics(s);
    s = resolveAll(s);
    expect(s.objects[a]!.counters["+1/+1"] ?? 0).toBe(0);
  });
});

describe("Timeline Culler", () => {
  it("is cast from the graveyard only for its warp cost ({B} and 2 life), then exiled at the next end step", () => {
    const { s: s0, ap } = setup([]);
    const id = into(s0, ap, culler, "graveyard");
    expect(castProblem(s0, ap, id, undefined, undefined, undefined, undefined, undefined, { via: "permission" })).toMatch(/only for its warp cost/);
    const life = s0.players[ap]!.life;
    let s = run(s0, planCast(s0, ap, id, undefined, undefined, undefined, undefined, { via: "permission", alt: "warp" }));
    s = resolveAll(s);
    expect(zone(s, id)).toBe("battlefield");
    expect(s.players[ap]!.life).toBe(life - 2);
    s = settle(passUntil(s, "end", ap), ap);
    expect(zone(s, id)).toBe("exile");
  });

  it("is cast for its warp cost from the hand too, paying the life", () => {
    const { s: s0, ap, ids } = setup([culler]);
    const life = s0.players[ap]!.life;
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { alt: "warp" })));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(s.players[ap]!.life).toBe(life - 2);
  });

  it("a bot casts it from its graveyard with warp", () => {
    const { s: s0, ap } = setup([]);
    const id = into(s0, ap, culler, "graveyard");
    s0.players[ap]!.landsPlayedThisTurn = 1;
    s0.players[ap]!.hand = [];
    s0.players[ap]!.command = [];
    const acts = botActions(s0, ap);
    const plan = acts.find((a) => a.type === "castSpell" && a.objectId === id);
    expect(plan).toMatchObject({ via: "permission", alt: "warp" });
  });
});

describe("Evercoat Ursine", () => {
  it("hides away two cards; dealing combat damage, its controller plays the one they choose, free", () => {
    const { s: s0, ap, opp, ids } = setup([ursine]);
    for (const d of [ogre, ogre, ogre, divination, divination, divination]) into(s0, ap, d, "library");
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 2; i++) {
      s = resolveAll(s);
      expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
      const pend = s.pending as { cards: string[] };
      s = act(s, { type: "searchLibrary", player: ap, found: [pend.cards[0]!] });
    }
    s = resolveAll(s);
    const key = `${ids[0]}@${s.objects[ids[0]!]!.zoneChanges ?? 0}`;
    const hidden = (s.linkedExile?.[key] ?? []).map((l) => l.id);
    expect(hidden.length).toBe(2);
    expect(hidden.every((h) => zone(s, h) === "exile")).toBe(true);
    s.objects[ids[0]!]!.controlledSinceTurn = -1;
    s = attack(s, ap, [{ attacker: ids[0]!, defender: opp }]);
    s = settle(s, ap);
    for (let i = 0; i < 20 && s.pending?.kind !== "searchLibrary"; i++) s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }), ap);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0, max: 1 });
    expect((s.pending as { cards: string[] }).cards.sort()).toEqual([...hidden].sort());
    const pick = hidden.find((h) => s.cards[s.objects[h]!.cardId]!.name === "Test Ogre") ?? hidden[0]!;
    s = act(s, { type: "searchLibrary", player: ap, found: [pick] });
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: pick });
    const other = hidden.find((h) => h !== pick)!;
    expect(zone(s, other)).toBe("exile");
  });
});

/** Sets the game's random state so the next random numbers come out as `want` says (CR 705, 706). */
function rig(s: GameState, ...want: ((r: number) => boolean)[]) {
  for (let x = 1; x < 2_000_000; x++) {
    const r = { rngState: x };
    if (want.every((w) => w(nextRandom(r)))) {
      s.rngState = x;
      return;
    }
  }
  throw new Error("no such state");
}
const coin = (won: boolean) => (r: number) => r < 0.5 === won;
const d12 = (n: number) => (r: number) => 1 + Math.floor(r * 12) === n;
/** Passes priority until an ability from `source` is on the stack (or a question is asked). */
const untilOnStack = (s: GameState, source: string, me: PlayerId) => {
  for (let i = 0; i < 60 && !s.stack.some((it) => it.sourceId === source) && (!s.pending || s.pending.player !== me); i++) {
    if (s.pending) s = run(s, botActions(s, s.pending.player));
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};

const gollum = card("Gollum, Obsessed Stalker", "Legendary Creature — Halfling Horror", "{1}{B}", { cmc: 2, power: "1", toughness: "1", keywords: ["Skulk"], oracleText: "Skulk (This creature can't be blocked by creatures with greater power.)\nAt the beginning of your end step, each opponent dealt combat damage this game by a creature named Gollum, Obsessed Stalker loses life equal to the amount of life you gained this turn." });
const scout = card("Sand Scout", "Creature — Human Scout", "{1}{W}", { cmc: 2, power: "2", toughness: "2", oracleText: "When this creature enters, if an opponent controls more lands than you, search your library for a Desert card, put it onto the battlefield tapped, then shuffle.\nWhenever one or more land cards are put into your graveyard from anywhere, create a 1/1 red, green, and white Sand Warrior creature token. This ability triggers only once each turn." });
const hours = card("Sword of Hours", "Artifact — Equipment", "{2}", { cmc: 2, keywords: ["Equip"], oracleText: "Whenever equipped creature attacks, put a +1/+1 counter on it.\nWhenever equipped creature deals combat damage, roll a d12. If the result is greater than the damage dealt or the result is 12, double the number of +1/+1 counters on that creature.\nEquip {2} ({2}: Attach to target creature you control. Equip only as a sorcery.)" });
const radroach = card("Infesting Radroach", "Creature — Insect Mutant", "{2}{B}", { cmc: 3, power: "2", toughness: "2", keywords: ["Flying", "Mill"], oracleText: "Flying\nThis creature can't block.\nWhenever this creature deals combat damage to a player, they get that many rad counters.\nWhenever an opponent mills a nonland card, if this creature is in your graveyard, you may return it to your hand." });
const thumb = card("Krark's Thumb", "Legendary Artifact", "{2}", { cmc: 2, oracleText: "If you would flip a coin, instead flip two coins and ignore one." });
const verdant = card("Verdant Command", "Instant", "{1}{G}", { cmc: 2, oracleText: "Choose two —\n• Target player creates two tapped 1/1 green Squirrel creature tokens.\n• Counter target loyalty ability of a planeswalker.\n• Exile target card from a graveyard.\n• Target player gains 3 life." });
const valkyrie = card("Valkyrie's Call", "Enchantment", "{3}{W}{W}", { cmc: 5, oracleText: "Whenever a nontoken, non-Angel creature you control dies, return that card to the battlefield under its owner's control with a +1/+1 counter on it. It has flying and is an Angel in addition to its other types." });
const stella = card("Stella Lee, Wild Card", "Legendary Creature — Human Rogue", "{1}{U}{R}", { cmc: 3, power: "2", toughness: "4", oracleText: "Whenever you cast your second spell each turn, exile the top card of your library. Until the end of your next turn, you may play that card.\n{T}: Copy target instant or sorcery spell you control. You may choose new targets for the copy. Activate only if you've cast three or more spells this turn." });
const idol = card("Idol of False Gods", "Kindred Artifact — Eldrazi", "{2}", { cmc: 2, oracleText: "{1}{C}, {T}: Create a 0/1 colorless Eldrazi Spawn creature token with \"Sacrifice this token: Add {C}.\"\nWhenever another Eldrazi you control dies, put a +1/+1 counter on this artifact.\nAs long as this artifact has eight or more +1/+1 counters on it, it's a 0/0 creature in addition to its other types and it has annihilator 2." });
const klothys = card("Klothys, God of Destiny", "Legendary Enchantment Creature — God", "{1}{R}{G}", { cmc: 3, power: "4", toughness: "5", keywords: ["Indestructible"], oracleText: "Indestructible\nAs long as your devotion to red and green is less than seven, Klothys isn't a creature.\nAt the beginning of your first main phase, exile target card from a graveyard. If it was a land card, add {R} or {G}. Otherwise, you gain 2 life and Klothys deals 2 damage to each opponent." });
const heart = card("Aligned Heart", "Enchantment", "{2}{W}", { cmc: 3, keywords: ["Flurry"], oracleText: "Flurry — Whenever you cast your second spell each turn, put a rally counter on this enchantment. Then create a 1/1 white Monk creature token with prowess for each rally counter on it. (Whenever you cast a noncreature spell, the token gets +1/+1 until end of turn.)" });
const windgrace = card("Soul of Windgrace", "Legendary Creature — Cat Avatar", "{1}{B}{R}{G}", { cmc: 4, power: "5", toughness: "4", oracleText: "Whenever Soul of Windgrace enters or attacks, you may put a land card from a graveyard onto the battlefield tapped under your control.\n{G}, Discard a land card: You gain 3 life.\n{1}{R}, Discard a land card: Draw a card.\n{2}{B}, Discard a land card: Soul of Windgrace gains indestructible until end of turn. Tap it." });
const flayer = card("Flayer of the Hatebound", "Creature — Devil", "{5}{R}", { cmc: 6, power: "4", toughness: "2", keywords: ["Undying"], oracleText: "Undying (When this creature dies, if it had no +1/+1 counters on it, return it to the battlefield under its owner's control with a +1/+1 counter on it.)\nWhenever this creature or another creature enters from your graveyard, that creature deals damage equal to its power to any target." });
const octopus = card("Lady Octopus, Inspired Inventor", "Legendary Creature — Human Scientist Villain", "{U}", { cmc: 1, power: "0", toughness: "2", oracleText: "Whenever you draw your first or second card each turn, put an ingenuity counter on Lady Octopus.\n{T}: You may cast an artifact spell from your hand with mana value less than or equal to the number of ingenuity counters on Lady Octopus without paying its mana cost." });
const frogantua = card("Rampant Frogantua", "Creature — Frog", "{2}{G}", { cmc: 3, power: "3", toughness: "3", keywords: ["Trample", "Mill"], oracleText: "Trample\nThis creature gets +10/+10 for each player who has lost the game.\nWhenever this creature deals combat damage to a player, you may mill that many cards. Put any number of land cards from among them onto the battlefield tapped." });

const heal = card("Test Healing", "Instant", "{W}", { cmc: 1, oracleText: "You gain 3 life." });
const mill2 = card("Test Mill", "Instant", "{U}", { cmc: 1, oracleText: "Target player mills two cards." });
const bottle = card("Bottle of Suleiman", "Artifact", "{4}", { cmc: 4, oracleText: "{1}, Sacrifice this artifact: Flip a coin. If you win the flip, create a 5/5 colorless Djinn artifact creature token with flying. If you lose the flip, this artifact deals 5 damage to you." });
const walker = card("Walker Test", "Legendary Planeswalker — Test", "{3}", { cmc: 3, loyalty: "3", oracleText: "+1: You gain 1 life." });
const eldrazi = card("Test Eldrazi", "Creature — Eldrazi", "{2}", { cmc: 2, power: "1", toughness: "1" });

describe("round 164 cards, more", () => {
  it("are fully supported", () => supported(gollum, scout, hours, radroach, thumb, verdant, valkyrie, stella, idol, klothys, heart, windgrace, flayer, octopus, frogantua));
});

describe("Gollum, Obsessed Stalker", () => {
  it("at your end step, only opponents a Gollum dealt combat damage lose life equal to the life you gained this turn", () => {
    const { s: s0, ap, opp, ids } = setup([heal]);
    const g = putOnBattlefield(s0, ap, gollum);
    s0.objects[g]!.controlledSinceTurn = -1;
    const third = next(s0, opp);
    let s = settle(attack(s0, ap, [{ attacker: g, defender: opp }]), ap);
    s = passUntil(s, "main2", ap);
    expect(s.players[opp]!.life).toBe(39);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    s = settle(passUntil(s, "end", ap), ap);
    expect(s.players[opp]!.life).toBe(36);
    expect(s.players[third]!.life).toBe(40);
  });
});

describe("Sand Scout", () => {
  it("makes one red, green and white Sand Warrior when lands go to your graveyard, once each turn", () => {
    const { s: s0, ap, ids } = setup([mill2, mill2]);
    putOnBattlefield(s0, ap, scout);
    for (let i = 0; i < 4; i++) into(s0, ap, forest, "library");
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [player(ap)])));
    const warriors = tokens(s, ap, "Warrior");
    expect(warriors.length).toBe(1);
    expect(characteristics(s, s.objects[warriors[0]!]!).colors.sort()).toEqual(["G", "R", "W"]);
    expect(pt(s, warriors[0]!)).toBe("1/1");
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [player(ap)])));
    expect(tokens(s, ap, "Warrior").length).toBe(1);
  });
});

describe("Sword of Hours", () => {
  for (const [roll, doubled] of [[5, true], [3, false], [12, true]] as const)
    it(`a d12 roll of ${roll} against 4 damage ${doubled ? "doubles" : "doesn't double"} the +1/+1 counters`, () => {
      const { s: s0, ap, opp } = setup([]);
      const c = putOnBattlefield(s0, ap, ogre);
      s0.objects[c]!.controlledSinceTurn = -1;
      const sw = putOnBattlefield(s0, ap, hours);
      s0.objects[sw]!.attachedTo = c;
      if (roll === 12) s0.objects[c]!.counters["+1/+1"] = 9; // 13 damage: only a 12 doubles
      invalidateCharacteristics(s0);
      let s = settle(attack(s0, ap, [{ attacker: c, defender: opp }]), ap);
      const before = s.objects[c]!.counters["+1/+1"]!;
      s = untilOnStack(s, sw, ap);
      rig(s, d12(roll));
      s = resolveAll(s);
      expect(s.objects[c]!.counters["+1/+1"]).toBe(doubled ? before * 2 : before);
    });
});

describe("Infesting Radroach", () => {
  it("returns from your graveyard to your hand when an opponent mills a nonland card, not a land", () => {
    for (const land of [false, true]) {
      const { s: s0, ap, opp, ids } = setup([mill2]);
      const r = into(s0, ap, radroach, "graveyard");
      for (let i = 0; i < 2; i++) into(s0, opp, land ? forest : ogre, "library");
      const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [player(opp)])));
      expect(zone(s, r)).toBe(land ? "graveyard" : "hand");
    }
  });

  it("doesn't return when you mill your own nonland cards", () => {
    const { s: s0, ap, ids } = setup([mill2]);
    const r = into(s0, ap, radroach, "graveyard");
    for (let i = 0; i < 2; i++) into(s0, ap, ogre, "library");
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [player(ap)])));
    expect(zone(s, r)).toBe("graveyard");
  });
});

describe("Krark's Thumb", () => {
  it("flips two coins: one won and one lost, you keep the one you choose", () => {
    for (const keepWon of [true, false]) {
      const { s: s0, ap } = setup([]);
      putOnBattlefield(s0, ap, thumb);
      const b = putOnBattlefield(s0, ap, bottle);
      let s = run(s0, planActivate(s0, ap, b, 0));
      rig(s, coin(true), coin(false));
      for (let i = 0; i < 10 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap, thumb: true });
      const life = s.players[ap]!.life;
      s = resolveAll(act(s, { type: "chooseMay", player: ap, yes: keepWon }));
      expect(tokens(s, ap, "Djinn").length).toBe(keepWon ? 1 : 0);
      expect(s.players[ap]!.life).toBe(keepWon ? life : life - 5);
    }
  });

  it("two won coins: won, no question; the bot keeps the won flip", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, thumb);
    const b = putOnBattlefield(s0, ap, bottle);
    let s = run(s0, planActivate(s0, ap, b, 0));
    rig(s, coin(true), coin(true));
    s = resolveAll(s);
    expect(s.pending).toBeFalsy();
    expect(tokens(s, ap, "Djinn").length).toBe(1);
    s = run(s0, planActivate(s0, ap, b, 0));
    rig(s, coin(false), coin(true));
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(botActions(s, ap)).toEqual([{ type: "chooseMay", player: ap, yes: true }]);
  });

  it("another player's Thumb doesn't change your flips", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, thumb);
    const b = putOnBattlefield(s0, ap, bottle);
    let s = run(s0, planActivate(s0, ap, b, 0));
    rig(s, coin(false), coin(true));
    s = resolveAll(s);
    expect(s.pending).toBeFalsy();
    expect(tokens(s, ap, "Djinn").length).toBe(0);
  });
});

describe("Verdant Command", () => {
  it("counters a planeswalker's loyalty ability, and a player gains 3 life", () => {
    const { s: s0, ap, ids } = setup([verdant]);
    const w = putOnBattlefield(s0, ap, walker);
    const loyalty = s0.objects[w]!.counters.loyalty ?? 0;
    let s = run(s0, planActivate(s0, ap, w, 0));
    const ability = s.stack[s.stack.length - 1]!;
    expect(ability.loyalty).toBe(true);
    const life = s.players[ap]!.life;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [{ kind: "stack", id: ability.id }, player(ap)], [1, 3])));
    expect(s.players[ap]!.life).toBe(life + 3); // not the +1 life from the countered ability
    expect(s.objects[w]!.counters.loyalty).toBe(loyalty + 1); // the cost was paid
  });

  it("can't target an activated ability that isn't a loyalty ability", () => {
    const { s: s0, ap, ids } = setup([verdant]);
    const b = putOnBattlefield(s0, ap, bottle);
    const s = run(s0, planActivate(s0, ap, b, 0));
    const ability = s.stack[s.stack.length - 1]!;
    expect(planCast(s, ap, ids[0]!, [{ kind: "stack", id: ability.id }, player(ap)], [1, 3])).toBeNull();
  });
});

describe("Valkyrie's Call", () => {
  it("returns a dying nontoken creature with a +1/+1 counter, flying and Angel, a creature type of its own", () => {
    const { s: s0, ap, ids } = setup([shock]);
    putOnBattlefield(s0, ap, valkyrie);
    const c = putOnBattlefield(s0, ap, bear());
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(c)])));
    expect(zone(s, c)).toBe("battlefield");
    expect(s.objects[c]!.counters["+1/+1"]).toBe(1);
    expect(kw(s, c, "Flying")).toBe(true);
    expect(characteristics(s, s.objects[c]!).subtypes).toEqual(expect.arrayContaining(["Bear", "Angel"]));
    // Now an Angel: dying again, it stays in the graveyard.
    s.objects[c]!.damage = 5;
    s = resolveAll(act(s, { type: "passPriority", player: waitingOn(s)! }));
    s = resolveAll(s);
    expect(zone(s, c)).toBe("graveyard");
  });
});

describe("Stella Lee, Wild Card", () => {
  it("your second spell exiles your top card to play; the copy needs three spells cast this turn", () => {
    const { s: s0, ap, opp, ids } = setup([shock, shock, shock]);
    const st = putOnBattlefield(s0, ap, stella);
    s0.objects[st]!.controlledSinceTurn = -1;
    const top = into(s0, ap, ogre, "library");
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [player(opp)])));
    s = run(s, planCast(s, ap, ids[1]!, [player(opp)]));
    const second = s.stack.find((it) => it.objectId === ids[1])!;
    expect(planActivate(s, ap, st, 0, [{ kind: "stack", id: second.id }])).toBeNull();
    s = resolveAll(s);
    expect(zone(s, top)).toBe("exile");
    expect(s.objects[top]!.mayPlay).toBeDefined();
    expect(planCast(s, ap, top)).not.toBeNull();
    s = run(s, planCast(s, ap, ids[2]!, [player(opp)]));
    const third = s.stack.find((it) => it.objectId === ids[2])!;
    expect(planActivate(s, ap, st, 0, [{ kind: "stack", id: third.id }])).not.toBeNull();
  });
});

describe("Idol of False Gods", () => {
  it("is a 0/0 creature with annihilator 2 with eight or more +1/+1 counters; another Eldrazi dying adds one", () => {
    const { s: s0, ap, ids } = setup([shock]);
    const i = putOnBattlefield(s0, ap, idol);
    const e = putOnBattlefield(s0, ap, eldrazi);
    s0.objects[i]!.counters["+1/+1"] = 7;
    invalidateCharacteristics(s0);
    expect(characteristics(s0, s0.objects[i]!).types).not.toContain("Creature");
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(e)])));
    expect(s.objects[i]!.counters["+1/+1"]).toBe(8);
    expect(characteristics(s, s.objects[i]!).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(pt(s, i)).toBe("8/8");
    expect(characteristics(s, s.objects[i]!).grantedAbilities).toContain("Annihilator 2");
  });
});

describe("Klothys, God of Destiny", () => {
  it("at your first main phase exiles a nonland card from a graveyard: 2 life and 2 damage to each opponent", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, klothys);
    const dead = into(s0, opp, ogre, "graveyard");
    let s = passUntil(passUntil(s0, "end", ap), "main1", ap);
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseTargets" && !s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(dead)] } as Action);
    const life = s.players[ap]!.life;
    const theirs = s.turnOrder.filter((p) => p !== ap).map((p) => s.players[p]!.life);
    s = resolveAll(s);
    expect(zone(s, dead)).toBe("exile");
    expect(s.players[ap]!.life).toBe(life + 2);
    expect(s.turnOrder.filter((p) => p !== ap).map((p) => s.players[p]!.life)).toEqual(theirs.map((l) => l - 2));
  });
});

describe("Aligned Heart", () => {
  it("your second spell adds a rally counter, then a Monk with prowess for each rally counter", () => {
    const { s: s0, ap, opp, ids } = setup([shock, shock]);
    const h = putOnBattlefield(s0, ap, heart);
    s0.objects[h]!.counters.rally = 1; // a rally counter from an earlier turn
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [player(opp)])));
    expect(tokens(s, ap, "Monk").length).toBe(0);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [player(opp)])));
    expect(s.objects[h]!.counters.rally).toBe(2);
    const monks = tokens(s, ap, "Monk");
    expect(monks.length).toBe(2);
    expect(abilitiesOf(s, s.objects[monks[0]!]!).triggers.length).toBe(1); // prowess
  });
});

describe("Soul of Windgrace", () => {
  it("entering, puts a land card from an opponent's graveyard onto the battlefield tapped under your control", () => {
    const { s: s0, ap, opp, ids } = setup([windgrace]);
    const land = into(s0, opp, forest, "graveyard");
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = resolveAll(s);
    if (s.pending) s = run(s, botActions(s, ap));
    s = resolveAll(s);
    expect(zone(s, land)).toBe("battlefield");
    expect(s.objects[land]!.tapped).toBe(true);
    expect(s.objects[land]!.controller).toBe(ap);
  });
});

describe("Flayer of the Hatebound", () => {
  it("returning with undying, it deals damage equal to its power to any target", () => {
    const { s: s0, ap, opp, ids } = setup([shock]);
    const f = putOnBattlefield(s0, ap, flayer);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(f)])));
    if (s.pending?.kind === "chooseTargets") s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [player(opp)] } as Action));
    expect(zone(s, f)).toBe("battlefield");
    expect(pt(s, f)).toBe("5/3");
    expect(s.turnOrder.some((p) => s.players[p]!.life === 35)).toBe(true);
  });

  it("a creature cast from your graveyard doesn't make it trigger (rulings)", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, flayer);
    const c = into(s0, ap, culler, "graveyard");
    let s = run(s0, planCast(s0, ap, c, undefined, undefined, undefined, undefined, { via: "permission", alt: "warp" }));
    s = resolveAll(s);
    expect(zone(s, c)).toBe("battlefield");
    expect(s.pending).toBeFalsy();
    expect(s.turnOrder.every((p) => s.players[p]!.life >= 38)).toBe(true);
  });
});

describe("Lady Octopus, Inspired Inventor", () => {
  it("gets an ingenuity counter for your first and second card drawn each turn only", () => {
    const { s: s0, ap, ids } = setup([divination, divination]);
    const o = putOnBattlefield(s0, ap, octopus);
    s0.players[ap]!.draws = { turn: s0.turn, n: 0 };
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[o]!.counters.ingenuity).toBe(2);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(s.objects[o]!.counters.ingenuity).toBe(2);
  });
});

describe("Rampant Frogantua", () => {
  it("gets +10/+10 for each player who has lost the game", () => {
    const { s: s0, ap, opp } = setup([]);
    const f = putOnBattlefield(s0, ap, frogantua);
    s0.players[opp]!.lost = true;
    invalidateCharacteristics(s0);
    expect(pt(s0, f)).toBe("13/13");
  });

  it("dealing combat damage, mills that many and puts the land cards milled you choose onto the battlefield tapped", () => {
    const { s: s0, ap, opp } = setup([]);
    const f = putOnBattlefield(s0, ap, frogantua);
    s0.objects[f]!.controlledSinceTurn = -1;
    const milled = [into(s0, ap, forest, "library"), into(s0, ap, ogre, "library"), into(s0, ap, forest, "library")];
    let s = settle(attack(s0, ap, [{ attacker: f, defender: opp }]), ap);
    for (let i = 0; i < 20 && s.pending?.kind !== "searchLibrary"; i++) s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }), ap);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0 });
    const lands = milled.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Forest");
    expect((s.pending as { cards: string[] }).cards.sort()).toEqual([...lands].sort());
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: lands }));
    for (const l of lands) expect(s.objects[l]!).toMatchObject({ zone: "battlefield", tapped: true });
    expect(zone(s, milled[1]!)).toBe("graveyard");
  });
});
