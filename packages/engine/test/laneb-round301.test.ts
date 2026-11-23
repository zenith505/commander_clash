// Lane B round B301: Codie, Ravenous Codex's "Whenever you cast a prepared spell, copy it. You may choose new targets for the
// copy." (CR 722.3c-d, 707.10, 707.10c): "a prepared spell" is a spell cast as a prepare spell, the copy of a prepared
// permanent's prepare spell its controller casts from exile, the only way a prepare spell is cast (CR 722.3); a preparation
// card cast from a hand has only its normal characteristics (CR 722.4) and isn't one. The copy Codie makes isn't cast, so it
// doesn't trigger Codie again. "{W}{U}{B}{R}{G}, {T}: Each creature you control becomes prepared." (CR 722.3a).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { botActions, characteristics, defOf, exilePlayable, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";
import { becomePrepared } from "../src/prepare";

// Real card data (Scryfall).
const codie = (): CardDef => ({"oracleId":"a17e414c-8de0-47fd-bcbc-540c7fec7642","name":"Codie, Ravenous Codex","manaCost":"{3}","cmc":3,"typeLine":"Legendary Artifact Creature — Book Construct","supertypes":["Legendary"],"types":["Artifact","Creature"],"subtypes":["Book","Construct"],"oracleText":"Whenever you cast a prepared spell, copy it. You may choose new targets for the copy.\n{W}{U}{B}{R}{G}, {T}: Each creature you control becomes prepared. (Only creatures with prepare spells can become prepared.)","power":"1","toughness":"4","colors":[],"colorIdentity":["B","G","R","U","W"],"keywords":["Prepared"],"imageUrl":"https://cards.scryfall.io/normal/front/c/3/c3192390-1518-49fc-8716-f2c7a0384f39.jpg?1789646811","artUrl":"https://cards.scryfall.io/art_crop/front/c/3/c3192390-1518-49fc-8716-f2c7a0384f39.jpg?1789646811","commanderLegal":"legal","set":"fra","releasedAt":"2026-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const eater = (): CardDef => ({"oracleId":"02125db4-4507-467a-ac0c-406de2c7d533","name":"Adventurous Eater // Have a Bite","manaCost":"{2}{B} // {B}","cmc":3,"typeLine":"Creature — Human Warlock // Sorcery","supertypes":[],"types":["Creature"],"subtypes":["Human","Warlock"],"oracleText":"This creature enters prepared. (While it's prepared, you may cast a copy of its spell. Doing so unprepares it.)","power":"3","toughness":"2","colors":["B"],"colorIdentity":["B"],"keywords":["Prepared"],"imageUrl":"https://cards.scryfall.io/normal/front/d/4/d40cc7da-c731-418e-8547-7033d1939450.jpg?1783903685","artUrl":"https://cards.scryfall.io/art_crop/front/d/4/d40cc7da-c731-418e-8547-7033d1939450.jpg?1783903685","commanderLegal":"legal","set":"sos","releasedAt":"2026-04-24","rarity":"common","layout":"prepare","gameChanger":false,"faces":[{"name":"Adventurous Eater","manaCost":"{2}{B}","typeLine":"Creature — Human Warlock","supertypes":[],"types":["Creature"],"subtypes":["Human","Warlock"],"oracleText":"This creature enters prepared. (While it's prepared, you may cast a copy of its spell. Doing so unprepares it.)","power":"3","toughness":"2","colors":["B"]},{"name":"Have a Bite","manaCost":"{B}","typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Put a +1/+1 counter on target creature. You gain 1 life.","colors":["B"]}]}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const bear = card("Grizzly Bears", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" });
const wastes = (c: string) => card(`${c} Test Land`, "Land", "", { oracleText: `{T}: Add {${c}}.` });

const o = (s: GameState, id: ObjectId) => s.objects[id]!;
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Passes priority (bots answering any choice) until the stack and the trigger queue are empty. */
const settle = (s: GameState, keep?: (s: GameState) => boolean) => {
  for (let i = 0; i < 120 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (keep?.(s)) return s;
    if (s.pending) for (const a of botActions(s, s.pending.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const plusOnes = (s: GameState, id: ObjectId) => o(s, id).counters["+1/+1"] ?? 0;
const copyOf = (s: GameState, id: ObjectId) => o(s, id).prepared?.copy;
/** Removes `pid`'s lands. */
const noLands = (s: GameState, pid: PlayerId) => {
  for (const id of s.battlefield.filter((x) => o(s, x).controller === pid && characteristics(s, o(s, x)).types.includes("Land"))) {
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    o(s, id).zone = "exile";
    s.players[pid]!.exile.push(id);
  }
  invalidateCharacteristics(s);
};
const inHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  o(s, id).zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
const triggered = (s: GameState) => s.log.filter((l) => l.text.startsWith("Codie, Ravenous Codex's ability triggers")).length;

describe("round B301: Codie, Ravenous Codex", () => {
  it("compiles fully", () => {
    expect(isFullySupported(codie())).toBe(true);
    expect(isFullySupported(eater())).toBe(true);
  });

  it("copies Have a Bite cast from a prepared Adventurous Eater's copy in exile: two counters and 2 life", () => {
    const { s: s0, ap } = setup([]);
    noLands(s0, ap);
    putOnBattlefield(s0, ap, codie());
    const e = putOnBattlefield(s0, ap, eater());
    putOnBattlefield(s0, ap, wastes("B"));
    expect(becomePrepared(s0, o(s0, e))).toBe(true);
    const c = copyOf(s0, e)!;
    expect(defOf(s0, o(s0, c)).name).toBe("Have a Bite");
    expect(exilePlayable(s0, ap)).toContain(c);
    const life = s0.players[ap]!.life;
    let s = run(s0, planCast(s0, ap, c, [target(e)]));
    expect(triggered(s)).toBe(1);
    s = settle(s);
    expect(plusOnes(s, e)).toBe(2);
    expect(s.players[ap]!.life).toBe(life + 2);
    // Codie's copy wasn't cast, so it didn't trigger Codie again (CR 707.10).
    expect(triggered(s)).toBe(1);
  });

  it("you may choose new targets for the copy (CR 707.10c)", () => {
    const { s: s0, ap } = setup([]);
    noLands(s0, ap);
    putOnBattlefield(s0, ap, codie());
    const e = putOnBattlefield(s0, ap, eater());
    const b = putOnBattlefield(s0, ap, bear);
    putOnBattlefield(s0, ap, wastes("B"));
    becomePrepared(s0, o(s0, e));
    let s = run(s0, planCast(s0, ap, copyOf(s0, e)!, [target(e)]));
    s = settle(s, (x) => x.pending?.kind === "copyTargets");
    expect(s.pending).toMatchObject({ kind: "copyTargets", player: ap });
    s = act(s, { type: "copyTargets", player: ap, targets: [target(b)] });
    s = settle(s);
    expect(plusOnes(s, e)).toBe(1);
    expect(plusOnes(s, b)).toBe(1);
  });

  it("doesn't trigger on a preparation card cast from a hand, an ordinary spell, or an opponent's prepared spell", () => {
    const { s: s0, ap, opp } = setup([]);
    noLands(s0, ap);
    putOnBattlefield(s0, ap, codie());
    for (let i = 0; i < 4; i++) putOnBattlefield(s0, ap, wastes("B"));
    putOnBattlefield(s0, ap, wastes("R"));
    const h = inHand(s0, ap, eater());
    const bo = inHand(s0, ap, bolt());
    // Adventurous Eater from the hand is a creature spell with its normal characteristics (CR 722.4).
    let s = settle(run(s0, planCast(s0, ap, h)));
    expect(o(s, h).zone).toBe("battlefield");
    expect(triggered(s)).toBe(0);
    s = settle(run(s, planCast(s, ap, bo, [{ kind: "player", id: opp }])));
    expect(triggered(s)).toBe(0);
    // The Eater entered prepared: its copy is a prepared spell, cast now (sorcery timing, main phase, empty stack).
    s = run(s, planCast(s, ap, copyOf(s, h)!, [target(h)]));
    expect(triggered(s)).toBe(1);
    s = settle(s);
    expect(plusOnes(s, h)).toBe(2);
  });

  it("an opponent's prepared spell doesn't trigger it (\"you cast\")", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, codie());
    const e = putOnBattlefield(s0, opp, eater());
    putOnBattlefield(s0, opp, wastes("B"));
    let s = passUntil(s0, "main1", opp);
    becomePrepared(s, o(s, e));
    const c = copyOf(s, e)!;
    expect(exilePlayable(s, ap)).not.toContain(c);
    s = run(s, planCast(s, opp, c, [target(e)]));
    expect(o(s, e).prepared).toBeUndefined();
    s = settle(s);
    expect(triggered(s)).toBe(0);
    expect(plusOnes(s, e)).toBe(1);
  });

  it("{W}{U}{B}{R}{G}, {T}: each creature you control with a prepare spell becomes prepared, each one copy only", () => {
    const { s: s0, ap } = setup([]);
    noLands(s0, ap);
    const cd = putOnBattlefield(s0, ap, codie());
    const e1 = putOnBattlefield(s0, ap, eater());
    const e2 = putOnBattlefield(s0, ap, eater());
    const b = putOnBattlefield(s0, ap, bear);
    for (const c of ["W", "U", "B", "R", "G"]) putOnBattlefield(s0, ap, wastes(c));
    becomePrepared(s0, o(s0, e2));
    const before = copyOf(s0, e2);
    let s = settle(run(s0, planActivate(s0, ap, cd, 0)));
    expect(o(s, cd).tapped).toBe(true);
    expect(o(s, e1).prepared).toBeDefined();
    expect(copyOf(s, e2)).toBe(before);
    expect(o(s, b).prepared).toBeUndefined();
    expect(s.players[ap]!.exile.filter((id) => o(s, id).preparedFrom).length).toBe(2);
  });
});
