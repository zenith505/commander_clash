// Lane B, round 80: unsupported cards from the bottom of the popularity list (`npm run popular -- --least`): one-line
// templates (block triggers about the blocker, a dies trigger for creatures blocking ~, counters on abilities from artifact
// sources, a copy of a spell that targets you, rust counters, "creatures don't untap during target player's next untap
// step", the greatest mana value among milled cards, and others).

import { describe, expect, it } from "vitest";
import { act, addEffect, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, controllerOf, destroyPermanent, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PlayerId, type TargetChoice } from "../src";

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
/** Blocks declared by `opp`; every other defending player declares none. */
const block = (s: GameState, opp: PlayerId, blocks: { blocker: string; attacker: string }[]) => {
  s = act(s, { type: "declareBlockers", player: opp, blocks });
  for (let i = 0; i < 10 && s.pending?.kind === "declareBlockers"; i++) s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
  return s;
};

const orderOfTheMirror = (): CardDef => ({"oracleId": "d849be9d-0447-4f0b-a382-3f4ceb98f9a5", "name": "Order of the Mirror // Order of the Alabaster Host", "manaCost": "{1}{U}", "cmc": 2, "typeLine": "Creature — Human Knight // Creature — Phyrexian Knight", "supertypes": [], "types": ["Creature"], "subtypes": ["Human", "Knight"], "oracleText": "{3}{W/P}: Transform this creature. Activate only as a sorcery. ({W/P} can be paid with either {W} or 2 life.)", "power": "2", "toughness": "1", "colors": ["U"], "colorIdentity": ["U", "W"], "keywords": ["Transform"], "layout": "transform", "faces": [{"name": "Order of the Mirror", "manaCost": "{1}{U}", "typeLine": "Creature — Human Knight", "supertypes": [], "types": ["Creature"], "subtypes": ["Human", "Knight"], "oracleText": "{3}{W/P}: Transform this creature. Activate only as a sorcery. ({W/P} can be paid with either {W} or 2 life.)", "power": "2", "toughness": "1", "colors": ["U"]}, {"name": "Order of the Alabaster Host", "manaCost": "", "typeLine": "Creature — Phyrexian Knight", "supertypes": [], "types": ["Creature"], "subtypes": ["Phyrexian", "Knight"], "oracleText": "Whenever this creature becomes blocked by a creature, the blocking creature gets -1/-1 until end of turn.", "power": "3", "toughness": "3", "colors": ["U", "W"], "colorIndicator": ["U", "W"]}]}) as CardDef;
const catacombDragon = (): CardDef => ({"oracleId": "a5e9f72b-7628-4265-8b43-592a0bf678b3", "name": "Catacomb Dragon", "manaCost": "{4}{B}{B}", "cmc": 6, "typeLine": "Creature — Dragon", "supertypes": [], "types": ["Creature"], "subtypes": ["Dragon"], "oracleText": "Flying\nWhenever this creature becomes blocked by a nonartifact, non-Dragon creature, that creature gets -X/-0 until end of turn, where X is half the creature's power, rounded down.", "power": "4", "toughness": "4", "colors": ["B"], "colorIdentity": ["B"], "keywords": ["Flying"], "layout": "normal"}) as CardDef;
const baneblade = (): CardDef => ({"oracleId": "4f5da665-e880-4325-a9e2-6fc4ca1d807a", "name": "Baneblade Scoundrel // Baneclaw Marauder", "manaCost": "{3}{B}", "cmc": 4, "typeLine": "Creature — Human Rogue Werewolf // Creature — Werewolf", "supertypes": [], "types": ["Creature"], "subtypes": ["Human", "Rogue", "Werewolf"], "oracleText": "Whenever this creature becomes blocked, each creature blocking it gets -1/-1 until end of turn.\nDaybound (If a player casts no spells during their own turn, it becomes night next turn.)", "power": "4", "toughness": "3", "colors": ["B"], "colorIdentity": ["B"], "keywords": ["Transform", "Daybound", "Nightbound"], "layout": "transform", "faces": [{"name": "Baneblade Scoundrel", "manaCost": "{3}{B}", "typeLine": "Creature — Human Rogue Werewolf", "supertypes": [], "types": ["Creature"], "subtypes": ["Human", "Rogue", "Werewolf"], "oracleText": "Whenever this creature becomes blocked, each creature blocking it gets -1/-1 until end of turn.\nDaybound (If a player casts no spells during their own turn, it becomes night next turn.)", "power": "4", "toughness": "3", "colors": ["B"]}, {"name": "Baneclaw Marauder", "manaCost": "", "typeLine": "Creature — Werewolf", "supertypes": [], "types": ["Creature"], "subtypes": ["Werewolf"], "oracleText": "Whenever this creature becomes blocked, each creature blocking it gets -1/-1 until end of turn.\nWhenever a creature blocking this creature dies, that creature's controller loses 1 life.\nNightbound (If a player casts at least two spells during their own turn, it becomes day next turn.)", "power": "5", "toughness": "4", "colors": ["B"], "colorIndicator": ["B"]}]}) as CardDef;
const basaltGolem = (): CardDef => ({"oracleId": "9155f78e-0ccc-4e08-ae79-ef5b2db1183f", "name": "Basalt Golem", "manaCost": "{5}", "cmc": 5, "typeLine": "Artifact Creature — Golem", "supertypes": [], "types": ["Artifact", "Creature"], "subtypes": ["Golem"], "oracleText": "This creature can't be blocked by artifact creatures.\nWhenever this creature becomes blocked by a creature, that creature's controller sacrifices it at end of combat. If the player does, they create a 0/2 colorless Wall artifact creature token with defender.", "power": "2", "toughness": "4", "colors": [], "colorIdentity": [], "keywords": [], "layout": "normal"}) as CardDef;
const ayeshaTanaka = (): CardDef => ({"oracleId": "35e4ed0e-8ce2-4729-a009-0d6be8f47663", "name": "Ayesha Tanaka", "manaCost": "{W}{W}{U}{U}", "cmc": 4, "typeLine": "Legendary Creature — Human Artificer", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Human", "Artificer"], "oracleText": "Banding (Any creatures with banding, and up to one without, can attack in a band. Bands are blocked as a group. If any creatures with banding you control are blocking or being blocked by a creature, you divide that creature's combat damage, not its controller, among any of the creatures it's being blocked by or is blocking.)\n{T}: Counter target activated ability from an artifact source unless that ability's controller pays {W}. (Mana abilities can't be targeted.)", "power": "2", "toughness": "2", "colors": ["U", "W"], "colorIdentity": ["U", "W"], "keywords": ["Banding"], "layout": "normal"}) as CardDef;
const oupheVandals = (): CardDef => ({"oracleId": "7bee3848-24e2-4e12-a341-a759214308c0", "name": "Ouphe Vandals", "manaCost": "{2}{G}", "cmc": 3, "typeLine": "Creature — Ouphe Rogue", "supertypes": [], "types": ["Creature"], "subtypes": ["Ouphe", "Rogue"], "oracleText": "{G}, Sacrifice this creature: Counter target activated ability from an artifact source and destroy that artifact if it's on the battlefield. (Mana abilities can't be targeted.)", "power": "2", "toughness": "2", "colors": ["G"], "colorIdentity": ["G"], "keywords": [], "layout": "normal"}) as CardDef;
const mirrorSheen = (): CardDef => ({"oracleId": "d6494704-54b2-4c80-acb4-184c9815c5f3", "name": "Mirror Sheen", "manaCost": "{1}{U/R}{U/R}", "cmc": 3, "typeLine": "Enchantment", "supertypes": [], "types": ["Enchantment"], "subtypes": [], "oracleText": "{1}{U/R}{U/R}: Copy target instant or sorcery spell that targets you. You may choose new targets for the copy.", "colors": ["R", "U"], "colorIdentity": ["R", "U"], "keywords": [], "layout": "normal"}) as CardDef;
const grizzledAngler = (): CardDef => ({"oracleId": "d37effd3-d194-4609-9994-6d70038a68f9", "name": "Grizzled Angler // Grisly Anglerfish", "manaCost": "{2}{U}", "cmc": 3, "typeLine": "Creature — Human // Creature — Eldrazi Fish", "supertypes": [], "types": ["Creature"], "subtypes": ["Human"], "oracleText": "{T}: Mill two cards. Then if there is a colorless creature card in your graveyard, transform this creature. (To mill two cards, put the top two cards of your library into your graveyard.)", "power": "2", "toughness": "3", "colors": ["U"], "colorIdentity": ["U"], "keywords": ["Transform", "Mill"], "layout": "transform", "faces": [{"name": "Grizzled Angler", "manaCost": "{2}{U}", "typeLine": "Creature — Human", "supertypes": [], "types": ["Creature"], "subtypes": ["Human"], "oracleText": "{T}: Mill two cards. Then if there is a colorless creature card in your graveyard, transform this creature. (To mill two cards, put the top two cards of your library into your graveyard.)", "power": "2", "toughness": "3", "colors": ["U"]}, {"name": "Grisly Anglerfish", "manaCost": "", "typeLine": "Creature — Eldrazi Fish", "supertypes": [], "types": ["Creature"], "subtypes": ["Eldrazi", "Fish"], "oracleText": "{6}: Creatures your opponents control attack this turn if able.", "power": "4", "toughness": "5", "colors": []}]}) as CardDef;
const civilizedScholar = (): CardDef => ({"oracleId": "8662c9be-2244-4ea3-bf80-31a117f40a59", "name": "Civilized Scholar // Homicidal Brute", "manaCost": "{2}{U}", "cmc": 3, "typeLine": "Creature — Human Advisor // Creature — Human Mutant", "supertypes": [], "types": ["Creature"], "subtypes": ["Human", "Advisor"], "oracleText": "{T}: Draw a card, then discard a card. If a creature card is discarded this way, untap this creature, then transform it.", "power": "0", "toughness": "1", "colors": ["U"], "colorIdentity": ["R", "U"], "keywords": ["Transform"], "layout": "transform", "faces": [{"name": "Civilized Scholar", "manaCost": "{2}{U}", "typeLine": "Creature — Human Advisor", "supertypes": [], "types": ["Creature"], "subtypes": ["Human", "Advisor"], "oracleText": "{T}: Draw a card, then discard a card. If a creature card is discarded this way, untap this creature, then transform it.", "power": "0", "toughness": "1", "colors": ["U"]}, {"name": "Homicidal Brute", "manaCost": "", "typeLine": "Creature — Human Mutant", "supertypes": [], "types": ["Creature"], "subtypes": ["Human", "Mutant"], "oracleText": "At the beginning of your end step, if this creature didn't attack this turn, tap this creature, then transform it.", "power": "5", "toughness": "1", "colors": ["R"], "colorIndicator": ["R"]}]}) as CardDef;
const corrosion = (): CardDef => ({"oracleId": "3d3fd8a2-78d4-4f52-8fcd-0c6fa93f0043", "name": "Corrosion", "manaCost": "{1}{B}{R}", "cmc": 3, "typeLine": "Enchantment", "supertypes": [], "types": ["Enchantment"], "subtypes": [], "oracleText": "Cumulative upkeep {1} (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)\nAt the beginning of your upkeep, put a rust counter on each artifact target opponent controls. Then destroy each artifact with mana value less than or equal to the number of rust counters on it. Artifacts destroyed this way can't be regenerated.\nWhen this enchantment leaves the battlefield, remove all rust counters from all permanents.", "colors": ["B", "R"], "colorIdentity": ["B", "R"], "keywords": ["Cumulative upkeep"], "layout": "normal"}) as CardDef;
const blindingBeam = (): CardDef => ({"oracleId": "0766cf02-ea55-4271-8c73-213c93b0baac", "name": "Blinding Beam", "manaCost": "{2}{W}", "cmc": 3, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Choose one —\n• Tap two target creatures.\n• Creatures don't untap during target player's next untap step.\nEntwine {1} (Choose both if you pay the entwine cost.)", "colors": ["W"], "colorIdentity": ["W"], "keywords": ["Entwine"], "layout": "normal"}) as CardDef;
const hereticsPunishment = (): CardDef => ({"oracleId": "a484120f-1027-4fc0-b4ea-cba94c262203", "name": "Heretic's Punishment", "manaCost": "{4}{R}", "cmc": 5, "typeLine": "Enchantment", "supertypes": [], "types": ["Enchantment"], "subtypes": [], "oracleText": "{3}{R}: Choose any target, then mill three cards. This enchantment deals damage to that permanent or player equal to the greatest mana value among the milled cards.", "colors": ["R"], "colorIdentity": ["R"], "keywords": ["Mill"], "layout": "normal"}) as CardDef;
const wasp = (): CardDef => ({"oracleId": "002cd9b4-efce-429f-82cd-d37352d2e932", "name": "Wasp, Shrinking Savior", "manaCost": "{2}{U}", "cmc": 3, "typeLine": "Legendary Creature — Human Hero", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Human", "Hero"], "oracleText": "Flying\nWhenever Wasp attacks, up to one other target creature gets -3/-0 until your next turn. Then draw a card for each creature with power less than 0 on the battlefield.", "power": "1", "toughness": "3", "colors": ["U"], "colorIdentity": ["U"], "keywords": ["Flying"], "layout": "normal"}) as CardDef;
const bioplasm = (): CardDef => ({"oracleId": "f39777be-39af-4a97-a70d-824d713bf145", "name": "Bioplasm", "manaCost": "{3}{G}{G}", "cmc": 5, "typeLine": "Creature — Ooze", "supertypes": [], "types": ["Creature"], "subtypes": ["Ooze"], "oracleText": "Whenever this creature attacks, exile the top card of your library. If it's a creature card, this creature gets +X/+Y until end of turn, where X is the exiled creature card's power and Y is its toughness.", "power": "4", "toughness": "4", "colors": ["G"], "colorIdentity": ["G"], "keywords": [], "layout": "normal"}) as CardDef;
const fellShepherd = (): CardDef => ({"oracleId": "5fd78088-53db-453b-90a3-b8426b0a8269", "name": "Fell Shepherd", "manaCost": "{5}{B}{B}", "cmc": 7, "typeLine": "Creature — Avatar", "supertypes": [], "types": ["Creature"], "subtypes": ["Avatar"], "oracleText": "Whenever this creature deals combat damage to a player, you may return to your hand all creature cards that were put into your graveyard from the battlefield this turn.\n{B}, Sacrifice another creature: Target creature gets -2/-2 until end of turn.", "power": "8", "toughness": "6", "colors": ["B"], "colorIdentity": ["B"], "keywords": [], "layout": "normal"}) as CardDef;
const unnaturalHunger = (): CardDef => ({"oracleId": "d37a361e-83e8-4f0a-bd09-3135fb918471", "name": "Unnatural Hunger", "manaCost": "{3}{B}{B}", "cmc": 5, "typeLine": "Enchantment — Aura", "supertypes": [], "types": ["Enchantment"], "subtypes": ["Aura"], "oracleText": "Enchant creature\nAt the beginning of the upkeep of enchanted creature's controller, this Aura deals damage equal to that creature's power to that player unless they sacrifice another creature of their choice.", "colors": ["B"], "colorIdentity": ["B"], "keywords": ["Enchant"], "layout": "normal"}) as CardDef;
const vigorousCharge = (): CardDef => ({"oracleId": "b8ce3f84-2053-4d16-ab3d-e552bd8d0e8c", "name": "Vigorous Charge", "manaCost": "{G}", "cmc": 1, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Kicker {W} (You may pay an additional {W} as you cast this spell.)\nTarget creature gains trample until end of turn. Whenever that creature deals combat damage this turn, if this spell was kicked, you gain life equal to that damage.", "colors": ["G"], "colorIdentity": ["G", "W"], "keywords": ["Kicker"], "layout": "normal"}) as CardDef;
const fathomTrawl = (): CardDef => ({"oracleId": "7b002cae-ee7d-400d-af9c-445eb10f1f0c", "name": "Fathom Trawl", "manaCost": "{3}{U}{U}", "cmc": 5, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "Reveal cards from the top of your library until you reveal three nonland cards. Put the nonland cards revealed this way into your hand, then put the rest of the revealed cards on the bottom of your library in any order.", "colors": ["U"], "colorIdentity": ["U"], "keywords": [], "layout": "normal"}) as CardDef;
const bears = (): CardDef => ({"oracleId": "14c8f55d-d177-4c25-a931-ebeb9e6062a0", "name": "Grizzly Bears", "manaCost": "{1}{G}", "cmc": 2, "typeLine": "Creature — Bear", "supertypes": [], "types": ["Creature"], "subtypes": ["Bear"], "oracleText": "", "power": "2", "toughness": "2", "colors": ["G"], "colorIdentity": ["G"], "keywords": [], "layout": "normal"}) as CardDef;
const solRing = (): CardDef => ({"oracleId": "6ad8011d-3471-4369-9d68-b264cc027487", "name": "Sol Ring", "manaCost": "{1}", "cmc": 1, "typeLine": "Artifact", "supertypes": [], "types": ["Artifact"], "subtypes": [], "oracleText": "{T}: Add {C}{C}.", "colors": [], "colorIdentity": [], "keywords": [], "producedMana": ["C"], "layout": "normal"}) as CardDef;
const rodOfRuin = (): CardDef => ({"oracleId": "c29a04ab-4e14-45d8-a993-3fffd0e2f6eb", "name": "Rod of Ruin", "manaCost": "{4}", "cmc": 4, "typeLine": "Artifact", "supertypes": [], "types": ["Artifact"], "subtypes": [], "oracleText": "{3}, {T}: This artifact deals 1 damage to any target.", "colors": [], "colorIdentity": [], "keywords": [], "layout": "normal"}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId": "a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba", "name": "Ornithopter", "manaCost": "{0}", "cmc": 0, "typeLine": "Artifact Creature — Thopter", "supertypes": [], "types": ["Artifact", "Creature"], "subtypes": ["Thopter"], "oracleText": "Flying", "power": "0", "toughness": "2", "colors": [], "colorIdentity": [], "keywords": ["Flying"], "layout": "normal"}) as CardDef;
const lightningBolt = (): CardDef => ({"oracleId": "4457ed35-7c10-48c8-9776-456485fdf070", "name": "Lightning Bolt", "manaCost": "{R}", "cmc": 1, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Lightning Bolt deals 3 damage to any target.", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "layout": "normal"}) as CardDef;
const giantGrowth = (): CardDef => ({"oracleId": "5748ebf1-24e3-499d-ab7c-c2cebd462a24", "name": "Giant Growth", "manaCost": "{G}", "cmc": 1, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Target creature gets +3/+3 until end of turn.", "colors": ["G"], "colorIdentity": ["G"], "keywords": [], "layout": "normal"}) as CardDef;
const seedbornMuse = (): CardDef => ({"oracleId": "463865bc-087e-477b-9e86-84e77f1ad931", "name": "Seedborn Muse", "manaCost": "{3}{G}{G}", "cmc": 5, "typeLine": "Creature — Spirit", "supertypes": [], "types": ["Creature"], "subtypes": ["Spirit"], "oracleText": "Untap all permanents you control during each other player's untap step.", "power": "2", "toughness": "4", "colors": ["G"], "colorIdentity": ["G"], "keywords": [], "layout": "normal"}) as CardDef;
const eldraziDevastator = (): CardDef => ({"oracleId": "bc08ac66-969c-4905-a2d6-16ff565be475", "name": "Eldrazi Devastator", "manaCost": "{8}", "cmc": 8, "typeLine": "Creature — Eldrazi", "supertypes": [], "types": ["Creature"], "subtypes": ["Eldrazi"], "oracleText": "Trample", "power": "8", "toughness": "9", "colors": [], "colorIdentity": [], "keywords": ["Trample"], "layout": "normal"}) as CardDef;
const hillGiant = (): CardDef => ({"oracleId": "342199e0-15b6-4824-83da-25caef2592b3", "name": "Hill Giant", "manaCost": "{3}{R}", "cmc": 4, "typeLine": "Creature — Giant", "supertypes": [], "types": ["Creature"], "subtypes": ["Giant"], "oracleText": "", "power": "3", "toughness": "3", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "layout": "normal"}) as CardDef;
const divination = (): CardDef => ({"oracleId": "273b339c-964b-4a18-8eb5-ceb8abcdfd9e", "name": "Divination", "manaCost": "{2}{U}", "cmc": 3, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "Draw two cards.", "colors": ["U"], "colorIdentity": ["U"], "keywords": [], "layout": "normal"}) as CardDef;
const island = (): CardDef => ({"oracleId": "b2c6aa39-2d2a-459c-a555-fb48ba993373", "name": "Island", "manaCost": "", "cmc": 0, "typeLine": "Basic Land — Island", "supertypes": ["Basic"], "types": ["Land"], "subtypes": ["Island"], "oracleText": "({T}: Add {U}.)", "colors": [], "colorIdentity": ["U"], "keywords": [], "producedMana": ["U"], "layout": "normal"}) as CardDef;
const serraAngel = (): CardDef => ({"oracleId": "4b7ac066-e5c7-43e6-9e7e-2739b24a905d", "name": "Serra Angel", "manaCost": "{3}{W}{W}", "cmc": 5, "typeLine": "Creature — Angel", "supertypes": [], "types": ["Creature"], "subtypes": ["Angel"], "oracleText": "Flying\nVigilance (Attacking doesn't cause this creature to tap.)", "power": "4", "toughness": "4", "colors": ["W"], "colorIdentity": ["W"], "keywords": ["Flying", "Vigilance"], "layout": "normal"}) as CardDef;
const darksteelMyr = (): CardDef => ({"oracleId": "f90fe86c-5cca-483b-93c2-6e856fa01c88", "name": "Darksteel Myr", "manaCost": "{3}", "cmc": 3, "typeLine": "Artifact Creature — Myr", "supertypes": [], "types": ["Artifact", "Creature"], "subtypes": ["Myr"], "oracleText": "Indestructible (Damage and effects that say \"destroy\" don't destroy this creature. If its toughness is 0 or less, it still dies.)", "power": "0", "toughness": "1", "colors": [], "colorIdentity": [], "keywords": ["Indestructible"], "layout": "normal"}) as CardDef;
const prodigalSorcerer = (): CardDef => ({"oracleId": "5e961d15-5972-4e4b-9385-1cd7cd7c6bbe", "name": "Prodigal Sorcerer", "manaCost": "{2}{U}", "cmc": 3, "typeLine": "Creature — Human Wizard Sorcerer", "supertypes": [], "types": ["Creature"], "subtypes": ["Human", "Wizard", "Sorcerer"], "oracleText": "{T}: This creature deals 1 damage to any target.", "power": "1", "toughness": "1", "colors": ["U"], "colorIdentity": ["U"], "keywords": [], "layout": "normal"}) as CardDef;
const wurmcoil = (): CardDef => ({"oracleId": "d1a60f44-7696-49ee-91fb-cab5b3102962", "name": "Wurmcoil Engine", "manaCost": "{6}", "cmc": 6, "typeLine": "Artifact Creature — Phyrexian Wurm", "supertypes": [], "types": ["Artifact", "Creature"], "subtypes": ["Phyrexian", "Wurm"], "oracleText": "Deathtouch, lifelink\nWhen this creature dies, create a 3/3 colorless Phyrexian Wurm artifact creature token with deathtouch and a 3/3 colorless Phyrexian Wurm artifact creature token with lifelink.", "power": "6", "toughness": "6", "colors": [], "colorIdentity": [], "keywords": ["Lifelink", "Deathtouch"], "layout": "normal"}) as CardDef;

/** Plays on to `pid`'s next upkeep, its triggers on the stack or asking. */
const toNextUpkeep = (s: GameState, pid: PlayerId) => {
  const turn = s.turn;
  return goUntil(s, (x) => x.turn > turn && x.activePlayer === pid && x.step === "upkeep" && (x.stack.length > 0 || !!x.pending));
};
const attach = (s: GameState, pid: PlayerId, def: CardDef, to: string) => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.attachedTo = to;
  invalidateCharacteristics(s);
  return id;
};
/** Passes (resolving what's on the stack the way settle does) until `pid` is asked to declare blockers. */
const toBlocks = (s: GameState, opts: { targets?: TargetChoice[][] } = {}) => {
  for (let i = 0; i < 100 && s.pending?.kind !== "declareBlockers"; i++) {
    if (s.stack.length || s.pending) s = settle(s, opts);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const lifeOf = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
/** A creature card on top of `pid`'s library, the first of `defs` ending on top. */
const stackLibrary = (s: GameState, pid: PlayerId, defs: CardDef[]) => [...defs].reverse().map((d) => toZone(s, pid, d, "library")).reverse();

describe("Lane B round 80", () => {
  it("all of them are supported", () => {
    supported(orderOfTheMirror(), catacombDragon(), baneblade(), basaltGolem(), ayeshaTanaka(), oupheVandals(), mirrorSheen(), grizzledAngler(), civilizedScholar(), corrosion(), blindingBeam(), hereticsPunishment(), wasp(), bioplasm(), fellShepherd(), unnaturalHunger(), vigorousCharge(), fathomTrawl());
  });

  it("Order of the Alabaster Host: the creature blocking it gets -1/-1", () => {
    const { s: s0, ap, opp } = setup([]);
    const host = putOnBattlefield(s0, ap, orderOfTheMirror());
    s0.objects[host]!.face = 1;
    const giant = putOnBattlefield(s0, opp, hillGiant());
    invalidateCharacteristics(s0);
    let s = toBlocks(attackWith(s0, [host], opp));
    s = settle(block(s, opp, [{ blocker: giant, attacker: host }]));
    expect(pt(s, giant)).toBe("2/2");
  });

  it("Catacomb Dragon: a nonartifact, non-Dragon blocker gets -X/-0, X half its power rounded down, fixed as it resolves", () => {
    const { s: s0, ap, opp } = setup([]);
    const dragon = putOnBattlefield(s0, ap, catacombDragon());
    const angel = putOnBattlefield(s0, opp, serraAngel());
    const thopter = putOnBattlefield(s0, opp, ornithopter());
    let s = toBlocks(attackWith(s0, [dragon], opp));
    s = settle(block(s, opp, [{ blocker: angel, attacker: dragon }, { blocker: thopter, attacker: dragon }]));
    // Serra Angel 4/4: -2/-0. The artifact Ornithopter doesn't trigger it.
    expect(pt(s, angel)).toBe("2/4");
    expect(pt(s, thopter)).toBe("0/2");
    // X was 2 as it resolved: a later +2/+0 doesn't change it.
    addEffect(s, opp, [angel], [{ kind: "modifyPT", power: 2, toughness: 0 }]);
    expect(pt(s, angel)).toBe("4/4");
  });

  it("Catacomb Dragon: a Dragon blocking it isn't affected", () => {
    const { s: s0, ap, opp } = setup([]);
    const dragon = putOnBattlefield(s0, ap, catacombDragon());
    const other = putOnBattlefield(s0, opp, catacombDragon());
    let s = toBlocks(attackWith(s0, [dragon], opp));
    s = settle(block(s, opp, [{ blocker: other, attacker: dragon }]));
    expect(pt(s, other)).toBe("4/4");
  });

  it("Baneclaw Marauder: a creature blocking it that dies makes its controller lose 1 life", () => {
    const { s: s0, ap, opp } = setup([]);
    s0.dayNight = "night";
    const claw = putOnBattlefield(s0, ap, baneblade());
    s0.objects[claw]!.face = 1;
    const bear = putOnBattlefield(s0, opp, bears());
    const giant = putOnBattlefield(s0, opp, hillGiant());
    invalidateCharacteristics(s0);
    expect(pt(s0, claw)).toBe("5/4");
    let s = toBlocks(attackWith(s0, [claw], opp));
    s = settle(block(s, opp, [{ blocker: bear, attacker: claw }]));
    // Each creature blocking it got -1/-1.
    expect(pt(s, bear)).toBe("1/1");
    const before = lifeOf(s, opp);
    s = goUntil(s, (x) => x.step === "endCombat");
    s = settle(s);
    expect(zone(s, bear)).toBe("graveyard");
    expect(lifeOf(s, opp)).toBe(before - 1);
    // A creature that wasn't blocking it dies: nothing.
    const life = lifeOf(s, opp);
    destroyPermanent(s, s.objects[giant]!, "test");
    s = settle(s);
    expect(zone(s, giant)).toBe("graveyard");
    expect(lifeOf(s, opp)).toBe(life);
  });

  it("Basalt Golem: the blocker's controller sacrifices it at end of combat and gets a 0/2 Wall", () => {
    const { s: s0, ap, opp } = setup([]);
    const golem = putOnBattlefield(s0, ap, basaltGolem());
    const giant = putOnBattlefield(s0, opp, hillGiant());
    let s = toBlocks(attackWith(s0, [golem], opp));
    s = settle(block(s, opp, [{ blocker: giant, attacker: golem }]));
    expect(zone(s, giant)).toBe("battlefield");
    s = goUntil(s, (x) => x.step === "endCombat" && (x.stack.length > 0 || x.step !== "endCombat"));
    s = settle(s);
    expect(zone(s, giant)).toBe("graveyard");
    const walls = s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Wall"));
    expect(walls.length).toBe(1);
    expect(controllerOf(s, s.objects[walls[0]!]!)).toBe(opp);
    expect(pt(s, walls[0]!)).toBe("0/2");
  });

  it("Basalt Golem: no Wall if the blocker is already gone at end of combat (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const golem = putOnBattlefield(s0, ap, basaltGolem());
    const bear = putOnBattlefield(s0, opp, bears());
    let s = toBlocks(attackWith(s0, [golem], opp));
    s = settle(block(s, opp, [{ blocker: bear, attacker: golem }]));
    s = goUntil(s, (x) => x.step === "endCombat" && (x.stack.length > 0 || x.step !== "endCombat"));
    s = settle(s);
    // The Bears died in combat: nothing to sacrifice, no token.
    expect(zone(s, bear)).toBe("graveyard");
    expect(s.battlefield.some((id) => s.objects[id]!.isToken)).toBe(false);
  });

  /** `ap` activates Rod of Ruin at `opp`; then `opp` has priority. */
  const rodAt = (s0: GameState, ap: PlayerId, opp: PlayerId) => {
    const rod = putOnBattlefield(s0, ap, rodOfRuin());
    let s = run(s0, planActivate(s0, ap, rod, 0, [player(opp)]));
    s = act(s, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(opp);
    return { s, rod, ability: s.stack[s.stack.length - 1]!.id };
  };

  it("Ayesha Tanaka: counters an artifact's activated ability unless that ability's controller pays {W}", () => {
    const { s: s0, ap, opp } = setup([]);
    const ayesha = putOnBattlefield(s0, opp, ayeshaTanaka());
    const r = rodAt(s0, ap, opp);
    let s = run(r.s, planActivate(r.s, opp, ayesha, 0, [{ kind: "stack", id: r.ability }]));
    s = settle(s, { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "payUnless", player: ap, cost: "{W}" });
    const life = lifeOf(s, opp);
    s = settle(act(s, { type: "payUnless", player: ap, pay: false }));
    expect(s.stack.length).toBe(0);
    expect(lifeOf(s, opp)).toBe(life);
  });

  it("Ayesha Tanaka: paid for, the ability resolves; a creature's ability can't be targeted", () => {
    {
      const { s: s0, ap, opp } = setup([]);
      const ayesha = putOnBattlefield(s0, opp, ayeshaTanaka());
      const sorcerer = putOnBattlefield(s0, ap, prodigalSorcerer());
      let s = run(s0, planActivate(s0, ap, sorcerer, 0, [player(opp)]));
      s = act(s, { type: "passPriority", player: ap });
      expect(planActivate(s, opp, ayesha, 0, [{ kind: "stack", id: s.stack[s.stack.length - 1]!.id }])).toBeNull();
    }
    const { s: s0, ap, opp } = setup([]);
    const ayesha = putOnBattlefield(s0, opp, ayeshaTanaka());
    const r = rodAt(s0, ap, opp);
    let s = run(r.s, planActivate(r.s, opp, ayesha, 0, [{ kind: "stack", id: r.ability }]));
    s = settle(s, { me: [ap] });
    const life = lifeOf(s, opp);
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, W: 1 };
    s = settle(act(s, { type: "payUnless", player: ap, pay: true }));
    expect(lifeOf(s, opp)).toBe(life - 1);
  });

  it("Ouphe Vandals: counters an artifact's ability and destroys that artifact", () => {
    const { s: s0, ap, opp } = setup([]);
    const ouphe = putOnBattlefield(s0, opp, oupheVandals());
    const r = rodAt(s0, ap, opp);
    r.s.players[opp]!.manaPool = { ...r.s.players[opp]!.manaPool, G: 1 };
    const life = lifeOf(r.s, opp);
    let s = run(r.s, planActivate(r.s, opp, ouphe, 0, [{ kind: "stack", id: r.ability }]));
    s = settle(s);
    expect(zone(s, ouphe)).toBe("graveyard");
    expect(zone(s, r.rod)).toBe("graveyard");
    expect(lifeOf(s, opp)).toBe(life);
  });

  it("Mirror Sheen: copies an instant or sorcery spell that targets you, with new targets", () => {
    const { s: s0, ap, opp, ids } = setup([lightningBolt(), lightningBolt()]);
    const sheen = putOnBattlefield(s0, ap, mirrorSheen());
    // A spell that doesn't target you can't be chosen.
    let s = run(s0, planCast(s0, ap, ids[0]!, [player(opp)]));
    const atOpp = s.stack[s.stack.length - 1]!.id;
    expect(planActivate(s, ap, sheen, 0, [{ kind: "stack", id: atOpp }])).toBeNull();
    s = settle(s);
    const oppLife = lifeOf(s, opp);
    const myLife = lifeOf(s, ap);
    s = run(s, planCast(s, ap, ids[1]!, [player(ap)]));
    const atMe = s.stack[s.stack.length - 1]!.id;
    s = run(s, planActivate(s, ap, sheen, 0, [{ kind: "stack", id: atMe }]));
    s = settle(s, { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "copyTargets", player: ap });
    s = settle(act(s, { type: "copyTargets", player: ap, targets: [player(opp)] }));
    expect(lifeOf(s, opp)).toBe(oppLife - 3);
    expect(lifeOf(s, ap)).toBe(myLife - 3);
  });

  it("Grizzled Angler: transforms once a colorless creature card is in your graveyard", () => {
    const { s: s0, ap } = setup([]);
    const angler = putOnBattlefield(s0, ap, grizzledAngler());
    stackLibrary(s0, ap, [bears(), bears(), eldraziDevastator(), island()]);
    // Two green Bears: no.
    let s = settle(run(s0, planActivate(s0, ap, angler, 0)));
    expect(s.objects[angler]!.face ?? 0).toBe(0);
    s.objects[angler]!.tapped = false;
    s = settle(run(s, planActivate(s, ap, angler, 0)));
    expect(zone(s, s.players[ap]!.graveyard.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Eldrazi Devastator")!)).toBe("graveyard");
    expect(s.objects[angler]!.face).toBe(1);
    expect(characteristics(s, s.objects[angler]!).name).toBe("Grisly Anglerfish");
  });

  it("Civilized Scholar: discarding a creature card untaps it and transforms it", () => {
    const { s: s0, ap } = setup([]);
    const scholar = putOnBattlefield(s0, ap, civilizedScholar());
    handOf(s0, ap, []);
    const [giantCard] = stackLibrary(s0, ap, [hillGiant()]);
    // The only card in hand is the one drawn: it's discarded, no choice.
    const s = settle(run(s0, planActivate(s0, ap, scholar, 0)));
    expect(zone(s, giantCard!)).toBe("graveyard");
    expect(s.objects[scholar]!.tapped).toBe(false);
    expect(s.objects[scholar]!.face).toBe(1);
    expect(pt(s, scholar)).toBe("5/1");
  });

  it("Civilized Scholar: discarding a land leaves it tapped and unchanged", () => {
    const { s: s0, ap } = setup([]);
    const scholar = putOnBattlefield(s0, ap, civilizedScholar());
    handOf(s0, ap, []);
    const [land] = stackLibrary(s0, ap, [island()]);
    const s = settle(run(s0, planActivate(s0, ap, scholar, 0)));
    expect(zone(s, land!)).toBe("graveyard");
    expect(s.objects[scholar]!.tapped).toBe(true);
    expect(s.objects[scholar]!.face ?? 0).toBe(0);
  });

  it("Corrosion: rust counters on the target opponent's artifacts, then each artifact with mana value up to its rust counters is destroyed", () => {
    const { s: s0, ap, opp } = setup([]);
    handOf(s0, ap, []);
    putOnBattlefield(s0, ap, corrosion());
    const thopter = putOnBattlefield(s0, opp, ornithopter());
    const ring = putOnBattlefield(s0, opp, solRing());
    const myr = putOnBattlefield(s0, opp, darksteelMyr());
    const wurm = putOnBattlefield(s0, opp, wurmcoil());
    // Yours too, with enough rust counters (rulings).
    const rod = putOnBattlefield(s0, ap, rodOfRuin());
    s0.objects[rod]!.counters.rust = 4;
    let s = toNextUpkeep(s0, ap);
    // Mana for the cumulative upkeep.
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, C: 1 };
    s = settle(s, { targets: [[player(opp)]] });
    expect(zone(s, thopter)).toBe("graveyard");
    expect(zone(s, ring)).toBe("graveyard");
    expect(zone(s, rod)).toBe("graveyard");
    // Darksteel Myr is indestructible; Wurmcoil Engine has one counter and mana value 6.
    expect(zone(s, myr)).toBe("battlefield");
    expect(s.objects[wurm]!.counters.rust).toBe(1);
    expect(zone(s, wurm)).toBe("battlefield");
    // It leaves: all rust counters are removed.
    const corr = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Corrosion")!;
    destroyPermanent(s, s.objects[corr]!, "test");
    s = settle(s);
    expect(s.objects[myr]!.counters.rust ?? 0).toBe(0);
    expect(s.objects[wurm]!.counters.rust ?? 0).toBe(0);
  });

  it("Blinding Beam: creatures don't untap during that player's next untap step, another player's included (Seedborn Muse)", () => {
    const { s: s0, ap, opp, ids } = setup([blindingBeam()]);
    const theirBear = putOnBattlefield(s0, opp, bears());
    s0.objects[theirBear]!.tapped = true;
    const third = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    const muse = putOnBattlefield(s0, third, seedbornMuse());
    const thirdGiant = putOnBattlefield(s0, third, hillGiant());
    const thirdIsland = putOnBattlefield(s0, third, island());
    s0.objects[thirdGiant]!.tapped = true;
    s0.objects[thirdIsland]!.tapped = true;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [player(opp)], [1])));
    s = goUntil(s, (x) => x.activePlayer === opp && x.step === "upkeep");
    expect(s.objects[theirBear]!.tapped).toBe(true);
    // Seedborn Muse untaps its controller's land, not their creature.
    expect(s.objects[thirdIsland]!.tapped).toBe(false);
    expect(s.objects[thirdGiant]!.tapped).toBe(true);
    expect(zone(s, muse)).toBe("battlefield");
    // Their next untap step after that: untapped as usual.
    s = goUntil(s, (x) => x.activePlayer === third && x.step === "upkeep");
    expect(s.objects[thirdGiant]!.tapped).toBe(false);
  });

  it("Blinding Beam: entwined, it taps two creatures too", () => {
    const { s: s0, ap, opp, ids } = setup([blindingBeam()]);
    const a = putOnBattlefield(s0, opp, bears());
    const b = putOnBattlefield(s0, opp, hillGiant());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(a), tgt(b), player(opp)], [0, 1])));
    expect(s.objects[a]!.tapped).toBe(true);
    expect(s.objects[b]!.tapped).toBe(true);
    expect(s.players[opp]!.noUntapNextAll).toEqual(["Creature"]);
  });

  it("Heretic's Punishment: mills three, then damage equal to the greatest mana value among them", () => {
    const { s: s0, ap, opp } = setup([]);
    const hp = putOnBattlefield(s0, ap, hereticsPunishment());
    stackLibrary(s0, ap, [bears(), hillGiant(), island()]);
    const life = lifeOf(s0, opp);
    const s = settle(run(s0, planActivate(s0, ap, hp, 0, [player(opp)])));
    expect(s.players[ap]!.graveyard.length).toBe(3);
    expect(lifeOf(s, opp)).toBe(life - 4);
  });

  it("Wasp: -3/-0 until your next turn, then a card for each creature with power less than 0", () => {
    const { s: s0, ap, opp } = setup([]);
    const w = putOnBattlefield(s0, ap, wasp());
    const bear = putOnBattlefield(s0, opp, bears());
    putOnBattlefield(s0, opp, ornithopter());
    const hand0 = hand(s0, ap).length;
    let s = attackWith(s0, [w], opp);
    s = settle(s, { targets: [[tgt(bear)]] });
    expect(pt(s, bear)).toBe("-1/2");
    // Only the Bears is below 0 (Ornithopter has 0 power).
    expect(hand(s, ap).length).toBe(hand0 + 1);
    s = goUntil(s, (x) => x.activePlayer === opp && x.step === "main1");
    expect(pt(s, bear)).toBe("-1/2");
  });

  it("Bioplasm: gets +X/+Y for an exiled creature card, nothing for a land", () => {
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, ap, bioplasm());
    stackLibrary(s0, ap, [hillGiant()]);
    let s = settle(attackWith(s0, [b], opp));
    expect(pt(s, b)).toBe("7/7");
    const { s: t0, ap: ap2, opp: opp2 } = setup([]);
    const b2 = putOnBattlefield(t0, ap2, bioplasm());
    stackLibrary(t0, ap2, [island()]);
    s = settle(attackWith(t0, [b2], opp2));
    expect(pt(s, b2)).toBe("4/4");
    expect(s.players[ap2]!.exile.some((id) => s.cards[s.objects[id]!.cardId]!.name === "Island")).toBe(true);
  });

  it("Fell Shepherd: returns the creature cards put into your graveyard from the battlefield this turn", () => {
    const { s: s0, ap, opp, ids } = setup([lightningBolt()]);
    const shepherd = putOnBattlefield(s0, ap, fellShepherd());
    const bear = putOnBattlefield(s0, ap, bears());
    const discarded = toZone(s0, ap, hillGiant(), "graveyard");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(bear)])));
    const bearCard = s.players[ap]!.graveyard.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Grizzly Bears")!;
    expect(bearCard).toBeTruthy();
    s = attackWith(s, [shepherd], opp);
    s = goUntil(s, (x) => !!x.pending && x.pending.kind === "chooseMay");
    s = settle(s, { may: true });
    expect(zone(s, bearCard)).toBe("hand");
    // A card put there from elsewhere stays (rulings).
    expect(zone(s, discarded)).toBe("graveyard");
  });

  it("Unnatural Hunger: damage equal to the creature's power to its controller unless they sacrifice another creature", () => {
    const { s: s0, ap, opp } = setup([]);
    const giant = putOnBattlefield(s0, opp, hillGiant());
    attach(s0, ap, unnaturalHunger(), giant);
    const life = lifeOf(s0, opp);
    // With no other creature, no choice: 3 damage.
    let s = goUntil(s0, (x) => x.activePlayer === opp && x.step === "upkeep" && x.stack.length > 0);
    s = settle(s);
    expect(lifeOf(s, opp)).toBe(life - 3);
    expect(zone(s, giant)).toBe("battlefield");
  });

  it("Unnatural Hunger: another creature can be sacrificed instead, not the enchanted one", () => {
    const { s: s0, ap, opp } = setup([]);
    const giant = putOnBattlefield(s0, opp, hillGiant());
    const bear = putOnBattlefield(s0, opp, bears());
    attach(s0, ap, unnaturalHunger(), giant);
    const life = lifeOf(s0, opp);
    let s = goUntil(s0, (x) => x.activePlayer === opp && x.step === "upkeep" && x.stack.length > 0);
    s = settle(s, { me: [opp] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "punisher", player: opp });
    const opt = (s.pending as { options: string[] }).options.find((o) => o !== "none")!;
    s = settle(act(s, { type: "chooseOption", player: opp, choice: opt }), { me: [opp] });
    if (s.pending?.kind === "pickPermanents") {
      expect(s.pending.options).toEqual([bear]);
      s = act(s, { type: "pickPermanents", player: opp, ids: [bear] });
    }
    s = settle(s);
    expect(zone(s, bear)).toBe("graveyard");
    expect(zone(s, giant)).toBe("battlefield");
    expect(lifeOf(s, opp)).toBe(life);
  });

  it("Vigorous Charge: kicked, you gain life equal to that creature's combat damage this turn", () => {
    const { s: s0, ap, opp, ids } = setup([vigorousCharge()]);
    const giant = putOnBattlefield(s0, ap, hillGiant());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(giant)], { kicks: [0] }));
    expect(characteristics(s, s.objects[giant]!).keywords).toContain("Trample");
    const life = lifeOf(s, ap);
    s = attackWith(s, [giant], opp);
    s = goUntil(s, (x) => x.step === "endCombat");
    s = settle(s);
    expect(lifeOf(s, ap)).toBe(life + 3);
  });

  it("Vigorous Charge: not kicked, trample only", () => {
    const { s: s0, ap, opp, ids } = setup([vigorousCharge()]);
    const giant = putOnBattlefield(s0, ap, hillGiant());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(giant)]));
    const life = lifeOf(s, ap);
    s = attackWith(s, [giant], opp);
    s = goUntil(s, (x) => x.step === "endCombat");
    s = settle(s);
    expect(lifeOf(s, ap)).toBe(life);
    expect(s.floatingTriggers ?? []).toEqual([]);
  });

  it("Fathom Trawl: three nonland cards to hand, the rest on the bottom in the order you choose", () => {
    const { s: s0, ap, ids } = setup([fathomTrawl()]);
    const [isleA, bear, isleB, div, giant] = stackLibrary(s0, ap, [island(), bears(), island(), divination(), hillGiant(), island()]);
    let s = run(s0, planCast(s0, ap, ids[0]!, []));
    s = settle(s, { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "arrangeTop", how: "bottom", player: ap });
    expect([...(s.pending as { cards: string[] }).cards].sort()).toEqual([isleA!, isleB!].sort());
    s = settle(act(s, { type: "arrangeTop", player: ap, top: [isleB!, isleA!], away: [] }));
    for (const id of [bear, div, giant]) expect(zone(s, id!)).toBe("hand");
    expect(s.players[ap]!.library.slice(-2)).toEqual([isleB!, isleA!]);
  });

  it("Fathom Trawl: with one card for the bottom there's nothing to order", () => {
    const { s: s0, ap, ids } = setup([fathomTrawl()]);
    const [isle, a, b, c] = stackLibrary(s0, ap, [island(), bears(), divination(), hillGiant()]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [])), { me: [ap] });
    expect(s.pending).toBeFalsy();
    for (const id of [a, b, c]) expect(zone(s, id!)).toBe("hand");
    expect(s.players[ap]!.library.at(-1)).toBe(isle);
  });
});
