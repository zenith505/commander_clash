// Lane B round B281: Drain Power ("Target player activates a mana ability of each land they control. Then that player loses
// all unspent mana and you add the mana lost this way."; CR 106.13, 605.3a and its rulings).

import { describe, expect, it } from "vitest";
import { act, forest, island, putOnBattlefield, setup } from "./helpers";
import { botActions, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const drain = (): CardDef => ({"oracleId":"0669172d-396b-4f5a-9703-129c5c849b55","name":"Drain Power","manaCost":"{U}{U}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target player activates a mana ability of each land they control. Then that player loses all unspent mana and you add the mana lost this way.","colors":["U"],"colorIdentity":["U"],"keywords":[],"producedMana":["B","G","R","U","W"],"layout":"normal"}) as CardDef;
const tundra = (): CardDef => ({"oracleId":"02418479-9455-417f-a6a1-004356faff37","name":"Tundra","manaCost":"","cmc":0,"typeLine":"Land — Plains Island","supertypes":[],"types":["Land"],"subtypes":["Plains","Island"],"oracleText":"({T}: Add {W} or {U}.)","colors":[],"colorIdentity":["U","W"],"keywords":[],"producedMana":["U","W"],"layout":"normal"}) as CardDef;
const forge = (): CardDef => ({"oracleId":"6b75b94e-83b7-457e-ac41-7ca90b5a59aa","name":"Battlefield Forge","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{T}: Add {R} or {W}. This land deals 1 damage to you.","colors":[],"colorIdentity":["R","W"],"keywords":[],"producedMana":["C","R","W"],"layout":"normal"}) as CardDef;
const catacombs = (): CardDef => ({"oracleId":"4869a530-757f-4364-8d8e-4dc8001f433c","name":"Darkwater Catacombs","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"{1}, {T}: Add {U}{B}.","colors":[],"colorIdentity":["B","U"],"keywords":[],"producedMana":["B","U"],"layout":"normal"}) as CardDef;

const ply = (id: PlayerId): TargetChoice => ({ kind: "player", id }) as TargetChoice;
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const total = (s: GameState, pid: PlayerId) => Object.values(s.players[pid]!.manaPool).reduce((a, b) => a + b, 0);
/** Drain Power in `ap`'s hand, cast at `who`. */
const castAt = (s: GameState, ap: PlayerId, who: PlayerId) => {
  const id = s.players[ap]!.hand.find((x) => s.cards[s.objects[x]!.cardId]!.name === "Drain Power")!;
  return settle(run(s, planCast(s, ap, id, [ply(who)])));
};

describe("Drain Power", () => {
  it("is supported", () => {
    expect(isFullySupported(drain())).toBe(true);
  });

  it("the target player taps each of their untapped lands for mana, then that mana and what they had is yours", () => {
    const { s: s0, ap, opp } = setup([drain()]);
    const s1 = structuredClone(s0);
    const f = putOnBattlefield(s1, opp, forest);
    const i = putOnBattlefield(s1, opp, island);
    const tapped = putOnBattlefield(s1, opp, forest);
    s1.objects[tapped]!.tapped = true;
    s1.players[opp]!.manaPool.R = 1;
    invalidateCharacteristics(s1);
    const s = castAt(s1, ap, opp);
    expect(s.pending).toBeNull();
    expect(s.objects[f]!.tapped).toBe(true);
    expect(s.objects[i]!.tapped).toBe(true);
    expect(total(s, opp)).toBe(0);
    // The Forest, the Island and the {R} they already had (Drain Power's own {U}{U} came from ap's Islands).
    expect(s.players[ap]!.manaPool.G).toBe(1);
    expect(s.players[ap]!.manaPool.U).toBe(1);
    expect(s.players[ap]!.manaPool.R).toBe(1);
    expect(s.log.some((l) => /loses \{U\}\{R\}\{G\}, and .+ adds it\.$/.test(l.text))).toBe(true);
  });

  it("a land with a choice of mana: its controller chooses (rulings)", () => {
    const { s: s0, ap, opp } = setup([drain()]);
    const s1 = structuredClone(s0);
    const t = putOnBattlefield(s1, opp, tundra());
    invalidateCharacteristics(s1);
    const s2 = castAt(s1, ap, opp);
    expect(s2.pending?.kind).toBe("chooseOption");
    const pend = s2.pending as Extract<GameState["pending"], { kind: "chooseOption" }>;
    expect(pend.what).toBe("drainLand");
    expect(pend.player).toBe(opp);
    expect(pend.about).toBe(t);
    expect(pend.labels).toEqual(["Add {W}", "Add {U}"]);
    const s = settle(act(s2, { type: "chooseOption", player: opp, choice: pend.options[1]! }));
    expect(s.objects[t]!.tapped).toBe(true);
    expect(s.players[ap]!.manaPool.U).toBe(1);
    expect(s.players[ap]!.manaPool.W).toBe(0);
  });

  it("a bot being drained picks the ability that costs it least: Battlefield Forge's {C}, no damage", () => {
    const { s: s0, ap, opp } = setup([drain()]);
    const s1 = structuredClone(s0);
    putOnBattlefield(s1, opp, forge());
    invalidateCharacteristics(s1);
    const s2 = castAt(s1, ap, opp);
    expect(s2.pending?.kind).toBe("chooseOption");
    const life = s2.players[opp]!.life;
    const s = settle(run(s2, botActions(s2, opp)));
    expect(s.players[ap]!.manaPool.C).toBe(1);
    expect(s.players[opp]!.life).toBe(life);
  });

  it("an ability costing mana is paid from the mana the other lands made first: Darkwater Catacombs", () => {
    const { s: s0, ap, opp } = setup([drain()]);
    const s1 = structuredClone(s0);
    // The Catacombs first on the battlefield, the Forest after it: the Forest is still activated first.
    const c = putOnBattlefield(s1, opp, catacombs());
    const f = putOnBattlefield(s1, opp, forest);
    invalidateCharacteristics(s1);
    const s = castAt(s1, ap, opp);
    expect(s.pending).toBeNull();
    expect(s.objects[c]!.tapped).toBe(true);
    expect(s.objects[f]!.tapped).toBe(true);
    // {G} paid the Catacombs' {1}: {U}{B} is what's left.
    expect(s.players[ap]!.manaPool.U).toBe(1);
    expect(s.players[ap]!.manaPool.B).toBe(1);
    expect(s.players[ap]!.manaPool.G).toBe(0);
  });

  it("targeting yourself: your lands are tapped and the mana stays yours", () => {
    const { s: s0, ap } = setup([drain()]);
    const s1 = structuredClone(s0);
    const s = castAt(s1, ap, ap);
    expect(s.pending).toBeNull();
    const lands = s.battlefield.filter((id) => s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.types.includes("Land"));
    expect(lands.every((id) => s.objects[id]!.tapped)).toBe(true);
    // 14 lands, two of them paid for Drain Power.
    expect(total(s, ap)).toBe(12);
  });

  it("a bot casts it at the opponent whose lands make the most mana", () => {
    const { s: s0, ap } = setup([drain()]);
    const s1 = structuredClone(s0);
    const order = s1.turnOrder;
    const rich = order[(order.indexOf(ap) + 2) % 4]!;
    const poor = order[(order.indexOf(ap) + 1) % 4]!;
    for (let k = 0; k < 3; k++) putOnBattlefield(s1, rich, forest);
    putOnBattlefield(s1, poor, forest);
    s1.players[ap]!.command = [];
    // Only Drain Power in hand (setup's hands hold seven drawn cards).
    s1.players[ap]!.hand = s1.players[ap]!.hand.filter((x) => s1.cards[s1.objects[x]!.cardId]!.name === "Drain Power");
    invalidateCharacteristics(s1);
    const acts = botActions(s1, ap);
    const castIt = acts.find((a) => a.type === "castSpell" && s1.cards[s1.objects[a.objectId]!.cardId]!.name === "Drain Power");
    expect(castIt && castIt.type === "castSpell" ? castIt.targets : undefined).toEqual([ply(rich)]);
  });
});
