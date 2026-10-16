// Demonstrate (CR 702.144a): "When you cast this spell, you may copy it and you may choose new targets for the copy. If
// you copy the spell, choose an opponent. That player copies the spell and may choose new targets for that copy."
// Their copy goes on the stack above yours, so it resolves first (rulings).
// Also "You gain life equal to that card's mana value" after returning a target card (Healing Technique, Razor Hippogriff).

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup } from "./helpers";
import { botActions, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const DEMO = "Demonstrate (When you cast this spell, you may copy it. If you do, choose an opponent to also copy it. Players may choose new targets for their copies.)";
const excavation = card("Excavation Technique", "Sorcery", "{3}{W}", { keywords: ["Demonstrate"], oracleText: `${DEMO}\nDestroy target nonland permanent. Its controller creates two Treasure tokens.` });
const healing = card("Healing Technique", "Sorcery", "{3}{G}", { keywords: ["Demonstrate"], oracleText: `${DEMO}\nReturn target card from your graveyard to your hand. You gain life equal to that card's mana value. Exile Healing Technique.` });
const replication = card("Replication Technique", "Sorcery", "{4}{U}", { keywords: ["Demonstrate"], oracleText: `${DEMO}\nCreate a token that's a copy of target permanent you control.` });
const hippogriff = card("Razor Hippogriff", "Creature — Hippogriff", "{3}{W}{W}", { power: "3", toughness: "3", keywords: ["Flying"], oracleText: "Flying\nWhen this creature enters, return target artifact card from your graveyard to your hand. You gain life equal to that card's mana value." });
const relic = card("Test Relic", "Artifact", "{4}", { oracleText: "" });

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
function inYard(s: GameState, pid: PlayerId, def: CardDef) {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  return id;
}
const treasures = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name === "Treasure Token").length;

describe("demonstrate", () => {
  it("parses", () => {
    for (const c of [excavation, healing, replication, hippogriff]) expect(isFullySupported(c)).toBe(true);
  });

  it("Excavation Technique: you copy it, then the opponent you choose copies it too, and theirs resolves first", () => {
    const { s: s0, ap, ids, opp } = setup([excavation]);
    const opp2 = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    const a = putOnBattlefield(s0, opp, bear());
    const b = putOnBattlefield(s0, opp2, bear());
    const mine = putOnBattlefield(s0, ap, bear());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: a }])));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    // Our copy: a new target.
    expect(s.pending).toMatchObject({ kind: "copyTargets", player: ap });
    s = act(s, { type: "copyTargets", player: ap, targets: [{ kind: "object", id: b }] });
    // Which opponent copies it too.
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "demonstrate" });
    if (s.pending?.kind !== "chooseOption") return;
    expect(s.pending.options).toHaveLength(3);
    s = act(s, { type: "chooseOption", player: ap, choice: String(opp) });
    // Their copy: they choose its new targets, knowing ours.
    expect(s.pending).toMatchObject({ kind: "copyTargets", player: opp });
    s = act(s, { type: "copyTargets", player: opp, targets: [{ kind: "object", id: mine }] });
    expect(s.stack.map((x) => x.controller)).toEqual([ap, ap, opp]); // original, our copy, their copy on top
    s = settle(s);
    for (const id of [a, b, mine]) expect(s.objects[id]!.zone).toBe("graveyard");
    expect(treasures(s, opp)).toBe(2);
    expect(treasures(s, opp2)).toBe(2);
    expect(treasures(s, ap)).toBe(2);
  });

  it("not copying it: no opponent copies it either (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([excavation]);
    const a = putOnBattlefield(s0, opp, bear());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: a }])));
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.pending).toBeFalsy();
    expect(s.stack).toHaveLength(0);
    expect(s.objects[a]!.zone).toBe("graveyard");
    expect(s.log.filter((e) => /copies Excavation Technique/.test(e.text))).toHaveLength(0);
  });

  it("Healing Technique: gain life equal to the returned card's mana value; the card is exiled", () => {
    const { s: s0, ap, ids } = setup([healing]);
    const r = inYard(s0, ap, relic);
    const life = s0.players[ap]!.life;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: r }])));
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.objects[r]!.zone).toBe("hand");
    expect(s.players[ap]!.life).toBe(life + 4);
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
  });

  it("Razor Hippogriff: the returned artifact card's mana value", () => {
    const { s: s0, ap, ids } = setup([hippogriff]);
    const r = inYard(s0, ap, relic);
    const life = s0.players[ap]!.life;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 20 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: r }] }));
    expect(s.objects[r]!.zone).toBe("hand");
    expect(s.players[ap]!.life).toBe(life + 4);
  });

  it("bots copy it and pick the opponent with the least on the battlefield", () => {
    const { s: s0, ap, ids, opp } = setup([replication]);
    const mine = putOnBattlefield(s0, ap, bear());
    for (const pid of s0.turnOrder) if (pid !== ap && pid !== opp) putOnBattlefield(s0, pid, bear());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: mine }])));
    expect(botActions(s, ap)).toEqual([{ type: "chooseMay", player: ap, yes: true }]);
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    for (let i = 0; i < 3 && s.pending?.kind === "copyTargets"; i++) s = run(s, botActions(s, s.pending.player));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "demonstrate" });
    // Every opponent has as many lands as the others; `opp` has no bear.
    const counts = s.turnOrder.filter((p) => p !== ap).map((p) => s.battlefield.filter((id) => s.objects[id]!.controller === p).length);
    expect(Math.min(...counts)).toBe(s.battlefield.filter((id) => s.objects[id]!.controller === opp).length);
    expect(botActions(s, ap)).toEqual([{ type: "chooseOption", player: ap, choice: String(opp) }]);
  });
});

describe("that card's mana value, power or toughness", () => {
  const reanimate = card("Reanimate", "Sorcery", "{B}", { oracleText: "Put target creature card from a graveyard onto the battlefield under your control. You lose life equal to that card's mana value." });
  const maggot = card("Rotfeaster Maggot", "Creature — Insect", "{4}{B}", { power: "3", toughness: "5", oracleText: "When this creature enters, exile target creature card from a graveyard. You gain life equal to that card's toughness." });
  const big = card("Big Thing", "Creature — Beast", "{5}{G}", { power: "4", toughness: "7" });

  it("parses", () => expect(isFullySupported(reanimate) && isFullySupported(maggot)).toBe(true));

  it("Reanimate: the mana value of the card put onto the battlefield", () => {
    const { s: s0, ap, ids, opp } = setup([reanimate]);
    const t = inYard(s0, opp, big);
    const life = s0.players[ap]!.life;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: t }])));
    expect(s.objects[t]!.zone).toBe("battlefield");
    expect(s.objects[t]!.controller).toBe(ap);
    expect(s.players[ap]!.life).toBe(life - 6);
  });

  it("Rotfeaster Maggot: the exiled card's toughness", () => {
    const { s: s0, ap, ids, opp } = setup([maggot]);
    const t = inYard(s0, opp, big);
    const life = s0.players[ap]!.life;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 20 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: t }] }));
    expect(s.objects[t]!.zone).toBe("exile");
    expect(s.players[ap]!.life).toBe(life + 7);
  });
});
