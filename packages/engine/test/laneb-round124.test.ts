// Lane B round B124: Phantasmal Mount (two linked "leaves the battlefield this turn" sacrifices), Carry Away (control of
// an Equipment, unattached), Excavator (landwalk of the sacrificed land's types), Feint and Sewers of Estark (combat damage
// prevented for a creature and those in combat with it), Game Preserve (each player's top card onto the battlefield if all
// are creatures), Specter's Shriek (a card exiled from a revealed hand, and one of yours if it was nonblack), Clash of
// Elements (its owner's choice of top or bottom, the top costing 2 damage), Scarwood Bandits (control unless an opponent
// pays {2}) and Mimeofacture (a card with the target's name from its controller's library).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { blockProblem, botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, moveObject, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type Step, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; questions of the players in `me` stop it, others the bots answer. */
const settle = (s: GameState, opts: { me?: PlayerId[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && opts.me?.includes(p.player)) return s;
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const next = (s: GameState, p: PlayerId, n = 1) => s.turnOrder[(s.turnOrder.indexOf(p) + n) % 4]!;
const zone = (s: GameState, id: string) => s.objects[id]?.zone ?? "gone";
const life = (s: GameState, p: PlayerId) => s.players[p]!.life;
const dmg = (s: GameState, id: string) => s.objects[id]!.damage ?? 0;
const kw = (s: GameState, id: string) => characteristics(s, s.objects[id]!).keywords;
const pool = (s: GameState, pid: PlayerId, mana: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  s.players[pid]!.manaPool = { ...s.players[pid]!.manaPool, ...mana };
};
/** A new card for `def`, owned by `pid`, in that zone. */
const inZone = (s: GameState, pid: PlayerId, def: CardDef, z: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
const answer = (s: GameState, pid: PlayerId, a: Action) => {
  expect(s.pending?.player).toBe(pid);
  return act(s, a);
};
/** Passes priority (answering other questions as bots) until `step`. */
const toStep = (s: GameState, step: Step) => {
  for (let i = 0; i < 400 && s.step !== step; i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: p.player, attacks: [] });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  if (s.step !== step) throw new Error(`never reached ${step}`);
  return s;
};
/** The active player attacks with `attacks`; the defender declares `blocks`; then it's the declare blockers step with the active player's priority. */
const combat = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[], blocks: { blocker: string; attacker: string }[] = []) => {
  s = toStep(s, "declareAttackers");
  s = act(s, { type: "declareAttackers", player: ap, attacks });
  for (let i = 0; i < 200 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  const defenders = new Set(attacks.map((a) => a.defender));
  while (s.pending?.kind === "declareBlockers") {
    const p = s.pending.player;
    s = act(s, { type: "declareBlockers", player: p, blocks: defenders.has(p) ? blocks : [] });
  }
  return s;
};

// Real oracle text (Scryfall).
const mount = (): CardDef => ({"oracleId":"8c7723a5-04c7-4241-b0ba-6a821449ca43","name":"Phantasmal Mount","manaCost":"{1}{U}","cmc":2,"typeLine":"Creature — Illusion Horse","supertypes":[],"types":["Creature"],"subtypes":["Illusion","Horse"],"oracleText":"Flying\n{T}: Target creature you control with toughness 2 or less gets +1/+1 and gains flying until end of turn. When this creature leaves the battlefield this turn, sacrifice that creature. When the creature leaves the battlefield this turn, sacrifice this creature.","power":"1","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":["Flying"],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const carry = (): CardDef => ({"oracleId":"913b57de-f921-40ea-9124-0da35a269181","name":"Carry Away","manaCost":"{U}{U}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant Equipment\nWhen this Aura enters, unattach enchanted Equipment.\nYou control enchanted Equipment.","colors":["U"],"colorIdentity":["U"],"keywords":["Enchant"],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const excavator = (): CardDef => ({"oracleId":"2d5ebcd7-07c2-412e-b0d9-54e3a88895fd","name":"Excavator","manaCost":"{2}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}, Sacrifice a basic land: Target creature gains landwalk of each of the land types of the sacrificed land until end of turn. (It can't be blocked as long as defending player controls a land of any of those types.)","colors":[],"colorIdentity":[],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const feint = (): CardDef => ({"oracleId":"1bb8fe05-abb3-40a8-9e80-5d99ed0e4284","name":"Feint","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Tap all creatures blocking target attacking creature. Prevent all combat damage that would be dealt this turn by that creature and each creature blocking it.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const sewers = (): CardDef => ({"oracleId":"2482f98a-eadf-450d-9e73-fc441b572862","name":"Sewers of Estark","manaCost":"{2}{B}{B}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Choose target creature. If it's attacking, it can't be blocked this turn. If it's blocking, prevent all combat damage that would be dealt this combat by it and each creature it's blocking.","colors":["B"],"colorIdentity":["B"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const preserve = (): CardDef => ({"oracleId":"409e0a43-0e85-47ea-9d40-de0860b12952","name":"Game Preserve","manaCost":"{2}{G}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of your upkeep, each player reveals the top card of their library. If all cards revealed this way are creature cards, put those cards onto the battlefield under their owners' control.","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const shriek = (): CardDef => ({"oracleId":"8c9164b5-10ed-4cad-af33-7d4b5d3d6bf2","name":"Specter's Shriek","manaCost":"{B}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target opponent reveals their hand. You may choose a nonland card from it. If you do, that player exiles that card. If a nonblack card is exiled this way, exile a card from your hand.","colors":["B"],"colorIdentity":["B"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const clash = (): CardDef => ({"oracleId":"78304a06-4c9a-4cdf-b67f-067d88762381","name":"Clash of Elements","manaCost":"{1}{U}{R}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Choose target nonland permanent. Its owner may put it on top of their library. If they do, Clash of Elements deals 2 damage to them. If they didn't put the card on top of their library, they put it on the bottom.","colors":["R","U"],"colorIdentity":["R","U"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const bandits = (): CardDef => ({"oracleId":"7fcc8aab-6f7b-4474-b4e4-58cf4a119b22","name":"Scarwood Bandits","manaCost":"{2}{G}{G}","cmc":4,"typeLine":"Creature — Human Rogue","supertypes":[],"types":["Creature"],"subtypes":["Human","Rogue"],"oracleText":"Forestwalk (This creature can't be blocked as long as defending player controls a Forest.)\n{2}{G}, {T}: Unless an opponent pays {2}, gain control of target artifact for as long as this creature remains on the battlefield.","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":["Landwalk","Forestwalk"],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const mimeo = (): CardDef => ({"oracleId":"79b978b8-44c8-4ca8-bdd5-10490145398d","name":"Mimeofacture","manaCost":"{3}{U}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Replicate {3}{U} (When you cast this spell, copy it for each time you paid its replicate cost. You may choose new targets for the copies.)\nChoose target permanent an opponent controls. Search that player's library for a card with the same name and put it onto the battlefield under your control. Then that player shuffles.","colors":["U"],"colorIdentity":["U"],"keywords":["Replicate"],"commanderLegal":"legal","layout":"normal"}) as CardDef;

// Test cards.
const shock = card("Test Shock", "Instant", "{0}", { colors: ["R"], oracleText: "Test Shock deals 3 damage to any target." });
const big = card("Test Big", "Creature — Giant", "{5}{G}", { cmc: 6, power: "5", toughness: "5", colors: ["G"] });
const ogre = card("Test Ogre", "Creature — Ogre", "{2}{R}", { cmc: 3, power: "3", toughness: "3", colors: ["R"] });
const sword = card("Test Sword", "Artifact — Equipment", "{1}", { cmc: 1, oracleText: "Equipped creature gets +2/+0.\nEquip {1}" });
const relic = card("Test Relic", "Artifact", "{2}", { cmc: 2 });
const zombie = card("Test Zombie", "Creature — Zombie", "{1}{B}", { cmc: 2, power: "2", toughness: "2", colors: ["B"] });
const wastes = card("Wastes", "Basic Land", "", { supertypes: ["Basic"] });
const mountainCard = card("Mountain", "Basic Land — Mountain");

describe("Lane B round B124", () => {
  it("compiles every card of the round", () => {
    supported(mount(), carry(), excavator(), feint(), sewers(), preserve(), shriek(), clash(), bandits(), mimeo());
  });

  describe("Phantasmal Mount", () => {
    it("gives +1/+1 and flying; when the Mount leaves this turn, the creature is sacrificed", () => {
      let { s, ap } = setup([]);
      const m = putOnBattlefield(s, ap, mount());
      const b = putOnBattlefield(s, ap, bear());
      const sh = inZone(s, ap, shock, "hand");
      s = settle(run(s, planActivate(s, ap, m, 0, [tgt(b)])));
      expect(characteristics(s, s.objects[b]!).power).toBe(3);
      expect(kw(s, b)).toContain("Flying");
      s = settle(run(s, planCast(s, ap, sh, [tgt(m)])));
      expect(zone(s, m)).toBe("graveyard");
      expect(zone(s, b)).toBe("graveyard");
    });

    it("when the creature leaves this turn, the Mount is sacrificed", () => {
      let { s, ap } = setup([]);
      const m = putOnBattlefield(s, ap, mount());
      const b = putOnBattlefield(s, ap, bear());
      const sh = inZone(s, ap, shock, "hand");
      s = settle(run(s, planActivate(s, ap, m, 0, [tgt(b)])));
      s = settle(run(s, planCast(s, ap, sh, [tgt(b)])));
      expect(zone(s, b)).toBe("graveyard");
      expect(zone(s, m)).toBe("graveyard");
    });

    it("can't target a creature with toughness 3 or more, and the link ends with the turn", () => {
      let { s, ap } = setup([]);
      const m = putOnBattlefield(s, ap, mount());
      const o = putOnBattlefield(s, ap, ogre);
      const b = putOnBattlefield(s, ap, bear());
      expect(planActivate(s, ap, m, 0, [tgt(o)])).toBeNull();
      s = settle(run(s, planActivate(s, ap, m, 0, [tgt(b)])));
      // Next turn the Mount leaving does nothing to the Bear.
      s = passUntil(act(s, { type: "passPriority", player: ap }), "upkeep", next(s, ap));
      moveObject(s, m, "graveyard");
      s = settle(s);
      expect(zone(s, b)).toBe("battlefield");
      expect(characteristics(s, s.objects[b]!).power).toBe(2);
    });
  });

  describe("Carry Away", () => {
    it("you gain control of the enchanted Equipment, which becomes unattached", () => {
      let { s, ap } = setup([]);
      const opp = next(s, ap);
      const eq = putOnBattlefield(s, opp, sword);
      const theirs = putOnBattlefield(s, opp, bear());
      s.objects[eq]!.attachedTo = theirs;
      invalidateCharacteristics(s);
      expect(characteristics(s, s.objects[theirs]!).power).toBe(4);
      const ca = inZone(s, ap, carry(), "hand");
      s = settle(run(s, planCast(s, ap, ca, [tgt(eq)])));
      expect(zone(s, ca)).toBe("battlefield");
      expect(s.objects[ca]!.attachedTo).toBe(eq);
      expect(controllerOf(s, s.objects[eq]!)).toBe(ap);
      expect(s.objects[eq]!.attachedTo).toBeUndefined();
      expect(characteristics(s, s.objects[theirs]!).power).toBe(2);
      // Its new controller may equip it.
      const mine = putOnBattlefield(s, ap, bear());
      s = settle(run(s, planActivate(s, ap, eq, 0, [tgt(mine)])));
      expect(s.objects[eq]!.attachedTo).toBe(mine);
      expect(characteristics(s, s.objects[mine]!).power).toBe(4);
    });
  });

  describe("Excavator", () => {
    it("the target gains landwalk of the sacrificed basic land's type until end of turn", () => {
      let { s, ap } = setup([]);
      const opp = next(s, ap);
      const e = putOnBattlefield(s, ap, excavator());
      const b = putOnBattlefield(s, ap, bear());
      const mtn = putOnBattlefield(s, ap, mountainCard);
      s = settle(run(s, planActivate(s, ap, e, 0, [tgt(b)], undefined, undefined, undefined, { sacrifice: [mtn] })));
      expect(zone(s, mtn)).toBe("graveyard");
      expect(kw(s, b)).toContain("Mountainwalk");
      // The defending player's Mountain makes it unblockable.
      putOnBattlefield(s, opp, mountainCard);
      const blocker = putOnBattlefield(s, opp, bear());
      s = combat(s, ap, [{ attacker: b, defender: opp }]);
      expect(blockProblem(s, s.objects[blocker]!, s.objects[b]!)).not.toBeNull();
      s = passUntil(s, "upkeep", next(s, ap));
      expect(kw(s, b)).not.toContain("Mountainwalk");
    });

    it("Wastes has no land type: no landwalk", () => {
      let { s, ap } = setup([]);
      const e = putOnBattlefield(s, ap, excavator());
      const b = putOnBattlefield(s, ap, bear());
      const w = putOnBattlefield(s, ap, wastes);
      s = settle(run(s, planActivate(s, ap, e, 0, [tgt(b)], undefined, undefined, undefined, { sacrifice: [w] })));
      expect(zone(s, w)).toBe("graveyard");
      expect(kw(s, b).filter((k) => /walk$/.test(k))).toEqual([]);
    });
  });

  describe("Feint and Sewers of Estark", () => {
    it("Feint taps the creatures blocking the target and prevents their combat damage and its own", () => {
      let { s, ap } = setup([]);
      const opp = next(s, ap);
      const a = putOnBattlefield(s, ap, ogre);
      const g = putOnBattlefield(s, ap, big);
      const b1 = putOnBattlefield(s, opp, bear());
      const b2 = putOnBattlefield(s, opp, bear());
      const f = inZone(s, ap, feint(), "hand");
      s = combat(s, ap, [{ attacker: a, defender: opp }, { attacker: g, defender: opp }], [{ blocker: b1, attacker: a }, { blocker: b2, attacker: a }]);
      pool(s, ap, { R: 1 });
      s = settle(run(s, planCast(s, ap, f, [tgt(a)])));
      expect(s.objects[b1]!.tapped).toBe(true);
      expect(s.objects[b2]!.tapped).toBe(true);
      const before = life(s, opp);
      s = toStep(s, "endCombat");
      expect(zone(s, a)).toBe("battlefield");
      expect(dmg(s, a)).toBe(0);
      expect(zone(s, b1)).toBe("battlefield");
      expect(zone(s, b2)).toBe("battlefield");
      expect(dmg(s, b1) + dmg(s, b2)).toBe(0);
      // The other attacker's damage isn't prevented.
      expect(life(s, opp)).toBe(before - 5);
    });

    it("Sewers of Estark: an attacking target can't be blocked this turn", () => {
      let { s, ap } = setup([]);
      const opp = next(s, ap);
      const a = putOnBattlefield(s, ap, ogre);
      const blocker = putOnBattlefield(s, opp, bear());
      const sw = inZone(s, ap, sewers(), "hand");
      s = toStep(s, "declareAttackers");
      s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] });
      expect(s.step).toBe("declareAttackers");
      pool(s, ap, { B: 4 });
      s = settle(run(s, planCast(s, ap, sw, [tgt(a)])));
      expect(blockProblem(s, s.objects[blocker]!, s.objects[a]!)).not.toBeNull();
    });

    it("Sewers of Estark: a blocking target's combat damage and that of the creature it blocks are prevented this combat", () => {
      let { s, ap } = setup([]);
      const opp = next(s, ap);
      const g = putOnBattlefield(s, ap, big);
      const blocker = putOnBattlefield(s, opp, bear());
      const sw = inZone(s, opp, sewers(), "hand");
      s = combat(s, ap, [{ attacker: g, defender: opp }], [{ blocker, attacker: g }]);
      s = act(s, { type: "passPriority", player: ap });
      expect(waitingOn(s)).toBe(opp);
      pool(s, opp, { B: 4 });
      s = settle(run(s, planCast(s, opp, sw, [tgt(blocker)])));
      s = toStep(s, "endCombat");
      expect(zone(s, blocker)).toBe("battlefield");
      expect(dmg(s, blocker)).toBe(0);
      expect(dmg(s, g)).toBe(0);
    });

    it("Sewers of Estark: a creature neither attacking nor blocking is unaffected", () => {
      let { s, ap } = setup([]);
      const opp = next(s, ap);
      const b = putOnBattlefield(s, ap, bear());
      const sw = inZone(s, ap, sewers(), "hand");
      pool(s, ap, { B: 4 });
      s = settle(run(s, planCast(s, ap, sw, [tgt(b)])));
      expect(zone(s, sw)).toBe("graveyard");
      const blocker = putOnBattlefield(s, opp, bear());
      s = combat(s, ap, [{ attacker: b, defender: opp }]);
      expect(blockProblem(s, s.objects[blocker]!, s.objects[b]!)).toBeNull();
    });
  });

  describe("Game Preserve", () => {
    /** To `ap`'s next upkeep with Game Preserve's trigger waiting, every library's top card set by `top`. */
    const upkeep = (s: GameState, ap: PlayerId, top: (pid: PlayerId) => CardDef) => {
      for (const p of s.players) p.hand = [];
      s = passUntil(act(s, { type: "passPriority", player: ap }), "upkeep", ap);
      const ids = s.turnOrder.map((pid) => inZone(s, pid, top(pid), "library"));
      return { s, ids };
    };

    it("all four revealed cards are creature cards: each enters under its owner's control", () => {
      let { s, ap } = setup([]);
      putOnBattlefield(s, ap, preserve());
      const r = upkeep(s, ap, () => bear());
      s = settle(r.s);
      r.ids.forEach((id, i) => {
        expect(zone(s, id)).toBe("battlefield");
        expect(controllerOf(s, s.objects[id]!)).toBe(s.turnOrder[i]);
      });
    });

    it("one land among them: none enters", () => {
      let { s, ap } = setup([]);
      putOnBattlefield(s, ap, preserve());
      const opp = next(s, ap, 2);
      const r = upkeep(s, ap, (pid) => (pid === opp ? mountainCard : bear()));
      s = settle(r.s);
      for (const id of r.ids) expect(zone(s, id)).toBe("library");
    });
  });

  describe("Specter's Shriek", () => {
    it("a nonblack card exiled: you exile a card from your hand", () => {
      let { s, ap } = setup([]);
      const opp = next(s, ap);
      s.players[opp]!.hand = [];
      s.players[ap]!.hand = [];
      const theirBear = inZone(s, opp, bear(), "hand");
      const theirZombie = inZone(s, opp, zombie, "hand");
      const sp = inZone(s, ap, shriek(), "hand");
      const mine = inZone(s, ap, ogre, "hand");
      pool(s, ap, { B: 1 });
      s = settle(run(s, planCast(s, ap, sp, [{ kind: "player", id: opp }])), { me: [ap] });
      expect(s.pending?.kind).toBe("searchLibrary");
      expect((s.pending as { cards: string[] }).cards.sort()).toEqual([theirBear, theirZombie].sort());
      s = settle(answer(s, ap, { type: "searchLibrary", player: ap, found: [theirBear] }), { me: [ap] });
      expect(zone(s, theirBear)).toBe("exile");
      // Only one card in your hand: it's exiled.
      if (s.pending) s = settle(answer(s, ap, { type: "discard", player: ap, objectIds: [mine] }), { me: [ap] });
      expect(zone(s, mine)).toBe("exile");
      expect(zone(s, theirZombie)).toBe("hand");
    });

    it("a black card exiled, or none chosen: your hand is kept", () => {
      let { s, ap } = setup([]);
      const opp = next(s, ap);
      s.players[opp]!.hand = [];
      s.players[ap]!.hand = [];
      const theirZombie = inZone(s, opp, zombie, "hand");
      const sp = inZone(s, ap, shriek(), "hand");
      const mine = inZone(s, ap, ogre, "hand");
      pool(s, ap, { B: 1 });
      s = settle(run(s, planCast(s, ap, sp, [{ kind: "player", id: opp }])), { me: [ap] });
      s = settle(answer(s, ap, { type: "searchLibrary", player: ap, found: [theirZombie] }), { me: [ap] });
      expect(zone(s, theirZombie)).toBe("exile");
      expect(zone(s, mine)).toBe("hand");
      expect(s.pending).toBeFalsy();

      const sp2 = inZone(s, ap, shriek(), "hand");
      const theirBear = inZone(s, opp, bear(), "hand");
      pool(s, ap, { B: 1 });
      s = settle(run(s, planCast(s, ap, sp2, [{ kind: "player", id: opp }])), { me: [ap] });
      s = settle(answer(s, ap, { type: "searchLibrary", player: ap, found: [] }), { me: [ap] });
      expect(zone(s, theirBear)).toBe("hand");
      expect(zone(s, mine)).toBe("hand");
    });
  });

  describe("Clash of Elements", () => {
    it("its owner puts it on top and is dealt 2 damage", () => {
      let { s, ap } = setup([]);
      const opp = next(s, ap);
      const theirs = putOnBattlefield(s, opp, bear());
      const c = inZone(s, ap, clash(), "hand");
      pool(s, ap, { U: 1, R: 1, C: 1 });
      s = settle(run(s, planCast(s, ap, c, [tgt(theirs)])), { me: [opp] });
      expect(s.pending?.kind).toBe("chooseOption");
      expect((s.pending as { what: string }).what).toBe("topOrBottom");
      const before = life(s, opp);
      s = settle(answer(s, opp, { type: "chooseOption", player: opp, choice: "top" }));
      expect(s.players[opp]!.library[0]).toBe(theirs);
      expect(life(s, opp)).toBe(before - 2);
    });

    it("or on the bottom, with no damage", () => {
      let { s, ap } = setup([]);
      const opp = next(s, ap);
      const theirs = putOnBattlefield(s, opp, bear());
      const c = inZone(s, ap, clash(), "hand");
      pool(s, ap, { U: 1, R: 1, C: 1 });
      s = settle(run(s, planCast(s, ap, c, [tgt(theirs)])), { me: [opp] });
      const before = life(s, opp);
      s = settle(answer(s, opp, { type: "chooseOption", player: opp, choice: "bottom" }));
      expect(s.players[opp]!.library.at(-1)).toBe(theirs);
      expect(life(s, opp)).toBe(before);
    });
  });

  describe("Scarwood Bandits", () => {
    it("no opponent pays: you control the artifact for as long as the Bandits remain", () => {
      let { s, ap } = setup([]);
      const opp = next(s, ap);
      const sb = putOnBattlefield(s, ap, bandits());
      const r = putOnBattlefield(s, opp, relic);
      const sh = inZone(s, ap, shock, "hand");
      s = run(s, planActivate(s, ap, sb, 0, [tgt(r)]));
      const opps = s.turnOrder.filter((p) => p !== ap);
      for (const p of opps) pool(s, p, { C: 2 });
      s = settle(s, { me: opps });
      for (let i = 0; i < 3; i++) {
        expect(s.pending?.kind).toBe("chooseOption");
        expect((s.pending as { what: string }).what).toBe("punisher");
        const p = s.pending!.player;
        s = settle(answer(s, p, { type: "chooseOption", player: p, choice: "none" }), { me: opps });
      }
      expect(controllerOf(s, s.objects[r]!)).toBe(ap);
      s = settle(run(s, planCast(s, ap, sh, [tgt(sb)])));
      expect(zone(s, sb)).toBe("graveyard");
      expect(controllerOf(s, s.objects[r]!)).toBe(opp);
    });

    it("an opponent pays {2}: no control", () => {
      let { s, ap } = setup([]);
      const opp = next(s, ap);
      const sb = putOnBattlefield(s, ap, bandits());
      const r = putOnBattlefield(s, opp, relic);
      s = run(s, planActivate(s, ap, sb, 0, [tgt(r)]));
      const opps = s.turnOrder.filter((p) => p !== ap);
      for (const p of opps) pool(s, p, { C: 2 });
      s = settle(s, { me: opps });
      const first = s.pending!.player;
      s = settle(answer(s, first, { type: "chooseOption", player: first, choice: "0" }), { me: opps });
      s = settle(answer(s, first, { type: "payUnless", player: first, pay: true }), { me: opps });
      for (let i = 0; i < 3 && s.pending?.kind === "chooseOption"; i++) {
        const p = s.pending.player;
        s = settle(answer(s, p, { type: "chooseOption", player: p, choice: "none" }), { me: opps });
      }
      expect(s.players[first]!.manaPool.C ?? 0).toBe(0);
      expect(controllerOf(s, s.objects[r]!)).toBe(opp);
    });
  });

  describe("Mimeofacture", () => {
    it("searches the target's controller's library for a card with its name, which enters under your control", () => {
      let { s, ap } = setup([]);
      const opp = next(s, ap);
      const theirs = putOnBattlefield(s, opp, bear());
      const m = inZone(s, ap, mimeo(), "hand");
      const named = s.players[opp]!.library.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Grizzly Bears");
      expect(named.length).toBeGreaterThan(0);
      pool(s, ap, { U: 1, C: 3 });
      s = settle(run(s, planCast(s, ap, m, [tgt(theirs)])), { me: [ap] });
      expect(s.pending?.kind).toBe("searchLibrary");
      const cards = (s.pending as { cards: string[] }).cards;
      expect(cards.length).toBe(named.length);
      s = settle(answer(s, ap, { type: "searchLibrary", player: ap, found: [cards[0]!] }));
      expect(zone(s, cards[0]!)).toBe("battlefield");
      expect(controllerOf(s, s.objects[cards[0]!]!)).toBe(ap);
      expect(s.objects[cards[0]!]!.owner).toBe(opp);
      expect(controllerOf(s, s.objects[theirs]!)).toBe(opp);
    });
  });

  describe("bots", () => {
    /** The bot `p` plays its next turn until `done`, its hand being `hand` only. */
    const botTurn = (s: GameState, ap: PlayerId, p: PlayerId, hand: string[], done: (s: GameState) => boolean) => {
      for (const q of s.players) q.hand = [];
      let s1 = passUntil(act(s, { type: "passPriority", player: ap }), "main1", p);
      s1.players[p]!.hand = [...hand];
      for (let i = 0; i < 400 && !done(s1) && s1.activePlayer === p; i++) {
        const q = s1.pending?.player ?? waitingOn(s1)!;
        for (const a of botActions(s1, q)) s1 = act(s1, a);
      }
      return settle(s1);
    };

    it("Carry Away: a bot takes an opponent's Equipment, not its own", () => {
      const { s, ap } = setup([]);
      const bot = next(s, ap);
      const mine = putOnBattlefield(s, bot, sword);
      const theirs = putOnBattlefield(s, ap, sword);
      const holder = putOnBattlefield(s, ap, bear());
      s.objects[theirs]!.attachedTo = holder;
      for (const l of [card("Island", "Basic Land — Island"), card("Island", "Basic Land — Island")]) putOnBattlefield(s, bot, l);
      const ca = inZone(s, bot, carry(), "hand");
      const s1 = botTurn(s, ap, bot, [ca], (x) => x.objects[ca]!.zone !== "hand");
      expect(zone(s1, ca)).toBe("battlefield");
      expect(s1.objects[ca]!.attachedTo).toBe(theirs);
      expect(controllerOf(s1, s1.objects[theirs]!)).toBe(bot);
      expect(controllerOf(s1, s1.objects[mine]!)).toBe(bot);
    });

    it("Scarwood Bandits: a bot aims it at an opponent's artifact", () => {
      const { s, ap } = setup([]);
      const bot = next(s, ap);
      const sb = putOnBattlefield(s, bot, bandits());
      const mine = putOnBattlefield(s, bot, card("Test Relic Mine", "Artifact", "{2}", { cmc: 2 }));
      putOnBattlefield(s, ap, relic);
      // Big blockers keep the Bandits home (and ap's lands aren't Forests); no commander to spend the mana on.
      for (const p of s.turnOrder) if (p !== bot) putOnBattlefield(s, p, big);
      s.players[bot]!.command = [];
      for (const id of [...s.battlefield]) if (s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.name === "Forest") moveObject(s, id, "graveyard");
      for (const l of [card("Forest", "Basic Land — Forest"), card("Forest", "Basic Land — Forest"), card("Forest", "Basic Land — Forest")]) putOnBattlefield(s, bot, l);
      const s1 = botTurn(s, ap, bot, [], (x) => x.log.some((l) => l.text.includes("activates Scarwood Bandits")));
      expect(controllerOf(s1, s1.objects[mine]!)).toBe(bot);
      const line = s1.log.find((l) => l.text.includes("activates Scarwood Bandits"))?.text ?? "";
      expect(line).toMatch(/targeting Test Relic\.?$/);
    });
  });
});
