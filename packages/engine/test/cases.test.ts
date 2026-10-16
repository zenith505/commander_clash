// Case cards (CR 719): "To solve — [condition]" is "At the beginning of your end step, if [condition] and this Case is not
// solved, it becomes solved" (719.3a), checked as it triggers and as it resolves (rulings); solved is a designation it
// keeps until it leaves the battlefield and that isn't copiable (719.3b); "Solved — [ability]" works only while it's
// solved (702.169). Also the "this turn" conditions they introduce, which other cards use too (Arclight Phoenix, Lyse
// Hext, hellbent's "no cards in hand").

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, cast, island, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { moveObject } from "../src/game";
import { abilityProblem, botActions, characteristics, isFullySupported, objHasKeyword, objIsType, planActivate, power, toughness, topPlayable, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const pid = waitingOn(s)!;
    s = act(s, s.pending ? botActions(s, pid)[0]! : { type: "passPriority", player: pid });
  }
  return s;
};
const toHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  return id;
};
const onTop = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  return id;
};
/** Into the end step of `pid`'s turn, with its triggers resolved. */
const endStep = (s: GameState, pid: PlayerId) => settle(passUntil(s, "end", pid));

// Real oracle text (Scryfall).
const skeleton = card("Case of the Stashed Skeleton", "Enchantment — Case", "{1}{B}", { oracleText: "When this Case enters, create a 2/1 black Skeleton creature token and suspect it. (It has menace and can't block.)\nTo solve — You control no suspected Skeletons. (If unsolved, solve at the beginning of your end step.)\nSolved — {1}{B}, Sacrifice this Case: Search your library for a card, put it into your hand, then shuffle. Activate only as a sorcery.", keywords: ["Solved", "Suspect"] });
const pulse = card("Case of the Crimson Pulse", "Enchantment — Case", "{2}{R}", { oracleText: "When this Case enters, discard a card, then draw two cards.\nTo solve — You have no cards in hand. (If unsolved, solve at the beginning of your end step.)\nSolved — At the beginning of your upkeep, discard your hand, then draw two cards.", keywords: ["Solved"] });
const gorgon = card("Case of the Gorgon's Kiss", "Enchantment — Case", "{B}", { oracleText: "When this Case enters, destroy up to one target creature that was dealt damage this turn.\nTo solve — Three or more creature cards were put into graveyards from anywhere this turn. (If unsolved, solve at the beginning of your end step.)\nSolved — This Case is a 4/4 Gorgon creature with deathtouch and lifelink in addition to its other types.", keywords: ["Solved"] });
const lab = card("Case of the Ransacked Lab", "Enchantment — Case", "{2}{U}", { oracleText: "Instant and sorcery spells you cast cost {1} less to cast.\nTo solve — You've cast four or more instant and sorcery spells this turn. (If unsolved, solve at the beginning of your end step.)\nSolved — Whenever you cast an instant or sorcery spell, draw a card.", keywords: ["Solved"] });
const falcon = card("Case of the Filched Falcon", "Enchantment — Case", "{U}", { oracleText: "When this Case enters, investigate. (Create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")\nTo solve — You control three or more artifacts. (If unsolved, solve at the beginning of your end step.)\nSolved — {2}{U}, Sacrifice this Case: Put four +1/+1 counters on target noncreature artifact. It becomes a 0/0 Bird creature with flying in addition to its other types.", keywords: ["Investigate", "Solved"] });
const hothouse = card("Case of the Locked Hothouse", "Enchantment — Case", "{3}{G}", { oracleText: "You may play an additional land on each of your turns.\nTo solve — You control seven or more lands. (If unsolved, solve at the beginning of your end step.)\nSolved — You may look at the top card of your library any time, and you may play lands and cast creature and enchantment spells from the top of your library.", keywords: ["Solved"] });
const garden = card("Case of the Trampled Garden", "Enchantment — Case", "{2}{G}", { oracleText: "When this Case enters, distribute two +1/+1 counters among one or two target creatures you control.\nTo solve — Creatures you control have total power 8 or greater. (If unsolved, solve at the beginning of your end step.)\nSolved — Whenever you attack, put a +1/+1 counter on target attacking creature. It gains trample until end of turn.", keywords: ["Solved"] });
const phoenix = card("Arclight Phoenix", "Creature — Phoenix", "{3}{R}", { power: "3", toughness: "2", keywords: ["Flying", "Haste"], oracleText: "Flying, haste\nAt the beginning of combat on your turn, if you've cast three or more instant and sorcery spells this turn, return this card from your graveyard to the battlefield." });
const lyse = card("Lyse Hext", "Legendary Creature — Human Rebel Monk", "{1}{W}{U}", { power: "2", toughness: "2", keywords: ["Prowess"], oracleText: "Prowess (Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn.)\nNoncreature spells you cast cost {1} less to cast.\nAs long as you've cast two or more noncreature spells this turn, Lyse Hext has double strike." });
const opt = () => card("Opt", "Instant", "{U}", { oracleText: "Scry 1.\nDraw a card." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const clue = card("Clue", "Artifact — Clue", "", { oracleText: "{2}, Sacrifice this artifact: Draw a card." });

describe("Cases", () => {
  it("compiles them", () => supported(skeleton, pulse, gorgon, lab, falcon, hothouse, garden, phoenix, lyse));

  it("Stashed Skeleton: the token is suspected, the Case is solved once no suspected Skeleton is left, then its ability works", () => {
    let { s, ap, ids } = setup([skeleton, shock]);
    s = settle(cast(s, ap, ids[0]!));
    const caseId = ids[0]!;
    const tok = s.battlefield.find((id) => s.objects[id]!.isToken)!;
    expect(s.objects[tok]!.suspected).toBeDefined(); // "suspect it" is the token, not the Case
    expect(s.objects[caseId]!.suspected).toBeUndefined();
    expect(abilityProblem(s, ap, caseId, 0)).toBeTruthy(); // not solved yet
    // End step with the suspected Skeleton still there: no trigger, not solved.
    s = endStep(s, ap);
    expect(s.objects[caseId]!.solved).toBeUndefined();
    // Next turn: Shock the Skeleton, then the end step solves the Case.
    s = passUntil(s, "main1", ap);
    s = settle(cast(s, ap, ids[1]!, [target(tok)]));
    expect(s.battlefield).not.toContain(tok);
    s = endStep(s, ap);
    expect(s.objects[caseId]!.solved).toBe(true);
    expect(s.log.some((l) => /Case of the Stashed Skeleton is solved/.test(l.text))).toBe(true);
    // Solved: sorcery speed, so on our next main phase.
    s = passUntil(s, "main1", ap);
    expect(planActivate(s, ap, caseId, 0)).toBeTruthy();
  });

  it("only its controller's end step solves it, and only if the condition still holds as it resolves", () => {
    let { s, ap, opp } = setup([]);
    const c = putOnBattlefield(s, ap, pulse);
    // An opponent's end step, with our hand empty: nothing.
    s = passUntil(s, "main1", opp);
    s.players[ap]!.hand = [];
    s = endStep(s, opp);
    expect(s.objects[c]!.solved).toBeUndefined();
    // Our end step: it triggers with an empty hand, but a card arrives before it resolves (rulings: not solved).
    s = passUntil(s, "main2", ap);
    s.players[ap]!.hand = [];
    s = passUntil(s, "end", ap);
    expect(s.stack.length + s.triggerQueue.length).toBeGreaterThan(0);
    toHand(s, ap, bear());
    s = settle(s);
    expect(s.objects[c]!.solved).toBeUndefined();
  });

  it("Crimson Pulse: solved with no cards in hand, then its upkeep trigger works; leaving the battlefield ends it", () => {
    let { s, ap } = setup([]);
    const c = putOnBattlefield(s, ap, pulse);
    s = passUntil(s, "main2", ap);
    s.players[ap]!.hand = [];
    s = endStep(s, ap);
    expect(s.objects[c]!.solved).toBe(true);
    s = passUntil(s, "upkeep", ap);
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(2); // discarded nothing, drew two (rulings)
    // A new object if it leaves and comes back (CR 400.7): not solved.
    moveObject(s, c, "hand");
    moveObject(s, c, "battlefield");
    expect(s.objects[c]!.solved).toBeUndefined();
  });

  it("Gorgon's Kiss: creature cards put into graveyards from anywhere; solved, it's a 4/4 Gorgon with deathtouch and lifelink", () => {
    let { s, ap, opp, ids } = setup([gorgon, shock]);
    const caseId = ids[0]!;
    const b1 = putOnBattlefield(s, opp, bear());
    s = settle(cast(s, ap, ids[1]!, [target(b1)])); // one creature card dies
    s = settle(cast(s, ap, caseId));
    expect(objIsType(s, s.objects[caseId]!, "Creature")).toBe(false);
    // Two more creature cards: one discarded, one milled. A token wouldn't count (it isn't a card).
    moveObject(s, toHand(s, opp, bear()), "graveyard");
    moveObject(s, onTop(s, opp, bear()), "graveyard");
    expect(s.turnLog?.toGraveyardTypes?.Creature).toBe(3);
    s = endStep(s, ap);
    const o = s.objects[caseId]!;
    expect(o.solved).toBe(true);
    expect(objIsType(s, o, "Creature")).toBe(true);
    expect(objIsType(s, o, "Enchantment")).toBe(true);
    expect(characteristics(s, o).subtypes).toEqual(expect.arrayContaining(["Case", "Gorgon"]));
    expect(`${power(s, o)}/${toughness(s, o)}`).toBe("4/4");
    expect(objHasKeyword(s, o, "Deathtouch") && objHasKeyword(s, o, "Lifelink")).toBe(true);
  });

  it("Ransacked Lab: four instant and sorcery spells this turn, then a card for each one", () => {
    const opts = [opt(), opt(), opt(), opt(), opt()];
    let { s, ap, ids } = setup(opts);
    s.players[ap]!.hand = [...ids]; // nothing to discard at cleanup
    for (let i = 0; i < 3; i++) putOnBattlefield(s, ap, island);
    putOnBattlefield(s, ap, lab);
    const c = s.battlefield[0]!;
    for (const id of ids.slice(0, 3)) s = settle(cast(s, ap, id));
    s = endStep(s, ap);
    expect(s.objects[c]!.solved).toBeUndefined(); // three isn't four
    s = passUntil(s, "main1", ap);
    for (const id of ids.slice(3)) s = settle(cast(s, ap, id));
    const more = [opt(), opt()].map((d) => toHand(s, ap, d));
    for (const id of more) s = settle(cast(s, ap, id));
    s = endStep(s, ap);
    expect(s.objects[c]!.solved).toBe(true);
    s = passUntil(s, "main1", ap);
    const hand = s.players[ap]!.hand.length;
    const last = toHand(s, ap, opt());
    s = settle(cast(s, ap, last));
    expect(s.players[ap]!.hand.length).toBe(hand + 2); // Opt's draw and the Case's
  });

  it("Filched Falcon: solved with three artifacts; its sacrifice ability makes a noncreature artifact a 4/4 flying Bird", () => {
    let { s, ap, ids } = setup([falcon]);
    s = settle(cast(s, ap, ids[0]!));
    const c = ids[0]!;
    const clueTok = s.battlefield.find((id) => s.objects[id]!.isToken)!;
    expect(characteristics(s, s.objects[clueTok]!).subtypes).toContain("Clue");
    putOnBattlefield(s, ap, clue);
    s = endStep(s, ap);
    expect(s.objects[c]!.solved).toBeUndefined(); // two artifacts
    putOnBattlefield(s, ap, clue);
    s = passUntil(s, "main1", ap);
    s = endStep(s, ap);
    expect(s.objects[c]!.solved).toBe(true);
    s = passUntil(s, "main1", ap);
    s = settle(activate(s, ap, c, 0, [target(clueTok)]));
    const bird = s.objects[clueTok]!;
    expect(s.objects[c]!.zone).toBe("graveyard");
    expect(objIsType(s, bird, "Creature") && objIsType(s, bird, "Artifact")).toBe(true);
    expect(characteristics(s, bird).subtypes).toEqual(expect.arrayContaining(["Clue", "Bird"]));
    expect(`${power(s, bird)}/${toughness(s, bird)}`).toBe("4/4");
    expect(objHasKeyword(s, bird, "Flying")).toBe(true);
    // It lasts past the turn (no duration).
    s = passUntil(s, "main1", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    expect(objIsType(s, s.objects[clueTok]!, "Creature")).toBe(true);
  });

  it("Locked Hothouse: the top of the library is playable only once it's solved", () => {
    let { s, ap } = setup([]);
    const c = putOnBattlefield(s, ap, hothouse);
    const top = onTop(s, ap, bear());
    expect(topPlayable(s, ap)).not.toContain(top);
    s = endStep(s, ap); // fourteen lands
    expect(s.objects[c]!.solved).toBe(true);
    s = passUntil(s, "main1", ap);
    const now = s.players[ap]!.library[0]!;
    expect(topPlayable(s, ap)).toContain(now);
  });

  it("Arclight Phoenix and Lyse Hext count instant, sorcery and noncreature spells this turn", () => {
    let { s, ap, ids } = setup([opt(), opt(), opt()]);
    const l = putOnBattlefield(s, ap, lyse);
    const p = putOnBattlefield(s, ap, phoenix);
    moveObject(s, p, "graveyard");
    s = settle(cast(s, ap, ids[0]!));
    expect(objHasKeyword(s, s.objects[l]!, "Double strike")).toBe(false);
    s = settle(cast(s, ap, ids[1]!));
    expect(objHasKeyword(s, s.objects[l]!, "Double strike")).toBe(true);
    s = settle(cast(s, ap, ids[2]!));
    s = settle(passUntil(s, "beginCombat", ap));
    expect(s.objects[p]!.zone).toBe("battlefield");
  });
});
