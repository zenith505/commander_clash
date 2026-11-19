// Round 418 (Lane A): Surge to Victory ("Exile target instant or sorcery card from your graveyard. Creatures you control
// get +X/+0 until end of turn, where X is that card's mana value. Whenever a creature you control deals combat damage to
// a player this turn, copy the exiled card. You may cast the copy without paying its mana cost.", CR 603.7b, 707.12) and
// Gale, Waterdeep Prodigy ("Whenever you cast an instant or sorcery spell from your hand, you may cast up to one target
// card of the other type from your graveyard. If a spell cast from your graveyard this way would be put into your
// graveyard, exile it instead.") and Zethi, Arcane Blademaster ("When Zethi enters, exile up to X target instant cards from
// your graveyard, where X is the number of times Zethi was kicked. Put a kick counter on each of them." and "Whenever Zethi
// attacks, copy each exiled card you own with a kick counter on it. You may cast the copies.").

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, isFullySupported, planCast, power, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";
import { moveObject } from "../src/game";

// Real card data (Scryfall).
const surge = (): CardDef => ({"oracleId":"8ea414c1-88cf-46d4-9a54-6dee9847c537","name":"Surge to Victory","manaCost":"{4}{R}{R}","cmc":6,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Exile target instant or sorcery card from your graveyard. Creatures you control get +X/+0 until end of turn, where X is that card's mana value. Whenever a creature you control deals combat damage to a player this turn, copy the exiled card. You may cast the copy without paying its mana cost.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/f/0f02698f-d954-42e0-b4d6-9daf65f29e36.jpg?1783927590","artUrl":"https://cards.scryfall.io/art_crop/front/0/f/0f02698f-d954-42e0-b4d6-9daf65f29e36.jpg?1783927590","commanderLegal":"legal","set":"c21","releasedAt":"2021-04-23","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const gale = (): CardDef => ({"oracleId":"cca15007-2faf-4696-a4c5-2d7b6c1ec5b5","name":"Gale, Waterdeep Prodigy","manaCost":"{2}{U}","cmc":3,"typeLine":"Legendary Creature — Human Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"Whenever you cast an instant or sorcery spell from your hand, you may cast up to one target card of the other type from your graveyard. If a spell cast from your graveyard this way would be put into your graveyard, exile it instead.\nChoose a Background (You can have a Background as a second commander.)","power":"1","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Choose a background"],"imageUrl":"https://cards.scryfall.io/normal/front/7/5/75cd3224-c392-4c33-aa7b-d2e7041c0d89.jpg?1783922644","artUrl":"https://cards.scryfall.io/art_crop/front/7/5/75cd3224-c392-4c33-aa7b-d2e7041c0d89.jpg?1783922644","commanderLegal":"legal","set":"clb","releasedAt":"2022-06-10","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const opt = (): CardDef => ({"oracleId":"713332c1-5bd8-400f-bfff-c1ca0697a043","name":"Opt","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card.","colors":["U"],"colorIdentity":["U"],"keywords":["Scry"],"imageUrl":"https://cards.scryfall.io/normal/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","artUrl":"https://cards.scryfall.io/art_crop/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","commanderLegal":"legal","set":"sld","releasedAt":"2025-07-25","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);

const zethi = (): CardDef => ({"oracleId":"ac136d46-32b7-4222-a840-b8be011c1872","name":"Zethi, Arcane Blademaster","manaCost":"{1}{W}{U}","cmc":3,"typeLine":"Legendary Creature — Human Soldier","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Soldier"],"oracleText":"Multikicker {W/U}\nWhen Zethi, Arcane Blademaster enters, exile up to X target instant cards from your graveyard, where X is the number of times Zethi was kicked. Put a kick counter on each of them.\nWhenever Zethi attacks, copy each exiled card you own with a kick counter on it. You may cast the copies.","power":"3","toughness":"3","colors":["U","W"],"colorIdentity":["U","W"],"keywords":["Multikicker"],"imageUrl":"https://cards.scryfall.io/normal/front/8/7/87b56584-8a61-40bc-99b5-7434a681fcdc.jpg?1783917773","artUrl":"https://cards.scryfall.io/art_crop/front/8/7/87b56584-8a61-40bc-99b5-7434a681fcdc.jpg?1783917773","commanderLegal":"legal","set":"slx","releasedAt":"2023-02-10","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);

/** A plain instant (Opt's scry would stop to ask). */
const quick = () => card("Test Quick", "Instant", "{U}", { oracleText: "Draw a card." });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Passes priority (no blocks) until `done`. */
const until = (s: GameState, done: (s: GameState) => boolean, max = 400) => {
  for (let i = 0; i < max; i++) {
    if (done(s)) return s;
    const pid = waitingOn(s)!;
    if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (s.pending?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (s.pending?.kind === "discardToHandSize") s = act(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, s.pending.count) });
    else s = act(s, { type: "passPriority", player: pid });
  }
  throw new Error("never got there");
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const none = { kind: "none" } as TargetChoice;
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
const inYard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  moveObject(s, id, "graveyard");
  return id;
};
const settled = (x: GameState) => !x.stack.length && !x.pending && !x.triggerQueue.length;

describe("round 418", () => {
  it("every card of the round compiles fully", () => supported(surge(), gale(), zethi()));
});

describe("Surge to Victory", () => {
  /** Surge to Victory cast on Divination in your graveyard, with two Grizzly Bears to attack with. */
  const surged = () => {
    const { s: s0, ap, opp, ids } = setup([surge()]);
    const div = inYard(s0, ap, divination());
    const [b1, b2] = [putOnBattlefield(s0, ap, bear()), putOnBattlefield(s0, ap, bear())];
    const s = until(run(s0, planCast(s0, ap, ids[0]!, [tgt(div)])), settled);
    return { s, ap, opp, div, b1, b2, surge: ids[0]! };
  };

  it("exiles the card, creatures you control get +X/+0 for its mana value, and each combat damage to a player copies it to cast free", () => {
    const { s: s1, ap, opp, div, b1, b2, surge: sv } = surged();
    expect(zone(s1, div)).toBe("exile");
    expect(zone(s1, sv)).toBe("graveyard");
    expect([power(s1, s1.objects[b1]!), power(s1, s1.objects[b2]!)]).toEqual([5, 5]);
    let s = passUntil(s1, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b1, defender: opp }, { attacker: b2, defender: opp }] } as Action);
    s = until(s, (x) => x.pending?.kind === "castFree");
    expect(s.players[opp]!.life).toBe(30);
    const hand = s.players[ap]!.hand.length;
    // One trigger for each creature: the first copy of Divination, cast for free.
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap });
    const copy1 = s.pending?.kind === "castFree" ? s.pending.objectId : "";
    expect(copy1).not.toBe(div);
    expect(characteristics(s, s.objects[copy1]!).name).toBe("Divination");
    const mana = JSON.stringify(s.players[ap]!.manaPool);
    s = act(s, { type: "castSpell", player: ap, objectId: copy1 });
    expect(JSON.stringify(s.players[ap]!.manaPool)).toBe(mana);
    s = until(s, (x) => x.pending?.kind === "castFree" || settled(x));
    const copy2 = s.pending?.kind === "castFree" ? s.pending.objectId : "";
    expect(copy2).not.toBe("");
    expect(copy2).not.toBe(copy1);
    s = until(act(s, { type: "castSpell", player: ap, objectId: copy2 }), settled);
    expect(s.players[ap]!.hand.length).toBe(hand + 4);
    // The copies cease to exist (CR 704.5e); the card stays exiled.
    expect([s.objects[copy1], s.objects[copy2]]).toEqual([undefined, undefined]);
    expect(zone(s, div)).toBe("exile");
  });

  it("the copy may be declined, and it's gone; the ability ends with the turn", () => {
    const { s: s1, ap, opp, b1, div } = surged();
    let s = passUntil(s1, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b1, defender: opp }] } as Action);
    s = until(s, (x) => x.pending?.kind === "castFree");
    const copy = s.pending?.kind === "castFree" ? s.pending.objectId : "";
    const hand = s.players[ap]!.hand.length;
    s = until(act(s, { type: "chooseMay", player: ap, yes: false }), settled);
    expect(s.objects[copy]).toBeUndefined();
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(zone(s, div)).toBe("exile");
    // Its next turn: no trigger any more, and the bonus is gone.
    s = until(s, (x) => x.turn > s.turn && x.activePlayer === ap && x.step === "main1", 4000);
    expect(power(s, s.objects[b1]!)).toBe(2);
    expect(s.floatingTriggers ?? []).toEqual([]);
  });

  it("with the card gone from exile, there's nothing to copy", () => {
    const { s: s1, ap, opp, b1, div } = surged();
    moveObject(s1, div, "hand");
    let s = passUntil(s1, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b1, defender: opp }] } as Action);
    s = until(s, (x) => settled(x) && x.step === "combatDamage" || x.step === "endCombat" || x.pending?.kind === "castFree");
    expect(s.pending?.kind).not.toBe("castFree");
    expect(s.players[opp]!.life).toBe(35);
  });

  it("an instant card too: a copy of Opt", () => {
    const { s: s0, ap, opp, ids } = setup([surge()]);
    const o = inYard(s0, ap, opt());
    const b = putOnBattlefield(s0, ap, bear());
    let s = until(run(s0, planCast(s0, ap, ids[0]!, [tgt(o)])), settled);
    expect(power(s, s.objects[b]!)).toBe(3);
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] } as Action);
    s = until(s, (x) => x.pending?.kind === "castFree");
    expect(characteristics(s, s.objects[s.pending?.kind === "castFree" ? s.pending.objectId : ""]!).name).toBe("Opt");
  });

  it("needs an instant or sorcery card in your graveyard to target", () => {
    const { s: s0, ap, ids } = setup([surge()]);
    const b = inYard(s0, ap, bear());
    expect(() => run(s0, planCast(s0, ap, ids[0]!, [tgt(b)]))).toThrow();
  });
});

describe("Gale, Waterdeep Prodigy", () => {
  it("casting an instant from your hand: cast a sorcery card from your graveyard, paying for it; it's exiled after", () => {
    const { s: s0, ap, ids } = setup([quick()]);
    putOnBattlefield(s0, ap, gale());
    const div = inYard(s0, ap, divination());
    const oldOpt = inYard(s0, ap, opt());
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = until(s, (x) => x.pending?.kind === "chooseTargets" || x.pending?.kind === "castFree");
    expect(s.pending?.kind).toBe("chooseTargets");
    // Not an instant card: the other type is sorcery.
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(oldOpt)] })).toThrow();
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(div)] });
    s = until(s, (x) => x.pending?.kind === "castFree");
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: div, how: "paid" });
    s = run(s, planCast(s, ap, div));
    expect(s.stack.map((x) => x.objectId)).toEqual([ids[0], div]);
    s = until(s, settled);
    expect([zone(s, div), zone(s, ids[0]!)]).toEqual(["exile", "graveyard"]);
  });

  it("casting a sorcery: only an instant card; up to one, so none may be chosen", () => {
    const { s: s0, ap, ids } = setup([divination()]);
    putOnBattlefield(s0, ap, gale());
    const oldOpt = inYard(s0, ap, opt());
    const oldDiv = inYard(s0, ap, divination());
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = until(s, (x) => x.pending?.kind === "chooseTargets" || x.pending?.kind === "castFree");
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(oldDiv)] })).toThrow();
    const hand = s.players[ap]!.hand.length;
    s = until(act(s, { type: "chooseTargets", player: ap, targets: [none] }), settled);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect([zone(s, oldOpt), zone(s, oldDiv)]).toEqual(["graveyard", "graveyard"]);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });

  it("not for a spell cast from somewhere else, nor for a creature spell", () => {
    const { s: s0, ap, ids } = setup([bear()]);
    putOnBattlefield(s0, ap, gale());
    inYard(s0, ap, divination());
    const s = run(s0, planCast(s0, ap, ids[0]!));
    expect(s.triggerQueue.length).toBe(0);
    expect(s.pending?.kind).not.toBe("chooseTargets");
  });

  it("a bot casting an instant takes the sorcery card back", () => {
    const { s: s0, ap, ids } = setup([quick()]);
    putOnBattlefield(s0, ap, gale());
    const div = inYard(s0, ap, divination());
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 40 && zone(s, div) === "graveyard"; i++) {
      const pid = waitingOn(s)!;
      const acts = botActions(s, pid);
      s = run(s, acts);
    }
    expect(zone(s, div)).not.toBe("graveyard");
  });
});

describe("Zethi, Arcane Blademaster", () => {
  const offered = (s: GameState) => (s.pending?.kind === "chooseOption" && s.pending.what === "castFromAmong" ? s.pending.options : []);
  /** Zethi cast kicked `kicks` times, with two instant cards and a sorcery card in your graveyard. */
  const kicked = (kicks: number) => {
    const { s: s0, ap, opp, ids } = setup([zethi()]);
    const [q1, q2] = [inYard(s0, ap, card("Test Quick A", "Instant", "{U}", { oracleText: "Draw a card." })), inYard(s0, ap, card("Test Quick B", "Instant", "{U}", { oracleText: "Draw a card." }))];
    const slow = inYard(s0, ap, divination());
    const s = until(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { kicks: Array.from({ length: kicks }, () => 0) })), (x) => x.pending?.kind === "chooseTargets" || settled(x));
    return { s, ap, opp, q1, q2, slow, zethi: ids[0]! };
  };

  it("kicked twice: two target instant cards exiled with kick counters; attacking, copies of both may be cast, paying for them", () => {
    const k = kicked(2);
    let s = k.s;
    const { ap, opp, q1, q2, slow, zethi: me } = k;
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    // A sorcery card isn't an instant card.
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(slow), tgt(q1)] })).toThrow();
    s = until(act(s, { type: "chooseTargets", player: ap, targets: [tgt(q1), tgt(q2)] }), settled);
    expect([zone(s, q1), zone(s, q2), zone(s, slow)]).toEqual(["exile", "exile", "graveyard"]);
    expect([s.objects[q1]!.counters.kick, s.objects[q2]!.counters.kick]).toEqual([1, 1]);
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: me, defender: opp }] } as Action);
    s = until(s, (x) => offered(x).length > 0);
    expect(offered(s).length).toBe(3);
    expect(offered(s)).toEqual(expect.arrayContaining([q1, q2, "none"]));
    s = act(s, { type: "chooseOption", player: ap, choice: q1 });
    expect(s.pending).toMatchObject({ kind: "castFree", how: "paid" });
    // A copy of the card is cast, not the card (CR 707.12).
    const made = s.pending?.kind === "castFree" ? s.pending.objectId : "";
    expect(made).not.toBe(q1);
    expect(characteristics(s, s.objects[made]!).name).toBe("Test Quick A");

    const untapped = s.battlefield.filter((id) => s.objects[id]!.controller === ap && !s.objects[id]!.tapped).length;
    s = run(s, planCast(s, ap, made));
    expect(s.stack.some((x) => x.objectId === made)).toBe(true);
    // Paid for: a land tapped for {U}.
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap && !s.objects[id]!.tapped).length).toBe(untapped - 1);
    // The other copy: declined.
    s = until(s, (x) => offered(x).length > 0 || settled(x));
    if (offered(s).length) s = act(s, { type: "chooseOption", player: ap, choice: "none" });
    s = until(s, settled);
    expect([zone(s, q1), zone(s, q2)]).toEqual(["exile", "exile"]);
    expect([s.objects[q1]!.counters.kick, s.objects[q2]!.counters.kick]).toEqual([1, 1]);
  });

  it("not kicked: no target, nothing exiled; attacking with no kick counters in exile does nothing", () => {
    const k = kicked(0);
    let s = k.s;
    expect(s.pending?.kind).not.toBe("chooseTargets");
    s = until(s, settled);
    expect([zone(s, k.q1), zone(s, k.q2)]).toEqual(["graveyard", "graveyard"]);
    s = passUntil(s, "declareAttackers", k.ap);
    s = act(s, { type: "declareAttackers", player: k.ap, attacks: [{ attacker: k.zethi, defender: k.opp }] } as Action);
    s = until(s, (x) => x.step === "combatDamage" || offered(x).length > 0);
    expect(offered(s)).toEqual([]);
  });

  it("an exiled instant card you own with a kick counter from anywhere counts; another player's doesn't", () => {
    const { s: s0, ap, opp } = setup([]);
    const me = putOnBattlefield(s0, ap, zethi());
    const mine = inYard(s0, ap, card("Test Quick A", "Instant", "{U}", { oracleText: "Draw a card." }));
    const theirs = inYard(s0, opp, card("Test Quick B", "Instant", "{U}", { oracleText: "Draw a card." }));
    for (const id of [mine, theirs]) {
      moveObject(s0, id, "exile");
      s0.objects[id]!.counters.kick = 1;
    }
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: me, defender: opp }] } as Action);
    s = until(s, (x) => offered(x).length > 0);
    expect(offered(s).filter((id) => id !== "none").map((id) => characteristics(s, s.objects[id]!).name)).toEqual(["Test Quick A"]);
  });
});
