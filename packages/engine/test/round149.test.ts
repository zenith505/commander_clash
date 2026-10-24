// Round 149: the most played cards, in popularity order, starting with Bandit's Talent.

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, island, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, castProblem, characteristics, controllerOf, invalidateCharacteristics, compileCard, isFullySupported, mayPlayFromExile, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type Step, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; "you may" questions get `yes`. Stops at any other question. */
const resolveAll = (s: GameState, yes = true) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending?.kind === "chooseMay"); i++) {
    if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: s.pending.player, yes });
    else if (s.pending) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Passes (resolving everything on the way, "you may" answered `yes`) until `step` of `active`'s turn. */
const advance = (s: GameState, step: Step, active: PlayerId, yes = true) => {
  for (let i = 0; i < 3000; i++) {
    if (s.step === step && s.activePlayer === active && !s.stack.length && !s.triggerQueue.length && !s.pending) return s;
    const p = s.pending;
    if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes });
    else if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: waitingOn(s)!, attacks: [] });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: waitingOn(s)!, blocks: [] });
    else if (p?.kind === "discardToHandSize") s = act(s, { type: "discard", player: p.player, objectIds: s.players[p.player]!.hand.slice(0, p.count) });
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  throw new Error(`never reached ${step}`);
};
/** A card put straight into a zone, not from the battlefield. */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "graveyard" | "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Empties a player's hand (onto the bottom of their library), then gives them these cards. */
const handOf = (s: GameState, pid: PlayerId, defs: CardDef[]) => {
  const p = s.players[pid]!;
  for (const id of p.hand) s.objects[id]!.zone = "library";
  p.library.push(...p.hand);
  p.hand = [];
  return defs.map((d) => into(s, pid, d, "hand"));
};
const obj = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const next = (s: GameState, pid: PlayerId, k = 1) => s.turnOrder[(s.turnOrder.indexOf(pid) + k) % s.turnOrder.length]!;
const ability = (d: CardDef, text: RegExp) => compileCard(d).activated.findIndex((a) => text.test(a.text));
const names = (s: GameState, ids: string[]) => ids.map((id) => s.cards[s.objects[id]!.cardId]!.name);

// Real oracle text (Scryfall).
const talent = card("Bandit's Talent", "Enchantment — Class", "{1}{B}", { oracleText: "(Gain the next level as a sorcery to add its ability.)\nWhen this Class enters, each opponent discards two cards unless they discard a nonland card.\n{B}: Level 2\nAt the beginning of each opponent's upkeep, if that player has one or fewer cards in hand, they lose 2 life.\n{3}{B}: Level 3\nAt the beginning of your draw step, draw an additional card for each opponent who has one or fewer cards in hand." });
const research = card("Compulsive Research", "Sorcery", "{2}{U}", { oracleText: "Target player draws three cards. Then that player discards two cards unless they discard a land card." });
const chandra = card("Chandra, Hope's Beacon", "Legendary Planeswalker — Chandra", "{4}{R}{R}", { loyalty: "5", oracleText: "Whenever you cast an instant or sorcery spell, copy it. You may choose new targets for the copy. This ability triggers only once each turn.\n+2: Add two mana in any combination of colors.\n+1: Exile the top five cards of your library. Until the end of your next turn, you may cast an instant or sorcery spell from among those exiled cards.\n−X: Chandra deals X damage to each of up to two targets." });
const realmbreaker = card("Realmbreaker, the Invasion Tree", "Legendary Artifact", "{3}", { keywords: ["Mill"], oracleText: "{2}, {T}: Target opponent mills three cards. Put a land card from their graveyard onto the battlefield tapped under your control. It gains \"If this land would leave the battlefield, exile it instead of putting it anywhere else.\"\n{10}, {T}, Sacrifice Realmbreaker: Search your library for any number of Praetor cards, put them onto the battlefield, then shuffle." });
const geth = card("Geth, Thane of Contracts", "Legendary Creature — Phyrexian Zombie", "{1}{B}{B}", { power: "3", toughness: "4", oracleText: "Other creatures you control get -1/-1.\n{1}{B}{B}, {T}: Return target creature card from your graveyard to the battlefield. It gains \"If this creature would leave the battlefield, exile it instead of putting it anywhere else.\" Activate only as a sorcery." });
const widow = card("Llanowar Greenwidow", "Creature — Spider", "{2}{G}", { power: "4", toughness: "3", keywords: ["Reach", "Trample", "Domain"], oracleText: "Reach, trample\nDomain — {7}{G}: Return this card from your graveyard to the battlefield tapped. It gains \"If this permanent would leave the battlefield, exile it instead of putting it anywhere else.\" This ability costs {1} less to activate for each basic land type among lands you control." });
const mjolnir = card("Mjölnir, Hammer of Thor", "Legendary Artifact — Equipment", "{3}{R}", { keywords: ["Double"], oracleText: "When Mjölnir enters, it deals 4 damage to up to one target creature.\nDouble all damage equipped creature would deal.\nEquip worthy {1} (A creature is worthy if it's a legendary non-Villain that's red and/or white.)\n{2}{R}, Discard this card: It deals 2 damage to each creature." });
const subtlety = card("Subtlety", "Creature — Elemental Incarnation", "{2}{U}{U}", { power: "3", toughness: "3", keywords: ["Flying", "Evoke", "Flash"], oracleText: "Flash\nFlying\nWhen this creature enters, choose up to one target creature spell or planeswalker spell. Its owner puts it on their choice of the top or bottom of their library.\nEvoke—Exile a blue card from your hand." });
const seance = card("Séance Board", "Artifact", "{2}", { keywords: ["Morbid"], oracleText: "Morbid — At the beginning of each end step, if a creature died this turn, put a soul counter on this artifact.\n{T}: Add X mana of any one color, where X is the number of soul counters on this artifact. Spend this mana only to cast instant, sorcery, Demon, and Spirit spells." });
const neyith = card("Neyith of the Dire Hunt", "Legendary Creature — Human Warrior", "{2}{G}{G}", { power: "3", toughness: "3", keywords: ["Double"], oracleText: "Whenever one or more creatures you control fight or become blocked, draw a card.\nAt the beginning of combat on your turn, you may pay {2}{R/G}. If you do, double target creature's power until end of turn. That creature must be blocked this combat if able. ({R/G} can be paid with either {R} or {G}.)" });
const amulet = card("Unstable Amulet", "Artifact", "{1}{R}", { oracleText: "When this artifact enters, you get {E}{E} (two energy counters).\nWhenever you cast a spell from anywhere other than your hand, this artifact deals 1 damage to each opponent.\n{T}, Pay {E}{E}: Exile the top card of your library. You may play it until you exile another card with this artifact." });
const rise = card("Furious Rise", "Enchantment", "{2}{R}", { oracleText: "At the beginning of your end step, if you control a creature with power 4 or greater, exile the top card of your library. You may play that card until you exile another card with this enchantment." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const opt = card("Opt", "Instant", "{U}", { oracleText: "Scry 1.\nDraw a card." });
const giant = card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" });
const ogre = card("Test Ogre", "Creature — Ogre", "{2}{R}", { power: "2", toughness: "2" });
const spirit = card("Test Spirit", "Creature — Spirit", "{1}{W}", { power: "1", toughness: "1" });
const redHero = card("Red Hero", "Legendary Creature — Human", "{1}{R}", { power: "2", toughness: "2" });
const redVillain = card("Red Villain", "Legendary Creature — Human Villain", "{1}{R}", { power: "2", toughness: "2" });
const greenHero = card("Green Hero", "Legendary Creature — Elf", "{1}{G}", { power: "2", toughness: "2" });
const fight = card("Prey Upon", "Sorcery", "{G}", { oracleText: "Target creature you control fights target creature you don't control." });
const giantGrowth = card("Giant Growth", "Instant", "{G}", { oracleText: "Target creature gets +3/+3 until end of turn." });

describe("Bandit's Talent and Compulsive Research: discard two cards unless they discard a card of a kind", () => {
  it("is fully supported", () => supported(talent, research));

  it("each opponent chooses in turn order; a nonland card, or two cards; with no nonland card, two cards", () => {
    const { s: s0, ap, ids } = setup([talent]);
    const [b, c, d] = [next(s0, ap), next(s0, ap, 2), next(s0, ap, 3)];
    const bHand = handOf(s0, b, [forest, forest, bear()]);
    const cHand = handOf(s0, c, [forest, forest]);
    const dHand = handOf(s0, d, [bear({ name: "Bear D1" }), bear({ name: "Bear D2" }), forest]);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    // B: a nonland card or two cards. The nonland card is the only one, so it's the one discarded.
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: b, what: "punisher", labels: ["Discard a nonland card", "Discard 2 cards"] });
    s = act(s, { type: "chooseOption", player: b, choice: "0" });
    // C has no nonland card: not asked.
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: d });
    s = act(s, { type: "chooseOption", player: d, choice: "0" });
    // D picks which nonland card.
    expect(s.pending).toMatchObject({ kind: "discard", player: d, count: 1, filter: { text: "nonland card" } });
    expect(() => act(s, { type: "discard", player: d, objectIds: [dHand[2]!] })).toThrow(/nonland card/);
    s = act(s, { type: "discard", player: d, objectIds: [dHand[1]!] });
    s = resolveAll(s);
    expect(s.objects[bHand[2]!]!.zone).toBe("graveyard");
    expect(s.players[b]!.hand).toEqual(bHand.slice(0, 2));
    expect(cHand.map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "graveyard"]);
    expect(s.players[d]!.hand).toEqual([dHand[0]!, dHand[2]!]);
  });

  it("a player may discard two cards, nonland ones too (rulings)", () => {
    const { s: s0, ap, ids } = setup([talent]);
    const [b, c, d] = [next(s0, ap), next(s0, ap, 2), next(s0, ap, 3)];
    const bHand = handOf(s0, b, [bear({ name: "Bear B1" }), bear({ name: "Bear B2" }), bear({ name: "Bear B3" })]);
    handOf(s0, c, []);
    handOf(s0, d, []);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    s = act(s, { type: "chooseOption", player: b, choice: "none" });
    expect(s.pending).toMatchObject({ kind: "discard", player: b, count: 2 });
    s = resolveAll(act(s, { type: "discard", player: b, objectIds: [bHand[0]!, bHand[1]!] }));
    expect(s.players[b]!.hand).toEqual([bHand[2]!]);
  });

  it("level 3: draws an additional card in your draw step for each opponent with one or fewer cards in hand", () => {
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, talent);
    s0.objects[t]!.classLevel = 3;
    let s = advance(s0, "upkeep", ap);
    handOf(s, next(s, ap), [forest]);
    handOf(s, next(s, ap, 2), []);
    handOf(s, next(s, ap, 3), [forest, forest]);
    const before = s.players[ap]!.hand.length;
    s = advance(s, "main1", ap);
    // The draw, plus two.
    expect(s.players[ap]!.hand.length).toBe(before + 3);
  });

  it("Compulsive Research: the targeted player draws three, then discards a land card or two cards", () => {
    const { s: s0, ap, ids } = setup([research]);
    const b = next(s0, ap);
    handOf(s0, b, []);
    for (const d of [forest, bear(), bear()]) into(s0, b, d, "library");
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [player(b)])));
    expect(s.players[b]!.hand.length).toBe(3);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: b, labels: ["Discard a land card", "Discard 2 cards"] });
    s = resolveAll(act(s, { type: "chooseOption", player: b, choice: "0" }));
    expect(names(s, s.players[b]!.hand)).toEqual(["Grizzly Bears", "Grizzly Bears"]);
  });
});

describe("Chandra, Hope's Beacon: +1", () => {
  it("is fully supported; one instant or sorcery spell from among the exiled cards until the end of your next turn", () => {
    supported(chandra);
    const { s: s0, ap } = setup([]);
    const ch = putOnBattlefield(s0, ap, chandra);
    s0.objects[ch]!.counters = { loyalty: 5 };
    const lib = [shock, opt, giant, forest, bear()].reverse().map((d) => into(s0, ap, d, "library")).reverse();
    let s = resolveAll(run(s0, planActivate(s0, ap, ch, ability(chandra, /^\+1/))));
    expect(lib.map((id) => s.objects[id]!.zone)).toEqual(["exile", "exile", "exile", "exile", "exile"]);
    // Shock and Opt may be cast; Hill Giant and the land may not.
    expect(mayPlayFromExile(s, s.objects[lib[0]!]!, ap)).toBe(true);
    expect(mayPlayFromExile(s, s.objects[lib[1]!]!, ap)).toBe(true);
    expect(mayPlayFromExile(s, s.objects[lib[2]!]!, ap)).toBe(false);
    expect(mayPlayFromExile(s, s.objects[lib[3]!]!, ap)).toBe(false);
    // Into the next turn (the opponent's), then cast one: the other can't be cast any more.
    s = advance(s, "upkeep", next(s, ap));
    expect(mayPlayFromExile(s, s.objects[lib[1]!]!, ap)).toBe(true);
    while (waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = run(s, planCast(s, ap, lib[1]!));
    expect(mayPlayFromExile(s, s.objects[lib[0]!]!, ap)).toBe(false);
    expect(castProblem(s, ap, lib[0]!)).not.toBeNull();
  });

  it("the permission ends with your next turn", () => {
    const { s: s0, ap } = setup([]);
    const ch = putOnBattlefield(s0, ap, chandra);
    s0.objects[ch]!.counters = { loyalty: 5 };
    const sh = into(s0, ap, shock, "library");
    let s = resolveAll(run(s0, planActivate(s0, ap, ch, ability(chandra, /^\+1/))));
    s = advance(s, "end", ap);
    s = advance(s, "main1", ap);
    expect(mayPlayFromExile(s, s.objects[sh]!, ap)).toBe(true);
    s = advance(s, "upkeep", next(s, ap));
    expect(mayPlayFromExile(s, s.objects[sh]!, ap)).toBe(false);
  });
});

describe("Realmbreaker, Geth, Llanowar Greenwidow: 'If this land would leave the battlefield, exile it instead'", () => {
  it("is fully supported; you choose a land card in their graveyard, it enters tapped under your control and is exiled if it would leave", () => {
    supported(realmbreaker, geth, widow);
    const { s: s0, ap } = setup([]);
    const b = next(s0, ap);
    const rb = putOnBattlefield(s0, ap, realmbreaker);
    const old = into(s0, b, card("Old Land", "Land", "", {}), "graveyard");
    const milled = [forest, bear(), forest].map((d) => into(s0, b, d, "library"));
    let s = resolveAll(run(s0, planActivate(s0, ap, rb, 0, [player(b)])));
    expect(milled.map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "graveyard", "graveyard"]);
    // You choose, from the lands milled or already there.
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    expect((s.pending as { cards: string[] }).cards.sort()).toEqual([old, milled[0]!, milled[2]!].sort());
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [old] }));
    const land = s.objects[old]!;
    expect(land.zone).toBe("battlefield");
    expect(land.tapped).toBe(true);
    expect(land.controller).toBe(ap);
    // Destroyed or bounced, it's exiled instead.
    expect(abilitiesOf(s, land).exileIfLeavesSelf).toBe(true);
    s = run(s, planCast(s, ap, into(s, ap, card("Boomerang", "Instant", "{U}{U}", { oracleText: "Return target permanent to its owner's hand." }), "hand"), [obj(old)]));
    s = resolveAll(s);
    expect(s.objects[old]!.zone).toBe("exile");
  });

  it("Geth: the returned creature is exiled when it dies", () => {
    const { s: s0, ap } = setup([]);
    const g = putOnBattlefield(s0, ap, geth);
    const dead = into(s0, ap, giant, "graveyard");
    let s = resolveAll(run(s0, planActivate(s0, ap, g, 0, [obj(dead)])));
    expect(s.objects[dead]!.zone).toBe("battlefield");
    // Geth's -1/-1 applies to it too.
    expect(pt(s, dead)).toBe("2/2");
    s = resolveAll(run(s, planCast(s, ap, into(s, ap, shock, "hand"), [obj(dead)])));
    expect(s.objects[dead]!.zone).toBe("exile");
  });
});

describe("Mjölnir, Hammer of Thor", () => {
  it("is fully supported; equips only a worthy creature and doubles the damage it deals", () => {
    supported(mjolnir);
    const { s: s0, ap } = setup([]);
    const m = putOnBattlefield(s0, ap, mjolnir);
    const hero = putOnBattlefield(s0, ap, redHero);
    const villain = putOnBattlefield(s0, ap, redVillain);
    const elf = putOnBattlefield(s0, ap, greenHero);
    const plain = putOnBattlefield(s0, ap, ogre);
    const eq = ability(mjolnir, /^Equip worthy/);
    expect(planActivate(s0, ap, m, eq, [obj(villain)])).toBeNull();
    expect(planActivate(s0, ap, m, eq, [obj(elf)])).toBeNull();
    expect(planActivate(s0, ap, m, eq, [obj(plain)])).toBeNull();
    let s = resolveAll(run(s0, planActivate(s0, ap, m, eq, [obj(hero)])));
    expect(s.objects[m]!.attachedTo).toBe(hero);
    // The hero fights an Ogre controlled by B: it deals 4, takes 2.
    const b = next(s, ap);
    const foe = putOnBattlefield(s, b, giant);
    s = resolveAll(run(s, planCast(s, ap, into(s, ap, fight, "hand"), [obj(hero), obj(foe)])));
    expect(s.objects[foe]!.zone).toBe("graveyard");
  });
});

describe("Subtlety", () => {
  it("is fully supported; the owner of the creature spell puts it on the top or bottom of their library, not countered", () => {
    supported(subtlety);
    const { s: s0, ap } = setup([]);
    const b = next(s0, ap);
    const sub = into(s0, b, subtlety, "hand");
    for (const l of [card("Island", "Basic Land — Island"), card("Island", "Basic Land — Island"), card("Island", "Basic Land — Island"), card("Island", "Basic Land — Island")]) putOnBattlefield(s0, b, l);
    const g = into(s0, ap, giant, "hand");
    let s = run(s0, planCast(s0, ap, g));
    s = act(s, { type: "passPriority", player: ap });
    s = run(s, planCast(s, b, sub));
    s = resolveAll(s);
    // Subtlety's trigger: up to one target creature spell.
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: b });
    const giantItem = s.stack.find((x) => x.objectId === g)!;
    s = act(s, { type: "chooseTargets", player: b, targets: [{ kind: "stack", id: giantItem.id }] });
    s = resolveAll(s);
    // Its owner, A, chooses.
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "topOrBottom" });
    s = resolveAll(act(s, { type: "chooseOption", player: ap, choice: "bottom" }));
    expect(s.objects[g]!.zone).toBe("library");
    expect(s.players[ap]!.library.at(-1)).toBe(g);
    expect(s.stack.length).toBe(0);
  });

  it("up to one: no target may be chosen", () => {
    const { s: s0, ap } = setup([]);
    const b = next(s0, ap);
    const sub = into(s0, b, subtlety, "hand");
    for (let i = 0; i < 4; i++) putOnBattlefield(s0, b, card("Island", "Basic Land — Island"));
    const g = into(s0, ap, giant, "hand");
    let s = run(s0, planCast(s0, ap, g));
    s = act(s, { type: "passPriority", player: ap });
    s = resolveAll(run(s, planCast(s, b, sub)));
    s = act(s, { type: "chooseTargets", player: b, targets: [{ kind: "none" }] });
    s = resolveAll(s);
    expect(s.objects[g]!.zone).toBe("battlefield");
  });
});

describe("Séance Board", () => {
  it("is fully supported; X mana of one color, spent only on instants, sorceries, Demons and Spirits", () => {
    supported(seance);
    const { s: s0, ap } = setup([]);
    const sb = putOnBattlefield(s0, ap, seance);
    s0.objects[sb]!.counters = { soul: 2 };
    // Only Séance Board: tap the lands away.
    for (const id of s0.battlefield) if (id !== sb) s0.objects[id]!.tapped = true;
    const sp = into(s0, ap, spirit, "hand");
    const og = into(s0, ap, ogre, "hand");
    expect(planCast(s0, ap, og)).toBeNull();
    const s = resolveAll(run(s0, planCast(s0, ap, sp)));
    expect(s.objects[sp]!.zone).toBe("battlefield");
  });

  it("morbid: a soul counter at the beginning of each end step if a creature died this turn", () => {
    const { s: s0, ap } = setup([]);
    const sb = putOnBattlefield(s0, ap, seance);
    const b = putOnBattlefield(s0, next(s0, ap), bear());
    let s = resolveAll(run(s0, planCast(s0, ap, into(s0, ap, shock, "hand"), [obj(b)])));
    s = advance(s, "end", ap);
    expect(s.objects[sb]!.counters.soul).toBe(1);
  });
});

describe("Neyith of the Dire Hunt", () => {
  it("is fully supported; one card for a fight, whichever creatures fought", () => {
    supported(neyith);
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, neyith);
    const mine = putOnBattlefield(s0, ap, giant);
    const foe = putOnBattlefield(s0, next(s0, ap), bear());
    const before = s0.players[ap]!.hand.length;
    const s = resolveAll(run(s0, planCast(s0, ap, into(s0, ap, fight, "hand"), [obj(mine), obj(foe)])));
    expect(s.players[ap]!.hand.length).toBe(before + 1);
  });

  it("one card when one or more of your creatures become blocked", () => {
    const { s: s0, ap } = setup([]);
    const b = next(s0, ap);
    putOnBattlefield(s0, ap, neyith);
    const a1 = putOnBattlefield(s0, ap, giant);
    const a2 = putOnBattlefield(s0, ap, ogre);
    const [b1, b2] = [putOnBattlefield(s0, b, bear({ name: "Bear 1" })), putOnBattlefield(s0, b, bear({ name: "Bear 2" }))];
    let s = passUntil(s0, "beginCombat", ap);
    // Neyith's beginning-of-combat trigger: a target, then don't pay.
    for (let i = 0; i < 40 && s.step !== "declareAttackers"; i++) {
      if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [obj(a1)] });
      else if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: ap, yes: false });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a1, defender: b }, { attacker: a2, defender: b }] });
    for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareBlockers", player: b, blocks: [{ blocker: b1, attacker: a1 }, { blocker: b2, attacker: a2 }] });
    const before = s.players[ap]!.hand.length;
    s = resolveAll(s);
    expect(s.players[ap]!.hand.length).toBe(before + 1);
  });

  it("at the beginning of combat, may pay {2}{R/G}: doubles a creature's power and it must be blocked this combat", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, neyith);
    const g = putOnBattlefield(s0, ap, giant);
    let s = passUntil(s0, "beginCombat", ap);
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = act(s, { type: "chooseTargets", player: ap, targets: [obj(g)] });
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    // Paid from the pool: {2}{R/G}.
    Object.assign(s.players[ap]!.manaPool, { R: 1, G: 2 });
    s = resolveAll(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(pt(s, g)).toBe("6/3");
    expect(characteristics(s, s.objects[g]!).mustBeBlocked).toBe(true);
  });
});

describe("Unstable Amulet and Furious Rise: 'until you exile another card with ~'", () => {
  it("is fully supported; the card may be played until the Amulet exiles another", () => {
    supported(amulet, rise);
    const { s: s0, ap } = setup([]);
    const am = putOnBattlefield(s0, ap, amulet);
    s0.players[ap]!.energy = 4;
    const second = into(s0, ap, shock, "library");
    const first = into(s0, ap, opt, "library");
    let s = resolveAll(run(s0, planActivate(s0, ap, am, 0)));
    expect(s.objects[first]!.zone).toBe("exile");
    expect(mayPlayFromExile(s, s.objects[first]!, ap)).toBe(true);
    // Still on later turns.
    s = advance(s, "main1", next(s, ap));
    s = advance(s, "main1", ap);
    expect(mayPlayFromExile(s, s.objects[first]!, ap)).toBe(true);
    // Put the second card back on top (it was drawn).
    const p = s.players[ap]!;
    p.hand = p.hand.filter((id) => id !== second);
    p.library = [second, ...p.library.filter((id) => id !== second)];
    s.objects[second]!.zone = "library";
    s = resolveAll(run(s, planActivate(s, ap, am, 0)));
    expect(s.objects[second]!.zone).toBe("exile");
    expect(mayPlayFromExile(s, s.objects[first]!, ap)).toBe(false);
    expect(mayPlayFromExile(s, s.objects[second]!, ap)).toBe(true);
  });

  it("deals 1 damage to each opponent when you cast a spell from anywhere other than your hand", () => {
    const { s: s0, ap } = setup([]);
    const am = putOnBattlefield(s0, ap, amulet);
    s0.players[ap]!.energy = 2;
    const top = into(s0, ap, opt, "library");
    let s = resolveAll(run(s0, planActivate(s0, ap, am, 0)));
    const life = s.players[next(s, ap)]!.life;
    s = resolveAll(run(s, planCast(s, ap, top)));
    expect(s.players[next(s, ap)]!.life).toBe(life - 1);
  });
});

const kayasWrath = card("Kaya's Wrath", "Sorcery", "{W}{W}{B}{B}", { oracleText: "Destroy all creatures. You gain life equal to the number of creatures you controlled that were destroyed this way." });
const reverence = card("Wall of Reverence", "Creature — Spirit Wall", "{3}{W}", { power: "1", toughness: "6", keywords: ["Flying", "Defender"], oracleText: "Defender, flying\nAt the beginning of your end step, you may gain life equal to the power of target creature you control." });
const swordBM = card("Sword of Body and Mind", "Artifact — Equipment", "{3}", { keywords: ["Equip", "Mill"], oracleText: "Equipped creature gets +2/+2 and has protection from green and from blue.\nWhenever equipped creature deals combat damage to a player, you create a 2/2 green Wolf creature token and that player mills ten cards.\nEquip {2}" });
const robbery = card("Highway Robbery", "Sorcery", "{1}{R}", { keywords: ["Plot"], oracleText: "You may discard a card or sacrifice a land. If you do, draw two cards.\nPlot {1}{R} (You may pay {1}{R} and exile this card from your hand. Cast it as a sorcery on a later turn without paying its mana cost. Plot only as a sorcery.)" });
const denial = card("Dazzling Denial", "Instant", "{1}{U}", { oracleText: "Counter target spell unless its controller pays {2}. If you control a Bird, counter that spell unless its controller pays {4} instead." });
const tide = card("Consuming Tide", "Sorcery", "{2}{U}{U}", { oracleText: "Each player chooses a nonland permanent they control. Return all nonland permanents not chosen this way to their owners' hands. Then you draw a card for each opponent who has more cards in their hand than you." });
const bird = card("Test Bird", "Creature — Bird", "{W}", { power: "1", toughness: "1" });
const relic = card("Test Relic", "Artifact", "{1}");

describe("Kaya's Wrath", () => {
  it("gains life for the creatures you controlled that were destroyed, not the indestructible ones", () => {
    supported(kayasWrath);
    const { s: s0, ap, ids } = setup([kayasWrath]);
    putOnBattlefield(s0, ap, bear());
    putOnBattlefield(s0, ap, bear({ name: "Bear 2" }));
    putOnBattlefield(s0, ap, bear({ name: "Tough Bear", keywords: ["Indestructible"], oracleText: "Indestructible" }));
    putOnBattlefield(s0, next(s0, ap), bear({ name: "Their Bear" }));
    const life = s0.players[ap]!.life;
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.players[ap]!.life).toBe(life + 2);
    expect(s.battlefield.filter((id) => characteristics(s, s.objects[id]!).types.includes("Creature")).length).toBe(1);
  });
});

describe("Wall of Reverence", () => {
  it("at your end step, you may gain life equal to the target creature's power", () => {
    supported(reverence);
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, reverence);
    const g = putOnBattlefield(s0, ap, giant);
    let s = advance(s0, "main2", ap);
    const life = s.players[ap]!.life;
    for (let i = 0; i < 20 && !(s.pending?.kind === "chooseTargets"); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = act(s, { type: "chooseTargets", player: ap, targets: [obj(g)] });
    s = resolveAll(s);
    expect(s.players[ap]!.life).toBe(life + 3);
  });
});

describe("Sword of Body and Mind", () => {
  it("is fully supported; on combat damage to a player, you get a Wolf and that player mills ten", () => {
    supported(swordBM);
    const c = compileCard(swordBM);
    const t = c.triggers[0]!;
    expect(t.body.effects.map((e) => e.type)).toEqual(["createToken", "mill"]);
    expect(t.body.effects[1]).toMatchObject({ who: { ref: "eventPlayer" } });
  });
});

describe("Highway Robbery: you may discard a card or sacrifice a land; if you do, draw two", () => {
  it("is fully supported; discarding draws two", () => {
    supported(robbery);
    const { s: s0, ap, ids } = setup([robbery]);
    const [extra] = [into(s0, ap, ogre, "hand")];
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "either" });
    const opts = (s.pending as { options: string[] }).options;
    s = act(s, { type: "chooseOption", player: ap, choice: opts[0]! });
    expect(s.pending).toMatchObject({ kind: "discard", player: ap, count: 1 });
    const before = s.players[ap]!.hand.length;
    s = resolveAll(act(s, { type: "discard", player: ap, objectIds: [extra!] }));
    expect(s.objects[extra!]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(before - 1 + 2);
  });

  it("with no card in hand, only the land can be sacrificed", () => {
    const { s: s0, ap, ids } = setup([robbery]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    handOf(s, ap, []);
    for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    const lands = s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === ap && characteristics(s, s.objects[id]!).types.includes("Land")).length;
    if (s.pending?.kind === "chooseOption") s = act(s, { type: "chooseOption", player: ap, choice: (s.pending as { options: string[] }).options.at(-1)! });
    if (s.pending?.kind === "pickPermanents") s = act(s, { type: "pickPermanents", player: ap, ids: [s.pending.options[0]!] });
    s = resolveAll(s);
    expect(s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === ap && characteristics(s, s.objects[id]!).types.includes("Land")).length).toBe(lands - 1);
    expect(s.players[ap]!.hand.length).toBe(2);
  });
});

describe("Dazzling Denial", () => {
  it("is fully supported: pay {2}, or {4} if you control a Bird", () => {
    supported(denial);
    for (const withBird of [false, true]) {
      const { s: s0, ap } = setup([]);
      const b = next(s0, ap);
      if (withBird) putOnBattlefield(s0, b, bird);
      putOnBattlefield(s0, b, island);
      putOnBattlefield(s0, b, island);
      const [sh] = handOf(s0, ap, [shock]);
      const [dd] = handOf(s0, b, [denial]);
      let s = run(s0, planCast(s0, ap, sh!, [player(b)]));
      s = act(s, { type: "passPriority", player: ap });
      s = run(s, planCast(s, b, dd!, [{ kind: "stack", id: s.stack[0]!.id } as TargetChoice]));
      for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      expect(s.pending).toMatchObject({ kind: "payUnless", player: ap, cost: withBird ? "{4}" : "{2}" });
    }
  });
});

describe("Consuming Tide", () => {
  it("is fully supported; each player keeps one nonland permanent, the rest return; then draws per opponent with more cards", () => {
    supported(tide);
    const { s: s0, ap, ids } = setup([tide]);
    const b = next(s0, ap);
    handOf(s0, ap, []);
    const [castId] = [into(s0, ap, tide, "hand")];
    void ids;
    const mine = [putOnBattlefield(s0, ap, bear()), putOnBattlefield(s0, ap, relic)];
    const theirs = [putOnBattlefield(s0, b, bear({ name: "Their Bear" })), putOnBattlefield(s0, b, giant)];
    handOf(s0, b, [forest, forest]);
    handOf(s0, next(s0, ap, 2), []);
    handOf(s0, next(s0, ap, 3), [forest, forest, forest]);
    let s = run(s0, planCast(s0, ap, castId!));
    for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "keep", bounce: true });
    s = act(s, { type: "pickPermanents", player: ap, ids: [mine[1]!] });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: b, action: "keep" });
    s = act(s, { type: "pickPermanents", player: b, ids: [theirs[1]!] });
    s = resolveAll(s);
    expect(s.objects[mine[0]!]!.zone).toBe("hand");
    expect(s.objects[mine[1]!]!.zone).toBe("battlefield");
    expect(s.objects[theirs[0]!]!.zone).toBe("hand");
    expect(s.objects[theirs[1]!]!.zone).toBe("battlefield");
    // You have 1 card (the bear); B has 3 and D has 3: two draws.
    expect(s.players[ap]!.hand.length).toBe(3);
  });
});
