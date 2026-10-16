// Class enchantments (CR 716): a Class starts at level 1 (716.2d); its level abilities ("{cost}: Level N") are
// activated only as a sorcery and only when it's level N-1 (716.2a); the class abilities of a level work only while it's
// that level or higher (716.2c); a Class that leaves the battlefield and comes back is a new object at level 1 (400.7).

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, cast, island, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilityProblem, botActions, isFullySupported, objHasKeyword, power, planActivate, planCast, topPlayable, topVisible, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const pid = waitingOn(s)!;
    s = act(s, s.pending ? botActions(s, pid)[0]! : { type: "passPriority", player: pid });
  }
  return s;
};
const notNow = /can't be activated now/;
const onTop = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  return id;
};

// Real oracle text (Scryfall).
const wizardClass = card("Wizard Class", "Enchantment — Class", "{U}", { oracleText: "(Gain the next level as a sorcery to add its ability.)\nYou have no maximum hand size.\n{2}{U}: Level 2\nWhen this Class becomes level 2, draw two cards.\n{4}{U}: Level 3\nWhenever you draw a card, put a +1/+1 counter on target creature you control." });
const rangerClass = card("Ranger Class", "Enchantment — Class", "{1}{G}", { oracleText: "(Gain the next level as a sorcery to add its ability.)\nWhen this Class enters, create a 2/2 green Wolf creature token.\n{1}{G}: Level 2\nWhenever you attack, put a +1/+1 counter on target attacking creature.\n{3}{G}: Level 3\nYou may look at the top card of your library any time.\nYou may cast creature spells from the top of your library." });
const huntersTalent = card("Hunter's Talent", "Enchantment — Class", "{1}{G}", { oracleText: "(Gain the next level as a sorcery to add its ability.)\nWhen this Class enters, target creature you control deals damage equal to its power to target creature you don't control.\n{1}{G}: Level 2\nWhenever you attack, target attacking creature gets +1/+0 and gains trample until end of turn.\n{3}{G}: Level 3\nAt the beginning of your end step, if you control a creature with power 4 or greater, draw a card." });
const boomerang = card("Boomerang", "Instant", "{U}{U}", { oracleText: "Return target permanent to its owner's hand." });
const divination = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });

describe("Class levels", () => {
  it("parses", () => supported(wizardClass, rangerClass, huntersTalent));

  it("Wizard Class: level 2 draws two; level 3 puts a counter for each card drawn", () => {
    const { s: s0, ap } = setup([]);
    const w = putOnBattlefield(s0, ap, wizardClass);
    const b = putOnBattlefield(s0, ap, bear());
    // Level 3 can't be skipped to.
    expect(abilityProblem(s0, ap, w, 1)).toMatch(notNow);
    const hand = s0.players[ap]!.hand.length;
    let s = settle(activate(s0, ap, w, 0));
    expect(s.objects[w]!.classLevel).toBe(2);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(s.objects[b]!.counters["+1/+1"] ?? 0).toBe(0); // the draw trigger is level 3's
    // Level 2 can't be gained again.
    expect(abilityProblem(s, ap, w, 0)).toMatch(notNow);
    s = settle(activate(s, ap, w, 1));
    expect(s.objects[w]!.classLevel).toBe(3);
    expect(s.players[ap]!.hand.length).toBe(hand + 2); // becoming level 3 doesn't draw
    expect(abilityProblem(s, ap, w, 1)).toMatch(notNow);
    // Two draws, two counters (on the only creature).
    const d = putOnBattlefield(s, ap, divination);
    s.battlefield.splice(s.battlefield.indexOf(d), 1);
    s.objects[d]!.zone = "hand";
    s.players[ap]!.hand.push(d);
    s = settle(cast(s, ap, d));
    expect(s.objects[b]!.counters["+1/+1"]).toBe(2);
  });

  it("level abilities are sorcery-speed", () => {
    const { s: s0, ap, ids } = setup([divination]);
    const w = putOnBattlefield(s0, ap, wizardClass);
    expect(planActivate(s0, ap, w, 0)).toBeTruthy();
    // With a spell on the stack, not even its controller can.
    let s = s0;
    for (const a of planCast(s0, ap, ids[0]!)!) s = act(s, a);
    expect(s.stack).toHaveLength(1);
    expect(waitingOn(s)).toBe(ap);
    expect(abilityProblem(s, ap, w, 0)).toMatch(/sorcery/);
    expect(planActivate(s, ap, w, 0)).toBeFalsy();
  });

  it("a Class that leaves and comes back is level 1 again", () => {
    const { s: s0, ap, ids } = setup([boomerang]);
    const w = putOnBattlefield(s0, ap, wizardClass);
    for (let i = 0; i < 6; i++) putOnBattlefield(s0, ap, island);
    let s = settle(activate(s0, ap, w, 0));
    expect(s.objects[w]!.classLevel).toBe(2);
    s = settle(cast(s, ap, ids[0]!, [{ kind: "object", id: w }]));
    expect(s.objects[w]!.zone).toBe("hand");
    expect(s.objects[w]!.classLevel).toBeUndefined();
    s = settle(cast(s, ap, w));
    expect(s.objects[w]!.zone).toBe("battlefield");
    expect(abilityProblem(s, ap, w, 1)).toMatch(notNow);
    expect(planActivate(s, ap, w, 0)).toBeTruthy();
  });

  it("Ranger Class: a Wolf on entering; level 3 looks at and casts creatures from the top", () => {
    const { s: s0, ap, ids } = setup([rangerClass]);
    let s = settle(cast(s0, ap, ids[0]!));
    expect(s.battlefield.some((id) => s.cards[s.objects[id]!.cardId]!.name === "Wolf Token")).toBe(true);
    const r = ids[0]!;
    const top = onTop(s, ap, bear());
    expect(topVisible(s, ap, ap)).toBe(false);
    s = settle(activate(s, ap, r, 0));
    expect(topVisible(s, ap, ap)).toBe(false);
    expect(topPlayable(s, ap)).toEqual([]);
    s = settle(activate(s, ap, r, 1));
    expect(topVisible(s, ap, ap)).toBe(true);
    expect(topPlayable(s, ap)).toEqual([top]);
  });

  it("Hunter's Talent: the level 2 attack trigger only once it's level 2", () => {
    const { s: s0, ap, opp } = setup([]);
    const h = putOnBattlefield(s0, ap, huntersTalent);
    const b = putOnBattlefield(s0, ap, bear());
    const attack = (s: GameState) => {
      s = passUntil(s, "declareAttackers", ap);
      s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
      return settle(s);
    };
    let s = attack(s0);
    expect(power(s, s.objects[b]!)).toBe(2);
    expect(objHasKeyword(s, s.objects[b]!, "Trample")).toBe(false);
    // Next turn, at level 2.
    s = passUntil(passUntil(s, "end"), "main1", ap, 8000);
    s = settle(activate(s, ap, h, 0));
    expect(s.objects[h]!.classLevel).toBe(2);
    s = attack(s);
    expect(power(s, s.objects[b]!)).toBe(3);
    expect(objHasKeyword(s, s.objects[b]!, "Trample")).toBe(true);
  });

  it("a bot gains the next level with mana to spare (after its spells, in its second main phase)", () => {
    const { s: s0, ap } = setup([]);
    const w = putOnBattlefield(s0, ap, wizardClass);
    let s = s0;
    for (let i = 0; i < 200 && s.objects[w]!.classLevel === undefined && s.step !== "end"; i++) s = act(s, botActions(s, waitingOn(s)!)[0]!);
    expect(s.objects[w]!.classLevel).toBe(2);
  });
});
