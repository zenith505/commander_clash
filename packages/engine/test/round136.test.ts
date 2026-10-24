// Round 136: round 135's gaps (bots use Sanctum of Eternity, Doubling Cube raises X, The Wise Mothman, Phyresis
// Outbreak), then the most played cards.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, attackProblem, botActions, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

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
/** `attackers` attack `defender`; nobody blocks; the active player has priority in the declare blockers step. */
const attackUnblocked = (s: GameState, ap: PlayerId, attackers: string[], defender: PlayerId) => {
  s = act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: attackers.map((attacker) => ({ attacker, defender })) });
  for (let i = 0; i < 40 && !(s.step === "declareBlockers" && !s.pending && waitingOn(s) === ap && !s.stack.length); i++) {
    const pid = waitingOn(s)!;
    s = s.pending?.kind === "declareBlockers" ? act(s, { type: "declareBlockers", player: pid, blocks: [] }) : act(s, { type: "passPriority", player: pid });
  }
  return s;
};
const nextOf = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % 4]!;
/** These cards on top of `pid`'s library, the first on top. */
const onTop = (s: GameState, pid: PlayerId, defs: CardDef[]) => {
  const ids = defs.map((d) => {
    const id = putOnBattlefield(s, pid, d);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "library";
    return id;
  });
  s.players[pid]!.library.unshift(...ids);
  return ids;
};

describe("Sanctum of Eternity: bots return their own commander", () => {
  const sanctum = card("Sanctum of Eternity", "Land", "", { oracleText: "{T}: Add {C}.\n{2}, {T}: Return target commander you own from the battlefield to your hand. Activate only during your turn." });
  const murder = card("Test Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });

  it("in response to an opponent's spell that would destroy it, on the bot's turn", () => {
    supported(sanctum, murder);
    const { s: s0, ap } = setup([]);
    const opp = nextOf(s0, ap);
    const id = putOnBattlefield(s0, ap, sanctum);
    const cmd = putOnBattlefield(s0, ap, bear({ name: "Test Commander Bear" }), { commander: true });
    // Nothing to do while nothing threatens it.
    expect(botActions(s0, ap).some((a) => a.type === "activateAbility" && a.objectId === id)).toBe(false);
    // The opponent casts the removal at it.
    const m = putOnBattlefield(s0, opp, murder);
    s0.battlefield.splice(s0.battlefield.indexOf(m), 1);
    s0.objects[m]!.zone = "hand";
    s0.players[opp]!.hand.push(m);
    for (const l of ["Swamp", "Swamp", "Swamp"]) putOnBattlefield(s0, opp, card(l, `Basic Land — ${l}`));
    s0.priority = opp;
    let s = run(s0, planCast(s0, opp, m, [{ kind: "object", id: cmd }]));
    // The others pass until it's the bot's turn to answer.
    while (waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.stack.length).toBe(1);
    const acts = botActions(s, ap);
    expect(acts.some((a) => a.type === "activateAbility" && a.objectId === id)).toBe(true);
    s = resolveAll(run(s, acts));
    expect(s.objects[cmd]!.zone).toBe("hand");
  });

  it("when an opponent controls it", () => {
    const { s: s0, ap } = setup([]);
    const id = putOnBattlefield(s0, ap, sanctum);
    const cmd = putOnBattlefield(s0, nextOf(s0, ap), bear({ name: "Test Commander Bear" }), { commander: true });
    s0.objects[cmd]!.owner = ap;
    const acts = botActions(s0, ap);
    expect(acts.find((a) => a.type === "activateAbility" && a.objectId === id)).toMatchObject({ targets: [{ kind: "object", id: cmd }] });
  });
});

describe("The Wise Mothman: up to X target creatures, X the nonland cards milled", () => {
  const mothman = card("The Wise Mothman", "Legendary Creature — Insect Mutant", "{1}{B}{G}{U}", {
    power: "3",
    toughness: "3",
    keywords: ["Flying"],
    oracleText: "Flying\nWhenever The Wise Mothman enters or attacks, each player gets a rad counter.\nWhenever one or more nonland cards are milled, put a +1/+1 counter on each of up to X target creatures, where X is the number of nonland cards milled this way.",
  });
  const mill = card("Test Mill", "Sorcery", "{U}", { oracleText: "Target player mills three cards." });
  const millAll = card("Test Mill All", "Sorcery", "{U}", { oracleText: "Each player mills two cards." });
  const forestCard = card("Forest", "Basic Land — Forest");

  it("is fully supported", () => supported(mothman));

  it("three milled, two of them nonland: up to two targets", () => {
    const { s: s0, ap, ids } = setup([mill]);
    const opp = nextOf(s0, ap);
    putOnBattlefield(s0, ap, mothman);
    const a = putOnBattlefield(s0, ap, bear({ name: "Test Bear A" }));
    const b = putOnBattlefield(s0, ap, bear({ name: "Test Bear B" }));
    const c = putOnBattlefield(s0, ap, bear({ name: "Test Bear C" }));
    onTop(s0, opp, [bear({ name: "Test Milled Bear" }), forestCard, bear({ name: "Test Milled Bear 2" })]);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(s.pending).toMatchObject({ kind: "chooseTargets", x: 2 });
    // Three would be too many.
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: a }, { kind: "object", id: b }, { kind: "object", id: c }] })).toThrow();
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: a }, { kind: "object", id: b }] }));
    expect([pt(s, a), pt(s, b), pt(s, c)]).toEqual(["3/3", "3/3", "2/2"]);
  });

  it("several players milling at once: it triggers once, counting all of them (rulings)", () => {
    const { s: s0, ap, ids } = setup([millAll]);
    putOnBattlefield(s0, ap, mothman);
    for (const pid of s0.turnOrder) onTop(s0, pid, [bear({ name: `Test Milled ${pid}` }), forestCard]);
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseTargets", x: 4 });
    expect(s.triggerQueue.length).toBe(1);
  });

  it("only lands milled: no trigger", () => {
    const { s: s0, ap, ids } = setup([mill]);
    const opp = nextOf(s0, ap);
    putOnBattlefield(s0, ap, mothman);
    onTop(s0, opp, [forestCard, forestCard, forestCard]);
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(s.pending).toBeFalsy();
    expect(s.stack.length).toBe(0);
  });

  it("a bot puts the counters on its own creatures", () => {
    const { s: s0, ap, ids } = setup([mill]);
    const opp = nextOf(s0, ap);
    putOnBattlefield(s0, ap, mothman);
    const a = putOnBattlefield(s0, ap, bear({ name: "Test Bear A" }));
    onTop(s0, opp, [bear({ name: "Test Milled Bear" }), forestCard, forestCard]);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(s.pending).toMatchObject({ kind: "chooseTargets", x: 1 });
    const pick = botActions(s, ap)[0]!;
    expect(pick.type === "chooseTargets" && pick.targets.every((t) => t.kind === "object" && s.objects[t.id]!.controller === ap)).toBe(true);
    s = resolveAll(run(s, [pick]));
    expect(s.pending).toBeFalsy();
    void a;
  });
});

describe("Phyresis Outbreak: -1/-1 for each poison counter each creature's controller has", () => {
  const outbreak = card("Phyresis Outbreak", "Sorcery", "{2}{B}", { oracleText: "Each opponent gets a poison counter. Then each creature your opponents control gets -1/-1 until end of turn for each poison counter its controller has." });

  it("each opponent's creatures by their own controller's poison counters, counted as it resolves (rulings)", () => {
    supported(outbreak);
    const { s: s0, ap, ids } = setup([outbreak]);
    const [b, c] = [nextOf(s0, ap), nextOf(s0, nextOf(s0, ap))];
    s0.players[b]!.poison = 2;
    const big = (n: string) => card(n, "Creature — Giant", "{4}", { power: "5", toughness: "5" });
    const x = putOnBattlefield(s0, b, big("Test Giant B"));
    const y = putOnBattlefield(s0, c, big("Test Giant C"));
    const mine = putOnBattlefield(s0, ap, big("Test Giant Mine"));
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.players[b]!.poison).toBe(3);
    expect(s.players[c]!.poison).toBe(1);
    expect([pt(s, x), pt(s, y), pt(s, mine)]).toEqual(["2/2", "4/4", "5/5"]);
    // More poison later doesn't change it, nor does a change of control.
    s.players[c]!.poison = 5;
    s.objects[y]!.controller = b;
    expect(pt(s, y)).toBe("4/4");
  });

  it("isn't read where nothing is affected", () => {
    const bad = card("Test Poison Bolt", "Instant", "{R}", { oracleText: "Test Poison Bolt deals 1 damage to any target for each poison counter its controller has." });
    expect(isFullySupported(bad)).toBe(false);
  });
});

describe("The Wise Mothman's kin: Mirelurk Queen and Screeching Scorchbeast", () => {
  const queen = card("Mirelurk Queen", "Creature — Crab Mutant", "{4}{U}", { power: "3", toughness: "4", keywords: ["Vigilance"], oracleText: "Vigilance\nWhen this creature enters, target player gets two rad counters.\nWhenever one or more nonland cards are milled, draw a card, then put a +1/+1 counter on this creature. This ability triggers only once each turn." });
  const beast = card("Screeching Scorchbeast", "Creature — Bat Mutant", "{4}{B}{B}", { power: "3", toughness: "3", keywords: ["Flying", "Menace"], oracleText: "Flying, menace\nWhenever this creature attacks, each player gets two rad counters.\nWhenever one or more nonland cards are milled, you may create that many 2/2 black Zombie Mutant creature tokens. Do this only once each turn." });
  const millAll = card("Test Mill All", "Sorcery", "{U}", { oracleText: "Each player mills two cards." });

  it("once for the whole event; that many is the nonland cards", () => {
    supported(queen, beast);
    const { s: s0, ap, ids } = setup([millAll]);
    const q = putOnBattlefield(s0, ap, queen);
    putOnBattlefield(s0, ap, beast);
    for (const pid of s0.turnOrder) onTop(s0, pid, [bear({ name: `Test Milled ${pid}` }), card("Forest", "Basic Land — Forest")]);
    const hand = s0.players[ap]!.hand.length - 1;
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    for (let i = 0; i < 10 && s.pending; i++) s = resolveAll(act(s, s.pending.kind === "chooseMay" ? { type: "chooseMay", player: s.pending.player, yes: true } : { type: "passPriority", player: waitingOn(s)! }));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(pt(s, q)).toBe("4/5");
    expect(s.battlefield.filter((id) => s.objects[id]!.isToken).length).toBe(4);
  });
});

describe("Satoru Umezawa: creature cards in your hand have ninjutsu, and ninjutsu digs", () => {
  const satoru = card("Satoru Umezawa", "Legendary Creature — Human Ninja", "{1}{U}{B}", {
    power: "2",
    toughness: "4",
    oracleText: "Whenever you activate a ninjutsu ability, look at the top three cards of your library. Put one of them into your hand and the rest on the bottom of your library in any order. This ability triggers only once each turn.\nEach creature card in your hand has ninjutsu {2}{U}{B}.",
  });
  const giant = card("Test Giant", "Creature — Giant", "{6}{G}{G}", { power: "8", toughness: "8" });
  const sorcery = card("Test Sorcery", "Sorcery", "{1}", { oracleText: "Draw a card." });

  it("is fully supported", () => supported(satoru));

  it("a creature card in hand has the ninjutsu, a sorcery doesn't, and not without Satoru", () => {
    const { s, ap, ids } = setup([giant, sorcery]);
    expect(abilitiesOf(s, s.objects[ids[0]!]!).activated.some((a) => a.keyword === "Ninjutsu")).toBe(false);
    putOnBattlefield(s, ap, satoru);
    expect(abilitiesOf(s, s.objects[ids[0]!]!).activated.find((a) => a.keyword === "Ninjutsu")?.manaCost).toBe("{2}{U}{B}");
    expect(abilitiesOf(s, s.objects[ids[1]!]!).activated.some((a) => a.keyword === "Ninjutsu")).toBe(false);
    // Another player's Satoru doesn't give it to our cards.
    const t = setup([giant], 7);
    putOnBattlefield(t.s, t.opp, satoru);
    expect(abilitiesOf(t.s, t.s.objects[t.ids[0]!]!).activated.some((a) => a.keyword === "Ninjutsu")).toBe(false);
  });

  it("ninjutsu swaps in the giant, and Satoru's trigger looks at three first", () => {
    const { s: s0, ap, opp, ids } = setup([giant]);
    putOnBattlefield(s0, ap, satoru);
    const b = putOnBattlefield(s0, ap, bear());
    let s = attackUnblocked(s0, ap, [b], opp);
    const i = abilitiesOf(s, s.objects[ids[0]!]!).activated.findIndex((a) => a.keyword === "Ninjutsu");
    s = run(s, planActivate(s, ap, ids[0]!, i, undefined, undefined, undefined, undefined, { returnToHand: [b] }));
    // Satoru's trigger is on top of the ninjutsu ability (rulings).
    expect(s.stack.length).toBe(2);
    s = resolveAll(s);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    const pend = s.pending as Extract<GameState["pending"], { kind: "searchLibrary" }>;
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [pend.cards[0]!] }));
    for (let k = 0; k < 5 && s.pending; k++) s = resolveAll(act(s, botActions(s, s.pending!.player)[0]!));
    const g = s.objects[ids[0]!]!;
    expect(g.zone).toBe("battlefield");
    expect(g.attacking).toBe(opp);
    expect(s.objects[b]!.zone).toBe("hand");
  });

  it("a bot uses the granted ninjutsu for a creature card worth more than its unblocked attacker", () => {
    const { s: s0, ap, opp, ids } = setup([giant]);
    putOnBattlefield(s0, ap, satoru);
    const b = putOnBattlefield(s0, ap, bear());
    const s = attackUnblocked(s0, ap, [b], opp);
    const acts = botActions(s, ap);
    expect(acts.find((a) => a.type === "activateAbility" && a.objectId === ids[0])).toBeTruthy();
  });
});

describe("The Second Doctor: each player may draw; opponents who do can't attack you during their next turn", () => {
  const doctor = card("The Second Doctor", "Legendary Creature — Time Lord Doctor", "{2}{W}{U}", {
    power: "2",
    toughness: "4",
    oracleText: "Players have no maximum hand size.\nHow Civil of You — At the beginning of your end step, each player may draw a card. Each opponent who does can't attack you or permanents you control during their next turn.",
  });
  const walker = card("Test Walker", "Legendary Planeswalker — Testwalker", "{3}", { loyalty: "5", oracleText: "+1: You gain 1 life." });

  it("is fully supported", () => supported(doctor));

  it("the opponent who drew can't attack you or your planeswalker during their next turn; the one who didn't can", () => {
    const { s: s0, ap } = setup([]);
    const [b, c] = [nextOf(s0, ap), nextOf(s0, nextOf(s0, ap))];
    putOnBattlefield(s0, ap, doctor);
    const pw = putOnBattlefield(s0, ap, walker);
    const hands = Object.fromEntries(s0.turnOrder.map((p) => [p, s0.players[p]!.hand.length]));
    let s = passUntil(s0, "end", ap);
    // Starting with you, each decides in turn order (rulings on the "each player may" cards).
    const answers: Record<number, boolean> = { [ap]: true, [b]: true, [c]: false, [nextOf(s0, c)]: true };
    for (let i = 0; i < 20 && (s.pending || s.stack.length || s.triggerQueue.length); i++) {
      const p = s.pending;
      if (p?.kind === "chooseMay") {
        if (p.player === b) expect(p.otherwise).toMatch(/can't attack .+ during your next turn/);
        if (p.player === ap) expect(p.otherwise).toBeUndefined();
        s = act(s, { type: "chooseMay", player: p.player, yes: answers[p.player]! });
      } else if (p) throw new Error(`unexpected ${p.kind}`);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.players[ap]!.hand.length).toBe(hands[ap]! + 1);
    expect(s.players[b]!.hand.length).toBe(hands[b]! + 1);
    expect(s.players[c]!.hand.length).toBe(hands[c]!);
    const bb = putOnBattlefield(s, b, bear({ name: "B Bear" }));
    const cb = putOnBattlefield(s, c, bear({ name: "C Bear" }));
    // Not yet: it's still our turn.
    expect(attackProblem(s, s.objects[bb]!, ap)).toBeNull();
    s = passUntil(s, "declareAttackers", b);
    expect(attackProblem(s, s.objects[bb]!, ap)).toMatch(/can't attack/);
    expect(attackProblem(s, s.objects[bb]!, ap, true, pw)).toMatch(/can't attack/);
    expect(attackProblem(s, s.objects[bb]!, c)).toBeNull();
    expect(() => act(s, { type: "declareAttackers", player: b, attacks: [{ attacker: bb, defender: ap }] })).toThrow();
    s = passUntil(s, "declareAttackers", c);
    expect(attackProblem(s, s.objects[cb]!, ap)).toBeNull();
    // B's next turn after that: free again (the Doctor gone, so it doesn't ask again).
    const d = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "The Second Doctor")!;
    s.battlefield.splice(s.battlefield.indexOf(d), 1);
    s.objects[d]!.zone = "graveyard";
    s = passUntil(passUntil(s, "upkeep", ap), "declareAttackers", b);
    expect(attackProblem(s, s.objects[bb]!, ap)).toBeNull();
  });

  it("a bot opponent draws unless the Doctor's controller is the only opponent it has left", () => {
    const { s: s0, ap } = setup([]);
    const b = nextOf(s0, ap);
    putOnBattlefield(s0, ap, doctor);
    let s = passUntil(s0, "end", ap);
    for (let i = 0; i < 20 && s.pending?.player !== b; i++) s = s.pending?.kind === "chooseMay" ? act(s, { type: "chooseMay", player: s.pending.player, yes: false }) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(botActions(s, b)[0]).toMatchObject({ type: "chooseMay", yes: true });
    for (const p of s.turnOrder) if (p !== ap && p !== b) s.players[p]!.lost = true;
    expect(botActions(s, b)[0]).toMatchObject({ type: "chooseMay", yes: false });
  });
});

describe("The Master, Multiplied: your triggered abilities can't sacrifice or exile your creature tokens", () => {
  const master = card("The Master, Multiplied", "Legendary Creature — Time Lord Rogue", "{4}{B}{R}", {
    power: "4",
    toughness: "3",
    keywords: ["Myriad"],
    oracleText: "Myriad\nThe \"legend rule\" doesn't apply to creature tokens you control.\nTriggered abilities you control can't cause you to sacrifice or exile creature tokens you control.",
  });
  const sacUpkeep = card("Test Sac Upkeep", "Enchantment", "{1}", { oracleText: "At the beginning of your upkeep, sacrifice a creature." });
  const bolt = card("Test Exile Ray", "Instant", "{W}", { oracleText: "Exile target creature." });

  it("is fully supported", () => supported(master));

  it("myriad's tokens aren't exiled at end of combat, and the legend rule leaves them", () => {
    const { s: s0, ap, opp } = setup([]);
    const m = putOnBattlefield(s0, ap, master);
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: m, defender: opp }] });
    for (let i = 0; i < 300 && s.step !== "main2"; i++) {
      const p = s.pending;
      if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: true });
      else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
      else if (p) s = act(s, botActions(s, p.player)[0]!);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    const tokens = s.battlefield.filter((id) => s.objects[id]!.isToken && s.cards[s.objects[id]!.cardId]!.name === "The Master, Multiplied");
    expect(tokens).toHaveLength(2);
    expect(s.log.some((l) => /isn't exiled \(The Master, Multiplied\)/.test(l.text))).toBe(true);
  });

  it("a trigger of yours can't sacrifice a creature token, but a spell can exile it", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, master);
    putOnBattlefield(s0, ap, sacUpkeep);
    const tok = putOnBattlefield(s0, ap, bear({ name: "Test Token Bear" }));
    s0.objects[tok]!.isToken = true;
    // Only the token and the Master to choose from: the Master is kept by choosing the token, which then isn't sacrificed.
    let s = passUntil(passUntil(s0, "upkeep", nextOf(s0, ap)), "upkeep", ap);
    for (let i = 0; i < 20 && (s.pending || s.stack.length || s.triggerQueue.length); i++) {
      const p = s.pending;
      if (p?.kind === "pickPermanents") s = act(s, { type: "pickPermanents", player: p.player, ids: [tok] });
      else if (p) s = act(s, botActions(s, p.player)[0]!);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.objects[tok]!.zone).toBe("battlefield");
    // An instant isn't a triggered ability.
    const r = putOnBattlefield(s, ap, bolt);
    s.battlefield.splice(s.battlefield.indexOf(r), 1);
    s.objects[r]!.zone = "hand";
    s.players[ap]!.hand.push(r);
    s = passUntil(s, "main1", ap);
    s = resolveAll(run(s, planCast(s, ap, r, [{ kind: "object", id: tok }])));
    expect(s.objects[tok]?.zone ?? "gone").not.toBe("battlefield");
  });
});

describe("Tidus, Yuna's Guardian: move a counter at the beginning of combat; cheer when creatures with counters connect", () => {
  const tidus = card("Tidus, Yuna's Guardian", "Legendary Creature — Human Warrior", "{G}{W}{U}", {
    power: "3",
    toughness: "3",
    oracleText: "At the beginning of combat on your turn, you may move a counter from target creature you control onto a second target creature you control.\nCheer — Whenever one or more creatures you control with counters on them deal combat damage to a player, you may draw a card and proliferate. Do this only once each turn.",
  });

  it("is fully supported", () => supported(tidus));

  it("the second target is another creature (a second target, not the first again)", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, tidus);
    const a = putOnBattlefield(s0, ap, bear({ name: "Test Bear A" }));
    const b = putOnBattlefield(s0, ap, bear({ name: "Test Bear B" }));
    s0.objects[a]!.counters["+1/+1"] = 2;
    let s = passUntil(s0, "beginCombat", ap);
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind).toBe("chooseTargets");
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: a }, { kind: "object", id: a }] })).toThrow();
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: a }, { kind: "object", id: b }] }));
    if (s.pending?.kind === "chooseMay") s = resolveAll(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect([s.objects[a]!.counters["+1/+1"], s.objects[b]!.counters["+1/+1"]]).toEqual([1, 1]);
  });

  it("cheer: a creature with a counter connects; you may draw and proliferate", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, tidus);
    const a = putOnBattlefield(s0, ap, bear({ name: "Test Bear A" }));
    s0.objects[a]!.counters["+1/+1"] = 1;
    // Through the beginning of combat (its move answered by the bot's choice) to the declaration.
    let s = s0;
    for (let i = 0; i < 60 && s.pending?.kind !== "declareAttackers"; i++)
      s = s.pending ? act(s, botActions(s, s.pending.player)[0]!) : act(s, { type: "passPriority", player: waitingOn(s)! });
    s.objects[a]!.counters = { "+1/+1": 1 };
    const hand = s.players[ap]!.hand.length;
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] });
    for (let i = 0; i < 60 && !(s.pending?.kind === "chooseMay"); i++) {
      const p = s.pending;
      if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
      else if (p) s = act(s, botActions(s, p.player)[0]!);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    for (let i = 0; i < 10 && s.pending; i++) s = act(s, s.pending.kind === "pickPermanents" ? { type: "pickPermanents", player: ap, ids: [a] } : botActions(s, s.pending.player)[0]!);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.objects[a]!.counters["+1/+1"]).toBe(2);
  });
});
