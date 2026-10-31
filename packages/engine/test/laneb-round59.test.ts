// Lane B, round 59: unsupported cards no earlier round wrote down, EDHREC rank about 19,800 to 15,000, least played first
// (`npm run popular -- --least`), and two cards the round's templates also finished (Cloven Casting, Academic Probation).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, scry, setup } from "./helpers";
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
const mistcaller = () => card("Mistcaller", "Creature — Merfolk Wizard", "{U}", {"cmc":1,"colors":["U"],"power":"1","toughness":"1","oracleText":"Sacrifice this creature: Until end of turn, if a nontoken creature would enter and it wasn't cast, exile it instead."});
const absorbingManAndTitania = () => card("Absorbing Man and Titania", "Legendary Creature — Human Villain", "{3}{R}{G}", {"cmc":5,"colors":["G","R"],"power":"4","toughness":"5","keywords":["Double"],"oracleText":"Double all damage that creature sources you control would deal."});
const castThroughTime = () => card("Cast Through Time", "Enchantment", "{4}{U}{U}{U}", {"cmc":7,"colors":["U"],"oracleText":"Instant and sorcery spells you control have rebound. (Exile the spell as it resolves if you cast it from your hand. At the beginning of your next upkeep, you may cast that card from exile without paying its mana cost.)"});
const maestrosConfluence = () => card("Maestros Confluence", "Sorcery", "{3}{U}{B}{R}", {"cmc":6,"colors":["B","R","U"],"keywords":["Goad"],"oracleText":"Choose three. You may choose the same mode more than once.\n• Return target monocolored instant or sorcery card from your graveyard to your hand.\n• Target creature gets -3/-3 until end of turn.\n• Goad each creature target player controls. (Until your next turn, those creatures attack each combat if able and attack a player other than you if able.)"});
const bruseTarlRovingRancher = () => card("Bruse Tarl, Roving Rancher", "Legendary Creature — Human Warrior", "{2}{R}{W}", {"cmc":4,"colors":["R","W"],"power":"4","toughness":"3","oracleText":"Oxen you control have double strike.\nWhenever Bruse Tarl enters or attacks, exile the top card of your library. If it's a land card, create a 2/2 white Ox creature token. Otherwise, you may cast it until the end of your next turn."});
const deathbonnet = () => scry("transform", [{ name: "Deathbonnet Sprout", mana_cost: "{G}", type_line: "Creature — Fungus", power: "1", toughness: "1", oracle_text: "At the beginning of your upkeep, mill a card. Then if there are three or more creature cards in your graveyard, transform this creature. (To mill a card, put the top card of your library into your graveyard.)" }, { name: "Deathbonnet Hulk", type_line: "Creature — Fungus Horror", color_indicator: ["G"], power: "3", toughness: "3", oracle_text: "At the beginning of your upkeep, you may exile a card from a graveyard. If a creature card was exiled this way, put a +1/+1 counter on this creature." }], { keywords: ["Mill", "Transform"] });
const pathOfMettle = () => scry("transform", [{ name: "Path of Mettle", mana_cost: "{R}{W}", type_line: "Legendary Enchantment", oracle_text: "When Path of Mettle enters, it deals 1 damage to each creature that doesn't have first strike, double strike, vigilance, or haste.\nWhenever you attack with at least two creatures that have first strike, double strike, vigilance, and/or haste, transform Path of Mettle." }, { name: "Metzali, Tower of Triumph", type_line: "Legendary Land", oracle_text: "(Transforms from Path of Mettle.)\n{T}: Add one mana of any color.\n{1}{R}, {T}: Metzali deals 2 damage to each opponent.\n{2}{W}, {T}: Choose a creature at random that attacked this turn. Destroy that creature." }], { keywords: ["Transform"] });
const frenziedFugue = () => card("Frenzied Fugue", "Enchantment — Aura", "{3}{R}", {"cmc":4,"colors":["R"],"keywords":["Enchant"],"oracleText":"Enchant permanent\nWhen this Aura enters and at the beginning of your upkeep, gain control of enchanted permanent until end of turn. Untap that permanent. It gains haste until end of turn."});
const manaChargedDragon = () => card("Mana-Charged Dragon", "Creature — Dragon", "{4}{R}{R}", {"cmc":6,"colors":["R"],"power":"5","toughness":"5","keywords":["Flying","Trample","Join forces"],"oracleText":"Flying, trample\nJoin forces — Whenever this creature attacks or blocks, each player starting with you may pay any amount of mana. This creature gets +X/+0 until end of turn, where X is the total amount of mana paid this way."});
const invasionOfTheGiants = () => card("Invasion of the Giants", "Enchantment — Saga", "{U}{R}", {"cmc":2,"colors":["R","U"],"keywords":["Scry"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — Scry 2.\nII — Draw a card. Then you may reveal a Giant card from your hand. When you do, this Saga deals 2 damage to target opponent or planeswalker.\nIII — The next Giant spell you cast this turn costs {2} less to cast."});
const battleOfFrostAndFire = () => card("Battle of Frost and Fire", "Enchantment — Saga", "{3}{U}{R}", {"cmc":5,"colors":["R","U"],"keywords":["Scry"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — This Saga deals 4 damage to each non-Giant creature and each planeswalker.\nII — Scry 3.\nIII — Whenever you cast a spell with mana value 5 or greater this turn, draw two cards, then discard a card."});
const senseiGoldenTail = () => card("Sensei Golden-Tail", "Legendary Creature — Fox Samurai", "{1}{W}", {"cmc":2,"colors":["W"],"power":"2","toughness":"1","keywords":["Bushido"],"oracleText":"Bushido 1 (Whenever this creature blocks or becomes blocked, it gets +1/+1 until end of turn.)\n{1}{W}, {T}: Put a training counter on target creature. That creature gains bushido 1 and becomes a Samurai in addition to its other creature types. Activate only as a sorcery."});
const xathridGorgon = () => card("Xathrid Gorgon", "Creature — Gorgon", "{5}{B}", {"cmc":6,"colors":["B"],"power":"3","toughness":"6","keywords":["Deathtouch"],"oracleText":"Deathtouch (Any amount of damage this deals to a creature is enough to destroy it.)\n{2}{B}, {T}: Put a petrification counter on target creature. It gains defender and becomes a colorless artifact in addition to its other types. Its activated abilities can't be activated. (A creature with defender can't attack.)"});
const fangDruidSummoner = () => card("Fang-Druid Summoner", "Creature — Ape Druid", "{3}{G}", {"cmc":4,"colors":["G"],"power":"2","toughness":"4","keywords":["Reach"],"oracleText":"Reach\nWhen this creature enters, you may search your library and/or graveyard for a creature card with no abilities, reveal it, and put it into your hand. If you search your library this way, shuffle."});
const isperiaTheInscrutable = () => card("Isperia the Inscrutable", "Legendary Creature — Sphinx", "{1}{W}{W}{U}{U}", {"cmc":5,"colors":["U","W"],"power":"3","toughness":"6","keywords":["Flying"],"oracleText":"Flying\nWhenever Isperia deals combat damage to a player, choose a card name. That player reveals their hand. If a card with the chosen name is revealed this way, search your library for a creature card with flying, reveal it, put it into your hand, then shuffle."});
const clovenCasting = () => card("Cloven Casting", "Enchantment", "{5}{U}{R}", {"cmc":7,"colors":["R","U"],"oracleText":"Whenever you cast a multicolored instant or sorcery spell, you may pay {1}. If you do, copy that spell. You may choose new targets for the copy."});
const academicProbation = () => card("Academic Probation", "Sorcery — Lesson", "{1}{W}", {"cmc":2,"colors":["W"],"oracleText":"Choose one —\n• Choose a nonland card name. Opponents can't cast spells with the chosen name until your next turn.\n• Choose target nonland permanent. Until your next turn, it can't attack or block, and its activated abilities can't be activated."});
const dovinBaan = () => card("Dovin Baan", "Legendary Planeswalker — Dovin", "{2}{W}{U}", {"cmc":4,"colors":["U","W"],"loyalty":"3","oracleText":"+1: Until your next turn, up to one target creature gets -3/-0 and its activated abilities can't be activated.\n−1: You gain 2 life and draw a card.\n−7: You get an emblem with \"Your opponents can't untap more than two permanents during their untap steps.\""});

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

describe("Lane B round 59", () => {
  it("are fully supported", () => {
    supported(mistcaller(), absorbingManAndTitania(), castThroughTime(), maestrosConfluence(), bruseTarlRovingRancher(), deathbonnet(), pathOfMettle(), frenziedFugue(), manaChargedDragon(), invasionOfTheGiants(), battleOfFrostAndFire(), senseiGoldenTail(), xathridGorgon(), fangDruidSummoner(), isperiaTheInscrutable(), clovenCasting(), academicProbation());
    // Dovin Baan's +1 now compiles with both halves until your next turn; its emblem keeps it out.
    expect(isFullySupported(dovinBaan())).toBe(false);
  });

  it("Mistcaller: this turn a creature put onto the battlefield without being cast is exiled; a cast one enters; next turn it's over", () => {
    const { s: s0, ap, ids } = setup([reanimate(), bearC("Cast Bear"), reanimate()]);
    const mc = putOnBattlefield(s0, ap, mistcaller());
    const dead = toZone(s0, ap, bearC("Dead Bear"), "graveyard");
    let s = settle(activateNow(s0, ap, mc, 0));
    expect(zone(s, mc)).toBe("graveyard");
    s = settle(castNow(s, ap, ids[0]!, [tgt(dead)]));
    expect(zone(s, dead)).toBe("exile");
    s = settle(castNow(s, ap, ids[1]!));
    expect(zone(s, ids[1]!)).toBe("battlefield");
    // The next turn, a creature put onto the battlefield stays.
    const dead2 = toZone(s, ap, bearC("Other Dead Bear"), "graveyard");
    s = goUntil(s, (x) => x.activePlayer === ap && x.step === "main1" && x.turn > s0.turn);
    s = settle(castNow(s, ap, ids[2]!, [tgt(dead2)]));
    expect(zone(s, dead2)).toBe("battlefield");
  });

  it("Absorbing Man and Titania: a creature you control deals double damage; a spell's damage isn't doubled", () => {
    const { s: s0, ap, opp, ids } = setup([bolt()]);
    putOnBattlefield(s0, ap, absorbingManAndTitania());
    const b = putOnBattlefield(s0, ap, bearC());
    let s = settle(castNow(s0, ap, ids[0]!, [ply(opp)]));
    expect(life(s, opp)).toBe(life(s0, opp) - 3);
    const before = life(s, opp);
    s = attackWith(s, [b], opp);
    s = passUntil(s, "main2", ap);
    expect(life(s, opp)).toBe(before - 4);
  });

  it("Cast Through Time: an instant cast from your hand is exiled as it resolves and can be cast again at your next upkeep", () => {
    const { s: s0, ap, ids } = setup([opt(), opt("Other Opt")]);
    const ctt = putOnBattlefield(s0, ap, castThroughTime());
    let s = settle(castNow(s0, ap, ids[0]!));
    expect(zone(s, ids[0]!)).toBe("exile");
    // Without it, the instant goes to the graveyard.
    s.battlefield.splice(s.battlefield.indexOf(ctt), 1);
    s.objects[ctt]!.zone = "exile";
    s.players[ap]!.exile.push(ctt);
    invalidateCharacteristics(s);
    s = settle(castNow(s, ap, ids[1]!));
    expect(zone(s, ids[1]!)).toBe("graveyard");
    // At the next upkeep the rebound trigger offers the first one again.
    s = toUpkeep(s, ap);
    s = settle(s, (x) => x.pending?.player === ap);
    expect(s.pending?.player).toBe(ap);
    const hand = s.players[ap]!.hand.length;
    s = settle(s);
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBeGreaterThan(hand);
  });

  it("Maestros Confluence: a monocolored instant or sorcery card back, -3/-3, and goad; a multicolored card can't be targeted", () => {
    const { s: s0, ap, opp, ids } = setup([maestrosConfluence()]);
    const mono = toZone(s0, ap, opt(), "graveyard");
    const multi = toZone(s0, ap, boros(), "graveyard");
    const theirs = putOnBattlefield(s0, opp, bearC("Their Bear", 4, 4));
    const goaded = putOnBattlefield(s0, opp, bearC("Their Other Bear"));
    expect(planCast(s0, ap, ids[0]!, [tgt(multi), tgt(theirs), ply(opp)], [0, 1, 2])).toBeNull();
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(mono), tgt(theirs), ply(opp)], [0, 1, 2])));
    expect(zone(s, mono)).toBe("hand");
    expect(pt(s, theirs)).toBe("1/1");
    expect(s.effects.some((e) => e.affected?.includes(goaded) && e.mods.some((m) => m.kind === "goad"))).toBe(true);
  });

  it("Bruse Tarl: attacking exiles the top card; a land makes a 2/2 Ox with double strike, a nonland card can be cast", () => {
    const { s: s0, ap, opp } = setup([]);
    const bruse = putOnBattlefield(s0, ap, bruseTarlRovingRancher());
    toZone(s0, ap, testLand(), "library");
    let s = attackWith(s0, [bruse], opp);
    s = settle(s);
    const oxen = tokensNamed(s, ap, "Ox");
    expect(oxen.length).toBe(1);
    expect(pt(s, oxen[0]!)).toBe("2/2");
    expect(kw(s, oxen[0]!)).toContain("Double strike");
    // A nonland card: exiled, and castable until the end of your next turn.
    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    const bruse1 = putOnBattlefield(s1, ap1, bruseTarlRovingRancher());
    const tr = toZone(s1, ap1, trinket(), "library");
    let t = settle(attackWith(s1, [bruse1], opp1));
    expect(zone(t, tr)).toBe("exile");
    expect(tokensNamed(t, ap1, "Ox").length).toBe(0);
    t = passUntil(t, "main2", ap1);
    t = settle(castNow(t, ap1, tr));
    expect(zone(t, tr)).toBe("battlefield");
  });

  it("Deathbonnet Hulk: at your upkeep you may exile a card from a graveyard; a creature card gives it a +1/+1 counter", () => {
    const { s: s0, ap, opp } = setup([]);
    const hulk = putOnBattlefield(s0, ap, deathbonnet());
    s0.objects[hulk]!.face = 1;
    invalidateCharacteristics(s0);
    const theirLand = toZone(s0, opp, testLand(), "graveyard");
    const theirBear = toZone(s0, opp, bearC("Their Dead Bear"), "graveyard");
    let s = toUpkeep(s0, ap);
    s = settle(s, at("searchLibrary", ap));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", min: 0, max: 1, anyGraveyard: true });
    const p = s.pending as Extract<GameState["pending"], { kind: "searchLibrary" }>;
    expect(p.cards).toEqual(expect.arrayContaining([theirLand, theirBear]));
    // A land card: no counter.
    const t = settle(act(structuredClone(s), { type: "searchLibrary", player: ap, found: [theirLand] }));
    expect(zone(t, theirLand)).toBe("exile");
    expect(counters(t, hulk)).toBe(0);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [theirBear] }));
    expect(zone(s, theirBear)).toBe("exile");
    expect(counters(s, hulk)).toBe(1);
  });

  it("Path of Mettle: 1 damage to each creature without the four keywords; two such attackers transform it; Metzali destroys a random attacker", () => {
    const { s: s0, ap, opp, ids } = setup([pathOfMettle()]);
    const small = putOnBattlefield(s0, opp, bearC("Their Small Bear", 1, 1));
    const hasty = putOnBattlefield(s0, opp, vanilla("Their Hasty", "Creature — Goblin", "{R}", 1, 1, 1, { keywords: ["Haste"], oracleText: "Haste" }));
    const k1 = putOnBattlefield(s0, ap, knight("Knight One"));
    const k2 = putOnBattlefield(s0, ap, knight("Knight Two", "First strike"));
    const stay = putOnBattlefield(s0, ap, bearC("Home Bear", 3, 3));
    let s = settle(castNow(s0, ap, ids[0]!));
    expect(zone(s, small)).toBe("graveyard");
    expect(zone(s, hasty)).toBe("battlefield");
    expect(s.objects[k1]!.damage ?? 0).toBe(0);
    expect(s.objects[stay]!.damage).toBe(1);
    s = settle(attackWith(s, [k1, k2], opp));
    expect(s.objects[ids[0]!]!.face).toBe(1);
    expect(characteristics(s, s.objects[ids[0]!]!).types).toEqual(["Land"]);
    s = passUntil(s, "main2", ap);
    s = settle(activateNow(s, ap, ids[0]!, 1));
    const died = [k1, k2].filter((id) => zone(s, id) === "graveyard");
    expect(died.length).toBe(1);
    expect(zone(s, stay)).toBe("battlefield");
  });

  it("Path of Mettle: one such attacker doesn't transform it", () => {
    const { s: s0, ap, opp, ids } = setup([pathOfMettle()]);
    const k1 = putOnBattlefield(s0, ap, knight("Knight One"));
    const b = putOnBattlefield(s0, ap, bearC("Big Bear", 3, 3));
    let s = settle(castNow(s0, ap, ids[0]!));
    s = settle(attackWith(s, [k1, b], opp));
    expect(s.objects[ids[0]!]!.face ?? 0).toBe(0);
  });

  it("Frenzied Fugue: gain control of the enchanted permanent until end of turn, untapped, with haste", () => {
    const { s: s0, ap, opp, ids } = setup([frenziedFugue()]);
    const theirs = putOnBattlefield(s0, opp, bearC("Their Bear"));
    s0.objects[theirs]!.tapped = true;
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(theirs)]));
    expect(controllerOf(s, s.objects[theirs]!)).toBe(ap);
    expect(s.objects[theirs]!.tapped).toBe(false);
    expect(kw(s, theirs)).toContain("Haste");
    s = goUntil(s, (x) => x.activePlayer !== ap);
    expect(controllerOf(s, s.objects[theirs]!)).toBe(opp);
    // At your upkeep again.
    s = toUpkeep(s, ap);
    s = settle(s);
    expect(controllerOf(s, s.objects[theirs]!)).toBe(ap);
  });

  it("Mana-Charged Dragon: join forces as it attacks; it gets +X/+0 for the total paid", () => {
    const { s: s0, ap, opp } = setup([]);
    const dragon = putOnBattlefield(s0, ap, manaChargedDragon());
    let s = attackWith(s0, [dragon], opp);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "payX", player: ap });
    s = act(s, { type: "chooseOption", player: ap, choice: "3" });
    s = settle(s);
    expect(pt(s, dragon)).toBe("8/5");
  });

  it("Invasion of the Giants: II draws, then reveals a Giant to deal 2 damage to an opponent; III makes the next Giant spell cost {2} less", () => {
    const { s: s0, ap, opp } = setup([]);
    const inv = putOnBattlefield(s0, ap, invasionOfTheGiants());
    s0.objects[inv]!.counters = { lore: 1 };
    const g = toZone(s0, ap, giant(), "hand");
    onlyHand(s0, ap, [g]);
    let s = goUntil(s0, (x) => x.activePlayer === ap && x.turn > s0.turn && x.pending?.player === ap && x.pending.kind === "searchLibrary");
    // The Giant, the draw step's card and chapter II's.
    expect(s.players[ap]!.hand.length).toBe(3);
    s = act(s, { type: "searchLibrary", player: ap, found: [g] });
    const before = life(s, opp);
    s = triggerTargets(s, ap, [ply(opp)]);
    s = settle(s);
    expect(life(s, opp)).toBe(before - 2);
    // III: with three mana, a five-mana Giant is castable once.
    const { s: s1, ap: ap1 } = setup([]);
    const inv1 = putOnBattlefield(s1, ap1, invasionOfTheGiants());
    s1.objects[inv1]!.counters = { lore: 2 };
    const g1 = toZone(s1, ap1, giant("Giant One"), "hand");
    const g2 = toZone(s1, ap1, giant("Giant Two"), "hand");
    onlyHand(s1, ap1, [g1, g2]);
    let t = goUntil(s1, (x) => x.activePlayer === ap1 && x.turn > s1.turn && x.step === "main1" && !x.stack.length && !x.triggerQueue.length && !x.pending);
    expect(zone(t, inv1)).toBe("graveyard");
    poolOnly(t, ap1, { R: 3 });
    expect(planCast(t, ap1, g1)).not.toBeNull();
    t = settle(castNow(t, ap1, g1));
    expect(zone(t, g1)).toBe("battlefield");
    t.players[ap1]!.manaPool = { ...t.players[ap1]!.manaPool, R: 3 };
    expect(planCast(t, ap1, g2)).toBeNull();
  });

  it("Battle of Frost and Fire: I deals 4 damage to each non-Giant creature; III draws two and discards one for a big spell", () => {
    const { s: s0, ap, opp, ids } = setup([battleOfFrostAndFire()]);
    const b = putOnBattlefield(s0, opp, bearC("Their Bear", 4, 4));
    const g = putOnBattlefield(s0, opp, giant("Their Giant"));
    let s = settle(castNow(s0, ap, ids[0]!));
    expect(zone(s, b)).toBe("graveyard");
    expect(zone(s, g)).toBe("battlefield");
    const { s: s1, ap: ap1 } = setup([]);
    const bat = putOnBattlefield(s1, ap1, battleOfFrostAndFire());
    s1.objects[bat]!.counters = { lore: 2 };
    const big = toZone(s1, ap1, giant("Big Giant"), "hand");
    const small = toZone(s1, ap1, bearC("Small Bear"), "hand");
    onlyHand(s1, ap1, [big, small]);
    let t = goUntil(s1, (x) => x.activePlayer === ap1 && x.turn > s1.turn && x.step === "main1" && !x.stack.length && !x.pending);
    t = settle(castNow(t, ap1, small));
    const hand = t.players[ap1]!.hand.length;
    t = settle(castNow(t, ap1, big));
    // Cast the Giant (hand -1), draw two, discard one.
    expect(t.players[ap1]!.hand.length).toBe(hand - 1 + 1);
  });

  it("Sensei Golden-Tail: a training counter, bushido 1 and Samurai for good", () => {
    const { s: s0, ap } = setup([]);
    const sensei = putOnBattlefield(s0, ap, senseiGoldenTail());
    const b = putOnBattlefield(s0, ap, bearC());
    let s = settle(activateNow(s0, ap, sensei, 0, [tgt(b)]));
    expect(counters(s, b, "training")).toBe(1);
    expect(bushido(s, b)).toBe(true);
    expect(characteristics(s, s.objects[b]!).subtypes).toEqual(expect.arrayContaining(["Bear", "Samurai"]));
    s = goUntil(s, (x) => x.activePlayer !== ap && x.step === "main1");
    expect(characteristics(s, s.objects[b]!).subtypes).toContain("Samurai");
    expect(bushido(s, b)).toBe(true);
  });

  it("Xathrid Gorgon: a petrification counter; the creature is a colorless artifact with defender whose abilities can't be activated, for good", () => {
    const { s: s0, ap, opp } = setup([]);
    const gorgon = putOnBattlefield(s0, ap, xathridGorgon());
    const p = putOnBattlefield(s0, opp, pinger("Their Pinger"));
    expect(locked(s0, p)).toBe(false);
    let s = settle(activateNow(s0, ap, gorgon, 0, [tgt(p)]));
    expect(counters(s, p, "petrification")).toBe(1);
    const c = characteristics(s, s.objects[p]!);
    expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(c.colors).toEqual([]);
    expect(c.keywords).toContain("Defender");
    expect(locked(s, p)).toBe(true);
    s = goUntil(s, (x) => x.activePlayer === opp && x.step === "main1");
    expect(locked(s, p)).toBe(true);
    expect(characteristics(s, s.objects[p]!).types).toContain("Artifact");
  });

  it("Fang-Druid Summoner: a creature card with no abilities from your library or graveyard", () => {
    const { s: s0, ap, ids } = setup([fangDruidSummoner()]);
    const dead = toZone(s0, ap, bearC("Dead Plain Bear"), "graveyard");
    const bird = toZone(s0, ap, flyer(), "library");
    const birdYard = toZone(s0, ap, flyer("Dead Bird"), "graveyard");
    let s = settle(castNow(s0, ap, ids[0]!), (x) => x.pending?.player === ap && x.pending.kind === "searchLibrary");
    if (s.pending?.kind === "chooseMay") s = settle(answerMay(s, ap, true), (x) => x.pending?.kind === "searchLibrary");
    expect(s.pending?.kind).toBe("searchLibrary");
    const p = s.pending as Extract<GameState["pending"], { kind: "searchLibrary" }>;
    expect(p.cards).toContain(dead);
    expect(p.cards).not.toContain(bird);
    expect(p.cards).not.toContain(birdYard);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [dead] }));
    expect(zone(s, dead)).toBe("hand");
  });

  it("Isperia the Inscrutable: name a card in their hand and you search for a creature card with flying", () => {
    const { s: s0, ap, opp } = setup([]);
    const isp = putOnBattlefield(s0, ap, isperiaTheInscrutable());
    const bird = toZone(s0, ap, flyer(), "library");
    const theirCard = toZone(s0, opp, bearC("Their Hand Bear"), "hand");
    let s = goUntil(attackWith(s0, [isp], opp), at("chooseOption", ap));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "cardName" });
    // A name not in their hand: no search.
    const other = (s.pending as Extract<GameState["pending"], { kind: "chooseOption" }>).options.find((o) => o !== nameOf(s, theirCard) && !s.players[opp]!.hand.some((id) => nameOf(s, id) === o))!;
    const miss = settle(act(structuredClone(s), { type: "chooseOption", player: ap, choice: other }), at("searchLibrary", ap));
    expect(miss.pending?.kind).not.toBe("searchLibrary");
    s = settle(act(s, { type: "chooseOption", player: ap, choice: nameOf(s, theirCard) }), at("searchLibrary", ap));
    expect(s.pending?.kind).toBe("searchLibrary");
    const p = s.pending as Extract<GameState["pending"], { kind: "searchLibrary" }>;
    expect(p.cards).toEqual([bird]);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [bird] }));
    expect(zone(s, bird)).toBe("hand");
  });

  it("Cloven Casting: pay {1} to copy a multicolored instant; a monocolored one doesn't trigger", () => {
    const { s: s0, ap, opp, ids } = setup([boros(), bolt()]);
    putOnBattlefield(s0, ap, clovenCasting());
    let s = castNow(s0, ap, ids[0]!, [ply(opp)]);
    s = settle(s, (x) => x.pending?.kind === "chooseMay" && x.pending.player === ap);
    expect(s.pending?.kind).toBe("chooseMay");
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, C: 1 };
    s = settle(answerMay(s, ap, true));
    // The copy may have a new target (the bot answering picks one): 2 damage twice to opponents.
    const opps = s.turnOrder.filter((p) => p !== ap);
    const total = (x: GameState) => opps.reduce((n, p) => n + life(x, p), 0);
    expect(total(s)).toBe(total(s0) - 4);
    expect(life(s, opp)).toBeLessThanOrEqual(life(s0, opp) - 2);
    const before = life(s, opp);
    s = castNow(s, ap, ids[1]!, [ply(opp)]);
    expect(s.triggerQueue.length + s.stack.length).toBe(1);
    s = settle(s);
    expect(life(s, opp)).toBe(before - 3);
  });

  it("Academic Probation: until your next turn the target can't attack or block, and its activated abilities can't be activated", () => {
    const { s: s0, ap, opp, ids } = setup([academicProbation()]);
    const p = putOnBattlefield(s0, opp, pinger("Their Pinger"));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(p)], [1])));
    expect(locked(s, p)).toBe(true);
    s = goUntil(s, (x) => x.activePlayer === opp && x.step === "main1");
    expect(locked(s, p)).toBe(true);
    s = goUntil(s, (x) => x.activePlayer === ap && x.step === "upkeep");
    expect(locked(s, p)).toBe(false);
  });

  it("Dovin Baan +1: -3/-0 and no activated abilities, both until your next turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const dovin = putOnBattlefield(s0, ap, dovinBaan());
    s0.objects[dovin]!.counters = { loyalty: 3 };
    const p = putOnBattlefield(s0, opp, pinger("Their Pinger"));
    let s = settle(activateNow(s0, ap, dovin, 0, [tgt(p)]));
    expect(locked(s, p)).toBe(true);
    expect(pt(s, p)).toBe("-2/1");
    s = goUntil(s, (x) => x.activePlayer === ap && x.step === "upkeep");
    expect(locked(s, p)).toBe(false);
    expect(pt(s, p)).toBe("1/1");
  });
});
