// "Any number of target creatures" and "up to X target artifacts": how many targets is chosen as the spell is cast or
// the ability is put on the stack (CR 601.2c), from none (115.6) to as many as there are, never the same one twice
// (115.3), and no more than X for "up to X". Strive's "costs {2}{G} more to cast for each target beyond the first" is
// then an additional cost (CR 601.2f; rulings: paid even when cast without paying its mana cost).

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup, target } from "./helpers";
import { botActions, compileCard, objHasKeyword, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("can't do that");
  for (const a of plan) s = act(s, a);
  return s;
};
function settle(s: GameState) {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}
const none: TargetChoice = { kind: "none" };
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;

// Real oracle text (Scryfall).
const consign = card("Consign to Dust", "Instant", "{2}{G}", { keywords: ["Strive"], oracleText: "Strive — This spell costs {2}{G} more to cast for each target beyond the first.\nDestroy any number of target artifacts and/or enchantments." });
const scapegoat = card("Scapegoat", "Instant", "{W}", { oracleText: "As an additional cost to cast this spell, sacrifice a creature.\nReturn any number of target creatures you control to their owner's hand." });
const klauth = card("Klauth's Will", "Instant", "{X}{R}{R}{G}", { oracleText: "Choose one. If you control a commander as you cast this spell, you may choose both instead.\n• Breathe Flame — Klauth's Will deals X damage to each creature without flying.\n• Smash Relics — Destroy up to X target artifacts and/or enchantments." });
const resilience = card("Divine Resilience", "Instant", "{W}", { keywords: ["Kicker"], oracleText: 'Kicker {2}{W} (You may pay an additional {2}{W} as you cast this spell.)\nTarget creature you control gains indestructible until end of turn. If this spell was kicked, instead any number of target creatures you control gain indestructible until end of turn. (Damage and effects that say "destroy" don\'t destroy them.)' });
const guardian = card("Guardian of Faith", "Creature — Spirit Knight", "{1}{W}{W}", { power: "3", toughness: "2", keywords: ["Vigilance", "Flash"], oracleText: "Flash\nVigilance\nWhen this creature enters, any number of other target creatures you control phase out. (Treat them and anything attached to them as though they don't exist until their controller's next turn.)" });
const rouse = card("Rouse the Mob", "Instant", "{R}", { keywords: ["Strive"], oracleText: "Strive — This spell costs {2}{R} more to cast for each target beyond the first.\nAny number of target creatures each get +2/+0 and gain trample until end of turn." });
const gravepurge = card("Gravepurge", "Instant", "{2}{B}", { oracleText: "Put any number of target creature cards from your graveyard on top of your library.\nDraw a card." });
const relic = card("Relic", "Artifact", "{1}");
const charm = card("Charm", "Enchantment", "{1}");

describe("any number of targets", () => {
  it("parses as one target entry standing for all of them", () => {
    supported(consign, scapegoat, klauth, resilience, guardian, rouse, gravepurge);
    expect(compileCard(consign).spell!.targets).toMatchObject([{ many: "any" }]);
    expect(compileCard(klauth).spell!.modal!.modes[1]!.targets).toMatchObject([{ many: "x" }]);
    expect(compileCard(consign).strive).toBe("{2}{G}");
  });

  it("Scapegoat: as many of your creatures as you like, each returned; none twice, none of anyone else's", () => {
    const { s: s0, ap, opp, ids } = setup([scapegoat]);
    const [a, b, c, fodder] = [0, 1, 2, 3].map(() => putOnBattlefield(s0, ap, bear()));
    const theirs = putOnBattlefield(s0, opp, bear());
    const sac = { sacrifice: [fodder!] };
    expect(planCast(s0, ap, ids[0]!, [target(a!), target(theirs)], undefined, "auto", undefined, sac)).toBeNull();
    expect(planCast(s0, ap, ids[0]!, [target(a!), target(a!)], undefined, "auto", undefined, sac)).toBeNull();
    // Left-out choices (as the screen offers one for each creature) are dropped: three targets.
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(a!), none, target(b!), target(c!), none], undefined, "auto", undefined, sac)));
    expect([a, b, c].map((id) => zone(s, id!))).toEqual(["hand", "hand", "hand"]);
    expect(zone(s, fodder!)).toBe("graveyard");
    expect(zone(s, theirs)).toBe("battlefield");
  });

  it("can be cast with no targets at all (CR 115.6)", () => {
    const { s: s0, ap, ids } = setup([consign]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [])));
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(s.players[ap]!.manaPool).toMatchObject({ G: 0 });
  });

  it("Consign to Dust: strive's {2}{G} for each target beyond the first", () => {
    const { s: s0, ap, opp, ids } = setup([consign]);
    const [x, y, z] = [relic, charm, relic].map((d) => putOnBattlefield(s0, opp, d));
    const untapped = (s: GameState) => s.battlefield.filter((id) => s.objects[id]!.controller === ap && !s.objects[id]!.tapped).length;
    const before = untapped(s0);
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(x!), target(y!), target(z!)]));
    expect(before - untapped(s)).toBe(9); // {2}{G} + 2 × {2}{G}
    s = settle(s);
    expect([x, y, z].map((id) => zone(s, id!))).toEqual(["graveyard", "graveyard", "graveyard"]);
    // Two forests: the third target's {G} can't be paid.
    const { s: s1, ap: ap1, opp: opp1, ids: ids1 } = setup([consign]);
    const t = [relic, charm, relic].map((d) => putOnBattlefield(s1, opp1, d));
    s1.objects[s1.battlefield.find((id) => s1.objects[id]!.controller === ap1 && s1.cards[s1.objects[id]!.cardId]!.name === "Forest")!]!.tapped = true;
    expect(planCast(s1, ap1, ids1[0]!, t.map((id) => target(id)))).toBeNull();
    expect(planCast(s1, ap1, ids1[0]!, t.slice(0, 2).map((id) => target(id)))).not.toBeNull();
  });

  it("Klauth's Will: up to X targets, no more", () => {
    const { s: s0, ap, opp, ids } = setup([klauth]);
    const [x, y, z] = [relic, charm, relic].map((d) => putOnBattlefield(s0, opp, d));
    expect(planCast(s0, ap, ids[0]!, [target(x!), target(y!), target(z!)], [1], "auto", 2)).toBeNull();
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(x!), target(y!)], [1], "auto", 2)));
    expect([x, y, z].map((id) => zone(s, id!))).toEqual(["graveyard", "graveyard", "battlefield"]);
  });

  it("Divine Resilience: one target unless kicked, then any number", () => {
    const { s: s0, ap, ids } = setup([resilience]);
    const [a, b] = [0, 1].map(() => putOnBattlefield(s0, ap, bear()));
    expect(planCast(s0, ap, ids[0]!, [target(a!), target(b!)])).toBeNull();
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [none, target(a!), target(b!)], undefined, "auto", undefined, { kicks: [0] })));
    for (const id of [a!, b!]) expect(objHasKeyword(s, s.objects[id]!, "Indestructible")).toBe(true);
  });

  it("Guardian of Faith: its enters trigger takes any number of your other creatures, not itself", () => {
    const { s: s0, ap, opp, ids } = setup([guardian]);
    const [a, b] = [0, 1].map(() => putOnBattlefield(s0, ap, bear()));
    const theirs = putOnBattlefield(s0, opp, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [target(ids[0]!)] })).toThrow();
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [target(theirs)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(a!), none, target(b!)] }));
    expect([a!, b!, ids[0]!].map((id) => zone(s, id))).toEqual(["phasedOut", "phasedOut", "battlefield"]);
  });

  it("Gravepurge: the chosen creature cards from your graveyard go on top, then you draw one", () => {
    const { s: s0, ap, ids } = setup([gravepurge]);
    const [a, b] = [0, 1].map((): ObjectId => {
      const id = putOnBattlefield(s0, ap, bear());
      s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
      s0.objects[id]!.zone = "graveyard";
      s0.players[ap]!.graveyard.push(id);
      return id;
    }) as [ObjectId, ObjectId];
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(a), target(b)])));
    // Its owner puts the two in the order they like (CR 401.4), then draws.
    expect(s.pending).toMatchObject({ kind: "orderLibrary", player: ap });
    s = settle(act(s, { type: "orderLibrary", player: ap, order: [b, a] }));
    expect(zone(s, b)).toBe("hand");
    const lib = s.players[ap]!.library;
    const drawn = [a, b].filter((id) => zone(s, id) === "hand");
    expect(drawn).toHaveLength(1);
    expect([a, b].filter((id) => zone(s, id) === "library" && lib.indexOf(id) === 0)).toHaveLength(1);
  });

  it("a bot pays strive for only as many targets as it can afford", () => {
    const { s: s0, ap, opp, ids } = setup([consign]);
    const theirs = [relic, charm, relic, charm, relic].map((d) => putOnBattlefield(s0, opp, d));
    // A Forest and two Mountains untapped: {2}{G} once, no more.
    const lands = s0.battlefield.filter((id) => s0.objects[id]!.controller === ap && /Land/.test(s0.cards[s0.objects[id]!.cardId]!.typeLine));
    for (const id of lands) s0.objects[id]!.tapped = true;
    const named = (n: string) => lands.filter((id) => s0.cards[s0.objects[id]!.cardId]!.name === n);
    for (const id of [named("Forest")[0]!, ...named("Mountain").slice(0, 2)]) s0.objects[id]!.tapped = false;
    let s = s0;
    for (let i = 0; i < 6 && s.players[ap]!.hand.includes(ids[0]!); i++) for (const a of botActions(s, ap)) s = act(s, a);
    expect(s.players[ap]!.hand).not.toContain(ids[0]!);
    s = settle(s);
    expect(theirs.filter((id) => zone(s, id) === "graveyard")).toHaveLength(1);
  });
});
