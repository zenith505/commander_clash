// Lane B round B188: Ral and the Implicit Maze ("You may discard a card. If you do, exile the top two cards of your
// library. You may play them until the end of your next turn."; "Create a Spellgorger Weird token."), Eiganjo Uprising
// ("Each opponent creates X minus one 2/2 white Samurai creature tokens with vigilance."), Old Fat Spider Can't See Me
// (hexproof and "prevent all damage that would be dealt by up to one target creature" for as long as the Saga remains on
// the battlefield), The Last Ronin ("Whenever a creature you control attacks alone this turn, ..."), Cleansing Meditation
// (threshold: "instead destroy all enchantments, then return all cards in your graveyard destroyed this way to the
// battlefield"), Say Its Name ("Exile this card and two other cards named Say Its Name from your graveyard: Search your
// graveyard, hand, and/or library for a card named Altanak, the Thrice-Called ...") and Revival Experiment ("For each
// permanent type, return up to one card of that type from your graveyard to the battlefield. You lose 3 life for each card
// returned this way.").

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";
import { objHasKeyword } from "../src/cards";
import { dealDamage, objectSource } from "../src/damage";
import { moveObject } from "../src/game";

// Real card data (Scryfall).
const ral = (): CardDef => ({"oracleId":"3affd37a-d4f6-488a-b30f-8e824b640687","name":"Ral and the Implicit Maze","manaCost":"{3}{R}{R}","cmc":5,"typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — This Saga deals 2 damage to each creature and planeswalker your opponents control.\nII — You may discard a card. If you do, exile the top two cards of your library. You may play them until the end of your next turn.\nIII — Create a Spellgorger Weird token. (It's a {2}{R} 2/2 Weird creature with \"Whenever you cast a noncreature spell, put a +1/+1 counter on Spellgorger Weird.\")","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/b/ebadb7dc-69a4-43c9-a2f8-d846b231c71c.jpg?1783911269","artUrl":"https://cards.scryfall.io/art_crop/front/e/b/ebadb7dc-69a4-43c9-a2f8-d846b231c71c.jpg?1783911269","commanderLegal":"legal","set":"mh3","releasedAt":"2024-06-14","rarity":"uncommon","layout":"saga","gameChanger":false}) as CardDef;
const uprising = (): CardDef => ({"oracleId":"fe2fe9f2-908b-49a9-9648-b01e0417a364","name":"Eiganjo Uprising","manaCost":"{X}{R}{W}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Create X 2/2 white Samurai creature tokens with vigilance. They gain menace and haste until end of turn.\nEach opponent creates X minus one 2/2 white Samurai creature tokens with vigilance.","colors":["R","W"],"colorIdentity":["R","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/a/7a560ff4-446e-4dd0-87a6-145a27bdcdb9.jpg?1783923767","artUrl":"https://cards.scryfall.io/art_crop/front/7/a/7a560ff4-446e-4dd0-87a6-145a27bdcdb9.jpg?1783923767","commanderLegal":"legal","set":"neo","releasedAt":"2022-02-18","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const spider = (): CardDef => ({"oracleId":"e4402d21-bb7f-4777-bc8d-b24bf2faccb0","name":"Old Fat Spider Can't See Me","manaCost":"{2}{U}","cmc":3,"typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after IV.)\nI — Target creature you control gains hexproof for as long as this Saga remains on the battlefield.\nII — Prevent all damage that would be dealt by up to one target creature for as long as this Saga remains on the battlefield.\nIII, IV — Draw a card.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/a/4a865cea-f947-4736-8ace-ba478fceeb22.jpg?1787201066","artUrl":"https://cards.scryfall.io/art_crop/front/4/a/4a865cea-f947-4736-8ace-ba478fceeb22.jpg?1787201066","commanderLegal":"legal","set":"hob","releasedAt":"2026-08-14","rarity":"uncommon","layout":"saga","gameChanger":false}) as CardDef;
const ronin = (): CardDef => ({"oracleId":"e1865bec-1744-40c2-9031-7d6363be5333","name":"The Last Ronin","manaCost":"{4}{B}{G}","cmc":6,"typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — Destroy all creatures.\nII — Mill four cards. When you do, return target creature card from your graveyard to your hand.\nIII — Whenever a creature you control attacks alone this turn, put three +1/+1 counters on it. It gains trample, lifelink, and indestructible until end of turn.","colors":["B","G"],"colorIdentity":["B","G"],"keywords":["Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/7/2/72ab3ccf-3ddb-4dd1-9cfb-98802a18d954.jpg?1783904076","artUrl":"https://cards.scryfall.io/art_crop/front/7/2/72ab3ccf-3ddb-4dd1-9cfb-98802a18d954.jpg?1783904076","commanderLegal":"legal","set":"tmt","releasedAt":"2026-03-06","rarity":"mythic","layout":"saga","gameChanger":false}) as CardDef;
const meditation = (): CardDef => ({"oracleId":"658bccf8-fe73-4d6a-b37b-7a58034e5e5d","name":"Cleansing Meditation","manaCost":"{1}{W}{W}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Destroy all enchantments.\nThreshold — If there are seven or more cards in your graveyard, instead destroy all enchantments, then return all cards in your graveyard destroyed this way to the battlefield.","colors":["W"],"colorIdentity":["W"],"keywords":["Threshold"],"imageUrl":"https://cards.scryfall.io/normal/front/f/d/fd6609ef-71af-4775-affc-34153700c556.jpg?1783945170","artUrl":"https://cards.scryfall.io/art_crop/front/f/d/fd6609ef-71af-4775-affc-34153700c556.jpg?1783945170","commanderLegal":"legal","set":"tor","releasedAt":"2002-02-04","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const sayName = (): CardDef => ({"oracleId":"474f0675-4088-4f77-8081-f9ed7d492837","name":"Say Its Name","manaCost":"{1}{G}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Mill three cards. Then you may return a creature or land card from your graveyard to your hand.\nExile this card and two other cards named Say Its Name from your graveyard: Search your graveyard, hand, and/or library for a card named Altanak, the Thrice-Called and put it onto the battlefield. If you search your library this way, shuffle. Activate only as a sorcery.","colors":["G"],"colorIdentity":["G"],"keywords":["Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/9/4/94c58683-b5f2-4863-9562-6f6be1ec21fe.jpg?1783909448","artUrl":"https://cards.scryfall.io/art_crop/front/9/4/94c58683-b5f2-4863-9562-6f6be1ec21fe.jpg?1783909448","commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const altanak = (): CardDef => ({"oracleId":"6591f243-f94c-4a83-bb16-1fb838d9eb14","name":"Altanak, the Thrice-Called","manaCost":"{5}{G}{G}","cmc":7,"typeLine":"Legendary Creature — Insect Beast","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Insect","Beast"],"oracleText":"Trample\nWhenever Altanak becomes the target of a spell or ability an opponent controls, draw a card.\n{1}{G}, Discard this card: Return target land card from your graveyard to the battlefield tapped.","power":"9","toughness":"9","colors":["G"],"colorIdentity":["G"],"keywords":["Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/8/0/807b0674-8eba-4204-b6b6-fa2b785a79e9.jpg?1783909458","artUrl":"https://cards.scryfall.io/art_crop/front/8/0/807b0674-8eba-4204-b6b6-fa2b785a79e9.jpg?1783909458","commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const revival = (): CardDef => ({"oracleId":"913ec957-5f4e-46b4-a819-9448837f72a3","name":"Revival Experiment","manaCost":"{4}{B}{G}","cmc":6,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"For each permanent type, return up to one card of that type from your graveyard to the battlefield. You lose 3 life for each card returned this way. Exile Revival Experiment.","colors":["B","G"],"colorIdentity":["B","G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/d/cd50007c-5883-4f0c-80c3-41f13f463908.jpg?1783927585","artUrl":"https://cards.scryfall.io/art_crop/front/c/d/cd50007c-5883-4f0c-80c3-41f13f463908.jpg?1783927585","commanderLegal":"legal","set":"c21","releasedAt":"2021-04-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const weird = (): CardDef => ({"oracleId":"550811ca-0995-4886-aa8c-5cee118aa54f","name":"Spellgorger Weird","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Weird","supertypes":[],"types":["Creature"],"subtypes":["Weird"],"oracleText":"Whenever you cast a noncreature spell, put a +1/+1 counter on this creature.","power":"2","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/1/91551f85-4630-43a0-af72-8332d2ff0752.jpg?1783933421","artUrl":"https://cards.scryfall.io/art_crop/front/9/1/91551f85-4630-43a0-af72-8332d2ff0752.jpg?1783933421","commanderLegal":"legal","set":"war","releasedAt":"2019-05-03","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const holyStrength = (): CardDef => ({"oracleId":"9357de36-f8be-4f49-b2c8-9fe9eaf82b07","name":"Holy Strength","manaCost":"{W}","cmc":1,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature gets +1/+2.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/e/2/e21264cb-d915-4431-92fd-b0aa32a715fc.jpg?1783943078","artUrl":"https://cards.scryfall.io/art_crop/front/e/2/e21264cb-d915-4431-92fd-b0aa32a715fc.jpg?1783943078","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const juggernaut = (): CardDef => ({"oracleId":"4ac9116f-36bc-4d71-b696-d6ee064e1d58","name":"Juggernaut","manaCost":"{4}","cmc":4,"typeLine":"Artifact Creature — Juggernaut","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Juggernaut"],"oracleText":"This creature attacks each combat if able.\nThis creature can't be blocked by Walls.","power":"5","toughness":"3","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/f/dfebeab7-44cf-4895-bdd5-04cbb2c700d7.jpg?1783934958","artUrl":"https://cards.scryfall.io/art_crop/front/d/f/dfebeab7-44cf-4895-bdd5-04cbb2c700d7.jpg?1783934958","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const glorious = (): CardDef => ({"oracleId":"e3886fe8-9b76-4613-8891-4ec74657c087","name":"Glorious Anthem","manaCost":"{1}{W}{W}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Creatures you control get +1/+1.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/1/61f867c5-0727-4408-b479-b81518daa0ec.jpg?1783946375","artUrl":"https://cards.scryfall.io/art_crop/front/6/1/61f867c5-0727-4408-b479-b81518daa0ec.jpg?1783946375","commanderLegal":"legal","set":"usg","releasedAt":"1998-10-12","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const forestCard = (): CardDef => ({"oracleId":"b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6","name":"Forest","manaCost":"","cmc":0,"typeLine":"Basic Land — Forest","supertypes":["Basic"],"types":["Land"],"subtypes":["Forest"],"oracleText":"({T}: Add {G}.)","colors":[],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","artUrl":"https://cards.scryfall.io/art_crop/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const jace = (): CardDef => ({"oracleId":"cc2b6e58-2d6f-495e-95f3-9496105c4cba","name":"Jace Beleren","manaCost":"{1}{U}{U}","cmc":3,"typeLine":"Legendary Planeswalker — Jace","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Jace"],"oracleText":"+2: Each player draws a card.\n−1: Target player draws a card.\n−10: Target player mills twenty cards.","loyalty":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/b/c/bc836203-4bb9-4bfa-89ab-0ad49f916c92.jpg?1783942523","artUrl":"https://cards.scryfall.io/art_crop/front/b/c/bc836203-4bb9-4bfa-89ab-0ad49f916c92.jpg?1783942523","commanderLegal":"legal","set":"dd2","releasedAt":"2008-11-07","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const pacifism = (): CardDef => ({"oracleId":"5f5e0b10-c8cf-450c-bfd3-bcb0528ec330","name":"Pacifism","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't attack or block.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","artUrl":"https://cards.scryfall.io/art_crop/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Passes until the stack and triggers are done, or something asks `me` a question; other players' questions go to the bot. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && me !== undefined && p.player !== me) s = run(s, botActions(s, p.player));
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const obj = (id: ObjectId): TargetChoice => ({ kind: "object", id });
const none: TargetChoice = { kind: "none" };
/** A card of `def` owned by `pid`, put into `where` (on top of the library). */
const place = (s: GameState, pid: PlayerId, def: CardDef, where: "graveyard" | "library" | "hand") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const pt = (s: GameState, id: ObjectId) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
/** From `ap`'s main phase to their next precombat main phase, answering the other players' questions with the bot. */
const nextTurn = (s0: GameState, ap: PlayerId) => {
  s0.players[ap]!.hand = [];
  const o = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!;
  let s = passUntil(s0, "upkeep", o);
  s = passUntil(s, "main1", ap);
  return s;
};

describe("Round B188 cards are supported", () => {
  it("compiles all seven, and the Spellgorger Weird token's card", () => supported(ral(), uprising(), spider(), ronin(), meditation(), sayName(), revival(), weird()));
});

describe("Ral and the Implicit Maze: II discards to exile two cards you may play until the end of your next turn; III makes a Spellgorger Weird", () => {
  /** Ral with `lore` lore counters, then on to its controller's next precombat main phase, where the next chapter triggers. */
  const chapter = (lore: number, hand: CardDef[] = [bears()]) => {
    const { s: s0, ap } = setup([]);
    const r = putOnBattlefield(s0, ap, ral());
    s0.objects[r]!.counters.lore = lore;
    let s = nextTurn(s0, ap);
    const ids = hand.map((d) => place(s, ap, d, "hand"));
    const top = s.players[ap]!.library.slice(0, 2);
    s = settle(s, ap);
    return { s, ap, r, ids, top };
  };

  it("II: discard a card, and the top two cards are exiled; you may play them this turn and next", () => {
    const { s: s1, ap, ids, top } = chapter(1);
    expect(s1.pending).toMatchObject({ kind: "chooseMay", player: ap });
    let s = settle(act(s1, { type: "chooseMay", player: ap, yes: true }), ap);
    if (s.pending?.kind === "discard") s = settle(act(s, { type: "discard", player: ap, objectIds: [ids[0]!] }), ap);
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(top.map((id) => zone(s, id))).toEqual(["exile", "exile"]);
    expect(top.every((id) => s.objects[id]!.mayPlay?.player === ap && s.objects[id]!.mayPlay?.until === "nextTurn")).toBe(true);
  });

  it("II: no discard, no exile", () => {
    const { s: s1, ap, ids, top } = chapter(1);
    const s = settle(act(s1, { type: "chooseMay", player: ap, yes: false }), ap);
    expect(zone(s, ids[0]!)).toBe("hand");
    expect(top.map((id) => zone(s, id))).toEqual(["library", "library"]);
  });

  it("III: a Spellgorger Weird token, a {2}{R} red 2/2 Weird that grows when you cast a noncreature spell; then Ral is sacrificed", () => {
    const { s: s1, ap, r } = chapter(2, []);
    const s = settle(s1, ap);
    const tok = s.battlefield.find((id) => s.objects[id]!.isToken && s.cards[s.objects[id]!.cardId]!.name === "Spellgorger Weird")!;
    expect(tok).toBeTruthy();
    const c = characteristics(s, s.objects[tok]!);
    expect(c.colors).toEqual(["R"]);
    expect(c.subtypes).toEqual(["Weird"]);
    expect(pt(s, tok)).toBe("2/2");
    expect(s.cards[s.objects[tok]!.cardId]!.cmc ?? 3).toBe(3);
    expect(zone(s, r)).toBe("graveyard");
    // A noncreature spell: a +1/+1 counter on it.
    const shockId = place(s, ap, shock(), "hand");
    const opp = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    const t = settle(run(s, planCast(s, ap, shockId, [{ kind: "player", id: opp }])), ap);
    expect(t.objects[tok]!.counters["+1/+1"]).toBe(1);
  });
});

describe("Eiganjo Uprising: X Samurai for you with menace and haste, X minus one for each opponent", () => {
  const castX = (x: number) => {
    const { s: s0, ap, ids } = setup([uprising()]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [], undefined, "auto", x)), ap);
    const samurai = (pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid && characteristics(s, s.objects[id]!).subtypes.includes("Samurai"));
    return { s, ap, samurai };
  };

  it("X = 3: three for you, two for each opponent, theirs with vigilance only", () => {
    const { s, ap, samurai } = castX(3);
    expect(samurai(ap)).toHaveLength(3);
    for (const id of samurai(ap)) for (const k of ["Vigilance", "Menace", "Haste"]) expect(objHasKeyword(s, s.objects[id]!, k)).toBe(true);
    for (const p of s.turnOrder.filter((p) => p !== ap)) {
      expect(samurai(p)).toHaveLength(2);
      for (const id of samurai(p)) {
        expect(pt(s, id)).toBe("2/2");
        expect(objHasKeyword(s, s.objects[id]!, "Vigilance")).toBe(true);
        expect(objHasKeyword(s, s.objects[id]!, "Haste")).toBe(false);
      }
    }
  });

  it("X = 1: one for you, none for them; X = 0: none at all (a negative number is 0, CR 107.1b)", () => {
    const one = castX(1);
    expect(one.samurai(one.ap)).toHaveLength(1);
    for (const p of one.s.turnOrder.filter((p) => p !== one.ap)) expect(one.samurai(p)).toHaveLength(0);
    const zero = castX(0);
    for (const p of zero.s.turnOrder) expect(zero.samurai(p)).toHaveLength(0);
  });
});

describe("Old Fat Spider Can't See Me: hexproof and a prevention effect that last as long as the Saga does", () => {
  it("I: your creature has hexproof through the next turns, and loses it once the Saga is gone", () => {
    const { s: s0, ap, ids } = setup([spider()]);
    const b = putOnBattlefield(s0, ap, bears());
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s, ap);
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [obj(b)] }), ap);
    expect(objHasKeyword(s, s.objects[b]!, "Hexproof")).toBe(true);
    s = nextTurn(s, ap);
    expect(objHasKeyword(s, s.objects[b]!, "Hexproof")).toBe(true);
    // Gone (sacrificed after IV, or destroyed): the effect ends (CR 611.2b).
    const saga = ids[0]!;
    moveObject(s, saga, "graveyard");
    expect(objHasKeyword(s, s.objects[b]!, "Hexproof")).toBe(false);
  });

  /** The Saga with one lore counter, on to its controller's next turn: chapter II asks for its target. */
  const two = () => {
    const { s: s0, ap, opp } = setup([]);
    const saga = putOnBattlefield(s0, ap, spider());
    s0.objects[saga]!.counters.lore = 1;
    const giantId = putOnBattlefield(s0, opp, giant());
    const mine = putOnBattlefield(s0, ap, bears());
    let s = nextTurn(s0, ap);
    s = settle(s, ap);
    return { s, ap, opp, saga, giantId, mine };
  };

  it("II: the target's damage is prevented this turn and the turns after, until the Saga leaves", () => {
    const { s: s1, ap, saga, giantId, mine } = two();
    expect(s1.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    let s = settle(act(s1, { type: "chooseTargets", player: ap, targets: [obj(giantId)] }), ap);
    dealDamage(s, objectSource(s, s.objects[giantId]!), { object: s.objects[mine]! }, 3);
    expect(s.objects[mine]!.damage ?? 0).toBe(0);
    s = nextTurn(s, ap);
    // Chapter III has drawn a card meanwhile; the Saga is still there.
    s = settle(s, ap);
    expect(zone(s, saga)).toBe("battlefield");
    dealDamage(s, objectSource(s, s.objects[giantId]!), { player: ap }, 3);
    expect(s.players[ap]!.life).toBe(40);
    moveObject(s, saga, "graveyard");
    dealDamage(s, objectSource(s, s.objects[giantId]!), { player: ap }, 3);
    expect(s.players[ap]!.life).toBe(37);
  });

  it("II: only that creature's damage; up to one, so none may be chosen", () => {
    const { s: s1, ap, opp, giantId, mine } = two();
    const s = settle(act(s1, { type: "chooseTargets", player: ap, targets: [obj(giantId)] }), ap);
    dealDamage(s, objectSource(s, s.objects[mine]!), { player: opp }, 2);
    expect(s.players[opp]!.life).toBe(38);
    const { s: t1, ap: ap2 } = two();
    const t = settle(act(t1, { type: "chooseTargets", player: ap2, targets: [none] }), ap2);
    expect(t.pending).toBeFalsy();
    expect(t.damageRules ?? []).toHaveLength(0);
  });
});

describe("The Last Ronin III: whenever a creature you control attacks alone this turn, three +1/+1 counters and trample, lifelink, indestructible", () => {
  /** The Saga at chapter III on its controller's turn, resolved; it's gone after (sacrificed after III). */
  const three = (n = 1) => {
    const { s: s0, ap, opp } = setup([]);
    const saga = putOnBattlefield(s0, ap, ronin());
    s0.objects[saga]!.counters.lore = 2;
    const mine = Array.from({ length: n }, () => putOnBattlefield(s0, ap, bears()));
    let s = nextTurn(s0, ap);
    s = settle(s, ap);
    return { s, ap, opp, saga, mine };
  };

  it("one creature attacking alone gets the counters and the keywords until end of turn; the Saga itself is gone", () => {
    const { s: s1, ap, opp, saga, mine } = three(1);
    expect(zone(s1, saga)).toBe("graveyard");
    let s = passUntil(s1, "declareAttackers", ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: mine[0]!, defender: opp }] } as Action), ap);
    const b = s.objects[mine[0]!]!;
    expect(b.counters["+1/+1"]).toBe(3);
    expect(pt(s, mine[0]!)).toBe("5/5");
    for (const k of ["Trample", "Lifelink", "Indestructible"]) expect(objHasKeyword(s, b, k)).toBe(true);
  });

  it("two attackers: nobody attacks alone, nothing happens", () => {
    const { s: s1, ap, opp, mine } = three(2);
    let s = passUntil(s1, "declareAttackers", ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: mine.map((attacker) => ({ attacker, defender: opp })) } as Action), ap);
    for (const id of mine) expect(s.objects[id]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("over at end of turn: next turn an attack alone does nothing", () => {
    const { s: s1, ap, opp, mine } = three(1);
    let s = nextTurn(s1, ap);
    s = passUntil(s, "declareAttackers", ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: mine[0]!, defender: opp }] } as Action), ap);
    expect(s.objects[mine[0]!]!.counters["+1/+1"] ?? 0).toBe(0);
  });
});

describe("Cleansing Meditation: destroy all enchantments; with threshold, your cards destroyed this way come back", () => {
  const board = (yard: number) => {
    const { s, ap, opp, ids } = setup([meditation()]);
    const anthem = putOnBattlefield(s, ap, glorious());
    const b = putOnBattlefield(s, ap, bears());
    const aura = putOnBattlefield(s, ap, holyStrength());
    s.objects[aura]!.attachedTo = b;
    const theirs = putOnBattlefield(s, opp, pacifism());
    s.objects[theirs]!.attachedTo = b;
    const old = place(s, ap, glorious(), "graveyard");
    for (let i = 1; i < yard; i++) place(s, ap, bears(), "graveyard");
    invalidateCharacteristics(s);
    return { s, ap, opp, spell: ids[0]!, anthem, b, aura, theirs, old };
  };

  it("fewer than seven cards in your graveyard: they're all destroyed and stay there", () => {
    const { s: s0, ap, spell, anthem, aura, theirs } = board(3);
    const s = settle(run(s0, planCast(s0, ap, spell)), ap);
    expect([anthem, aura, theirs].map((id) => zone(s, id))).toEqual(["graveyard", "graveyard", "graveyard"]);
  });

  it("seven or more: your destroyed enchantments return (an Aura onto a creature of your choice), not an opponent's, not ones already there", () => {
    const { s: s0, ap, opp, spell, anthem, b, aura, theirs, old } = board(7);
    const other = putOnBattlefield(s0, opp, giant());
    let s = settle(run(s0, planCast(s0, ap, spell)), ap);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "enchant" });
    if (s.pending?.kind !== "chooseOption") throw new Error("no host choice");
    expect(s.pending.options).toHaveLength(2);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: s.pending.options.find((o) => o.includes(b))! }), ap);
    expect(zone(s, anthem)).toBe("battlefield");
    expect(zone(s, aura)).toBe("battlefield");
    expect(s.objects[aura]!.attachedTo).toBe(b);
    expect(zone(s, theirs)).toBe("graveyard");
    expect(zone(s, old)).toBe("graveyard");
    expect(zone(s, other)).toBe("battlefield");
    // Holy Strength +1/+2 and Glorious Anthem +1/+1 on the Bears.
    expect(pt(s, b)).toBe("4/5");
  });
});

describe("Say Its Name: mill three and return a creature or land card; three of them in the graveyard fetch Altanak", () => {
  it("the spell: mill three cards, then you may return a creature or land card from your graveyard", () => {
    const { s: s0, ap, ids } = setup([sayName()]);
    const top = s0.players[ap]!.library.slice(0, 3);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    expect(top.map((id) => zone(s, id))).toEqual(["graveyard", "graveyard", "graveyard"]);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    if (s.pending?.kind !== "searchLibrary") throw new Error("no pick");
    const pick = s.pending.cards[0]!;
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [pick] } as Action), ap);
    expect(zone(s, pick)).toBe("hand");
  });

  const yard = (n: number, where: "library" | "hand" | "graveyard" = "library") => {
    const { s, ap } = setup([]);
    const copies = Array.from({ length: n }, () => place(s, ap, sayName(), "graveyard"));
    const alt = place(s, ap, altanak(), where);
    return { s, ap, copies, alt };
  };

  it("exiling it and two other cards named Say Its Name from your graveyard puts Altanak onto the battlefield", () => {
    const { s: s0, ap, copies, alt } = yard(3);
    const plan = planActivate(s0, ap, copies[0]!, 0, [], undefined, undefined, undefined, { exileCards: copies.slice(1) });
    expect(plan).not.toBeNull();
    let s = settle(run(s0, plan), ap);
    if (s.pending?.kind === "chooseOption" && s.pending.what === "searchZones") s = settle(act(s, { type: "chooseOption", player: ap, choice: "both" }), ap);
    if (s.pending?.kind === "searchLibrary") s = settle(act(s, { type: "searchLibrary", player: ap, found: [alt] } as Action), ap);
    expect(copies.map((id) => zone(s, id))).toEqual(["exile", "exile", "exile"]);
    expect(zone(s, alt)).toBe("battlefield");
  });

  it("Altanak from your hand or graveyard too", () => {
    for (const where of ["hand", "graveyard"] as const) {
      const { s: s0, ap, copies, alt } = yard(3, where);
      let s = settle(run(s0, planActivate(s0, ap, copies[0]!, 0, [], undefined, undefined, undefined, { exileCards: copies.slice(1) })), ap);
      // Searching the library is a choice (then a shuffle, CR 701.23): not needed for these.
      expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "searchZones" });
      s = settle(act(s, { type: "chooseOption", player: ap, choice: "graveyard" }), ap);
      if (s.pending?.kind === "searchLibrary") s = settle(act(s, { type: "searchLibrary", player: ap, found: [alt] } as Action), ap);
      expect(zone(s, alt), where).toBe("battlefield");
    }
  });

  it("only two in the graveyard, or not as a sorcery: it can't be activated; the other two have to be other cards", () => {
    const { s, ap, copies } = yard(2);
    expect(planActivate(s, ap, copies[0]!, 0, [], undefined, undefined, undefined, { exileCards: copies.slice(1) })).toBeNull();
    expect(planActivate(s, ap, copies[0]!, 0, [], undefined, undefined, undefined, { exileCards: [copies[0]!, copies[1]!] })).toBeNull();
    const t = yard(3);
    const u = passUntil(t.s, "upkeep", t.s.turnOrder[(t.s.turnOrder.indexOf(t.ap) + 1) % 4]!);
    expect(planActivate(u, t.ap, t.copies[0]!, 0, [], undefined, undefined, undefined, { exileCards: t.copies.slice(1) })).toBeNull();
  });
});

describe("Revival Experiment: up to one card of each permanent type from your graveyard to the battlefield, 3 life for each", () => {
  const board = () => {
    const { s, ap, ids } = setup([revival()]);
    const thopter = place(s, ap, ornithopter(), "graveyard"); // artifact creature: artifact or creature, not both
    const b = place(s, ap, bears(), "graveyard");
    const g = place(s, ap, giant(), "graveyard");
    const land = place(s, ap, forestCard(), "graveyard");
    const anthem = place(s, ap, glorious(), "graveyard");
    const pw = place(s, ap, jace(), "graveyard");
    const instant = place(s, ap, shock(), "graveyard");
    return { s, ap, spell: ids[0]!, thopter, b, g, land, anthem, pw, instant };
  };

  it("one of each type: an artifact creature can be the artifact; all enter at once and you lose 3 life for each", () => {
    const { s: s0, ap, spell, thopter, b, g, land, anthem, pw, instant } = board();
    let s = settle(run(s0, planCast(s0, ap, spell)), ap);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0 });
    if (s.pending?.kind !== "searchLibrary") throw new Error("no pick");
    expect(s.pending.cards).not.toContain(instant);
    // Two creatures and the artifact creature: only two of them can fit (the artifact and the creature).
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [thopter, b, g] } as Action)).toThrow();
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [thopter, b, land, anthem, pw] } as Action), ap);
    expect([thopter, b, land, anthem, pw].map((id) => zone(s, id))).toEqual(["battlefield", "battlefield", "battlefield", "battlefield", "battlefield"]);
    expect(zone(s, g)).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(40 - 15);
    expect(zone(s, spell)).toBe("exile");
  });

  it("none chosen: nothing returns and no life is lost", () => {
    const { s: s0, ap, spell } = board();
    let s = settle(run(s0, planCast(s0, ap, spell)), ap);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [] } as Action), ap);
    expect(s.players[ap]!.life).toBe(40);
    expect(zone(s, spell)).toBe("exile");
  });

  it("a bot casting it picks a set that fits", () => {
    const { s: s0, ap, spell } = board();
    const s1 = settle(run(s0, planCast(s0, ap, spell)), ap);
    const s = run(s1, botActions(s1, ap));
    expect(s.pending?.kind === "searchLibrary").toBe(false);
    expect(s.players[ap]!.life % 3).toBe(40 % 3);
  });
});
