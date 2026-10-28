// Round 201: "is put into a graveyard from the battlefield or is put into exile from the battlefield" (Psychomancer, Shard
// of the Void Dragon, Slagstone Refinery), "you may put any number of them into your hand ... You lose 3 life for each
// card you put into your hand this way" (Search for Blex), "you may play lands and cast Insect spells from your
// graveyard" (Zask), a spell's "Whenever ... enters this turn" paragraph followed by another (First Day of Class, Beck //
// Call fused), "choose another target artifact creature you control. When that creature dies this turn, return it ...
// tapped" (Cryptek), "When you discard a card this way" (Talion's Messenger), "Activate only as a sorcery and only once"
// (In the Trenches), "Whenever a player loses life" and "for each graveyard with seven or more cards in it" (The Master of
// Lake-town), "you may return that card ... at the beginning of the next end step if ~ is still on the battlefield"
// (Shirei, Shizo's Caretaker).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, scry, setup } from "./helpers";
import { applyAction, botActions, controllerOf, graveyardWays, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; stops at any question. */
const resolveAll = (s: GameState) => {
  for (let i = 0; i < 120 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Like resolveAll, answering "you may" with `may` and targets with `targets`. */
const settle = (s: GameState, targets: TargetChoice[] = [], may = true) => {
  for (let i = 0; i < 200 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: may });
    else if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets });
    else if (p) throw new Error(`waiting for ${p.kind}`);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Passes (no blocks, "you may" answered as `may`) until `step` of `ap`'s turn with an empty stack, or another question. */
const toStep = (s: GameState, step: GameState["step"], ap: PlayerId, may = true) => {
  for (let i = 0; i < 800; i++) {
    if (s.step === step && s.activePlayer === ap && !s.stack.length && !s.triggerQueue.length && !s.pending) return s;
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: p.player, attacks: [] });
    else if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: may });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  throw new Error(`never reached ${step}`);
};
const creature = (n: string, sub: string, p: number, t = p, cost = "{G}") => card(n, `Creature — ${sub}`, cost, { cmc: cost.match(/\{/g)?.length ?? 0, power: String(p), toughness: String(t) });
const rock = (n = "Test Rock") => card(n, "Artifact", "{1}", { cmc: 1 });
const golem = (n = "Test Golem") => card(n, "Artifact Creature — Golem", "{2}", { cmc: 2, power: "2", toughness: "2" });
const exileArtifact = card("Test Exile", "Instant", "{W}", { cmc: 1, oracleText: "Exile target artifact." });
const shatter = card("Test Shatter", "Instant", "{R}", { cmc: 1, oracleText: "Destroy target artifact." });
const ping = card("Test Ping", "Instant", "{R}", { cmc: 1, oracleText: "This spell deals 1 damage to any target." });
const doom = card("Test Doom", "Instant", "{B}", { cmc: 1, oracleText: "Destroy target creature." });
const drain = card("Test Drain", "Sorcery", "{B}", { cmc: 1, oracleText: "Target player loses 3 life." });
const name = (s: GameState, id: ObjectId) => s.cards[s.objects[id]!.cardId]!.name;

// Real oracle text (Scryfall).
const psychomancer = card("Psychomancer", "Artifact Creature — Necron Wizard", "{1}{B}", {"cmc":2,"power":"1","toughness":"1","keywords":["Flying","Harbinger of Despair"],"oracleText":"Flying\nHarbinger of Despair — Whenever this creature or another nontoken artifact you control is put into a graveyard from the battlefield or is put into exile from the battlefield, target opponent loses 1 life and you gain 1 life.","colors":["B"],"colorIdentity":["B"]});
const shardOfTheVoidDragon = card("Shard of the Void Dragon", "Creature — C'tan", "{4}{B}{B}{B}", {"cmc":7,"power":"7","toughness":"7","keywords":["Flying","Matter Absorption","Spear of the Void Dragon"],"oracleText":"Flying\nSpear of the Void Dragon — Whenever this creature attacks, each opponent sacrifices a nonland permanent of their choice.\nMatter Absorption — Whenever an artifact is put into a graveyard from the battlefield or is put into exile from the battlefield, put two +1/+1 counters on this creature.","colors":["B"],"colorIdentity":["B"]});
const slagstoneRefinery = card("Slagstone Refinery", "Artifact", "{4}", {"cmc":4,"keywords":[],"oracleText":"Whenever this artifact or another nontoken artifact you control is put into a graveyard from the battlefield or is put into exile from the battlefield, create a tapped Powerstone token. (It's an artifact with \"{T}: Add {C}. This mana can't be spent to cast a nonartifact spell.\")","colors":[],"colorIdentity":[]});
const blex = scry("modal_dfc", [{"name":"Blex, Vexing Pest","mana_cost":"{2}{G}","type_line":"Legendary Creature — Pest","oracle_text":"Other Pests, Bats, Insects, Snakes, and Spiders you control get +1/+1.\nWhen Blex dies, you gain 4 life.","power":"3","toughness":"2"},{"name":"Search for Blex","mana_cost":"{2}{B}{B}","type_line":"Sorcery","oracle_text":"Look at the top five cards of your library. You may put any number of them into your hand and the rest into your graveyard. You lose 3 life for each card you put into your hand this way."}], { keywords: [], color_identity: ["B","G"] });
const zaskSkitteringSwarmlord = card("Zask, Skittering Swarmlord", "Legendary Creature — Insect", "{3}{G}{G}", {"cmc":5,"power":"5","toughness":"5","keywords":["Mill"],"oracleText":"You may play lands and cast Insect spells from your graveyard.\nWhenever another Insect you control dies, put it on the bottom of its owner's library, then mill two cards. (Put the top two cards of your library into your graveyard.)\n{1}{B/G}: Target Insect gets +1/+0 and gains deathtouch until end of turn. ({B/G} can be paid with either {B} or {G}.)","colors":["G"],"colorIdentity":["B","G"]});
const firstDayOfClass = card("First Day of Class", "Instant", "{1}{R}", {"cmc":2,"keywords":["Learn"],"oracleText":"Whenever a creature you control enters this turn, put a +1/+1 counter on it and it gains haste until end of turn.\nLearn. (You may reveal a Lesson card you own from outside the game and put it into your hand, or discard a card to draw a card.)","colors":["R"],"colorIdentity":["R"]});
const FUSE = "Fuse (You may cast one or both halves of this card from your hand.)";
const beckCall = scry("split", [{"name":"Beck","mana_cost":"{G}{U}","type_line":"Sorcery","oracle_text":`Whenever a creature enters this turn, you may draw a card.\n${FUSE}`},{"name":"Call","mana_cost":"{4}{W}{U}","type_line":"Sorcery","oracle_text":`Create four 1/1 white Bird creature tokens with flying.\n${FUSE}`}], { keywords: ["Fuse"], color_identity: ["G","U","W"] });
const cryptek = card("Cryptek", "Artifact Creature — Necron Wizard", "{3}{B}", {"cmc":4,"power":"3","toughness":"3","keywords":[],"oracleText":"{1}{B}, {T}: Choose another target artifact creature you control. When that creature dies this turn, return it to the battlefield tapped under your control.","colors":["B"],"colorIdentity":["B"]});
const talionsMessenger = card("Talion's Messenger", "Creature — Faerie Noble", "{2}{U}", {"cmc":3,"power":"1","toughness":"3","keywords":["Flying"],"oracleText":"Flying\nWhenever you attack with one or more Faeries, draw a card, then discard a card. When you discard a card this way, put a +1/+1 counter on target Faerie you control.","colors":["U"],"colorIdentity":["U"]});
const inTheTrenches = card("In the Trenches", "Enchantment", "{1}{W}{W}", {"cmc":3,"keywords":[],"oracleText":"Creatures you control get +1/+1.\n{5}{W}: Exile target nonland permanent you don't control until this enchantment leaves the battlefield. Activate only as a sorcery and only once.","colors":["W"],"colorIdentity":["W"]});
const theMasterOfLaketown = card("The Master of Lake-town", "Legendary Creature — Human Advisor", "{1}{B}{B}", {"cmc":3,"power":"3","toughness":"2","keywords":["Mill","Deathtouch"],"oracleText":"Deathtouch\nWhenever a player loses life, that player mills that many cards. (Damage causes loss of life.)\nWhen The Master of Lake-town dies, draw a card for each graveyard with seven or more cards in it.","colors":["B"],"colorIdentity":["B"]});
const shireiShizosCaretaker = card("Shirei, Shizo's Caretaker", "Legendary Creature — Spirit", "{4}{B}", {"cmc":5,"power":"2","toughness":"2","keywords":[],"oracleText":"Whenever a creature with power 1 or less is put into your graveyard from the battlefield, you may return that card to the battlefield at the beginning of the next end step if Shirei is still on the battlefield.","colors":["B"],"colorIdentity":["B"]});
const ALL = [psychomancer, shardOfTheVoidDragon, slagstoneRefinery, blex, zaskSkitteringSwarmlord, firstDayOfClass, beckCall, cryptek, talionsMessenger, inTheTrenches, theMasterOfLaketown, shireiShizosCaretaker];

describe("Round 201", () => {
  it("all compile", () => supported(...ALL));

  it("Psychomancer: another nontoken artifact you control exiled from the battlefield drains 1; a token doesn't", () => {
    const { s: s0, ap, ids, opp } = setup([exileArtifact, exileArtifact]);
    putOnBattlefield(s0, ap, psychomancer);
    const r = putOnBattlefield(s0, ap, rock());
    const tok = putOnBattlefield(s0, ap, rock("Test Token Rock"));
    s0.objects[tok]!.isToken = true;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(r)])), [{ kind: "player", id: opp }]);
    expect(s.objects[r]!.zone).toBe("exile");
    expect(s.players[opp]!.life).toBe(39);
    expect(s.players[ap]!.life).toBe(41);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(tok)])), [{ kind: "player", id: opp }]);
    expect(s.players[opp]!.life).toBe(39);
  });

  it("Psychomancer: itself dying triggers too", () => {
    const { s: s0, ap, ids, opp } = setup([ping]);
    const p = putOnBattlefield(s0, ap, psychomancer);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(p)])), [{ kind: "player", id: opp }]);
    expect(s.objects[p]!.zone).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(39);
  });

  it("Shard of the Void Dragon: any artifact destroyed or exiled puts two +1/+1 counters on it", () => {
    const { s: s0, ap, ids, opp } = setup([shatter, exileArtifact]);
    const shard = putOnBattlefield(s0, ap, shardOfTheVoidDragon);
    const a = putOnBattlefield(s0, opp, rock());
    const b = putOnBattlefield(s0, opp, rock("Test Rock 2"));
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(a)])));
    expect(s.objects[shard]!.counters["+1/+1"]).toBe(2);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(b)])));
    expect(s.objects[shard]!.counters["+1/+1"]).toBe(4);
  });

  it("Slagstone Refinery: destroyed itself, a tapped Powerstone", () => {
    const { s: s0, ap, ids } = setup([shatter]);
    const ref = putOnBattlefield(s0, ap, slagstoneRefinery);
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(ref)])));
    const stones = s.battlefield.filter((id) => s.objects[id]!.isToken && name(s, id).startsWith("Powerstone"));
    expect(stones).toHaveLength(1);
    expect(s.objects[stones[0]!]!.tapped).toBe(true);
  });

  it("Search for Blex: take any number of the top five, the rest to the graveyard, 3 life for each taken", () => {
    const { s: s0, ap, ids } = setup([blex]);
    const top = s0.players[ap]!.library.slice(0, 5);
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { face: 1 }));
    s = resolveAll(s);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0, max: 5, dig: { lifeEach: 3 } });
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: top.slice(0, 2) }));
    expect(top.slice(0, 2).every((id) => s.objects[id]!.zone === "hand")).toBe(true);
    expect(top.slice(2).every((id) => s.objects[id]!.zone === "graveyard")).toBe(true);
    expect(s.players[ap]!.life).toBe(34);
  });

  it("Search for Blex: none taken, no life lost; a bot takes at most two", () => {
    const { s: s0, ap, ids } = setup([blex]);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { face: 1 })));
    const bot = botActions(s, ap)[0]!;
    expect(bot).toMatchObject({ type: "searchLibrary" });
    expect((bot as Extract<Action, { type: "searchLibrary" }>).found.length).toBeLessThanOrEqual(2);
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [] }));
    expect(s.players[ap]!.life).toBe(40);
    expect(s.players[ap]!.graveyard.length).toBe(5 + 1);
  });

  it("Zask: Insect cards and lands in your graveyard can be played; other creature cards can't", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, zaskSkitteringSwarmlord);
    const insect = into(s0, ap, creature("Test Beetle", "Insect", 2), "graveyard");
    const elf = into(s0, ap, creature("Test Elf", "Elf", 2), "graveyard");
    const land = into(s0, ap, card("Test Wastes", "Land", ""), "graveyard");
    expect(graveyardWays(s0, s0.objects[insect]!, ap).length).toBeGreaterThan(0);
    expect(graveyardWays(s0, s0.objects[elf]!, ap)).toEqual([]);
    let s = run(s0, planCast(s0, ap, insect, undefined, undefined, "auto", undefined, { via: "permission" }));
    s = resolveAll(s);
    expect(s.objects[insect]!.zone).toBe("battlefield");
    s = act(s, { type: "playLand", player: ap, objectId: land });
    expect(s.objects[land]!.zone).toBe("battlefield");
  });

  it("First Day of Class: creatures entering this turn get a counter and haste; learn rummages", () => {
    const bear = creature("Test Bear", "Bear", 2);
    const { s: s0, ap, ids } = setup([firstDayOfClass, bear]);
    const hand = s0.players[ap]!.hand.length;
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "discard", player: ap });
    const away = s.players[ap]!.hand.find((id) => id !== ids[1])!;
    s = resolveAll(act(s, { type: "discard", player: ap, objectIds: [away] }));
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
    expect(s.objects[away]!.zone).toBe("graveyard");
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(s.objects[ids[1]!]!.counters["+1/+1"]).toBe(1);
    expect(objHasKeyword(s, s.objects[ids[1]!]!, "Haste")).toBe(true);
  });

  it("Beck // Call fused: the four Birds each let you draw a card", () => {
    const { s: s0, ap, ids } = setup([beckCall]);
    const hand = s0.players[ap]!.hand.length;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { face: 2 })));
    expect(s.battlefield.filter((id) => s.objects[id]!.isToken && controllerOf(s, s.objects[id]!) === ap)).toHaveLength(4);
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 4);
  });

  it("Cryptek: the chosen artifact creature returns tapped when it dies this turn", () => {
    const { s: s0, ap, ids } = setup([doom]);
    const c = putOnBattlefield(s0, ap, cryptek);
    const g = putOnBattlefield(s0, ap, golem());
    expect(planActivate(s0, ap, c, 0, [tgt(c)])).toBeNull();
    let s = resolveAll(run(s0, planActivate(s0, ap, c, 0, [tgt(g)])));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(g)])));
    expect(s.objects[g]!.zone).toBe("battlefield");
    expect(s.objects[g]!.tapped).toBe(true);
    expect(controllerOf(s, s.objects[g]!)).toBe(ap);
  });

  it("Talion's Messenger: attacking with a Faerie loots, then a +1/+1 counter on target Faerie", () => {
    const { s: s0, ap, opp } = setup([]);
    const m = putOnBattlefield(s0, ap, talionsMessenger);
    const hand = s0.players[ap]!.hand.length;
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: m, defender: opp }] });
    s = resolveAll(s);
    expect(s.pending).toMatchObject({ kind: "discard", player: ap });
    s = act(s, { type: "discard", player: ap, objectIds: [s.players[ap]!.hand[0]!] });
    s = settle(s, [tgt(m)]);
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(s.objects[m]!.counters["+1/+1"]).toBe(1);
  });

  it("In the Trenches: only as a sorcery and only once; the card returns when it leaves", () => {
    const { s: s0, ap, ids, opp } = setup([card("Test Disenchant", "Instant", "{W}", { cmc: 1, oracleText: "Destroy target enchantment." })]);
    const t = putOnBattlefield(s0, ap, inTheTrenches);
    const a = putOnBattlefield(s0, opp, rock());
    const b = putOnBattlefield(s0, opp, rock("Test Rock 2"));
    let s = resolveAll(run(s0, planActivate(s0, ap, t, 0, [tgt(a)])));
    expect(s.objects[a]!.zone).toBe("exile");
    expect(planActivate(s, ap, t, 0, [tgt(b)])).toBeNull();
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(t)])));
    expect(s.objects[a]!.zone).toBe("battlefield");
    // Not as a sorcery: on another player's turn.
    const s2 = structuredClone(s0);
    s2.activePlayer = opp;
    expect(planActivate(s2, ap, t, 0, [tgt(a)])).toBeNull();
  });

  it("The Master of Lake-town: any player who loses life mills that many; dying draws for each graveyard of seven or more", () => {
    const { s: s0, ap, ids, opp } = setup([drain, drain, doom]);
    const master = putOnBattlefield(s0, ap, theMasterOfLaketown);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(37);
    expect(s.players[opp]!.graveyard.length).toBe(3);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: ap }])));
    expect(s.players[ap]!.graveyard.length).toBe(2 + 3);
    // Seven or more: the opponent's graveyard and, with the Master and the Doom, yours; not a third player's six.
    for (let i = 0; i < 4; i++) into(s, opp, rock(`Test Yard ${i}`), "graveyard");
    const third = s.turnOrder[(s.turnOrder.indexOf(ap) + 2) % 4]!;
    for (let i = 0; i < 6; i++) into(s, third, rock(`Test Third ${i}`), "graveyard");
    const hand = s.players[ap]!.hand.length;
    s.players[ap]!.manaPool.B = 1;
    s = resolveAll(run(s, planCast(s, ap, ids[2]!, [tgt(master)])));
    expect(s.objects[master]!.zone).toBe("graveyard");
    expect(s.players[ap]!.graveyard.length).toBe(7);
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2);
  });

  it("Shirei: a creature with power 1 or less dies, back at the next end step if you choose", () => {
    const { s: s0, ap, ids } = setup([ping]);
    putOnBattlefield(s0, ap, shireiShizosCaretaker);
    const elf = putOnBattlefield(s0, ap, creature("Test Elf", "Elf", 1));
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(elf)])));
    expect(s.objects[elf]!.zone).toBe("graveyard");
    s = passUntil(s, "end", ap);
    s = resolveAll(s);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = resolveAll(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[elf]!.zone).toBe("battlefield");
  });

  it("Shirei: nothing returns if Shirei has left; a bigger creature never triggers", () => {
    const { s: s0, ap, ids } = setup([ping, doom, doom]);
    const shirei = putOnBattlefield(s0, ap, shireiShizosCaretaker);
    const elf = putOnBattlefield(s0, ap, creature("Test Elf", "Elf", 1));
    const bear = putOnBattlefield(s0, ap, creature("Test Bear", "Bear", 2));
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(elf)])));
    s = resolveAll(run(s, planCast(s, ap, ids[2]!, [tgt(bear)])));
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(shirei)])));
    s = toStep(s, "main1", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    expect(s.objects[elf]!.zone).toBe("graveyard");
    expect(s.objects[bear]!.zone).toBe("graveyard");
  });
});
