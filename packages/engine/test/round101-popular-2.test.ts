// Round 101: more popular cards. Elixir of Immortality (shuffle it and your graveyard in), Eldrazi Monument ("If you
// can't, sacrifice ~"), "the damage dealt this way" (Creeping Bloodsucker, Syphon Soul), Disciple of Bolas (the
// sacrificed creature's power, CR 608.2h), Twitching Doll ("for each counter on ~", any kind, as it last existed),
// Astral Cornucopia, Waterlogged Teachings ("a card with flash"), Bonehoard Dracosaur ("If you exiled a land card this
// way", once each, rulings), Priest of Forgotten Gods and Dreadhorde Invasion.

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { botActions, characteristics, isFullySupported, objHasKeyword, planActivate, planCast, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const elixir = card("Elixir of Immortality", "Artifact", "{1}", { oracleText: "{2}, {T}: You gain 5 life. Shuffle this artifact and your graveyard into their owner's library." });
const monument = card("Eldrazi Monument", "Artifact", "{5}", { oracleText: "Creatures you control get +1/+1 and have flying and indestructible.\nAt the beginning of your upkeep, sacrifice a creature. If you can't, sacrifice this artifact." });
const bloodsucker = card("Creeping Bloodsucker", "Creature — Vampire", "{1}{B}", { power: "1", toughness: "2", oracleText: "At the beginning of your upkeep, this creature deals 1 damage to each opponent. You gain life equal to the damage dealt this way." });
const syphon = card("Syphon Soul", "Sorcery", "{2}{B}", { oracleText: "Syphon Soul deals 2 damage to each other player. You gain life equal to the damage dealt this way." });
const disciple = card("Disciple of Bolas", "Creature — Human Wizard", "{3}{B}", { power: "2", toughness: "1", oracleText: "When this creature enters, sacrifice another creature. You gain X life and draw X cards, where X is that creature's power." });
const doll = card("Twitching Doll", "Artifact Creature — Spider Toy", "{1}{G}", { power: "2", toughness: "2", oracleText: "{T}: Add one mana of any color. Put a nest counter on this creature.\n{T}, Sacrifice this creature: Create a 2/2 green Spider creature token with reach for each counter on this creature. Activate only as a sorcery." });
const cornucopia = card("Astral Cornucopia", "Artifact", "{X}{X}{X}", { oracleText: "This artifact enters with X charge counters on it.\n{T}: Choose a color. Add one mana of that color for each charge counter on this artifact." });
const teachings = card("Waterlogged Teachings", "Instant", "{3}{U/B}", { oracleText: "Search your library for an instant card or a card with flash, reveal it, put it into your hand, then shuffle." });
const dracosaur = card("Bonehoard Dracosaur", "Creature — Dinosaur Dragon", "{3}{R}{R}", { power: "5", toughness: "5", keywords: ["Flying", "First strike"], oracleText: "Flying, first strike\nAt the beginning of your upkeep, exile the top two cards of your library. You may play them this turn. If you exiled a land card this way, create a 3/1 red Dinosaur creature token. If you exiled a nonland card this way, create a Treasure token." });
const priest = card("Priest of Forgotten Gods", "Creature — Human Cleric", "{1}{B}", { power: "1", toughness: "2", oracleText: "{T}, Sacrifice two other creatures: Any number of target players each lose 2 life and sacrifice a creature of their choice. You add {B}{B} and draw a card. (Activate only as an instant.)" });
const invasion = card("Dreadhorde Invasion", "Enchantment", "{1}{B}", { oracleText: "At the beginning of your upkeep, you lose 1 life and amass Zombies 1. (Put a +1/+1 counter on an Army you control. It's also a Zombie. If you don't control an Army, create a 0/0 black Zombie Army creature token first.)\nWhenever a Zombie token you control with power 6 or greater attacks, it gains lifelink until end of turn." });

const pass = (s: GameState) => act(s, { type: "passPriority", player: waitingOn(s)! });
const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = pass(s);
  return s;
};
const run = (s: GameState, plan: ReturnType<typeof planCast>) => {
  if (!plan) throw new Error("can't do it");
  return settle(plan.reduce((x, a) => act(x, a), s));
};
/** Answers whatever's asked the way the bots would, until nothing is. */
const answer = (s: GameState) => {
  for (let i = 0; i < 30 && (s.pending || s.stack.length); i++) s = s.pending ? act(s, botActions(s, waitingOn(s)!)[0]!) : pass(s);
  return s;
};
const toZone = (s: GameState, id: string, zone: "library" | "graveyard" | "hand", top = false) => {
  const o = s.objects[id]!;
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  o.zone = zone;
  const p = s.players[o.owner]!;
  if (zone === "library") (top ? p.library.unshift(id) : p.library.push(id));
  else p[zone].push(id);
};

describe("round 101: more popular cards", () => {
  it("parse", () => {
    for (const c of [elixir, monument, bloodsucker, syphon, disciple, doll, cornucopia, teachings, dracosaur, priest, invasion]) expect(isFullySupported(c), c.name).toBe(true);
  });

  it("Elixir of Immortality: 5 life, then it and your graveyard go into your library", () => {
    const { s: s0, ap } = setup([]);
    const e = putOnBattlefield(s0, ap, elixir);
    const dead = putOnBattlefield(s0, ap, bear());
    toZone(s0, dead, "graveyard");
    s0.players[ap]!.manaPool.C = 2;
    const life = s0.players[ap]!.life;
    const s = run(s0, planActivate(s0, ap, e, 0));
    expect(s.players[ap]!.life).toBe(life + 5);
    expect(s.objects[e]!.zone).toBe("library");
    expect(s.objects[dead]!.zone).toBe("library");
    expect(s.players[ap]!.graveyard).toHaveLength(0);
  });

  it("Eldrazi Monument: a creature if you have one; the Monument only if you don't", () => {
    for (const creatures of [1, 0]) {
      const { s: s0, ap } = setup([]);
      const m = putOnBattlefield(s0, ap, monument);
      const b = creatures ? putOnBattlefield(s0, ap, bear()) : undefined;
      for (const id of [...s0.battlefield]) if (s0.objects[id]!.controller === ap && id !== m && id !== b && s0.objects[id]!.zone === "battlefield" && /Creature/.test(s0.cards[s0.objects[id]!.cardId]!.typeLine)) toZone(s0, id, "graveyard");
      let s = passUntil(s0, "upkeep", ap);
      s = answer(s);
      if (b) {
        expect(s.objects[b]!.zone).toBe("graveyard"); // indestructible doesn't stop a sacrifice
        expect(s.objects[m]!.zone).toBe("battlefield");
      } else expect(s.objects[m]!.zone).toBe("graveyard");
    }
  });

  it("Creeping Bloodsucker and Syphon Soul: life for the damage actually dealt", () => {
    const { s: s0, ap, ids } = setup([syphon]);
    putOnBattlefield(s0, ap, bloodsucker);
    s0.players[ap]!.manaPool.B = 3;
    const life = s0.players[ap]!.life;
    const opps = s0.turnOrder.filter((p) => p !== ap);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (const p of opps) expect(s.players[p]!.life).toBe(s0.players[p]!.life - 2);
    expect(s.players[ap]!.life).toBe(life + 2 * opps.length);
    // Its upkeep trigger: 1 to each opponent, 1 life back for each.
    s = passUntil(s, "upkeep", ap);
    const before = s.players[ap]!.life;
    const theirs = opps.map((p) => s.players[p]!.life);
    s = answer(s);
    expect(opps.map((p) => s.players[p]!.life)).toEqual(theirs.map((l) => l - 1));
    expect(s.players[ap]!.life).toBe(before + opps.length);
  });

  it("Disciple of Bolas: life and cards equal to the sacrificed creature's power", () => {
    const { s: s0, ap, ids } = setup([disciple]);
    const big = putOnBattlefield(s0, ap, bear({ name: "Big Bear", power: "4", toughness: "4" }));
    for (const id of [...s0.battlefield]) if (s0.objects[id]!.controller === ap && id !== big && /Creature/.test(s0.cards[s0.objects[id]!.cardId]!.typeLine)) toZone(s0, id, "graveyard");
    s0.players[ap]!.manaPool.B = 4;
    const life = s0.players[ap]!.life;
    const hand = s0.players[ap]!.hand.length;
    const s = answer(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[big]!.zone).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(life + 4);
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 4);
  });

  it("Twitching Doll: a Spider for each counter on it, as it last existed", () => {
    const { s: s0, ap } = setup([]);
    const d = putOnBattlefield(s0, ap, doll);
    s0.objects[d]!.counters = { nest: 3, "+1/+1": 1 };
    const s = run(s0, planActivate(s0, ap, d, 0));
    const spiders = s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap);
    expect(spiders).toHaveLength(4);
    expect(objHasKeyword(s, s.objects[spiders[0]!]!, "Reach")).toBe(true);
  });

  it("Astral Cornucopia: one mana of the chosen color for each charge counter", () => {
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, cornucopia);
    s0.objects[c]!.counters.charge = 3;
    const s = act(s0, { type: "activateMana", player: ap, objectId: c, mana: "G" });
    expect(s.players[ap]!.manaPool.G).toBe(3);
  });

  it("Waterlogged Teachings: an instant card, or any card with flash", () => {
    const { s: s0, ap, ids } = setup([teachings]);
    const flashy = putOnBattlefield(s0, ap, bear({ name: "Flash Bear", keywords: ["Flash"], oracleText: "Flash" }));
    const plain = putOnBattlefield(s0, ap, bear());
    toZone(s0, flashy, "library");
    toZone(s0, plain, "library");
    s0.players[ap]!.manaPool.U = 4;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    expect(s.pending?.kind).toBe("searchLibrary");
    const p = s.pending as { cards: string[] };
    expect(p.cards).toContain(flashy);
    expect(p.cards).not.toContain(plain);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [flashy] }));
    expect(s.objects[flashy]!.zone).toBe("hand");
  });

  it("Bonehoard Dracosaur: a Dinosaur for a land, a Treasure for a nonland card, one each", () => {
    for (const [top, dinos, treasures] of [[["land", "land"], 1, 0], [["land", "bear"], 1, 1], [["bear", "bear"], 0, 1]] as const) {
      const { s: s0, ap } = setup([]);
      putOnBattlefield(s0, ap, dracosaur);
      const tops = top.map((k) => putOnBattlefield(s0, ap, k === "land" ? forest : bear({ name: "Top Bear" })));
      for (const id of [...tops].reverse()) toZone(s0, id, "library", true);
      let s = passUntil(s0, "upkeep", ap);
      // The two cards on top as the upkeep begins (passing to it draws nothing on this turn).
      for (const id of [...tops].reverse()) {
        const lib = s.players[ap]!.library;
        if (lib.includes(id)) lib.splice(lib.indexOf(id), 1);
        else continue;
        lib.unshift(id);
      }
      s = answer(s);
      const tokens = s.battlefield.map((id) => s.objects[id]!).filter((o) => o.isToken && o.controller === ap);
      expect(tokens.filter((o) => characteristics(s, o).name === "Dinosaur Token")).toHaveLength(dinos);
      expect(tokens.filter((o) => characteristics(s, o).name === "Treasure Token")).toHaveLength(treasures);
    }
  });

  it("Priest of Forgotten Gods: targets lose 2 life and sacrifice; you add {B}{B} and draw", () => {
    const { s: s0, ap, opp } = setup([]);
    const pr = putOnBattlefield(s0, ap, priest);
    const fodder = [putOnBattlefield(s0, ap, bear()), putOnBattlefield(s0, ap, bear())];
    const theirs = putOnBattlefield(s0, opp, bear());
    for (const id of [...s0.battlefield]) if (s0.objects[id]!.controller === opp && id !== theirs && /Creature/.test(s0.cards[s0.objects[id]!.cardId]!.typeLine)) toZone(s0, id, "graveyard");
    const hand = s0.players[ap]!.hand.length;
    const plan = planActivate(s0, ap, pr, 0, [{ kind: "player", id: opp }], undefined, undefined, undefined, { sacrifice: fodder });
    let s = run(s0, plan);
    s = answer(s);
    expect(s.players[opp]!.life).toBe(s0.players[opp]!.life - 2);
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.players[ap]!.manaPool.B).toBe(2);
  });

  it("Dreadhorde Invasion: 1 life and amass 1 each upkeep; a 6-power Zombie token attacking gains lifelink", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, invasion);
    const life = s0.players[ap]!.life;
    let s = answer(passUntil(s0, "upkeep", ap));
    expect(s.players[ap]!.life).toBeLessThanOrEqual(life - 1);
    const army = s.battlefield.map((id) => s.objects[id]!).find((o) => o.isToken && o.controller === ap)!;
    expect(army.counters["+1/+1"]).toBe(1);
    army.counters["+1/+1"] = 6;
    army.controlledSinceTurn = s.turn - 1; // as if it had been there since last turn
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: army.id, defender: opp }] });
    s = settle(s);
    expect(objHasKeyword(s, s.objects[army.id]!, "Lifelink")).toBe(true);
  });
});
