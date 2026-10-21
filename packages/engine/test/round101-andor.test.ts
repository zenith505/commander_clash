// Round 101: "a creature card and/or a land card" (up to one card for each, a card that's both being either one, rulings
// on Gift of the Gargantuan): Relentless Pursuit, Axgard Armory's search; Explore the Vastlands, where each player looks
// in turn (CR 101.4); Wandering Archaic ("they may pay {2}. If they don't, you may copy that spell"); Keeper of the Accord
// ("if that player controls more creatures than you": the opponent whose end step it is, as it triggers and resolves).

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, passUntil, putOnBattlefield, scry, setup, target } from "./helpers";
import { abilityProblem, botActions, isFullySupported, planActivate, planCast, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const pursuit = card("Relentless Pursuit", "Sorcery", "{2}{G}", { oracleText: "Reveal the top four cards of your library. You may put a creature card and/or a land card from among them into your hand. Put the rest into your graveyard." });
const armory = card("Axgard Armory", "Land", "", { oracleText: "This land enters tapped.\n{T}: Add {W}.\n{1}{R}{R}{W}, {T}, Sacrifice this land: Search your library for an Aura card and/or an Equipment card, reveal them, put them into your hand, then shuffle." });
const archaic = scry("modal_dfc", [
  { name: "Wandering Archaic", mana_cost: "{5}", type_line: "Creature — Avatar", power: "4", toughness: "4", oracle_text: "Whenever an opponent casts an instant or sorcery spell, they may pay {2}. If they don't, you may copy that spell. You may choose new targets for the copy." },
  { name: "Explore the Vastlands", mana_cost: "{3}", type_line: "Sorcery", oracle_text: "Each player looks at the top five cards of their library and may reveal a land card and/or an instant or sorcery card from among them. Each player puts the cards they revealed this way into their hand and the rest on the bottom of their library in a random order. Each player gains 3 life." },
]);
const vastlands = card("Explore the Vastlands", "Sorcery", "{3}", { oracleText: "Each player looks at the top five cards of their library and may reveal a land card and/or an instant or sorcery card from among them. Each player puts the cards they revealed this way into their hand and the rest on the bottom of their library in a random order. Each player gains 3 life." });
const archaicFront = card("Wandering Archaic", "Creature — Avatar", "{5}", { power: "4", toughness: "4", oracleText: "Whenever an opponent casts an instant or sorcery spell, they may pay {2}. If they don't, you may copy that spell. You may choose new targets for the copy." });
const keeper = card("Keeper of the Accord", "Creature — Human Soldier", "{3}{W}", { power: "3", toughness: "4", oracleText: "At the beginning of each opponent's end step, if that player controls more creatures than you, create a 1/1 white Soldier creature token.\nAt the beginning of each opponent's end step, if that player controls more lands than you, you may search your library for a basic Plains card, put it onto the battlefield tapped, then shuffle." });
const bolt = card("Lightning Bolt", "Instant", "{R}", { oracleText: "Lightning Bolt deals 3 damage to any target." });
const arbor = card("Dryad Arbor", "Land Creature — Forest Dryad", "", { power: "1", toughness: "1", oracleText: "(This land isn't a spell, it's affected by summoning sickness, and it has \"{T}: Add {G}.\")" });
const aura = card("Rancor", "Enchantment — Aura", "{G}", { oracleText: "Enchant creature\nEnchanted creature gets +2/+0 and has trample.\nWhen Rancor is put into a graveyard from the battlefield, return Rancor to its owner's hand." });
const sword = card("Bonesplitter", "Artifact — Equipment", "{1}", { oracleText: "Equipped creature gets +2/+0.\nEquip {1}" });

const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: ReturnType<typeof planCast>) => {
  if (!plan) throw new Error("can't do it");
  return settle(plan.reduce((x, a) => act(x, a), s));
};
/** Put these cards on top of `pid`'s library, first on top. */
const stack = (s: GameState, pid: number, defs: ReturnType<typeof card>[]) => {
  const ids = defs.map((d) => {
    const id = putOnBattlefield(s, pid, d);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "library";
    return id;
  });
  s.players[pid]!.library = [...ids, ...s.players[pid]!.library];
  return ids;
};

describe("round 101: and/or picks, Wandering Archaic, Keeper of the Accord", () => {
  it("parse", () => {
    for (const c of [pursuit, armory, archaic, keeper]) expect(isFullySupported(c), c.name).toBe(true);
  });

  it("Relentless Pursuit: a creature card and a land card, not two lands; Dryad Arbor is either", () => {
    const { s: s0, ap, ids } = setup([pursuit]);
    const top = stack(s0, ap, [forest, forest, bear(), arbor]);
    s0.players[ap]!.manaPool.G = 3;
    let s = run(s0, planCast(s0, ap, ids[0]!, []));
    expect(s.pending?.kind).toBe("searchLibrary");
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [top[0]!, top[1]!] })).toThrow(/one card for each/);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [top[3]!, top[0]!] })); // Dryad Arbor as the creature
    expect(s.objects[top[3]!]!.zone).toBe("hand");
    expect(s.objects[top[0]!]!.zone).toBe("hand");
    expect(s.objects[top[1]!]!.zone).toBe("graveyard");
    expect(s.objects[top[2]!]!.zone).toBe("graveyard");
  });

  it("Axgard Armory: an Aura card and an Equipment card", () => {
    const { s: s0, ap } = setup([]);
    const a = putOnBattlefield(s0, ap, armory);
    const [r, b] = stack(s0, ap, [aura, sword]);
    s0.players[ap]!.manaPool.R = 2;
    s0.players[ap]!.manaPool.W = 2;
    let s = run(s0, planActivate(s0, ap, a, 0, []));
    expect(s.pending?.kind).toBe("searchLibrary");
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [r!, b!] }));
    expect(s.objects[r!]!.zone).toBe("hand");
    expect(s.objects[b!]!.zone).toBe("hand");
  });

  it("Explore the Vastlands: each player in turn takes a land and/or an instant or sorcery, and gains 3 life", () => {
    const { s: s0, ap, opp, ids } = setup([vastlands]);
    const mine = stack(s0, ap, [bolt, forest, bear()]);
    const theirs = stack(s0, opp, [forest, bolt]);
    s0.players[ap]!.manaPool.C = 3;
    let s = run(s0, planCast(s0, ap, ids[0]!, []));
    expect(s.pending?.kind === "searchLibrary" && s.pending.player).toBe(ap);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [mine[0]!, mine[1]!] }));
    for (let i = 0; i < 10 && s.pending; i++) s = settle(botActions(s, waitingOn(s)!).reduce((x, a) => act(x, a), s));
    expect(s.pending).toBeNull();
    expect(s.objects[mine[0]!]!.zone).toBe("hand");
    expect(s.objects[mine[1]!]!.zone).toBe("hand");
    expect(s.objects[mine[2]!]!.zone).toBe("library");
    expect(theirs.map((id) => s.objects[id]!.zone)).toEqual(["hand", "hand"]);
    for (const p of s.players) expect(p.life).toBe(43);
  });

  it("Wandering Archaic: an opponent who pays {2} stops the copy; one who doesn't gets copied", () => {
    for (const pays of [true, false]) {
      const { s: s0, ap, opp, ids } = setup([bolt]);
      putOnBattlefield(s0, opp, archaicFront);
      s0.players[ap]!.manaPool.R = 3;
      const plan = planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]);
      let s = plan!.reduce((x, a) => act(x, a), s0);
      for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      expect(s.pending?.kind === "chooseMay" && s.pending.player).toBe(ap);
      s = act(s, { type: "chooseMay", player: ap, yes: pays });
      if (!pays) {
        expect(s.pending?.kind === "chooseMay" && s.pending.player).toBe(opp);
        s = act(s, { type: "chooseMay", player: opp, yes: true });
        // The copy's controller may choose a new target for it.
        for (let i = 0; i < 5 && s.pending && s.pending.kind !== "chooseMay"; i++) s = botActions(s, waitingOn(s)!).reduce((x, a) => act(x, a), s);
      }
      s = settle(s);
      for (let i = 0; i < 10 && s.pending; i++) s = settle(botActions(s, waitingOn(s)!).reduce((x, a) => act(x, a), s));
      expect(s.players[ap]!.manaPool.R ?? 0).toBe(pays ? 0 : 2);
      // The bolt, and the copy if it was made.
      expect(s.log.filter((l) => /^Lightning Bolt deals 3 damage/.test(typeof l === "string" ? l : l.text)).length).toBe(pays ? 1 : 2);
    }
  });

  it("Keeper of the Accord: at an opponent's end step, a Soldier if they control more creatures", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, keeper);
    putOnBattlefield(s0, ap, bear());
    putOnBattlefield(s0, ap, bear());
    let s = passUntil(s0, "end", ap);
    s = settle(s);
    for (let i = 0; i < 10 && s.pending; i++) s = settle(botActions(s, waitingOn(s)!).reduce((x, a) => act(x, a), s));
    const soldiers = s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === opp).length;
    expect(soldiers).toBe(1);
  });
});
