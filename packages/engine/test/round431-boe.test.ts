// Round 431: The Face of Boe ("{T}: You may cast a spell with suspend from your hand. If you do, pay its suspend cost rather
// than its mana cost. Activate only as a sorcery.").
import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { botActions, castProblem, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const boe = (): CardDef => ({"oracleId":"acef7666-53b1-43c5-8107-236bea22a8b3","name":"The Face of Boe","manaCost":"{1}{U}{R}{W}","cmc":4,"typeLine":"Legendary Creature — Alien Advisor","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Alien","Advisor"],"oracleText":"{T}: You may cast a spell with suspend from your hand. If you do, pay its suspend cost rather than its mana cost. Activate only as a sorcery.","power":"0","toughness":"4","colors":["R","U","W"],"colorIdentity":["R","U","W"],"keywords":[],"layout":"normal"}) as CardDef;
const riftBolt = (): CardDef => ({"oracleId":"2b8afa9f-4236-4c02-a8d5-3c145caecfd6","name":"Rift Bolt","manaCost":"{2}{R}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Rift Bolt deals 3 damage to any target.\nSuspend 1—{R} (Rather than cast this card from your hand, you may pay {R} and exile it with a time counter on it. At the beginning of your upkeep, remove a time counter. When the last is removed, you may cast it without paying its mana cost.)","colors":["R"],"colorIdentity":["R"],"keywords":["Suspend"],"layout":"normal"}) as CardDef;
const vision = (): CardDef => ({"oracleId":"9728dec9-d482-4c7a-8cdc-44d010dc878d","name":"Ancestral Vision","manaCost":"","cmc":0,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Suspend 4—{U} (Rather than cast this card from your hand, pay {U} and exile it with four time counters on it. At the beginning of your upkeep, remove a time counter. When the last is removed, you may cast it without paying its mana cost.)\nTarget player draws three cards.","colors":["U"],"colorIdentity":["U"],"keywords":["Suspend"],"layout":"normal"}) as CardDef;
const chronicler = (): CardDef => ({"oracleId":"a1399cb8-f22a-487e-b539-2db47b09a790","name":"Aeon Chronicler","manaCost":"{3}{U}{U}","cmc":5,"typeLine":"Creature — Avatar","supertypes":[],"types":["Creature"],"subtypes":["Avatar"],"oracleText":"Aeon Chronicler's power and toughness are each equal to the number of cards in your hand.\nSuspend X—{X}{3}{U}. X can't be 0.\nWhenever a time counter is removed from this card while it's exiled, draw a card.","power":"*","toughness":"*","colors":["U"],"colorIdentity":["U"],"keywords":["Suspend"],"layout":"normal"}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"layout":"normal"}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty or `me` is asked something; bots answer the others. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const untapped = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && !s.objects[id]!.tapped).length;
/** `ap` controls The Face of Boe with Rift Bolt, Ancestral Vision, Aeon Chronicler, Grizzly Bears and a Bolt in hand; it's activated. */
const activated = () => {
  const { s: s0, ap, opp, ids } = setup([riftBolt(), vision(), chronicler(), bears(), bolt()]);
  const b = putOnBattlefield(s0, ap, boe());
  const [rift, vis, chron, bear, lb] = ids as [ObjectId, ObjectId, ObjectId, ObjectId, ObjectId];
  const s = settle(run(s0, planActivate(s0, ap, b, 0)), ap);
  return { s, ap, opp, b, rift, vis, chron, bear, lb };
};

describe("round 431: The Face of Boe", () => {
  it("is fully supported", () => {
    expect(isFullySupported(boe())).toBe(true);
  });

  it("offers only the cards in hand with suspend, then casts Rift Bolt for its suspend cost {R}", () => {
    const { s: s1, ap, opp, b, rift, vis, chron } = activated();
    let s = s1;
    expect(s.objects[b]!.tapped).toBe(true);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong" });
    const options = s.pending?.kind === "chooseOption" ? s.pending.options : [];
    expect([...options].sort()).toEqual([rift, vis, chron, "none"].sort());
    s = act(s, { type: "chooseOption", player: ap, choice: rift });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: rift, how: "paid", pay: { kind: "mana", mana: "{R}", suspend: true } });
    const before = untapped(s, ap);
    const life = s.players[opp]!.life;
    s = run(s, planCast(s, ap, rift, [{ kind: "player", id: opp }]));
    // One land paid {R}, not Rift Bolt's {2}{R}.
    expect(untapped(s, ap)).toBe(before - 1);
    expect(s.log.some((l) => /casts Rift Bolt by paying its suspend cost \{R\} rather than paying its mana cost/.test(l.text))).toBe(true);
    s = settle(s, ap);
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(zone(s, rift)).toBe("graveyard");
    // Cast, not suspended: no time counters anywhere, nothing in exile.
    expect(s.players[ap]!.exile).not.toContain(rift);
  });

  it("casts Ancestral Vision, which has no mana cost, for {U} (an alternative cost, CR 118.6, 118.9)", () => {
    const { s: s1, ap, vis } = activated();
    let s = act(s1, { type: "chooseOption", player: ap, choice: vis });
    const hand = s.players[ap]!.hand.length;
    s = run(s, planCast(s, ap, vis, [{ kind: "player", id: ap }]));
    s = settle(s, ap);
    expect(zone(s, vis)).toBe("graveyard");
    // Ancestral Vision left the hand, then three cards were drawn.
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 3);
  });

  it("Aeon Chronicler's suspend cost {X}{3}{U}: X can't be 0; with X = 2 it costs six", () => {
    const { s: s1, ap, chron } = activated();
    let s = act(s1, { type: "chooseOption", player: ap, choice: chron });
    expect(castProblem(s, ap, chron, undefined, undefined, undefined, undefined, 0)).toBe("X can't be 0");
    const before = untapped(s, ap);
    s = run(s, planCast(s, ap, chron, undefined, undefined, undefined, 2));
    expect(untapped(s, ap)).toBe(before - 6);
    s = settle(s, ap);
    expect(zone(s, chron)).toBe("battlefield");
  });

  it("declined, nothing is cast and the cards stay in hand", () => {
    const { s: s1, ap, rift, vis, chron } = activated();
    const s = settle(act(s1, { type: "chooseOption", player: ap, choice: "none" }), ap);
    for (const id of [rift, vis, chron]) expect(zone(s, id)).toBe("hand");
    expect(s.pending).toBeNull();
  });

  it("only as a sorcery: not with something on the stack", () => {
    const { s: s0, ap } = setup([riftBolt()]);
    const b = putOnBattlefield(s0, ap, boe());
    expect(planActivate(s0, ap, b, 0)).not.toBeNull();
    const s = run(s0, planActivate(s0, ap, b, 0));
    // The ability is on the stack: a second activation (were it untapped) couldn't happen now.
    s.objects[b]!.tapped = false;
    expect(planActivate(s, ap, b, 0)).toBeNull();
  });

  it("a bot asked picks a card it can cast and casts it for its suspend cost", () => {
    const { s: s1, ap, rift, vis, chron } = activated();
    let s = s1;
    for (let i = 0; i < 20 && s.pending?.player === ap; i++) for (const a of botActions(s, ap)) s = act(s, a);
    s = settle(s);
    expect([rift, vis, chron].some((id) => zone(s, id) !== "hand")).toBe(true);
    expect(s.log.some((l) => /by paying its suspend cost/.test(l.text))).toBe(true);
  });
});
