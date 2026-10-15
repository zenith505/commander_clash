// Start your engines! (CR 702.179), max speed (702.178), and "Exile this card from your graveyard" costs.

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, manaAbilityProblem, objHasKeyword, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, actions: Action[] | null) => {
  if (!actions) throw new Error("no plan");
  return actions.reduce((x, a) => act(x, a), s);
};
const castNow = (s: GameState, pid: PlayerId, id: string, targets?: TargetChoice[]) => settle(run(s, planCast(s, pid, id, targets, undefined, "auto")));
const toYard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  return id;
};

// Real oracle text (Scryfall), with the keywords Scryfall lists.
const reminder = "Start your engines! (If you have no speed, it starts at 1. It increases once on each of your turns when an opponent loses life. Max speed is 4.)";
const burnoutBashtronaut = card("Burnout Bashtronaut", "Creature — Goblin Warrior", "{R}", { power: "1", toughness: "1", keywords: ["Max speed", "Menace", "Start your engines!"], oracleText: `Menace\n${reminder}\n{2}: This creature gets +1/+0 until end of turn.\nMax speed — This creature has double strike.` });
const endriderCatalyzer = card("Endrider Catalyzer", "Creature — Human Warrior", "{1}{R}", { power: "3", toughness: "1", keywords: ["Max speed", "Start your engines!"], oracleText: `${reminder}\nMax speed — {T}: Add {R}{R}.` });
const aetherSyphon = card("Aether Syphon", "Artifact", "{1}{U}{U}", { keywords: ["Max speed", "Mill", "Start your engines!"], oracleText: `${reminder}\n{2}, {T}: Draw a card.\nMax speed — Whenever you draw a card, each opponent mills two cards. (Each opponent puts the top two cards of their library into their graveyard.)` });
const leoninSurveyor = card("Leonin Surveyor", "Creature — Cat Scout", "{1}{W}", { power: "2", toughness: "2", keywords: ["Max speed", "Start your engines!"], oracleText: `${reminder}\nDuring your turn, this creature has first strike.\nMax speed — {3}, Exile this card from your graveyard: Draw a card.` });
const dauntlessCathar = card("Dauntless Cathar", "Creature — Human Soldier", "{2}{W}", { power: "3", toughness: "2", oracleText: "{1}{W}, Exile this card from your graveyard: Create a 1/1 white Spirit creature token with flying. Activate only as a sorcery." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });

describe("start your engines!", () => {
  it("gives speed 1, which goes up once on each of your turns when an opponent loses life (CR 702.179a, d)", () => {
    supported(burnoutBashtronaut, endriderCatalyzer, aetherSyphon, leoninSurveyor);
    const { s: s0, ap, ids, opp } = setup([burnoutBashtronaut, shock, shock]);
    expect(s0.players[ap]!.speed).toBeUndefined();
    let s = castNow(s0, ap, ids[0]!);
    expect(s.players[ap]!.speed).toBe(1);
    s = castNow(s, ap, ids[1]!, [{ kind: "player", id: opp }]);
    expect(s.players[ap]!.speed).toBe(2);
    expect(s.log.some((e) => /speed increases to 2/.test(e.text))).toBe(true);
    // Only once each turn.
    s = castNow(s, ap, ids[2]!, [{ kind: "player", id: opp }]);
    expect(s.players[ap]!.speed).toBe(2);
  });

  it("not on another player's turn, and never past 4", () => {
    const { s: s0, ap, ids, opp } = setup([shock, shock]);
    putOnBattlefield(s0, ap, burnoutBashtronaut);
    let s = passUntil(s0, "upkeep", opp);
    while (waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = castNow(s, ap, ids[0]!, [{ kind: "player", id: opp }]);
    expect(s.players[ap]!.speed).toBe(1);
    s = passUntil(s, "main1", ap);
    s.players[ap]!.speed = 4;
    s = castNow(s, ap, ids[1]!, [{ kind: "player", id: opp }]);
    expect(s.players[ap]!.speed).toBe(4);
    expect(s.stack).toHaveLength(0);
  });
});

describe("max speed", () => {
  it("a static ability: double strike only at speed 4 (CR 702.178a)", () => {
    const { s: s0, ap, ids, opp } = setup([shock]);
    const b = putOnBattlefield(s0, ap, burnoutBashtronaut);
    let s = act(s0, { type: "passPriority", player: ap }); // state-based actions: speed 1
    while (waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(objHasKeyword(s, s.objects[b]!, "Double strike")).toBe(false);
    s.players[ap]!.speed = 3;
    s = castNow(s, ap, ids[0]!, [{ kind: "player", id: opp }]);
    expect(s.players[ap]!.speed).toBe(4);
    expect(objHasKeyword(s, s.objects[b]!, "Double strike")).toBe(true);
  });

  it("a mana ability and a triggered ability exist only at max speed", () => {
    const { s: s0, ap } = setup([]);
    const cat = putOnBattlefield(s0, ap, endriderCatalyzer);
    const syphon = putOnBattlefield(s0, ap, aetherSyphon);
    let s = act(s0, { type: "passPriority", player: ap }); // state-based actions: speed 1
    while (waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.players[ap]!.speed).toBe(1);
    expect(manaAbilityProblem(s, ap, s.objects[cat]!, 0)).not.toBeNull();
    const opps = s.turnOrder.filter((p) => p !== ap);
    const yards = () => opps.map((p) => s.players[p]!.graveyard.length);
    s = settle(run(s, planActivate(s, ap, syphon, 0)));
    expect(yards()).toEqual([0, 0, 0]);
    s.players[ap]!.speed = 4;
    s.objects[syphon]!.tapped = false;
    expect(manaAbilityProblem(s, ap, s.objects[cat]!, 0)).toBeNull();
    s = settle(run(s, planActivate(s, ap, syphon, 0)));
    expect(yards()).toEqual([2, 2, 2]);
  });

  it("an ability that works from the graveyard, and exiles the card as its cost", () => {
    supported(dauntlessCathar);
    const { s: s0, ap } = setup([]);
    const surveyor = toYard(s0, ap, leoninSurveyor);
    const cathar = toYard(s0, ap, dauntlessCathar);
    s0.players[ap]!.speed = 1;
    expect(planActivate(s0, ap, surveyor, 0)).toBeNull();
    let s = settle(run(s0, planActivate(s0, ap, cathar, 0)));
    expect(s.objects[cathar]!.zone).toBe("exile");
    expect(s.battlefield.some((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap)).toBe(true);
    s.players[ap]!.speed = 4;
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planActivate(s, ap, surveyor, 0)));
    expect(s.objects[surveyor]!.zone).toBe("exile");
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });
});
