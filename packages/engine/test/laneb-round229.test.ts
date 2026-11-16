// Lane B round B229: Suffocation and Backdraft (damage dealt by instant and sorcery spells this turn, TurnLog.spellDamage),
// Ulamog's Despoiler (two cards opponents own put from exile into graveyards as it enters, for four +1/+1 counters) and
// Vodalian War Machine (the Merfolk tapped to pay for its abilities, destroyed when it dies).

import { describe, expect, it } from "vitest";
import { act, bear, passUntil, putOnBattlefield, setup, target, mountain } from "./helpers";
import { botActions, castProblem, compileCard, destroyPermanent, invalidateCharacteristics, isFullySupported, moveObject, planActivate, planCast, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const suffocation = (): CardDef => ({"oracleId":"57aeb106-dc4f-4069-b596-f997263dc0cf","name":"Suffocation","manaCost":"{1}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Cast this spell only if you were dealt damage this turn by a red instant or sorcery spell.\nSuffocation deals 4 damage to the controller of the last red instant or sorcery spell that dealt damage to you this turn.\nDraw a card at the beginning of the next turn's upkeep.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/2/d22104df-8147-45fd-897a-f99a815be062.jpg?1783947192","artUrl":"https://cards.scryfall.io/art_crop/front/d/2/d22104df-8147-45fd-897a-f99a815be062.jpg?1783947192","commanderLegal":"legal","set":"all","releasedAt":"1996-06-10","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const backdraft = (): CardDef => ({"oracleId":"80734bb0-5032-4355-9304-49f4a4557aba","name":"Backdraft","manaCost":"{1}{R}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Choose a player who cast one or more sorcery spells this turn. Backdraft deals damage to that player equal to half the damage dealt by one of those sorcery spells this turn, rounded down.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/8/58d5b9fe-b66a-48c9-94c4-db783e605f37.jpg?1783948060","artUrl":"https://cards.scryfall.io/art_crop/front/5/8/58d5b9fe-b66a-48c9-94c4-db783e605f37.jpg?1783948060","commanderLegal":"legal","set":"leg","releasedAt":"1994-06-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const despoiler = (): CardDef => ({"oracleId":"e0457123-7ba1-44fa-8e0d-6f1f17534b29","name":"Ulamog's Despoiler","manaCost":"{6}","cmc":6,"typeLine":"Creature — Eldrazi Processor","supertypes":[],"types":["Creature"],"subtypes":["Eldrazi","Processor"],"oracleText":"As this creature enters, you may put two cards your opponents own from exile into their owners' graveyards. If you do, this creature enters with four +1/+1 counters on it.","power":"5","toughness":"5","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/5/55b6b7f0-d7fc-46b6-99ff-ba8206ecd628.jpg?1783938222","artUrl":"https://cards.scryfall.io/art_crop/front/5/5/55b6b7f0-d7fc-46b6-99ff-ba8206ecd628.jpg?1783938222","commanderLegal":"legal","set":"bfz","releasedAt":"2015-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const warMachine = (): CardDef => ({"oracleId":"f72511b0-9993-4998-b646-65a855cb8170","name":"Vodalian War Machine","manaCost":"{1}{U}{U}","cmc":3,"typeLine":"Creature — Wall","supertypes":[],"types":["Creature"],"subtypes":["Wall"],"oracleText":"Defender (This creature can't attack.)\nTap an untapped Merfolk you control: This creature can attack this turn as though it didn't have defender.\nTap an untapped Merfolk you control: This creature gets +2/+1 until end of turn.\nWhen this creature dies, destroy all Merfolk tapped this turn to pay for its abilities.","power":"0","toughness":"4","colors":["U"],"colorIdentity":["U"],"keywords":["Defender"],"imageUrl":"https://cards.scryfall.io/normal/front/c/d/cd962ff0-4aa6-453e-931e-bd36fc034273.jpg?1783947906","artUrl":"https://cards.scryfall.io/art_crop/front/c/d/cd962ff0-4aa6-453e-931e-bd36fc034273.jpg?1783947906","commanderLegal":"legal","set":"fem","releasedAt":"1994-11-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const lavaAxe = (): CardDef => ({"oracleId":"387b6b07-a283-412d-94c3-f7f1dc76e858","name":"Lava Axe","manaCost":"{4}{R}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Lava Axe deals 5 damage to target player or planeswalker.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/1/e11ec278-46f5-4970-ad0b-f6718c73de6c.jpg?1783946235","artUrl":"https://cards.scryfall.io/art_crop/front/e/1/e11ec278-46f5-4970-ad0b-f6718c73de6c.jpg?1783946235","commanderLegal":"legal","set":"ulg","releasedAt":"1999-02-15","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const psionic = (): CardDef => ({"oracleId":"7f221ad6-7ec4-483d-a6b5-1456c95c1cad","name":"Psionic Blast","manaCost":"{2}{U}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Psionic Blast deals 4 damage to any target and 2 damage to you.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/6/a6a86e6e-bfff-46af-9d36-c912901fea92.jpg?1783948702","artUrl":"https://cards.scryfall.io/art_crop/front/a/6/a6a86e6e-bfff-46af-9d36-c912901fea92.jpg?1783948702","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const twincast = (): CardDef => ({"oracleId":"8f878efc-850f-43d2-a6fe-5ea8d1dd5afb","name":"Twincast","manaCost":"{U}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Copy target instant or sorcery spell. You may choose new targets for the copy.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/a/1a367559-1d84-4f6f-9e6e-ff90de420389.jpg?1783944159","artUrl":"https://cards.scryfall.io/art_crop/front/1/a/1a367559-1d84-4f6f-9e6e-ff90de420389.jpg?1783944159","commanderLegal":"legal","set":"sok","releasedAt":"2005-06-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const merfolk = (): CardDef => ({"oracleId":"218d9277-c179-4de3-9c7f-79b5a6d4fa38","name":"Merfolk of the Pearl Trident","manaCost":"{U}","cmc":1,"typeLine":"Creature — Merfolk","supertypes":[],"types":["Creature"],"subtypes":["Merfolk"],"oracleText":"","power":"1","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/2/92ff7380-ac9c-46c4-9544-da6554cb0819.jpg?1783915734","artUrl":"https://cards.scryfall.io/art_crop/front/9/2/92ff7380-ac9c-46c4-9544-da6554cb0819.jpg?1783915734","commanderLegal":"legal","set":"sld","releasedAt":"2023-08-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const flameRift = (): CardDef => ({"oracleId":"28479aa8-d1cd-421a-8bbb-0594bb4dd410","name":"Flame Rift","manaCost":"{1}{R}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Flame Rift deals 4 damage to each player.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/6/e63ed449-d249-4639-85d2-f8fe75496d5c.jpg?1783926784","artUrl":"https://cards.scryfall.io/art_crop/front/e/6/e63ed449-d249-4639-85d2-f8fe75496d5c.jpg?1783926784","commanderLegal":"legal","set":"mh2","releasedAt":"2021-06-18","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const hammer = (): CardDef => ({"oracleId":"98fa5a06-0553-40fd-999c-bc31c9b3f4db","name":"Volcanic Hammer","manaCost":"{1}{R}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Volcanic Hammer deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/8/58c0489d-b073-4ad4-b044-447fcc865b6c.jpg?1783946459","artUrl":"https://cards.scryfall.io/art_crop/front/5/8/58c0489d-b073-4ad4-b044-447fcc865b6c.jpg?1783946459","commanderLegal":"legal","set":"p02","releasedAt":"1998-06-24","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
/** Resolves the stack and answers any question the way a bot would. */
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const pid = waitingOn(s)!;
    s = act(s, s.pending ? botActions(s, pid)[0]! : { type: "passPriority", player: pid });
  }
  return s;
};
/** Resolves the stack with everyone passing, stopping at the first question. */
const resolveAll = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const toHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
const castNow = (s: GameState, pid: PlayerId, id: string, targets?: Parameters<typeof planCast>[3]) => {
  const plan = planCast(s, pid, id, targets);
  expect(plan, s.cards[s.objects[id]!.cardId]!.name).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return s;
};
/** Passes until `pid` has priority (the stack as it is). */
const priorityTo = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 8 && waitingOn(s) !== pid; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  expect(waitingOn(s)).toBe(pid);
  return s;
};
/** Opponent `opp`'s main phase, with five Mountains of theirs. */
const theirTurn = (s0: GameState, opp: PlayerId) => {
  const s = passUntil(s0, "main1", opp);
  for (let i = 0; i < 5; i++) putOnBattlefield(s, opp, mountain);
  return s;
};

describe("Lane B round B229", () => {
  it("compiles all four cards", () => {
    supported(suffocation(), backdraft(), despoiler(), warMachine());
  });

  describe("Suffocation", () => {
    it("can be cast only after a red instant or sorcery spell dealt you damage this turn, and deals 4 damage to that spell's controller", () => {
      const { s: s0, ap, opp } = setup([]);
      const suff = toHand(s0, ap, suffocation());
      expect(planCast(s0, ap, suff, [])).toBeNull();
      let s = theirTurn(s0, opp);
      const axe = toHand(s, opp, lavaAxe());
      s = castNow(s, opp, axe, [{ kind: "player", id: ap }]);
      s = resolveAll(s);
      expect(s.players[ap]!.life).toBe(35);
      expect(s.turnLog?.spellDamage).toEqual([expect.objectContaining({ controller: opp, colors: ["R"], types: ["Sorcery"], cast: true, amount: 5, player: ap })]);
      s = priorityTo(s, ap);
      const hand = s.players[ap]!.hand.length;
      s = castNow(s, ap, suff, []);
      s = resolveAll(s);
      expect(s.players[opp]!.life).toBe(36);
      // "Draw a card at the beginning of the next turn's upkeep."
      s = passUntil(s, "draw", s.turnOrder[(s.turnOrder.indexOf(opp) + 1) % 4]!);
      expect(s.players[ap]!.hand.length).toBe(hand);
      expect(s.log.some((l) => /draws/.test(l.text ?? String(l)))).toBe(true);
    });

    it("a blue spell's damage doesn't count; with two red spells, the last one's controller is dealt the damage", () => {
      const { s: s0, ap, opp } = setup([]);
      const opp2 = s0.turnOrder[(s0.turnOrder.indexOf(opp) + 1) % 4]!;
      const suff = toHand(s0, ap, suffocation());
      // Spell damage logged by hand as dealt this turn: a blue instant's first.
      s0.turnLog = { ...s0.turnLog, spellDamage: [{ key: "x1@0", controller: opp, colors: ["U"], types: ["Instant"], cast: true, amount: 4, player: ap }] };
      expect(planCast(s0, ap, suff, [])).toBeNull();
      expect(castProblem(s0, ap, suff, [])).not.toBeNull();
      s0.turnLog.spellDamage!.push({ key: "x2@0", controller: opp, colors: ["R"], types: ["Instant"], cast: true, amount: 3, player: ap }, { key: "x3@0", controller: opp2, colors: ["R"], types: ["Sorcery"], cast: true, amount: 3, player: ap }, { key: "x4@0", controller: opp, colors: ["R"], types: ["Instant"], cast: true, amount: 3, player: opp2 });
      let s = castNow(s0, ap, suff, []);
      s = resolveAll(s);
      expect(s.players[opp2]!.life).toBe(36);
      expect(s.players[opp]!.life).toBe(40);
    });

    it("the damage a red instant deals to you is logged as it's dealt, with its controller", () => {
      const { s: s0, ap, opp } = setup([]);
      let s = theirTurn(s0, opp);
      const b = toHand(s, opp, bolt());
      s = castNow(s, opp, b, [{ kind: "player", id: ap }]);
      s = resolveAll(s);
      expect(s.turnLog?.spellDamage).toEqual([expect.objectContaining({ controller: opp, colors: ["R"], types: ["Instant"], cast: true, amount: 3, player: ap })]);
    });
  });

  describe("Backdraft", () => {
    it("with one player and one sorcery spell, deals half its damage, rounded down, to that player, nothing asked", () => {
      const { s: s0, ap, opp } = setup([]);
      let s = theirTurn(s0, opp);
      const draft = toHand(s, ap, backdraft());
      const axe = toHand(s, opp, lavaAxe());
      s = castNow(s, opp, axe, [{ kind: "player", id: ap }]);
      s = resolveAll(s);
      s = priorityTo(s, ap);
      s = castNow(s, ap, draft, []);
      s = resolveAll(s);
      expect(s.pending).toBeNull();
      expect(s.players[opp]!.life).toBe(38);
    });

    it("asks which of that player's sorcery spells: the one dealing to every player counts all its damage; a bot takes the most", () => {
      const { s: s0, ap, opp } = setup([]);
      let s = theirTurn(s0, opp);
      const victim = putOnBattlefield(s, ap, bear());
      const draft = toHand(s, ap, backdraft());
      const rift = toHand(s, opp, flameRift());
      const ham = toHand(s, opp, hammer());
      s = castNow(s, opp, rift, []);
      s = resolveAll(s);
      s = castNow(s, opp, ham, [target(victim)]);
      s = resolveAll(s);
      expect(s.objects[victim]!.zone).toBe("graveyard");
      s = priorityTo(s, ap);
      s = castNow(s, ap, draft, []);
      s = resolveAll(s);
      expect(s.pending).toMatchObject({ kind: "chooseOption", what: "spellDamageBack", player: ap, options: [`${opp}:16`, `${opp}:3`] });
      const bot = botActions(s, ap)[0]!;
      expect(bot).toMatchObject({ type: "chooseOption", choice: `${opp}:16` });
      const lifeBefore = s.players[opp]!.life;
      const s2 = settle(act(structuredClone(s), bot));
      expect(s2.players[opp]!.life).toBe(lifeBefore - 8);
      s = act(s, { type: "chooseOption", player: ap, choice: `${opp}:3` });
      s = resolveAll(s);
      expect(s.players[opp]!.life).toBe(lifeBefore - 1);
    });

    it("a copy of a sorcery spell isn't cast: its controller isn't a choice and its damage isn't counted", () => {
      const { s: s0, ap, opp } = setup([]);
      let s = theirTurn(s0, opp);
      const draft = toHand(s, ap, backdraft());
      const twin = toHand(s, ap, twincast());
      const axe = toHand(s, opp, lavaAxe());
      s = castNow(s, opp, axe, [{ kind: "player", id: ap }]);
      s = priorityTo(s, ap);
      s = castNow(s, ap, twin, [{ kind: "stack", id: s.stack[0]!.id }]);
      s = resolveAll(s);
      // "You may choose new targets for the copy": the copy goes at the opponent.
      expect(s.pending?.kind).toBe("copyTargets");
      s = settle(s);
      // The copy (ap's) and the original both dealt 5.
      const dealt = s.turnLog?.spellDamage ?? [];
      expect(dealt.length).toBe(2);
      expect(dealt.filter((d) => d.cast).length).toBe(1);
      s = priorityTo(s, ap);
      s = castNow(s, ap, draft, []);
      s = resolveAll(s);
      expect(s.pending).toBeNull();
      expect(s.players[opp]!.life).toBe(38);
    });

    it("a sorcery spell that dealt no damage: its caster can be chosen, for none", () => {
      const { s: s0, ap, opp } = setup([]);
      let s = theirTurn(s0, opp);
      const draft = toHand(s, ap, backdraft());
      s.castThisTurn = [...(s.castThisTurn ?? []), { player: opp, card: "x", types: ["Sorcery"] }];
      s = priorityTo(s, ap);
      s = castNow(s, ap, draft, []);
      s = resolveAll(s);
      expect(s.pending).toBeNull();
      expect(s.players[opp]!.life).toBe(40);
      expect(s.log.some((l) => /dealt 0 damage/.test(JSON.stringify(l)))).toBe(true);
    });

    it("with no sorcery spell cast this turn, it does nothing", () => {
      const { s: s0, ap } = setup([backdraft()]);
      let s = castNow(s0, ap, s0.players[ap]!.hand[0]!, []);
      s = resolveAll(s);
      expect(s.pending).toBeNull();
      expect(s.players.every((p) => p.life === 40)).toBe(true);
    });
  });

  describe("Ulamog's Despoiler", () => {
    const exiled = (s: GameState, pid: PlayerId, n: number) =>
      Array.from({ length: n }, () => {
        const id = putOnBattlefield(s, pid, bear());
        moveObject(s, id, "exile");
        return id;
      });

    it("as it enters, two cards opponents own go from exile to their graveyards, for four +1/+1 counters; one alone is refused", () => {
      const { s: s0, ap, opp, ids } = setup([despoiler()]);
      const opp2 = s0.turnOrder[(s0.turnOrder.indexOf(opp) + 1) % 4]!;
      const [a] = exiled(s0, opp, 1);
      const [b] = exiled(s0, opp2, 1);
      exiled(s0, ap, 1); // its own: not one of the choices
      let s = castNow(s0, ap, ids[0]!, []);
      s = resolveAll(s);
      expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, entering: ids[0], min: 0, max: 2, exactly: true });
      expect((s.pending as { cards: string[] }).cards.sort()).toEqual([a, b].sort());
      expect(() => act(s, { type: "searchLibrary", player: ap, found: [a!] })).toThrow();
      s = act(s, { type: "searchLibrary", player: ap, found: [a!, b!] });
      expect(s.objects[a!]!.zone).toBe("graveyard");
      expect(s.objects[b!]!.zone).toBe("graveyard");
      expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(4);
    });

    it("choosing none: no counters; fewer than two cards there: nothing asked", () => {
      const { s: s0, ap, opp, ids } = setup([despoiler(), despoiler()]);
      const two = exiled(s0, opp, 2);
      let s = castNow(s0, ap, ids[0]!, []);
      s = resolveAll(s);
      s = act(s, { type: "searchLibrary", player: ap, found: [] });
      expect(s.objects[ids[0]!]!.counters["+1/+1"] ?? 0).toBe(0);
      expect(two.every((id) => s.objects[id]!.zone === "exile")).toBe(true);
      moveObject(s, two[0]!, "graveyard");
      s = castNow(s, ap, ids[1]!, []);
      s = resolveAll(s);
      expect(s.pending).toBeNull();
      expect(s.objects[ids[1]!]!.zone).toBe("battlefield");
      expect(s.objects[ids[1]!]!.counters["+1/+1"] ?? 0).toBe(0);
    });

    it("a bot puts two cards there for the counters", () => {
      const { s: s0, ap, opp, ids } = setup([despoiler()]);
      exiled(s0, opp, 3);
      let s = castNow(s0, ap, ids[0]!, []);
      s = settle(s);
      expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(4);
      expect(s.players[opp]!.exile.length).toBe(1);
    });
  });

  describe("Vodalian War Machine", () => {
    it("when it dies, the Merfolk tapped this turn to pay for its abilities are destroyed, not other Merfolk", () => {
      const { s: s0, ap } = setup([]);
      const wm = putOnBattlefield(s0, ap, warMachine());
      const m1 = putOnBattlefield(s0, ap, merfolk());
      const m2 = putOnBattlefield(s0, ap, merfolk());
      const m3 = putOnBattlefield(s0, ap, merfolk());
      const m4 = putOnBattlefield(s0, ap, merfolk());
      let s = s0;
      for (const i of [0, 1]) {
        s = act(s, { type: "activateAbility", player: ap, objectId: wm, index: i, costs: { tap: [[m1, m2][i]!] } });
        s = resolveAll(s);
      }
      const tapped = [m1, m2, m3, m4].filter((id) => s.objects[id]!.tapped);
      expect(tapped.length).toBe(2);
      // Tapped some other way: not for its abilities.
      const other = [m1, m2, m3, m4].find((id) => !s.objects[id]!.tapped)!;
      s.objects[other]!.tapped = true;
      expect(compileCard(warMachine()).logsCostTapped).toBe(true);
      destroyPermanent(s, s.objects[wm]!, "test");
      s = settle(s);
      expect(tapped.every((id) => s.objects[id]!.zone === "graveyard")).toBe(true);
      expect([m1, m2, m3, m4].filter((id) => s.objects[id]!.zone === "battlefield").length).toBe(2);
    });

    it("a Merfolk tapped for it on an earlier turn, or one that left and came back, isn't destroyed", () => {
      const { s: s0, ap } = setup([]);
      const wm = putOnBattlefield(s0, ap, warMachine());
      const m1 = putOnBattlefield(s0, ap, merfolk());
      let s = s0;
      s = act(s, { type: "activateAbility", player: ap, objectId: wm, index: 1, costs: { tap: [m1] } });
      s = resolveAll(s);
      expect(s.objects[m1]!.tapped).toBe(true);
      // Flickered: a new object (CR 400.7).
      moveObject(s, m1, "exile");
      moveObject(s, m1, "battlefield");
      destroyPermanent(s, s.objects[wm]!, "test");
      s = settle(s);
      expect(s.objects[m1]!.zone).toBe("battlefield");
      // Another War Machine, its Merfolk tapped last turn.
      const wm2 = putOnBattlefield(s, ap, warMachine());
      const m2 = putOnBattlefield(s, ap, merfolk());
      s = act(s, { type: "activateAbility", player: ap, objectId: wm2, index: 1, costs: { tap: [m2] } });
      s = resolveAll(s);
      s = passUntil(s, "main1", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
      destroyPermanent(s, s.objects[wm2]!, "test");
      s = settle(s);
      expect(s.objects[m2]!.zone).toBe("battlefield");
    });
  });
});
