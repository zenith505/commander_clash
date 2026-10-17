// Abilities effects give to other objects (layer 6, CR 613.1f): 'Enchanted creature has "{T}: This creature
// deals 1 damage to any target."', 'Creatures you control have "{T}: Add one mana of any color."', 'Until
// end of turn, target creature gains "When this creature dies, ..."', and backup (CR 702.165).

import { describe, expect, it } from "vitest";
import { act, addEffect, bear, card, passAll, passUntil, putOnBattlefield, setup, target } from "./helpers";
import {
  abilitiesOf,
  castingBody,
  harmfulTargets,
  invalidateCharacteristics,
  isFullySupported,
  manaAbilitiesOn,
  objHasKeyword,
  planActivate,
  planCast,
  waitingOn,
  type Action,
  type CardDef,
  type GameState,
} from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.oracleText).toBe(true));
const unsupported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.oracleText).toBe(false));
const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return settle(plan!.reduce((x, a) => act(x, a), s));
};
const aura = (name: string, text: string) => card(name, "Enchantment — Aura", "{R}", { oracleText: `Enchant creature\n${text}`, keywords: ["Enchant"] });
const creature = (name: string, text: string, p = "2", t = "2") => card(name, "Creature — Soldier", "{1}{W}", { power: p, toughness: t, oracleText: text });

const study = aura("Study Test", 'Enchanted creature has "{T}: This creature deals 1 damage to any target."');
const rite = card("Rite Test", "Enchantment", "{1}{G}", { oracleText: 'Creatures you control have "{T}: Add one mana of any color."' });
const rebirth = card("Rebirth Test", "Instant", "{1}{G}", { oracleText: 'Until end of turn, target creature gains "When this creature dies, return it to its owner\'s hand."\nDraw a card.' });
const end = aura("End Test", 'Enchanted creature has "At the beginning of your upkeep, sacrifice a creature."');
const kitesail = card("Kitesail Test", "Artifact — Equipment", "{1}", {
  oracleText: 'Equipped creature gets +1/+0 and has flying and "Whenever this creature attacks, you gain 1 life."\nEquip {2}',
});
const slinger = creature("Slinger Test", "Backup 1\nFlying\nWhenever this creature attacks, you gain 2 life.");
const kill = card("Kill Test", "Instant", "{B}", { oracleText: "Destroy target creature." });

describe("granted abilities", () => {
  it("compiles keywords and quoted abilities after has, have and gains", () => {
    supported(study, rite, rebirth, end, kitesail, slinger);
    // The granting card's own name in the quote is that card (CR 201.5a), not the creature: not modeled.
    unsupported(card("Dagger Test", "Artifact — Equipment", "{1}", { oracleText: 'Equipped creature has "Whenever this creature attacks, you may sacrifice Dagger Test."\nEquip {1}' }));
    // A static ability given away that changes abilities would have to come out of the same layer calculation that grants
    // it (layer 6); ones whose effects come in later layers work (background-grants.test.ts).
    unsupported(aura("Static Test", 'Enchanted creature has "Other creatures you control have flying."'));
    supported(aura("Static Test 2", 'Enchanted creature has "This creature can\'t block."'));
  });

  it("the enchanted creature can activate it, and the creature is the source of the damage", () => {
    const { s: s0, ap, ids, opp } = setup([study]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(b)]));
    s = settle(passAll(s));
    expect(abilitiesOf(s, s.objects[b]!).activated).toHaveLength(1);
    const life = s.players[opp]!.life;
    s = run(s, planActivate(s, ap, b, 0, [{ kind: "player", id: opp }]));
    s = settle(passAll(s));
    expect(s.players[opp]!.life).toBe(life - 1);
    expect(s.log.some((l) => /Grizzly Bears deals 1 damage/.test(l.text))).toBe(true);
    expect(s.objects[b]!.tapped).toBe(true);
  });

  it("a creature that just came under your control can't use a granted {T} ability (CR 302.6)", () => {
    const { s, ap } = setup([]);
    const sick = putOnBattlefield(s, ap, bear(), { sick: true });
    const st = putOnBattlefield(s, ap, study);
    s.objects[st]!.attachedTo = sick;
    invalidateCharacteristics(s);
    expect(planActivate(s, ap, sick, 0, [{ kind: "player", id: ap }])).toBeNull();
  });

  it("granted mana abilities make mana; losing all abilities removes earlier grants only (CR 613.7)", () => {
    const { s, ap } = setup([]);
    const b = putOnBattlefield(s, ap, bear());
    putOnBattlefield(s, ap, rite);
    expect(manaAbilitiesOn(s, s.objects[b]!)).toHaveLength(1);
    addEffect(s, ap, [b], [{ kind: "loseAllAbilities" }]);
    expect(manaAbilitiesOn(s, s.objects[b]!)).toHaveLength(0);
    addEffect(s, ap, [b], [{ kind: "addAbility", text: "{T}: Add {G}." }]);
    expect(manaAbilitiesOn(s, s.objects[b]!)).toHaveLength(1);
  });

  it("a dies ability gained until end of turn still triggers: it looks back in time (CR 603.10a)", () => {
    const { s: s0, ap, ids } = setup([rebirth, kill]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = settle(passAll(run(s0, planCast(s0, ap, ids[0]!, [target(b)]))));
    expect(abilitiesOf(s, s.objects[b]!).triggers).toHaveLength(1);
    s = settle(passAll(run(s, planCast(s, ap, ids[1]!, [target(b)]))));
    s = settle(passAll(s));
    expect(s.players[ap]!.hand).toContain(b);
  });

  it("equipment: flying and a quoted attack trigger", () => {
    const { s, ap } = setup([]);
    const b = putOnBattlefield(s, ap, bear());
    const k = putOnBattlefield(s, ap, kitesail);
    s.objects[k]!.attachedTo = b;
    invalidateCharacteristics(s);
    expect(objHasKeyword(s, s.objects[b]!, "Flying")).toBe(true);
    expect(abilitiesOf(s, s.objects[b]!).triggers.map((t) => t.event)).toEqual(["selfAttacks"]);
    s.objects[k]!.attachedTo = undefined;
    invalidateCharacteristics(s);
    expect(abilitiesOf(s, s.objects[b]!).triggers).toHaveLength(0);
  });

  it("an Aura giving its creature an upkeep edict is aimed at opponents' creatures", () => {
    expect(harmfulTargets(castingBody(end)!)).toEqual([true]);
    expect(harmfulTargets(castingBody(study)!)).toEqual([false]);
  });
});

describe("backup (CR 702.165)", () => {
  it("another creature gets the counter and the abilities below until end of turn", () => {
    const { s: s0, ap, ids } = setup([slinger]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(passAll(s));
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(b)] }));
    s = settle(passAll(s));
    expect(s.objects[b]!.counters["+1/+1"]).toBe(1);
    expect(objHasKeyword(s, s.objects[b]!, "Flying")).toBe(true);
    expect(abilitiesOf(s, s.objects[b]!).triggers.map((t) => t.event)).toEqual(["selfAttacks"]);
    s = passUntil(s, "upkeep");
    expect(objHasKeyword(s, s.objects[b]!, "Flying")).toBe(false);
    expect(abilitiesOf(s, s.objects[b]!).triggers).toHaveLength(0);
  });

  it("on itself, it just gets the counter", () => {
    const { s: s0, ap, ids } = setup([slinger]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(passAll(s));
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(ids[0]!)] }));
    s = settle(passAll(s));
    const me = s.objects[ids[0]!]!;
    expect(me.counters["+1/+1"]).toBe(1);
    // Its own two abilities, once each.
    expect(abilitiesOf(s, me).triggers.filter((t) => t.event === "selfAttacks")).toHaveLength(1);
  });

  it("each backup ability triggers separately", () => {
    const captain = creature("Captain Test", "Backup 1, backup 1\nTrample");
    supported(captain);
    const { s: s0, ap, ids } = setup([captain]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 6 && (s.pending || s.stack.length); i++) {
      if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [target(b)] });
      else s = settle(passAll(s));
    }
    expect(s.objects[b]!.counters["+1/+1"]).toBe(2);
    expect(objHasKeyword(s, s.objects[b]!, "Trample")).toBe(true);
  });
});
