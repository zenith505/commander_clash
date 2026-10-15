// Conspire (CR 702.78): "As an additional cost to cast this spell, you may tap two untapped creatures you control that
// each share a color with it" and "When you cast this spell, if its conspire cost was paid, copy it. If the spell has
// any targets, you may choose new targets for the copy."
// Gift (CR 702.174): "As an additional cost to cast this spell, you may choose an opponent." An instant or sorcery's
// gift happens before its other effects (702.174j); a permanent's when it enters (702.174k). "If the gift was promised".

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup, target } from "./helpers";
import { botActions, castProblem, conspireCandidates, controllerOf, nameOf, isFullySupported, objHasKeyword, planCast, waitingOn, type Action, type CardDef, type GameState } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const MANA_ONLY = /^not enough mana/;
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("can't do that");
  for (const a of plan) s = act(s, a);
  return s;
};
function settle(s: GameState) {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}
const named = (s: GameState, pid: number, name: string) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && nameOf(s, id).replace(/ Token$/, "") === name);

// Real oracle text (Scryfall).
const conspire = (newTarget: boolean) =>
  `Conspire (As you cast this spell, you may tap two untapped creatures you control that share a color with it. When you do, copy it${newTarget ? " and you may choose a new target for the copy" : ""}.)`;
const burnTrail = card("Burn Trail", "Sorcery", "{3}{R}", { keywords: ["Conspire"], oracleText: `Burn Trail deals 3 damage to any target.\n${conspire(true)}` });
const barkshell = card("Barkshell Blessing", "Instant", "{G/W}", { colors: ["G", "W"], keywords: ["Conspire"], oracleText: `Target creature gets +2/+2 until end of turn.\n${conspire(true)}` });
const ghastly = card("Ghastly Discovery", "Sorcery", "{2}{U}", { keywords: ["Conspire"], oracleText: `Draw two cards, then discard a card.\n${conspire(false)}` });
const crumb = card("Crumb and Get It", "Instant", "{W}", { keywords: ["Gift", "Food"], oracleText: 'Gift a Food (You may promise an opponent a gift as you cast this spell. If you do, they create a Food token before its other effects. It\'s an artifact with "{2}, {T}, Sacrifice this token: You gain 3 life.")\nTarget creature you control gets +2/+2 until end of turn. If the gift was promised, that creature also gains indestructible until end of turn.' });
const blooming = card("Blooming Blast", "Instant", "{1}{R}", { keywords: ["Gift", "Treasure"], oracleText: 'Gift a Treasure (You may promise an opponent a gift as you cast this spell. If you do, they create a Treasure token before its other effects. It\'s an artifact with "{T}, Sacrifice this token: Add one mana of any color.")\nBlooming Blast deals 2 damage to target creature. If the gift was promised, Blooming Blast also deals 3 damage to that creature\'s controller.' });
const kitnap = card("Kitnap", "Enchantment — Aura", "{2}{U}{U}", { keywords: ["Gift", "Enchant"], oracleText: "Gift a card (You may promise an opponent a gift as you cast this spell. If you do, when it enters, they draw a card.)\nEnchant creature\nWhen this Aura enters, tap enchanted creature. If the gift wasn't promised, put three stun counters on it.\nYou control enchanted creature." });
const scrapshooter = card("Scrapshooter", "Creature — Raccoon Archer", "{1}{G}{G}", { power: "4", toughness: "4", keywords: ["Reach", "Gift"], oracleText: "Gift a card (You may promise an opponent a gift as you cast this spell. If you do, when it enters, they draw a card.)\nReach\nWhen this creature enters, if the gift was promised, destroy target artifact or enchantment an opponent controls." });
const starforged = card("Starforged Sword", "Artifact — Equipment", "{4}", { keywords: ["Gift", "Equip"], oracleText: "Gift a tapped Fish (You may promise an opponent a gift as you cast this spell. If you do, when it enters, they create a tapped 1/1 blue Fish creature token.)\nWhen this Equipment enters, if the gift was promised, attach this Equipment to target creature you control.\nEquipped creature gets +3/+3 and loses flying.\nEquip {3}" });
const goblin = (name = "Goblin Test") => card(name, "Creature — Goblin", "{R}", { power: "1", toughness: "1" });
const giant = card("Hill Giant Test", "Creature — Giant", "{3}{R}", { power: "4", toughness: "4" });
const relic = card("Relic Test", "Artifact", "{2}");

describe("conspire", () => {
  it("parses", () => {
    supported(burnTrail, barkshell, ghastly);
  });

  it("only untapped creatures you control that share a color with the spell can be tapped, exactly two", () => {
    const { s, ap, opp, ids } = setup([burnTrail]);
    const g1 = putOnBattlefield(s, ap, goblin());
    const g2 = putOnBattlefield(s, ap, goblin(), { sick: true }); // not a {T} cost: summoning sickness doesn't matter
    const tapped = putOnBattlefield(s, ap, goblin());
    s.objects[tapped]!.tapped = true;
    const green = putOnBattlefield(s, ap, bear());
    putOnBattlefield(s, opp, goblin());
    expect(conspireCandidates(s, ap, ids[0]!).sort()).toEqual([g1, g2].sort());
    const t = [{ kind: "player" as const, id: opp }];
    expect(castProblem(s, ap, ids[0]!, t, undefined, undefined, undefined, undefined, { conspire: [g1] })).toMatch(/two/);
    expect(castProblem(s, ap, ids[0]!, t, undefined, undefined, undefined, undefined, { conspire: [g1, green] })).toMatch(/share a color/);
    expect(castProblem(s, ap, ids[0]!, t, undefined, undefined, undefined, undefined, { conspire: [g1, g2] })).toMatch(MANA_ONLY);
  });

  it("paid: a copy, with a new target if you like", () => {
    const { s: s0, ap, opp, ids } = setup([burnTrail]);
    const g1 = putOnBattlefield(s0, ap, goblin());
    const g2 = putOnBattlefield(s0, ap, goblin());
    const third = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, "auto", undefined, { conspire: [g1, g2] }));
    expect(s.objects[g1]!.tapped && s.objects[g2]!.tapped).toBe(true);
    expect(s.stack.find((i) => i.objectId === ids[0] && i.kind === "spell")?.conspired).toBe(true);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "copyTargets", player: ap });
    s = settle(act(s, { type: "copyTargets", player: ap, targets: [{ kind: "player", id: third }] }));
    expect(s.players[opp]!.life).toBe(37);
    expect(s.players[third]!.life).toBe(37);
  });

  it("not paid: no copy", () => {
    const { s: s0, ap, opp, ids } = setup([burnTrail]);
    putOnBattlefield(s0, ap, goblin());
    putOnBattlefield(s0, ap, goblin());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(s.pending).toBeFalsy();
    expect(s.players[opp]!.life).toBe(37);
  });

  it("a hybrid spell shares a color with a creature of either color", () => {
    const { s, ap, ids } = setup([barkshell]);
    const b = putOnBattlefield(s, ap, bear());
    const w = putOnBattlefield(s, ap, card("Soldier Test", "Creature — Soldier", "{W}", { power: "1", toughness: "1" }));
    putOnBattlefield(s, ap, goblin());
    expect(conspireCandidates(s, ap, ids[0]!).sort()).toEqual([b, w].sort());
  });

  it("a bot conspires with spare creatures", () => {
    const { s: s0, ap, ids } = setup([ghastly]);
    const blue = () => card("Merfolk Test", "Creature — Merfolk", "{U}", { power: "1", toughness: "1" });
    // Summoning sick, so they couldn't attack this turn anyway.
    const m1 = putOnBattlefield(s0, ap, blue(), { sick: true });
    const m2 = putOnBattlefield(s0, ap, blue(), { sick: true });
    for (const id of s0.players[ap]!.hand.filter((h) => h !== ids[0])) {
      s0.objects[id]!.zone = "library";
      s0.players[ap]!.library.push(id);
    }
    s0.players[ap]!.hand = [ids[0]!];
    let s = s0;
    for (let i = 0; i < 30 && s.stack.at(-1)?.objectId !== ids[0]; i++)
      if (s.stack.length || waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      else for (const x of botActions(s, ap)) s = act(s, x);
    expect(s.stack.at(-1)).toMatchObject({ objectId: ids[0], conspired: true });
    expect(s.objects[m1]!.tapped && s.objects[m2]!.tapped).toBe(true);
  });
});

describe("gift", () => {
  it("parses", () => {
    supported(crumb, blooming, kitnap, scrapshooter, starforged);
  });

  it("a gift is promised to an opponent", () => {
    const { s, ap, ids } = setup([blooming]);
    const g = putOnBattlefield(s, ap, giant);
    expect(castProblem(s, ap, ids[0]!, [target(g)], undefined, undefined, undefined, undefined, { gift: ap })).toMatch(/opponent/);
  });

  it("an instant's gift comes first, then 'if the gift was promised'", () => {
    const { s: s0, ap, opp, ids } = setup([blooming]);
    const g = putOnBattlefield(s0, opp, giant);
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(g)], undefined, "auto", undefined, { gift: opp }));
    expect(s.objects[ids[0]!]!.gift).toBe(opp);
    s = settle(s);
    expect(named(s, opp, "Treasure")).toHaveLength(1);
    expect(s.objects[g]!.damage).toBe(2);
    expect(s.players[opp]!.life).toBe(37);
    expect(s.objects[ids[0]!]!.gift).toBeUndefined(); // gone with the zone change

    const { s: s1, ap: ap1, opp: opp1, ids: ids1 } = setup([blooming]);
    const g1 = putOnBattlefield(s1, opp1, giant);
    s = settle(run(s1, planCast(s1, ap1, ids1[0]!, [target(g1)])));
    expect(s.battlefield.some((id) => nameOf(s, id) === "Treasure Token")).toBe(false);
    expect(s.players[opp1]!.life).toBe(40);
  });

  it("'also gains indestructible if the gift was promised'; the Food goes to the chosen opponent", () => {
    const { s: s0, ap, ids } = setup([crumb]);
    const b = putOnBattlefield(s0, ap, bear());
    const other = s0.turnOrder.find((p) => p !== ap)!;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(b)], undefined, "auto", undefined, { gift: other })));
    expect(named(s, other, "Food")).toHaveLength(1);
    expect(named(s, ap, "Food")).toHaveLength(0);
    expect(objHasKeyword(s, s.objects[b]!, "Indestructible")).toBe(true);
  });

  it("a permanent's gift happens when it enters, and 'when it enters, if the gift was promised' triggers", () => {
    const { s: s0, ap, opp, ids } = setup([scrapshooter]);
    const r = putOnBattlefield(s0, opp, relic);
    const hand = s0.players[opp]!.hand.length;
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { gift: opp }));
    for (let i = 0; i < 30 && (s.stack.length || s.triggerQueue.length); i++)
      s = s.pending?.kind === "chooseTargets" ? act(s, { type: "chooseTargets", player: ap, targets: [target(r)] }) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.players[opp]!.hand.length).toBe(hand + 1);
    expect(s.objects[r]!.zone).toBe("graveyard");

    const { s: s1, ap: ap1, opp: opp1, ids: ids1 } = setup([scrapshooter]);
    const r1 = putOnBattlefield(s1, opp1, relic);
    s = settle(run(s1, planCast(s1, ap1, ids1[0]!)));
    expect(s.objects[r1]!.zone).toBe("battlefield");
    expect(s.objects[ids1[0]!]!.zone).toBe("battlefield");
  });

  it("Kitnap: 'if the gift wasn't promised, put three stun counters on it'", () => {
    const { s: s0, ap, opp, ids } = setup([kitnap]);
    const g = putOnBattlefield(s0, opp, giant);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(g)])));
    expect(s.objects[g]!.tapped).toBe(true);
    expect(s.objects[g]!.counters.stun).toBe(3);

    const { s: s1, ap: ap1, opp: opp1, ids: ids1 } = setup([kitnap]);
    const g1 = putOnBattlefield(s1, opp1, giant);
    const hand = s1.players[opp1]!.hand.length;
    s = settle(run(s1, planCast(s1, ap1, ids1[0]!, [target(g1)], undefined, "auto", undefined, { gift: opp1 })));
    expect(s.objects[g1]!.tapped).toBe(true);
    expect(s.objects[g1]!.counters.stun).toBeUndefined();
    expect(s.players[opp1]!.hand.length).toBe(hand + 1);
  });

  it("Starforged Sword: a tapped Fish for them, and the Equipment attaches", () => {
    const { s: s0, ap, opp, ids } = setup([starforged]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { gift: opp }));
    for (let i = 0; i < 30 && (s.stack.length || s.triggerQueue.length); i++)
      s = s.pending?.kind === "chooseTargets" ? act(s, { type: "chooseTargets", player: ap, targets: [target(b)] }) : act(s, { type: "passPriority", player: waitingOn(s)! });
    const fish = named(s, opp, "Fish");
    expect(fish).toHaveLength(1);
    expect(s.objects[fish[0]!]!.tapped).toBe(true);
    expect(s.objects[ids[0]!]!.attachedTo).toBe(b);
  });
});
