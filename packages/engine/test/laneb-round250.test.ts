// Lane B round B250: Gather Specimens ("If a creature would enter the battlefield under an opponent's control this turn, it
// enters under your control instead."), a control-changing replacement applied before the creature's other replacements of
// how it enters (CR 614.1c, 616.1b, rulings), and Kraven the Hunter ("Whenever a creature an opponent controls with the
// greatest power among creatures that player controls dies, ..."), which looks back to just before the creatures died,
// several at once included (CR 603.10a).

import { describe, expect, it } from "vitest";
import { act, passUntil, plainsCard, putOnBattlefield, setup, swamp } from "./helpers";
import { applyAction, botActions, characteristics, compileCard, invalidateCharacteristics, isFullySupported, moveObject, planCast, runStateBasedActions, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const gather = (): CardDef => ({"oracleId":"e3b8d70b-17aa-4a31-a4f9-319907d088c2","name":"Gather Specimens","manaCost":"{3}{U}{U}{U}","cmc":6,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"If a creature would enter the battlefield under an opponent's control this turn, it enters under your control instead.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/b/bbadf982-f22e-4f4f-b5c9-ac387f25c15f.jpg?1783942574","artUrl":"https://cards.scryfall.io/art_crop/front/b/b/bbadf982-f22e-4f4f-b5c9-ac387f25c15f.jpg?1783942574","layout":"normal"});
const kraven = (): CardDef => ({"oracleId":"3e2bfa3a-ae83-453a-8e3f-ca6205a9af12","name":"Kraven the Hunter","manaCost":"{1}{B}{G}","cmc":3,"typeLine":"Legendary Creature — Human Warrior Villain","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Warrior","Villain"],"oracleText":"Trample\nWhenever a creature an opponent controls with the greatest power among creatures that player controls dies, draw a card and put a +1/+1 counter on Kraven the Hunter.","power":"4","toughness":"3","colors":["B","G"],"colorIdentity":["B","G"],"keywords":["Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/a/f/afdab464-3674-449b-be01-1cbd21fced23.jpg?1783905315","artUrl":"https://cards.scryfall.io/art_crop/front/a/f/afdab464-3674-449b-be01-1cbd21fced23.jpg?1783905315","layout":"normal"});
const goblinKing = (): CardDef => ({"oracleId":"d236b3fc-0d3f-4d99-875d-e32a33fe5767","name":"Goblin King","manaCost":"{1}{R}{R}","cmc":3,"typeLine":"Creature — Goblin","supertypes":[],"types":["Creature"],"subtypes":["Goblin"],"oracleText":"Other Goblins get +1/+1 and have mountainwalk.","power":"2","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/5/455dff34-0ab2-4798-84a9-66dcf37f1789.jpg?1783931623","artUrl":"https://cards.scryfall.io/art_crop/front/4/5/455dff34-0ab2-4798-84a9-66dcf37f1789.jpg?1783931623","layout":"normal"});
const piker = (): CardDef => ({"oracleId":"50608184-90d3-43d2-a221-deb186c78323","name":"Goblin Piker","manaCost":"{1}{R}","cmc":2,"typeLine":"Creature — Goblin Warrior","supertypes":[],"types":["Creature"],"subtypes":["Goblin","Warrior"],"oracleText":"","power":"2","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/7/2786834d-dbda-40ce-82a4-e518cd554312.jpg?1783946464","artUrl":"https://cards.scryfall.io/art_crop/front/2/7/2786834d-dbda-40ce-82a4-e518cd554312.jpg?1783946464","layout":"normal"});
const wrath = (): CardDef => ({"oracleId":"34515b16-c9a4-4f98-8c77-416a7a523407","name":"Wrath of God","manaCost":"{2}{W}{W}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Destroy all creatures. They can't be regenerated.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/8/98890cd7-ebd5-4fea-814e-4f612abfe3a5.jpg?1783939131","artUrl":"https://cards.scryfall.io/art_crop/front/9/8/98890cd7-ebd5-4fea-814e-4f612abfe3a5.jpg?1783939131","layout":"normal"});
const hero = (): CardDef => ({"oracleId":"454a8902-8120-4373-96ee-bbf352b04e8d","name":"Hero of Bladehold","manaCost":"{2}{W}{W}","cmc":4,"typeLine":"Creature — Human Knight","supertypes":[],"types":["Creature"],"subtypes":["Human","Knight"],"oracleText":"Battle cry (Whenever this creature attacks, each other attacking creature gets +1/+0 until end of turn.)\nWhenever this creature attacks, create two 1/1 white Soldier creature tokens that are tapped and attacking.","power":"3","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Battle Cry"],"imageUrl":"https://cards.scryfall.io/normal/front/8/5/8536e50d-81b3-4b1d-9469-22fad35fe145.jpg?1783917185","artUrl":"https://cards.scryfall.io/art_crop/front/8/5/8536e50d-81b3-4b1d-9469-22fad35fe145.jpg?1783917185","layout":"normal"});
const murder = (): CardDef => ({"oracleId":"938b4e2c-88d9-4637-bc00-e228920c9a78","name":"Murder","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target creature.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","artUrl":"https://cards.scryfall.io/art_crop/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","layout":"normal"});
const rager = (): CardDef => ({"oracleId":"e409c9be-0c9a-43c3-adb4-8c47afc1d551","name":"Phyrexian Rager","manaCost":"{2}{B}","cmc":3,"typeLine":"Creature — Phyrexian Horror","supertypes":[],"types":["Creature"],"subtypes":["Phyrexian","Horror"],"oracleText":"When this creature enters, you draw a card and you lose 1 life.","power":"2","toughness":"2","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/f/6fd574e7-705f-4a65-aad0-68ff6d63bf0f.jpg?1783921329","artUrl":"https://cards.scryfall.io/art_crop/front/6/f/6fd574e7-705f-4a65-aad0-68ff6d63bf0f.jpg?1783921329","layout":"normal"});
const essence = (): CardDef => ({"oracleId":"9d105f83-583d-438b-8f26-b39e818ed295","name":"Essence of the Wild","manaCost":"{3}{G}{G}{G}","cmc":6,"typeLine":"Creature — Avatar","supertypes":[],"types":["Creature"],"subtypes":["Avatar"],"oracleText":"Creatures you control enter as a copy of this creature.","power":"6","toughness":"6","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/e/dec48cba-1b5d-44e7-9e25-16922dedb67d.jpg?1783940920","artUrl":"https://cards.scryfall.io/art_crop/front/d/e/dec48cba-1b5d-44e7-9e25-16922dedb67d.jpg?1783940920","layout":"normal"});
const alarm = (): CardDef => ({"oracleId":"5b2364d7-a811-4595-a1b4-224c70555ffa","name":"Raise the Alarm","manaCost":"{1}{W}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Create two 1/1 white Soldier creature tokens.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/1/81d3e5c5-6531-48e7-9dd6-2db519dd61b1.jpg?1783908838","artUrl":"https://cards.scryfall.io/art_crop/front/8/1/81d3e5c5-6531-48e7-9dd6-2db519dd61b1.jpg?1783908838","layout":"normal"});
const xantcha = (): CardDef => ({"oracleId":"0f0f3712-8d13-41a5-b332-2ab34e48d79d","name":"Xantcha, Sleeper Agent","manaCost":"{1}{B}{R}","cmc":3,"typeLine":"Legendary Creature — Phyrexian Minion","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Phyrexian","Minion"],"oracleText":"Xantcha enters under the control of an opponent of your choice.\nXantcha attacks each combat if able and can't attack its owner or planeswalkers its owner controls.\n{3}: Xantcha's controller loses 2 life and you draw a card. Any player may activate this ability.","power":"5","toughness":"5","colors":["B","R"],"colorIdentity":["B","R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/9/89b03b9a-7e20-47cb-bc64-23513acea855.jpg?1783934325","artUrl":"https://cards.scryfall.io/art_crop/front/8/9/89b03b9a-7e20-47cb-bc64-23513acea855.jpg?1783934325","layout":"normal"});
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","layout":"normal"});
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"layout":"normal"});

const supported = (...ds: CardDef[]) => ds.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Passes and lets bots answer until the stack is empty or one of `me` has a question. */
const settle = (s: GameState, me: PlayerId[] = []) => {
  for (let i = 0; i < 400 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && !me.includes(p.player)) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const name = (s: GameState, id: string) => characteristics(s, s.objects[id]!).name;
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const ctl = (s: GameState, id: string) => s.objects[id]!.controller;
/** A card put into `pid`'s hand. */
const inHand = (s: GameState, pid: PlayerId, d: CardDef) => {
  const id = putOnBattlefield(s, pid, d);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Put onto the battlefield under `pid`'s control by an effect, then the choices it asks as it enters. */
const enter = (s: GameState, id: string, pid: PlayerId) => {
  moveObject(s, id, "battlefield", { controller: pid });
  runStateBasedActions(s);
  return s;
};
/** Ana casts Gather Specimens and it resolves. */
const gathered = (cards: CardDef[] = []) => {
  const { s: s0, ap, opp, ids } = setup([gather(), ...cards]);
  const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
  expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  return { s, ap, opp, ids: ids.slice(1), third: s.turnOrder[(s.turnOrder.indexOf(ap) + 2) % 4]!, fourth: s.turnOrder[(s.turnOrder.indexOf(ap) + 3) % 4]! };
};

describe("Lane B round B250: Gather Specimens", () => {
  it("is fully supported: one replacement for the rest of the turn", () => {
    supported(gather());
    expect(compileCard(gather()).spell?.effects).toEqual([{ type: "gatherSpecimens" }]);
    const { s, ap } = gathered();
    expect(s.gatherSpecimens?.map((g) => [g.player, g.turn])).toEqual([[ap, s.turn]]);
  });

  it("an opponent's creature card put onto the battlefield enters under your control, its enters trigger yours; ownership doesn't change", () => {
    const { s: s0, ap, opp } = gathered();
    const r = inHand(s0, opp, rager());
    const [life, hand, theirLife] = [s0.players[ap]!.life, s0.players[ap]!.hand.length, s0.players[opp]!.life];
    moveObject(s0, r, "battlefield", { controller: opp });
    expect(ctl(s0, r)).toBe(ap);
    expect(s0.objects[r]!.owner).toBe(opp);
    expect(s0.log.some((l) => l.text === `Phyrexian Rager enters under ${s0.players[ap]!.name}'s control instead (Gather Specimens).`)).toBe(true);
    const s = settle(s0);
    // "When this creature enters, you draw a card and you lose 1 life": the player who controls it as it triggers (rulings).
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.players[ap]!.life).toBe(life - 1);
    expect(s.players[opp]!.life).toBe(theirLife);
  });

  it("a creature token an opponent creates enters under your control; that opponent still owns it", () => {
    const { s: s0, ap, opp } = gathered();
    const alarmId = inHand(s0, opp, alarm());
    putOnBattlefield(s0, opp, plainsCard);
    putOnBattlefield(s0, opp, plainsCard);
    let s = act(s0, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(opp);
    s = settle(run(s, planCast(s, opp, alarmId)));
    const soldiers = s.battlefield.filter((id) => s.objects[id]!.isToken && name(s, id) === "Soldier Token");
    expect(soldiers.length).toBe(2);
    expect(soldiers.map((id) => [ctl(s, id), s.objects[id]!.owner])).toEqual([[ap, opp], [ap, opp]]);
  });

  it("your own creatures, creatures already on the battlefield and noncreature permanents aren't affected", () => {
    const { s, ap, opp, ids } = gathered([bears()]);
    const theirs = putOnBattlefield(s, opp, giant());
    const mine = run(s, planCast(s, ap, ids[0]!));
    const s1 = settle(mine);
    expect(ctl(s1, ids[0]!)).toBe(ap);
    expect(ctl(s1, theirs)).toBe(opp);
    const land = inHand(s1, opp, plainsCard);
    moveObject(s1, land, "battlefield", { controller: opp });
    expect(ctl(s1, land)).toBe(opp);
  });

  it("is applied before copy effects: it enters as a copy of your Essence of the Wild, not of an opponent's", () => {
    const { s, ap, opp } = gathered();
    putOnBattlefield(s, ap, essence());
    const b = inHand(s, opp, bears());
    moveObject(s, b, "battlefield", { controller: opp });
    const s1 = settle(s);
    expect([ctl(s1, b), name(s1, b), pt(s1, b)]).toEqual([ap, "Essence of the Wild", "6/6"]);
    // The opponent's Essence of the Wild copies only creatures that would enter under that opponent's control.
    const g2 = gathered();
    putOnBattlefield(g2.s, g2.opp, essence());
    const b2 = inHand(g2.s, g2.opp, bears());
    moveObject(g2.s, b2, "battlefield", { controller: g2.opp });
    const s2 = settle(g2.s);
    expect([ctl(s2, b2), name(s2, b2), pt(s2, b2)]).toEqual([g2.ap, "Grizzly Bears", "2/2"]);
  });

  it("ends with the turn", () => {
    const { s: s0, ap, opp } = gathered();
    let s = s0;
    for (let i = 0; i < 2000 && s.turn === s0.turn; i++) {
      const pid = waitingOn(s)!;
      const p = s.pending;
      if (p && p.kind !== "declareAttackers" && p.kind !== "declareBlockers") for (const a of botActions(s, p.player)) s = act(s, a);
      else if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
      else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
      else s = act(s, { type: "passPriority", player: pid });
    }
    expect(s.turn).toBe(s0.turn + 1);
    const b = inHand(s, opp, bears());
    moveObject(s, b, "battlefield", { controller: opp });
    expect(ctl(s, b)).toBe(opp);
    expect(ap).not.toBe(opp);
  });

  it("two players' Gather Specimens: the player it would enter under chooses which applies first, then the other applies if it can (rulings)", () => {
    const { s: s0, ap, opp, third } = gathered();
    // The opponent cast one too this turn.
    s0.gatherSpecimens = [...s0.gatherSpecimens!, { id: "gx", player: opp, turn: s0.turn, source: "Gather Specimens" }];
    const b = inHand(s0, third, bears());
    let s = settle(enter(s0, b, third), [third]);
    expect(s.pending?.kind === "chooseOption" && s.pending.what).toBe("controlFirst");
    expect(s.pending?.player).toBe(third);
    expect(s.pending?.kind === "chooseOption" && s.pending.options).toEqual([String(ap), String(opp)]);
    // The opponent's first: then Ana's applies to the opponent's creature, and it ends up Ana's.
    s = settle(act(s, { type: "chooseOption", player: third, choice: String(opp) }), [third]);
    expect(ctl(s, b)).toBe(ap);
    // Would it enter under Ana's control, Ana's doesn't apply, the opponent's does, then Ana's: Ana's again (rulings).
    const mine = inHand(s, ap, bears());
    moveObject(s, mine, "battlefield", { controller: ap });
    const s2 = settle(s, [ap, opp]);
    expect(ctl(s2, mine)).toBe(ap);
    expect(s2.pending).toBeNull();
  });

  it("Xantcha you put onto the battlefield: you choose its opponent, then your Gather Specimens brings it back under your control", () => {
    const { s: s0, ap, opp } = gathered();
    const x = inHand(s0, ap, xantcha());
    let s = settle(enter(s0, x, ap), [ap]);
    expect(s.pending?.kind === "chooseOption" && s.pending.what).toBe("controlOpponent");
    s = settle(act(s, { type: "chooseOption", player: ap, choice: String(opp) }), [ap]);
    expect(ctl(s, x)).toBe(ap);
  });

  it("an opponent's Xantcha: that opponent orders its own control replacement and Gather Specimens", () => {
    const { s: s0, ap, opp, third } = gathered();
    const x = inHand(s0, opp, xantcha());
    let s = settle(enter(s0, x, opp), [opp]);
    expect(s.pending?.kind === "chooseOption" && s.pending.what).toBe("controlFirst");
    expect(s.pending?.kind === "chooseOption" && s.pending.options).toEqual([String(ap), "self"]);
    // Its own first: an opponent of the opponent's choice; another opponent of Ana's, so Gather Specimens takes it.
    s = settle(act(s, { type: "chooseOption", player: opp, choice: "self" }), [opp]);
    expect(s.pending?.kind === "chooseOption" && s.pending.what).toBe("controlOpponent");
    s = settle(act(s, { type: "chooseOption", player: opp, choice: String(third) }), [opp]);
    expect(ctl(s, x)).toBe(ap);
    // Gather Specimens first: under Ana's control, then its own: an opponent of Ana's choice, and Ana's is used up.
    const g = gathered();
    const x2 = inHand(g.s, g.opp, xantcha());
    let t = settle(enter(g.s, x2, g.opp), [g.opp, g.ap]);
    t = settle(act(t, { type: "chooseOption", player: g.opp, choice: String(g.ap) }), [g.opp, g.ap]);
    expect(t.pending?.kind === "chooseOption" && [t.pending.what, t.pending.player]).toEqual(["controlOpponent", g.ap]);
    t = settle(act(t, { type: "chooseOption", player: g.ap, choice: String(g.third) }), [g.opp, g.ap]);
    expect(ctl(t, x2)).toBe(g.third);
  });

  it("tokens an opponent creates tapped and attacking enter under your control, but they aren't attacking (CR 506.3d)", () => {
    const { s: s0, ap, opp, ids } = setup([gather()]);
    const h = putOnBattlefield(s0, opp, hero());
    let s = passUntil(s0, "beginCombat", opp);
    for (let i = 0; i < 10 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(s.gatherSpecimens?.length).toBe(1);
    for (let i = 0; i < 20 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: h, defender: ap }] });
    for (let i = 0; i < 50 && (s.stack.length || s.triggerQueue.length) && s.pending?.kind !== "declareBlockers"; i++) s = s.pending ? botActions(s, s.pending.player).reduce(act, s) : act(s, { type: "passPriority", player: waitingOn(s)! });
    const soldiers = s.battlefield.filter((id) => s.objects[id]!.isToken && name(s, id) === "Soldier Token");
    expect(soldiers.length).toBe(2);
    expect(soldiers.map((id) => [ctl(s, id), s.objects[id]!.tapped, s.objects[id]!.attacking])).toEqual([[ap, true, undefined], [ap, true, undefined]]);
    expect(s.objects[h]!.attacking).toBe(ap);
  });

  it("bots answer the order with the player who has the least life", () => {
    const { s: s0, ap, opp, third } = gathered();
    s0.gatherSpecimens = [...s0.gatherSpecimens!, { id: "gx", player: opp, turn: s0.turn, source: "Gather Specimens" }];
    s0.players[opp]!.life = 5;
    const b = inHand(s0, third, bears());
    const s = settle(enter(s0, b, third), [third]);
    expect(botActions(s, third)).toEqual([{ type: "chooseOption", player: third, choice: String(opp) }]);
    expect(ap).not.toBe(third);
  });
});

describe("Lane B round B250: Kraven the Hunter", () => {
  const withKraven = (cards: CardDef[]) => {
    const g = setup(cards);
    const k = putOnBattlefield(g.s, g.ap, kraven());
    for (let i = 0; i < 4; i++) putOnBattlefield(g.s, g.ap, swamp);
    return { ...g, k, third: g.s.turnOrder[(g.s.turnOrder.indexOf(g.ap) + 2) % 4]! };
  };
  it("is fully supported", () => {
    supported(kraven());
    const t = compileCard(kraven()).triggers;
    expect(t.map((x) => [x.event, x.dies?.greatestPowerOfController, x.dies?.filter.controller])).toEqual([["permanentDies", true, "opponent"]]);
  });

  it("an opponent's creature with the greatest power among theirs dies: draw a card and a +1/+1 counter; a smaller one, or one of yours, nothing", () => {
    const { s: s0, ap, opp, ids, k } = withKraven([murder(), murder(), murder()]);
    const big = putOnBattlefield(s0, opp, giant());
    const small = putOnBattlefield(s0, opp, bears());
    const mine = putOnBattlefield(s0, ap, giant());
    const start = s0.players[ap]!.hand.length;
    const hand = () => s.players[ap]!.hand.length - start;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(small)])));
    expect(s.objects[small]!.zone).toBe("graveyard");
    expect([hand(), s.objects[k]!.counters["+1/+1"] ?? 0]).toEqual([-1, 0]);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(mine)])));
    expect([hand(), s.objects[k]!.counters["+1/+1"] ?? 0]).toEqual([-2, 0]);
    s = settle(run(s, planCast(s, ap, ids[2]!, [tgt(big)])));
    expect(s.objects[big]!.zone).toBe("graveyard");
    expect([hand(), s.objects[k]!.counters["+1/+1"]]).toEqual([-2, 1]);
    expect(pt(s, k)).toBe("5/4");
  });

  it("a creature tied for the greatest power counts", () => {
    const { s: s0, ap, opp, ids, k } = withKraven([murder()]);
    putOnBattlefield(s0, opp, bears());
    const b = putOnBattlefield(s0, opp, bears());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])));
    expect(s.objects[k]!.counters["+1/+1"]).toBe(1);
  });

  it("several dying at once: their powers just before, a lord's bonus included (CR 603.10a); Kraven dying with them still sees them", () => {
    const { s: s0, ap, opp, ids, k, third } = withKraven([wrath()]);
    // Grizzly Bears 2/2, Goblin Piker 3/2 with Goblin King's +1/+1, the King 2/2: only the Piker had the greatest power,
    // though the Bears had as much as it once the King was gone.
    putOnBattlefield(s0, opp, bears());
    const piker2 = putOnBattlefield(s0, opp, piker());
    putOnBattlefield(s0, opp, goblinKing());
    expect(pt(s0, piker2)).toBe("3/2");
    // Two Grizzly Bears tied: both had the greatest power.
    putOnBattlefield(s0, third, bears());
    putOnBattlefield(s0, third, bears());
    const hand = s0.players[ap]!.hand.length;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[k]!.zone).toBe("graveyard");
    // Three triggers, each a draw; Kraven is gone, so no counters.
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 3);
  });

  it("the look back is only for the event: a later death compares with what's left then", () => {
    const { s: s0, ap, opp, ids, k } = withKraven([murder(), murder()]);
    const king = putOnBattlefield(s0, opp, goblinKing());
    const pk = putOnBattlefield(s0, opp, piker());
    putOnBattlefield(s0, opp, giant());
    // The King dies alone: 2 power against the Piker's 3 and the Giant's 3, no trigger.
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(king)])));
    expect(s.objects[k]!.counters["+1/+1"] ?? 0).toBe(0);
    // Then the Piker, 2 power now against the Giant's 3: none either.
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(pk)])));
    expect(s.objects[k]!.counters["+1/+1"] ?? 0).toBe(0);
  });
});
