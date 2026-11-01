// Round 228: unsupported cards from the top of the popularity list. Emet-Selch, Unsundered // Hades, Sorcerer of Eld
// ("During your turn, you may play cards from your graveyard"), Cramped Vents // Access Maze ("Once during each of your
// turns, you may cast a spell from your hand by paying life equal to its mana value"), Ezio Auditore da Firenze
// ("Assassin spells you cast have freerunning {B}{B}"; "you may pay {W}{U}{B}{R}{G} if that player has 10 or less life.
// When you do, that player loses the game"), Peter Parker // Amazing Spider-Man ("Each legendary spell you cast that's one
// or more colors has web-slinging {G}{W}{U}"), Noctis, Prince of Lucis ("You may cast artifact spells from your
// graveyard by paying 3 life in addition to paying their other costs ... enters with a finality counter on it"), Miles
// Morales // Ultimate Spider-Man ("each Spider and legendary creature you control") and Henzie "Toolbox" Torre (granted
// blitz, and blitz costs less for each commander cast), among others.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, scry, setup } from "./helpers";
import { applyAction, abilityProblem, botActions, draw, castProblem, characteristics, graveyardWays, invalidateCharacteristics, isFullySupported, legalActions, manaValue, planActivate, planCast, spellCost, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Everyone passes until the stack is empty, answering "you may" with `may`; other players' questions as the bots would. */
const settle = (s: GameState, opts: { may?: boolean; me?: PlayerId } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && opts.me !== undefined && p.player !== opts.me) s = act(s, botActions(s, p.player)[0]!);
    else if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: opts.may ?? true });
    else if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets: [] });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/**
 * `ap` attacks `defender` with `attackers`, no blocks; "you may" answered with `may` (with `pool` put in ap's mana pool
 * first, for a "you may pay"); stops at the second main phase.
 */
function swing(s: GameState, ap: PlayerId, defender: PlayerId, attackers: string[], may = true, pool: Partial<Record<"W" | "U" | "B" | "R" | "G", number>> = {}) {
  s = passUntil(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks: attackers.map((a) => ({ attacker: a, defender })) });
  for (let i = 0; i < 200 && s.step !== "main2"; i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p?.kind === "chooseMay" && p.player === ap) {
      Object.assign(s.players[ap]!.manaPool, pool);
      s = act(s, { type: "chooseMay", player: ap, yes: may });
    }
    else if (p?.kind === "chooseTargets" && p.player === ap) s = act(s, { type: "chooseTargets", player: ap, targets: [] });
    else if (p && p.player !== ap) s = act(s, botActions(s, p.player)[0]!);
    else if (p) throw new Error(`unexpected ${p.kind}`);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
}
const total = (c: { cost: Parameters<typeof manaValue>[0]; extra: number }) => manaValue(c.cost) + c.extra;
const backFace = (s: GameState, id: ObjectId) => {
  s.objects[id]!.face = 1;
  invalidateCharacteristics(s);
  return id;
};

// Real oracle text (Scryfall).
const emet = scry("transform", [{"name":"Emet-Selch, Unsundered","mana_cost":"{1}{U}{B}","type_line":"Legendary Creature — Elder Wizard","oracle_text":"Vigilance\nWhenever Emet-Selch enters or attacks, draw a card, then discard a card.\nAt the beginning of your upkeep, if there are fourteen or more cards in your graveyard, you may transform Emet-Selch.","power":"2","toughness":"4"},{"name":"Hades, Sorcerer of Eld","type_line":"Legendary Creature — Avatar","oracle_text":"Vigilance\nEcho of the Lost — During your turn, you may play cards from your graveyard.\nIf a card or token would be put into your graveyard from anywhere, exile it instead.","power":"6","toughness":"6","color_indicator":["B","U"]}], { keywords: ["Vigilance","Echo of the Lost","Transform"], color_identity: ["B","U"] });
const vents = scry("split", [{"name":"Cramped Vents","mana_cost":"{3}{B}","type_line":"Enchantment — Room","oracle_text":"When you unlock this door, this Room deals 6 damage to target creature an opponent controls. You gain life equal to the excess damage dealt this way.\n(You may cast either half. That door unlocks on the battlefield. As a sorcery, you may pay the mana cost of a locked door to unlock it.)"},{"name":"Access Maze","mana_cost":"{5}{B}{B}","type_line":"Enchantment — Room","oracle_text":"Once during each of your turns, you may cast a spell from your hand by paying life equal to its mana value rather than paying its mana cost.\n(You may cast either half. That door unlocks on the battlefield. As a sorcery, you may pay the mana cost of a locked door to unlock it.)"}], { keywords: [], color_identity: ["B"] });
const ezio = card("Ezio Auditore da Firenze", "Legendary Creature — Human Assassin", "{1}{B}", {"power":"3","toughness":"2","keywords":["Menace"],"oracleText":"Menace\nAssassin spells you cast have freerunning {B}{B}. (You may cast a spell for its freerunning cost if you dealt combat damage to a player this turn with an Assassin or commander.)\nWhenever Ezio deals combat damage to a player, you may pay {W}{U}{B}{R}{G} if that player has 10 or less life. When you do, that player loses the game."});
const peter = scry("modal_dfc", [{"name":"Peter Parker","mana_cost":"{1}{W}","type_line":"Legendary Creature — Human Scientist Hero","oracle_text":"When Peter Parker enters, create a 2/1 green Spider creature token with reach.\n{1}{G}{W}{U}: Transform Peter Parker. Activate only as a sorcery.","power":"0","toughness":"1"},{"name":"Amazing Spider-Man","mana_cost":"{1}{G}{W}{U}","type_line":"Legendary Creature — Spider Human Hero","oracle_text":"Vigilance, reach\nEach legendary spell you cast that's one or more colors has web-slinging {G}{W}{U}. (You may cast a spell for its web-slinging cost if you also return a tapped creature you control to its owner's hand.)","power":"4","toughness":"4"}], { keywords: ["Reach","Vigilance","Transform"], color_identity: ["G","U","W"] });
const noctis = card("Noctis, Prince of Lucis", "Legendary Creature — Human Noble", "{1}{W}{U}{B}", {"power":"4","toughness":"3","keywords":["Lifelink"],"oracleText":"Lifelink\nYou may cast artifact spells from your graveyard by paying 3 life in addition to paying their other costs. If you cast a spell this way, that artifact enters with a finality counter on it."});
const miles = scry("modal_dfc", [{"name":"Miles Morales","mana_cost":"{1}{G}","type_line":"Legendary Creature — Human Citizen Hero","oracle_text":"When Miles Morales enters, put a +1/+1 counter on each of up to two target creatures.\n{3}{R}{G}{W}: Transform Miles Morales. Activate only as a sorcery.","power":"1","toughness":"2"},{"name":"Ultimate Spider-Man","mana_cost":"{3}{R}{G}{W}","type_line":"Legendary Creature — Spider Human Hero","oracle_text":"First strike, haste\nCamouflage — {2}: Put a +1/+1 counter on Ultimate Spider-Man. He gains hexproof and becomes colorless until end of turn.\nWhenever you attack, double the number of each kind of counter on each Spider and legendary creature you control.","power":"4","toughness":"3"}], { keywords: ["Camouflage","Transform","First strike","Haste","Double"], color_identity: ["G","R","W"] });
const henzie = card("Henzie \"Toolbox\" Torre", "Legendary Creature — Devil Rogue", "{B}{R}{G}", {"power":"3","toughness":"3","oracleText":"Each creature spell you cast with mana value 4 or greater has blitz. The blitz cost is equal to its mana cost. (You may choose to cast that spell for its blitz cost. If you do, it gains haste and \"When this creature dies, draw a card.\" Sacrifice it at the beginning of the next end step.)\nBlitz costs you pay cost {1} less for each time you've cast your commander from the command zone this game."});
const keranos = card("Keranos, God of Storms", "Legendary Enchantment Creature — God", "{3}{U}{R}", {"power":"6","toughness":"5","keywords":["Indestructible"],"oracleText":"Indestructible\nAs long as your devotion to blue and red is less than seven, Keranos isn't a creature.\nReveal the first card you draw on each of your turns. Whenever you reveal a land card this way, draw a card. Whenever you reveal a nonland card this way, Keranos deals 3 damage to any target."});
const dynamo = card("The Peregrine Dynamo", "Legendary Artifact Creature — Construct", "{3}", {"power":"1","toughness":"5","keywords":["Haste"],"oracleText":"Haste\n{1}, {T}: Copy target activated or triggered ability you control from another legendary source that's not a commander. You may choose new targets for the copy. (Mana abilities can't be targeted.)"});
const superior = card("Superior Spider-Man", "Legendary Creature — Spider Human Hero", "{2}{U}{B}", {"power":"4","toughness":"4","keywords":["Mind Swap"],"oracleText":"Mind Swap — You may have Superior Spider-Man enter as a copy of any creature card in a graveyard, except his name is Superior Spider-Man and he's a 4/4 Spider Human Hero in addition to his other types. When you do, exile that card."});
// Other cards the tests use.
const harlequin = card("Merciless Harlequin", "Creature — Human Assassin", "{2}{B}", { power: "2", toughness: "1", keywords: ["Freerunning"], oracleText: "Freerunning {1}{B} (You may cast this spell for its freerunning cost if you dealt combat damage to a player this turn with an Assassin or commander.)\nWhen this creature enters, you draw a card and you lose 1 life." });
const hitman = card("Test Hitman", "Creature — Human Assassin", "{3}{B}{B}", { power: "4", toughness: "4", oracleText: "" });
const ogre = card("Test Ogre", "Creature — Ogre", "{3}{B}{B}", { power: "4", toughness: "4", oracleText: "" });
const bolt = card("Lightning Bolt", "Instant", "{R}", { oracleText: "Lightning Bolt deals 3 damage to any target." });
const divination = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });
const relic = card("Mind Stone", "Artifact", "{2}", { oracleText: "{T}: Add {C}.\n{1}, {T}, Sacrifice Mind Stone: Draw a card." });
const hero = card("Test Hero", "Legendary Creature — Human Hero", "{2}{W}", { power: "2", toughness: "2", oracleText: "" });
const golem = card("Test Golem", "Legendary Artifact Creature — Golem", "{3}", { power: "3", toughness: "3", oracleText: "" });
const bigOne = card("Test Giant", "Creature — Giant", "{4}{G}", { power: "5", toughness: "5", oracleText: "" });
const desert = card("Test Desert", "Land — Desert", "", { oracleText: "{T}: Add {C}." });

describe("round 228", () => {
  it("Hades, Sorcerer of Eld: during your turn, lands and spells from your graveyard, paying their costs; not on another turn", () => {
    supported(emet);
    const { s: s0, ap, opp } = setup([]);
    const hades = backFace(s0, putOnBattlefield(s0, ap, emet));
    expect(characteristics(s0, s0.objects[hades]!).name).toBe("Hades, Sorcerer of Eld");
    const land = into(s0, ap, desert, "graveyard");
    const spell = into(s0, ap, divination, "graveyard");
    const instant = into(s0, ap, bolt, "graveyard");
    expect(legalActions(s0, ap).some((a) => a.type === "playLand" && a.objectId === land)).toBe(true);
    let s = act(s0, { type: "playLand", player: ap, objectId: land });
    expect(s.objects[land]!.zone).toBe("battlefield");
    // A spell for its mana cost (rulings: all costs paid, the timing rules followed).
    expect(graveyardWays(s, s.objects[spell]!).some((w) => w.kind === "permission" && !w.costs.length)).toBe(true);
    s = run(s, planCast(s, ap, spell, [], undefined, "auto", undefined, { via: "permission" }));
    expect(s.objects[spell]!.zone).toBe("stack");
    s = settle(s);
    // It would go to the graveyard: exiled instead.
    expect(s.objects[spell]!.zone).toBe("exile");
    // On an opponent's turn, not even an instant.
    s = passUntil(s, "upkeep", opp);
    s.players[ap]!.manaPool.R = 1;
    expect(castProblem(s, ap, instant, [{ kind: "player", id: opp }], undefined, undefined, undefined, undefined, { via: "permission" })).toBeTruthy();
    expect(graveyardWays(s, s.objects[instant]!).some((w) => w.kind === "permission")).toBe(false);
  });

  it("Access Maze: once during each of your turns, a spell from your hand for life equal to its mana value; not with only Cramped Vents unlocked", () => {
    supported(vents);
    const { s: s0, ap, ids } = setup([ogre, bolt]);
    const room = putOnBattlefield(s0, ap, vents);
    s0.objects[room]!.unlocked = [0];
    invalidateCharacteristics(s0);
    const how = { alt: "lifeForMv" as const };
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, how)).toBeTruthy();
    s0.objects[room]!.unlocked = [0, 1];
    invalidateCharacteristics(s0);
    const life = s0.players[ap]!.life;
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, how));
    expect(s.players[ap]!.life).toBe(life - 5);
    expect(s.objects[ids[0]!]!.zone).toBe("stack");
    s = settle(s);
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    // Once each turn.
    expect(castProblem(s, ap, ids[1]!, [{ kind: "player", id: ap }], undefined, undefined, undefined, undefined, how)).toBeTruthy();
    // Not from a graveyard: only from your hand.
    const { s: t0, ap: me } = setup([]);
    const r2 = putOnBattlefield(t0, me, vents);
    t0.objects[r2]!.unlocked = [1];
    invalidateCharacteristics(t0);
    const yard = into(t0, me, ogre, "graveyard");
    expect(castProblem(t0, me, yard, undefined, undefined, undefined, undefined, undefined, how)).toBeTruthy();
  });

  it("Ezio: Assassin spells have freerunning {B}{B} beside their own; a 10-life player loses the game when you pay {W}{U}{B}{R}{G}", () => {
    supported(ezio, harlequin);
    const { s: s0, ap, opp, ids } = setup([hitman, ogre, harlequin]);
    const e = putOnBattlefield(s0, ap, ezio);
    const how = { alt: "grantedFreerunning" as const };
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, how)).toMatch(/Assassin or commander/);
    s0.players[opp]!.life = 10;
    let s = swing(s0, ap, opp, [e], true, { W: 1, U: 1, B: 1, R: 1, G: 1 });
    expect(s.players[opp]!.life).toBe(7);
    // Its life was 7 as the trigger resolved: paying made the reflexive ability, and that player lost.
    expect(s.players[opp]!.lost).toBe(true);
    // Freerunning {B}{B} for an Assassin spell, not for an Ogre.
    expect(total(spellCost(s, ap, s.objects[ids[0]!]!, 0, [], how))).toBe(2);
    expect(castProblem(s, ap, ids[1]!, undefined, undefined, undefined, undefined, undefined, how)).toBeTruthy();
    // Merciless Harlequin: its own {1}{B} and Ezio's {B}{B} are both there.
    expect(total(spellCost(s, ap, s.objects[ids[2]!]!, 0, [], { alt: "freerunning" }))).toBe(2);
    expect(total(spellCost(s, ap, s.objects[ids[2]!]!, 0, [], how))).toBe(2);
    s = run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto", undefined, how));
    expect(s.objects[ids[0]!]!.zone).toBe("stack");
    // The bot pays freerunning too.
    s = settle(s);
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    s.players[ap]!.hand = [ids[2]!];
    s.players[ap]!.command = [];
    s.players[ap]!.manaPool.B = 2;
    const a = botActions(s, ap).find((x) => x.type === "castSpell");
    expect(a?.type === "castSpell" && (a.alt === "freerunning" || a.alt === "grantedFreerunning")).toBe(true);
  });

  it("Ezio: a player with 11 life as the trigger resolves doesn't lose; saying no doesn't pay", () => {
    for (const [life, may] of [[14, true], [10, false]] as const) {
      const { s: s0, ap, opp } = setup([]);
      const e = putOnBattlefield(s0, ap, ezio);
      s0.players[opp]!.life = life;
      const s = swing(s0, ap, opp, [e], may, { W: 1, U: 1, B: 1, R: 1, G: 1 });
      expect(s.players[opp]!.life).toBe(life - 3);
      expect(s.players[opp]!.lost).toBeFalsy();
    }
  });

  it("Amazing Spider-Man: legendary colored spells have web-slinging {G}{W}{U}; colorless or nonlegendary ones don't", () => {
    supported(peter);
    const { s: s0, ap, ids } = setup([hero, golem, ogre]);
    const how = { alt: "grantedWebSlinging" as const };
    const tired = putOnBattlefield(s0, ap, bear({ name: "Tired Bear" }));
    s0.objects[tired]!.tapped = true;
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { ...how, returnToHand: [tired] })).toBeTruthy();
    backFace(s0, putOnBattlefield(s0, ap, peter));
    expect(castProblem(s0, ap, ids[1]!, undefined, undefined, undefined, undefined, undefined, { ...how, returnToHand: [tired] })).toBeTruthy();
    expect(castProblem(s0, ap, ids[2]!, undefined, undefined, undefined, undefined, undefined, { ...how, returnToHand: [tired] })).toBeTruthy();
    expect(total(spellCost(s0, ap, s0.objects[ids[0]!]!, 0, [], how))).toBe(3);
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { ...how, returnToHand: [tired] }));
    expect(s.objects[tired]!.zone).toBe("hand");
    expect(s.objects[ids[0]!]!.zone).toBe("stack");
    // Cast using web-slinging (CR 702.188a): the creature it returned is remembered.
    expect(s.objects[ids[0]!]!.webSlung).toBeTruthy();
    s = settle(s);
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
  });

  it("Noctis: an artifact spell from your graveyard for 3 more life, entering with a finality counter; a free permission is used instead", () => {
    supported(noctis);
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, noctis);
    const stone = into(s0, ap, relic, "graveyard");
    const ogreCard = into(s0, ap, ogre, "graveyard");
    expect(graveyardWays(s0, s0.objects[ogreCard]!).some((w) => w.kind === "permission")).toBe(false);
    const life = s0.players[ap]!.life;
    let s = run(s0, planCast(s0, ap, stone, [], undefined, "auto", undefined, { via: "permission" }));
    expect(s.players[ap]!.life).toBe(life - 3);
    s = settle(s);
    expect(s.objects[stone]!.zone).toBe("battlefield");
    expect(s.objects[stone]!.counters.finality).toBe(1);
    // With Hades's permission too, the one that asks nothing more is the one used.
    const { s: t0, ap: me } = setup([]);
    putOnBattlefield(t0, me, noctis);
    backFace(t0, putOnBattlefield(t0, me, emet));
    const stone2 = into(t0, me, relic, "graveyard");
    const ways = graveyardWays(t0, t0.objects[stone2]!).filter((w) => w.kind === "permission");
    expect(ways.length).toBe(1);
    expect(ways[0]!.costs.length).toBe(0);
    const life2 = t0.players[me]!.life;
    let t = settle(run(t0, planCast(t0, me, stone2, [], undefined, "auto", undefined, { via: "permission" })));
    expect(t.players[me]!.life).toBe(life2);
    expect(t.objects[stone2]!.zone).toBe("battlefield");
    expect(t.objects[stone2]!.counters.finality ?? 0).toBe(0);
  });

  it("Ultimate Spider-Man: whenever you attack, double each kind of counter on each Spider and legendary creature you control", () => {
    supported(miles);
    const { s: s0, ap, opp } = setup([]);
    const spidey = backFace(s0, putOnBattlefield(s0, ap, miles));
    const spider = putOnBattlefield(s0, ap, card("Test Spider", "Creature — Spider", "{1}{G}", { power: "1", toughness: "1", oracleText: "" }));
    const legend = putOnBattlefield(s0, ap, hero);
    const plain = putOnBattlefield(s0, ap, bear());
    for (const id of [spidey, spider, legend, plain]) s0.objects[id]!.counters["+1/+1"] = 1;
    s0.objects[legend]!.counters.shield = 1;
    invalidateCharacteristics(s0);
    const s = swing(s0, ap, opp, [spidey]);
    expect(s.objects[spidey]!.counters["+1/+1"]).toBe(2);
    expect(s.objects[spider]!.counters["+1/+1"]).toBe(2);
    expect(s.objects[legend]!.counters["+1/+1"]).toBe(2);
    expect(s.objects[legend]!.counters.shield).toBe(2);
    expect(s.objects[plain]!.counters["+1/+1"]).toBe(1);
  });

  it("Henzie: creature spells with mana value 4 or greater have blitz for their mana cost, {1} less for each commander cast", () => {
    supported(henzie);
    const { s: s0, ap, ids } = setup([bigOne, bear()]);
    putOnBattlefield(s0, ap, henzie);
    const how = { alt: "grantedBlitz" as const };
    expect(total(spellCost(s0, ap, s0.objects[ids[0]!]!, 0, [], how))).toBe(5);
    expect(castProblem(s0, ap, ids[1]!, undefined, undefined, undefined, undefined, undefined, how)).toBeTruthy();
    const cmd = Object.keys(s0.players[ap]!.commanderCasts)[0]!;
    s0.players[ap]!.commanderCasts[cmd] = 2;
    expect(total(spellCost(s0, ap, s0.objects[ids[0]!]!, 0, [], how))).toBe(3);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, how)));
    const giant = ids[0]!;
    expect(s.objects[giant]!.zone).toBe("battlefield");
    expect(characteristics(s, s.objects[giant]!).keywords).toContain("Haste");
    // Sacrificed at the beginning of the next end step; its controller draws a card as it dies.
    const hand = s.players[ap]!.hand.length;
    s = passUntil(s, "end");
    s = settle(s);
    expect(s.objects[giant]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("Keranos: the first card you draw on each of your turns is revealed; a land draws a card, a nonland deals 3 damage", () => {
    supported(keranos);
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, keranos);
    // A land first: one more card.
    into(s0, ap, divination, "library");
    into(s0, ap, desert, "library");
    s0.players[ap]!.draws = undefined;
    const hand = s0.players[ap]!.hand.length;
    draw(s0, ap, 1);
    let s = settle(s0);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(s.log.some((l) => /reveals Test Desert/.test(typeof l === "string" ? l : l.text))).toBe(true);
    // The second card drawn this turn isn't revealed: nothing more happens.
    into(s, ap, bolt, "library");
    draw(s, ap, 1);
    expect(s.triggerQueue.length + s.stack.length).toBe(0);
    // A nonland first: 3 damage to any target.
    const { s: t0, ap: me, opp: them } = setup([]);
    putOnBattlefield(t0, me, keranos);
    into(t0, me, bolt, "library");
    t0.players[me]!.draws = undefined;
    draw(t0, me, 1);
    let t = t0;
    for (let i = 0; i < 20 && t.pending?.kind !== "chooseTargets"; i++) t = act(t, { type: "passPriority", player: waitingOn(t)! });
    expect(t.pending?.kind).toBe("chooseTargets");
    const life = t.players[them]!.life;
    t = act(t, { type: "chooseTargets", player: me, targets: [{ kind: "player", id: them }] });
    t = settle(t);
    expect(t.players[them]!.life).toBe(life - 3);
    // Not on another player's turn.
    let u = passUntil(t, "upkeep", them);
    u.players[me]!.draws = undefined;
    into(u, me, desert, "library");
    const before = u.players[me]!.hand.length;
    draw(u, me, 1);
    expect(u.players[me]!.hand.length).toBe(before + 1);
    expect(u.triggerQueue.length).toBe(0);
    void opp;
  });

  it("The Peregrine Dynamo: copies an ability of another legendary source you control, not a nonlegendary one or a commander's", () => {
    supported(dynamo);
    const sage = (legendary: boolean) => card(legendary ? "Test Sage" : "Test Clerk", `${legendary ? "Legendary " : ""}Creature — Human`, "{1}{W}", { power: "1", toughness: "1", oracleText: "{1}: You gain 2 life." });
    const { s: s0, ap } = setup([]);
    const d = putOnBattlefield(s0, ap, dynamo);
    const legend = putOnBattlefield(s0, ap, sage(true));
    const clerk = putOnBattlefield(s0, ap, sage(false));
    const cmd = putOnBattlefield(s0, ap, card("Test Elder", "Legendary Creature — Human", "{1}{W}", { power: "1", toughness: "1", oracleText: "{1}: You gain 2 life." }), { commander: true });
    let s = s0;
    const life = s.players[ap]!.life;
    for (const id of [clerk, cmd, legend]) s = run(s, planActivate(s, ap, id, 0));
    const [onClerk, onCmd, onLegend] = s.stack.map((x) => x.id);
    expect(planActivate(s, ap, d, 0, [{ kind: "stack", id: onClerk! }])).toBeNull();
    expect(planActivate(s, ap, d, 0, [{ kind: "stack", id: onCmd! }])).toBeNull();
    expect(abilityProblem(s, ap, d, 0, [{ kind: "stack", id: onClerk! }])).toMatch(/target/);
    s = run(s, planActivate(s, ap, d, 0, [{ kind: "stack", id: onLegend! }]));
    s = settle(s);
    // Three abilities and the copy: 8 life.
    expect(s.players[ap]!.life).toBe(life + 8);
  });

  it("Superior Spider-Man: enters as a copy of a creature card in a graveyard, a 4/4 Spider Human Hero named Superior Spider-Man; that card is exiled", () => {
    supported(superior);
    const { s: s0, ap, opp, ids } = setup([superior]);
    const dead = into(s0, opp, card("Test Wurm", "Creature — Wurm", "{6}{G}", { power: "7", toughness: "7", keywords: ["Trample"], oracleText: "Trample" }), "graveyard");
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto"));
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseOption"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind === "chooseOption" && s.pending.options).toContain(dead);
    s = act(s, { type: "chooseOption", player: ap, choice: dead });
    const c = characteristics(s, s.objects[ids[0]!]!);
    expect(c.name).toBe("Superior Spider-Man");
    expect([c.power, c.toughness]).toEqual([4, 4]);
    expect(c.subtypes).toEqual(expect.arrayContaining(["Wurm", "Spider", "Human", "Hero"]));
    expect(c.keywords).toContain("Trample");
    s = settle(s);
    expect(s.objects[dead]!.zone).toBe("exile");
  });
});
