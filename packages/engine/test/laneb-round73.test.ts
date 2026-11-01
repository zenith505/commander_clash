// Lane B, round 73: unsupported cards from the bottom of the popularity list (`npm run popular -- --least`), one line
// each: Aura and enchantment templates, a random destroy, an even split of damage, bans on the exiled card's name.

import { describe, expect, it } from "vitest";
import { nameCastBan } from "../src/names";
import { act, addEffect, card, forest, pt, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, controllerOf, dealDamage, destroyPermanent, invalidateCharacteristics, isFullySupported, manaAbilitiesOn, objectSource, planActivate, planCast, tapPermanent, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PlayerId, type TargetChoice } from "../src";
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
const bears = (): CardDef => ({"oracleId": "14c8f55d-d177-4c25-a931-ebeb9e6062a0", "name": "Grizzly Bears", "manaCost": "{1}{G}", "cmc": 2, "typeLine": "Creature — Bear", "supertypes": [], "types": ["Creature"], "subtypes": ["Bear"], "oracleText": "", "power": "2", "toughness": "2", "colors": ["G"], "colorIdentity": ["G"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798", "artUrl": "https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798", "commanderLegal": "legal", "set": "slz", "releasedAt": "2026-09-02", "rarity": "common", "layout": "normal", "gameChanger": false}) as CardDef;
const shock = (): CardDef => ({"oracleId": "a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d", "name": "Shock", "manaCost": "{R}", "cmc": 1, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Shock deals 2 damage to any target.", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334", "artUrl": "https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334", "commanderLegal": "legal", "set": "spm", "releasedAt": "2025-09-26", "rarity": "common", "layout": "normal", "gameChanger": false}) as CardDef;
const mistform = (): CardDef => ({"oracleId": "7bf0e628-06b5-4e12-a526-a2bce08844f2", "name": "Mistform Ultimus", "manaCost": "{3}{U}", "cmc": 4, "typeLine": "Legendary Creature — Illusion", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Illusion"], "oracleText": "Mistform Ultimus is every creature type (even if this card isn't on the battlefield).", "power": "3", "toughness": "3", "colors": ["U"], "colorIdentity": ["U"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/e/3/e3be21c3-9b83-430b-be0a-792de9a680e3.jpg?1783944919", "artUrl": "https://cards.scryfall.io/art_crop/front/e/3/e3be21c3-9b83-430b-be0a-792de9a680e3.jpg?1783944919", "commanderLegal": "legal", "set": "lgn", "releasedAt": "2003-02-03", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const soTiny = (): CardDef => ({"oracleId": "196948c7-7386-4b5f-ad2f-ec9e3aef26fe", "name": "So Tiny", "manaCost": "{U}", "cmc": 1, "typeLine": "Enchantment — Aura", "supertypes": [], "types": ["Enchantment"], "subtypes": ["Aura"], "oracleText": "Flash\nEnchant creature\nEnchanted creature gets -2/-0. It gets -6/-0 instead as long as its controller has seven or more cards in their graveyard.", "colors": ["U"], "colorIdentity": ["U"], "keywords": ["Enchant", "Flash"], "imageUrl": "https://cards.scryfall.io/normal/front/4/2/421650f2-1b34-4a36-9675-9424997c9d0b.jpg?1783932650", "artUrl": "https://cards.scryfall.io/art_crop/front/4/2/421650f2-1b34-4a36-9675-9424997c9d0b.jpg?1783932650", "commanderLegal": "legal", "set": "eld", "releasedAt": "2019-10-04", "rarity": "common", "layout": "normal", "gameChanger": false}) as CardDef;
const slowMotion = (): CardDef => ({"oracleId": "151388a4-a24b-4089-a323-e7c1d5e6490a", "name": "Slow Motion", "manaCost": "{2}{U}", "cmc": 3, "typeLine": "Enchantment — Aura", "supertypes": [], "types": ["Enchantment"], "subtypes": ["Aura"], "oracleText": "Enchant creature\nAt the beginning of the upkeep of enchanted creature's controller, that player sacrifices that creature unless they pay {2}.\nWhen this Aura is put into a graveyard from the battlefield, return it to its owner's hand.", "colors": ["U"], "colorIdentity": ["U"], "keywords": ["Enchant"], "imageUrl": "https://cards.scryfall.io/normal/front/2/8/2860a20d-e1bf-4e46-8c07-a858f616d5a5.jpg?1783946245", "artUrl": "https://cards.scryfall.io/art_crop/front/2/8/2860a20d-e1bf-4e46-8c07-a858f616d5a5.jpg?1783946245", "commanderLegal": "legal", "set": "ulg", "releasedAt": "1999-02-15", "rarity": "common", "layout": "normal", "gameChanger": false}) as CardDef;
const venom = (): CardDef => ({"oracleId": "a60422e8-f2f4-4c37-a0f4-eedad27eb08c", "name": "Psychic Venom", "manaCost": "{1}{U}", "cmc": 2, "typeLine": "Enchantment — Aura", "supertypes": [], "types": ["Enchantment"], "subtypes": ["Aura"], "oracleText": "Enchant land\nWhenever enchanted land becomes tapped, this Aura deals 2 damage to that land's controller.", "colors": ["U"], "colorIdentity": ["U"], "keywords": ["Enchant"], "imageUrl": "https://cards.scryfall.io/normal/front/f/3/f3f5b68a-6b0e-431e-89f0-ff60f17687a5.jpg?1783948702", "artUrl": "https://cards.scryfall.io/art_crop/front/f/3/f3f5b68a-6b0e-431e-89f0-ff60f17687a5.jpg?1783948702", "commanderLegal": "legal", "set": "lea", "releasedAt": "1993-08-05", "rarity": "common", "layout": "normal", "gameChanger": false}) as CardDef;
const pastures = (): CardDef => ({"oracleId": "f9e1346a-af72-4644-b384-8f7b0a35ec31", "name": "Greener Pastures", "manaCost": "{2}{G}", "cmc": 3, "typeLine": "Enchantment", "supertypes": [], "types": ["Enchantment"], "subtypes": [], "oracleText": "At the beginning of each player's upkeep, if that player controls more lands than each other player, the player creates a 1/1 green Saproling creature token.", "colors": ["G"], "colorIdentity": ["G"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/5/5/55c3222e-ac18-4f57-9c9e-50deb0a69db3.jpg?1783946315", "artUrl": "https://cards.scryfall.io/art_crop/front/5/5/55c3222e-ac18-4f57-9c9e-50deb0a69db3.jpg?1783946315", "commanderLegal": "legal", "set": "usg", "releasedAt": "1998-10-12", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const antagonism = (): CardDef => ({"oracleId": "68f81fcf-2dcf-41b9-ad7c-588149feb12a", "name": "Antagonism", "manaCost": "{3}{R}", "cmc": 4, "typeLine": "Enchantment", "supertypes": [], "types": ["Enchantment"], "subtypes": [], "oracleText": "At the beginning of each player's end step, this enchantment deals 2 damage to that player unless one of their opponents was dealt damage this turn.", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/6/b/6b9db511-089e-413f-8005-ccb05ec3b06e.jpg?1783946334", "artUrl": "https://cards.scryfall.io/art_crop/front/6/b/6b9db511-089e-413f-8005-ccb05ec3b06e.jpg?1783946334", "commanderLegal": "legal", "set": "usg", "releasedAt": "1998-10-12", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const netherSpirit = (): CardDef => ({"oracleId": "194e2563-c0bf-4151-bbb0-0d626130b055", "name": "Nether Spirit", "manaCost": "{1}{B}{B}", "cmc": 3, "typeLine": "Creature — Spirit", "supertypes": [], "types": ["Creature"], "subtypes": ["Spirit"], "oracleText": "At the beginning of your upkeep, if this card is the only creature card in your graveyard, you may return this card to the battlefield.", "power": "2", "toughness": "2", "colors": ["B"], "colorIdentity": ["B"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/8/2/82f1f3e1-d986-4c0b-850e-5e8f2eaa0642.jpg?1783933125", "artUrl": "https://cards.scryfall.io/art_crop/front/8/2/82f1f3e1-d986-4c0b-850e-5e8f2eaa0642.jpg?1783933125", "commanderLegal": "legal", "set": "mh1", "releasedAt": "2019-06-14", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const wildSwing = (): CardDef => ({"oracleId": "92d07c7c-be30-4bcc-a632-99986fc5315c", "name": "Wild Swing", "manaCost": "{3}{R}", "cmc": 4, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "Choose three target nonenchantment permanents. Destroy one of them at random.", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/3/2/320ade77-30be-4930-80ca-86028c010b1b.jpg?1783942745", "artUrl": "https://cards.scryfall.io/art_crop/front/3/2/320ade77-30be-4930-80ca-86028c010b1b.jpg?1783942745", "commanderLegal": "legal", "set": "shm", "releasedAt": "2008-05-02", "rarity": "uncommon", "layout": "normal", "gameChanger": false}) as CardDef;
const catapult = (): CardDef => ({"oracleId": "2aae77ed-1a91-41f5-8dc2-e353d63a7586", "name": "Dwarven Catapult", "manaCost": "{X}{R}", "cmc": 1, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Dwarven Catapult deals X damage divided evenly, rounded down, among all creatures target opponent controls.", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/8/c/8c1c6932-638a-4df7-bf9b-8d921f7484d9.jpg?1783947896", "artUrl": "https://cards.scryfall.io/art_crop/front/8/c/8c1c6932-638a-4df7-bf9b-8d921f7484d9.jpg?1783947896", "commanderLegal": "legal", "set": "fem", "releasedAt": "1994-11-01", "rarity": "uncommon", "layout": "normal", "gameChanger": false}) as CardDef;
const swallower = (): CardDef => ({"oracleId": "b345c413-df5a-4dae-8b92-5fab54a097fc", "name": "Sky Swallower", "manaCost": "{3}{U}{U}", "cmc": 5, "typeLine": "Creature — Leviathan", "supertypes": [], "types": ["Creature"], "subtypes": ["Leviathan"], "oracleText": "Flying\nWhen this creature enters, target opponent gains control of all other permanents you control.", "power": "8", "toughness": "8", "colors": ["U"], "colorIdentity": ["U"], "keywords": ["Flying"], "imageUrl": "https://cards.scryfall.io/normal/front/0/5/05189964-5ad0-48b7-a3af-67c7f46fe89e.jpg?1783943518", "artUrl": "https://cards.scryfall.io/art_crop/front/0/5/05189964-5ad0-48b7-a3af-67c7f46fe89e.jpg?1783943518", "commanderLegal": "legal", "set": "gpt", "releasedAt": "2006-02-03", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const mirage = (): CardDef => ({"oracleId": "685c4665-e04c-4012-aa5b-888a042c2a21", "name": "Convincing Mirage", "manaCost": "{1}{U}", "cmc": 2, "typeLine": "Enchantment — Aura", "supertypes": [], "types": ["Enchantment"], "subtypes": ["Aura"], "oracleText": "Enchant land\nAs this Aura enters, choose a basic land type.\nEnchanted land is the chosen type.", "colors": ["U"], "colorIdentity": ["U"], "keywords": ["Enchant"], "imageUrl": "https://cards.scryfall.io/normal/front/f/b/fb757102-4636-46ae-b202-c2095aeb187c.jpg?1783942394", "artUrl": "https://cards.scryfall.io/art_crop/front/f/b/fb757102-4636-46ae-b202-c2095aeb187c.jpg?1783942394", "commanderLegal": "legal", "set": "m10", "releasedAt": "2009-07-17", "rarity": "common", "layout": "normal", "gameChanger": false}) as CardDef;
const terrain = (): CardDef => ({"oracleId": "7dcbce46-2973-4a9f-93df-95ac41ce668a", "name": "Phantasmal Terrain", "manaCost": "{U}{U}", "cmc": 2, "typeLine": "Enchantment — Aura", "supertypes": [], "types": ["Enchantment"], "subtypes": ["Aura"], "oracleText": "Enchant land\nAs this Aura enters, choose a basic land type.\nEnchanted land is the chosen type.", "colors": ["U"], "colorIdentity": ["U"], "keywords": ["Enchant"], "imageUrl": "https://cards.scryfall.io/normal/front/e/a/ea56a1bb-f52c-4c6b-a089-1f78600f3db0.jpg?1783945706", "artUrl": "https://cards.scryfall.io/art_crop/front/e/a/ea56a1bb-f52c-4c6b-a089-1f78600f3db0.jpg?1783945706", "commanderLegal": "legal", "set": "inv", "releasedAt": "2000-10-02", "rarity": "common", "layout": "normal", "gameChanger": false}) as CardDef;
const prismaticWard = (): CardDef => ({"oracleId": "ad5e2cb0-00d7-4dad-b20e-23bd41ada398", "name": "Prismatic Ward", "manaCost": "{1}{W}", "cmc": 2, "typeLine": "Enchantment — Aura", "supertypes": [], "types": ["Enchantment"], "subtypes": ["Aura"], "oracleText": "Enchant creature\nAs this Aura enters, choose a color.\nPrevent all damage that would be dealt to enchanted creature by sources of the chosen color.", "colors": ["W"], "colorIdentity": ["W"], "keywords": ["Enchant"], "imageUrl": "https://cards.scryfall.io/normal/front/6/f/6f8b50fd-3d1d-4ea8-a3c7-98ca7a8a455e.jpg?1783947521", "artUrl": "https://cards.scryfall.io/art_crop/front/6/f/6f8b50fd-3d1d-4ea8-a3c7-98ca7a8a455e.jpg?1783947521", "commanderLegal": "legal", "set": "ice", "releasedAt": "1995-06-03", "rarity": "common", "layout": "normal", "gameChanger": false}) as CardDef;
const exclusion = (): CardDef => ({"oracleId": "5e3fd5da-6724-4134-ab15-4616cb659f88", "name": "Exclusion Ritual", "manaCost": "{4}{W}{W}", "cmc": 6, "typeLine": "Enchantment", "supertypes": [], "types": ["Enchantment"], "subtypes": [], "oracleText": "Imprint — When this enchantment enters, exile target nonland permanent.\nPlayers can't cast spells with the same name as the exiled card.", "colors": ["W"], "colorIdentity": ["W"], "keywords": ["Imprint"], "imageUrl": "https://cards.scryfall.io/normal/front/9/e/9e3b826a-7349-45ae-89bf-675fea7ce8e3.jpg?1783941327", "artUrl": "https://cards.scryfall.io/art_crop/front/9/e/9e3b826a-7349-45ae-89bf-675fea7ce8e3.jpg?1783941327", "commanderLegal": "legal", "set": "nph", "releasedAt": "2011-05-13", "rarity": "uncommon", "layout": "normal", "gameChanger": false}) as CardDef;
const binding = (): CardDef => ({"oracleId": "5a2d0df9-950e-4c3d-8a08-275f179e33c7", "name": "Ixalan's Binding", "manaCost": "{3}{W}", "cmc": 4, "typeLine": "Enchantment", "supertypes": [], "types": ["Enchantment"], "subtypes": [], "oracleText": "When this enchantment enters, exile target nonland permanent an opponent controls until this enchantment leaves the battlefield.\nYour opponents can't cast spells with the same name as the exiled card.", "colors": ["W"], "colorIdentity": ["W"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/5/f/5f3c8c31-ceb8-4a2c-beb6-0ff5f7b6ae07.jpg?1783935799", "artUrl": "https://cards.scryfall.io/art_crop/front/5/f/5f3c8c31-ceb8-4a2c-beb6-0ff5f7b6ae07.jpg?1783935799", "commanderLegal": "legal", "set": "xln", "releasedAt": "2017-09-29", "rarity": "uncommon", "layout": "normal", "gameChanger": false}) as CardDef;
const setback = (): CardDef => ({"oracleId": "565ba85c-bad8-4cbd-a2ff-b4384b886308", "name": "Sudden Setback", "manaCost": "{2}{U}{U}", "cmc": 4, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "The owner of target spell or nonland permanent puts it on their choice of the top or bottom of their library.", "colors": ["U"], "colorIdentity": ["U"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/0/b/0b9e5fd6-a5ea-4ae5-83f5-89ed6a658dd3.jpg?1783912904", "artUrl": "https://cards.scryfall.io/art_crop/front/0/b/0b9e5fd6-a5ea-4ae5-83f5-89ed6a658dd3.jpg?1783912904", "commanderLegal": "legal", "set": "mkm", "releasedAt": "2024-02-09", "rarity": "uncommon", "layout": "normal", "gameChanger": false}) as CardDef;
const emissary = (): CardDef => ({"oracleId": "dc39c52b-9bee-4cec-a970-1867314944ef", "name": "Erebos's Emissary", "manaCost": "{3}{B}", "cmc": 4, "typeLine": "Enchantment Creature — Snake", "supertypes": [], "types": ["Enchantment", "Creature"], "subtypes": ["Snake"], "oracleText": "Bestow {5}{B} (If you cast this card for its bestow cost, it's an Aura spell with enchant creature. It becomes a creature again if it's not attached.)\nDiscard a creature card: This creature gets +2/+2 until end of turn. If this permanent is an Aura, enchanted creature gets +2/+2 until end of turn instead.\nEnchanted creature gets +3/+3.", "power": "3", "toughness": "3", "colors": ["B"], "colorIdentity": ["B"], "keywords": ["Bestow"], "imageUrl": "https://cards.scryfall.io/normal/front/5/a/5aa96f63-d5c3-47d3-a54d-a67883406fc5.jpg?1783939780", "artUrl": "https://cards.scryfall.io/art_crop/front/5/a/5aa96f63-d5c3-47d3-a54d-a67883406fc5.jpg?1783939780", "commanderLegal": "legal", "set": "ths", "releasedAt": "2013-09-27", "rarity": "uncommon", "layout": "normal", "gameChanger": false}) as CardDef;
const eidolon = (): CardDef => ({"oracleId": "2c6b2f4a-4e0e-4dc1-92a8-c07e5cbba5f4", "name": "Everflame Eidolon", "manaCost": "{1}{R}", "cmc": 2, "typeLine": "Enchantment Creature — Spirit", "supertypes": [], "types": ["Enchantment", "Creature"], "subtypes": ["Spirit"], "oracleText": "Bestow {2}{R} (If you cast this card for its bestow cost, it's an Aura spell with enchant creature. It becomes a creature again if it's not attached.)\n{R}: This creature gets +1/+0 until end of turn. If it's an Aura, enchanted creature gets +1/+0 until end of turn instead.\nEnchanted creature gets +1/+1.", "power": "1", "toughness": "1", "colors": ["R"], "colorIdentity": ["R"], "keywords": ["Bestow"], "imageUrl": "https://cards.scryfall.io/normal/front/a/0/a018d5ea-5229-40ca-b7c5-31d3e8ebb894.jpg?1783939548", "artUrl": "https://cards.scryfall.io/art_crop/front/a/0/a018d5ea-5229-40ca-b7c5-31d3e8ebb894.jpg?1783939548", "commanderLegal": "legal", "set": "bng", "releasedAt": "2014-02-07", "rarity": "uncommon", "layout": "normal", "gameChanger": false}) as CardDef;
const edict = (): CardDef => ({"oracleId": "0e768d03-b2a3-4783-9cf5-7470f0203349", "name": "Telim'Tor's Edict", "manaCost": "{R}", "cmc": 1, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Exile target permanent you own or control.\nDraw a card at the beginning of the next turn's upkeep.", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "imageUrl": "https://cards.scryfall.io/normal/front/0/8/088a60f0-2224-4e00-a06a-1d376c8d82a4.jpg?1783947071", "artUrl": "https://cards.scryfall.io/art_crop/front/0/8/088a60f0-2224-4e00-a06a-1d376c8d82a4.jpg?1783947071", "commanderLegal": "legal", "set": "mir", "releasedAt": "1996-10-08", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const choose = (s: GameState, choice: string) => act(s, { type: "chooseOption", player: (s.pending as { player: PlayerId }).player, choice });
const subtypes = (s: GameState, id: string) => characteristics(s, s.objects[id]!).subtypes.join(" ");
/** Plays on until `pid`'s upkeep has begun (past any upkeep we're in now). */
const toUpkeepOf = (s: GameState, pid: PlayerId) => {
  const turn = s.turn;
  return goUntil(s, (x) => x.step === "upkeep" && x.activePlayer === pid && x.turn !== turn);
};

describe("Lane B round 73", () => {
  it("all of them are supported", () => {
    supported(mistform(), soTiny(), slowMotion(), venom(), pastures(), antagonism(), netherSpirit(), wildSwing(), catapult(), swallower(), mirage(), terrain(), prismaticWard(), exclusion(), binding(), setback(), emissary(), eidolon(), edict());
  });

  it("Mistform Ultimus: every creature type, in hand and on the battlefield, even after losing its abilities", () => {
    const { s, ap } = setup([]);
    const inHand = toZone(s, ap, mistform(), "hand");
    expect(characteristics(s, s.objects[inHand]!).allCreatureTypes).toBe(true);
    const m = putOnBattlefield(s, ap, mistform());
    expect(characteristics(s, s.objects[m]!).allCreatureTypes).toBe(true);
    // CR 613.3: a characteristic-defining ability applies in layer 4, before abilities are lost in layer 6 (rulings).
    addEffect(s, ap, [m], [{ kind: "loseAllAbilities" }]);
    invalidateCharacteristics(s);
    expect(characteristics(s, s.objects[m]!).allCreatureTypes).toBe(true);
    // A plain creature isn't.
    const b = putOnBattlefield(s, ap, bears());
    expect(characteristics(s, s.objects[b]!).allCreatureTypes).toBe(false);
  });

  it("So Tiny: -2/-0, or -6/-0 while the enchanted creature's controller has seven or more cards in their graveyard", () => {
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, opp, bears());
    const t = toZone(s0, ap, soTiny(), "hand");
    poolOnly(s0, ap, { U: 1 });
    let s = settle(castNow(s0, ap, t, [tgt(b)]));
    expect(pt(s, b)).toBe("0/2");
    // Seven cards in our graveyard change nothing: it's the creature's controller's.
    for (let i = 0; i < 7; i++) toZone(s, ap, bears(), "graveyard");
    expect(pt(s, b)).toBe("0/2");
    for (let i = 0; i < 6; i++) toZone(s, opp, bears(), "graveyard");
    expect(pt(s, b)).toBe("0/2");
    toZone(s, opp, bears(), "graveyard");
    expect(pt(s, b)).toBe("-4/2");
  });

  it("Slow Motion: the enchanted creature's controller pays {2} at their upkeep or sacrifices it, and the Aura returns to its owner's hand", () => {
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, opp, bears());
    const sm = toZone(s0, ap, slowMotion(), "hand");
    poolOnly(s0, ap, { U: 3 });
    let s = settle(castNow(s0, ap, sm, [tgt(b)]));
    expect(s.objects[b]!.zone).toBe("battlefield");
    s = toUpkeepOf(s, opp);
    s.players[opp]!.manaPool = { ...s.players[opp]!.manaPool, C: 2 };
    // Paid: the creature stays.
    s = settle(s, { may: true });
    expect(zone(s, b)).toBe("battlefield");
    expect(s.players[opp]!.manaPool.C ?? 0).toBe(0);
    // Not paid at the next one: sacrificed, and Slow Motion goes back to its owner's hand.
    s = toUpkeepOf(s, opp);
    s = settle(s, { may: false });
    expect(zone(s, b)).toBe("graveyard");
    const aura = s.players[ap]!.hand.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Slow Motion");
    expect(aura).toBeDefined();
  });

  it("Psychic Venom: whenever the enchanted land becomes tapped, 2 damage to its controller", () => {
    const { s: s0, ap, opp } = setup([]);
    const land = putOnBattlefield(s0, opp, card("Wastes", "Basic Land"));
    const v = toZone(s0, ap, venom(), "hand");
    poolOnly(s0, ap, { U: 2 });
    let s = settle(castNow(s0, ap, v, [tgt(land)]));
    expect(onField(s, "Psychic Venom")).toBeDefined();
    const before = life(s, opp);
    tapPermanent(s, s.objects[land]!);
    s = settle(s);
    expect(life(s, opp)).toBe(before - 2);
    expect(life(s, ap)).toBe(40);
  });

  it("Greener Pastures: a Saproling at the upkeep of the player with more lands than each other player", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, pastures());
    const opp = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    const saps = (x: GameState, pid: PlayerId) => x.battlefield.filter((id) => x.objects[id]!.controller === pid && x.cards[x.objects[id]!.cardId]!.name === "Saproling Token").length;
    s = toUpkeepOf(s, opp);
    s = settle(s);
    expect(saps(s, opp)).toBe(0);
    s = toUpkeepOf(s, ap);
    s = settle(s);
    expect(saps(s, ap)).toBe(1);
  });

  it("Antagonism: 2 damage to the player whose end step it is, unless one of their opponents was dealt damage this turn", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, antagonism());
    const before = life(s, ap);
    s = goUntil(s, (x) => x.step === "end" && x.activePlayer === ap && !!(x.stack.length || x.pending));
    s = settle(s);
    expect(life(s, ap)).toBe(before - 2);
    // On the next player's turn, damage dealt to one of their opponents (us) saves them.
    s = goUntil(s, (x) => x.activePlayer === opp && x.step === "main1");
    const oppLife = life(s, opp);
    dealDamage(s, objectSource(s, s.objects[onField(s, "Antagonism")]!), { player: ap }, 1);
    s = goUntil(s, (x) => x.step === "end" && x.activePlayer === opp && !!(x.stack.length || x.pending));
    s = settle(s);
    expect(life(s, opp)).toBe(oppLife);
  });

  it("Nether Spirit: returns at your upkeep only while it's the only creature card in your graveyard", () => {
    let { s, ap } = setup([]);
    // No discards to hand size along the way (Bears cards would land in the graveyard).
    s.players[ap]!.hand.splice(0, s.players[ap]!.hand.length);
    const n = toZone(s, ap, netherSpirit(), "graveyard");
    const b = toZone(s, ap, bears(), "graveyard");
    s = toUpkeepOf(s, ap);
    s = settle(s, { may: true });
    expect(zone(s, n)).toBe("graveyard");
    // Without the Bears there (a land card doesn't matter), it comes back.
    s.players[ap]!.graveyard.splice(s.players[ap]!.graveyard.indexOf(b), 1);
    s.objects[b]!.zone = "exile";
    s.players[ap]!.exile.push(b);
    toZone(s, ap, card("Wastes", "Basic Land"), "graveyard");
    s = toUpkeepOf(s, ap);
    s = settle(s, { may: true });
    expect(zone(s, n)).toBe("battlefield");
  });

  it("Wild Swing: one of the three targets destroyed at random; the last legal one if two have gone", () => {
    const { s: s0, ap, opp } = setup([]);
    const ts = [putOnBattlefield(s0, opp, bears()), putOnBattlefield(s0, opp, bears()), putOnBattlefield(s0, opp, bears())];
    const w = toZone(s0, ap, wildSwing(), "hand");
    poolOnly(s0, ap, { R: 4 });
    let s = settle(castNow(s0, ap, w, ts.map(tgt)));
    expect(ts.filter((id) => zone(s, id) === "graveyard").length).toBe(1);
    // An enchantment can't be one of the targets.
    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    const ench = putOnBattlefield(s1, opp1, antagonism());
    const two = [putOnBattlefield(s1, opp1, bears()), putOnBattlefield(s1, opp1, bears())];
    const w1 = toZone(s1, ap1, wildSwing(), "hand");
    poolOnly(s1, ap1, { R: 4 });
    expect(planCast(s1, ap1, w1, [tgt(ench), ...two.map(tgt)])).toBeNull();
    // Two of them gone before it resolves: the third is the one.
    const third = putOnBattlefield(s1, opp1, bears());
    let s2 = castNow(s1, ap1, w1, [...two, third].map(tgt));
    for (const id of two) {
      s2.battlefield.splice(s2.battlefield.indexOf(id), 1);
      s2.objects[id]!.zone = "exile";
      s2.players[opp1]!.exile.push(id);
    }
    invalidateCharacteristics(s2);
    s2 = settle(s2);
    expect(zone(s2, third)).toBe("graveyard");
  });

  it("Dwarven Catapult: X damage divided evenly, rounded down, among all creatures target opponent controls", () => {
    const { s: s0, ap, opp } = setup([]);
    const big = card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" });
    const three = [putOnBattlefield(s0, opp, big), putOnBattlefield(s0, opp, big), putOnBattlefield(s0, opp, big)];
    const mine = putOnBattlefield(s0, ap, big);
    const c = toZone(s0, ap, catapult(), "hand");
    poolOnly(s0, ap, { R: 6 });
    let s = settle(castNow(s0, ap, c, [ply(opp)], {}, 5));
    // 5 among three: 1 each.
    for (const id of three) expect(s.objects[id]!.damage).toBe(1);
    expect(s.objects[mine]!.damage).toBe(0);
    // More creatures than X: none (rulings).
    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    const many = Array.from({ length: 4 }, () => putOnBattlefield(s1, opp1, big));
    const c1 = toZone(s1, ap1, catapult(), "hand");
    poolOnly(s1, ap1, { R: 4 });
    let s2 = settle(castNow(s1, ap1, c1, [ply(opp1)], {}, 3));
    for (const id of many) expect(s2.objects[id]!.damage).toBe(0);
  });

  it("Sky Swallower: target opponent gains control of all other permanents you control", () => {
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, ap, bears());
    const theirs = putOnBattlefield(s0, opp, bears());
    const sw = toZone(s0, ap, swallower(), "hand");
    poolOnly(s0, ap, { U: 5 });
    let s = castNow(s0, ap, sw);
    s = passUntilAsked(s, ap);
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [ply(opp)] });
    s = settle(s);
    const me = onField(s, "Sky Swallower");
    expect(controllerOf(s, s.objects[me]!)).toBe(ap);
    expect(controllerOf(s, s.objects[b]!)).toBe(opp);
    expect(controllerOf(s, s.objects[theirs]!)).toBe(opp);
    // Every land ap had went too.
    expect(s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === ap)).toEqual([me]);
  });

  it("Convincing Mirage and Phantasmal Terrain: the enchanted land is the basic land type chosen as the Aura entered", () => {
    for (const def of [mirage(), terrain()]) {
      const { s: s0, ap, opp } = setup([]);
      const f = putOnBattlefield(s0, opp, forest);
      const a = toZone(s0, ap, def, "hand");
      poolOnly(s0, ap, { U: 2 });
      let s = castNow(s0, ap, a, [tgt(f)]);
      s = passUntilAsked(s, ap);
      expect(s.pending).toMatchObject({ kind: "chooseOption", what: "basicLandType" });
      s = settle(choose(s, "Island"));
      expect(subtypes(s, f)).toBe("Island");
      // Its basic supertype stays, and it taps for blue now (CR 305.7).
      expect(characteristics(s, s.objects[f]!).supertypes).toContain("Basic");
      expect(manaAbilitiesOn(s, s.objects[f]!).map((m) => m.produces)).toEqual([{ kind: "fixed", mana: ["U"] }]);
    }
  });

  it("Prismatic Ward: damage from sources of the chosen color to the enchanted creature is prevented", () => {
    const { s: s0, ap } = setup([]);
    const b = putOnBattlefield(s0, ap, card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" }));
    const w = toZone(s0, ap, prismaticWard(), "hand");
    poolOnly(s0, ap, { W: 2 });
    let s = castNow(s0, ap, w, [tgt(b)]);
    s = passUntilAsked(s, ap);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "color" });
    const opts = (s.pending as { options: string[] }).options;
    s = settle(choose(s, opts.find((o) => /^r(ed)?$/i.test(o))!));
    const red = putOnBattlefield(s, ap, card("Red Thing", "Creature — Elemental", "{R}", { power: "1", toughness: "1", colors: ["R"] }));
    const green = putOnBattlefield(s, ap, card("Green Thing", "Creature — Elf", "{G}", { power: "1", toughness: "1", colors: ["G"] }));
    dealDamage(s, objectSource(s, s.objects[red]!), { object: s.objects[b]! }, 2);
    expect(s.objects[b]!.damage).toBe(0);
    dealDamage(s, objectSource(s, s.objects[green]!), { object: s.objects[b]! }, 2);
    expect(s.objects[b]!.damage).toBe(2);
  });

  it("Exclusion Ritual: nobody can cast spells with the exiled card's name, its controller too, while it stays exiled", () => {
    const { s: s0, ap, opp } = setup([]);
    const theirBears = putOnBattlefield(s0, opp, bears());
    const myBears = toZone(s0, ap, bears(), "hand");
    const oppBears = toZone(s0, opp, bears(), "hand");
    const e = toZone(s0, ap, exclusion(), "hand");
    poolOnly(s0, ap, { W: 6 });
    let s = castNow(s0, ap, e);
    s = passUntilAsked(s, ap);
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(theirBears)] });
    s = settle(s);
    expect(zone(s, theirBears)).toBe("exile");
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, G: 2 };
    expect(nameCastBan(s, ap, s.cards[s.objects[myBears]!.cardId]!)).toMatch(/players can't cast spells named Grizzly Bears/);
    expect(planCast(s, ap, myBears)).toBeNull();
    expect(nameCastBan(s, opp, s.cards[s.objects[oppBears]!.cardId]!)).not.toBeNull();
    // Once the card has left exile, nothing is banned (rulings).
    s.players[opp]!.exile.splice(s.players[opp]!.exile.indexOf(theirBears), 1);
    s.objects[theirBears]!.zone = "graveyard";
    s.players[opp]!.graveyard.push(theirBears);
    expect(nameCastBan(s, ap, s.cards[s.objects[myBears]!.cardId]!)).toBeNull();
  });

  it("Ixalan's Binding: only its controller's opponents are banned, and the card comes back when it leaves", () => {
    const { s: s0, ap, opp } = setup([]);
    const theirBears = putOnBattlefield(s0, opp, bears());
    const myBears = toZone(s0, ap, bears(), "hand");
    const oppBears = toZone(s0, opp, bears(), "hand");
    const ib = toZone(s0, ap, binding(), "hand");
    poolOnly(s0, ap, { W: 4 });
    let s = castNow(s0, ap, ib);
    s = passUntilAsked(s, ap);
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(theirBears)] });
    s = settle(s);
    expect(zone(s, theirBears)).toBe("exile");
    expect(nameCastBan(s, ap, s.cards[s.objects[myBears]!.cardId]!)).toBeNull();
    expect(nameCastBan(s, opp, s.cards[s.objects[oppBears]!.cardId]!)).toMatch(/opponents can't cast spells named Grizzly Bears/);
    destroyPermanent(s, s.objects[onField(s, "Ixalan's Binding")]!, "test");
    s = settle(s);
    const back = s.battlefield.find((id) => s.objects[id]!.owner === opp && s.cards[s.objects[id]!.cardId]!.name === "Grizzly Bears");
    expect(back).toBeDefined();
    expect(nameCastBan(s, opp, s.cards[s.objects[oppBears]!.cardId]!)).toBeNull();
  });

  it("Sudden Setback: a spell or a nonland permanent, its owner choosing the top or the bottom of their library", () => {
    // A permanent: its owner puts it on top.
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, opp, bears());
    const ss = toZone(s0, ap, setback(), "hand");
    poolOnly(s0, ap, { U: 4 });
    let s = castNow(s0, ap, ss, [tgt(b)]);
    s = passUntilAsked(s, opp);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: opp });
    s = settle(choose(s, "top"));
    expect(zone(s, b)).toBe("library");
    expect(s.players[opp]!.library[0]).toBe(b);
    // A spell (one we cast and hold priority over): it leaves the stack, to the bottom of its owner's library.
    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    const shk = toZone(s1, ap1, shock(), "hand");
    const ss1 = toZone(s1, ap1, setback(), "hand");
    poolOnly(s1, ap1, { R: 1, U: 4 });
    let s2 = castNow(s1, ap1, shk, [ply(opp1)]);
    const item = s2.stack[s2.stack.length - 1]!;
    s2 = castNow(s2, ap1, ss1, [{ kind: "stack", id: item.id }]);
    s2 = passUntilAsked(s2, ap1);
    expect(s2.pending).toMatchObject({ kind: "chooseOption", player: ap1, what: "topOrBottom" });
    s2 = settle(choose(s2, "bottom"));
    expect(zone(s2, shk)).toBe("library");
    expect(s2.players[ap1]!.library[s2.players[ap1]!.library.length - 1]).toBe(shk);
    expect(life(s2, opp1)).toBe(40);
  });

  it("Erebos's Emissary and Everflame Eidolon: the pump goes to the enchanted creature while it's an Aura, else to itself", () => {
    const { s: s0, ap } = setup([]);
    const b = putOnBattlefield(s0, ap, bears());
    const e = toZone(s0, ap, eidolon(), "hand");
    poolOnly(s0, ap, { R: 3 });
    let s = settle(castNow(s0, ap, e, [tgt(b)], { alt: "bestow" }));
    const ed = onField(s, "Everflame Eidolon");
    expect(s.objects[ed]!.attachedTo).toBe(b);
    expect(pt(s, b)).toBe("3/3");
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, R: 1 };
    s = settle(run(s, planActivate(s, ap, ed, 0, [])));
    expect(pt(s, b)).toBe("4/3");
    // As a creature, itself.
    const { s: s1, ap: ap1 } = setup([]);
    const em = putOnBattlefield(s1, ap1, emissary());
    const fodder = toZone(s1, ap1, bears(), "hand");
    let s2 = settle(run(s1, planActivate(s1, ap1, em, 0, [], undefined, undefined, undefined, { discard: [fodder] })));
    expect(pt(s2, em)).toBe("5/5");
  });

  it("Telim'Tor's Edict: exile a permanent you own or control, then draw at the next turn's upkeep", () => {
    const { s: s0, ap, opp } = setup([]);
    const mineThere = putOnBattlefield(s0, opp, bears());
    s0.objects[mineThere]!.owner = ap;
    const theirs = putOnBattlefield(s0, opp, bears());
    const ed = toZone(s0, ap, edict(), "hand");
    poolOnly(s0, ap, { R: 1 });
    expect(planCast(s0, ap, ed, [tgt(theirs)])).toBeNull();
    let s = settle(castNow(s0, ap, ed, [tgt(mineThere)]));
    expect(zone(s, mineThere)).toBe("exile");
    // Few enough cards that none is discarded at cleanup.
    s.players[ap]!.hand.splice(0, s.players[ap]!.hand.length);
    const hand = s.players[ap]!.hand.length;
    s = goUntil(s, (x) => x.step === "draw" || (x.step === "upkeep" && x.activePlayer !== ap));
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });
});
