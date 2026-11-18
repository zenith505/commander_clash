// Round 409 (Lane A): Portent of Calamity (a revealed card of each card type exiled, CR 205.2a; a free cast as it resolves
// if four or more were, CR 608.2g, 118.9; the rest into your hand), Jadzi, Oracle of Arcavios // Journey to the Oracle
// (magecraft: the top card cast for {1} rather than its mana cost, CR 118.9, or a land put onto the battlefield) and Arni
// Metalbrow ("Whenever a creature you control attacks or enters attacking", CR 508.1, 508.4).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { invalidateCharacteristics } from "../src/layers";
import { moveObject } from "../src/game";
import { parseManaCost } from "../src/mana";
import { planMana } from "../src/autopay";
import { applyAction, botActions, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const portent = (): CardDef => ({"oracleId":"0d49187a-1c37-4c3a-afc2-fac2bbc6b29a","name":"Portent of Calamity","manaCost":"{X}{U}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Reveal the top X cards of your library. For each card type, you may exile a card of that type from among them. Put the rest into your graveyard. You may cast a spell from among the exiled cards without paying its mana cost if you exiled four or more cards this way. Then put the rest of the exiled cards into your hand.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/5/8599e2dd-9164-4da3-814f-adccef3b9497.jpg?1783910845","artUrl":"https://cards.scryfall.io/art_crop/front/8/5/8599e2dd-9164-4da3-814f-adccef3b9497.jpg?1783910845","commanderLegal":"legal","set":"blb","releasedAt":"2024-08-02","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const jadzi = (): CardDef => ({"oracleId":"ca79cd3f-13ba-4d11-b885-48a504ae69aa","name":"Jadzi, Oracle of Arcavios // Journey to the Oracle","manaCost":"{6}{U}{U}","cmc":8,"typeLine":"Legendary Creature — Human Wizard // Sorcery","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"Discard a card: Return Jadzi to its owner's hand.\nMagecraft — Whenever you cast or copy an instant or sorcery spell, reveal the top card of your library. If it's a nonland card, you may cast it by paying {1} rather than paying its mana cost. If it's a land card, put it onto the battlefield.","power":"5","toughness":"5","colors":["U"],"colorIdentity":["G","U"],"keywords":["Magecraft"],"imageUrl":"https://cards.scryfall.io/normal/front/b/0/b0a96416-9ee5-4202-a99f-e09db8794567.jpg?1783927246","artUrl":"https://cards.scryfall.io/art_crop/front/b/0/b0a96416-9ee5-4202-a99f-e09db8794567.jpg?1783927246","commanderLegal":"legal","set":"stx","releasedAt":"2021-04-23","rarity":"mythic","layout":"modal_dfc","gameChanger":false,"faces":[{"name":"Jadzi, Oracle of Arcavios","manaCost":"{6}{U}{U}","typeLine":"Legendary Creature — Human Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"Discard a card: Return Jadzi to its owner's hand.\nMagecraft — Whenever you cast or copy an instant or sorcery spell, reveal the top card of your library. If it's a nonland card, you may cast it by paying {1} rather than paying its mana cost. If it's a land card, put it onto the battlefield.","power":"5","toughness":"5","colors":["U"],"imageUrl":"https://cards.scryfall.io/normal/front/b/0/b0a96416-9ee5-4202-a99f-e09db8794567.jpg?1783927246","artUrl":"https://cards.scryfall.io/art_crop/front/b/0/b0a96416-9ee5-4202-a99f-e09db8794567.jpg?1783927246"},{"name":"Journey to the Oracle","manaCost":"{2}{G}{G}","typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"You may put any number of land cards from your hand onto the battlefield. Then if you control eight or more lands, you may discard a card. If you do, return Journey to the Oracle to its owner's hand.","colors":["G"],"imageUrl":"https://cards.scryfall.io/normal/back/b/0/b0a96416-9ee5-4202-a99f-e09db8794567.jpg?1783927246","artUrl":"https://cards.scryfall.io/art_crop/back/b/0/b0a96416-9ee5-4202-a99f-e09db8794567.jpg?1783927246"}]} as CardDef);
const arni = (): CardDef => ({"oracleId":"d799e58a-0032-4df8-a77f-0d824ec15214","name":"Arni Metalbrow","manaCost":"{2}{R}","cmc":3,"typeLine":"Legendary Creature — Human Berserker","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Berserker"],"oracleText":"Whenever a creature you control attacks or enters attacking, you may pay {1}{R}. If you do, you may put a creature card with mana value less than that creature's mana value from your hand onto the battlefield tapped and attacking.","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/9/59cd3a3a-f9f8-4d83-951f-d187f2bab0a4.jpg?1783916500","artUrl":"https://cards.scryfall.io/art_crop/front/5/9/59cd3a3a-f9f8-4d83-951f-d187f2bab0a4.jpg?1783916500","commanderLegal":"legal","set":"mat","releasedAt":"2023-05-12","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const island = (): CardDef => ({"oracleId":"b2c6aa39-2d2a-459c-a555-fb48ba993373","name":"Island","manaCost":"","cmc":0,"typeLine":"Basic Land — Island","supertypes":["Basic"],"types":["Land"],"subtypes":["Island"],"oracleText":"({T}: Add {U}.)","colors":[],"colorIdentity":["U"],"keywords":[],"producedMana":["U"],"imageUrl":"https://cards.scryfall.io/normal/front/a/4/a44efa5f-8fbb-43e0-adc4-d05f4be6b9a6.jpg?1785981646","artUrl":"https://cards.scryfall.io/art_crop/front/a/4/a44efa5f-8fbb-43e0-adc4-d05f4be6b9a6.jpg?1785981646","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const mountain = (): CardDef => ({"oracleId":"a3fb7228-e76b-4e96-a40e-20b5fed75685","name":"Mountain","manaCost":"","cmc":0,"typeLine":"Basic Land — Mountain","supertypes":["Basic"],"types":["Land"],"subtypes":["Mountain"],"oracleText":"({T}: Add {R}.)","colors":[],"colorIdentity":["R"],"keywords":[],"producedMana":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/2/a/2a844b96-6616-4c39-8f4f-5d14a3b2bd55.jpg?1785981666","artUrl":"https://cards.scryfall.io/art_crop/front/2/a/2a844b96-6616-4c39-8f4f-5d14a3b2bd55.jpg?1785981666","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const thopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const angel = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","commanderLegal":"legal","set":"sld","releasedAt":"2023-10-02","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const pacifism = (): CardDef => ({"oracleId":"5f5e0b10-c8cf-450c-bfd3-bcb0528ec330","name":"Pacifism","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't attack or block.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","artUrl":"https://cards.scryfall.io/art_crop/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const goblin = (): CardDef => ({"oracleId":"30997b43-fc13-41d3-8064-1ccc2cb6fd2b","name":"Raging Goblin","manaCost":"{R}","cmc":1,"typeLine":"Creature — Goblin Berserker","supertypes":[],"types":["Creature"],"subtypes":["Goblin","Berserker"],"oracleText":"Haste (This creature can attack and {T} as soon as it comes under your control.)","power":"1","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":["Haste"],"imageUrl":"https://cards.scryfall.io/normal/front/e/6/e6df5a36-7bd4-4456-a462-54f65089826c.jpg?1783946461","artUrl":"https://cards.scryfall.io/art_crop/front/e/6/e6df5a36-7bd4-4456-a462-54f65089826c.jpg?1783946461","commanderLegal":"legal","set":"p02","releasedAt":"1998-06-24","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const opt = (): CardDef => ({"oracleId":"713332c1-5bd8-400f-bfff-c1ca0697a043","name":"Opt","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card.","colors":["U"],"colorIdentity":["U"],"keywords":["Scry"],"imageUrl":"https://cards.scryfall.io/normal/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","artUrl":"https://cards.scryfall.io/art_crop/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","commanderLegal":"legal","set":"sld","releasedAt":"2025-07-25","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const valakut = (): CardDef => ({"oracleId":"ff0ab867-b710-4b1a-baed-95fc3cf68f79","name":"Valakut Awakening // Valakut Stoneforge","manaCost":"{2}{R}","cmc":3,"typeLine":"Instant // Land","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Put any number of cards from your hand on the bottom of your library, then draw that many cards plus one.","colors":["R"],"colorIdentity":["R"],"keywords":[],"producedMana":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/2/2/228e551e-023a-4c9a-8f32-58dae6ffdf7f.jpg?1783929350","artUrl":"https://cards.scryfall.io/art_crop/front/2/2/228e551e-023a-4c9a-8f32-58dae6ffdf7f.jpg?1783929350","commanderLegal":"legal","set":"znr","releasedAt":"2020-09-25","rarity":"rare","layout":"modal_dfc","gameChanger":false,"faces":[{"name":"Valakut Awakening","manaCost":"{2}{R}","typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Put any number of cards from your hand on the bottom of your library, then draw that many cards plus one.","colors":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/2/2/228e551e-023a-4c9a-8f32-58dae6ffdf7f.jpg?1783929350","artUrl":"https://cards.scryfall.io/art_crop/front/2/2/228e551e-023a-4c9a-8f32-58dae6ffdf7f.jpg?1783929350"},{"name":"Valakut Stoneforge","manaCost":"","typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"This land enters tapped.\n{T}: Add {R}.","colors":[],"imageUrl":"https://cards.scryfall.io/normal/back/2/2/228e551e-023a-4c9a-8f32-58dae6ffdf7f.jpg?1783929350","artUrl":"https://cards.scryfall.io/art_crop/back/2/2/228e551e-023a-4c9a-8f32-58dae6ffdf7f.jpg?1783929350"}]} as CardDef);
const geist = (): CardDef => ({"oracleId":"4304035c-c3e4-4a19-aa1f-92a83d8aed1f","name":"Geist of Saint Traft","manaCost":"{1}{W}{U}","cmc":3,"typeLine":"Legendary Creature — Spirit Cleric","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Spirit","Cleric"],"oracleText":"Hexproof (This creature can't be the target of spells or abilities your opponents control.)\nWhenever Geist of Saint Traft attacks, create a 4/4 white Angel creature token with flying that's tapped and attacking. Exile that token at end of combat.","power":"2","toughness":"2","colors":["U","W"],"colorIdentity":["U","W"],"keywords":["Hexproof"],"imageUrl":"https://cards.scryfall.io/normal/front/0/b/0ba5dd1a-6906-4b45-bbf7-2f10cb955083.jpg?1783937860","artUrl":"https://cards.scryfall.io/art_crop/front/0/b/0ba5dd1a-6906-4b45-bbf7-2f10cb955083.jpg?1783937860","commanderLegal":"legal","set":"ddq","releasedAt":"2016-02-26","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const ninja = (): CardDef => ({"oracleId":"1f3c2b00-0000-4ae1-9650-9553accac52e","name":"Ninja of the Deep Hours","manaCost":"{3}{U}","cmc":4,"typeLine":"Creature — Human Ninja","supertypes":[],"types":["Creature"],"subtypes":["Human","Ninja"],"oracleText":"Ninjutsu {1}{U} ({1}{U}, Return an unblocked attacker you control to hand: Put this card onto the battlefield from your hand tapped and attacking.)\nWhenever this creature deals combat damage to a player, you may draw a card.","power":"2","toughness":"2","colors":["U"],"colorIdentity":["U"],"keywords":["Ninjutsu"],"imageUrl":"https://cards.scryfall.io/normal/front/f/b/fb245a12-4cbd-4291-af67-f3677ca822dc.jpg?1783908836","artUrl":"https://cards.scryfall.io/art_crop/front/f/b/fb245a12-4cbd-4291-af67-f3677ca822dc.jpg?1783908836","commanderLegal":"legal","set":"j25","releasedAt":"2024-11-15","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const chandra = (): CardDef => ({"oracleId":"12cc800c-c7be-4811-8207-fd01a99cc892","name":"Chandra, Torch of Defiance","manaCost":"{2}{R}{R}","cmc":4,"typeLine":"Legendary Planeswalker — Chandra","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Chandra"],"oracleText":"+1: Exile the top card of your library. You may cast that card. If you don't, Chandra deals 2 damage to each opponent.\n+1: Add {R}{R}.\n−3: Chandra deals 4 damage to target creature.\n−7: You get an emblem with \"Whenever you cast a spell, this emblem deals 5 damage to any target.\"","loyalty":"4","colors":["R"],"colorIdentity":["R"],"keywords":[],"producedMana":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/4/0/40cb22c8-cb03-45c9-bb0e-b8cabdcc43cd.jpg?1788329325","artUrl":"https://cards.scryfall.io/art_crop/front/4/0/40cb22c8-cb03-45c9-bb0e-b8cabdcc43cd.jpg?1788329325","commanderLegal":"legal","set":"fra","releasedAt":"2026-10-02","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const fireball = (): CardDef => ({"oracleId":"aa7714b0-2bfb-458a-8ebf-37ec2c53383e","name":"Fireball","manaCost":"{X}{R}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"This spell costs {1} more to cast for each target beyond the first.\nFireball deals X damage divided evenly, rounded down, among any number of targets.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/2/82a97aae-d8a7-4451-a47e-ea878dea6e4c.jpg?1783922638","artUrl":"https://cards.scryfall.io/art_crop/front/8/2/82a97aae-d8a7-4451-a47e-ea878dea6e4c.jpg?1783922638","commanderLegal":"legal","set":"clb","releasedAt":"2022-06-10","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const forest = (): CardDef => ({"oracleId":"b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6","name":"Forest","manaCost":"","cmc":0,"typeLine":"Basic Land — Forest","supertypes":["Basic"],"types":["Land"],"subtypes":["Forest"],"oracleText":"({T}: Add {G}.)","colors":[],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","artUrl":"https://cards.scryfall.io/art_crop/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const wurm = (): CardDef => ({"oracleId":"6a462a69-3e42-41de-a3aa-a488d9f38d69","name":"Craw Wurm","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Creature — Wurm","supertypes":[],"types":["Creature"],"subtypes":["Wurm"],"oracleText":"","power":"6","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/f/bfed1a95-bd67-4e16-a781-81866028af2f.jpg?1783948678","artUrl":"https://cards.scryfall.io/art_crop/front/b/f/bfed1a95-bd67-4e16-a781-81866028af2f.jpg?1783948678","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"common","layout":"normal","gameChanger":false} as CardDef);

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: ObjectId): TargetChoice => ({ kind: "object", id });
/** Everyone passes until the stack is empty or a question comes up. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** `pid`'s cards in a zone of theirs: library (on top, the first one on top), graveyard or hand. */
function place(s: GameState, pid: PlayerId, zone: "library" | "graveyard" | "hand", defs: CardDef[]) {
  const ids = defs.map((def) => {
    const id = putOnBattlefield(s, pid, def);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = zone;
    return id;
  });
  if (zone === "library") s.players[pid]!.library.unshift(...ids);
  else s.players[pid]![zone].push(...ids);
  invalidateCharacteristics(s);
  return ids;
}
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
type Pending<K extends string> = Extract<NonNullable<GameState["pending"]>, { kind: K }>;
const pend = <K extends NonNullable<GameState["pending"]>["kind"]>(s: GameState, kind: K) => {
  expect(s.pending?.kind).toBe(kind);
  return s.pending as Pending<K>;
};

describe("round 409: the cards compile", () => {
  it("are fully supported", () => {
    for (const d of [portent(), jadzi(), arni()]) expect(isFullySupported(d), d.name).toBe(true);
  });
});

describe("round 409: Portent of Calamity", () => {
  /** Portent cast with X = 6 over a library topped by a creature, an artifact creature, an enchantment, an instant, a land and a sorcery. */
  function reveal() {
    const { s: s0, ap, ids } = setup([portent()]);
    const [b, t, pac, o, isl, div] = place(s0, ap, "library", [bears(), thopter(), pacifism(), opt(), island(), divination()]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [], undefined, undefined, 6)));
    return { s, ap, b: b!, t: t!, pac: pac!, o: o!, isl: isl!, div: div! };
  }

  it("exiles up to one revealed card of each card type; a card with two types fills only one of them", () => {
    const { s, ap, b, t, pac, o, isl, div } = reveal();
    const p = pend(s, "searchLibrary");
    expect(p.player).toBe(ap);
    expect(p.cards).toEqual(expect.arrayContaining([b, t, pac, o, isl, div]));
    expect(p.dig?.to).toMatch(/exile/);
    // One of each: Ornithopter (artifact creature) fills the artifact slot, the Bears the creature one.
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [b, t, pac, o, isl, div] })).not.toThrow();
  });

  it("with four or more exiled, one spell may be cast from among them free; the rest go to hand, the unchosen cards to the graveyard", () => {
    const { s: s0, ap, b, t, pac, o, isl, div } = reveal();
    let s = settle(act(s0, { type: "searchLibrary", player: ap, found: [b, pac, o, isl] }));
    expect(zone(s, t)).toBe("graveyard");
    expect(zone(s, div)).toBe("graveyard");
    const c = pend(s, "chooseOption");
    expect(c.what).toBe("castFromAmong");
    // The land can't be cast; Pacifism, Opt and the Bears can.
    expect(c.options).toEqual(expect.arrayContaining([b, o, "none"]));
    expect(c.options).not.toContain(isl);
    s = act(s, { type: "chooseOption", player: ap, choice: b });
    expect(pend(s, "castFree").objectId).toBe(b);
    s = run(s, planCast(s, ap, b));
    expect(zone(s, b)).toBe("stack");
    // Only one spell: the others go to their owner's hand.
    for (const id of [pac, o, isl]) expect(zone(s, id)).toBe("hand");
    s = settle(s);
    expect(zone(s, b)).toBe("battlefield");
  });

  it("a spell with {X} cast this way has X = 0; declining leaves all four for the hand", () => {
    const { s: s0, ap, ids, opp } = setup([portent()]);
    const [fb, b, o, isl] = place(s0, ap, "library", [fireball(), bears(), opt(), island()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [], undefined, undefined, 4)));
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [fb!, b!, o!, isl!] }));
    expect(pend(s, "chooseOption").options).toContain(fb);
    const life = s.players[opp]!.life;
    s = act(s, { type: "chooseOption", player: ap, choice: fb! });
    s = settle(run(s, planCast(s, ap, fb!, [{ kind: "player", id: opp }])));
    expect(zone(s, fb!)).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(life);
    for (const id of [b!, o!, isl!]) expect(zone(s, id)).toBe("hand");
    // Declined: every exiled card goes to the hand.
    const r = reveal();
    let s2 = settle(act(r.s, { type: "searchLibrary", player: r.ap, found: [r.b, r.pac, r.o, r.isl] }));
    s2 = act(s2, { type: "chooseOption", player: r.ap, choice: "none" });
    for (const id of [r.b, r.pac, r.o, r.isl]) expect(zone(s2, id)).toBe("hand");
  });

  it("with fewer than four exiled, none can be cast and the exiled cards go to hand", () => {
    const { s: s0, ap, b, t, pac, o, isl, div } = reveal();
    const s = settle(act(s0, { type: "searchLibrary", player: ap, found: [b, pac, o] }));
    expect(s.pending).toBeNull();
    for (const id of [b, pac, o]) expect(zone(s, id)).toBe("hand");
    for (const id of [t, isl, div]) expect(zone(s, id)).toBe("graveyard");
    expect(s.log.some((l) => /fewer than 4/.test(l.text ?? String(l)))).toBe(true);
  });

  it("two cards of only the same card type can't both be exiled", () => {
    const { s: s0, ap } = setup([portent()]);
    const [b, g] = place(s0, ap, "library", [bears(), giant()]);
    const s = settle(run(s0, planCast(s0, ap, s0.players[ap]!.hand.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Portent of Calamity")!, [], undefined, undefined, 2)));
    pend(s, "searchLibrary");
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [b!, g!] })).toThrow();
  });

  it("a bot casting it exiles a card of each type and casts one", () => {
    const { s: s0, ap, b, pac, o, isl } = reveal();
    let s = s0;
    for (let i = 0; i < 20 && s.pending; i++) s = settle(run(s, botActions(s, s.pending.player).slice(0, 1)));
    for (const id of [b, pac, o, isl]) expect(["hand", "battlefield", "stack", "graveyard"]).toContain(zone(s, id));
    expect([b, pac, o, isl].filter((id) => zone(s, id) === "exile")).toEqual([]);
  });
});

describe("round 409: Jadzi, Oracle of Arcavios", () => {
  const untappedLands = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && !s.objects[id]!.tapped && s.cards[s.objects[id]!.cardId]!.types.includes("Land")).length;
  /** Jadzi out, Opt in hand and `top` on top of the library; Opt cast, Jadzi's trigger resolved up to its question. */
  function magecraft(top: CardDef) {
    const { s: s0, ap, ids } = setup([opt()]);
    putOnBattlefield(s0, ap, jadzi());
    const [card] = place(s0, ap, "library", [top]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    expect(s.stack.length).toBeGreaterThanOrEqual(1);
    s = settle(s);
    return { s, ap, card: card!, opt: ids[0]! };
  }

  it("casting an instant reveals the top card; a nonland card may be cast for {1} rather than its mana cost", () => {
    const { s: s0, ap, card } = magecraft(giant());
    const p = pend(s0, "castFree");
    expect(p).toMatchObject({ objectId: card, how: "paid", pay: { kind: "mana", mana: "{1}" } });
    const before = untappedLands(s0, ap);
    let s = run(s0, planCast(s0, ap, card));
    expect(zone(s, card)).toBe("stack");
    expect(before - untappedLands(s, ap)).toBe(1);
    s = settle(s);
    expect(zone(s, card)).toBe("battlefield");
  });

  it("declined, the card stays on top of the library", () => {
    const { s: s0, ap, card } = magecraft(giant());
    pend(s0, "castFree");
    const s = settle(act(s0, { type: "chooseMay", player: ap, yes: false }));
    expect(zone(s, card)).toBe("library");
    expect(s.players[ap]!.library[0] === card || s.players[ap]!.hand.includes(card)).toBe(true);
  });

  it("a land card is put onto the battlefield, not played", () => {
    const { s: s0, ap } = setup([opt()]);
    putOnBattlefield(s0, ap, jadzi());
    const [land] = place(s0, ap, "library", [island()]);
    const played = s0.players[ap]!.landsPlayedThisTurn;
    const s = settle(run(s0, planCast(s0, ap, s0.players[ap]!.hand[s0.players[ap]!.hand.length - 1]!)));
    expect(zone(s, land!)).toBe("battlefield");
    expect(s.players[ap]!.landsPlayedThisTurn).toBe(played);
  });

  it("a creature spell doesn't trigger it", () => {
    const { s: s0, ap, ids } = setup([giant()]);
    putOnBattlefield(s0, ap, jadzi());
    const [top] = place(s0, ap, "library", [bears()]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toBeNull();
    expect(zone(s, top!)).toBe("library");
  });

  it("a modal double-faced card with a land back face is cast as its front face", () => {
    const { s: s0, card } = magecraft(valakut());
    expect(pend(s0, "castFree").objectId).toBe(card);
  });

  it("Journey to the Oracle: lands from hand, then with eight or more lands a discard returns it to its owner's hand", () => {
    const { s: s0, ap, ids } = setup([jadzi(), island(), forest(), bears()]);
    const [j, isl, fo, b] = ids as [ObjectId, ObjectId, ObjectId, ObjectId];
    let s = settle(run(s0, planCast(s0, ap, j, undefined, undefined, "auto", undefined, { face: 1 })));
    const p = pend(s, "searchLibrary");
    expect(p.cards).toEqual(expect.arrayContaining([isl, fo]));
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [isl, fo] }));
    expect(zone(s, isl)).toBe("battlefield");
    expect(zone(s, fo)).toBe("battlefield");
    expect(pend(s, "chooseMay").player).toBe(ap);
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(pend(s, "discard").player).toBe(ap);
    s = settle(act(s, { type: "discard", player: ap, objectIds: [b] }));
    expect(zone(s, b)).toBe("graveyard");
    expect(zone(s, j)).toBe("hand");
  });

  it("Journey to the Oracle without the discard goes to the graveyard", () => {
    const { s: s0, ap, ids } = setup([jadzi(), bears()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { face: 1 })));
    // Its opening hand's lands are offered; none put. With fourteen lands it still asks about the discard.
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [] }));
    expect(pend(s, "chooseMay").player).toBe(ap);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(zone(s, ids[1]!)).toBe("hand");
  });
});

describe("round 409: Journey to the Oracle with fewer than eight lands", () => {
  it("puts the lands but asks for no discard", () => {
    const { s: s0, ap, ids } = setup([jadzi(), island()]);
    // Six Forests, then the Island from hand: seven lands.
    for (const id of [...s0.battlefield]) if (s0.objects[id]!.controller === ap && s0.cards[s0.objects[id]!.cardId]!.types.includes("Land")) moveObject(s0, id, "graveyard");
    for (let i = 0; i < 6; i++) putOnBattlefield(s0, ap, forest());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { face: 1 })));
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [ids[1]!] }));
    expect(zone(s, ids[1]!)).toBe("battlefield");
    expect(s.pending).toBeNull();
    expect(zone(s, ids[0]!)).toBe("graveyard");
  });
});

describe("round 409: Arni Metalbrow", () => {
  const pass = (s: GameState) => act(s, { type: "passPriority", player: waitingOn(s)! });
  /** Pass priority until `stop` holds, answering other players' combat questions with nothing. */
  function until(s0: GameState, stop: (s: GameState) => boolean, max = 200) {
    let s = s0;
    for (let i = 0; i < max; i++) {
      if (stop(s)) return s;
      if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
      // A token entering attacking: the first player offered.
      else if (s.pending?.kind === "chooseOption" && s.pending.what === "attackWhom") s = act(s, { type: "chooseOption", player: s.pending.player, choice: s.pending.options[0]! });
      else if (s.pending) throw new Error(`unexpected ${s.pending.kind}`);
      else s = pass(s);
    }
    throw new Error("never");
  }
  function attack(s0: GameState, opp: PlayerId, attackers: ObjectId[]) {
    const s = until(s0, (x) => x.pending?.kind === "declareAttackers");
    return act(s, { type: "declareAttackers", player: s.activePlayer, attacks: attackers.map((attacker) => ({ attacker, defender: opp })) });
  }
  /** Pay {1}{R} from lands and say yes. */
  const payYes = (s: GameState, pid: PlayerId) => act(run(s, planMana(s, pid, parseManaCost("{1}{R}"))), { type: "chooseMay", player: pid, yes: true });
  const isMay = (s: GameState) => s.pending?.kind === "chooseMay";

  it("a creature attacking: pay {1}{R} to put a creature card with lesser mana value from hand onto the battlefield tapped and attacking; it triggers again", () => {
    const { s: s0, ap, opp, ids } = setup([bears(), wurm(), goblin()]);
    const [b, w, g] = ids as [ObjectId, ObjectId, ObjectId];
    putOnBattlefield(s0, ap, arni());
    const hg = putOnBattlefield(s0, ap, giant());
    let s = until(attack(s0, opp, [hg]), isMay);
    expect(pend(s, "chooseMay").pay).toMatchObject({ mana: "{1}{R}" });
    s = payYes(s, ap);
    const p = pend(s, "searchLibrary");
    // Hill Giant's mana value is 4: Craw Wurm (6) doesn't fit.
    expect(p.cards).toEqual(expect.arrayContaining([b, g]));
    expect(p.cards).not.toContain(w);
    s = act(s, { type: "searchLibrary", player: ap, found: [b] });
    if (s.pending?.kind === "chooseOption") s = act(s, { type: "chooseOption", player: ap, choice: String(opp) });
    expect(zone(s, b)).toBe("battlefield");
    expect(s.objects[b]!.tapped).toBe(true);
    expect(s.objects[b]!.attacking).toBe(opp);
    // The Bears entered attacking: Arni triggers again, now for a card with mana value less than 2.
    s = until(s, isMay);
    s = payYes(s, ap);
    const p2 = pend(s, "searchLibrary");
    expect(p2.cards).toEqual([g]);
    s = act(s, { type: "searchLibrary", player: ap, found: [g] });
    if (s.pending?.kind === "chooseOption") s = act(s, { type: "chooseOption", player: ap, choice: String(opp) });
    expect(s.objects[g]!.attacking).toBe(opp);
    // The Goblin's mana value is 1: nothing has less, so declining ends it.
    s = until(s, (x) => isMay(x) || x.step === "combatDamage" || x.step === "endCombat");
    if (isMay(s)) s = act(s, { type: "chooseMay", player: ap, yes: false });
    expect(zone(s, w)).toBe("hand");
  });

  it("declining the payment puts nothing onto the battlefield", () => {
    const { s: s0, ap, opp, ids } = setup([bears()]);
    putOnBattlefield(s0, ap, arni());
    const hg = putOnBattlefield(s0, ap, giant());
    let s = until(attack(s0, opp, [hg]), isMay);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(zone(s, ids[0]!)).toBe("hand");
  });

  it("a token created tapped and attacking triggers it too", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, arni());
    const geistId = putOnBattlefield(s0, ap, geist());
    let s = until(attack(s0, opp, [geistId]), isMay);
    // Geist attacking: the first trigger. Decline it; the Angel token entering attacking triggers it again.
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    s = until(s, (x) => isMay(x) || x.step === "combatDamage" || !x.stack.length && !x.triggerQueue.length && x.battlefield.some((id) => x.objects[id]!.isToken));
    const angel = s.battlefield.find((id) => s.objects[id]!.isToken)!;
    expect(s.objects[angel]!.attacking).toBe(opp);
    s = until(s, (x) => isMay(x) || x.step === "combatDamage");
    expect(isMay(s)).toBe(true);
  });

  it("a ninja put onto the battlefield with ninjutsu enters attacking and triggers it", () => {
    const { s: s0, ap, opp, ids } = setup([ninja()]);
    putOnBattlefield(s0, ap, arni());
    const hg = putOnBattlefield(s0, ap, giant());
    let s = until(attack(s0, opp, [hg]), isMay);
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    s = until(s, (x) => x.step === "declareBlockers" && !x.pending && !x.stack.length && !x.triggerQueue.length && waitingOn(x) === ap);
    s = settle(run(s, planActivate(s, ap, ids[0]!, 0, undefined, undefined, undefined, undefined, { returnToHand: [hg] })));
    expect(s.objects[ids[0]!]!.attacking).toBe(opp);
    expect(zone(s, hg)).toBe("hand");
    expect(isMay(s)).toBe(true);
    // Ninja of the Deep Hours has mana value 2: the Bears from the opening hand don't fit, nothing would.
    expect(pend(s, "chooseMay").pay).toMatchObject({ mana: "{1}{R}" });
  });

  it("a creature entering not attacking doesn't trigger it", () => {
    const { s: s0, ap, ids } = setup([bears()]);
    putOnBattlefield(s0, ap, arni());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(s.pending).toBeNull();
    expect(s.stack.length).toBe(0);
  });

  it("an opponent's creature attacking doesn't trigger it", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, arni());
    const hg = putOnBattlefield(s0, ap, giant());
    const s = until(attack(s0, opp, [hg]), (x) => x.step === "declareBlockers" || isMay(x));
    expect(isMay(s)).toBe(false);
  });
});

describe("round 409: Arni Metalbrow bots", () => {
  /** `attacker` attacks with Arni out; the trigger's question is up. */
  function atMay(hand: CardDef[], attacker: CardDef) {
    const { s: s0, ap, opp, ids } = setup(hand);
    putOnBattlefield(s0, ap, arni());
    const hg = putOnBattlefield(s0, ap, attacker);
    let s = s0;
    for (let i = 0; i < 200 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: hg, defender: opp }] });
    for (let i = 0; i < 50 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    return { s, ap, ids };
  }
  it("pays and puts the card when one fits, and doesn't pay when none does", () => {
    const yes = atMay([bears()], giant());
    const a = botActions(yes.s, yes.ap);
    expect(a.at(-1)).toMatchObject({ type: "chooseMay", yes: true });
    // Raging Goblin's mana value is 1: no card in the hand (Bears, Forests) has less.
    const no = atMay([wurm()], goblin());
    expect(botActions(no.s, no.ap).at(-1)).toMatchObject({ type: "chooseMay", yes: false });
  });
});
