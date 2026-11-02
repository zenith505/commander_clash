// Lane B, round 85: unsupported cards from the bottom of the popularity list (`npm run popular -- --least`): one-line
// templates, and two-word creature types ("Eldrazi Scion", "Sand Warrior") read as both types.

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, abilityProblem, botActions, castProblem, characteristics, closeZoneBatch, controllerOf, destroyPermanent, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PlayerId, type TargetChoice } from "../src";
const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
const abilitiesIndex = (s: GameState, id: string, re: RegExp) => abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => re.test(a.text ?? ""));
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


const named = (s: GameState, pid: PlayerId, zoneName: "graveyard" | "hand" | "exile" | "library", name: string) => s.players[pid]![zoneName].filter((id) => s.cards[s.objects[id]!.cardId]!.name === name);
const onField = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && characteristics(s, s.objects[id]!).name === name);
/** Passes priority (the bots answering questions, triggers resolving) until `stop`. */
const passUntilThat = (s: GameState, stop: (s: GameState) => boolean) => {
  for (let i = 0; i < 400; i++) {
    if (stop(s)) return s;
    const p = s.pending;
    if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  throw new Error("never got there");
};
/** Attacks `defender` with `attackers`, `opp` blocks as given, then plays on to the combat damage step's end. */
const fight = (s: GameState, attackers: string[], defender: PlayerId, blocks: { blocker: string; attacker: string }[], opts: { targets?: TargetChoice[][]; may?: boolean; me?: PlayerId[] } = {}) => {
  s = attackWith(s, attackers, defender);
  s = toBlocks(s);
  s = block(s, defender, blocks);
  return passUntilThat(s, (x) => x.step === "main2" || (x.step === "combatDamage" && (x.stack.length > 0 || x.triggerQueue.length > 0 || !!x.pending)));
};


const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const giantGrowth = (): CardDef => ({"oracleId":"5748ebf1-24e3-499d-ab7c-c2cebd462a24","name":"Giant Growth","manaCost":"{G}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target creature gets +3/+3 until end of turn.","colors":["G"],"colorIdentity":["G"],"keywords":[],"layout":"normal"}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"layout":"normal"}) as CardDef;
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const reflectiveGolem = (): CardDef => ({"oracleId": "3c067dbb-934b-4ebb-a656-8541349a4b2a", "name": "Reflective Golem", "manaCost": "{3}", "cmc": 3, "typeLine": "Artifact Creature — Golem", "supertypes": [], "types": ["Artifact", "Creature"], "subtypes": ["Golem"], "oracleText": "Whenever you cast an instant or sorcery spell that targets only this creature, you may pay {2}. If you do, copy that spell. You may choose new targets for the copy.", "power": "2", "toughness": "3", "colors": [], "colorIdentity": [], "keywords": [], "layout": "normal"}) as CardDef;
const flectomancer = (): CardDef => ({"oracleId": "7c3171da-7a95-4f8e-ba30-c31af21c1828", "name": "Goblin Flectomancer", "manaCost": "{U}{R}{R}", "cmc": 3, "typeLine": "Creature — Goblin Wizard", "supertypes": [], "types": ["Creature"], "subtypes": ["Goblin", "Wizard"], "oracleText": "Sacrifice this creature: You may change the targets of target instant or sorcery spell.", "power": "2", "toughness": "2", "colors": ["R", "U"], "colorIdentity": ["R", "U"], "keywords": [], "layout": "normal"}) as CardDef;
const rocketLauncher = (): CardDef => ({"oracleId": "11720db4-5b6b-49ba-bf31-4d944921d6f1", "name": "Rocket Launcher", "manaCost": "{4}", "cmc": 4, "typeLine": "Artifact", "supertypes": [], "types": ["Artifact"], "subtypes": [], "oracleText": "{2}: This artifact deals 1 damage to any target. Destroy this artifact at the beginning of the next end step. Activate only if you've controlled this artifact continuously since the beginning of your most recent turn.", "colors": [], "colorIdentity": [], "keywords": [], "layout": "normal"}) as CardDef;
const fracturedLoyalty = (): CardDef => ({"oracleId": "ccc168ef-b93b-4bff-89a3-80984d3625de", "name": "Fractured Loyalty", "manaCost": "{1}{R}", "cmc": 2, "typeLine": "Enchantment — Aura", "supertypes": [], "types": ["Enchantment"], "subtypes": ["Aura"], "oracleText": "Enchant creature\nWhenever enchanted creature becomes the target of a spell or ability, that spell or ability's controller gains control of that creature. (This effect lasts indefinitely.)", "colors": ["R"], "colorIdentity": ["R"], "keywords": ["Enchant"], "layout": "normal"}) as CardDef;
const burdenOfProof = (): CardDef => ({"oracleId": "d1767573-713d-4f63-a09d-e94150655093", "name": "Burden of Proof", "manaCost": "{1}{U}", "cmc": 2, "typeLine": "Enchantment — Aura", "supertypes": [], "types": ["Enchantment"], "subtypes": ["Aura"], "oracleText": "Flash\nEnchant creature\nEnchanted creature gets +2/+2 as long as it's a Detective you control. Otherwise, it has base power and toughness 1/1 and can't block Detectives.", "colors": ["U"], "colorIdentity": ["U"], "keywords": ["Enchant", "Flash"], "layout": "normal"}) as CardDef;
const arashin = (): CardDef => ({"oracleId": "75c81ce4-ca1d-464a-bb39-e568f8ebf71f", "name": "Arashin War Beast", "manaCost": "{5}{G}{G}", "cmc": 7, "typeLine": "Creature — Beast", "supertypes": [], "types": ["Creature"], "subtypes": ["Beast"], "oracleText": "Whenever this creature deals combat damage to one or more blocking creatures, manifest the top card of your library. (Put it onto the battlefield face down as a 2/2 creature. Turn it face up any time for its mana cost if it's a creature card.)", "power": "6", "toughness": "6", "colors": ["G"], "colorIdentity": ["G"], "keywords": ["Manifest"], "layout": "normal"}) as CardDef;
const canalCourier = (): CardDef => ({"oracleId": "efaa1262-b7ac-49ab-831a-d10b59680691", "name": "Canal Courier", "manaCost": "{5}{U}", "cmc": 6, "typeLine": "Creature — Human Rogue", "supertypes": [], "types": ["Creature"], "subtypes": ["Human", "Rogue"], "oracleText": "When this creature enters, you become the monarch.\nWhenever this creature and another creature attack different players, this creature can't be blocked this combat.", "power": "3", "toughness": "5", "colors": ["U"], "colorIdentity": ["U"], "keywords": [], "layout": "normal"}) as CardDef;
const cryomancer = (): CardDef => ({"oracleId": "c3936db3-d3b6-4a92-9773-6f3c52dc419d", "name": "Seasoned Cryomancer", "manaCost": "{1}{U}{U}", "cmc": 3, "typeLine": "Creature — Human Wizard", "supertypes": [], "types": ["Creature"], "subtypes": ["Human", "Wizard"], "oracleText": "When this creature enters, draw two cards, then discard two cards. When you discard one or more nonland cards this way, tap up to that many target creatures and put a stun counter on each of them.\n{3}{U}{U}, Exile this card from your graveyard: Draw two cards.", "power": "2", "toughness": "2", "colors": ["U"], "colorIdentity": ["U"], "keywords": [], "layout": "normal"}) as CardDef;
const puppeteer = (): CardDef => ({"oracleId": "7bb3c3b8-25b7-4c48-aa41-dcdcebbc3d5e", "name": "Creepy Puppeteer", "manaCost": "{3}{R}", "cmc": 4, "typeLine": "Creature — Human Rogue", "supertypes": [], "types": ["Creature"], "subtypes": ["Human", "Rogue"], "oracleText": "Haste\nWhenever this creature attacks, if you attacked with exactly one other creature this combat, you may have that creature's base power and toughness become 4/3 until end of turn.", "power": "4", "toughness": "3", "colors": ["R"], "colorIdentity": ["R"], "keywords": ["Haste"], "layout": "normal"}) as CardDef;
const displayDominance = (): CardDef => ({"oracleId": "4a2233de-50bd-49be-ac49-4a3c0f02dd52", "name": "Display of Dominance", "manaCost": "{1}{G}", "cmc": 2, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Choose one —\n• Destroy target blue or black noncreature permanent.\n• Permanents you control can't be the targets of blue or black spells your opponents control this turn.", "colors": ["G"], "colorIdentity": ["G"], "keywords": [], "layout": "normal"}) as CardDef;
const compelBrutality = (): CardDef => ({"oracleId": "3a9059ac-c595-4e71-b704-b04d2d47db70", "name": "Compel Brutality", "manaCost": "{1}{G}", "cmc": 2, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Choose one —\n• Target creature you control deals damage equal to its power to target creature or planeswalker an opponent controls.\n• Target planeswalker you control deals damage equal to its loyalty to target creature or planeswalker an opponent controls.", "colors": ["G"], "colorIdentity": ["G"], "keywords": [], "layout": "normal"}) as CardDef;
const eyeOfDoom = (): CardDef => ({"oracleId": "e808a11e-29bd-4e99-a24e-67fa8f6fe502", "name": "Eye of Doom", "manaCost": "{4}", "cmc": 4, "typeLine": "Artifact", "supertypes": [], "types": ["Artifact"], "subtypes": [], "oracleText": "When this artifact enters, each player chooses a nonland permanent and puts a doom counter on it.\n{2}, {T}, Sacrifice this artifact: Destroy each permanent with a doom counter on it.", "colors": [], "colorIdentity": [], "keywords": [], "layout": "normal"}) as CardDef;
const hazezon = (): CardDef => ({"oracleId": "d298df4e-7b60-4495-9773-cc81954b7dd9", "name": "Hazezon Tamar", "manaCost": "{4}{R}{G}{W}", "cmc": 7, "typeLine": "Legendary Creature — Human Warrior", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Human", "Warrior"], "oracleText": "When Hazezon enters, create X 1/1 Sand Warrior creature tokens that are red, green, and white at the beginning of your next upkeep, where X is the number of lands you control at that time.\nWhen Hazezon leaves the battlefield, exile all Sand Warriors.", "power": "2", "toughness": "4", "colors": ["G", "R", "W"], "colorIdentity": ["G", "R", "W"], "keywords": [], "layout": "normal"}) as CardDef;
const goblinLyre = (): CardDef => ({"oracleId": "0709e9c8-dbe7-4806-ae75-d2e2d745d6a4", "name": "Goblin Lyre", "manaCost": "{3}", "cmc": 3, "typeLine": "Artifact", "supertypes": [], "types": ["Artifact"], "subtypes": [], "oracleText": "Sacrifice this artifact: Flip a coin. If you win the flip, this artifact deals damage to target opponent or planeswalker equal to the number of creatures you control. If you lose the flip, this artifact deals damage to you equal to the number of creatures that opponent or that planeswalker's controller controls.", "colors": [], "colorIdentity": [], "keywords": [], "layout": "normal"}) as CardDef;
const kiora = (): CardDef => ({"oracleId": "e70bb7f8-8098-49c5-929c-68f63cd821c5", "name": "Kiora of Salt and Sand", "manaCost": "{1}{G}{U}", "cmc": 3, "typeLine": "Legendary Creature — Merfolk Noble", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Merfolk", "Noble"], "oracleText": "Whenever you attack, if you've activated a loyalty ability this turn, untap target attacking creature. It can't be blocked this turn.\nPlaneswalkers you control have \"[−8]: Create an 8/8 blue Leviathan creature token with hexproof.\"", "power": "2", "toughness": "4", "colors": ["G", "U"], "colorIdentity": ["G", "U"], "keywords": [], "layout": "normal"}) as CardDef;
const specter = (): CardDef => ({"oracleId": "caff40b1-28d1-4ef6-90d1-51a1dc06cbcd", "name": "Specter of Mortality", "manaCost": "{3}{B}{B}", "cmc": 5, "typeLine": "Creature — Specter", "supertypes": [], "types": ["Creature"], "subtypes": ["Specter"], "oracleText": "Flying\nWhen this creature enters, you may exile one or more creature cards from your graveyard. When you do, each other creature gets -X/-X until end of turn, where X is the number of cards exiled this way.", "power": "3", "toughness": "3", "colors": ["B"], "colorIdentity": ["B"], "keywords": ["Flying"], "layout": "normal"}) as CardDef;
const korCastigator = (): CardDef => ({"oracleId": "fbb9dafa-b1aa-401a-b26c-c0c7e8b7222f", "name": "Kor Castigator", "manaCost": "{1}{W}", "cmc": 2, "typeLine": "Creature — Kor Wizard Ally", "supertypes": [], "types": ["Creature"], "subtypes": ["Kor", "Wizard", "Ally"], "oracleText": "This creature can't be blocked by Eldrazi Scions.", "power": "3", "toughness": "1", "colors": ["W"], "colorIdentity": ["W"], "keywords": [], "layout": "normal"}) as CardDef;
const deathlessBehemoth = (): CardDef => ({"oracleId": "78ee8cd8-de12-440f-8890-a78ab40b6be4", "name": "Deathless Behemoth", "manaCost": "{6}", "cmc": 6, "typeLine": "Creature — Eldrazi", "supertypes": [], "types": ["Creature"], "subtypes": ["Eldrazi"], "oracleText": "Vigilance\nSacrifice two Eldrazi Scions: Return this card from your graveyard to your hand. Activate only as a sorcery.", "power": "6", "toughness": "6", "colors": [], "colorIdentity": [], "keywords": ["Vigilance"], "layout": "normal"}) as CardDef;
const broodBirthing = (): CardDef => ({"oracleId": "e7d1c762-69d0-401d-8035-6e9744baf9d8", "name": "Brood Birthing", "manaCost": "{1}{R}", "cmc": 2, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "If you control an Eldrazi Spawn, create three 0/1 colorless Eldrazi Spawn creature tokens. They have \"Sacrifice this token: Add {C}.\" Otherwise, create one of those tokens.", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "layout": "normal"}) as CardDef;
const seedsOfStrength = (): CardDef => ({"oracleId": "dd3d4d96-1e88-49e1-8276-7f62c22ad91a", "name": "Seeds of Strength", "manaCost": "{G}{W}", "cmc": 2, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Target creature gets +1/+1 until end of turn.\nTarget creature gets +1/+1 until end of turn.\nTarget creature gets +1/+1 until end of turn.", "colors": ["G", "W"], "colorIdentity": ["G", "W"], "keywords": [], "layout": "normal"}) as CardDef;
const fireball = (): CardDef => ({"oracleId": "aa7714b0-2bfb-458a-8ebf-37ec2c53383e", "name": "Fireball", "manaCost": "{X}{R}", "cmc": 1, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "This spell costs {1} more to cast for each target beyond the first.\nFireball deals X damage divided evenly, rounded down, among any number of targets.", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "layout": "normal"}) as CardDef;
const divination = (): CardDef => ({"oracleId": "273b339c-964b-4a18-8eb5-ceb8abcdfd9e", "name": "Divination", "manaCost": "{2}{U}", "cmc": 3, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "Draw two cards.", "colors": ["U"], "colorIdentity": ["U"], "keywords": [], "layout": "normal"}) as CardDef;
const cancel = (): CardDef => ({"oracleId": "7d00fb28-ea6c-49a9-b4af-ffb38860a9a7", "name": "Cancel", "manaCost": "{1}{U}{U}", "cmc": 3, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Counter target spell.", "colors": ["U"], "colorIdentity": ["U"], "keywords": [], "layout": "normal"}) as CardDef;
const duress = (): CardDef => ({"oracleId": "33d405ea-7a9a-4970-b70f-9c05d90dd6f0", "name": "Duress", "manaCost": "{B}", "cmc": 1, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "Target opponent reveals their hand. You choose a noncreature, nonland card from it. That player discards that card.", "colors": ["B"], "colorIdentity": ["B"], "keywords": [], "layout": "normal"}) as CardDef;
const naturalize = (): CardDef => ({"oracleId": "bdb3ca68-ec1f-4e16-81cc-d23f8f52c728", "name": "Naturalize", "manaCost": "{1}{G}", "cmc": 2, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Destroy target artifact or enchantment.", "colors": ["G"], "colorIdentity": ["G"], "keywords": [], "layout": "normal"}) as CardDef;
const ajani = (): CardDef => ({"oracleId": "1d5ff280-7f4d-4801-aefd-9b6e6b1f2818", "name": "Ajani, Caller of the Pride", "manaCost": "{1}{W}{W}", "cmc": 3, "typeLine": "Legendary Planeswalker — Ajani", "supertypes": ["Legendary"], "types": ["Planeswalker"], "subtypes": ["Ajani"], "oracleText": "+1: Put a +1/+1 counter on up to one target creature.\n−3: Target creature gains flying and double strike until end of turn.\n−8: Create X 2/2 white Cat creature tokens, where X is your life total.", "loyalty": "4", "colors": ["W"], "colorIdentity": ["W"], "keywords": [], "layout": "normal"}) as CardDef;
const liliana = (): CardDef => ({"oracleId": "0ba134d8-ee7d-48ec-8dc6-57942b8e9261", "name": "Liliana of the Veil", "manaCost": "{1}{B}{B}", "cmc": 3, "typeLine": "Legendary Planeswalker — Liliana", "supertypes": ["Legendary"], "types": ["Planeswalker"], "subtypes": ["Liliana"], "oracleText": "+1: Each player discards a card.\n−2: Target player sacrifices a creature.\n−6: Separate all permanents target player controls into two piles. That player sacrifices all permanents in the pile of their choice.", "loyalty": "3", "colors": ["B"], "colorIdentity": ["B"], "keywords": [], "layout": "normal"}) as CardDef;
const doomBlade = (): CardDef => ({"oracleId": "59e7f2ae-4535-4191-98be-3e65b6b2befa", "name": "Doom Blade", "manaCost": "{1}{B}", "cmc": 2, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Destroy target nonblack creature.", "colors": ["B"], "colorIdentity": ["B"], "keywords": [], "layout": "normal"}) as CardDef;
const castModes = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[], modes: number[]) => run(s, planCast(s, pid, id, targets, modes, "auto"));
const detective = (name = "Test Detective") => card(name, "Creature — Human Detective", "{1}{U}", { power: "2", toughness: "2" });
const soldier = (name = "Test Soldier") => card(name, "Creature — Human Soldier", "{1}{W}", { power: "2", toughness: "2" });
const planeswalker = () => card("Test Walker", "Legendary Planeswalker — Testa", "{2}{W}", { loyalty: "4", oracleText: "+1: You gain 1 life." });
const eldrazi = (name: string, sub: string) => card(name, `Creature — ${sub}`, "{1}", { power: "1", toughness: "1" });
/** Drops a creature that's been under `pid`'s control since an earlier turn (not summoning sick). */
const third = (s: GameState, ap: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(ap) + 2) % 4]!;
const counters = (s: GameState, id: string, kind: string) => (s.objects[id]!.counters as Record<string, number>)[kind] ?? 0;
const veteran = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.controlledSinceTurn = 0;
  return id;
};

describe("Lane B round 85", () => {
  it("all of them are supported", () => {
    supported(korCastigator(), deathlessBehemoth(), broodBirthing(), reflectiveGolem(), flectomancer(), rocketLauncher(), fracturedLoyalty(), burdenOfProof(), arashin(), canalCourier(), cryomancer(), puppeteer(), displayDominance(), compelBrutality(), eyeOfDoom(), hazezon(), goblinLyre(), kiora(), specter());
  });

  it("Reflective Golem: a spell that targets only it may be copied for {2}; one that targets something else isn't", () => {
    const { s: s0, ap } = setup([giantGrowth(), giantGrowth()]);
    let s = s0;
    const golem = veteran(s, ap, reflectiveGolem());
    const other = veteran(s, ap, bears());
    const [g1, g2] = s.players[ap]!.hand.slice(-2);
    s = castNow(s, ap, g1!, [tgt(golem)]);
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, C: 2 };
    s = settle(s, { may: true });
    expect(pt(s, golem)).toBe("8/9");
    // Another target: no trigger.
    const before = s.log.length;
    s = castNow(s, ap, g2!, [tgt(other)]);
    expect(s.stack.length).toBe(1);
    s = settle(s, { may: true });
    expect(pt(s, other)).toBe("5/5");
    expect(s.log.slice(before).some((l) => /Reflective Golem/.test(l.text))).toBe(false);
  });

  it("Goblin Flectomancer: changes all of a spell's targets or none of them (CR 115.7a)", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const flecto = veteran(s, ap, flectomancer());
    const a = veteran(s, ap, bears());
    const b = veteran(s, opp, hillGiant());
    const c = veteran(s, opp, bear({ name: "Other Bear" }));
    const seeds = toZone(s, ap, seedsOfStrength(), "hand");
    s = castNow(s, ap, seeds, [tgt(a), tgt(a), tgt(a)]);
    const spell = s.stack.at(-1)!;
    s = run(s, planActivate(s, ap, flecto, 0, [{ kind: "stack", id: spell.id }]));
    expect(zone(s, flecto)).toBe("graveyard");
    s = passUntilThat(s, (x) => x.pending?.kind === "newTargets");
    const p = s.pending as Extract<GameState["pending"], { kind: "newTargets" }>;
    expect(p.allOrNone).toBe(true);
    // Changing only one of them isn't allowed.
    expect(() => act(s, { type: "newTargets", player: ap, targets: [tgt(b), tgt(a), tgt(a)] })).toThrow(/all of its targets/);
    s = act(s, { type: "newTargets", player: ap, targets: [tgt(b), tgt(c), tgt(b)] });
    s = settle(s);
    expect(pt(s, b)).toBe("5/5");
    expect(pt(s, c)).toBe("3/3");
    expect(pt(s, a)).toBe("2/2");
  });

  it("Goblin Flectomancer: if one target can't change, none do", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    for (const id of s.battlefield.filter((x) => characteristics(s, s.objects[x]!).types.includes("Creature"))) s.objects[id]!.zone = "exile";
    s.battlefield = s.battlefield.filter((x) => s.objects[x]!.zone === "battlefield");
    const flecto = veteran(s, ap, flectomancer());
    const only = veteran(s, opp, bears());
    invalidateCharacteristics(s);
    const growth = toZone(s, ap, giantGrowth(), "hand");
    // Giant Growth on the only other creature: Flectomancer itself is gone by then, so nothing else can be targeted.
    s = castNow(s, ap, growth, [tgt(only)]);
    const spell = s.stack.at(-1)!;
    s = run(s, planActivate(s, ap, flecto, 0, [{ kind: "stack", id: spell.id }]));
    s = settle(s);
    expect(pt(s, only)).toBe("5/5");
    expect(s.log.some((l) => /has no other legal targets/.test(l.text))).toBe(true);
  });

  it("Rocket Launcher: only once you've controlled it since your turn began; destroyed at the next end step", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, C: 2 };
    const fresh = putOnBattlefield(s, ap, rocketLauncher());
    s.objects[fresh]!.controlledSinceTurn = s.turn;
    expect(abilityProblem(s, ap, fresh, 0, [player(opp)])).toMatch(/can't be/i);
    const old = putOnBattlefield(s, ap, rocketLauncher());
    s.objects[old]!.controlledSinceTurn = 0;
    expect(abilityProblem(s, ap, old, 0, [player(opp)])).toBeNull();
    const life = s.players[opp]!.life;
    s = run(s, planActivate(s, ap, old, 0, [player(opp)]));
    s = settle(s);
    expect(s.players[opp]!.life).toBe(life - 1);
    expect(zone(s, old)).toBe("battlefield");
    s = goUntil(s, (x) => x.step === "cleanup" || x.activePlayer !== ap);
    expect(zone(s, old)).toBe("graveyard");
    expect(zone(s, fresh)).toBe("battlefield");
  });

  it("Fractured Loyalty: whoever targets the enchanted creature gains control of it", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const theirs = veteran(s, opp, hillGiant());
    attach(s, opp, fracturedLoyalty(), theirs);
    const growth = toZone(s, ap, giantGrowth(), "hand");
    s = castNow(s, ap, growth, [tgt(theirs)]);
    s = settle(s);
    expect(controllerOf(s, s.objects[theirs]!)).toBe(ap);
    expect(pt(s, theirs)).toBe("6/6");
  });

  it("Burden of Proof: +2/+2 on a Detective you control; otherwise base 1/1 and can't block Detectives", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const mine = veteran(s, ap, detective());
    attach(s, ap, burdenOfProof(), mine);
    expect(pt(s, mine)).toBe("4/4");
    const theirs = veteran(s, opp, detective("Their Detective"));
    attach(s, ap, burdenOfProof(), theirs);
    const plain = veteran(s, opp, soldier());
    attach(s, ap, burdenOfProof(), plain);
    const myBear = veteran(s, ap, bears());
    invalidateCharacteristics(s);
    expect(pt(s, theirs)).toBe("1/1");
    expect(pt(s, plain)).toBe("1/1");
    s = attackWith(s, [mine, myBear], opp);
    s = toBlocks(s);
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: plain, attacker: mine }] })).toThrow();
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: theirs, attacker: mine }] })).toThrow();
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: plain, attacker: myBear }] })).not.toThrow();
  });

  it("Arashin War Beast: once per combat damage step, however many blockers it damaged", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const beast = veteran(s, ap, arashin());
    const b1 = veteran(s, opp, bears());
    const b2 = veteran(s, opp, bear({ name: "Bear Two" }));
    const lib = s.players[ap]!.library.length;
    s = attackWith(s, [beast], opp);
    s = toBlocks(s);
    s = block(s, opp, [{ blocker: b1, attacker: beast }, { blocker: b2, attacker: beast }]);
    s = passUntilThat(s, (x) => x.step === "main2");
    expect(s.players[ap]!.library.length).toBe(lib - 1);
    expect(s.battlefield.filter((id) => s.objects[id]!.faceDown && controllerOf(s, s.objects[id]!) === ap).length).toBe(1);
  });

  it("Canal Courier: can't be blocked when another creature attacks a different player", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const courier = veteran(s, ap, canalCourier());
    const other = veteran(s, ap, bears());
    const blocker = veteran(s, opp, hillGiant());
    // Both at the same player: blockable.
    s = attackWith(s, [courier, other], opp);
    s = toBlocks(s);
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker, attacker: courier }] })).not.toThrow();
    const { s: t0, ap: ap2, opp: opp2 } = setup([]);
    let t = t0;
    const c2 = veteran(t, ap2, canalCourier());
    const o2 = veteran(t, ap2, bears());
    const b2 = veteran(t, opp2, hillGiant());
    for (let i = 0; i < 50 && t.pending?.kind !== "declareAttackers"; i++) t = act(t, { type: "passPriority", player: waitingOn(t)! });
    t = act(t, { type: "declareAttackers", player: ap2, attacks: [{ attacker: c2, defender: opp2 }, { attacker: o2, defender: third(t, ap2) }] });
    t = toBlocks(t);
    expect(t.pending?.kind).toBe("declareBlockers");
    const blockerOf = (t.pending as { player: PlayerId }).player === opp2 ? opp2 : null;
    expect(blockerOf).toBe(opp2);
    expect(() => act(t, { type: "declareBlockers", player: opp2, blocks: [{ blocker: b2, attacker: c2 }] })).toThrow();
  });

  it("Seasoned Cryomancer: tap and stun up to as many creatures as nonland cards discarded", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    handOf(s, ap, [bears(), bolt()]);
    stackLibrary(s, ap, [hillGiant(), shock()]);
    const cryo = toZone(s, ap, cryomancer(), "hand");
    const t1 = veteran(s, opp, bears());
    const t2 = veteran(s, opp, hillGiant());
    s = castNow(s, ap, cryo);
    s = passUntilThat(s, (x) => x.pending?.kind === "discard" || (x.stack.length > 0 && x.stack.at(-1)!.kind !== "spell" && false));
    const nonland = s.players[ap]!.hand.filter((id) => !characteristics(s, s.objects[id]!).types.includes("Land")).slice(0, 2);
    s = act(s, { type: "discard", player: ap, objectIds: nonland });
    s = passUntilThat(s, (x) => x.pending?.kind === "chooseTargets");
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(t1), tgt(t2)] });
    s = settle(s);
    for (const id of [t1, t2]) {
      expect(s.objects[id]!.tapped).toBe(true);
      expect(counters(s, id, "stun")).toBe(1);
    }
  });

  it("Seasoned Cryomancer: discarding only lands triggers nothing", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    handOf(s, ap, []);
    const land = card("Wastes", "Basic Land");
    stackLibrary(s, ap, [land, card("Wastes", "Basic Land")]);
    const cryo = toZone(s, ap, cryomancer(), "hand");
    s = castNow(s, ap, cryo);
    s = settle(s, { me: [ap] });
    expect(named(s, ap, "graveyard", "Wastes").length).toBe(2);
    expect(s.pending).toBeNull();
    expect(s.stack.length).toBe(0);
  });

  it("Creepy Puppeteer: with exactly one other attacker, it may become 4/3; not with two", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const pup = veteran(s, ap, puppeteer());
    const other = veteran(s, ap, bears());
    s = attackWith(s, [pup, other], opp);
    s = settle(s, { may: true });
    expect(pt(s, other)).toBe("4/3");
    const { s: t0, ap: ap2, opp: opp2 } = setup([]);
    let t = t0;
    const p2 = veteran(t, ap2, puppeteer());
    const x1 = veteran(t, ap2, bears());
    const x2 = veteran(t, ap2, bear({ name: "Bear Two" }));
    t = attackWith(t, [p2, x1, x2], opp2);
    expect(t.stack.length + t.triggerQueue.length).toBe(0);
    expect(pt(t, x1)).toBe("2/2");
  });

  it("Display of Dominance: your permanents can't be targeted by opponents' blue or black spells this turn", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const mine = veteran(s, ap, bears());
    const dod = toZone(s, ap, displayDominance(), "hand");
    s = castModes(s, ap, dod, [], [1]);
    s = settle(s);
    const blade = toZone(s, opp, doomBlade(), "hand");
    const zap = toZone(s, opp, shock(), "hand");
    s.players[opp]!.manaPool = { ...s.players[opp]!.manaPool, B: 2, R: 1 };
    s = act(s, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(opp);
    expect(castProblem(s, opp, blade, [tgt(mine)])).toMatch(/target/i);
    expect(planCast(s, opp, zap, [tgt(mine)])).not.toBeNull();
  });

  it("Display of Dominance: destroys a blue or black noncreature permanent", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const ench = veteran(s, opp, card("Blue Thing", "Enchantment", "{U}"));
    const dod = toZone(s, ap, displayDominance(), "hand");
    s = castModes(s, ap, dod, [tgt(ench)], [0]);
    s = settle(s);
    expect(zone(s, ench)).toBe("graveyard");
  });

  it("Compel Brutality: a planeswalker deals damage equal to its loyalty", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const pw = putOnBattlefield(s, ap, planeswalker());
    s.objects[pw]!.counters.loyalty = 4;
    const giant = veteran(s, opp, card("Big One", "Creature — Giant", "{4}", { power: "5", toughness: "5" }));
    const cb = toZone(s, ap, compelBrutality(), "hand");
    s = castModes(s, ap, cb, [tgt(pw), tgt(giant)], [1]);
    s = settle(s);
    expect(s.objects[giant]!.damage).toBe(4);
  });

  it("Eye of Doom: each player puts a doom counter on a nonland permanent; sacrificing it destroys them", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const theirs = veteran(s, opp, hillGiant());
    const eye = toZone(s, ap, eyeOfDoom(), "hand");
    s = castNow(s, ap, eye);
    s = passUntilThat(s, (x) => x.pending?.kind === "pickPermanents" && x.pending.player === ap);
    s = act(s, { type: "pickPermanents", player: ap, ids: [theirs] });
    s = passUntilThat(s, (x) => !x.stack.length && !x.pending);
    expect(counters(s, theirs, "doom")).toBeGreaterThanOrEqual(1);
    const doomed = s.battlefield.filter((id) => counters(s, id, "doom") > 0);
    expect(doomed.length).toBeGreaterThanOrEqual(1);
    const eyeId = s.battlefield.find((id) => characteristics(s, s.objects[id]!).name === "Eye of Doom")!;
    s.objects[eyeId]!.controlledSinceTurn = 0;
    s = run(s, planActivate(s, ap, eyeId, 0, []));
    s = settle(s);
    expect(zone(s, theirs)).toBe("graveyard");
    for (const id of doomed) expect(zone(s, id)).not.toBe("battlefield");
  });

  it("Hazezon Tamar: Sand Warriors at your next upkeep for the lands you control then; they leave with it", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    handOf(s, ap, []);
    const hz = toZone(s, ap, hazezon(), "hand");
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, R: 1, G: 1, W: 1, C: 4 };
    s = castNow(s, ap, hz);
    s = settle(s);
    const lands = () => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === ap && characteristics(s, s.objects[id]!).types.includes("Land")).length;
    // A plain Warrior: not a Sand Warrior.
    const warrior = veteran(s, ap, card("Plain Warrior", "Creature — Human Warrior", "{1}", { power: "1", toughness: "1" }));
    s = goUntil(s, (x) => x.activePlayer === ap && x.step === "upkeep" && x.turn > s0.turn);
    const n = lands();
    s = settle(s);
    const sand = s.battlefield.filter((id) => characteristics(s, s.objects[id]!).subtypes.includes("Sand"));
    expect(sand.length).toBe(n);
    expect(characteristics(s, s.objects[sand[0]!]!).colors.sort()).toEqual(["G", "R", "W"]);
    // It leaves: all Sand Warriors are exiled, not other Warriors.
    const hid = s.battlefield.find((id) => characteristics(s, s.objects[id]!).name === "Hazezon Tamar")!;
    destroyPermanent(s, s.objects[hid]!, "test");
    closeZoneBatch(s);
    s = settle(s);
    for (const id of sand) expect(s.objects[id]?.zone ?? "gone").not.toBe("battlefield");
    expect(zone(s, warrior)).toBe("battlefield");
  });

  it("Goblin Lyre: a won flip deals damage for your creatures, a lost one deals you damage for the target's controller's creatures", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 12 && seen.size < 2; seed++) {
      const { s: s0, ap, opp } = setup([], seed);
      let s = s0;
      const lyre = veteran(s, ap, goblinLyre());
      for (let i = 0; i < 2; i++) veteran(s, ap, bears());
      const walker = putOnBattlefield(s, opp, planeswalker());
      s.objects[walker]!.counters.loyalty = 9;
      for (let i = 0; i < 3; i++) veteran(s, opp, bear({ name: `Their Bear ${i}` }));
      const mine = s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === ap && characteristics(s, s.objects[id]!).types.includes("Creature")).length;
      const theirs = s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === opp && characteristics(s, s.objects[id]!).types.includes("Creature")).length;
      const life = lifeOf(s, ap);
      s = run(s, planActivate(s, ap, lyre, 0, [tgt(walker)]));
      s = settle(s);
      if (lifeOf(s, ap) === life) {
        seen.add("won");
        expect(s.objects[walker]!.counters.loyalty ?? 0).toBe(9 - mine);
      } else {
        seen.add("lost");
        expect(lifeOf(s, ap)).toBe(life - theirs);
        expect(s.objects[walker]!.counters.loyalty).toBe(9);
      }
    }
    expect(seen.size).toBe(2);
  });

  it("Kiora of Salt and Sand: after a loyalty ability, attacking untaps the target and it can't be blocked; walkers get the -8", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    putOnBattlefield(s, ap, kiora());
    const pw = putOnBattlefield(s, ap, planeswalker());
    s.objects[pw]!.counters.loyalty = 8;
    expect(abilitiesOf(s, s.objects[pw]!).activated.some((a) => /Leviathan/.test(a.text ?? ""))).toBe(true);
    const attacker = veteran(s, ap, hillGiant());
    const blocker = veteran(s, opp, bears());
    // No loyalty ability yet: the attack trigger does nothing.
    s = attackWith(s, [attacker], opp);
    s = toBlocks(s, { targets: [[tgt(attacker)]] });
    expect(s.objects[attacker]!.tapped).toBe(true);
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker, attacker }] })).not.toThrow();

    const { s: t0, ap: ap2, opp: opp2 } = setup([]);
    let t = t0;
    putOnBattlefield(t, ap2, kiora());
    const pw2 = putOnBattlefield(t, ap2, planeswalker());
    t.objects[pw2]!.counters.loyalty = 4;
    const att2 = veteran(t, ap2, hillGiant());
    const blk2 = veteran(t, opp2, bears());
    t = run(t, planActivate(t, ap2, pw2, abilitiesIndex(t, pw2, /gain 1 life/), []));
    t = settle(t);
    t = attackWith(t, [att2], opp2);
    t = toBlocks(t, { targets: [[tgt(att2)]] });
    expect(t.objects[att2]!.tapped).toBe(false);
    expect(() => act(t, { type: "declareBlockers", player: opp2, blocks: [{ blocker: blk2, attacker: att2 }] })).toThrow();
  });

  it("Specter of Mortality: each other creature gets -X/-X for the creature cards exiled from your graveyard", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const dead = [toZone(s, ap, bears(), "graveyard"), toZone(s, ap, hillGiant(), "graveyard"), toZone(s, ap, bear({ name: "Third Bear" }), "graveyard")];
    const giant = veteran(s, opp, card("Big One", "Creature — Giant", "{4}", { power: "5", toughness: "5" }));
    const sp = toZone(s, ap, specter(), "hand");
    s = castNow(s, ap, sp);
    s = settle(s, { me: [ap] });
    expect(s.pending?.kind).toBe("searchLibrary");
    s = act(s, { type: "searchLibrary", player: ap, found: dead.slice(0, 2) });
    s = settle(s);
    expect(zone(s, dead[0]!)).toBe("exile");
    expect(zone(s, dead[2]!)).toBe("graveyard");
    expect(pt(s, giant)).toBe("3/3");
    const specterId = onField(s, ap, "Specter of Mortality")[0]!;
    expect(pt(s, specterId)).toBe("3/3");
  });

  it("two-word creature types: Kor Castigator can't be blocked by Eldrazi Scions, only by those", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const kor = veteran(s, ap, korCastigator());
    const scion = veteran(s, opp, eldrazi("Scion", "Eldrazi Scion"));
    const drone = veteran(s, opp, eldrazi("Drone", "Eldrazi Drone"));
    s = attackWith(s, [kor], opp);
    s = toBlocks(s);
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: scion, attacker: kor }] })).toThrow();
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: drone, attacker: kor }] })).not.toThrow();
  });

  it("two-word creature types: Deathless Behemoth's cost takes Eldrazi Scions, not other Eldrazi", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const behemoth = toZone(s, ap, deathlessBehemoth(), "graveyard");
    const drones = [veteran(s, ap, eldrazi("Drone A", "Eldrazi Drone")), veteran(s, ap, eldrazi("Drone B", "Eldrazi Drone"))];
    expect(abilityProblem(s, ap, behemoth, 0, [])).not.toBeNull();
    expect(planActivate(s, ap, behemoth, 0, [], undefined, undefined, undefined, { sacrifice: drones })).toBeNull();
    const scions = [veteran(s, ap, eldrazi("Scion A", "Eldrazi Scion")), veteran(s, ap, eldrazi("Scion B", "Eldrazi Scion"))];
    expect(abilityProblem(s, ap, behemoth, 0, [])).toBeNull();
    s = run(s, planActivate(s, ap, behemoth, 0, [], undefined, undefined, undefined, { sacrifice: scions }));
    s = settle(s);
    expect(zone(s, behemoth)).toBe("hand");
    for (const id of scions) expect(s.objects[id]?.zone ?? "gone").not.toBe("battlefield");
    for (const id of drones) expect(zone(s, id)).toBe("battlefield");
  });
});
