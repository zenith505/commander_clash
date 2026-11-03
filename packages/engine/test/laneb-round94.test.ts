// Lane B, round 94: unsupported cards from the bottom of the popularity list (`npm run popular -- --least`). Roots of
// Life, Rites of Initiation, Darigaaz, the Igniter, Bison Whistle, Meletis Charlatan, Plagiarize, Amplifire, Distant
// Memories, Sword-Point Diplomacy, and the "Exile this card from your hand: target land gains ... until this card is cast
// from exile" cycle (Shattered Seraph, Emrakul, the Exigent Doom, Glamorous Outlaw, Masked Bandits, Rakish Revelers,
// Spara's Adjudicators).

import { describe, expect, it } from "vitest";
import { act, bear, card, mountain, passUntil, pt, putOnBattlefield, setup, swamp, island } from "./helpers";
import { abilitiesOf, botActions, manaAbilitiesOn, characteristics, controllerOf, draw, invalidateCharacteristics, isFullySupported, moveObject, parseManaCost, planActivate, planCast, planMana, tapPermanent, waitingOn, type Action, type CardDef, type GameState, type PendingDecision, type PlayerId, type TargetChoice } from "../src";

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
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = []) => run(s, planCast(s, pid, id, targets, undefined, "auto"));
const choose = (s: GameState, choice: string) => act(s, { type: "chooseOption", player: s.pending!.player, choice });
const pend = (s: GameState) => s.pending as Extract<PendingDecision, { kind: "chooseOption" }>;
/** Moves a new card for `def` into `pid`'s hand. */
const inHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Puts a new card for `def` on top of `pid`'s library. */
const onTop = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  invalidateCharacteristics(s);
  return id;
};
/** Empties `pid`'s hand (into exile). */
const emptyHand = (s: GameState, pid: PlayerId) => {
  for (const id of [...s.players[pid]!.hand]) {
    s.players[pid]!.hand.splice(s.players[pid]!.hand.indexOf(id), 1);
    s.objects[id]!.zone = "exile";
    s.players[pid]!.exile.push(id);
  }
  invalidateCharacteristics(s);
};
/** Passes priority until `pid` has it (with an empty stack the step would end first, so only with something on the stack or in an upkeep). */
const toPriority = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 8 && waitingOn(s) !== pid; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  expect(waitingOn(s)).toBe(pid);
  return s;
};
const opponents = (s: GameState, ap: PlayerId) => [1, 2, 3].map((k) => s.turnOrder[(s.turnOrder.indexOf(ap) + k) % 4]!);
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target.", colors: ["R"] });
const bison = card("Test Bison", "Creature — Bison", "{2}{G}", { power: "3", toughness: "3", colors: ["G"] });

const amplifire = (): CardDef => ({"oracleId":"c6861c50-d336-4352-a76d-ec22a86ec09e","name":"Amplifire","manaCost":"{2}{R}{R}","cmc":4,"typeLine":"Creature — Elemental","supertypes":[],"types":["Creature"],"subtypes":["Elemental"],"oracleText":"At the beginning of your upkeep, reveal cards from the top of your library until you reveal a creature card. Until your next turn, this creature's base power becomes twice that card's power and its base toughness becomes twice that card's toughness. Put the revealed cards on the bottom of your library in a random order.","power":"1","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/a/7a58c77f-7c15-44f4-8011-6046482a2d08.jpg?1783933686","artUrl":"https://cards.scryfall.io/art_crop/front/7/a/7a58c77f-7c15-44f4-8011-6046482a2d08.jpg?1783933686","commanderLegal":"legal","set":"rna","releasedAt":"2019-01-25","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const whistle = (): CardDef => ({"oracleId":"47e77918-13ec-47ce-9256-5a3b5bf8d315","name":"Bison Whistle","manaCost":"{1}{G}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{1}, {T}: Look at the top card of your library. If it's a Bison card, you may put it onto the battlefield. If it's a creature card, you may reveal it and put it into your hand. Otherwise, you may put it into your graveyard.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/2/32d4a2b1-5f39-49a2-b067-e74d2dc31b30.jpg?1783904816","artUrl":"https://cards.scryfall.io/art_crop/front/3/2/32d4a2b1-5f39-49a2-b067-e74d2dc31b30.jpg?1783904816","commanderLegal":"legal","set":"tle","releasedAt":"2025-11-21","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const darigaaz = (): CardDef => ({"oracleId":"6cbafa7b-4448-4ad4-b4f2-0ab6e7c95b0b","name":"Darigaaz, the Igniter","manaCost":"{3}{B}{R}{G}","cmc":6,"typeLine":"Legendary Creature — Dragon","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Dragon"],"oracleText":"Flying\nWhenever Darigaaz deals combat damage to a player, you may pay {2}{R}. If you do, choose a color, then that player reveals their hand and Darigaaz deals damage to the player equal to the number of cards of that color revealed this way.","power":"6","toughness":"6","colors":["B","G","R"],"colorIdentity":["B","G","R"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/5/4/54dcf5e3-4303-41a3-b54c-24a9d462ce07.jpg?1783945664","artUrl":"https://cards.scryfall.io/art_crop/front/5/4/54dcf5e3-4303-41a3-b54c-24a9d462ce07.jpg?1783945664","commanderLegal":"legal","set":"inv","releasedAt":"2000-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const memories = (): CardDef => ({"oracleId":"12c78cc4-7fbe-4639-bef7-bf959a0d6d68","name":"Distant Memories","manaCost":"{2}{U}{U}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Search your library for a card, exile it, then shuffle. Any opponent may have you put that card into your hand. If no player does, you draw three cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/5/158da0aa-8317-498b-89ed-2f84317fe256.jpg?1783941389","artUrl":"https://cards.scryfall.io/art_crop/front/1/5/158da0aa-8317-498b-89ed-2f84317fe256.jpg?1783941389","commanderLegal":"legal","set":"mbs","releasedAt":"2011-02-04","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const emrakul = (): CardDef => ({"oracleId":"4421ab7d-6d9b-4edd-b5a0-53a8ed84da6f","name":"Emrakul, the Exigent Doom","manaCost":"{10}","cmc":10,"typeLine":"Legendary Creature — Eldrazi","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Eldrazi"],"oracleText":"When you cast this spell, untap all lands you control.\nFlying, trample\nWard—Sacrifice three permanents.\n{3}, Exile this card from your hand: Target land gains \"{T}: Add {C}{C}\" until this card is cast from exile. You may cast this card for as long as it remains exiled.","power":"12","toughness":"12","colors":[],"colorIdentity":[],"keywords":["Flying","Trample","Ward"],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/c/3/c3ff8dd3-88a8-49dc-a59b-e2748680623c.jpg?1790829846","artUrl":"https://cards.scryfall.io/art_crop/front/c/3/c3ff8dd3-88a8-49dc-a59b-e2748680623c.jpg?1790829846","commanderLegal":"legal","set":"fra","releasedAt":"2026-10-02","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const outlaw = (): CardDef => ({"oracleId":"cd4f7912-81c0-44dd-87c2-a98e955fe5a8","name":"Glamorous Outlaw","manaCost":"{3}{U}{B}{R}","cmc":6,"typeLine":"Creature — Vampire Rogue","supertypes":[],"types":["Creature"],"subtypes":["Vampire","Rogue"],"oracleText":"When this creature enters, it deals 2 damage to each opponent and you scry 2.\n{2}, Exile this card from your hand: Target land gains \"{T}: Add {U}, {B}, or {R}\" until this card is cast from exile. You may cast this card for as long as it remains exiled.","power":"4","toughness":"5","colors":["B","R","U"],"colorIdentity":["B","R","U"],"keywords":["Scry"],"producedMana":["B","R","U"],"imageUrl":"https://cards.scryfall.io/normal/front/4/5/452abab0-cf23-4b9d-831a-7b9fa1fd582a.jpg?1783923086","artUrl":"https://cards.scryfall.io/art_crop/front/4/5/452abab0-cf23-4b9d-831a-7b9fa1fd582a.jpg?1783923086","commanderLegal":"legal","set":"snc","releasedAt":"2022-04-29","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bandits = (): CardDef => ({"oracleId":"84ac3096-098a-477a-8907-fc30ac15f00f","name":"Masked Bandits","manaCost":"{3}{B}{R}{G}","cmc":6,"typeLine":"Creature — Raccoon Rogue","supertypes":[],"types":["Creature"],"subtypes":["Raccoon","Rogue"],"oracleText":"Vigilance\nMenace (This creature can't be blocked except by two or more creatures.)\n{2}, Exile this card from your hand: Target land gains \"{T}: Add {B}, {R}, or {G}\" until this card is cast from exile. You may cast this card for as long as it remains exiled.","power":"5","toughness":"5","colors":["B","G","R"],"colorIdentity":["B","G","R"],"keywords":["Vigilance","Menace"],"producedMana":["B","G","R"],"imageUrl":"https://cards.scryfall.io/normal/front/0/3/03757415-6b58-42d3-9452-a862e90647ee.jpg?1783923080","artUrl":"https://cards.scryfall.io/art_crop/front/0/3/03757415-6b58-42d3-9452-a862e90647ee.jpg?1783923080","commanderLegal":"legal","set":"snc","releasedAt":"2022-04-29","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const charlatan = (): CardDef => ({"oracleId":"11dfe74c-bc8e-4d58-b526-41ea5b409135","name":"Meletis Charlatan","manaCost":"{2}{U}","cmc":3,"typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"{2}{U}, {T}: The controller of target instant or sorcery spell copies it. That player may choose new targets for the copy.","power":"2","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/f/bf22da0c-5bf5-4c81-9422-671ce17c8ffa.jpg?1783939794","artUrl":"https://cards.scryfall.io/art_crop/front/b/f/bf22da0c-5bf5-4c81-9422-671ce17c8ffa.jpg?1783939794","commanderLegal":"legal","set":"ths","releasedAt":"2013-09-27","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const plagiarize = (): CardDef => ({"oracleId":"ba4f9450-d468-4686-9f48-00fa08c6ac52","name":"Plagiarize","manaCost":"{3}{U}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Until end of turn, if target player would draw a card, instead that player skips that draw and you draw a card.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/3/333bbcba-19a7-4307-abe7-7cffa3569e4d.jpg?1783945161","artUrl":"https://cards.scryfall.io/art_crop/front/3/3/333bbcba-19a7-4307-abe7-7cffa3569e4d.jpg?1783945161","commanderLegal":"legal","set":"tor","releasedAt":"2002-02-04","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const revelers = (): CardDef => ({"oracleId":"7db1402e-a434-45d2-9d21-9e0faeeaff10","name":"Rakish Revelers","manaCost":"{2}{R}{G}{W}","cmc":5,"typeLine":"Creature — Elf Druid Rogue","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid","Rogue"],"oracleText":"When this creature enters, create a 1/1 green and white Citizen creature token.\n{2}, Exile this card from your hand: Target land gains \"{T}: Add {R}, {G}, or {W}\" until this card is cast from exile. You may cast this card for as long as it remains exiled.","power":"5","toughness":"3","colors":["G","R","W"],"colorIdentity":["G","R","W"],"keywords":[],"producedMana":["G","R","W"],"imageUrl":"https://cards.scryfall.io/normal/front/2/2/2258b7b6-e679-4fcf-9cfe-2ff01a8996dc.jpg?1783923023","artUrl":"https://cards.scryfall.io/art_crop/front/2/2/2258b7b6-e679-4fcf-9cfe-2ff01a8996dc.jpg?1783923023","commanderLegal":"legal","set":"snc","releasedAt":"2022-04-29","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const rites = (): CardDef => ({"oracleId":"77aa591d-efb5-48b5-98aa-5c8912ede11b","name":"Rites of Initiation","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Discard any number of cards at random. Creatures you control get +1/+0 until end of turn for each card discarded this way.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/f/6f2fc246-2e95-456f-aa4e-97768c4f4bb4.jpg?1783945225","artUrl":"https://cards.scryfall.io/art_crop/front/6/f/6f2fc246-2e95-456f-aa4e-97768c4f4bb4.jpg?1783945225","commanderLegal":"legal","set":"ody","releasedAt":"2001-10-01","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const roots = (): CardDef => ({"oracleId":"29ec9b49-fbe5-49ac-8ad6-7159cb88bc66","name":"Roots of Life","manaCost":"{1}{G}{G}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"As this enchantment enters, choose Island or Swamp.\nWhenever a land of the chosen type an opponent controls becomes tapped, you gain 1 life.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/6/26724a51-87dd-4159-b012-71598e4cf5eb.jpg?1783947061","artUrl":"https://cards.scryfall.io/art_crop/front/2/6/26724a51-87dd-4159-b012-71598e4cf5eb.jpg?1783947061","commanderLegal":"legal","set":"mir","releasedAt":"1996-10-08","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const seraph = (): CardDef => ({"oracleId":"92eae6af-b915-4eb8-93c4-527f732bb712","name":"Shattered Seraph","manaCost":"{4}{W}{U}{B}","cmc":7,"typeLine":"Creature — Angel Rogue","supertypes":[],"types":["Creature"],"subtypes":["Angel","Rogue"],"oracleText":"Flying\nWhen this creature enters, you gain 3 life.\n{2}, Exile this card from your hand: Target land gains \"{T}: Add {W}, {U}, or {B}\" until this card is cast from exile. You may cast this card for as long as it remains exiled.","power":"4","toughness":"4","colors":["B","U","W"],"colorIdentity":["B","U","W"],"keywords":["Flying"],"producedMana":["B","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/c/c/cc75ba0d-230e-4ca4-bb40-bd05af2a4457.jpg?1783923070","artUrl":"https://cards.scryfall.io/art_crop/front/c/c/cc75ba0d-230e-4ca4-bb40-bd05af2a4457.jpg?1783923070","commanderLegal":"legal","set":"snc","releasedAt":"2022-04-29","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const adjudicators = (): CardDef => ({"oracleId":"02718076-4c71-4bf5-988f-e6f94fbf0aef","name":"Spara's Adjudicators","manaCost":"{2}{G}{W}{U}","cmc":5,"typeLine":"Creature — Cat Citizen","supertypes":[],"types":["Creature"],"subtypes":["Cat","Citizen"],"oracleText":"When this creature enters, target creature an opponent controls can't attack or block until your next turn.\n{2}, Exile this card from your hand: Target land gains \"{T}: Add {G}, {W}, or {U}\" until this card is cast from exile. You may cast this card for as long as it remains exiled.","power":"4","toughness":"4","colors":["G","U","W"],"colorIdentity":["G","U","W"],"keywords":[],"producedMana":["G","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/2/9/29eb0e40-d184-423f-8484-ee288fda00cd.jpg?1783923068","artUrl":"https://cards.scryfall.io/art_crop/front/2/9/29eb0e40-d184-423f-8484-ee288fda00cd.jpg?1783923068","commanderLegal":"legal","set":"snc","releasedAt":"2022-04-29","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const diplomacy = (): CardDef => ({"oracleId":"ac5585ce-2959-4eaf-af56-5dca8cdfb2d6","name":"Sword-Point Diplomacy","manaCost":"{2}{B}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Reveal the top three cards of your library. For each of those cards, put that card into your hand unless any opponent pays 3 life. Then exile the rest.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/5/25750098-02a1-48e4-917d-187c41e111b6.jpg?1783935754","artUrl":"https://cards.scryfall.io/art_crop/front/2/5/25750098-02a1-48e4-917d-187c41e111b6.jpg?1783935754","commanderLegal":"legal","set":"xln","releasedAt":"2017-09-29","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

describe("Lane B round 94", () => {
  it("compiles every card of the round fully", () => {
    supported(amplifire(), whistle(), darigaaz(), memories(), emrakul(), outlaw(), bandits(), charlatan(), plagiarize(), revelers(), rites(), roots(), seraph(), adjudicators(), diplomacy());
  });

  it("Roots of Life: life when a land of the chosen type an opponent controls becomes tapped, not yours or other types", () => {
    let { s, ap, ids, opp } = setup([roots()]);
    s = castNow(s, ap, ids[0]!);
    s = settle(s, { me: [ap] });
    expect(pend(s).what).toBe("basicLandType");
    expect([...pend(s).options].sort()).toEqual(["Island", "Swamp"]);
    s = choose(s, "Swamp");
    s = settle(s);
    expect(zone(s, ids[0]!)).toBe("battlefield");
    const life = s.players[ap]!.life;
    const theirSwamp = putOnBattlefield(s, opp, swamp);
    const theirIsland = putOnBattlefield(s, opp, island);
    const mySwamp = putOnBattlefield(s, ap, swamp);
    tapPermanent(s, s.objects[theirIsland]!);
    tapPermanent(s, s.objects[mySwamp]!);
    s = settle(s);
    expect(s.players[ap]!.life).toBe(life);
    tapPermanent(s, s.objects[theirSwamp]!);
    s = settle(s);
    expect(s.players[ap]!.life).toBe(life + 1);
  });

  it("Rites of Initiation: discards the chosen number of cards at random and pumps per card", () => {
    let { s, ap, ids } = setup([rites(), bear({ name: "Hand A" }), bear({ name: "Hand B" }), bear({ name: "Hand C" })]);
    const mine = putOnBattlefield(s, ap, bear());
    const hand = s.players[ap]!.hand.length - 1;
    const yard = s.players[ap]!.graveyard.length;
    s = castNow(s, ap, ids[0]!);
    s = settle(s, { me: [ap] });
    expect(pend(s).what).toBe("number");
    expect(pend(s).numberRange).toEqual({ min: 0, max: hand });
    s = choose(s, "3");
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(hand - 3);
    expect(s.players[ap]!.graveyard.length).toBe(yard + 4);
    expect(pt(s, mine)).toBe("5/2");
    s = passUntil(s, "end");
    s = passUntil(s, "upkeep");
    expect(pt(s, mine)).toBe("2/2");
  });

  it("Rites of Initiation: with an empty hand there is nothing to choose and no pump", () => {
    let { s, ap } = setup([]);
    emptyHand(s, ap);
    const id = inHand(s, ap, rites());
    const mine = putOnBattlefield(s, ap, bear());
    s = castNow(s, ap, id);
    s = settle(s, { me: [ap] });
    expect(s.pending).toBeFalsy();
    expect(pt(s, mine)).toBe("2/2");
  });

  it("Plagiarize: the target's draws this turn are yours instead, the draw step's first draw included", () => {
    let { s, ap, ids, opp } = setup([plagiarize()]);
    s = passUntil(s, "upkeep", opp);
    s = toPriority(s, ap);
    s = castNow(s, ap, ids[0]!, [player(opp)]);
    s = settle(s);
    expect(zone(s, ids[0]!)).toBe("graveyard");
    const mine = s.players[ap]!.hand.length;
    const theirs = s.players[opp]!.hand.length;
    s = passUntil(s, "main1", opp);
    expect(s.players[opp]!.hand.length).toBe(theirs);
    expect(s.players[ap]!.hand.length).toBe(mine + 1);
    draw(s, opp, 2);
    expect(s.players[opp]!.hand.length).toBe(theirs);
    expect(s.players[ap]!.hand.length).toBe(mine + 3);
    // Only that player's draws.
    draw(s, ap, 1);
    expect(s.players[ap]!.hand.length).toBe(mine + 4);
    // It ends with the turn.
    s = passUntil(s, "main1", s.turnOrder[(s.turnOrder.indexOf(opp) + 1) % 4]!);
    const t2 = s.players[opp]!.hand.length;
    draw(s, opp, 1);
    expect(s.players[opp]!.hand.length).toBe(t2 + 1);
    expect(s.drawSteals).toBeUndefined();
  });

  it("Meletis Charlatan: the spell's controller copies it and may choose new targets", () => {
    let { s, ap, opp } = setup([]);
    const meletis = putOnBattlefield(s, ap, charlatan());
    putOnBattlefield(s, opp, mountain);
    const bolt = inHand(s, opp, shock);
    s = toPriority(s, opp);
    s = run(s, planCast(s, opp, bolt, [player(ap)], undefined, "auto"));
    s = toPriority(s, ap);
    const spell = s.stack[s.stack.length - 1]!;
    const idx = abilitiesOf(s, s.objects[meletis]!).activated.findIndex((a) => /copies it/.test(a.text ?? ""));
    expect(idx).toBeGreaterThanOrEqual(0);
    s = run(s, planActivate(s, ap, meletis, idx, [{ kind: "stack", id: spell.id }]));
    for (let i = 0; i < 8 && s.stack.length > 1 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    // The copy's controller is asked about new targets, and controls the copy (CR 707.10).
    expect(s.pending?.player).toBe(opp);
    for (const a of botActions(s, opp)) s = act(s, a);
    expect(s.stack.length).toBe(2);
    expect(s.stack.every((x) => x.controller === opp)).toBe(true);
    const life = s.players[ap]!.life;
    s = settle(s);
    expect(s.players[ap]!.life).toBeLessThanOrEqual(life - 2);
  });

  it("Darigaaz: pay {2}{R} to choose a color, then damage per card of that color in the hand; no payment, nothing", () => {
    for (const pay of [true, false]) {
      let { s, ap, opp } = setup([]);
      const dragon = putOnBattlefield(s, ap, darigaaz());
      emptyHand(s, opp);
      inHand(s, opp, shock);
      inHand(s, opp, shock);
      inHand(s, opp, bear());
      s = passUntil(s, "declareAttackers", ap);
      s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: dragon, defender: opp }] });
      const life = s.players[opp]!.life;
      for (let i = 0; i < 40 && !(s.pending && s.pending.player === ap && s.pending.kind !== "declareBlockers"); i++) {
        if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
        else s = act(s, { type: "passPriority", player: waitingOn(s)! });
      }
      expect(s.pending?.kind).toBe("chooseMay");
      if (pay) s = run(s, planMana(s, ap, parseManaCost("{2}{R}")));
      s = act(s, { type: "chooseMay", player: ap, yes: pay });
      s = settle(s, { me: [ap] });
      if (pay) {
        expect(pend(s).what).toBe("color");
        expect(pend(s).options).toContain("Red");
        s = choose(s, "Red");
        s = settle(s, { me: [ap] });
        expect(s.players[opp]!.life).toBe(life - 6 - 2);
      } else {
        expect(s.pending).toBeFalsy();
        expect(s.players[opp]!.life).toBe(life - 6);
      }
    }
  });

  it("Bison Whistle: a Bison card onto the battlefield; a creature card into the hand; otherwise the graveyard", () => {
    const go = (top: CardDef, answers: boolean[]) => {
      let { s, ap } = setup([]);
      const whistleId = putOnBattlefield(s, ap, whistle());
      const card = onTop(s, ap, top);
      s = run(s, planActivate(s, ap, whistleId, 0));
      const asked: string[] = [];
      for (let i = 0; i < 40 && (s.stack.length || s.pending); i++) {
        if (s.pending?.kind === "chooseMay") {
          asked.push(s.pending.prompt);
          s = act(s, { type: "chooseMay", player: ap, yes: answers[asked.length - 1] ?? false });
        } else if (s.pending) throw new Error(`asked ${s.pending.kind}`);
        else s = act(s, { type: "passPriority", player: waitingOn(s)! });
      }
      return { s, ap, card, asked };
    };
    let r = go(bison, [true]);
    expect(zone(r.s, r.card)).toBe("battlefield");
    expect(r.asked.length).toBe(1);
    // Declined onto the battlefield, a Bison is still a creature card on top.
    r = go(bison, [false, true]);
    expect(r.asked.length).toBe(2);
    expect(zone(r.s, r.card)).toBe("hand");
    r = go(bear(), [true]);
    expect(r.asked.length).toBe(1);
    expect(zone(r.s, r.card)).toBe("hand");
    r = go(mountain, [true]);
    expect(r.asked.length).toBe(1);
    expect(zone(r.s, r.card)).toBe("graveyard");
    r = go(mountain, [false]);
    expect(zone(r.s, r.card)).toBe("library");
    expect(r.s.players[r.ap]!.library[0]).toBe(r.card);
  });

  it("Amplifire: base power and toughness twice the revealed creature's until your next turn, the cards to the bottom", () => {
    let { s, ap, opp } = setup([]);
    const amp = putOnBattlefield(s, ap, amplifire());
    expect(pt(s, amp)).toBe("1/1");
    const beast = onTop(s, ap, card("Test Beast", "Creature — Beast", "{3}{G}", { power: "3", toughness: "2" }));
    const l1 = onTop(s, ap, mountain);
    const l2 = onTop(s, ap, swamp);
    s = passUntil(s, "upkeep", ap);
    s = settle(s);
    expect(pt(s, amp)).toBe("6/4");
    const lib = s.players[ap]!.library;
    expect(lib.slice(-3).sort()).toEqual([beast, l1, l2].sort());
    s = passUntil(s, "upkeep", opp);
    expect(pt(s, amp)).toBe("6/4");
    // At your next turn it ends, and the next trigger reveals again.
    for (const id of s.players[ap]!.library.filter((id) => characteristics(s, s.objects[id]!).types.includes("Creature"))) {
      moveObject(s, id, "exile");
    }
    const big = onTop(s, ap, card("Test Giant", "Creature — Giant", "{4}{R}", { power: "4", toughness: "4" }));
    s = passUntil(s, "upkeep", ap);
    expect(pt(s, amp)).toBe("1/1");
    s = settle(s);
    expect(pt(s, amp)).toBe("8/8");
    expect(s.players[ap]!.library.at(-1)).toBe(big);
  });

  it("Amplifire: with no creature card revealed it becomes 0/0", () => {
    let { s, ap } = setup([]);
    const amp = putOnBattlefield(s, ap, amplifire());
    for (const id of [...s.players[ap]!.library]) if (characteristics(s, s.objects[id]!).types.includes("Creature")) moveObject(s, id, "exile");
    s = passUntil(s, "upkeep", ap === s.activePlayer ? s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]! : ap);
    s = passUntil(s, "upkeep", ap);
    s = settle(s);
    expect(zone(s, amp)).toBe("graveyard");
  });

  it("Distant Memories: an opponent may have you put the card into your hand; if none does, you draw three", () => {
    for (const allow of [true, false]) {
      let { s, ap, ids } = setup([memories()]);
      s = castNow(s, ap, ids[0]!);
      s = settle(s, { me: [ap] });
      expect(s.pending?.kind).toBe("searchLibrary");
      const found = s.players[ap]!.library.find((id) => characteristics(s, s.objects[id]!).name === "Grizzly Bears")!;
      s = act(s, { type: "searchLibrary", player: ap, found: [found] });
      expect(zone(s, found)).toBe("exile");
      const hand = s.players[ap]!.hand.length;
      const asked: PlayerId[] = [];
      for (let i = 0; i < 10 && s.pending?.kind === "chooseOption" && pend(s).what === "punisher"; i++) {
        asked.push(s.pending.player);
        expect(pend(s).labels?.[0]).toBe("Have them put it into their hand");
        s = choose(s, allow && asked.length === 2 ? "0" : "none");
      }
      s = settle(s);
      if (allow) {
        expect(asked.length).toBeGreaterThanOrEqual(2);
        expect(zone(s, found)).toBe("hand");
        expect(s.players[ap]!.hand.length).toBe(hand + 1);
      } else {
        expect(asked).toEqual(opponents(s, ap));
        expect(zone(s, found)).toBe("exile");
        expect(s.players[ap]!.hand.length).toBe(hand + 3);
      }
    }
  });

  it("Sword-Point Diplomacy: card by card in the order you choose, into your hand unless an opponent pays 3 life; the rest exiled", () => {
    let { s, ap, ids } = setup([diplomacy()]);
    const c = onTop(s, ap, card("Card C", "Creature — Beast", "{3}"));
    const b = onTop(s, ap, card("Card B", "Creature — Beast", "{2}"));
    const a = onTop(s, ap, card("Card A", "Creature — Beast", "{1}"));
    const [o1, o2, o3] = opponents(s, ap);
    s = castNow(s, ap, ids[0]!);
    s = settle(s, { me: [ap] });
    expect(pend(s).what).toBe("nextRevealed");
    expect([...pend(s).options].sort()).toEqual([a, b, c].sort());
    s = choose(s, b);
    // B: the second opponent pays.
    /** One card's round: each opponent in turn order. */
    const answer = (payer?: PlayerId) => {
      for (let i = 0; i < 3 && s.pending?.kind === "chooseOption" && pend(s).what === "punisher"; i++) {
        expect(pend(s).labels?.[0]).toBe("Pay 3 life");
        s = choose(s, s.pending.player === payer ? "0" : "none");
      }
    };
    answer(o2);
    expect(zone(s, b)).toBe("library");
    expect(s.players[o2!]!.life).toBe(37);
    expect(pend(s).what).toBe("nextRevealed");
    expect([...pend(s).options].sort()).toEqual([a, c].sort());
    s = choose(s, c);
    answer();
    expect(zone(s, c)).toBe("hand");
    // The last card needs no order.
    answer(o3);
    s = settle(s);
    expect(zone(s, a)).toBe("exile");
    expect(zone(s, b)).toBe("exile");
    expect(zone(s, c)).toBe("hand");
    expect(s.players[o1!]!.life).toBe(40);
    expect(s.players[o3!]!.life).toBe(37);
  });

  it("Shattered Seraph: exiled from the hand, the land makes its mana until the card is cast from exile", () => {
    let { s, ap, ids } = setup([seraph()]);
    const land = putOnBattlefield(s, ap, card("Wastes", "Basic Land"));
    const before = manaAbilitiesOn(s, s.objects[land]!).length;
    const idx = abilitiesOf(s, s.objects[ids[0]!]!).activated.findIndex((a) => /from your hand/.test(a.text ?? ""));
    expect(idx).toBeGreaterThanOrEqual(0);
    s = run(s, planActivate(s, ap, ids[0]!, idx, [tgt(land)]));
    expect(zone(s, ids[0]!)).toBe("exile");
    s = settle(s);
    expect(manaAbilitiesOn(s, s.objects[land]!).length).toBe(before + 1);
    // Still there next turn.
    s = passUntil(s, "main1", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    s = passUntil(s, "main1", ap);
    expect(manaAbilitiesOn(s, s.objects[land]!).length).toBe(before + 1);
    // Cast from exile, the land's ability ends.
    s = castNow(s, ap, ids[0]!);
    expect(manaAbilitiesOn(s, s.objects[land]!).length).toBe(before);
    s = settle(s);
    expect(zone(s, ids[0]!)).toBe("battlefield");
  });

  it("Shattered Seraph: if the card leaves exile another way, the land keeps the ability; it can't be cast from the graveyard", () => {
    let { s, ap, ids } = setup([seraph()]);
    const land = putOnBattlefield(s, ap, card("Wastes", "Basic Land"));
    const before = manaAbilitiesOn(s, s.objects[land]!).length;
    const idx = abilitiesOf(s, s.objects[ids[0]!]!).activated.findIndex((a) => /from your hand/.test(a.text ?? ""));
    s = run(s, planActivate(s, ap, ids[0]!, idx, [tgt(land)]));
    s = settle(s);
    moveObject(s, ids[0]!, "graveyard");
    invalidateCharacteristics(s);
    expect(manaAbilitiesOn(s, s.objects[land]!).length).toBe(before + 1);
    expect(planCast(s, ap, ids[0]!, [], undefined, "auto")).toBeNull();
  });

  it("the rest of the cycle compile the same hand ability", () => {
    for (const def of [emrakul(), outlaw(), bandits(), revelers(), adjudicators()]) {
      let { s, ap, ids } = setup([def]);
      const land = putOnBattlefield(s, ap, card("Wastes", "Basic Land"));
      const before = manaAbilitiesOn(s, s.objects[land]!).length;
      const idx = abilitiesOf(s, s.objects[ids[0]!]!).activated.findIndex((a) => /from your hand/.test(a.text ?? ""));
      expect(idx, def.name).toBeGreaterThanOrEqual(0);
      s = run(s, planActivate(s, ap, ids[0]!, idx, [tgt(land)]));
      s = settle(s);
      expect(zone(s, ids[0]!)).toBe("exile");
      expect(manaAbilitiesOn(s, s.objects[land]!).length, def.name).toBe(before + 1);
      expect(s.objects[ids[0]!]!.mayPlay, def.name).toBeTruthy();
    }
  });
});
