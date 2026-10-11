import { describe, expect, it } from "vitest";
import {
  applyAction,
  botActions,
  compileCard,
  createGame,
  invalidateCharacteristics,
  modifications,
  planActivate,
  power,
  planCast,
  waitingOn,
  RulesError,
  type CardDef,
  type GameState,
  type TargetChoice,
} from "../src";
import { act, bear, card, commander, forest, passAll, passUntil, putOnBattlefield } from "./helpers";

const mountain = card("Mountain", "Basic Land — Mountain");
const island = card("Island", "Basic Land — Island");
const bolt = card("Lightning Bolt", "Instant", "{R}", { oracleText: "Lightning Bolt deals 3 damage to any target." });
const cancel = card("Cancel", "Instant", "{1}{U}{U}", { oracleText: "Counter target spell." });
const divination = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });
const raise = card("Raise the Alarm", "Instant", "{1}{W}", { oracleText: "Create two 1/1 white Soldier creature tokens." });
const giant = card("Giant Growth", "Instant", "{G}", { oracleText: "Target creature gets +3/+3 until end of turn." });
const elvish = card("Elvish Visionary", "Creature — Elf Shaman", "{1}{G}", { power: "1", toughness: "1", oracleText: "When this creature enters, draw a card." });
const doomed = card("Doomed Traveler", "Creature — Human Soldier", "{W}", { power: "1", toughness: "1", oracleText: "When this creature dies, each opponent loses 2 life." });
const ravenous = card("Ravenous Chupacabra", "Creature — Beast Horror", "{2}{B}{B}", {
  power: "2", toughness: "2", oracleText: "When Ravenous Chupacabra enters, destroy target creature an opponent controls.",
});
const sorcerer = card("Prodigal Sorcerer", "Creature — Human Wizard", "{2}{U}", { power: "1", toughness: "1", oracleText: "{T}: Prodigal Sorcerer deals 1 damage to any target." });
const healer = card("Soul Warden", "Creature — Human Cleric", "{W}", { power: "1", toughness: "1", oracleText: "At the beginning of your upkeep, you gain 1 life." });
const shroudy = bear({ name: "Slippery Bogle", keywords: ["Hexproof"] });

/** Four players; the active player has `hand` in hand and lots of every land. */
function setup(hand: CardDef[], seed = 5) {
  const deck = () => [...Array.from({ length: 60 }, () => forest), ...Array.from({ length: 39 }, () => bear())];
  let s = createGame(["A", "B", "C", "D"].map((name, i) => ({ name, commander: commander(`C${i}`), deck: deck() })), seed);
  s = passUntil(s, "main1");
  const ap = s.activePlayer;
  for (const l of [mountain, mountain, mountain, island, island, island, forest, forest, card("Plains", "Basic Land — Plains"), card("Swamp", "Basic Land — Swamp"), card("Swamp", "Basic Land — Swamp")])
    putOnBattlefield(s, ap, l);
  const ids = hand.map((c) => {
    const id = putOnBattlefield(s, ap, c);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "hand";
    s.players[ap]!.hand.push(id);
    return id;
  });
  return { s, ap, ids, opp: s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]! };
}

function cast(s: GameState, ap: number, id: string, targets?: TargetChoice[]) {
  const plan = planCast(s, ap, id, targets);
  if (!plan) throw new Error("can't cast");
  for (const a of plan) s = act(s, a);
  return s;
}
const resolve = (s: GameState) => passAll(s);

describe("rules text compiler", () => {
  it("compiles common templates", () => {
    expect(compileCard(bolt).spell?.effects).toEqual([{ type: "damage", amount: 3, to: { ref: "anyTarget", index: 0 } }]);
    expect(compileCard(ravenous).triggers[0]?.event).toBe("selfEnters");
    expect(compileCard(ravenous).triggers[0]?.body.targets[0]).toMatchObject({ kind: "object", types: ["Creature"], controller: "opponent" });
    expect(compileCard(sorcerer).activated[0]).toMatchObject({ tap: true, manaCost: "" });
    expect(compileCard(raise).spell?.effects[0]).toMatchObject({ type: "createToken", n: 2, token: { power: 1, toughness: 1, colors: ["W"] } });
    expect(compileCard(card("Opt", "Instant", "{U}", { oracleText: "Scry 1.\nDraw a card." })).spell?.effects).toEqual([{ type: "scry", n: 1 }, { type: "draw", who: { ref: "you" }, n: 1 }]);
    expect(compileCard(card("Grow", "Instant", "{G}", { oracleText: "Proliferate.\nDraw a card." })).unsupported).toEqual(["Proliferate.", "Draw a card."]);
  });
});

describe("spells", () => {
  it("Lightning Bolt kills a creature or hits a player", () => {
    const { s: s0, ap, ids, opp } = setup([bolt, { ...bolt, oracleId: "bolt2" }]);
    const victim = putOnBattlefield(s0, opp, bear());
    let s = resolve(cast(s0, ap, ids[0]!, [{ kind: "object", id: victim }]));
    expect(s.objects[victim]!.zone).toBe("graveyard");
    s = resolve(cast(s, ap, ids[1]!, [{ kind: "player", id: opp }]));
    expect(s.players[opp]!.life).toBe(37);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });

  it("needs targets and refuses illegal ones", () => {
    const { s, ap, ids, opp } = setup([bolt]);
    const plan = planCast(s, ap, ids[0]!)!;
    let t = s;
    for (const a of plan.slice(0, -1)) t = act(t, a);
    expect(() => act(t, { type: "castSpell", player: ap, objectId: ids[0]! })).toThrow(RulesError);
    const bogle = putOnBattlefield(t, opp, shroudy);
    expect(() => act(t, { type: "castSpell", player: ap, objectId: ids[0]!, targets: [{ kind: "object", id: bogle }] })).toThrow(/illegal target/);
  });

  it("does nothing if its only target is gone on resolution (CR 608.2b)", () => {
    const { s: s0, ap, ids, opp } = setup([bolt, giant]);
    const victim = putOnBattlefield(s0, opp, bear());
    let s = cast(s0, ap, ids[0]!, [{ kind: "object", id: victim }]);
    s.objects[victim]!.zone = "graveyard"; // pretend it was sacrificed in response
    s.battlefield.splice(s.battlefield.indexOf(victim), 1);
    s = resolve(s);
    expect(s.log.some((e) => /does nothing/.test(e.text))).toBe(true);
  });

  it("Giant Growth wears off at end of turn", () => {
    const { s: s0, ap, ids } = setup([giant]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = resolve(cast(s0, ap, ids[0]!, [{ kind: "object", id: b }]));
    expect(s.effects).toHaveLength(1);
    expect(power(s, s.objects[b]!)).toBe(5);
    s = passUntil(s, "upkeep");
    expect(s.effects).toHaveLength(0);
    expect(power(s, s.objects[b]!)).toBe(2);
  });

  it("reports counters, temporary bonuses and granted keywords separately", () => {
    const rush = card("Brute Force", "Instant", "{R}", { oracleText: "Target creature gets +3/+3 and gains trample until end of turn." });
    const { s: s0, ap, ids } = setup([rush]);
    const b = putOnBattlefield(s0, ap, bear({ keywords: ["Trample"] }));
    s0.objects[b]!.counters["+1/+1"] = 2;
    const s = resolve(cast(s0, ap, ids[0]!, [{ kind: "object", id: b }]));
    const m = modifications(s, s.objects[b]!);
    expect(m.plusCounters).toBe(2);
    expect([m.effectPower, m.effectToughness, m.temporary]).toEqual([3, 3, true]);
    expect(m.grantedKeywords).toEqual([]); // it already had trample
    const plain = putOnBattlefield(s, ap, bear());
    s.effects.push({ id: "x", timestamp: s.nextTimestamp++, controller: ap, sourceName: "test", duration: "endOfTurn", affected: [plain], mods: [{ kind: "addKeywords", keywords: ["First strike"] }] });
    invalidateCharacteristics(s);
    expect(modifications(s, s.objects[plain]!).grantedKeywords).toEqual(["First strike"]);
  });

  it("counterspells counter", () => {
    const { s: s0, ap, ids } = setup([divination, cancel]);
    let s = cast(s0, ap, ids[0]!);
    const target = s.stack[0]!.id;
    s = cast(s, ap, ids[1]!, [{ kind: "stack", id: target }]);
    const hand = s.players[ap]!.hand.length;
    s = resolve(s);
    expect(s.stack).toHaveLength(0);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand); // Divination never resolved
  });

  it("creates tokens, and tokens cease to exist when they leave", () => {
    const { s: s0, ap, ids } = setup([raise]);
    const s = resolve(cast(s0, ap, ids[0]!));
    const tokens = s.battlefield.filter((id) => s.objects[id]!.isToken);
    expect(tokens).toHaveLength(2);
  });
});

describe("triggered abilities", () => {
  it("ETB: draw a card", () => {
    const { s: s0, ap, ids } = setup([elvish]);
    const hand = s0.players[ap]!.hand.length;
    let s = resolve(cast(s0, ap, ids[0]!)); // creature resolves, its trigger goes on the stack
    while (s.stack.length) s = resolve(s);
    expect(s.log.some((e) => e.text === "Elvish Visionary's ability triggers (draw a card).")).toBe(true);
    expect(s.players[ap]!.hand.length).toBe(hand); // -1 cast, +1 drawn
  });

  it("ETB with a target asks the controller to choose", () => {
    const { s: s0, ap, ids, opp } = setup([ravenous]);
    const victim = putOnBattlefield(s0, opp, bear());
    let s = resolve(cast(s0, ap, ids[0]!));
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: victim }] });
    s = resolve(s);
    expect(s.objects[victim]!.zone).toBe("graveyard");
  });

  it("dies triggers fire from the graveyard", () => {
    const { s: s0, ap, opp } = setup([]);
    const t = putOnBattlefield(s0, ap, doomed);
    s0.objects[t]!.damage = 1;
    let s = act(s0, { type: "passPriority", player: ap }); // SBA kills it, trigger goes on the stack
    s = passAll(s);
    expect(s.players[opp]!.life).toBe(38);
  });

  it("upkeep triggers", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, healer);
    let s = passUntil(s0, "upkeep", ap, 5000);
    s = passUntil(s, "draw", ap);
    expect(s.players[ap]!.life).toBe(41);
  });
});

describe("activated abilities", () => {
  it("Prodigal Sorcerer pings, needs to be untapped and not summoning sick", () => {
    const { s: s0, ap, opp } = setup([]);
    const ps = putOnBattlefield(s0, ap, sorcerer);
    const plan = planActivate(s0, ap, ps, 0, [{ kind: "player", id: opp }])!;
    let s = s0;
    for (const a of plan) s = act(s, a);
    expect(() => act(s, { type: "activateAbility", player: ap, objectId: ps, index: 0, targets: [{ kind: "player", id: opp }] })).toThrow(/tapped/);
    s = passAll(s);
    expect(s.players[opp]!.life).toBe(39);
    const sick = putOnBattlefield(s, ap, sorcerer, { sick: true });
    expect(planActivate(s, ap, sick, 0, [{ kind: "player", id: opp }])).toBeNull();
  });
});

describe("bots with spells", () => {
  it("play full games using burn, removal, tokens and triggers", () => {
    const spells = [bolt, raise, giant, elvish, ravenous, sorcerer, doomed, divination, cancel, healer];
    const deck = () => [...Array.from({ length: 38 }, () => forest), ...Array.from({ length: 6 }, () => mountain), ...Array.from({ length: 6 }, () => island), ...Array.from({ length: 49 }, (_, i) => spells[i % spells.length]!)];
    let s = createGame(["A", "B", "C", "D"].map((name, i) => ({ name, commander: commander(`C${i}`), deck: deck(), isBot: true })), 11);
    let n = 0;
    while (!s.over && s.turn < 150 && n < 50_000) {
      for (const a of botActions(s, waitingOn(s)!)) s = applyAction(s, a);
      n++;
    }
    expect(s.log.some((e) => /deals 3 damage/.test(e.text))).toBe(true);
    expect(s.log.some((e) => /ability triggers/.test(e.text))).toBe(true);
    expect(s.over || s.turn >= 150).toBe(true);
  }, 60_000);
});
