// Lane B round B139: Cytoshape and Polymorphous Rush (a creature chosen as the spell resolves, copied until end of turn,
// CR 608.2d, 707.2), Burning of Xinye (each player destroys lands of their choice, CR 701.8), Sages of the Anima (a draw
// replaced by a reveal, CR 614.1a), Aquamorph Entity (a form chosen as it enters or is turned face up, CR 614.1e).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilityProblem, botActions, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, planTurnFaceUp, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real oracle text (Scryfall).
const cytoshape = card("Cytoshape", "Instant", "{1}{G}{U}", { oracleText: "Choose a nonlegendary creature on the battlefield. Target creature becomes a copy of that creature until end of turn." });
const rush = card("Polymorphous Rush", "Instant", "{2}{U}", { keywords: ["Strive"], oracleText: "Strive — This spell costs {1}{U} more to cast for each target beyond the first.\nChoose a creature on the battlefield. Any number of target creatures you control each become a copy of that creature until end of turn." });
const xinye = card("Burning of Xinye", "Sorcery", "{4}{R}{R}", { oracleText: "You destroy four lands you control, then target opponent destroys four lands they control. Then Burning of Xinye deals 4 damage to each creature." });
const sages = card("Sages of the Anima", "Creature — Elf Wizard", "{3}{G}{U}", { power: "3", toughness: "4", oracleText: "If you would draw a card, instead reveal the top three cards of your library. Put all creature cards revealed this way into your hand and the rest on the bottom of your library in any order." });
const aquamorph = card("Aquamorph Entity", "Creature — Shapeshifter", "{2}{U}{U}", { power: "1", toughness: "1", keywords: ["Morph"], oracleText: "As this creature enters or is turned face up, it becomes your choice of 5/1 or 1/5.\nMorph {2}{U} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)" });
const breakOpen = card("Break Open", "Instant", "{1}{R}", { oracleText: "Turn target face-down creature an opponent controls face up." });
const citadel = card("Darksteel Citadel", "Artifact Land", "", { keywords: ["Indestructible"], oracleText: "Indestructible\n{T}: Add {C}." });
const ogre = card("Gray Ogre", "Creature — Ogre", "{2}{R}", { power: "2", toughness: "2" });
const legend = card("Isamaru, Hound of Konda", "Legendary Creature — Dog", "{W}", { power: "2", toughness: "2" });
const clone = card("Clone", "Creature — Shapeshifter", "{3}{U}", { power: "0", toughness: "0", oracleText: "You may have Clone enter as a copy of any creature on the battlefield." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; questions of the players in `me` stop it, others the bots answer. */
const settle = (s: GameState, opts: { me?: PlayerId[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && opts.me?.includes(p.player)) return s;
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const nameOf = (s: GameState, id: string) => characteristics(s, s.objects[id]!).name;
/** A copy of `def` put into `pid`'s hand. */
const toHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Puts `def` on top of `pid`'s library. */
const onTop = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = toHand(s, pid, def);
  s.players[pid]!.hand.splice(s.players[pid]!.hand.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  return id;
};

describe("Cytoshape and Polymorphous Rush: a creature chosen as it resolves, copied until end of turn", () => {
  it("parses", () => supported(cytoshape, rush));

  it("Cytoshape: the target becomes a copy of the creature chosen as it resolves (anyone's), until end of turn", () => {
    const { s: s0, ap, ids, opp } = setup([cytoshape]);
    const mine = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, sages);
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(mine)]));
    s = settle(s, { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "choose" });
    if (s.pending?.kind !== "pickPermanents") throw new Error();
    expect(s.pending.options).toContain(theirs);
    expect(s.pending.options).toContain(mine);
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [theirs] }));
    expect(nameOf(s, mine)).toBe("Sages of the Anima");
    expect(pt(s, mine)).toBe("3/4");
    expect(s.objects[mine]!.controller ?? ap).toBe(ap);
  });

  it("Cytoshape: a legendary creature can't be the one chosen", () => {
    const { s: s0, ap, ids, opp } = setup([cytoshape]);
    const mine = putOnBattlefield(s0, ap, bear());
    const isamaru = putOnBattlefield(s0, opp, legend);
    putOnBattlefield(s0, opp, ogre);
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(mine)]));
    s = settle(s, { me: [ap] });
    if (s.pending?.kind !== "pickPermanents") throw new Error("no pick");
    expect(s.pending.options).not.toContain(isamaru);
    expect(() => act(s, { type: "pickPermanents", player: ap, ids: [isamaru] })).toThrow();
  });

  it("Polymorphous Rush: each target becomes a copy, until end of turn", () => {
    const { s: s0, ap, ids, opp } = setup([rush]);
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, ap, bear({ name: "Runeclaw Bear" }));
    const ogreId = putOnBattlefield(s0, opp, ogre);
    s0.players[ap]!.manaPool.U = 2;
    s0.players[ap]!.manaPool.C = 1;
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(a), tgt(b)]));
    s = settle(s, { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap });
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [ogreId] }));
    expect(nameOf(s, a)).toBe("Gray Ogre");
    expect(nameOf(s, b)).toBe("Gray Ogre");
    expect(nameOf(s, ogreId)).toBe("Gray Ogre");
    // Until end of turn: back to what they were in the cleanup step (CR 514.2).
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    expect(nameOf(s, a)).toBe("Grizzly Bears");
    expect(nameOf(s, b)).toBe("Runeclaw Bear");
  });
});

describe("Burning of Xinye: each of you destroys four lands of your choice, then 4 damage to each creature", () => {
  it("parses", () => supported(xinye));

  it("you choose four of yours (never an indestructible one), the target opponent four of theirs, then the damage", () => {
    const { s: s0, ap, ids, opp } = setup([xinye]);
    const third = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    const cit = putOnBattlefield(s0, ap, citadel);
    const theirLands = Array.from({ length: 5 }, () => putOnBattlefield(s0, opp, card("Island", "Basic Land — Island")));
    const otherLand = putOnBattlefield(s0, third, card("Island", "Basic Land — Island"));
    const myBear = putOnBattlefield(s0, ap, bear());
    const thirdBear = putOnBattlefield(s0, third, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    s = settle(s, { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, count: 4 });
    if (s.pending?.kind !== "pickPermanents") throw new Error();
    expect(s.pending.options).not.toContain(cit);
    const mine = s.pending.options.filter((id) => s.objects[id]!.zone === "battlefield");
    const four = mine.slice(0, 4);
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: four }));
    for (const id of four) expect(s.objects[id]!.zone).toBe("graveyard");
    expect(s.objects[cit]!.zone).toBe("battlefield");
    // The opponent (a bot) destroyed four of their five lands; the third player's land is untouched.
    expect(theirLands.filter((id) => s.objects[id]!.zone === "graveyard").length).toBe(4);
    expect(s.objects[otherLand]!.zone).toBe("battlefield");
    // 4 damage to each creature, anyone's.
    expect(s.objects[myBear]!.zone).toBe("graveyard");
    expect(s.objects[thirdBear]!.zone).toBe("graveyard");
  });

  it("with fewer than four lands they can destroy, all of them", () => {
    const { s: s0, ap, ids, opp } = setup([xinye]);
    const two = [putOnBattlefield(s0, opp, card("Island", "Basic Land — Island")), putOnBattlefield(s0, opp, card("Island", "Basic Land — Island"))];
    const theirCit = putOnBattlefield(s0, opp, citadel);
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    s = settle(s, { me: [ap] });
    if (s.pending?.kind !== "pickPermanents") throw new Error();
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: s.pending.options.slice(0, 4) }));
    for (const id of two) expect(s.objects[id]!.zone).toBe("graveyard");
    expect(s.objects[theirCit]!.zone).toBe("battlefield");
  });
});

describe("Sages of the Anima: each draw replaced by a reveal of the top three", () => {
  it("parses", () => supported(sages));

  it("creature cards into the hand, the rest on the bottom in the order you choose", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, sages);
    s0.players[ap]!.hand = [];
    const land = onTop(s0, ap, card("Island", "Basic Land — Island"));
    const ogreId = onTop(s0, ap, ogre);
    const shockId = onTop(s0, ap, shock);
    // Top: Shock, Gray Ogre, Island.
    const s = s0;
    s.stack = [];
    // A draw: through a spell's "draw a card" (Divination-like): use the draw step instead.
    let t = settle(passToDraw(s, ap), { me: [ap] });
    expect(t.pending).toMatchObject({ kind: "orderLibrary", player: ap, bottom: true });
    expect(t.players[ap]!.hand).toEqual([ogreId]);
    t = act(t, { type: "orderLibrary", player: ap, order: [land, shockId] });
    const lib = t.players[ap]!.library;
    expect(lib.slice(-2)).toEqual([land, shockId]);
    expect(t.log.some((l) => /reveals Shock, Gray Ogre, Island instead of drawing \(Sages of the Anima\)/.test(l.text))).toBe(true);
  });

  it("no creature among them: nothing into the hand, the draw is still replaced", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, sages);
    s0.players[ap]!.hand = [];
    for (let i = 0; i < 3; i++) onTop(s0, ap, card("Island", "Basic Land — Island"));
    let t = settle(passToDraw(s0, ap), { me: [ap] });
    expect(t.pending).toMatchObject({ kind: "orderLibrary" });
    if (t.pending?.kind !== "orderLibrary") throw new Error();
    t = act(t, { type: "orderLibrary", player: ap, order: t.pending.cards });
    expect(t.players[ap]!.hand).toEqual([]);
  });

  it("a bot answers its order", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, sages);
    s0.players[ap]!.hand = [];
    const t = settle(passToDraw(s0, ap));
    expect(t.pending).toBe(null);
    expect(t.step).toBe("draw");
  });
});

/** Ends this turn and passes to `pid`'s next draw step (their draw happening then). */
function passToDraw(s: GameState, pid: PlayerId): GameState {
  for (let i = 0; i < 4000; i++) {
    if (s.activePlayer === pid && s.step === "draw" && s.turn > 1 && (s.pending || s.log.some((l) => / instead of drawing/.test(l.text)))) return s;
    if (s.pending) {
      if (s.pending.player === pid && s.pending.kind === "orderLibrary") return s;
      for (const a of botActions(s, s.pending.player)) s = act(s, a);
      continue;
    }
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    if (s.activePlayer === pid && s.step === "draw") return s;
  }
  throw new Error("never reached the draw step");
}

describe("Aquamorph Entity: 5/1 or 1/5 as it enters or is turned face up", () => {
  it("parses", () => supported(aquamorph, breakOpen));

  it("cast face up: its controller chooses as it enters", () => {
    const { s: s0, ap, ids } = setup([aquamorph]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s, { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "form", labels: ["5/1", "1/5"] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "1" }));
    expect(pt(s, ids[0]!)).toBe("1/5");
  });

  it("face down it's a 2/2 with no choice; turned face up with its morph cost, as the form chosen with it", () => {
    const { s: s0, ap, ids } = setup([aquamorph]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { faceDown: true })), { me: [ap] });
    expect(s.pending).toBe(null);
    expect(pt(s, ids[0]!)).toBe("2/2");
    // Without a form, the special action is refused.
    expect(() => run(s, planTurnFaceUp(s, ap, ids[0]!))).toThrow(/becomes as it's turned face up/);
    s = run(s, planTurnFaceUp(s, ap, ids[0]!, 0, 0, undefined, 0));
    expect(s.objects[ids[0]!]!.faceDown).toBeFalsy();
    expect(pt(s, ids[0]!)).toBe("5/1");
    expect(s.pending).toBe(null);
  });

  it("turned face up by an effect: its controller chooses then", () => {
    const { s: s0, ap, ids, opp } = setup([breakOpen]);
    // The opponent's face-down Aquamorph.
    const aq = putOnBattlefield(s0, opp, aquamorph);
    s0.objects[aq]!.faceDown = "morph";
    invalidateCharacteristics(s0);
    expect(pt(s0, aq)).toBe("2/2");
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(aq)]));
    s = settle(s, { me: [ap, opp] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: opp, what: "faceUpForm", about: aq, labels: ["5/1", "1/5"] });
    s = settle(act(s, { type: "chooseOption", player: opp, choice: "1" }));
    expect(s.objects[aq]!.faceDown).toBeFalsy();
    expect(pt(s, aq)).toBe("1/5");
  });

  it("rulings: a creature becoming a copy of a face-up 1/5 Entity is 1/5; a Clone entering as a copy chooses for itself", () => {
    const { s: s0, ap, ids, opp } = setup([aquamorph, cytoshape, clone]);
    putOnBattlefield(s0, ap, card("Island", "Basic Land — Island"));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: [ap] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "1" }));
    expect(pt(s, ids[0]!)).toBe("1/5");
    const theirBear = putOnBattlefield(s, opp, bear());
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(theirBear)])), { me: [ap] });
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [ids[0]!] }));
    expect(nameOf(s, theirBear)).toBe("Aquamorph Entity");
    expect(pt(s, theirBear)).toBe("1/5");
    s = settle(run(s, planCast(s, ap, ids[2]!)), { me: [ap] });
    for (let i = 0; i < 5 && s.pending && !(s.pending.kind === "chooseOption" && s.pending.what === "form"); i++) {
      const p = s.pending;
      if (p.kind === "chooseMay") s = settle(act(s, { type: "chooseMay", player: ap, choice: true }), { me: [ap] });
      else if (p.kind === "chooseOption") s = settle(act(s, { type: "chooseOption", player: ap, choice: p.options.includes(ids[0]!) ? ids[0]! : p.options[0]! }), { me: [ap] });
      else break;
    }
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "form" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "0" }));
    expect(nameOf(s, ids[2]!)).toBe("Aquamorph Entity");
    expect(pt(s, ids[2]!)).toBe("5/1");
    expect(pt(s, ids[0]!)).toBe("1/5");
  });

  it("a bot turning its own face up picks a form", () => {
    const { s: s0, ap, ids } = setup([aquamorph]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { faceDown: true })));
    const plan = planTurnFaceUp(s, ap, ids[0]!, 0, 0, undefined, 1);
    expect(plan?.at(-1)).toMatchObject({ type: "turnFaceUp", form: 1 });
  });
});

const immortal = card("Mister Immortal", "Legendary Creature — Mutant Hero", "{1}{G}", { power: "2", toughness: "2", oracleText: "{2}{G}: Return this card from your graveyard or from exile to the battlefield tapped." });

describe("Mister Immortal: back from your graveyard or from exile", () => {
  it("parses", () => supported(immortal));

  const inZone = (s: GameState, pid: PlayerId, zone: "graveyard" | "exile") => {
    const id = putOnBattlefield(s, pid, immortal);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = zone;
    s.players[pid]![zone].push(id);
    invalidateCharacteristics(s);
    return id;
  };

  it("from exile: onto the battlefield tapped", () => {
    const { s: s0, ap } = setup([]);
    const id = inZone(s0, ap, "exile");
    const s = settle(run(s0, planActivate(s0, ap, id, 0)));
    expect(s.objects[id]!.zone).toBe("battlefield");
    expect(s.objects[id]!.tapped).toBe(true);
  });

  it("from the graveyard too, but not from the hand or the battlefield", () => {
    const { s: s0, ap, ids } = setup([immortal]);
    expect(abilityProblem(s0, ap, ids[0]!, 0)).toMatch(/works only from your graveyard or from exile/);
    const id = inZone(s0, ap, "graveyard");
    const s = settle(run(s0, planActivate(s0, ap, id, 0)));
    expect(s.objects[id]!.zone).toBe("battlefield");
    expect(abilityProblem(s, ap, id, 0)).toMatch(/works only from your graveyard or from exile/);
  });

  it("only its owner; not face down in exile", () => {
    const { s: s0, ap, opp } = setup([]);
    const id = inZone(s0, opp, "exile");
    expect(abilityProblem(s0, ap, id, 0)).toMatch(/works only from your graveyard or from exile/);
    const mine = inZone(s0, ap, "exile");
    s0.objects[mine]!.hiddenExile = { by: mine, seen: [ap] };
    expect(abilityProblem(s0, ap, mine, 0)).toMatch(/works only/);
  });

  it("a bot brings it back from exile", () => {
    const { s: s0, ap } = setup([]);
    const id = inZone(s0, ap, "exile");
    s0.players[ap]!.hand = [];
    let s = s0;
    for (let i = 0; i < 30 && s.objects[id]!.zone === "exile" && s.step === "main1"; i++) {
      for (const a of botActions(s, waitingOn(s)!)) s = act(s, a);
      s = settle(s);
    }
    expect(s.objects[id]!.zone).toBe("battlefield");
  });
});

const valleymaker = card("Valleymaker", "Creature — Giant Shaman", "{5}{R/G}", { power: "5", toughness: "5", oracleText: "{T}, Sacrifice a Mountain: This creature deals 3 damage to target creature.\n{T}, Sacrifice a Forest: Choose a player. That player adds {G}{G}{G}." });

describe("Valleymaker: a mana ability whose mana goes to the player chosen", () => {
  it("parses, the second ability a mana ability", () => {
    supported(valleymaker);
    const { s, ap } = setup([]);
    const v = putOnBattlefield(s, ap, valleymaker);
    expect(s.objects[v]).toBeTruthy();
  });

  const activateMana = (s0: GameState, pid: PlayerId, v: string, forest: string) => act(s0, { type: "activateAbility", player: pid, objectId: v, index: 1, costs: { sacrifice: [forest] } });

  it("an opponent chosen: they add {G}{G}{G}, without the stack, and you keep priority", () => {
    const { s: s0, ap, opp } = setup([]);
    const v = putOnBattlefield(s0, ap, valleymaker);
    const forest = s0.battlefield.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Forest" && s0.objects[id]!.controller === ap)!;
    let s = activateMana(s0, ap, v, forest);
    expect(s.stack.length).toBe(0);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "nthPlayer" });
    s = act(s, { type: "chooseOption", player: ap, choice: String(opp) });
    expect(s.players[opp]!.manaPool.G).toBe(3);
    expect(s.players[ap]!.manaPool.G ?? 0).toBe(0);
    expect(s.objects[forest]!.zone).toBe("graveyard");
    expect(s.objects[v]!.tapped).toBe(true);
    expect(s.stack.length).toBe(0);
    expect(s.pending).toBe(null);
    expect(waitingOn(s)).toBe(ap);
  });

  it("yourself chosen: the mana is yours to spend", () => {
    const { s: s0, ap } = setup([]);
    const v = putOnBattlefield(s0, ap, valleymaker);
    const forest = s0.battlefield.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Forest" && s0.objects[id]!.controller === ap)!;
    let s = activateMana(s0, ap, v, forest);
    s = act(s, { type: "chooseOption", player: ap, choice: String(ap) });
    expect(s.players[ap]!.manaPool.G).toBe(3);
  });

  it("autopay never uses it", () => {
    const { s: s0, ap, ids } = setup([card("Giant Growth", "Instant", "{G}", { oracleText: "Target creature gets +3/+3 until end of turn." })]);
    const v = putOnBattlefield(s0, ap, valleymaker);
    for (const id of [...s0.battlefield]) if (s0.cards[s0.objects[id]!.cardId]!.types.includes("Land") && s0.cards[s0.objects[id]!.cardId]!.name !== "Forest") s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
    // Only Forests are left: the plan taps one for {G}, never Valleymaker.
    const plan = planCast(s0, ap, ids[0]!, [tgt(v)]);
    expect(plan?.some((a) => a.type === "activateAbility" && a.objectId === v)).toBe(false);
  });
});

const familiar = card("Obstinate Familiar", "Creature — Lizard", "{R}", { power: "1", toughness: "1", oracleText: "If you would draw a card, you may skip that draw instead." });
const pursuit = card("Pursuit of Knowledge", "Enchantment", "{3}{W}", { oracleText: "If you would draw a card, you may put a study counter on this enchantment instead.\nRemove three study counters from this enchantment, Sacrifice this enchantment: Draw seven cards." });

describe("Obstinate Familiar and Pursuit of Knowledge: draws you may replace", () => {
  it("parses", () => supported(familiar, pursuit));

  it("Obstinate Familiar: skip the draw, or draw it", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, familiar);
    s0.players[ap]!.hand = [];
    let s = passToDraw(s0, ap);
    expect(s.pending).toMatchObject({ kind: "drawInstead", player: ap });
    if (s.pending?.kind !== "drawInstead") throw new Error();
    expect(s.pending.options).toHaveLength(2);
    expect(s.pending.options).toContain("draw");
    const lib = s.players[ap]!.library.length;
    const skip = s.pending.options.find((o) => o.startsWith("mayskip:"))!;
    const t = act(s, { type: "drawInstead", player: ap, choice: skip });
    expect(t.players[ap]!.hand.length).toBe(0);
    expect(t.players[ap]!.library.length).toBe(lib);
    s = act(s, { type: "drawInstead", player: ap, choice: "draw" });
    expect(s.players[ap]!.hand.length).toBe(1);
    expect(s.players[ap]!.library.length).toBe(lib - 1);
  });

  it("Pursuit of Knowledge: a study counter instead, then seven cards for three of them", () => {
    const { s: s0, ap } = setup([]);
    const p = putOnBattlefield(s0, ap, pursuit);
    s0.players[ap]!.hand = [];
    let s = passToDraw(s0, ap);
    if (s.pending?.kind !== "drawInstead") throw new Error("no choice");
    const counter = s.pending.options.find((o) => o.startsWith("counter:"))!;
    expect(s.pending.labels).toContain("Put a study counter on Pursuit of Knowledge instead");
    s = act(s, { type: "drawInstead", player: ap, choice: counter });
    expect(s.objects[p]!.counters.study).toBe(1);
    expect(s.players[ap]!.hand.length).toBe(0);
    s.objects[p]!.counters.study = 3;
    s = settle(s);
    s = passUntil(s, "main1", ap);
    s.players[ap]!.hand = [];
    s = settle(run(s, planActivate(s, ap, p, 0)), { me: [ap] });
    // Its own draws are no longer replaced: it was sacrificed to pay for the ability.
    expect(s.objects[p]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(7);
  });

  it("bots: a counter on Pursuit of Knowledge, a draw with Obstinate Familiar and a long library", () => {
    const { s: s0, ap } = setup([]);
    const p = putOnBattlefield(s0, ap, pursuit);
    putOnBattlefield(s0, ap, familiar);
    let s = passToDraw(s0, ap);
    if (s.pending?.kind !== "drawInstead") throw new Error("no choice");
    const acts = botActions(s, ap);
    expect(acts[0]).toMatchObject({ type: "drawInstead", choice: `counter:${p}` });
    s.objects[p]!.counters.study = 3;
    expect(botActions(s, ap)[0]).toMatchObject({ type: "drawInstead", choice: "draw" });
  });
});
