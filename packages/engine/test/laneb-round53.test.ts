// Lane B, round 53: unsupported cards no earlier round wrote down, EDHREC rank about 22,000 up, least played first
// (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, addEffect, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { attackProblem, blockProblem, botActions, castProblem, legalTargets, planPlot, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, power, toughness, planCast, planTurnFaceUp, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PlayerId, type TargetChoice } from "../src";

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

// Real oracle text (Scryfall).
const sheoldredsRestoration = () => card("Sheoldred's Restoration", "Sorcery", "{3}{B}", { cmc: 4, colors: ["B"], keywords: ["Kicker"], oracleText: "Kicker {2}{W} (You may pay an additional {2}{W} as you cast this spell.)\nReturn target creature card from your graveyard to the battlefield. If this spell was kicked, you gain life equal to that card's mana value. Otherwise, you lose that much life.\nExile Sheoldred's Restoration." });
const hulklingBurgeoningBruiser = () => card("Hulkling, Burgeoning Bruiser", "Legendary Creature — Kree Skrull Hero", "{2}{G}", { cmc: 3, colors: ["G"], power: "2", toughness: "3", keywords: ["Vigilance"], oracleText: "Vigilance\nWhenever another creature you control enters, if it has greater power or toughness than Hulkling, put a +1/+1 counter on Hulkling." });
const coldStorage = () => card("Cold Storage", "Artifact", "{4}", { cmc: 4, colors: [], oracleText: "{3}: Exile target creature you control.\nSacrifice this artifact: Return each creature card exiled with this artifact to the battlefield under your control." });
const endlessSands = () => card("Endless Sands", "Land — Desert", "", { cmc: 0, colors: [], oracleText: "{T}: Add {C}.\n{2}, {T}: Exile target creature you control.\n{4}, {T}, Sacrifice this land: Return each creature card exiled with this land to the battlefield under its owner's control." });
const longhornSharpshooter = () => card("Longhorn Sharpshooter", "Creature — Minotaur Rogue", "{2}{R}", { cmc: 3, colors: ["R"], power: "3", toughness: "3", keywords: ["Reach", "Plot"], oracleText: "Reach\nWhen this card becomes plotted, it deals 2 damage to any target.\nPlot {3}{R} (You may pay {3}{R} and exile this card from your hand. Cast it as a sorcery on a later turn without paying its mana cost. Plot only as a sorcery.)" });
const aloeAlchemist = () => card("Aloe Alchemist", "Creature — Plant Warlock", "{1}{G}", { cmc: 2, colors: ["G"], power: "3", toughness: "2", keywords: ["Plot", "Trample"], oracleText: "Trample\nWhen this card becomes plotted, target creature gets +3/+2 and gains trample until end of turn.\nPlot {1}{G} (You may pay {1}{G} and exile this card from your hand. Cast it as a sorcery on a later turn without paying its mana cost. Plot only as a sorcery.)" });
const custodiSoulcaller = () => card("Custodi Soulcaller", "Creature — Human Cleric", "{1}{W}{W}", { cmc: 3, colors: ["W"], power: "1", toughness: "2", keywords: ["Melee"], oracleText: "Melee (Whenever this creature attacks, it gets +1/+1 until end of turn for each opponent you attacked this combat.)\nWhenever this creature attacks, return target creature card with mana value X or less from your graveyard to the battlefield, where X is the number of players you attacked this combat." });
const aetherWeb = () => card("Aether Web", "Enchantment — Aura", "{1}{G}", { cmc: 2, colors: ["G"], keywords: ["Enchant", "Flash"], oracleText: "Flash (You may cast this spell any time you could cast an instant.)\nEnchant creature\nEnchanted creature gets +1/+1, has reach, and can block creatures with shadow as though they didn't have shadow. (Creatures with reach can block creatures with flying.)" });
const aetherflameWall = () => card("Aetherflame Wall", "Creature — Wall", "{1}{R}", { cmc: 2, colors: ["R"], power: "0", toughness: "4", keywords: ["Defender"], oracleText: "Defender\nThis creature can block creatures with shadow as though they didn't have shadow.\n{R}: This creature gets +1/+0 until end of turn." });
const worldQueller = () => card("World Queller", "Creature — Avatar", "{3}{W}{W}", { cmc: 5, colors: ["W"], power: "4", toughness: "4", oracleText: "At the beginning of your upkeep, you may choose a card type. If you do, each player sacrifices a permanent of their choice of that type." });
const mazesMantle = () => card("Maze's Mantle", "Enchantment — Aura", "{2}{G}", { cmc: 3, colors: ["G"], keywords: ["Enchant", "Flash"], oracleText: "Flash\nEnchant creature\nWhen this Aura enters, if enchanted creature has toxic, that creature gains hexproof until end of turn.\nEnchanted creature gets +2/+2." });
const bloodLust = () => card("Blood Lust", "Instant", "{1}{R}", { cmc: 2, colors: ["R"], oracleText: "If target creature has toughness 5 or greater, it gets +4/-4 until end of turn. Otherwise, it gets +4/-X until end of turn, where X is its toughness minus 1." });
const hemlockVial = () => card("Hemlock Vial", "Artifact", "{1}{B}", { cmc: 2, colors: ["B"], oracleText: "When this artifact enters, you draw a card and you lose 1 life.\n{B}, {T}, Sacrifice this artifact: Each equipped creature and Equipment you control gains deathtouch until end of turn." });
const forceAway = () => card("Force Away", "Instant", "{1}{U}", { cmc: 2, colors: ["U"], keywords: ["Ferocious"], oracleText: "Return target creature to its owner's hand.\nFerocious — If you control a creature with power 4 or greater, you may draw a card. If you do, discard a card." });
const partingThoughts = () => card("Parting Thoughts", "Sorcery", "{2}{B}", { cmc: 3, colors: ["B"], oracleText: "Destroy target creature. You draw X cards and you lose X life, where X is the number of counters on that creature." });
const favorableDestiny = () => card("Favorable Destiny", "Enchantment — Aura", "{1}{W}", { cmc: 2, colors: ["W"], keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature gets +1/+2 as long as it's white.\nEnchanted creature has shroud as long as its controller controls another creature. (It can't be the target of spells or abilities.)" });
const paralyze = () => card("Paralyze", "Enchantment — Aura", "{B}", { cmc: 1, colors: ["B"], keywords: ["Enchant"], oracleText: "Enchant creature\nWhen this Aura enters, tap enchanted creature.\nEnchanted creature doesn't untap during its controller's untap step.\nAt the beginning of the upkeep of enchanted creature's controller, that player may pay {4}. If the player does, untap the creature." });
const ragamuffinRaptor = () => card("Ragamuffin Raptor", "Creature — Dinosaur", "{4}{G}", { cmc: 5, colors: ["G"], power: "4", toughness: "3", oracleText: "When this creature enters, return up to one target creature or Food card from your graveyard to your hand." });
const wardscaleDragon = () => card("Wardscale Dragon", "Creature — Dragon", "{4}{W}{W}", { cmc: 6, colors: ["W"], power: "4", toughness: "4", keywords: ["Flying"], oracleText: "Flying\nAs long as this creature is attacking, defending player can't cast spells." });
const roseNoble = () => card("Rose Noble", "Legendary Creature — Human", "{3}{U}", { cmc: 4, colors: ["U"], power: "2", toughness: "3", keywords: ["Ward", "Doctor's companion"], oracleText: "Ward {2}\nWhenever you cast a Doctor spell or creature spell with doctor's companion, draw a card.\nDoctor's companion (You can have two commanders if the other is the Doctor.)" });

const rosecotKnight = () => card("Rosecot Knight", "Creature — Human Knight", "{4}{W}", { cmc: 5, colors: ["W"], power: "3", toughness: "4", keywords: ["Vigilance"], oracleText: "Vigilance\nWhen this creature enters, look at the top six cards of your library. You may reveal an artifact or enchantment card from among them and put it into your hand. Put the rest on the bottom of your library in a random order. If you didn't put a card into your hand this way, put a +1/+1 counter on this creature." });
const blossomPrancer = () => card("Blossom Prancer", "Creature — Spirit", "{3}{G}{G}", { cmc: 5, colors: ["G"], power: "4", toughness: "4", keywords: ["Reach"], oracleText: "Reach\nWhen this creature enters, look at the top five cards of your library. You may reveal a creature or enchantment card from among them and put it into your hand. Put the rest on the bottom of your library in a random order. If you didn't put a card into your hand this way, you gain 4 life." });
const pulsarSquadronAce = () => card("Pulsar Squadron Ace", "Creature — Human Pilot", "{1}{W}", { cmc: 2, colors: ["W"], power: "1", toughness: "2", oracleText: "When this creature enters, look at the top five cards of your library. You may reveal a Spacecraft card from among them and put it into your hand. Put the rest on the bottom of your library in a random order. If you didn't put a card into your hand this way, put a +1/+1 counter on this creature." });
const inscribedTablet = () => card("Inscribed Tablet", "Artifact", "{1}", { cmc: 1, colors: [], oracleText: "{1}, {T}, Sacrifice this artifact: Reveal the top five cards of your library. Put a land card from among them into your hand and the rest on the bottom of your library in a random order. If you didn't put a card into your hand this way, draw a card." });
const okibaSalvage = () => card("Okiba Salvage", "Sorcery", "{4}{B}", { cmc: 5, colors: ["B"], oracleText: "Return target creature or Vehicle card from your graveyard to the battlefield. Then put two +1/+1 counters on that permanent if you control an artifact and an enchantment." });
const mirkwoodNurturer = () => card("Mirkwood Nurturer", "Creature — Elf Ranger", "{2}{G/U}", { cmc: 3, colors: ["G", "U"], power: "3", toughness: "2", oracleText: "When this creature enters, return up to one other target permanent you control to its owner's hand. If you do, put a +1/+1 counter on this creature." });
const mongrelPack = () => card("Mongrel Pack", "Creature — Dog", "{3}{G}", { cmc: 4, colors: ["G"], power: "4", toughness: "1", oracleText: "When this creature dies during combat, create four 1/1 green Dog creature tokens." });
const esquireOfTheKing = () => card("Esquire of the King", "Creature — Human Soldier", "{W}", { cmc: 1, colors: ["W"], power: "1", toughness: "1", oracleText: "{4}{W}, {T}: Creatures you control get +1/+1 until end of turn. This ability costs {2} less to activate if you control a legendary creature." });
const synchronizedEviction = () => card("Synchronized Eviction", "Instant", "{4}{U}", { cmc: 5, colors: ["U"], oracleText: "This spell costs {2} less to cast if you control at least two creatures that share a creature type.\nPut target nonland permanent into its owner's library second from the top." });
const snowDevil = () => card("Snow Devil", "Enchantment — Aura", "{1}{U}", { cmc: 2, colors: ["U"], keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature has flying.\nEnchanted creature has first strike as long as it's blocking and you control a snow land." });

const sugarCoat = () => card("Sugar Coat", "Enchantment — Aura", "{2}{U}", { cmc: 3, colors: ["U"], keywords: ["Enchant", "Flash"], oracleText: "Flash\nEnchant creature or Food\nEnchanted permanent is a colorless Food artifact with \"{2}, {T}, Sacrifice this artifact: You gain 3 life\" and loses all other card types and abilities." });
const starportSecurity = () => card("Starport Security", "Artifact Creature — Robot Soldier", "{W}", { cmc: 1, colors: ["W"], power: "1", toughness: "1", oracleText: "{3}{W}, {T}: Tap another target creature. This ability costs {2} less to activate if you control a creature with a +1/+1 counter on it." });
const sewerCrocodile = () => card("Sewer Crocodile", "Creature — Crocodile", "{5}{U}", { cmc: 6, colors: ["U"], power: "4", toughness: "6", oracleText: "{3}{U}: This creature can't be blocked this turn. This ability costs {3} less to activate if there are five or more mana values among cards in your graveyard." });
const razorlashTransmogrant = () => card("Razorlash Transmogrant", "Artifact Creature — Zombie", "{2}", { cmc: 2, colors: [], power: "3", toughness: "1", oracleText: "This creature can't block.\n{4}{B}{B}: Return this card from your graveyard to the battlefield with a +1/+1 counter on it. This ability costs {4} less to activate if an opponent controls four or more nonbasic lands." });

// Test cards.
const vanilla = (name: string, typeLine: string, cost: string, cmc: number, p: number, t: number, extra: Partial<CardDef> = {}) => card(name, typeLine, cost, { cmc, power: String(p), toughness: String(t), ...extra });
const bearC = (name = "Plain Bear", p = 2, t = 2) => vanilla(name, "Creature — Bear", "{1}{G}", 2, p, t, { colors: ["G"] });
const bigC = (name = "Big Beast", p = 5, t = 5) => vanilla(name, "Creature — Beast", "{4}{G}", 5, p, t, { colors: ["G"] });
const golem = (name = "Test Golem", p = 2, t = 2) => vanilla(name, "Artifact Creature — Golem", "{2}", 2, p, t, { colors: [] });
const shade = () => vanilla("Test Shade", "Creature — Shade", "{1}{B}", 2, 2, 2, { colors: ["B"], keywords: ["Shadow"], oracleText: "Shadow" });
const opt = () => card("Test Opt", "Instant", "{U}", { cmc: 1, colors: ["U"], oracleText: "Draw a card." });
const bolt = () => card("Test Bolt", "Instant", "{R}", { cmc: 1, colors: ["R"], oracleText: "Test Bolt deals 3 damage to any target." });
const divination = () => card("Test Divination", "Sorcery", "{2}{U}", { cmc: 3, colors: ["U"], oracleText: "Draw two cards." });
const unsummon = () => card("Test Unsummon", "Instant", "{U}", { cmc: 1, colors: ["U"], oracleText: "Return target nonland permanent to its owner's hand." });
const trinket = (name = "Test Trinket") => card(name, "Artifact", "{1}", { cmc: 1, colors: [] });
const walker = () => card("Test Walker", "Legendary Planeswalker — Jace", "{2}{U}", { cmc: 3, colors: ["U"], loyalty: "3", oracleText: "+1: Draw a card." });
const nonbasic = () => card("Test Vista", "Land", "", { oracleText: "{T}: Add {C}." });
const upkeepLife = () => card("Test Chalice", "Artifact", "{2}", { cmc: 2, colors: [], oracleText: "At the beginning of your upkeep, you gain 1 life." });
const kw = (s: GameState, id: string, k: string) => objHasKeyword(s, s.objects[id]!, k);
const tokensNamed = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.isToken && controllerOf(s, s.objects[id]!) === pid && nameOf(s, id).replace(/ Token$/, "") === name);
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


describe("Lane B round 53", () => {
  it("are fully supported", () => {
    supported(sheoldredsRestoration(), hulklingBurgeoningBruiser(), coldStorage(), endlessSands(), longhornSharpshooter(), aloeAlchemist(), custodiSoulcaller(), aetherWeb(), aetherflameWall(), worldQueller(), mazesMantle(), bloodLust(), hemlockVial(), forceAway(), partingThoughts(), favorableDestiny(), paralyze(), ragamuffinRaptor(), wardscaleDragon(), roseNoble(), rosecotKnight(), blossomPrancer(), pulsarSquadronAce(), inscribedTablet(), okibaSalvage(), mirkwoodNurturer(), mongrelPack(), esquireOfTheKing(), synchronizedEviction(), snowDevil(), sugarCoat(), starportSecurity(), sewerCrocodile(), razorlashTransmogrant());
  });

  it("Sheoldred's Restoration: returns the creature card; kicked you gain its mana value in life, unkicked you lose it", () => {
    for (const kicks of [[], [0]]) {
      const { s: s0, ap, ids } = setup([sheoldredsRestoration()]);
      const big = toZone(s0, ap, bigC(), "graveyard");
      const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(big)], undefined, undefined, undefined, { kicks })));
      expect(zone(s, big)).toBe("battlefield");
      expect(life(s, ap)).toBe(kicks.length ? 45 : 35);
      expect(zone(s, ids[0]!)).toBe("exile");
    }
  });

  it("Hulkling: a counter only for a creature with greater power or toughness, and it doesn't evolve", () => {
    const { s: s0, ap, ids } = setup([bearC("Small Bear", 1, 1), bearC("Tall Bear", 1, 4), card("Evolve Watcher", "Creature — Ooze", "{G}", { cmc: 1, power: "1", toughness: "1", oracleText: "Whenever a creature you control evolves, you gain 1 life." })]);
    const hulk = putOnBattlefield(s0, ap, hulklingBurgeoningBruiser());
    let s = settle(castNow(s0, ap, ids[0]!));
    expect(counters(s, hulk)).toBe(0);
    s = settle(castNow(s, ap, ids[1]!));
    expect(counters(s, hulk)).toBe(1);
    expect(pt(s, hulk)).toBe("3/4");
    // Now 3/4: another 1/4 isn't bigger.
    const tall2 = toZone(s, ap, bearC("Tall Bear 2", 1, 4), "hand");
    const lifeBefore = life(s, ap);
    s = settle(castNow(s, ap, tall2));
    expect(counters(s, hulk)).toBe(1);
    expect(life(s, ap)).toBe(lifeBefore);
  });

  it("Cold Storage: exiled creatures come back together under your control when it's sacrificed", () => {
    const { s: s0, ap } = setup([]);
    const storage = putOnBattlefield(s0, ap, coldStorage());
    const a = putOnBattlefield(s0, ap, bearC("Bear A"));
    const b = putOnBattlefield(s0, ap, bigC());
    let s = settle(run(s0, planActivate(s0, ap, storage, 0, [tgt(a)])));
    s = settle(run(s, planActivate(s, ap, storage, 0, [tgt(b)])));
    expect([zone(s, a), zone(s, b)]).toEqual(["exile", "exile"]);
    s = settle(run(s, planActivate(s, ap, storage, 1, [])));
    expect(zone(s, storage)).toBe("graveyard");
    expect([zone(s, a), zone(s, b)]).toEqual(["battlefield", "battlefield"]);
    expect([controllerOf(s, s.objects[a]!), controllerOf(s, s.objects[b]!)]).toEqual([ap, ap]);
  });

  it("Endless Sands: the creature cards come back under their owner's control", () => {
    const { s: s0, ap, opp } = setup([]);
    const sands = putOnBattlefield(s0, ap, endlessSands());
    // An opponent's creature we control.
    const theirs = putOnBattlefield(s0, opp, bearC("Their Bear"));
    s0.objects[theirs]!.controller = ap;
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planActivate(s0, ap, sands, 0, [tgt(theirs)])));
    expect(zone(s, theirs)).toBe("exile");
    s.objects[sands]!.tapped = false;
    s = settle(run(s, planActivate(s, ap, sands, 1, [])));
    expect(zone(s, theirs)).toBe("battlefield");
    expect(controllerOf(s, s.objects[theirs]!)).toBe(opp);
  });

  it("Longhorn Sharpshooter: plotting it deals 2 damage to any target from exile", () => {
    const { s: s0, ap, opp, ids } = setup([longhornSharpshooter()]);
    let s = run(s0, planPlot(s0, ap, ids[0]!));
    expect(zone(s, ids[0]!)).toBe("exile");
    s = triggerTargets(s, ap, [ply(opp)]);
    s = settle(s);
    expect(life(s, opp)).toBe(38);
  });

  it("Aloe Alchemist: plotting it pumps target creature", () => {
    const { s: s0, ap, ids } = setup([aloeAlchemist()]);
    const bear = putOnBattlefield(s0, ap, bearC());
    let s = run(s0, planPlot(s0, ap, ids[0]!));
    s = triggerTargets(s, ap, [tgt(bear)]);
    s = settle(s);
    expect(pt(s, bear)).toBe("5/4");
    expect(kw(s, bear, "Trample")).toBe(true);
  });

  it("Custodi Soulcaller: returns a creature card with mana value up to the number of players attacked", () => {
    const { s: s0, ap } = setup([]);
    onlyHand(s0, ap, []);
    const caller = putOnBattlefield(s0, ap, custodiSoulcaller());
    const helper = putOnBattlefield(s0, ap, bearC("Helper Bear"));
    const two = toZone(s0, ap, bearC("Dead Bear"), "graveyard");
    const three = toZone(s0, ap, vanilla("Dead Ogre", "Creature — Ogre", "{2}{R}", 3, 3, 3, { colors: ["R"] }), "graveyard");
    const [o1, o2] = s0.turnOrder.filter((p) => p !== ap);
    let s = s0;
    for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: caller, defender: o1! }, { attacker: helper, defender: o2! }] });
    s = settle(s, at("chooseTargets", ap));
    expect(s.pending?.kind).toBe("chooseTargets");
    // Two players attacked: the 3-drop isn't a legal target, the 2-drop is.
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(three)] } as Action)).toThrow();
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(two)] } as Action);
    s = settle(s);
    expect(zone(s, two)).toBe("battlefield");
    expect(zone(s, three)).toBe("graveyard");
  });

  it("Aether Web and Aetherflame Wall: block creatures with shadow", () => {
    const { s: s0, ap, opp } = setup([]);
    const sh = putOnBattlefield(s0, ap, shade());
    const wall = putOnBattlefield(s0, opp, aetherflameWall());
    const plain = putOnBattlefield(s0, opp, bearC("Plain Blocker"));
    const webbed = putOnBattlefield(s0, opp, bearC("Webbed Bear"));
    const web = putOnBattlefield(s0, opp, aetherWeb());
    s0.objects[web]!.attachedTo = webbed;
    // A shadow creature with the web: shadow itself is ignored, so it can't block a shadow creature any more (CR 702.28b).
    const shadowWebbed = putOnBattlefield(s0, opp, vanilla("Webbed Shade", "Creature — Shade", "{1}{B}", 2, 2, 2, { colors: ["B"], keywords: ["Shadow"], oracleText: "Shadow" }));
    const web2 = putOnBattlefield(s0, opp, aetherWeb());
    s0.objects[web2]!.attachedTo = shadowWebbed;
    invalidateCharacteristics(s0);
    expect(pt(s0, webbed)).toBe("3/3");
    expect(kw(s0, webbed, "Reach")).toBe(true);
    expect(blockProblem(s0, s0.objects[wall]!, s0.objects[sh]!)).toBeNull();
    expect(blockProblem(s0, s0.objects[webbed]!, s0.objects[sh]!)).toBeNull();
    expect(blockProblem(s0, s0.objects[plain]!, s0.objects[sh]!)).not.toBeNull();
    expect(blockProblem(s0, s0.objects[shadowWebbed]!, s0.objects[sh]!)).not.toBeNull();
  });

  it("World Queller: each player sacrifices a permanent of the chosen type; the bot picks the type that hurts opponents", () => {
    const { s: s0, ap } = setup([]);
    const queller = putOnBattlefield(s0, ap, worldQueller());
    const others = s0.turnOrder.filter((p) => p !== ap);
    const arts = others.map((p) => putOnBattlefield(s0, p, trinket(`Trinket ${p}`)));
    let s = goUntil(s0, (x) => x.activePlayer === ap && x.step === "upkeep" && x.turn > s0.turn && !!x.pending);
    expect(s.pending?.kind).toBe("chooseMay");
    // The bot would choose: artifacts cost only the opponents.
    const choice = botActions(s, ap);
    expect(choice[0]).toMatchObject({ type: "chooseMay", yes: true });
    s = act(s, choice[0]!);
    for (const a of botActions(s, ap)) s = act(s, a);
    s = settle(s);
    expect(arts.map((id) => zone(s, id))).toEqual(["graveyard", "graveyard", "graveyard"]);
    expect(zone(s, queller)).toBe("battlefield");
  });

  it("Maze's Mantle: hexproof only for a creature with toxic", () => {
    for (const toxic of [true, false]) {
      const { s: s0, ap, ids } = setup([mazesMantle()]);
      const host = putOnBattlefield(s0, ap, toxic ? card("Toxic Rat", "Creature — Rat", "{B}", { cmc: 1, power: "1", toughness: "1", keywords: ["Toxic"], oracleText: "Toxic 1" }) : bearC());
      const s = settle(castNow(s0, ap, ids[0]!, [tgt(host)]));
      expect(s.objects[ids[0]!]!.attachedTo).toBe(host);
      expect(kw(s, host, "Hexproof")).toBe(toxic);
      expect(pt(s, host)).toBe(toxic ? "3/3" : "4/4");
    }
  });

  it("Blood Lust: +4/-4 on toughness 5 or more, otherwise toughness 1, fixed as it resolves", () => {
    const { s: s0, ap, ids } = setup([bloodLust(), bloodLust()]);
    const big = putOnBattlefield(s0, ap, bigC("Huge Beast", 6, 6));
    const small = putOnBattlefield(s0, ap, bearC("Mid Bear", 3, 3));
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(big)]));
    expect(pt(s, big)).toBe("10/2");
    s = settle(castNow(s, ap, ids[1]!, [tgt(small)]));
    expect(pt(s, small)).toBe("7/1");
    // The -2 was fixed as it resolved (CR 608.2h): more toughness later doesn't change it.
    addEffect(s, ap, [small], [{ kind: "modifyPT", power: 0, toughness: 2 }]);
    expect(pt(s, small)).toBe("7/3");
  });

  it("Hemlock Vial: equipped creatures and Equipment you control gain deathtouch", () => {
    const { s: s0, ap, opp } = setup([]);
    const vial = putOnBattlefield(s0, ap, hemlockVial());
    const equipped = putOnBattlefield(s0, ap, bearC("Equipped Bear"));
    const bare = putOnBattlefield(s0, ap, bearC("Bare Bear"));
    const sword = putOnBattlefield(s0, ap, card("Test Sword", "Artifact — Equipment", "{1}", { cmc: 1, oracleText: "Equipped creature gets +1/+0.\nEquip {1}" }));
    s0.objects[sword]!.attachedTo = equipped;
    const theirs = putOnBattlefield(s0, opp, bearC("Their Bear"));
    const theirSword = putOnBattlefield(s0, opp, card("Their Sword", "Artifact — Equipment", "{1}", { cmc: 1, oracleText: "Equipped creature gets +1/+0.\nEquip {1}" }));
    s0.objects[theirSword]!.attachedTo = theirs;
    invalidateCharacteristics(s0);
    const s = settle(run(s0, planActivate(s0, ap, vial, 0, [])));
    expect(zone(s, vial)).toBe("graveyard");
    expect([kw(s, equipped, "Deathtouch"), kw(s, sword, "Deathtouch"), kw(s, bare, "Deathtouch"), kw(s, theirs, "Deathtouch"), kw(s, theirSword, "Deathtouch")]).toEqual([true, true, false, false, false]);
  });

  it("Force Away: bounces; with a power 4 creature you may loot", () => {
    for (const ferocious of [true, false]) {
      const { s: s0, ap, opp, ids } = setup([forceAway()]);
      if (ferocious) putOnBattlefield(s0, ap, bigC());
      const victim = putOnBattlefield(s0, opp, bearC("Victim Bear"));
      const hand = s0.players[ap]!.hand.length - 1;
      let s = settle(castNow(s0, ap, ids[0]!, [tgt(victim)]), (x) => x.pending?.kind === "chooseMay");
      expect(zone(s, victim)).toBe("hand");
      if (!ferocious) {
        expect(s.pending).toBeFalsy();
        expect(s.players[ap]!.hand.length).toBe(hand);
        continue;
      }
      expect(s.pending?.kind).toBe("chooseMay");
      s = answerMay(s, ap, true);
      expect(s.pending?.kind).toBe("discard");
      s = act(s, { type: "discard", player: ap, objectIds: [s.players[ap]!.hand[0]!] });
      s = settle(s);
      expect(s.players[ap]!.hand.length).toBe(hand);
      expect(s.players[ap]!.graveyard.length).toBeGreaterThan(0);
    }
  });

  it("Parting Thoughts: draw and lose life for each counter the creature had", () => {
    const { s: s0, ap, opp, ids } = setup([partingThoughts()]);
    const victim = putOnBattlefield(s0, opp, bearC("Countered Bear"));
    s0.objects[victim]!.counters = { "+1/+1": 2, charge: 1 };
    invalidateCharacteristics(s0);
    const hand = s0.players[ap]!.hand.length - 1;
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(victim)]));
    expect(zone(s, victim)).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand + 3);
    expect(life(s, ap)).toBe(37);
  });

  it("Favorable Destiny: shroud only while its controller controls another creature", () => {
    const { s: s0, ap, opp } = setup([]);
    const host = putOnBattlefield(s0, opp, vanilla("White Knight", "Creature — Knight", "{1}{W}", 2, 2, 2, { colors: ["W"] }));
    const aura = putOnBattlefield(s0, ap, favorableDestiny());
    s0.objects[aura]!.attachedTo = host;
    invalidateCharacteristics(s0);
    expect(pt(s0, host)).toBe("3/4");
    expect(kw(s0, host, "Shroud")).toBe(false);
    // Another creature of the enchanted creature's controller, not of the Aura's.
    putOnBattlefield(s0, ap, bearC("My Bear"));
    expect(kw(s0, host, "Shroud")).toBe(false);
    putOnBattlefield(s0, opp, bearC("Their Bear"));
    expect(kw(s0, host, "Shroud")).toBe(true);
  });

  it("Paralyze: its controller may pay {4} in their upkeep to untap it", () => {
    const { s: s0, ap, opp, ids } = setup([paralyze()]);
    const victim = putOnBattlefield(s0, opp, bearC("Paralyzed Bear"));
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(victim)]));
    expect(s.objects[victim]!.tapped).toBe(true);
    for (let i = 0; i < 4; i++) putOnBattlefield(s, opp, card(`Test Waste ${i}`, "Land", "", { oracleText: "{T}: Add {C}." }));
    // The opponent's untap step leaves it tapped; their upkeep trigger asks them to pay.
    s = goUntil(s, (x) => x.activePlayer === opp && x.step === "upkeep" && x.pending?.kind === "chooseMay");
    expect(s.pending?.player).toBe(opp);
    expect(s.objects[victim]!.tapped).toBe(true);
    s.players[opp]!.manaPool = { ...s.players[opp]!.manaPool, C: 4 };
    s = act(s, { type: "chooseMay", player: opp, yes: true });
    s = settle(s);
    expect(s.objects[victim]!.tapped).toBe(false);
  });

  it("Ragamuffin Raptor: returns a creature or Food card", () => {
    const { s: s0, ap, ids } = setup([ragamuffinRaptor()]);
    const food = toZone(s0, ap, card("Test Food", "Artifact — Food", "{1}", { cmc: 1, oracleText: "{2}, {T}, Sacrifice this artifact: You gain 3 life." }), "graveyard");
    const rock = toZone(s0, ap, trinket(), "graveyard");
    const spec = { kind: "card" as const, types: ["Creature" as const], notTypes: [], notColors: [], orSubtypes: ["Food"], owner: "you" as const, text: "x" };
    const legal = legalTargets(s0, spec, ap).map((t) => t.id);
    expect(legal).toContain(food);
    expect(legal).not.toContain(rock);
    let s = castNow(s0, ap, ids[0]!);
    s = triggerTargets(s, ap, [tgt(food)]);
    s = settle(s);
    expect(zone(s, food)).toBe("hand");
  });

  it("Wardscale Dragon: the player it attacks can't cast spells while it's attacking", () => {
    const { s: s0, ap, opp } = setup([]);
    onlyHand(s0, ap, []);
    const dragon = putOnBattlefield(s0, ap, wardscaleDragon());
    const third = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    const oppBolt = toZone(s0, opp, bolt(), "hand");
    const thirdBolt = toZone(s0, third, bolt(), "hand");
    s0.players[opp]!.manaPool = { ...s0.players[opp]!.manaPool, R: 1 };
    s0.players[third]!.manaPool = { ...s0.players[third]!.manaPool, R: 1 };
    let s = attackWith(s0, [dragon], opp);
    expect(s.objects[dragon]!.attacking).toBe(opp);
    expect(castProblem(s, opp, oppBolt, [ply(ap)]) ?? "").toMatch(/Wardscale Dragon/);
    expect(castProblem(s, third, thirdBolt, [ply(ap)]) ?? "").not.toMatch(/Wardscale Dragon/);
  });

  it("Rose Noble: draws for a Doctor spell or a creature spell with doctor's companion", () => {
    const doctor = () => card("Test Doctor", "Legendary Creature — Time Lord Doctor", "{1}{U}", { cmc: 2, power: "2", toughness: "2" });
    const companion = () => card("Test Companion", "Legendary Creature — Human", "{1}{U}", { cmc: 2, power: "1", toughness: "1", keywords: ["Doctor's companion"], oracleText: "Doctor's companion" });
    const { s: s0, ap, ids } = setup([doctor(), companion(), bearC()]);
    putOnBattlefield(s0, ap, roseNoble());
    const n0 = s0.players[ap]!.hand.length;
    let s = settle(castNow(s0, ap, ids[0]!));
    expect(s.players[ap]!.hand.length).toBe(n0);
    s = settle(castNow(s, ap, ids[1]!));
    expect(s.players[ap]!.hand.length).toBe(n0);
    s = settle(castNow(s, ap, ids[2]!));
    expect(s.players[ap]!.hand.length).toBe(n0 - 1);
  });

  /** Puts `defs` on top of `pid`'s library, the first on top. */
  const onTop = (s: GameState, pid: PlayerId, defs: CardDef[]) => [...defs].reverse().map((d) => toZone(s, pid, d, "library")).reverse();
  const enchantmentC = () => card("Test Glory", "Enchantment", "{1}{W}", { cmc: 2, colors: ["W"] });
  const landC = (name = "Test Waste") => card(name, "Land", "", { oracleText: "{T}: Add {C}." });
  const spacecraftC = () => card("Test Spacecraft", "Artifact — Spacecraft", "{3}", { cmc: 3, oracleText: "Station (Tap another creature you control: Put charge counters equal to its power on this Spacecraft. Station only as a sorcery. It's an artifact creature at 12+.)" });

  it("didn't put a card into your hand: Rosecot Knight, Blossom Prancer and Pulsar Squadron Ace", () => {
    const cases: [() => CardDef, Partial<Record<"W" | "G" | "C", number>>, () => CardDef, (s: GameState, me: PlayerId, self: string) => unknown, unknown, unknown][] = [
      [rosecotKnight, { W: 1, C: 4 }, trinket, (s, _me, self) => counters(s, self), 0, 1],
      [blossomPrancer, { G: 2, C: 3 }, enchantmentC, (s, me) => life(s, me), 40, 44],
      [pulsarSquadronAce, { W: 1, C: 1 }, spacecraftC, (s, _me, self) => counters(s, self), 0, 1],
    ];
    for (const [def, pool, wanted, measure, took, skipped] of cases)
      for (const take of [true, false]) {
        const { s: s0, ap, ids } = setup([def()]);
        poolOnly(s0, ap, pool);
        const top = onTop(s0, ap, [bearC("Dull Bear"), wanted(), landC()]);
        let s = settle(castNow(s0, ap, ids[0]!), at("searchLibrary", ap));
        expect(s.pending, def().name).toMatchObject({ kind: "searchLibrary", cards: def === blossomPrancer ? [top[0], top[1]] : [top[1]] });
        s = settle(act(s, { type: "searchLibrary", player: ap, found: take ? [top[1]!] : [] }));
        expect(zone(s, top[1]!)).toBe(take ? "hand" : "library");
        expect(measure(s, ap, ids[0]!), `${def().name} ${take}`).toBe(take ? took : skipped);
      }
  });

  it("Inscribed Tablet: a land from the top five, or a card drawn when there is none", () => {
    for (const land of [true, false]) {
      const { s: s0, ap } = setup([]);
      onlyHand(s0, ap, []);
      const tablet = putOnBattlefield(s0, ap, inscribedTablet());
      onTop(s0, ap, land ? [bearC("Dull Bear"), landC("Found Waste"), bearC("Dull Bear 2"), bearC("Dull Bear 3"), bearC("Dull Bear 4")] : [1, 2, 3, 4, 5, 6].map((i) => bearC(`Dull Bear ${i}`)));
      const s = settle(run(s0, planActivate(s0, ap, tablet, 0, [])));
      expect(zone(s, tablet)).toBe("graveyard");
      expect(s.players[ap]!.hand.map((id) => nameOf(s, id))).toEqual(land ? ["Found Waste"] : ["Dull Bear 6"]);
    }
  });

  it("Okiba Salvage: returns a creature or Vehicle card, with two counters if you control an artifact and an enchantment", () => {
    for (const both of [true, false]) {
      const { s: s0, ap, ids } = setup([okibaSalvage()]);
      const vehicle = toZone(s0, ap, card("Test Wagon", "Artifact — Vehicle", "{2}", { cmc: 2, power: "3", toughness: "3", oracleText: "Crew 1" }), "graveyard");
      putOnBattlefield(s0, ap, enchantmentC());
      if (both) putOnBattlefield(s0, ap, trinket());
      const s = settle(castNow(s0, ap, ids[0]!, [tgt(vehicle)]));
      expect(zone(s, vehicle)).toBe("battlefield");
      // The returned Vehicle is an artifact itself (rulings: it counts).
      expect(counters(s, vehicle)).toBe(2);
      if (!both) {
        const t0 = setup([okibaSalvage()]);
        const bear = toZone(t0.s, t0.ap, bearC("Dead Bear"), "graveyard");
        putOnBattlefield(t0.s, t0.ap, enchantmentC());
        const t = settle(castNow(t0.s, t0.ap, t0.ids[0]!, [tgt(bear)]));
        expect(zone(t, bear)).toBe("battlefield");
        expect(counters(t, bear)).toBe(0);
      }
    }
  });

  it("Mirkwood Nurturer: a counter only if it returned a permanent", () => {
    for (const bounce of [true, false]) {
      const { s: s0, ap, ids } = setup([mirkwoodNurturer()]);
      const rock = putOnBattlefield(s0, ap, trinket());
      let s = castNow(s0, ap, ids[0]!);
      s = triggerTargets(s, ap, bounce ? [tgt(rock)] : [{ kind: "none" } as TargetChoice]);
      s = settle(s);
      expect(zone(s, rock)).toBe(bounce ? "hand" : "battlefield");
      expect(counters(s, ids[0]!)).toBe(bounce ? 1 : 0);
    }
  });

  it("Mongrel Pack: four Dogs only when it dies during combat", () => {
    const { s: s0, ap, opp } = setup([]);
    const pack = putOnBattlefield(s0, ap, mongrelPack());
    const other = putOnBattlefield(s0, ap, mongrelPack());
    putOnBattlefield(s0, opp, bigC("Blocker Beast"));
    // Outside combat: no Dogs.
    let s = run(s0, planCast(s0, ap, toZone(s0, ap, bolt(), "hand"), [tgt(other)]));
    s = settle(s);
    expect(zone(s, other)).toBe("graveyard");
    expect(tokensNamed(s, ap, "Dog")).toHaveLength(0);
    s = attackWith(s, [pack], opp);
    s = toBlocks(s);
    const blocker = s.battlefield.find((id) => nameOf(s, id) === "Blocker Beast")!;
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker, attacker: pack }] } as Action);
    s = goUntil(s, (x) => x.step === "main2" && !x.stack.length && !x.triggerQueue.length && !x.pending);
    expect(zone(s, pack)).toBe("graveyard");
    expect(tokensNamed(s, ap, "Dog")).toHaveLength(4);
  });

  it("Esquire of the King: costs {2} less with a legendary creature", () => {
    for (const legend of [true, false]) {
      const { s: s0, ap } = setup([]);
      const esquire = putOnBattlefield(s0, ap, esquireOfTheKing());
      const bear = putOnBattlefield(s0, ap, bearC());
      if (legend) putOnBattlefield(s0, ap, vanilla("Test Lord", "Legendary Creature — Human", "{2}{W}", 3, 2, 2, { colors: ["W"] }));
      poolOnly(s0, ap, { W: 3 });
      const plan = planActivate(s0, ap, esquire, 0, []);
      if (!legend) {
        expect(plan).toBeNull();
        continue;
      }
      const s = settle(run(s0, plan));
      expect(pt(s, bear)).toBe("3/3");
    }
  });

  it("Synchronized Eviction: costs {2} less with two creatures that share a type; tucks second from the top", () => {
    for (const share of [true, false]) {
      const { s: s0, ap, opp, ids } = setup([synchronizedEviction()]);
      putOnBattlefield(s0, ap, bearC("Bear One"));
      putOnBattlefield(s0, ap, share ? bearC("Bear Two") : golem());
      const victim = putOnBattlefield(s0, opp, bigC("Victim Beast"));
      poolOnly(s0, ap, { U: 1, C: 2 });
      const plan = planCast(s0, ap, ids[0]!, [tgt(victim)]);
      if (!share) {
        expect(plan).toBeNull();
        continue;
      }
      const s = settle(run(s0, plan));
      expect(zone(s, victim)).toBe("library");
      expect(s.players[opp]!.library.indexOf(victim)).toBe(1);
    }
  });

  it("Snow Devil: flying, and first strike while blocking if you control a snow land", () => {
    const { s: s0, ap, opp } = setup([]);
    const host = putOnBattlefield(s0, opp, bearC("Devil Bear"));
    const aura = putOnBattlefield(s0, opp, snowDevil());
    s0.objects[aura]!.attachedTo = host;
    putOnBattlefield(s0, opp, card("Snow-Covered Test", "Basic Snow Land — Island", "", { oracleText: "({T}: Add {U}.)" }));
    invalidateCharacteristics(s0);
    expect(kw(s0, host, "Flying")).toBe(true);
    expect(kw(s0, host, "First strike")).toBe(false);
    const attacker = putOnBattlefield(s0, ap, bearC("Attacking Bear"));
    let s = attackWith(s0, [attacker], opp);
    s = toBlocks(s);
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: host, attacker }] } as Action);
    expect(kw(s, host, "First strike")).toBe(true);
    s = goUntil(s, (x) => x.step === "main2");
    expect(zone(s, attacker)).toBe("graveyard");
    expect(zone(s, host)).toBe("battlefield");
  });

  it("Sugar Coat: the creature becomes a colorless noncreature Food artifact with only the Food ability", () => {
    const { s: s0, ap, opp } = setup([]);
    const host = putOnBattlefield(s0, opp, vanilla("Flying Bear", "Creature — Bear", "{1}{G}", 2, 2, 2, { colors: ["G"], keywords: ["Flying"], oracleText: "Flying" }));
    const aura = putOnBattlefield(s0, ap, sugarCoat());
    s0.objects[aura]!.attachedTo = host;
    invalidateCharacteristics(s0);
    const c = characteristics(s0, s0.objects[host]!);
    expect([c.types, c.subtypes, c.colors]).toEqual([["Artifact"], ["Food"], []]);
    expect(kw(s0, host, "Flying")).toBe(false);
    s0.players[opp]!.manaPool = { ...s0.players[opp]!.manaPool, C: 2 };
    // The opponent gets priority once the players before them pass.
    let s = s0;
    while (waitingOn(s) !== opp) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(run(s, planActivate(s, opp, host, 0, [])));
    expect(zone(s, host)).toBe("graveyard");
    expect(life(s, opp)).toBe(43);
  });

  it("costs less to activate if: Starport Security, Sewer Crocodile, Razorlash Transmogrant from the graveyard", () => {
    for (const met of [true, false]) {
      const { s: s0, ap, opp } = setup([]);
      const guard = putOnBattlefield(s0, ap, starportSecurity());
      const croc = putOnBattlefield(s0, ap, sewerCrocodile());
      const zombie = toZone(s0, ap, razorlashTransmogrant(), "graveyard");
      const victim = putOnBattlefield(s0, opp, bearC("Victim Bear"));
      if (met) {
        s0.objects[croc]!.counters = { "+1/+1": 1 };
        for (const mv of [1, 2, 3, 4, 5]) toZone(s0, ap, card(`Test MV ${mv}`, "Sorcery", `{${mv}}`, { cmc: mv }), "graveyard");
        for (let i = 0; i < 4; i++) putOnBattlefield(s0, opp, nonbasic());
      }
      poolOnly(s0, ap, { W: 1, C: 1 });
      expect(!!planActivate(s0, ap, guard, 0, [tgt(victim)]), "Starport Security").toBe(met);
      poolOnly(s0, ap, { U: 1 });
      expect(!!planActivate(s0, ap, croc, 0, []), "Sewer Crocodile").toBe(met);
      poolOnly(s0, ap, { B: 2 });
      const plan = planActivate(s0, ap, zombie, 0, []);
      expect(!!plan, "Razorlash Transmogrant").toBe(met);
      if (plan) {
        const s = settle(run(s0, plan));
        expect(zone(s, zombie)).toBe("battlefield");
        expect(counters(s, zombie)).toBe(1);
      }
    }
  });
});
