// Lane B, round 62: unsupported cards no earlier round wrote down, from EDHREC rank about 19,700 up and the cards just
// above it, least played first (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { chooseTargets as botChooseTargets } from "../src/bot";
import { act, addEffect, card, passUntil, putOnBattlefield, scry, setup } from "./helpers";
import { compileCard, abilitiesOf, abilityProblem, botActions, castProblem, manaAbilityProblem, spellCost, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, moveObject, planActivate, power, toughness, planCast, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";
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
const banish = (): CardDef => ({"oracleId":"ae6ef097-bd52-4bf8-81a8-2e6c643fc805","name":"Banish to Another Universe","manaCost":"{4}{W}","cmc":5,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Affinity for historic permanents (This spell costs {1} less to cast for each artifact, legendary, and/or Saga permanent you control.)\nWhen this enchantment enters, exile target nonland permanent an opponent controls until this enchantment leaves the battlefield.","colors":["W"],"colorIdentity":["W"],"keywords":["Affinity"],"layout":"normal"}) as CardDef;
const city = (): CardDef => ({"oracleId":"671458ac-7441-4332-9e59-a42ec8b62f31","name":"City of Solitude","manaCost":"{2}{G}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Players can cast spells and activate abilities only during their own turns.","colors":["G"],"colorIdentity":["G"],"keywords":[],"layout":"normal"}) as CardDef;
const cradle = (): CardDef => ({"oracleId":"956250da-532a-4457-8696-73915be56943","name":"Cradle of Vitality","manaCost":"{3}{W}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever you gain life, you may pay {1}{W}. If you do, put a +1/+1 counter on target creature for each 1 life you gained.","colors":["W"],"colorIdentity":["W"],"keywords":[],"layout":"normal"}) as CardDef;
const quest = (): CardDef => ({"oracleId":"7f65178e-dd2e-44aa-a68f-f8694e0b250a","name":"Quest for the Nihil Stone","manaCost":"{B}","cmc":1,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever an opponent discards a card, you may put a quest counter on this enchantment.\nAt the beginning of each opponent's upkeep, if that player has no cards in hand and this enchantment has two or more quest counters on it, you may have that player lose 5 life.","colors":["B"],"colorIdentity":["B"],"keywords":[],"layout":"normal"}) as CardDef;
const nightbonder = (): CardDef => ({"oracleId":"7351317d-62a1-4894-9811-aa950c49eece","name":"Cunning Nightbonder","manaCost":"{U/B}{U/B}","cmc":2,"typeLine":"Creature — Human Rogue","supertypes":[],"types":["Creature"],"subtypes":["Human","Rogue"],"oracleText":"Flash\nSpells with flash you cast cost {1} less to cast and can't be countered.","power":"2","toughness":"2","colors":["B","U"],"colorIdentity":["B","U"],"keywords":["Flash"],"layout":"normal"}) as CardDef;
const beluna = (): CardDef => ({"oracleId":"06374e6d-62fa-4833-81cd-b4d0a35e7365","name":"Beluna Grandsquall // Seek Thrills","manaCost":"{G}{U}{R} // {2}{G}{U}{R}","cmc":3,"typeLine":"Legendary Creature — Giant Noble // Instant — Adventure","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Giant","Noble"],"oracleText":"Trample\nPermanent spells you cast that have an Adventure cost {1} less to cast.","power":"4","toughness":"4","colors":["G","R","U"],"colorIdentity":["G","R","U"],"keywords":["Trample","Mill"],"layout":"adventure","faces":[{"name":"Beluna Grandsquall","manaCost":"{G}{U}{R}","typeLine":"Legendary Creature — Giant Noble","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Giant","Noble"],"oracleText":"Trample\nPermanent spells you cast that have an Adventure cost {1} less to cast.","power":"4","toughness":"4","colors":["U","R","G"]},{"name":"Seek Thrills","manaCost":"{2}{G}{U}{R}","typeLine":"Instant — Adventure","supertypes":[],"types":["Instant"],"subtypes":["Adventure"],"oracleText":"Mill seven cards. Then put all cards that have an Adventure from among the milled cards into your hand.","colors":["U","R","G"]}]}) as CardDef;
const fleshwrither = (): CardDef => ({"oracleId":"49815e6d-b9c5-4e45-949e-34d34b3543e8","name":"Fleshwrither","manaCost":"{2}{B}{B}","cmc":4,"typeLine":"Creature — Horror","supertypes":[],"types":["Creature"],"subtypes":["Horror"],"oracleText":"Transfigure {1}{B}{B} ({1}{B}{B}, Sacrifice this creature: Search your library for a creature card with the same mana value as this creature, put that card onto the battlefield, then shuffle. Transfigure only as a sorcery.)","power":"3","toughness":"3","colors":["B"],"colorIdentity":["B"],"keywords":["Transfigure"],"layout":"normal"}) as CardDef;
const radrat = (): CardDef => ({"oracleId":"344671d1-8abf-4be1-93c9-ef917e88e6c9","name":"Ruthless Radrat","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Creature — Rat Mutant","supertypes":[],"types":["Creature"],"subtypes":["Rat","Mutant"],"oracleText":"Squad—Exile four cards from your graveyard. (As an additional cost to cast this spell, you may pay its squad cost any number of times. When this creature enters, create that many tokens that are copies of it.)\nMenace (This creature can't be blocked except by two or more creatures.)","power":"2","toughness":"2","colors":["B"],"colorIdentity":["B"],"keywords":["Menace","Squad"],"layout":"normal"}) as CardDef;
const escape = (): CardDef => ({"oracleId":"e16c5516-f73c-40c4-9ffa-39c6b2e92ab7","name":"Escape Detection","manaCost":"{1}{U}{U}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Freerunning—Return a blue creature you control to its owner's hand. (You may cast this spell for its freerunning cost if you dealt combat damage to a player this turn with an Assassin or commander.)\nReturn target creature to its owner's hand.\nDraw a card.","colors":["U"],"colorIdentity":["U"],"keywords":["Freerunning"],"layout":"normal"}) as CardDef;
const researcher = (): CardDef => ({"oracleId":"ef764497-800e-4cbd-805e-7635919a983c","name":"Innocuous Researcher","manaCost":"{3}{G}","cmc":4,"typeLine":"Creature — Centaur Detective","supertypes":[],"types":["Creature"],"subtypes":["Centaur","Detective"],"oracleText":"Parley — Whenever this creature attacks, each player reveals the top card of their library. For each nonland card revealed this way, you investigate. Then each player draws a card.\nAt the beginning of your end step, you may untap all lands you control. If you do, you can't cast spells until your next turn.","power":"3","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":["Investigate","Parley"],"layout":"normal"}) as CardDef;
const ingester = (): CardDef => ({"oracleId":"ec9c35f2-6a68-45e7-a86e-9f5af9fe28fc","name":"Phyrexian Ingester","manaCost":"{6}{U}","cmc":7,"typeLine":"Creature — Phyrexian Beast","supertypes":[],"types":["Creature"],"subtypes":["Phyrexian","Beast"],"oracleText":"Imprint — When this creature enters, you may exile target nontoken creature.\nThis creature gets +X/+Y, where X is the exiled creature card's power and Y is its toughness.","power":"3","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Imprint"],"layout":"normal"}) as CardDef;
const vengeance = (): CardDef => ({"oracleId":"b9b1c644-041a-4b61-9d6d-bc73a3a95bb8","name":"Curse of Vengeance","manaCost":"{B}","cmc":1,"typeLine":"Enchantment — Aura Curse","supertypes":[],"types":["Enchantment"],"subtypes":["Aura","Curse"],"oracleText":"Enchant player\nWhenever enchanted player casts a spell, put a spite counter on this Aura.\nWhen enchanted player loses the game, you gain X life and draw X cards, where X is the number of spite counters on this Aura.","colors":["B"],"colorIdentity":["B"],"keywords":["Enchant"],"layout":"normal"}) as CardDef;
const witch = (): CardDef => ({"oracleId":"67466d56-9f28-4bbe-ae54-6fd834581e77","name":"Bitterheart Witch","manaCost":"{4}{B}","cmc":5,"typeLine":"Creature — Human Shaman","supertypes":[],"types":["Creature"],"subtypes":["Human","Shaman"],"oracleText":"Deathtouch\nWhen this creature dies, you may search your library for a Curse card, put it onto the battlefield attached to target player, then shuffle.","power":"1","toughness":"2","colors":["B"],"colorIdentity":["B"],"keywords":["Deathtouch"],"layout":"normal"}) as CardDef;
const profaner = (): CardDef => ({"oracleId":"e6bfac15-ec3c-4a55-946a-0b4514eabafd","name":"Profaner of the Dead","manaCost":"{3}{U}","cmc":4,"typeLine":"Creature — Snake Wizard","supertypes":[],"types":["Creature"],"subtypes":["Snake","Wizard"],"oracleText":"Exploit (When this creature enters, you may sacrifice a creature.)\nWhen this creature exploits a creature, return to their owners' hands all creatures your opponents control with toughness less than the exploited creature's toughness.","power":"3","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Exploit"],"layout":"normal"}) as CardDef;
const tuneUp = (): CardDef => ({"oracleId":"aaa14260-2537-4668-8517-c825118777cc","name":"Tune Up","manaCost":"{3}{W}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Return target artifact card from your graveyard to the battlefield. If it's a Vehicle, it becomes an artifact creature.","colors":["W"],"colorIdentity":["W"],"keywords":[],"layout":"normal"}) as CardDef;
const awakening = (): CardDef => ({"oracleId":"5c326102-005d-463c-b9f7-14b034b66baa","name":"Awakening of Vitu-Ghazi","manaCost":"{3}{G}{G}","cmc":5,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Put nine +1/+1 counters on target land you control. It becomes a legendary 0/0 Elemental creature with haste named Vitu-Ghazi. It's still a land.","colors":["G"],"colorIdentity":["G"],"keywords":[],"layout":"normal"}) as CardDef;

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
const lifeGift = (name = "Test Gift") => card(name, "Instant", "{W}", { cmc: 1, colors: ["W"], oracleText: "Target player gains 3 life." });
const spirit = () => vanilla("Test Spirit", "Creature — Spirit", "{1}{U}", 2, 1, 1, { colors: ["U"] });
const hero = () => vanilla("Test Hero", "Creature — Human Hero", "{1}{W}", 2, 2, 2, { colors: ["W"] });
const lesson = () => card("Test Lesson", "Sorcery — Lesson", "{1}{G}", { cmc: 2, colors: ["G"], oracleText: "Draw a card." });
const charm = (name = "Test Charm") => card(name, "Enchantment", "{1}{W}", { cmc: 2, colors: ["W"], oracleText: "" });
const cave = (name: string) => card(name, "Land — Cave", "", { oracleText: "{T}: Add {C}." });
const wreckBig = () => card("Test Doom", "Instant", "{B}", { cmc: 1, colors: ["B"], oracleText: "Destroy target enchantment." });
const lifeOf = (s: GameState, pid: PlayerId) => s.players[pid]!.life;

const generic = (s: GameState, pid: PlayerId, id: string, how: CostChoices = {}) => spellCost(s, pid, s.objects[id]!, 0, [], how).extra;
const adventurer = () => card("Test Adventurer // Test Outing", "Creature — Human Peasant // Instant — Adventure", "{3}{G} // {1}{G}", { cmc: 4, power: "3", toughness: "3", colors: ["G"], layout: "adventure", faces: [{ name: "Test Adventurer", manaCost: "{3}{G}", typeLine: "Creature — Human Peasant", supertypes: [], types: ["Creature"], subtypes: ["Human", "Peasant"], oracleText: "", power: "3", toughness: "3", colors: ["G"] }, { name: "Test Outing", manaCost: "{1}{G}", typeLine: "Instant — Adventure", supertypes: [], types: ["Instant"], subtypes: ["Adventure"], oracleText: "Draw a card.", colors: ["G"] }] } as Partial<CardDef>);
const flashBear = () => vanilla("Test Flash Bear", "Creature — Bear", "{2}{G}", 3, 2, 2, { colors: ["G"], keywords: ["Flash"], oracleText: "Flash" });
const counterspell = () => card("Test Counterspell", "Instant", "{U}{U}", { cmc: 2, colors: ["U"], oracleText: "Counter target spell." });
const curse = (name = "Test Curse") => card(name, "Enchantment — Aura Curse", "{1}{B}", { cmc: 2, colors: ["B"], oracleText: "Enchant player\nAt the beginning of enchanted player's upkeep, that player loses 1 life." });
const vehicle = () => vanilla("Test Wagon", "Artifact — Vehicle", "{2}", 2, 4, 4, { oracleText: "Crew 2" });

describe("Lane B round 62", () => {
  it("are fully supported", () => {
    supported(banish(), city(), cradle(), quest(), nightbonder(), beluna(), fleshwrither(), radrat(), escape(), researcher(), ingester(), vengeance(), witch(), profaner(), tuneUp(), awakening());
  });

  it("Banish to Another Universe: affinity for historic permanents counts artifacts, legendaries and Sagas you control", () => {
    const { s, ap, opp } = setup([]);
    const b = toZone(s, ap, banish(), "hand");
    expect(generic(s, ap, b)).toBe(4);
    putOnBattlefield(s, ap, trinket("Test Trinket A"));
    putOnBattlefield(s, ap, legend());
    putOnBattlefield(s, ap, card("Test Saga", "Enchantment — Saga", "{1}{W}", { cmc: 2, oracleText: "" }));
    putOnBattlefield(s, opp, trinket("Their Trinket")); // not theirs to count
    putOnBattlefield(s, ap, bearC());
    expect(generic(s, ap, b)).toBe(1);
  });

  it("City of Solitude: only the active player may cast spells or activate abilities, mana abilities included", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, city());
    const op = toZone(s0, opp, opt("Their Opt"), "hand");
    const land = putOnBattlefield(s0, opp, card("Their Island", "Basic Land — Island"));
    const wiz = putOnBattlefield(s0, opp, pinger("Their Pinger"));
    s0.players[opp]!.manaPool = { ...s0.players[opp]!.manaPool, U: 1 };
    expect(castProblem(s0, opp, op)).toMatch(/only during their own turns/);
    expect(abilityProblem(s0, opp, wiz, 0)).toMatch(/only during their own turns/);
    expect(manaAbilityProblem(s0, opp, s0.objects[land]!, 0)).toMatch(/only during their own turns/);
    // The active player still can.
    const mine = putOnBattlefield(s0, ap, pinger("My Pinger"));
    expect(abilityProblem(s0, ap, mine, 0)).toBeNull();
    const myOpt = toZone(s0, ap, opt("My Opt"), "hand");
    expect(planCast(s0, ap, myOpt)).not.toBeNull();
    // On the opponent's own turn they can.
    const s = goUntil(s0, (x) => x.activePlayer === opp && x.step === "main1" && !x.stack.length && !x.pending);
    expect(abilityProblem(s, opp, wiz, 0)).toBeNull();
  });

  it("Cradle of Vitality: pay {1}{W} for a +1/+1 counter for each 1 life gained; declining puts none", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, cradle());
    const bear = putOnBattlefield(s0, ap, bearC());
    const g = toZone(s0, ap, lifeGift(), "hand");
    let s = castNow(s0, ap, g, [ply(ap)]);
    s = triggerTargets(s, ap, [tgt(bear)]);
    s = settle(s, at("chooseMay", ap));
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, W: 1, C: 1 };
    s = settle(answerMay(s, ap, true));
    expect(counters(s, bear)).toBe(3);
    expect(life(s, ap)).toBe(43);
    const g2 = toZone(s, ap, lifeGift("Test Gift Two"), "hand");
    s = castNow(s, ap, g2, [ply(ap)]);
    s = triggerTargets(s, ap, [tgt(bear)]);
    s = settle(s, at("chooseMay", ap));
    s = settle(answerMay(s, ap, false));
    expect(counters(s, bear)).toBe(3);
  });

  it("Quest for the Nihil Stone: at an opponent's upkeep, with no cards in their hand and two quest counters, they may be made to lose 5 life", () => {
    const { s: s0, ap, opp } = setup([]);
    const q = putOnBattlefield(s0, ap, quest());
    s0.objects[q]!.counters = { quest: 2 };
    onlyHand(s0, opp, []);
    s0.players[opp]!.library.splice(0, 0); // keeps a library to draw from
    let s = toUpkeep(s0, opp);
    s = settle(s, at("chooseMay", ap));
    expect(s.pending?.kind).toBe("chooseMay");
    s = settle(answerMay(s, ap, true));
    expect(life(s, opp)).toBe(35);
    // With one quest counter, or a card in hand, it doesn't trigger.
    const { s: t0, ap: ap2, opp: opp2 } = setup([]);
    const q2 = putOnBattlefield(t0, ap2, quest());
    t0.objects[q2]!.counters = { quest: 1 };
    onlyHand(t0, opp2, []);
    let t = toUpkeep(t0, opp2);
    t = settle(t);
    expect(life(t, opp2)).toBe(40);
  });

  it("Cunning Nightbonder: spells with flash you cast cost {1} less and can't be countered; others can", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, nightbonder());
    const fb = toZone(s0, ap, flashBear(), "hand");
    const plain = toZone(s0, ap, bearC("Slow Bear"), "hand");
    expect(generic(s0, ap, fb)).toBe(1);
    expect(generic(s0, ap, plain)).toBe(1);
    // A flash spell on the stack: the opponent's counterspell doesn't counter it.
    const cs = toZone(s0, opp, counterspell(), "hand");
    let s = castNow(s0, ap, fb);
    s = act(s, { type: "passPriority", player: ap });
    s.players[opp]!.manaPool = { ...s.players[opp]!.manaPool, U: 2 };
    s = castNow(s, opp, cs, [spell(s, fb)]);
    s = settle(s);
    expect(zone(s, fb)).toBe("battlefield");
    expect(zone(s, cs)).toBe("graveyard");
  });

  it("Beluna Grandsquall: permanent spells with an Adventure cost {1} less, not the Adventure; Seek Thrills puts every milled adventurer into your hand", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, beluna());
    const adv = toZone(s0, ap, adventurer(), "hand");
    expect(generic(s0, ap, adv)).toBe(2);
    expect(generic(s0, ap, adv, { face: 1 })).toBe(1);
    // Seek Thrills, cast from hand as the Adventure.
    const { s: t0, ap: p } = setup([]);
    const lib = t0.players[p]!.library;
    const advs = [toZone(t0, p, adventurer(), "library"), toZone(t0, p, adventurer(), "library")];
    for (let i = 0; i < 5; i++) toZone(t0, p, bearC(`Milled Bear ${i}`), "library");
    expect(advs.every((id) => lib.indexOf(id) < 7)).toBe(true);
    const deeper = t0.players[p]!.library[7]!;
    const b = toZone(t0, p, beluna(), "hand");
    let t = run(t0, planCast(t0, p, b, [], undefined, "auto", undefined, { face: 1 }));
    t = settle(t);
    for (const id of advs) expect(zone(t, id)).toBe("hand");
    expect(t.players[p]!.graveyard.filter((id) => nameOf(t, id).startsWith("Milled Bear")).length).toBe(5);
    expect(zone(t, deeper)).toBe("library");
    expect(zone(t, b)).toBe("exile");
  });

  it("Fleshwrither: transfigure sacrifices it to put a creature card with the same mana value onto the battlefield, as a sorcery", () => {
    const { s: s0, ap } = setup([]);
    const f = putOnBattlefield(s0, ap, fleshwrither());
    const four = toZone(s0, ap, vanilla("Test Four Drop", "Creature — Beast", "{3}{G}", 4, 4, 4), "library");
    toZone(s0, ap, vanilla("Test Three Drop", "Creature — Beast", "{2}{G}", 3, 3, 3), "library");
    let s = activateNow(s0, ap, f, 0);
    expect(zone(s, f)).toBe("graveyard");
    s = settle(s);
    expect(zone(s, four)).toBe("battlefield");
    // Not at instant speed.
    const { s: t0, ap: p, opp } = setup([]);
    const f2 = putOnBattlefield(t0, p, fleshwrither());
    const t = goUntil(t0, (x) => x.activePlayer === opp && x.priority === p);
    expect(abilityProblem(t, p, f2, 0)).toMatch(/sorcery/);
  });

  it("Ruthless Radrat: squad paid by exiling four graveyard cards each time, one token copy for each", () => {
    const { s: s0, ap } = setup([]);
    const r = toZone(s0, ap, radrat(), "hand");
    for (let i = 0; i < 9; i++) toZone(s0, ap, bearC(`Dead Bear ${i}`), "graveyard");
    expect(planCast(s0, ap, r, [], undefined, "auto", undefined, { kicks: [0, 0, 0] })).toBeNull();
    const yard = [...s0.players[ap]!.graveyard];
    expect(castProblem(s0, ap, r, [], undefined, undefined, undefined, undefined, { kicks: [0, 0], exileCards: yard.slice(0, 7) })).toMatch(/exile/);
    let s = run(s0, planCast(s0, ap, r, [], undefined, "auto", undefined, { kicks: [0, 0], exileCards: yard.slice(0, 8) }));
    expect(s.players[ap]!.graveyard.length).toBe(1);
    s = settle(s);
    expect(zone(s, r)).toBe("battlefield");
    expect(tokensNamed(s, ap, "Ruthless Radrat").length).toBe(2);
  });

  it("Escape Detection: freerunning by returning a blue creature you control, after an Assassin or commander dealt combat damage", () => {
    const { s: s0, ap, opp } = setup([]);
    const e = toZone(s0, ap, escape(), "hand");
    const blue = putOnBattlefield(s0, ap, pinger("My Blue Wizard"));
    const theirs = putOnBattlefield(s0, opp, bearC("Their Bear"));
    poolOnly(s0, ap, {});
    expect(castProblem(s0, ap, e, [tgt(theirs)], undefined, undefined, undefined, undefined, { alt: "freerunning", returnToHand: [blue] })).toMatch(/combat damage/);
    s0.freerunningThisTurn = [ap];
    let s = run(s0, planCast(s0, ap, e, [tgt(theirs)], undefined, "auto", undefined, { alt: "freerunning", returnToHand: [blue] }));
    expect(zone(s, blue)).toBe("hand");
    s = settle(s);
    expect(zone(s, theirs)).toBe("hand");
  });

  it("Innocuous Researcher: untap your lands at your end step, then no spells until your next turn", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, researcher());
    const lands = s0.battlefield.filter((id) => s0.objects[id]!.controller === ap && characteristics(s0, s0.objects[id]!).types.includes("Land"));
    for (const id of lands) s0.objects[id]!.tapped = true;
    const op = toZone(s0, ap, opt("My Opt"), "hand");
    let s = goUntil(s0, (x) => x.step === "end" && x.activePlayer === ap && x.pending?.kind === "chooseMay");
    s = settleMay(s, ap, () => true);
    expect(lands.every((id) => !s.objects[id]!.tapped)).toBe(true);
    s = goUntil(s, (x) => x.activePlayer === opp && x.step === "main1" && x.priority === ap);
    expect(castProblem(s, ap, op)).toMatch(/can't cast/);
    s = goUntil(s, (x) => x.activePlayer === ap && x.step === "upkeep");
    expect(castProblem(s, ap, op) ?? "").not.toMatch(/can't cast/);
  });

  it("Phyrexian Ingester: gets +X/+Y from the creature card its imprint exiled, as it is in exile", () => {
    const { s: s0, ap, opp } = setup([]);
    const big = putOnBattlefield(s0, opp, bearC("Their Big Bear", 5, 4));
    const ing = toZone(s0, ap, ingester(), "hand");
    let s = castNow(s0, ap, ing);
    s = triggerTargets(s, ap, [tgt(big)]);
    s = settleMay(s, ap, () => true);
    expect(zone(s, big)).toBe("exile");
    expect(pt(s, ing)).toBe("8/7");
  });

  it("Curse of Vengeance: when the enchanted player loses, gain X life and draw X cards for its spite counters", () => {
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, ap, vengeance());
    s0.objects[c]!.attachedToPlayer = opp;
    s0.objects[c]!.counters = { spite: 3 };
    const hand = s0.players[ap]!.hand.length;
    s0.players[opp]!.life = 0;
    let s = settle(act(s0, { type: "passPriority", player: waitingOn(s0)! }));
    expect(s.players[opp]!.lost).toBe(true);
    expect(life(s, ap)).toBe(43);
    expect(s.players[ap]!.hand.length).toBe(hand + 3);
  });

  it("Bitterheart Witch: when it dies, you may put a Curse from your library onto the battlefield attached to target player", () => {
    const { s: s0, ap, opp } = setup([]);
    const w = putOnBattlefield(s0, ap, witch());
    const cu = toZone(s0, ap, curse(), "library");
    const kill = toZone(s0, ap, wreck(), "hand");
    let s = castNow(s0, ap, kill, [tgt(w)]);
    s = triggerTargets(s, ap, [ply(opp)]);
    s = settleMay(s, ap, () => true);
    expect(zone(s, cu)).toBe("battlefield");
    expect(s.objects[cu]!.attachedToPlayer).toBe(opp);
  });

  it("Bitterheart Witch: a bot puts the Curse on an opponent, not on itself", () => {
    const { s, ap } = setup([]);
    const body = compileCard(witch()).triggers[0]!.body;
    const picked = botChooseTargets(s, ap, body, true);
    expect(picked?.[0]?.kind).toBe("player");
    expect(picked?.[0]?.kind === "player" && picked[0].id).not.toBe(ap);
  });

  it("Profaner of the Dead: exploiting a creature bounces each opponent's creature with less toughness than it had", () => {
    const { s: s0, ap, opp } = setup([]);
    const fodder = putOnBattlefield(s0, ap, bearC("My Fodder", 1, 3));
    const small = putOnBattlefield(s0, opp, bearC("Their Small Bear", 4, 2));
    const same = putOnBattlefield(s0, opp, bearC("Their Same Bear", 1, 3));
    const mine = putOnBattlefield(s0, ap, bearC("My Small Bear", 1, 1));
    const p = toZone(s0, ap, profaner(), "hand");
    // Exploit: sacrifice the 1/3.
    let s = settle(castNow(s0, ap, p), (x) => x.pending?.kind === "pickPermanents" && x.pending.player === ap);
    expect(s.pending?.kind).toBe("pickPermanents");
    s = act(s, { type: "pickPermanents", player: ap, ids: [fodder] } as Action);
    s = settle(s);
    expect(zone(s, fodder)).toBe("graveyard");
    expect(zone(s, small)).toBe("hand");
    expect(zone(s, same)).toBe("battlefield");
    expect(zone(s, mine)).toBe("battlefield");
  });

  it("Tune Up: a Vehicle returned becomes an artifact creature for good; another artifact stays noncreature", () => {
    const { s: s0, ap } = setup([]);
    const v = toZone(s0, ap, vehicle(), "graveyard");
    const t1 = toZone(s0, ap, tuneUp(), "hand");
    let s = settle(castNow(s0, ap, t1, [tgt(v)]));
    expect(zone(s, v)).toBe("battlefield");
    expect(characteristics(s, s.objects[v]!).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(characteristics(s, s.objects[v]!).subtypes).toContain("Vehicle");
    expect(pt(s, v)).toBe("4/4");
    const tr = toZone(s, ap, trinket(), "graveyard");
    const t2 = toZone(s, ap, tuneUp(), "hand");
    s = settle(castNow(s, ap, t2, [tgt(tr)]));
    expect(zone(s, tr)).toBe("battlefield");
    expect(characteristics(s, s.objects[tr]!).types).not.toContain("Creature");
    s = goUntil(s, (x) => x.turn > s0.turn);
    expect(characteristics(s, s.objects[v]!).types).toContain("Creature");
  });

  it("Awakening of Vitu-Ghazi: nine +1/+1 counters, and the land becomes a legendary 0/0 Elemental creature with haste named Vitu-Ghazi", () => {
    const { s: s0, ap } = setup([]);
    const land = putOnBattlefield(s0, ap, testLand());
    const a = toZone(s0, ap, awakening(), "hand");
    let s = settle(castNow(s0, ap, a, [tgt(land)]));
    const ch = characteristics(s, s.objects[land]!);
    expect(ch.name).toBe("Vitu-Ghazi");
    expect(ch.types).toEqual(expect.arrayContaining(["Land", "Creature"]));
    expect(ch.subtypes).toContain("Elemental");
    expect(ch.supertypes).toContain("Legendary");
    expect(ch.keywords).toContain("Haste");
    expect(pt(s, land)).toBe("9/9");
    s = goUntil(s, (x) => x.turn > s0.turn);
    expect(characteristics(s, s.objects[land]!).types).toContain("Creature");
  });
});
