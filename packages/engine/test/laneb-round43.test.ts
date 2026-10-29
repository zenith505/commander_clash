// Lane B, round 43: the cards the earlier rounds skipped, least played first (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup } from "./helpers";
import { botActions, compileCard, controllerOf, invalidateCharacteristics, isFullySupported, manaValue, moveObject, planActivate, planCast, power, spellCost, toughness, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PlayerId, type TargetChoice } from "../src";

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
const find = (s: GameState, pid: PlayerId, found: string[]) => act(s, { type: "searchLibrary", player: pid, found });
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const ply = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = [], choices: CostChoices = {}) => run(s, planCast(s, pid, id, targets, undefined, undefined, undefined, choices));
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
/** Passes to the declare attackers step of the active player's turn and declares `attackers` at `defender`; stops at the first question. */
const attackWith = (s: GameState, attackers: string[], defender: PlayerId) => {
  for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  s = act(s, { type: "declareAttackers", player: s.activePlayer, attacks: attackers.map((attacker) => ({ attacker, defender })) });
  for (let i = 0; i < 50 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
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
/** The total mana `pid` would pay for the card `id` now, with these targets. */
const costNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = []) => {
  const c = spellCost(s, pid, s.objects[id]!, 0, [], { targets });
  return manaValue(c.cost) + c.extra;
};

// Real oracle text (Scryfall).
const destroyTheEvidence = () => card("Destroy the Evidence", "Sorcery", "{4}{B}", { cmc: 5, colors: ["B"], oracleText: "Destroy target land. Its controller reveals cards from the top of their library until they reveal a land card, then puts those cards into their graveyard." });
const revokeDemise = () => card("Revoke Demise", "Sorcery", "{4}{B}", { cmc: 5, colors: ["B"], oracleText: "This spell costs {2} less to cast if it targets a creature card with mana value 3 or less.\nReturn target creature card from your graveyard to the battlefield. You gain 2 life." });
const oathswornKnight = () => card("Oathsworn Knight", "Creature — Human Knight", "{1}{B}{B}", { cmc: 3, colors: ["B"], power: "0", toughness: "0", oracleText: "This creature enters with four +1/+1 counters on it.\nThis creature attacks each combat if able.\nIf damage would be dealt to this creature while it has a +1/+1 counter on it, prevent that damage and remove a +1/+1 counter from it." });
const relicAmulet = () => card("Relic Amulet", "Artifact", "{2}", { cmc: 2, oracleText: "Whenever you cast an instant, sorcery, or Wizard spell, put a charge counter on this artifact.\n{2}, {T}, Remove all charge counters from this artifact: It deals that much damage to target creature." });
const seedsOfInnocence = () => card("Seeds of Innocence", "Sorcery", "{1}{G}{G}", { cmc: 3, colors: ["G"], oracleText: "Destroy all artifacts. They can't be regenerated. The controller of each of those artifacts gains life equal to its mana value." });
const spellpyrePhoenix = () => card("Spellpyre Phoenix", "Creature — Phoenix", "{3}{R}{R}", { cmc: 5, colors: ["R"], power: "4", toughness: "2", keywords: ["Flying"], oracleText: "Flying\nWhen this creature enters, you may return target instant or sorcery card with a cycling ability from your graveyard to your hand.\nAt the beginning of each end step, if you cycled two or more cards this turn, return this card from your graveyard to your hand." });
const firemaneAngel = () => card("Firemane Angel", "Creature — Angel", "{3}{R}{W}{W}", { cmc: 6, colors: ["R","W"], power: "4", toughness: "3", keywords: ["Flying","First strike"], oracleText: "Flying, first strike\nAt the beginning of your upkeep, if Firemane Angel is in your graveyard or on the battlefield, you may gain 1 life.\n{6}{R}{R}{W}{W}: Return this card from your graveyard to the battlefield. Activate only during your upkeep." });
const urgorosTheEmptyOne = () => card("Urgoros, the Empty One", "Legendary Creature — Specter", "{4}{B}{B}", { cmc: 6, colors: ["B"], power: "4", toughness: "3", keywords: ["Flying"], oracleText: "Flying\nWhenever Urgoros deals combat damage to a player, that player discards a card at random. If the player can't, you draw a card." });
const gatherThePack = () => card("Gather the Pack", "Sorcery", "{1}{G}", { cmc: 2, colors: ["G"], keywords: ["Spell mastery"], oracleText: "Reveal the top five cards of your library. You may put a creature card from among them into your hand. Put the rest into your graveyard.\nSpell mastery — If there are two or more instant and/or sorcery cards in your graveyard, put up to two creature cards from among the revealed cards into your hand instead of one." });
const necromanticSummons = () => card("Necromantic Summons", "Sorcery", "{4}{B}", { cmc: 5, colors: ["B"], keywords: ["Spell mastery"], oracleText: "Put target creature card from a graveyard onto the battlefield under your control.\nSpell mastery — If there are two or more instant and/or sorcery cards in your graveyard, that creature enters with two additional +1/+1 counters on it." });
const foulRenewal = () => card("Foul Renewal", "Instant", "{3}{B}", { cmc: 4, colors: ["B"], oracleText: "Return target creature card from your graveyard to your hand. Target creature gets -X/-X until end of turn, where X is the toughness of the card returned this way." });
const lyzoldaTheBloodWitch = () => card("Lyzolda, the Blood Witch", "Legendary Creature — Human Cleric", "{1}{B}{R}", { cmc: 3, colors: ["B","R"], power: "3", toughness: "1", oracleText: "{2}, Sacrifice a creature: Lyzolda deals 2 damage to any target if the sacrificed creature was red. Draw a card if the sacrificed creature was black." });
const magneticSnuffler = () => card("Magnetic Snuffler", "Artifact Creature — Construct", "{5}", { cmc: 5, power: "4", toughness: "4", oracleText: "When this creature enters, return target Equipment card from your graveyard to the battlefield attached to this creature.\nWhenever you sacrifice an artifact, put a +1/+1 counter on this creature." });
const rupture = () => card("Rupture", "Sorcery", "{2}{R}", { cmc: 3, colors: ["R"], oracleText: "Sacrifice a creature. Rupture deals damage equal to that creature's power to each creature without flying and each player." });
const hogMonkeyRampage = () => card("Hog-Monkey Rampage", "Instant", "{1}{R/G}", { cmc: 2, colors: ["G","R"], keywords: ["Fight"], oracleText: "Choose target creature you control and target creature an opponent controls. Put a +1/+1 counter on the creature you control if it has power 4 or greater. Then those creatures fight each other. (Each deals damage equal to its power to the other.)" });
const roilingTerrain = () => card("Roiling Terrain", "Sorcery", "{2}{R}{R}", { cmc: 4, colors: ["R"], oracleText: "Destroy target land, then Roiling Terrain deals damage to that land's controller equal to the number of land cards in that player's graveyard." });
const lictor = () => card("Lictor", "Creature — Tyranid", "{3}{G}", { cmc: 4, colors: ["G"], power: "3", toughness: "3", keywords: ["Pheromone Trail","Flash"], oracleText: "Flash\nPheromone Trail — When this creature enters, if a creature entered the battlefield under an opponent's control this turn, create a 3/3 green Tyranid Warrior creature token with trample." });
const thallidOmnivore = () => card("Thallid Omnivore", "Creature — Fungus", "{3}{B}", { cmc: 4, colors: ["B"], power: "3", toughness: "3", oracleText: "{1}, Sacrifice another creature: This creature gets +2/+2 until end of turn. If a Saproling was sacrificed this way, you gain 2 life." });
const patronOfTheNezumi = () => card("Patron of the Nezumi", "Legendary Creature — Spirit", "{5}{B}{B}", { cmc: 7, colors: ["B"], power: "6", toughness: "6", keywords: ["Offering"], oracleText: "Rat offering (You may cast this spell any time you could cast an instant by sacrificing a Rat and paying the difference in mana costs between this and the sacrificed Rat. Mana cost includes color.)\nWhenever a permanent is put into an opponent's graveyard, that player loses 1 life." });
const golgariBrownscale = () => card("Golgari Brownscale", "Creature — Lizard", "{1}{G}{G}", { cmc: 3, colors: ["G"], power: "2", toughness: "3", keywords: ["Dredge","Mill"], oracleText: "When this card is put into your hand from your graveyard, you gain 2 life.\nDredge 2 (If you would draw a card, you may mill two cards instead. If you do, return this card from your graveyard to your hand.)" });
const stormwingEntity = () => card("Stormwing Entity", "Creature — Elemental", "{3}{U}{U}", { cmc: 5, colors: ["U"], power: "3", toughness: "3", keywords: ["Scry","Flying","Prowess"], oracleText: "This spell costs {2}{U} less to cast if you've cast an instant or sorcery spell this turn.\nFlying\nProwess (Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn.)\nWhen this creature enters, scry 2." });
const closingStatement = () => card("Closing Statement", "Instant", "{3}{W}{B}", { cmc: 5, colors: ["B","W"], oracleText: "This spell costs {2} less to cast during your end step.\nDestroy target creature or planeswalker you don't control. Put a +1/+1 counter on up to one target creature you control." });
const momentOfGlory = () => card("Moment of Glory", "Sorcery", "{W}", { cmc: 1, colors: ["W"], keywords: ["Flashback"], oracleText: "Put a +1/+1 counter on target creature you control. If this spell was cast from a graveyard, also put a +1/+1 counter on each other creature you control.\nFlashback {4}{W} (You may cast this card from your graveyard for its flashback cost. Then exile it.)" });
const shadowOfDoubt = () => card("Shadow of Doubt", "Instant", "{U/B}{U/B}", { cmc: 2, colors: ["B","U"], oracleText: "({U/B} can be paid with either {U} or {B}.)\nPlayers can't search libraries this turn.\nDraw a card." });

const throneOfEmpires = () => card("Throne of Empires", "Artifact", "{4}", { cmc: 4, oracleText: "{1}, {T}: Create a 1/1 white Soldier creature token. Create five of those tokens instead if you control artifacts named Crown of Empires and Scepter of Empires." });
const scepterOfEmpires = () => card("Scepter of Empires", "Artifact", "{3}", { cmc: 3, oracleText: "{T}: This artifact deals 1 damage to target player or planeswalker. It deals 3 damage instead if you control artifacts named Crown of Empires and Throne of Empires." });
const crownOfEmpires = () => card("Crown of Empires", "Artifact", "{2}", { cmc: 2, oracleText: "{3}, {T}: Tap target creature. Gain control of that creature instead if you control artifacts named Scepter of Empires and Throne of Empires." });

const ertaisScorn = () => card("Ertai's Scorn", "Instant", "{1}{U}{U}", { cmc: 3, colors: ["U"], oracleText: "This spell costs {U} less to cast if an opponent cast two or more spells this turn.\nCounter target spell." });
const noOneLeftBehind = () => card("No One Left Behind", "Sorcery", "{4}{B}", { cmc: 5, colors: ["B"], oracleText: "This spell costs {3} less to cast if it targets a creature card with mana value 3 or less.\nReturn target creature card from your graveyard to the battlefield." });
const rootingMoloch = () => card("Rooting Moloch", "Creature — Lizard", "{4}{R}", { cmc: 5, colors: ["R"], power: "4", toughness: "4", keywords: ["Cycling"], oracleText: "When this creature enters, exile target card with a cycling ability from your graveyard. Until the end of your next turn, you may play that card.\nCycling {2} ({2}, Discard this card: Draw a card.)" });

// Test cards.
const vanilla = (name: string, typeLine: string, cost: string, cmc: number, p: number, t: number, extra: Partial<CardDef> = {}) => card(name, typeLine, cost, { cmc, power: String(p), toughness: String(t), ...extra });
const bolt = () => card("Test Bolt", "Instant", "{R}", { cmc: 1, colors: ["R"], oracleText: "Test Bolt deals 3 damage to any target." });
const opt = () => card("Test Opt", "Instant", "{U}", { cmc: 1, colors: ["U"], oracleText: "Draw a card." });
const murder = () => card("Test Murder", "Instant", "{1}{B}{B}", { cmc: 3, colors: ["B"], oracleText: "Destroy target creature." });
const raiseDead = () => card("Test Raise Dead", "Sorcery", "{B}", { cmc: 1, colors: ["B"], oracleText: "Return target creature card from your graveyard to your hand." });
const cycler = (name: string) => card(name, "Instant", "{U}", { cmc: 1, colors: ["U"], keywords: ["Cycling"], oracleText: "Draw a card.\nCycling {1} ({1}, Discard this card: Draw a card.)" });
const stone = (name: string, cost: string) => card(name, "Artifact", cost, { cmc: cost.match(/\d+/) ? Number(cost.match(/\d+/)![0]) : 0, oracleText: "" });
const tutor = () => card("Test Tutor", "Sorcery", "{G}", { cmc: 1, colors: ["G"], oracleText: "Search your library for a basic land card, reveal it, put it into your hand, then shuffle." });
const blade = () => card("Test Blade", "Artifact — Equipment", "{1}", { cmc: 1, oracleText: "Equipped creature gets +2/+0.\nEquip {1}" });
const forestCard = () => card("Forest", "Basic Land — Forest", "", { cmc: 0 });

describe("Lane B round 43 cards", () => {
  it("are fully supported", () => {
    supported(destroyTheEvidence(), revokeDemise(), oathswornKnight(), relicAmulet(), seedsOfInnocence(), spellpyrePhoenix(), firemaneAngel(), urgorosTheEmptyOne(), gatherThePack(), necromanticSummons(), foulRenewal(), lyzoldaTheBloodWitch(), magneticSnuffler(), rupture(), hogMonkeyRampage(), roilingTerrain(), lictor(), thallidOmnivore(), patronOfTheNezumi(), golgariBrownscale(), stormwingEntity(), closingStatement(), momentOfGlory(), shadowOfDoubt(), throneOfEmpires(), scepterOfEmpires(), crownOfEmpires(), ertaisScorn(), noOneLeftBehind(), rootingMoloch());
  });
});

describe("Destroy the Evidence", () => {
  it("destroys the land, then its controller reveals until a land card and puts all of them into their graveyard", () => {
    const { s: s0, ap, ids, opp } = setup([destroyTheEvidence()]);
    const land = putOnBattlefield(s0, opp, forestCard());
    const deep = toZone(s0, opp, forestCard(), "library");
    const a = toZone(s0, opp, vanilla("Bear A", "Creature — Bear", "{1}{G}", 2, 2, 2), "library");
    const b = toZone(s0, opp, vanilla("Bear B", "Creature — Bear", "{1}{G}", 2, 2, 2), "library");
    const under = s0.players[opp]!.library[3]!;
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(land)]));
    expect([zone(s, land), zone(s, b), zone(s, a), zone(s, deep), zone(s, under)]).toEqual(["graveyard", "graveyard", "graveyard", "graveyard", "library"]);
    expect(s.players[ap]!.graveyard.filter((id) => s.objects[id]!.zone === "graveyard").length).toBe(1);
  });
});

describe("Revoke Demise", () => {
  it("costs {2} less only when it targets a creature card with mana value 3 or less", () => {
    const { s, ap, ids } = setup([revokeDemise()]);
    const small = toZone(s, ap, vanilla("Small", "Creature — Bear", "{2}{B}", 3, 2, 2), "graveyard");
    const big = toZone(s, ap, vanilla("Big", "Creature — Beast", "{3}{B}", 4, 4, 4), "graveyard");
    expect([costNow(s, ap, ids[0]!, [tgt(small)]), costNow(s, ap, ids[0]!, [tgt(big)])]).toEqual([3, 5]);
    const after = settle(castNow(s, ap, ids[0]!, [tgt(small)]));
    expect([zone(after, small), life(after, ap)]).toEqual(["battlefield", 42]);
  });
});

describe("Oathsworn Knight", () => {
  it("prevents the damage and removes one +1/+1 counter, not one per damage", () => {
    const { s: s0, ap, ids } = setup([bolt()]);
    const knight = putOnBattlefield(s0, ap, oathswornKnight());
    s0.objects[knight]!.counters["+1/+1"] = 4;
    invalidateCharacteristics(s0);
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(knight)]));
    expect([zone(s, knight), counters(s, knight), s.objects[knight]!.damage ?? 0]).toEqual(["battlefield", 3, 0]);
  });
});

describe("Relic Amulet", () => {
  it("gets a charge counter for an instant, then deals that much damage after removing all of them", () => {
    const { s: s0, ap, ids, opp } = setup([opt()]);
    const amulet = putOnBattlefield(s0, ap, relicAmulet());
    let s = settle(castNow(s0, ap, ids[0]!));
    expect(counters(s, amulet, "charge")).toBe(1);
    s.objects[amulet]!.counters.charge = 3;
    const beast = putOnBattlefield(s, opp, vanilla("Opp Beast", "Creature — Beast", "{2}{G}", 3, 3, 3));
    s = settle(run(s, planActivate(s, ap, amulet, 0, [tgt(beast)])));
    expect([zone(s, beast), counters(s, amulet, "charge")]).toEqual(["graveyard", 0]);
  });
  it("counts a Wizard creature spell but not another creature spell", () => {
    const { s: s0, ap, ids } = setup([vanilla("Test Wizard", "Creature — Human Wizard", "{U}", 1, 1, 1), vanilla("Test Beast", "Creature — Beast", "{G}", 1, 1, 1)]);
    const amulet = putOnBattlefield(s0, ap, relicAmulet());
    let s = settle(castNow(s0, ap, ids[0]!));
    s = settle(castNow(s, ap, ids[1]!));
    expect(counters(s, amulet, "charge")).toBe(1);
  });
});

describe("Seeds of Innocence", () => {
  it("destroys all artifacts and each controller gains life equal to the mana values of theirs", () => {
    const { s: s0, ap, ids, opp } = setup([seedsOfInnocence()]);
    const mine = putOnBattlefield(s0, ap, stone("Stone Three", "{3}"));
    const t1 = putOnBattlefield(s0, opp, stone("Stone Two", "{2}"));
    const t2 = putOnBattlefield(s0, opp, stone("Stone Four", "{4}"));
    const third = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    const zero = putOnBattlefield(s0, third, stone("Stone Zero", "{0}"));
    const s = settle(castNow(s0, ap, ids[0]!));
    expect([mine, t1, t2, zero].map((id) => zone(s, id))).toEqual(["graveyard", "graveyard", "graveyard", "graveyard"]);
    expect([life(s, ap), life(s, opp), life(s, third)]).toEqual([43, 46, 40]);
  });
});

describe("Spellpyre Phoenix", () => {
  it("returns an instant card with cycling from your graveyard as it enters", () => {
    const { s: s0, ap, ids } = setup([spellpyrePhoenix()]);
    const c = toZone(s0, ap, cycler("Cycle A"), "graveyard");
    toZone(s0, ap, opt(), "graveyard");
    const s = settle(castNow(s0, ap, ids[0]!));
    expect([zone(s, ids[0]!), zone(s, c)]).toEqual(["battlefield", "hand"]);
  });
  it("comes back from the graveyard at the end step only after two cards were cycled this turn", () => {
    const { s: s0, ap, ids } = setup([cycler("Cycle A"), cycler("Cycle B")]);
    const phoenix = toZone(s0, ap, spellpyrePhoenix(), "graveyard");
    const cycle = (s: GameState, id: string) => settle(run(s, planActivate(s, ap, id, compileCard(s.cards[s.objects[id]!.cardId]!).activated.findIndex((a) => a.cycling))));
    let s = cycle(s0, ids[0]!);
    const one = goUntil(structuredClone(s), (x) => x.step === "cleanup" || x.activePlayer !== ap);
    expect(zone(one, phoenix)).toBe("graveyard");
    s = cycle(s, ids[1]!);
    s = goUntil(s, (x) => x.step === "cleanup" || x.activePlayer !== ap);
    expect(zone(s, phoenix)).toBe("hand");
  });
});

describe("Firemane Angel", () => {
  it("gains 1 life at your upkeep from the graveyard or the battlefield, and not at other players' upkeeps", () => {
    const { s: s0, ap } = setup([]);
    toZone(s0, ap, firemaneAngel(), "graveyard");
    const other = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!;
    toZone(s0, other, firemaneAngel(), "graveyard");
    putOnBattlefield(s0, other, firemaneAngel());
    const turn = s0.turn;
    let s = goUntil(s0, (x) => x.turn > turn && x.activePlayer === other && x.step === "draw");
    expect([life(s, ap), life(s, other)]).toEqual([40, 42]);
    s = goUntil(s, (x) => x.activePlayer === ap && x.step === "draw");
    expect([life(s, ap), life(s, other)]).toEqual([41, 42]);
  });
  it("does nothing if it moved from the graveyard to the battlefield before the ability resolved (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const angel = toZone(s0, ap, firemaneAngel(), "graveyard");
    const turn = s0.turn;
    let s = goUntil(s0, (x) => x.turn > turn && x.activePlayer === ap && x.step === "upkeep" && x.stack.length > 0);
    moveObject(s, angel, "battlefield", { controller: ap });
    s = goUntil(s, (x) => x.step === "draw");
    expect([zone(s, angel), life(s, ap)]).toEqual(["battlefield", 40]);
  });
  it("on the battlefield too, once", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, firemaneAngel());
    const turn = s0.turn;
    const s = goUntil(s0, (x) => x.turn > turn && x.activePlayer === ap && x.step === "draw");
    expect(life(s, ap)).toBe(41);
  });
});

describe("Urgoros, the Empty One", () => {
  it("makes the player discard at random, and you draw only if they couldn't", () => {
    const { s: s0, ap, opp } = setup([]);
    onlyHand(s0, ap, []);
    const urgoros = putOnBattlefield(s0, ap, urgorosTheEmptyOne());
    const full = s0.players[opp]!.hand.length;
    let s = goUntil(attackWith(structuredClone(s0), [urgoros], opp), (x) => x.step === "main2");
    expect([s.players[opp]!.hand.length, s.players[ap]!.hand.length, life(s, opp)]).toEqual([full - 1, 0, 36]);
    onlyHand(s0, opp, []);
    s = goUntil(attackWith(s0, [urgoros], opp), (x) => x.step === "main2");
    expect([s.players[opp]!.hand.length, s.players[ap]!.hand.length]).toEqual([0, 1]);
  });
});

describe("Gather the Pack", () => {
  const stack = (s: GameState, pid: PlayerId) => {
    const lands = [0, 1, 2].map(() => toZone(s, pid, forestCard(), "library"));
    const beasts = [toZone(s, pid, vanilla("Pack A", "Creature — Wolf", "{1}{G}", 2, 2, 2), "library"), toZone(s, pid, vanilla("Pack B", "Creature — Wolf", "{1}{G}", 2, 2, 2), "library")];
    return { lands, beasts };
  };
  it("puts one creature card into your hand, or up to two with spell mastery", () => {
    const { s: s0, ap, ids } = setup([gatherThePack()]);
    const { beasts } = stack(s0, ap);
    let s = settle(castNow(structuredClone(s0), ap, ids[0]!), at("searchLibrary", ap));
    expect(s.pending?.kind === "searchLibrary" && [s.pending.min, s.pending.max]).toEqual([0, 1]);
    toZone(s0, ap, opt(), "graveyard");
    toZone(s0, ap, card("Test Sorcery", "Sorcery", "{R}", { cmc: 1, oracleText: "Test Sorcery deals 1 damage to any target." }), "graveyard");
    s = settle(castNow(s0, ap, ids[0]!), at("searchLibrary", ap));
    expect(s.pending?.kind === "searchLibrary" && [s.pending.min, s.pending.max]).toEqual([0, 2]);
    s = settle(find(s, ap, beasts));
    expect(beasts.map((id) => zone(s, id))).toEqual(["hand", "hand"]);
  });
});

describe("Necromantic Summons", () => {
  it("puts a creature card from any graveyard onto the battlefield under your control, with two more counters with spell mastery", () => {
    const { s: s0, ap, ids, opp } = setup([necromanticSummons()]);
    const theirs = toZone(s0, opp, vanilla("Their Beast", "Creature — Beast", "{2}{G}", 3, 3, 3), "graveyard");
    let s = settle(castNow(structuredClone(s0), ap, ids[0]!, [tgt(theirs)]));
    expect([zone(s, theirs), s.objects[theirs]!.controller, counters(s, theirs)]).toEqual(["battlefield", ap, 0]);
    toZone(s0, ap, opt(), "graveyard");
    toZone(s0, ap, opt(), "graveyard");
    s = settle(castNow(s0, ap, ids[0]!, [tgt(theirs)]));
    expect([zone(s, theirs), counters(s, theirs), pt(s, theirs)]).toEqual(["battlefield", 2, "5/5"]);
  });
});

describe("Foul Renewal", () => {
  it("returns the card and gives the creature -X/-X equal to its toughness", () => {
    const { s: s0, ap, ids, opp } = setup([foulRenewal()]);
    const card4 = toZone(s0, ap, vanilla("Tough", "Creature — Beast", "{3}{G}", 4, 1, 4), "graveyard");
    const victim = putOnBattlefield(s0, opp, vanilla("Victim", "Creature — Beast", "{4}{G}", 5, 5, 5));
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(card4), tgt(victim)]));
    expect([zone(s, card4), pt(s, victim)]).toEqual(["hand", "1/1"]);
  });
  it("with the card gone, the creature is unaffected", () => {
    const { s: s0, ap, ids, opp } = setup([foulRenewal()]);
    const card4 = toZone(s0, ap, vanilla("Tough", "Creature — Beast", "{3}{G}", 4, 1, 4), "graveyard");
    const victim = putOnBattlefield(s0, opp, vanilla("Victim", "Creature — Beast", "{4}{G}", 5, 5, 5));
    let s = castNow(s0, ap, ids[0]!, [tgt(card4), tgt(victim)]);
    moveObject(s, card4, "exile");
    s = settle(s);
    expect([zone(s, card4), pt(s, victim)]).toEqual(["exile", "5/5"]);
  });
});

describe("Lyzolda, the Blood Witch", () => {
  it("deals 2 damage if the sacrificed creature was red and draws if it was black", () => {
    const { s: s0, ap, opp } = setup([]);
    onlyHand(s0, ap, []);
    const lyz = putOnBattlefield(s0, ap, lyzoldaTheBloodWitch());
    const red = putOnBattlefield(s0, ap, vanilla("Red One", "Creature — Goblin", "{R}", 1, 1, 1, { colors: ["R"] }));
    const black = putOnBattlefield(s0, ap, vanilla("Black One", "Creature — Rat", "{B}", 1, 1, 1, { colors: ["B"] }));
    const both = putOnBattlefield(s0, ap, vanilla("Both One", "Creature — Ogre", "{B}{R}", 2, 2, 2, { colors: ["B", "R"] }));
    const green = putOnBattlefield(s0, ap, vanilla("Green One", "Creature — Elf", "{G}", 1, 1, 1, { colors: ["G"] }));
    const use = (s: GameState, sac: string) => settle(run(s, planActivate(s, ap, lyz, 0, [ply(opp)], undefined, undefined, undefined, { sacrifice: [sac] })));
    let s = use(s0, red);
    expect([life(s, opp), s.players[ap]!.hand.length]).toEqual([38, 0]);
    s = use(s, black);
    expect([life(s, opp), s.players[ap]!.hand.length]).toEqual([38, 1]);
    s = use(s, both);
    expect([life(s, opp), s.players[ap]!.hand.length]).toEqual([36, 2]);
    s = use(s, green);
    expect([zone(s, green), life(s, opp), s.players[ap]!.hand.length]).toEqual(["graveyard", 36, 2]);
  });
});

describe("Magnetic Snuffler", () => {
  it("returns the Equipment card attached to it", () => {
    const { s: s0, ap, ids } = setup([magneticSnuffler()]);
    const eq = toZone(s0, ap, blade(), "graveyard");
    const s = settle(castNow(s0, ap, ids[0]!));
    expect([zone(s, eq), s.objects[eq]!.attachedTo, pt(s, ids[0]!)]).toEqual(["battlefield", ids[0], "6/4"]);
  });
  it("returns it unattached if the Snuffler has left the battlefield", () => {
    const { s: s0, ap, ids } = setup([magneticSnuffler()]);
    const eq = toZone(s0, ap, blade(), "graveyard");
    let s = settle(castNow(s0, ap, ids[0]!), (x) => x.stack.some((i) => i.kind !== "spell"));
    moveObject(s, ids[0]!, "graveyard");
    s = settle(s);
    expect([zone(s, eq), s.objects[eq]!.attachedTo]).toEqual(["battlefield", undefined]);
  });
});

describe("Rupture", () => {
  it("sacrifices a creature, then deals its power to each creature without flying and each player", () => {
    const { s: s0, ap, ids, opp } = setup([rupture()]);
    onlyHand(s0, ap, [ids[0]!]);
    const big = putOnBattlefield(s0, ap, vanilla("Big", "Creature — Beast", "{3}{G}", 4, 3, 3));
    const bear = putOnBattlefield(s0, opp, vanilla("Opp Bear", "Creature — Bear", "{1}{G}", 2, 2, 2));
    const bird = putOnBattlefield(s0, opp, vanilla("Opp Bird", "Creature — Bird", "{3}{W}", 4, 4, 4, { keywords: ["Flying"], oracleText: "Flying" }));
    const s = settle(castNow(s0, ap, ids[0]!));
    expect([zone(s, big), zone(s, bear), zone(s, bird), life(s, ap), life(s, opp)]).toEqual(["graveyard", "graveyard", "battlefield", 37, 37]);
  });
});

describe("Hog-Monkey Rampage", () => {
  it("puts a counter on your creature only if its power is 4 or greater, then they fight", () => {
    const { s: s0, ap, ids, opp } = setup([hogMonkeyRampage(), hogMonkeyRampage()]);
    const mine = putOnBattlefield(s0, ap, vanilla("Mine", "Creature — Ape", "{3}{G}", 4, 4, 4));
    const theirs = putOnBattlefield(s0, opp, vanilla("Theirs", "Creature — Boar", "{3}{R}", 4, 3, 5));
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(mine), tgt(theirs)]));
    expect([counters(s, mine), zone(s, theirs), zone(s, mine)]).toEqual([1, "graveyard", "battlefield"]);
    const small = putOnBattlefield(s, ap, vanilla("Small", "Creature — Ape", "{1}{G}", 2, 3, 3));
    const other = putOnBattlefield(s, opp, vanilla("Other", "Creature — Boar", "{1}{R}", 2, 2, 2));
    s = settle(castNow(s, ap, ids[1]!, [tgt(small), tgt(other)]));
    expect([counters(s, small), zone(s, other), zone(s, small)]).toEqual([0, "graveyard", "battlefield"]);
  });
});

describe("Roiling Terrain", () => {
  it("deals damage to the land's controller equal to the land cards in their graveyard, the destroyed one included", () => {
    const { s: s0, ap, ids, opp } = setup([roilingTerrain()]);
    const land = putOnBattlefield(s0, opp, forestCard());
    toZone(s0, opp, forestCard(), "graveyard");
    toZone(s0, opp, forestCard(), "graveyard");
    toZone(s0, opp, vanilla("Dead Bear", "Creature — Bear", "{1}{G}", 2, 2, 2), "graveyard");
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(land)]));
    expect([zone(s, land), life(s, opp), life(s, ap)]).toEqual(["graveyard", 37, 40]);
  });
});

describe("Lictor", () => {
  it("makes a 3/3 Tyranid Warrior only if a creature entered under an opponent's control this turn", () => {
    const { s: s0, ap, ids, opp } = setup([lictor()]);
    let s = settle(castNow(structuredClone(s0), ap, ids[0]!));
    const tokens = (x: GameState) => x.battlefield.filter((id) => x.objects[id]!.isToken && x.objects[id]!.controller === ap).length;
    expect(tokens(s)).toBe(0);
    const theirs = toZone(s0, opp, vanilla("Their Bear", "Creature — Bear", "{1}{G}", 2, 2, 2), "hand");
    moveObject(s0, theirs, "battlefield", { controller: opp });
    s = settle(castNow(s0, ap, ids[0]!));
    expect(tokens(s)).toBe(1);
  });
});

describe("Thallid Omnivore", () => {
  it("gets +2/+2, and you gain 2 life only if a Saproling was sacrificed", () => {
    const { s: s0, ap } = setup([]);
    const omni = putOnBattlefield(s0, ap, thallidOmnivore());
    const sap = putOnBattlefield(s0, ap, vanilla("Saproling", "Creature — Saproling", "", 0, 1, 1));
    const bear = putOnBattlefield(s0, ap, vanilla("Bear", "Creature — Bear", "{1}{G}", 2, 2, 2));
    const use = (s: GameState, sac: string) => settle(run(s, planActivate(s, ap, omni, 0, [], undefined, undefined, undefined, { sacrifice: [sac] })));
    let s = use(s0, bear);
    expect([pt(s, omni), life(s, ap)]).toEqual(["5/5", 40]);
    s = use(s, sap);
    expect([pt(s, omni), life(s, ap)]).toEqual(["7/7", 42]);
  });
});

describe("Patron of the Nezumi", () => {
  it("makes an opponent lose 1 life when a permanent goes to their graveyard, not you", () => {
    const { s: s0, ap, ids, opp } = setup([murder(), bolt()]);
    putOnBattlefield(s0, ap, patronOfTheNezumi());
    const theirs = putOnBattlefield(s0, opp, vanilla("Their Bear", "Creature — Bear", "{1}{G}", 2, 2, 2));
    const mine = putOnBattlefield(s0, ap, vanilla("My Bear", "Creature — Bear", "{1}{G}", 2, 2, 2));
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(theirs)]));
    s = settle(castNow(s, ap, ids[1]!, [tgt(mine)]));
    expect([life(s, opp), life(s, ap)]).toEqual([39, 40]);
  });
});

describe("Golgari Brownscale", () => {
  it("gains 2 life when it's returned from your graveyard to your hand", () => {
    const { s: s0, ap, ids } = setup([raiseDead()]);
    const scale = toZone(s0, ap, golgariBrownscale(), "graveyard");
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(scale)]));
    expect([zone(s, scale), life(s, ap)]).toEqual(["hand", 42]);
  });
  it("not when it's drawn from the library", () => {
    const { s: s0, ap, ids } = setup([opt()]);
    const scale = toZone(s0, ap, golgariBrownscale(), "library");
    const s = settle(castNow(s0, ap, ids[0]!));
    expect([zone(s, scale), life(s, ap)]).toEqual(["hand", 40]);
  });
});

describe("Stormwing Entity", () => {
  it("costs {2}{U} less once you've cast an instant or sorcery spell this turn", () => {
    const { s: s0, ap, ids } = setup([stormwingEntity(), opt()]);
    expect(costNow(s0, ap, ids[0]!)).toBe(5);
    const s = settle(castNow(s0, ap, ids[1]!));
    const c = spellCost(s, ap, s.objects[ids[0]!]!);
    expect([manaValue(c.cost) + c.extra, c.cost.symbols.filter((x) => x.kind === "colored").length]).toEqual([2, 1]);
  });
});

describe("Closing Statement", () => {
  it("costs {2} less during your end step, destroys and puts a counter on up to one of yours", () => {
    const { s: s0, ap, ids, opp } = setup([closingStatement()]);
    const theirs = putOnBattlefield(s0, opp, vanilla("Their Bear", "Creature — Bear", "{1}{G}", 2, 2, 2));
    const mine = putOnBattlefield(s0, ap, vanilla("My Bear", "Creature — Bear", "{1}{G}", 2, 2, 2));
    expect(costNow(s0, ap, ids[0]!)).toBe(5);
    let s = goUntil(s0, (x) => x.step === "end" && !x.stack.length && waitingOn(x) === ap);
    expect(costNow(s, ap, ids[0]!)).toBe(3);
    s = settle(castNow(s, ap, ids[0]!, [tgt(theirs), tgt(mine)]));
    expect([zone(s, theirs), counters(s, mine)]).toEqual(["graveyard", 1]);
  });
});

describe("Moment of Glory", () => {
  it("puts a counter on the target, and on each other creature you control when cast from a graveyard", () => {
    const { s: s0, ap, ids } = setup([momentOfGlory()]);
    const a = putOnBattlefield(s0, ap, vanilla("A", "Creature — Bear", "{1}{G}", 2, 2, 2));
    const b = putOnBattlefield(s0, ap, vanilla("B", "Creature — Bear", "{1}{G}", 2, 2, 2));
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(a)]));
    expect([counters(s, a), counters(s, b), zone(s, ids[0]!)]).toEqual([1, 0, "graveyard"]);
    s = settle(castNow(s, ap, ids[0]!, [tgt(a)], { via: "flashback" }));
    expect([counters(s, a), counters(s, b), zone(s, ids[0]!)]).toEqual([2, 1, "exile"]);
  });
});

describe("Shadow of Doubt", () => {
  it("stops searches this turn, and the library is still shuffled", () => {
    const { s: s0, ap, ids } = setup([shadowOfDoubt(), tutor()]);
    let s = settle(castNow(s0, ap, ids[0]!));
    const hand = s.players[ap]!.hand.length;
    s = settle(castNow(s, ap, ids[1]!));
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
  });
});

describe("Throne, Scepter and Crown of Empires", () => {
  const soldiers = (s: GameState, pid: PlayerId) => Object.values(s.objects).filter((o) => o.zone === "battlefield" && o.isToken && o.controller === pid && /Soldier/.test(s.cards[o.cardId]?.name ?? "")).length;
  it("Throne makes one Soldier, or five with the Crown and the Scepter", () => {
    const { s: s0, ap } = setup([]);
    const throne = putOnBattlefield(s0, ap, throneOfEmpires());
    let s = settle(run(s0, planActivate(s0, ap, throne, 0, [])));
    expect(soldiers(s, ap)).toBe(1);
    putOnBattlefield(s, ap, crownOfEmpires());
    putOnBattlefield(s, ap, scepterOfEmpires());
    s.objects[throne]!.tapped = false;
    s = settle(run(s, planActivate(s, ap, throne, 0, [])));
    expect(soldiers(s, ap)).toBe(6);
  });
  it("Scepter deals 1 damage, or 3 with the Crown and the Throne", () => {
    const { s: s0, ap, opp } = setup([]);
    const scepter = putOnBattlefield(s0, ap, scepterOfEmpires());
    let s = settle(run(s0, planActivate(s0, ap, scepter, 0, [{ kind: "player", id: opp }])));
    expect(life(s, opp)).toBe(39);
    putOnBattlefield(s, ap, crownOfEmpires());
    putOnBattlefield(s, ap, throneOfEmpires());
    s.objects[scepter]!.tapped = false;
    s = settle(run(s, planActivate(s, ap, scepter, 0, [{ kind: "player", id: opp }])));
    expect(life(s, opp)).toBe(36);
  });
  it("Crown taps the creature, or with the Scepter and the Throne gains control of it without tapping it", () => {
    const { s: s0, ap, opp } = setup([]);
    const crown = putOnBattlefield(s0, ap, crownOfEmpires());
    const a = putOnBattlefield(s0, opp, vanilla("Opp A", "Creature — Bear", "{1}{G}", 2, 2, 2));
    const b = putOnBattlefield(s0, opp, vanilla("Opp B", "Creature — Bear", "{1}{G}", 2, 2, 2));
    let s = settle(run(s0, planActivate(s0, ap, crown, 0, [tgt(a)])));
    expect([s.objects[a]!.tapped, controllerOf(s, s.objects[a]!)]).toEqual([true, opp]);
    putOnBattlefield(s, ap, scepterOfEmpires());
    putOnBattlefield(s, ap, throneOfEmpires());
    s.objects[crown]!.tapped = false;
    s = settle(run(s, planActivate(s, ap, crown, 0, [tgt(b)])));
    expect([s.objects[b]!.tapped, controllerOf(s, s.objects[b]!)]).toEqual([false, ap]);
  });
});

describe("Ertai's Scorn", () => {
  it("costs {U} less once one opponent has cast two spells this turn, not {U} for each such opponent", () => {
    const { s, ap, ids, opp } = setup([ertaisScorn()]);
    const other = s.turnOrder.find((p) => p !== ap && p !== opp)!;
    expect(costNow(s, ap, ids[0]!)).toBe(3);
    s.castThisTurn = [{ player: opp, card: "x" }, { player: other, card: "y" }];
    expect(costNow(s, ap, ids[0]!)).toBe(3);
    s.castThisTurn.push({ player: opp, card: "z" }, { player: other, card: "w" });
    const c = spellCost(s, ap, s.objects[ids[0]!]!);
    expect([manaValue(c.cost) + c.extra, c.cost.symbols.filter((x) => x.kind === "colored").length]).toEqual([2, 1]);
  });
});

describe("No One Left Behind", () => {
  it("costs {3} less only when it targets a creature card with mana value 3 or less", () => {
    const { s, ap, ids } = setup([noOneLeftBehind()]);
    const small = toZone(s, ap, vanilla("Small", "Creature — Bear", "{2}{B}", 3, 2, 2), "graveyard");
    const big = toZone(s, ap, vanilla("Big", "Creature — Beast", "{3}{B}", 4, 4, 4), "graveyard");
    expect([costNow(s, ap, ids[0]!, [tgt(small)]), costNow(s, ap, ids[0]!, [tgt(big)])]).toEqual([2, 5]);
    const after = settle(castNow(s, ap, ids[0]!, [tgt(small)]));
    expect(zone(after, small)).toBe("battlefield");
  });
});

describe("Rooting Moloch", () => {
  it("exiles a card with cycling from your graveyard, and you may play it", () => {
    const { s: s0, ap, ids } = setup([rootingMoloch()]);
    const c = toZone(s0, ap, cycler("Cycle A"), "graveyard");
    const s = settle(castNow(s0, ap, ids[0]!));
    expect(zone(s, c)).toBe("exile");
    expect(planCast(s, ap, c)).not.toBeNull();
  });
});
