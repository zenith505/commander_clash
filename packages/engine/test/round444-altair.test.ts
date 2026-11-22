// Round 444 (Lane A): Altaïr Ibn-La'Ahad ("Whenever Altaïr attacks, exile up to one target Assassin creature card from your
// graveyard with a memory counter on it. Then for each creature card you own in exile with a memory counter on it, create a
// tapped and attacking token that's a copy of it. Exile those tokens at end of combat.": CR 122.1, 707.2, 508.4, 603.7;
// rulings).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, compileCard, invalidateCharacteristics, isFullySupported, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real card data (Scryfall).
const altair = (): CardDef => ({"oracleId":"43dc4b0c-e437-4abc-a3fb-48bd3098de88","name":"Altaïr Ibn-La'Ahad","manaCost":"{R}{W}{B}","cmc":3,"typeLine":"Legendary Creature — Human Assassin","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Assassin"],"oracleText":"First strike\nWhenever Altaïr attacks, exile up to one target Assassin creature card from your graveyard with a memory counter on it. Then for each creature card you own in exile with a memory counter on it, create a tapped and attacking token that's a copy of it. Exile those tokens at end of combat.","power":"3","toughness":"3","colors":["B","R","W"],"colorIdentity":["B","R","W"],"keywords":["First strike"],"imageUrl":"https://cards.scryfall.io/normal/front/3/5/358026de-ab7c-4a17-8cac-cfbee391b127.jpg?1783910975","artUrl":"https://cards.scryfall.io/art_crop/front/3/5/358026de-ab7c-4a17-8cac-cfbee391b127.jpg?1783910975","commanderLegal":"legal","set":"acr","releasedAt":"2024-07-05","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const assassin = (): CardDef => ({"oracleId":"9ed6f28f-a3db-48c5-9ab0-b90a7fba5f57","name":"Royal Assassin","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Creature — Human Assassin","supertypes":[],"types":["Creature"],"subtypes":["Human","Assassin"],"oracleText":"{T}: Destroy target tapped creature.","power":"1","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/b/0b18205d-cce3-4aef-90bd-06cfb4d8387f.jpg?1783910958","artUrl":"https://cards.scryfall.io/art_crop/front/0/b/0b18205d-cce3-4aef-90bd-06cfb4d8387f.jpg?1783910958","commanderLegal":"legal","set":"acr","releasedAt":"2024-07-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const isamaru = (): CardDef => ({"oracleId":"cfb756dd-6fe1-430a-8f04-8b10cac62a86","name":"Isamaru, Hound of Konda","manaCost":"{W}","cmc":1,"typeLine":"Legendary Creature — Dog","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Dog"],"oracleText":"","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/e/2e7f9919-0713-4ef9-96eb-3e0c444e47f4.jpg?1783944338","artUrl":"https://cards.scryfall.io/art_crop/front/2/e/2e7f9919-0713-4ef9-96eb-3e0c444e47f4.jpg?1783944338","commanderLegal":"legal","set":"chk","releasedAt":"2004-10-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const visionary = (): CardDef => ({"oracleId":"c6a3a882-a127-4590-93d7-679ef4313efe","name":"Elvish Visionary","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Elf Shaman","supertypes":[],"types":["Creature"],"subtypes":["Elf","Shaman"],"oracleText":"When this creature enters, draw a card.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/9/69f570b5-1629-4b10-8f66-ed9b4355a0a4.jpg?1783908825","artUrl":"https://cards.scryfall.io/art_crop/front/6/9/69f570b5-1629-4b10-8f66-ed9b4355a0a4.jpg?1783908825","commanderLegal":"legal","set":"j25","releasedAt":"2024-11-15","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const paladin = (): CardDef => ({"oracleId":"6891c8b7-7112-40dc-8b94-b84ad1885e5e","name":"Accorder Paladin","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature — Human Knight","supertypes":[],"types":["Creature"],"subtypes":["Human","Knight"],"oracleText":"Battle cry (Whenever this creature attacks, each other attacking creature gets +1/+0 until end of turn.)","power":"3","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":["Battle Cry"],"imageUrl":"https://cards.scryfall.io/normal/front/d/f/df0a4370-729d-40e7-b68b-21902648492d.jpg?1783941394","artUrl":"https://cards.scryfall.io/art_crop/front/d/f/df0a4370-729d-40e7-b68b-21902648492d.jpg?1783941394","commanderLegal":"legal","set":"mbs","releasedAt":"2011-02-04","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const lives = (): CardDef => ({"oracleId":"84dc94b2-95fb-4d53-aaa2-191cb645639f","name":"Parallel Lives","manaCost":"{3}{G}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/3/73558b8d-fb08-4df5-99e3-d4c11c9ccfa7.jpg?1783914916","artUrl":"https://cards.scryfall.io/art_crop/front/7/3/73558b8d-fb08-4df5-99e3-d4c11c9ccfa7.jpg?1783914916","commanderLegal":"legal","set":"wot","releasedAt":"2023-09-08","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;

const named = (s: GameState, name: string, token: boolean) => s.battlefield.filter((id) => s.objects[id]!.isToken === token && s.cards[s.objects[id]!.cardId]?.name === name);
/** A new card for `def` in `pid`'s graveyard. */
const inYard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  invalidateCharacteristics(s);
  return id;
};
/** A new card for `def` in `pid`'s exile, with these counters on it. */
const inExile = (s: GameState, pid: PlayerId, def: CardDef, counters: Record<string, number>, faceDown = false) => {
  const id = inYard(s, pid, def);
  s.players[pid]!.graveyard.splice(s.players[pid]!.graveyard.indexOf(id), 1);
  s.objects[id]!.zone = "exile";
  s.objects[id]!.counters = { ...counters };
  if (faceDown) s.objects[id]!.faceDown = "morph";
  s.players[pid]!.exile.push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Everyone passes until the stack is empty or `me` is asked something; bots answer the others. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Altaïr attacks `opp`; stops at its trigger's target. */
const attack = (s: GameState, ap: PlayerId, opp: PlayerId, a: ObjectId, also: ObjectId[] = []) => {
  s = passUntil(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks: [a, ...also].map((attacker) => ({ attacker, defender: opp })) });
  return settle(s, ap);
};
/** Answer the trigger's target (none if `t` is undefined), then each token's attack with `whom` (default `opp`). */
const resolveTrigger = (s: GameState, ap: PlayerId, opp: PlayerId, t: ObjectId | undefined, whom: (n: number) => PlayerId = () => opp) => {
  // "Up to one": none is the target "none" (asked even with nothing to target).
  if (t || s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [t ? { kind: "object", id: t } : { kind: "none" }] }), ap);
  let n = 0;
  for (let i = 0; i < 20 && s.pending?.player === ap; i++) {
    const p = s.pending;
    if (p.kind !== "chooseOption" || p.what !== "attackWhom") break;
    s = settle(act(s, { type: "chooseOption", player: ap, choice: String(whom(n++)) }), ap);
  }
  return s;
};
const board = () => {
  const { s, ap, opp } = setup([]);
  const a = putOnBattlefield(s, ap, altair());
  return { s, ap, opp, a };
};

describe("round 444: Altaïr Ibn-La'Ahad", () => {
  it("is fully supported", () => {
    expect(isFullySupported(altair())).toBe(true);
    const t = compileCard(altair()).triggers[0]!;
    expect(t.event).toBe("selfAttacks");
    expect(t.body.targets[0]).toMatchObject({ kind: "card", subtypes: ["Assassin"], types: ["Creature"], owner: "you", optional: true });
    expect(t.body.effects.map((e) => e.type)).toEqual(["exile", "tokenCopiesOfExiledWithCounter", "delayed"]);
  });

  it("exiles Royal Assassin with a memory counter, then a tapped and attacking token copy of it, exiled at end of combat", () => {
    const { s: s0, ap, opp, a } = board();
    const ra = inYard(s0, ap, assassin());
    let s = resolveTrigger(attack(s0, ap, opp, a), ap, opp, ra);
    expect(s.objects[ra]!.zone).toBe("exile");
    expect(s.objects[ra]!.counters.memory).toBe(1);
    const tokens = named(s, "Royal Assassin", true);
    expect(tokens).toHaveLength(1);
    expect(s.objects[tokens[0]!]!.tapped).toBe(true);
    expect(s.objects[tokens[0]!]!.attacking).toBe(opp);
    s = passUntil(s, "endCombat", ap);
    s = settle(s, ap);
    s = passUntil(s, "main2", ap);
    expect(tokens.every((t) => !s.battlefield.includes(t))).toBe(true);
    // The card stays in exile with its counter.
    expect(s.objects[ra]!.zone).toBe("exile");
    expect(s.objects[ra]!.counters.memory).toBe(1);
  });

  it("only an Assassin creature card from your own graveyard can be the target", () => {
    const { s: s0, ap, opp, a } = board();
    const bear = inYard(s0, ap, bears());
    const theirs = inYard(s0, opp, assassin());
    const mine = inYard(s0, ap, assassin());
    const s = attack(s0, ap, opp, a);
    expect(s.pending?.kind).toBe("chooseTargets");
    for (const id of [bear, theirs]) expect(() => act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id }] })).toThrow();
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: mine }] })).not.toThrow();
  });

  it("with no target, a copy of every creature card you own in exile with a memory counter, whatever exiled it", () => {
    const { s: s0, ap, opp, a } = board();
    inExile(s0, ap, bears(), { memory: 1 });
    inExile(s0, ap, isamaru(), { memory: 2 });
    // Not these: no memory counter, someone else's, face down, not a creature card.
    inExile(s0, ap, visionary(), {});
    inExile(s0, opp, assassin(), { memory: 1 });
    inExile(s0, ap, paladin(), { memory: 1 }, true);
    inExile(s0, ap, lives(), { memory: 1 });
    const s = resolveTrigger(attack(s0, ap, opp, a), ap, opp, undefined);
    expect(named(s, "Grizzly Bears", true)).toHaveLength(1);
    expect(named(s, "Isamaru, Hound of Konda", true)).toHaveLength(1);
    expect(named(s, "Elvish Visionary", true)).toHaveLength(0);
    expect(named(s, "Royal Assassin", true)).toHaveLength(0);
    expect(named(s, "Accorder Paladin", true)).toHaveLength(0);
    expect(named(s, "Parallel Lives", true)).toHaveLength(0);
  });

  it("each token's attack is chosen as it enters (rulings): one at the defending player, one at another", () => {
    const { s: s0, ap, opp, a } = board();
    const other = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    inExile(s0, ap, bears(), { memory: 1 });
    inExile(s0, ap, isamaru(), { memory: 1 });
    const s = resolveTrigger(attack(s0, ap, opp, a), ap, opp, undefined, (n) => (n === 0 ? opp : other));
    const tokens = [...named(s, "Grizzly Bears", true), ...named(s, "Isamaru, Hound of Konda", true)];
    expect(tokens.map((t) => s.objects[t]!.attacking).sort()).toEqual([opp, other].sort());
  });

  it("a copied enters ability works (rulings): an Elvish Visionary token draws a card", () => {
    const { s: s0, ap, opp, a } = board();
    inExile(s0, ap, visionary(), { memory: 1 });
    const hand = s0.players[ap]!.hand.length;
    const s = resolveTrigger(attack(s0, ap, opp, a), ap, opp, undefined);
    expect(named(s, "Elvish Visionary", true)).toHaveLength(1);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("the tokens were never declared as attackers (rulings): an Accorder Paladin token's battle cry doesn't trigger", () => {
    const { s: s0, ap, opp, a } = board();
    inExile(s0, ap, paladin(), { memory: 1 });
    const s = resolveTrigger(attack(s0, ap, opp, a), ap, opp, undefined);
    const t = named(s, "Accorder Paladin", true)[0]!;
    expect(s.objects[t]!.attacking).toBe(opp);
    // Battle cry would give Altaïr +1/+0.
    expect(s.stack.length).toBe(0);
    expect(s.triggerQueue.length).toBe(0);
  });

  it("Parallel Lives: two copies of the card, each attacking whom you choose", () => {
    const { s: s0, ap, opp, a } = board();
    putOnBattlefield(s0, ap, lives());
    const other = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    inExile(s0, ap, bears(), { memory: 1 });
    const s = resolveTrigger(attack(s0, ap, opp, a), ap, opp, undefined, (n) => (n === 0 ? opp : other));
    const tokens = named(s, "Grizzly Bears", true);
    expect(tokens).toHaveLength(2);
    expect(tokens.map((t) => s.objects[t]!.attacking).sort()).toEqual([opp, other].sort());
  });

  it("nothing in exile with a memory counter: no token", () => {
    const { s: s0, ap, opp, a } = board();
    const s = resolveTrigger(attack(s0, ap, opp, a), ap, opp, undefined);
    expect(s.battlefield.filter((id) => s.objects[id]!.isToken)).toHaveLength(0);
    expect(s.objects[a]!.attacking).toBe(opp);
  });

  it("a bot attacking with Altaïr exiles its Assassin and gets the token", () => {
    const { s: s0, ap, opp, a } = board();
    const ra = inYard(s0, ap, assassin());
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] });
    s = settle(s);
    expect(s.objects[ra]!.zone).toBe("exile");
    expect(named(s, "Royal Assassin", true)).toHaveLength(1);
  });
});
