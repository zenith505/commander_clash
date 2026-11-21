// Round 436 (Lane A): Terra, Magical Adept // Esper Terra (a Saga back face: token copies of enchantments with haste, "If
// it's a Saga, put up to three lore counters on it", CR 714.2c, 714.4; chapter IV's ten mana, then exiled and returned
// front face up, CR 712.14a).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, isFullySupported, planActivate, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real card data (Scryfall).
const terra = (): CardDef => ({"oracleId":"54ca5904-9099-497a-9684-101656025487","name":"Terra, Magical Adept // Esper Terra","manaCost":"{1}{R}{G}","cmc":3,"typeLine":"Legendary Creature — Human Wizard Warrior // Legendary Enchantment Creature — Saga Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Wizard","Warrior"],"oracleText":"When Terra enters, mill five cards. Put up to one enchantment card milled this way into your hand.\nTrance — {4}{R}{G}, {T}: Exile Terra, then return it to the battlefield transformed under its owner's control. Activate only as a sorcery.","power":"4","toughness":"2","colors":["G","R"],"colorIdentity":["B","G","R","U","W"],"keywords":["Flying","Transform","Mill","Trance"],"producedMana":["B","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/f/b/fbd447aa-588d-4c4d-925e-a7d3bdf6a65c.jpg?1783906567","artUrl":"https://cards.scryfall.io/art_crop/front/f/b/fbd447aa-588d-4c4d-925e-a7d3bdf6a65c.jpg?1783906567","commanderLegal":"legal","set":"fin","releasedAt":"2025-06-13","rarity":"mythic","layout":"transform","gameChanger":false,"faces":[{"name":"Terra, Magical Adept","manaCost":"{1}{R}{G}","typeLine":"Legendary Creature — Human Wizard Warrior","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Wizard","Warrior"],"oracleText":"When Terra enters, mill five cards. Put up to one enchantment card milled this way into your hand.\nTrance — {4}{R}{G}, {T}: Exile Terra, then return it to the battlefield transformed under its owner's control. Activate only as a sorcery.","power":"4","toughness":"2","colors":["G","R"],"imageUrl":"https://cards.scryfall.io/normal/front/f/b/fbd447aa-588d-4c4d-925e-a7d3bdf6a65c.jpg?1783906567","artUrl":"https://cards.scryfall.io/art_crop/front/f/b/fbd447aa-588d-4c4d-925e-a7d3bdf6a65c.jpg?1783906567"},{"name":"Esper Terra","manaCost":"","typeLine":"Legendary Enchantment Creature — Saga Wizard","supertypes":["Legendary"],"types":["Enchantment","Creature"],"subtypes":["Saga","Wizard"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter.)\nI, II, III — Create a token that's a copy of target nonlegendary enchantment you control. It gains haste. If it's a Saga, put up to three lore counters on it. Sacrifice it at the beginning of your next end step.\nIV — Add {W}{W}, {U}{U}, {B}{B}, {R}{R}, and {G}{G}. Exile Esper Terra, then return it to the battlefield (front face up).\nFlying","power":"6","toughness":"6","colors":["G","R"],"colorIndicator":["G","R"],"imageUrl":"https://cards.scryfall.io/normal/back/f/b/fbd447aa-588d-4c4d-925e-a7d3bdf6a65c.jpg?1783906567","artUrl":"https://cards.scryfall.io/art_crop/back/f/b/fbd447aa-588d-4c4d-925e-a7d3bdf6a65c.jpg?1783906567"}]} as CardDef);
const benalia = (): CardDef => ({"oracleId":"c15bb7eb-aaaa-4468-9641-8f706d6137e8","name":"History of Benalia","manaCost":"{1}{W}{W}","cmc":3,"typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI, II — Create a 2/2 white Knight creature token with vigilance.\nIII — Knights you control get +2/+1 until end of turn.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/1/d134385d-b01c-41c7-bb2d-30722b44dc5a.jpg?1783935041","artUrl":"https://cards.scryfall.io/art_crop/front/d/1/d134385d-b01c-41c7-bb2d-30722b44dc5a.jpg?1783935041","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"mythic","layout":"saga","gameChanger":false} as CardDef);
const virtue = (): CardDef => ({"oracleId":"d21c3c8f-d105-4ba9-bf69-e5f26f0f8ec5","name":"Intangible Virtue","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Creature tokens you control get +1/+1 and have vigilance.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/0/805c99f1-ab4d-4072-a8b7-7e2818adbc97.jpg?1783912369","artUrl":"https://cards.scryfall.io/art_crop/front/8/0/805c99f1-ab4d-4072-a8b7-7e2818adbc97.jpg?1783912369","commanderLegal":"legal","set":"pip","releasedAt":"2024-03-08","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; other players' questions as the bots would. Stops at any question of `me`'s. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) s = run(s, botActions(s, p.player));
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Everyone passes (no attacks, no blocks; a bot answers anything else) until `done` holds. */
const passTill = (s: GameState, done: (s: GameState) => boolean) => {
  for (let i = 0; i < 4000 && !done(s); i++) {
    const pid = waitingOn(s)!;
    if (s.pending?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (s.pending?.kind === "discardToHandSize") s = act(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, s.pending.count) });
    else if (s.pending) s = run(s, botActions(s, pid));
    else s = act(s, { type: "passPriority", player: pid });
  }
  if (!done(s)) throw new Error("never got there");
  return s;
};
const ch = (s: GameState, id: ObjectId) => characteristics(s, s.objects[id]!);
const tokensNamed = (s: GameState, name: string) => s.battlefield.filter((id) => s.objects[id]!.isToken && ch(s, id).name === name);

/** Terra on the battlefield and its Trance activated: Esper Terra's chapter I asks for its target. */
const trance = (extra: CardDef[]) => {
  const { s: s0, ap } = setup([]);
  let s = s0;
  const others = extra.map((d) => putOnBattlefield(s, ap, d));
  const t = putOnBattlefield(s, ap, terra());
  s = settle(run(s, planActivate(s, ap, t, 0)), ap);
  return { s, ap, t, others };
};

describe("Terra, Magical Adept // Esper Terra", () => {
  it("is fully supported", () => {
    expect(isFullySupported(terra())).toBe(true);
  });

  it("chapter I copies a Saga: the token gets its lore counter, then up to three more, and each chapter they reach triggers", () => {
    let { s, ap, t, others } = trance([benalia()]);
    const [hist] = others;
    // Exiled and returned transformed: Esper Terra, a 6/6 flying Saga creature with its first lore counter (CR 714.3a).
    expect(ch(s, t).name).toBe("Esper Terra");
    expect(ch(s, t).power).toBe(6);
    expect(ch(s, t).keywords).toContain("Flying");
    expect(s.objects[t]!.counters.lore).toBe(1);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: hist! }] }), ap);
    // The token is a Saga: how many lore counters (0 to 3).
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "number", numberRange: { min: 0, max: 3 } });
    const [copy] = tokensNamed(s, "History of Benalia");
    expect(copy).toBeDefined();
    expect(s.objects[copy!]!.counters.lore).toBe(1);
    expect(ch(s, copy!).keywords).toContain("Haste");
    s = act(s, { type: "chooseOption", player: ap, choice: "2" });
    expect(s.objects[copy!]!.counters.lore).toBe(3);
    s = settle(s, ap);
    // Chapter I (as it entered) and II made a Knight each; chapter III pumped them; then the token was sacrificed (CR 714.4).
    expect(tokensNamed(s, "Knight Token")).toHaveLength(2);
    expect(s.objects[copy!]?.zone ?? "gone").not.toBe("battlefield");
    expect(s.objects[hist!]!.zone).toBe("battlefield");
  });

  it("a non-Saga copy gains haste with no question and is sacrificed at your next end step; with 0 chosen a Saga token keeps only its own lore counter", () => {
    let { s, ap, t, others } = trance([benalia(), virtue()]);
    const [hist, virt] = others;
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: virt! }] }), ap);
    expect(s.pending ?? null).toBeNull();
    const [copy] = tokensNamed(s, "Intangible Virtue");
    expect(ch(s, copy!).keywords).toContain("Haste");
    s = passTill(s, (x) => x.step === "cleanup" && x.activePlayer === ap);
    expect(tokensNamed(s, "Intangible Virtue")).toHaveLength(0);
    expect(s.objects[virt!]!.zone).toBe("battlefield");
    // Chapter II after the next draw step: History of Benalia this time, and no more lore counters on its copy.
    s = passTill(s, (x) => x.step === "main1" && x.activePlayer === ap && (x.pending?.kind === "chooseTargets" || !!x.stack.length));
    expect(s.objects[t]!.counters.lore).toBe(2);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: hist! }] }), ap);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "number" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "0" }), ap);
    const [saga] = tokensNamed(s, "History of Benalia");
    expect(s.objects[saga!]!.counters.lore).toBe(1);
    // One Knight from the copy's chapter I, one from the original's (its own lore counter after the draw step).
    expect(tokensNamed(s, "Knight Token")).toHaveLength(2);
    expect(s.objects[hist!]!.counters.lore).toBe(1);
  });

  it("chapter IV adds WWUUBBRRGG and returns it front face up, a new object whose enters trigger mills five", () => {
    let { s, ap, t } = trance([]);
    // No nonlegendary enchantment: chapter I has no target and is removed (CR 603.3d).
    expect(s.pending ?? null).toBeNull();
    s.objects[t]!.counters.lore = 3;
    const zc = s.objects[t]!.zoneChanges ?? 0;
    s = passTill(s, (x) => x.turn > s.turn && x.step === "main1" && x.activePlayer === ap && !!x.stack.length);
    const turn = s.turn;
    s = settle(s, ap);
    expect(s.turn).toBe(turn);
    expect(s.players[ap]!.manaPool).toMatchObject({ W: 2, U: 2, B: 2, R: 2, G: 2 });
    expect(s.objects[t]!.zone).toBe("battlefield");
    expect(s.objects[t]!.zoneChanges ?? 0).toBeGreaterThan(zc);
    expect(ch(s, t).name).toBe("Terra, Magical Adept");
    expect(s.objects[t]!.counters.lore ?? 0).toBe(0);
    expect(s.log.some((l) => /mills 5 cards/.test(l.text))).toBe(true);
  });

  it("a bot puts all three lore counters on its Saga token", () => {
    let { s, ap, others } = trance([benalia()]);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: others[0]! }] }), ap);
    expect(botActions(s, ap)).toEqual([{ type: "chooseOption", player: ap, choice: "3" }]);
  });
});
