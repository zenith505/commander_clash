// Lane B, round 48: the cards the earlier rounds skipped, least played first (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, card, mountain, putOnBattlefield, scry, setup, swamp } from "./helpers";
import { abilitiesOf, botActions, characteristics, controllerOf, dealDamage, invalidateCharacteristics, isFullySupported, legalTargets, nameOf, objectSource, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PlayerId, type TargetChoice } from "../src";

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

const toBlocks = (s: GameState) => {
  for (let i = 0; i < 50 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const tapLands = (s: GameState, pid: PlayerId, keep: string[] = []) => {
  for (const id of s.battlefield) if (s.objects[id]!.controller === pid && !keep.includes(id) && s.cards[s.objects[id]!.cardId]!.typeLine.includes("Land")) s.objects[id]!.tapped = true;
};

// Real oracle text (Scryfall).
const auriokSurvivors = () => card("Auriok Survivors", "Creature — Human Soldier", "{5}{W}", { cmc: 6, colors: ["W"], power: "4", toughness: "6", oracleText: "When this creature enters, you may return target Equipment card from your graveyard to the battlefield. If you do, you may attach it to this creature." });
const avenWarcraft = () => card("Aven Warcraft", "Instant", "{2}{W}", { cmc: 3, colors: ["W"], keywords: ["Threshold"], oracleText: "Creatures you control get +0/+2 until end of turn.\nThreshold — If there are seven or more cards in your graveyard, choose a color. Creatures you control also gain protection from the chosen color until end of turn." });
const benefactorsDraught = () => card("Benefactor's Draught", "Instant", "{1}{G}", { cmc: 2, colors: ["G"], oracleText: "Untap all creatures. Until end of turn, whenever a creature an opponent controls blocks, draw a card.\nDraw a card." });
const bogardanPhoenix = () => card("Bogardan Phoenix", "Creature — Phoenix", "{2}{R}{R}{R}", { cmc: 5, colors: ["R"], power: "3", toughness: "3", keywords: ["Flying"], oracleText: "Flying\nWhen this creature dies, exile it if it had a death counter on it. Otherwise, return it to the battlefield under your control and put a death counter on it." });
const chlorophant = () => card("Chlorophant", "Creature — Elemental", "{G}{G}{G}", { cmc: 3, colors: ["G"], power: "1", toughness: "1", keywords: ["Threshold"], oracleText: "At the beginning of your upkeep, you may put a +1/+1 counter on this creature.\nThreshold — As long as there are seven or more cards in your graveyard, this creature has \"At the beginning of your upkeep, you may put another +1/+1 counter on this creature.\"" });
const curiousCadaver = () => card("Curious Cadaver", "Creature — Zombie Detective", "{2}{U}{B}", { cmc: 4, colors: ["B","U"], power: "3", toughness: "1", keywords: ["Flying"], oracleText: "Flying\nWhen you sacrifice a Clue, return this card from your graveyard to your hand." });
const drakeFamiliar = () => card("Drake Familiar", "Creature — Drake", "{1}{U}", { cmc: 2, colors: ["U"], power: "2", toughness: "1", keywords: ["Flying"], oracleText: "Flying\nWhen this creature enters, sacrifice it unless you return an enchantment to its owner's hand." });
const goblinSappers = () => card("Goblin Sappers", "Creature — Goblin", "{1}{R}", { cmc: 2, colors: ["R"], power: "1", toughness: "1", oracleText: "{R}{R}, {T}: Target creature you control can't be blocked this turn. Destroy it and this creature at end of combat.\n{R}{R}{R}{R}, {T}: Target creature you control can't be blocked this turn. Destroy it at end of combat." });
const lithomancersFocus = () => card("Lithomancer's Focus", "Instant", "{W}", { cmc: 1, colors: ["W"], oracleText: "Target creature gets +2/+2 until end of turn. Prevent all damage that would be dealt to that creature this turn by colorless sources." });
const lumengridAugur = () => card("Lumengrid Augur", "Creature — Vedalken Wizard", "{3}{U}", { cmc: 4, colors: ["U"], power: "2", toughness: "2", oracleText: "{1}, {T}: Target player draws a card, then discards a card. If that player discards an artifact card this way, untap this creature." });
const magmasaur = () => card("Magmasaur", "Creature — Elemental Dinosaur", "{3}{R}{R}", { cmc: 5, colors: ["R"], power: "0", toughness: "0", oracleText: "This creature enters with five +1/+1 counters on it.\nAt the beginning of your upkeep, you may remove a +1/+1 counter from this creature. If you don't, sacrifice this creature and it deals damage equal to the number of +1/+1 counters on it to each creature without flying and each player." });
const quarryColossus = () => card("Quarry Colossus", "Creature — Giant", "{5}{W}{W}", { cmc: 7, colors: ["W"], power: "5", toughness: "6", oracleText: "When this creature enters, put target creature into its owner's library just beneath the top X cards of that library, where X is the number of Plains you control." });
const raftSecurityOfficer = () => card("Raft Security Officer", "Creature — Human Soldier", "{1}{W}", { cmc: 2, colors: ["W"], power: "1", toughness: "3", oracleText: "{2}, {T}: Tap target creature. This ability costs {1} less to activate if it targets a creature with power 3 or less." });
const sacredGuide = () => card("Sacred Guide", "Creature — Human Cleric", "{W}", { cmc: 1, colors: ["W"], power: "1", toughness: "1", oracleText: "{1}{W}, Sacrifice this creature: Reveal cards from the top of your library until you reveal a white card. Put that card into your hand and exile all other cards revealed this way." });
const scarabOfTheUnseen = () => card("Scarab of the Unseen", "Artifact", "{2}", { cmc: 2, colors: [], oracleText: "{T}, Sacrifice this artifact: Return all Auras attached to target permanent you own to their owners' hands. Draw a card at the beginning of the next turn's upkeep." });
const tetsukoUmezawaPursuer = () => card("Tetsuko Umezawa, Pursuer", "Legendary Creature — Human Mercenary", "{3}{R}", { cmc: 4, colors: ["R"], power: "2", toughness: "4", keywords: ["Prowess","Double strike"], oracleText: "Double strike\nProwess (Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn.)\nWhenever a creature an opponent controls with power or toughness 1 or less blocks, Tetsuko Umezawa deals 1 damage to that creature's controller." });
const viciousBetrayal = () => card("Vicious Betrayal", "Sorcery", "{3}{B}{B}", { cmc: 5, colors: ["B"], oracleText: "As an additional cost to cast this spell, sacrifice any number of creatures.\nTarget creature gets +2/+2 until end of turn for each creature sacrificed this way." });
const visions = () => card("Visions", "Sorcery", "{W}", { cmc: 1, colors: ["W"], oracleText: "Look at the top five cards of target player's library. You may then have that player shuffle that library." });
const whipkeeper = () => card("Whipkeeper", "Creature — Dwarf", "{2}{R}{R}", { cmc: 4, colors: ["R"], power: "1", toughness: "1", oracleText: "{T}: This creature deals damage to target creature equal to the damage already dealt to it this turn." });
const wickedAkuba = () => card("Wicked Akuba", "Creature — Spirit", "{B}{B}", { cmc: 2, colors: ["B"], power: "2", toughness: "2", oracleText: "{B}: Target player dealt damage by this creature this turn loses 1 life." });
const brainPry = () => card("Brain Pry", "Sorcery", "{1}{B}", { cmc: 2, colors: ["B"], oracleText: "Choose a nonland card name. Target player reveals their hand. That player discards a card with that name. If they can't, you draw a card." });
const agonizingMemories = () => card("Agonizing Memories", "Sorcery", "{2}{B}{B}", { cmc: 4, colors: ["B"], oracleText: "Look at target player's hand and choose two cards from it. Put them on top of that player's library in any order." });
const vodaSeaScavenger = () => card("Voda Sea Scavenger", "Creature — Merfolk Rogue", "{2}{U}", { cmc: 3, colors: ["U"], power: "3", toughness: "2", keywords: ["Domain"], oracleText: "Domain — When this creature enters, look at the top X cards of your library, where X is the number of basic land types among lands you control. You may put one of those cards on top of your library. Put the rest on the bottom of your library in a random order." });
const daringSleuth = () => scry("transform", [
  { name: "Daring Sleuth", mana_cost: "{1}{U}", type_line: "Creature — Human Rogue", power: "2", toughness: "1", oracle_text: "When you sacrifice a Clue, transform this creature." },
  { name: "Bearer of Overwhelming Truths", type_line: "Creature — Human Wizard", color_indicator: ["U"], power: "3", toughness: "2", oracle_text: "Prowess (Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn.)\nWhenever this creature deals combat damage to a player, investigate. (Create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")" },
], { keywords: ["Prowess", "Investigate", "Transform"] });

// Test cards.
const vanilla = (name: string, typeLine: string, cost: string, cmc: number, p: number, t: number, extra: Partial<CardDef> = {}) => card(name, typeLine, cost, { cmc, power: String(p), toughness: String(t), ...extra });
const bearC = (name = "Plain Bear", p = 2, t = 2, colors: CardDef["colors"] = ["G"]) => vanilla(name, "Creature — Bear", "{1}{G}", 2, p, t, { colors });
const flyer = (name = "Test Flyer", p = 1, t = 1) => vanilla(name, "Creature — Bird", "{1}{W}", 2, p, t, { colors: ["W"], keywords: ["Flying"], oracleText: "Flying" });
const sword = () => card("Test Sword", "Artifact — Equipment", "{1}", { cmc: 1, keywords: ["Equip"], oracleText: "Equipped creature gets +1/+1.\nEquip {1}" });
const aura = (name: string) => card(name, "Enchantment — Aura", "{W}", { cmc: 1, colors: ["W"], keywords: ["Enchant"], oracleText: "Enchant creature" });
const anthem = () => card("Test Anthem", "Enchantment", "{2}{W}", { cmc: 3, colors: ["W"], oracleText: "Creatures you control get +0/+1." });
const clue = () => card("Clue", "Token Artifact — Clue", "", { oracleText: "{2}, Sacrifice this token: Draw a card." });
const rock = () => card("Test Rock", "Artifact", "{1}", { cmc: 1 });
const bolt = () => card("Lightning Bolt", "Instant", "{R}", { cmc: 1, colors: ["R"], oracleText: "Lightning Bolt deals 3 damage to any target." });
const opt = () => card("Test Opt", "Instant", "{U}", { cmc: 1, colors: ["U"], oracleText: "Draw a card." });
const whiteCard = () => card("Test White", "Instant", "{W}", { cmc: 1, colors: ["W"], oracleText: "You gain 1 life." });
const golem = () => vanilla("Test Golem", "Artifact Creature — Golem", "{3}", 3, 3, 3, { colors: [] });

const handSize = (s: GameState, pid: PlayerId) => s.players[pid]!.hand.length;
const answerMay = (s: GameState, pid: PlayerId, yes: boolean) => act(s, { type: "chooseMay", player: pid, yes });
const attach = (s: GameState, id: string, host: string) => {
  s.objects[id]!.attachedTo = host;
  invalidateCharacteristics(s);
};
const ability = (s: GameState, id: string, re: RegExp) => abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => re.test(a.text ?? ""));
const makeToken = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.isToken = true;
  invalidateCharacteristics(s);
  return id;
};
/** Passes until `pid` is asked to choose targets for a trigger, then chooses `targets`. */
const triggerTargets = (s: GameState, pid: PlayerId, targets: TargetChoice[]) => {
  s = settle(s, at("chooseTargets", pid));
  expect(s.pending?.kind).toBe("chooseTargets");
  return act(s, { type: "chooseTargets", player: pid, targets } as Action);
};
/** Fills `pid`'s graveyard to `n` cards. */
const fillYard = (s: GameState, pid: PlayerId, n: number) => {
  while (s.players[pid]!.graveyard.length < n) toZone(s, pid, opt(), "graveyard");
};

describe("Lane B round 48", () => {
  it("are fully supported", () => {
    supported(auriokSurvivors(), avenWarcraft(), benefactorsDraught(), bogardanPhoenix(), chlorophant(), curiousCadaver(), daringSleuth(), drakeFamiliar(), goblinSappers(), lithomancersFocus(), lumengridAugur(), magmasaur(), quarryColossus(), raftSecurityOfficer(), sacredGuide(), scarabOfTheUnseen(), tetsukoUmezawaPursuer(), viciousBetrayal(), visions(), whipkeeper(), wickedAkuba(), brainPry(), agonizingMemories(), vodaSeaScavenger());
  });
  it("Visions: you look at the top five cards of a player's library without reordering them, then may have them shuffle", () => {
    const { s: s0, ap, opp, ids } = setup([visions()]);
    const top = s0.players[opp]!.library.slice(0, 5);
    let s = castNow(s0, ap, ids[0]!, [ply(opp)]);
    s = settle(s, at("arrangeTop", ap));
    expect(s.pending).toMatchObject({ kind: "arrangeTop", how: "look", cards: top, owner: opp });
    // Looked at only: no new order (rulings).
    expect(() => act(s, { type: "arrangeTop", player: ap, top: [top[1]!, top[0]!, ...top.slice(2)], away: [] })).toThrow(/order/);
    s = act(s, { type: "arrangeTop", player: ap, top, away: [] });
    expect(s.pending?.kind).toBe("chooseMay");
    const kept = answerMay(s, ap, false);
    expect(kept.players[opp]!.library.slice(0, 5)).toEqual(top);
    const shuffled = settle(answerMay(s, ap, true));
    expect(shuffled.players[opp]!.library.slice(0, 5)).not.toEqual(top);
    expect(shuffled.players[opp]!.library.length).toBe(s0.players[opp]!.library.length);
  });

  it("Drake Familiar: returns any player's enchantment to its owner's hand, or is sacrificed", () => {
    const { s: s0, ap, opp, ids } = setup([drakeFamiliar()]);
    const theirs = putOnBattlefield(s0, opp, anthem());
    const mine = putOnBattlefield(s0, ap, anthem());
    let s = castNow(s0, ap, ids[0]!);
    s = settle(s, at("chooseMay", ap));
    const drake = ids[0]!;
    const no = settle(answerMay(s, ap, false));
    expect([zone(no, drake), zone(no, theirs), zone(no, mine)]).toEqual(["graveyard", "battlefield", "battlefield"]);
    // Not targeted: any enchantment, theirs too (rulings); the bot picks an opponent's.
    s = answerMay(s, ap, true);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap });
    expect(s.pending?.kind === "pickPermanents" && [...s.pending.options].sort()).toEqual([theirs, mine].sort());
    expect(botActions(s, ap)[0]).toMatchObject({ type: "pickPermanents", ids: [theirs] });
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [theirs] }));
    expect([zone(s, theirs), s.players[opp]!.hand.includes(theirs), zone(s, drake), zone(s, mine)]).toEqual(["hand", true, "battlefield", "battlefield"]);
  });

  it("Drake Familiar with only its controller's own enchantment returns that one", () => {
    const { s: s0, ap, ids } = setup([drakeFamiliar()]);
    const mine = putOnBattlefield(s0, ap, anthem());
    let s = settle(castNow(s0, ap, ids[0]!), at("chooseMay", ap));
    s = settle(answerMay(s, ap, true));
    expect([zone(s, mine), zone(s, ids[0]!)]).toEqual(["hand", "battlefield"]);
  });

  it("Drake Familiar with no enchantment anywhere is sacrificed", () => {
    const { s: s0, ap, ids } = setup([drakeFamiliar()]);
    const s = settle(castNow(s0, ap, ids[0]!));
    expect(zone(s, ids[0]!)).toBe("graveyard");
  });

  it("Auriok Survivors: returns an Equipment card from your graveyard and may attach it to itself", () => {
    const { s: s0, ap, ids } = setup([auriokSurvivors()]);
    const eq = toZone(s0, ap, sword(), "graveyard");
    let s = castNow(s0, ap, ids[0]!);
    s = triggerTargets(s, ap, [tgt(eq)]);
    s = settle(s, at("chooseMay", ap));
    s = answerMay(s, ap, true);
    s = settle(s, at("chooseMay", ap));
    const unattached = settle(answerMay(s, ap, false));
    expect([zone(unattached, eq), unattached.objects[eq]!.attachedTo]).toEqual(["battlefield", undefined]);
    s = settle(answerMay(s, ap, true));
    expect([zone(s, eq), s.objects[eq]!.attachedTo, pt(s, ids[0]!)]).toEqual(["battlefield", ids[0]!, "5/7"]);
  });

  it("Auriok Survivors gone before its trigger resolves: the Equipment comes back unattached (rulings)", () => {
    const { s: s0, ap, ids } = setup([auriokSurvivors()]);
    const eq = toZone(s0, ap, sword(), "graveyard");
    let s = castNow(s0, ap, ids[0]!);
    s = triggerTargets(s, ap, [tgt(eq)]);
    const me = ids[0]!;
    s.battlefield.splice(s.battlefield.indexOf(me), 1);
    s.objects[me]!.zone = "graveyard";
    s.objects[me]!.zoneChanges = (s.objects[me]!.zoneChanges ?? 0) + 1;
    s.players[ap]!.graveyard.push(me);
    invalidateCharacteristics(s);
    s = settle(s);
    expect([zone(s, eq), s.objects[eq]!.attachedTo]).toEqual(["battlefield", undefined]);
  });

  it("Goblin Sappers: the target can't be blocked, and it and Sappers are destroyed at end of combat", () => {
    const { s: s0, ap, opp } = setup([]);
    const sappers = putOnBattlefield(s0, ap, goblinSappers());
    const bear = putOnBattlefield(s0, ap, bearC("Sapping Bear"));
    putOnBattlefield(s0, opp, bearC("Their Bear"));
    let s = settle(run(s0, planActivate(s0, ap, sappers, 0, [tgt(bear)])));
    expect([zone(s, bear), zone(s, sappers)]).toEqual(["battlefield", "battlefield"]);
    s = attackWith(s, [bear], opp);
    s = goUntil(s, (x) => x.step === "main2");
    expect([zone(s, bear), zone(s, sappers), life(s, opp)]).toEqual(["graveyard", "graveyard", 38]);
  });

  it("Goblin Sappers' second ability destroys only the target", () => {
    const { s: s0, ap, opp } = setup([]);
    const sappers = putOnBattlefield(s0, ap, goblinSappers());
    const bear = putOnBattlefield(s0, ap, bearC("Sapping Bear"));
    putOnBattlefield(s0, ap, mountain);
    let s = settle(run(s0, planActivate(s0, ap, sappers, 1, [tgt(bear)])));
    s = attackWith(s, [bear], opp);
    s = goUntil(s, (x) => x.step === "main2");
    expect([zone(s, bear), zone(s, sappers)]).toEqual(["graveyard", "battlefield"]);
  });

  it("Bogardan Phoenix: returns with a death counter the first time it dies, and is exiled the next", () => {
    const { s: s0, ap } = setup([]);
    const phoenix = putOnBattlefield(s0, ap, bogardanPhoenix());
    let s = settle(run(s0, planCast(s0, ap, toZone(s0, ap, card("Test Kill", "Instant", "{1}", { cmc: 1, oracleText: "Destroy target creature." }), "hand"), [tgt(phoenix)])));
    expect([zone(s, phoenix), counters(s, phoenix, "death")]).toEqual(["battlefield", 1]);
    const kill2 = toZone(s, ap, card("Test Kill", "Instant", "{1}", { cmc: 1, oracleText: "Destroy target creature." }), "hand");
    s = settle(castNow(s, ap, kill2, [tgt(phoenix)]));
    expect(zone(s, phoenix)).toBe("exile");
  });

  it("Aven Warcraft: +0/+2, and with threshold protection from the chosen color too", () => {
    const { s: s0, ap, ids } = setup([avenWarcraft(), avenWarcraft()]);
    const bear = putOnBattlefield(s0, ap, bearC());
    let s = settle(castNow(s0, ap, ids[0]!));
    expect([pt(s, bear), characteristics(s, s.objects[bear]!).keywords.some((k) => /protection/i.test(k))]).toEqual(["2/4", false]);
    fillYard(s, ap, 7);
    s = castNow(s, ap, ids[1]!);
    s = settle(s, at("chooseOption", ap));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "color" });
    const red = s.pending?.kind === "chooseOption" ? s.pending.options.find((o) => /^r(ed)?$/i.test(o)) : undefined;
    s = settle(act(s, { type: "chooseOption", player: ap, choice: red! } as Action));
    expect(pt(s, bear)).toBe("2/6");
    // Red sources can't target it now; a green one still can.
    expect(planCast(s, ap, toZone(s, ap, bolt(), "hand"), [tgt(bear)])).toBeNull();
  });
  it("Chlorophant: one +1/+1 counter each upkeep, two with threshold", () => {
    const { s: s0, ap } = setup([]);
    const plain = putOnBattlefield(s0, ap, chlorophant());
    const s1 = goUntil(s0, (x) => x.activePlayer === ap && x.step === "main1" && x.turn > s0.turn);
    expect(counters(s1, plain)).toBe(1);
    const { s: s2, ap: ap2 } = setup([]);
    const big = putOnBattlefield(s2, ap2, chlorophant());
    fillYard(s2, ap2, 7);
    const s3 = goUntil(s2, (x) => x.activePlayer === ap2 && x.step === "main1" && x.turn > s2.turn);
    expect(counters(s3, big)).toBe(2);
  });

  it("Curious Cadaver returns from your graveyard to your hand when you sacrifice a Clue, not when an opponent does", () => {
    const { s: s0, ap, opp } = setup([]);
    const cadaver = toZone(s0, ap, curiousCadaver(), "graveyard");
    const theirClue = makeToken(s0, opp, clue());
    let s = settle(castNow(s0, ap, toZone(s0, ap, card("Test Edict", "Sorcery", "{B}", { cmc: 1, colors: ["B"], oracleText: "Each opponent sacrifices an artifact of their choice." }), "hand")));
    expect([zone(s, theirClue), zone(s, cadaver)]).not.toContain("battlefield");
    expect(zone(s, cadaver)).toBe("graveyard");
    const myClue = makeToken(s, ap, clue());
    s = settle(run(s, planActivate(s, ap, myClue, 0)));
    expect([zone(s, cadaver), s.players[ap]!.hand.includes(cadaver)]).toEqual(["hand", true]);
  });

  it("Daring Sleuth transforms when you sacrifice a Clue", () => {
    const { s: s0, ap } = setup([]);
    const sleuth = putOnBattlefield(s0, ap, daringSleuth());
    const myClue = makeToken(s0, ap, clue());
    const s = settle(run(s0, planActivate(s0, ap, myClue, 0)));
    expect([nameOf(s, sleuth), pt(s, sleuth)]).toEqual(["Bearer of Overwhelming Truths", "3/2"]);
  });

  it("Benefactor's Draught: untaps all creatures, draws a card, and draws again whenever an opponent's creature blocks this turn", () => {
    const { s: s0, ap, opp, ids } = setup([benefactorsDraught()]);
    const attacker = putOnBattlefield(s0, ap, bearC("Attacking Bear"));
    const blocker = putOnBattlefield(s0, opp, bearC("Blocking Bear"));
    s0.objects[blocker]!.tapped = true;
    const before = handSize(s0, ap);
    let s = settle(castNow(s0, ap, ids[0]!));
    expect([s.objects[blocker]!.tapped, handSize(s, ap)]).toEqual([false, before]);
    s = attackWith(s, [attacker], opp);
    s = toBlocks(s);
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker, attacker }] });
    s = settle(s);
    expect(handSize(s, ap)).toBe(before + 1);
  });

  it("Tetsuko Umezawa, Pursuer: 1 damage to the controller of a blocker with power or toughness 1 or less", () => {
    const { s: s0, ap, opp } = setup([]);
    const tetsuko = putOnBattlefield(s0, ap, tetsukoUmezawaPursuer());
    const small = putOnBattlefield(s0, opp, bearC("Small Blocker", 1, 3));
    let s = attackWith(s0, [tetsuko], opp);
    s = toBlocks(s);
    s = settle(act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: small, attacker: tetsuko }] }));
    expect(life(s, opp)).toBe(39);
    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    const t1 = putOnBattlefield(s1, ap1, tetsukoUmezawaPursuer());
    const big = putOnBattlefield(s1, opp1, bearC("Big Blocker", 2, 2));
    let s2 = attackWith(s1, [t1], opp1);
    s2 = toBlocks(s2);
    s2 = settle(act(s2, { type: "declareBlockers", player: opp1, blocks: [{ blocker: big, attacker: t1 }] }));
    expect(life(s2, opp1)).toBe(40);
  });

  it("Lithomancer's Focus: +2/+2 and colorless sources' damage to it is prevented this turn", () => {
    const { s: s0, ap, opp, ids } = setup([lithomancersFocus()]);
    const bear = putOnBattlefield(s0, ap, bearC());
    const g = putOnBattlefield(s0, opp, golem());
    const redOne = putOnBattlefield(s0, opp, vanilla("Red Pinger", "Creature — Goblin", "{R}", 1, 1, 1, { colors: ["R"] }));
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(bear)]));
    expect(pt(s, bear)).toBe("4/4");
    dealDamage(s, objectSource(s, s.objects[g]!), { object: s.objects[bear]! }, 3);
    expect(s.objects[bear]!.damage ?? 0).toBe(0);
    dealDamage(s, objectSource(s, s.objects[redOne]!), { object: s.objects[bear]! }, 1);
    expect(s.objects[bear]!.damage ?? 0).toBe(1);
  });

  it("Lumengrid Augur untaps only if the player discards an artifact card", () => {
    const { s: s0, ap } = setup([]);
    const augur = putOnBattlefield(s0, ap, lumengridAugur());
    onlyHand(s0, ap, []);
    const r = toZone(s0, ap, rock(), "library");
    const keep = toZone(s0, ap, opt(), "hand");
    let s = run(s0, planActivate(s0, ap, augur, 0, [ply(ap)]));
    s = settle(s, at("discard", ap));
    expect(s.pending).toMatchObject({ kind: "discard", player: ap });
    const kept = settle(act(s, { type: "discard", player: ap, objectIds: [keep] }));
    expect(kept.objects[augur]!.tapped).toBe(true);
    s = settle(act(s, { type: "discard", player: ap, objectIds: [r] }));
    expect([zone(s, r), s.objects[augur]!.tapped]).toEqual(["graveyard", false]);
  });

  it("Magmasaur: remove a counter each upkeep, or it's sacrificed and deals that much damage to each creature without flying and each player", () => {
    const { s: s0, ap, opp, ids } = setup([magmasaur()]);
    const bird = putOnBattlefield(s0, opp, flyer("Bird", 1, 1));
    const bear = putOnBattlefield(s0, opp, bearC("Ground Bear", 2, 5));
    let s = settle(castNow(s0, ap, ids[0]!));
    const saur = ids[0]!;
    expect(counters(s, saur)).toBe(5);
    s = goUntil(s, (x) => x.pending?.kind === "chooseMay" && x.pending.player === ap);
    const removed = settle(answerMay(s, ap, true));
    expect([counters(removed, saur), zone(removed, saur)]).toEqual([4, "battlefield"]);
    const lifeBefore = life(s, opp);
    const myLife = life(s, ap);
    s = settle(answerMay(s, ap, false));
    expect([zone(s, saur), zone(s, bird), zone(s, bear), life(s, opp), life(s, ap)]).toEqual(["graveyard", "battlefield", "graveyard", lifeBefore - 5, myLife - 5]);
  });
  it("Quarry Colossus puts the target creature just beneath the top X cards of its owner's library, X being your Plains", () => {
    const { s: s0, ap, opp, ids } = setup([quarryColossus()]);
    const victim = putOnBattlefield(s0, opp, bearC("Victim"));
    const top = s0.players[opp]!.library.slice(0, 3);
    let s = castNow(s0, ap, ids[0]!);
    s = settle(triggerTargets(s, ap, [tgt(victim)]));
    expect(s.players[opp]!.library.slice(0, 4)).toEqual([...top, victim]);
  });

  it("Raft Security Officer's ability costs {1} less if it targets a creature with power 3 or less", () => {
    const { s: s0, ap, opp } = setup([]);
    const officer = putOnBattlefield(s0, ap, raftSecurityOfficer());
    const small = putOnBattlefield(s0, opp, bearC("Small", 3, 3));
    const big = putOnBattlefield(s0, opp, bearC("Big", 4, 4));
    const lands = s0.battlefield.filter((id) => s0.cards[s0.objects[id]!.cardId]!.typeLine.includes("Land"));
    tapLands(s0, ap, [lands[0]!]);
    expect(planActivate(s0, ap, officer, 0, [tgt(big)])).toBeNull();
    const s = settle(run(s0, planActivate(s0, ap, officer, 0, [tgt(small)])));
    expect(s.objects[small]!.tapped).toBe(true);
    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    const officer1 = putOnBattlefield(s1, ap1, raftSecurityOfficer());
    const big1 = putOnBattlefield(s1, opp1, bearC("Big", 4, 4));
    const lands1 = s1.battlefield.filter((id) => s1.cards[s1.objects[id]!.cardId]!.typeLine.includes("Land"));
    tapLands(s1, ap1, lands1.slice(0, 2));
    const s2 = settle(run(s1, planActivate(s1, ap1, officer1, 0, [tgt(big1)])));
    expect(s2.objects[big1]!.tapped).toBe(true);
  });

  it("Sacred Guide: reveals until a white card, puts it into your hand and exiles the others", () => {
    const { s: s0, ap } = setup([]);
    const guide = putOnBattlefield(s0, ap, sacredGuide());
    const white = toZone(s0, ap, whiteCard(), "library");
    const red = toZone(s0, ap, bolt(), "library");
    const blue = toZone(s0, ap, opt(), "library");
    const s = settle(run(s0, planActivate(s0, ap, guide, 0)));
    expect([zone(s, guide), zone(s, white), zone(s, red), zone(s, blue)]).toEqual(["graveyard", "hand", "exile", "exile"]);
  });

  it("Scarab of the Unseen returns every Aura on a permanent you own to its owner's hand, then draws at the next upkeep", () => {
    const { s: s0, ap, opp } = setup([]);
    onlyHand(s0, ap, []);
    const scarab = putOnBattlefield(s0, ap, scarabOfTheUnseen());
    const host = putOnBattlefield(s0, ap, bearC("Host"));
    const mine = putOnBattlefield(s0, ap, aura("My Aura"));
    const theirs = putOnBattlefield(s0, opp, aura("Their Aura"));
    attach(s0, mine, host);
    attach(s0, theirs, host);
    const theirHost = putOnBattlefield(s0, opp, bearC("Their Host"));
    // Only a permanent you own can be the target.
    expect(planActivate(s0, ap, scarab, 0, [tgt(theirHost)])).toBeNull();
    let s = settle(run(s0, planActivate(s0, ap, scarab, 0, [tgt(host)])));
    expect([zone(s, mine), zone(s, theirs), s.players[opp]!.hand.includes(theirs), zone(s, host)]).toEqual(["hand", "hand", true, "battlefield"]);
    const before = handSize(s, ap);
    s = goUntil(s, (x) => x.turn > s0.turn && x.step === "draw");
    expect(handSize(s, ap)).toBe(before + 1);
  });

  it("Vicious Betrayal: +2/+2 for each creature sacrificed as it was cast", () => {
    const { s: s0, ap, ids } = setup([viciousBetrayal(), viciousBetrayal()]);
    const hero = putOnBattlefield(s0, ap, bearC("Hero"));
    const fodder = [putOnBattlefield(s0, ap, bearC("Fodder A")), putOnBattlefield(s0, ap, bearC("Fodder B"))];
    // Black mana for both casts.
    putOnBattlefield(s0, ap, swamp);
    putOnBattlefield(s0, ap, swamp);
    const untapped = (x: GameState) => x.battlefield.filter((id) => x.objects[id]!.controller === ap && !x.objects[id]!.tapped && x.cards[x.objects[id]!.cardId]!.typeLine.includes("Land")).length;
    const before = untapped(s0);    // X is how many are sacrificed.
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(hero)], undefined, "auto", 2, { sacrifice: fodder })));
    // The sacrifices are its X, not mana: it costs five.
    expect([pt(s, hero), ...fodder.map((id) => zone(s, id)), before - untapped(s)]).toEqual(["6/6", "graveyard", "graveyard", 5]);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(hero)], undefined, "auto", 0, { sacrifice: [] })));
    expect(pt(s, hero)).toBe("6/6");
  });

  it("Whipkeeper deals damage equal to the damage already dealt to the target this turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const whip = putOnBattlefield(s0, ap, whipkeeper());
    const victim = putOnBattlefield(s0, opp, bearC("Tough", 2, 5));
    const pinger = putOnBattlefield(s0, ap, vanilla("Pinger", "Creature — Goblin", "{R}", 1, 1, 1, { colors: ["R"] }));
    dealDamage(s0, objectSource(s0, s0.objects[pinger]!), { object: s0.objects[victim]! }, 2);
    const s = settle(run(s0, planActivate(s0, ap, whip, 0, [tgt(victim)])));
    expect(s.objects[victim]!.damage).toBe(4);
  });

  it("Wicked Akuba can only target a player it dealt damage to this turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const akuba = putOnBattlefield(s0, ap, wickedAkuba());
    const other = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    expect(planActivate(s0, ap, akuba, 0, [ply(opp)])).toBeNull();
    dealDamage(s0, objectSource(s0, s0.objects[akuba]!), { player: opp }, 2);
    expect(planActivate(s0, ap, akuba, 0, [ply(other)])).toBeNull();
    const s = settle(run(s0, planActivate(s0, ap, akuba, 0, [ply(opp)])));
    expect(life(s, opp)).toBe(37);
  });

  it("Brain Pry: the player discards a card with the chosen name; if they can't, you draw", () => {
    const { s: s0, ap, opp, ids } = setup([brainPry(), brainPry()]);
    onlyHand(s0, opp, []);
    const bolts = [toZone(s0, opp, bolt(), "hand"), toZone(s0, opp, bolt(), "hand")];
    let s = castNow(s0, ap, ids[0]!, [ply(opp)]);
    s = settle(s, at("chooseOption", ap));
    const before = handSize(s, ap);
    s = act(s, { type: "chooseOption", player: ap, choice: "Lightning Bolt" });
    // Two of that name: the player picks one of them.
    expect(s.pending).toMatchObject({ kind: "discard", player: opp, count: 1 });
    s = settle(act(s, { type: "discard", player: opp, objectIds: [bolts[1]!] }));
    expect([zone(s, bolts[0]!), zone(s, bolts[1]!), handSize(s, ap)]).toEqual(["hand", "graveyard", before]);
    s = castNow(s, ap, ids[1]!, [ply(opp)]);
    s = settle(s, at("chooseOption", ap));
    const before2 = handSize(s, ap);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Grizzly Bears" }));
    expect([zone(s, bolts[0]!), handSize(s, ap)]).toEqual(["hand", before2 + 1]);
  });

  it("Agonizing Memories: you choose two cards from the player's hand and put them on top of their library in the order you like", () => {
    const { s: s0, ap, opp, ids } = setup([agonizingMemories()]);
    onlyHand(s0, opp, []);
    const hand = [toZone(s0, opp, bolt(), "hand"), toZone(s0, opp, opt(), "hand"), toZone(s0, opp, whiteCard(), "hand")];
    let s = castNow(s0, ap, ids[0]!, [ply(opp)]);
    s = settle(s, at("searchLibrary", ap));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, hand: opp, min: 2, max: 2 });
    s = act(s, { type: "searchLibrary", player: ap, found: [hand[0]!, hand[2]!] });
    expect(s.pending).toMatchObject({ kind: "arrangeTop", player: ap, how: "order", owner: opp });
    s = settle(act(s, { type: "arrangeTop", player: ap, top: [hand[2]!, hand[0]!], away: [] }));
    expect(s.players[opp]!.library.slice(0, 2)).toEqual([hand[2]!, hand[0]!]);
    expect(s.players[opp]!.hand).toEqual([hand[1]!]);
  });

  it("Agonizing Memories with one card in that hand puts it on top, with nothing to order", () => {
    const { s: s0, ap, opp, ids } = setup([agonizingMemories()]);
    onlyHand(s0, opp, []);
    const only = toZone(s0, opp, bolt(), "hand");
    let s = castNow(s0, ap, ids[0]!, [ply(opp)]);
    s = settle(s, at("searchLibrary", ap));
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [only] }));
    expect(s.players[opp]!.library[0]).toBe(only);
    expect(s.pending).toBeFalsy();
  });

  it("Voda Sea Scavenger looks at X cards (domain) and may put one back on top, the rest on the bottom", () => {
    const { s: s0, ap, ids } = setup([vodaSeaScavenger()]);
    const top = s0.players[ap]!.library.slice(0, 6);
    let s = castNow(s0, ap, ids[0]!);
    s = settle(s, (x) => !!x.pending && x.pending.player === ap);
    // Five basic land types among your lands: five cards.
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0, max: 1 });
    expect(s.pending?.kind === "searchLibrary" && s.pending.cards.length).toBe(5);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [top[3]!] }));
    const lib = s.players[ap]!.library;
    expect([lib[0], lib[1]]).toEqual([top[3]!, top[5]!]);
    expect(lib.slice(-4).sort()).toEqual([top[0]!, top[1]!, top[2]!, top[4]!].sort());
  });
});
