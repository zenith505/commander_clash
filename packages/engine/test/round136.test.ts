// Round 136: round 135's gaps (bots use Sanctum of Eternity, Doubling Cube raises X, The Wise Mothman, Phyresis
// Outbreak), then the most played cards.

import { describe, expect, it } from "vitest";
import { act, bear, card, pt, putOnBattlefield, setup } from "./helpers";
import { botActions, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

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
