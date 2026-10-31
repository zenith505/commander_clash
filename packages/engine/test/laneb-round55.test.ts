// Lane B, round 55: unsupported cards no earlier round wrote down, EDHREC rank about 19,800 to 17,000, least played first
// (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, scry, setup } from "./helpers";
import { abilitiesOf, botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, power, toughness, planCast, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

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
const steamcoreScholar = () => card("Steamcore Scholar", "Creature — Weird Detective", "{2}{U}", { cmc: 3, colors: ["U"], power: "2", toughness: "2", keywords: ["Flying", "Vigilance"], oracleText: "Flying, vigilance\nWhen this creature enters, draw two cards. Then discard two cards unless you discard an instant or sorcery card or a creature card with flying." });
const thoughtpickerWitch = () => card("Thoughtpicker Witch", "Creature — Human Wizard", "{B}", { cmc: 1, colors: ["B"], power: "1", toughness: "1", oracleText: "{1}, Sacrifice a creature: Look at the top two cards of target opponent's library, then exile one of them." });
const greenbeltRampager = () => card("Greenbelt Rampager", "Creature — Elephant", "{G}", { cmc: 1, colors: ["G"], power: "3", toughness: "4", oracleText: "When this creature enters, pay {E}{E} (two energy counters). If you can't, return this creature to its owner's hand and you get {E}." });
const soulsOfTheFaultless = () => card("Souls of the Faultless", "Creature — Spirit", "{W}{B}{B}", { cmc: 3, colors: ["B", "W"], power: "0", toughness: "4", keywords: ["Defender"], oracleText: "Defender (This creature can't attack.)\nWhenever this creature is dealt combat damage, you gain that much life and attacking player loses that much life." });
const gravestorm = () => card("Gravestorm", "Enchantment", "{B}{B}{B}", { cmc: 3, colors: ["B"], oracleText: "At the beginning of your upkeep, target opponent may exile a card from their graveyard. If that player doesn't, you may draw a card." });
const sigilOfMyrkul = () => card("Sigil of Myrkul", "Enchantment", "{2}{B}", { cmc: 3, colors: ["B"], keywords: ["Mill"], oracleText: "At the beginning of combat on your turn, mill a card. When you do, if there are four or more creature cards in your graveyard, put a +1/+1 counter on target creature you control and it gains deathtouch until end of turn. (To mill a card, put the top card of your library into your graveyard.)" });
const sporeCloud = () => card("Spore Cloud", "Instant", "{1}{G}{G}", { cmc: 3, colors: ["G"], oracleText: "Tap all blocking creatures. Prevent all combat damage that would be dealt this turn. Each attacking creature and each blocking creature doesn't untap during its controller's next untap step." });
const caseOfTheGatewayExpress = () => card("Case of the Gateway Express", "Enchantment — Case", "{1}{W}", { cmc: 2, colors: ["W"], keywords: ["Solved"], oracleText: "When this Case enters, choose target creature you don't control. Each creature you control deals 1 damage to that creature.\nTo solve — Three or more creatures attacked this turn. (If unsolved, solve at the beginning of your end step.)\nSolved — Creatures you control get +1/+0." });
const cyberneticaDatasmith = () => card("Cybernetica Datasmith", "Artifact Creature — Human Artificer", "{1}{U}{B}", { cmc: 3, colors: ["B", "U"], power: "0", toughness: "1", keywords: ["Field Reprogramming", "Protection"], oracleText: "Protection from Robots\nField Reprogramming — {U}, {T}: Target player draws a card. Another target player creates a 4/4 colorless Robot artifact creature token with \"This token can't block.\"" });
const arcSpitter = () => card("Arc Spitter", "Artifact — Equipment", "{1}", { cmc: 1, colors: [], keywords: ["Equip"], oracleText: "Equipped creature has \"{1}: This creature deals 1 damage to target creature that's blocking it.\"\nEquip {1} ({1}: Attach to target creature you control. Equip only as a sorcery.)" });
const devouringTendrils = () => card("Devouring Tendrils", "Sorcery", "{1}{G}", { cmc: 2, colors: ["G"], oracleText: "Target creature you control deals damage equal to its power to target creature or planeswalker you don't control. When the permanent you don't control dies this turn, you gain 2 life." });
const leaveChance = () => scry("split", [{ name: "Leave", mana_cost: "{1}{W}", type_line: "Instant", oracle_text: "Return any number of target permanents you own to your hand." }, { name: "Chance", mana_cost: "{3}{R}", type_line: "Sorcery", oracle_text: "Aftermath (Cast this spell only from your graveyard. Then exile it.)\nDiscard any number of cards, then draw that many cards." }], { keywords: ["Aftermath"] });
const nahiriStormOfStone = () => card("Nahiri, Storm of Stone", "Legendary Planeswalker — Nahiri", "{2}{R/W}{R/W}", { cmc: 4, colors: ["R", "W"], loyalty: "6", oracleText: "During your turn, creatures you control have first strike and equip abilities you activate cost {1} less to activate.\n−X: Nahiri deals X damage to target tapped creature." });
const ironMan = () => card("Iron Man, Futurist Paragon", "Legendary Artifact Creature — Human Hero", "{4}{U}{U}", { cmc: 6, colors: ["U"], power: "5", toughness: "5", keywords: ["Flying"], oracleText: "Flying\nAt the beginning of combat on your turn, target artifact or creature becomes an artifact creature with base power and toughness 5/5 and gains flying." });
const tezzeretAgentOfBolas = () => card("Tezzeret, Agent of Bolas", "Legendary Planeswalker — Tezzeret", "{2}{U}{B}", { cmc: 4, colors: ["B", "U"], loyalty: "3", oracleText: "+1: Look at the top five cards of your library. You may reveal an artifact card from among them and put it into your hand. Put the rest on the bottom of your library in any order.\n−1: Target artifact becomes an artifact creature with base power and toughness 5/5.\n−4: Target player loses X life and you gain X life, where X is twice the number of artifacts you control." });
const tezzeretTheSchemer = () => card("Tezzeret the Schemer", "Legendary Planeswalker — Tezzeret", "{2}{U}{B}", { cmc: 4, colors: ["B", "U"], loyalty: "5", oracleText: "+1: Create a colorless artifact token named Etherium Cell with \"{T}, Sacrifice this token: Add one mana of any color.\"\n−2: Target creature gets +X/-X until end of turn, where X is the number of artifacts you control.\n−7: You get an emblem with \"At the beginning of combat on your turn, target artifact you control becomes an artifact creature with base power and toughness 5/5.\"" });

// Test cards.
const vanilla = (name: string, typeLine: string, cost: string, cmc: number, p: number, t: number, extra: Partial<CardDef> = {}) => card(name, typeLine, cost, { cmc, power: String(p), toughness: String(t), ...extra });
const bearC = (name = "Plain Bear", p = 2, t = 2) => vanilla(name, "Creature — Bear", "{1}{G}", 2, p, t, { colors: ["G"] });
const bird = (name = "Test Bird") => vanilla(name, "Creature — Bird", "{1}{U}", 2, 1, 1, { colors: ["U"], keywords: ["Flying"], oracleText: "Flying" });
const opt = () => card("Test Opt", "Instant", "{U}", { cmc: 1, colors: ["U"], oracleText: "Draw a card." });
const trinket = (name = "Test Trinket") => card(name, "Artifact", "{1}", { cmc: 1, colors: [], oracleText: "" });
const walker = () => card("Test Walker", "Legendary Planeswalker — Jace", "{2}{U}", { cmc: 3, colors: ["U"], loyalty: "3", oracleText: "+1: Draw a card." });
const sword = () => card("Test Sword", "Artifact — Equipment", "{2}", { cmc: 2, colors: [], keywords: ["Equip"], oracleText: "Equipped creature gets +1/+1.\nEquip {2}" });
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
const kw = (s: GameState, id: string, k: string) => objHasKeyword(s, s.objects[id]!, k);
const abilityIndex = (s: GameState, id: ObjectId, re: RegExp) => abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => re.test(a.text));
const types = (s: GameState, id: string) => characteristics(s, s.objects[id]!).types;

describe("Lane B round 55", () => {
  it("are fully supported", () => {
    supported(steamcoreScholar(), thoughtpickerWitch(), greenbeltRampager(), soulsOfTheFaultless(), gravestorm(), sigilOfMyrkul(), sporeCloud(), caseOfTheGatewayExpress(), cyberneticaDatasmith(), arcSpitter(), devouringTendrils(), leaveChance(), nahiriStormOfStone(), ironMan(), tezzeretTheSchemer(), tezzeretAgentOfBolas());
  });

  it("Steamcore Scholar: discard an instant, a sorcery or a creature card with flying, or else two cards", () => {
    for (const flyer of [true, false]) {
      const { s: s0, ap, ids } = setup([steamcoreScholar()]);
      onlyHand(s0, ap, ids);
      const kept = toZone(s0, ap, bearC("Kept Bear"), "hand");
      const drawn = [toZone(s0, ap, bearC("Drawn Bear"), "library"), toZone(s0, ap, flyer ? bird() : bearC("Other Bear"), "library")];
      poolOnly(s0, ap, { U: 1, C: 2 });
      let s = settle(castNow(s0, ap, ids[0]!), (x) => x.pending?.player === ap && (x.pending.kind === "chooseMay" || x.pending.kind === "discard"));
      expect([...s.players[ap]!.hand].sort()).toEqual([kept, ...drawn].sort());
      if (flyer) {
        expect(s.pending?.kind).toBe("chooseMay");
        // Only the flyer will do, so it's the one discarded.
        s = settle(answerMay(s, ap, true));
        expect(zone(s, drawn[1]!)).toBe("graveyard");
        expect([...s.players[ap]!.hand].sort()).toEqual([kept, drawn[0]].sort());
      } else {
        // Neither card will do: two cards (rulings).
        expect(s.pending).toMatchObject({ kind: "discard", count: 2 });
        s = settle(act(s, { type: "discard", player: ap, objectIds: drawn }));
        expect(s.players[ap]!.hand).toEqual([kept]);
      }
      expect(zone(s, ids[0]!)).toBe("battlefield");
    }
  });

  it("Steamcore Scholar: an instant will do too, or any two cards even with one that fits (rulings)", () => {
    const { s: s0, ap, ids } = setup([steamcoreScholar()]);
    onlyHand(s0, ap, ids);
    toZone(s0, ap, bearC("Kept Bear"), "hand");
    const drawn = [toZone(s0, ap, bearC("Drawn Bear"), "library"), toZone(s0, ap, opt(), "library")];
    poolOnly(s0, ap, { U: 1, C: 2 });
    let s = settle(castNow(s0, ap, ids[0]!), at("chooseMay", ap));
    s = settle(answerMay(s, ap, false), at("discard", ap));
    expect(s.pending).toMatchObject({ kind: "discard", count: 2 });
    s = settle(act(s, { type: "discard", player: ap, objectIds: drawn }));
    expect(drawn.map((id) => zone(s, id))).toEqual(["graveyard", "graveyard"]);
  });

  it("Thoughtpicker Witch: you exile one of the top two cards of the opponent's library; the other stays on top", () => {
    const { s: s0, ap, opp } = setup([]);
    const witch = putOnBattlefield(s0, ap, thoughtpickerWitch());
    const fodder = putOnBattlefield(s0, ap, bearC());
    const second = toZone(s0, opp, bearC("Second Card"), "library");
    const first = toZone(s0, opp, opt(), "library");
    poolOnly(s0, ap, { C: 1 });
    let s = settle(run(s0, planActivate(s0, ap, witch, 0, [ply(opp)], undefined, undefined, undefined, { sacrifice: [fodder] })), at("searchLibrary", ap));
    expect(zone(s, fodder)).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", min: 1, max: 1 });
    expect(s.pending?.kind === "searchLibrary" && [...s.pending.cards].sort()).toEqual([first, second].sort());
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [second] }));
    expect(zone(s, second)).toBe("exile");
    expect(s.players[opp]!.exile).toContain(second);
    expect(s.players[opp]!.library[0]).toBe(first);
  });

  it("Greenbelt Rampager: pays {E}{E} if it can, with no choice; otherwise back to hand and {E}", () => {
    for (const [energy, stays, after] of [[2, true, 0], [3, true, 1], [1, false, 2], [0, false, 1]] as const) {
      const { s: s0, ap, ids } = setup([greenbeltRampager()]);
      s0.players[ap]!.energy = energy;
      poolOnly(s0, ap, { G: 1 });
      const s = settle(castNow(s0, ap, ids[0]!));
      expect(zone(s, ids[0]!), `energy ${energy}`).toBe(stays ? "battlefield" : "hand");
      expect(s.players[ap]!.energy ?? 0, `energy ${energy}`).toBe(after);
    }
  });

  it("Souls of the Faultless: combat damage to it is life you gain and the attacking player loses", () => {
    const { s: s0, ap, opp } = setup([]);
    const souls = putOnBattlefield(s0, opp, soulsOfTheFaultless());
    const big = putOnBattlefield(s0, ap, bearC("Big Bear", 3, 3));
    let s = attackWith(s0, [big], opp);
    s = toBlocks(s);
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: souls, attacker: big }] });
    for (let i = 0; i < 10 && s.pending?.kind === "declareBlockers"; i++) s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
    s = goUntil(s, (x) => x.step === "main2");
    expect(life(s, opp)).toBe(43);
    expect(life(s, ap)).toBe(37);
    expect(zone(s, souls)).toBe("battlefield");
  });

  it("Gravestorm: the opponent may exile a card from their graveyard; if they don't, you may draw", () => {
    for (const exile of [true, false]) {
      const { s: s0, ap, opp } = setup([]);
      putOnBattlefield(s0, ap, gravestorm());
      const dead = toZone(s0, opp, bearC("Dead Bear"), "graveyard");
      let s = passUntil(s0, "upkeep", ap);
      s = triggerTargets(s, ap, [ply(opp)]);
      s = settle(s, at("chooseMay", opp));
      expect(s.pending).toMatchObject({ kind: "chooseMay", player: opp });
      s = settle(answerMay(s, opp, exile), (x) => x.pending?.player === ap || (x.pending?.kind === "searchLibrary" && x.pending.player === opp));
      if (exile) {
        if (s.pending?.kind === "searchLibrary") s = act(s, { type: "searchLibrary", player: opp, found: [dead] });
        s = settle(s, at("chooseMay", ap));
        expect(zone(s, dead)).toBe("exile");
        expect(s.pending?.kind === "chooseMay" && s.pending.player === ap).toBe(false);
      } else {
        expect(zone(s, dead)).toBe("graveyard");
        expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
        const hand = s.players[ap]!.hand.length;
        s = settle(answerMay(s, ap, true));
        expect(s.players[ap]!.hand.length).toBe(hand + 1);
      }
    }
  });

  it("Gravestorm: an opponent with an empty graveyard can't exile, so you may draw", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, gravestorm());
    let s = passUntil(s0, "upkeep", ap);
    for (const id of s.players[opp]!.graveyard) {
      s.objects[id]!.zone = "exile";
      s.players[opp]!.exile.push(id);
    }
    s.players[opp]!.graveyard = [];
    s = triggerTargets(s, ap, [ply(opp)]);
    s = settle(s, (x) => x.pending?.kind === "chooseMay");
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
  });

  it("Sigil of Myrkul: mills a card; with four creature cards in your graveyard, a counter and deathtouch", () => {
    for (const enough of [true, false]) {
      const { s: s0, ap } = setup([]);
      putOnBattlefield(s0, ap, sigilOfMyrkul());
      const bear = putOnBattlefield(s0, ap, bearC("Target Bear"));
      for (let i = 0; i < (enough ? 3 : 2); i++) toZone(s0, ap, bearC(`Dead ${i}`), "graveyard");
      const top = toZone(s0, ap, bearC("Milled Bear"), "library");
      let s = passUntil(s0, "beginCombat", ap);
      if (enough) s = triggerTargets(s, ap, [tgt(bear)]);
      s = settle(s);
      expect(zone(s, top)).toBe("graveyard");
      expect(counters(s, bear), `enough ${enough}`).toBe(enough ? 1 : 0);
      expect(kw(s, bear, "Deathtouch")).toBe(enough);
    }
  });

  it("Sigil of Myrkul: a milled noncreature card doesn't count", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, sigilOfMyrkul());
    const bear = putOnBattlefield(s0, ap, bearC("Target Bear"));
    for (let i = 0; i < 3; i++) toZone(s0, ap, bearC(`Dead ${i}`), "graveyard");
    toZone(s0, ap, opt(), "library");
    const s = settle(passUntil(s0, "beginCombat", ap));
    expect(counters(s, bear)).toBe(0);
  });

  it("Spore Cloud: taps the blockers, prevents combat damage, and the creatures in combat don't untap next time", () => {
    const { s: s0, ap, opp, ids } = setup([sporeCloud()]);
    onlyHand(s0, ap, ids);
    const a = putOnBattlefield(s0, ap, bearC("Attacker", 4, 4));
    const b = putOnBattlefield(s0, opp, bearC("Blocker", 3, 3));
    let s = attackWith(s0, [a], opp);
    s = toBlocks(s);
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: b, attacker: a }] });
    for (let i = 0; i < 10 && s.pending?.kind === "declareBlockers"; i++) s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
    for (let i = 0; i < 10 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    poolOnly(s, ap, { G: 2, C: 1 });
    s = settle(castNow(s, ap, ids[0]!));
    expect(s.objects[b]!.tapped).toBe(true);
    s = goUntil(s, (x) => x.step === "main2");
    expect(s.objects[a]!.damage ?? 0).toBe(0);
    expect(s.objects[b]!.damage ?? 0).toBe(0);
    // Neither untaps in its controller's next untap step.
    s = goUntil(s, (x) => x.activePlayer === opp && x.step === "upkeep");
    expect(s.objects[b]!.tapped).toBe(true);
    s = goUntil(s, (x) => x.activePlayer === ap && x.step === "upkeep");
    expect(s.objects[a]!.tapped).toBe(true);
  });

  it("Case of the Gateway Express: each creature you control deals 1 damage to the target", () => {
    const { s: s0, ap, opp, ids } = setup([caseOfTheGatewayExpress()]);
    onlyHand(s0, ap, ids);
    for (const n of ["Bear 1", "Bear 2", "Bear 3"]) putOnBattlefield(s0, ap, bearC(n));
    const victim = putOnBattlefield(s0, opp, bearC("Victim", 3, 3));
    const other = putOnBattlefield(s0, opp, bearC("Other Victim", 3, 3));
    poolOnly(s0, ap, { W: 1, C: 1 });
    let s = castNow(s0, ap, ids[0]!);
    s = triggerTargets(s, ap, [tgt(victim)]);
    s = settle(s);
    expect(zone(s, victim)).toBe("graveyard");
    expect(s.objects[other]!.damage ?? 0).toBe(0);
    // Not one of yours.
    const { s: t0, ap: ap2, ids: ids2 } = setup([caseOfTheGatewayExpress()]);
    const mine = putOnBattlefield(t0, ap2, bearC("Mine"));
    poolOnly(t0, ap2, { W: 1, C: 1 });
    let t = settle(castNow(t0, ap2, ids2[0]!), at("chooseTargets", ap2));
    expect(() => act(t, { type: "chooseTargets", player: ap2, targets: [tgt(mine)] } as Action)).toThrow();
  });

  it("Cybernetica Datasmith: one target player draws, another target player gets the 4/4 Robot that can't block", () => {
    const { s: s0, ap, opp } = setup([]);
    const ds = putOnBattlefield(s0, ap, cyberneticaDatasmith());
    poolOnly(s0, ap, { U: 2 });
    const hand = s0.players[ap]!.hand.length;
    // The same player twice is not allowed ("another target player").
    expect(planActivate(s0, ap, ds, 0, [ply(ap), ply(ap)])).toBeNull();
    const s = settle(run(s0, planActivate(s0, ap, ds, 0, [ply(ap), ply(opp)])));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    const robots = tokensNamed(s, opp, "Robot");
    expect(robots.length).toBe(1);
    expect(pt(s, robots[0]!)).toBe("4/4");
    expect(tokensNamed(s, ap, "Robot")).toEqual([]);
  });

  it("Arc Spitter: the equipped creature deals 1 damage to a creature blocking it", () => {
    const { s: s0, ap, opp } = setup([]);
    const spitter = putOnBattlefield(s0, ap, arcSpitter());
    const a = putOnBattlefield(s0, ap, bearC("Attacker", 2, 2));
    s0.objects[spitter]!.attachedTo = a;
    invalidateCharacteristics(s0);
    const b = putOnBattlefield(s0, opp, bearC("Blocker", 1, 1));
    const bystander = putOnBattlefield(s0, opp, bearC("Bystander", 1, 1));
    const i = abilityIndex(s0, a, /deals 1 damage to target creature/);
    expect(i).toBeGreaterThanOrEqual(0);
    let s = attackWith(s0, [a], opp);
    s = toBlocks(s);
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: b, attacker: a }] });
    for (let j = 0; j < 10 && s.pending?.kind === "declareBlockers"; j++) s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
    for (let j = 0; j < 10 && waitingOn(s) !== ap; j++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    poolOnly(s, ap, { C: 1 });
    expect(planActivate(s, ap, a, i, [tgt(bystander)])).toBeNull();
    s = settle(run(s, planActivate(s, ap, a, i, [tgt(b)])));
    expect(zone(s, b)).toBe("graveyard");
  });

  it("Devouring Tendrils: your creature bites; you gain 2 life when that permanent dies this turn", () => {
    const { s: s0, ap, opp, ids } = setup([devouringTendrils()]);
    onlyHand(s0, ap, ids);
    const mine = putOnBattlefield(s0, ap, bearC("Biter", 3, 3));
    const victim = putOnBattlefield(s0, opp, bearC("Victim", 2, 2));
    poolOnly(s0, ap, { G: 1, C: 1 });
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(mine), tgt(victim)]));
    expect(zone(s, victim)).toBe("graveyard");
    expect(life(s, ap)).toBe(42);
    expect(s.objects[mine]!.damage ?? 0).toBe(0);
  });

  it("Devouring Tendrils: a planeswalker that dies later this turn, from something else, gains it too (rulings)", () => {
    const { s: s0, ap, opp, ids } = setup([devouringTendrils()]);
    onlyHand(s0, ap, ids);
    const mine = putOnBattlefield(s0, ap, bearC("Biter", 1, 1));
    const w = putOnBattlefield(s0, opp, walker());
    s0.objects[w]!.counters.loyalty = 3;
    poolOnly(s0, ap, { G: 1, C: 1 });
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(mine), tgt(w)]));
    expect(s.objects[w]!.counters.loyalty).toBe(2);
    expect(life(s, ap)).toBe(40);
    s.objects[w]!.counters.loyalty = 0;
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(zone(s, w)).toBe("graveyard");
    expect(life(s, ap)).toBe(42);
  });

  it("Leave: returns any number of target permanents you own, even one another player controls", () => {
    const { s: s0, ap, opp, ids } = setup([leaveChance()]);
    onlyHand(s0, ap, ids);
    const a = putOnBattlefield(s0, ap, bearC("Mine A"));
    const b = putOnBattlefield(s0, ap, trinket());
    const lent = putOnBattlefield(s0, opp, bearC("Lent Bear"));
    s0.objects[lent]!.owner = ap;
    const theirs = putOnBattlefield(s0, opp, bearC("Their Bear"));
    invalidateCharacteristics(s0);
    poolOnly(s0, ap, { W: 1, C: 1 });
    expect(planCast(s0, ap, ids[0]!, [tgt(theirs)], undefined, "auto", undefined, { face: 0 })).toBeNull();
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(a), tgt(b), tgt(lent)], undefined, "auto", undefined, { face: 0 })));
    expect([a, b, lent].map((id) => zone(s, id))).toEqual(["hand", "hand", "hand"]);
    expect(s.players[ap]!.hand).toEqual(expect.arrayContaining([a, b, lent]));
    expect(zone(s, theirs)).toBe("battlefield");
  });

  it("Nahiri, Storm of Stone: first strike and cheaper equip during your turn only", () => {
    const { s: s0, ap, opp } = setup([]);
    const n = putOnBattlefield(s0, ap, nahiriStormOfStone());
    s0.objects[n]!.counters.loyalty = 6;
    const bear = putOnBattlefield(s0, ap, bearC());
    const eq = putOnBattlefield(s0, ap, sword());
    invalidateCharacteristics(s0);
    expect(kw(s0, bear, "First strike")).toBe(true);
    poolOnly(s0, ap, { C: 1 });
    const equip = abilityIndex(s0, eq, /^Equip/);
    const s = settle(run(s0, planActivate(s0, ap, eq, equip, [tgt(bear)])));
    expect(s.objects[eq]!.attachedTo).toBe(bear);
    // Another player's turn: no first strike.
    const t = goUntil(s, (x) => x.activePlayer === opp && x.step === "main1");
    expect(kw(t, bear, "First strike")).toBe(false);
  });

  it("Iron Man, Futurist Paragon: the target becomes a 5/5 flying artifact creature for good, keeping its other types", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, ironMan());
    const bear = putOnBattlefield(s0, ap, bearC());
    let s = passUntil(s0, "beginCombat", ap);
    s = triggerTargets(s, ap, [tgt(bear)]);
    s = settle(s);
    expect(pt(s, bear)).toBe("5/5");
    expect(types(s, bear)).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(characteristics(s, s.objects[bear]!).subtypes).toContain("Bear");
    expect(kw(s, bear, "Flying")).toBe(true);
    s = goUntil(s, (x) => x.activePlayer !== ap && x.step === "main1");
    expect(pt(s, bear)).toBe("5/5");
  });

  it("Iron Man, Futurist Paragon: a noncreature artifact becomes a creature", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, ironMan());
    const t = putOnBattlefield(s0, ap, trinket());
    let s = passUntil(s0, "beginCombat", ap);
    s = triggerTargets(s, ap, [tgt(t)]);
    s = settle(s);
    expect(types(s, t)).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(pt(s, t)).toBe("5/5");
  });

  it("Tezzeret, Agent of Bolas: −1 makes an artifact a 5/5 artifact creature for good; an Equipment comes off (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const tz = putOnBattlefield(s0, ap, tezzeretAgentOfBolas());
    s0.objects[tz]!.counters.loyalty = 3;
    const bear = putOnBattlefield(s0, ap, bearC());
    const eq = putOnBattlefield(s0, ap, sword());
    s0.objects[eq]!.attachedTo = bear;
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planActivate(s0, ap, tz, abilityIndex(s0, tz, /^−1/), [tgt(eq)])));
    expect(types(s, eq)).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(characteristics(s, s.objects[eq]!).subtypes).toContain("Equipment");
    expect(pt(s, eq)).toBe("5/5");
    expect(s.objects[eq]!.attachedTo).toBeUndefined();
    s = goUntil(s, (x) => x.activePlayer !== ap && x.step === "main1");
    expect(pt(s, eq)).toBe("5/5");
  });

  it("Tezzeret the Schemer: the emblem makes an artifact you control a 5/5 artifact creature at each of your combats", () => {
    const { s: s0, ap } = setup([]);
    const tz = putOnBattlefield(s0, ap, tezzeretTheSchemer());
    s0.objects[tz]!.counters.loyalty = 7;
    const t = putOnBattlefield(s0, ap, trinket());
    const ult = abilityIndex(s0, tz, /emblem/);
    let s = settle(run(s0, planActivate(s0, ap, tz, ult, [])));
    expect((s.emblems ?? []).length).toBe(1);
    s = passUntil(s, "beginCombat", ap);
    s = triggerTargets(s, ap, [tgt(t)]);
    s = settle(s);
    expect(types(s, t)).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(pt(s, t)).toBe("5/5");
    s = goUntil(s, (x) => x.activePlayer !== ap && x.step === "main1");
    expect(pt(s, t)).toBe("5/5");
  });
});
