// Round 361 (Lane A): a once-per-mode med kit whose last mode takes all of a player's rad counters (Survivor's Med Kit),
// damage to each opponent equal to how many more lands they control, then that many Treasures (Spiteful Repossession), a
// first main phase trigger choosing a mode not chosen before and costing 2 life (Zuko, Conflicted), +1/+1 counters on
// your creatures sharing a creature type with a card exiled from your graveyard (Resplendent Marshal), a creature handed
// to an opponent, goaded for as long as they control it (Vislor Turlough), and an end step draw whose discard is skipped
// after a face-down permanent entered or one was turned face up (Oblivious Bookworm).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, planTurnFaceUp, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
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
/** Passes (answering other players' questions as bots) until `me` has a question of `kind`. */
const until = (s: GameState, me: PlayerId, kind: string, max = 3000) => {
  for (let i = 0; i < max; i++) {
    const p = s.pending;
    if (p?.player === me && p.kind === kind) return s;
    const who = waitingOn(s)!;
    if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: who, attacks: [] });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: who, blocks: [] });
    else if (p?.kind === "discardToHandSize") s = act(s, { type: "discard", player: who, objectIds: s.players[who]!.hand.slice(0, p.count) });
    else if (p) for (const a of botActions(s, who)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: who });
  }
  throw new Error(`no ${kind} for ${me}`);
};
/** Passes to `step` of `active`'s turn, everyone's questions answered as the bots would, except that `me` declines every "may". */
const advance = (s: GameState, step: GameState["step"], active: PlayerId, me: PlayerId, max = 3000) => {
  for (let i = 0; i < max; i++) {
    if (s.step === step && s.activePlayer === active && !s.pending && !s.stack.length) return s;
    const p = s.pending;
    const who = waitingOn(s)!;
    if (p?.player === me && p.kind === "chooseMay") s = act(s, { type: "chooseMay", player: me, yes: false });
    else if (p) for (const a of botActions(s, who)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: who });
  }
  throw new Error(`never reached ${step}`);
};
const moveTo = (zone: "graveyard" | "hand") => (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const toYard = moveTo("graveyard");
const toHand = moveTo("hand");
const counters = (s: GameState, id: ObjectId) => s.objects[id]!.counters["+1/+1"] ?? 0;
const logged = (s: GameState, re: RegExp) => s.log.some((l) => re.test(l.text));

// Real oracle text (Scryfall).
const kit = (): CardDef => ({"oracleId":"fa08400f-b7ca-4c5c-b7ca-a6583b783878","name":"Survivor's Med Kit","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{1}, {T}: Choose one that hasn't been chosen —\n• Stimpak — Draw a card.\n• Fancy Lads Snack Cakes — Create a Food token. (It's an artifact with \"{2}, {T}, Sacrifice this token: You gain 3 life.\")\n• RadAway — Target player loses all rad counters. Sacrifice this artifact.","colors":[],"colorIdentity":[],"keywords":["Stimpak","Food","RadAway","Fancy Lads Snack Cakes"],"imageUrl":"https://cards.scryfall.io/normal/front/a/2/a2f30a39-aad3-45da-8f03-50b1d1806b00.jpg?1783912375","artUrl":"https://cards.scryfall.io/art_crop/front/a/2/a2f30a39-aad3-45da-8f03-50b1d1806b00.jpg?1783912375","commanderLegal":"legal","set":"pip","releasedAt":"2024-03-08","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const spite = (): CardDef => ({"oracleId":"63fd77e2-348a-4f6c-88b4-465fbe339d29","name":"Spiteful Repossession","manaCost":"{4}{R}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Spiteful Repossession deals damage to each opponent who controls more lands than you equal to the difference. Then create a number of Treasure tokens equal to the damage dealt this way.","colors":["R"],"colorIdentity":["R"],"keywords":["Treasure"],"imageUrl":"https://cards.scryfall.io/normal/front/3/5/354790c1-ce19-4ed5-9cef-f2e2ee621578.jpg?1783923341","artUrl":"https://cards.scryfall.io/art_crop/front/3/5/354790c1-ce19-4ed5-9cef-f2e2ee621578.jpg?1783923341","commanderLegal":"legal","set":"ncc","releasedAt":"2022-04-29","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const worm = (): CardDef => ({"oracleId":"300fd0a2-23e6-4da9-bfaa-ad626097d5b5","name":"Oblivious Bookworm","manaCost":"{G}{U}","cmc":2,"typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"At the beginning of your end step, you may draw a card. If you do, discard a card unless a permanent entered the battlefield face down under your control this turn or you turned a permanent face up this turn.","power":"2","toughness":"3","colors":["G","U"],"colorIdentity":["G","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/f/9f328937-6585-4325-a1f2-95facab2c58a.jpg?1783909416","artUrl":"https://cards.scryfall.io/art_crop/front/9/f/9f328937-6585-4325-a1f2-95facab2c58a.jpg?1783909416","commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const marshal = (): CardDef => ({"oracleId":"1fb4c1c1-b10c-463f-a97d-eca9f978e371","name":"Resplendent Marshal","manaCost":"{1}{W}{W}","cmc":3,"typeLine":"Creature — Angel Warrior","supertypes":[],"types":["Creature"],"subtypes":["Angel","Warrior"],"oracleText":"Flying\nWhen this creature enters or dies, you may exile another creature card from your graveyard. When you do, put a +1/+1 counter on each creature you control other than this creature that shares a creature type with the exiled card.","power":"3","toughness":"3","colors":["W"],"colorIdentity":["W"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/5/e/5e849bec-2ee6-4c83-83e6-bf9f5543e414.jpg?1783928279","artUrl":"https://cards.scryfall.io/art_crop/front/5/e/5e849bec-2ee6-4c83-83e6-bf9f5543e414.jpg?1783928279","commanderLegal":"legal","set":"khm","releasedAt":"2021-02-05","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const vislor = (): CardDef => ({"oracleId":"cdf5c31c-c324-471f-b6d7-06a06e91daa3","name":"Vislor Turlough","manaCost":"{3}{B}","cmc":4,"typeLine":"Legendary Creature — Rogue","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Rogue"],"oracleText":"Deal with the Black Guardian — When Vislor Turlough enters, you may have an opponent gain control of it. If you do, it's goaded for as long as they control it.\nAt the beginning of your end step, draw a card, then you lose life equal to the number of cards in your hand.\nDoctor's companion (You can have two commanders if the other is the Doctor.)","power":"2","toughness":"5","colors":["B"],"colorIdentity":["B"],"keywords":["Deal with the Black Guardian","Goad","Doctor's companion"],"imageUrl":"https://cards.scryfall.io/normal/front/6/5/65da12f9-8fcb-4f58-b123-adcff8e6ea20.jpg?1783914549","artUrl":"https://cards.scryfall.io/art_crop/front/6/5/65da12f9-8fcb-4f58-b123-adcff8e6ea20.jpg?1783914549","commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const zuko = (): CardDef => ({"oracleId":"b5fd82b9-77de-4358-9ce7-915cc809a889","name":"Zuko, Conflicted","manaCost":"{B}{R}","cmc":2,"typeLine":"Legendary Creature — Human Rogue","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Rogue"],"oracleText":"At the beginning of your first main phase, choose one that hasn't been chosen and you lose 2 life —\n• Draw a card.\n• Put a +1/+1 counter on Zuko.\n• Add {R}.\n• Exile Zuko, then return him to the battlefield under an opponent's control.","power":"2","toughness":"3","colors":["B","R"],"colorIdentity":["B","R"],"keywords":[],"producedMana":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/9/d/9d555cab-ec86-4f27-bca2-7d01f79c3f46.jpg?1783904917","artUrl":"https://cards.scryfall.io/art_crop/front/9/d/9d555cab-ec86-4f27-bca2-7d01f79c3f46.jpg?1783904917","commanderLegal":"legal","set":"tla","releasedAt":"2025-11-21","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const elves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const lions = (): CardDef => ({"oracleId":"60ba93eb-39e6-4af2-9c66-cd38f72daff2","name":"Savannah Lions","manaCost":"{W}","cmc":1,"typeLine":"Creature — Cat","supertypes":[],"types":["Creature"],"subtypes":["Cat"],"oracleText":"","power":"2","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/9/a9757246-e782-4d7a-8273-d9efe284edaf.jpg?1783935189","artUrl":"https://cards.scryfall.io/art_crop/front/a/9/a9757246-e782-4d7a-8273-d9efe284edaf.jpg?1783935189","commanderLegal":"legal","set":"a25","releasedAt":"2018-03-16","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const angel = (): CardDef => ({"oracleId":"2f6e9ab8-6951-4c5f-bcde-0e96e0fe87f2","name":"Exalted Angel","manaCost":"{4}{W}{W}","cmc":6,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nWhenever this creature deals damage, you gain that much life.\nMorph {2}{W}{W} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)","power":"4","toughness":"5","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Morph"],"imageUrl":"https://cards.scryfall.io/normal/front/9/d/9d2d48db-b206-47cc-9634-6c0f2d6b020c.jpg?1783938267","artUrl":"https://cards.scryfall.io/art_crop/front/9/d/9d2d48db-b206-47cc-9634-6c0f2d6b020c.jpg?1783938267","commanderLegal":"legal","set":"v15","releasedAt":"2015-08-21","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const outcast = (): CardDef => ({"oracleId":"a61ef0cc-1da9-49f9-b0dc-01cf9f6205be","name":"Changeling Outcast","manaCost":"{B}","cmc":1,"typeLine":"Creature — Shapeshifter","supertypes":[],"types":["Creature"],"subtypes":["Shapeshifter"],"oracleText":"Changeling (This card is every creature type.)\nThis creature can't block and can't be blocked.","power":"1","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":["Changeling"],"imageUrl":"https://cards.scryfall.io/normal/front/0/8/08151d00-513a-4957-aa16-01c0f0245112.jpg?1783933130","artUrl":"https://cards.scryfall.io/art_crop/front/0/8/08151d00-513a-4957-aa16-01c0f0245112.jpg?1783933130","commanderLegal":"legal","set":"mh1","releasedAt":"2019-06-14","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const serra = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","commanderLegal":"legal","set":"sld","releasedAt":"2023-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const ogre = (): CardDef => ({"oracleId":"83c8a3a6-2e1a-4e26-8847-6d066f42d906","name":"Gray Ogre","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Ogre","supertypes":[],"types":["Creature"],"subtypes":["Ogre"],"oracleText":"","power":"2","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/3/73ae5276-b607-4f23-a9d2-e8cc7b8e3693.jpg?1783948685","artUrl":"https://cards.scryfall.io/art_crop/front/7/3/73ae5276-b607-4f23-a9d2-e8cc7b8e3693.jpg?1783948685","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const fog = (): CardDef => ({"oracleId":"98423a34-f044-4811-b288-56981d604b6e","name":"Holy Day","manaCost":"{W}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Prevent all combat damage that would be dealt this turn.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/3/f3895c0c-0db8-4962-b386-57887fb60701.jpg?1783943078","artUrl":"https://cards.scryfall.io/art_crop/front/f/3/f3895c0c-0db8-4962-b386-57887fb60701.jpg?1783943078","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const mastery = (): CardDef => ({"oracleId":"d6158860-ada8-4e39-8156-23dee2f68f79","name":"Ugin's Mastery","manaCost":"{4}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever you cast a colorless creature spell, manifest the top card of your library. (Put it onto the battlefield face down as a 2/2 creature. Turn it face up any time for its mana cost if it's a creature card.)\nWhenever you attack with creatures with total power 6 or greater, you may turn a face-down creature you control face up.","colors":[],"colorIdentity":[],"keywords":["Manifest"],"imageUrl":"https://cards.scryfall.io/normal/front/4/2/42991890-731c-4e6a-b0c5-57d6217029ab.jpg?1783915486","artUrl":"https://cards.scryfall.io/art_crop/front/4/2/42991890-731c-4e6a-b0c5-57d6217029ab.jpg?1783915486","commanderLegal":"legal","set":"cmm","releasedAt":"2023-08-04","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

describe("round 361: compiles", () => {
  it("every card of the round", () => supported(kit(), spite(), zuko(), marshal(), vislor(), worm()));
});

describe("Survivor's Med Kit", () => {
  it("each mode once for this object; RadAway takes all the target player's rad counters and sacrifices the kit", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, kit());
    const hand = s0.players[ap]!.hand.length;
    let s = settle(run(s0, planActivate(s0, ap, k, 0, [], [0])), ap);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    // Untapped for the next activation: Stimpak can't be chosen again (CR 700.2).
    s.objects[k]!.tapped = false;
    expect(planActivate(s, ap, k, 0, [], [0])).toBeNull();
    s.players[opp]!.rad = 3;
    s.players[opp]!.poison = 2;
    s = settle(run(s, planActivate(s, ap, k, 0, [{ kind: "player", id: opp }], [2])), ap);
    expect(s.players[opp]!.rad ?? 0).toBe(0);
    // Only the rad counters.
    expect(s.players[opp]!.poison).toBe(2);
    expect(s.objects[k]!.zone).toBe("graveyard");
  });
});

describe("Spiteful Repossession", () => {
  it("each opponent with more lands is dealt the difference; then a Treasure for each damage dealt", () => {
    const { s: s0, ap, ids } = setup([spite()]);
    const [b, c, d] = s0.turnOrder.filter((p) => p !== ap) as [PlayerId, PlayerId, PlayerId];
    const mine = s0.battlefield.filter((id) => controllerOf(s0, s0.objects[id]!) === ap && characteristics(s0, s0.objects[id]!).types.includes("Land")).length;
    const forest = s0.objects[s0.battlefield.find((id) => characteristics(s0, s0.objects[id]!).name === "Forest")!]!;
    const def = s0.cards[forest.cardId]!;
    for (let i = 0; i < mine + 2; i++) putOnBattlefield(s0, b, def);
    for (let i = 0; i < mine; i++) putOnBattlefield(s0, c, def);
    const life = [b, c, d].map((p) => s0.players[p]!.life);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    // Five of ap's lands were tapped to cast it: the difference is with the lands ap controls, tapped or not.
    expect(s.players[b]!.life).toBe(life[0]! - 2);
    expect(s.players[c]!.life).toBe(life[1]!);
    expect(s.players[d]!.life).toBe(life[2]!);
    const treasures = s.battlefield.filter((id) => characteristics(s, s.objects[id]!).subtypes.includes("Treasure") && controllerOf(s, s.objects[id]!) === ap);
    expect(treasures.length).toBe(2);
  });

  it("no Treasure when no damage is dealt", () => {
    const { s: s0, ap, ids } = setup([spite()]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    expect(s.battlefield.some((id) => characteristics(s, s.objects[id]!).subtypes.includes("Treasure"))).toBe(false);
  });
});

describe("Zuko, Conflicted", () => {
  it("each first main phase a mode not chosen before, and 2 life; the last one hands it to an opponent as a new object", () => {
    const { s: s0, ap } = setup([]);
    const z = putOnBattlefield(s0, ap, zuko());
    const nextTurn = (s: GameState) => until(passUntil(s, "end", ap), ap, "chooseModes");
    let s = nextTurn(s0);
    expect(s.pending).toMatchObject({ kind: "chooseModes", legal: [true, true, true, true] });
    let life = s.players[ap]!.life;
    let hand = s.players[ap]!.hand.length;
    s = settle(act(s, { type: "chooseModes", player: ap, modes: [0] }), ap);
    expect(s.players[ap]!.life).toBe(life - 2);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    s = nextTurn(s);
    expect(s.pending).toMatchObject({ kind: "chooseModes", legal: [false, true, true, true] });
    life = s.players[ap]!.life;
    s = settle(act(s, { type: "chooseModes", player: ap, modes: [1] }), ap);
    expect(counters(s, z)).toBe(1);
    expect(s.players[ap]!.life).toBe(life - 2);
    s = nextTurn(s);
    expect(s.pending).toMatchObject({ kind: "chooseModes", legal: [false, false, true, true] });
    s = settle(act(s, { type: "chooseModes", player: ap, modes: [3] }), ap);
    if (s.pending?.player === ap) s = settle(act(s, { type: "chooseOption", player: ap, choice: String(s.pending.kind === "chooseOption" ? s.pending.options[0] : "") }), ap);
    const holder = controllerOf(s, s.objects[z]!);
    expect(s.objects[z]!.zone).toBe("battlefield");
    expect(holder).not.toBe(ap);
    // A new object: no counters and no modes chosen; it triggers in its new controller's first main phase (rulings).
    expect(counters(s, z)).toBe(0);
    s = until(s, holder, "chooseModes");
    expect(s.pending).toMatchObject({ kind: "chooseModes", legal: [true, true, true, true] });
  });
});

describe("Resplendent Marshal", () => {
  it("enters: exile a creature card; a counter on each other creature you control sharing a creature type with it", () => {
    const { s: s0, ap, opp, ids } = setup([marshal()]);
    const elf = putOnBattlefield(s0, ap, elves());
    const cat = putOnBattlefield(s0, ap, lions());
    const theirs = putOnBattlefield(s0, opp, elves());
    const card = toYard(s0, ap, elves());
    let s = until(run(s0, planCast(s0, ap, ids[0]!)), ap, "chooseMay");
    s = until(act(s, { type: "chooseMay", player: ap, yes: true }), ap, "searchLibrary");
    // Chosen as it resolves, not targeted; ~ isn't among them.
    expect(s.pending).toMatchObject({ kind: "searchLibrary", cards: [card], min: 1, max: 1 });
    s = act(s, { type: "searchLibrary", player: ap, found: [card] });
    // The reflexive ability triggers: players can respond knowing the exiled card (rulings).
    expect(s.objects[card]!.zone).toBe("exile");
    expect(s.stack.length + s.triggerQueue.length).toBeGreaterThan(0);
    expect(counters(s, elf)).toBe(0);
    s = settle(s, ap);
    expect(s.objects[card]!.zone).toBe("exile");
    expect(counters(s, elf)).toBe(1);
    expect(counters(s, cat)).toBe(0);
    expect(counters(s, theirs)).toBe(0);
    expect(counters(s, ids[0]!)).toBe(0);
  });
});

describe("Resplendent Marshal, more", () => {
  it("dies: not itself; a changeling card shares a type with every creature that has one", () => {
    const { s: s0, ap } = setup([]);
    const m = putOnBattlefield(s0, ap, marshal());
    const elf = putOnBattlefield(s0, ap, elves());
    const cat = putOnBattlefield(s0, ap, lions());
    const ch = toYard(s0, ap, outcast());
    s0.objects[m]!.damage = 5;
    let s = until(act(s0, { type: "passPriority", player: ap }), ap, "chooseMay");
    s = until(act(s, { type: "chooseMay", player: ap, yes: true }), ap, "searchLibrary");
    expect(s.objects[m]!.zone).toBe("graveyard");
    expect((s.pending as { cards: string[] }).cards).toEqual([ch]);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [ch] }), ap);
    expect(counters(s, elf)).toBe(1);
    expect(counters(s, cat)).toBe(1);
  });

  it("with no other creature card in your graveyard, nothing is asked and nothing triggers", () => {
    const { s: s0, ap, ids } = setup([marshal()]);
    const elf = putOnBattlefield(s0, ap, elves());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    // Nothing to exile: the "may" can't be done, so nothing triggers.
    expect(s.pending).toBeFalsy();
    expect(s.stack.length).toBe(0);
    expect(counters(s, elf)).toBe(0);
  });
});

describe("Vislor Turlough", () => {
  it("an opponent gains control of it, goaded by you for as long as they control it", () => {
    const { s: s0, ap, ids } = setup([vislor()]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = until(s, ap, "chooseMay");
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    const p = s.pending;
    expect(p?.player).toBe(ap);
    const to = s.turnOrder.find((x) => x !== ap)!;
    if (p?.kind === "chooseOption") s = act(s, { type: "chooseOption", player: ap, choice: p.options.find((o) => o === String(to))! });
    else throw new Error(`unexpected ${p?.kind}`);
    s = settle(s, ap);
    const v = ids[0]!;
    expect(controllerOf(s, s.objects[v]!)).toBe(to);
    expect(characteristics(s, s.objects[v]!).goadedBy).toEqual([ap]);
    // Still goaded after your next turn begins: not the usual "until your next turn" (CR 701.15a, 611.2b).
    s = advance(s, "upkeep", to, ap);
    s = advance(s, "main1", ap, ap);
    expect(controllerOf(s, s.objects[v]!)).toBe(to);
    expect(characteristics(s, s.objects[v]!).goadedBy).toEqual([ap]);
    // Another player gains control of it: the goad is over, and stays over if `to` gets it back.
    const third = s.turnOrder.find((x) => x !== ap && x !== to)!;
    s.effects.push({ id: `x${s.nextId++}`, timestamp: s.nextTimestamp++, controller: third, sourceName: "test", duration: "game", affected: [v], mods: [{ kind: "control" }] });
    invalidateCharacteristics(s);
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }), ap);
    expect(controllerOf(s, s.objects[v]!)).toBe(third);
    expect(characteristics(s, s.objects[v]!).goadedBy).toEqual([]);
    s.effects.push({ id: `x${s.nextId++}`, timestamp: s.nextTimestamp++, controller: to, sourceName: "test", duration: "game", affected: [v], mods: [{ kind: "control" }] });
    invalidateCharacteristics(s);
    expect(controllerOf(s, s.objects[v]!)).toBe(to);
    expect(characteristics(s, s.objects[v]!).goadedBy).toEqual([]);
  });

  it("declined: you keep it, not goaded; its end step draw and life loss are its controller's", () => {
    const { s: s0, ap, ids } = setup([vislor()]);
    let s = until(run(s0, planCast(s0, ap, ids[0]!)), ap, "chooseMay");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }), ap);
    const v = ids[0]!;
    expect(controllerOf(s, s.objects[v]!)).toBe(ap);
    expect(characteristics(s, s.objects[v]!).goadedBy).toEqual([]);
    const life = s.players[ap]!.life;
    s = passUntil(s, "end", ap);
    s = settle(s, ap);
    expect(s.players[ap]!.life).toBe(life - s.players[ap]!.hand.length);
  });
});

describe("Oblivious Bookworm", () => {
  const endStepDraw = (s: GameState, ap: PlayerId) => {
    s = until(passUntil(s, "end", ap), ap, "chooseMay");
    return act(s, { type: "chooseMay", player: ap, yes: true });
  };
  it("draw, then discard a card with nothing face down this turn", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, worm());
    const hand = s0.players[ap]!.hand.length;
    let s = endStepDraw(s0, ap);
    expect(s.pending).toMatchObject({ player: ap, kind: "discard" });
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("no discard after a permanent entered face down under your control this turn, even once turned face up", () => {
    const { s: s0, ap, ids } = setup([angel()]);
    putOnBattlefield(s0, ap, worm());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { faceDown: true })), ap);
    expect(s.objects[ids[0]!]!.faceDown).toBeTruthy();
    const hand = s.players[ap]!.hand.length;
    s = settle(endStepDraw(s, ap), ap);
    expect(s.pending).toBeFalsy();
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("no discard after you turned a permanent face up this turn; declining draws nothing", () => {
    const { s: s0, ap, ids } = setup([angel()]);
    putOnBattlefield(s0, ap, worm());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { faceDown: true })), ap);
    // The next turn of yours: it entered face down last turn, and you turn it face up now.
    s = advance(advance(s, "upkeep", (ap + 1) % 4, ap), "main1", ap, ap);
    s = settle(run(s, planTurnFaceUp(s, ap, ids[0]!)), ap);
    expect(s.objects[ids[0]!]!.faceDown).toBeFalsy();
    const hand = s.players[ap]!.hand.length;
    s = settle(endStepDraw(s, ap), ap);
    expect(s.pending).toBeFalsy();
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    // A turn later, with neither: declining draws and discards nothing.
    s = until(advance(s, "upkeep", (ap + 1) % 4, ap), ap, "chooseMay");
    const h2 = s.players[ap]!.hand.length;
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }), ap);
    expect(s.players[ap]!.hand.length).toBe(h2);
  });
});
