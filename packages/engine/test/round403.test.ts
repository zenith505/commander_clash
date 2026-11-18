// Round 403 (Lane A): Capricopian ("Only the player ~ is attacking may activate this ability and only during the declare
// attackers step": that player reselects which player it attacks, CR 602.2, 113.8, 506.2), Archelos, Lagoon Mystic
// (other permanents enter tapped or untapped as it is, CR 614.1c; its controller orders those replacement effects with
// others, CR 616.1) and Wizard's Spellbook (a d20 table copying the card it exiled, or every card exiled with it, CR 607.2a,
// 706.3a, 707.12).

import { describe, expect, it } from "vitest";
import { act, forest, passUntil, putOnBattlefield, setup } from "./helpers";
import { enterTogether, moveObject } from "../src/game";
import { abilityProblem, applyAction, botActions, characteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real card data (Scryfall).
const capri = (): CardDef => ({"oracleId":"3a5a6732-bdfa-4b64-b897-6817983dbb0e","name":"Capricopian","manaCost":"{X}{G}","cmc":1,"typeLine":"Creature — Goat Hydra","supertypes":[],"types":["Creature"],"subtypes":["Goat","Hydra"],"oracleText":"This creature enters with X +1/+1 counters on it.\n{2}: Put a +1/+1 counter on this creature, then you may reselect which player this creature is attacking. Only the player this creature is attacking may activate this ability and only during the declare attackers step. (It can't attack its controller.)","power":"0","toughness":"0","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/b/0b81f82a-f004-44f3-9dad-1675941fe57b.jpg?1783931211","artUrl":"https://cards.scryfall.io/art_crop/front/0/b/0b81f82a-f004-44f3-9dad-1675941fe57b.jpg?1783931211","commanderLegal":"legal","set":"c20","releasedAt":"2020-04-17","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const archelos = (): CardDef => ({"oracleId":"fd19a009-d1ab-4148-a829-3d4c3af1b0b2","name":"Archelos, Lagoon Mystic","manaCost":"{1}{B}{G}{U}","cmc":4,"typeLine":"Legendary Creature — Turtle Shaman","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Turtle","Shaman"],"oracleText":"As long as Archelos is tapped, other permanents enter tapped.\nAs long as Archelos is untapped, other permanents enter untapped.","power":"2","toughness":"4","colors":["B","G","U"],"colorIdentity":["B","G","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/a/eafb8740-1bab-4f5e-96d1-79f1f04cc0d8.jpg?1783928780","artUrl":"https://cards.scryfall.io/art_crop/front/e/a/eafb8740-1bab-4f5e-96d1-79f1f04cc0d8.jpg?1783928780","commanderLegal":"legal","set":"cmr","releasedAt":"2020-11-20","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const book = (): CardDef => ({"oracleId":"740fe41a-16bb-4c97-a03c-f678f15a0a0c","name":"Wizard's Spellbook","manaCost":"{5}{U}{U}","cmc":7,"typeLine":"Artifact — Book","supertypes":[],"types":["Artifact"],"subtypes":["Book"],"oracleText":"{T}: Exile target instant or sorcery card from a graveyard. Roll a d20. Activate only as a sorcery.\n1—9 | Copy that card. You may cast the copy.\n10—19 | Copy that card. You may cast the copy by paying {1} rather than paying its mana cost.\n20 | Copy each card exiled with this artifact. You may cast any number of the copies without paying their mana costs.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/6/b6ed0a4c-0234-4341-8dcb-5eea6a9632e7.jpg?1783926504","artUrl":"https://cards.scryfall.io/art_crop/front/b/6/b6ed0a4c-0234-4341-8dcb-5eea6a9632e7.jpg?1783926504","commanderLegal":"legal","set":"afr","releasedAt":"2021-07-23","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const gate = (): CardDef => ({"oracleId":"52d14717-0cbc-4d7e-b546-54ea91580338","name":"Dimir Guildgate","manaCost":"","cmc":0,"typeLine":"Land — Gate","supertypes":[],"types":["Land"],"subtypes":["Gate"],"oracleText":"This land enters tapped.\n{T}: Add {U} or {B}.","colors":[],"colorIdentity":["B","U"],"keywords":[],"producedMana":["B","U"],"imageUrl":"https://cards.scryfall.io/normal/front/3/6/3694ac90-e71e-4736-8945-7dbf5b5fd6a9.jpg?1783934103","artUrl":"https://cards.scryfall.io/art_crop/front/3/6/3694ac90-e71e-4736-8945-7dbf5b5fd6a9.jpg?1783934103","commanderLegal":"legal","set":"grn","releasedAt":"2018-10-05","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const spelunking = (): CardDef => ({"oracleId":"2962fe4c-bf48-454b-8a6b-0f8253352ae8","name":"Spelunking","manaCost":"{2}{G}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, draw a card, then you may put a land card from your hand onto the battlefield. If you put a Cave onto the battlefield this way, you gain 4 life.\nLands you control enter untapped.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/3/d3be4257-2316-4a2e-b347-f71c0368a947.jpg?1783913740","artUrl":"https://cards.scryfall.io/art_crop/front/d/3/d3be4257-2316-4a2e-b347-f71c0368a947.jpg?1783913740","commanderLegal":"legal","set":"lci","releasedAt":"2023-11-17","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const elves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const jace = (): CardDef => ({"oracleId":"cc2b6e58-2d6f-495e-95f3-9496105c4cba","name":"Jace Beleren","manaCost":"{1}{U}{U}","cmc":3,"typeLine":"Legendary Planeswalker — Jace","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Jace"],"oracleText":"+2: Each player draws a card.\n−1: Target player draws a card.\n−10: Target player mills twenty cards.","loyalty":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/b/c/bc836203-4bb9-4bfa-89ab-0ad49f916c92.jpg?1783942523","artUrl":"https://cards.scryfall.io/art_crop/front/b/c/bc836203-4bb9-4bfa-89ab-0ad49f916c92.jpg?1783942523","commanderLegal":"legal","set":"dd2","releasedAt":"2008-11-07","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; other players' questions are answered as the bots would. Stops at any question of `me`'s. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
/** Moves a card already put onto the battlefield into a zone of its owner's. */
const into = (s: GameState, id: ObjectId, z: "hand" | "graveyard") => {
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  s.players[s.objects[id]!.owner]![z].push(id);
  return id;
};

describe("round 403: parse", () => {
  it("every card of the round is fully supported", () => {
    for (const d of [capri(), archelos(), book()]) expect(isFullySupported(d), d.name).toBe(true);
  });
});

describe("round 403: Capricopian", () => {
  /** `opp` attacks `ap` with a Capricopian with two +1/+1 counters; then `ap` has priority in the declare attackers step. */
  const attacked = (defender?: (s: GameState, ap: PlayerId, opp: PlayerId) => PlayerId) => {
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, opp, capri());
    s0.objects[c]!.counters["+1/+1"] = 2;
    let s = passUntil(s0, "declareAttackers", opp);
    const at = defender ? defender(s, ap, opp) : ap;
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: c, defender: at }] });
    for (let i = 0; i < 8 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    return { s, ap, opp, c };
  };

  it("the player it attacks pays {2}: a +1/+1 counter, then it attacks another player, still declared at the first", () => {
    const { s: s0, ap, opp, c } = attacked();
    expect(s0.step).toBe("declareAttackers");
    let s = settle(run(s0, planActivate(s0, ap, c, 0)), ap);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "reselectAttack", player: ap });
    const options = s.pending?.kind === "chooseOption" ? s.pending.options : [];
    expect(options).toContain("keep");
    expect(options).not.toContain(String(opp)); // never its controller (CR 506.2)
    expect(options).not.toContain(String(ap)); // what it attacks now is "keep"
    const other = s.turnOrder.find((p) => p !== ap && p !== opp)!;
    s = act(s, { type: "chooseOption", player: ap, choice: String(other) });
    expect(s.objects[c]!.counters["+1/+1"]).toBe(3);
    expect(s.objects[c]!.attacking).toBe(other);
    expect(s.objects[c]!.attacked?.players).toEqual([ap]);
  });

  it("only players are offered, no planeswalker; keeping it on you still gives the counter", () => {
    const { s: s0, ap, c } = attacked();
    const other = s0.turnOrder.find((p) => p !== ap && s0.objects[c]!.controller !== p)!;
    const j = putOnBattlefield(s0, other, jace());
    s0.objects[j]!.counters.loyalty = 3;
    let s = settle(run(s0, planActivate(s0, ap, c, 0)), ap);
    const options = s.pending?.kind === "chooseOption" ? s.pending.options : [];
    expect(options.some((o) => o.includes(":"))).toBe(false);
    s = act(s, { type: "chooseOption", player: ap, choice: "keep" });
    expect(s.objects[c]!.counters["+1/+1"]).toBe(3);
    expect(s.objects[c]!.attacking).toBe(ap);
  });

  it("only the player it's attacking may activate it: not its controller, not another player", () => {
    const { s, ap, opp, c } = attacked();
    expect(abilityProblem(s, opp, c, 0)).toMatch(/only the player Capricopian is attacking/);
    const third = s.turnOrder.find((p) => p !== ap && p !== opp)!;
    expect(abilityProblem(s, third, c, 0)).toMatch(/only the player Capricopian is attacking/);
    expect(planActivate(s, ap, c, 0)).not.toBeNull();
  });

  it("not while it attacks a planeswalker (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, opp, capri());
    s0.objects[c]!.counters["+1/+1"] = 2;
    const j = putOnBattlefield(s0, ap, jace());
    s0.objects[j]!.counters.loyalty = 3;
    let s = passUntil(s0, "declareAttackers", opp);
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: c, defender: ap, planeswalker: j }] });
    for (let i = 0; i < 8 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[c]!.attackingPermanent?.id).toBe(j);
    expect(abilityProblem(s, ap, c, 0)).toMatch(/only the player Capricopian is attacking/);
  });

  it("not outside the declare attackers step", () => {
    const { s: s0, ap, c } = attacked();
    let s = s0;
    for (let i = 0; i < 30 && s.step === "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
    for (let i = 0; i < 8 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.step).toBe("declareBlockers");
    expect(abilityProblem(s, ap, c, 0)).toBeTruthy();
    expect(planActivate(s, ap, c, 0)).toBeNull();
    expect(characteristics(s, s.objects[c]!).power).toBe(2);
  });

  it("a bot it attacks sends it to another player", () => {
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, ap, capri());
    s0.objects[c]!.counters["+1/+1"] = 2;
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, opp, forest);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: c, defender: opp }] });
    for (let i = 0; i < 40 && s.step === "declareAttackers"; i++) {
      const p = waitingOn(s)!;
      if (p === ap && !s.pending) s = act(s, { type: "passPriority", player: ap });
      else for (const a of botActions(s, p)) s = act(s, a);
    }
    expect(s.objects[c]!.attacking).not.toBe(opp);
    expect(s.objects[c]!.attacking).not.toBe(ap);
    expect(s.objects[c]!.counters["+1/+1"]).toBeGreaterThanOrEqual(3);
  });
});

describe("round 403: Archelos, Lagoon Mystic", () => {
  it("untapped, with a land that enters tapped: the land's controller chooses tapped or untapped", () => {
    for (const choice of ["tapped", "untapped"] as const) {
      const { s: s0, ap, ids } = setup([gate()]);
      putOnBattlefield(s0, ap, archelos());
      let s = act(s0, { type: "playLand", player: ap, objectId: ids[0]! });
      expect(s.pending).toMatchObject({ kind: "chooseOption", what: "tapOrder", player: ap, options: ["untapped", "tapped"] });
      s = act(s, { type: "chooseOption", player: ap, choice });
      expect(zone(s, ids[0]!)).toBe("battlefield");
      expect(s.objects[ids[0]!]!.tapped).toBe(choice === "tapped");
    }
  });

  it("an opponent's Archelos: the entering permanent's controller still chooses; a bot chooses untapped", () => {
    const { s: s0, ap, opp, ids } = setup([gate()]);
    putOnBattlefield(s0, opp, archelos());
    let s = act(s0, { type: "playLand", player: ap, objectId: ids[0]! });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "tapOrder", player: ap });
    for (const a of botActions(s, ap)) s = act(s, a);
    expect(s.objects[ids[0]!]!.tapped).toBe(false);
  });

  it("untapped: a permanent put onto the battlefield tapped with no replacement effect enters untapped (rulings)", () => {
    const { s: s0, ap, ids } = setup([elves()]);
    putOnBattlefield(s0, ap, archelos());
    moveObject(s0, ids[0]!, "battlefield", { tapped: true });
    expect(s0.pending).toBeFalsy();
    expect(s0.objects[ids[0]!]!.tapped).toBe(false);
  });

  it("tapped: other permanents enter tapped, a creature spell and a basic land, with no choice", () => {
    const { s: s0, ap, ids } = setup([elves(), forest]);
    const a = putOnBattlefield(s0, ap, archelos());
    s0.objects[a]!.tapped = true;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(s.objects[ids[0]!]!.tapped).toBe(true);
    s = act(s, { type: "playLand", player: ap, objectId: ids[1]! });
    expect(s.pending).toBeFalsy();
    expect(s.objects[ids[1]!]!.tapped).toBe(true);
  });

  it("tapped, with Spelunking's \"Lands you control enter untapped\": the land's controller chooses", () => {
    const { s: s0, ap, ids } = setup([forest]);
    const a = putOnBattlefield(s0, ap, archelos());
    s0.objects[a]!.tapped = true;
    putOnBattlefield(s0, ap, spelunking());
    let s = act(s0, { type: "playLand", player: ap, objectId: ids[0]! });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "tapOrder", player: ap });
    s = act(s, { type: "chooseOption", player: ap, choice: "untapped" });
    expect(s.objects[ids[0]!]!.tapped).toBe(false);
  });

  it("one tapped and one untapped Archelos: the entering permanent's controller orders them (rulings)", () => {
    const { s: s0, ap, ids } = setup([forest]);
    const a = putOnBattlefield(s0, ap, archelos());
    s0.objects[a]!.tapped = true;
    putOnBattlefield(s0, ap, archelos());
    let s = act(s0, { type: "playLand", player: ap, objectId: ids[0]! });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "tapOrder" });
    s = act(s, { type: "chooseOption", player: ap, choice: "tapped" });
    expect(s.objects[ids[0]!]!.tapped).toBe(true);
  });

  it("doesn't apply to permanents entering at the same time as it (rulings), nor to itself", () => {
    const { s: s0, ids } = setup([archelos(), gate()]);
    enterTogether(s0, () => {
      moveObject(s0, ids[0]!, "battlefield");
      moveObject(s0, ids[1]!, "battlefield");
    });
    expect(s0.pending).toBeFalsy();
    expect(s0.objects[ids[0]!]!.tapped).toBe(false);
    expect(s0.objects[ids[1]!]!.tapped).toBe(true);
  });
});

describe("round 403: Wizard's Spellbook", () => {
  /** Ap's Spellbook targets Divination in opp's graveyard; the roll is made to land in `[min, max]`. */
  const activateAt = (min: number, max: number, extra?: (s: GameState, ap: PlayerId, b: ObjectId) => void) => {
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, ap, book());
    const d = into(s0, putOnBattlefield(s0, opp, divination()), "graveyard");
    extra?.(s0, ap, b);
    const s1 = run(s0, planActivate(s0, ap, b, 0, [{ kind: "object", id: d }]));
    for (let k = 0; k < 200; k++) {
      const t0 = structuredClone(s1);
      t0.rngState = k * 7919;
      const t = settle(t0, ap);
      const roll = Number(/rolls a d20 for Wizard's Spellbook: (\d+)/.exec(t.log.map((l) => l.text).join("\n"))?.[1]);
      if (roll >= min && roll <= max) return { s: t, ap, opp, b, d, roll };
    }
    throw new Error("no such roll");
  };

  it("1—9: the card exiled with it is copied, and the copy cast paying its costs", () => {
    const { s: s0, ap, d } = activateAt(1, 9);
    expect(zone(s0, d)).toBe("exile");
    expect(s0.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong", options: [d, "none"] });
    let s = act(s0, { type: "chooseOption", player: ap, choice: d });
    expect(s.pending).toMatchObject({ kind: "castFree", how: "paid" });
    const copy = s.pending?.kind === "castFree" ? s.pending.objectId : "";
    const hand0 = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, copy, [])), ap);
    expect(s.players[ap]!.hand.length).toBe(hand0 + 2);
    expect(zone(s, d)).toBe("exile");
  });

  it("10—19: the copy may be cast for {1} rather than its mana cost", () => {
    const { s: s0, ap, d } = activateAt(10, 19);
    expect(s0.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong" });
    expect(s0.pending?.kind === "chooseOption" ? s0.pending.prompt : "").toMatch(/paying \{1\}/);
    let s = act(s0, { type: "chooseOption", player: ap, choice: d });
    const copy = s.pending?.kind === "castFree" ? s.pending.objectId : "";
    expect(copy).toBeTruthy();
    const hand0 = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, copy, [])), ap);
    expect(s.players[ap]!.hand.length).toBe(hand0 + 2);
  });

  it("20: every card exiled with it is copied, the copies cast free; declining leaves them exiled", () => {
    let first = "";
    const { s: s0, ap, d } = activateAt(20, 20, (s, _ap, b) => {
      // A card exiled with this Spellbook earlier (CR 607.2a).
      first = into(s, putOnBattlefield(s, _ap, bolt()), "graveyard");
      moveObject(s, first, "exile");
      (s.linkedExile ??= {})[`${b}@0`] = [{ id: first, zc: s.objects[first]!.zoneChanges ?? 0 }];
    });
    expect(s0.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong" });
    const options = s0.pending?.kind === "chooseOption" ? s0.pending.options : [];
    expect(options).toEqual(expect.arrayContaining([d, first, "none"]));
    expect(s0.pending?.kind === "chooseOption" ? s0.pending.prompt : "").toMatch(/without paying/);
    const s = settle(act(s0, { type: "chooseOption", player: ap, choice: "none" }), ap);
    expect(s.pending).toBeFalsy();
    expect(zone(s, d)).toBe("exile");
    expect(zone(s, first)).toBe("exile");
  });

  it("only as a sorcery", () => {
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, ap, book());
    const d = into(s0, putOnBattlefield(s0, opp, divination()), "graveyard");
    const s = passUntil(s0, "end", ap);
    expect(planActivate(s, ap, b, 0, [{ kind: "object", id: d }])).toBeNull();
  });
});
