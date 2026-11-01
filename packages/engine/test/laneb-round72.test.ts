// Lane B, round 72: unsupported cards from the bottom of the popularity list (`npm run popular -- --least`): more cards
// exiled with a permanent and what it does with them later (CR 607.2a).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, power, toughness, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PlayerId, type TargetChoice } from "../src";
const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty, answering "you may" with `may`; other questions are answered as the bots would, except `me`'s (it stops there). */
const settle = (s: GameState, opts: { may?: boolean; me?: PlayerId } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && opts.me !== undefined && p.player === opts.me) return s;
    if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: opts.may ?? true });
    else if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets: [] });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Passes priority (stopping at `me`'s questions) until `me` has a question or everything has resolved. */
const passUntilAsked = (s: GameState, me: PlayerId) => {
  s = settle(s, { me });
  for (let i = 0; i < 20 && !s.pending && s.stack.length; i++) s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }), { me });
  return s;
};
/** Plays on (no attacks or blocks, the bots answering other questions) until `stop`. */
const goUntil = (s: GameState, stop: (s: GameState) => boolean) => {
  for (let i = 0; i < 3000; i++) {
    if (stop(s)) return s;
    const p = s.pending;
    const pid = waitingOn(s)!;
    if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: pid });
  }
  throw new Error("never got there");
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const ply = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = [], choices: CostChoices = {}, x?: number) => run(s, planCast(s, pid, id, targets, undefined, "auto", x, choices));
/** Moves a new card for `def` into `pid`'s hand, library (on top), graveyard or exile. */
const toZone = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "library" | "graveyard" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Takes `pid`'s lands off the battlefield and leaves exactly `pool` to pay with. */
const poolOnly = (s: GameState, pid: PlayerId, pool: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  for (const id of s.battlefield.filter((x) => s.objects[x]!.controller === pid && characteristics(s, s.objects[x]!).types.includes("Land"))) {
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "exile";
    s.players[pid]!.exile.push(id);
  }
  s.players[pid]!.manaPool = { ...s.players[pid]!.manaPool, ...pool };
  invalidateCharacteristics(s);
};
/** Ready to attack or tap: not summoning sick. */
const ready = (s: GameState, id: string) => {
  s.objects[id]!.controlledSinceTurn = -1;
  return id;
};
const onField = (s: GameState, name: string) => s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === name)!;

// Real oracle text (Scryfall).
const yggdrasil = (): CardDef => ({"oracleId": "7617a6f7-c83b-4ee5-a681-c7e164456526", "name": "Yggdrasil, Rebirth Engine", "manaCost": "{3}", "cmc": 3, "typeLine": "Legendary Artifact", "supertypes": ["Legendary"], "types": ["Artifact"], "subtypes": [], "oracleText": "When Yggdrasil enters, exile all creature cards from your graveyard.\n{T}: Exile the top three cards of your library.\n{4}, {T}: Put a creature card exiled with Yggdrasil onto the battlefield under your control. It gains haste until end of turn. Activate only as a sorcery.", "colors": [], "colorIdentity": [], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/f/2/f240a9ef-06cd-4c48-ba97-fea1e55f20e2.jpg?1783910964", "artUrl": "https://cards.scryfall.io/art_crop/front/f/2/f240a9ef-06cd-4c48-ba97-fea1e55f20e2.jpg?1783910964", "commanderLegal": "legal", "set": "acr", "releasedAt": "2024-07-05", "rarity": "mythic", "layout": "normal", "gameChanger": false}) as CardDef;
const skyship = (): CardDef => ({"oracleId": "57889a8e-0039-45c2-a608-ab315d51aa3a", "name": "Skyship Weatherlight", "manaCost": "{4}", "cmc": 4, "typeLine": "Legendary Artifact", "supertypes": ["Legendary"], "types": ["Artifact"], "subtypes": [], "oracleText": "When Skyship Weatherlight enters, search your library for any number of artifact and/or creature cards, exile them, then shuffle.\n{4}, {T}: Choose a card at random that was exiled with Skyship Weatherlight. Put that card into its owner's hand.", "colors": [], "colorIdentity": [], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/6/3/63f5498b-bb12-48ec-811b-b52e45ffddaf.jpg?1783945600", "artUrl": "https://cards.scryfall.io/art_crop/front/6/3/63f5498b-bb12-48ec-811b-b52e45ffddaf.jpg?1783945600", "commanderLegal": "legal", "set": "pls", "releasedAt": "2001-02-05", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const bag = (): CardDef => ({"oracleId": "4443345d-a292-4394-97dd-0e6f4d9aedf7", "name": "Bag of Devouring", "manaCost": "{B}", "cmc": 1, "typeLine": "Artifact", "supertypes": [], "types": ["Artifact"], "subtypes": [], "oracleText": "Whenever you sacrifice another nontoken artifact or creature, exile it.\n{2}, {T}, Sacrifice another artifact or creature: Draw a card.\n{3}, {T}, Sacrifice this artifact: Roll a d10. Return up to X cards from among cards exiled with this artifact to their owners' hands, where X is the result.", "colors": ["B"], "colorIdentity": ["B"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/d/1/d183e52b-432d-4b4d-803c-33f7a5f178f1.jpg?1783926251", "artUrl": "https://cards.scryfall.io/art_crop/front/d/1/d183e52b-432d-4b4d-803c-33f7a5f178f1.jpg?1783926251", "commanderLegal": "legal", "set": "afc", "releasedAt": "2021-07-23", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const chemister = (): CardDef => ({"oracleId": "e4a3d6f3-36ba-4e6d-a254-351bc8886f20", "name": "Izzet Chemister", "manaCost": "{2}{R}", "cmc": 3, "typeLine": "Creature — Goblin Wizard", "supertypes": [], "types": ["Creature"], "subtypes": ["Goblin", "Wizard"], "oracleText": "Haste\n{R}, {T}: Exile target instant or sorcery card from your graveyard.\n{1}{R}, {T}, Sacrifice this creature: Cast any number of cards exiled with this creature without paying their mana costs.", "power": "1", "toughness": "3", "colors": ["R"], "colorIdentity": ["R"], "keywords": ["Haste"], "imageUrl": "https://cards.scryfall.io/normal/front/d/d/dd672cb3-40c1-407f-889a-6cd5453067f3.jpg?1783935941", "artUrl": "https://cards.scryfall.io/art_crop/front/d/d/dd672cb3-40c1-407f-889a-6cd5453067f3.jpg?1783935941", "commanderLegal": "legal", "set": "c17", "releasedAt": "2017-08-25", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const bears = (): CardDef => ({"oracleId": "14c8f55d-d177-4c25-a931-ebeb9e6062a0", "name": "Grizzly Bears", "manaCost": "{1}{G}", "cmc": 2, "typeLine": "Creature — Bear", "supertypes": [], "types": ["Creature"], "subtypes": ["Bear"], "oracleText": "", "power": "2", "toughness": "2", "colors": ["G"], "colorIdentity": ["G"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798", "artUrl": "https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798", "commanderLegal": "legal", "set": "slz", "releasedAt": "2026-09-02", "rarity": "common", "layout": "normal", "gameChanger": false}) as CardDef;
const shock = (): CardDef => ({"oracleId": "a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d", "name": "Shock", "manaCost": "{R}", "cmc": 1, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Shock deals 2 damage to any target.", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334", "artUrl": "https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334", "commanderLegal": "legal", "set": "spm", "releasedAt": "2025-09-26", "rarity": "common", "layout": "normal", "gameChanger": false}) as CardDef;
const opt = (): CardDef => ({"oracleId": "713332c1-5bd8-400f-bfff-c1ca0697a043", "name": "Opt", "manaCost": "{U}", "cmc": 1, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card.", "colors": ["U"], "colorIdentity": ["U"], "keywords": ["Scry"], "imageUrl": "https://cards.scryfall.io/normal/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078", "artUrl": "https://cards.scryfall.io/art_crop/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078", "commanderLegal": "legal", "set": "sld", "releasedAt": "2025-07-25", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const divination = (): CardDef => ({"oracleId": "273b339c-964b-4a18-8eb5-ceb8abcdfd9e", "name": "Divination", "manaCost": "{2}{U}", "cmc": 3, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "Draw two cards.", "colors": ["U"], "colorIdentity": ["U"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025", "artUrl": "https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025", "commanderLegal": "legal", "set": "dom", "releasedAt": "2018-04-27", "rarity": "common", "layout": "normal", "gameChanger": false}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId": "a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba", "name": "Ornithopter", "manaCost": "{0}", "cmc": 0, "typeLine": "Artifact Creature — Thopter", "supertypes": [], "types": ["Artifact", "Creature"], "subtypes": ["Thopter"], "oracleText": "Flying", "power": "0", "toughness": "2", "colors": [], "colorIdentity": [], "keywords": ["Flying"], "imageUrl": "https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724", "artUrl": "https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724", "commanderLegal": "legal", "set": "aer", "releasedAt": "2017-01-20", "rarity": "uncommon", "layout": "normal", "gameChanger": false}) as CardDef;

const cloneShell = (): CardDef => ({"oracleId": "94ab7d13-bcd7-419f-9e68-bd8e7ef66d42", "name": "Clone Shell", "manaCost": "{5}", "cmc": 5, "typeLine": "Artifact Creature — Shapeshifter", "supertypes": [], "types": ["Artifact", "Creature"], "subtypes": ["Shapeshifter"], "oracleText": "Imprint — When this creature enters, look at the top four cards of your library, exile one face down, then put the rest on the bottom of your library in any order.\nWhen this creature dies, turn the exiled card face up. If it's a creature card, put it onto the battlefield under your control.", "power": "2", "toughness": "2", "colors": [], "colorIdentity": [], "keywords": ["Imprint"], "imageUrl": "https://cards.scryfall.io/normal/front/c/c/cc386c6c-c27e-4673-96eb-1d004fd71993.jpg?1783941712", "artUrl": "https://cards.scryfall.io/art_crop/front/c/c/cc386c6c-c27e-4673-96eb-1d004fd71993.jpg?1783941712", "commanderLegal": "legal", "set": "som", "releasedAt": "2010-10-01", "rarity": "uncommon", "layout": "normal", "gameChanger": false}) as CardDef;
const egg = (): CardDef => ({"oracleId": "2209ebd4-1131-4b8e-b0f5-aa9506dc0057", "name": "Summoner's Egg", "manaCost": "{4}", "cmc": 4, "typeLine": "Artifact Creature — Egg", "supertypes": [], "types": ["Artifact", "Creature"], "subtypes": ["Egg"], "oracleText": "Imprint — When this creature enters, you may exile a card from your hand face down.\nWhen this creature dies, turn the exiled card face up. If it's a creature card, put it onto the battlefield under your control.", "power": "0", "toughness": "4", "colors": [], "colorIdentity": [], "keywords": ["Imprint"], "imageUrl": "https://cards.scryfall.io/normal/front/3/5/3581ac02-5dab-423a-9cf3-275d9203f26d.jpg?1783944372", "artUrl": "https://cards.scryfall.io/art_crop/front/3/5/3581ac02-5dab-423a-9cf3-275d9203f26d.jpg?1783944372", "commanderLegal": "legal", "set": "5dn", "releasedAt": "2004-06-04", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const murderDef = (): CardDef => ({"oracleId": "938b4e2c-88d9-4637-bc00-e228920c9a78", "name": "Murder", "manaCost": "{1}{B}{B}", "cmc": 3, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Destroy target creature.", "colors": ["B"], "colorIdentity": ["B"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477", "artUrl": "https://cards.scryfall.io/art_crop/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477", "commanderLegal": "legal", "set": "dsk", "releasedAt": "2024-09-27", "rarity": "common", "layout": "normal", "gameChanger": false}) as CardDef;

const aven = (): CardDef => ({"oracleId": "176c0ca2-0ca1-45e2-8412-86de5dbead48", "name": "Aven Mimeomancer", "manaCost": "{1}{W}{U}", "cmc": 3, "typeLine": "Creature — Bird Wizard", "supertypes": [], "types": ["Creature"], "subtypes": ["Bird", "Wizard"], "oracleText": "Flying\nAt the beginning of your upkeep, you may put a feather counter on target creature. If you do, that creature has base power and toughness 3/1 and has flying for as long as it has a feather counter on it.", "power": "3", "toughness": "1", "colors": ["U", "W"], "colorIdentity": ["U", "W"], "keywords": ["Flying"], "imageUrl": "https://cards.scryfall.io/normal/front/4/9/49876185-e23d-4137-8612-1347da3a1df6.jpg?1783942442", "artUrl": "https://cards.scryfall.io/art_crop/front/4/9/49876185-e23d-4137-8612-1347da3a1df6.jpg?1783942442", "commanderLegal": "legal", "set": "arb", "releasedAt": "2009-04-30", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const fireheart = (): CardDef => ({"oracleId": "c3b3e070-28f6-4852-816e-caffe358b6fe", "name": "Obsidian Fireheart", "manaCost": "{1}{R}{R}{R}", "cmc": 4, "typeLine": "Creature — Elemental", "supertypes": [], "types": ["Creature"], "subtypes": ["Elemental"], "oracleText": "{1}{R}{R}: Put a blaze counter on target land without a blaze counter on it. For as long as that land has a blaze counter on it, it has \"At the beginning of your upkeep, this land deals 1 damage to you.\" (The land continues to burn after this creature has left the battlefield.)", "power": "4", "toughness": "4", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/1/f/1fbf7e23-5610-45d7-a273-923433d10934.jpg?1783942141", "artUrl": "https://cards.scryfall.io/art_crop/front/1/f/1fbf7e23-5610-45d7-a273-923433d10934.jpg?1783942141", "commanderLegal": "legal", "set": "zen", "releasedAt": "2009-10-02", "rarity": "mythic", "layout": "normal", "gameChanger": false}) as CardDef;
const xira = (): CardDef => ({"oracleId": "18d0e6e1-3824-465d-9245-21e0174f551f", "name": "Xira, the Golden Sting", "manaCost": "{1}{B}{R}{G}", "cmc": 4, "typeLine": "Legendary Creature — Insect Assassin", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Insect", "Assassin"], "oracleText": "Flying, haste\nWhenever Xira attacks, put an egg counter on another target creature without an egg counter on it. When that creature dies, if it has an egg counter on it, draw a card and create a 1/1 black Insect creature token with flying.", "power": "3", "toughness": "3", "colors": ["B", "G", "R"], "colorIdentity": ["B", "G", "R"], "keywords": ["Flying", "Haste"], "imageUrl": "https://cards.scryfall.io/normal/front/4/8/48e60dff-8ac0-4e70-a7a8-a177e9e6847b.jpg?1783921457", "artUrl": "https://cards.scryfall.io/art_crop/front/4/8/48e60dff-8ac0-4e70-a7a8-a177e9e6847b.jpg?1783921457", "commanderLegal": "legal", "set": "dmc", "releasedAt": "2022-09-09", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const amy = (): CardDef => ({"oracleId": "aa7d3e99-fc14-4f62-bf00-c0428c11e4f2", "name": "Amy Pond", "manaCost": "{2}{R}", "cmc": 3, "typeLine": "Legendary Creature — Human", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Human"], "oracleText": "Partner with Rory Williams (When this creature enters, target player may put Rory into their hand from their library, then shuffle.)\nWhenever Amy Pond deals combat damage to a player, choose a suspended card you own and remove that many time counters from it.\nDoctor's companion (You can have two commanders if the other is the Doctor.)", "power": "2", "toughness": "2", "colors": ["R"], "colorIdentity": ["R"], "keywords": ["Partner with", "Partner", "Doctor's companion"], "imageUrl": "https://cards.scryfall.io/normal/front/e/5/e50a2faa-91e3-4e89-ba8d-2cbf7ac005c0.jpg?1783914655", "artUrl": "https://cards.scryfall.io/art_crop/front/e/5/e50a2faa-91e3-4e89-ba8d-2cbf7ac005c0.jpg?1783914655", "commanderLegal": "legal", "set": "who", "releasedAt": "2023-10-13", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const vision = (): CardDef => ({"oracleId": "9728dec9-d482-4c7a-8cdc-44d010dc878d", "name": "Ancestral Vision", "manaCost": "", "cmc": 0, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "Suspend 4—{U} (Rather than cast this card from your hand, pay {U} and exile it with four time counters on it. At the beginning of your upkeep, remove a time counter. When the last is removed, you may cast it without paying its mana cost.)\nTarget player draws three cards.", "colors": ["U"], "colorIdentity": ["U"], "keywords": ["Suspend"], "imageUrl": "https://cards.scryfall.io/normal/front/a/5/a5dc736d-7e61-4909-973f-61f7adb82b64.jpg?1783935551", "artUrl": "https://cards.scryfall.io/art_crop/front/a/5/a5dc736d-7e61-4909-973f-61f7adb82b64.jpg?1783935551", "commanderLegal": "legal", "set": "ima", "releasedAt": "2017-11-17", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const giant = (): CardDef => ({"oracleId": "342199e0-15b6-4824-83da-25caef2592b3", "name": "Hill Giant", "manaCost": "{3}{R}", "cmc": 4, "typeLine": "Creature — Giant", "supertypes": [], "types": ["Creature"], "subtypes": ["Giant"], "oracleText": "", "power": "3", "toughness": "3", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018", "artUrl": "https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018", "commanderLegal": "legal", "set": "10e", "releasedAt": "2007-07-13", "rarity": "common", "layout": "normal", "gameChanger": false}) as CardDef;
const mountain = (): CardDef => ({"oracleId": "a3fb7228-e76b-4e96-a40e-20b5fed75685", "name": "Mountain", "manaCost": "", "cmc": 0, "typeLine": "Basic Land — Mountain", "supertypes": ["Basic"], "types": ["Land"], "subtypes": ["Mountain"], "oracleText": "({T}: Add {R}.)", "colors": [], "colorIdentity": ["R"], "keywords": [], "producedMana": ["R"], "imageUrl": "https://cards.scryfall.io/normal/front/2/a/2a844b96-6616-4c39-8f4f-5d14a3b2bd55.jpg?1785981666", "artUrl": "https://cards.scryfall.io/art_crop/front/2/a/2a844b96-6616-4c39-8f4f-5d14a3b2bd55.jpg?1785981666", "commanderLegal": "legal", "set": "trk", "releasedAt": "2026-11-13", "rarity": "common", "layout": "normal", "gameChanger": false}) as CardDef;

const contempt = (): CardDef => ({"oracleId": "831623c9-8279-439e-a42b-ac47cacdb058", "name": "Tolarian Contempt", "manaCost": "{3}{U}{U}", "cmc": 5, "typeLine": "Enchantment", "supertypes": [], "types": ["Enchantment"], "subtypes": [], "oracleText": "When this enchantment enters, put a rejection counter on each creature your opponents control.\nAt the beginning of your end step, for each opponent, choose up to one target creature they control with a rejection counter on it. That creature's owner puts it on their choice of the top or bottom of their library.", "colors": ["U"], "colorIdentity": ["U"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/1/5/153dfc34-767e-4df2-a1dc-4361e94d65ed.jpg?1783916433", "artUrl": "https://cards.scryfall.io/art_crop/front/1/5/153dfc34-767e-4df2-a1dc-4361e94d65ed.jpg?1783916433", "commanderLegal": "legal", "set": "mat", "releasedAt": "2023-05-12", "rarity": "uncommon", "layout": "normal", "gameChanger": false}) as CardDef;

const rona = (): CardDef => ({"oracleId": "409305b3-5373-4376-8096-c04a73184cef", "name": "Rona, Disciple of Gix", "manaCost": "{1}{U}{B}", "cmc": 3, "typeLine": "Legendary Creature — Human Artificer", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Human", "Artificer"], "oracleText": "When Rona enters, you may exile target historic card from your graveyard. (Artifacts, legendaries, and Sagas are historic.)\nYou may cast spells from among cards exiled with Rona.\n{4}, {T}: Exile the top card of your library.", "power": "2", "toughness": "2", "colors": ["B", "U"], "colorIdentity": ["B", "U"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/4/5/45420f5e-f7f8-4db7-9b54-e2fa1be22094.jpg?1783934964", "artUrl": "https://cards.scryfall.io/art_crop/front/4/5/45420f5e-f7f8-4db7-9b54-e2fa1be22094.jpg?1783934964", "commanderLegal": "legal", "set": "dom", "releasedAt": "2018-04-27", "rarity": "uncommon", "layout": "normal", "gameChanger": false}) as CardDef;
const cloister = (): CardDef => ({"oracleId": "1fd5e5e7-f23d-4891-86c4-268195ea09fc", "name": "Bottled Cloister", "manaCost": "{4}", "cmc": 4, "typeLine": "Artifact", "supertypes": [], "types": ["Artifact"], "subtypes": [], "oracleText": "At the beginning of each opponent's upkeep, exile all cards from your hand face down.\nAt the beginning of your upkeep, return all cards you own exiled with this artifact to your hand, then draw a card.", "colors": [], "colorIdentity": [], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/5/b/5bf42acc-d2d3-4165-b257-6885df2d1ba4.jpg?1783943601", "artUrl": "https://cards.scryfall.io/art_crop/front/5/b/5bf42acc-d2d3-4165-b257-6885df2d1ba4.jpg?1783943601", "commanderLegal": "legal", "set": "rav", "releasedAt": "2005-10-07", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const roads = (): CardDef => ({"oracleId": "3cd3cdc9-2ed2-4cdf-b58a-12c3a2ef218b", "name": "Roads Go Ever, Ever On", "manaCost": "{1}{W}", "cmc": 2, "typeLine": "Enchantment — Saga", "supertypes": [], "types": ["Enchantment"], "subtypes": ["Saga"], "oracleText": "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after IV.)\nI — Search your library for up to two basic Plains cards, exile them, then shuffle. You gain 2 life.\nII, III — Put a card exiled with this Saga into its owner's hand.\nIV — Whenever you attack this turn, target creature you control gets +1/+1 until end of turn for each Plains you control.", "colors": ["W"], "colorIdentity": ["W"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/b/3/b3c1ebd6-967f-4b8c-8f1f-442ce8c1da24.jpg?1784673434", "artUrl": "https://cards.scryfall.io/art_crop/front/b/3/b3c1ebd6-967f-4b8c-8f1f-442ce8c1da24.jpg?1784673434", "commanderLegal": "legal", "set": "hob", "releasedAt": "2026-08-14", "rarity": "rare", "layout": "saga", "gameChanger": false}) as CardDef;
const plains = (): CardDef => ({"oracleId": "bc71ebf6-2056-41f7-be35-b2e5c34afa99", "name": "Plains", "manaCost": "", "cmc": 0, "typeLine": "Basic Land — Plains", "supertypes": ["Basic"], "types": ["Land"], "subtypes": ["Plains"], "oracleText": "({T}: Add {W}.)", "colors": [], "colorIdentity": ["W"], "keywords": [], "producedMana": ["W"], "imageUrl": "https://cards.scryfall.io/normal/front/0/9/09b3c8bb-10ca-4b9f-8507-db6e8c52a918.jpg?1785981636", "artUrl": "https://cards.scryfall.io/art_crop/front/0/9/09b3c8bb-10ca-4b9f-8507-db6e8c52a918.jpg?1785981636", "commanderLegal": "legal", "set": "trk", "releasedAt": "2026-11-13", "rarity": "common", "layout": "normal", "gameChanger": false}) as CardDef;
const relic = (): CardDef => ({"oracleId": "2bda1fb1-528c-4e66-89f1-bb1a85e9181e", "name": "Darksteel Relic", "manaCost": "{0}", "cmc": 0, "typeLine": "Artifact", "supertypes": [], "types": ["Artifact"], "subtypes": [], "oracleText": "Indestructible (Effects that say \"destroy\" don't destroy this artifact.)", "colors": [], "colorIdentity": [], "keywords": ["Indestructible"], "imageUrl": "https://cards.scryfall.io/normal/front/0/f/0fd8c918-62d9-41be-a3e1-32ddac71b7e7.jpg?1783941297", "artUrl": "https://cards.scryfall.io/art_crop/front/0/f/0fd8c918-62d9-41be-a3e1-32ddac71b7e7.jpg?1783941297", "commanderLegal": "legal", "set": "nph", "releasedAt": "2011-05-13", "rarity": "uncommon", "layout": "normal", "gameChanger": false}) as CardDef;
const island = (): CardDef => ({"oracleId": "b2c6aa39-2d2a-459c-a555-fb48ba993373", "name": "Island", "manaCost": "", "cmc": 0, "typeLine": "Basic Land — Island", "supertypes": ["Basic"], "types": ["Land"], "subtypes": ["Island"], "oracleText": "({T}: Add {U}.)", "colors": [], "colorIdentity": ["U"], "keywords": [], "producedMana": ["U"], "imageUrl": "https://cards.scryfall.io/normal/front/a/4/a44efa5f-8fbb-43e0-adc4-d05f4be6b9a6.jpg?1785981646", "artUrl": "https://cards.scryfall.io/art_crop/front/a/4/a44efa5f-8fbb-43e0-adc4-d05f4be6b9a6.jpg?1785981646", "commanderLegal": "legal", "set": "trk", "releasedAt": "2026-11-13", "rarity": "common", "layout": "normal", "gameChanger": false}) as CardDef;

describe("Lane B round 72: cards exiled with a permanent", () => {
  it("Yggdrasil, Rebirth Engine: a creature card either of its exile abilities exiled, onto the battlefield with haste until end of turn", () => {
    const { s: s0, ap } = setup([]);
    supported(yggdrasil());
    const b = toZone(s0, ap, bears(), "graveyard");
    const sh = toZone(s0, ap, shock(), "graveyard");
    const o = toZone(s0, ap, ornithopter(), "library");
    const other = toZone(s0, ap, bears(), "exile");
    const y0 = toZone(s0, ap, yggdrasil(), "hand");
    poolOnly(s0, ap, { C: 3 });
    let s = castNow(s0, ap, y0);
    s = settle(s);
    // Its enters ability: the creature cards only.
    expect(zone(s, b)).toBe("exile");
    expect(zone(s, sh)).toBe("graveyard");
    const y = ready(s, onField(s, "Yggdrasil, Rebirth Engine"));
    s = run(s, planActivate(s, ap, y, 0, []));
    s = settle(s);
    expect(zone(s, o)).toBe("exile");
    s.objects[y]!.tapped = false;
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, C: 4 };
    s = run(s, planActivate(s, ap, y, 1, []));
    s = passUntilAsked(s, ap);
    expect(s.pending?.kind).toBe("searchLibrary");
    const p = s.pending as Extract<GameState["pending"], { kind: "searchLibrary" }>;
    // Both abilities' cards (CR 607.2a), not the Bears exiled some other way.
    expect(p.cards).toEqual(expect.arrayContaining([b, o]));
    expect(p.cards).not.toContain(other);
    s = act(s, { type: "searchLibrary", player: ap, found: [o] });
    s = settle(s);
    expect(zone(s, o)).toBe("battlefield");
    expect(s.objects[o]!.controller).toBe(ap);
    expect(objHasKeyword(s, s.objects[o]!, "Haste")).toBe(true);
    expect(zone(s, b)).toBe("exile");
    // Until end of turn only.
    s = goUntil(s, (st) => st.activePlayer !== ap);
    expect(objHasKeyword(s, s.objects[o]!, "Haste")).toBe(false);
  });

  it("Skyship Weatherlight: exiles artifact and creature cards it finds; one of them at random goes to your hand", () => {
    const { s: s0, ap } = setup([]);
    supported(skyship());
    const o = toZone(s0, ap, ornithopter(), "library");
    const b = toZone(s0, ap, bears(), "library");
    const other = toZone(s0, ap, bears(), "exile");
    const w0 = toZone(s0, ap, skyship(), "hand");
    poolOnly(s0, ap, { C: 4 });
    let s = castNow(s0, ap, w0);
    s = passUntilAsked(s, ap);
    expect(s.pending?.kind).toBe("searchLibrary");
    s = act(s, { type: "searchLibrary", player: ap, found: [o, b] });
    s = settle(s);
    expect(zone(s, o)).toBe("exile");
    expect(zone(s, b)).toBe("exile");
    const w = ready(s, onField(s, "Skyship Weatherlight"));
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, C: 8 };
    s = run(s, planActivate(s, ap, w, 0, []));
    s = settle(s);
    expect([o, b].filter((id) => zone(s, id) === "hand")).toHaveLength(1);
    s.objects[w]!.tapped = false;
    s = run(s, planActivate(s, ap, w, 0, []));
    s = settle(s);
    expect(zone(s, o)).toBe("hand");
    expect(zone(s, b)).toBe("hand");
    // Never the Bears exiled some other way.
    s.objects[w]!.tapped = false;
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, C: 4 };
    s = run(s, planActivate(s, ap, w, 0, []));
    s = settle(s);
    expect(zone(s, other)).toBe("exile");
  });

  it("Bag of Devouring: exiles what you sacrifice; sacrificed, rolls a d10 and returns up to that many of them to their owners' hands", () => {
    const { s: s0, ap } = setup([]);
    supported(bag());
    const g = putOnBattlefield(s0, ap, bag());
    const b = putOnBattlefield(s0, ap, bears());
    const o = putOnBattlefield(s0, ap, ornithopter());
    const other = toZone(s0, ap, bears(), "exile");
    poolOnly(s0, ap, { C: 2 });
    ready(s0, g);
    let s = run(s0, planActivate(s0, ap, g, 0, [], undefined, undefined, undefined, { sacrifice: [b] }));
    s = settle(s);
    expect(zone(s, b)).toBe("exile");
    s.objects[g]!.tapped = false;
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, C: 2 };
    s = run(s, planActivate(s, ap, g, 0, [], undefined, undefined, undefined, { sacrifice: [o] }));
    s = settle(s);
    expect(zone(s, o)).toBe("exile");
    s.objects[g]!.tapped = false;
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, C: 3 };
    s = run(s, planActivate(s, ap, g, 1, []));
    expect(zone(s, g)).toBe("graveyard");
    s = passUntilAsked(s, ap);
    expect(s.pending?.kind).toBe("searchLibrary");
    const p = s.pending as Extract<GameState["pending"], { kind: "searchLibrary" }>;
    expect(p.cards).toEqual(expect.arrayContaining([b, o]));
    expect(p.cards).not.toContain(other);
    expect(p.min).toBe(0);
    const rolled = s.resolving!.rolled!.result!;
    expect(rolled).toBeGreaterThanOrEqual(1);
    expect(p.max).toBe(Math.min(2, rolled));
    s = act(s, { type: "searchLibrary", player: ap, found: [b] });
    s = settle(s);
    expect(zone(s, b)).toBe("hand");
    expect(zone(s, o)).toBe("exile");
  });

  it("Izzet Chemister: cast any number of the instants and sorceries it exiled, free, as the ability resolves (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    supported(chemister());
    const c = ready(s0, putOnBattlefield(s0, ap, chemister()));
    const sh = toZone(s0, ap, shock(), "graveyard");
    const d = toZone(s0, ap, divination(), "graveyard");
    const other = toZone(s0, ap, shock(), "exile");
    poolOnly(s0, ap, { R: 1 });
    let s = run(s0, planActivate(s0, ap, c, 0, [tgt(sh)]));
    s = settle(s);
    expect(zone(s, sh)).toBe("exile");
    s.objects[c]!.tapped = false;
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, R: 1 };
    s = run(s, planActivate(s, ap, c, 0, [tgt(d)]));
    s = settle(s);
    expect(zone(s, d)).toBe("exile");
    s.objects[c]!.tapped = false;
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, R: 1, C: 1 };
    const hand = s.players[ap]!.hand.length;
    s = run(s, planActivate(s, ap, c, 1, []));
    expect(zone(s, c)).toBe("graveyard");
    s = passUntilAsked(s, ap);
    const casts: string[] = [];
    for (let i = 0; i < 6 && s.pending && s.pending.player === ap; i++) {
      const p = s.pending;
      if (p.kind === "chooseOption") {
        expect(p.options).not.toContain(other);
        const pick = (p.options as string[]).find((x) => !casts.includes(x))!;
        casts.push(pick);
        s = act(s, { type: "chooseOption", player: ap, choice: pick });
      } else if (p.kind === "castFree") {
        const id = casts[casts.length - 1]!;
        s = run(s, planCast(s, ap, id, id === sh ? [ply(opp)] : []));
      } else break;
    }
    expect(casts.sort()).toEqual([sh, d].sort());
    s = settle(s);
    expect(life(s, opp)).toBe(40 - 2);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(zone(s, other)).toBe("exile");
  });

  it("Clone Shell: one of the top four exiled face down, the rest on the bottom in your order; when it dies, a creature card comes back", () => {
    const { s: s0, ap, opp } = setup([]);
    supported(cloneShell());
    const lib = [shock(), bears(), opt(), divination()].map((d) => toZone(s0, ap, d, "library"));
    const c0 = toZone(s0, ap, cloneShell(), "hand");
    poolOnly(s0, ap, { C: 5 });
    let s = castNow(s0, ap, c0);
    s = passUntilAsked(s, ap);
    expect(s.pending?.kind).toBe("searchLibrary");
    const p = s.pending as Extract<GameState["pending"], { kind: "searchLibrary" }>;
    expect(p.cards.sort()).toEqual([...lib].sort());
    expect(p.min).toBe(1);
    const bear = lib[1]!;
    s = act(s, { type: "searchLibrary", player: ap, found: [bear] });
    expect(zone(s, bear)).toBe("exile");
    expect(s.objects[bear]!.hiddenExile).toBeTruthy();
    expect(s.pending?.kind).toBe("arrangeTop");
    const rest = lib.filter((id) => id !== bear);
    s = act(s, { type: "arrangeTop", player: ap, top: [rest[2]!, rest[0]!, rest[1]!], away: [] });
    s = settle(s);
    const library = s.players[ap]!.library;
    expect(library.slice(-3)).toEqual([rest[2]!, rest[0]!, rest[1]!]);
    // It dies: the Bears are turned face up and come back under your control.
    const shell = onField(s, "Clone Shell");
    const m = toZone(s, ap, murderDef(), "hand");
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, B: 3 };
    s = run(s, planCast(s, ap, m, [tgt(shell)]));
    s = settle(s);
    expect(zone(s, shell)).toBe("graveyard");
    expect(zone(s, bear)).toBe("battlefield");
    expect(s.objects[bear]!.controller).toBe(ap);
  });

  it("Summoner's Egg: a card from your hand face down; a noncreature card stays exiled face up when it dies (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    supported(egg());
    const d = toZone(s0, ap, divination(), "hand");
    const e0 = toZone(s0, ap, egg(), "hand");
    poolOnly(s0, ap, { C: 4 });
    let s = castNow(s0, ap, e0);
    s = passUntilAsked(s, ap);
    if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending?.kind).toBe("searchLibrary");
    s = act(s, { type: "searchLibrary", player: ap, found: [d] });
    s = settle(s);
    expect(zone(s, d)).toBe("exile");
    expect(s.objects[d]!.hiddenExile).toBeTruthy();
    const egg1 = onField(s, "Summoner's Egg");
    const m = toZone(s, ap, murderDef(), "hand");
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, B: 3 };
    s = run(s, planCast(s, ap, m, [tgt(egg1)]));
    s = settle(s);
    expect(zone(s, egg1)).toBe("graveyard");
    expect(zone(s, d)).toBe("exile");
    expect(s.objects[d]!.hiddenExile).toBeUndefined();
  });
});

/** On to `pid`'s declare attackers step and attacks with `attackers` (at `defender`), then the triggers wait. */
const attack = (s: GameState, pid: PlayerId, attackers: string[], defender: PlayerId) => {
  s = goUntil(s, (st) => st.pending?.kind === "declareAttackers" && st.activePlayer === pid);
  return act(s, { type: "declareAttackers", player: pid, attacks: attackers.map((a) => ({ attacker: a, defender })) });
};
/** Destroys `id` with a Murder cast by `pid` (who has priority). */
const murder = (s: GameState, pid: PlayerId, id: string) => {
  const m = toZone(s, pid, murderDef(), "hand");
  s.players[pid]!.manaPool = { ...s.players[pid]!.manaPool, B: 3 };
  return settle(run(s, planCast(s, pid, m, [tgt(id)])));
};

describe("Lane B round 72: effects that last while a counter stays, and suspended cards", () => {
  it("Aven Mimeomancer: a feather counter makes the target a 3/1 flier for as long as it has one, even after the Aven leaves (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    supported(aven());
    const a = putOnBattlefield(s0, ap, aven());
    const g = putOnBattlefield(s0, opp, giant());
    s0.players[ap]!.hand = [];
    let s = goUntil(s0, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === ap);
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(g)] });
    s = settle(s, { may: true });
    expect(s.objects[g]!.counters.feather).toBe(1);
    expect([power(s, s.objects[g]!), toughness(s, s.objects[g]!)]).toEqual([3, 1]);
    expect(objHasKeyword(s, s.objects[g]!, "Flying")).toBe(true);
    // The Aven leaves: it lasts.
    s = murder(s, ap, a);
    expect(zone(s, a)).toBe("graveyard");
    expect([power(s, s.objects[g]!), toughness(s, s.objects[g]!)]).toEqual([3, 1]);
    // The counter goes: it ends, and doesn't come back with a new feather counter from elsewhere (CR 611.2b).
    delete s.objects[g]!.counters.feather;
    invalidateCharacteristics(s);
    s = murder(s, ap, putOnBattlefield(s, ap, bears()));
    expect([power(s, s.objects[g]!), toughness(s, s.objects[g]!)]).toEqual([3, 3]);
    expect(objHasKeyword(s, s.objects[g]!, "Flying")).toBe(false);
    s.objects[g]!.counters.feather = 1;
    invalidateCharacteristics(s);
    expect([power(s, s.objects[g]!), toughness(s, s.objects[g]!)]).toEqual([3, 3]);
  });

  it("Aven Mimeomancer: declining puts no counter and changes nothing", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, aven());
    const g = putOnBattlefield(s0, opp, giant());
    s0.players[ap]!.hand = [];
    let s = goUntil(s0, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === ap);
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(g)] });
    s = settle(s, { may: false });
    expect(s.objects[g]!.counters.feather ?? 0).toBe(0);
    expect([power(s, s.objects[g]!), toughness(s, s.objects[g]!)]).toEqual([3, 3]);
  });

  it("Obsidian Fireheart: a land with a blaze counter deals 1 damage to its controller each of their upkeeps, after the Fireheart is gone (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    supported(fireheart());
    const f = putOnBattlefield(s0, ap, fireheart());
    const land = putOnBattlefield(s0, opp, mountain());
    poolOnly(s0, ap, { R: 3 });
    let s = run(s0, planActivate(s0, ap, f, 0, [tgt(land)]));
    s = settle(s);
    expect(s.objects[land]!.counters.blaze).toBe(1);
    // A land with a blaze counter can't be targeted again (rulings).
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, R: 3 };
    expect(planActivate(s, ap, f, 0, [tgt(land)])).toBeNull();
    s = murder(s, ap, f);
    const before = life(s, opp);
    s = goUntil(s, (st) => st.activePlayer === opp && st.step === "draw");
    expect(life(s, opp)).toBe(before - 1);
    expect(life(s, ap)).toBe(40);
  });

  it("Xira, the Golden Sting: the creature with its egg counter dies, even after Xira is gone (rulings): draw a card and a 1/1 flying Insect", () => {
    const { s: s0, ap, opp } = setup([]);
    supported(xira());
    const x = ready(s0, putOnBattlefield(s0, ap, xira()));
    const g = putOnBattlefield(s0, opp, giant());
    s0.players[ap]!.hand = [];
    let s = attack(s0, ap, [x], opp);
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind).toBe("chooseTargets");
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(g)] });
    s = settle(s);
    expect(s.objects[g]!.counters.egg).toBe(1);
    s = goUntil(s, (st) => st.step === "main2" && !st.stack.length && !st.pending);
    s = murder(s, ap, x);
    const hand = s.players[ap]!.hand.length;
    s = murder(s, ap, g);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    const insects = s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Insect"));
    expect(insects).toHaveLength(1);
    expect(s.objects[insects[0]!]!.controller).toBe(ap);
  });

  it("Xira, the Golden Sting: no egg counter left as it dies, nothing happens (CR 603.4)", () => {
    const { s: s0, ap, opp } = setup([]);
    const x = ready(s0, putOnBattlefield(s0, ap, xira()));
    const g = putOnBattlefield(s0, opp, giant());
    s0.players[ap]!.hand = [];
    let s = attack(s0, ap, [x], opp);
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(g)] });
    s = settle(s);
    s = goUntil(s, (st) => st.step === "main2" && !st.stack.length && !st.pending);
    delete s.objects[g]!.counters.egg;
    const hand = s.players[ap]!.hand.length;
    const seq = s.log[s.log.length - 1]!.seq;
    s = murder(s, ap, g);
    // It doesn't trigger at all (CR 603.4).
    const after = s.log.filter((l) => l.seq > seq).map((l) => l.text);
    expect(after.some((l) => /Murder destroys Hill Giant/.test(l))).toBe(true);
    expect(after.some((l) => /triggers/.test(l))).toBe(false);
    expect(zone(s, g)).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(s.battlefield.some((id) => id !== x && characteristics(s, s.objects[id]!).subtypes.includes("Insect"))).toBe(false);
  });

  it("Amy Pond: combat damage removes that many time counters from a suspended card you own, chosen as it resolves", () => {
    const { s: s0, ap, opp } = setup([]);
    supported(amy());
    const a = ready(s0, putOnBattlefield(s0, ap, amy()));
    const v = toZone(s0, ap, vision(), "exile");
    s0.objects[v]!.counters.time = 3;
    const notMine = toZone(s0, opp, vision(), "exile");
    s0.objects[notMine]!.counters.time = 3;
    s0.players[ap]!.hand = [];
    let s = attack(s0, ap, [a], opp);
    s = goUntil(s, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === ap);
    const p = s.pending as Extract<GameState["pending"], { kind: "searchLibrary" }>;
    expect(p.cards).toEqual([v]);
    s = act(s, { type: "searchLibrary", player: ap, found: [v] });
    s = settle(s);
    expect(life(s, opp)).toBe(40 - 2);
    expect(s.objects[v]!.counters.time).toBe(1);
    expect(s.objects[notMine]!.counters.time).toBe(3);
  });

  it("Amy Pond: removing the last time counter casts the card (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = ready(s0, putOnBattlefield(s0, ap, amy()));
    const v = toZone(s0, ap, vision(), "exile");
    s0.objects[v]!.counters.time = 1;
    s0.players[ap]!.hand = [];
    let s = attack(s0, ap, [a], opp);
    s = goUntil(s, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === ap);
    s = act(s, { type: "searchLibrary", player: ap, found: [v] });
    s = settle(s, { may: true });
    expect(s.objects[v]!.counters.time ?? 0).toBe(0);
    expect(zone(s, v)).not.toBe("exile");
  });

  it("Tolarian Contempt: rejection counters on opponents' creatures; at your end step, up to one of each opponent's goes on top or bottom of its owner's library", () => {
    const { s: s0, ap } = setup([]);
    supported(contempt());
    const opps = [1, 2, 3].map((k) => s0.turnOrder[(s0.turnOrder.indexOf(ap) + k) % 4]!);
    const g1 = putOnBattlefield(s0, opps[0]!, giant());
    const g2 = putOnBattlefield(s0, opps[1]!, giant());
    const g3 = putOnBattlefield(s0, opps[2]!, giant());
    const c0 = toZone(s0, ap, contempt(), "hand");
    poolOnly(s0, ap, { U: 2, C: 3 });
    s0.players[ap]!.hand = [c0];
    let s = settle(castNow(s0, ap, c0));
    for (const g of [g1, g2, g3]) expect(s.objects[g]!.counters.rejection).toBe(1);
    // One that came later has none, and can't be chosen.
    const late = putOnBattlefield(s, opps[0]!, bears());
    s = goUntil(s, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === ap);
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(g1), { kind: "none" }, tgt(g3)] });
    s = settle(s);
    expect(zone(s, g1)).toBe("library");
    expect(zone(s, g2)).toBe("battlefield");
    expect(zone(s, g3)).toBe("library");
    expect(zone(s, late)).toBe("battlefield");
    const lib = s.players[opps[0]!]!.library;
    expect(lib[0] === g1 || lib[lib.length - 1] === g1).toBe(true);
  });
});

describe("Lane B round 72: casting and returning cards exiled with a permanent", () => {
  it("Rona, Disciple of Gix: cast spells from among the cards both its abilities exiled, not a land and not another card; not once Rona has left", () => {
    const { s: s0, ap } = setup([]);
    supported(rona());
    const rel = toZone(s0, ap, relic(), "graveyard");
    const isl = toZone(s0, ap, island(), "library");
    const div = toZone(s0, ap, divination(), "library");
    const other = toZone(s0, ap, opt(), "exile");
    const r0 = toZone(s0, ap, rona(), "hand");
    poolOnly(s0, ap, { U: 1, B: 1, C: 1 });
    let s = passUntilAsked(castNow(s0, ap, r0), ap);
    expect(s.pending?.kind).toBe("chooseTargets");
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(rel)] });
    s = settle(s, { may: true });
    expect(zone(s, rel)).toBe("exile");
    const r = ready(s, onField(s, "Rona, Disciple of Gix"));
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, C: 4 };
    s = settle(run(s, planActivate(s, ap, r, 0, [])));
    expect(zone(s, div)).toBe("exile");
    s.objects[r]!.tapped = false;
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, C: 4 };
    s = settle(run(s, planActivate(s, ap, r, 0, [])));
    expect(zone(s, isl)).toBe("exile");
    // Spells only: the Island can't be played (CR 305.9 / "cast spells").
    expect(s.players[ap]!.landsPlayedThisTurn).toBe(0);
    expect(() => act(s, { type: "playLand", player: ap, objectId: isl })).toThrow();
    // A card exiled some other way can't be cast.
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, U: 1 };
    expect(planCast(s, ap, other, [])).toBeNull();
    // Both abilities' cards can, paying their costs.
    s = settle(castNow(s, ap, rel));
    expect(zone(s, rel)).toBe("battlefield");
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, U: 1, C: 2 };
    s = settle(castNow(s, ap, div));
    expect(zone(s, div)).toBe("graveyard");
    // Once Rona leaves, the rest stay exiled for good (rulings).
    const o2 = toZone(s, ap, opt(), "library");
    s.objects[r]!.tapped = false;
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, C: 4 };
    s = settle(run(s, planActivate(s, ap, r, 0, [])));
    expect(zone(s, o2)).toBe("exile");
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, U: 1 };
    expect(planCast(s, ap, o2, [])).not.toBeNull();
    s = murder(s, ap, r);
    expect(zone(s, r)).toBe("graveyard");
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, U: 1 };
    expect(planCast(s, ap, o2, [])).toBeNull();
  });

  it("Bottled Cloister: exiles your hand face down at each opponent's upkeep; at your upkeep returns only the cards you own (errata), then you draw", () => {
    const { s: s0, ap, opp } = setup([]);
    supported(cloister());
    const cl = putOnBattlefield(s0, ap, cloister());
    const a = toZone(s0, ap, bears(), "hand");
    const b = toZone(s0, ap, shock(), "hand");
    s0.players[ap]!.hand = [a, b];
    const other = toZone(s0, ap, divination(), "exile");
    let s = goUntil(s0, (st) => st.activePlayer !== ap && st.step === "draw");
    expect(s.players[ap]!.hand).toEqual([]);
    for (const id of [a, b]) {
      expect(zone(s, id)).toBe("exile");
      expect(s.objects[id]!.hiddenExile).toBeDefined();
    }
    // A card an opponent owns exiled with it (say, while they controlled it): it stays exiled.
    const theirs = toZone(s, opp, opt(), "exile");
    s.linkedExile![`${cl}@${s.objects[cl]!.zoneChanges ?? 0}`]!.push({ id: theirs, zc: s.objects[theirs]!.zoneChanges ?? 0 });
    s = goUntil(s, (st) => st.activePlayer === ap && st.step === "upkeep" && !st.stack.length && !st.triggerQueue.length && !st.pending && st.players[ap]!.hand.length > 0);
    const hand = s.players[ap]!.hand;
    expect(hand).toEqual(expect.arrayContaining([a, b]));
    // Then a card drawn.
    expect(hand.length).toBe(3);
    expect(zone(s, theirs)).toBe("exile");
    expect(zone(s, other)).toBe("exile");
  });

  it("Roads Go Ever, Ever On: chapter I exiles up to two basic Plains from your library and you gain 2 life; chapters II and III return one each", () => {
    const { s: s0, ap } = setup([]);
    supported(roads());
    const p1 = toZone(s0, ap, plains(), "library");
    const p2 = toZone(s0, ap, plains(), "library");
    const p3 = toZone(s0, ap, plains(), "library");
    const r0 = toZone(s0, ap, roads(), "hand");
    poolOnly(s0, ap, { W: 1, C: 1 });
    const before = life(s0, ap);
    let s = passUntilAsked(castNow(s0, ap, r0), ap);
    expect(s.pending?.kind).toBe("searchLibrary");
    s = act(s, { type: "searchLibrary", player: ap, found: [p1, p2] });
    s = settle(s);
    expect(zone(s, p1)).toBe("exile");
    expect(zone(s, p2)).toBe("exile");
    expect(zone(s, p3)).toBe("library");
    expect(life(s, ap)).toBe(before + 2);
    s = goUntil(s, (st) => st.activePlayer === ap && st.step === "main1" && (st.pending?.kind === "searchLibrary" || [p1, p2].some((x) => st.objects[x]!.zone === "hand")));
    // Chapter II: you choose which one.
    expect(s.pending?.kind).toBe("searchLibrary");
    const p = s.pending as Extract<GameState["pending"], { kind: "searchLibrary" }>;
    expect(p.cards).toEqual(expect.arrayContaining([p1, p2]));
    s = act(s, { type: "searchLibrary", player: ap, found: [p2] });
    s = settle(s);
    expect(zone(s, p2)).toBe("hand");
    expect(zone(s, p1)).toBe("exile");
    expect(zone(s, p3)).toBe("library");
    // Chapter III: the last one.
    s = goUntil(s, (st) => st.activePlayer === ap && st.step === "main1" && st.objects[p1]!.zone === "hand");
    expect(zone(s, p1)).toBe("hand");
  });
});
