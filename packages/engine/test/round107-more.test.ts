// Round 107, more popular cards: Praetor's Grasp and Hoarding Broodlord (a card searched for and exiled face down that
// you may play, CR 406.3), Ugin, Eye of the Storms's −11, Talion and Sanctum Prelate ("choose a number", CR 614.12),
// Flame of Anor ("if you control a Wizard as you cast ~, you may choose two instead"), Timely Ward ("as though it had
// flash if it targets a commander").

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, mountain, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { fireEvent } from "../src/effects/triggers";
import { botActions, castProblem, isFullySupported, planActivate, planCast, waitingOn, type Action, type GameState } from "../src";

// Real oracle text (Scryfall).
const grasp = card("Praetor's Grasp", "Sorcery", "{1}{B}{B}", { oracleText: "Search target opponent's library for a card and exile it face down. Then that player shuffles. You may play that card for as long as it remains exiled." });
const broodlord = card("Hoarding Broodlord", "Creature — Dragon", "{5}{B}{B}{B}", { power: "7", toughness: "6", keywords: ["Flying", "Convoke"], oracleText: "Convoke\nFlying\nWhen this creature enters, search your library for a card, exile it face down, then shuffle. For as long as that card remains exiled, you may play it.\nSpells you cast from exile have convoke." });
const ugin = card("Ugin, Eye of the Storms", "Legendary Planeswalker — Ugin", "{7}", { loyalty: "7", oracleText: "When you cast this spell, exile up to one target permanent that's one or more colors.\nWhenever you cast a colorless spell, exile up to one target permanent that's one or more colors.\n+2: You gain 3 life and draw a card.\n0: Add {C}{C}{C}.\n−11: Search your library for any number of colorless nonland cards, exile them, then shuffle. Until end of turn, you may cast those cards without paying their mana costs." });
const talion = card("Talion, the Kindly Lord", "Legendary Creature — Faerie Noble", "{2}{U}{B}", { power: "3", toughness: "4", keywords: ["Flying"], oracleText: "Flying\nAs Talion enters, choose a number between 1 and 10.\nWhenever an opponent casts a spell with mana value, power, or toughness equal to the chosen number, that player loses 2 life and you draw a card." });
const prelate = card("Sanctum Prelate", "Creature — Human Cleric", "{1}{W}{W}", { power: "2", toughness: "2", oracleText: "As this creature enters, choose a number.\nNoncreature spells with mana value equal to the chosen number can't be cast." });
const flame = card("Flame of Anor", "Instant", "{1}{U}{R}", { oracleText: "Choose one. If you control a Wizard as you cast this spell, you may choose two instead.\n• Target player draws two cards.\n• Destroy target artifact.\n• Flame of Anor deals 5 damage to target creature." });
const ward = card("Timely Ward", "Enchantment — Aura", "{2}{W}", { keywords: ["Enchant"], oracleText: "You may cast this spell as though it had flash if it targets a commander.\nEnchant creature\nEnchanted creature has indestructible." });
// Test cards.
const relic = card("Colorless Relic", "Artifact", "{3}");
const shock = card("Test Shock", "Instant", "{R}", { oracleText: "Test Shock deals 2 damage to any target." });
const wizard = card("Test Wizard", "Creature — Human Wizard", "{1}{U}", { power: "1", toughness: "1" });
const fireball = card("Test Fireball", "Sorcery", "{X}{R}", { oracleText: "Test Fireball deals X damage to any target." });

/** Castable, mana aside (castProblem checks the mana pool). */
const castable = (p: string | null) => p === null || /not enough mana/.test(p);
/** Lands for an opponent. */
const lands = (s: GameState, pid: number) => {
  for (const l of [forest, forest, forest, forest, mountain, mountain, mountain]) putOnBattlefield(s, pid, l);
};
const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("can't do it");
  for (const a of plan) s = act(s, a);
  return s;
};
/** A card on top of a player's library. */
const onTop = (s: GameState, pid: number, def: ReturnType<typeof card>) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  return id;
};
const toHand = (s: GameState, pid: number, def: ReturnType<typeof card>) => {
  const id = onTop(s, pid, def);
  s.players[pid]!.library.shift();
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  return id;
};

describe("round 107: more popular cards", () => {
  it("parse", () => [grasp, broodlord, ugin, talion, prelate, flame, ward].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Praetor's Grasp: a card from the opponent's library, exiled face down, that you may play; only you see it", () => {
    const { s: s0, ap, ids, opp } = setup([grasp]);
    const theirs = onTop(s0, opp, bear({ name: "Their Bear" }));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [theirs] }));
    const o = s.objects[theirs]!;
    expect(o.zone).toBe("exile");
    expect(o.hiddenExile?.seen).toEqual([ap]);
    expect(o.mayPlay).toMatchObject({ player: ap, until: "exiled" });
    expect(castable(castProblem(s, ap, theirs))).toBe(true);
    s = settle(run(s, planCast(s, ap, theirs)));
    expect(s.objects[theirs]!.zone).toBe("battlefield");
    expect(s.objects[theirs]!.controller).toBe(ap);
  });

  it("Hoarding Broodlord: the card it exiles may be played, and spells cast from exile have convoke", () => {
    const { s: s0, ap } = setup([]);
    const found = onTop(s0, ap, relic);
    const b = putOnBattlefield(s0, ap, broodlord);
    s0.objects[b]!.zoneChanges = 0;
    // Its enters trigger, run as it would resolve.
    let s = s0;
    fireEvent(s, { type: "enters", id: b });
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [found] }));
    expect(s.objects[found]!.zone).toBe("exile");
    expect(s.objects[found]!.mayPlay).toMatchObject({ player: ap, until: "exiled" });
    // Convoke from exile: tap three creatures and no lands.
    for (const id of s.battlefield) if (s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.types.includes("Land")) s.objects[id]!.tapped = true;
    const helpers = [putOnBattlefield(s, ap, bear()), putOnBattlefield(s, ap, bear()), putOnBattlefield(s, ap, bear())];
    expect(castProblem(s, ap, found, undefined, undefined, helpers)).toBeNull();
    s = settle(act(s, { type: "castSpell", player: ap, objectId: found, convoke: helpers }));
    expect(s.objects[found]!.zone).toBe("battlefield");
  });

  it("Ugin, Eye of the Storms −11: colorless nonland cards exiled, castable free this turn; no land or colored card is offered", () => {
    const { s: s0, ap } = setup([]);
    const u = putOnBattlefield(s0, ap, ugin);
    s0.objects[u]!.counters.loyalty = 12;
    const a = onTop(s0, ap, relic);
    const b = onTop(s0, ap, card("Colorless Idol", "Artifact", "{4}"));
    let s = settle(run(s0, planActivate(s0, ap, u, 2)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    if (s.pending?.kind !== "searchLibrary") return;
    for (const id of s.pending.cards) {
      const d = s.cards[s.objects[id]!.cardId]!;
      expect(d.types.includes("Land") || d.colors.length > 0).toBe(false);
    }
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [a, b] }));
    for (const id of [a, b]) expect(s.objects[id]!.mayPlay).toMatchObject({ player: ap, until: "thisTurn", free: true, castOnly: true });
    for (const id of s.battlefield) if (s.objects[id]!.controller === ap) s.objects[id]!.tapped = true;
    s = settle(run(s, planCast(s, ap, a)));
    // A colorless spell: Ugin's cast trigger, with nothing to exile.
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "none" }] }));
    expect(s.objects[a]!.zone).toBe("battlefield");
  });

  it("Talion: choose a number as it enters; a spell with that mana value, power or toughness costs its caster 2 life and draws you a card", () => {
    const { s: s0, ap, ids, opp } = setup([talion]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "number", numberRange: { min: 1, max: 10 } });
    expect(() => act(s, { type: "chooseOption", player: ap, choice: "11" })).toThrow();
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "2" }));
    expect(s.objects[ids[0]!]!.chosen?.number).toBe(2);
    // An opponent casts a 2/2 for {1}{G}: mana value 2 (and power 2).
    const theirs = toHand(s, opp, bear());
    lands(s, opp);
    s = passUntil(s, "main1", opp);
    const life = s.players[opp]!.life;
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, opp, theirs)));
    expect(s.players[opp]!.life).toBe(life - 2);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    // A spell with none of them equal to 2 doesn't.
    const other = toHand(s, opp, card("Big Ox", "Creature — Ox", "{3}{G}", { power: "4", toughness: "4" }));
    const life2 = s.players[opp]!.life;
    s = settle(run(s, planCast(s, opp, other)));
    expect(s.players[opp]!.life).toBe(life2);
  });

  it("Talion: an X spell's mana value counts its X (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const t = putOnBattlefield(s0, ap, talion);
    s0.objects[t]!.chosen = { number: 4 };
    lands(s0, opp);
    let s = passUntil(s0, "main1", opp);
    const fb = toHand(s, opp, fireball);
    const life = s.players[opp]!.life;
    s = settle(run(s, planCast(s, opp, fb, [{ kind: "player", id: ap }], undefined, undefined, 3)));
    expect(s.players[opp]!.life).toBe(life - 2); // {X}{R} with X 3: mana value 4
  });

  it("Sanctum Prelate: noncreature spells with the chosen mana value can't be cast, by anyone; creatures and other values can", () => {
    const { s: s0, ap, opp } = setup([]);
    const p = putOnBattlefield(s0, opp, prelate);
    s0.objects[p]!.chosen = { number: 1 };
    const sh = toHand(s0, ap, shock);
    const b = toHand(s0, ap, card("One Drop", "Creature — Elf", "{G}", { power: "1", toughness: "1" }));
    const fb = toHand(s0, ap, fireball);
    expect(castProblem(s0, ap, sh)).toMatch(/can't be cast/);
    expect(castable(castProblem(s0, ap, b))).toBe(true);
    // X as chosen: X 0 makes mana value 1, X 2 doesn't.
    expect(castProblem(s0, ap, fb, [{ kind: "player", id: opp }], undefined, undefined, undefined, 0)).toMatch(/can't be cast/);
    expect(castable(castProblem(s0, ap, fb, [{ kind: "player", id: opp }], undefined, undefined, undefined, 2))).toBe(true);
  });

  it("Sanctum Prelate: the number is any whole number, and a bot picks one", () => {
    const { s: s0, ap, ids } = setup([prelate]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "number", numberRange: { min: 0, max: 999 } });
    for (const a of botActions(s, ap)) s = act(s, a);
    expect(typeof s.objects[ids[0]!]!.chosen?.number).toBe("number");
  });

  it("Flame of Anor: two modes with a Wizard, one without", () => {
    const { s: s0, ap, ids, opp } = setup([flame]);
    const art = putOnBattlefield(s0, opp, relic);
    const crit = putOnBattlefield(s0, opp, bear());
    const both = [{ kind: "object" as const, id: art }, { kind: "object" as const, id: crit }];
    expect(castable(castProblem(s0, ap, ids[0]!, both, [1, 2]))).toBe(false);
    putOnBattlefield(s0, ap, wizard);
    expect(castable(castProblem(s0, ap, ids[0]!, both, [1, 2]))).toBe(true);
    expect(castable(castProblem(s0, ap, ids[0]!, [{ kind: "player", id: ap }, ...both], [0, 1, 2]))).toBe(false);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, both, [1, 2])));
    expect(s.objects[art]!.zone).toBe("graveyard");
    expect(s.objects[crit]!.zone).toBe("graveyard");
  });

  it("Timely Ward: at instant speed only targeting a commander", () => {
    const { s: s0, ap, ids, opp } = setup([ward]);
    const cmd = putOnBattlefield(s0, ap, bear({ name: "My Commander" }), { commander: true });
    const plain = putOnBattlefield(s0, ap, bear());
    // On an opponent's turn, with priority.
    let s = passUntil(s0, "upkeep", opp);
    while (waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(castProblem(s, ap, ids[0]!, [target(plain)])).toMatch(/sorcery speed/);
    expect(castable(castProblem(s, ap, ids[0]!, [target(cmd)]))).toBe(true);
    s = settle(run(s, planCast(s, ap, ids[0]!, [target(cmd)])));
    expect(s.objects[ids[0]!]!.attachedTo).toBe(cmd);
  });
});
