// Lane B, round 50: unsupported cards from about rank 18,400 up to 17,100, least played first (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup } from "./helpers";
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
const alignedHedronNetwork = () => card("Aligned Hedron Network", "Artifact", "{4}", { cmc: 4, colors: [], oracleText: "When this artifact enters, exile all creatures with power 5 or greater until this artifact leaves the battlefield. (Those creatures return under their owners' control.)" });
const barrenGlory = () => card("Barren Glory", "Enchantment", "{4}{W}{W}", { cmc: 6, colors: ["W"], oracleText: "At the beginning of your upkeep, if you control no permanents other than this enchantment and have no cards in hand, you win the game." });
const blazingSalvo = () => card("Blazing Salvo", "Instant", "{R}", { cmc: 1, colors: ["R"], oracleText: "Blazing Salvo deals 3 damage to target creature unless that creature's controller has Blazing Salvo deal 5 damage to them." });
const clockworkHydra = () => card("Clockwork Hydra", "Artifact Creature — Hydra", "{5}", { cmc: 5, colors: [], power: "0", toughness: "0", oracleText: "This creature enters with four +1/+1 counters on it.\nWhenever this creature attacks or blocks, remove a +1/+1 counter from it. If you do, it deals 1 damage to any target.\n{T}: Put a +1/+1 counter on this creature." });
const codecrackerHound = () => card("Codecracker Hound", "Creature — Dog", "{2}{U}", { cmc: 3, colors: ["U"], power: "2", toughness: "1", keywords: ["Warp"], oracleText: "When this creature enters, look at the top two cards of your library. Put one into your hand and the other into your graveyard.\nWarp {2}{U} (You may cast this card from your hand for its warp cost. Exile this creature at the beginning of the next end step, then you may cast it from exile on a later turn.)" });
const consulateCrackdown = () => card("Consulate Crackdown", "Enchantment", "{3}{W}{W}", { cmc: 5, colors: ["W"], oracleText: "When this enchantment enters, exile all artifacts your opponents control until this enchantment leaves the battlefield." });
const covetousUrge = () => card("Covetous Urge", "Sorcery", "{U/B}{U/B}{U/B}{U/B}", { cmc: 4, colors: ["B","U"], oracleText: "Target opponent reveals their hand. You choose a nonland card from that player's graveyard or hand and exile it. You may cast that card for as long as it remains exiled, and you may spend mana as though it were mana of any color to cast that spell." });
const decayingSoil = () => card("Decaying Soil", "Enchantment", "{1}{B}{B}", { cmc: 3, colors: ["B"], keywords: ["Threshold"], oracleText: "At the beginning of your upkeep, exile a card from your graveyard.\nThreshold — As long as there are seven or more cards in your graveyard, this enchantment has \"Whenever a nontoken creature is put into your graveyard from the battlefield, you may pay {1}. If you do, return that card to your hand.\"" });
const divineGambit = () => card("Divine Gambit", "Sorcery", "{W}{W}", { cmc: 2, colors: ["W"], oracleText: "Exile target artifact, creature, or enchantment an opponent controls. That player may put a permanent card from their hand onto the battlefield." });
const dwarvenDriller = () => card("Dwarven Driller", "Creature — Dwarf", "{3}{R}", { cmc: 4, colors: ["R"], power: "2", toughness: "2", oracleText: "{T}: Destroy target land unless its controller has this creature deal 2 damage to them." });
const dwarvenScorcher = () => card("Dwarven Scorcher", "Creature — Dwarf", "{R}", { cmc: 1, colors: ["R"], power: "1", toughness: "1", oracleText: "Sacrifice this creature: This creature deals 1 damage to target creature unless that creature's controller has this creature deal 2 damage to them." });
const elfhameSanctuary = () => card("Elfhame Sanctuary", "Enchantment", "{1}{G}", { cmc: 2, colors: ["G"], oracleText: "At the beginning of your upkeep, you may search your library for a basic land card, reveal that card, put it into your hand, then shuffle. If you do, you skip your draw step this turn." });
const faerieSnoop = () => card("Faerie Snoop", "Creature — Faerie Detective", "{1}{U}{B}", { cmc: 3, colors: ["B","U"], power: "1", toughness: "4", keywords: ["Flying","Disguise"], oracleText: "Flying\nDisguise {1}{U/B}{U/B} (You may cast this card face down for {3} as a 2/2 creature with ward {2}. Turn it face up any time for its disguise cost.)\nWhen this creature is turned face up, look at the top two cards of your library. Put one into your hand and the other into your graveyard." });
const freelanceMuscle = () => card("Freelance Muscle", "Creature — Rhino Warrior", "{4}{G}", { cmc: 5, colors: ["G"], power: "4", toughness: "4", oracleText: "Whenever this creature attacks or blocks, it gets +X/+X until end of turn, where X is the greatest power and/or toughness among other creatures you control." });
const geistflameReservoir = () => card("Geistflame Reservoir", "Artifact", "{2}{R}", { cmc: 3, colors: ["R"], oracleText: "Whenever you cast an instant or sorcery spell, put a charge counter on this artifact.\n{1}{R}, {T}, Remove any number of charge counters from this artifact: It deals that much damage to any target.\n{1}{R}, {T}: Exile the top card of your library. You may play that card this turn." });
const grozoth = () => card("Grozoth", "Creature — Leviathan", "{6}{U}{U}{U}", { cmc: 9, colors: ["U"], power: "9", toughness: "9", keywords: ["Defender","Transmute"], oracleText: "Defender (This creature can't attack.)\nWhen this creature enters, you may search your library for any number of cards that have mana value 9, reveal them, put them into your hand, then shuffle.\n{4}: This creature loses defender until end of turn.\nTransmute {1}{U}{U} ({1}{U}{U}, Discard this card: Search your library for a card with the same mana value as this card, reveal it, put it into your hand, then shuffle. Transmute only as a sorcery.)" });
const heatStroke = () => card("Heat Stroke", "Enchantment", "{2}{R}", { cmc: 3, colors: ["R"], oracleText: "At end of combat, destroy each creature that blocked or was blocked this turn." });
const megaFlare = () => card("Mega Flare", "Sorcery", "{2}{R}", { cmc: 3, colors: ["R"], keywords: ["Kicker"], oracleText: "Kicker {3}{R}{R}\nIf this spell was kicked, create a 6/6 red Dragon creature token with flying.\nFor each opponent, choose up to one target creature that player controls. Mega Flare deals damage equal to the greatest power among creatures you control to each of the chosen creatures." });
const moltenInfluence = () => card("Molten Influence", "Instant", "{1}{R}", { cmc: 2, colors: ["R"], oracleText: "Counter target instant or sorcery spell unless its controller has Molten Influence deal 4 damage to them." });
const necropolisFiend = () => card("Necropolis Fiend", "Creature — Demon", "{7}{B}{B}", { cmc: 9, colors: ["B"], power: "4", toughness: "5", keywords: ["Flying","Delve"], oracleText: "Delve (Each card you exile from your graveyard while casting this spell pays for {1}.)\nFlying\n{X}, {T}, Exile X cards from your graveyard: Target creature gets -X/-X until end of turn." });
const nissasRevelation = () => card("Nissa's Revelation", "Sorcery", "{5}{G}{G}", { cmc: 7, colors: ["G"], keywords: ["Scry"], oracleText: "Scry 5, then reveal the top card of your library. If it's a creature card, you draw cards equal to its power and you gain life equal to its toughness." });
const outlawsFury = () => card("Outlaws' Fury", "Instant", "{2}{R}", { cmc: 3, colors: ["R"], oracleText: "Creatures you control get +2/+0 until end of turn. If you control an outlaw, exile the top card of your library. Until the end of your next turn, you may play that card. (Assassins, Mercenaries, Pirates, Rogues, and Warlocks are outlaws.)" });
const psychicIntrusion = () => card("Psychic Intrusion", "Sorcery", "{3}{U}{B}", { cmc: 5, colors: ["B","U"], oracleText: "Target opponent reveals their hand. You choose a nonland card from that player's graveyard or hand and exile it. You may cast that card for as long as it remains exiled, and you may spend mana as though it were mana of any color to cast that spell." });
const ritesOfSpring = () => card("Rites of Spring", "Sorcery", "{1}{G}", { cmc: 2, colors: ["G"], oracleText: "Discard any number of cards. Search your library for up to that many basic land cards, reveal them, put them into your hand, then shuffle." });
const sheriffOfSafePassage = () => card("Sheriff of Safe Passage", "Creature — Human Knight", "{2}{W}", { cmc: 3, colors: ["W"], power: "0", toughness: "0", keywords: ["Plot"], oracleText: "This creature enters with a +1/+1 counter on it plus an additional +1/+1 counter on it for each other creature you control.\nPlot {1}{W} (You may pay {1}{W} and exile this card from your hand. Cast it as a sorcery on a later turn without paying its mana cost. Plot only as a sorcery.)" });
const sigilOfTheNewDawn = () => card("Sigil of the New Dawn", "Enchantment", "{3}{W}", { cmc: 4, colors: ["W"], oracleText: "Whenever a creature is put into your graveyard from the battlefield, you may pay {1}{W}. If you do, return that card to your hand." });
const skullcage = () => card("Skullcage", "Artifact", "{4}", { cmc: 4, colors: [], oracleText: "At the beginning of each opponent's upkeep, this artifact deals 2 damage to that player unless they have exactly three or exactly four cards in hand." });
const taigamSidisisHand = () => card("Taigam, Sidisi's Hand", "Legendary Creature — Human Wizard", "{3}{U}{B}", { cmc: 5, colors: ["B","U"], power: "3", toughness: "4", oracleText: "Skip your draw step.\nAt the beginning of your upkeep, look at the top three cards of your library. Put one of them into your hand and the rest into your graveyard.\n{B}, {T}, Exile X cards from your graveyard: Target creature gets -X/-X until end of turn." });
const temporaryLockdown = () => card("Temporary Lockdown", "Enchantment", "{1}{W}{W}", { cmc: 3, colors: ["W"], oracleText: "When this enchantment enters, exile each nonland permanent with mana value 2 or less until this enchantment leaves the battlefield." });
const theArchimandrite = () => card("The Archimandrite", "Legendary Creature — Human Advisor", "{2}{U}{R}{W}", { cmc: 5, colors: ["R","U","W"], power: "0", toughness: "5", oracleText: "At the beginning of your upkeep, you gain X life, where X is the number of cards in your hand minus 4.\nWhenever you gain life, each Advisor, Artificer, and Monk you control gains vigilance and gets +X/+0 until end of turn, where X is the amount of life you gained.\nTap three untapped Advisors, Artificers, and/or Monks you control: Draw a card." });
const tibaltTheFiendBlooded = () => card("Tibalt, the Fiend-Blooded", "Legendary Planeswalker — Tibalt", "{R}{R}", { cmc: 2, colors: ["R"], loyalty: "2", oracleText: "+1: Draw a card, then discard a card at random.\n−4: Tibalt deals damage equal to the number of cards in target player's hand to that player.\n−6: Gain control of all creatures until end of turn. Untap them. They gain haste until end of turn." });
const tradeRouteEnvoy = () => card("Trade Route Envoy", "Creature — Dog Soldier", "{3}{G}", { cmc: 4, colors: ["G"], power: "4", toughness: "3", oracleText: "When this creature enters, draw a card if you control a creature with a counter on it. If you don't draw a card this way, put a +1/+1 counter on this creature." });
const unclesMusings = () => card("Uncle's Musings", "Sorcery", "{2}{G}{G}", { cmc: 4, colors: ["G"], keywords: ["Converge"], oracleText: "Converge — Return up to X permanent cards from your graveyard to your hand, where X is the number of colors of mana spent to cast this spell.\nExile Uncle's Musings." });
const witnessTheFuture = () => card("Witness the Future", "Sorcery", "{2}{U}", { cmc: 3, colors: ["U"], oracleText: "Target player shuffles up to four target cards from their graveyard into their library. You look at the top four cards of your library, then put one of those cards into your hand and the rest on the bottom of your library in a random order." });

// Test cards.
const murder = () => card("Test Murder", "Instant", "{B}", { cmc: 1, colors: ["B"], oracleText: "Destroy target creature." });
const vanilla = (name: string, typeLine: string, cost: string, cmc: number, p: number, t: number, extra: Partial<CardDef> = {}) => card(name, typeLine, cost, { cmc, power: String(p), toughness: String(t), ...extra });
const bearC = (name = "Plain Bear", p = 2, t = 2) => vanilla(name, "Creature — Bear", "{1}{G}", 2, p, t, { colors: ["G"] });
const rock = (name = "Test Rock", cmc = 1) => card(name, "Artifact", `{${cmc}}`, { cmc });
const opt = () => card("Test Opt", "Instant", "{U}", { cmc: 1, colors: ["U"], oracleText: "Draw a card." });
const bigSpellPerm = () => card("Big Statue", "Artifact Creature — Golem", "{5}", { cmc: 5, power: "3", toughness: "3" });
const bigSpell = () => card("Big Spell", "Sorcery", "{5}{B}", { cmc: 6, colors: ["B"], oracleText: "Draw a card." });
const wastes = () => card("Test Wastes", "Land", "", { oracleText: "{T}: Add {C}." });
const shock = () => card("Test Shock", "Instant", "{R}", { cmc: 1, colors: ["R"], oracleText: "Test Shock deals 2 damage to any target." });
const disenchant = () => card("Test Disenchant", "Instant", "{W}", { cmc: 1, colors: ["W"], oracleText: "Destroy target artifact or enchantment." });
const rogue = () => vanilla("Test Rogue", "Creature — Human Rogue", "{1}{B}", 2, 2, 2, { colors: ["B"] });
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

describe("Lane B round 50", () => {
  it("are fully supported", () => {
    supported(alignedHedronNetwork(), barrenGlory(), blazingSalvo(), clockworkHydra(), codecrackerHound(), consulateCrackdown(), covetousUrge(), divineGambit(), dwarvenDriller(), dwarvenScorcher(), elfhameSanctuary(), faerieSnoop(), freelanceMuscle(), geistflameReservoir(), grozoth(), heatStroke(), megaFlare(), moltenInfluence(), necropolisFiend(), nissasRevelation(), outlawsFury(), psychicIntrusion(), ritesOfSpring(), sheriffOfSafePassage(), sigilOfTheNewDawn(), skullcage(), taigamSidisisHand(), temporaryLockdown(), theArchimandrite(), tibaltTheFiendBlooded(), tradeRouteEnvoy(), unclesMusings(), witnessTheFuture());
  });

  it("Sigil of the New Dawn: pay {1}{W} to return a creature card you own that died", () => {
    const { s: s0, ap, ids } = setup([murder()]);
    putOnBattlefield(s0, ap, sigilOfTheNewDawn());
    const mine = putOnBattlefield(s0, ap, bearC());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(mine)]), at("chooseMay", ap));
    expect(s.pending?.kind).toBe("chooseMay");
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, W: 2 };
    s = settle(answerMay(s, ap, true));
    expect(zone(s, mine)).toBe("hand");
  });

  it("Sigil of the New Dawn: a creature you own that dies under an opponent's control triggers it; one you don't own doesn't", () => {
    const { s: s0, ap, opp, ids } = setup([murder(), murder()]);
    putOnBattlefield(s0, ap, sigilOfTheNewDawn());
    const mine = putOnBattlefield(s0, ap, bearC());
    s0.objects[mine]!.controller = opp;
    const theirs = putOnBattlefield(s0, opp, bearC("Their Bear"));
    invalidateCharacteristics(s0);
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(theirs)]), at("chooseMay", ap));
    expect([s.pending?.kind, zone(s, theirs)]).toEqual([undefined, "graveyard"]);
    s = settle(castNow(s, ap, ids[1]!, [tgt(mine)]), at("chooseMay", ap));
    expect(s.pending?.kind).toBe("chooseMay");
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, W: 2 };
    s = settle(answerMay(s, ap, true));
    expect([zone(s, mine), s.players[ap]!.hand.includes(mine)]).toEqual(["hand", true]);
  });

  it("Codecracker Hound: one of the top two cards into your hand, the other into your graveyard", () => {
    const { s: s0, ap, ids } = setup([codecrackerHound()]);
    const [a, b] = s0.players[ap]!.library.slice(0, 2) as [string, string];
    let s = settle(castNow(s0, ap, ids[0]!), at("searchLibrary", ap));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", cards: [a, b], min: 1, max: 1 });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [b] }));
    expect([zone(s, a), zone(s, b)]).toEqual(["graveyard", "hand"]);
  });

  it("Faerie Snoop is supported (its look is Codecracker Hound's)", () => {
    supported(faerieSnoop());
  });

  const driller = (pay: boolean) => {
    const { s: s0, ap, opp } = setup([]);
    const d = putOnBattlefield(s0, ap, dwarvenDriller());
    const land = putOnBattlefield(s0, opp, wastes());
    let s = settle(run(s0, planActivate(s0, ap, d, 0, [tgt(land)])), at("chooseOption", opp));
    expect(s.pending?.kind === "chooseOption" && s.pending.what === "punisher" && s.pending.labels).toEqual(["Be dealt 2 damage", "Let Dwarven Driller destroy it"]);
    s = settle(act(s, { type: "chooseOption", player: opp, choice: pay ? "0" : "none" }));
    return { s, s0, opp, land };
  };

  it("Dwarven Driller: the land's controller may take 2 damage to keep it", () => {
    const { s, s0, opp, land } = driller(true);
    expect([zone(s, land), life(s, opp)]).toEqual(["battlefield", life(s0, opp) - 2]);
  });

  it("Dwarven Driller: or the land is destroyed", () => {
    const { s, s0, opp, land } = driller(false);
    expect([zone(s, land), life(s, opp)]).toEqual(["graveyard", life(s0, opp)]);
  });

  it("Blazing Salvo: 3 damage to the creature unless its controller takes 5", () => {
    for (const pay of [true, false]) {
      const { s: s0, ap, opp, ids } = setup([blazingSalvo()]);
      const theirs = putOnBattlefield(s0, opp, bearC("Their Bear", 3, 3));
      let s = settle(castNow(s0, ap, ids[0]!, [tgt(theirs)]), at("chooseOption", opp));
      expect(s.pending?.kind === "chooseOption" && s.pending.labels).toEqual(["Be dealt 5 damage", "Let Blazing Salvo deal 3 damage to it"]);
      s = settle(act(s, { type: "chooseOption", player: opp, choice: pay ? "0" : "none" }));
      expect([zone(s, theirs), life(s, opp)]).toEqual(pay ? ["battlefield", life(s0, opp) - 5] : ["graveyard", life(s0, opp)]);
    }
  });

  it("Dwarven Scorcher: sacrificed, 1 damage to the creature unless its controller takes 2", () => {
    const { s: s0, ap, opp } = setup([]);
    const sc = putOnBattlefield(s0, ap, dwarvenScorcher());
    const theirs = putOnBattlefield(s0, opp, bearC("Their Bear", 1, 1));
    let s = settle(run(s0, planActivate(s0, ap, sc, 0, [tgt(theirs)])), at("chooseOption", opp));
    expect(zone(s, sc)).toBe("graveyard");
    s = settle(act(s, { type: "chooseOption", player: opp, choice: "0" }));
    expect([zone(s, theirs), life(s, opp)]).toEqual(["battlefield", life(s0, opp) - 2]);
  });

  it("Molten Influence: the spell is countered unless its controller takes 4 damage", () => {
    for (const pay of [true, false]) {
      const { s: s0, ap, opp, ids } = setup([moltenInfluence()]);
      const theirOpt = toZone(s0, opp, opt(), "hand");
      s0.players[opp]!.manaPool = { ...s0.players[opp]!.manaPool, U: 1 };
      let s = s0;
      while (waitingOn(s) !== opp) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      s = run(s, planCast(s, opp, theirOpt));
      while (waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      const item = s.stack[s.stack.length - 1]!;
      s = settle(castNow(s, ap, ids[0]!, [{ kind: "stack", id: item.id } as TargetChoice]), at("chooseOption", opp));
      expect(s.pending?.kind === "chooseOption" && s.pending.labels).toEqual(["Be dealt 4 damage", "Let Molten Influence counter it"]);
      s = settle(act(s, { type: "chooseOption", player: opp, choice: pay ? "0" : "none" }));
      expect([life(s, opp), zone(s, theirOpt)]).toEqual([life(s0, opp) - (pay ? 4 : 0), "graveyard"]);
      expect(s.players[opp]!.hand.length).toBe(s0.players[opp]!.hand.length - 1 + (pay ? 1 : 0));
    }
  });

  it("Nissa's Revelation: scry 5, then a creature card on top draws cards equal to its power and gains life equal to its toughness", () => {
    const { s: s0, ap, ids } = setup([nissasRevelation()]);
    const beast = toZone(s0, ap, bearC("Top Beast", 3, 4), "library");
    let s = settle(castNow(s0, ap, ids[0]!), at("arrangeTop", ap));
    const p = s.pending!;
    expect(p.kind === "arrangeTop" && p.cards.length).toBe(5);
    const hand = s.players[ap]!.hand.length;
    s = settle(act(s, { type: "arrangeTop", player: ap, top: p.kind === "arrangeTop" ? p.cards : [], away: [] }));
    expect([life(s, ap), s.players[ap]!.hand.length, zone(s, beast)]).toEqual([life(s0, ap) + 4, hand + 3, "hand"]);
  });

  it("Nissa's Revelation: a noncreature card on top does nothing", () => {
    const { s: s0, ap, ids } = setup([nissasRevelation()]);
    toZone(s0, ap, opt(), "library");
    let s = settle(castNow(s0, ap, ids[0]!), at("arrangeTop", ap));
    const p = s.pending!;
    const hand = s.players[ap]!.hand.length;
    s = settle(act(s, { type: "arrangeTop", player: ap, top: p.kind === "arrangeTop" ? p.cards : [], away: [] }));
    expect([life(s, ap), s.players[ap]!.hand.length]).toEqual([life(s0, ap), hand]);
  });

  it("Tibalt, the Fiend-Blooded: −4 deals damage equal to the cards in the target player's hand", () => {
    const { s: s0, ap, opp } = setup([]);
    const t = putOnBattlefield(s0, ap, tibaltTheFiendBlooded());
    s0.objects[t]!.counters = { loyalty: 5 };
    const n = s0.players[opp]!.hand.length;
    expect(n).toBeGreaterThan(0);
    const s = settle(run(s0, planActivate(s0, ap, t, 1, [ply(opp)])));
    expect([life(s, opp), counters(s, t, "loyalty")]).toEqual([life(s0, opp) - n, 1]);
  });

  it("Trade Route Envoy: draws with a creature with a counter on it, else a +1/+1 counter on itself", () => {
    const { s: s0, ap, ids } = setup([tradeRouteEnvoy(), tradeRouteEnvoy()]);
    let s = settle(castNow(s0, ap, ids[0]!));
    expect(counters(s, ids[0]!)).toBe(1);
    const hand = s.players[ap]!.hand.length;
    s = settle(castNow(s, ap, ids[1]!));
    expect([counters(s, ids[1]!), s.players[ap]!.hand.length]).toEqual([0, hand]);
  });

  it("Elfhame Sanctuary: search for a basic land at upkeep, and if you do, skip this turn's draw step", () => {
    for (const yes of [true, false]) {
      const { s: s0, ap } = setup([]);
      putOnBattlefield(s0, ap, elfhameSanctuary());
      onlyHand(s0, ap, []);
      let s = goUntil(s0, (x) => x.turn > s0.turn && x.activePlayer === ap && at("chooseMay", ap)(x));
      s = answerMay(s, ap, yes);
      if (yes) {
        expect(s.pending?.kind).toBe("searchLibrary");
        const p = s.pending!;
        const land = p.kind === "searchLibrary" ? p.cards[0]! : "";
        s = act(s, { type: "searchLibrary", player: ap, found: [land] });
        s = goUntil(s, (x) => x.activePlayer === ap && x.step === "main1");
        expect(s.players[ap]!.hand).toEqual([land]);
      } else {
        s = goUntil(s, (x) => x.activePlayer === ap && x.step === "main1");
        expect(s.players[ap]!.hand.length).toBe(1);
      }
    }
  });

  it("Elfhame Sanctuary: searching and finding nothing still skips the draw (rulings), and two don't skip two draw steps", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, elfhameSanctuary());
    putOnBattlefield(s0, ap, elfhameSanctuary());
    onlyHand(s0, ap, []);
    let s = goUntil(s0, (x) => x.turn > s0.turn && x.activePlayer === ap && at("chooseMay", ap)(x));
    const turn = s.turn;
    for (let i = 0; i < 2; i++) {
      s = settle(answerMay(s, ap, true), (x) => at("chooseMay", ap)(x) || at("searchLibrary", ap)(x));
      if (s.pending?.kind === "searchLibrary") s = act(s, { type: "searchLibrary", player: ap, found: [] });
      s = settle(s, at("chooseMay", ap));
    }
    s = goUntil(s, (x) => x.activePlayer === ap && x.step === "main1");
    expect(s.players[ap]!.hand.length).toBe(0);
    s = goUntil(s, (x) => x.turn > turn && x.activePlayer === ap && at("chooseMay", ap)(x));
    s = settle(answerMay(s, ap, false), at("chooseMay", ap));
    s = settle(answerMay(s, ap, false));
    s = goUntil(s, (x) => x.activePlayer === ap && x.step === "main1");
    expect(s.players[ap]!.hand.length).toBe(1);
  });

  it("Sheriff of Safe Passage: one +1/+1 counter plus one for each other creature you control", () => {
    const { s: s0, ap, ids } = setup([sheriffOfSafePassage()]);
    putOnBattlefield(s0, ap, bearC());
    putOnBattlefield(s0, ap, bearC("Other Bear"));
    const s = settle(castNow(s0, ap, ids[0]!));
    expect([counters(s, ids[0]!), pt(s, ids[0]!)]).toEqual([3, "3/3"]);
  });

  it("Clockwork Hydra: attacking removes a +1/+1 counter, and then it deals 1 damage to any target", () => {
    const { s: s0, ap, opp } = setup([]);
    s0.players[ap]!.hand = [];
    const h = putOnBattlefield(s0, ap, clockworkHydra());
    s0.objects[h]!.counters = { "+1/+1": 4 };
    invalidateCharacteristics(s0);
    let s = attackWith(s0, [h], opp);
    expect(s.pending?.kind).toBe("chooseTargets");
    s = act(s, { type: "chooseTargets", player: ap, targets: [ply(opp)] } as Action);
    s = settle(s);
    expect([counters(s, h), life(s, opp)]).toEqual([3, life(s0, opp) - 1]);
  });

  it("Clockwork Hydra: with no counter to remove, no damage", () => {
    const { s: s0, ap, opp } = setup([]);
    s0.players[ap]!.hand = [];
    const h = putOnBattlefield(s0, ap, clockworkHydra());
    s0.objects[h]!.counters = { "+1/+1": 1 };
    invalidateCharacteristics(s0);
    let s = attackWith(s0, [h], opp);
    s = act(s, { type: "chooseTargets", player: ap, targets: [ply(opp)] } as Action);
    // Responding: the counter is gone before the trigger resolves.
    s.objects[h]!.counters = {};
    invalidateCharacteristics(s);
    s = settle(s);
    expect(life(s, opp)).toBe(life(s0, opp));
  });

  it("Freelance Muscle: +X/+X for the greatest power or toughness among your other creatures", () => {
    const { s: s0, ap, opp } = setup([]);
    s0.players[ap]!.hand = [];
    const m = putOnBattlefield(s0, ap, freelanceMuscle());
    putOnBattlefield(s0, ap, bearC("Wall Bear", 1, 6));
    putOnBattlefield(s0, ap, bearC("Big Bear", 5, 2));
    putOnBattlefield(s0, opp, bearC("Their Huge Bear", 9, 9));
    const s = settle(attackWith(s0, [m], opp));
    expect(pt(s, m)).toBe("10/10");
  });

  it("Necropolis Fiend: {X}, {T}, exile X cards from your graveyard: target creature gets -X/-X", () => {
    const { s: s0, ap, opp } = setup([]);
    const f = putOnBattlefield(s0, ap, necropolisFiend());
    const yard = [0, 1, 2].map(() => toZone(s0, ap, opt(), "graveyard"));
    const theirs = putOnBattlefield(s0, opp, bearC("Their Bear", 3, 3));
    expect(planActivate(s0, ap, f, 0, [tgt(theirs)], undefined, undefined, 2, { exileCards: yard })).toBeNull();
    expect(planActivate(s0, ap, f, 0, [tgt(theirs)], undefined, undefined, 4, { exileCards: [] })).toBeNull();
    let s = run(s0, planActivate(s0, ap, f, 0, [tgt(theirs)], undefined, undefined, 2, { exileCards: yard.slice(0, 2) }));
    expect(yard.map((id) => zone(s, id))).toEqual(["exile", "exile", "graveyard"]);
    s = settle(s);
    expect(pt(s, theirs)).toBe("1/1");
  });

  it("Taigam, Sidisi's Hand: {B}, {T}, exile X cards: -X/-X, X announced by the cards exiled", () => {
    const { s: s0, ap, opp } = setup([]);
    const t = putOnBattlefield(s0, ap, taigamSidisisHand());
    const yard = [0, 1, 2].map(() => toZone(s0, ap, opt(), "graveyard"));
    const theirs = putOnBattlefield(s0, opp, bearC("Their Bear", 3, 3));
    const s = settle(run(s0, planActivate(s0, ap, t, 0, [tgt(theirs)], undefined, undefined, 3, { exileCards: yard })));
    expect(zone(s, theirs)).toBe("graveyard");
  });

  it("Geistflame Reservoir: remove any number of charge counters, that much damage", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, geistflameReservoir());
    s0.objects[g]!.counters = { charge: 3 };
    expect(planActivate(s0, ap, g, 0, [ply(opp)], undefined, undefined, 4)).toBeNull();
    const s = settle(run(s0, planActivate(s0, ap, g, 0, [ply(opp)], undefined, undefined, 2)));
    expect([counters(s, g, "charge"), life(s, opp)]).toEqual([1, life(s0, opp) - 2]);
  });

  it("Grozoth: search for any number of cards with mana value 9", () => {
    const { s: s0, ap, ids } = setup([grozoth()]);
    const nine = [0, 1].map(() => toZone(s0, ap, vanilla("Nine Drop", "Creature — Giant", "{9}", 9, 9, 9), "library"));
    let s = settle(castNow(s0, ap, ids[0]!), at("chooseMay", ap));
    s = answerMay(s, ap, true);
    const p = s.pending!;
    expect(p.kind === "searchLibrary" && [...p.cards].sort()).toEqual([...nine].sort());
    s = settle(act(s, { type: "searchLibrary", player: ap, found: nine }));
    expect(nine.map((id) => zone(s, id))).toEqual(["hand", "hand"]);
  });

  it("The Archimandrite: tap three untapped Advisors, Artificers, and/or Monks to draw", () => {
    const { s: s0, ap } = setup([]);
    const a = putOnBattlefield(s0, ap, theArchimandrite());
    const crew = [vanilla("Test Advisor", "Creature — Human Advisor", "{1}", 1, 1, 1), vanilla("Test Artificer", "Creature — Human Artificer", "{1}", 1, 1, 1), vanilla("Test Monk", "Creature — Human Monk", "{1}", 1, 1, 1)].map((d) => putOnBattlefield(s0, ap, d, { sick: true }));
    const bear = putOnBattlefield(s0, ap, bearC());
    expect(planActivate(s0, ap, a, 0, [], undefined, undefined, undefined, { tap: [crew[1]!, crew[2]!, bear] })).toBeNull();
    const hand = s0.players[ap]!.hand.length;
    const s = settle(run(s0, planActivate(s0, ap, a, 0, [], undefined, undefined, undefined, { tap: [...crew.slice(1), a] })));
    expect([s.players[ap]!.hand.length, s.objects[a]!.tapped, s.objects[crew[0]!]!.tapped]).toEqual([hand + 1, true, false]);
  });

  it("Mega Flare: kicked, a 6/6 Dragon first, then damage equal to the greatest power to up to one creature of each opponent", () => {
    const { s: s0, ap, ids } = setup([megaFlare()]);
    // Targets are chosen opponent by opponent in turn order after the caster (CR 601.2c, 102.2).
    const i0 = s0.turnOrder.indexOf(ap);
    const opps = [...s0.turnOrder.slice(i0 + 1), ...s0.turnOrder.slice(0, i0)];
    const victims = opps.map((p, i) => putOnBattlefield(s0, p, bearC(`Their Bear ${i}`, 5, 5)));
    const mine = putOnBattlefield(s0, ap, bearC("My Bear", 2, 2));
    const targets: TargetChoice[] = [tgt(victims[0]!), { kind: "none" }, tgt(victims[2]!)];
    const s = settle(castNow(s0, ap, ids[0]!, targets, { kicks: [0] }));
    expect(victims.map((id) => zone(s, id))).toEqual(["graveyard", "battlefield", "graveyard"]);
    expect(zone(s, mine)).toBe("battlefield");
  });

  it("Mega Flare: unkicked, the greatest power among your creatures", () => {
    const { s: s0, ap, ids } = setup([megaFlare()]);
    // Targets are chosen opponent by opponent in turn order after the caster (CR 601.2c, 102.2).
    const i0 = s0.turnOrder.indexOf(ap);
    const opps = [...s0.turnOrder.slice(i0 + 1), ...s0.turnOrder.slice(0, i0)];
    const victims = opps.map((p, i) => putOnBattlefield(s0, p, bearC(`Their Bear ${i}`, 4, 4)));
    putOnBattlefield(s0, ap, bearC("My Bear", 3, 3));
    const s = settle(castNow(s0, ap, ids[0]!, victims.map(tgt)));
    expect(victims.map((id) => s.objects[id]!.damage)).toEqual([3, 3, 3]);
  });

  it("Skullcage: 2 damage at an opponent's upkeep unless they have exactly three or four cards in hand, counted as it resolves", () => {
    for (const [n, hurt] of [[3, 0], [4, 0], [2, 2], [5, 2]] as const) {
      const { s: s0, ap, opp } = setup([]);
      putOnBattlefield(s0, ap, skullcage());
      onlyHand(s0, opp, s0.players[opp]!.hand.slice(0, n));
      expect(s0.players[opp]!.hand.length).toBe(n);
      const s = goUntil(s0, (x) => x.activePlayer === opp && x.step === "draw");
      expect(life(s, opp)).toBe(life(s0, opp) - hurt);
    }
  });

  it("Barren Glory: with no other permanents and no cards in hand at your upkeep, you win", () => {
    const { s: s0, ap } = setup([]);
    for (const id of s0.battlefield.filter((x) => controllerOf(s0, s0.objects[x]!) === ap)) {
      s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
      s0.objects[id]!.zone = "graveyard";
      s0.players[ap]!.graveyard.push(id);
    }
    s0.players[ap]!.command = [];
    putOnBattlefield(s0, ap, barrenGlory());
    onlyHand(s0, ap, []);
    invalidateCharacteristics(s0);
    const s = goUntil(s0, (x) => x.over || (x.turn > s0.turn && x.activePlayer === ap && x.step === "draw"));
    expect([s.over, s.winner]).toEqual([true, ap]);
  });

  it("Barren Glory: not with a card in hand", () => {
    const { s: s0, ap } = setup([]);
    for (const id of s0.battlefield.filter((x) => controllerOf(s0, s0.objects[x]!) === ap)) {
      s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
      s0.objects[id]!.zone = "graveyard";
      s0.players[ap]!.graveyard.push(id);
    }
    putOnBattlefield(s0, ap, barrenGlory());
    onlyHand(s0, ap, s0.players[ap]!.hand.slice(0, 1));
    invalidateCharacteristics(s0);
    const s = goUntil(s0, (x) => x.over || (x.turn > s0.turn && x.activePlayer === ap && x.step === "draw"));
    expect(s.over).toBeFalsy();
  });

  it("Covetous Urge: exile a nonland card from the opponent's hand or graveyard; you may cast it with mana of any color while it stays exiled", () => {
    const { s: s0, ap, opp, ids } = setup([covetousUrge()]);
    const inHand = toZone(s0, opp, shock(), "hand");
    onlyHand(s0, opp, [inHand]);
    let s = settle(castNow(s0, ap, ids[0]!, [ply(opp)]), at("searchLibrary", ap));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, hand: opp, handYard: true, min: 1, max: 1 });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [inHand] }));
    expect(zone(s, inHand)).toBe("exile");
    poolOnly(s, ap, { B: 1 });
    s = settle(castNow(s, ap, inHand, [ply(opp)]));
    expect([zone(s, inHand), life(s, opp)]).toEqual(["graveyard", life(s0, opp) - 2]);
  });

  it("Covetous Urge: a card taken from the graveyard can be cast too", () => {
    const { s: s0, ap, opp, ids } = setup([covetousUrge()]);
    onlyHand(s0, opp, []);
    const inYard = toZone(s0, opp, shock(), "graveyard");
    let s = settle(castNow(s0, ap, ids[0]!, [ply(opp)]), at("searchLibrary", ap));
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [inYard] }));
    expect(zone(s, inYard)).toBe("exile");
    expect(planCast(s, opp, inYard, [ply(ap)])).toBeNull();
    poolOnly(s, ap, { U: 1 });
    s = settle(castNow(s, ap, inYard, [ply(opp)]));
    expect(life(s, opp)).toBe(life(s0, opp) - 2);
  });

  it("Psychic Intrusion is supported (Covetous Urge's text)", () => {
    supported(psychicIntrusion());
  });

  it("Uncle's Musings: return up to X permanent cards, X the colors spent; then it exiles itself", () => {
    const { s: s0, ap, ids } = setup([unclesMusings()]);
    const perms = [toZone(s0, ap, bearC("Yard Bear A"), "graveyard"), toZone(s0, ap, bearC("Yard Bear B"), "graveyard"), toZone(s0, ap, rock(), "graveyard"), toZone(s0, ap, wastes(), "graveyard")];
    const instant = toZone(s0, ap, opt(), "graveyard");
    poolOnly(s0, ap, { G: 2, U: 1, W: 1 });
    let s = settle(castNow(s0, ap, ids[0]!), (x) => !!x.pending && x.pending.player === ap);
    const p = s.pending;
    expect(p).toMatchObject({ kind: "searchLibrary", player: ap, min: 0, max: 3 });
    expect(p && "cards" in p && [...(p.cards as string[])].sort()).toEqual([...perms].sort());
    expect(p && "cards" in p && (p.cards as string[]).includes(instant)).toBe(false);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: perms.slice(0, 3) }));
    expect([...perms.map((id) => zone(s, id)), zone(s, ids[0]!)]).toEqual(["hand", "hand", "hand", "graveyard", "exile"]);
  });

  const exileUntil = (def: CardDef, theirs: CardDef[], mine: CardDef[]) => {
    const { s: s0, ap, opp, ids } = setup([def, disenchant()]);
    const t = theirs.map((d) => putOnBattlefield(s0, opp, d));
    const m = mine.map((d) => putOnBattlefield(s0, ap, d));
    let s = settle(castNow(s0, ap, ids[0]!));
    const after = { theirs: t.map((id) => zone(s, id)), mine: m.map((id) => zone(s, id)) };
    const self = s.battlefield.find((id) => nameOf(s, id) === def.name)!;
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, W: 1 };
    s = settle(castNow(s, ap, ids[1]!, [tgt(self)]));
    const back = (id: string) => s.battlefield.some((x) => nameOf(s, x) === nameOf(s0, id) && controllerOf(s, s.objects[x]!) === s0.objects[id]!.controller);
    return { after, back: { theirs: t.map(back), mine: m.map(back) } };
  };

  it("Consulate Crackdown: exiles the artifacts opponents control until it leaves the battlefield", () => {
    const r = exileUntil(consulateCrackdown(), [rock("Their Rock"), bearC("Their Bear")], [rock("My Rock")]);
    expect(r.after).toEqual({ theirs: ["exile", "battlefield"], mine: ["battlefield"] });
    expect(r.back).toEqual({ theirs: [true, true], mine: [true] });
  });

  it("Temporary Lockdown: exiles each nonland permanent with mana value 2 or less, its own controller's too, until it leaves", () => {
    const r = exileUntil(temporaryLockdown(), [rock("Their Rock"), bigSpellPerm(), wastes()], [bearC("My Bear")]);
    expect(r.after).toEqual({ theirs: ["exile", "battlefield", "battlefield"], mine: ["exile"] });
    expect(r.back).toEqual({ theirs: [true, true, true], mine: [true] });
  });

  it("Aligned Hedron Network: exiles the creatures with power 5 or greater until it leaves", () => {
    const { s: s0, ap, opp, ids } = setup([alignedHedronNetwork(), disenchant()]);
    const big = putOnBattlefield(s0, opp, bearC("Their Giant", 5, 5));
    const small = putOnBattlefield(s0, opp, bearC("Their Bear", 4, 4));
    let s = settle(castNow(s0, ap, ids[0]!));
    expect([zone(s, big), zone(s, small)]).toEqual(["exile", "battlefield"]);
    const self = s.battlefield.find((id) => nameOf(s, id) === "Aligned Hedron Network")!;
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, W: 1 };
    s = settle(castNow(s, ap, ids[1]!, [tgt(self)]));
    expect(s.battlefield.filter((x) => nameOf(s, x) === "Their Giant").map((x) => controllerOf(s, s.objects[x]!))).toEqual([opp]);
  });

  it("Witness the Future: the player shuffles up to four target cards from their graveyard into their library; you take one of your top four and the rest go to the bottom", () => {
    const { s: s0, ap, opp, ids } = setup([witnessTheFuture()]);
    const yard = [toZone(s0, opp, bearC("Y1"), "graveyard"), toZone(s0, opp, bearC("Y2"), "graveyard")];
    const top = s0.players[ap]!.library.slice(0, 4);
    let s = settle(castNow(s0, ap, ids[0]!, [ply(opp), ...yard.map(tgt), { kind: "none" }, { kind: "none" }]), at("searchLibrary", ap));
    expect(yard.map((id) => zone(s, id))).toEqual(["library", "library"]);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 1, max: 1 });
    expect(s.pending?.kind === "searchLibrary" && s.pending.cards).toEqual(top);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [top[2]!] }));
    expect(zone(s, top[2]!)).toBe("hand");
    expect([...s.players[ap]!.library.slice(-3)].sort()).toEqual([top[0]!, top[1]!, top[3]!].sort());
  });

  it("Rites of Spring: discard any number of cards, then search for up to that many basic lands", () => {
    const { s: s0, ap, ids } = setup([ritesOfSpring()]);
    const a = toZone(s0, ap, opt(), "hand");
    const b = toZone(s0, ap, bigSpell(), "hand");
    const c = toZone(s0, ap, rock(), "hand");
    onlyHand(s0, ap, [ids[0]!, a, b, c]);
    let s = settle(castNow(s0, ap, ids[0]!), (x) => !!x.pending && x.pending.player === ap);
    expect(s.pending).toMatchObject({ kind: "discard", player: ap, upTo: true });
    s = act(s, { type: "discard", player: ap, objectIds: [a, b] });
    s = settle(s, at("searchLibrary", ap));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 2 });
    const p = s.pending;
    const found = p?.kind === "searchLibrary" ? p.cards.filter((id) => nameOf(s, id) === "Forest").slice(0, 2) : [];
    s = settle(act(s, { type: "searchLibrary", player: ap, found }));
    expect([zone(s, a), zone(s, b), zone(s, c), ...found.map((id) => zone(s, id))]).toEqual(["graveyard", "graveyard", "hand", "hand", "hand"]);
    expect(found.every((id) => nameOf(s, id) === "Forest")).toBe(true);
  });

  it("Divine Gambit: exile the opponent's permanent; that player may put a permanent card from their hand onto the battlefield", () => {
    const { s: s0, ap, opp, ids } = setup([divineGambit()]);
    const theirs = putOnBattlefield(s0, opp, bearC("Their Bear"));
    const big = toZone(s0, opp, bigSpellPerm(), "hand");
    const spell = toZone(s0, opp, opt(), "hand");
    onlyHand(s0, opp, [big, spell]);
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(theirs)]), (x) => !!x.pending && x.pending.player === opp);
    expect(zone(s, theirs)).toBe("exile");
    expect(s.pending?.player).toBe(opp);
    const p = s.pending!;
    expect(p.kind === "searchLibrary" && p.cards).toEqual([big]);
    s = settle(act(s, { type: "searchLibrary", player: opp, found: [big] }));
    expect([zone(s, big), zone(s, spell)]).toEqual(["battlefield", "hand"]);
    expect(controllerOf(s, s.objects[big]!)).toBe(opp);
  });

  it("Outlaws' Fury: +2/+0 to your creatures, and with an outlaw, exile the top card and you may play it", () => {
    for (const outlaw of [true, false]) {
      const { s: s0, ap, ids } = setup([outlawsFury()]);
      const bear = putOnBattlefield(s0, ap, outlaw ? rogue() : bearC());
      const top = s0.players[ap]!.library[0]!;
      const s = settle(castNow(s0, ap, ids[0]!));
      expect(pt(s, bear)).toBe("4/2");
      expect(zone(s, top)).toBe(outlaw ? "exile" : "library");
      if (outlaw) expect(s.objects[top]!.mayPlay).toMatchObject({ player: ap });
    }
  });

  it("Heat Stroke: at end of combat, destroys each creature that blocked or was blocked; an unblocked attacker survives", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, heatStroke());
    const a1 = putOnBattlefield(s0, ap, bearC("Attacker A", 1, 9));
    const a2 = putOnBattlefield(s0, ap, bearC("Attacker B", 1, 9));
    const blocker = putOnBattlefield(s0, opp, bearC("Their Wall", 1, 9));
    let s = attackWith(s0, [a1, a2], opp);
    s = toBlocks(s);
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker, attacker: a1 }] } as Action);
    s = goUntil(s, (x) => x.step === "main2" || x.step === "end");
    expect([zone(s, a1), zone(s, a2), zone(s, blocker)]).toEqual(["graveyard", "battlefield", "graveyard"]);
  });

  it("Decaying Soil is supported since round B234: its granted dies trigger looks back at the graveyard before the creature arrives (CR 603.10a)", () => {
    expect(isFullySupported(decayingSoil())).toBe(true);
  });
});
