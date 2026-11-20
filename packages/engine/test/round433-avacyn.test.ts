// Round 433: The Creation of Avacyn ("I — Search your library for a card, exile it face down, then shuffle." "II — Turn the
// exiled card face up. If it's a creature card, you lose life equal to its mana value." "III — You may put the exiled card
// onto the battlefield if it's a creature card. If you don't put it onto the battlefield, put it into its owner's hand.").
import { describe, expect, it } from "vitest";
import { act, passUntil, setup } from "./helpers";
import { botActions, hiddenInExile, isFullySupported, planCast, waitingOn, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const avacyn = (): CardDef => ({"oracleId":"7f32344f-06d8-4862-bfeb-f90a3e1d7fc2","name":"The Creation of Avacyn","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — Search your library for a card, exile it face down, then shuffle.\nII — Turn the exiled card face up. If it's a creature card, you lose life equal to its mana value.\nIII — You may put the exiled card onto the battlefield if it's a creature card. If you don't put it onto the battlefield, put it into its owner's hand.","colors":["B"],"colorIdentity":["B"],"keywords":[],"layout":"saga"}) as CardDef;

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
const nameOf = (s: GameState, id: ObjectId) => s.cards[s.objects[id]!.cardId]!.name;
/** On to `pid`'s next precombat main phase, its chapter ability resolved (or waiting on `pid`). */
const nextMain = (s: GameState, pid: PlayerId) => settle(passUntil(passUntil(s, "end", pid), "main1", pid), pid);

/** The Saga cast, chapter I's search for the first card of `name` in the library. */
const start = (name: string) => {
  const { s: s0, ap, opp, ids } = setup([avacyn()]);
  const plan = planCast(s0, ap, ids[0]!);
  if (!plan) throw new Error("no plan");
  let s = s0;
  for (const a of plan) s = act(s, a);
  s = settle(s, ap);
  if (s.pending?.kind !== "searchLibrary") throw new Error(`expected the search, got ${s.pending?.kind}`);
  const card = s.pending.cards.find((id) => nameOf(s, id) === name)!;
  s = settle(act(s, { type: "searchLibrary", player: ap, found: [card] }), ap);
  return { s, ap, opp, saga: ids[0]!, card };
};

describe("round 433: The Creation of Avacyn", () => {
  it("is fully supported", () => {
    expect(isFullySupported(avacyn())).toBe(true);
  });

  it("chapter I exiles the card found face down, seen only by its owner, linked to the Saga", () => {
    const r = start("Grizzly Bears");
    const c = r.s.objects[r.card]!;
    expect(c.zone).toBe("exile");
    expect(hiddenInExile(c, r.ap)).toBe(false);
    expect(hiddenInExile(c, r.opp)).toBe(true);
    const zc = r.s.objects[r.saga]!.zoneChanges ?? 0;
    expect(r.s.linkedExile?.[`${r.saga}@${zc}`]?.map((l) => l.id)).toContain(r.card);
  });

  it("chapter II turns it face up and, for a creature card, you lose life equal to its mana value", () => {
    const r = start("Grizzly Bears");
    const life = r.s.players[r.ap]!.life;
    const s = nextMain(r.s, r.ap);
    expect(s.objects[r.saga]!.counters.lore).toBe(2);
    expect(hiddenInExile(s.objects[r.card]!, r.opp)).toBe(false);
    expect(s.players[r.ap]!.life).toBe(life - 2);
  });

  it("chapter III: you may put the creature card onto the battlefield under your control", () => {
    const r = start("Grizzly Bears");
    let s = nextMain(nextMain(r.s, r.ap), r.ap);
    expect(s.pending?.kind === "chooseMay" && s.pending.player === r.ap && /put Grizzly Bears onto the battlefield/.test(s.pending.prompt)).toBe(true);
    s = settle(act(s, { type: "chooseMay", player: r.ap, yes: true }), r.ap);
    expect(s.objects[r.card]!.zone).toBe("battlefield");
    expect(s.objects[r.card]!.controller).toBe(r.ap);
    // Then the Saga is sacrificed (CR 714.4).
    expect(s.objects[r.saga]!.zone).toBe("graveyard");
  });

  it("chapter III: if you don't, the creature card goes into its owner's hand", () => {
    const r = start("Grizzly Bears");
    let s = nextMain(nextMain(r.s, r.ap), r.ap);
    s = settle(act(s, { type: "chooseMay", player: r.ap, yes: false }), r.ap);
    expect(s.objects[r.card]!.zone).toBe("hand");
    expect(s.players[r.ap]!.hand).toContain(r.card);
  });

  it("a noncreature card: no life lost, and chapter III puts it into your hand without asking", () => {
    const r = start("Forest");
    const life = r.s.players[r.ap]!.life;
    let s = nextMain(r.s, r.ap);
    expect(s.players[r.ap]!.life).toBe(life);
    expect(hiddenInExile(s.objects[r.card]!, r.opp)).toBe(false);
    s = nextMain(s, r.ap);
    expect(s.pending).toBeFalsy();
    expect(s.objects[r.card]!.zone).toBe("hand");
  });

  it("a card still face down at chapter III has no characteristics: it goes into your hand (CR 406.3a)", () => {
    const r = start("Grizzly Bears");
    let s = nextMain(r.s, r.ap);
    // Face down again (as if chapter II had never turned it face up).
    s.objects[r.card]!.hiddenExile = { by: r.saga, seen: [r.ap], label: "Face down" };
    s = nextMain(s, r.ap);
    expect(s.pending).toBeFalsy();
    expect(s.objects[r.card]!.zone).toBe("hand");
  });

  it("only the cards this Saga exiled: another face-down card in exile isn't touched", () => {
    const r = start("Grizzly Bears");
    const other = r.s.players[r.ap]!.library.find((id) => nameOf(r.s, id) === "Grizzly Bears")!;
    const s0 = r.s;
    s0.players[r.ap]!.library.splice(s0.players[r.ap]!.library.indexOf(other), 1);
    s0.objects[other]!.zone = "exile";
    s0.players[r.ap]!.exile.push(other);
    s0.objects[other]!.hiddenExile = { by: "someone", seen: [r.ap], label: "Face down" };
    const life = s0.players[r.ap]!.life;
    const s = nextMain(s0, r.ap);
    expect(s.players[r.ap]!.life).toBe(life - 2);
    expect(hiddenInExile(s.objects[other]!, r.opp)).toBe(true);
  });

  it("two cards exiled with it (chapter I twice): their total mana value lost, then all its permanent cards or none (rulings)", () => {
    const r = start("Grizzly Bears");
    const s0 = r.s;
    // A second card linked to it, face down, as a second resolution of chapter I would leave it.
    const forest = s0.players[r.ap]!.library.find((id) => nameOf(s0, id) === "Forest")!;
    s0.players[r.ap]!.library.splice(s0.players[r.ap]!.library.indexOf(forest), 1);
    s0.objects[forest]!.zone = "exile";
    s0.players[r.ap]!.exile.push(forest);
    s0.objects[forest]!.hiddenExile = { by: r.saga, seen: [r.ap], label: "Face down" };
    s0.linkedExile![`${r.saga}@${s0.objects[r.saga]!.zoneChanges ?? 0}`]!.push({ id: forest, zc: s0.objects[forest]!.zoneChanges ?? 0 });
    const life = s0.players[r.ap]!.life;
    let s = nextMain(s0, r.ap);
    expect(s.players[r.ap]!.life).toBe(life - 2); // 2 + 0
    expect(hiddenInExile(s.objects[forest]!, r.opp)).toBe(false);
    s = nextMain(s, r.ap);
    expect(s.pending?.kind === "chooseMay" && /Grizzly Bears, Forest/.test(s.pending.prompt)).toBe(true);
    s = settle(act(s, { type: "chooseMay", player: r.ap, yes: true }), r.ap);
    expect(s.objects[r.card]!.zone).toBe("battlefield");
    expect(s.objects[forest]!.zone).toBe("battlefield");
  });

  it("a bot answers chapter III by putting the creature onto the battlefield", () => {
    const r = start("Grizzly Bears");
    let s = nextMain(nextMain(r.s, r.ap), r.ap);
    expect(s.pending?.kind).toBe("chooseMay");
    for (const a of botActions(s, r.ap)) s = act(s, a);
    s = settle(s);
    expect(s.objects[r.card]!.zone).toBe("battlefield");
  });
});
