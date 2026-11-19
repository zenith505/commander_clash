// Lane B round B265: Reversal of Fortune (a copy of a card in an opponent's hand, cast from that hand as it resolves, CR
// 707.12), Phyrexian Portal (an opponent separates the top ten cards into two face-down piles, CR 700.3) and Raging River
// (each defending player's creatures without flying in a "left" and a "right" pile, each attacker blockable only by
// creatures with flying and those in the pile with its label, CR 509.1b).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const reversalOfFortune = (): CardDef => ({"oracleId":"938ba053-35f6-4424-a978-bf915709572c","name":"Reversal of Fortune","manaCost":"{4}{R}{R}","cmc":6,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target opponent reveals their hand. You may copy an instant or sorcery card in it. If you do, you may cast the copy without paying its mana cost.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/9/19cf87c0-369e-4ec2-bb9f-e8e29d63d448.jpg?1783944392","artUrl":"https://cards.scryfall.io/art_crop/front/1/9/19cf87c0-369e-4ec2-bb9f-e8e29d63d448.jpg?1783944392","layout":"normal"});
const phyrexianPortal = (): CardDef => ({"oracleId":"1a3ce329-ee48-4abc-b820-b43e9e68eae9","name":"Phyrexian Portal","manaCost":"{3}","cmc":3,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{3}: If your library has ten or more cards in it, target opponent looks at the top ten cards of your library and separates them into two face-down piles. Exile one of those piles. Search the other pile for a card, put it into your hand, then shuffle the rest of that pile into your library.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/4/74f77387-1239-4ad2-b59f-d13e317477ba.jpg?1783947161","artUrl":"https://cards.scryfall.io/art_crop/front/7/4/74f77387-1239-4ad2-b59f-d13e317477ba.jpg?1783947161","layout":"normal"});
const ragingRiver = (): CardDef => ({"oracleId":"a2310312-6e1e-4e34-a351-9aef499a810f","name":"Raging River","manaCost":"{R}{R}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever one or more creatures you control attack, each defending player divides all creatures without flying they control into a \"left\" pile and a \"right\" pile. Then, for each attacking creature you control, choose \"left\" or \"right.\" That creature can't be blocked this combat except by creatures with flying and creatures in a pile with the chosen label.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/1/61e4f56d-1f4f-49f2-8534-0d09196a3327.jpg?1783948682","artUrl":"https://cards.scryfall.io/art_crop/front/6/1/61e4f56d-1f4f-49f2-8534-0d09196a3327.jpg?1783948682","layout":"normal"});
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","layout":"normal"});
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","layout":"normal"});
const fireIce = (): CardDef => ({"oracleId":"ae92942b-919c-4ea9-b693-85fcef765d5a","name":"Fire // Ice","manaCost":"{1}{R} // {1}{U}","cmc":4,"typeLine":"Instant // Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Fire deals 2 damage divided as you choose among one or two targets.","colors":["R","U"],"colorIdentity":["R","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/b/ab8292ae-9a52-43e7-92f7-0f45f4bb71ec.jpg?1783940411","artUrl":"https://cards.scryfall.io/art_crop/front/a/b/ab8292ae-9a52-43e7-92f7-0f45f4bb71ec.jpg?1783940411","layout":"split","faces":[{"name":"Fire","manaCost":"{1}{R}","typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Fire deals 2 damage divided as you choose among one or two targets.","colors":["R"]},{"name":"Ice","manaCost":"{1}{U}","typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Tap target permanent.\nDraw a card.","colors":["U"]}]});
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","layout":"normal"});
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","layout":"normal"});
const windDrake = (): CardDef => ({"oracleId":"d6ffdaf0-ac08-4de9-bbce-2eab2f86bcca","name":"Wind Drake","manaCost":"{2}{U}","cmc":3,"typeLine":"Creature — Drake","supertypes":[],"types":["Creature"],"subtypes":["Drake"],"oracleText":"Flying","power":"2","toughness":"2","colors":["U"],"colorIdentity":["U"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/5/e/5e227a63-abea-494e-9d66-6ff0a3da14ca.jpg?1783937211","artUrl":"https://cards.scryfall.io/art_crop/front/5/e/5e227a63-abea-494e-9d66-6ff0a3da14ca.jpg?1783937211","layout":"normal"});
const counterspell = (): CardDef => ({"oracleId":"cc187110-1148-4090-bbb8-e205694a39f5","name":"Counterspell","manaCost":"{U}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Counter target spell.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/c/0c9a7cb0-5bff-48ff-b620-2838816ac9b5.jpg?1783937618","artUrl":"https://cards.scryfall.io/art_crop/front/0/c/0c9a7cb0-5bff-48ff-b620-2838816ac9b5.jpg?1783937618","layout":"normal"});

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
const ptgt = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const logged = (s: GameState, re: RegExp) => s.log.some((l) => re.test(l.text));
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const nameOf = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]!.name;
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

describe("Reversal of Fortune", () => {
  it("is supported", () => supported(reversalOfFortune(), phyrexianPortal(), ragingRiver()));

  it("reveals the hand, then a copy of an instant or sorcery card in it is cast by you from that hand, the card staying there", () => {
    const { s: s0, ap, ids, opp } = setup([reversalOfFortune()]);
    s0.players[opp]!.hand = [];
    const bolt = inHand(s0, opp, lightningBolt());
    const fi = inHand(s0, opp, fireIce());
    inHand(s0, opp, grizzlyBears());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [ptgt(opp)])));
    expect(logged(s, /reveals their hand/)).toBe(true);
    // Only the instant and sorcery cards, Fire // Ice too; not the creature card.
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong", player: ap, options: [bolt, fi, "none"] });
    if (s.pending?.kind !== "chooseOption") return;
    expect(s.pending.prompt).toMatch(/cast a copy of an instant or sorcery card in .+'s hand without paying its mana cost/);
    s = act(s, { type: "chooseOption", player: ap, choice: bolt });
    expect(s.pending?.kind).toBe("castFree");
    if (s.pending?.kind !== "castFree") return;
    const copy = s.pending.objectId;
    expect(copy).not.toBe(bolt);
    expect(s.objects[copy]!.spellCopy).toBe(true);
    s = run(s, planCast(s, ap, copy, [ptgt(opp)]));
    // Cast from that player's hand (rulings), by you, owned by you (CR 112.2a); never "from your hand".
    expect(s.objects[copy]!.castFrom).toBe("anotherHand");
    expect(s.objects[copy]!.owner).toBe(ap);
    expect(s.stack.find((x) => x.objectId === copy)?.controller).toBe(ap);
    const life = s.players[opp]!.life;
    s = settle(s);
    expect(s.players[opp]!.life).toBe(life - 3);
    // The card itself is still in the opponent's hand; the copy ceased to exist (CR 704.5e).
    expect(zone(s, bolt)).toBe("hand");
    expect(s.players[opp]!.hand).toContain(bolt);
    expect(s.objects[copy]).toBeUndefined();
    expect(zone(s, ids[0]!)).toBe("graveyard");
  });

  it("copying and casting are optional; with no instant or sorcery card in the hand nothing is asked", () => {
    const { s: s0, ap, ids, opp } = setup([reversalOfFortune(), reversalOfFortune()]);
    s0.players[opp]!.hand = [];
    const bolt = inHand(s0, opp, lightningBolt());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [ptgt(opp)])));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "none" }));
    expect(s.pending).toBeNull();
    expect(s.players[opp]!.hand).toEqual([bolt]);
    expect(Object.values(s.objects).some((o) => o.spellCopy)).toBe(false);
    s.players[opp]!.hand = [];
    inHand(s, opp, grizzlyBears());
    for (const id of s.battlefield) if (s.objects[id]!.controller === ap) s.objects[id]!.tapped = false;
    s = settle(run(s, planCast(s, ap, ids[1]!, [ptgt(opp)])));
    expect(s.pending).toBeNull();
    expect(zone(s, ids[1]!)).toBe("graveyard");
  });

  it("a bot casts the copy at an opponent", () => {
    const { s: s0, ap, ids, opp } = setup([reversalOfFortune()]);
    s0.players[opp]!.hand = [];
    inHand(s0, opp, lightningBolt());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [ptgt(opp)])));
    const life = s.players.map((p) => p.life);
    for (let i = 0; i < 10 && (s.pending || s.stack.length); i++) s = s.pending ? bots(s, 1) : settle(s);
    expect(s.players[ap]!.life).toBe(life[ap]);
    expect(s.players.some((p, i) => i !== ap && p.life === life[i]! - 3)).toBe(true);
  });
});

/** `pid`'s library: `n` fresh cards of `defs` in turn, top first. */
const library = (s: GameState, pid: PlayerId, defs: CardDef[], n: number) => {
  for (const id of s.players[pid]!.library) delete s.objects[id];
  s.players[pid]!.library = [];
  for (let i = 0; i < n; i++) {
    const id = putOnBattlefield(s, pid, defs[i % defs.length]!);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "library";
    s.players[pid]!.library.push(id);
  }
  invalidateCharacteristics(s);
  return [...s.players[pid]!.library];
};

describe("Phyrexian Portal", () => {
  it("the target opponent separates the top ten cards into two face-down piles; you exile one unseen and take a card from the other", () => {
    const { s: s0, ap, opp } = setup([]);
    const portal = putOnBattlefield(s0, ap, phyrexianPortal());
    const lib = library(s0, ap, [lightningBolt(), divination(), hillGiant()], 14);
    let s = settle(run(s0, planActivate(s0, ap, portal, 0, [ptgt(opp)])));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: opp, piles: true, forPlayer: ap });
    if (s.pending?.kind !== "searchLibrary") return;
    expect(s.pending.cards).toEqual(lib.slice(0, 10));
    s = act(s, { type: "searchLibrary", player: opp, found: lib.slice(0, 3) });
    // Both piles face down: only their sizes are shown to you.
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "pile", player: ap, pileMode: "blindExile", labels: ["Face-down pile 1: 3 cards", "Face-down pile 2: 7 cards"] });
    expect(logged(s, /separates them into two face-down piles of 3 cards and 7 cards/)).toBe(true);
    s = act(s, { type: "chooseOption", player: ap, choice: "0" });
    for (const id of lib.slice(0, 3)) expect(zone(s, id)).toBe("exile");
    // Searching the other pile: one card must be found.
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 1, max: 1 });
    if (s.pending?.kind !== "searchLibrary") return;
    expect(s.pending.cards).toEqual(lib.slice(3, 10));
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [] })).toThrow();
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [lib[11]!] })).toThrow();
    const hand = s.players[ap]!.hand.length;
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [lib[5]!] }));
    expect(zone(s, lib[5]!)).toBe("hand");
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    // The rest of that pile is shuffled in: still in the library, which has 14 - 3 - 1 cards.
    expect(s.players[ap]!.library.length).toBe(10);
    for (const id of [...lib.slice(3, 5), ...lib.slice(6)]) expect(zone(s, id)).toBe("library");
    expect(logged(s, /shuffles their library/)).toBe(true);
  });

  it("an empty pile can be exiled; with fewer than ten cards in the library it does nothing", () => {
    const { s: s0, ap, opp } = setup([]);
    const portal = putOnBattlefield(s0, ap, phyrexianPortal());
    const lib = library(s0, ap, [divination()], 10);
    let s = settle(run(s0, planActivate(s0, ap, portal, 0, [ptgt(opp)])));
    s = act(s, { type: "searchLibrary", player: opp, found: [] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", labels: ["Face-down pile 1: 0 cards", "Face-down pile 2: 10 cards"] });
    s = act(s, { type: "chooseOption", player: ap, choice: "0" });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [lib[0]!] }));
    expect(s.players[ap]!.library.length).toBe(9);
    expect(s.players[ap]!.exile.length).toBe(0);
    // Nine cards now: nothing happens (checked as it resolves).
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, C: 3 };
    s = passUntil(s, "main1", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]);
    s = passUntil(s, "main1", ap);
    const before = s.players[ap]!.library.length;
    s = settle(run(s, planActivate(s, ap, portal, 0, [ptgt(opp)])));
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.library.length).toBe(before);
    expect(logged(s, /fewer than 10 cards: Phyrexian Portal does nothing/)).toBe(true);
  });

  it("bots separate the cards, exile the smaller face-down pile and search the other", () => {
    const { s: s0, ap, opp } = setup([]);
    const portal = putOnBattlefield(s0, ap, phyrexianPortal());
    library(s0, ap, [lightningBolt(), divination(), hillGiant(), grizzlyBears()], 20);
    let s = settle(run(s0, planActivate(s0, ap, portal, 0, [ptgt(opp)])));
    s = bots(s, 1);
    expect(s.pending).toMatchObject({ kind: "chooseOption", pileMode: "blindExile" });
    if (s.pending?.kind !== "chooseOption" || !s.pending.piles) return;
    const [one, two] = s.pending.piles;
    const smaller = one.length <= two.length ? one : two;
    s = bots(s, 1);
    for (const id of smaller) expect(zone(s, id)).toBe("exile");
    s = settle(bots(s, 1));
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.library.length).toBe(20 - smaller.length - 1);
  });
});

describe("Raging River", () => {
  /** You attack `opp` with a Hill Giant and Grizzly Bears; they have two Grizzly Bears and a Wind Drake. */
  const riverAttack = () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, ragingRiver());
    const giant = putOnBattlefield(s0, ap, hillGiant());
    const bears = putOnBattlefield(s0, ap, grizzlyBears());
    const [b1, b2] = [putOnBattlefield(s0, opp, grizzlyBears()), putOnBattlefield(s0, opp, grizzlyBears())];
    const drake = putOnBattlefield(s0, opp, windDrake());
    let s = passUntil(s0, "declareAttackers", ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: giant, defender: opp }, { attacker: bears, defender: opp }] }));
    return { s, ap, opp, giant, bears, b1: b1!, b2: b2!, drake };
  };
  const blockers = (s: GameState) => {
    for (let i = 0; i < 50 && s.pending?.kind !== "declareBlockers"; i++) s = s.pending ? s : act(s, { type: "passPriority", player: waitingOn(s)! });
    return s;
  };

  it("the defending player divides their creatures without flying; each attacker is blockable only by fliers and the pile with its label", () => {
    let { s, ap, opp, giant, bears, b1, b2, drake } = riverAttack();
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: opp, action: "pile", pileNames: ["Left", "Right"] });
    if (s.pending?.kind !== "pickPermanents") return;
    expect([...s.pending.options].sort()).toEqual([b1, b2].sort());
    s = act(s, { type: "pickPermanents", player: opp, ids: [b1] });
    expect(logged(s, /divides their creatures without flying into a "left" pile \(Grizzly Bears\) and a "right" pile \(Grizzly Bears\)/)).toBe(true);
    // One question for each attacker, in turn: the Giant "left", the Bears "right".
    const asked: string[] = [];
    for (let i = 0; i < 2; i++) {
      expect(s.pending).toMatchObject({ kind: "chooseOption", what: "riverSide", player: ap, options: ["left", "right"] });
      if (s.pending?.kind !== "chooseOption") return;
      asked.push(s.pending.about!);
      s = act(s, { type: "chooseOption", player: ap, choice: s.pending.about === giant ? "left" : "right" });
    }
    expect(asked.sort()).toEqual([giant, bears].sort());
    s = settle(s);
    expect(logged(s, /chooses "left" for Hill Giant/)).toBe(true);
    expect(logged(s, /chooses "right" for Grizzly Bears/)).toBe(true);
    // A creature that enters after it resolved is in no pile (rulings).
    const late = putOnBattlefield(s, opp, grizzlyBears());
    s = blockers(s);
    expect(s.pending).toMatchObject({ kind: "declareBlockers", player: opp });
    const block = (blocker: string, attacker: string) => () => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker, attacker }] });
    expect(block(b2, giant)).toThrow(/except by creatures with flying and creatures in the pile with its label/);
    expect(block(b1, bears)).toThrow(/except by creatures with flying/);
    expect(block(late, giant)).toThrow(/except by creatures with flying/);
    expect(block(late, bears)).toThrow(/except by creatures with flying/);
    // The flier can block either.
    expect(block(drake, giant)).not.toThrow();
    expect(block(drake, bears)).not.toThrow();
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: b1, attacker: giant }, { blocker: b2, attacker: bears }] });
    expect(s.objects[b1]!.blocking).toEqual([giant]);
    expect(s.objects[b2]!.blocking).toEqual([bears]);
    // Only this combat: cleared with it.
    s = passUntil(s, "main2", ap);
    expect(s.objects[giant]?.riverOnly).toBeUndefined();
    expect(nameOf(s, giant)).toBe("Hill Giant");
  });

  it("bots divide their creatures and choose the label whose pile blocks least", () => {
    let { s, ap, opp, giant, b1, b2 } = riverAttack();
    s = bots(s, 1);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "riverSide", player: ap });
    const left = s.resolving?.scratch?.chosen?.[opp] ?? [];
    // Two Bears: one in each pile.
    expect(left.length).toBe(1);
    expect([b1, b2]).toContain(left[0]);
    // The "left" one tapped: "left" is the pile that can block less.
    s.objects[left[0]!]!.tapped = true;
    s = settle(bots(s, 2));
    expect(logged(s, /chooses "left" for Hill Giant/)).toBe(true);
    expect(logged(s, /chooses "left" for Grizzly Bears/)).toBe(true);
    expect(s.objects[giant]!.riverOnly?.length).toBe(1);
  });
});
