// Round 106, popular cards further down: Death Baron (two groups, one bonus), Soulherder ("whenever a creature is exiled
// from the battlefield"), Massacre Girl, Known Killer ("if its toughness was less than 1"), Legion Warboss ("attacks
// this combat if able"), Moonsilver Key ("an artifact card with a mana ability").

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, passUntil, pt, putOnBattlefield, setup, target } from "./helpers";
import { characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, planCast, waitingOn, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const baron = card("Death Baron", "Creature — Zombie Wizard", "{1}{B}{B}", { power: "2", toughness: "2", oracleText: "Skeletons you control and other Zombies you control get +1/+1 and have deathtouch. (Any amount of damage they deal to a creature is enough to destroy it.)" });
const herder = card("Soulherder", "Creature — Spirit", "{1}{W}{U}", { power: "1", toughness: "1", oracleText: "Whenever a creature is exiled from the battlefield, put a +1/+1 counter on this creature.\nAt the beginning of your end step, you may exile another target creature you control, then return that card to the battlefield under its owner's control." });
const killer = card("Massacre Girl, Known Killer", "Legendary Creature — Human Assassin", "{2}{B}{B}", { power: "4", toughness: "4", keywords: ["Menace"], oracleText: "Menace\nCreatures you control have wither. (They deal damage to creatures in the form of -1/-1 counters.)\nWhenever a creature an opponent controls dies, if its toughness was less than 1, draw a card." });
const warboss = card("Legion Warboss", "Creature — Goblin Soldier", "{2}{R}", { power: "2", toughness: "2", keywords: ["Mentor"], oracleText: "Mentor (Whenever this creature attacks, put a +1/+1 counter on target attacking creature with lesser power.)\nAt the beginning of combat on your turn, create a 1/1 red Goblin creature token. That token gains haste until end of turn and attacks this combat if able." });
const key = card("Moonsilver Key", "Artifact", "{2}", { oracleText: "{1}, {T}, Sacrifice this artifact: Search your library for an artifact card with a mana ability or a basic land card, reveal it, put it into your hand, then shuffle." });

// Test cards.
const zombie = card("Test Zombie", "Creature — Zombie", "{1}{B}", { power: "2", toughness: "2" });
const skeleton = card("Test Skeleton", "Creature — Skeleton", "{B}", { power: "1", toughness: "1" });
const both = card("Test Zombie Skeleton", "Creature — Zombie Skeleton", "{B}", { power: "1", toughness: "1" });
const banish = card("Test Banish", "Instant", "{W}", { oracleText: "Exile target creature." });
const murder = card("Test Murder", "Instant", "{1}{B}", { oracleText: "Destroy target creature." });
const shrink = card("Test Shrink", "Instant", "{B}", { oracleText: "Target creature gets -3/-3 until end of turn." });
const rock = card("Test Rock", "Artifact", "{1}", { oracleText: "{T}: Add {C}." });
const statue = card("Test Statue", "Artifact", "{1}", { oracleText: "{1}, {T}: Draw a card." });

const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const castIt = (s: GameState, pid: PlayerId, id: string, targets: string[] = []) => {
  const plan = planCast(s, pid, id, targets.map(target));
  if (!plan) throw new Error("can't cast");
  for (const a of plan) s = act(s, a);
  return settle(s);
};
const toLibraryTop = (s: GameState, pid: PlayerId, id: string) => {
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
};

describe("round 106: popular cards further down", () => {
  it("parse", () => [baron, herder, killer, warboss, key].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Death Baron: Skeletons and other Zombies you control; one that's both gets it once; not itself", () => {
    const { s, ap, opp } = setup([]);
    const b = putOnBattlefield(s, ap, baron);
    const z = putOnBattlefield(s, ap, zombie);
    const k = putOnBattlefield(s, ap, skeleton);
    const zk = putOnBattlefield(s, ap, both);
    const theirs = putOnBattlefield(s, opp, zombie);
    invalidateCharacteristics(s);
    expect(pt(s, b)).toBe("2/2");
    expect(objHasKeyword(s, s.objects[b]!, "Deathtouch")).toBe(false);
    expect(pt(s, z)).toBe("3/3");
    expect(pt(s, k)).toBe("2/2");
    expect(pt(s, zk)).toBe("2/2");
    expect(objHasKeyword(s, s.objects[zk]!, "Deathtouch")).toBe(true);
    expect(pt(s, theirs)).toBe("2/2");
    // One that's a Skeleton gives itself the bonus (rulings), and gets the first one's as another Zombie.
    expect(pt(s, putOnBattlefield(s, ap, { ...baron, oracleId: "test-baron-skeleton", subtypes: ["Zombie", "Wizard", "Skeleton"] }))).toBe("4/4");
    expect(pt(s, b)).toBe("3/3");
  });

  it("Soulherder: a counter whenever any creature is exiled from the battlefield, not when one dies", () => {
    const { s: s0, ap, opp, ids } = setup([banish, murder]);
    const h = putOnBattlefield(s0, ap, herder);
    const [x, y] = [putOnBattlefield(s0, opp, bear()), putOnBattlefield(s0, opp, bear({ name: "Other Bear" }))];
    let s = castIt(s0, ap, ids[0]!, [x]);
    expect(s.objects[x]!.zone).toBe("exile");
    expect(s.objects[h]!.counters["+1/+1"]).toBe(1);
    s = castIt(s, ap, ids[1]!, [y]);
    expect(s.objects[y]!.zone).toBe("graveyard");
    expect(s.objects[h]!.counters["+1/+1"]).toBe(1);
  });

  it("Soulherder: its end step flicker counts too", () => {
    const { s: s0, ap } = setup([]);
    const h = putOnBattlefield(s0, ap, herder);
    const mine = putOnBattlefield(s0, ap, bear());
    let s = passUntil(s0, "end", ap);
    for (let i = 0; i < 20 && (s.pending || s.stack.length || s.triggerQueue.length); i++) {
      const p = s.pending;
      if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [target(mine)] });
      else if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: ap, yes: true });
      else if (p) throw new Error(p.kind);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.objects[h]!.counters["+1/+1"]).toBe(1);
    expect(s.battlefield.some((id) => s.objects[id]!.cardId === s0.objects[mine]!.cardId)).toBe(true);
  });

  it("Massacre Girl, Known Killer: a card for an opponent's creature that died with toughness below 1, not for one destroyed", () => {
    const { s: s0, ap, opp, ids } = setup([shrink, murder]);
    putOnBattlefield(s0, ap, killer);
    const [x, y] = [putOnBattlefield(s0, opp, bear()), putOnBattlefield(s0, opp, bear({ name: "Other Bear" }))];
    const hand = s0.players[ap]!.hand.length;
    let s = castIt(s0, ap, ids[0]!, [x]);
    expect(s.objects[x]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 1);
    s = castIt(s, ap, ids[1]!, [y]);
    expect(s.objects[y]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand - 2 + 1);
  });

  it("Legion Warboss: a hasty Goblin that must attack this combat, but not a later combat this turn", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, warboss, { sick: true });
    let s = settle(passUntil(s0, "beginCombat", ap));
    const goblin = s.battlefield.find((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Goblin"))!;
    expect(goblin).toBeDefined();
    expect(objHasKeyword(s, s.objects[goblin]!, "Haste")).toBe(true);
    expect(characteristics(s, s.objects[goblin]!).attacksIfAble).toBe(true);
    s = passUntil(s, "declareAttackers", ap);
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [] })).toThrow();
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: goblin, defender: opp }] });
    expect(s.objects[goblin]!.attacking).toBeDefined();
    // A second combat this turn: no longer required.
    s.combatsThisTurn = 2;
    invalidateCharacteristics(s);
    expect(characteristics(s, s.objects[goblin]!).attacksIfAble).toBeFalsy();
    expect(objHasKeyword(s, s.objects[goblin]!, "Haste")).toBe(true);
  });

  it("Moonsilver Key: offers artifact cards with a mana ability and basic lands, nothing else", () => {
    const { s: s0, ap } = setup([]);
    const k = putOnBattlefield(s0, ap, key);
    const r = putOnBattlefield(s0, ap, rock);
    const st = putOnBattlefield(s0, ap, statue);
    toLibraryTop(s0, ap, r);
    toLibraryTop(s0, ap, st);
    let s = activate(s0, ap, k, 0);
    expect(s.pending?.kind).toBe("searchLibrary");
    if (s.pending?.kind !== "searchLibrary") return;
    const names = new Set(s.pending.cards.map((id) => s.cards[s.objects[id]!.cardId]!.name));
    expect(names).toEqual(new Set(["Test Rock", "Forest"]));
    s = act(s, { type: "searchLibrary", player: ap, found: [r] });
    expect(s.objects[r]!.zone).toBe("hand");
    expect(s.objects[k]!.zone).toBe("graveyard");
  });
});
