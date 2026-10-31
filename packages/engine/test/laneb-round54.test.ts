// Lane B, round 54: unsupported cards no earlier round wrote down, EDHREC rank about 19,700 up, least played first
// (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
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
const exquisiteFirecraft = () => card("Exquisite Firecraft", "Sorcery", "{1}{R}{R}", { cmc: 3, colors: ["R"], keywords: ["Spell mastery"], oracleText: "Exquisite Firecraft deals 4 damage to any target.\nSpell mastery — If there are two or more instant and/or sorcery cards in your graveyard, this spell can't be countered." });
const biomanticMastery = () => card("Biomantic Mastery", "Sorcery", "{4}{G/U}{G/U}{G/U}", { cmc: 7, colors: ["G", "U"], oracleText: "Draw a card for each creature target player controls, then draw a card for each creature another target player controls." });
const gripOfAmnesia = () => card("Grip of Amnesia", "Instant", "{1}{U}", { cmc: 2, colors: ["U"], oracleText: "Counter target spell unless its controller exiles all cards from their graveyard.\nDraw a card." });
const tunnelIgnus = () => card("Tunnel Ignus", "Creature — Elemental", "{1}{R}", { cmc: 2, colors: ["R"], power: "2", toughness: "1", oracleText: "Whenever a land enters under an opponent's control, if that player had another land enter the battlefield under their control this turn, this creature deals 3 damage to that player." });
const ichorplateGolem = () => card("Ichorplate Golem", "Artifact Creature — Phyrexian Golem", "{3}", { cmc: 3, colors: [], power: "2", toughness: "3", oracleText: "Whenever a creature you control enters, if it has one or more oil counters on it, put an oil counter on it.\nCreatures you control with oil counters on them get +1/+1." });
const synodSanctum = () => card("Synod Sanctum", "Artifact", "{1}", { cmc: 1, colors: [], oracleText: "{2}, {T}: Exile target permanent you control.\n{2}, Sacrifice this artifact: Return all cards exiled with this artifact to the battlefield under your control." });
const corpseCobble = () => card("Corpse Cobble", "Instant", "{U}{B}", { cmc: 2, colors: ["B", "U"], keywords: ["Flashback"], oracleText: "As an additional cost to cast this spell, sacrifice any number of creatures.\nCreate an X/X blue and black Zombie creature token with menace, where X is the total power of the sacrificed creatures.\nFlashback {3}{U}{B} (You may cast this card from your graveyard for its flashback cost and any additional costs. Then exile it.)" });
const maliciousEclipse = () => card("Malicious Eclipse", "Sorcery", "{1}{B}{B}", { cmc: 3, colors: ["B"], oracleText: "All creatures get -2/-2 until end of turn. If a creature an opponent controls would die this turn, exile it instead." });
const lightningCoils = () => card("Lightning Coils", "Artifact", "{3}", { cmc: 3, colors: [], oracleText: "Whenever a nontoken creature you control dies, put a charge counter on this artifact.\nAt the beginning of your upkeep, if this artifact has five or more charge counters on it, remove all of them from it and create that many 3/1 red Elemental creature tokens with haste. Exile them at the beginning of the next end step." });
const krumarInitiate = () => card("Krumar Initiate", "Creature — Human Cleric", "{1}{B}", { cmc: 2, colors: ["B"], power: "2", toughness: "2", keywords: ["Endure"], oracleText: "{X}{B}, {T}, Pay X life: This creature endures X. Activate only as a sorcery. (Put X +1/+1 counters on it or create an X/X white Spirit creature token.)" });
const nivix = () => card("Nivix, Aerie of the Firemind", "Land", "", { cmc: 0, colors: [], oracleText: "{T}: Add {C}.\n{2}{U}{R}, {T}: Exile the top card of your library. Until your next turn, you may cast it if it's an instant or sorcery spell." });
const realmwright = () => card("Realmwright", "Creature — Vedalken Wizard", "{U}", { cmc: 1, colors: ["U"], power: "1", toughness: "1", oracleText: "As this creature enters, choose a basic land type.\nLands you control are the chosen type in addition to their other types." });
const boneDragon = () => card("Bone Dragon", "Creature — Dragon Skeleton", "{3}{B}{B}", { cmc: 5, colors: ["B"], power: "5", toughness: "4", keywords: ["Flying"], oracleText: "Flying\n{3}{B}{B}, Exile seven other cards from your graveyard: Return this card from your graveyard to the battlefield tapped." });
const unluckyWitness = () => card("Unlucky Witness", "Creature — Human Citizen", "{R}", { cmc: 1, colors: ["R"], power: "1", toughness: "1", oracleText: "When this creature dies, exile the top two cards of your library. Until your next end step, you may play one of those cards." });
const veteranSurvivor = () => card("Veteran Survivor", "Creature — Human Survivor", "{W}", { cmc: 1, colors: ["W"], power: "2", toughness: "1", keywords: ["Survival"], oracleText: "Survival — At the beginning of your second main phase, if this creature is tapped, exile up to one target card from a graveyard.\nAs long as there are three or more cards exiled with this creature, it gets +3/+3 and has hexproof. (It can't be the target of spells or abilities your opponents control.)" });
const warBalloon = () => card("War Balloon", "Artifact — Vehicle", "{2}{R}", { cmc: 3, colors: ["R"], power: "4", toughness: "3", keywords: ["Flying", "Crew"], oracleText: "Flying\n{1}: Put a fire counter on this Vehicle.\nAs long as this Vehicle has three or more fire counters on it, it's an artifact creature.\nCrew 3 (Tap any number of creatures you control with total power 3 or more: This Vehicle becomes an artifact creature until end of turn.)" });
const evolvingAdaptive = () => card("Evolving Adaptive", "Creature — Phyrexian Warrior", "{G}", { cmc: 1, colors: ["G"], power: "0", toughness: "0", oracleText: "This creature enters with an oil counter on it.\nThis creature gets +1/+1 for each oil counter on it.\nWhenever another creature you control enters, if that creature has greater power or toughness than this creature, put an oil counter on this creature." });
const direDowndraft = () => card("Dire Downdraft", "Instant", "{3}{U}", { cmc: 4, colors: ["U"], oracleText: "This spell costs {1} less to cast if it targets an attacking or tapped creature.\nTarget creature's owner puts it on their choice of the top or bottom of their library." });
const nyleasPresence = () => card("Nylea's Presence", "Enchantment — Aura", "{1}{G}", { cmc: 2, colors: ["G"], keywords: ["Enchant"], oracleText: "Enchant land\nWhen this Aura enters, draw a card.\nEnchanted land is every basic land type in addition to its other types." });

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
const abilityIndex = (s: GameState, id: ObjectId, re: RegExp) => abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => re.test(a.text));
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

const cancel = () => card("Test Cancel", "Instant", "{1}{U}{U}", { cmc: 3, colors: ["U"], oracleText: "Counter target spell." });
const destroy = () => card("Test Murder", "Instant", "{1}{B}{B}", { cmc: 3, colors: ["B"], oracleText: "Destroy target creature." });

describe("Lane B round 54", () => {
  it("are fully supported", () => {
    supported(exquisiteFirecraft(), biomanticMastery(), gripOfAmnesia(), tunnelIgnus(), ichorplateGolem(), synodSanctum(), corpseCobble(), maliciousEclipse(), lightningCoils(), krumarInitiate(), nivix(), realmwright(), boneDragon(), unluckyWitness(), veteranSurvivor(), warBalloon(), evolvingAdaptive(), direDowndraft(), nyleasPresence());
  });

  it("Exquisite Firecraft: can't be countered with two instant and/or sorcery cards in your graveyard", () => {
    for (const mastery of [false, true]) {
      const { s: s0, ap, opp, ids } = setup([exquisiteFirecraft(), cancel()]);
      onlyHand(s0, ap, ids);
      toZone(s0, ap, opt(), "graveyard");
      if (mastery) toZone(s0, ap, divination(), "graveyard");
      let s = castNow(s0, ap, ids[0]!, [ply(opp)]);
      s = castNow(s, ap, ids[1]!, [spell(s, ids[0]!)]);
      s = settle(s);
      expect(life(s, opp), `mastery ${mastery}`).toBe(mastery ? 36 : 40);
      expect(zone(s, ids[0]!)).toBe("graveyard");
    }
  });

  it("Biomantic Mastery: draws for the creatures of one target player, then of another", () => {
    const { s: s0, ap, ids } = setup([biomanticMastery()]);
    const [o1, o2] = s0.turnOrder.filter((p) => p !== ap);
    putOnBattlefield(s0, o1!, bearC("Bear 1"));
    putOnBattlefield(s0, o1!, bearC("Bear 2"));
    for (const n of ["Bear 3", "Bear 4", "Bear 5"]) putOnBattlefield(s0, o2!, bearC(n));
    const before = s0.players[ap]!.hand.length;
    const s = settle(castNow(s0, ap, ids[0]!, [ply(o1!), ply(o2!)]));
    expect(s.players[ap]!.hand.length).toBe(before - 1 + 5);
    // Both targets the same player: not allowed ("another target player").
    expect(planCast(s0, ap, ids[0]!, [ply(o1!), ply(o1!)])).toBeNull();
  });

  it("Grip of Amnesia: the spell's controller exiles their graveyard or it's countered; you draw either way", () => {
    for (const pay of [true, false]) {
      const { s: s0, ap, ids } = setup([divination(), gripOfAmnesia()]);
      onlyHand(s0, ap, ids);
      const old = [toZone(s0, ap, opt(), "graveyard"), toZone(s0, ap, bearC(), "graveyard")];
      poolOnly(s0, ap, { U: 2, C: 3 });
      let s = castNow(s0, ap, ids[0]!);
      s = castNow(s, ap, ids[1]!, [spell(s, ids[0]!)]);
      s = settle(s, at("payUnless", ap));
      expect(s.pending).toMatchObject({ kind: "payUnless", player: ap, exileGraveyard: true });
      s = settle(act(s, { type: "payUnless", player: ap, pay }));
      expect(old.map((id) => zone(s, id))).toEqual(pay ? ["exile", "exile"] : ["graveyard", "graveyard"]);
      // Grip draws one; Divination two if it resolved.
      expect(s.players[ap]!.hand.length).toBe(pay ? 3 : 1);
      expect(zone(s, ids[0]!)).toBe("graveyard");
    }
  });

  it("Grip of Amnesia: the bot exiles a small graveyard but not a big one", () => {
    for (const n of [2, 6]) {
      const { s: s0, ap, ids } = setup([divination(), gripOfAmnesia()]);
      for (let i = 0; i < n; i++) toZone(s0, ap, bearC(`Dead ${i}`), "graveyard");
      poolOnly(s0, ap, { U: 2, C: 3 });
      let s = castNow(s0, ap, ids[0]!);
      s = castNow(s, ap, ids[1]!, [spell(s, ids[0]!)]);
      s = settle(s, at("payUnless", ap));
      expect(botActions(s, ap)[0]).toMatchObject({ type: "payUnless", pay: n <= 3 });
    }
  });

  it("Tunnel Ignus: 3 damage to an opponent for their second land of the turn", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, tunnelIgnus());
    let s = passUntil(s0, "main1", opp);
    const l1 = toZone(s, opp, card("Land One", "Land"), "hand");
    const l2 = toZone(s, opp, card("Land Two", "Land"), "hand");
    s = act(s, { type: "playLand", player: opp, objectId: l1 });
    expect(s.triggerQueue.length + s.stack.length).toBe(0);
    s.players[opp]!.landsPlayedThisTurn = 0;
    s = settle(act(s, { type: "playLand", player: opp, objectId: l2 }));
    expect(life(s, opp)).toBe(37);
  });

  it("Ichorplate Golem and Evolving Adaptive: another oil counter for a creature entering with one; +1/+1 per oil counter", () => {
    const { s: s0, ap, ids } = setup([evolvingAdaptive(), bearC()]);
    const golemId = putOnBattlefield(s0, ap, ichorplateGolem());
    let s = settle(castNow(s0, ap, ids[0]!));
    expect(counters(s, ids[0]!, "oil")).toBe(2);
    // 0/0, +2/+2 for its oil counters, +1/+1 from the Golem.
    expect(pt(s, ids[0]!)).toBe("3/3");
    expect(pt(s, golemId)).toBe("2/3");
    // A 2/2 without oil counters: no counter from the Golem, and it isn't bigger than the Adaptive.
    s = settle(castNow(s, ap, ids[1]!));
    expect(counters(s, ids[1]!, "oil")).toBe(0);
    expect(counters(s, ids[0]!, "oil")).toBe(2);
  });

  it("Evolving Adaptive: an oil counter when a bigger creature enters (not evolve)", () => {
    const { s: s0, ap, ids } = setup([bearC("Bear A"), bearC("Bear B"), bigC()]);
    const ad = putOnBattlefield(s0, ap, evolvingAdaptive());
    s0.objects[ad]!.counters = { oil: 1 };
    invalidateCharacteristics(s0);
    expect(pt(s0, ad)).toBe("1/1");
    let s = settle(castNow(s0, ap, ids[0]!));
    expect(pt(s, ad)).toBe("2/2");
    s = settle(castNow(s, ap, ids[1]!));
    expect(pt(s, ad)).toBe("2/2");
    s = settle(castNow(s, ap, ids[2]!));
    expect(pt(s, ad)).toBe("3/3");
  });

  it("Synod Sanctum: exiled permanents come back under your control when it's sacrificed", () => {
    const { s: s0, ap } = setup([]);
    const sanctum = putOnBattlefield(s0, ap, synodSanctum());
    const a = putOnBattlefield(s0, ap, bearC("Bear A"));
    const b = putOnBattlefield(s0, ap, trinket());
    let s = settle(run(s0, planActivate(s0, ap, sanctum, 0, [tgt(a)])));
    s.objects[sanctum]!.tapped = false;
    s = settle(run(s, planActivate(s, ap, sanctum, 0, [tgt(b)])));
    expect([zone(s, a), zone(s, b)]).toEqual(["exile", "exile"]);
    s = settle(run(s, planActivate(s, ap, sanctum, 1, [])));
    expect(zone(s, sanctum)).toBe("graveyard");
    expect([zone(s, a), zone(s, b)]).toEqual(["battlefield", "battlefield"]);
  });

  it("Corpse Cobble: an X/X Zombie with menace, X the total power of the creatures sacrificed", () => {
    const { s: s0, ap, ids } = setup([corpseCobble()]);
    const a = putOnBattlefield(s0, ap, bearC());
    const b = putOnBattlefield(s0, ap, bigC());
    // X is the number of creatures sacrificed (any number of them, CR 601.2b).
    let s = run(s0, planCast(s0, ap, ids[0]!, [], undefined, undefined, 2, { sacrifice: [a, b] }));
    expect([zone(s, a), zone(s, b)]).toEqual(["graveyard", "graveyard"]);
    s = settle(s);
    const [z] = tokensNamed(s, ap, "Zombie");
    expect(pt(s, z!)).toBe("7/7");
    expect(kw(s, z!, "Menace")).toBe(true);
    // No creatures sacrificed: a 0/0 that dies.
    const { s: t0, ap: ap2, ids: ids2 } = setup([corpseCobble()]);
    const t = settle(run(t0, planCast(t0, ap2, ids2[0]!, [], undefined, undefined, 0, { sacrifice: [] })));
    expect(tokensNamed(t, ap2, "Zombie")).toHaveLength(0);
  });

  it("Malicious Eclipse: -2/-2; an opponent's creature that would die this turn is exiled instead, yours isn't", () => {
    const { s: s0, ap, opp, ids } = setup([maliciousEclipse(), destroy()]);
    const mine = putOnBattlefield(s0, ap, bearC("My Bear"));
    const theirs = putOnBattlefield(s0, opp, bearC("Their Bear"));
    const theirBig = putOnBattlefield(s0, opp, bigC());
    poolOnly(s0, ap, { B: 4, C: 2 });
    let s = settle(castNow(s0, ap, ids[0]!));
    expect(zone(s, mine)).toBe("graveyard");
    expect(zone(s, theirs)).toBe("exile");
    expect(pt(s, theirBig)).toBe("3/3");
    // Still this turn: destroyed later, it's exiled too.
    s = settle(castNow(s, ap, ids[1]!, [tgt(theirBig)]));
    expect(zone(s, theirBig)).toBe("exile");
    // Next turn it's over.
    const late = putOnBattlefield(s, opp, bearC("Late Bear"));
    s = goUntil(s, (x) => x.turn > s0.turn && x.step === "main1");
    const kill = toZone(s, s.activePlayer, card("Test Bolt 2", "Instant", "{0}", { cmc: 0, colors: [], oracleText: "Destroy target creature." }), "hand");
    s = settle(castNow(s, s.activePlayer, kill, [tgt(late)]));
    expect(zone(s, late)).toBe("graveyard");
  });

  it("Lightning Coils: a charge counter per nontoken creature that dies; five or more become 3/1 hasty Elementals, exiled at end of turn", () => {
    const { s: s0, ap, ids } = setup([destroy()]);
    const coils = putOnBattlefield(s0, ap, lightningCoils());
    s0.objects[coils]!.counters = { charge: 4 };
    const bear = putOnBattlefield(s0, ap, bearC());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(bear)]));
    expect(counters(s, coils, "charge")).toBe(5);
    s = goUntil(s, (x) => x.activePlayer === ap && x.turn > s0.turn && x.step === "main1");
    const els = tokensNamed(s, ap, "Elemental");
    expect(els).toHaveLength(5);
    expect(pt(s, els[0]!)).toBe("3/1");
    expect(kw(s, els[0]!, "Haste")).toBe(true);
    expect(counters(s, coils, "charge")).toBe(0);
    s = goUntil(s, (x) => x.activePlayer === ap && x.step === "cleanup");
    expect(tokensNamed(s, ap, "Elemental")).toHaveLength(0);
  });

  it("Krumar Initiate: {X}{B}, {T}, pay X life: endures X", () => {
    const { s: s0, ap } = setup([]);
    const k = putOnBattlefield(s0, ap, krumarInitiate());
    let s = run(s0, planActivate(s0, ap, k, 0, [], undefined, undefined, 3));
    expect(life(s, ap)).toBe(37);
    s = settle(s, at("chooseOption", ap));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "endure" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "counters" }));
    expect(counters(s, k)).toBe(3);
    expect(pt(s, k)).toBe("5/5");
    // X can't be more life than you have.
    const { s: t0, ap: ap2 } = setup([]);
    const k2 = putOnBattlefield(t0, ap2, krumarInitiate());
    t0.players[ap2]!.life = 2;
    expect(planActivate(t0, ap2, k2, 0, [], undefined, undefined, 3)).toBeNull();
  });

  it("Nivix: the exiled card can be cast until your next turn only if it's an instant or sorcery", () => {
    for (const instant of [true, false]) {
      const { s: s0, ap } = setup([]);
      const nx = putOnBattlefield(s0, ap, nivix());
      const top = toZone(s0, ap, instant ? opt() : bearC(), "library");
      const idx = abilityIndex(s0, nx, /Exile the top card/);
      let s = settle(run(s0, planActivate(s0, ap, nx, idx, [])));
      expect(zone(s, top)).toBe("exile");
      expect(!!planCast(s, ap, top), `instant ${instant}`).toBe(instant);
      if (!instant) continue;
      // Through the opponents' turns, until ap's next turn.
      const opp = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
      s = goUntil(s, (x) => x.activePlayer === opp && x.step === "main1" && waitingOn(x) === opp && !x.pending);
      while (waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, U: 1 };
      expect(!!planCast(s, ap, top)).toBe(true);
      s = goUntil(s, (x) => x.activePlayer === ap && x.step === "main1");
      expect(zone(s, top)).toBe("exile");
      expect(planCast(s, ap, top)).toBeNull();
    }
  });

  it("Realmwright: your lands are the chosen basic land type too", () => {
    const { s: s0, ap, opp, ids } = setup([realmwright()]);
    const theirs = putOnBattlefield(s0, opp, card("Test Wastes", "Land", "", { oracleText: "{T}: Add {C}." }));
    let s = castNow(s0, ap, ids[0]!);
    s = settle(s, at("chooseOption", ap));
    expect(s.pending?.kind).toBe("chooseOption");
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Swamp" }));
    const mine = s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === ap && characteristics(s, s.objects[id]!).types.includes("Land"));
    expect(mine.length).toBeGreaterThan(0);
    for (const id of mine) expect(characteristics(s, s.objects[id]!).subtypes).toContain("Swamp");
    expect(characteristics(s, s.objects[theirs]!).subtypes).not.toContain("Swamp");
  });

  it("Bone Dragon: returns tapped from the graveyard by exiling seven other cards", () => {
    for (const n of [6, 7]) {
      const { s: s0, ap } = setup([]);
      const dragon = toZone(s0, ap, boneDragon(), "graveyard");
      const others = Array.from({ length: n }, (_, i) => toZone(s0, ap, bearC(`Bone ${i}`), "graveyard"));
      const plan = planActivate(s0, ap, dragon, 0, [], undefined, undefined, undefined, { exileCards: others.slice(0, 7) });
      expect(!!plan, `${n} others`).toBe(n >= 7);
      if (!plan) continue;
      const s = settle(run(s0, plan));
      expect(zone(s, dragon)).toBe("battlefield");
      expect(s.objects[dragon]!.tapped).toBe(true);
      expect(others.every((id) => zone(s, id) === "exile")).toBe(true);
    }
  });

  it("Unlucky Witness: exiles the top two; you may play only one of them, until your next end step", () => {
    const { s: s0, ap, ids } = setup([destroy()]);
    const w = putOnBattlefield(s0, ap, unluckyWitness());
    const o = toZone(s0, ap, opt(), "library");
    const d = toZone(s0, ap, divination(), "library");
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(w)]));
    expect([zone(s, o), zone(s, d)]).toEqual(["exile", "exile"]);
    expect(!!planCast(s, ap, o)).toBe(true);
    expect(!!planCast(s, ap, d)).toBe(true);
    s = settle(castNow(s, ap, o));
    expect(zone(s, o)).toBe("graveyard");
    expect(planCast(s, ap, d)).toBeNull();
  });

  it("Veteran Survivor: exiles a graveyard card in your second main phase if it's tapped; +3/+3 and hexproof with three exiled", () => {
    const { s: s0, ap, opp } = setup([]);
    const vet = putOnBattlefield(s0, ap, veteranSurvivor());
    const dead = [0, 1, 2].map((i) => toZone(s0, opp, bearC(`Their Dead ${i}`), "graveyard"));
    s0.objects[vet]!.tapped = true;
    let s = goUntil(s0, at("chooseTargets", ap));
    expect(s.step).toBe("main2");
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(dead[0]!)] } as Action));
    expect(zone(s, dead[0]!)).toBe("exile");
    expect(pt(s, vet)).toBe("2/1");
    // Two more exiled with it (as on later turns).
    const key = Object.keys(s.linkedExile ?? {}).find((k) => k.startsWith(`${vet}@`))!;
    for (const id of dead.slice(1)) {
      s.players[opp]!.graveyard = s.players[opp]!.graveyard.filter((x) => x !== id);
      s.objects[id]!.zone = "exile";
      s.players[opp]!.exile.push(id);
      s.linkedExile![key]!.push({ id, zc: s.objects[id]!.zoneChanges ?? 0 });
    }
    invalidateCharacteristics(s);
    expect(pt(s, vet)).toBe("5/4");
    expect(kw(s, vet, "Hexproof")).toBe(true);
  });

  it("War Balloon: an artifact creature with three fire counters", () => {
    const { s: s0, ap } = setup([]);
    const b = putOnBattlefield(s0, ap, warBalloon());
    const idx = abilityIndex(s0, b, /fire counter/);
    let s = s0;
    for (let i = 0; i < 2; i++) s = settle(run(s, planActivate(s, ap, b, idx, [])));
    expect(characteristics(s, s.objects[b]!).types).not.toContain("Creature");
    s = settle(run(s, planActivate(s, ap, b, idx, [])));
    expect(characteristics(s, s.objects[b]!).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(pt(s, b)).toBe("4/3");
    expect(kw(s, b, "Flying")).toBe(true);
  });

  it("Dire Downdraft: {1} less targeting a tapped creature; its owner picks top or bottom", () => {
    for (const tapped of [true, false]) {
      const { s: s0, ap, opp, ids } = setup([direDowndraft()]);
      const bear = putOnBattlefield(s0, opp, bearC());
      s0.objects[bear]!.tapped = tapped;
      poolOnly(s0, ap, { U: 1, C: 2 });
      const plan = planCast(s0, ap, ids[0]!, [tgt(bear)]);
      expect(!!plan, `tapped ${tapped}`).toBe(tapped);
      if (!plan) continue;
      let s = settle(run(s0, plan), at("chooseOption", opp));
      expect(s.pending).toMatchObject({ kind: "chooseOption", player: opp });
      s = settle(act(s, { type: "chooseOption", player: opp, choice: "bottom" }));
      expect(zone(s, bear)).toBe("library");
      expect(s.players[opp]!.library.at(-1)).toBe(bear);
    }
  });

  it("Nylea's Presence: draws a card; the enchanted land is every basic land type", () => {
    const { s: s0, ap, ids } = setup([nyleasPresence()]);
    onlyHand(s0, ap, ids);
    const land = putOnBattlefield(s0, ap, card("Test Wastes", "Land", "", { oracleText: "{T}: Add {C}." }));
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(land)]));
    expect(s.players[ap]!.hand.length).toBe(1);
    expect(characteristics(s, s.objects[land]!).subtypes).toEqual(expect.arrayContaining(["Plains", "Island", "Swamp", "Mountain", "Forest"]));
  });
});
