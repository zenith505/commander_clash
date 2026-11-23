// Round 451: Ulalek, Fused Atrocity. "Whenever you cast an Eldrazi spell, you may pay {C}{C}. If you do, copy all spells
// you control, then copy all other activated and triggered abilities you control. You may choose new targets for the
// copies." The spells first, then the abilities other than this one (CR 608.2c); each instruction's copies in the order
// their controller chooses (CR 405.3); copies aren't cast or activated and may have new targets (CR 707.10, 707.10c).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { botActions, parseManaCost, payFromPool, planMana, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const ulalek = (): CardDef => ({"oracleId":"9f6828e3-39d9-45d9-9bf1-0e3737a0321e","name":"Ulalek, Fused Atrocity","manaCost":"{C/W}{C/U}{C/B}{C/R}{C/G}","cmc":5,"typeLine":"Legendary Creature — Eldrazi","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Eldrazi"],"oracleText":"Devoid (This card has no color.)\nWhenever you cast an Eldrazi spell, you may pay {C}{C}. If you do, copy all spells you control, then copy all other activated and triggered abilities you control. You may choose new targets for the copies. (Mana abilities can't be copied.)","power":"2","toughness":"5","colors":[],"colorIdentity":["B","G","R","U","W"],"keywords":["Devoid"],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const infiltrator = (): CardDef => ({"oracleId":"b93732e4-7aeb-4c37-a415-2b0ff46e2056","name":"Dimensional Infiltrator","manaCost":"{1}{U}","cmc":2,"typeLine":"Creature — Eldrazi","supertypes":[],"types":["Creature"],"subtypes":["Eldrazi"],"oracleText":"Devoid (This card has no color.)\nFlash\nFlying\n{1}{C}: Target opponent exiles the top card of their library. If it's a land card, you may return this creature to its owner's hand. ({C} represents colorless mana.)","power":"2","toughness":"1","colors":[],"colorIdentity":["U"],"keywords":["Flying","Devoid","Flash"],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const sorcerer = (): CardDef => ({"oracleId":"5e961d15-5972-4e4b-9385-1cd7cd7c6bbe","name":"Prodigal Sorcerer","manaCost":"{2}{U}","cmc":3,"typeLine":"Creature — Human Wizard Sorcerer","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard","Sorcerer"],"oracleText":"{T}: This creature deals 1 damage to any target.","power":"1","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const staff = (): CardDef => ({"oracleId":"3ca8113b-f5b8-41a7-aae6-ebb32554dfe3","name":"Twinning Staff","manaCost":"{3}","cmc":3,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"If you would copy a spell one or more times, instead copy it that many times plus an additional time. You may choose new targets for the additional copy.\n{7}, {T}: Copy target instant or sorcery spell you control. You may choose new targets for the copy.","colors":[],"colorIdentity":[],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;

const whisperer = (): CardDef => ({"oracleId":"5da7eea8-bb9e-47ce-a554-8a1ee058bd7a","name":"Beast Whisperer","manaCost":"{2}{G}{G}","cmc":4,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"Whenever you cast a creature spell, draw a card.","power":"2","toughness":"3","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const into = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Passes until something is asked of a player in `me`; bots answer the others. */
const settleFor = (s: GameState, me: PlayerId[]) => {
  for (let i = 0; i < 400 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && me.includes(p.player)) return s;
    if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Everyone passes until the top of the stack resolves or something is asked. */
const top = (s: GameState) => {
  const n = s.stack.length;
  for (let i = 0; i < 8 && s.stack.length === n && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Taps for {C}{C} and pays it. */
const pay = (s: GameState, pid: PlayerId) => run(s, [...planMana(s, pid, parseManaCost("{C}{C}"))!, { type: "chooseMay", player: pid, yes: true }]);
const names = (s: GameState) => s.stack.map((i) => `${i.copy ? "copy of " : ""}${i.description.split(":")[0]!.replace(/ \(copy\)$/, "")}`);

/** Ulalek, Prodigal Sorcerer and Sol Ring on my battlefield; Dimensional Infiltrator and Lightning Bolt in my hand. */
function board(extra: CardDef[] = []) {
  const { s, ap, opp } = setup([]);
  const ul = putOnBattlefield(s, ap, ulalek());
  const ps = putOnBattlefield(s, ap, sorcerer());
  for (const d of extra) putOnBattlefield(s, ap, d);
  const inf = into(s, ap, infiltrator());
  const bo = into(s, ap, bolt());
  const third = s.turnOrder.find((p) => p !== ap && p !== opp)!;
  return { s, ap, opp, third, ul, ps, inf, bo };
}

describe("Round 451: Ulalek, Fused Atrocity", () => {
  it("compiles fully", () => {
    for (const d of [ulalek(), infiltrator(), bolt(), sorcerer(), solRing(), staff()]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("its colorless hybrid symbols: each paid with one mana of its color or one colorless mana (CR 107.4e)", () => {
    const cost = parseManaCost(ulalek().manaCost);
    expect(cost.supported).toBe(true);
    const pool = (p: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => ({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...p });
    expect(payFromPool(cost, pool({ C: 5 }))?.pool).toEqual(pool({}));
    expect(payFromPool(cost, pool({ W: 1, U: 1, B: 1, R: 1, G: 1 }))?.pool).toEqual(pool({}));
    expect(payFromPool(cost, pool({ W: 1, U: 1, C: 3 }))?.pool).toEqual(pool({}));
    // Two white mana can't pay {C/U}; generic mana isn't enough either.
    expect(payFromPool(cost, pool({ W: 2, B: 1, R: 1, G: 1 }))).toBeNull();
    // Cast from my hand with my basic lands, one of each color (no colorless source there).
    const b = board();
    const ul2 = into(b.s, b.ap, ulalek());
    const s = run(b.s, planCast(b.s, b.ap, ul2));
    // It's an Eldrazi spell, so the Ulalek on the battlefield triggers.
    expect(s.stack.map((i) => i.kind)).toEqual(["spell", "ability"]);
    expect(s.stack[0]!.objectId).toBe(ul2);
  });

  it("pays {C}{C}: copies my spells in the order I choose, then my other abilities, each with new targets if I like", () => {
    const b = board();
    let s = run(b.s, planActivate(b.s, b.ap, b.ps, 0, [player(b.opp)]));
    s = run(s, planCast(s, b.ap, b.bo, [player(b.opp)]));
    s = run(s, planCast(s, b.ap, b.inf));
    putOnBattlefield(s, b.ap, solRing());
    expect(names(s)).toEqual(["Prodigal Sorcerer", "Lightning Bolt", "Dimensional Infiltrator", "Ulalek, Fused Atrocity"]);
    s = top(s);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: b.ap, pay: { mana: "{C}{C}" } });
    s = pay(s, b.ap);
    const boItem = s.stack.find((i) => i.objectId === b.bo)!.id;
    const infItem = s.stack.find((i) => i.objectId === b.inf)!.id;
    const psItem = s.stack[0]!.id;
    // Two spells: which is copied first (CR 405.3). The Sorcerer's ability isn't asked about yet.
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "copyNextOf", player: b.ap, options: [boItem, infItem], labels: [expect.stringContaining("Lightning Bolt"), expect.stringContaining("Dimensional Infiltrator")], prompt: expect.stringContaining("spell") });
    expect(() => act(s, { type: "chooseOption", player: b.ap, choice: psItem })).toThrow();
    s = act(s, { type: "chooseOption", player: b.ap, choice: infItem });
    // The Infiltrator has no targets: its copy goes on the stack; then Bolt's, aimed anew at another opponent.
    expect(s.pending).toMatchObject({ kind: "copyTargets", copyOf: expect.stringContaining("Lightning Bolt"), left: 1 });
    s = act(s, { type: "copyTargets", player: b.ap, targets: [player(b.third)] });
    // Then the abilities: only the Sorcerer's (Ulalek's own resolving one isn't "other"), so no order question.
    expect(s.pending).toMatchObject({ kind: "copyTargets", copyOf: expect.stringContaining("Prodigal Sorcerer"), left: 1 });
    s = act(s, { type: "copyTargets", player: b.ap });
    expect(s.pending).toBeFalsy();
    expect(names(s)).toEqual(["Prodigal Sorcerer", "Lightning Bolt", "Dimensional Infiltrator", "copy of Dimensional Infiltrator", "copy of Lightning Bolt", "copy of Prodigal Sorcerer"]);
    // Copies aren't cast (CR 707.10): the Infiltrator's copy doesn't trigger Ulalek.
    expect(s.triggerQueue).toHaveLength(0);
    const life = { opp: s.players[b.opp]!.life, third: s.players[b.third]!.life };
    s = settleFor(s, [b.ap]);
    expect(s.stack).toHaveLength(0);
    expect(s.players[b.opp]!.life).toBe(life.opp - 5);
    expect(s.players[b.third]!.life).toBe(life.third - 3);
    // The Infiltrator and a token copy of it (CR 608.3f).
    const infs = s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]?.name === "Dimensional Infiltrator");
    expect(infs).toHaveLength(2);
    expect(infs.filter((id) => s.objects[id]!.isToken)).toHaveLength(1);
  });

  it("declining to pay copies nothing", () => {
    const b = board();
    let s = run(b.s, planCast(b.s, b.ap, b.bo, [player(b.opp)]));
    s = run(s, planCast(s, b.ap, b.inf));
    putOnBattlefield(s, b.ap, solRing());
    s = top(s);
    s = act(s, { type: "chooseMay", player: b.ap, yes: false });
    expect(s.pending).toBeFalsy();
    expect(names(s)).toEqual(["Lightning Bolt", "Dimensional Infiltrator"]);
  });

  it("orders copies of two abilities from one source, and Twinning Staff adds a copy of each spell only", () => {
    const b = board([staff()]);
    const ps2 = putOnBattlefield(b.s, b.ap, sorcerer());
    let s = run(b.s, planActivate(b.s, b.ap, b.ps, 0, [player(b.opp)]));
    s = run(s, planActivate(s, b.ap, ps2, 0, [player(b.third)]));
    s = run(s, planCast(s, b.ap, b.inf));
    putOnBattlefield(s, b.ap, solRing());
    s = top(s);
    s = pay(s, b.ap);
    // One spell: two copies of the Infiltrator (Twinning Staff, CR 614.1a), no question; then the two abilities.
    const [a1, a2] = [s.stack[0]!.id, s.stack[1]!.id];
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "copyNextOf", options: [a1, a2], labels: [expect.stringMatching(/#1 \(1 copy left\)$/), expect.stringMatching(/#2 \(1 copy left\)$/)], prompt: expect.stringContaining("ability") });
    expect(s.stack.filter((i) => i.copy && i.description.startsWith("Dimensional Infiltrator"))).toHaveLength(2);
    s = act(s, { type: "chooseOption", player: b.ap, choice: a2 });
    s = act(s, { type: "copyTargets", player: b.ap });
    expect(s.pending).toMatchObject({ kind: "copyTargets", copyOf: expect.stringContaining("Prodigal Sorcerer") });
    s = act(s, { type: "copyTargets", player: b.ap, targets: [player(b.ap)] });
    expect(s.pending).toBeFalsy();
    // The copy of the second ability went on first; the first's copy, aimed at me, is on top.
    const copies = s.stack.filter((i) => i.copy && i.description.startsWith("Prodigal Sorcerer"));
    expect(copies.map((i) => i.targets?.[0])).toEqual([player(b.third), player(b.ap)]);
    const life = s.players[b.ap]!.life;
    s = settleFor(s, [b.ap]);
    expect(s.players[b.ap]!.life).toBe(life - 1);
    expect(s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]?.name === "Dimensional Infiltrator" && s.objects[id]!.isToken)).toHaveLength(2);
  });

  it("only my spells and abilities, not an opponent's", () => {
    const b = board();
    const theirs = putOnBattlefield(b.s, b.opp, sorcerer());
    let s = run(b.s, planCast(b.s, b.ap, b.inf));
    // The opponent activates in response, before Ulalek's trigger resolves.
    s = act(s, { type: "passPriority", player: b.ap });
    while (waitingOn(s) !== b.opp) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = run(s, planActivate(s, b.opp, theirs, 0, [player(b.ap)]));
    expect(names(s)).toEqual(["Dimensional Infiltrator", "Ulalek, Fused Atrocity", "Prodigal Sorcerer"]);
    // Their ability resolves first; then mine has only my Infiltrator to copy.
    s = top(s);
    putOnBattlefield(s, b.ap, solRing());
    s = top(s);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: b.ap });
    s = pay(s, b.ap);
    expect(s.pending).toBeFalsy();
    expect(names(s)).toEqual(["Dimensional Infiltrator", "copy of Dimensional Infiltrator"]);
  });

  it("copies my other triggered ability on the stack", () => {
    const b = board([whisperer()]);
    let s = run(b.s, planCast(b.s, b.ap, b.inf));
    // Beast Whisperer's trigger and Ulalek's, Ulalek's on top.
    expect(names(s)).toEqual(["Dimensional Infiltrator", "Beast Whisperer", "Ulalek, Fused Atrocity"]);
    putOnBattlefield(s, b.ap, solRing());
    s = top(s);
    s = pay(s, b.ap);
    expect(s.pending).toBeFalsy();
    expect(names(s)).toEqual(["Dimensional Infiltrator", "Beast Whisperer", "copy of Dimensional Infiltrator", "copy of Beast Whisperer"]);
    const hand = s.players[b.ap]!.hand.length;
    s = settleFor(s, [b.ap]);
    expect(s.players[b.ap]!.hand.length).toBe(hand + 2);
  });

  it("a bot pays and answers", () => {
    const b = board();
    let s = run(b.s, planCast(b.s, b.ap, b.bo, [player(b.opp)]));
    s = run(s, planCast(s, b.ap, b.inf));
    putOnBattlefield(s, b.ap, solRing());
    s = top(s);
    expect(botActions(s, b.ap).at(-1)).toEqual({ type: "chooseMay", player: b.ap, yes: true });
    s = settleFor(s, []);
    expect(s.pending).toBeFalsy();
    expect(s.stack).toHaveLength(0);
    expect(s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]?.name === "Dimensional Infiltrator")).toHaveLength(2);
  });
});
