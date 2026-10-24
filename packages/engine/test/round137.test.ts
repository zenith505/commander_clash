// Round 137: round 136's gaps (join forces bots, Liege of the Hollows, Aurelia's Vindicator and {X} in morph and
// disguise costs), then the most played cards.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, planTurnFaceUp, turnFaceUpProblem, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty or something asks a player to choose. */
const resolveAll = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Bots answer every choice and everyone passes until the stack is empty. */
const botsResolve = (s: GameState) => {
  for (let k = 0; k < 80 && (s.stack.length || s.pending || s.triggerQueue.length); k++) s = s.pending ? run(s, botActions(s, s.pending.player)) : act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const nextOf = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % 4]!;
const lands = (s: GameState, pid: PlayerId, names: string[]) => names.forEach((l) => putOnBattlefield(s, pid, card(l, `Basic Land — ${l}`)));
const tokens = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.isToken && controllerOf(s, s.objects[id]!) === pid && s.cards[s.objects[id]!.cardId]!.name.includes(name)).length;
const inHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  return id;
};
const inYard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  return id;
};
const faceDown = (s0: GameState, pid: PlayerId, id: string) => resolveAll(run(s0, planCast(s0, pid, id, undefined, undefined, "auto", undefined, { faceDown: true })));

describe("Join forces: what bots pay", () => {
  const aglow = card("Minds Aglow", "Sorcery", "{U}", { oracleText: "Join forces — Starting with you, each player may pay any amount of mana. Each player draws X cards, where X is the total amount of mana paid this way." });
  const voyage = card("Collective Voyage", "Sorcery", "{G}", { oracleText: "Join forces — Starting with you, each player may pay any amount of mana. Each player searches their library for up to X basic land cards, where X is the total amount of mana paid this way, puts them onto the battlefield tapped, then shuffles." });
  const bolt = card("Test Bolt", "Instant", "{1}{R}", { oracleText: "Test Bolt deals 3 damage to any target." });

  it("an opponent's bot keeps the mana for its dearest instant and pays the rest", () => {
    supported(aglow, bolt);
    const { s: s0, ap, ids } = setup([aglow]);
    const opp = nextOf(s0, ap);
    lands(s0, opp, ["Mountain", "Mountain", "Mountain", "Mountain", "Mountain"]);
    inHand(s0, opp, bolt);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    while (!s.pending) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "chooseOption", player: ap, choice: "2" });
    s = run(s, botActions(s, ap));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "payX", player: opp });
    expect(botActions(s, opp)).toEqual([{ type: "chooseOption", player: opp, choice: "3" }]);
  });

  it("a bot pays no more than finds it basic lands", () => {
    const { s: s0, ap, ids } = setup([voyage]);
    const opp = nextOf(s0, ap);
    lands(s0, opp, ["Forest", "Forest", "Forest", "Forest", "Forest", "Forest"]);
    // Two basic lands left in its library.
    const p = s0.players[opp]!;
    const basics = p.library.filter((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Forest");
    p.library = p.library.filter((id) => !basics.slice(2).includes(id));
    let s = run(s0, planCast(s0, ap, ids[0]!));
    while (!s.pending) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "chooseOption", player: ap, choice: "none" });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "payX", player: opp });
    expect(botActions(s, opp)).toEqual([{ type: "chooseOption", player: opp, choice: "2" }]);
  });
});

describe("Liege of the Hollows: each player's own Squirrels", () => {
  const liege = card("Liege of the Hollows", "Creature — Spirit", "{2}{G}{G}", { power: "3", toughness: "4", oracleText: "When this creature dies, each player may pay any amount of mana. Then each player creates a number of 1/1 green Squirrel creature tokens equal to the amount of mana they paid this way." });
  const murder = card("Test Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });

  it("is fully supported", () => supported(liege));

  it("starting with the active player, each pays; each creates as many Squirrels as they paid", () => {
    const { s: s0, ap, ids } = setup([murder]);
    const opp = nextOf(s0, ap);
    const third = nextOf(s0, opp);
    // The Liege is the opponent's; its trigger still asks the active player first (rulings).
    const id = putOnBattlefield(s0, opp, liege);
    lands(s0, opp, ["Forest", "Forest"]);
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id }]));
    while (!s.pending) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "payX", player: ap, prompt: "Liege of the Hollows: pay any amount of mana" });
    s = act(s, { type: "chooseOption", player: ap, choice: "4" });
    s = run(s, botActions(s, ap));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "payX", player: opp });
    s = act(s, { type: "chooseOption", player: opp, choice: "1" });
    s = run(s, botActions(s, opp));
    s = resolveAll(s);
    expect(s.pending).toBeFalsy();
    expect([tokens(s, ap, "Squirrel"), tokens(s, opp, "Squirrel"), tokens(s, third, "Squirrel")]).toEqual([4, 1, 0]);
  });

  it("bots pay all they can for their own Squirrels", () => {
    const { s: s0, ap } = setup([]);
    const opp = nextOf(s0, ap);
    const id = putOnBattlefield(s0, opp, liege);
    lands(s0, opp, ["Forest", "Forest", "Forest"]);
    const m = inHand(s0, ap, murder);
    const s = botsResolve(run(s0, planCast(s0, ap, m, [{ kind: "object", id }])));
    expect(tokens(s, opp, "Squirrel")).toBe(3);
    // The active player's mana went on Murder (3 of 14): 11 Squirrels.
    expect(tokens(s, ap, "Squirrel")).toBe(11);
  });
});

describe("{X} in morph and disguise costs", () => {
  const vindicator = card("Aurelia's Vindicator", "Creature — Angel", "{2}{W}{W}", {
    power: "4",
    toughness: "3",
    keywords: ["Flying", "Lifelink", "Ward", "Disguise"],
    oracleText: "Flying, lifelink, ward {2}\nDisguise {X}{3}{W}\nWhen this creature is turned face up, exile up to X other target creatures from the battlefield and/or creature cards from graveyards.\nWhen this creature leaves the battlefield, return the exiled cards to their owners' hands.",
  });
  const bane = card("Bane of the Living", "Creature — Insect", "{2}{B}{B}", { power: "4", toughness: "3", keywords: ["Morph"], oracleText: "Morph {X}{B}{B}\nWhen this creature is turned face up, all creatures get -X/-X until end of turn." });
  const trumpeter = card("Warbreak Trumpeter", "Creature — Goblin", "{R}", { power: "1", toughness: "1", keywords: ["Morph"], oracleText: "Morph {X}{X}{R}\nWhen this creature is turned face up, create X 1/1 red Goblin creature tokens." });
  const murder = card("Test Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });

  it("are fully supported", () => supported(vindicator, bane, trumpeter));

  it("Aurelia's Vindicator: X chosen as it's turned face up, that many targets; they come back to hand when it leaves", () => {
    const { s: s0, ap, ids } = setup([vindicator, murder]);
    const opp = nextOf(s0, ap);
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Test Big Bear", power: "5", toughness: "5" }));
    const card1 = inYard(s0, ap, bear({ name: "Test Dead Bear" }));
    let s = faceDown(s0, ap, ids[0]!);
    const v = ids[0]!;
    expect(s.objects[v]!.faceDown).toBe("disguise");
    // X is 2 here: {2}{3}{W}.
    expect(turnFaceUpProblem(s, ap, v, 0, 2)).toMatch(/not enough mana/);
    s = run(s, planTurnFaceUp(s, ap, v, 0, 2));
    expect(s.objects[v]!.faceDown).toBeUndefined();
    expect(s.log.some((l) => /X = 2/.test(l.text))).toBe(true);
    // Its trigger has up to two targets.
    expect(s.pending).toMatchObject({ kind: "chooseTargets" });
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: theirs }, { kind: "object", id: card1 }] });
    s = resolveAll(s);
    expect([s.objects[theirs]!.zone, s.objects[card1]!.zone]).toEqual(["exile", "exile"]);
    // It dies: they go to their owners' hands.
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [{ kind: "object", id: v }])));
    expect([s.objects[theirs]!.zone, s.objects[card1]!.zone]).toEqual(["hand", "hand"]);
    expect(s.players[opp]!.hand).toContain(theirs);
  });

  it("a bot turns Aurelia's Vindicator face up with X the number of targets it wants", () => {
    const { s: s0, ap, ids } = setup([vindicator]);
    const opp = nextOf(s0, ap);
    putOnBattlefield(s0, opp, bear({ name: "Test Big Bear", power: "5", toughness: "5" }));
    s0.players[ap]!.hand = [ids[0]!];
    const s = faceDown(s0, ap, ids[0]!);
    const acts = botActions(s, ap);
    expect(acts[acts.length - 1]).toMatchObject({ type: "turnFaceUp", objectId: ids[0]!, x: 1 });
  });

  it("Warbreak Trumpeter: {X}{X}{R} pays X twice; X Goblins", () => {
    const { s: s0, ap, ids } = setup([trumpeter]);
    let s = faceDown(s0, ap, ids[0]!);
    s = resolveAll(run(s, planTurnFaceUp(s, ap, ids[0]!, 0, 3)));
    expect(tokens(s, ap, "Goblin")).toBe(3);
    // 3 to cast it face down, 7 to turn it face up.
    expect(s.battlefield.filter((id) => s.objects[id]!.tapped).length).toBe(10);
  });

  it("Bane of the Living: a bot picks the X that kills the most of its opponents' creatures for the least of its own", () => {
    const { s: s0, ap, ids } = setup([bane]);
    const opp = nextOf(s0, ap);
    for (const k of [1, 2]) putOnBattlefield(s0, opp, bear({ name: `Test Bear ${k}` }));
    putOnBattlefield(s0, opp, bear({ name: "Test Giant", power: "6", toughness: "6" }));
    putOnBattlefield(s0, ap, bear({ name: "Test Wall", power: "0", toughness: "3" }));
    s0.players[ap]!.hand = [ids[0]!];
    const s = faceDown(s0, ap, ids[0]!);
    const acts = botActions(s, ap);
    // X = 2 kills both bears; 3 would kill our wall and Bane itself, 6 everything.
    expect(acts[acts.length - 1]).toMatchObject({ type: "turnFaceUp", objectId: ids[0]!, x: 2 });
    const after = resolveAll(run(s, acts));
    expect(after.battlefield.filter((id) => /Test Bear/.test(after.cards[after.objects[id]!.cardId]!.name)).length).toBe(0);
    expect(after.objects[ids[0]!]!.zone).toBe("battlefield");
  });
});

describe("Another Round: exile any number of your creatures and return them, X more times", () => {
  const round = card("Another Round", "Sorcery", "{X}{X}{2}{W}", { oracleText: "Exile any number of creatures you control, then return them to the battlefield under their owner's control. Then repeat this process X more times." });
  const healer = card("Test Healer", "Creature — Cleric", "{1}{W}", { power: "1", toughness: "1", oracleText: "When this creature enters, you gain 2 life." });

  it("is fully supported", () => supported(round, healer));

  it("X = 1: twice; enters triggers each time; a token exiled doesn't come back", () => {
    const { s: s0, ap, ids } = setup([round]);
    const h = putOnBattlefield(s0, ap, healer);
    const b = putOnBattlefield(s0, ap, bear());
    const t = putOnBattlefield(s0, ap, bear({ name: "Test Token Bear" }));
    s0.objects[t]!.isToken = true;
    const life = s0.players[ap]!.life;
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 1));
    s = resolveAll(s);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "flicker", player: ap, anyNumber: true });
    expect((s.pending as { options: string[] }).options).toEqual(expect.arrayContaining([h, b, t]));
    s = act(s, { type: "pickPermanents", player: ap, ids: [h, t] });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "flicker" });
    const second = (s.pending as { options: string[] }).options;
    expect(second).not.toContain(t);
    const healerNow = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Test Healer")!;
    s = act(s, { type: "pickPermanents", player: ap, ids: [healerNow] });
    s = resolveAll(s);
    expect(s.pending).toBeFalsy();
    expect(s.players[ap]!.life).toBe(life + 4);
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.battlefield.some((id) => s.cards[s.objects[id]!.cardId]!.name === "Test Healer")).toBe(true);
  });

  it("a bot flickers the creatures with an enters trigger, not the rest", () => {
    const { s: s0, ap, ids } = setup([round]);
    const h = putOnBattlefield(s0, ap, healer);
    putOnBattlefield(s0, ap, bear());
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 0)));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "flicker" });
    expect(botActions(s, ap)).toEqual([{ type: "pickPermanents", player: ap, ids: [h] }]);
  });
});

describe("Victory Chimes: a player of your choice adds {C}", () => {
  const chimes = card("Victory Chimes", "Artifact", "{3}", { oracleText: "Untap this artifact during each other player's untap step.\n{T}: A player of your choice adds {C}." });

  it("is fully supported", () => supported(chimes));

  it("gives {C} to another player; untaps during each other player's untap step", () => {
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, ap, chimes);
    let s = act(s0, { type: "activateMana", player: ap, objectId: c, mana: "C", to: opp });
    expect(s.players[opp]!.manaPool.C).toBe(1);
    expect(s.players[ap]!.manaPool.C).toBe(0);
    expect(s.objects[c]!.tapped).toBe(true);
    expect(s.log.some((l) => /taps Victory Chimes: .+ adds \{C\}/.test(l.text))).toBe(true);
    s = passUntil(s, "upkeep", opp);
    expect(s.objects[c]!.tapped).toBe(false);
  });

  it("without a player chosen, its controller adds it", () => {
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, chimes);
    const s = act(s0, { type: "activateMana", player: ap, objectId: c, mana: "C" });
    expect(s.players[ap]!.manaPool.C).toBe(1);
  });
});

describe("Nissa, Ascended Animist", () => {
  const nissa = card("Nissa, Ascended Animist", "Legendary Planeswalker — Nissa", "{3}{G}{G}{G/P}{G/P}", {
    loyalty: "7",
    keywords: ["Compleated"],
    oracleText: "Compleated ({G/P} can be paid with {G} or 2 life. For each {G/P} paid with life, this planeswalker enters with two fewer loyalty counters.)\n+1: Create an X/X green Phyrexian Horror creature token, where X is Nissa's loyalty.\n−1: Destroy target artifact or enchantment.\n−7: Until end of turn, creatures you control get +1/+1 for each Forest you control and gain trample.",
  });

  it("is fully supported", () => supported(nissa));

  it("+1: the Horror is as big as her loyalty after the +1", () => {
    const { s: s0, ap } = setup([]);
    const n = putOnBattlefield(s0, ap, nissa);
    s0.objects[n]!.counters.loyalty = 3;
    const s = botsResolve(run(s0, planActivate(s0, ap, n, 0)));
    const horror = s.battlefield.find((id) => s.objects[id]!.isToken && /Horror/.test(s.cards[s.objects[id]!.cardId]!.name))!;
    expect(pt(s, horror)).toBe("4/4");
  });

  it("+1 after she's gone: her last loyalty", () => {
    const { s: s0, ap } = setup([]);
    const n = putOnBattlefield(s0, ap, nissa);
    s0.objects[n]!.counters.loyalty = 5;
    let s = run(s0, planActivate(s0, ap, n, 0));
    // She leaves before the ability resolves.
    s.battlefield.splice(s.battlefield.indexOf(n), 1);
    s.objects[n]!.zone = "graveyard";
    s.players[ap]!.graveyard.push(n);
    s = botsResolve(s);
    const horror = s.battlefield.find((id) => s.objects[id]!.isToken && /Horror/.test(s.cards[s.objects[id]!.cardId]!.name));
    expect(horror && pt(s, horror)).toBe("6/6");
  });

  it("−7: +1/+1 for each Forest and trample", () => {
    const { s: s0, ap } = setup([]);
    const n = putOnBattlefield(s0, ap, nissa);
    s0.objects[n]!.counters.loyalty = 7;
    const b = putOnBattlefield(s0, ap, bear());
    const s = botsResolve(run(s0, planActivate(s0, ap, n, 2)));
    // Three Forests (setup).
    expect(pt(s, b)).toBe("5/5");
    expect(objHasKeyword(s, s.objects[b]!, "Trample")).toBe(true);
  });
});

describe("Copying a card in a graveyard: Mnemonic Deluge, Flawless Forgery", () => {
  const deluge = card("Mnemonic Deluge", "Sorcery", "{6}{U}{U}{U}", { oracleText: "Exile target instant or sorcery card from a graveyard. Copy that card three times. You may cast the copies without paying their mana costs. Exile Mnemonic Deluge." });
  const forgery = card("Flawless Forgery", "Sorcery", "{3}{U}{U}", { keywords: ["Casualty"], oracleText: "Casualty 3 (As you cast this spell, you may sacrifice a creature with power 3 or greater. When you do, copy this spell and you may choose a new target for the copy.)\nExile target instant or sorcery card from an opponent's graveyard. Copy that card. You may cast the copy without paying its mana cost." });
  const gift = card("Test Gift", "Sorcery", "{1}{W}", { oracleText: "You gain 3 life." });

  it("are fully supported", () => supported(deluge, forgery, gift));

  /** Answers its controller's choices: casts every copy offered. */
  const castCopies = (s: GameState, pid: PlayerId) => {
    let casts = 0;
    for (let i = 0; i < 80 && (s.pending || s.stack.length); i++) {
      const p = s.pending;
      if (p?.kind === "chooseOption" && p.what === "castFromAmong" && p.player === pid) s = act(s, { type: "chooseOption", player: pid, choice: p.options.find((o) => o !== "none")! });
      else if (p?.kind === "castFree" && p.player === pid) {
        s = run(s, planCast(s, pid, p.objectId));
        casts++;
      } else if (p) s = run(s, botActions(s, p.player));
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    return { s, casts };
  };

  it("Mnemonic Deluge: three copies cast for free; the card stays exiled, Deluge is exiled", () => {
    const { s: s0, ap, ids, opp } = setup([deluge]);
    const g = inYard(s0, opp, gift);
    const life = s0.players[ap]!.life;
    const { s, casts } = castCopies(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: g }])), ap);
    expect(casts).toBe(3);
    expect(s.players[ap]!.life).toBe(life + 9);
    expect(s.objects[g]!.zone).toBe("exile");
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
    expect(s.log.some((l) => /copy 3 of 3/.test(l.text))).toBe(true);
  });

  it("Flawless Forgery: only an opponent's graveyard; one copy", () => {
    const { s: s0, ap, ids, opp } = setup([forgery]);
    const mine = inYard(s0, ap, gift);
    const theirs = inYard(s0, opp, gift);
    expect(planCast(s0, ap, ids[0]!, [{ kind: "object", id: mine }])).toBeNull();
    const life = s0.players[ap]!.life;
    const { s, casts } = castCopies(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: theirs }])), ap);
    expect(casts).toBe(1);
    expect(s.players[ap]!.life).toBe(life + 3);
  });
});

/** `ap` attacks `defender` with `attacker`; `blocks` are declared by whoever is asked; every "may" is answered yes. Stops at the end of combat. */
const combat = (s: GameState, ap: PlayerId, attacker: string, defender: PlayerId, blocks: { blocker: string; attacker: string }[] = []) => {
  let mays = 0;
  s = act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker, defender }] });
  for (let i = 0; i < 200 && s.step !== "main2"; i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: p.player === defender ? blocks : [] });
    else if (p?.kind === "chooseMay" && p.player === ap) {
      s = act(s, { type: "chooseMay", player: ap, yes: true });
      mays++;
    } else if (p) s = run(s, botActions(s, p.player));
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return { s, mays };
};

describe("Infiltration Lens: whenever equipped creature becomes blocked by a creature", () => {
  const lens = card("Infiltration Lens", "Artifact — Equipment", "{1}", { keywords: ["Equip"], oracleText: "Whenever equipped creature becomes blocked by a creature, you may draw two cards.\nEquip {1}" });

  it("is fully supported", () => supported(lens));

  it("blocked by two creatures: it triggers twice, four cards", () => {
    const { s: s0, ap, opp } = setup([]);
    const l = putOnBattlefield(s0, ap, lens);
    const b = putOnBattlefield(s0, ap, bear({ name: "Test Big Bear", power: "5", toughness: "5" }));
    s0.objects[l]!.attachedTo = b;
    const blockers = [1, 2].map((k) => putOnBattlefield(s0, opp, bear({ name: `Test Wall ${k}` })));
    const hand = s0.players[ap]!.hand.length;
    const { s, mays } = combat(s0, ap, b, opp, blockers.map((blocker) => ({ blocker, attacker: b })));
    expect(mays).toBe(2);
    expect(s.players[ap]!.hand.length).toBe(hand + 4);
  });

  it("unblocked: nothing", () => {
    const { s: s0, ap, opp } = setup([]);
    const l = putOnBattlefield(s0, ap, lens);
    const b = putOnBattlefield(s0, ap, bear());
    s0.objects[l]!.attachedTo = b;
    expect(combat(s0, ap, b, opp).mays).toBe(0);
  });
});

describe("Wizard's Staff: the equipped creature's triggered abilities trigger an additional time", () => {
  const staff = card("Wizard's Staff", "Artifact — Equipment", "{1}{U}", { keywords: ["Equip"], oracleText: "Equipped creature has prowess. (Whenever its controller casts a noncreature spell, that creature gets +1/+1 until end of turn.)\nIf a triggered ability of equipped creature triggers, that ability triggers an additional time.\nEquip Wizard {1}\nEquip {3}" });
  const raider = card("Test Raider", "Creature — Human Wizard", "{1}{R}", { power: "1", toughness: "1", oracleText: "Whenever this creature attacks, you gain 1 life." });
  const gift = card("Test Gift", "Sorcery", "{1}{W}", { oracleText: "You gain 3 life." });

  it("is fully supported", () => supported(staff, raider));

  it("its attack trigger twice; the prowess it gives twice", () => {
    const { s: s0, ap, ids, opp } = setup([gift]);
    const st = putOnBattlefield(s0, ap, staff);
    const r = putOnBattlefield(s0, ap, raider);
    s0.objects[st]!.attachedTo = r;
    const other = putOnBattlefield(s0, ap, raider);
    invalidateCharacteristics(s0);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect([pt(s, r), pt(s, other)]).toEqual(["3/3", "1/1"]);
    const life = s.players[ap]!.life;
    s = combat(s, ap, r, opp).s;
    expect(s.players[ap]!.life).toBe(life + 2);
  });
});

describe("The Sound of Drums", () => {
  const drums = card("The Sound of Drums", "Enchantment — Aura", "{2}{R}", { keywords: ["Goad", "Enchant", "Double"], oracleText: "Enchant creature\nEnchanted creature is goaded.\nIf enchanted creature would deal combat damage to a permanent or player, it deals double that damage instead.\n{2}{R}: Return this card from your graveyard to your hand." });

  it("is fully supported", () => supported(drums));

  it("an opponent's creature is goaded by the Aura's controller", () => {
    const { s: s0, ap, ids, opp } = setup([drums]);
    const b = putOnBattlefield(s0, opp, bear());
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: b }])));
    expect(s.objects[ids[0]!]!.attachedTo).toBe(b);
    expect(characteristics(s, s.objects[b]!).goadedBy).toEqual([ap]);
  });

  it("enchanted creature's combat damage is doubled", () => {
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, ap, bear());
    const d = putOnBattlefield(s0, ap, drums);
    s0.objects[d]!.attachedTo = b;
    invalidateCharacteristics(s0);
    const life = s0.players[opp]!.life;
    const { s } = combat(s0, ap, b, opp);
    expect(s.players[opp]!.life).toBe(life - 4);
  });

  it("returns from the graveyard to its owner's hand", () => {
    const { s: s0, ap } = setup([]);
    const d = inYard(s0, ap, drums);
    const s = resolveAll(run(s0, planActivate(s0, ap, d, 0)));
    expect(s.objects[d]!.zone).toBe("hand");
  });
});

describe("Court of Embereth", () => {
  const court = card("Court of Embereth", "Enchantment", "{2}{R}{R}", { oracleText: "When this enchantment enters, you become the monarch.\nAt the beginning of your upkeep, create a 3/1 red Knight creature token. Then if you're the monarch, this enchantment deals X damage to each opponent, where X is the number of creatures you control." });

  it("is fully supported", () => supported(court));

  for (const monarch of [true, false])
    it(`upkeep: a Knight; ${monarch ? "the monarch: X damage to each opponent" : "not the monarch: no damage"}`, () => {
      const { s: s0, ap, opp } = setup([]);
      putOnBattlefield(s0, ap, court);
      putOnBattlefield(s0, ap, bear());
      s0.monarch = monarch ? ap : opp;
      let s = passUntil(s0, "upkeep", ap);
      const life = s.players[opp]!.life;
      s = resolveAll(s);
      expect(tokens(s, ap, "Knight")).toBe(1);
      // The bear and the Knight.
      expect(s.players[opp]!.life).toBe(monarch ? life - 2 : life);
    });
});

describe("Garruk, Cursed Huntsman: the Wolves' dies trigger", () => {
  const garruk = card("Garruk, Cursed Huntsman", "Legendary Planeswalker — Garruk", "{4}{B}{G}", { loyalty: "5", oracleText: "0: Create two 2/2 black and green Wolf creature tokens with \"When this token dies, put a loyalty counter on each Garruk you control.\"\n−3: Destroy target creature. Draw a card.\n−6: You get an emblem with \"Creatures you control get +3/+3 and have trample.\"" });
  const murder = card("Test Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });

  it("is fully supported", () => supported(garruk));

  it("a Wolf dies: a loyalty counter on Garruk", () => {
    const { s: s0, ap, ids } = setup([murder]);
    const g = putOnBattlefield(s0, ap, garruk);
    s0.objects[g]!.counters.loyalty = 5;
    let s = botsResolve(run(s0, planActivate(s0, ap, g, 0)));
    const wolves = s.battlefield.filter((id) => s.objects[id]!.isToken && /Wolf/.test(s.cards[s.objects[id]!.cardId]!.name));
    expect(wolves).toHaveLength(2);
    expect(s.objects[g]!.counters.loyalty).toBe(5);
    s = botsResolve(run(s, planCast(s, ap, ids[0]!, [{ kind: "object", id: wolves[0]! }])));
    expect(s.objects[g]!.counters.loyalty).toBe(6);
  });
});

describe("Harald, King of Skemfar: an Elf, Warrior, or Tyvar card", () => {
  const harald = card("Harald, King of Skemfar", "Legendary Creature — Elf Warrior", "{1}{B}{G}", { power: "3", toughness: "2", keywords: ["Menace"], oracleText: "Menace (This creature can't be blocked except by two or more creatures.)\nWhen Harald enters, look at the top five cards of your library. You may reveal an Elf, Warrior, or Tyvar card from among them and put it into your hand. Put the rest on the bottom of your library in a random order." });
  const tyvar = card("Tyvar Kell", "Legendary Planeswalker — Tyvar", "{2}{B}{B}{G}", { loyalty: "6", oracleText: "Elves you control have \"{T}: Add {B}.\"\n+1: Put a +1/+1 counter on up to one target Elf. Untap it. It gains deathtouch until end of turn.\n0: Create a 1/1 green Elf Warrior creature token.\n−6: You get an emblem with \"Whenever you cast an Elf spell, it gains haste until end of turn and you draw two cards.\"" });
  const elf = card("Test Elf", "Creature — Elf", "{G}", { power: "1", toughness: "1" });

  it("is fully supported", () => supported(harald));

  it("a Tyvar planeswalker card and an Elf can be taken, a Bear can't", () => {
    const { s: s0, ap, ids } = setup([harald]);
    const top = [tyvar, bear(), elf, bear(), bear()].map((d) => {
      const id = putOnBattlefield(s0, ap, d);
      s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
      s0.objects[id]!.zone = "library";
      return id;
    });
    s0.players[ap]!.library.unshift(...top);
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, cards: [top[0]!, top[2]!], max: 1 });
    const after = act(s, { type: "searchLibrary", player: ap, found: [top[0]!] });
    expect(after.objects[top[0]!]!.zone).toBe("hand");
  });
});
