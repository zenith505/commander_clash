// Lane B round B291: God-Eternal Kefnet's "You may reveal the first card you draw each turn as you draw it. Whenever you
// reveal an instant or sorcery card this way, copy that card and you may cast the copy. That copy costs {2} less to cast."
// The question pauses the draw before the next card is drawn (rulings); the copy is cast from the hand as the trigger
// resolves, or never (rulings, CR 707.12, 704.5e).

import { describe, expect, it } from "vitest";
import { act, island, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const godEternalKefnet = (): CardDef => ({"oracleId":"41d11144-32fc-4e45-a8db-3edb9dc0ce80","name":"God-Eternal Kefnet","manaCost":"{2}{U}{U}","cmc":4,"typeLine":"Legendary Creature — Zombie God","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Zombie","God"],"oracleText":"Flying\nYou may reveal the first card you draw each turn as you draw it. Whenever you reveal an instant or sorcery card this way, copy that card and you may cast the copy. That copy costs {2} less to cast.\nWhen God-Eternal Kefnet dies or is put into exile from the battlefield, you may put it into its owner's library third from the top.","power":"4","toughness":"5","colors":["U"],"colorIdentity":["U"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/5/e/5e14060f-9167-4e28-a053-77689e066e30.jpg?1783933465","artUrl":"https://cards.scryfall.io/art_crop/front/5/e/5e14060f-9167-4e28-a053-77689e066e30.jpg?1783933465","commanderLegal":"legal","set":"war","releasedAt":"2019-05-03","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const opt = (): CardDef => ({"oracleId":"713332c1-5bd8-400f-bfff-c1ca0697a043","name":"Opt","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card.","colors":["U"],"colorIdentity":["U"],"keywords":["Scry"],"imageUrl":"https://cards.scryfall.io/normal/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","artUrl":"https://cards.scryfall.io/art_crop/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","commanderLegal":"legal","set":"sld","releasedAt":"2025-07-25","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const giantGrowth = (): CardDef => ({"oracleId":"5748ebf1-24e3-499d-ab7c-c2cebd462a24","name":"Giant Growth","manaCost":"{G}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target creature gets +3/+3 until end of turn.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/d/fd1f95bf-48ea-455a-8a6c-0249b11c8900.jpg?1783902918","artUrl":"https://cards.scryfall.io/art_crop/front/f/d/fd1f95bf-48ea-455a-8a6c-0249b11c8900.jpg?1783902918","commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty or a question is asked; bots answer the questions of anyone but `me`. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && me !== undefined && p.player === me) return s;
    if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
/** A new card on top of `pid`'s library. */
const onTop = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  invalidateCharacteristics(s);
  return id;
};
const untappedLands = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.types.includes("Land") && !s.objects[id]!.tapped).length;
const copies = (s: GameState) => Object.values(s.objects).filter((o) => o.spellCopy).length;

describe("Lane B round B291: God-Eternal Kefnet", () => {
  /** `ap` controls Kefnet and has Divination in hand, with `top` on top of their library (first on top); as if they hadn't drawn yet this turn. */
  const game = (top: CardDef[]) => {
    const { s, ap, ids, opp } = setup([divination()]);
    const kefnet = putOnBattlefield(s, ap, godEternalKefnet());
    const tops = [...top].reverse().map((d) => onTop(s, ap, d)).reverse();
    s.players[ap]!.draws = undefined;
    return { s, ap, div: ids[0]!, opp, tops, kefnet };
  };

  it("is fully supported", () => supported(godEternalKefnet()));

  it("asks about the first card drawn, an instant or sorcery card, before the next card is drawn", () => {
    const { s: s0, ap, div, tops } = game([divination(), grizzlyBears()]);
    const s = settle(run(s0, planCast(s0, ap, div)), ap);
    const p = s.pending;
    expect(p?.kind).toBe("chooseMay");
    if (p?.kind !== "chooseMay") return;
    expect(p.player).toBe(ap);
    expect(p.card).toBe(tops[0]);
    expect(p.kefnet).toBeDefined();
    expect(p.source).toBe("God-Eternal Kefnet");
    expect(zone(s, tops[0]!)).toBe("hand");
    expect(zone(s, tops[1]!)).toBe("library");
  });

  it("revealing it copies it as the trigger resolves; the copy is cast from the hand for {2} less, and the card stays in hand", () => {
    const { s: s0, ap, div, tops } = game([divination(), grizzlyBears(), lightningBolt(), lightningBolt()]);
    let s = settle(run(s0, planCast(s0, ap, div)), ap);
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.log.some((l) => l.text.includes("reveals Divination as they draw it (God-Eternal Kefnet)"))).toBe(true);
    // The second card is drawn after the question; then the trigger resolves.
    expect(zone(s, tops[1]!)).toBe("hand");
    s = settle(s, ap);
    const p = s.pending;
    expect(p).toMatchObject({ kind: "castFree", player: ap, how: "paid", less: 2 });
    if (p?.kind !== "castFree") return;
    const copy = s.objects[p.objectId]!;
    expect(copy.spellCopy).toBe(true);
    expect(s.cards[copy.cardId]!.name).toBe("Divination");
    const lands = untappedLands(s, ap);
    s = run(s, planCast(s, ap, p.objectId));
    // {2}{U} less {2}: one land.
    expect(untappedLands(s, ap)).toBe(lands - 1);
    const item = s.stack.find((x) => x.objectId === p.objectId);
    expect(item).toBeDefined();
    expect(s.objects[p.objectId]!.castFrom).toBe("hand");
    s = settle(s, ap);
    // The copy drew two more cards (not the turn's first, so nothing is asked), and ceased to exist.
    expect(zone(s, tops[2]!)).toBe("hand");
    expect(zone(s, tops[3]!)).toBe("hand");
    expect(zone(s, tops[0]!)).toBe("hand");
    expect(s.pending).toBeNull();
    expect(copies(s)).toBe(0);
  });

  it("not revealing it: nothing triggers, and the draws go on", () => {
    const { s: s0, ap, div, tops } = game([divination(), grizzlyBears()]);
    let s = settle(run(s0, planCast(s0, ap, div)), ap);
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    s = settle(s, ap);
    expect(s.pending).toBeNull();
    expect(zone(s, tops[0]!)).toBe("hand");
    expect(zone(s, tops[1]!)).toBe("hand");
    expect(s.stack.length).toBe(0);
    expect(copies(s)).toBe(0);
  });

  it("a copy not cast ceases to exist (CR 704.5e)", () => {
    const { s: s0, ap, div, tops } = game([divination(), grizzlyBears()]);
    let s = settle(run(s0, planCast(s0, ap, div)), ap);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(s.pending?.kind).toBe("castFree");
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    s = settle(s, ap);
    expect(s.pending).toBeNull();
    expect(copies(s)).toBe(0);
    expect(zone(s, tops[0]!)).toBe("hand");
  });

  it("isn't asked about a card that isn't an instant or sorcery, nor about a second card drawn this turn", () => {
    const { s: s0, ap, div, tops } = game([grizzlyBears(), divination()]);
    const s = settle(run(s0, planCast(s0, ap, div)), ap);
    expect(s.pending).toBeNull();
    expect(zone(s, tops[0]!)).toBe("hand");
    expect(zone(s, tops[1]!)).toBe("hand");
    expect(s.stack.length).toBe(0);
  });

  it("isn't asked when its controller already drew a card this turn", () => {
    const { s: s0, ap, div, tops } = game([divination(), grizzlyBears()]);
    s0.players[ap]!.draws = { turn: s0.turn, n: 1 };
    const s = settle(run(s0, planCast(s0, ap, div)), ap);
    expect(s.pending).toBeNull();
    expect(zone(s, tops[0]!)).toBe("hand");
  });

  it("only its controller's draws: another player's first draw isn't asked about", () => {
    const { s: s0, ap, opp } = setup([divination()]);
    putOnBattlefield(s0, opp, godEternalKefnet());
    onTop(s0, ap, divination());
    onTop(s0, ap, divination());
    s0.players[ap]!.draws = undefined;
    const s = settle(run(s0, planCast(s0, ap, s0.players[ap]!.hand[0]!)), ap);
    expect(s.pending).toBeNull();
    expect(s.stack.length).toBe(0);
  });

  it("in its controller's draw step, a sorcery copy is cast then (timing ignored, CR 608.2g)", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, godEternalKefnet());
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, opp, island);
    let s = passUntil(s0, "upkeep", opp);
    onTop(s, opp, grizzlyBears());
    const top = onTop(s, opp, divination());
    for (let i = 0; i < 20 && s.step !== "draw"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.step).toBe("draw");
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: opp, card: top });
    s = act(s, { type: "chooseMay", player: opp, yes: true });
    s = settle(s, opp);
    expect(s.pending).toMatchObject({ kind: "castFree", player: opp, how: "paid", less: 2 });
    expect(s.step).toBe("draw");
    const p = s.pending!;
    if (p.kind !== "castFree") return;
    const hand = s.players[opp]!.hand.length;
    s = run(s, planCast(s, opp, p.objectId));
    s = settle(s, opp);
    expect(s.players[opp]!.hand.length).toBe(hand + 2);
    expect(zone(s, top)).toBe("hand");
  });

  it("a bot reveals the card and casts the copy", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, godEternalKefnet());
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, opp, island);
    let s = passUntil(s0, "upkeep", opp);
    const top = onTop(s, opp, divination());
    for (let i = 0; i < 20 && s.step !== "draw"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const hand = s.players[opp]!.hand.length;
    s = settle(s, ap);
    expect(s.log.some((l) => l.text.includes("reveals Divination as they draw it"))).toBe(true);
    expect(zone(s, top)).toBe("hand");
    expect(s.players[opp]!.hand.length).toBe(hand + 2);
    expect(copies(s)).toBe(0);
  });
});
