// Round 203: storied and the enduring story (CR 702.195: Balin, Bifur, Bombur, Dáin, Fíli, Kíli, Óin, Ori, Thorin
// Oakenshield), "artifacts and creatures you control" as a group (Thorin), time travel (CR 701.56: Wibbly-wobbly,
// Timey-wimey, All of History, All at Once, Time Beetle, Rotating Fireplace, The Tenth Doctor, The Girl in the Fireplace,
// The Parting of the Ways), a token with vanishing (The Girl in the Fireplace), "Whenever a creature you control deals
// combat damage to a player this turn" on a Saga chapter, "Put three time counters on it" after exiling until a nonland
// card (The Tenth Doctor) and "for each nonland card exiled this way, put a number of time counters on that card equal
// to its mana value" (The Parting of the Ways).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, attackTax, botActions, characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, power, runStateBasedActions, toughness, wardCosts, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** A card with suspend in exile with `n` time counters: suspended (CR 702.62b). */
const suspended = (s: GameState, pid: PlayerId, def: CardDef, n: number) => {
  const id = into(s, pid, def, "exile");
  s.objects[id]!.counters.time = n;
  return id;
};
/**
 * Everyone passes until the stack is empty, answering "you may" with `may`, targets with `targets`, and each time travel
 * question with `travel` (by object, else "none"); stops at any other question.
 */
const settle = (s: GameState, opts: { may?: boolean; targets?: TargetChoice[]; travel?: Record<ObjectId, string>; asked?: ObjectId[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: opts.may ?? true });
    else if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets ?? [] });
    else if (p?.kind === "chooseOption" && p.what === "timeTravel") {
      opts.asked?.push(p.about!);
      s = act(s, { type: "chooseOption", player: p.player, choice: opts.travel?.[p.about!] ?? "none" });
    } else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Passes (no blocks, discarding down to hand size) until `step` of `ap`'s turn with an empty stack, or another question. */
const toStep = (s: GameState, step: GameState["step"], ap: PlayerId) => {
  for (let i = 0; i < 1500; i++) {
    if (s.step === step && s.activePlayer === ap && !s.stack.length && !s.triggerQueue.length && !s.pending) return s;
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: p.player, attacks: [] });
    else if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: false });
    else if (p?.kind === "discardToHandSize") s = act(s, { type: "discard", player: p.player, objectIds: s.players[p.player]!.hand.slice(0, p.count) });
    else if (p?.kind === "pickPermanents" && p.action === "keepTapped") s = act(s, { type: "pickPermanents", player: p.player, ids: [] });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  throw new Error(`never reached ${step}`);
};
/** State checks, as after any action: storied looks then too (CR 702.195a). */
const check = (s: GameState) => {
  runStateBasedActions(s);
  return s;
};
const tappedLands = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.objects[id]!.tapped && characteristics(s, s.objects[id]!).types.includes("Land")).length;
const rock = (n = "Test Rock") => card(n, "Artifact", "{1}", { cmc: 1 });
const legendaryRock = card("Test Crown", "Legendary Artifact", "{1}", { cmc: 1 });
const timeRock = card("Test Clock", "Artifact", "{1}", { cmc: 1 });

// Real oracle text (Scryfall).
const balinLoremaster = card("Balin, Loremaster", "Legendary Creature — Dwarf Bard", "{3}{R}{R}", {"cmc": 5, "power": "4", "toughness": "4", "keywords": ["Storied"], "oracleText": "Storied (If you control three or more artifacts, legendaries, and/or Sagas, you have an enduring story for the rest of the game.)\nWhenever Balin or another Dwarf you control enters, you may discard your hand. Draw X cards, where X is the number of cards discarded this way. If you have an enduring story, Balin deals X damage to each opponent.", "colors": ["R"], "colorIdentity": ["R"], "layout": "normal"});
const bifurMelodicRider = card("Bifur, Melodic Rider", "Legendary Creature — Dwarf Bard", "{4}{R/W}{R/W}", {"cmc": 6, "power": "4", "toughness": "5", "keywords": ["Storied"], "oracleText": "Storied (If you control three or more artifacts, legendaries, and/or Sagas, you have an enduring story for the rest of the game.)\nWhenever Bifur enters or attacks, put a +1/+1 counter on target creature.\nAs long as you have an enduring story, if a triggered ability of a Dwarf you control triggers, that ability triggers an additional time.", "colors": ["R", "W"], "colorIdentity": ["R", "W"], "layout": "normal"});
const bomburGentleDreamer = card("Bombur, Gentle Dreamer", "Legendary Creature — Dwarf Bard", "{2}{R}", {"cmc": 3, "power": "5", "toughness": "3", "keywords": ["Storied"], "oracleText": "Storied (If you control three or more artifacts, legendaries, and/or Sagas, you have an enduring story for the rest of the game.)\nBombur doesn't untap during your untap step unless you have an enduring story.", "colors": ["R"], "colorIdentity": ["R"], "layout": "normal"});
const dainLordOfTheIronHills = card("D\u00e1in, Lord of the Iron Hills", "Legendary Creature — Dwarf Noble", "{1}{W}", {"cmc": 2, "power": "2", "toughness": "2", "keywords": ["Vigilance", "Storied"], "oracleText": "Vigilance\nStoried (If you control three or more artifacts, legendaries, and/or Sagas, you have an enduring story for the rest of the game.)\nAs long as you have an enduring story, creatures can't attack you unless their controller pays {1} for each of those creatures.", "colors": ["W"], "colorIdentity": ["W"], "layout": "normal"});
const filiThePathfinder = card("F\u00edli the Pathfinder", "Legendary Creature — Dwarf Scout", "{3}{W}", {"cmc": 4, "power": "2", "toughness": "2", "keywords": ["Storied"], "oracleText": "Storied (If you control three or more artifacts, legendaries, and/or Sagas, you have an enduring story for the rest of the game.)\nAs long as you have an enduring story, creatures you control get +1/+1.\nWhenever Fíli or another nontoken Dwarf you control enters, create a 2/2 red Dwarf creature token.", "colors": ["W"], "colorIdentity": ["W"], "layout": "normal"});
const kiliTheResourceful = card("K\u00edli the Resourceful", "Legendary Creature — Dwarf Scout", "{1}{W}", {"cmc": 2, "power": "1", "toughness": "2", "keywords": ["Storied"], "oracleText": "Storied (If you control three or more artifacts, legendaries, and/or Sagas, you have an enduring story for the rest of the game.)\nAs long as you have an enduring story, you may pay {0} rather than pay the equip cost of the first equip ability you activate each turn.\nWhenever another Dwarf or Equipment you control enters, draw a card. This ability triggers only once each turn.", "colors": ["W"], "colorIdentity": ["W"], "layout": "normal"});
const oinTheBrave = card("\u00d3in the Brave", "Legendary Creature — Dwarf Warrior", "{1}{R}", {"cmc": 2, "power": "1", "toughness": "3", "keywords": ["Storied"], "oracleText": "Storied (If you control three or more artifacts, legendaries, and/or Sagas, you have an enduring story for the rest of the game.)\nAs long as you have an enduring story, Óin gets +1/+0 and has haste.\n{1}, {T}, Discard a card: Draw a card.", "colors": ["R"], "colorIdentity": ["R"], "layout": "normal"});
const oriKeeperOfSongs = card("Ori, Keeper of Songs", "Legendary Creature — Dwarf Bard", "{2}{W}", {"cmc": 3, "power": "3", "toughness": "3", "keywords": ["Storied"], "oracleText": "Storied (If you control three or more artifacts, legendaries, and/or Sagas, you have an enduring story for the rest of the game.)\nAs long as you have an enduring story, Ori gets +1/+0 and has vigilance.", "colors": ["W"], "colorIdentity": ["W"], "layout": "normal"});
const thorinOakenshield = card("Thorin Oakenshield", "Legendary Creature — Dwarf Noble", "{R}{W}", {"cmc": 2, "power": "3", "toughness": "2", "keywords": ["Trample", "Storied"], "oracleText": "Trample\nStoried (If you control three or more artifacts, legendaries, and/or Sagas, you have an enduring story for the rest of the game.)\nAs long as you have an enduring story, artifacts and creatures you control have ward {1}.", "colors": ["R", "W"], "colorIdentity": ["R", "W"], "layout": "normal"});
const allOfHistoryAllAtOnce = card("All of History, All at Once", "Sorcery", "{2}{U}{U}", {"cmc": 4, "keywords": ["Storm", "Time Travel"], "oracleText": "Time travel. (For each suspended card you own and each permanent you control with a time counter on it, you may add or remove a time counter.)\nStorm (When you cast this spell, copy it for each spell cast before it this turn.)", "colors": ["U"], "colorIdentity": ["U"], "layout": "normal"});
const rotatingFireplace = card("Rotating Fireplace", "Artifact", "{3}", {"cmc": 3, "keywords": ["Time Travel"], "oracleText": "This artifact enters tapped with a time counter on it.\n{T}: Add an amount of {C} equal to the number of time counters on this artifact.\n{4}, {T}: Time travel. Activate only as a sorcery. (For each suspended card you own and each permanent you control with a time counter on it, you may add or remove a time counter.)", "colors": [], "colorIdentity": [], "layout": "normal"});
const theGirlInTheFireplace = card("The Girl in the Fireplace", "Enchantment — Saga", "{2}{W}", {"cmc": 3, "keywords": ["Time Travel"], "oracleText": "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — Create a 1/1 white Human Noble creature token with vanishing 3 and \"Prevent all damage that would be dealt to this token.\"\nII — Create a 2/2 white Horse creature token with \"Doctors you control have horsemanship.\" (They can't be blocked except by creatures with horsemanship.)\nIII — Whenever a creature you control deals combat damage to a player this turn, time travel.", "colors": ["W"], "colorIdentity": ["W"], "layout": "saga"});
const thePartingOfTheWays = card("The Parting of the Ways", "Enchantment — Saga", "{4}{R}{R}", {"cmc": 6, "keywords": ["Time Travel"], "oracleText": "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — Exile the top five cards of your library. For each nonland card exiled this way, put a number of time counters on that card equal to its mana value. If it doesn't have suspend, it gains suspend.\nII — Time travel, then time travel.\nIII — For each opponent, destroy up to one target artifact that player controls.", "colors": ["R"], "colorIdentity": ["R"], "layout": "saga"});
const theTenthDoctor = card("The Tenth Doctor", "Legendary Creature — Time Lord Doctor", "{3}{U}{R}", {"cmc": 5, "power": "3", "toughness": "5", "keywords": ["Allons-y!", "Time Travel", "Timey-Wimey"], "oracleText": "Allons-y! — Whenever you attack, exile cards from the top of your library until you exile a nonland card. Put three time counters on it. If it doesn't have suspend, it gains suspend.\nTimey-Wimey — {7}: Time travel three times. Activate only as a sorcery. (For each suspended card you own and each permanent you control with a time counter on it, you may add or remove a time counter. Then do it two more times.)", "colors": ["R", "U"], "colorIdentity": ["R", "U"], "layout": "normal"});
const timeBeetle = card("Time Beetle", "Creature — Alien Insect", "{1}{U}", {"cmc": 2, "power": "1", "toughness": "1", "keywords": ["Skulk", "Parallel Universe", "Time Travel"], "oracleText": "Skulk (This creature can't be blocked by creatures with greater power.)\nParallel Universe — Whenever this creature deals combat damage to a player, time travel. (For each suspended card you own and each permanent you control with a time counter on it, you may add or remove a time counter.)", "colors": ["U"], "colorIdentity": ["U"], "layout": "normal"});
const wibblyWobblyTimeyWimey = card("Wibbly-wobbly, Timey-wimey", "Sorcery", "{1}{U}", {"cmc": 2, "keywords": ["Time Travel"], "oracleText": "Time travel. (For each suspended card you own and each permanent you control with a time counter on it, you may add or remove a time counter.)\nDraw a card.", "colors": ["U"], "colorIdentity": ["U"], "layout": "normal"});
const riftBolt = card("Rift Bolt", "Sorcery", "{2}{R}", {"cmc": 3, "keywords": ["Suspend"], "oracleText": "Rift Bolt deals 3 damage to any target.\nSuspend 1—{R} (Rather than cast this card from your hand, you may pay {R} and exile it with a time counter on it. At the beginning of your upkeep, remove a time counter. When the last is removed, you may cast it without paying its mana cost.)", "colors": ["R"], "colorIdentity": ["R"], "layout": "normal"});
const avenRiftwatcher = card("Aven Riftwatcher", "Creature — Bird Rebel Soldier", "{2}{W}", {"cmc": 3, "power": "2", "toughness": "3", "keywords": ["Flying", "Vanishing"], "oracleText": "Flying\nVanishing 3 (This creature enters with three time counters on it. At the beginning of your upkeep, remove a time counter from it. When the last is removed, sacrifice it.)\nWhen this creature enters or leaves the battlefield, you gain 2 life.", "colors": ["W"], "colorIdentity": ["W"], "layout": "normal"});
const bonesplitter = card("Bonesplitter", "Artifact — Equipment", "{1}", {"cmc": 1, "keywords": ["Equip"], "oracleText": "Equipped creature gets +2/+0.\nEquip {1}", "colors": [], "colorIdentity": [], "layout": "normal"});
const ornithopter = card("Ornithopter", "Artifact Creature — Thopter", "{0}", {"cmc": 0, "power": "0", "toughness": "2", "keywords": ["Flying"], "oracleText": "Flying", "colors": [], "colorIdentity": [], "layout": "normal"});

describe("storied and the enduring story (CR 702.195)", () => {
  it("compile", () => supported(balinLoremaster, bifurMelodicRider, bomburGentleDreamer, dainLordOfTheIronHills, filiThePathfinder, kiliTheResourceful, oinTheBrave, oriKeeperOfSongs, thorinOakenshield));

  it("three artifacts and/or legendaries with a storied permanent give it for the rest of the game; ward {1} while you have it", () => {
    const { s: s0, ap, ids, opp } = setup([thorinOakenshield]);
    const r1 = putOnBattlefield(s0, ap, rock("Rock One"));
    putOnBattlefield(s0, ap, rock("Rock Two"));
    // Three artifacts but no storied permanent: no enduring story (rulings).
    putOnBattlefield(s0, ap, rock("Rock Three"));
    let s = check(s0);
    expect(s.players[ap]!.enduringStory).toBeFalsy();
    expect(wardCosts(s, opp, [tgt(r1)])).toEqual([]);
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    const thorin = ids[0]!;
    expect(s.objects[thorin]!.zone).toBe("battlefield");
    expect(s.players[ap]!.enduringStory).toBe(true);
    expect(s.log.some((l) => /has an enduring story/.test(l.text))).toBe(true);
    // "Artifacts and creatures you control have ward {1}": the artifacts and Thorin.
    expect(wardCosts(s, opp, [tgt(r1)])).toEqual(["{1}"]);
    expect(wardCosts(s, opp, [tgt(thorin)])).toEqual(["{1}"]);
    // Once you have it, you keep it, even without Thorin (rulings); his ward goes with him.
    s.battlefield.splice(s.battlefield.indexOf(thorin), 1);
    s.objects[thorin]!.zone = "graveyard";
    s.players[ap]!.graveyard.push(thorin);
    invalidateCharacteristics(s);
    check(s);
    expect(s.players[ap]!.enduringStory).toBe(true);
    expect(wardCosts(s, opp, [tgt(r1)])).toEqual([]);
  });

  it("a legendary artifact counts once; a Saga counts (rulings)", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, oriKeeperOfSongs);
    putOnBattlefield(s0, ap, legendaryRock);
    let s = check(s0);
    // Ori (legendary) and a legendary artifact: two permanents.
    expect(s.players[ap]!.enduringStory).toBeFalsy();
    const ori = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Ori, Keeper of Songs")!;
    expect(power(s, s.objects[ori]!)).toBe(3);
    expect(objHasKeyword(s, s.objects[ori]!, "Vigilance")).toBe(false);
    const saga = putOnBattlefield(s, ap, card("Test Saga", "Enchantment — Saga", "{1}", { cmc: 1 }));
    s.objects[saga]!.counters.lore = 1;
    s = check(s);
    expect(s.players[ap]!.enduringStory).toBe(true);
    expect(power(s, s.objects[ori]!)).toBe(4);
    expect(objHasKeyword(s, s.objects[ori]!, "Vigilance")).toBe(true);
  });

  it("Óin gets +1/+0 and haste, Fíli gives your creatures +1/+1 and makes Dwarf tokens", () => {
    const { s: s0, ap, ids } = setup([filiThePathfinder]);
    const oin = putOnBattlefield(s0, ap, oinTheBrave, { sick: true });
    const b = putOnBattlefield(s0, ap, bear());
    putOnBattlefield(s0, ap, rock());
    let s = check(s0);
    expect(s.players[ap]!.enduringStory).toBeFalsy();
    expect(power(s, s.objects[oin]!)).toBe(1);
    expect(objHasKeyword(s, s.objects[oin]!, "Haste")).toBe(false);
    // Fíli makes three: Óin, a rock and Fíli.
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(s.players[ap]!.enduringStory).toBe(true);
    expect(power(s, s.objects[oin]!)).toBe(3);
    expect(toughness(s, s.objects[oin]!)).toBe(4);
    expect(objHasKeyword(s, s.objects[oin]!, "Haste")).toBe(true);
    expect(power(s, s.objects[b]!)).toBe(3);
    const dwarves = s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Dwarf"));
    expect(dwarves.length).toBe(1);
    expect(power(s, s.objects[dwarves[0]!]!)).toBe(3);
  });

  it("Bombur untaps only once you have an enduring story", () => {
    const { s: s0, ap } = setup([]);
    const bombur = putOnBattlefield(s0, ap, bomburGentleDreamer);
    s0.objects[bombur]!.tapped = true;
    let s = toStep(s0, "main1", s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!);
    s = toStep(s, "main1", ap);
    expect(s.objects[bombur]!.tapped).toBe(true);
    putOnBattlefield(s, ap, rock("Rock One"));
    putOnBattlefield(s, ap, rock("Rock Two"));
    check(s);
    expect(s.players[ap]!.enduringStory).toBe(true);
    s = toStep(s, "main1", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    s = toStep(s, "main1", ap);
    expect(s.objects[bombur]!.tapped).toBe(false);
  });

  it("Balin: you may discard your hand to draw that many; with an enduring story he deals that much to each opponent", () => {
    const { s: s0, ap, ids } = setup([balinLoremaster]);
    putOnBattlefield(s0, ap, rock("Rock One"));
    putOnBattlefield(s0, ap, rock("Rock Two"));
    const opps = s0.turnOrder.filter((p) => p !== ap);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    const hand = s.players[ap]!.hand.length;
    expect(hand).toBeGreaterThan(3);
    s = settle(s, { may: true });
    expect(s.players[ap]!.enduringStory).toBe(true);
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(s.players[ap]!.graveyard.length).toBe(hand);
    for (const p of opps) expect(s.players[p]!.life).toBe(40 - hand);
    // Declining: nothing is discarded, drawn or dealt.
    const { s: s1, ap: ap1, ids: ids1 } = setup([balinLoremaster]);
    let t = run(s1, planCast(s1, ap1, ids1[0]!));
    const hand1 = t.players[ap1]!.hand.length;
    t = settle(t, { may: false });
    expect(t.players[ap1]!.hand.length).toBe(hand1);
    for (const p of t.turnOrder.filter((x) => x !== ap1)) expect(t.players[p]!.life).toBe(40);
    // Without an enduring story: the draws, no damage.
    const { s: s2, ap: ap2, ids: ids2 } = setup([balinLoremaster]);
    let u = run(s2, planCast(s2, ap2, ids2[0]!));
    const hand2 = u.players[ap2]!.hand.length;
    u = settle(u, { may: true });
    expect(u.players[ap2]!.enduringStory).toBeFalsy();
    expect(u.players[ap2]!.hand.length).toBe(hand2);
    for (const p of u.turnOrder.filter((x) => x !== ap2)) expect(u.players[p]!.life).toBe(40);
  });

  it("Bifur: Dwarves' triggered abilities trigger an additional time, his own too when he gives you the story (rulings)", () => {
    const { s: s0, ap, ids } = setup([bifurMelodicRider, filiThePathfinder]);
    putOnBattlefield(s0, ap, rock("Rock One"));
    putOnBattlefield(s0, ap, rock("Rock Two"));
    const b = putOnBattlefield(s0, ap, bear());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { targets: [tgt(b)] });
    expect(s.players[ap]!.enduringStory).toBe(true);
    expect(s.objects[b]!.counters["+1/+1"]).toBe(2);
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    const dwarves = s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Dwarf"));
    expect(dwarves.length).toBe(2);
    // Without the story: once.
    const { s: s1, ap: ap1, ids: ids1 } = setup([bifurMelodicRider]);
    const b1 = putOnBattlefield(s1, ap1, bear());
    const t = settle(run(s1, planCast(s1, ap1, ids1[0]!)), { targets: [tgt(b1)] });
    expect(t.players[ap1]!.enduringStory).toBeFalsy();
    expect(t.objects[b1]!.counters["+1/+1"]).toBe(1);
  });

  it("Kíli: the first equip ability each turn costs {0} while you have an enduring story", () => {
    const { s: s0, ap } = setup([]);
    const kili = putOnBattlefield(s0, ap, kiliTheResourceful);
    const e1 = putOnBattlefield(s0, ap, bonesplitter);
    const e2 = putOnBattlefield(s0, ap, { ...bonesplitter, oracleId: "bonesplitter-2", name: "Other Bonesplitter" });
    let s = check(s0);
    expect(s.players[ap]!.enduringStory).toBe(true);
    s = settle(run(s, planActivate(s, ap, e1, 0, [tgt(kili)])));
    expect(s.objects[e1]!.attachedTo).toBe(kili);
    expect(tappedLands(s, ap)).toBe(0);
    s = settle(run(s, planActivate(s, ap, e2, 0, [tgt(kili)])));
    expect(s.objects[e2]!.attachedTo).toBe(kili);
    expect(tappedLands(s, ap)).toBe(1);
    // Without the story it costs {1}.
    const { s: s1, ap: ap1 } = setup([]);
    const k1 = putOnBattlefield(s1, ap1, kiliTheResourceful);
    const e3 = putOnBattlefield(s1, ap1, bonesplitter);
    const t = settle(run(s1, planActivate(s1, ap1, e3, 0, [tgt(k1)])));
    expect(t.players[ap1]!.enduringStory).toBeFalsy();
    expect(t.objects[e3]!.attachedTo).toBe(k1);
    expect(tappedLands(t, ap1)).toBe(1);
  });

  it("Dáin: creatures can't attack you unless their controller pays {1} each, once you have an enduring story", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, dainLordOfTheIronHills);
    const b = putOnBattlefield(s0, ap, bear());
    let s = passUntil(s0, "declareAttackers", ap);
    expect(attackTax(s, [{ attacker: b, defender: opp }])).toBe(0);
    putOnBattlefield(s, opp, rock("Rock One"));
    putOnBattlefield(s, opp, rock("Rock Two"));
    s = act(s, { type: "declareAttackers", player: ap, attacks: [] });
    expect(s.players[opp]!.enduringStory).toBe(true);
    expect(attackTax(s, [{ attacker: b, defender: opp }])).toBe(1);
  });
});

describe("time travel (CR 701.56a)", () => {
  it("compile", () => supported(wibblyWobblyTimeyWimey, allOfHistoryAllAtOnce, timeBeetle, rotatingFireplace, theTenthDoctor, theGirlInTheFireplace, thePartingOfTheWays));

  it("each permanent you control with a time counter and each suspended card you own is asked about, then all change at once", () => {
    const { s: s0, ap, ids, opp } = setup([wibblyWobblyTimeyWimey]);
    const bolt = suspended(s0, ap, riftBolt, 2);
    const fire = putOnBattlefield(s0, ap, rotatingFireplace);
    s0.objects[fire]!.counters.time = 1;
    const clock = putOnBattlefield(s0, ap, timeRock);
    s0.objects[clock]!.counters.time = 2;
    // Not yours: an opponent's permanent and suspended card.
    const theirs = putOnBattlefield(s0, opp, avenRiftwatcher);
    s0.objects[theirs]!.counters.time = 2;
    const theirBolt = suspended(s0, opp, riftBolt, 2);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    const hand = s.players[ap]!.hand.length;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    for (let i = 0; i < 4 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "timeTravel", player: ap, options: ["add", "remove", "none"] });
    const asked: ObjectId[] = [];
    s = settle(s, { travel: { [bolt]: "remove", [fire]: "add" }, asked });
    expect(new Set(asked)).toEqual(new Set([bolt, fire, clock]));
    expect(s.objects[bolt]!.counters.time).toBe(1);
    expect(s.objects[fire]!.counters.time).toBe(2);
    expect(s.objects[clock]!.counters.time).toBe(2);
    expect(s.objects[theirs]!.counters.time).toBe(2);
    expect(s.objects[theirBolt]!.counters.time).toBe(2);
    // Then "Draw a card".
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("removing the last time counter: the suspended card may be cast, a vanishing creature is sacrificed", () => {
    const { s: s0, ap, ids, opp } = setup([wibblyWobblyTimeyWimey]);
    const bolt = suspended(s0, ap, riftBolt, 1);
    const aven = putOnBattlefield(s0, ap, avenRiftwatcher);
    s0.objects[aven]!.counters.time = 1;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { travel: { [bolt]: "remove", [aven]: "remove" } });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: bolt, how: "suspend" });
    s = settle(run(s, planCast(s, ap, bolt, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(37);
    expect(s.objects[aven]!.zone).toBe("graveyard");
  });

  it("with nothing to change, nothing is asked", () => {
    const { s: s0, ap, ids } = setup([wibblyWobblyTimeyWimey]);
    const asked: ObjectId[] = [];
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)), { asked });
    expect(asked).toEqual([]);
    expect(s.log.some((l) => /time travels \(nothing has a time counter\)/.test(l.text))).toBe(true);
  });

  it("bots take a counter off suspended cards, put one on vanishing creatures and counter-fed mana, and leave the rest", () => {
    const { s: s0, ap, ids } = setup([wibblyWobblyTimeyWimey]);
    const bolt = suspended(s0, ap, riftBolt, 2);
    const aven = putOnBattlefield(s0, ap, avenRiftwatcher);
    s0.objects[aven]!.counters.time = 2;
    const fire = putOnBattlefield(s0, ap, rotatingFireplace);
    s0.objects[fire]!.counters.time = 1;
    const clock = putOnBattlefield(s0, ap, timeRock);
    s0.objects[clock]!.counters.time = 2;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 40 && (s.stack.length || s.pending); i++) {
      if (s.pending?.kind === "chooseOption") s = botActions(s, ap).reduce((x, a) => act(x, a), s);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.objects[bolt]!.counters.time).toBe(1);
    expect(s.objects[aven]!.counters.time).toBe(3);
    expect(s.objects[fire]!.counters.time).toBe(2);
    expect(s.objects[clock]!.counters.time).toBe(2);
  });

  it("Rotating Fireplace: mana for each time counter; {4}, {T}: time travel, as a sorcery", () => {
    const { s: s0, ap } = setup([]);
    const fire = putOnBattlefield(s0, ap, rotatingFireplace);
    s0.objects[fire]!.counters.time = 3;
    const bolt = suspended(s0, ap, riftBolt, 3);
    expect(planActivate(s0, ap, fire, 0)).not.toBeNull();
    // As a sorcery: not in combat.
    expect(planActivate(passUntil(s0, "beginCombat", ap), ap, fire, 0)).toBeNull();
    const s = settle(run(s0, planActivate(s0, ap, fire, 0)), { travel: { [fire]: "add", [bolt]: "remove" } });
    expect(s.objects[fire]!.counters.time).toBe(4);
    expect(s.objects[bolt]!.counters.time).toBe(2);
    expect(s.objects[fire]!.tapped).toBe(true);
  });

  it("The Tenth Doctor: attacking suspends the first nonland card exiled with three time counters; {7}: time travel three times", () => {
    const { s: s0, ap, opp } = setup([]);
    const doc = putOnBattlefield(s0, ap, theTenthDoctor);
    const lib = s0.players[ap]!.library;
    const top = into(s0, ap, ornithopter, "library");
    const land = into(s0, ap, card("Forest", "Basic Land — Forest"), "library");
    expect(lib.slice(0, 2)).toEqual([land, top]);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: doc, defender: opp }] });
    s = settle(s);
    expect(s.objects[land]!.zone).toBe("exile");
    expect(s.objects[top]!.zone).toBe("exile");
    expect(s.objects[top]!.counters.time).toBe(3);
    expect(s.objects[top]!.gainedSuspend).toBeDefined();
    expect(s.objects[land]!.counters.time).toBeUndefined();
    // Timey-Wimey after combat: three time travels, the last counter coming off on the third.
    s = toStep(s, "main2", ap);
    const asked: ObjectId[] = [];
    s = settle(run(s, planActivate(s, ap, doc, 0)), { travel: { [top]: "remove" }, asked });
    expect(asked).toEqual([top, top, top]);
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: top, how: "suspend" });
  });

  it("Time Beetle: combat damage to a player, time travel", () => {
    const { s: s0, ap, opp } = setup([]);
    const beetle = putOnBattlefield(s0, ap, timeBeetle);
    const bolt = suspended(s0, ap, riftBolt, 2);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: beetle, defender: opp }] });
    s = toStep(s, "endCombat", ap);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "timeTravel", about: bolt });
    s = settle(s, { travel: { [bolt]: "remove" } });
    expect(s.objects[bolt]!.counters.time).toBe(1);
  });

  it("The Girl in the Fireplace: a Noble token with vanishing 3 that takes no damage; chapter III time travels on combat damage", () => {
    const { s: s0, ap, ids, opp } = setup([theGirlInTheFireplace]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const saga = ids[0]!;
    const noble = s.battlefield.find((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Noble"))!;
    expect(noble).toBeDefined();
    expect(s.objects[noble]!.counters.time).toBe(3);
    expect(power(s, s.objects[noble]!)).toBe(1);
    // "Prevent all damage that would be dealt to this token."
    const ping = card("Test Ping", "Instant", "{R}", { cmc: 1, oracleText: "This spell deals 1 damage to any target." });
    const p = into(s, ap, ping, "hand");
    s = settle(run(s, planCast(s, ap, p, [tgt(noble)])));
    expect(s.objects[noble]!.zone).toBe("battlefield");
    expect(s.objects[noble]!.damage).toBe(0);
    // Chapter III on the next turn: lore 2 now, the third added after the draw step.
    s.objects[saga]!.counters.lore = 2;
    s = toStep(s, "main1", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    s = toStep(s, "main1", ap);
    expect(s.objects[noble]!.counters.time).toBe(2);
    const b = putOnBattlefield(s, ap, bear());
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    s = toStep(s, "endCombat", ap);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "timeTravel", about: noble });
    s = settle(s, { travel: { [noble]: "add" } });
    expect(s.objects[noble]!.counters.time).toBe(3);
  });

  it("The Parting of the Ways: nonland cards among the top five get time counters equal to their mana value and suspend", () => {
    const { s: s0, ap, ids } = setup([thePartingOfTheWays]);
    const thopter = into(s0, ap, ornithopter, "library");
    const bolt = into(s0, ap, riftBolt, "library");
    const b = into(s0, ap, bear(), "library");
    const land = into(s0, ap, card("Forest", "Basic Land — Forest"), "library");
    const five = s0.players[ap]!.library.slice(0, 5);
    expect(five.slice(0, 4)).toEqual([land, b, bolt, thopter]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    for (const id of five) expect(s.objects[id]!.zone).toBe("exile");
    expect(s.objects[b]!.counters.time).toBe(2);
    expect(s.objects[b]!.gainedSuspend).toBeDefined();
    expect(s.objects[bolt]!.counters.time).toBe(3);
    expect(s.objects[land]!.counters.time).toBeUndefined();
    // Mana value 0: no time counters, so it isn't suspended (CR 702.62b).
    expect(s.objects[thopter]!.counters.time ?? 0).toBe(0);
  });

  it("The Parting of the Ways II: time travel, then time travel", () => {
    const { s: s0, ap } = setup([]);
    const saga = putOnBattlefield(s0, ap, thePartingOfTheWays);
    s0.objects[saga]!.counters.lore = 1;
    const bolt = suspended(s0, ap, riftBolt, 4);
    let s = toStep(s0, "main1", s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!);
    s = toStep(s, "upkeep", ap);
    // The suspend upkeep trigger takes one off; chapter II after the draw step.
    const asked: ObjectId[] = [];
    for (let i = 0; i < 200 && !(s.step === "main1" && s.activePlayer === ap && !s.stack.length && !s.pending); i++) {
      const p = s.pending;
      if (p?.kind === "chooseOption" && p.what === "timeTravel") {
        asked.push(p.about!);
        s = act(s, { type: "chooseOption", player: ap, choice: "remove" });
      } else if (p) throw new Error(`waiting for ${p.kind}`);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(asked).toEqual([bolt, bolt]);
    expect(s.objects[bolt]!.counters.time).toBe(1);
  });

  it("All of History, All at Once: each storm copy time travels", () => {
    const { s: s0, ap, ids } = setup([allOfHistoryAllAtOnce, card("Test Cantrip", "Instant", "{U}", { cmc: 1, oracleText: "Draw a card." })]);
    const bolt = suspended(s0, ap, riftBolt, 3);
    let s = settle(run(s0, planCast(s0, ap, ids[1]!)));
    const asked: ObjectId[] = [];
    s = settle(run(s, planCast(s, ap, ids[0]!)), { travel: { [bolt]: "remove" }, asked });
    expect(asked).toEqual([bolt, bolt]);
    expect(s.objects[bolt]!.counters.time).toBe(1);
  });
});
