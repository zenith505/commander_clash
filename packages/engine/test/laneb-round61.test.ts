// Lane B, round 61: unsupported cards no earlier round wrote down, from the "Next for Lane B" list (EDHREC rank about
// 17,500 to 14,900), least played first (`npm run popular -- --least`).
// Clergy and Knight of the Holy Nimbus).

import { describe, expect, it } from "vitest";
import { act, addEffect, card, passUntil, putOnBattlefield, scry, setup } from "./helpers";
import { abilitiesOf, botActions, castProblem, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, moveObject, planActivate, power, toughness, planCast, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";
const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty, answering choices as the bots would; the choices a test makes stop it. */
const settle = (s: GameState, stopAt: (s: GameState) => boolean = () => false) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (stopAt(s)) break;
    const p = s.pending;
    if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Plays on (no attacks or blocks unless asked, the bots answering other questions) until `stop`. */
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
const at = (kind: string, pid: PlayerId) => (s: GameState) => s.pending?.kind === kind && s.pending.player === pid;
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const ply = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const spell = (s: GameState, id: string): TargetChoice => ({ kind: "stack", id: s.stack.find((x) => x.objectId === id)!.id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const nameOf = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]!.name;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = [], choices: CostChoices = {}) => run(s, planCast(s, pid, id, targets, undefined, undefined, undefined, choices));
/** Moves a new card for `def` into `pid`'s hand, library (on top) or graveyard. */
const toZone = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "library" | "graveyard" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Passes to the declare attackers step of the active player's turn and declares `attackers` at `defender`; stops at the first question. */
const attackWith = (s: GameState, attackers: string[], defender: PlayerId) => {
  for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  s = act(s, { type: "declareAttackers", player: s.activePlayer, attacks: attackers.map((attacker) => ({ attacker, defender })) });
  for (let i = 0; i < 50 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const toBlocks = (s: GameState) => {
  for (let i = 0; i < 50 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Leaves only `keep` in `pid`'s hand (setup's hand also holds the seven cards drawn). */
const onlyHand = (s: GameState, pid: PlayerId, keep: string[]) => {
  const p = s.players[pid]!;
  for (const id of p.hand.filter((id) => !keep.includes(id))) {
    s.objects[id]!.zone = "exile";
    p.exile.push(id);
  }
  p.hand = p.hand.filter((id) => keep.includes(id));
};
const counters = (s: GameState, id: string, kind = "+1/+1") => s.objects[id]!.counters?.[kind] ?? 0;
const answerMay = (s: GameState, pid: PlayerId, yes: boolean) => act(s, { type: "chooseMay", player: pid, yes });
/** Passes until `pid` is asked to choose targets for a trigger, then chooses `targets`. */
const triggerTargets = (s: GameState, pid: PlayerId, targets: TargetChoice[]) => {
  s = settle(s, at("chooseTargets", pid));
  expect(s.pending?.kind).toBe("chooseTargets");
  return act(s, { type: "chooseTargets", player: pid, targets } as Action);
};

// Real oracle text (Scryfall).
const swipe = (): CardDef => ({"oracleId":"c74c87f7-3120-4fd7-8735-1d7a7a429643","name":"Savage Swipe","manaCost":"{G}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target creature you control gets +2/+2 until end of turn if its power is 2. Then it fights target creature you don't control. (Each deals damage equal to its power to the other.)","colors":["G"],"colorIdentity":["G"],"keywords":["Fight"],"layout":"normal"}) as CardDef;
const heroicReturn = (): CardDef => ({"oracleId":"4b7a8c05-15cd-452e-b9fc-83800e81793d","name":"Heroic Return","manaCost":"{5}{W}","cmc":6,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"This spell costs {2} less to cast if a creature is attacking you.\nReturn target creature card from your graveyard to the battlefield. If a Hero enters this way, it enters with two additional +1/+1 counters on it.","colors":["W"],"colorIdentity":["W"],"keywords":[],"layout":"normal"}) as CardDef;
const pelt = (): CardDef => ({"oracleId":"2348f3d4-02cc-4611-a7e0-b77604d5f2e8","name":"Pelt Collector","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Warrior","supertypes":[],"types":["Creature"],"subtypes":["Elf","Warrior"],"oracleText":"Whenever another creature you control enters or dies, if that creature's power is greater than this creature's, put a +1/+1 counter on this creature.\nAs long as this creature has three or more +1/+1 counters on it, it has trample.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"layout":"normal"}) as CardDef;
const vengevine = (): CardDef => ({"oracleId":"7ed52301-81ea-4e7f-b985-cfab0593cae4","name":"Vengevine","manaCost":"{2}{G}{G}","cmc":4,"typeLine":"Creature — Elemental","supertypes":[],"types":["Creature"],"subtypes":["Elemental"],"oracleText":"Haste\nWhenever you cast a spell, if it's the second creature spell you cast this turn, you may return this card from your graveyard to the battlefield.","power":"4","toughness":"3","colors":["G"],"colorIdentity":["G"],"keywords":["Haste"],"layout":"normal"}) as CardDef;
const punishingFire = (): CardDef => ({"oracleId":"1890ef1b-38e5-432d-b040-f33cea7814e7","name":"Punishing Fire","manaCost":"{1}{R}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Punishing Fire deals 2 damage to any target.\nWhenever an opponent gains life, you may pay {R}. If you do, return this card from your graveyard to your hand.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const energyArc = (): CardDef => ({"oracleId":"959bcf99-3c9a-4f99-98b2-13514d3dac16","name":"Energy Arc","manaCost":"{W}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Untap any number of target creatures. Prevent all combat damage that would be dealt to and dealt by those creatures this turn.","colors":["U","W"],"colorIdentity":["U","W"],"keywords":[],"layout":"normal"}) as CardDef;
const dummy = (): CardDef => ({"oracleId":"036b7b89-e49a-4560-9de9-1d4d71f3f666","name":"Sparring Dummy","manaCost":"{1}{G}","cmc":2,"typeLine":"Artifact Creature — Scarecrow","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Scarecrow"],"oracleText":"Defender\n{T}: Mill a card. You may put a land card milled this way into your hand. You gain 2 life if a Lesson card is milled this way. (To mill a card, put the top card of your library into your graveyard.)","power":"1","toughness":"3","colors":["G"],"colorIdentity":["G"],"keywords":["Mill","Defender"],"layout":"normal"}) as CardDef;
const encore = (): CardDef => ({"oracleId":"921e7f6b-bf49-46f1-9fdd-b0e5fde5a5a1","name":"Fiery Encore","manaCost":"{4}{R}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Discard a card, then draw a card. When you discard a nonland card this way, Fiery Encore deals damage equal to that card's mana value to target creature or planeswalker.\nStorm (When you cast this spell, copy it for each spell cast before it this turn.)","colors":["R"],"colorIdentity":["R"],"keywords":["Storm"],"layout":"normal"}) as CardDef;
const genesis = (): CardDef => ({"oracleId":"c3ce3473-e3bc-4b7c-ae57-957e6c40dc7a","name":"Infernal Genesis","manaCost":"{4}{B}{B}","cmc":6,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of each player's upkeep, that player mills a card. Then they create X 1/1 black Minion creature tokens, where X is the milled card's mana value.","colors":["B"],"colorIdentity":["B"],"keywords":["Mill"],"layout":"normal"}) as CardDef;
const taste = (): CardDef => ({"oracleId":"1896c513-ec48-4c8f-9acb-30bc6357fce2","name":"Discerning Taste","manaCost":"{2}{B}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Look at the top four cards of your library. Put one of them into your hand and the rest into your graveyard. You gain life equal to the greatest power among creature cards put into your graveyard this way.","colors":["B"],"colorIdentity":["B"],"keywords":[],"layout":"normal"}) as CardDef;
const breath = (): CardDef => ({"oracleId":"eb887067-4466-45da-8387-4444fdc723f8","name":"Breath of the Sleepless","manaCost":"{3}{U}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"You may cast Spirit spells as though they had flash.\nWhenever you cast a creature spell during an opponent's turn, tap up to one target creature.","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"}) as CardDef;
const breakSpell = (): CardDef => ({"oracleId":"b9d51e07-851f-4b7b-bffe-7c1efff0714c","name":"Break the Spell","manaCost":"{W}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target enchantment. If a permanent you controlled or a token was destroyed this way, draw a card.","colors":["W"],"colorIdentity":["W"],"keywords":[],"layout":"normal"}) as CardDef;
const beastie = (): CardDef => ({"oracleId":"3da5fbe2-e47b-4a1d-9e73-393f37314fa3","name":"Beastie Beatdown","manaCost":"{R}{G}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Choose target creature you control and target creature an opponent controls.\nDelirium — If there are four or more card types among cards in your graveyard, put two +1/+1 counters on the creature you control.\nThe creature you control deals damage equal to its power to the creature an opponent controls.","colors":["G","R"],"colorIdentity":["G","R"],"keywords":["Delirium"],"layout":"normal"}) as CardDef;
const elders = (): CardDef => ({"oracleId":"9e9164be-3534-4445-bfad-00d16a50575c","name":"Workshop Elders","manaCost":"{6}{U}","cmc":7,"typeLine":"Creature — Human Artificer","supertypes":[],"types":["Creature"],"subtypes":["Human","Artificer"],"oracleText":"Artifact creatures you control have flying.\nAt the beginning of combat on your turn, you may have target noncreature artifact you control become a 0/0 artifact creature. If you do, put four +1/+1 counters on it.","power":"4","toughness":"4","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"}) as CardDef;
const warZone = (): CardDef => ({"oracleId":"ed73de2b-d7f4-48d9-9be2-aa9d111b7aa7","name":"Contested War Zone","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"Whenever a creature deals combat damage to you, that creature's controller gains control of this land.\n{T}: Add {C}.\n{1}, {T}: Attacking creatures get +1/+0 until end of turn.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"layout":"normal"}) as CardDef;
const revenge = (): CardDef => ({"oracleId":"6292edfc-d75b-465e-9e10-9d259551b1a5","name":"Revenge of the Hunted","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Until end of turn, target creature gets +6/+6 and gains trample, and all creatures able to block it this turn do so.\nMiracle {G} (You may cast this card for its miracle cost when you draw it if it's the first card you drew this turn.)","colors":["G"],"colorIdentity":["G"],"keywords":["Miracle"],"layout":"normal"}) as CardDef;
const maw = (): CardDef => ({"oracleId":"952ab8fe-f7d3-4673-89de-8c6d3f8a081f","name":"Cavernous Maw","manaCost":"","cmc":0,"typeLine":"Land — Cave","supertypes":[],"types":["Land"],"subtypes":["Cave"],"oracleText":"{T}: Add {C}.\n{2}: This land becomes a 3/3 Elemental creature until end of turn. It's still a Cave land. Activate only if the number of other Caves you control plus the number of Cave cards in your graveyard is three or greater.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"layout":"normal"}) as CardDef;
const mica = (): CardDef => ({"oracleId":"fc90f74d-11f3-4bd4-b8a1-1cf2ffcd5b73","name":"Mica, Reader of Ruins","manaCost":"{3}{R}","cmc":4,"typeLine":"Legendary Creature — Human Artificer","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Artificer"],"oracleText":"Ward—Pay 3 life. (Whenever this creature becomes the target of a spell or ability an opponent controls, counter it unless that player pays 3 life.)\nWhenever you cast an instant or sorcery spell, you may sacrifice an artifact. If you do, copy that spell and you may choose new targets for the copy.","power":"4","toughness":"4","colors":["R"],"colorIdentity":["R"],"keywords":["Ward"],"layout":"normal"}) as CardDef;
const hex = (): CardDef => ({"oracleId":"7f9116e1-9aab-470b-90eb-f51a3fbb3c0e","name":"Lim-Dûl's Hex","manaCost":"{1}{B}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of your upkeep, for each player, this enchantment deals 1 damage to that player unless they pay {B} or {3}.","colors":["B"],"colorIdentity":["B"],"keywords":[],"layout":"normal"}) as CardDef;
const arsonist = (): CardDef => ({"oracleId":"d9ee7916-2c9d-4489-8dd8-86929b09c6ea","name":"Midnight Arsonist","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Vampire","supertypes":[],"types":["Creature"],"subtypes":["Vampire"],"oracleText":"When this creature enters, destroy up to X target artifacts without mana abilities, where X is the number of Vampires you control.","power":"3","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const quicksand = (): CardDef => ({"oracleId":"f2b376d2-a2f4-4d23-a1fb-eb7b6ebd0b7a","name":"Sandman's Quicksand","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Mayhem {3}{B} (You may cast this card from your graveyard for {3}{B} if you discarded it this turn. Timing rules still apply.)\nAll creatures get -2/-2 until end of turn. If this spell's mayhem cost was paid, creatures your opponents control get -2/-2 until end of turn instead.","colors":["B"],"colorIdentity":["B"],"keywords":["Mayhem"],"layout":"normal"}) as CardDef;
const confront = (): CardDef => ({"oracleId":"beb3f812-da58-4f03-915b-dc473cd01554","name":"Confront the Assault","manaCost":"{4}{W}","cmc":5,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Cast this spell only if a creature is attacking you.\nCreate three 1/1 white Spirit creature tokens with flying.","colors":["W"],"colorIdentity":["W"],"keywords":[],"layout":"normal"}) as CardDef;
const kujata = (): CardDef => ({"oracleId":"9fe77f70-85cf-4a18-9451-2fad4c341f07","name":"Summon: Kujata","manaCost":"{5}{R}","cmc":6,"typeLine":"Enchantment Creature — Saga Ox","supertypes":[],"types":["Enchantment","Creature"],"subtypes":["Saga","Ox"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — Lightning — This creature deals 3 damage to each of up to two target creatures.\nII — Ice — Up to three target creatures can't block this turn.\nIII — Fire — Discard a card, then draw two cards. When you discard a card this way, this creature deals damage equal to that card's mana value to each opponent.\nTrample, haste","power":"7","toughness":"5","colors":["R"],"colorIdentity":["R"],"keywords":["Haste","Trample"],"layout":"saga"}) as CardDef;

// Test cards.
const vanilla = (name: string, typeLine: string, cost: string, cmc: number, p: number, t: number, extra: Partial<CardDef> = {}) => card(name, typeLine, cost, { cmc, power: String(p), toughness: String(t), ...extra });
const bearC = (name = "Plain Bear", p = 2, t = 2) => vanilla(name, "Creature — Bear", "{1}{G}", 2, p, t, { colors: ["G"] });
const knight = (name = "Test Knight", kw = "Vigilance") => vanilla(name, "Creature — Human Knight", "{1}{W}", 2, 2, 2, { colors: ["W"], keywords: [kw], oracleText: kw });
const pinger = (name = "Test Pinger") => vanilla(name, "Creature — Human Wizard", "{1}{U}", 2, 1, 1, { colors: ["U"], oracleText: "{T}: Draw a card." });
const giant = (name = "Test Giant", cmc = 5) => vanilla(name, "Creature — Giant", `{${cmc - 1}}{R}`, cmc, 5, 5, { colors: ["R"] });
const flyer = (name = "Test Bird") => vanilla(name, "Creature — Bird", "{1}{W}", 2, 1, 1, { colors: ["W"], keywords: ["Flying"], oracleText: "Flying" });
const opt = (name = "Test Opt") => card(name, "Instant", "{U}", { cmc: 1, colors: ["U"], oracleText: "Draw a card." });
const bolt = (name = "Test Bolt") => card(name, "Instant", "{R}", { cmc: 1, colors: ["R"], oracleText: "Test Bolt deals 3 damage to any target.".replace("Test Bolt", name) });
const boros = (name = "Test Boros Bolt") => card(name, "Instant", "{R}{W}", { cmc: 2, colors: ["R", "W"], oracleText: `${name} deals 2 damage to any target.` });
const reanimate = () => card("Test Reanimate", "Sorcery", "{B}", { cmc: 1, colors: ["B"], oracleText: "Return target creature card from your graveyard to the battlefield." });
const trinket = (name = "Test Trinket", cmc = 1) => card(name, "Artifact", `{${cmc}}`, { cmc, colors: [], oracleText: "" });
const testLand = (name = "Test Land") => card(name, "Land", "", { oracleText: "" });
const tokensNamed = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.isToken && controllerOf(s, s.objects[id]!) === pid && nameOf(s, id).replace(/ Token$/, "") === name);
/** Its activated abilities can't be activated (Arrest's rule, game.ts). */
const locked = (s: GameState, id: string) => !!characteristics(s, s.objects[id]!).cantActivate;
/** Bushido 1, granted as an ability: its "blocks or becomes blocked" trigger (CR 702.45a). */
const bushido = (s: GameState, id: string) => abilitiesOf(s, s.objects[id]!).triggers.some((tr) => tr.event === "selfBlocksOrBecomesBlocked");
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
const kw = (s: GameState, id: string) => characteristics(s, s.objects[id]!).keywords;
const nextOf = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % 4]!;
/** Plays on to the beginning of `pid`'s next upkeep, stopping before its triggers resolve. */
const toUpkeep = (s: GameState, pid: PlayerId) => goUntil(s, (x) => x.step === "upkeep" && x.activePlayer === pid);
const activateNow = (s: GameState, pid: PlayerId, id: string, index: number, targets: TargetChoice[] = []) => run(s, planActivate(s, pid, id, index, targets));

const equipIndex = (s: GameState, id: string) => abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => a.equip);
/** Answers each "may" with `yes(prompt)`, the bots answering other questions, until the stack is empty. */
const settleMay = (s: GameState, pid: PlayerId, yes: (prompt: string) => boolean) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay" && p.player === pid) s = act(s, { type: "chooseMay", player: pid, yes: yes(p.prompt) });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const legend = (name = "Test Legend") => vanilla(name, "Legendary Creature — Human Soldier", "{1}{W}", 2, 2, 2, { colors: ["W"], supertypes: ["Legendary"] });
const fight = () => card("Test Fight", "Sorcery", "{G}", { cmc: 1, colors: ["G"], oracleText: "Target creature you control fights target creature you don't control." });
const glorious = () => card("Test Glorious Anthem", "Enchantment", "{1}{W}", { cmc: 2, colors: ["W"], oracleText: "Creatures you control get +1/+1." });
const enchCreature = () => vanilla("Test Enchantment Creature", "Enchantment Creature — Nymph", "{1}{W}", 2, 2, 2, { colors: ["W"] });
const wreck = () => card("Test Wreck", "Instant", "{B}", { cmc: 1, colors: ["B"], oracleText: "Destroy target creature." });
const lifeGift = () => card("Test Gift", "Instant", "{W}", { cmc: 1, colors: ["W"], oracleText: "Target player gains 3 life." });
const spirit = () => vanilla("Test Spirit", "Creature — Spirit", "{1}{U}", 2, 1, 1, { colors: ["U"] });
const hero = () => vanilla("Test Hero", "Creature — Human Hero", "{1}{W}", 2, 2, 2, { colors: ["W"] });
const lesson = () => card("Test Lesson", "Sorcery — Lesson", "{1}{G}", { cmc: 2, colors: ["G"], oracleText: "Draw a card." });
const charm = (name = "Test Charm") => card(name, "Enchantment", "{1}{W}", { cmc: 2, colors: ["W"], oracleText: "" });
const cave = (name: string) => card(name, "Land — Cave", "", { oracleText: "{T}: Add {C}." });
const wreckBig = () => card("Test Doom", "Instant", "{B}", { cmc: 1, colors: ["B"], oracleText: "Destroy target enchantment." });
const lifeOf = (s: GameState, pid: PlayerId) => s.players[pid]!.life;

describe("Lane B round 61", () => {
  it("are fully supported", () => {
    supported(swipe(), heroicReturn(), pelt(), vengevine(), punishingFire(), energyArc(), dummy(), encore(), genesis(), taste(), breath(), breakSpell(), beastie(), elders(), warZone(), revenge(), maw(), mica(), hex(), arsonist(), quicksand(), confront(), kujata());
  });

  it("Savage Swipe: +2/+2 only if its power is exactly 2 as it resolves; it fights either way", () => {
    const { s: s0, ap, opp } = setup([]);
    const mine = putOnBattlefield(s0, ap, bearC("My Bear"));
    const theirs = putOnBattlefield(s0, opp, bearC("Their Bear", 3, 3));
    const sw = toZone(s0, ap, swipe(), "hand");
    let s = settle(castNow(s0, ap, sw, [tgt(mine), tgt(theirs)]));
    expect(zone(s, theirs)).toBe("graveyard");
    expect(pt(s, mine)).toBe("4/4");
    expect(s.objects[mine]!.damage).toBe(3);
    // A 3-power creature gets nothing but still fights.
    const big = putOnBattlefield(s, ap, bearC("Big Bear", 3, 3));
    const small = putOnBattlefield(s, opp, bearC("Small Bear", 2, 2));
    const sw2 = toZone(s, ap, swipe(), "hand");
    s = settle(castNow(s, ap, sw2, [tgt(big), tgt(small)]));
    expect(pt(s, big)).toBe("3/3");
    expect(s.objects[big]!.damage).toBe(2);
    expect(zone(s, small)).toBe("graveyard");
  });

  it("Heroic Return: {2} less while a creature is attacking you; a Hero returns with two more +1/+1 counters, another creature without", () => {
    const { s: s0, ap, opp } = setup([]);
    const hr = toZone(s0, ap, heroicReturn(), "hand");
    const h = toZone(s0, ap, hero(), "graveyard");
    poolOnly(s0, ap, { W: 1, C: 3 });
    expect(planCast(s0, ap, hr, [tgt(h)])).toBeNull();
    const attacker = putOnBattlefield(s0, opp, bearC("Their Attacker"));
    s0.objects[attacker]!.attacking = ap;
    invalidateCharacteristics(s0);
    let s = settle(castNow(s0, ap, hr, [tgt(h)]));
    expect(zone(s, h)).toBe("battlefield");
    expect(counters(s, h)).toBe(2);
    const b = toZone(s, ap, bearC("Dead Bear"), "graveyard");
    const hr2 = toZone(s, ap, heroicReturn(), "hand");
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, W: 1, C: 5 };
    s = settle(castNow(s, ap, hr2, [tgt(b)]));
    expect(zone(s, b)).toBe("battlefield");
    expect(counters(s, b)).toBe(0);
  });

  it("Pelt Collector: a +1/+1 counter when another creature you control with greater power enters or dies", () => {
    const { s: s0, ap } = setup([]);
    const pc = putOnBattlefield(s0, ap, pelt());
    const b1 = toZone(s0, ap, bearC("First Bear"), "hand");
    let s = settle(castNow(s0, ap, b1));
    expect(counters(s, pc)).toBe(1); // 2 > 1
    const b2 = toZone(s, ap, bearC("Second Bear"), "hand");
    s = settle(castNow(s, ap, b2));
    expect(counters(s, pc)).toBe(1); // 2 isn't greater than 2
    // Dying: its power as it last existed.
    const big = putOnBattlefield(s, ap, bearC("Big Bear", 3, 3));
    const w = toZone(s, ap, wreck(), "hand");
    s = settle(castNow(s, ap, w, [tgt(big)]));
    expect(zone(s, big)).toBe("graveyard");
    expect(counters(s, pc)).toBe(2);
    expect(pt(s, pc)).toBe("3/3");
  });

  it("Vengevine: returns from your graveyard when you cast your second creature spell of the turn, not the first or third", () => {
    const { s: s0, ap } = setup([]);
    const v = toZone(s0, ap, vengevine(), "graveyard");
    const [c1, o1, c2, c3] = [toZone(s0, ap, bearC("Bear One"), "hand"), toZone(s0, ap, opt(), "hand"), toZone(s0, ap, bearC("Bear Two"), "hand"), toZone(s0, ap, bearC("Bear Three"), "hand")];
    let s = settleMay(castNow(s0, ap, c1), ap, () => true);
    s = settleMay(castNow(s, ap, o1), ap, () => true);
    expect(zone(s, v)).toBe("graveyard");
    s = settleMay(castNow(s, ap, c2), ap, () => true);
    expect(zone(s, v)).toBe("battlefield");
    expect(kw(s, v)).toContain("Haste");
    // Back in the graveyard: the third creature spell doesn't bring it back.
    s = settle(castNow(s, ap, toZone(s, ap, wreck(), "hand"), [tgt(v)]));
    expect(zone(s, v)).toBe("graveyard");
    s = settleMay(castNow(s, ap, c3), ap, () => true);
    expect(zone(s, v)).toBe("graveyard");
  });

  it("Punishing Fire: when an opponent gains life, pay {R} to return it from your graveyard to your hand; not when you gain life", () => {
    const { s: s0, ap, opp } = setup([]);
    const pf = toZone(s0, ap, punishingFire(), "graveyard");
    let s = settleMay(castNow(s0, ap, toZone(s0, ap, lifeGift(), "hand"), [ply(ap)]), ap, () => true);
    expect(zone(s, pf)).toBe("graveyard");
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, R: 1 };
    s = settleMay(castNow(s, ap, toZone(s, ap, lifeGift(), "hand"), [ply(opp)]), ap, () => true);
    expect(lifeOf(s, opp)).toBe(43);
    expect(zone(s, pf)).toBe("hand");
    expect(s.players[ap]!.manaPool.R).toBe(0);
  });

  it("Energy Arc: untaps any number of target creatures; they deal and are dealt no combat damage this turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const mine = putOnBattlefield(s0, ap, bearC("My Bear"));
    const other = putOnBattlefield(s0, ap, bearC("Other Bear"));
    const theirs = putOnBattlefield(s0, opp, bearC("Their Bear"));
    for (const id of [mine, theirs]) s0.objects[id]!.tapped = true;
    let s = settle(castNow(s0, ap, toZone(s0, ap, energyArc(), "hand"), [tgt(mine), tgt(theirs)]));
    expect(s.objects[mine]!.tapped).toBe(false);
    expect(s.objects[theirs]!.tapped).toBe(false);
    const before = lifeOf(s, opp);
    s = attackWith(s, [mine, other], opp);
    s = goUntil(s, (x) => x.step === "end");
    expect(lifeOf(s, opp)).toBe(before - 2); // only the Bear Energy Arc didn't target
  });

  it("Sparring Dummy: mill a card; a land milled may go to your hand, a Lesson milled gains you 2 life", () => {
    const { s: s0, ap } = setup([]);
    const d = putOnBattlefield(s0, ap, dummy());
    const land = toZone(s0, ap, testLand(), "library");
    let s = activateNow(s0, ap, d, 0);
    s = settle(s, at("searchLibrary", ap));
    expect(s.pending?.kind).toBe("searchLibrary");
    s = act(s, { type: "searchLibrary", player: ap, found: [land] });
    s = settle(s);
    expect(zone(s, land)).toBe("hand");
    const life = lifeOf(s, ap);
    const l = toZone(s, ap, lesson(), "library");
    s.objects[d]!.tapped = false;
    s = settle(activateNow(s, ap, d, 0));
    expect(zone(s, l)).toBe("graveyard");
    expect(lifeOf(s, ap)).toBe(life + 2);
  });

  it("Fiery Encore: discarding a nonland card deals damage equal to its mana value to target creature or planeswalker", () => {
    const { s: s0, ap, opp } = setup([]);
    const fe = toZone(s0, ap, encore(), "hand");
    const g = toZone(s0, ap, giant("Discarded Giant", 4), "hand");
    onlyHand(s0, ap, [fe, g]);
    const theirs = putOnBattlefield(s0, opp, bearC("Their Bear", 4, 4));
    let s = castNow(s0, ap, fe);
    s = triggerTargets(s, ap, [tgt(theirs)]);
    s = settle(s);
    expect(zone(s, g)).toBe("graveyard");
    expect(zone(s, theirs)).toBe("graveyard");
    // A land discarded: no damage.
    const fe2 = toZone(s, ap, encore(), "hand");
    const l = toZone(s, ap, testLand("Discarded Land"), "hand");
    onlyHand(s, ap, [fe2, l]);
    const other = putOnBattlefield(s, opp, bearC("Other Bear", 1, 1));
    s = settle(castNow(s, ap, fe2));
    expect(zone(s, l)).toBe("graveyard");
    expect(zone(s, other)).toBe("battlefield");
  });

  it("Infernal Genesis: each player mills a card in their upkeep and creates Minions equal to its mana value", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, genesis());
    const top = toZone(s0, opp, giant("Their Giant", 3), "library");
    let s = toUpkeep(s0, opp);
    s = settle(s);
    expect(zone(s, top)).toBe("graveyard");
    expect(tokensNamed(s, opp, "Minion").length).toBe(3);
    expect(tokensNamed(s, ap, "Minion").length).toBe(0);
  });

  it("Discerning Taste: one of the top four into your hand, the rest into your graveyard; gain the greatest power among those creature cards", () => {
    const { s: s0, ap } = setup([]);
    const cards = [giant("Big Giant", 6), bearC("Yard Bear", 3, 3), testLand(), bearC("Kept Bear", 1, 1)].map((d) => toZone(s0, ap, d, "library"));
    const life = lifeOf(s0, ap);
    let s = castNow(s0, ap, toZone(s0, ap, taste(), "hand"));
    s = settle(s, at("searchLibrary", ap));
    expect(s.pending?.kind).toBe("searchLibrary");
    s = act(s, { type: "searchLibrary", player: ap, found: [cards[0]!] });
    s = settle(s);
    expect(zone(s, cards[0]!)).toBe("hand");
    expect([1, 2, 3].map((i) => zone(s, cards[i]!))).toEqual(["graveyard", "graveyard", "graveyard"]);
    expect(lifeOf(s, ap)).toBe(life + 3);
  });

  it("Breath of the Sleepless: Spirits have flash; casting a creature spell during an opponent's turn taps up to one target creature", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, breath());
    const theirs = putOnBattlefield(s0, opp, bearC("Their Bear"));
    const sp = toZone(s0, ap, spirit(), "hand");
    // On your own turn: no trigger.
    let s = settle(castNow(s0, ap, toZone(s0, ap, bearC("My Bear"), "hand")));
    expect(s.objects[theirs]!.tapped).toBe(false);
    s = goUntil(s, (x) => x.activePlayer === opp && x.step === "main1" && !x.pending && waitingOn(x) === ap);
    s = castNow(s, ap, sp);
    s = triggerTargets(s, ap, [tgt(theirs)]);
    s = settle(s);
    expect(zone(s, sp)).toBe("battlefield");
    expect(s.objects[theirs]!.tapped).toBe(true);
  });

  it("Break the Spell: draws a card only if a permanent you controlled or a token was destroyed", () => {
    const { s: s0, ap, opp } = setup([]);
    const mine = putOnBattlefield(s0, ap, charm("My Charm"));
    const theirs = putOnBattlefield(s0, opp, charm("Their Charm"));
    const token = putOnBattlefield(s0, opp, charm("Their Token Charm"));
    s0.objects[token]!.isToken = true;
    const hand = () => s.players[ap]!.hand.length;
    let s = s0;
    const bs1 = toZone(s, ap, breakSpell(), "hand");
    let h = hand();
    s = settle(castNow(s, ap, bs1, [tgt(theirs)]));
    expect(zone(s, theirs)).toBe("graveyard");
    expect(hand()).toBe(h - 1);
    const bs2 = toZone(s, ap, breakSpell(), "hand");
    h = hand();
    s = settle(castNow(s, ap, bs2, [tgt(mine)]));
    expect(zone(s, mine)).toBe("graveyard");
    expect(hand()).toBe(h); // cast one, drew one
    const bs3 = toZone(s, ap, breakSpell(), "hand");
    h = hand();
    s = settle(castNow(s, ap, bs3, [tgt(token)]));
    expect(s.objects[token]?.zone === "battlefield").toBe(false);
    expect(hand()).toBe(h);
  });

  it("Beastie Beatdown: your creature deals damage equal to its power to theirs, with two +1/+1 counters first under delirium", () => {
    const { s: s0, ap, opp } = setup([]);
    const mine = putOnBattlefield(s0, ap, bearC("My Bear"));
    const theirs = putOnBattlefield(s0, opp, bearC("Their Bear", 3, 3));
    let s = settle(castNow(s0, ap, toZone(s0, ap, beastie(), "hand"), [tgt(mine), tgt(theirs)]));
    expect(counters(s, mine)).toBe(0);
    expect(s.objects[theirs]!.damage).toBe(2);
    expect(s.objects[mine]!.damage).toBe(0); // one-sided
    // Delirium: four card types among cards in your graveyard (the first Beatdown is a sorcery there).
    for (const d of [bearC("Yard Bear"), testLand("Yard Land"), trinket("Yard Trinket")]) toZone(s, ap, d, "graveyard");
    const other = putOnBattlefield(s, opp, bearC("Other Bear", 4, 4));
    s = settle(castNow(s, ap, toZone(s, ap, beastie(), "hand"), [tgt(mine), tgt(other)]));
    expect(counters(s, mine)).toBe(2);
    expect(zone(s, other)).toBe("graveyard");
  });

  it("Workshop Elders: at the beginning of combat, a noncreature artifact may become a 0/0 artifact creature with four +1/+1 counters (and flying)", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, elders());
    const art = putOnBattlefield(s0, ap, trinket());
    let s = goUntil(s0, at("chooseTargets", ap));
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(art)] });
    s = settleMay(s, ap, () => true);
    expect(characteristics(s, s.objects[art]!).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(counters(s, art)).toBe(4);
    expect(pt(s, art)).toBe("4/4");
    expect(kw(s, art)).toContain("Flying");
  });

  it("Contested War Zone: a creature dealing combat damage to you gives its controller control of it", () => {
    const { s: s0, ap, opp } = setup([]);
    const wz = putOnBattlefield(s0, ap, warZone());
    const theirs = putOnBattlefield(s0, opp, bearC("Their Bear"));
    // Opponent's turn: they attack you.
    let s = goUntil(s0, (x) => x.activePlayer === opp && x.pending?.kind === "declareAttackers");
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: theirs, defender: ap }] });
    s = goUntil(s, (x) => x.step === "end");
    expect(controllerOf(s, s.objects[wz]!)).toBe(opp);
  });

  it("Revenge of the Hunted: +6/+6 and trample until end of turn, and every creature able to block it must", () => {
    const { s: s0, ap, opp } = setup([]);
    const mine = putOnBattlefield(s0, ap, bearC("My Bear"));
    const blocker = putOnBattlefield(s0, opp, bearC("Their Bear"));
    let s = settle(castNow(s0, ap, toZone(s0, ap, revenge(), "hand"), [tgt(mine)]));
    expect(pt(s, mine)).toBe("8/8");
    expect(kw(s, mine)).toContain("Trample");
    s = attackWith(s, [mine], opp);
    s = toBlocks(s);
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [] })).toThrow();
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker, attacker: mine }] });
    expect(s.objects[blocker]!.blocking).toContain(mine);
  });

  it("Cavernous Maw: becomes a 3/3 Elemental Cave land creature only with three other Caves and Cave cards in your graveyard", () => {
    const { s: s0, ap } = setup([]);
    const m = putOnBattlefield(s0, ap, maw());
    putOnBattlefield(s0, ap, cave("Cave One"));
    putOnBattlefield(s0, ap, cave("Cave Two"));
    const idx = abilitiesOf(s0, s0.objects[m]!).activated.findIndex((a) => /3\/3/.test(a.text));
    expect(planActivate(s0, ap, m, idx)).toBeNull();
    toZone(s0, ap, cave("Cave Three"), "graveyard");
    const s = settle(activateNow(s0, ap, m, idx));
    const c = characteristics(s, s.objects[m]!);
    expect(c.types).toEqual(expect.arrayContaining(["Land", "Creature"]));
    expect(c.subtypes).toEqual(expect.arrayContaining(["Cave", "Elemental"]));
    expect(pt(s, m)).toBe("3/3");
  });

  it("Mica, Reader of Ruins: you may sacrifice an artifact to copy an instant or sorcery you cast", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, mica());
    const art = putOnBattlefield(s0, ap, trinket());
    const opps = s0.turnOrder.filter((p) => p !== ap);
    const before = opps.reduce((n, p) => n + life(s0, p), 0);
    s0.players[ap]!.manaPool.R = 1;
    let s = castNow(s0, ap, toZone(s0, ap, bolt(), "hand"), [ply(opps[0]!)]);
    s = settle(s, at("chooseMay", ap));
    expect(s.pending?.kind).toBe("chooseMay");
    s = settle(answerMay(s, ap, true));
    expect(zone(s, art)).toBe("graveyard");
    expect(before - opps.reduce((n, p) => n + life(s, p), 0)).toBe(6);
  });

  it("Mica, Reader of Ruins: no copy when you don't sacrifice", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, mica());
    const art = putOnBattlefield(s0, ap, trinket());
    const opp = s0.turnOrder.find((p) => p !== ap)!;
    s0.players[ap]!.manaPool.R = 1;
    let s = castNow(s0, ap, toZone(s0, ap, bolt(), "hand"), [ply(opp)]);
    s = settle(s, at("chooseMay", ap));
    s = settle(answerMay(s, ap, false));
    expect(zone(s, art)).toBe("battlefield");
    expect(life(s, opp)).toBe(37);
  });

  it("Lim-Dûl's Hex: at your upkeep, each player takes 1 damage unless they pay {B} or {3}", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, hex());
    const others = [1, 2, 3].map((k) => s0.turnOrder[(s0.turnOrder.indexOf(ap) + k) % 4]!);
    let s = goUntil(s0, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "punisher" && x.activePlayer === ap);
    const start = Object.fromEntries(s.turnOrder.map((p) => [p, life(s, p)]));
    const asked: PlayerId[] = [];
    for (let i = 0; i < 20 && s.pending; i++) {
      const p = s.pending;
      if (p.kind === "chooseOption" && p.what === "punisher") {
        asked.push(p.player);
        expect(p.labels!.slice(0, 2)).toEqual(["Pay {B}", "Pay {3}"]);
        const choice = p.player === ap ? "1" : p.player === others[0] ? "0" : "none";
        s = act(s, { type: "chooseOption", player: p.player, choice } as Action);
        if (p.player === ap) s.players[ap]!.manaPool.C = 3;
        if (p.player === others[0]) s.players[others[0]!]!.manaPool.B = 1;
      } else if (p.kind === "payUnless") s = act(s, { type: "payUnless", player: p.player, pay: true } as Action);
      else break;
    }
    s = settle(s);
    expect(asked).toEqual([ap, ...others]);
    expect(life(s, ap)).toBe(start[ap]);
    expect(life(s, others[0]!)).toBe(start[others[0]!]);
    expect(life(s, others[1]!)).toBe(start[others[1]!]! - 1);
    expect(life(s, others[2]!)).toBe(start[others[2]!]! - 1);
  });

  it("Midnight Arsonist: destroys up to X target artifacts without mana abilities, X the number of Vampires you control", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, vanilla("Test Vampire", "Creature — Vampire", "{1}{B}", 2, 2, 2, { colors: ["B"] }));
    const a = putOnBattlefield(s0, opp, trinket("Trinket A"));
    const b = putOnBattlefield(s0, opp, trinket("Trinket B"));
    const c = putOnBattlefield(s0, opp, trinket("Trinket C"));
    const rock = putOnBattlefield(s0, opp, card("Test Mana Rock", "Artifact", "{1}", { cmc: 1, oracleText: "{T}: Add {C}." }));
    s0.players[ap]!.manaPool.R = 4;
    let s = castNow(s0, ap, toZone(s0, ap, arsonist(), "hand"));
    s = settle(s, at("chooseTargets", ap));
    expect(s.pending?.kind).toBe("chooseTargets");
    // Two Vampires: at most two targets, and never the mana rock.
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(a), tgt(b), tgt(c)] } as Action)).toThrow();
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(rock)] } as Action)).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(a), tgt(b)] } as Action));
    expect([zone(s, a), zone(s, b), zone(s, c), zone(s, rock)]).toEqual(["graveyard", "graveyard", "battlefield", "battlefield"]);
  });

  it("Sandman's Quicksand: all creatures get -2/-2, only your opponents' creatures when cast for its mayhem cost", () => {
    for (const mayhem of [false, true]) {
      const { s: s0, ap, opp } = setup([]);
      const mine = putOnBattlefield(s0, ap, bearC("My Bear"));
      const theirs = putOnBattlefield(s0, opp, bearC("Their Bear"));
      const q = toZone(s0, ap, quicksand(), mayhem ? "graveyard" : "hand");
      // Discarded this turn (CR 702.187b).
      if (mayhem) s0.objects[q]!.discardedTurn = s0.turn;
      s0.players[ap]!.manaPool.B = 4;
      const s = settle(castNow(s0, ap, q, [], mayhem ? { via: "mayhem" } : {}));
      expect([zone(s, mine), zone(s, theirs)]).toEqual([mayhem ? "battlefield" : "graveyard", "graveyard"]);
      if (mayhem) expect(pt(s, mine)).toBe("2/2");
    }
  });

  it("Confront the Assault: cast only while a creature is attacking you", () => {
    const { s: s0, ap, opp } = setup([]);
    const c = toZone(s0, ap, confront(), "hand");
    poolOnly(s0, ap, { W: 1, C: 4 });
    expect(planCast(s0, ap, c)).toBeNull();
    const attacker = putOnBattlefield(s0, opp, bearC("Their Attacker"));
    s0.objects[attacker]!.attacking = ap;
    invalidateCharacteristics(s0);
    const s = settle(castNow(s0, ap, c));
    expect(tokensNamed(s, ap, "Spirit")).toHaveLength(3);
  });

  it("Summon: Kujata: chapter III deals damage equal to the discarded card's mana value to each opponent", () => {
    const { s: s0, ap } = setup([]);
    const k = putOnBattlefield(s0, ap, kujata());
    s0.objects[k]!.counters = { lore: 2 };
    const g = toZone(s0, ap, giant("Discarded Giant", 4), "hand");
    onlyHand(s0, ap, [g]);
    let s = goUntil(s0, (x) => x.pending?.kind === "discard" && x.pending.player === ap);
    const opps = s.turnOrder.filter((p) => p !== ap);
    const before = opps.map((p) => life(s, p));
    s = settle(act(s, { type: "discard", player: ap, objectIds: [g] } as Action));
    expect(zone(s, g)).toBe("graveyard");
    expect(opps.map((p) => life(s, p))).toEqual(before.map((n) => n - 4));
  });
});
