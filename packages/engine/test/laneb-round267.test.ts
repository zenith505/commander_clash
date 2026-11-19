// Lane B round B267: Taster of Wares (an opponent reveals X cards, you choose one, it's exiled, and an instant or sorcery
// card exiled this way may be cast while you control it), Grip of Chaos (a single target reselected at random, CR 603.4),
// Curse of Leeches (attached to a player as it transforms into its Aura face, CR 712.20) and The Seventh Doctor (a card
// chosen secretly, a guess, a free cast or a Clue).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup, target } from "./helpers";
import { applyAction, botActions, characteristics, controllerOf, setFace, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";
import { setDayNight } from "../src/daynight";
import { runStateBasedActions } from "../src/game";

// Real card data (Scryfall).
const tasterOfWares = (): CardDef => ({"oracleId":"020aae46-cdba-4c37-9c54-283727c09994","name":"Taster of Wares","manaCost":"{2}{B}","cmc":3,"typeLine":"Creature — Goblin Warlock","supertypes":[],"types":["Creature"],"subtypes":["Goblin","Warlock"],"oracleText":"When this creature enters, target opponent reveals X cards from their hand, where X is the number of Goblins you control. You choose one of those cards. That player exiles it. If an instant or sorcery card is exiled this way, you may cast it for as long as you control this creature, and mana of any type can be spent to cast that spell.","power":"3","toughness":"2","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/c/bc0b64b6-8984-431c-8a2f-84402b429e2b.jpg?1783904460","artUrl":"https://cards.scryfall.io/art_crop/front/b/c/bc0b64b6-8984-431c-8a2f-84402b429e2b.jpg?1783904460","layout":"normal"});
const gripOfChaos = (): CardDef => ({"oracleId":"ca2e0c8f-7ece-465f-9103-ba60712eacf7","name":"Grip of Chaos","manaCost":"{4}{R}{R}","cmc":6,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever a spell or ability is put onto the stack, if it has a single target, reselect its target at random. (Select from among all legal targets.)","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/e/defbbd3a-0e7d-4af2-b25f-9003ddad0bf5.jpg?1783944873","artUrl":"https://cards.scryfall.io/art_crop/front/d/e/defbbd3a-0e7d-4af2-b25f-9003ddad0bf5.jpg?1783944873","layout":"normal"});
const curseOfLeeches = (): CardDef => ({"oracleId":"44eb0caa-ba16-49e4-915c-bd5e1ce770e6","name":"Curse of Leeches // Leeching Lurker","manaCost":"{2}{B}","cmc":3,"typeLine":"Enchantment — Aura Curse // Creature — Leech Horror","supertypes":[],"types":["Enchantment"],"subtypes":["Aura","Curse"],"oracleText":"Enchant player\nAs this permanent transforms into Curse of Leeches, attach it to a player.\nAt the beginning of enchanted player's upkeep, they lose 1 life and you gain 1 life.\nDaybound (If a player casts no spells during their own turn, it becomes night next turn.)","colors":["B"],"colorIdentity":["B"],"keywords":["Lifelink","Transform","Daybound","Enchant","Nightbound"],"imageUrl":"https://cards.scryfall.io/normal/front/3/3/3327a287-a6db-49a4-9d25-315f3c93a930.jpg?1783924431","artUrl":"https://cards.scryfall.io/art_crop/front/3/3/3327a287-a6db-49a4-9d25-315f3c93a930.jpg?1783924431","layout":"transform","faces":[{"name":"Curse of Leeches","manaCost":"{2}{B}","typeLine":"Enchantment — Aura Curse","supertypes":[],"types":["Enchantment"],"subtypes":["Aura","Curse"],"oracleText":"Enchant player\nAs this permanent transforms into Curse of Leeches, attach it to a player.\nAt the beginning of enchanted player's upkeep, they lose 1 life and you gain 1 life.\nDaybound (If a player casts no spells during their own turn, it becomes night next turn.)","colors":["B"],"imageUrl":"https://cards.scryfall.io/normal/front/3/3/3327a287-a6db-49a4-9d25-315f3c93a930.jpg?1783924431","artUrl":"https://cards.scryfall.io/art_crop/front/3/3/3327a287-a6db-49a4-9d25-315f3c93a930.jpg?1783924431"},{"name":"Leeching Lurker","manaCost":"","typeLine":"Creature — Leech Horror","supertypes":[],"types":["Creature"],"subtypes":["Leech","Horror"],"oracleText":"Lifelink\nNightbound (If a player casts at least two spells during their own turn, it becomes day next turn.)","power":"4","toughness":"4","colors":["B"],"colorIndicator":["B"],"imageUrl":"https://cards.scryfall.io/normal/back/3/3/3327a287-a6db-49a4-9d25-315f3c93a930.jpg?1783924431","artUrl":"https://cards.scryfall.io/art_crop/back/3/3/3327a287-a6db-49a4-9d25-315f3c93a930.jpg?1783924431"}]});
const seventhDoctor = (): CardDef => ({"oracleId":"43e1b053-2cb9-4b1d-9e38-100cfa7267b6","name":"The Seventh Doctor","manaCost":"{3}{W}{U}","cmc":5,"typeLine":"Legendary Creature — Time Lord Doctor","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Time Lord","Doctor"],"oracleText":"Whenever The Seventh Doctor attacks, choose a card in your hand. Defending player guesses whether that card's mana value is greater than the number of artifacts you control. If they guessed wrong, you may cast it without paying its mana cost. If you don't cast a spell this way, investigate. (Create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")","power":"3","toughness":"6","colors":["U","W"],"colorIdentity":["U","W"],"keywords":["Investigate"],"imageUrl":"https://cards.scryfall.io/normal/front/6/e/6e7c642d-3c32-4a16-8da5-fd1505e571d1.jpg?1783914527","artUrl":"https://cards.scryfall.io/art_crop/front/6/e/6e7c642d-3c32-4a16-8da5-fd1505e571d1.jpg?1783914527","layout":"normal"});
const goblinPiker = (): CardDef => ({"oracleId":"50608184-90d3-43d2-a221-deb186c78323","name":"Goblin Piker","manaCost":"{1}{R}","cmc":2,"typeLine":"Creature — Goblin Warrior","supertypes":[],"types":["Creature"],"subtypes":["Goblin","Warrior"],"oracleText":"","power":"2","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/7/2786834d-dbda-40ce-82a4-e518cd554312.jpg?1783946464","artUrl":"https://cards.scryfall.io/art_crop/front/2/7/2786834d-dbda-40ce-82a4-e518cd554312.jpg?1783946464","layout":"normal"});
const giantGrowth = (): CardDef => ({"oracleId":"5748ebf1-24e3-499d-ab7c-c2cebd462a24","name":"Giant Growth","manaCost":"{G}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target creature gets +3/+3 until end of turn.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/d/fd1f95bf-48ea-455a-8a6c-0249b11c8900.jpg?1783902918","artUrl":"https://cards.scryfall.io/art_crop/front/f/d/fd1f95bf-48ea-455a-8a6c-0249b11c8900.jpg?1783902918","layout":"normal"});
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","layout":"normal"});
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","layout":"normal"});
const prodigalSorcerer = (): CardDef => ({"oracleId":"5e961d15-5972-4e4b-9385-1cd7cd7c6bbe","name":"Prodigal Sorcerer","manaCost":"{2}{U}","cmc":3,"typeLine":"Creature — Human Wizard Sorcerer","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard","Sorcerer"],"oracleText":"{T}: This creature deals 1 damage to any target.","power":"1","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/0/50aef269-55f9-4d84-8bc5-29e794297f11.jpg?1783937607","artUrl":"https://cards.scryfall.io/art_crop/front/5/0/50aef269-55f9-4d84-8bc5-29e794297f11.jpg?1783937607","layout":"normal"});
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","layout":"normal"});
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","layout":"normal"});
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","layout":"normal"});
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","layout":"normal"});
const llanowarElves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","layout":"normal"});
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","layout":"normal"});
const blazingVolley = (): CardDef => ({"oracleId":"f1c26b25-371e-4fbf-a43d-7fd59a364d3a","name":"Arc Trail","manaCost":"{1}{R}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Arc Trail deals 2 damage to any target and 1 damage to any other target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/4/445e3a0a-29a7-4dc0-80fe-569b9e751db3.jpg?1783941727","artUrl":"https://cards.scryfall.io/art_crop/front/4/4/445e3a0a-29a7-4dc0-80fe-569b9e751db3.jpg?1783941727","layout":"normal"});

const supported = (...ds: CardDef[]) => ds.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 400 && !s.over && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Plays on with no attacks or blocks until `done`, stopping at any other question. */
const until = (s: GameState, done: (s: GameState) => boolean, max = 3000) => {
  for (let i = 0; i < max && !s.over; i++) {
    if (done(s)) return s;
    const pid = waitingOn(s)!;
    const p = s.pending;
    if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (p?.kind === "pickPermanents" && p.action === "keepTapped") s = act(s, { type: "pickPermanents", player: pid, ids: [] });
    else if (p?.kind === "discardToHandSize") s = act(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, p.count) });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: pid });
  }
  return s;
};
const ptgt = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const logged = (s: GameState, re: RegExp) => s.log.some((l) => re.test(l.text));
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
/** A fresh copy of `def` in `pid`'s hand. */
const inHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Answers every question with the bots' answers until none is left (at most `max`). */
const bots = (s: GameState, max = 30) => {
  for (let i = 0; i < max && s.pending; i++) for (const a of botActions(s, s.pending.player)) s = act(s, a);
  return s;
};
const pend = (s: GameState) => JSON.stringify(s.pending)?.slice(0, 400);

/** Taster of Wares cast and its trigger aimed at `opp`, who has `hand` (and nothing else) in hand, up to their reveal. */
const tasterVs = (hand: CardDef[], goblins = 1) => {
  const { s: s0, ap, ids, opp } = setup([tasterOfWares()]);
  for (let i = 1; i < goblins; i++) putOnBattlefield(s0, ap, goblinPiker());
  s0.players[opp]!.hand = [];
  const cards = hand.map((d) => inHand(s0, opp, d));
  let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
  s = settle(act(s, { type: "chooseTargets", player: ap, targets: [ptgt(opp)] }));
  // With only as many cards as must be picked, they're picked.
  for (let i = 0; i < 3 && s.pending?.kind === "searchLibrary" && s.pending.cards.length === s.pending.min; i++) s = settle(act(s, { type: "searchLibrary", player: s.pending.player, found: [...s.pending.cards] }));
  return { s, ap, opp, taster: ids[0]!, cards };
};

describe("Taster of Wares", () => {
  it("is supported", () => supported(tasterOfWares(), gripOfChaos(), curseOfLeeches(), seventhDoctor()));

  it("the opponent reveals X cards of their choice, you choose one, it's exiled; an instant may be cast while you control ~, with any type of mana", () => {
    let { s, ap, opp, taster, cards } = tasterVs([lightningBolt(), divination(), grizzlyBears()], 2);
    const [bolt, div, bears] = cards as [string, string, string];
    // X is 2 (Taster and Goblin Piker): they choose which two to reveal (CR 609.3).
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: opp, min: 2, max: 2, fromHand: true, reveal: true });
    s = settle(act(s, { type: "searchLibrary", player: opp, found: [bolt, bears] }));
    // You choose one of those two.
    expect(s.pending).toMatchObject({ player: ap });
    expect(JSON.stringify(s.pending)).not.toContain(div);
    s = s.pending!.kind === "searchLibrary" ? settle(act(s, { type: "searchLibrary", player: ap, found: [bolt] })) : settle(act(s, { type: "chooseOption", player: ap, choice: bolt }));
    expect(s.pending).toBeNull();
    expect(zone(s, bolt)).toBe("exile");
    expect(zone(s, bears)).toBe("hand");
    expect(s.objects[bolt]!.mayPlay).toMatchObject({ player: ap, until: "whileControlled", anyType: true, castOnly: true });
    // Paid with any land (its usual cost, CR 609.4b).
    const plan = planCast(s, ap, bolt, [ptgt(opp)]);
    expect(plan).not.toBeNull();
    const life = s.players[opp]!.life;
    s = settle(run(s, plan));
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(zone(s, taster)).toBe("battlefield");
  });

  it("a creature card exiled this way can't be cast; an instant can't be once Taster of Wares has left", () => {
    let { s, ap, cards } = tasterVs([grizzlyBears()]);
    expect(zone(s, cards[0]!)).toBe("exile");
    expect(s.objects[cards[0]!]!.mayPlay).toBeUndefined();
    expect(planCast(s, ap, cards[0]!)).toBeNull();
    const t = tasterVs([lightningBolt()]);
    s = t.s;
    expect(zone(s, t.cards[0]!)).toBe("exile");
    expect(planCast(s, t.ap, t.cards[0]!, [ptgt(t.opp)])).not.toBeNull();
    s.objects[t.taster]!.zone = "graveyard";
    s.battlefield.splice(s.battlefield.indexOf(t.taster), 1);
    s.players[t.ap]!.graveyard.push(t.taster);
    s.objects[t.taster]!.zoneChanges = (s.objects[t.taster]!.zoneChanges ?? 0) + 1;
    invalidateCharacteristics(s);
    expect(planCast(s, t.ap, t.cards[0]!, [ptgt(t.opp)])).toBeNull();
  });

  it("a sorcery exiled this way keeps its timing (rulings)", () => {
    let { s, ap, cards } = tasterVs([divination()]);
    expect(zone(s, cards[0]!)).toBe("exile");
    // In your main phase with an empty stack, paying its cost.
    expect(planCast(s, ap, cards[0]!)).not.toBeNull();
    s = run(s, planCast(s, ap, cards[0]!));
    expect(zone(s, cards[0]!)).toBe("stack");
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBeGreaterThanOrEqual(2);
  });

  it("bots answer the reveal and the choice", () => {
    let { s, ap, cards } = tasterVs([lightningBolt(), grizzlyBears()]);
    s = settle(bots(s));
    expect(s.pending).toBeNull();
    expect(cards.filter((id) => zone(s, id) === "exile")).toHaveLength(1);
    expect(s.objects[cards.find((id) => zone(s, id) === "exile")!]!.mayPlay?.player === ap || zone(s, cards[1]!) === "exile").toBe(true);
  });
});

describe("Grip of Chaos", () => {
  it("a spell with a single target gets one of its legal targets at random, the original among them (rulings)", () => {
    const seen = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const { s: s0, ap, ids, opp } = setup([shock()], seed);
      putOnBattlefield(s0, opp, gripOfChaos());
      const bears = putOnBattlefield(s0, opp, grizzlyBears());
      let s = run(s0, planCast(s0, ap, ids[0]!, [target(bears)]));
      // Its trigger goes on the stack above the spell, which keeps its target until it resolves (rulings).
      expect(s.stack.map((x) => x.kind)).toEqual(["spell", "ability"]);
      expect(s.stack[0]!.targets).toMatchObject([{ kind: "object", id: bears }]);
      s = act(s, { type: "passPriority", player: waitingOn(s)! });
      for (let i = 0; i < 10 && s.stack.length === 2; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      expect(s.stack).toHaveLength(1);
      const t = s.stack[0]!.targets![0]!;
      seen.add(t.kind === "player" ? `p${t.id}` : t.kind === "object" ? t.id : "?");
      expect(logged(s, /Grip of Chaos reselects the target of Shock at random/)).toBe(true);
      s = settle(s);
      expect(s.pending).toBeNull();
    }
    // Over several games it lands on players, creatures, and sometimes stays.
    expect(seen.size).toBeGreaterThan(2);
  });

  it("only one trigger each time: changing the target doesn't put anything onto the stack; two Grips each trigger", () => {
    const { s: s0, ap, ids, opp } = setup([shock()]);
    putOnBattlefield(s0, opp, gripOfChaos());
    putOnBattlefield(s0, ap, gripOfChaos());
    const bears = putOnBattlefield(s0, opp, grizzlyBears());
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(bears)]));
    expect(s.stack.filter((x) => x.kind === "ability")).toHaveLength(2);
    s = settle(s);
    expect(s.log.filter((l) => /Grip of Chaos reselects/.test(l.text))).toHaveLength(2);
  });

  it("an activated ability and a triggered ability with a single target trigger it too; a spell with two targets doesn't", () => {
    const { s: s0, ap, ids, opp } = setup([blazingVolley()]);
    putOnBattlefield(s0, opp, gripOfChaos());
    const sorcerer = putOnBattlefield(s0, ap, prodigalSorcerer());
    const bears = putOnBattlefield(s0, opp, grizzlyBears());
    // Arc Trail: two targets.
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(bears), ptgt(opp)]));
    expect(s.stack.filter((x) => x.kind === "ability")).toHaveLength(0);
    s = settle(s);
    // Prodigal Sorcerer's ability: one target.
    s = act(s, { type: "activateAbility", player: ap, objectId: sorcerer, index: 0, targets: [ptgt(opp)] } as Action);
    expect(s.stack.filter((x) => x.kind === "ability")).toHaveLength(2);
    s = settle(s);
    expect(logged(s, /Grip of Chaos reselects the target of Prodigal Sorcerer/)).toBe(true);
  });

  it("with no other legal target, it keeps its target", () => {
    const { s: s0, ap, ids } = setup([giantGrowth()]);
    putOnBattlefield(s0, ap, gripOfChaos());
    for (const id of [...s0.battlefield]) if (s0.cards[s0.objects[id]!.cardId]!.types.includes("Creature")) s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
    const elves = putOnBattlefield(s0, ap, llanowarElves());
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(elves)]));
    s = settle(s);
    expect(logged(s, /has no other legal target, so it keeps its target/)).toBe(true);
    expect(s.objects[elves]!.zone).toBe("battlefield");
  });
});

describe("Curse of Leeches", () => {
  it("cast on a player it drains them each upkeep; at night it's Leeching Lurker, unattached; by day it's attached to a player of your choice", () => {
    const { s: s0, ap, ids, opp } = setup([curseOfLeeches()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [ptgt(opp)])));
    const curse = ids[0]!;
    expect(s.objects[curse]).toMatchObject({ zone: "battlefield", attachedToPlayer: opp });
    // It became day as a daybound permanent appeared (CR 702.145d).
    expect(s.dayNight).toBe("day");
    setDayNight(s, "night");
    runStateBasedActions(s);
    s = settle(s);
    expect(s.objects[curse]!.face).toBe(1);
    expect(s.objects[curse]!.attachedToPlayer).toBeUndefined();
    expect(s.objects[curse]!.zone).toBe("battlefield");
    // Night becomes day: as it transforms into Curse of Leeches, its controller attaches it to a player (not targeted).
    setDayNight(s, "day");
    runStateBasedActions(s);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "attachPlayer", objectId: curse });
    expect((s.pending as { options: string[] }).options).toHaveLength(4);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: String(opp) }));
    expect(s.objects[curse]).toMatchObject({ zone: "battlefield", attachedToPlayer: opp });
    expect(s.objects[curse]!.face).toBeUndefined();
    // At the beginning of that player's upkeep they lose 1 life and you gain 1 (a spell was cast this turn: still day).
    const [theirs, mine] = [s.players[opp]!.life, s.players[ap]!.life];
    s = until(s, (x) => x.activePlayer === opp && x.step === "main1");
    expect(s.dayNight).toBe("day");
    expect(s.players[opp]!.life).toBe(theirs - 1);
    expect(s.players[ap]!.life).toBe(mine + 1);
  });

  it("night becomes day at an untap step: while its controller chooses the player, it isn't an Aura attached to nothing", () => {
    const { s: s0, ap } = setup([]);
    const curse = putOnBattlefield(s0, ap, curseOfLeeches());
    s0.dayNight = "night";
    setFace(s0, s0.objects[curse]!, 1);
    // Two spells cast this turn: it becomes day as the next turn begins (CR 731.2).
    (s0.castThisTurn ??= []).push({ player: ap, card: "test" } as never, { player: ap, card: "test" } as never);
    invalidateCharacteristics(s0);
    let s = s0;
    for (let i = 0; i < 500 && !(s.pending?.kind === "chooseOption" && s.pending.what === "attachPlayer"); i++) {
      const pid = waitingOn(s)!;
      if (s.pending?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
      else if (s.pending) s = bots(s, 1);
      else s = act(s, { type: "passPriority", player: pid });
    }
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "attachPlayer" });
    expect(s.activePlayer).not.toBe(ap);
    expect(zone(s, curse)).toBe("battlefield");
    const to = s.turnOrder[(s.turnOrder.indexOf(ap) + 2) % 4]!;
    s = act(s, { type: "chooseOption", player: ap, choice: String(to) });
    expect(s.objects[curse]).toMatchObject({ zone: "battlefield", attachedToPlayer: to });
    expect(logged(s, /Curse of Leeches is put into the graveyard/)).toBe(false);
  });

  it("a bot attaches it to an opponent, the one with the least life", () => {
    const { s: s0, ap, ids, opp } = setup([curseOfLeeches()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [ptgt(opp)])));
    const third = s.turnOrder[(s.turnOrder.indexOf(opp) + 1) % 4]!;
    s.players[third]!.life = 7;
    setDayNight(s, "night");
    runStateBasedActions(s);
    s = settle(s);
    setDayNight(s, "day");
    runStateBasedActions(s);
    s = settle(s);
    expect(s.pending).toMatchObject({ what: "attachPlayer" });
    s = settle(bots(s, 1));
    expect(s.objects[ids[0]!]!.attachedToPlayer).toBe(third);
  });
});

/** The Seventh Doctor attacking `opp`, with `hand` in hand and `artifacts` artifacts, up to its first question. */
const doctorAttacks = (hand: CardDef[], artifacts = 0) => {
  const { s: s0, ap, ids, opp } = setup(hand);
  const doctor = putOnBattlefield(s0, ap, seventhDoctor());
  for (let i = 0; i < artifacts; i++) putOnBattlefield(s0, ap, ornithopter());
  let s = until(s0, (x) => x.pending?.kind === "declareAttackers" && x.pending.player === ap);
  s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: doctor, defender: opp }] }));
  return { s, ap, opp, ids, doctor };
};
const clues = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && characteristics(s, s.objects[id]!).subtypes.includes("Clue")).length;

describe("The Seventh Doctor", () => {
  it("defending player guesses wrong: you may cast the card free, and then there's no Clue", () => {
    let { s, ap, opp, ids } = doctorAttacks([divination(), grizzlyBears()], 2);
    // You choose a card in your hand, face down (rulings).
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "predicamentCard" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: ids[0]! }));
    expect(logged(s, /Divination/)).toBe(false);
    // Divination's mana value is 3, more than 2 artifacts: "not greater" is wrong.
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: opp, what: "predicamentGuess" });
    expect((s.pending as { prompt?: string }).prompt).toMatch(/number of artifacts .* controls \(now 2\)/);
    s = settle(act(s, { type: "chooseOption", player: opp, choice: "notOver" }));
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: ids[0]! });
    const hand = s.players[ap]!.hand.length;
    s = act(s, { type: "castSpell", player: ap, objectId: ids[0]! });
    s = settle(s);
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2);
    expect(clues(s, ap)).toBe(0);
  });

  it("a right guess, or a card not cast, investigates; the artifacts are counted as the guess is checked", () => {
    let { s, ap, opp, ids } = doctorAttacks([divination()], 3);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: ids[0]! }));
    // Three artifacts: 3 isn't greater, so "not greater" is right.
    s = settle(act(s, { type: "chooseOption", player: opp, choice: "notOver" }));
    expect(logged(s, /guessed right/)).toBe(true);
    expect(clues(s, ap)).toBe(1);
    expect(zone(s, ids[0]!)).toBe("hand");
    // Guessed wrong, but you don't cast it: a Clue too.
    ({ s, ap, opp, ids } = doctorAttacks([divination()], 0));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: ids[0]! }));
    s = settle(act(s, { type: "chooseOption", player: opp, choice: "notOver" }));
    expect(s.pending?.kind).toBe("castFree");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(zone(s, ids[0]!)).toBe("hand");
    expect(clues(s, ap)).toBe(1);
  });

  it("with an empty hand nothing is chosen, and a land chosen can't be cast: a Clue each time", () => {
    const { s: s0, ap, opp } = setup([]);
    const doctor = putOnBattlefield(s0, ap, seventhDoctor());
    let s = until(s0, (x) => x.pending?.kind === "declareAttackers" && x.pending.player === ap);
    for (const id of s.players[ap]!.hand) s.objects[id]!.zone = "graveyard";
    s.players[ap]!.graveyard.push(...s.players[ap]!.hand);
    s.players[ap]!.hand = [];
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: doctor, defender: opp }] }));
    expect(s.pending).toBeNull();
    expect(logged(s, /has no card in hand to choose/)).toBe(true);
    expect(clues(s, ap)).toBe(1);
    // A land: mana value 0, so "greater" is wrong, but it can't be cast (rulings).
    const t = doctorAttacks([], 0);
    s = t.s;
    const land = s.players[t.ap]!.hand.find((id) => s.cards[s.objects[id]!.cardId]!.types.includes("Land"))!;
    s = settle(act(s, { type: "chooseOption", player: t.ap, choice: land }));
    s = settle(act(s, { type: "chooseOption", player: t.opp, choice: "over" }));
    expect(logged(s, /guessed wrong/)).toBe(true);
    expect(s.pending).toBeNull();
    expect(zone(s, land)).toBe("hand");
    expect(clues(s, t.ap)).toBe(1);
  });

  it("bots choose, guess and cast", () => {
    let { s, ap } = doctorAttacks([divination()], 0);
    s = settle(bots(s));
    expect(s.pending).toBeNull();
    expect(clues(s, ap) + (zone(s, s.players[ap]!.graveyard.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Divination") ?? "") === "graveyard" ? 1 : 0)).toBe(1);
  });
});
