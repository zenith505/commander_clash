// Round 333 (Lane A): Rosheen, Roaring Prophet (revealed X cards for mana spent only on costs with {X}), Helvault (two exile
// abilities linked to one return), Alhammarret, High Arbiter (a name chosen from opponents' revealed hands), Feather,
// Radiant Arbiter (paid copies for chosen creatures), Zevlor, Elturel Exile (a copy for each other opponent) and Stangg,
// Echo Warrior (an attacking twin with copies of its Auras and Equipment).

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, castProblem, characteristics, isFullySupported, manaOptions, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PendingDecision, type PlayerId, type TargetChoice } from "../src";
import { nameCastBan } from "../src/names";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; other players' questions as the bots would. Stops at any question of `me`'s. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const toHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  return id;
};
/** Puts every card in `pid`'s hand on top of their library. */
const emptyHand = (s: GameState, pid: PlayerId) => {
  for (const id of s.players[pid]!.hand) {
    s.objects[id]!.zone = "library";
    s.players[pid]!.library.unshift(id);
  }
  s.players[pid]!.hand = [];
};
const name = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]!.name;
const pend = <K extends PendingDecision["kind"]>(s: GameState, kind: K) => {
  expect(s.pending?.kind).toBe(kind);
  return s.pending as Extract<PendingDecision, { kind: K }>;
};
const others = (s: GameState, ap: PlayerId) => s.turnOrder.filter((p) => p !== ap);

// Real oracle text (Scryfall).
const rosheen = (): CardDef => ({"oracleId":"3108a4fe-b18a-4d02-9545-b19812454362","name":"Rosheen, Roaring Prophet","manaCost":"{2}{R}{G}","cmc":4,"typeLine":"Legendary Creature — Giant Shaman","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Giant","Shaman"],"oracleText":"When Rosheen enters, mill six cards. You may put a card with {X} in its mana cost from among them into your hand.\n{T}: Reveal any number of cards with {X} in their mana cost in your hand. Add {C}{C} for each card revealed this way. Spend this mana only on costs that contain {X}.","power":"4","toughness":"4","colors":["G","R"],"colorIdentity":["G","R"],"keywords":["Mill"],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/b/5/b5ac88b2-a92e-4a12-9ba3-5a4b8cdb58dc.jpg?1783911245","artUrl":"https://cards.scryfall.io/art_crop/front/b/5/b5ac88b2-a92e-4a12-9ba3-5a4b8cdb58dc.jpg?1783911245","commanderLegal":"legal","set":"mh3","releasedAt":"2024-06-14","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const helvault = (): CardDef => ({"oracleId":"fa3d8a6f-dc5b-4890-a806-f785a41660c7","name":"Helvault","manaCost":"{3}","cmc":3,"typeLine":"Legendary Artifact","supertypes":["Legendary"],"types":["Artifact"],"subtypes":[],"oracleText":"{1}, {T}: Exile target creature you control.\n{7}, {T}: Exile target creature you don't control.\nWhen Helvault is put into a graveyard from the battlefield, return all cards exiled with it to the battlefield under their owners' control.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/6/16d2448c-1b2e-466a-a0ab-e20ba1de6bc9.jpg?1783940791","artUrl":"https://cards.scryfall.io/art_crop/front/1/6/16d2448c-1b2e-466a-a0ab-e20ba1de6bc9.jpg?1783940791","commanderLegal":"legal","set":"dka","releasedAt":"2012-02-03","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const alhammarret = (): CardDef => ({"oracleId":"c2531360-61f8-4edc-886b-408811a0639d","name":"Alhammarret, High Arbiter","manaCost":"{5}{U}{U}","cmc":7,"typeLine":"Legendary Creature — Sphinx","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Sphinx"],"oracleText":"Flying\nAs Alhammarret enters, each opponent reveals their hand. You choose the name of a nonland card revealed this way.\nYour opponents can't cast spells with the chosen name (as long as this creature is on the battlefield).","power":"5","toughness":"5","colors":["U"],"colorIdentity":["U"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/4/2/4200b101-19d3-4442-bddd-3eb77d5f99a9.jpg?1783938355","artUrl":"https://cards.scryfall.io/art_crop/front/4/2/4200b101-19d3-4442-bddd-3eb77d5f99a9.jpg?1783938355","commanderLegal":"legal","set":"ori","releasedAt":"2015-07-17","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const feather = (): CardDef => ({"oracleId":"957413ae-e756-4afe-886a-b57bf59d5f8d","name":"Feather, Radiant Arbiter","manaCost":"{R}{W}{W}","cmc":3,"typeLine":"Legendary Creature — Angel","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying, lifelink\nWhenever you cast a noncreature spell that targets only Feather, you may choose any number of other creatures that spell could target and pay {2} for each of those creatures. If you do, for each of those creatures, copy that spell. The copy targets that creature. (Copies of permanent spells become tokens.)","power":"4","toughness":"3","colors":["R","W"],"colorIdentity":["R","W"],"keywords":["Flying","Lifelink"],"imageUrl":"https://cards.scryfall.io/normal/front/d/7/d763695b-c184-409d-962d-5aaf39a6264e.jpg?1783913055","artUrl":"https://cards.scryfall.io/art_crop/front/d/7/d763695b-c184-409d-962d-5aaf39a6264e.jpg?1783913055","commanderLegal":"legal","set":"mkc","releasedAt":"2024-02-09","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const zevlor = (): CardDef => ({"oracleId":"0c85a577-db82-4a36-bc42-49644eba1cf2","name":"Zevlor, Elturel Exile","manaCost":"{1}{U}{B}{R}","cmc":4,"typeLine":"Legendary Creature — Tiefling Warrior","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Tiefling","Warrior"],"oracleText":"Haste\n{2}, {T}: When you next cast an instant or sorcery spell that targets only a single opponent or a single permanent an opponent controls this turn, for each other opponent, choose that player or a permanent they control, copy that spell, and the copy targets the chosen player or permanent.","power":"4","toughness":"2","colors":["B","R","U"],"colorIdentity":["B","R","U"],"keywords":["Haste"],"imageUrl":"https://cards.scryfall.io/normal/front/6/a/6abfec4f-54b8-427e-9abf-6209aa659994.jpg?1783922621","artUrl":"https://cards.scryfall.io/art_crop/front/6/a/6abfec4f-54b8-427e-9abf-6209aa659994.jpg?1783922621","commanderLegal":"legal","set":"clb","releasedAt":"2022-06-10","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const stanggEcho = (): CardDef => ({"oracleId":"aaf2a587-ced7-4615-b10f-164e7384b073","name":"Stangg, Echo Warrior","manaCost":"{2}{R}{G}","cmc":4,"typeLine":"Legendary Creature — Human Warrior","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Warrior"],"oracleText":"Whenever Stangg attacks, create Stangg Twin, a legendary 3/4 red and green Human Warrior creature token. It enters tapped and attacking. For each Aura and Equipment attached to Stangg, create a token that's a copy of it attached to Stangg Twin. Sacrifice all tokens created this way at the beginning of the next end step.","power":"3","toughness":"4","colors":["G","R"],"colorIdentity":["G","R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/3/9385b40f-79a7-4d9c-b253-54587a1f28b4.jpg?1783921450","artUrl":"https://cards.scryfall.io/art_crop/front/9/3/9385b40f-79a7-4d9c-b253-54587a1f28b4.jpg?1783921450","commanderLegal":"legal","set":"dmc","releasedAt":"2022-09-09","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const fireball = (): CardDef => ({"oracleId":"aa7714b0-2bfb-458a-8ebf-37ec2c53383e","name":"Fireball","manaCost":"{X}{R}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"This spell costs {1} more to cast for each target beyond the first.\nFireball deals X damage divided evenly, rounded down, among any number of targets.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/2/82a97aae-d8a7-4451-a47e-ea878dea6e4c.jpg?1783922638","artUrl":"https://cards.scryfall.io/art_crop/front/8/2/82a97aae-d8a7-4451-a47e-ea878dea6e4c.jpg?1783922638","commanderLegal":"legal","set":"clb","releasedAt":"2022-06-10","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const rancor = (): CardDef => ({"oracleId":"9d2d6479-531c-4ce1-b52b-00e36fa63b64","name":"Rancor","manaCost":"{G}","cmc":1,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature gets +2/+0 and has trample.\nWhen this Aura is put into a graveyard from the battlefield, return it to its owner's hand.","colors":["G"],"colorIdentity":["G"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/4/0/4073ecc9-5d3a-452f-b708-0572fa27a6f0.jpg?1783912355","artUrl":"https://cards.scryfall.io/art_crop/front/4/0/4073ecc9-5d3a-452f-b708-0572fa27a6f0.jpg?1783912355","commanderLegal":"legal","set":"pip","releasedAt":"2024-03-08","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const bonesplitter = (): CardDef => ({"oracleId":"452e3f5f-ce17-4682-966b-5cc100210aee","name":"Bonesplitter","manaCost":"{1}","cmc":1,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +2/+0.\nEquip {1}","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/a/e/ae31d513-7412-4467-b497-a7183ff29a42.jpg?1783944980","artUrl":"https://cards.scryfall.io/art_crop/front/a/e/ae31d513-7412-4467-b497-a7183ff29a42.jpg?1783944980","commanderLegal":"legal","set":"pal03","releasedAt":"2003-01-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const growth = (): CardDef => ({"oracleId":"5748ebf1-24e3-499d-ab7c-c2cebd462a24","name":"Giant Growth","manaCost":"{G}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target creature gets +3/+3 until end of turn.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/d/fd1f95bf-48ea-455a-8a6c-0249b11c8900.jpg?1783902918","artUrl":"https://cards.scryfall.io/art_crop/front/f/d/fd1f95bf-48ea-455a-8a6c-0249b11c8900.jpg?1783902918","commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const shatter = (): CardDef => ({"oracleId":"84d32e68-72b9-432d-a023-7bc6a26b8ad0","name":"Shatter","manaCost":"{1}{R}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target artifact.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/2/929a41f7-f52d-4190-a80c-5ceb3e368a31.jpg?1783935294","artUrl":"https://cards.scryfall.io/art_crop/front/9/2/929a41f7-f52d-4190-a80c-5ceb3e368a31.jpg?1783935294","commanderLegal":"legal","set":"rix","releasedAt":"2018-01-19","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const blaze = (): CardDef => ({"oracleId":"0596920f-9946-42f4-a03b-24aab67f9f1b","name":"Blaze","manaCost":"{X}{R}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Blaze deals X damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/9/3940d0ca-0ca2-4446-9330-a554c3e89824.jpg?1783946468","artUrl":"https://cards.scryfall.io/art_crop/front/3/9/3940d0ca-0ca2-4446-9330-a554c3e89824.jpg?1783946468","commanderLegal":"legal","set":"p02","releasedAt":"1998-06-24","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const counterspell = (): CardDef => ({"oracleId":"cc187110-1148-4090-bbb8-e205694a39f5","name":"Counterspell","manaCost":"{U}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Counter target spell.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/c/0c9a7cb0-5bff-48ff-b620-2838816ac9b5.jpg?1783937618","artUrl":"https://cards.scryfall.io/art_crop/front/0/c/0c9a7cb0-5bff-48ff-b620-2838816ac9b5.jpg?1783937618","commanderLegal":"legal","set":"ema","releasedAt":"2016-06-10","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const murder = (): CardDef => ({"oracleId":"938b4e2c-88d9-4637-bc00-e228920c9a78","name":"Murder","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target creature.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","artUrl":"https://cards.scryfall.io/art_crop/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

const rock = card("Test Rock", "Artifact", "{4}");
const lands = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && characteristics(s, s.objects[id]!).types.includes("Land"));

describe("round 333: Rosheen, Roaring Prophet", () => {
  it("compiles", () => supported(rosheen()));

  it("{C}{C} for each card with {X} in its mana cost revealed, spent only on a cost with {X}", () => {
    const { s: s0, ap, ids } = setup([blaze(), fireball(), bolt(), rock]);
    let s = s0;
    // Every land tapped but one Mountain.
    const mountain = lands(s, ap).find((id) => name(s, id) === "Mountain")!;
    for (const id of lands(s, ap)) if (id !== mountain) s.objects[id]!.tapped = true;
    const r = putOnBattlefield(s, ap, rosheen());
    // None, one or both of the two {X} cards (not Lightning Bolt).
    expect(manaOptions(s, s.objects[r]!).map((x) => x.adds.length)).toEqual([0, 2, 4]);
    const four = manaOptions(s, s.objects[r]!).find((x) => x.adds.length === 4)!;
    s = act(s, { type: "activateMana", player: ap, objectId: r, mana: four.mana, ability: four.ability, combo: four.combo });
    expect(s.players[ap]!.manaPool.C).toBe(4);
    expect(s.log.some((l) => /reveals Blaze, Fireball/.test(l.text))).toBe(true);
    // Not a cost without {X}: the {4} artifact can't be paid for with it (and the Mountain is only one more).
    expect(planCast(s, ap, ids[3]!, [])).toBeNull();
    // Blaze with X = 3: {3}{R}, the three from Rosheen and the Mountain.
    const opp = others(s, ap)[0]!;
    s = run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, undefined, 3));
    expect(s.stack.at(-1)?.x).toBe(3);
    s = settle(s);
    expect(s.players[opp]!.life).toBe(37);
  });
});

describe("round 333: Helvault", () => {
  it("compiles", () => supported(helvault()));

  it("either exile ability's cards return to the battlefield under their owners' control when it goes to the graveyard", () => {
    const { s: s0, ap, ids, opp } = setup([shatter()]);
    let s = s0;
    const hv = putOnBattlefield(s, ap, helvault());
    const mine = putOnBattlefield(s, ap, bear());
    const theirs = putOnBattlefield(s, opp, bear({ name: "Test Bear" }));
    s = settle(run(s, planActivate(s, ap, hv, 0, [tgt(mine)])), ap);
    expect(s.objects[mine]!.zone).toBe("exile");
    s.objects[hv]!.tapped = false;
    s = settle(run(s, planActivate(s, ap, hv, 1, [tgt(theirs)])), ap);
    expect(s.objects[theirs]!.zone).toBe("exile");
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(hv)])), ap);
    expect(s.objects[hv]!.zone).toBe("graveyard");
    expect(s.objects[mine]!.zone).toBe("battlefield");
    expect(s.objects[theirs]!.zone).toBe("battlefield");
    expect(s.objects[mine]!.controller).toBe(ap);
    expect(s.objects[theirs]!.controller).toBe(opp);
  });
});

describe("round 333: Alhammarret, High Arbiter", () => {
  it("compiles", () => supported(alhammarret()));

  it("each opponent reveals their hand; one name among the nonland cards revealed, which they can't cast", () => {
    const { s: s0, ap, ids } = setup([alhammarret()]);
    let s = s0;
    const [a, b, c] = others(s, ap);
    for (const p of [a!, b!, c!]) emptyHand(s, p);
    const boltA = toHand(s, a!, bolt());
    toHand(s, b!, card("Mountain", "Basic Land — Mountain"));
    toHand(s, c!, murder());
    s = settle(run(s, planCast(s, ap, ids[0]!, [])), ap);
    const p = pend(s, "chooseOption");
    expect(p.what).toBe("cardName");
    // The nonland cards revealed, not the land, not cards elsewhere (Alhammarret itself, the bears in libraries).
    expect(p.options).toEqual(["Lightning Bolt", "Murder"]);
    expect(s.log.some((l) => /reveals their hand for Alhammarret, High Arbiter: Lightning Bolt/.test(l.text))).toBe(true);
    expect(() => act(s, { type: "chooseOption", player: ap, choice: "Counterspell" })).toThrow();
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Lightning Bolt" }), ap);
    const al = s.battlefield.find((id) => name(s, id) === "Alhammarret, High Arbiter")!;
    expect(s.objects[al]!.chosen?.name).toBe("Lightning Bolt");
    // Its opponents can't cast it; its controller can.
    expect(nameCastBan(s, a!, s.cards[s.objects[boltA]!.cardId]!)).toBeTruthy();
    expect(nameCastBan(s, ap, s.cards[s.objects[boltA]!.cardId]!)).toBeNull();
  });

  it("with no nonland card revealed, no name is chosen", () => {
    const { s: s0, ap, ids } = setup([alhammarret()]);
    let s = s0;
    for (const p of others(s, ap)) emptyHand(s, p);
    toHand(s, others(s, ap)[0]!, card("Mountain", "Basic Land — Mountain"));
    s = settle(run(s, planCast(s, ap, ids[0]!, [])), ap);
    expect(s.pending).toBeNull();
    const al = s.battlefield.find((id) => name(s, id) === "Alhammarret, High Arbiter")!;
    expect(s.objects[al]!.chosen?.name).toBeUndefined();
  });

  it("a bot names the costliest card its opponents revealed", () => {
    const { s: s0, ap, ids } = setup([alhammarret()]);
    let s = s0;
    for (const p of others(s, ap)) emptyHand(s, p);
    toHand(s, others(s, ap)[0]!, bolt());
    toHand(s, others(s, ap)[1]!, murder());
    s = settle(run(s, planCast(s, ap, ids[0]!, [])), ap);
    const [choice] = botActions(s, ap);
    expect(choice).toMatchObject({ type: "chooseOption", choice: "Murder" });
  });
});

describe("round 333: Feather, Radiant Arbiter", () => {
  it("compiles", () => supported(feather()));

  it("a noncreature spell targeting only Feather: copies for the creatures chosen and paid for, each targeting one", () => {
    const { s: s0, ap, ids, opp } = setup([growth(), growth()]);
    let s = s0;
    const f = putOnBattlefield(s, ap, feather());
    const mine = putOnBattlefield(s, ap, bear());
    const other = putOnBattlefield(s, ap, bear({ name: "Test Bear" }));
    const theirs = putOnBattlefield(s, opp, bear({ name: "Their Bear" }));
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(f)])), ap);
    const p = pend(s, "pickPermanents");
    expect(p.action).toBe("copyFor");
    expect(p.payEach).toBe("{2}");
    // Any other creature it could target, an opponent's too, never Feather itself.
    expect([...p.options].sort()).toEqual([mine, other, theirs].sort());
    // {2} for each: not enough in the pool for two.
    s.players[ap]!.manaPool.C += 2;
    expect(() => act(s, { type: "pickPermanents", player: ap, ids: [mine, other] })).toThrow();
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [mine] }), ap);
    expect(s.players[ap]!.manaPool.C).toBe(0);
    expect(`${power(s, s.objects[f]!)}/${toughness(s, s.objects[f]!)}`).toBe("7/6");
    expect(`${power(s, s.objects[mine]!)}/${toughness(s, s.objects[mine]!)}`).toBe("5/5");
    expect(`${power(s, s.objects[other]!)}/${toughness(s, s.objects[other]!)}`).toBe("2/2");
    expect(`${power(s, s.objects[theirs]!)}/${toughness(s, s.objects[theirs]!)}`).toBe("2/2");
    // A spell that doesn't target Feather doesn't trigger it.
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(other)])), ap);
    expect(s.pending).toBeNull();
    expect(`${power(s, s.objects[other]!)}/${toughness(s, s.objects[other]!)}`).toBe("5/5");
  });

  it("choosing none copies nothing; a bot copies for its own creatures it can pay for", () => {
    const { s: s0, ap, ids, opp } = setup([growth(), growth()]);
    let s = s0;
    const f = putOnBattlefield(s, ap, feather());
    const mine = putOnBattlefield(s, ap, bear());
    const theirs = putOnBattlefield(s, opp, bear({ name: "Their Bear" }));
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(f)])), ap);
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [] }), ap);
    expect(`${power(s, s.objects[mine]!)}/${toughness(s, s.objects[mine]!)}`).toBe("2/2");
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(f)])), ap);
    const acts = botActions(s, ap);
    expect(acts.at(-1)).toMatchObject({ type: "pickPermanents", ids: [mine] });
    for (const a of acts) s = act(s, a);
    s = settle(s, ap);
    expect(`${power(s, s.objects[mine]!)}/${toughness(s, s.objects[mine]!)}`).toBe("5/5");
    expect(`${power(s, s.objects[theirs]!)}/${toughness(s, s.objects[theirs]!)}`).toBe("2/2");
  });
});

describe("round 333: Zevlor, Elturel Exile", () => {
  it("compiles", () => supported(zevlor()));

  it("the next instant or sorcery targeting one opponent: a copy for each other opponent, aimed at the player or permanent chosen", () => {
    const { s: s0, ap, ids } = setup([bolt(), bolt()]);
    let s = s0;
    const [a, b, c] = others(s, ap);
    const z = putOnBattlefield(s, ap, zevlor());
    const theirs = putOnBattlefield(s, c!, bear({ name: "Their Bear" }));
    s = settle(run(s, planActivate(s, ap, z, 0)), ap);
    // A spell aimed at its controller's own creature doesn't use it up.
    const mine = putOnBattlefield(s, ap, bear());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(mine)])), ap);
    expect(s.objects[mine]!.zone).toBe("graveyard");
    expect(s.nextCast?.length).toBe(1);
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: a! }])), ap);
    // For the next opponent in turn order: that player (they control no permanent).
    let p = pend(s, "chooseOption");
    expect(p.what).toBe("copyTargetFor");
    expect(p.options).toEqual([`p${b}`]);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: `p${b}` }), ap);
    // Then the last: that player or their creature (a Bolt can't target their lands).
    p = pend(s, "chooseOption");
    expect(p.options.slice(0, 2)).toEqual([`p${c}`, theirs]);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: theirs }), ap);
    expect(s.players[a!]!.life).toBe(37);
    expect(s.players[b!]!.life).toBe(37);
    expect(s.players[c!]!.life).toBe(40);
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    expect(s.nextCast ?? []).toHaveLength(0);
  });

  it("a bot aims its copies: the next opponent, then the last opponent's creature", () => {
    const { s: s0, ap, ids } = setup([bolt()]);
    let s = s0;
    const [a, , c] = others(s, ap);
    const z = putOnBattlefield(s, ap, zevlor());
    const theirs = putOnBattlefield(s, c!, bear({ name: "Their Bear" }));
    s = settle(run(s, planActivate(s, ap, z, 0)), ap);
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: a! }])), ap);
    s = settle(s);
    // The bot answered both: player b, then c's bear.
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    expect(s.players[a!]!.life).toBe(37);
  });
});

describe("round 333: Zevlor, Elturel Exile (countered)", () => {
  it("the copies are made even if the spell was countered before the trigger resolved", () => {
    const { s: s0, ap, ids } = setup([bolt()]);
    let s = s0;
    const [a, b, c] = others(s, ap);
    const z = putOnBattlefield(s, ap, zevlor());
    for (let i = 0; i < 2; i++) putOnBattlefield(s, a!, card("Island", "Basic Land — Island"));
    const cs = toHand(s, a!, counterspell());
    s = settle(run(s, planActivate(s, ap, z, 0)), ap);
    s = run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: a! }]));
    const boltItem = s.stack.find((x) => x.kind === "spell")!;
    // The trigger is above the Bolt; Ana counters the Bolt in response.
    for (let i = 0; i < 10 && waitingOn(s) !== a; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = run(s, planCast(s, a!, cs, [{ kind: "stack", id: boltItem.id }]));
    for (let i = 0; i < 20 && s.stack.some((x) => x.id === boltItem.id); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.players[a!]!.life).toBe(40);
    s = settle(s, ap);
    expect(pend(s, "chooseOption").what).toBe("copyTargetFor");
    s = settle(act(s, { type: "chooseOption", player: ap, choice: `p${b}` }), ap);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: `p${c}` }), ap);
    expect([a, b, c].map((p) => s.players[p!]!.life)).toEqual([40, 37, 37]);
  });
});

describe("round 333: Stangg, Echo Warrior", () => {
  it("compiles", () => supported(stanggEcho()));

  it("attacking: Stangg Twin tapped and attacking, with copies of its Aura and Equipment, all sacrificed at the next end step", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const st = putOnBattlefield(s, ap, stanggEcho());
    const ra = putOnBattlefield(s, ap, rancor());
    const bs = putOnBattlefield(s, ap, bonesplitter());
    s.objects[ra]!.attachedTo = st;
    s.objects[bs]!.attachedTo = st;
    for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: st, defender: opp }] });
    s = settle(s, ap);
    // The token attacks a player of its controller's choice (CR 508.4).
    expect(pend(s, "chooseOption").what).toBe("attackWhom");
    s = settle(act(s, { type: "chooseOption", player: ap, choice: String(opp) }), ap);
    const twin = s.battlefield.find((id) => name(s, id) === "Stangg Twin")!;
    expect(twin).toBeDefined();
    const t = s.objects[twin]!;
    expect(t.isToken && t.tapped).toBe(true);
    expect(t.attacking).toBe(opp);
    expect(characteristics(s, t).supertypes).toContain("Legendary");
    const copies = s.battlefield.filter((id) => s.objects[id]!.attachedTo === twin);
    expect(copies.map((id) => name(s, id)).sort()).toEqual(["Bonesplitter", "Rancor"]);
    expect(copies.every((id) => s.objects[id]!.isToken)).toBe(true);
    // 3/4, +2/+0 twice, trample from the Rancor copy.
    expect(`${power(s, t)}/${toughness(s, t)}`).toBe("7/4");
    expect(characteristics(s, t).keywords).toContain("Trample");
    // The originals stay on Stangg.
    expect(s.objects[ra]!.attachedTo).toBe(st);
    expect(s.objects[bs]!.attachedTo).toBe(st);
    for (let i = 0; i < 200 && s.step !== "end"; i++) s = s.pending ? act(s, botActions(s, s.pending.player)[0]!) : act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(s, ap);
    expect(s.battlefield.some((id) => name(s, id) === "Stangg Twin")).toBe(false);
    expect(s.battlefield.filter((id) => s.objects[id]!.isToken)).toHaveLength(0);
    expect(s.objects[ra]!.zone).toBe("battlefield");
    expect(s.objects[bs]!.zone).toBe("battlefield");
  });

  it("with nothing attached, only the twin", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const st = putOnBattlefield(s, ap, stanggEcho());
    for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: st, defender: opp }] });
    s = settle(s);
    expect(s.battlefield.filter((id) => s.objects[id]!.isToken).map((id) => name(s, id))).toEqual(["Stangg Twin"]);
  });
});
