// Round 419 (Lane A): Missy ("Whenever another nonartifact creature dies, return it to the battlefield under your control
// face down and tapped. It's a 2/2 Cyberman artifact creature." and a villainous choice at your end step, CR 708.2a,
// 701.55), Shifting Shadow (its enchanted creature's 'At the beginning of your upkeep, destroy this creature. Reveal cards
// ... until you reveal a creature card. Put that card onto the battlefield and attach Shifting Shadow to it, ...', CR
// 704.3, 701.3) and Balthier and Fran ("Whenever a Vehicle crewed by Balthier and Fran this turn attacks, if it's the first
// combat phase of the turn, you may pay {1}{R}{G}. If you do, after this phase, there is an additional combat phase.",
// CR 702.122d, 603.4, 500.8).

import { describe, expect, it } from "vitest";
import { act, addEffect, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, parseManaCost, planCast, planMana, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";
import { moveObject } from "../src/game";

// Real card data (Scryfall).
const missy = (): CardDef => ({"oracleId": "905610cd-1461-4f5a-b9c8-19b193b9d513", "name": "Missy", "manaCost": "{3}{U}{B}{R}", "cmc": 6, "typeLine": "Legendary Creature — Time Lord Rogue", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Time Lord", "Rogue"], "oracleText": "Whenever another nonartifact creature dies, return it to the battlefield under your control face down and tapped. It's a 2/2 Cyberman artifact creature.\nAt the beginning of your end step, each opponent faces a villainous choice — Each artifact creature you control deals 1 damage to that opponent, or you draw a card and chaos ensues.", "power": "4", "toughness": "5", "colors": ["B", "R", "U"], "colorIdentity": ["B", "R", "U"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/5/4/54c1232e-0104-4295-a1de-3eebe2ac6a5f.jpg?1783914530", "artUrl": "https://cards.scryfall.io/art_crop/front/5/4/54c1232e-0104-4295-a1de-3eebe2ac6a5f.jpg?1783914530", "commanderLegal": "legal", "set": "who", "releasedAt": "2023-10-13", "rarity": "rare", "layout": "normal", "gameChanger": false} as CardDef);
const shadow = (): CardDef => ({"oracleId": "564b1253-2e1f-46c5-b5ae-3932127ca614", "name": "Shifting Shadow", "manaCost": "{2}{R}", "cmc": 3, "typeLine": "Enchantment — Aura", "supertypes": [], "types": ["Enchantment"], "subtypes": ["Aura"], "oracleText": "Enchant creature\nEnchanted creature has haste and \"At the beginning of your upkeep, destroy this creature. Reveal cards from the top of your library until you reveal a creature card. Put that card onto the battlefield and attach Shifting Shadow to it, then put all other cards revealed this way on the bottom of your library in a random order.\"", "colors": ["R"], "colorIdentity": ["R"], "keywords": ["Enchant"], "imageUrl": "https://cards.scryfall.io/normal/front/9/2/925b26d3-ed73-4264-a5a9-b54d05760044.jpg?1783935942", "artUrl": "https://cards.scryfall.io/art_crop/front/9/2/925b26d3-ed73-4264-a5a9-b54d05760044.jpg?1783935942", "commanderLegal": "legal", "set": "c17", "releasedAt": "2017-08-25", "rarity": "rare", "layout": "normal", "gameChanger": false} as CardDef);
const balthier = (): CardDef => ({"oracleId": "570cb560-c246-4652-b230-ab34f966c78a", "name": "Balthier and Fran", "manaCost": "{1}{R}{G}", "cmc": 3, "typeLine": "Legendary Creature — Human Rabbit", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Human", "Rabbit"], "oracleText": "Reach\nVehicles you control get +1/+1 and have reach and vigilance.\nWhenever a Vehicle crewed by Balthier and Fran this turn attacks, if it's the first combat phase of the turn, you may pay {1}{R}{G}. If you do, after this phase, there is an additional combat phase.", "power": "4", "toughness": "3", "colors": ["G", "R"], "colorIdentity": ["G", "R"], "keywords": ["Reach"], "imageUrl": "https://cards.scryfall.io/normal/front/a/f/afcaed7d-7ea3-4f2a-a7f5-ee3315226369.jpg?1783906576", "artUrl": "https://cards.scryfall.io/art_crop/front/a/f/afcaed7d-7ea3-4f2a-a7f5-ee3315226369.jpg?1783906576", "commanderLegal": "legal", "set": "fin", "releasedAt": "2025-06-13", "rarity": "rare", "layout": "normal", "gameChanger": false} as CardDef);
const copter = (): CardDef => ({"oracleId": "49136bdc-bc50-49a2-999a-1ef9c16ea130", "name": "Smuggler's Copter", "manaCost": "{2}", "cmc": 2, "typeLine": "Artifact — Vehicle", "supertypes": [], "types": ["Artifact"], "subtypes": ["Vehicle"], "oracleText": "Flying\nWhenever this Vehicle attacks or blocks, you may draw a card. If you do, discard a card.\nCrew 1 (Tap any number of creatures you control with total power 1 or more: This Vehicle becomes an artifact creature until end of turn.)", "power": "3", "toughness": "3", "colors": [], "colorIdentity": [], "keywords": ["Flying", "Crew"], "imageUrl": "https://cards.scryfall.io/normal/front/7/8/7832abb5-5107-4603-904e-491b221bd3e3.jpg?1783937147", "artUrl": "https://cards.scryfall.io/art_crop/front/7/8/7832abb5-5107-4603-904e-491b221bd3e3.jpg?1783937147", "commanderLegal": "legal", "set": "kld", "releasedAt": "2016-09-30", "rarity": "rare", "layout": "normal", "gameChanger": false} as CardDef);
const bolt = (): CardDef => ({"oracleId": "4457ed35-7c10-48c8-9776-456485fdf070", "name": "Lightning Bolt", "manaCost": "{R}", "cmc": 1, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Lightning Bolt deals 3 damage to any target.", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008", "artUrl": "https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008", "commanderLegal": "legal", "set": "msc", "releasedAt": "2026-06-26", "rarity": "uncommon", "layout": "normal", "gameChanger": false} as CardDef);
const giant = () => card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" });
const construct = () => card("Test Construct", "Artifact Creature — Construct", "{1}", { power: "1", toughness: "1" });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
/** Everyone passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** The bots' answers for every question, whoever is asked, until the stack is empty. */
const settleBots = (s: GameState) => {
  for (let i = 0; i < 400 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const pid = waitingOn(s)!;
    s = s.pending ? botActions(s, pid).reduce((x, a) => act(x, a), s) : act(s, { type: "passPriority", player: pid });
  }
  return s;
};
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Cards on top of `pid`'s library, `defs[0]` on top; their ids in the same order. */
const onTop = (s: GameState, pid: PlayerId, defs: CardDef[]) => [...defs].reverse().map((d) => into(s, pid, d, "library")).reverse();
/** Passes until `step`, declining Smuggler's Copter's loot and declaring no blocks. */
const go = (s: GameState, step: string) => {
  for (let i = 0; i < 200 && s.step !== step; i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: false });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const opponentsOf = (s: GameState, ap: PlayerId) => [1, 2, 3].map((n) => s.turnOrder[(s.turnOrder.indexOf(ap) + n) % 4]!);

describe("round 419", () => {
  it("every card of the round compiles fully", () => supported(missy(), shadow(), balthier()));
});

describe("Missy", () => {
  it("another nonartifact creature that dies returns under your control face down and tapped, a 2/2 Cyberman artifact creature", () => {
    const { s: s0, ap, opp, ids } = setup([bolt()]);
    const m = putOnBattlefield(s0, ap, missy());
    const b = putOnBattlefield(s0, opp, bear());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])));
    expect(s.pending).toBeNull();
    const x = s.objects[b]!;
    expect(x.zone).toBe("battlefield");
    expect(x.faceDown).toBe("cyberman");
    expect(x.tapped).toBe(true);
    expect(x.owner).toBe(opp);
    expect(controllerOf(s, x)).toBe(ap);
    const ch = characteristics(s, x);
    expect(ch.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(ch.subtypes).toEqual(["Cyberman"]);
    expect(ch.colors).toEqual([]);
    expect([ch.power, ch.toughness]).toEqual([2, 2]);
    expect(s.objects[m]!.zone).toBe("battlefield");
  });

  it("an artifact creature, a token and Missy herself don't come back", () => {
    const { s: s0, ap, opp, ids } = setup([bolt(), bolt()]);
    putOnBattlefield(s0, ap, missy());
    const c = putOnBattlefield(s0, opp, construct());
    const t = putOnBattlefield(s0, opp, bear({ name: "Bear Token" }));
    s0.objects[t]!.isToken = true;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(c)])));
    expect(s.objects[c]!.zone).toBe("graveyard");
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(t)])));
    expect(s.objects[t]?.zone ?? "gone").not.toBe("battlefield");
    expect(s.battlefield.filter((id) => s.objects[id]!.faceDown)).toEqual([]);
    // Missy dying sees only other creatures.
    const { s: s1, ap: ap1, ids: ids1 } = setup([bolt(), bolt()]);
    const m1 = putOnBattlefield(s1, ap1, missy());
    s1.objects[m1]!.damage = 3;
    s = settle(run(s1, planCast(s1, ap1, ids1[0]!, [tgt(m1)])));
    expect(s.objects[m1]!.zone).toBe("graveyard");
  });

  it("destroyed together with Missy, the others still return (leaves-the-battlefield abilities look back, CR 603.10a)", () => {
    const wrath = card("Test Wrath", "Sorcery", "{2}{W}{W}", { oracleText: "Destroy all creatures." });
    const { s: s0, ap, opp, ids } = setup([wrath]);
    const m = putOnBattlefield(s0, ap, missy());
    const [b1, b2] = [putOnBattlefield(s0, opp, bear()), putOnBattlefield(s0, ap, bear())];
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toBeNull();
    expect(s.objects[m]!.zone).toBe("graveyard");
    for (const b of [b1, b2]) {
      expect(s.objects[b]!.zone).toBe("battlefield");
      expect(s.objects[b]!.faceDown).toBe("cyberman");
      expect(controllerOf(s, s.objects[b]!)).toBe(ap);
    }
  });

  it("at your end step each opponent in turn chooses: damage from each artifact creature you control, or you draw and chaos ensues (nothing)", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, missy());
    putOnBattlefield(s0, ap, construct());
    putOnBattlefield(s0, ap, construct());
    putOnBattlefield(s0, ap, bear());
    const opps = opponentsOf(s0, ap);
    const life = opps.map((p) => s0.players[p]!.life);
    let s = passUntil(s0, "end", ap);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "villainous", player: opps[0], labels: ["Each artifact creature you control deals 1 damage to that opponent", "You draw a card and chaos ensues"] });
    s = settle(act(s, { type: "chooseOption", player: opps[0]!, choice: "0" }));
    // Two artifact creatures, 1 damage each; the Grizzly Bears isn't one.
    expect(s.players[opps[0]!]!.life).toBe(life[0]! - 2);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "villainous", player: opps[1] });
    const hand = s.players[ap]!.hand.length;
    s = settle(act(s, { type: "chooseOption", player: opps[1]!, choice: "1" }));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.players[opps[1]!]!.life).toBe(life[1]);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "villainous", player: opps[2] });
    s = settle(act(s, { type: "chooseOption", player: opps[2]!, choice: "0" }));
    expect(s.players[opps[2]!]!.life).toBe(life[2]! - 2);
    expect(s.pending).toBeNull();
  });

  it("bots answer the villainous choice", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, missy());
    let s = passUntil(s0, "end", ap);
    s = settleBots(s);
    expect(s.pending).toBeNull();
    expect(s.stack).toEqual([]);
  });
});

describe("Shifting Shadow", () => {
  /** Your Grizzly Bears enchanted with Shifting Shadow; your library's top cards `top`, then the game at your next upkeep with the trigger on the stack. */
  const shadowed = (top: CardDef[], lands = false) => {
    const { s: s0, ap } = setup([]);
    if (lands) for (const id of [...s0.players[ap]!.library]) if (characteristics(s0, s0.objects[id]!).types.includes("Creature")) moveObject(s0, id, "exile");
    const b = putOnBattlefield(s0, ap, bear());
    const a = putOnBattlefield(s0, ap, shadow());
    s0.objects[a]!.attachedTo = b;
    invalidateCharacteristics(s0);
    const tops = onTop(s0, ap, top);
    expect(characteristics(s0, s0.objects[b]!).keywords).toContain("Haste");
    let s = passUntil(s0, "upkeep", ap);
    for (let i = 0; i < 10 && !s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    return { s, ap, b, a, tops };
  };

  it("destroys the creature, puts the first creature card revealed onto the battlefield with the Aura on it, the rest on the bottom", () => {
    const { s: s1, ap, b, a, tops } = shadowed([card("Forest", "Basic Land — Forest"), card("Forest", "Basic Land — Forest"), giant()]);
    expect(s1.stack.length).toBe(1);
    const s = settle(s1);
    expect(s.objects[b]!.zone).toBe("graveyard");
    const g = tops[2]!;
    expect(s.objects[g]!.zone).toBe("battlefield");
    expect(controllerOf(s, s.objects[g]!)).toBe(ap);
    expect(s.objects[a]!.zone).toBe("battlefield");
    expect(s.objects[a]!.attachedTo).toBe(g);
    // The Aura's haste and trigger are the Hill Giant's now.
    expect(characteristics(s, s.objects[g]!).keywords).toContain("Haste");
    const lib = s.players[ap]!.library;
    expect(lib.slice(-2).sort()).toEqual([tops[0]!, tops[1]!].sort());
  });

  it("an indestructible creature stays, and the Aura still moves to the new creature", () => {
    const { s: s0, ap } = setup([]);
    const b = putOnBattlefield(s0, ap, bear());
    const a = putOnBattlefield(s0, ap, shadow());
    s0.objects[a]!.attachedTo = b;
    addEffect(s0, ap, [b], [{ kind: "addKeywords", keywords: ["Indestructible"] }], "game");
    const [g] = onTop(s0, ap, [giant()]);
    let s = passUntil(s0, "upkeep", ap);
    s = settle(s);
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.objects[g!]!.zone).toBe("battlefield");
    expect(s.objects[a]!.attachedTo).toBe(g);
  });

  it("with the Aura gone before it resolves, the creature is still destroyed and the new one enters with nothing attached", () => {
    const { s: s1, ap, b, a, tops } = shadowed([giant()]);
    moveObject(s1, a, "graveyard");
    const s = settle(s1);
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.objects[tops[0]!]!.zone).toBe("battlefield");
    expect(s.objects[a]!.zone).toBe("graveyard");
    expect(controllerOf(s, s.objects[tops[0]!]!)).toBe(ap);
  });

  it("with no creature card in the library, the whole library goes to the bottom and the Aura goes to the graveyard", () => {
    const { s: s1, ap, b, a } = shadowed([], true);
    const n = s1.players[ap]!.library.length;
    const s = settle(s1);
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.objects[a]!.zone).toBe("graveyard");
    expect(s.players[ap]!.library.length).toBe(n);
  });
});

describe("Balthier and Fran", () => {
  /** Balthier and Fran and a Smuggler's Copter; crewed with `crewer` (Balthier and Fran unless given), then attacking. */
  const attackWithCopter = (useBear = false) => {
    const { s: s0, ap, opp } = setup([]);
    const bf = putOnBattlefield(s0, ap, balthier());
    const cop = putOnBattlefield(s0, ap, copter());
    const bb = putOnBattlefield(s0, ap, bear());
    let s = passUntil(s0, "beginCombat", ap);
    s = act(s, { type: "activateAbility", player: ap, objectId: cop, index: 0, tapCreatures: [useBear ? bb : bf] } as Action);
    s = settle(s);
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: cop, defender: opp }] });
    return { s, ap, opp, bf, cop, bb };
  };

  it("Vehicles you control get +1/+1 and have reach and vigilance", () => {
    const { s, cop } = attackWithCopter();
    const ch = characteristics(s, s.objects[cop]!);
    expect([ch.power, ch.toughness]).toEqual([4, 4]);
    expect(ch.keywords).toEqual(expect.arrayContaining(["Reach", "Vigilance", "Flying"]));
    expect(s.objects[cop]!.tapped).toBe(false);
  });

  it("a Vehicle it crewed attacking in the first combat: paying {1}{R}{G} adds a combat phase, where it doesn't trigger again", () => {
    let { s, ap, cop, opp } = attackWithCopter();
    for (let i = 0; i < 20 && !(s.pending?.kind === "chooseMay" && /additional combat/.test(s.pending.prompt)); i++) {
      const p = s.pending;
      if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: false });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    for (const a of planMana(s, ap, parseManaCost("{1}{R}{G}"))!) s = act(s, a);
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.addedPhases).toEqual(["combat"]);
    s = go(s, "endCombat");
    s = go(s, "declareAttackers");
    expect(s.objects[cop]!.tapped).toBe(false);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: cop, defender: opp }] });
    for (let i = 0; i < 20 && s.step === "declareAttackers"; i++) {
      const p = s.pending;
      expect(p?.kind === "chooseMay" && /additional combat/.test(p.prompt)).toBe(false);
      if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: false });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.addedPhases ?? []).toEqual([]);
  });

  it("a Vehicle crewed by another creature doesn't trigger it", () => {
    let { s } = attackWithCopter(true);
    for (let i = 0; i < 20 && s.step === "declareAttackers"; i++) {
      const p = s.pending;
      expect(p?.kind === "chooseMay" && /additional combat/.test(p.prompt)).toBe(false);
      if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: false });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
  });
});
