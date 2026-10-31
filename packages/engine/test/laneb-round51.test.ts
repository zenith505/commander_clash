// Lane B, round 51: unsupported cards no earlier round wrote down, EDHREC rank about 24,700 to 23,200, least played first
// (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, scry, setup } from "./helpers";
import { botActions, blockProblem, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, potentialAttackers, power, toughness, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PlayerId, type TargetChoice } from "../src";

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
const attackOk = (s: GameState, id: string) => potentialAttackers(s, controllerOf(s, s.objects[id]!)).some((o) => o.id === id);


// Real oracle text (Scryfall).
const awakenTheSkyTyrant = () => card("Awaken the Sky Tyrant", "Enchantment", "{3}{R}", { cmc: 4, colors: ["R"], oracleText: "When a source an opponent controls deals damage to you, sacrifice this enchantment. If you do, create a 5/5 red Dragon creature token with flying." });
const bindTheMonster = () => card("Bind the Monster", "Enchantment — Aura", "{U}", { cmc: 1, colors: ["U"], keywords: ["Enchant"], oracleText: "Enchant creature\nWhen this Aura enters, tap enchanted creature. It deals damage to you equal to its power.\nEnchanted creature doesn't untap during its controller's untap step." });
const blowYourHouseDown = () => card("Blow Your House Down", "Sorcery", "{2}{R}", { cmc: 3, colors: ["R"], oracleText: "Up to three target creatures can't block this turn. Destroy any of them that are Walls." });
const bridesGown = () => card("Bride's Gown", "Artifact — Equipment", "{1}{W}", { cmc: 2, colors: ["W"], keywords: ["Equip"], oracleText: "Equipped creature gets +2/+0. It gets an additional +0/+2 and has first strike as long as an Equipment named Groom's Finery is attached to a creature you control.\nEquip {2} ({2}: Attach to target creature you control. Equip only as a sorcery.)" });
const codespellCleric = () => card("Codespell Cleric", "Creature — Human Cleric", "{W}", { cmc: 1, colors: ["W"], power: "1", toughness: "1", keywords: ["Vigilance"], oracleText: "Vigilance\nWhen this creature enters, if it was the second spell you cast this turn, put a +1/+1 counter on target creature." });
const darkbladeAgent = () => card("Darkblade Agent", "Creature — Human Assassin", "{1}{U}{B}", { cmc: 3, colors: ["B", "U"], power: "2", toughness: "3", oracleText: "As long as you've surveilled this turn, this creature has deathtouch and \"Whenever this creature deals combat damage to a player, you draw a card.\"" });
const despoilerOfSouls = () => card("Despoiler of Souls", "Creature — Horror", "{B}{B}", { cmc: 2, colors: ["B"], power: "3", toughness: "1", oracleText: "This creature can't block.\n{B}{B}, Exile two other creature cards from your graveyard: Return this card from your graveyard to the battlefield." });
const dongZhouTheTyrant = () => card("Dong Zhou, the Tyrant", "Legendary Creature — Human Soldier", "{4}{R}", { cmc: 5, colors: ["R"], power: "3", toughness: "3", oracleText: "When Dong Zhou enters, target creature an opponent controls deals damage equal to its power to that player." });
const dustStalker = () => card("Dust Stalker", "Creature — Eldrazi", "{2}{B}{R}", { cmc: 4, colors: [], power: "5", toughness: "3", keywords: ["Devoid", "Haste"], oracleText: "Devoid (This card has no color.)\nHaste\nAt the beginning of each end step, if you control no other colorless creatures, return this creature to its owner's hand." });
const expeditionLookout = () => card("Expedition Lookout", "Creature — Merfolk Rogue", "{1}{U}", { cmc: 2, colors: ["U"], power: "2", toughness: "3", keywords: ["Defender"], oracleText: "Defender\nAs long as an opponent has eight or more cards in their graveyard, this creature can attack as though it didn't have defender and it can't be blocked." });
const finalPunishment = () => card("Final Punishment", "Sorcery", "{3}{B}{B}", { cmc: 5, colors: ["B"], oracleText: "Target player loses life equal to the damage already dealt to that player this turn." });
const gnostroVoiceOfTheCrags = () => card("Gnostro, Voice of the Crags", "Legendary Creature — Chimera", "{1}{U}{R}{W}", { cmc: 4, colors: ["R", "U", "W"], power: "3", toughness: "3", keywords: ["Scry"], oracleText: "{T}: Choose one. X is the number of spells you've cast this turn.\n• Scry X.\n• Gnostro deals X damage to target creature.\n• You gain X life." });
const groomsFinery = () => card("Groom's Finery", "Artifact — Equipment", "{1}{B}", { cmc: 2, colors: ["B"], keywords: ["Equip"], oracleText: "Equipped creature gets +2/+0. It gets an additional +0/+2 and has deathtouch as long as an Equipment named Bride's Gown is attached to a creature you control.\nEquip {2} ({2}: Attach to target creature you control. Equip only as a sorcery.)" });
const handThatFeeds = () => card("Hand That Feeds", "Creature — Mutant", "{1}{R}", { cmc: 2, colors: ["R"], power: "2", toughness: "2", keywords: ["Delirium"], oracleText: "Delirium — Whenever this creature attacks while there are four or more card types among cards in your graveyard, it gets +2/+0 and gains menace until end of turn. (It can't be blocked except by two or more creatures.)" });
const hedronBlade = () => card("Hedron Blade", "Artifact — Equipment", "{1}", { cmc: 1, colors: [], keywords: ["Equip"], oracleText: "Equipped creature gets +1/+1.\nWhenever equipped creature becomes blocked by one or more colorless creatures, it gains deathtouch until end of turn. (Any amount of damage it deals to a creature is enough to destroy it.)\nEquip {2} ({2}: Attach to target creature you control. Equip only as a sorcery.)" });
const imaginaryPet = () => card("Imaginary Pet", "Creature — Illusion", "{1}{U}", { cmc: 2, colors: ["U"], power: "4", toughness: "4", oracleText: "At the beginning of your upkeep, if you have a card in hand, return this creature to its owner's hand." });
const innocentBystander = () => card("Innocent Bystander", "Creature — Goblin Citizen", "{1}{R}", { cmc: 2, colors: ["R"], power: "2", toughness: "1", keywords: ["Investigate"], oracleText: "Whenever this creature is dealt 3 or more damage, investigate. (Create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")" });
const karnGildedGuardian = () => card("Karn, Gilded Guardian", "Legendary Artifact Creature — Golem", "{2/W}{2/U}{2/B}{2/R}{2/G}", { cmc: 10, colors: ["B", "G", "R", "U", "W"], power: "5", toughness: "5", keywords: ["Vigilance", "Trample"], oracleText: "Vigilance, trample\nWhen Karn enters, draw a card for each color among other artifacts you control." });
const lagonnaBandStoryteller = () => card("Lagonna-Band Storyteller", "Creature — Centaur Advisor", "{3}{W}", { cmc: 4, colors: ["W"], power: "3", toughness: "4", oracleText: "When this creature enters, you may put target enchantment card from your graveyard on top of your library. If you do, you gain life equal to its mana value." });
const mirkwoodMeditator = () => card("Mirkwood Meditator", "Creature — Elf Druid", "{2}{U}", { cmc: 3, colors: ["U"], power: "2", toughness: "4", keywords: ["Landfall"], oracleText: "Landfall — Whenever a land you control enters, you may have this creature's base power and toughness become 4/2 until end of turn." });
const mishrasDomination = () => card("Mishra's Domination", "Enchantment — Aura", "{1}{R}", { cmc: 2, colors: ["R"], keywords: ["Enchant"], oracleText: "Enchant creature\nAs long as you control enchanted creature, it gets +2/+2. Otherwise, it can't block." });
const mokuMeanderingDrummer = () => card("Moku, Meandering Drummer", "Legendary Creature — Human Bard Ally", "{1}{R}", { cmc: 2, colors: ["R"], power: "2", toughness: "2", oracleText: "Whenever you cast a noncreature spell, you may pay {1}. If you do, Moku gets +2/+1 and creatures you control gain haste until end of turn." });
const rancidEarth = () => card("Rancid Earth", "Sorcery", "{1}{B}{B}", { cmc: 3, colors: ["B"], keywords: ["Threshold"], oracleText: "Destroy target land.\nThreshold — If there are seven or more cards in your graveyard, instead destroy that land and Rancid Earth deals 1 damage to each creature and each player." });
const rayOfFrost = () => card("Ray of Frost", "Enchantment — Aura", "{1}{U}", { cmc: 2, colors: ["U"], keywords: ["Enchant", "Flash"], oracleText: "Flash\nEnchant creature\nWhen this Aura enters, if enchanted creature is red, tap it.\nAs long as enchanted creature is red, it loses all abilities.\nEnchanted creature doesn't untap during its controller's untap step." });
const sageEyeAvengers = () => card("Sage-Eye Avengers", "Creature — Djinn Monk", "{4}{U}{U}", { cmc: 6, colors: ["U"], power: "4", toughness: "5", keywords: ["Prowess"], oracleText: "Prowess (Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn.)\nWhenever this creature attacks, you may return target creature to its owner's hand if its power is less than this creature's power." });
const scholarOfCombustion = () => card("Scholar of Combustion", "Creature — Human Wizard", "{3}{R}", { cmc: 4, colors: ["R"], power: "3", toughness: "2", oracleText: "When this creature enters, exile up to one target instant or sorcery card from your graveyard. You may cast that card until the end of your next turn. (You still pay its costs. Timing rules still apply.)" });
const spiritualAsylum = () => card("Spiritual Asylum", "Enchantment", "{2}{W}{W}", { cmc: 4, colors: ["W"], oracleText: "Creatures and lands you control have shroud. (They can't be the targets of spells or abilities.)\nWhen a creature you control attacks, sacrifice this enchantment." });
const thoughtGorger = () => card("Thought Gorger", "Creature — Horror", "{2}{B}{B}", { cmc: 4, colors: ["B"], power: "2", toughness: "2", keywords: ["Trample"], oracleText: "Trample\nWhen this creature enters, put a +1/+1 counter on it for each card in your hand. If you do, discard your hand.\nWhen this creature leaves the battlefield, draw a card for each +1/+1 counter on it." });
const tormentedThoughts = () => card("Tormented Thoughts", "Sorcery", "{2}{B}", { cmc: 3, colors: ["B"], oracleText: "As an additional cost to cast this spell, sacrifice a creature.\nTarget player discards a number of cards equal to the sacrificed creature's power." });
const vraskaTheCuttingGlare = () => card("Vraska, the Cutting Glare", "Legendary Creature — Gorgon Assassin", "{B}{B}{G}", { cmc: 3, colors: ["B", "G"], power: "4", toughness: "4", keywords: ["Treasure", "Deathtouch"], oracleText: "Deathtouch\nWhen Vraska enters, if you control six or more lands, destroy target permanent an opponent controls. They create a Treasure token. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")" });
const withdraw = () => card("Withdraw", "Instant", "{U}{U}", { cmc: 2, colors: ["U"], oracleText: "Return target creature to its owner's hand. Then return another target creature to its owner's hand unless its controller pays {1}." });
const reaperOfNight = () => scry("adventure", [
  { name: "Reaper of Night", mana_cost: "{5}{B}{B}", type_line: "Creature — Specter", oracle_text: "Whenever this creature attacks, if defending player has two or fewer cards in hand, it gains flying until end of turn.", power: "4", toughness: "5" },
  { name: "Harvest Fear", mana_cost: "{3}{B}", type_line: "Sorcery — Adventure", oracle_text: "Target opponent discards two cards. (Then exile this card. You may cast the creature later from exile.)" },
]);

// Test cards.
const vanilla = (name: string, typeLine: string, cost: string, cmc: number, p: number, t: number, extra: Partial<CardDef> = {}) => card(name, typeLine, cost, { cmc, power: String(p), toughness: String(t), ...extra });
const bearC = (name = "Plain Bear", p = 2, t = 2) => vanilla(name, "Creature — Bear", "{1}{G}", 2, p, t, { colors: ["G"] });
const redC = (name = "Red Ogre", p = 3, t = 3, extra: Partial<CardDef> = {}) => vanilla(name, "Creature — Ogre", "{2}{R}", 3, p, t, { colors: ["R"], ...extra });
const golem = (name = "Test Golem", p = 2, t = 2) => vanilla(name, "Artifact Creature — Golem", "{2}", 2, p, t, { colors: [] });
const wall = () => vanilla("Test Wall", "Creature — Wall", "{1}{W}", 2, 0, 4, { colors: ["W"], keywords: ["Defender"], oracleText: "Defender" });
const opt = () => card("Test Opt", "Instant", "{U}", { cmc: 1, colors: ["U"], oracleText: "Draw a card." });
const shock = () => card("Test Shock", "Instant", "{R}", { cmc: 1, colors: ["R"], oracleText: "Test Shock deals 2 damage to any target." });
const bolt = () => card("Test Bolt", "Instant", "{R}", { cmc: 1, colors: ["R"], oracleText: "Test Bolt deals 3 damage to any target." });
const peek = (kind: "Scry" | "Surveil") => card(`Test ${kind}`, "Instant", "{U}", { cmc: 1, colors: ["U"], keywords: [kind], oracleText: `${kind} 1.` });
const wastes = () => card("Test Wastes", "Land", "", { oracleText: "{T}: Add {C}." });
const pacifism = () => card("Test Pacifism", "Enchantment", "{1}{W}{W}", { cmc: 3, colors: ["W"] });
const rockOf = (name: string, colors: CardDef["colors"]) => card(name, "Artifact", "{1}", { cmc: 1, colors });
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
/** Gives priority to `pid` (everyone else passing). */
const priorityTo = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 10 && waitingOn(s) !== pid; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const tokensNamed = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.isToken && controllerOf(s, s.objects[id]!) === pid && nameOf(s, id).replace(/ Token$/, "") === name);
const kw = (s: GameState, id: string, k: string) => objHasKeyword(s, s.objects[id]!, k);

describe("Lane B round 51", () => {
  it("are fully supported", () => {
    supported(awakenTheSkyTyrant(), bindTheMonster(), blowYourHouseDown(), bridesGown(), codespellCleric(), darkbladeAgent(), despoilerOfSouls(), dongZhouTheTyrant(), dustStalker(), expeditionLookout(), finalPunishment(), gnostroVoiceOfTheCrags(), groomsFinery(), handThatFeeds(), hedronBlade(), imaginaryPet(), innocentBystander(), karnGildedGuardian(), lagonnaBandStoryteller(), mirkwoodMeditator(), mishrasDomination(), mokuMeanderingDrummer(), rancidEarth(), rayOfFrost(), reaperOfNight(), sageEyeAvengers(), scholarOfCombustion(), spiritualAsylum(), thoughtGorger(), tormentedThoughts(), vraskaTheCuttingGlare(), withdraw());
  });

  it("Imaginary Pet: returns to hand at your upkeep if you have a card in hand, not with an empty hand", () => {
    for (const empty of [false, true]) {
      const { s: s0, ap } = setup([]);
      const pet = putOnBattlefield(s0, ap, imaginaryPet());
      if (empty) onlyHand(s0, ap, []);
      else onlyHand(s0, ap, s0.players[ap]!.hand.slice(0, 1));
      const turn = s0.turn;
      const s = goUntil(s0, (x) => x.turn > turn && x.activePlayer === ap && x.step === "draw");
      expect(zone(s, pet)).toBe(empty ? "battlefield" : "hand");
    }
  });

  it("Spiritual Asylum: creatures and lands you control have shroud; it's sacrificed when a creature you control attacks", () => {
    const { s: s0, ap, opp } = setup([]);
    const asylum = putOnBattlefield(s0, ap, spiritualAsylum());
    const bear = putOnBattlefield(s0, ap, bearC());
    expect(kw(s0, bear, "Shroud")).toBe(true);
    const s = settle(attackWith(s0, [bear], opp));
    expect([zone(s, asylum), kw(s, bear, "Shroud")]).toEqual(["graveyard", false]);
  });

  it("Dust Stalker: returns to hand at each end step unless you control another colorless creature", () => {
    for (const other of [false, true]) {
      const { s: s0, ap } = setup([]);
      const ds = putOnBattlefield(s0, ap, dustStalker());
      if (other) putOnBattlefield(s0, ap, golem());
      else putOnBattlefield(s0, ap, bearC());
      const s = goUntil(s0, (x) => x.step === "cleanup" || (x.turn > s0.turn));
      expect(zone(s, ds)).toBe(other ? "battlefield" : "hand");
    }
  });

  it("Innocent Bystander: investigates when dealt 3 or more damage at once, not 2", () => {
    for (const [def, clues] of [[bolt(), 1], [shock(), 0]] as const) {
      const { s: s0, ap, ids } = setup([def]);
      const ib = putOnBattlefield(s0, ap, innocentBystander());
      const s = settle(castNow(s0, ap, ids[0]!, [tgt(ib)]));
      expect([zone(s, ib), tokensNamed(s, ap, "Clue").length]).toEqual(["graveyard", clues]);
    }
  });

  it("Rancid Earth: destroys the land; with threshold it also deals 1 damage to each creature and each player", () => {
    for (const threshold of [false, true]) {
      const { s: s0, ap, opp, ids } = setup([rancidEarth()]);
      const land = putOnBattlefield(s0, opp, wastes());
      const bear = putOnBattlefield(s0, opp, bearC("Small Bear", 1, 1));
      if (threshold) for (let i = 0; i < 7; i++) toZone(s0, ap, bearC(), "graveyard");
      const s = settle(castNow(s0, ap, ids[0]!, [tgt(land)]));
      expect([zone(s, land), zone(s, bear), life(s, opp), life(s, ap)]).toEqual(threshold ? ["graveyard", "graveyard", life(s0, opp) - 1, life(s0, ap) - 1] : ["graveyard", "battlefield", life(s0, opp), life(s0, ap)]);
    }
  });

  it("Final Punishment: the target player loses life equal to the damage dealt to them this turn", () => {
    const { s: s0, ap, opp, ids } = setup([shock(), bolt(), finalPunishment()]);
    let s = settle(castNow(s0, ap, ids[0]!, [ply(opp)]));
    s = settle(castNow(s, ap, ids[1]!, [ply(opp)]));
    expect(life(s, opp)).toBe(life(s0, opp) - 5);
    s = settle(castNow(s, ap, ids[2]!, [ply(opp)]));
    expect(life(s, opp)).toBe(life(s0, opp) - 10);
  });

  it("Withdraw: the first creature returns; the second returns unless its controller pays {1}", () => {
    for (const pay of [true, false]) {
      const { s: s0, ap, opp, ids } = setup([withdraw()]);
      const a = putOnBattlefield(s0, opp, bearC("First Bear"));
      const b = putOnBattlefield(s0, opp, bearC("Second Bear"));
      s0.players[opp]!.manaPool = { ...s0.players[opp]!.manaPool, C: 1 };
      let s = settle(castNow(s0, ap, ids[0]!, [tgt(a), tgt(b)]), (x) => x.pending?.player === opp);
      expect(s.pending).toMatchObject({ kind: "payUnless", cost: "{1}", otherwise: "let Withdraw return it to its owner's hand" });
      s = settle(act(s, { type: "payUnless", player: opp, pay }));
      expect([zone(s, a), zone(s, b)]).toEqual(["hand", pay ? "battlefield" : "hand"]);
    }
  });

  it("Blow Your House Down: the targets can't block and the Walls among them are destroyed", () => {
    const { s: s0, ap, opp, ids } = setup([blowYourHouseDown()]);
    const w = putOnBattlefield(s0, opp, wall());
    const b = putOnBattlefield(s0, opp, bearC("Their Bear"));
    const other = putOnBattlefield(s0, opp, wall());
    const mine = putOnBattlefield(s0, ap, bearC());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(w), tgt(b), { kind: "none" } as TargetChoice]));
    expect([zone(s, w), zone(s, b), zone(s, other)]).toEqual(["graveyard", "battlefield", "battlefield"]);
    s = toBlocks(attackWith(s, [mine], opp));
    expect(blockProblem(s, s.objects[b]!, s.objects[mine]!)).not.toBeNull();
    expect(blockProblem(s, s.objects[other]!, s.objects[mine]!)).toBeNull();
  });

  it("Thought Gorger: a +1/+1 counter for each card in your hand, then you discard your hand; it draws that many when it leaves", () => {
    const { s: s0, ap, ids } = setup([thoughtGorger(), opt(), opt(), opt()]);
    onlyHand(s0, ap, ids);
    let s = settle(castNow(s0, ap, ids[0]!));
    expect([counters(s, ids[0]!), s.players[ap]!.hand.length, zone(s, ids[1]!)]).toEqual([3, 0, "graveyard"]);
    const kill = toZone(s, ap, bolt(), "hand");
    s = settle(castNow(s, ap, kill, [tgt(ids[0]!)]));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, B: 1 };
    s = settle(castNow(s, ap, toZone(s, ap, card("Test Murder", "Instant", "{B}", { cmc: 1, colors: ["B"], oracleText: "Destroy target creature." }), "hand"), [tgt(ids[0]!)]));
    expect([zone(s, ids[0]!), s.players[ap]!.hand.length]).toEqual(["graveyard", 3]);
  });

  it("Thought Gorger: with an empty hand it gets no counters", () => {
    const { s: s0, ap, ids } = setup([thoughtGorger()]);
    onlyHand(s0, ap, ids);
    const s = settle(castNow(s0, ap, ids[0]!));
    expect(counters(s, ids[0]!)).toBe(0);
  });

  it("Dong Zhou, the Tyrant: the opponent's creature deals damage equal to its power to its controller", () => {
    const { s: s0, ap, opp, ids } = setup([dongZhouTheTyrant()]);
    const ogre = putOnBattlefield(s0, opp, redC("Their Ogre", 4, 4));
    const s = triggerTargets(castNow(s0, ap, ids[0]!), ap, [tgt(ogre)]);
    expect(life(settle(s), opp)).toBe(life(s0, opp) - 4);
  });

  it("Sage-Eye Avengers: when it attacks, you may return a creature with less power to its owner's hand", () => {
    for (const p of [3, 4]) {
      const { s: s0, ap, opp } = setup([]);
      const sage = putOnBattlefield(s0, ap, sageEyeAvengers());
      const theirs = putOnBattlefield(s0, opp, bearC("Their Bear", p, 5));
      let s = triggerTargets(attackWith(s0, [sage], opp), ap, [tgt(theirs)]);
      s = settle(s, at("chooseMay", ap));
      if (s.pending?.kind === "chooseMay") s = answerMay(s, ap, true);
      s = settle(s);
      expect(zone(s, theirs)).toBe(p < 4 ? "hand" : "battlefield");
    }
  });

  it("Codespell Cleric: a +1/+1 counter on target creature only if it was the second spell you cast this turn", () => {
    const { s: s0, ap, ids } = setup([opt(), codespellCleric(), codespellCleric()]);
    const bear = putOnBattlefield(s0, ap, bearC());
    let s = settle(castNow(s0, ap, ids[0]!));
    s = triggerTargets(castNow(s, ap, ids[1]!), ap, [tgt(bear)]);
    s = settle(s);
    expect(counters(s, bear)).toBe(1);
    s = settle(castNow(s, ap, ids[2]!));
    expect(counters(s, bear)).toBe(1);
  });

  it("Codespell Cleric: first spell this turn, no trigger", () => {
    const { s: s0, ap, ids } = setup([codespellCleric()]);
    const bear = putOnBattlefield(s0, ap, bearC());
    const s = settle(castNow(s0, ap, ids[0]!));
    expect([counters(s, bear), counters(s, ids[0]!)]).toEqual([0, 0]);
  });

  it("Karn, Gilded Guardian: draws a card for each color among other artifacts you control", () => {
    const { s: s0, ap, ids } = setup([karnGildedGuardian()]);
    putOnBattlefield(s0, ap, rockOf("White Rock", ["W"]));
    putOnBattlefield(s0, ap, rockOf("Azorius Rock", ["W", "U"]));
    putOnBattlefield(s0, ap, rockOf("Plain Rock", []));
    putOnBattlefield(s0, ap, bearC("Red Bear"));
    const hand = s0.players[ap]!.hand.length - 1;
    const s = settle(castNow(s0, ap, ids[0]!));
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
  });

  it("Vraska, the Cutting Glare: with six or more lands, destroys a permanent an opponent controls and they create a Treasure", () => {
    const { s: s0, ap, opp, ids } = setup([vraskaTheCuttingGlare()]);
    const rock = putOnBattlefield(s0, opp, rockOf("Their Rock", []));
    const s = settle(triggerTargets(castNow(s0, ap, ids[0]!), ap, [tgt(rock)]));
    expect([zone(s, rock), tokensNamed(s, opp, "Treasure").length, tokensNamed(s, ap, "Treasure").length]).toEqual(["graveyard", 1, 0]);
  });

  it("Vraska, the Cutting Glare: with fewer than six lands, nothing", () => {
    const { s: s0, ap, opp, ids } = setup([vraskaTheCuttingGlare()]);
    const rock = putOnBattlefield(s0, opp, rockOf("Their Rock", []));
    poolOnly(s0, ap, { B: 2, G: 1 });
    for (let i = 0; i < 5; i++) putOnBattlefield(s0, ap, wastes());
    const s = settle(castNow(s0, ap, ids[0]!));
    expect([zone(s, ids[0]!), zone(s, rock), tokensNamed(s, opp, "Treasure").length]).toEqual(["battlefield", "battlefield", 0]);
  });

  it("Scholar of Combustion: exiles an instant from your graveyard, which you may cast until the end of your next turn", () => {
    const { s: s0, ap, opp, ids } = setup([scholarOfCombustion()]);
    const sh = toZone(s0, ap, shock(), "graveyard");
    let s = settle(triggerTargets(castNow(s0, ap, ids[0]!), ap, [tgt(sh)]));
    expect(zone(s, sh)).toBe("exile");
    s = settle(castNow(s, ap, sh, [ply(opp)]));
    expect(life(s, opp)).toBe(life(s0, opp) - 2);
  });

  it("Lagonna-Band Storyteller: may put an enchantment card from your graveyard on top of your library and gain life equal to its mana value", () => {
    const { s: s0, ap, ids } = setup([lagonnaBandStoryteller()]);
    const ench = toZone(s0, ap, pacifism(), "graveyard");
    let s = settle(triggerTargets(castNow(s0, ap, ids[0]!), ap, [tgt(ench)]), at("chooseMay", ap));
    if (s.pending?.kind === "chooseMay") s = answerMay(s, ap, true);
    s = settle(s);
    expect([zone(s, ench), s.players[ap]!.library[0], life(s, ap)]).toEqual(["library", ench, life(s0, ap) + 3]);
  });

  it("Moku, Meandering Drummer: casting a noncreature spell, pay {1}: +2/+1 and your creatures gain haste", () => {
    const { s: s0, ap, ids } = setup([opt()]);
    const moku = putOnBattlefield(s0, ap, mokuMeanderingDrummer());
    const bear = putOnBattlefield(s0, ap, bearC(), { sick: true });
    let s = settle(castNow(s0, ap, ids[0]!), at("chooseMay", ap));
    expect(s.pending?.kind).toBe("chooseMay");
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, C: 1 };
    s = settle(answerMay(s, ap, true));
    expect([pt(s, moku), kw(s, bear, "Haste"), kw(s, moku, "Haste")]).toEqual(["4/3", true, true]);
  });

  it("Hand That Feeds: with delirium when it attacks, +2/+0 and menace; without, nothing", () => {
    for (const delirium of [false, true]) {
      const { s: s0, ap, opp } = setup([]);
      const h = putOnBattlefield(s0, ap, handThatFeeds());
      toZone(s0, ap, bearC(), "graveyard");
      toZone(s0, ap, wastes(), "graveyard");
      toZone(s0, ap, opt(), "graveyard");
      if (delirium) toZone(s0, ap, rockOf("Dead Rock", []), "graveyard");
      const s = settle(attackWith(s0, [h], opp));
      expect([pt(s, h), kw(s, h, "Menace")]).toEqual(delirium ? ["4/2", true] : ["2/2", false]);
    }
  });

  it("Expedition Lookout: attacks and can't be blocked while an opponent has eight or more cards in their graveyard", () => {
    const { s: s0, ap, opp } = setup([]);
    const look = putOnBattlefield(s0, ap, expeditionLookout());
    const blocker = putOnBattlefield(s0, opp, bearC("Their Bear"));
    expect(attackOk(s0, look)).toBe(false);
    for (let i = 0; i < 8; i++) toZone(s0, opp, bearC(), "graveyard");
    expect(attackOk(s0, look)).toBe(true);
    const s = toBlocks(attackWith(s0, [look], opp));
    expect(blockProblem(s, s.objects[blocker]!, s.objects[look]!)).not.toBeNull();
  });

  it("Despoiler of Souls: can't block; returns from your graveyard by exiling two other creature cards", () => {
    const { s: s0, ap } = setup([]);
    const d = toZone(s0, ap, despoilerOfSouls(), "graveyard");
    const a = toZone(s0, ap, bearC("Dead A"), "graveyard");
    expect(planActivate(s0, ap, d, 0, [], undefined, undefined, undefined, { exileCards: [d, a] })).toBeNull();
    const b = toZone(s0, ap, bearC("Dead B"), "graveyard");
    const s = settle(run(s0, planActivate(s0, ap, d, 0, [], undefined, undefined, undefined, { exileCards: [a, b] })));
    expect([zone(s, d), zone(s, a), zone(s, b)]).toEqual(["battlefield", "exile", "exile"]);
  });

  it("Reaper of Night: gains flying when it attacks a player with two or fewer cards in hand", () => {
    for (const n of [2, 3]) {
      const { s: s0, ap, opp } = setup([]);
      const r = putOnBattlefield(s0, ap, reaperOfNight());
      onlyHand(s0, opp, s0.players[opp]!.hand.slice(0, n));
      const s = settle(attackWith(s0, [r], opp));
      expect(kw(s, r, "Flying")).toBe(n <= 2);
    }
  });

  it("Bind the Monster: taps the creature, which deals damage equal to its power to you", () => {
    const { s: s0, ap, opp, ids } = setup([bindTheMonster()]);
    const ogre = putOnBattlefield(s0, opp, redC("Their Ogre", 5, 5));
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(ogre)]));
    expect([s.objects[ogre]!.tapped, life(s, ap), life(s, opp)]).toEqual([true, life(s0, ap) - 5, life(s0, opp)]);
  });

  it("Tormented Thoughts: the target player discards cards equal to the sacrificed creature's power", () => {
    const { s: s0, ap, opp, ids } = setup([tormentedThoughts()]);
    const ogre = putOnBattlefield(s0, ap, redC("My Ogre", 3, 1));
    const hand = s0.players[opp]!.hand.length;
    const s = settle(castNow(s0, ap, ids[0]!, [ply(opp)], { sacrifice: [ogre] }));
    expect([zone(s, ogre), s.players[opp]!.hand.length]).toEqual(["graveyard", hand - 3]);
  });

  it("Gnostro, Voice of the Crags: X is the number of spells you've cast this turn", () => {
    const { s: s0, ap, opp, ids } = setup([opt(), opt()]);
    const g = putOnBattlefield(s0, ap, gnostroVoiceOfTheCrags());
    const theirs = putOnBattlefield(s0, opp, bearC("Their Bear", 3, 3));
    let s = settle(castNow(s0, ap, ids[0]!));
    s = settle(castNow(s, ap, ids[1]!));
    s = settle(run(s, planActivate(s, ap, g, 0, [tgt(theirs)], [1])));
    expect([s.objects[theirs]!.damage, zone(s, theirs)]).toEqual([2, "battlefield"]);
    const s2 = settle(run(s0, planActivate(s0, ap, g, 0, [], [2])));
    expect(life(s2, ap)).toBe(life(s0, ap));
  });

  it("Bride's Gown and Groom's Finery: each gets its extra bonus while the other is attached to a creature you control", () => {
    const { s: s0, ap } = setup([]);
    const a = putOnBattlefield(s0, ap, bearC("Bride Bear"));
    const b = putOnBattlefield(s0, ap, bearC("Groom Bear"));
    const gown = putOnBattlefield(s0, ap, bridesGown());
    const finery = putOnBattlefield(s0, ap, groomsFinery());
    s0.objects[gown]!.attachedTo = a;
    invalidateCharacteristics(s0);
    expect([pt(s0, a), kw(s0, a, "First strike")]).toEqual(["4/2", false]);
    s0.objects[finery]!.attachedTo = b;
    invalidateCharacteristics(s0);
    expect([pt(s0, a), kw(s0, a, "First strike"), pt(s0, b), kw(s0, b, "Deathtouch")]).toEqual(["4/4", true, "4/4", true]);
  });

  it("Mirkwood Meditator: landfall, you may make its base power and toughness 4/2 until end of turn", () => {
    const { s: s0, ap, ids } = setup([wastes()]);
    const m = putOnBattlefield(s0, ap, mirkwoodMeditator());
    let s = settle(act(s0, { type: "playLand", player: ap, objectId: ids[0]! }), at("chooseMay", ap));
    expect(s.pending?.kind).toBe("chooseMay");
    s = settle(answerMay(s, ap, true));
    expect(pt(s, m)).toBe("4/2");
    s = goUntil(s, (x) => x.turn > s0.turn);
    expect(pt(s, m)).toBe("2/4");
  });

  it("Mishra's Domination: +2/+2 while you control the creature, otherwise it can't block", () => {
    const { s: s0, ap, opp, ids } = setup([mishrasDomination(), mishrasDomination()]);
    const mine = putOnBattlefield(s0, ap, bearC());
    const theirs = putOnBattlefield(s0, opp, bearC("Their Bear"));
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(mine)]));
    s = settle(castNow(s, ap, ids[1]!, [tgt(theirs)]));
    expect([pt(s, mine), pt(s, theirs)]).toEqual(["4/4", "2/2"]);
    s = toBlocks(attackWith(s, [mine], opp));
    expect(blockProblem(s, s.objects[theirs]!, s.objects[mine]!)).not.toBeNull();
  });

  it("Ray of Frost: a red creature is tapped and loses all abilities; a nonred one isn't tapped", () => {
    for (const red of [true, false]) {
      const { s: s0, ap, opp, ids } = setup([rayOfFrost()]);
      const c = red ? putOnBattlefield(s0, opp, redC("Red Flyer", 3, 3, { keywords: ["Flying"], oracleText: "Flying" })) : putOnBattlefield(s0, opp, bearC("Green Flyer", 2, 2));
      if (!red) { s0.cards[s0.objects[c]!.cardId]!.keywords = ["Flying"]; s0.cards[s0.objects[c]!.cardId]!.oracleText = "Flying"; invalidateCharacteristics(s0); }
      const s = settle(castNow(s0, ap, ids[0]!, [tgt(c)]));
      expect([s.objects[c]!.tapped ?? false, kw(s, c, "Flying")]).toEqual(red ? [true, false] : [false, true]);
    }
  });

  it("Hedron Blade: equipped creature gains deathtouch when blocked by a colorless creature, not a colored one", () => {
    for (const colorless of [true, false]) {
      const { s: s0, ap, opp } = setup([]);
      const bear = putOnBattlefield(s0, ap, bearC());
      const blade = putOnBattlefield(s0, ap, hedronBlade());
      s0.objects[blade]!.attachedTo = bear;
      invalidateCharacteristics(s0);
      const blocker = putOnBattlefield(s0, opp, colorless ? golem("Their Golem", 1, 5) : bearC("Their Bear", 1, 5));
      let s = toBlocks(attackWith(s0, [bear], opp));
      s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker, attacker: bear }] });
      s = settle(s);
      expect(kw(s, bear, "Deathtouch")).toBe(colorless);
    }
  });

  it("Darkblade Agent: deathtouch and the draw trigger only after you surveilled this turn (scrying doesn't count)", () => {
    for (const kind of ["Scry", "Surveil"] as const) {
      const { s: s0, ap, ids } = setup([peek(kind)]);
      const d = putOnBattlefield(s0, ap, darkbladeAgent());
      expect(kw(s0, d, "Deathtouch")).toBe(false);
      let s = settle(castNow(s0, ap, ids[0]!), at("arrangeTop", ap));
      const p = s.pending!;
      if (p.kind === "arrangeTop") s = act(s, { type: "arrangeTop", player: ap, top: p.cards, away: [] });
      s = settle(s);
      expect(kw(s, d, "Deathtouch")).toBe(kind === "Surveil");
    }
  });

  it("Awaken the Sky Tyrant: when an opponent's source deals damage to you, it's sacrificed for a 5/5 Dragon", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, awakenTheSkyTyrant());
    let s = priorityTo(s0, ap);
    const sh = toZone(s, opp, shock(), "hand");
    s.players[opp]!.manaPool = { ...s.players[opp]!.manaPool, R: 1 };
    s = act(s, { type: "passPriority", player: ap });
    s = priorityTo(s, opp);
    s = settle(run(s, planCast(s, opp, sh, [ply(ap)])));
    expect([zone(s, a), tokensNamed(s, ap, "Dragon").length]).toEqual(["graveyard", 1]);
  });
});
