// Lane B, round 77: unsupported cards from the bottom of the popularity list (`npm run popular -- --least`): a player
// revealing a number of cards of their choice from their hand for a discard (CR 701.9b, 701.20a), "as ~ enters" choices
// that sacrifice or return permanents (CR 614.12), converge counts in enters triggers (CR 702.69a), noncombat damage
// this turn, a card type chosen for a revealed hand, and one-line templates.

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, botActions, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PlayerId, type TargetChoice } from "../src";
import { objHasKeyword } from "../src/cards";
import { dealDamage, objectSource } from "../src/damage";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/**
 * Everyone passes until the stack is empty. "You may" is answered with `may`, trigger targets with the next of `targets`;
 * other questions as the bots would, except those of the players in `me` (it stops there).
 */
const settle = (s: GameState, opts: { may?: boolean; me?: PlayerId[]; targets?: TargetChoice[][] } = {}) => {
  const queue = [...(opts.targets ?? [])];
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: opts.may ?? true });
    else if (p?.kind === "chooseTargets" && queue.length) s = act(s, { type: "chooseTargets", player: p.player, targets: queue.shift()! });
    else if (p && opts.me?.includes(p.player)) return s;
    else if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets: [] });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
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
    else if (p?.kind === "discardToHandSize") s = act(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, p.count) });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: pid });
  }
  throw new Error("never got there");
};
const attackWith = (s: GameState, attackers: string[], defender: PlayerId) => {
  for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return act(s, { type: "declareAttackers", player: s.activePlayer, attacks: attackers.map((attacker) => ({ attacker, defender })) });
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = [], choices: CostChoices = {}, x?: number) => run(s, planCast(s, pid, id, targets, undefined, "auto", x, choices));
/** Moves a new card for `def` into `pid`'s hand, library (on top) or graveyard. */
const toZone = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "library" | "graveyard") => {
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
/** Empties `pid`'s hand (into exile), then gives them `defs`. */
const handOf = (s: GameState, pid: PlayerId, defs: CardDef[]) => {
  for (const id of [...s.players[pid]!.hand]) {
    s.players[pid]!.hand.splice(s.players[pid]!.hand.indexOf(id), 1);
    s.objects[id]!.zone = "exile";
    s.players[pid]!.exile.push(id);
  }
  invalidateCharacteristics(s);
  return defs.map((d) => toZone(s, pid, d, "hand"));
};
const hand = (s: GameState, pid: PlayerId) => s.players[pid]!.hand;
const yard = (s: GameState, pid: PlayerId) => s.players[pid]!.graveyard;

// Real oracle text (Scryfall).
const discipleOfPhenax = (): CardDef => ({"oracleId": "d7cbe54b-f217-45f5-8583-c254a1c80bb8", "name": "Disciple of Phenax", "manaCost": "{2}{B}{B}", "cmc": 4, "typeLine": "Creature — Human Cleric", "supertypes": [], "types": ["Creature"], "subtypes": ["Human", "Cleric"], "oracleText": "When this creature enters, target player reveals a number of cards from their hand equal to your devotion to black. You choose one of them. That player discards that card. (Each {B} in the mana costs of permanents you control counts toward your devotion to black.)", "power": "1", "toughness": "3", "colors": ["B"], "colorIdentity": ["B"], "keywords": [], "layout": "normal"});
const klawSonicSubjugator = (): CardDef => ({"oracleId": "1c233e08-d5a3-48d7-9074-20393896a480", "name": "Klaw, Sonic Subjugator", "manaCost": "{2}{B}", "cmc": 3, "typeLine": "Legendary Creature — Human Rogue Villain", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Human", "Rogue", "Villain"], "oracleText": "Sonic Attack — When Klaw enters, target player reveals a number of cards from their hand equal to one plus the number of creature cards in your graveyard. You choose one of them. That player discards that card.", "power": "2", "toughness": "2", "colors": ["B"], "colorIdentity": ["B"], "keywords": ["Sonic Attack"], "layout": "normal"});
const acquisitionsExpert = (): CardDef => ({"oracleId": "07e5f59e-3a98-4e01-a368-0be60e0463ba", "name": "Acquisitions Expert", "manaCost": "{1}{B}", "cmc": 2, "typeLine": "Creature — Human Rogue", "supertypes": [], "types": ["Creature"], "subtypes": ["Human", "Rogue"], "oracleText": "When this creature enters, target opponent reveals a number of cards from their hand equal to the number of creatures in your party. You choose one of those cards. That player discards that card. (Your party consists of up to one each of Cleric, Rogue, Warrior, and Wizard.)", "power": "1", "toughness": "2", "colors": ["B"], "colorIdentity": ["B"], "keywords": [], "layout": "normal"});
const cabalInterrogator = (): CardDef => ({"oracleId": "769ae101-73cc-4ac5-8f46-8af8e7de6581", "name": "Cabal Interrogator", "manaCost": "{1}{B}", "cmc": 2, "typeLine": "Creature — Zombie Wizard", "supertypes": [], "types": ["Creature"], "subtypes": ["Zombie", "Wizard"], "oracleText": "{X}{B}, {T}: Target player reveals X cards from their hand and you choose one of them. That player discards that card. Activate only as a sorcery.", "power": "1", "toughness": "1", "colors": ["B"], "colorIdentity": ["B"], "keywords": [], "layout": "normal"});
const hollowSpecter = (): CardDef => ({"oracleId": "797aed94-c409-4441-88c1-baba7e212696", "name": "Hollow Specter", "manaCost": "{1}{B}{B}", "cmc": 3, "typeLine": "Creature — Specter", "supertypes": [], "types": ["Creature"], "subtypes": ["Specter"], "oracleText": "Flying\nWhenever this creature deals combat damage to a player, you may pay {X}. If you do, that player reveals X cards from their hand and you choose one of them. That player discards that card.", "power": "2", "toughness": "2", "colors": ["B"], "colorIdentity": ["B"], "keywords": ["Flying"], "layout": "normal"});
const skyriderPatrol = (): CardDef => ({"oracleId": "104386d9-93b4-4a18-86d5-68718b474f4a", "name": "Skyrider Patrol", "manaCost": "{2}{G}{U}", "cmc": 4, "typeLine": "Creature — Elf Scout", "supertypes": [], "types": ["Creature"], "subtypes": ["Elf", "Scout"], "oracleText": "Flying\nAt the beginning of combat on your turn, you may pay {G}{U}. When you do, put a +1/+1 counter on another target creature you control, and that creature gains flying until end of turn.", "power": "2", "toughness": "3", "colors": ["G", "U"], "colorIdentity": ["G", "U"], "keywords": ["Flying"], "layout": "normal"});
const devouringHellion = (): CardDef => ({"oracleId": "8f6620c3-2c15-467c-92ca-fdf9042a63f7", "name": "Devouring Hellion", "manaCost": "{2}{R}", "cmc": 3, "typeLine": "Creature — Hellion", "supertypes": [], "types": ["Creature"], "subtypes": ["Hellion"], "oracleText": "As this creature enters, you may sacrifice any number of creatures and/or planeswalkers. If you do, it enters with twice that many +1/+1 counters on it.", "power": "2", "toughness": "2", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "layout": "normal"});
const rescuerSphinx = (): CardDef => ({"oracleId": "d4c4ad11-7e71-4ad0-aee7-58ac7b1b38f8", "name": "Rescuer Sphinx", "manaCost": "{2}{U}{U}", "cmc": 4, "typeLine": "Creature — Sphinx", "supertypes": [], "types": ["Creature"], "subtypes": ["Sphinx"], "oracleText": "Flying\nAs this creature enters, you may return a nonland permanent you control to its owner's hand. If you do, this creature enters with a +1/+1 counter on it.", "power": "3", "toughness": "2", "colors": ["U"], "colorIdentity": ["U"], "keywords": ["Flying"], "layout": "normal"});
const stadiumVendors = (): CardDef => ({"oracleId": "84904dd3-8987-47c2-b508-f87519157b00", "name": "Stadium Vendors", "manaCost": "{3}{R}", "cmc": 4, "typeLine": "Creature — Goblin", "supertypes": [], "types": ["Creature"], "subtypes": ["Goblin"], "oracleText": "When this creature enters, choose a player. That player adds two mana of any one color they choose.", "power": "3", "toughness": "3", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "producedMana": ["B", "G", "R", "U", "W"], "layout": "normal"});
const grislySigil = (): CardDef => ({"oracleId": "b9d9d118-a073-4e73-90fe-026462d1d895", "name": "Grisly Sigil", "manaCost": "{B}", "cmc": 1, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "Casualty 1 (As you cast this spell, you may sacrifice a creature with power 1 or greater. When you do, copy this spell and you may choose a new target for the copy.)\nChoose target creature or planeswalker. If it was dealt noncombat damage this turn, Grisly Sigil deals 3 damage to it and you gain 3 life. Otherwise, Grisly Sigil deals 1 damage to it and you gain 1 life.", "colors": ["B"], "colorIdentity": ["B"], "keywords": ["Casualty"], "layout": "normal"});
const imaginaryThreats = (): CardDef => ({"oracleId": "b1bc4498-43c0-461c-afba-ef81d743e5aa", "name": "Imaginary Threats", "manaCost": "{2}{U}{U}", "cmc": 4, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Creatures target opponent controls attack this turn if able. During that player's next untap step, creatures they control don't untap.\nCycling {2} ({2}, Discard this card: Draw a card.)", "colors": ["U"], "colorIdentity": ["U"], "keywords": ["Cycling"], "layout": "normal"});
const historiansWisdom = (): CardDef => ({"oracleId": "7c2c460d-8059-41ff-b2d7-374aa498f011", "name": "Historian's Wisdom", "manaCost": "{2}{G}", "cmc": 3, "typeLine": "Enchantment — Aura", "supertypes": [], "types": ["Enchantment"], "subtypes": ["Aura"], "oracleText": "Enchant artifact or creature\nWhen this Aura enters, if enchanted permanent is a creature with the greatest power among creatures on the battlefield, draw a card.\nAs long as enchanted permanent is a creature, it gets +2/+1.", "colors": ["G"], "colorIdentity": ["G"], "keywords": ["Enchant"], "layout": "normal"});
const sunderingArchaic = (): CardDef => ({"oracleId": "b095526e-94a4-416b-83de-d6271804ccf3", "name": "Sundering Archaic", "manaCost": "{6}", "cmc": 6, "typeLine": "Creature — Avatar", "supertypes": [], "types": ["Creature"], "subtypes": ["Avatar"], "oracleText": "Converge — When this creature enters, exile target nonland permanent an opponent controls with mana value less than or equal to the number of colors of mana spent to cast this creature.\n{2}: Put target card from a graveyard on the bottom of its owner's library.", "power": "3", "toughness": "3", "colors": [], "colorIdentity": [], "keywords": ["Converge"], "layout": "normal"});
const transcendentArchaic = (): CardDef => ({"oracleId": "fdd4b3a9-83ce-41bf-82e2-7808657e2c09", "name": "Transcendent Archaic", "manaCost": "{7}", "cmc": 7, "typeLine": "Creature — Avatar", "supertypes": [], "types": ["Creature"], "subtypes": ["Avatar"], "oracleText": "Vigilance\nConverge — When this creature enters, you may draw X cards, where X is the number of colors of mana spent to cast this spell. If you draw one or more cards this way, discard two cards.", "power": "6", "toughness": "6", "colors": [], "colorIdentity": [], "keywords": ["Vigilance", "Converge"], "layout": "normal"});
const tallowisp = (): CardDef => ({"oracleId": "25187c05-ed6a-4690-b92b-89c532fdb780", "name": "Tallowisp", "manaCost": "{1}{W}", "cmc": 2, "typeLine": "Creature — Spirit", "supertypes": [], "types": ["Creature"], "subtypes": ["Spirit"], "oracleText": "Whenever you cast a Spirit or Arcane spell, you may search your library for an Aura card with enchant creature, reveal it, put it into your hand, then shuffle.", "power": "1", "toughness": "3", "colors": ["W"], "colorIdentity": ["W"], "keywords": [], "layout": "normal"});
const ballroomBrawlers = (): CardDef => ({"oracleId": "c87dff29-fa4c-44f4-9de6-d85a347c1720", "name": "Ballroom Brawlers", "manaCost": "{3}{W}{W}", "cmc": 5, "typeLine": "Creature — Human Warrior", "supertypes": [], "types": ["Creature"], "subtypes": ["Human", "Warrior"], "oracleText": "Whenever this creature attacks, this creature and up to one other target creature you control both gain your choice of first strike or lifelink until end of turn.", "power": "3", "toughness": "5", "colors": ["W"], "colorIdentity": ["W"], "keywords": [], "layout": "normal"});
const grimCaptainsCall = (): CardDef => ({"oracleId": "94d3de8c-c8a2-4775-9096-d518f227f09a", "name": "Grim Captain's Call", "manaCost": "{2}{B}", "cmc": 3, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "Return a Pirate card from your graveyard to your hand, then do the same for Vampire, Dinosaur, and Merfolk.", "colors": ["B"], "colorIdentity": ["B"], "keywords": [], "layout": "normal"});
const fertileImagination = (): CardDef => ({"oracleId": "8808595b-5d77-4382-ae1e-9609e1da65ef", "name": "Fertile Imagination", "manaCost": "{2}{G}{G}", "cmc": 4, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "Choose a card type. Target opponent reveals their hand. Create two 1/1 green Saproling creature tokens for each card of the chosen type revealed this way. (Artifact, battle, creature, enchantment, instant, kindred, land, planeswalker, and sorcery are card types.)", "colors": ["G"], "colorIdentity": ["G"], "keywords": [], "layout": "normal"});
const bloodOath = (): CardDef => ({"oracleId": "877c34ca-6eff-42ce-b4d7-8a2071d0290a", "name": "Blood Oath", "manaCost": "{3}{R}", "cmc": 4, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Choose a card type. Target opponent reveals their hand. Blood Oath deals 3 damage to that player for each card of the chosen type revealed this way. (Artifact, battle, creature, enchantment, instant, kindred, land, planeswalker, and sorcery are card types.)", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "layout": "normal"});
const celestialRegulator = (): CardDef => ({"oracleId": "3ee68758-9431-4446-8539-f42f545f3bd0", "name": "Celestial Regulator", "manaCost": "{1}{W}{U}", "cmc": 3, "typeLine": "Creature — Angel Advisor", "supertypes": [], "types": ["Creature"], "subtypes": ["Angel", "Advisor"], "oracleText": "Flying\nWhen this creature enters, choose target creature you don't control and tap it. If you control a creature with a counter on it, the chosen creature doesn't untap during its controller's next untap step.", "power": "2", "toughness": "3", "colors": ["U", "W"], "colorIdentity": ["U", "W"], "keywords": ["Flying"], "layout": "normal"});
const jaggedPoppet = (): CardDef => ({"oracleId": "4beec1a6-a9c6-471f-b6fa-c754a42ad227", "name": "Jagged Poppet", "manaCost": "{1}{B}{R}", "cmc": 3, "typeLine": "Creature — Ogre Warrior", "supertypes": [], "types": ["Creature"], "subtypes": ["Ogre", "Warrior"], "oracleText": "Whenever this creature is dealt damage, discard that many cards.\nHellbent — Whenever this creature deals combat damage to a player, if you have no cards in hand, that player discards cards equal to the damage.", "power": "3", "toughness": "4", "colors": ["B", "R"], "colorIdentity": ["B", "R"], "keywords": ["Hellbent"], "layout": "normal"});
const opt = (): CardDef => ({"oracleId": "713332c1-5bd8-400f-bfff-c1ca0697a043", "name": "Opt", "manaCost": "{U}", "cmc": 1, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card.", "colors": ["U"], "colorIdentity": ["U"], "keywords": ["Scry"], "layout": "normal"});
const solRing = (): CardDef => ({"oracleId": "6ad8011d-3471-4369-9d68-b264cc027487", "name": "Sol Ring", "manaCost": "{1}", "cmc": 1, "typeLine": "Artifact", "supertypes": [], "types": ["Artifact"], "subtypes": [], "oracleText": "{T}: Add {C}{C}.", "colors": [], "colorIdentity": [], "keywords": [], "producedMana": ["C"], "layout": "normal"});
const divination = (): CardDef => ({"oracleId": "273b339c-964b-4a18-8eb5-ceb8abcdfd9e", "name": "Divination", "manaCost": "{2}{U}", "cmc": 3, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "Draw two cards.", "colors": ["U"], "colorIdentity": ["U"], "keywords": [], "layout": "normal"});
const windDrake = (): CardDef => ({"oracleId": "d6ffdaf0-ac08-4de9-bbce-2eab2f86bcca", "name": "Wind Drake", "manaCost": "{2}{U}", "cmc": 3, "typeLine": "Creature — Drake", "supertypes": [], "types": ["Creature"], "subtypes": ["Drake"], "oracleText": "Flying", "power": "2", "toughness": "2", "colors": ["U"], "colorIdentity": ["U"], "keywords": ["Flying"], "layout": "normal"});
const shivanDragon = (): CardDef => ({"oracleId": "711eea87-0fa3-46e0-a42b-fa5a86455f04", "name": "Shivan Dragon", "manaCost": "{4}{R}{R}", "cmc": 6, "typeLine": "Creature — Dragon", "supertypes": [], "types": ["Creature"], "subtypes": ["Dragon"], "oracleText": "Flying\n{R}: This creature gets +1/+0 until end of turn.", "power": "5", "toughness": "5", "colors": ["R"], "colorIdentity": ["R"], "keywords": ["Flying"], "layout": "normal"});
const jaceBeleren = (): CardDef => ({"oracleId": "cc2b6e58-2d6f-495e-95f3-9496105c4cba", "name": "Jace Beleren", "manaCost": "{1}{U}{U}", "cmc": 3, "typeLine": "Legendary Planeswalker — Jace", "supertypes": ["Legendary"], "types": ["Planeswalker"], "subtypes": ["Jace"], "oracleText": "+2: Each player draws a card.\n−1: Target player draws a card.\n−10: Target player mills twenty cards.", "loyalty": "3", "colors": ["U"], "colorIdentity": ["U"], "keywords": ["Mill"], "layout": "normal"});
const holyStrength = (): CardDef => ({"oracleId": "9357de36-f8be-4f49-b2c8-9fe9eaf82b07", "name": "Holy Strength", "manaCost": "{W}", "cmc": 1, "typeLine": "Enchantment — Aura", "supertypes": [], "types": ["Enchantment"], "subtypes": ["Aura"], "oracleText": "Enchant creature\nEnchanted creature gets +1/+2.", "colors": ["W"], "colorIdentity": ["W"], "keywords": ["Enchant"], "layout": "normal"});
const ornithopter = (): CardDef => ({"oracleId": "a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba", "name": "Ornithopter", "manaCost": "{0}", "cmc": 0, "typeLine": "Artifact Creature — Thopter", "supertypes": [], "types": ["Artifact", "Creature"], "subtypes": ["Thopter"], "oracleText": "Flying", "power": "0", "toughness": "2", "colors": [], "colorIdentity": [], "keywords": ["Flying"], "layout": "normal"});
const eliteVanguard = (): CardDef => ({"oracleId": "b3b9a87d-cb95-435c-90b6-037406cab32e", "name": "Elite Vanguard", "manaCost": "{W}", "cmc": 1, "typeLine": "Creature — Human Soldier", "supertypes": [], "types": ["Creature"], "subtypes": ["Human", "Soldier"], "oracleText": "", "power": "2", "toughness": "1", "colors": ["W"], "colorIdentity": ["W"], "keywords": [], "layout": "normal"});
const shock = (): CardDef => ({"oracleId": "a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d", "name": "Shock", "manaCost": "{R}", "cmc": 1, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Shock deals 2 damage to any target.", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "layout": "normal"});
const pacifism = (): CardDef => ({"oracleId": "5f5e0b10-c8cf-450c-bfd3-bcb0528ec330", "name": "Pacifism", "manaCost": "{1}{W}", "cmc": 2, "typeLine": "Enchantment — Aura", "supertypes": [], "types": ["Enchantment"], "subtypes": ["Aura"], "oracleText": "Enchant creature\nEnchanted creature can't attack or block.", "colors": ["W"], "colorIdentity": ["W"], "keywords": ["Enchant"], "layout": "normal"});
const spiritOfTheLabyrinth = (): CardDef => ({"oracleId": "1463795b-ec0c-44d6-ae1a-55f78d9843ec", "name": "Spirit of the Labyrinth", "manaCost": "{1}{W}", "cmc": 2, "typeLine": "Enchantment Creature — Spirit", "supertypes": [], "types": ["Enchantment", "Creature"], "subtypes": ["Spirit"], "oracleText": "Each player can't draw more than one card each turn.", "power": "3", "toughness": "1", "colors": ["W"], "colorIdentity": ["W"], "keywords": [], "layout": "normal"});
const lightningBolt = (): CardDef => ({"oracleId": "4457ed35-7c10-48c8-9776-456485fdf070", "name": "Lightning Bolt", "manaCost": "{R}", "cmc": 1, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Lightning Bolt deals 3 damage to any target.", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "layout": "normal"});
const llanowarElves = (): CardDef => ({"oracleId": "68954295-54e3-4303-a6bc-fc4547a4e3a3", "name": "Llanowar Elves", "manaCost": "{G}", "cmc": 1, "typeLine": "Creature — Elf Druid", "supertypes": [], "types": ["Creature"], "subtypes": ["Elf", "Druid"], "oracleText": "{T}: Add {G}.", "power": "1", "toughness": "1", "colors": ["G"], "colorIdentity": ["G"], "keywords": [], "producedMana": ["G"], "layout": "normal"});
const utopiaSprawl = (): CardDef => ({"oracleId": "00d8efa6-a2d9-4249-8da7-b45173675329", "name": "Utopia Sprawl", "manaCost": "{G}", "cmc": 1, "typeLine": "Enchantment — Aura", "supertypes": [], "types": ["Enchantment"], "subtypes": ["Aura"], "oracleText": "Enchant Forest\nAs this Aura enters, choose a color.\nWhenever enchanted Forest is tapped for mana, its controller adds an additional one mana of the chosen color.", "colors": ["G"], "colorIdentity": ["G"], "keywords": ["Enchant"], "producedMana": ["B", "G", "R", "U", "W"], "layout": "normal"});
const miresToll = (): CardDef => ({"oracleId": "3e0756d8-c2bd-40f1-a281-0828c5a2da03", "name": "Mire's Toll", "manaCost": "{B}", "cmc": 1, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "Target player reveals a number of cards from their hand equal to the number of Swamps you control. You choose one of them. That player discards that card.", "colors": ["B"], "colorIdentity": ["B"], "keywords": [], "layout": "normal"});
const balaGedThief = (): CardDef => ({"oracleId": "3a020ae9-279b-4c6c-8d3d-90d7b335fa3c", "name": "Bala Ged Thief", "manaCost": "{3}{B}", "cmc": 4, "typeLine": "Creature — Human Rogue Ally", "supertypes": [], "types": ["Creature"], "subtypes": ["Human", "Rogue", "Ally"], "oracleText": "Whenever this creature or another Ally you control enters, target player reveals a number of cards from their hand equal to the number of Allies you control. You choose one of them. That player discards that card.", "power": "2", "toughness": "2", "colors": ["B"], "colorIdentity": ["B"], "keywords": [], "layout": "normal"});

describe("Lane B round 77", () => {
  it("all of them are supported", () => {
    supported(discipleOfPhenax(), klawSonicSubjugator(), acquisitionsExpert(), cabalInterrogator(), hollowSpecter(), skyriderPatrol(), devouringHellion(), rescuerSphinx(), stadiumVendors(), grislySigil(), imaginaryThreats(), historiansWisdom(), sunderingArchaic(), transcendentArchaic(), tallowisp(), ballroomBrawlers(), grimCaptainsCall(), fertileImagination(), bloodOath(), celestialRegulator(), jaggedPoppet(), miresToll(), balaGedThief());
  });

  it("Disciple of Phenax: the target player reveals as many cards as your devotion to black, of their choice; you choose one of those to discard", () => {
    const { s: s0, ap, opp, ids } = setup([discipleOfPhenax()]);
    const theirs = handOf(s0, opp, [opt(), solRing(), shivanDragon(), divination()]);
    let s = settle(castNow(s0, ap, ids[0]!), { me: [opp, ap], targets: [[player(opp)]] });
    // Its own {B}{B}: devotion 2 as it resolves (rulings), so two of the four.
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: opp, fromHand: true, reveal: true, revealFor: ap, min: 2, max: 2 });
    expect(() => act(s, { type: "searchLibrary", player: opp, found: [theirs[0]!] })).toThrow();
    s = act(s, { type: "searchLibrary", player: opp, found: [theirs[0]!, theirs[1]!] });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, hand: opp });
    expect([...(s.pending as { cards: string[] }).cards].sort()).toEqual([theirs[0]!, theirs[1]!].sort());
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [theirs[2]!] })).toThrow();
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [theirs[1]!] }));
    expect(zone(s, theirs[1]!)).toBe("graveyard");
    expect(hand(s, opp).sort()).toEqual([theirs[0]!, theirs[2]!, theirs[3]!].sort());
  });

  it("Disciple of Phenax: with no more cards than that, the whole hand is revealed without a choice", () => {
    const { s: s0, ap, opp, ids } = setup([discipleOfPhenax()]);
    const theirs = handOf(s0, opp, [opt(), shivanDragon()]);
    let s = settle(castNow(s0, ap, ids[0]!), { me: [opp, ap], targets: [[player(opp)]] });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, hand: opp });
    expect([...(s.pending as { cards: string[] }).cards].sort()).toEqual([...theirs].sort());
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [theirs[1]!] }));
    expect(hand(s, opp)).toEqual([theirs[0]!]);
  });

  it("Disciple of Phenax: a bot reveals its cheapest cards", () => {
    const { s: s0, ap, opp, ids } = setup([discipleOfPhenax()]);
    const theirs = handOf(s0, opp, [shivanDragon(), opt(), divination(), solRing()]);
    const s = settle(castNow(s0, ap, ids[0]!), { me: [ap], targets: [[player(opp)]] });
    expect([...(s.pending as { cards: string[] }).cards].sort()).toEqual([theirs[1]!, theirs[3]!].sort());
  });

  it("Mire's Toll: as many as the Swamps you control", () => {
    const { s: s0, ap, opp, ids } = setup([miresToll()]);
    const theirs = handOf(s0, opp, [opt(), solRing(), shivanDragon()]);
    // setup() gives two Swamps.
    let s = settle(castNow(s0, ap, ids[0]!, [player(opp)]), { me: [opp, ap] });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: opp, fromHand: true, reveal: true, min: 2, max: 2 });
    s = act(s, { type: "searchLibrary", player: opp, found: [theirs[0]!, theirs[2]!] });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [theirs[2]!] }));
    expect(zone(s, theirs[2]!)).toBe("graveyard");
  });

  it("Klaw, Sonic Subjugator: one plus the creature cards in your graveyard", () => {
    const { s: s0, ap, opp, ids } = setup([klawSonicSubjugator()]);
    const theirs = handOf(s0, opp, [opt(), solRing(), shivanDragon(), divination(), windDrake()]);
    toZone(s0, ap, windDrake(), "graveyard");
    toZone(s0, ap, eliteVanguard(), "graveyard");
    toZone(s0, ap, opt(), "graveyard");
    const s = settle(castNow(s0, ap, ids[0]!), { me: [opp, ap], targets: [[player(opp)]] });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: opp, min: 3, max: 3 });
    expect((s.pending as { cards: string[] }).cards.length).toBe(theirs.length);
  });

  it("Acquisitions Expert: the creatures in your party (itself a Rogue); none with no party", () => {
    const { s: s0, ap, opp, ids } = setup([acquisitionsExpert()]);
    const theirs = handOf(s0, opp, [opt(), solRing(), shivanDragon()]);
    let s = settle(castNow(s0, ap, ids[0]!), { me: [opp, ap], targets: [[player(opp)]] });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: opp, min: 1, max: 1 });
    s = act(s, { type: "searchLibrary", player: opp, found: [theirs[1]!] });
    expect((s.pending as { cards: string[] }).cards).toEqual([theirs[1]!]);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [theirs[1]!] }));
    expect(zone(s, theirs[1]!)).toBe("graveyard");
  });

  it("Cabal Interrogator: X cards revealed; X of 0 reveals nothing", () => {
    const { s: s0, ap, opp } = setup([]);
    const interrogator = putOnBattlefield(s0, ap, cabalInterrogator());
    const theirs = handOf(s0, opp, [opt(), solRing(), shivanDragon(), divination()]);
    const i = abilitiesOf(s0, s0.objects[interrogator]!).activated.findIndex((a) => /reveals X cards/.test(a.text));
    let s = settle(run(s0, planActivate(s0, ap, interrogator, i, [player(opp)], undefined, undefined, 3)), { me: [opp, ap] });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: opp, min: 3, max: 3 });
    s = act(s, { type: "searchLibrary", player: opp, found: [theirs[0]!, theirs[1]!, theirs[3]!] });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [theirs[3]!] }));
    expect(zone(s, theirs[3]!)).toBe("graveyard");

    const { s: t0, ap: ap2, opp: opp2 } = setup([]);
    const i2 = putOnBattlefield(t0, ap2, cabalInterrogator());
    handOf(t0, opp2, [opt(), solRing()]);
    const t = settle(run(t0, planActivate(t0, ap2, i2, i, [player(opp2)], undefined, undefined, 0)), { me: [opp2, ap2] });
    expect(t.pending).toBeNull();
    expect(hand(t, opp2).length).toBe(2);
  });

  it("Hollow Specter: pay X as its combat damage trigger resolves; that player reveals X", () => {
    const { s: s0, ap, opp } = setup([]);
    const specter = putOnBattlefield(s0, ap, hollowSpecter());
    handOf(s0, opp, [opt(), solRing(), shivanDragon(), divination()]);
    let s = attackWith(s0, [specter], opp);
    s = goUntil(s, (x) => x.pending?.kind === "chooseOption" && x.pending.player === ap);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "payX" });
    s = act(s, { type: "chooseOption", player: ap, choice: "2" });
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, C: 2 };
    s = settle(s, { me: [opp, ap] });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: opp, min: 2, max: 2 });
  });

  it("Skyrider Patrol: pay {G}{U} at the beginning of combat, then a counter and flying on another creature you control", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, skyriderPatrol());
    const vanguard = putOnBattlefield(s0, ap, eliteVanguard());
    let s = goUntil(s0, (x) => x.pending?.kind === "chooseMay" && x.pending.player === ap);
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, G: 1, U: 1 };
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), { targets: [[tgt(vanguard)]] });
    expect(s.objects[vanguard]!.counters["+1/+1"]).toBe(1);
    expect(objHasKeyword(s, s.objects[vanguard]!, "Flying")).toBe(true);
  });

  it("Devouring Hellion: sacrifices creatures and planeswalkers as it enters, two counters for each", () => {
    const { s: s0, ap, ids } = setup([devouringHellion()]);
    const a = putOnBattlefield(s0, ap, eliteVanguard());
    const b = putOnBattlefield(s0, ap, eliteVanguard());
    const jace = putOnBattlefield(s0, ap, jaceBeleren());
    s0.objects[jace]!.counters = { loyalty: 3 };
    const sol = putOnBattlefield(s0, ap, solRing());
    let s = settle(castNow(s0, ap, ids[0]!), { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "sacrifice", objectId: ids[0], min: 0 });
    expect([...(s.pending as { options: string[] }).options].sort()).toEqual([a, b, jace].sort());
    expect(s.pending).not.toMatchObject({ options: expect.arrayContaining([sol]) });
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [a, jace] }));
    expect(zone(s, a)).toBe("graveyard");
    expect(zone(s, jace)).toBe("graveyard");
    expect(zone(s, b)).toBe("battlefield");
    expect(pt(s, ids[0]!)).toBe("6/6");
  });

  it("Rescuer Sphinx: returns a nonland permanent as it enters for a +1/+1 counter, or nothing", () => {
    const { s: s0, ap, ids } = setup([rescuerSphinx()]);
    const sol = putOnBattlefield(s0, ap, solRing());
    let s = settle(castNow(s0, ap, ids[0]!), { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "bounce", objectId: ids[0], count: 1, min: 0, options: [sol] });
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [sol] }));
    expect(zone(s, sol)).toBe("hand");
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(1);

    const { s: t0, ap: ap2, ids: ids2 } = setup([rescuerSphinx()]);
    const sol2 = putOnBattlefield(t0, ap2, solRing());
    let t = settle(castNow(t0, ap2, ids2[0]!), { me: [ap2] });
    t = settle(act(t, { type: "pickPermanents", player: ap2, ids: [] }));
    expect(zone(t, sol2)).toBe("battlefield");
    expect(t.objects[ids2[0]!]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(pt(t, ids2[0]!)).toBe("3/2");
  });

  it("Stadium Vendors: the chosen player adds two mana of the color they choose", () => {
    const { s: s0, ap, opp, ids } = setup([stadiumVendors()]);
    let s = settle(castNow(s0, ap, ids[0]!), { me: [ap, opp] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "nthPlayer", player: ap });
    expect((s.pending as { options: string[] }).options.length).toBe(4);
    s = act(s, { type: "chooseOption", player: ap, choice: String(opp) });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "color", player: opp });
    s = act(s, { type: "chooseOption", player: opp, choice: "Red" });
    expect(s.players[opp]!.manaPool.R).toBe(2);
  });

  it("Grisly Sigil: 3 damage and 3 life if the target was dealt noncombat damage this turn, else 1 and 1", () => {
    const { s: s0, ap, opp, ids } = setup([grislySigil(), grislySigil()]);
    const dragon = putOnBattlefield(s0, opp, shivanDragon());
    const drake = putOnBattlefield(s0, opp, windDrake());
    dealDamage(s0, objectSource(s0, s0.objects[drake]!), { object: s0.objects[dragon]! }, 1);
    invalidateCharacteristics(s0);
    const life = s0.players[ap]!.life;
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(dragon)]));
    expect(s.objects[dragon]!.damage).toBe(4);
    expect(s.players[ap]!.life).toBe(life + 3);
    s = settle(castNow(s, ap, ids[1]!, [tgt(drake)]));
    expect(s.objects[drake]!.damage).toBe(1);
    expect(s.players[ap]!.life).toBe(life + 4);
  });

  it("Grisly Sigil: combat damage doesn't count", () => {
    const { s: s0, ap, opp, ids } = setup([grislySigil()]);
    const dragon = putOnBattlefield(s0, opp, shivanDragon());
    dealDamage(s0, objectSource(s0, s0.objects[dragon]!), { object: s0.objects[dragon]! }, 1, { combat: true });
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(dragon)]));
    expect(s.objects[dragon]!.damage).toBe(2);
  });

  it("Imaginary Threats: the target opponent's creatures don't untap during their next untap step", () => {
    const { s: s0, ap, opp, ids } = setup([imaginaryThreats()]);
    const bear = putOnBattlefield(s0, opp, windDrake());
    s0.objects[bear]!.tapped = true;
    let s = settle(castNow(s0, ap, ids[0]!, [player(opp)]));
    s = goUntil(s, (x) => x.activePlayer === opp && x.step === "main1");
    expect(s.objects[bear]!.tapped).toBe(true);
  });

  it("Imaginary Threats: cast in their upkeep, their creatures must attack", () => {
    const { s: s0, ap, opp, ids } = setup([imaginaryThreats()]);
    const drake = putOnBattlefield(s0, opp, windDrake());
    let s = goUntil(s0, (x) => x.activePlayer === opp && x.step === "upkeep" && waitingOn(x) === ap && !x.pending);
    s = settle(castNow(s, ap, ids[0]!, [player(opp)]));
    for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(() => act(s, { type: "declareAttackers", player: opp, attacks: [] })).toThrow();
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: drake, defender: ap }] });
    expect(s.objects[drake]!.attacking).toBeTruthy();
  });

  it("Historian's Wisdom: draws if the enchanted creature then has the greatest power", () => {
    const { s: s0, ap, opp, ids } = setup([historiansWisdom()]);
    const vanguard = putOnBattlefield(s0, ap, eliteVanguard());
    putOnBattlefield(s0, opp, windDrake());
    const n = hand(s0, ap).length;
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(vanguard)]));
    expect(pt(s, vanguard)).toBe("4/2");
    expect(hand(s, ap).length).toBe(n);

    const { s: t0, ap: ap2, opp: opp2, ids: ids2 } = setup([historiansWisdom()]);
    const v2 = putOnBattlefield(t0, ap2, eliteVanguard());
    putOnBattlefield(t0, opp2, shivanDragon());
    const n2 = hand(t0, ap2).length;
    const t = settle(castNow(t0, ap2, ids2[0]!, [tgt(v2)]));
    expect(hand(t, ap2).length).toBe(n2 - 1);
  });

  it("Historian's Wisdom: on an artifact that isn't a creature, no card", () => {
    const { s: s0, ap, ids } = setup([historiansWisdom()]);
    const sol = putOnBattlefield(s0, ap, solRing());
    const n = hand(s0, ap).length;
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(sol)]));
    expect(hand(s, ap).length).toBe(n - 1);
  });

  it("Sundering Archaic: a target with mana value up to the colors spent to cast it", () => {
    const { s: s0, ap, opp, ids } = setup([sunderingArchaic()]);
    poolOnly(s0, ap, { W: 1, U: 1, B: 1, G: 1, C: 2 });
    const dragon = putOnBattlefield(s0, opp, shivanDragon());
    const drake = putOnBattlefield(s0, opp, windDrake());
    let s = settle(castNow(s0, ap, ids[0]!), { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(dragon)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(drake)] }));
    expect(zone(s, drake)).toBe("exile");
  });

  it("Sundering Archaic: cast with colorless mana only, just mana value 0", () => {
    const { s: s0, ap, opp, ids } = setup([sunderingArchaic()]);
    poolOnly(s0, ap, { C: 6 });
    const drake = putOnBattlefield(s0, opp, windDrake());
    const thopter = putOnBattlefield(s0, opp, ornithopter());
    let s = settle(castNow(s0, ap, ids[0]!), { me: [ap] });
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(drake)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(thopter)] }));
    expect(zone(s, thopter)).toBe("exile");
  });

  it("Transcendent Archaic: draw one for each color spent, then discard two; nothing with none", () => {
    const { s: s0, ap, ids } = setup([transcendentArchaic()]);
    poolOnly(s0, ap, { W: 1, U: 1, R: 1, C: 4 });
    const n = hand(s0, ap).length;
    const y = yard(s0, ap).length;
    const s = settle(castNow(s0, ap, ids[0]!));
    expect(hand(s, ap).length).toBe(n - 1 + 3 - 2);
    expect(yard(s, ap).length).toBe(y + 2);

    const { s: t0, ap: ap2, ids: ids2 } = setup([transcendentArchaic()]);
    poolOnly(t0, ap2, { C: 7 });
    const n2 = hand(t0, ap2).length;
    const t = settle(castNow(t0, ap2, ids2[0]!));
    expect(hand(t, ap2).length).toBe(n2 - 1);
  });

  it("Tallowisp: a Spirit spell lets you find an Aura with enchant creature, not one with enchant Forest", () => {
    const { s: s0, ap, ids } = setup([spiritOfTheLabyrinth()]);
    putOnBattlefield(s0, ap, tallowisp());
    const strength = toZone(s0, ap, holyStrength(), "library");
    const pac = toZone(s0, ap, pacifism(), "library");
    const sprawl = toZone(s0, ap, utopiaSprawl(), "library");
    const s = settle(castNow(s0, ap, ids[0]!), { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    const cards = (s.pending as { cards: string[] }).cards;
    expect([...cards].sort()).toEqual([strength, pac].sort());
    expect(cards).not.toContain(sprawl);
  });

  it("Ballroom Brawlers: it and another creature you control both gain the one ability you choose", () => {
    const { s: s0, ap, opp } = setup([]);
    const brawlers = putOnBattlefield(s0, ap, ballroomBrawlers());
    const vanguard = putOnBattlefield(s0, ap, eliteVanguard());
    let s = attackWith(s0, [brawlers], opp);
    s = settle(s, { me: [ap], targets: [[tgt(vanguard)]] });
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(vanguard)] }), { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "keyword", player: ap });
    s = act(s, { type: "chooseOption", player: ap, choice: "Lifelink" });
    for (const id of [brawlers, vanguard]) {
      expect(objHasKeyword(s, s.objects[id]!, "Lifelink")).toBe(true);
      expect(objHasKeyword(s, s.objects[id]!, "First strike")).toBe(false);
    }
  });

  it("Grim Captain's Call: a Pirate, then a Vampire, a Dinosaur and a Merfolk card back to your hand", () => {
    const { s: s0, ap, ids } = setup([grimCaptainsCall()]);
    const kinds = ["Pirate", "Vampire", "Dinosaur", "Merfolk"].map((k) => toZone(s0, ap, card(`Test ${k}`, `Creature — ${k}`, "{1}{B}", { power: "1", toughness: "1" }), "graveyard"));
    const other = toZone(s0, ap, eliteVanguard(), "graveyard");
    const s = settle(castNow(s0, ap, ids[0]!));
    for (const id of kinds) expect(zone(s, id)).toBe("hand");
    expect(zone(s, other)).toBe("graveyard");
  });

  it("Fertile Imagination: two Saprolings for each card of the chosen type in the revealed hand", () => {
    const { s: s0, ap, opp, ids } = setup([fertileImagination()]);
    handOf(s0, opp, [windDrake(), shivanDragon(), opt()]);
    let s = settle(castNow(s0, ap, ids[0]!, [player(opp)]), { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "cardType", player: ap });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Creature" }));
    expect(s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]?.name === "Saproling Token" || characteristics(s, s.objects[id]!).subtypes.includes("Saproling")).length).toBe(4);
  });

  it("Blood Oath: 3 damage for each card of the chosen type", () => {
    const { s: s0, ap, opp, ids } = setup([bloodOath()]);
    handOf(s0, opp, [windDrake(), opt(), divination()]);
    const life = s0.players[opp]!.life;
    let s = settle(castNow(s0, ap, ids[0]!, [player(opp)]), { me: [ap] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Sorcery" }));
    expect(s.players[opp]!.life).toBe(life - 3);
  });

  it("Celestial Regulator: taps the target; it stays tapped only if you control a creature with a counter", () => {
    const { s: s0, ap, opp, ids } = setup([celestialRegulator()]);
    const vanguard = putOnBattlefield(s0, ap, eliteVanguard());
    s0.objects[vanguard]!.counters = { "+1/+1": 1 };
    const drake = putOnBattlefield(s0, opp, windDrake());
    let s = settle(castNow(s0, ap, ids[0]!), { targets: [[tgt(drake)]] });
    expect(s.objects[drake]!.tapped).toBe(true);
    s = goUntil(s, (x) => x.activePlayer === opp && x.step === "main1");
    expect(s.objects[drake]!.tapped).toBe(true);

    const { s: t0, ap: ap2, opp: opp2, ids: ids2 } = setup([celestialRegulator()]);
    const drake2 = putOnBattlefield(t0, opp2, windDrake());
    let t = settle(castNow(t0, ap2, ids2[0]!), { targets: [[tgt(drake2)]] });
    expect(t.objects[drake2]!.tapped).toBe(true);
    t = goUntil(t, (x) => x.activePlayer === opp2 && x.step === "main1");
    expect(t.objects[drake2]!.tapped).toBe(false);
  });

  it("Jagged Poppet: hellbent, the player it deals combat damage to discards that many", () => {
    const { s: s0, ap, opp } = setup([]);
    const poppet = putOnBattlefield(s0, ap, jaggedPoppet());
    handOf(s0, ap, []);
    handOf(s0, opp, [opt(), solRing(), shivanDragon(), divination(), windDrake()]);
    let s = attackWith(s0, [poppet], opp);
    s = goUntil(s, (x) => x.step === "main2");
    expect(hand(s, opp).length).toBe(2);

    const { s: t0, ap: ap2, opp: opp2 } = setup([]);
    const p2 = putOnBattlefield(t0, ap2, jaggedPoppet());
    handOf(t0, ap2, [opt()]);
    handOf(t0, opp2, [opt(), solRing(), shivanDragon(), divination(), windDrake()]);
    let t = attackWith(t0, [p2], opp2);
    t = goUntil(t, (x) => x.step === "main2");
    expect(hand(t, opp2).length).toBe(5);
  });
});
