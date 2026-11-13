// Lane B round B192: The Kingpin of Crime ("Whenever you attack, you may pay 2 life. If you do, until end of turn,
// creatures you control with toughness greater than their power assign combat damage equal to their toughness rather than
// their power."), Disciple of Deceit ("you may discard a nonland card. If you do, search your library for a card with the
// same mana value as that card"), Colfenor's Plans ("You may look at the cards exiled with ~, and you may play lands and
// cast spells from among those cards."), Pinnacle Starcage ("Put each card exiled with ~ into its owner's graveyard, then
// create a 2/2 colorless Robot artifact creature token for each card put into a graveyard this way.") and Flameskull
// (rejuvenation: "When ~ dies, exile it. If you do, exile the top card of your library. Until the end of your next turn,
// you may play one of those cards.") and Hedonist's Trove ("You may play lands from among cards exiled with ~." "You may
// cast spells from among cards exiled with ~. You can't cast more than one spell this way each turn.").

import { describe, expect, it } from "vitest";
import { act, forest, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";
import { combatDamageOf, moveObject, untapPermanent } from "../src/game";

// Real card data (Scryfall).
const kingpin = (): CardDef => ({"oracleId":"3eeeb159-aa45-4a9b-9618-8542604b9830","name":"The Kingpin of Crime","manaCost":"{1}{W}{B}","cmc":3,"typeLine":"Legendary Creature — Human Villain","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Villain"],"oracleText":"Extort (Whenever you cast a spell, you may pay {W/B}. If you do, each opponent loses 1 life and you gain that much life.)\nWhenever you attack, you may pay 2 life. If you do, until end of turn, creatures you control with toughness greater than their power assign combat damage equal to their toughness rather than their power.","power":"1","toughness":"5","colors":["B","W"],"colorIdentity":["B","W"],"keywords":["Extort"],"imageUrl":"https://cards.scryfall.io/normal/front/4/9/495c08ea-5502-4bfe-aa15-fa85556755ae.jpg?1783902900","artUrl":"https://cards.scryfall.io/art_crop/front/4/9/495c08ea-5502-4bfe-aa15-fa85556755ae.jpg?1783902900","commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const disciple = (): CardDef => ({"oracleId":"34ace274-8401-4e3c-89cd-75fe2337bf7d","name":"Disciple of Deceit","manaCost":"{U}{B}","cmc":2,"typeLine":"Creature — Human Rogue","supertypes":[],"types":["Creature"],"subtypes":["Human","Rogue"],"oracleText":"Inspired — Whenever this creature becomes untapped, you may discard a nonland card. If you do, search your library for a card with the same mana value as that card, reveal it, put it into your hand, then shuffle.","power":"1","toughness":"3","colors":["B","U"],"colorIdentity":["B","U"],"keywords":["Inspired"],"imageUrl":"https://cards.scryfall.io/normal/front/f/b/fbfe88fd-9bb9-42af-8134-96fd264b8405.jpg?1783939405","artUrl":"https://cards.scryfall.io/art_crop/front/f/b/fbfe88fd-9bb9-42af-8134-96fd264b8405.jpg?1783939405","commanderLegal":"legal","set":"jou","releasedAt":"2014-05-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const plans = (): CardDef => ({"oracleId":"ad786230-4045-46af-bc89-078d45891e5b","name":"Colfenor's Plans","manaCost":"{2}{B}{B}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, exile the top seven cards of your library face down.\nYou may look at the cards exiled with this enchantment, and you may play lands and cast spells from among those cards.\nSkip your draw step.\nYou can't cast more than one spell each turn.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/8/f8d06368-d226-4089-84d4-950a3ebdfb15.jpg?1783942893","artUrl":"https://cards.scryfall.io/art_crop/front/f/8/f8d06368-d226-4089-84d4-950a3ebdfb15.jpg?1783942893","commanderLegal":"legal","set":"lrw","releasedAt":"2007-10-12","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const starcage = (): CardDef => ({"oracleId":"10e0b563-4dfc-4530-a010-0ba40bdf02ac","name":"Pinnacle Starcage","manaCost":"{1}{W}{W}","cmc":3,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"When this artifact enters, exile all artifacts and creatures with mana value 2 or less until this artifact leaves the battlefield.\n{6}{W}{W}: Put each card exiled with this artifact into its owner's graveyard, then create a 2/2 colorless Robot artifact creature token for each card put into a graveyard this way. Sacrifice this artifact.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/1/b1f40c4c-a955-4d9c-8225-251fa4159124.jpg?1783905992","artUrl":"https://cards.scryfall.io/art_crop/front/b/1/b1f40c4c-a955-4d9c-8225-251fa4159124.jpg?1783905992","commanderLegal":"legal","set":"eoe","releasedAt":"2025-08-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const flameskull = (): CardDef => ({"oracleId":"f3d935cd-d582-464a-a13b-bb84a53da4a1","name":"Flameskull","manaCost":"{1}{R}{R}","cmc":3,"typeLine":"Creature — Skeleton","supertypes":[],"types":["Creature"],"subtypes":["Skeleton"],"oracleText":"Flying\nThis creature can't block.\nRejuvenation — When this creature dies, exile it. If you do, exile the top card of your library. Until the end of your next turn, you may play one of those cards. (If you cast Flameskull this way, you can't play the other card, and vice versa.)","power":"3","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/8/8/8826a883-197b-48e9-bd07-e2c8ce361fcf.jpg?1783926390","artUrl":"https://cards.scryfall.io/art_crop/front/8/8/8826a883-197b-48e9-bd07-e2c8ce361fcf.jpg?1783926390","commanderLegal":"legal","set":"afr","releasedAt":"2021-07-23","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const wall = (): CardDef => ({"oracleId":"aa5e6894-8c97-46f8-a0fd-07c6db51e9a7","name":"Wall of Wood","manaCost":"{G}","cmc":1,"typeLine":"Creature — Wall","supertypes":[],"types":["Creature"],"subtypes":["Wall"],"oracleText":"Defender (This creature can't attack.)","power":"0","toughness":"3","colors":["G"],"colorIdentity":["G"],"keywords":["Defender"],"imageUrl":"https://cards.scryfall.io/normal/front/1/8/1864e25e-f940-47e5-9439-ab721049c690.jpg?1783942988","artUrl":"https://cards.scryfall.io/art_crop/front/1/8/1864e25e-f940-47e5-9439-ab721049c690.jpg?1783942988","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const rip = (): CardDef => ({"oracleId":"087f9ad7-e74f-40e2-8102-1ed2925d0418","name":"Rest in Peace","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, exile all graveyards.\nIf a card or token would be put into a graveyard from anywhere, exile it instead.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/8/98040e14-8182-4a94-9322-bbd967dc4dfe.jpg?1783910962","artUrl":"https://cards.scryfall.io/art_crop/front/9/8/98040e14-8182-4a94-9322-bbd967dc4dfe.jpg?1783910962","commanderLegal":"legal","set":"acr","releasedAt":"2024-07-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const opt = (): CardDef => ({"oracleId":"713332c1-5bd8-400f-bfff-c1ca0697a043","name":"Opt","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card.","colors":["U"],"colorIdentity":["U"],"keywords":["Scry"],"imageUrl":"https://cards.scryfall.io/normal/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","artUrl":"https://cards.scryfall.io/art_crop/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","commanderLegal":"legal","set":"sld","releasedAt":"2025-07-25","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const elvesDef = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const anthem = (): CardDef => ({"oracleId":"e3886fe8-9b76-4613-8891-4ec74657c087","name":"Glorious Anthem","manaCost":"{1}{W}{W}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Creatures you control get +1/+1.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/1/61f867c5-0727-4408-b479-b81518daa0ec.jpg?1783946375","artUrl":"https://cards.scryfall.io/art_crop/front/6/1/61f867c5-0727-4408-b479-b81518daa0ec.jpg?1783946375","commanderLegal":"legal","set":"usg","releasedAt":"1998-10-12","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const tutor = (): CardDef => ({"oracleId":"14589b6b-1814-46f9-a364-83cc15dacac2","name":"Diabolic Tutor","manaCost":"{2}{B}{B}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Search your library for a card, put that card into your hand, then shuffle.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/6/06750380-a9a9-4ab4-a03b-d4d35a31132a.jpg?1783937210","artUrl":"https://cards.scryfall.io/art_crop/front/0/6/06750380-a9a9-4ab4-a03b-d4d35a31132a.jpg?1783937210","commanderLegal":"legal","set":"kld","releasedAt":"2016-09-30","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const fireball = (): CardDef => ({"oracleId":"aa7714b0-2bfb-458a-8ebf-37ec2c53383e","name":"Fireball","manaCost":"{X}{R}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"This spell costs {1} more to cast for each target beyond the first.\nFireball deals X damage divided evenly, rounded down, among any number of targets.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/2/82a97aae-d8a7-4451-a47e-ea878dea6e4c.jpg?1783922638","artUrl":"https://cards.scryfall.io/art_crop/front/8/2/82a97aae-d8a7-4451-a47e-ea878dea6e4c.jpg?1783922638","commanderLegal":"legal","set":"clb","releasedAt":"2022-06-10","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

const trove = (): CardDef => ({"oracleId":"9d5f712a-d46c-4d7e-8fea-45fdadb458df","name":"Hedonist's Trove","manaCost":"{5}{B}{B}","cmc":7,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, exile target opponent's graveyard.\nYou may play lands from among cards exiled with this enchantment.\nYou may cast spells from among cards exiled with this enchantment. You can't cast more than one spell this way each turn.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/2/b2b73bbf-39a8-4358-9af6-8f4f0b57c028.jpg?1783938596","artUrl":"https://cards.scryfall.io/art_crop/front/b/2/b2b73bbf-39a8-4358-9af6-8f4f0b57c028.jpg?1783938596","commanderLegal":"legal","set":"dtk","releasedAt":"2015-03-27","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

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
const nameOf = (s: GameState, id: ObjectId) => s.cards[s.objects[id]!.cardId]!.name;
/** From `ap`'s main phase to their next precombat main phase, answering the other players' questions with the bot. */
const nextTurn = (s0: GameState, ap: PlayerId) => {
  s0.players[ap]!.hand = [];
  const o = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!;
  let s = passUntil(s0, "upkeep", o);
  s = passUntil(s, "main1", ap);
  return s;
};

describe("Round B192 cards are supported", () => {
  it("compiles all six", () => supported(kingpin(), disciple(), plans(), starcage(), flameskull(), trove()));
});

describe("The Kingpin of Crime: pay 2 life as you attack, and your creatures with more toughness than power assign damage by toughness this turn", () => {
  /** Kingpin and a Hill Giant attack; the trigger asks whether to pay 2 life. */
  const attack = () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, kingpin());
    const g = putOnBattlefield(s0, ap, giant());
    const theirs = putOnBattlefield(s0, opp, wall());
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: k, defender: opp }, { attacker: g, defender: opp }] });
    s = settle(s, ap);
    return { s, ap, opp, k, g, theirs };
  };

  it("paid: Kingpin (1/5) assigns 5, a creature that enters later this turn too (CR 611.2c), not Hill Giant (3/3) or an opponent's Wall", () => {
    const { s: s1, ap, opp, k, g, theirs } = attack();
    expect(s1.pending).toMatchObject({ kind: "chooseMay", player: ap });
    const life = s1.players[ap]!.life;
    let s = settle(act(s1, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(s.players[ap]!.life).toBe(life - 2);
    expect(pt(s, k)).toBe("1/5");
    expect(combatDamageOf(s, s.objects[k]!)).toBe(5);
    expect(combatDamageOf(s, s.objects[g]!)).toBe(3);
    expect(combatDamageOf(s, s.objects[theirs]!)).toBe(0);
    // A rule, not a change to characteristics: a Wall of Wood that enters now is covered as well.
    const late = putOnBattlefield(s, ap, wall());
    expect(combatDamageOf(s, s.objects[late]!)).toBe(3);
    // Unblocked, the two deal 5 + 3.
    const oppLife = s.players[opp]!.life;
    s = passUntil(s, "end", ap);
    expect(s.players[opp]!.life).toBe(oppLife - 8);
    // Next turn, it's over.
    s = nextTurn(s, ap);
    expect(combatDamageOf(s, s.objects[k]!)).toBe(1);
  });

  it("declined: no life paid, damage by power", () => {
    const { s: s1, ap, k } = attack();
    const life = s1.players[ap]!.life;
    const s = settle(act(s1, { type: "chooseMay", player: ap, yes: false }), ap);
    expect(s.players[ap]!.life).toBe(life);
    expect(combatDamageOf(s, s.objects[k]!)).toBe(1);
  });
});

describe("Disciple of Deceit: as it untaps, discard a nonland card to search for a card with the same mana value", () => {
  const untapped = (hand: CardDef[], library: CardDef[]) => {
    const { s: s0, ap } = setup([]);
    const d = putOnBattlefield(s0, ap, disciple());
    const inHand = hand.map((c) => place(s0, ap, c, "hand"));
    const inLib = library.map((c) => place(s0, ap, c, "library"));
    s0.objects[d]!.tapped = true;
    untapPermanent(s0, s0.objects[d]!);
    const s = settle(s0, ap);
    return { s, ap, d, inHand, inLib };
  };

  it("discarding Divination (mana value 3) finds only a mana value 3 card: the other Divination, not Hill Giant or Opt", () => {
    const { s: s1, ap, inHand, inLib } = untapped([divination()], [divination(), giant(), opt()]);
    expect(s1.pending).toMatchObject({ kind: "chooseMay", player: ap });
    let s = settle(act(s1, { type: "chooseMay", player: ap, yes: true }), ap);
    if (s.pending?.kind === "discard") s = settle(act(s, { type: "discard", player: ap, objectIds: [inHand[0]!] }), ap);
    expect(zone(s, inHand[0]!)).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    const cards = s.pending?.kind === "searchLibrary" ? s.pending.cards : [];
    expect(cards.map((id) => nameOf(s, id))).toEqual(["Divination"]);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [inLib[0]!] }), ap);
    expect(zone(s, inLib[0]!)).toBe("hand");
    expect([zone(s, inLib[1]!), zone(s, inLib[2]!)]).toEqual(["library", "library"]);
  });

  it("an {X} in the discarded card's mana cost counts as 0 (rulings): Fireball (mana value 1) finds Opt", () => {
    const { s: s1, ap, inHand, inLib } = untapped([fireball()], [opt(), giant()]);
    let s = settle(act(s1, { type: "chooseMay", player: ap, yes: true }), ap);
    if (s.pending?.kind === "discard") s = settle(act(s, { type: "discard", player: ap, objectIds: [inHand[0]!] }), ap);
    const cards = s.pending?.kind === "searchLibrary" ? s.pending.cards : [];
    expect(cards).toContain(inLib[0]!);
    expect(cards).not.toContain(inLib[1]!);
    expect(cards.every((id) => (s.cards[s.objects[id]!.cardId]!.cmc ?? 0) === 1)).toBe(true);
  });

  it("declined: nothing discarded, no search", () => {
    const { s: s1, ap, inHand } = untapped([divination()], [divination()]);
    const s = settle(act(s1, { type: "chooseMay", player: ap, yes: false }), ap);
    expect(zone(s, inHand[0]!)).toBe("hand");
    expect(s.pending).toBeFalsy();
  });
});

describe("Colfenor's Plans: seven cards exiled face down that you may look at and play, one spell a turn, no draw step", () => {
  const castPlans = () => {
    const { s: s0, ap, opp, ids } = setup([plans()]);
    // On top of the library, last placed on top: Shock, Opt, Divination, a Wall of Wood and a Forest.
    const top = [forest, wall(), divination(), opt(), shock()].map((c) => place(s0, ap, c, "library")).reverse();
    const seven = s0.players[ap]!.library.slice(0, 7);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    return { s, ap, opp, top, seven, p: ids[0]! };
  };

  it("exiles the top seven face down, seen by you only", () => {
    const { s, ap, opp, seven } = castPlans();
    for (const id of seven) {
      expect(zone(s, id)).toBe("exile");
      expect(s.objects[id]!.hiddenExile?.seen).toContain(ap);
      expect(s.objects[id]!.hiddenExile?.seen).not.toContain(opp);
    }
  });

  it("the turn it's cast, no other spell; next turn, no draw, one spell from among them (and a land), not a second", () => {
    const { s: s1, ap, top } = castPlans();
    const [shockId, optId] = top;
    // Plans itself was this turn's spell.
    expect(planCast(s1, ap, shockId!, [{ kind: "player", id: s1.turnOrder[(s1.turnOrder.indexOf(ap) + 1) % 4]! }])).toBeNull();
    let s = nextTurn(s1, ap);
    expect(s.players[ap]!.hand).toHaveLength(0);
    const target: TargetChoice = { kind: "player", id: s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]! };
    s = settle(run(s, planCast(s, ap, shockId!, [target])), ap);
    expect(zone(s, shockId!)).toBe("graveyard");
    expect(planCast(s, ap, optId!)).toBeNull();
    // A land from among them may be played as usual, the same turn.
    const land = top[4]!;
    expect(zone(s, land)).toBe("exile");
    s = act(s, { type: "playLand", player: ap, objectId: land });
    expect(zone(s, land)).toBe("battlefield");
  });

  it("once Colfenor's Plans is gone, the cards can't be played", () => {
    const { s: s1, ap, p, top } = castPlans();
    let s = nextTurn(s1, ap);
    moveObject(s, p, "graveyard");
    expect(planCast(s, ap, top[1]!)).toBeNull();
  });
});

describe("Pinnacle Starcage: the cards it exiled go to their owners' graveyards, and a Robot for each one that got there", () => {
  const caged = (extra?: (s: GameState, ap: PlayerId) => void) => {
    const { s: s0, ap, opp, ids } = setup([starcage()]);
    const thopter = putOnBattlefield(s0, opp, ornithopter());
    const ring = putOnBattlefield(s0, ap, solRing());
    const elves = putOnBattlefield(s0, opp, elvesDef());
    const big = putOnBattlefield(s0, ap, giant());
    const tok = putOnBattlefield(s0, opp, bears());
    s0.objects[tok]!.isToken = true;
    extra?.(s0, ap);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    return { s, ap, opp, cage: ids[0]!, thopter, ring, elves, big, tok };
  };

  it("enters: artifacts and creatures with mana value 2 or less are exiled (a token ceases to exist, CR 704.5d)", () => {
    const { s, thopter, ring, elves, big, tok } = caged();
    expect([zone(s, thopter), zone(s, ring), zone(s, elves), zone(s, big)]).toEqual(["exile", "exile", "exile", "battlefield"]);
    expect(s.objects[tok]?.zone === "battlefield").toBe(false);
  });

  it("{6}{W}{W}: the three cards go to their owners' graveyards, three 2/2 colorless Robot artifact creatures, and Starcage is sacrificed", () => {
    const { s: s1, ap, opp, cage, thopter, ring, elves } = caged();
    let s = nextTurn(s1, ap);
    s = settle(run(s, planActivate(s, ap, cage, 0)), ap);
    expect([zone(s, thopter), zone(s, ring), zone(s, elves)]).toEqual(["graveyard", "graveyard", "graveyard"]);
    expect(s.players[opp]!.graveyard).toContain(thopter);
    expect(s.players[ap]!.graveyard).toContain(ring);
    const robots = s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Robot"));
    expect(robots).toHaveLength(3);
    for (const id of robots) {
      const c = characteristics(s, s.objects[id]!);
      expect(s.objects[id]!.controller).toBe(ap);
      expect(c.colors).toEqual([]);
      expect([...c.types].sort()).toEqual(["Artifact", "Creature"]);
      expect(pt(s, id)).toBe("2/2");
    }
    expect(zone(s, cage)).toBe("graveyard");
  });

  it("under Rest in Peace, none get to a graveyard (CR 614.6): no Robots", () => {
    const { s: s1, ap, cage, thopter } = caged((s, ap) => void putOnBattlefield(s, ap, rip()));
    let s = nextTurn(s1, ap);
    s = settle(run(s, planActivate(s, ap, cage, 0)), ap);
    expect(zone(s, thopter)).toBe("exile");
    expect(s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Robot"))).toHaveLength(0);
  });
});

describe("Flameskull: rejuvenation exiles it and the top card; you may play one of those cards until the end of your next turn", () => {
  const dies = () => {
    const { s: s0, ap, ids } = setup([shock()]);
    const f = putOnBattlefield(s0, ap, flameskull());
    const topId = place(s0, ap, opt(), "library");
    const s = run(s0, planCast(s0, ap, ids[0]!, [obj(f)]));
    return { s, ap, f, topId };
  };

  it("both exiled, each playable, the same one permission (casting Flameskull ends Opt's)", () => {
    const { s: s1, ap, f, topId } = dies();
    let s = settle(s1, ap);
    expect([zone(s, f), zone(s, topId)]).toEqual(["exile", "exile"]);
    expect(s.objects[f]!.mayPlay?.oneOf).toBeTruthy();
    expect(s.objects[f]!.mayPlay?.oneOf).toBe(s.objects[topId]!.mayPlay?.oneOf);
    expect(s.objects[f]!.mayPlay?.until).toBe("nextTurn");
    s = nextTurn(s, ap);
    s = settle(run(s, planCast(s, ap, f)), ap);
    expect(zone(s, f)).toBe("battlefield");
    expect(planCast(s, ap, topId)).toBeNull();
  });

  it("playing the other card first ends Flameskull's permission", () => {
    const { s: s1, ap, f, topId } = dies();
    let s = settle(s1, ap);
    s = nextTurn(s, ap);
    s = settle(run(s, planCast(s, ap, topId)), ap);
    if (s.pending?.kind === "arrangeTop") s = settle(run(s, botActions(s, ap)), ap);
    expect(zone(s, topId)).toBe("graveyard");
    expect(planCast(s, ap, f)).toBeNull();
  });

  it("the permission ends with your next turn", () => {
    const { s: s1, ap, f } = dies();
    let s = settle(s1, ap);
    s = nextTurn(s, ap);
    s = nextTurn(s, ap);
    expect(zone(s, f)).toBe("exile");
    expect(s.objects[f]!.mayPlay).toBeUndefined();
  });

  it("if Flameskull left the graveyard before the trigger resolved, nothing is exiled (rulings)", () => {
    const { s: s1, ap, f, topId } = dies();
    // Shock resolves; Flameskull dies and its trigger waits on the stack.
    let s = s1;
    for (let i = 0; i < 20 && zone(s, f) !== "graveyard"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(zone(s, f)).toBe("graveyard");
    moveObject(s, f, "hand");
    s = settle(s, ap);
    expect(zone(s, f)).toBe("hand");
    expect(zone(s, topId)).toBe("library");
  });
});

describe("Hedonist's Trove: an opponent's graveyard exiled; play lands from among those cards, and cast one spell from among them each turn", () => {
  const troved = () => {
    const { s: s0, ap, opp, ids } = setup([trove()]);
    const yard = [shock(), bolt(), forest, giant()].map((c) => place(s0, opp, c, "graveyard"));
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s, ap);
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }), ap);
    const other = s.turnOrder.find((p) => p !== ap && p !== opp)!;
    return { s, ap, opp, other, t: ids[0]!, yard };
  };

  it("the target opponent's graveyard is exiled, face up", () => {
    const { s, opp, yard } = troved();
    expect(yard.map((id) => zone(s, id))).toEqual(["exile", "exile", "exile", "exile"]);
    expect(s.players[opp]!.graveyard).toHaveLength(0);
    expect(yard.some((id) => s.objects[id]!.hiddenExile)).toBe(false);
  });

  it("one spell a turn (Shock, then not Lightning Bolt), and a land as well; next turn another spell", () => {
    const { s: s1, ap, other, yard } = troved();
    const [shockId, boltId, forestId] = yard;
    const at: TargetChoice = { kind: "player", id: other };
    let s = settle(run(s1, planCast(s1, ap, shockId!, [at])), ap);
    expect(zone(s, shockId!)).toBe("graveyard");
    expect(planCast(s, ap, boltId!, [at])).toBeNull();
    // Lands aren't cast: the land is played as usual, after the spell.
    s = act(s, { type: "playLand", player: ap, objectId: forestId! });
    expect(zone(s, forestId!)).toBe("battlefield");
    s = nextTurn(s, ap);
    expect(planCast(s, ap, boltId!, [at])).not.toBeNull();
  });

  it("once Hedonist's Trove is gone, the cards stay exiled and can't be played (rulings)", () => {
    const { s: s1, ap, other, t, yard } = troved();
    moveObject(s1, t, "graveyard");
    expect(planCast(s1, ap, yard[0]!, [{ kind: "player", id: other }])).toBeNull();
    expect(zone(s1, yard[0]!)).toBe("exile");
  });
});
