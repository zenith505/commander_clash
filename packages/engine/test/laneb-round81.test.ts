// Lane B, round 81: unsupported cards from the bottom of the popularity list (`npm run popular -- --least`): one-line
// templates (a reveal of another player's top cards with two of them milled, a card exiled from a hand checked for its
// type, tapping and untapping all creatures at once, creature cards put into graveyards from the battlefield this turn
// exiled, a cost to keep a creature that puts a card from your graveyard on the bottom of your library, a free cast from
// your graveyard until end of turn, a damage cap, and others).

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

const bears = (): CardDef => ({"oracleId": "14c8f55d-d177-4c25-a931-ebeb9e6062a0", "name": "Grizzly Bears", "manaCost": "{1}{G}", "cmc": 2, "typeLine": "Creature — Bear", "supertypes": [], "types": ["Creature"], "subtypes": ["Bear"], "oracleText": "", "power": "2", "toughness": "2", "colors": ["G"], "colorIdentity": ["G"], "keywords": [], "layout": "normal"}) as CardDef;
const solRing = (): CardDef => ({"oracleId": "6ad8011d-3471-4369-9d68-b264cc027487", "name": "Sol Ring", "manaCost": "{1}", "cmc": 1, "typeLine": "Artifact", "supertypes": [], "types": ["Artifact"], "subtypes": [], "oracleText": "{T}: Add {C}{C}.", "colors": [], "colorIdentity": [], "keywords": [], "producedMana": ["C"], "layout": "normal"}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId": "a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba", "name": "Ornithopter", "manaCost": "{0}", "cmc": 0, "typeLine": "Artifact Creature — Thopter", "supertypes": [], "types": ["Artifact", "Creature"], "subtypes": ["Thopter"], "oracleText": "Flying", "power": "0", "toughness": "2", "colors": [], "colorIdentity": [], "keywords": ["Flying"], "layout": "normal"}) as CardDef;
const lightningBolt = (): CardDef => ({"oracleId": "4457ed35-7c10-48c8-9776-456485fdf070", "name": "Lightning Bolt", "manaCost": "{R}", "cmc": 1, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Lightning Bolt deals 3 damage to any target.", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "layout": "normal"}) as CardDef;
const eldraziDevastator = (): CardDef => ({"oracleId": "bc08ac66-969c-4905-a2d6-16ff565be475", "name": "Eldrazi Devastator", "manaCost": "{8}", "cmc": 8, "typeLine": "Creature — Eldrazi", "supertypes": [], "types": ["Creature"], "subtypes": ["Eldrazi"], "oracleText": "Trample", "power": "8", "toughness": "9", "colors": [], "colorIdentity": [], "keywords": ["Trample"], "layout": "normal"}) as CardDef;
const hillGiant = (): CardDef => ({"oracleId": "342199e0-15b6-4824-83da-25caef2592b3", "name": "Hill Giant", "manaCost": "{3}{R}", "cmc": 4, "typeLine": "Creature — Giant", "supertypes": [], "types": ["Creature"], "subtypes": ["Giant"], "oracleText": "", "power": "3", "toughness": "3", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "layout": "normal"}) as CardDef;
const divination = (): CardDef => ({"oracleId": "273b339c-964b-4a18-8eb5-ceb8abcdfd9e", "name": "Divination", "manaCost": "{2}{U}", "cmc": 3, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "Draw two cards.", "colors": ["U"], "colorIdentity": ["U"], "keywords": [], "layout": "normal"}) as CardDef;
const island = (): CardDef => ({"oracleId": "b2c6aa39-2d2a-459c-a555-fb48ba993373", "name": "Island", "manaCost": "", "cmc": 0, "typeLine": "Basic Land — Island", "supertypes": ["Basic"], "types": ["Land"], "subtypes": ["Island"], "oracleText": "({T}: Add {U}.)", "colors": [], "colorIdentity": ["U"], "keywords": [], "producedMana": ["U"], "layout": "normal"}) as CardDef;
const serraAngel = (): CardDef => ({"oracleId": "4b7ac066-e5c7-43e6-9e7e-2739b24a905d", "name": "Serra Angel", "manaCost": "{3}{W}{W}", "cmc": 5, "typeLine": "Creature — Angel", "supertypes": [], "types": ["Creature"], "subtypes": ["Angel"], "oracleText": "Flying\nVigilance (Attacking doesn't cause this creature to tap.)", "power": "4", "toughness": "4", "colors": ["W"], "colorIdentity": ["W"], "keywords": ["Flying", "Vigilance"], "layout": "normal"}) as CardDef;
const aberrant = (): CardDef => ({"oracleId":"722ee05f-6815-41b7-9813-5ec3902c1e9f","name":"Aberrant Researcher // Perfected Form","manaCost":"{3}{U}","cmc":4,"typeLine":"Creature — Human Insect // Creature — Insect Horror","supertypes":[],"types":["Creature"],"subtypes":["Human","Insect"],"oracleText":"Flying\nAt the beginning of your upkeep, mill a card. If an instant or sorcery card was milled this way, transform this creature. (To mill a card, put the top card of your library into your graveyard.)","power":"3","toughness":"2","colors":["U"],"colorIdentity":["U"],"keywords":["Flying","Transform","Mill"],"layout":"transform","faces":[{"name":"Aberrant Researcher","manaCost":"{3}{U}","typeLine":"Creature — Human Insect","supertypes":[],"types":["Creature"],"subtypes":["Human","Insect"],"oracleText":"Flying\nAt the beginning of your upkeep, mill a card. If an instant or sorcery card was milled this way, transform this creature. (To mill a card, put the top card of your library into your graveyard.)","power":"3","toughness":"2","colors":["U"]},{"name":"Perfected Form","manaCost":"","typeLine":"Creature — Insect Horror","supertypes":[],"types":["Creature"],"subtypes":["Insect","Horror"],"oracleText":"Flying","power":"5","toughness":"4","colors":["U"],"colorIndicator":["U"]}]}) as CardDef;
const bamboozle = (): CardDef => ({"oracleId":"a1eccd85-d243-4d27-bf49-d3ac816159e4","name":"Bamboozle","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target player reveals the top four cards of their library. You choose two of those cards and put them into that player's graveyard. Put the rest on top of their library in any order.","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"}) as CardDef;
const checkForTraps = (): CardDef => ({"oracleId":"41b2ea88-b3b9-44f0-8886-7b2f37b22ebf","name":"Check for Traps","manaCost":"{1}{B}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target opponent reveals their hand. You choose a nonland card from it. Exile that card. If an instant card or a card with flash is exiled this way, they lose 1 life. Otherwise, you lose 1 life.","colors":["B"],"colorIdentity":["B"],"keywords":[],"layout":"normal"}) as CardDef;
const breakingWave = (): CardDef => ({"oracleId":"f455b731-6ff9-4acb-9447-f524faa49b27","name":"Breaking Wave","manaCost":"{2}{U}{U}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"You may cast this spell as though it had flash if you pay {2} more to cast it. (You may cast it any time you could cast an instant.)\nSimultaneously untap all tapped creatures and tap all untapped creatures.","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"}) as CardDef;
const cryOfTheCarnarium = (): CardDef => ({"oracleId":"1b9a5170-39c0-4cbf-a041-f3c15f1359ae","name":"Cry of the Carnarium","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"All creatures get -2/-2 until end of turn. Exile all creature cards in all graveyards that were put there from the battlefield this turn. If a creature would die this turn, exile it instead.","colors":["B"],"colorIdentity":["B"],"keywords":[],"layout":"normal"}) as CardDef;
const akuta = (): CardDef => ({"oracleId":"29169659-309f-4e1c-86ba-1d36420ed41e","name":"Akuta, Born of Ash","manaCost":"{2}{B}{B}","cmc":4,"typeLine":"Legendary Creature — Spirit","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Spirit"],"oracleText":"Haste\nAt the beginning of your upkeep, if you have more cards in hand than each opponent, you may sacrifice a Swamp. If you do, return Akuta from your graveyard to the battlefield.","power":"3","toughness":"2","colors":["B"],"colorIdentity":["B"],"keywords":["Haste"],"layout":"normal"}) as CardDef;
const anuridScavenger = (): CardDef => ({"oracleId":"8d4d70c4-0490-4239-ac8f-dd1d1a008f08","name":"Anurid Scavenger","manaCost":"{2}{G}","cmc":3,"typeLine":"Creature — Frog Beast","supertypes":[],"types":["Creature"],"subtypes":["Frog","Beast"],"oracleText":"Protection from black\nAt the beginning of your upkeep, sacrifice this creature unless you put a card from your graveyard on the bottom of your library.","power":"3","toughness":"3","colors":["G"],"colorIdentity":["G"],"keywords":["Protection"],"layout":"normal"}) as CardDef;
const shapeAnew = (): CardDef => ({"oracleId":"21b7cf4f-1c86-4700-be71-68c974d143b0","name":"Shape Anew","manaCost":"{3}{U}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"The controller of target artifact sacrifices it, then reveals cards from the top of their library until they reveal an artifact card. That player puts that card onto the battlefield, then shuffles all other cards revealed this way into their library.","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"}) as CardDef;
const riptideShapeshifter = (): CardDef => ({"oracleId":"49f292ab-0533-436b-a309-8bc795b66e5c","name":"Riptide Shapeshifter","manaCost":"{3}{U}{U}","cmc":5,"typeLine":"Creature — Shapeshifter","supertypes":[],"types":["Creature"],"subtypes":["Shapeshifter"],"oracleText":"{2}{U}{U}, Sacrifice this creature: Choose a creature type. Reveal cards from the top of your library until you reveal a creature card of that type. Put that card onto the battlefield and shuffle the rest into your library.","power":"3","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"}) as CardDef;
const avengingDruid = (): CardDef => ({"oracleId":"1f3fb367-60b5-4b36-9604-3064afdac0d9","name":"Avenging Druid","manaCost":"{2}{G}","cmc":3,"typeLine":"Creature — Human Druid","supertypes":[],"types":["Creature"],"subtypes":["Human","Druid"],"oracleText":"Whenever this creature deals damage to an opponent, you may reveal cards from the top of your library until you reveal a land card. If you do, put that card onto the battlefield and put all other cards revealed this way into your graveyard.","power":"1","toughness":"3","colors":["G"],"colorIdentity":["G"],"keywords":[],"layout":"normal"}) as CardDef;
const magemark = (): CardDef => ({"oracleId":"f6889f57-2965-4a82-8556-fd91c6227058","name":"Beastmaster's Magemark","manaCost":"{2}{G}","cmc":3,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nCreatures you control that are enchanted get +1/+1.\nWhenever a creature you control that's enchanted becomes blocked, it gets +1/+1 until end of turn for each creature blocking it.","colors":["G"],"colorIdentity":["G"],"keywords":["Enchant"],"layout":"normal"}) as CardDef;
const auraBarbs = (): CardDef => ({"oracleId":"1aa8fdc3-efeb-450d-9540-2ef0efaf270d","name":"Aura Barbs","manaCost":"{2}{R}","cmc":3,"typeLine":"Instant — Arcane","supertypes":[],"types":["Instant"],"subtypes":["Arcane"],"oracleText":"Each enchantment deals 2 damage to its controller, then each Aura attached to a creature deals 2 damage to the creature it's attached to.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const sinsOfThePast = (): CardDef => ({"oracleId":"9059a940-ac28-4322-a11b-af1d107b2edd","name":"Sins of the Past","manaCost":"{4}{B}{B}","cmc":6,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Until end of turn, you may cast target instant or sorcery card from your graveyard without paying its mana cost. If that spell would be put into your graveyard, exile it instead. Exile Sins of the Past.","colors":["B"],"colorIdentity":["B"],"keywords":[],"layout":"normal"}) as CardDef;
const stunningStrike = (): CardDef => ({"oracleId":"139574fd-c61b-4615-9200-59f2c65f5703","name":"Stunning Strike","manaCost":"{2}{U}","cmc":3,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Flash\nEnchant creature\nWhen this Aura enters, tap enchanted creature and remove it from combat.\nAs long as enchanted creature isn't legendary, it doesn't untap during its controller's untap step.","colors":["U"],"colorIdentity":["U"],"keywords":["Enchant","Flash"],"layout":"normal"}) as CardDef;
const hixus = (): CardDef => ({"oracleId":"02bff648-fbad-4d61-ab09-93993a5fda58","name":"Hixus, Prison Warden","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Legendary Creature — Human Soldier","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Soldier"],"oracleText":"Flash (You may cast this spell any time you could cast an instant.)\nWhenever a creature deals combat damage to you, if Hixus entered this turn, exile that creature until Hixus leaves the battlefield. (That creature returns under its owner's control.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flash"],"layout":"normal"}) as CardDef;
const divinePresence = (): CardDef => ({"oracleId":"ff9a5529-83bd-46a8-b20b-235a5fd26d93","name":"Divine Presence","manaCost":"{2}{W}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"If a source would deal 4 or more damage to a permanent or player, that source deals 3 damage to that permanent or player instead.","colors":["W"],"colorIdentity":["W"],"keywords":[],"layout":"normal"}) as CardDef;
const pacifism = (): CardDef => ({"oracleId":"5f5e0b10-c8cf-450c-bfd3-bcb0528ec330","name":"Pacifism","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't attack or block.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"layout":"normal"}) as CardDef;
const rancor = (): CardDef => ({"oracleId":"9d2d6479-531c-4ce1-b52b-00e36fa63b64","name":"Rancor","manaCost":"{G}","cmc":1,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature gets +2/+0 and has trample.\nWhen this Aura is put into a graveyard from the battlefield, return it to its owner's hand.","colors":["G"],"colorIdentity":["G"],"keywords":["Enchant"],"layout":"normal"}) as CardDef;
const brainstorm = (): CardDef => ({"oracleId":"36cd2364-d113-47d1-b2c4-b088d9eb88dd","name":"Brainstorm","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Draw three cards, then put two cards from your hand on top of your library in any order.","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"}) as CardDef;
const ancestralVision = (): CardDef => ({"oracleId":"9728dec9-d482-4c7a-8cdc-44d010dc878d","name":"Ancestral Vision","manaCost":"","cmc":0,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Suspend 4—{U} (Rather than cast this card from your hand, pay {U} and exile it with four time counters on it. At the beginning of your upkeep, remove a time counter. When the last is removed, you may cast it without paying its mana cost.)\nTarget player draws three cards.","colors":["U"],"colorIdentity":["U"],"keywords":["Suspend"],"layout":"normal"}) as CardDef;
const fireball = (): CardDef => ({"oracleId":"aa7714b0-2bfb-458a-8ebf-37ec2c53383e","name":"Fireball","manaCost":"{X}{R}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"This spell costs {1} more to cast for each target beyond the first.\nFireball deals X damage divided evenly, rounded down, among any number of targets.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const counterspell = (): CardDef => ({"oracleId":"cc187110-1148-4090-bbb8-e205694a39f5","name":"Counterspell","manaCost":"{U}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Counter target spell.","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"}) as CardDef;
const llanowarElves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"layout":"normal"}) as CardDef;
const walkingBallista = (): CardDef => ({"oracleId":"4b515bb0-f275-4400-8032-3173b799ab40","name":"Walking Ballista","manaCost":"{X}{X}","cmc":0,"typeLine":"Artifact Creature — Construct","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Construct"],"oracleText":"This creature enters with X +1/+1 counters on it.\n{4}: Put a +1/+1 counter on this creature.\nRemove a +1/+1 counter from this creature: It deals 1 damage to any target.","power":"0","toughness":"0","colors":[],"colorIdentity":[],"keywords":[],"layout":"normal"}) as CardDef;
const mindStone = (): CardDef => ({"oracleId":"c97361b5-af16-4a7b-af85-a429dbaf4ad2","name":"Mind Stone","manaCost":"{2}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"layout":"normal"}) as CardDef;
const snapcaster = (): CardDef => ({"oracleId":"2bb2eda7-3b38-4c56-870f-c3218a1056f5","name":"Snapcaster Mage","manaCost":"{1}{U}","cmc":2,"typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"Flash\nWhen this creature enters, target instant or sorcery card in your graveyard gains flashback until end of turn. The flashback cost is equal to its mana cost. (You may cast that card from your graveyard for its flashback cost. Then exile it.)","power":"2","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":["Flash"],"layout":"normal"}) as CardDef;
const murder = (): CardDef => ({"oracleId":"938b4e2c-88d9-4637-bc00-e228920c9a78","name":"Murder","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target creature.","colors":["B"],"colorIdentity":["B"],"keywords":[],"layout":"normal"}) as CardDef;
const flash = (): CardDef => ({"oracleId":"30997b43-fc13-41d3-8064-1ccc2cb6fd2b","name":"Raging Goblin","manaCost":"{R}","cmc":1,"typeLine":"Creature — Goblin Berserker","supertypes":[],"types":["Creature"],"subtypes":["Goblin","Berserker"],"oracleText":"Haste (This creature can attack and {T} as soon as it comes under your control.)","power":"1","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":["Haste"],"layout":"normal"}) as CardDef;
const mistformUltimus = (): CardDef => ({"oracleId":"7bf0e628-06b5-4e12-a526-a2bce08844f2","name":"Mistform Ultimus","manaCost":"{3}{U}","cmc":4,"typeLine":"Legendary Creature — Illusion","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Illusion"],"oracleText":"Mistform Ultimus is every creature type (even if this card isn't on the battlefield).","power":"3","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"}) as CardDef;

const named = (s: GameState, pid: PlayerId, zoneName: "graveyard" | "hand" | "exile" | "library", name: string) => s.players[pid]![zoneName].filter((id) => s.cards[s.objects[id]!.cardId]!.name === name);
const onField = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && characteristics(s, s.objects[id]!).name === name);

describe("Lane B round 81", () => {
  it("all of them are supported", () => {
    supported(aberrant(), bamboozle(), checkForTraps(), breakingWave(), cryOfTheCarnarium(), akuta(), anuridScavenger(), shapeAnew(), riptideShapeshifter(), avengingDruid(), magemark(), auraBarbs(), sinsOfThePast(), stunningStrike(), hixus(), divinePresence());
  });

  it("Aberrant Researcher: an instant or sorcery card milled at upkeep transforms it", () => {
    const { s: s0, ap } = setup([]);
    const researcher = putOnBattlefield(s0, ap, aberrant());
    const [div] = stackLibrary(s0, ap, [divination()]);
    const s = settle(toNextUpkeep(s0, ap));
    expect(zone(s, div!)).toBe("graveyard");
    expect(s.objects[researcher]!.face).toBe(1);
    expect(characteristics(s, s.objects[researcher]!).name).toBe("Perfected Form");
    expect(pt(s, researcher)).toBe("5/4");
  });

  it("Aberrant Researcher: a creature card milled leaves it as it is", () => {
    const { s: s0, ap } = setup([]);
    const researcher = putOnBattlefield(s0, ap, aberrant());
    const [giant] = stackLibrary(s0, ap, [hillGiant()]);
    const s = settle(toNextUpkeep(s0, ap));
    expect(zone(s, giant!)).toBe("graveyard");
    expect(s.objects[researcher]!.face ?? 0).toBe(0);
  });

  it("Bamboozle: the target player reveals four, you pick two for their graveyard and the order of the rest", () => {
    const { s: s0, ap, opp, ids } = setup([bamboozle()]);
    const [a, b, c, d] = stackLibrary(s0, opp, [hillGiant(), divination(), serraAngel(), lightningBolt()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [player(opp)])), { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 2, max: 2 });
    expect([...(s.pending as { cards: string[] }).cards].sort()).toEqual([a!, b!, c!, d!].sort());
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [a!, c!] }), { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "arrangeTop", player: ap, how: "order", owner: opp });
    s = settle(act(s, { type: "arrangeTop", player: ap, top: [d!, b!], away: [] }));
    expect(zone(s, a!)).toBe("graveyard");
    expect(zone(s, c!)).toBe("graveyard");
    expect(s.players[opp]!.graveyard).toEqual(expect.arrayContaining([a!, c!]));
    expect(s.players[opp]!.library.slice(0, 2)).toEqual([d!, b!]);
  });

  it("Check for Traps: an exiled instant costs them 1 life, a card with flash too", () => {
    for (const def of [lightningBolt(), snapcaster()]) {
      const { s: s0, ap, opp, ids } = setup([checkForTraps()]);
      const [picked] = handOf(s0, opp, [def, hillGiant()]);
      const mine = lifeOf(s0, ap);
      const theirs = lifeOf(s0, opp);
      let s = settle(run(s0, planCast(s0, ap, ids[0]!, [player(opp)])), { me: [ap] });
      expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, hand: opp });
      s = settle(act(s, { type: "searchLibrary", player: ap, found: [picked!] }));
      expect(zone(s, picked!)).toBe("exile");
      expect(lifeOf(s, opp)).toBe(theirs - 1);
      expect(lifeOf(s, ap)).toBe(mine);
    }
  });

  it("Check for Traps: otherwise you lose 1 life", () => {
    const { s: s0, ap, opp, ids } = setup([checkForTraps()]);
    const [, giant] = handOf(s0, opp, [lightningBolt(), hillGiant()]);
    const mine = lifeOf(s0, ap);
    const theirs = lifeOf(s0, opp);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [player(opp)])), { me: [ap] });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [giant!] }));
    expect(zone(s, giant!)).toBe("exile");
    expect(lifeOf(s, opp)).toBe(theirs);
    expect(lifeOf(s, ap)).toBe(mine - 1);
  });

  it("Breaking Wave: tapped creatures untap and untapped ones tap, all at once", () => {
    const { s: s0, ap, opp, ids } = setup([breakingWave()]);
    const bear = putOnBattlefield(s0, ap, bears());
    const giant = putOnBattlefield(s0, ap, hillGiant());
    const angel = putOnBattlefield(s0, opp, serraAngel());
    s0.objects[bear]!.tapped = true;
    s0.objects[angel]!.tapped = true;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [])));
    expect(s.objects[bear]!.tapped).toBe(false);
    expect(s.objects[angel]!.tapped).toBe(false);
    expect(s.objects[giant]!.tapped).toBe(true);
  });

  it("Cry of the Carnarium: -2/-2, creature cards put into graveyards from the battlefield this turn exiled, dying creatures exiled", () => {
    const { s: s0, ap, opp, ids } = setup([lightningBolt(), cryOfTheCarnarium()]);
    const victim = putOnBattlefield(s0, opp, hillGiant());
    const giant = putOnBattlefield(s0, opp, hillGiant());
    const bear = putOnBattlefield(s0, opp, bears());
    const discarded = toZone(s0, opp, serraAngel(), "graveyard");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(victim)])));
    const victimCard = named(s, opp, "graveyard", "Hill Giant")[0]!;
    expect(victimCard).toBeTruthy();
    s = settle(run(s, planCast(s, ap, ids[1]!, [])));
    expect(zone(s, victimCard)).toBe("exile");
    // A card put there from elsewhere stays.
    expect(zone(s, discarded)).toBe("graveyard");
    expect(pt(s, giant)).toBe("1/1");
    // The 0/0 Bears dies after it resolves: exiled instead.
    expect(named(s, opp, "exile", "Grizzly Bears").length).toBe(1);
    expect(named(s, opp, "graveyard", "Grizzly Bears").length).toBe(0);
    expect(zone(s, bear)).not.toBe("battlefield");
  });

  it("Akuta, Born of Ash: with more cards in hand than each opponent, sacrifice a Swamp to return it at upkeep", () => {
    const { s: s0, ap } = setup([]);
    const card = toZone(s0, ap, akuta(), "graveyard");
    handOf(s0, ap, [hillGiant(), hillGiant(), hillGiant(), hillGiant(), hillGiant(), hillGiant()]);
    for (const p of s0.turnOrder) if (p !== ap) handOf(s0, p, []);
    const swamps = onField(s0, ap, "Swamp").length;
    expect(swamps).toBeGreaterThan(0);
    let s = toNextUpkeep(s0, ap);
    s = settle(s, { may: true });
    expect(onField(s, ap, "Akuta, Born of Ash").length).toBe(1);
    expect(zone(s, card)).not.toBe("graveyard");
    expect(onField(s, ap, "Swamp").length).toBe(swamps - 1);
  });

  it("Akuta, Born of Ash: no trigger when an opponent has as many cards in hand", () => {
    const { s: s0, ap, opp } = setup([]);
    const card = toZone(s0, ap, akuta(), "graveyard");
    handOf(s0, ap, [hillGiant()]);
    for (const p of s0.turnOrder) if (p !== ap) handOf(s0, p, []);
    handOf(s0, opp, [hillGiant(), hillGiant(), hillGiant(), hillGiant(), hillGiant()]);
    const turn = s0.turn;
    const s = goUntil(s0, (x) => x.turn > turn && x.activePlayer === ap && x.step === "draw");
    expect(zone(s, card)).toBe("graveyard");
  });

  it("Anurid Scavenger: put a card from your graveyard on the bottom of your library to keep it", () => {
    const { s: s0, ap } = setup([]);
    const scavenger = putOnBattlefield(s0, ap, anuridScavenger());
    const bearCard = toZone(s0, ap, bears(), "graveyard");
    const giantCard = toZone(s0, ap, hillGiant(), "graveyard");
    let s = toNextUpkeep(s0, ap);
    s = settle(s, { me: [ap] }); // answers "you may" yes
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, fromGraveyard: "libraryBottom", min: 1, max: 1 });
    expect((s.pending as { cards: string[] }).cards).toEqual(expect.arrayContaining([bearCard, giantCard]));
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [giantCard] }));
    expect(zone(s, scavenger)).toBe("battlefield");
    expect(s.players[ap]!.library.at(-1)).toBe(giantCard);
    expect(zone(s, bearCard)).toBe("graveyard");
  });

  it("Anurid Scavenger: with an empty graveyard it's sacrificed", () => {
    const { s: s0, ap } = setup([]);
    const scavenger = putOnBattlefield(s0, ap, anuridScavenger());
    let s = toNextUpkeep(s0, ap);
    // Empty the graveyard (cleanup discards filled it) while the trigger waits.
    for (const id of [...s.players[ap]!.graveyard]) {
      s.players[ap]!.graveyard.splice(s.players[ap]!.graveyard.indexOf(id), 1);
      s.objects[id]!.zone = "exile";
      s.players[ap]!.exile.push(id);
    }
    s = settle(s, { me: [ap] });
    expect(s.pending?.kind).not.toBe("searchLibrary");
    expect(named(s, ap, "graveyard", "Anurid Scavenger").length).toBe(1);
    expect(s.objects[scavenger]?.zone).not.toBe("battlefield");
  });

  it("Anurid Scavenger: declining to put a card back sacrifices it", () => {
    const { s: s0, ap } = setup([]);
    const scavenger = putOnBattlefield(s0, ap, anuridScavenger());
    const bearCard = toZone(s0, ap, bears(), "graveyard");
    let s = toNextUpkeep(s0, ap);
    s = settle(s, { me: [ap], may: false });
    expect(s.objects[scavenger]?.zone).not.toBe("battlefield");
    expect(named(s, ap, "graveyard", "Anurid Scavenger").length).toBe(1);
    expect(zone(s, bearCard)).toBe("graveyard");
  });

  it("Shape Anew: the artifact's controller sacrifices it and puts the first artifact card revealed onto the battlefield, then shuffles", () => {
    const { s: s0, ap, opp, ids } = setup([shapeAnew()]);
    const ring = putOnBattlefield(s0, opp, solRing());
    const [, , thopter] = stackLibrary(s0, opp, [hillGiant(), divination(), ornithopter(), bears()]);
    const before = s0.players[opp]!.library.length;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(ring)])));
    expect(named(s, opp, "graveyard", "Sol Ring").length).toBe(1);
    expect(zone(s, thopter!)).toBe("battlefield");
    expect(controllerOf(s, s.objects[thopter!]!)).toBe(opp);
    expect(s.players[opp]!.library.length).toBe(before - 1);
  });

  it("Riptide Shapeshifter: reveals until a creature card of the chosen type and puts it onto the battlefield", () => {
    const { s: s0, ap } = setup([]);
    const shifter = putOnBattlefield(s0, ap, riptideShapeshifter());
    const [giant, bear, angel] = stackLibrary(s0, ap, [hillGiant(), bears(), serraAngel(), bears()]);
    const before = s0.players[ap]!.library.length;
    let s = settle(run(s0, planActivate(s0, ap, shifter, 0)), { me: [ap] });
    expect(zone(s, shifter)).not.toBe("battlefield");
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap });
    expect((s.pending as { options: string[] }).options).toContain("Angel");
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Angel" }));
    expect(zone(s, angel!)).toBe("battlefield");
    expect(zone(s, giant!)).toBe("library");
    expect(zone(s, bear!)).toBe("library");
    expect(s.players[ap]!.library.length).toBe(before - 1);
  });

  it("Avenging Druid: dealing damage to an opponent, you may reveal until a land, put it onto the battlefield and the rest into your graveyard", () => {
    const { s: s0, ap, opp } = setup([]);
    const druid = putOnBattlefield(s0, ap, avengingDruid());
    const [bear, div, land] = stackLibrary(s0, ap, [bears(), divination(), island()]);
    let s = attackWith(s0, [druid], opp);
    s = goUntil(s, (x) => x.pending?.kind === "chooseMay");
    s = settle(s, { may: true });
    expect(zone(s, land!)).toBe("battlefield");
    expect(controllerOf(s, s.objects[land!]!)).toBe(ap);
    expect(zone(s, bear!)).toBe("graveyard");
    expect(zone(s, div!)).toBe("graveyard");
  });

  it("Beastmaster's Magemark: enchanted creatures you control get +1/+1, and +1/+1 for each creature blocking them", () => {
    const { s: s0, ap, opp } = setup([]);
    const giant = putOnBattlefield(s0, ap, hillGiant());
    const bear = putOnBattlefield(s0, ap, bears());
    attach(s0, ap, magemark(), giant);
    attach(s0, ap, rancor(), bear);
    expect(pt(s0, giant)).toBe("4/4");
    // Rancor's +2/+0 and the Magemark's +1/+1.
    expect(pt(s0, bear)).toBe("5/3");
    const b1 = putOnBattlefield(s0, opp, bears());
    const b2 = putOnBattlefield(s0, opp, bears());
    let s = toBlocks(attackWith(s0, [giant], opp));
    s = settle(block(s, opp, [{ blocker: b1, attacker: giant }, { blocker: b2, attacker: giant }]));
    expect(pt(s, giant)).toBe("6/6");
  });

  it("Aura Barbs: each enchantment deals 2 damage to its controller, then each Aura deals 2 damage to the creature it's attached to", () => {
    const { s: s0, ap, opp, ids } = setup([auraBarbs()]);
    const giant = putOnBattlefield(s0, opp, hillGiant());
    const bear = putOnBattlefield(s0, ap, bears());
    attach(s0, ap, pacifism(), giant);
    attach(s0, opp, pacifism(), bear);
    putOnBattlefield(s0, opp, divinePresence());
    const mine = lifeOf(s0, ap);
    const theirs = lifeOf(s0, opp);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [])));
    expect(lifeOf(s, ap)).toBe(mine - 2);
    expect(lifeOf(s, opp)).toBe(theirs - 4);
    expect(s.objects[giant]!.damage).toBe(2);
    expect(zone(s, bear)).not.toBe("battlefield");
  });

  it("Sins of the Past: cast the target card from your graveyard free this turn, then it's exiled; Sins is exiled", () => {
    const { s: s0, ap, opp, ids } = setup([sinsOfThePast()]);
    const bolt = toZone(s0, ap, lightningBolt(), "graveyard");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(bolt)])));
    expect(named(s, ap, "exile", "Sins of the Past").length).toBe(1);
    poolOnly(s, ap, {});
    const life = lifeOf(s, opp);
    s = settle(run(s, planCast(s, ap, bolt, [player(opp)], undefined, "auto", undefined, { via: "permission" })));
    expect(lifeOf(s, opp)).toBe(life - 3);
    expect(named(s, ap, "exile", "Lightning Bolt").length).toBe(1);
    expect(named(s, ap, "graveyard", "Lightning Bolt").length).toBe(0);
  });

  it("Sins of the Past: X is 0 for a spell cast this way", () => {
    const { s: s0, ap, opp, ids } = setup([sinsOfThePast()]);
    const ball = toZone(s0, ap, fireball(), "graveyard");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(ball)])));
    poolOnly(s, ap, { R: 5 });
    expect(planCast(s, ap, ball, [player(opp)], undefined, "auto", 3, { via: "permission" })).toBeNull();
    const life = lifeOf(s, opp);
    s = settle(run(s, planCast(s, ap, ball, [player(opp)], undefined, "auto", 0, { via: "permission" })));
    expect(lifeOf(s, opp)).toBe(life);
    expect(s.players[ap]!.manaPool.R).toBe(5);
    expect(named(s, ap, "exile", "Fireball").length).toBe(1);
  });

  it("Stunning Strike: taps the creature and removes it from combat; it doesn't untap unless it's legendary", () => {
    const { s: s0, ap, opp, ids } = setup([stunningStrike()]);
    const giant = putOnBattlefield(s0, ap, hillGiant());
    let s = attackWith(s0, [giant], opp);
    for (let i = 0; i < 20 && !(s.step === "declareAttackers" && !s.pending && waitingOn(s) === ap); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[giant]!.attacking).toBeTruthy();
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(giant)])));
    expect(s.objects[giant]!.tapped).toBe(true);
    expect(s.objects[giant]!.attacking).toBeFalsy();
    const life = lifeOf(s, opp);
    s = goUntil(s, (x) => x.step === "main2");
    expect(lifeOf(s, opp)).toBe(life);
    // At its controller's next untap step it stays tapped.
    s = goUntil(s, (x) => x.activePlayer === ap && x.turn > s0.turn && x.step === "main1");
    expect(s.objects[giant]!.tapped).toBe(true);
  });

  it("Stunning Strike: a legendary creature untaps as usual", () => {
    const { s: s0, ap, opp } = setup([]);
    const legend = putOnBattlefield(s0, opp, akuta());
    attach(s0, ap, stunningStrike(), legend);
    s0.objects[legend]!.tapped = true;
    const s = goUntil(s0, (x) => x.activePlayer === opp && x.step === "main1");
    expect(s.objects[legend]!.tapped).toBe(false);
  });

  it("Hixus, Prison Warden: a creature that deals combat damage to you the turn it entered is exiled until Hixus leaves", () => {
    const { s: s0, ap, opp } = setup([]);
    const giant = putOnBattlefield(s0, opp, hillGiant());
    let s = goUntil(s0, (x) => x.activePlayer === opp && x.step === "main1");
    const warden = putOnBattlefield(s, ap, hixus());
    s.objects[warden]!.enteredTurn = s.turn;
    s = attackWith(s, [giant], ap);
    s = goUntil(s, (x) => x.step === "combatDamage" && x.stack.length > 0);
    s = settle(s);
    expect(zone(s, giant)).not.toBe("battlefield");
    expect(named(s, opp, "exile", "Hill Giant").length).toBe(1);
    destroyPermanent(s, s.objects[warden]!, "test");
    s = settle(s);
    expect(onField(s, opp, "Hill Giant").length).toBe(1);
  });

  it("Hixus, Prison Warden: not after the turn it entered", () => {
    const { s: s0, ap, opp } = setup([]);
    const giant = putOnBattlefield(s0, opp, hillGiant());
    const warden = putOnBattlefield(s0, ap, hixus());
    s0.objects[warden]!.enteredTurn = s0.turn;
    let s = goUntil(s0, (x) => x.activePlayer === opp && x.step === "main1");
    s = attackWith(s, [giant], ap);
    s = goUntil(s, (x) => x.step === "main2");
    expect(zone(s, giant)).toBe("battlefield");
  });

  it("Divine Presence: 4 or more damage from a source is 3 instead; less stays as it is", () => {
    const { s: s0, ap, opp, ids } = setup([lightningBolt()]);
    putOnBattlefield(s0, ap, divinePresence());
    const devastator = putOnBattlefield(s0, ap, eldraziDevastator());
    const angel = putOnBattlefield(s0, opp, serraAngel());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(angel)])));
    expect(s.objects[angel]!.damage).toBe(3);
    const life = lifeOf(s, opp);
    s = attackWith(s, [devastator], opp);
    s = goUntil(s, (x) => x.step === "main2");
    expect(lifeOf(s, opp)).toBe(life - 3);
  });
});
