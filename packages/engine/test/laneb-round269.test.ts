// Lane B round B269: Prowl, Stoic Strategist (a player playing a card it exiled draws you a card and converts it, CR
// 607.2a, 701.28a), Lucy MacLean, Positively Armed (a copy of an entering token for another player, once each turn, CR
// 603.2h) and Apple of Eden, Isu Relic (an opponent's hand exiled face down for you to play this turn, each card played
// drawing its owner a card, the rest returned at the next end step, CR 406.3, 603.7).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup, target } from "./helpers";
import { applyAction, botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, triggerBody, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const prowl = (): CardDef => ({"oracleId":"8dfd9baf-c3cc-4d2f-a0b0-b323b6480562","name":"Prowl, Stoic Strategist // Prowl, Pursuit Vehicle","manaCost":"{3}{W}","cmc":4,"typeLine":"Legendary Artifact Creature — Robot // Legendary Artifact — Vehicle","supertypes":["Legendary"],"types":["Artifact","Creature"],"subtypes":["Robot"],"oracleText":"More Than Meets the Eye {2}{W} (You may cast this card converted for {2}{W}.)\nWhenever Prowl attacks, exile up to one other target tapped creature or Vehicle. For as long as that card remains exiled, its owner may play it.\nWhenever a player plays a card exiled with Prowl, you draw a card and convert Prowl.","power":"3","toughness":"3","colors":["W"],"colorIdentity":["W"],"keywords":["Living metal","Convert","More Than Meets the Eye"],"imageUrl":"https://cards.scryfall.io/normal/front/f/0/f0a3dc50-a5c4-4073-8fec-2f68544bc2a1.jpg?1783919909","artUrl":"https://cards.scryfall.io/art_crop/front/f/0/f0a3dc50-a5c4-4073-8fec-2f68544bc2a1.jpg?1783919909","layout":"transform","faces":[{"name":"Prowl, Stoic Strategist","manaCost":"{3}{W}","typeLine":"Legendary Artifact Creature — Robot","supertypes":["Legendary"],"types":["Artifact","Creature"],"subtypes":["Robot"],"oracleText":"More Than Meets the Eye {2}{W} (You may cast this card converted for {2}{W}.)\nWhenever Prowl attacks, exile up to one other target tapped creature or Vehicle. For as long as that card remains exiled, its owner may play it.\nWhenever a player plays a card exiled with Prowl, you draw a card and convert Prowl.","power":"3","toughness":"3","colors":["W"],"imageUrl":"https://cards.scryfall.io/normal/front/f/0/f0a3dc50-a5c4-4073-8fec-2f68544bc2a1.jpg?1783919909","artUrl":"https://cards.scryfall.io/art_crop/front/f/0/f0a3dc50-a5c4-4073-8fec-2f68544bc2a1.jpg?1783919909"},{"name":"Prowl, Pursuit Vehicle","manaCost":"","typeLine":"Legendary Artifact — Vehicle","supertypes":["Legendary"],"types":["Artifact"],"subtypes":["Vehicle"],"oracleText":"Living metal (During your turn, this Vehicle is also a creature.)\nWhenever another creature or Vehicle you control enters, put a +1/+1 counter on Prowl. If this is the second time this ability has resolved this turn, convert Prowl.","power":"2","toughness":"3","colors":["W"],"colorIndicator":["W"],"imageUrl":"https://cards.scryfall.io/normal/back/f/0/f0a3dc50-a5c4-4073-8fec-2f68544bc2a1.jpg?1783919909","artUrl":"https://cards.scryfall.io/art_crop/back/f/0/f0a3dc50-a5c4-4073-8fec-2f68544bc2a1.jpg?1783919909"}]});
const lucy = (): CardDef => ({"oracleId":"1196a4cb-544c-4e7b-91cd-f0820b21a80d","name":"Lucy MacLean, Positively Armed","manaCost":"{4}{W}","cmc":5,"typeLine":"Legendary Creature — Human Survivor","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Survivor"],"oracleText":"Golden Rule — Whenever a token enters, you may have target player other than its controller create a token that's a copy of it, then you draw a card if an opponent created a token this way. Do this only once each turn.","power":"3","toughness":"5","colors":["W"],"colorIdentity":["W"],"keywords":["Golden Rule"],"imageUrl":"https://cards.scryfall.io/normal/front/2/a/2a5150ee-d177-48f5-9c93-edfaa95922ab.jpg?1783904272","artUrl":"https://cards.scryfall.io/art_crop/front/2/a/2a5150ee-d177-48f5-9c93-edfaa95922ab.jpg?1783904272","layout":"normal"});
const apple = (): CardDef => ({"oracleId":"7849426d-895d-4dfe-a94d-b8df634618a5","name":"Apple of Eden, Isu Relic","manaCost":"{4}","cmc":4,"typeLine":"Legendary Artifact","supertypes":["Legendary"],"types":["Artifact"],"subtypes":[],"oracleText":"{T}, Pay 4 life, Sacrifice Apple of Eden: Look at target opponent's hand and exile those cards face down. You may play those cards this turn, and mana of any type can be spent to cast them. Until end of turn, whenever you play a land or cast a spell this way, its owner draws a card. At the beginning of the next end step, return the exiled cards to their owner's hand. Activate only as a sorcery.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/7/17dd0b7f-bd26-4a46-a7a1-bc65138d54ed.jpg?1783910966","artUrl":"https://cards.scryfall.io/art_crop/front/1/7/17dd0b7f-bd26-4a46-a7a1-bc65138d54ed.jpg?1783910966","layout":"normal"});
const raiseTheAlarm = (): CardDef => ({"oracleId":"5b2364d7-a811-4595-a1b4-224c70555ffa","name":"Raise the Alarm","manaCost":"{1}{W}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Create two 1/1 white Soldier creature tokens.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/1/81d3e5c5-6531-48e7-9dd6-2db519dd61b1.jpg?1783908838","artUrl":"https://cards.scryfall.io/art_crop/front/8/1/81d3e5c5-6531-48e7-9dd6-2db519dd61b1.jpg?1783908838","layout":"normal"});
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","layout":"normal"});
const ambushViper = (): CardDef => ({"oracleId":"8957f7c2-040c-4048-9f21-efa7c97682b7","name":"Ambush Viper","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Snake","supertypes":[],"types":["Creature"],"subtypes":["Snake"],"oracleText":"Flash\nDeathtouch","power":"2","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":["Flash","Deathtouch"],"imageUrl":"https://cards.scryfall.io/normal/front/0/c/0c082aa8-bf7f-47f2-baf8-43ad253fd7d7.jpg?1783940925","artUrl":"https://cards.scryfall.io/art_crop/front/0/c/0c082aa8-bf7f-47f2-baf8-43ad253fd7d7.jpg?1783940925","layout":"normal"});
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","layout":"normal"});
const forestCard = (): CardDef => ({"oracleId":"b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6","name":"Forest","manaCost":"","cmc":0,"typeLine":"Basic Land — Forest","supertypes":["Basic"],"types":["Land"],"subtypes":["Forest"],"oracleText":"({T}: Add {G}.)","colors":[],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","artUrl":"https://cards.scryfall.io/art_crop/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","layout":"normal"});
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","layout":"normal"});

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
const nameOf = (s: GameState, id: string) => characteristics(s, s.objects[id]!).name;
const tokensOf = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.isToken && controllerOf(s, s.objects[id]!) === pid && nameOf(s, id) === name);

describe("Prowl, Stoic Strategist", () => {
  it("is supported", () => supported(prowl(), lucy(), apple()));

  /** Prowl and Grizzly Bears attack; Prowl's trigger exiles the tapped Bears (yours). */
  const prowlExilesOwn = () => {
    const { s: s0, ap, opp } = setup([]);
    const p = putOnBattlefield(s0, ap, prowl());
    const bears = putOnBattlefield(s0, ap, grizzlyBears());
    let s = until(s0, (x) => x.pending?.kind === "declareAttackers" && x.pending.player === ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: p, defender: opp }, { attacker: bears, defender: opp }] });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(bears)] }));
    return { s, ap, opp, prowl: p, bears };
  };

  it("exiles another tapped creature; its owner may play it, and when they do you draw a card and convert Prowl", () => {
    let { s, ap, prowl: p, bears } = prowlExilesOwn();
    expect(zone(s, bears)).toBe("exile");
    expect(s.objects[bears]!.mayPlay).toMatchObject({ player: ap, until: "exiled" });
    s = until(s, (x) => x.step === "main2" && !x.pending && !x.stack.length);
    const hand = s.players[ap]!.hand.length;
    // Its owner casts it with its usual timing and costs (rulings).
    s = run(s, planCast(s, ap, bears));
    expect(s.stack.map((x) => x.kind)).toEqual(["spell", "ability"]);
    s = settle(s);
    expect(zone(s, bears)).toBe("battlefield");
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    // Converted: Prowl, Pursuit Vehicle (CR 701.28a).
    expect(nameOf(s, p)).toBe("Prowl, Pursuit Vehicle");
    expect(logged(s, /Prowl/)).toBe(true);
  });

  it("any player playing a card it exiled triggers it: an opponent's flash creature cast from exile", () => {
    const { s: s0, ap, opp } = setup([]);
    const p = putOnBattlefield(s0, ap, prowl());
    const viper = putOnBattlefield(s0, opp, ambushViper());
    for (let i = 0; i < 2; i++) putOnBattlefield(s0, opp, forestCard());
    s0.objects[viper]!.tapped = true;
    let s = until(s0, (x) => x.pending?.kind === "declareAttackers" && x.pending.player === ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: p, defender: opp }] });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(viper)] }));
    expect(zone(s, viper)).toBe("exile");
    expect(s.objects[viper]!.mayPlay).toMatchObject({ player: opp });
    // Only its owner may play it.
    expect(planCast(s, ap, viper)).toBeNull();
    s = until(s, (x) => waitingOn(x) === opp && !x.pending && x.step === "declareBlockers");
    const hand = s.players[ap]!.hand.length;
    s = run(s, planCast(s, opp, viper));
    s = settle(s);
    expect(zone(s, viper)).toBe("battlefield");
    expect(controllerOf(s, s.objects[viper]!)).toBe(opp);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(nameOf(s, p)).toBe("Prowl, Pursuit Vehicle");
  });

  it("doesn't trigger once Prowl has converted, nor for a card some other effect exiled", () => {
    let { s, ap, prowl: p, bears } = prowlExilesOwn();
    // Another card in exile its owner may play, not exiled with Prowl.
    const other = inHand(s, ap, grizzlyBears());
    s.players[ap]!.hand.splice(s.players[ap]!.hand.indexOf(other), 1);
    s.objects[other]!.zone = "exile";
    s.players[ap]!.exile.push(other);
    s.objects[other]!.mayPlay = { player: ap, zc: s.objects[other]!.zoneChanges ?? 0, until: "exiled", turn: s.turn };
    s = until(s, (x) => x.step === "main2" && !x.pending && !x.stack.length);
    s = run(s, planCast(s, ap, other));
    expect(s.stack.map((x) => x.kind)).toEqual(["spell"]);
    s = settle(s);
    expect(nameOf(s, p)).toBe("Prowl, Stoic Strategist");
    // Converted by something else first: its back face has no such ability (rulings).
    s.objects[p]!.face = 1;
    s.objects[p]!.transforms = (s.objects[p]!.transforms ?? 0) + 1;
    invalidateCharacteristics(s);
    expect(nameOf(s, p)).toBe("Prowl, Pursuit Vehicle");
    s = run(s, planCast(s, ap, bears));
    expect(s.stack.map((x) => x.kind)).toEqual(["spell"]);
    s = settle(s);
    expect(zone(s, bears)).toBe("battlefield");
  });

  it("bots answer its target", () => {
    const { s: s0, ap, opp } = setup([]);
    const p = putOnBattlefield(s0, ap, prowl());
    const bears = putOnBattlefield(s0, opp, grizzlyBears());
    s0.objects[bears]!.tapped = true;
    let s = until(s0, (x) => x.pending?.kind === "declareAttackers" && x.pending.player === ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: p, defender: opp }] });
    s = settle(bots(s));
    expect(s.pending?.kind === "chooseTargets").toBe(false);
    expect(zone(s, bears)).toBe("exile");
  });
});

describe("Lucy MacLean, Positively Armed", () => {
  it("a token enters: another player you target creates a copy of it, and you draw if they're an opponent; only once each turn", () => {
    const { s: s0, ap, opp, ids } = setup([raiseTheAlarm(), raiseTheAlarm()]);
    putOnBattlefield(s0, ap, lucy());
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s);
    // Two Soldiers entered at once: two triggers (CR 603.2), the target a player other than the token's controller.
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [ptgt(ap)] })).toThrow();
    s = act(s, { type: "chooseTargets", player: ap, targets: [ptgt(opp)] });
    for (let i = 0; i < 3 && s.pending?.kind === "chooseTargets"; i++) s = act(s, { type: "chooseTargets", player: ap, targets: [ptgt(opp)] });
    const hand = s.players[ap]!.hand.length;
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    // The second trigger does nothing (done this turn), and the copy entering doesn't trigger it again.
    expect(s.pending).toBeNull();
    expect(tokensOf(s, opp, "Soldier Token")).toHaveLength(1);
    expect(tokensOf(s, ap, "Soldier Token")).toHaveLength(2);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    // A second spell this turn: no more triggers.
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(s.pending).toBeNull();
    expect(s.stack).toHaveLength(0);
    expect(tokensOf(s, ap, "Soldier Token")).toHaveLength(4);
    expect(tokensOf(s, opp, "Soldier Token")).toHaveLength(1);
  });

  it("declining lets it trigger again; targeting yourself for an opponent's token makes your copy but draws nothing", () => {
    const { s: s0, ap, opp, ids } = setup([raiseTheAlarm()]);
    // Lucy is the opponent's: your Soldiers are their opponent's tokens.
    putOnBattlefield(s0, opp, lucy());
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: opp });
    s = act(s, { type: "chooseTargets", player: opp, targets: [ptgt(opp)] });
    for (let i = 0; i < 3 && s.pending?.kind === "chooseTargets"; i++) s = act(s, { type: "chooseTargets", player: opp, targets: [ptgt(opp)] });
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: opp });
    s = settle(act(s, { type: "chooseMay", player: opp, yes: false }));
    expect(tokensOf(s, opp, "Soldier Token")).toHaveLength(0);
    // The other trigger still may be done.
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: opp });
    const hand = s.players[opp]!.hand.length;
    s = settle(act(s, { type: "chooseMay", player: opp, yes: true }));
    expect(tokensOf(s, opp, "Soldier Token")).toHaveLength(1);
    // Not "an opponent created a token": the opponent Lucy's controller made it themselves.
    expect(s.players[opp]!.hand.length).toBe(hand);
    expect(s.pending).toBeNull();
  });

  it("bots answer its target and its may", () => {
    const { s: s0, ap, ids } = setup([raiseTheAlarm()]);
    putOnBattlefield(s0, ap, lucy());
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 10 && (s.pending || s.stack.length); i++) s = settle(bots(s));
    expect(s.pending).toBeNull();
    expect(tokensOf(s, ap, "Soldier Token")).toHaveLength(2);
  });

  it("the target is fixed against the token's controller as it's put on the stack", () => {
    const { s: s0, ap, ids } = setup([raiseTheAlarm()]);
    putOnBattlefield(s0, ap, lucy());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const t = s.triggerQueue[0]!;
    expect(triggerBody(s, t).targets[0]).toMatchObject({ kind: "player", notPlayer: ap });
  });
});

describe("Apple of Eden, Isu Relic", () => {
  /** Apple activated at `opp`, whose hand is `hand`; you have only Islands. */
  const appleAt = (hand: CardDef[]) => {
    const { s: s0, ap, opp } = setup([]);
    const apple0 = putOnBattlefield(s0, ap, apple());
    // Only Islands: mana of any type pays for what's cast this way (CR 609.4b).
    for (const id of [...s0.battlefield]) if (controllerOf(s0, s0.objects[id]!) === ap && characteristics(s0, s0.objects[id]!).types.includes("Land") && nameOf(s0, id) !== "Island") {
      s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
      s0.objects[id]!.zone = "graveyard";
      s0.players[ap]!.graveyard.push(id);
    }
    invalidateCharacteristics(s0);
    s0.players[opp]!.hand = [];
    const cards = hand.map((d) => inHand(s0, opp, d));
    const life = s0.players[ap]!.life;
    let s = run(s0, planActivate(s0, ap, apple0, 0, [ptgt(opp)]));
    expect(s.players[ap]!.life).toBe(life - 4);
    expect(zone(s, apple0)).toBe("graveyard");
    s = settle(s);
    return { s, ap, opp, cards };
  };

  it("exiles the opponent's hand face down; you may play those cards this turn with any mana, and each one played draws its owner a card", () => {
    let { s, ap, opp, cards } = appleAt([grizzlyBears(), forestCard(), divination()]);
    const [bears, forest, div] = cards as [string, string, string];
    for (const id of cards) {
      expect(zone(s, id)).toBe("exile");
      expect(s.objects[id]!.hiddenExile).toMatchObject({ seen: [ap] });
      expect(s.objects[id]!.mayPlay).toMatchObject({ player: ap, until: "thisTurn", anyType: true });
    }
    expect(s.players[opp]!.hand).toHaveLength(0);
    // Grizzly Bears, {1}{G}, paid with Islands.
    s = run(s, planCast(s, ap, bears));
    expect(s.stack.map((x) => x.kind)).toEqual(["spell", "ability"]);
    s = settle(s);
    expect(zone(s, bears)).toBe("battlefield");
    expect(controllerOf(s, s.objects[bears]!)).toBe(ap);
    expect(s.players[opp]!.hand).toHaveLength(1);
    // The Forest as your land play (rulings).
    s = act(s, { type: "playLand", player: ap, objectId: forest });
    s = settle(s);
    expect(zone(s, forest)).toBe("battlefield");
    expect(s.players[opp]!.hand).toHaveLength(2);
    // Divination stays exiled until the end step, then returns to its owner's hand; the drawn cards stay there too.
    s = until(s, (x) => x.step === "end" && !x.stack.length && !x.triggerQueue.length && !x.pending);
    expect(zone(s, div)).toBe("hand");
    expect(s.players[opp]!.hand).toContain(div);
    expect(s.players[opp]!.hand).toHaveLength(3);
  });

  it("only as a sorcery; with no cards in that hand nothing is exiled", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, apple());
    s0.players[opp]!.hand = [];
    // With something on the stack (an instant of yours), not as a sorcery (CR 307.1).
    const bolt = inHand(s0, ap, lightningBolt());
    let s = run(s0, planCast(s0, ap, bolt, [ptgt(opp)]));
    expect(planActivate(s, ap, a, 0, [ptgt(opp)])).toBeNull();
    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    const a1 = putOnBattlefield(s1, ap1, apple());
    s1.players[opp1]!.hand = [];
    s = settle(run(s1, planActivate(s1, ap1, a1, 0, [ptgt(opp1)])));
    expect(s.pending).toBeNull();
    expect(s.players[opp1]!.hand).toHaveLength(0);
  });

  it("a card not played and then played later isn't returned twice; cards not exiled by it are untouched (rulings)", () => {
    let { s, ap, opp, cards } = appleAt([lightningBolt(), grizzlyBears()]);
    const [bolt, bears] = cards as [string, string];
    s = run(s, planCast(s, ap, bolt, [ptgt(opp)]));
    s = settle(s);
    expect(zone(s, bolt)).toBe("graveyard");
    s = until(s, (x) => x.step === "end" && !x.stack.length && !x.triggerQueue.length && !x.pending);
    expect(zone(s, bolt)).toBe("graveyard");
    expect(zone(s, bears)).toBe("hand");
    // Back in its owner's hand, a new object: the permission is gone with the old one (CR 400.7).
    expect(planCast(s, ap, bears)).toBeNull();
  });
});
