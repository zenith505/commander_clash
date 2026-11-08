// Lane B round B145: Thelon's Curse, Magnetic Mountain, Dream Tides and Mudslide (at each upkeep, the player chooses any
// number of their tapped creatures and pays for each, all at once, to untap them; rulings on Mudslide), Reclamation and
// Flooded Woodlands (a land sacrificed for each attacking creature of a color, CR 508.1g-i), Yare and Blaze of Glory
// ("target creature defending player controls" on a spell: any defending player's, CR 802.2, 508.5a; Blaze's "blocks each
// attacking creature this turn if able", CR 509.1c) and Johan (attacking doesn't cause creatures to tap, CR 508.1f).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, attackProblem, botActions, isFullySupported, legalTargets, maxBlocks, objIsType, planCast, power, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const thelon = (): CardDef => ({"oracleId":"f6880f71-a05a-4752-ba33-ffbc450606bf","name":"Thelon's Curse","manaCost":"{G}{G}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Blue creatures don't untap during their controllers' untap steps.\nAt the beginning of each player's upkeep, that player may choose any number of tapped blue creatures they control and pay {U} for each creature chosen this way. If the player does, untap those creatures.","colors":["G"],"colorIdentity":["G","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/b/9b868846-cc3c-4756-a5dd-2335bb380567.jpg?1783947884","artUrl":"https://cards.scryfall.io/art_crop/front/9/b/9b868846-cc3c-4756-a5dd-2335bb380567.jpg?1783947884","commanderLegal":"legal","set":"fem","releasedAt":"1994-11-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const magnetic = (): CardDef => ({"oracleId":"5c28fc22-7da6-4f15-b02b-6ff10981466c","name":"Magnetic Mountain","manaCost":"{1}{R}{R}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Blue creatures don't untap during their controllers' untap steps.\nAt the beginning of each player's upkeep, that player may choose any number of tapped blue creatures they control and pay {4} for each creature chosen this way. If the player does, untap those creatures.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/5/95fde48b-e40a-4183-b324-1ec276dde015.jpg?1783948383","artUrl":"https://cards.scryfall.io/art_crop/front/9/5/95fde48b-e40a-4183-b324-1ec276dde015.jpg?1783948383","commanderLegal":"legal","set":"arn","releasedAt":"1993-12-17","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const dreamTides = (): CardDef => ({"oracleId":"d9583aab-3eff-4d88-84d5-7219ab982636","name":"Dream Tides","manaCost":"{2}{U}{U}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Creatures don't untap during their controllers' untap steps.\nAt the beginning of each player's upkeep, that player may choose any number of tapped nongreen creatures they control and pay {2} for each creature chosen this way. If the player does, untap those creatures.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/b/3bd292a0-ec08-4250-8d75-0802e985d6e6.jpg?1783947002","artUrl":"https://cards.scryfall.io/art_crop/front/3/b/3bd292a0-ec08-4250-8d75-0802e985d6e6.jpg?1783947002","commanderLegal":"legal","set":"vis","releasedAt":"1997-02-03","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const mudslide = (): CardDef => ({"oracleId":"ac1d7dfe-1454-46a9-acf6-66ae86b6a6c5","name":"Mudslide","manaCost":"{2}{R}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Creatures without flying don't untap during their controllers' untap steps.\nAt the beginning of each player's upkeep, that player may choose any number of tapped creatures without flying they control and pay {2} for each creature chosen this way. If the player does, untap those creatures.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/5/65acce56-8674-471e-9d5e-91b7e3f672c1.jpg?1783947486","artUrl":"https://cards.scryfall.io/art_crop/front/6/5/65acce56-8674-471e-9d5e-91b7e3f672c1.jpg?1783947486","commanderLegal":"legal","set":"ice","releasedAt":"1995-06-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const reclamation = (): CardDef => ({"oracleId":"ff942899-a70d-4fca-b125-9712aa635fff","name":"Reclamation","manaCost":"{2}{G}{W}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Black creatures can't attack unless their controller sacrifices a land of their choice for each black creature they control that's attacking. (This cost is paid as attackers are declared.)","colors":["G","W"],"colorIdentity":["G","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/ca335f4f-d345-4eb9-9bc6-74595c501078.jpg?1783947464","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/ca335f4f-d345-4eb9-9bc6-74595c501078.jpg?1783947464","commanderLegal":"legal","set":"ice","releasedAt":"1995-06-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const flooded = (): CardDef => ({"oracleId":"413172aa-b508-4e67-b68e-6a749d2e8130","name":"Flooded Woodlands","manaCost":"{2}{U}{B}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Green creatures can't attack unless their controller sacrifices a land of their choice for each green creature they control that's attacking. (This cost is paid as attackers are declared.)","colors":["B","U"],"colorIdentity":["B","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/e/de89e9e1-485b-42e5-9728-5d6f948999e1.jpg?1783947466","artUrl":"https://cards.scryfall.io/art_crop/front/d/e/de89e9e1-485b-42e5-9728-5d6f948999e1.jpg?1783947466","commanderLegal":"legal","set":"ice","releasedAt":"1995-06-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const yare = (): CardDef => ({"oracleId":"f0f24c6d-80fb-4e99-a74d-6ed9d349ed3d","name":"Yare","manaCost":"{2}{W}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target creature defending player controls gets +3/+0 until end of turn. That creature can block up to two additional creatures this turn.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/a/9a14343d-c2cd-4a67-ae54-6b6a4677ca85.jpg?1783947114","artUrl":"https://cards.scryfall.io/art_crop/front/9/a/9a14343d-c2cd-4a67-ae54-6b6a4677ca85.jpg?1783947114","commanderLegal":"legal","set":"mir","releasedAt":"1996-10-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const blaze = (): CardDef => ({"oracleId":"b330ac89-790e-4cc9-96a5-532c48252088","name":"Blaze of Glory","manaCost":"{W}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Cast this spell only during combat before blockers are declared.\nTarget creature defending player controls can block any number of creatures this turn. It blocks each attacking creature this turn if able.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/8/98fba951-c5bb-497c-9292-ce1b2a1e1247.jpg?1783948716","artUrl":"https://cards.scryfall.io/art_crop/front/9/8/98fba951-c5bb-497c-9292-ce1b2a1e1247.jpg?1783948716","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const johan = (): CardDef => ({"oracleId":"ad33ada7-4f89-4cab-88db-1f4d024baa36","name":"Johan","manaCost":"{3}{R}{G}{W}","cmc":6,"typeLine":"Legendary Creature — Human Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"At the beginning of combat on your turn, you may have Johan gain \"Johan can't attack\" until end of combat. If you do, attacking doesn't cause creatures you control to tap this combat if Johan is untapped.","power":"5","toughness":"4","colors":["G","R","W"],"colorIdentity":["G","R","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/8/b851d5b4-7991-49d4-8a52-bf233f960cbf.jpg?1783948038","artUrl":"https://cards.scryfall.io/art_crop/front/b/8/b851d5b4-7991-49d4-8a52-bf233f960cbf.jpg?1783948038","commanderLegal":"legal","set":"leg","releasedAt":"1994-06-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const blueBear = (name = "Test Blue Bear") => bear({ name, manaCost: "{1}{U}", colors: ["U"], colorIdentity: ["U"] });
const blackBear = (name = "Test Black Bear") => bear({ name, manaCost: "{1}{B}", colors: ["B"], colorIdentity: ["B"] });
const flier = (name = "Test Blue Flier") => bear({ name, manaCost: "{1}{U}", colors: ["U"], colorIdentity: ["U"], oracleText: "Flying", keywords: ["Flying"] });
const wall = card("Test Wall", "Creature — Wall", "{1}{W}", { power: "1", toughness: "6" });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const next = (s: GameState, p: PlayerId, n = 1) => s.turnOrder[(s.turnOrder.indexOf(p) + n) % 4]!;
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; chooseMay answered with `may`, questions of `me` stop it, bots answer the rest. */
const settle = (s: GameState, opts: { me?: PlayerId[]; may?: boolean } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && opts.me?.includes(p.player)) return s;
    if (p?.kind === "chooseMay" && opts.may !== undefined) s = act(s, { type: "chooseMay", player: p.player, yes: opts.may });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const landsOf = (s: GameState, p: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === p && objIsType(s, s.objects[id]!, "Land"));
/** At `p`'s upkeep with the trigger resolving: the question for `p`. */
const upkeepPick = (s0: GameState, p: PlayerId) => settle(passUntil(s0, "upkeep", p), { me: [p] });

describe("Lane B round B145", () => {
  it("compiles all nine cards", () => supported(thelon(), magnetic(), dreamTides(), mudslide(), reclamation(), flooded(), yare(), blaze(), johan()));

  it("Thelon's Curse: blue creatures stay tapped; at that player's upkeep they choose any of them and pay {U} each to untap", () => {
    const { s: s0, ap } = setup([]);
    const opp = next(s0, ap);
    putOnBattlefield(s0, ap, thelon());
    const b1 = putOnBattlefield(s0, opp, blueBear("Test Blue One"));
    const b2 = putOnBattlefield(s0, opp, blueBear("Test Blue Two"));
    const green = putOnBattlefield(s0, opp, bear({ name: "Test Green Bear" }));
    const theirs = putOnBattlefield(s0, ap, blueBear("Test Other Blue"));
    for (const id of [b1, b2, green, theirs]) s0.objects[id]!.tapped = true;
    let s = upkeepPick(s0, opp);
    // The untap step left the blue ones tapped (the green one untapped); only that player's tapped blue creatures are offered.
    expect(s.objects[green]!.tapped).toBe(false);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: opp, action: "choose", anyNumber: true, min: 0, payEach: "{U}" });
    expect((s.pending as { options: string[] }).options.sort()).toEqual([b1, b2].sort());
    // Two chosen need {U}{U}: with only {U} in the pool, none of it is paid (rulings on Mudslide).
    s.players[opp]!.manaPool.U = 1;
    expect(() => applyAction(s, { type: "pickPermanents", player: opp, ids: [b1, b2] })).toThrow(/not enough mana/);
    s = settle(act(s, { type: "pickPermanents", player: opp, ids: [b1] }));
    expect(s.players[opp]!.manaPool.U).toBe(0);
    expect([s.objects[b1]!.tapped, s.objects[b2]!.tapped, s.objects[theirs]!.tapped]).toEqual([false, true, true]);
  });

  it("Thelon's Curse: choosing none pays nothing and untaps nothing; with no tapped blue creature nothing is asked", () => {
    const { s: s0, ap } = setup([]);
    const opp = next(s0, ap);
    putOnBattlefield(s0, ap, thelon());
    const b1 = putOnBattlefield(s0, opp, blueBear());
    s0.objects[b1]!.tapped = true;
    let s = upkeepPick(s0, opp);
    s.players[opp]!.manaPool.U = 1;
    s = settle(act(s, { type: "pickPermanents", player: opp, ids: [] }));
    expect(s.objects[b1]!.tapped).toBe(true);
    expect(s.players[opp]!.manaPool.U).toBe(1);
    // The next player has no tapped blue creature: the trigger resolves without a question.
    const t = upkeepPick(s, next(s, opp));
    expect(t.pending).toBeNull();
  });

  it("Magnetic Mountain: {4} for each, paid all at once", () => {
    const { s: s0, ap } = setup([]);
    const opp = next(s0, ap);
    putOnBattlefield(s0, ap, magnetic());
    const b1 = putOnBattlefield(s0, opp, blueBear("Test Blue One"));
    const b2 = putOnBattlefield(s0, opp, blueBear("Test Blue Two"));
    for (const id of [b1, b2]) s0.objects[id]!.tapped = true;
    let s = upkeepPick(s0, opp);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", payEach: "{4}" });
    s.players[opp]!.manaPool.C = 7;
    expect(() => applyAction(s, { type: "pickPermanents", player: opp, ids: [b1, b2] })).toThrow(/not enough mana .*\{4\}\{4\}/);
    s = settle(act(s, { type: "pickPermanents", player: opp, ids: [b2] }));
    expect(s.players[opp]!.manaPool.C).toBe(3);
    expect([s.objects[b1]!.tapped, s.objects[b2]!.tapped]).toEqual([true, false]);
  });

  it("Dream Tides: no creature untaps in its untap step; only nongreen ones can be paid for, {2} each", () => {
    const { s: s0, ap } = setup([]);
    const opp = next(s0, ap);
    putOnBattlefield(s0, ap, dreamTides());
    const blue = putOnBattlefield(s0, opp, blueBear());
    const green = putOnBattlefield(s0, opp, bear({ name: "Test Green Bear" }));
    for (const id of [blue, green]) s0.objects[id]!.tapped = true;
    let s = upkeepPick(s0, opp);
    expect(s.objects[green]!.tapped).toBe(true);
    expect((s.pending as { options: string[] }).options).toEqual([blue]);
    s.players[opp]!.manaPool.C = 2;
    s = settle(act(s, { type: "pickPermanents", player: opp, ids: [blue] }));
    expect([s.objects[blue]!.tapped, s.objects[green]!.tapped]).toEqual([false, true]);
  });

  it("Mudslide: creatures without flying stay tapped and can be paid for; fliers untap as usual", () => {
    const { s: s0, ap } = setup([]);
    const opp = next(s0, ap);
    putOnBattlefield(s0, ap, mudslide());
    const walker = putOnBattlefield(s0, opp, bear({ name: "Test Walker" }));
    const fly = putOnBattlefield(s0, opp, flier());
    for (const id of [walker, fly]) s0.objects[id]!.tapped = true;
    let s = upkeepPick(s0, opp);
    expect(s.objects[fly]!.tapped).toBe(false);
    expect((s.pending as { options: string[] }).options).toEqual([walker]);
    s.players[opp]!.manaPool.R = 2;
    s = settle(act(s, { type: "pickPermanents", player: opp, ids: [walker] }));
    expect(s.objects[walker]!.tapped).toBe(false);
  });

  it("a bot untaps the creatures it can pay for on another player's upkeep's turn, as many as mana allows", () => {
    const { s: s0, ap } = setup([]);
    const opp = next(s0, ap);
    putOnBattlefield(s0, ap, thelon());
    const ids = [1, 2, 3].map((k) => putOnBattlefield(s0, opp, blueBear(`Test Blue ${k}`)));
    for (const id of ids) s0.objects[id]!.tapped = true;
    for (let k = 0; k < 4; k++) putOnBattlefield(s0, opp, card(`Test Island ${k}`, "Basic Land — Island"));
    const s = upkeepPick(s0, opp);
    // Its own upkeep: half its four lands at most, so two of the three.
    const t = settle(s.pending ? (() => { let x = s; for (const a of botActions(s, opp)) x = act(x, a); return x; })() : s);
    expect(ids.filter((id) => !t.objects[id]!.tapped)).toHaveLength(2);
    expect(landsOf(t, opp).filter((id) => t.objects[id]!.tapped)).toHaveLength(2);
  });

  it("Reclamation: each black creature that attacks costs its controller a land; other creatures attack freely", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, reclamation());
    const black = putOnBattlefield(s0, ap, blackBear());
    const green = putOnBattlefield(s0, ap, bear({ name: "Test Green Bear" }));
    expect(attackProblem(s0, s0.objects[green]!, opp)).toBeNull();
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: black, defender: opp }, { attacker: green, defender: opp }] });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "sacrifice", attackCost: true, count: 1, objectId: black });
    const land = landsOf(s, ap)[0]!;
    s = act(s, { type: "pickPermanents", player: ap, ids: [land] });
    expect(s.objects[land]!.zone).toBe("graveyard");
    expect([s.objects[black]!.attacking, s.objects[green]!.attacking]).toEqual([opp, opp]);
    // With no land, a black creature can't attack.
    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    putOnBattlefield(s1, ap1, reclamation());
    const b1 = putOnBattlefield(s1, ap1, blackBear());
    for (const id of landsOf(s1, ap1)) { s1.battlefield.splice(s1.battlefield.indexOf(id), 1); s1.objects[id]!.zone = "graveyard"; }
    expect(attackProblem(s1, s1.objects[b1]!, opp1)).toMatch(/can't attack unless you sacrifice a land/);
  });

  it("Flooded Woodlands: two green attackers cost two lands", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, flooded());
    const g1 = putOnBattlefield(s0, ap, bear({ name: "Test Green One" }));
    const g2 = putOnBattlefield(s0, ap, bear({ name: "Test Green Two" }));
    const before = landsOf(s0, ap).length;
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: g1, defender: opp }, { attacker: g2, defender: next(s0, ap, 2) }] });
    for (let k = 0; k < 2; k++) {
      expect(s.pending).toMatchObject({ kind: "pickPermanents", attackCost: true, count: 1 });
      s = act(s, { type: "pickPermanents", player: ap, ids: [landsOf(s, ap)[0]!] });
    }
    expect(landsOf(s, ap)).toHaveLength(before - 2);
    expect(s.objects[g2]!.attacking).toBe(next(s0, ap, 2));
  });

  it("Yare: only a creature a defending player controls, so only during combat and never the active player's", () => {
    const { s: s0, ap, ids } = setup([yare()]);
    const opp = next(s0, ap);
    const mine = putOnBattlefield(s0, ap, bear({ name: "Test My Bear" }));
    const theirs = putOnBattlefield(s0, opp, wall);
    const third = putOnBattlefield(s0, next(s0, ap, 2), bear({ name: "Test Third Bear" }));
    const spec = () => ({ kind: "object" as const, types: ["Creature"], notTypes: [], notColors: [], defendingAny: true as const, text: "target creature defending player controls" });
    // Main phase: no defending player, so no legal target.
    expect(legalTargets(s0, spec(), ap)).toEqual([]);
    expect(planCast(s0, ap, ids[0]!, [tgt(theirs)])).toBeNull();
    // Beginning of combat on our turn: each opponent is a defending player (CR 802.2), our own creature isn't theirs.
    const s1 = passUntil(s0, "beginCombat", ap);
    const legal = legalTargets(s1, spec(), ap).flatMap((t) => (t.kind === "object" ? [t.id] : []));
    expect(legal).toContain(theirs);
    expect(legal).toContain(third);
    expect(legal).not.toContain(mine);
    let s = run(s1, planCast(s1, ap, ids[0]!, [tgt(theirs)]));
    s = settle(s);
    expect(power(s, s.objects[theirs]!)).toBe(4);
    expect(maxBlocks(s, s.objects[theirs]!)).toBe(3);
  });

  it("Yare: on another player's turn, the caster's own creature is a defending player's", () => {
    const { s: s0, ap, ids } = setup([yare()]);
    const opp = next(s0, ap);
    const mine = putOnBattlefield(s0, ap, bear({ name: "Test My Bear" }));
    const actives = putOnBattlefield(s0, opp, bear({ name: "Test Active Bear" }));
    s0.players[ap]!.hand = [ids[0]!];
    let s1 = passUntil(s0, "beginCombat", opp);
    // Priority comes to the caster once the players before them pass.
    for (let i = 0; i < 4 && waitingOn(s1) !== ap; i++) s1 = act(s1, { type: "passPriority", player: waitingOn(s1)! });
    expect(s1.step).toBe("beginCombat");
    expect(planCast(s1, ap, ids[0]!, [tgt(actives)])).toBeNull();
    expect(planCast(s1, ap, ids[0]!, [tgt(mine)])).not.toBeNull();
  });

  it("Blaze of Glory: the creature has to block every attacker it can; a bot defending blocks them all", () => {
    const { s: s0, ap, ids, opp } = setup([blaze()]);
    const a1 = putOnBattlefield(s0, ap, bear({ name: "Test Attacker One" }));
    const a2 = putOnBattlefield(s0, ap, bear({ name: "Test Attacker Two" }));
    const w = putOnBattlefield(s0, opp, wall);
    const other = putOnBattlefield(s0, opp, bear({ name: "Test Other Defender" }));
    // Before combat it can't be cast (and there's no defending player then).
    expect(planCast(s0, ap, ids[0]!, [tgt(w)])).toBeNull();
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: a1, defender: opp }, { attacker: a2, defender: opp }] });
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(w)])), { me: [opp] });
    for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "declareBlockers", player: opp });
    expect(() => applyAction(s, { type: "declareBlockers", player: opp, blocks: [] })).toThrow(/must block each attacking creature/);
    expect(() => applyAction(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: w, attacker: a1 }] })).toThrow(/must block each attacking creature/);
    // Another creature may block too; the Wall blocking both obeys it.
    const t = applyAction(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: w, attacker: a1 }, { blocker: w, attacker: a2 }, { blocker: other, attacker: a2 }] });
    expect(t.objects[w]!.blocking?.sort()).toEqual([a1, a2].sort());
    // The bot's own blocks obey it.
    let u = s;
    for (const a of botActions(s, opp)) u = act(u, a);
    expect(u.objects[w]!.blocking?.sort()).toEqual([a1, a2].sort());
  });

  it("Blaze of Glory: a tapped creature isn't made to block (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([blaze()]);
    const a1 = putOnBattlefield(s0, ap, bear({ name: "Test Attacker One" }));
    const w = putOnBattlefield(s0, opp, wall);
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: a1, defender: opp }] });
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(w)])), { me: [opp] });
    s.objects[w]!.tapped = true;
    for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    if (s.pending?.kind === "declareBlockers") expect(() => applyAction(s, { type: "declareBlockers", player: opp, blocks: [] })).not.toThrow();
    else expect(s.step).not.toBe("declareAttackers");
  });

  it("Johan: if it gives up attacking this combat, attacking doesn't tap your creatures while it's untapped", () => {
    const { s: s0, ap, opp } = setup([]);
    s0.players[ap]!.command = [];
    const j = putOnBattlefield(s0, ap, johan());
    const b1 = putOnBattlefield(s0, ap, bear({ name: "Test Bear One" }));
    const b2 = putOnBattlefield(s0, ap, bear({ name: "Test Bear Two" }));
    let s = settle(passUntil(s0, "beginCombat", ap), { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(s, { may: true });
    s = passUntil(s, "declareAttackers", ap);
    expect(() => applyAction(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: j, defender: opp }] })).toThrow(/can't attack/);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b1, defender: opp }, { attacker: b2, defender: opp }] });
    expect([s.objects[b1]!.attacking, s.objects[b1]!.tapped, s.objects[b2]!.tapped]).toEqual([opp, false, false]);
  });

  it("Johan: tapped, or the question declined, creatures tap as they attack", () => {
    for (const how of ["tapped", "declined"] as const) {
      const { s: s0, ap, opp } = setup([]);
      s0.players[ap]!.command = [];
      const j = putOnBattlefield(s0, ap, johan());
      const b1 = putOnBattlefield(s0, ap, bear({ name: "Test Bear One" }));
      let s = passUntil(s0, "beginCombat", ap);
      s = settle(s, { may: how === "tapped" });
      if (how === "tapped") s.objects[j]!.tapped = true;
      s = passUntil(s, "declareAttackers", ap);
      s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b1, defender: opp }] });
      expect(s.objects[b1]!.tapped, how).toBe(true);
    }
  });

  it("a bot has Johan stay back when two other creatures can attack", () => {
    const { s: s0, ap } = setup([]);
    s0.players[ap]!.command = [];
    putOnBattlefield(s0, ap, johan());
    putOnBattlefield(s0, ap, bear({ name: "Test Bear One" }));
    putOnBattlefield(s0, ap, bear({ name: "Test Bear Two" }));
    const s = settle(passUntil(s0, "beginCombat", ap), { me: [ap] });
    expect(botActions(s, ap)).toEqual([{ type: "chooseMay", player: ap, yes: true }]);
  });
});
