// Round 297: harder cards from the "Out after round N" lists, most played first.

import { describe, expect, it } from "vitest";
import { act, addEffect, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { attackProblem, mayPlayFromExile, potentialAttackers, syncControl } from "../src/game";
import { applyAction, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Passes priority until the stack and the trigger queue are empty or someone is asked something. */
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && !s.pending && (s.stack.length || s.triggerQueue.length || i === 0); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Passes (no attacks, no blocks) until `done`. */
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
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
/** A fresh copy of `def` in `pid`'s `where` (the top of the library). */
const put = (s: GameState, pid: PlayerId, def: CardDef, where: "library" | "hand" | "graveyard") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
const cast = (s: GameState, pid: PlayerId, id: string, targets?: TargetChoice[]) => settle(run(s, planCast(s, pid, id, targets)));
/** Attacks `defender` with `attackers` (no blocks) and passes until the combat damage step is over. */
const attack = (s0: GameState, ap: PlayerId, attackers: string[], defender: PlayerId) => {
  let s = passUntil(s0, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks: attackers.map((attacker) => ({ attacker, defender })) } as Action);
  return until(s, (x) => !!x.pending && x.pending.kind !== "declareBlockers" || x.step === "endCombat" || x.step === "main2");
};
const draws = (n: number) => card(`Test Draw ${n}`, "Instant", "{0}", { oracleText: n === 1 ? "Draw a card." : `Draw ${["", "", "two", "three"][n]} cards.` });
const theyDraw = card("Test Target Draw", "Instant", "{0}", { oracleText: "Target player draws a card." });

// Real oracle text (Scryfall).
const alchemist = (): CardDef => ({"oracleId":"3807e6fe-0555-4b09-aef2-efd58abaf669","name":"Undead Alchemist","manaCost":"{3}{U}","cmc":4,"typeLine":"Creature — Zombie","supertypes":[],"types":["Creature"],"subtypes":["Zombie"],"oracleText":"If a Zombie you control would deal combat damage to a player, instead that player mills that many cards.\nWhenever a creature card is put into an opponent's graveyard from their library, exile that card and create a 2/2 black Zombie creature token.","power":"4","toughness":"2","colors":["U"],"colorIdentity":["U"],"keywords":["Mill"],"commanderLegal":"legal","set":"isd","releasedAt":"2011-09-30","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const szadek = (): CardDef => ({"oracleId":"c40c823c-5954-457a-81a6-02683da57f7f","name":"Szadek, Lord of Secrets","manaCost":"{3}{U}{U}{B}{B}","cmc":7,"typeLine":"Legendary Creature — Vampire","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Vampire"],"oracleText":"Flying\nIf Szadek would deal combat damage to a player, instead put that many +1/+1 counters on Szadek and that player mills that many cards.","power":"5","toughness":"5","colors":["B","U"],"colorIdentity":["B","U"],"keywords":["Flying","Mill"],"commanderLegal":"legal","set":"rav","releasedAt":"2005-10-07","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const eruth = (): CardDef => ({"oracleId":"a0380b63-58ef-4545-beec-6ad307bbc21b","name":"Eruth, Tormented Prophet","manaCost":"{1}{U}{R}","cmc":3,"typeLine":"Legendary Creature — Human Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"If you would draw a card, exile the top two cards of your library instead. You may play those cards this turn.","power":"2","toughness":"4","colors":["R","U"],"colorIdentity":["R","U"],"keywords":[],"commanderLegal":"legal","set":"dbl","releasedAt":"2022-01-28","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const uba = (): CardDef => ({"oracleId":"766c644c-04fe-4b01-93dd-09a50d78d01f","name":"Uba Mask","manaCost":"{4}","cmc":4,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"If a player would draw a card, that player exiles that card face up instead.\nEach player may play lands and cast spells from among cards they exiled with this artifact this turn.","colors":[],"colorIdentity":[],"keywords":[],"commanderLegal":"legal","set":"chk","releasedAt":"2004-10-01","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const asmodeus = (): CardDef => ({"oracleId":"1e4032f6-9741-4845-9325-781c9e489172","name":"Asmodeus the Archfiend","manaCost":"{4}{B}{B}","cmc":6,"typeLine":"Legendary Creature — Devil God","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Devil","God"],"oracleText":"Binding Contract — If you would draw a card, exile the top card of your library face down instead.\n{B}{B}{B}: Draw seven cards.\n{B}: Return all cards exiled with Asmodeus to their owner's hand and you lose that much life.","power":"6","toughness":"6","colors":["B"],"colorIdentity":["B"],"keywords":[],"commanderLegal":"legal","set":"afr","releasedAt":"2021-07-23","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const thief = (): CardDef => ({"oracleId":"f8dab16e-1d50-443e-9431-8b6f1cf61c9c","name":"Notion Thief","manaCost":"{2}{U}{B}","cmc":4,"typeLine":"Creature — Human Rogue","supertypes":[],"types":["Creature"],"subtypes":["Human","Rogue"],"oracleText":"Flash\nIf an opponent would draw a card except the first one they draw in each of their draw steps, instead that player skips that draw and you draw a card.","power":"3","toughness":"1","colors":["B","U"],"colorIdentity":["B","U"],"keywords":["Flash"],"commanderLegal":"legal","set":"sld","releasedAt":"2026-04-27","rarity":"rare","layout":"normal","gameChanger":true} as CardDef);

describe("Undead Alchemist: a Zombie's combat damage to a player becomes a mill, and milled creature cards become Zombies", () => {
  it("the Zombie deals no damage, that player mills that many; each creature card milled is exiled for a 2/2 Zombie; a non-Zombie deals its damage", () => {
    supported(alchemist());
    const { s: s0, ap, opp } = setup([]);
    const alch = putOnBattlefield(s0, ap, alchemist());
    const other = putOnBattlefield(s0, ap, bear({ name: "Test Plain Bear" }));
    const top = [card("Test Land One", "Land"), bear({ name: "Test Milled Bear" }), card("Test Land Two", "Land"), bear({ name: "Test Milled Cub" })].map((d) => put(s0, opp, d, "library"));
    const life = s0.players[opp]!.life;
    const tokensBefore = s0.battlefield.filter((id) => s0.objects[id]!.isToken).length;
    const s = attack(s0, ap, [alch, other], opp);
    // Only the bear's 2 damage is dealt.
    expect(s.players[opp]!.life).toBe(life - 2);
    expect(zone(s, top[0]!)).toBe("graveyard");
    expect(zone(s, top[2]!)).toBe("graveyard");
    expect(zone(s, top[1]!)).toBe("exile");
    expect(zone(s, top[3]!)).toBe("exile");
    const tokens = s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap);
    expect(tokens.length - tokensBefore).toBe(2);
    expect(characteristics(s, s.objects[tokens[0]!]!).subtypes).toContain("Zombie");
    expect(s.log.some((l) => /Undead Alchemist: 4 damage from Undead Alchemist to .* is replaced by a mill/.test(l.text))).toBe(true);
  });

  it("with two Alchemists the damage is replaced once (a mill of 4, not 8); each makes a token for the milled creature card, the first exiles it", () => {
    const { s: s0, ap, opp } = setup([]);
    const alch = putOnBattlefield(s0, ap, alchemist());
    putOnBattlefield(s0, ap, alchemist());
    const top = [card("Test Land One", "Land"), card("Test Land Two", "Land"), card("Test Land Three", "Land"), bear({ name: "Test Milled Bear" }), card("Test Land Four", "Land")].map((d) => put(s0, opp, d, "library"));
    const libBefore = s0.players[opp]!.library.length;
    const s = attack(s0, ap, [alch], opp);
    expect(libBefore - s.players[opp]!.library.length).toBe(4);
    expect(zone(s, top[0]!)).toBe("library");
    expect(zone(s, top[3]!)).toBe("exile");
    expect(s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap)).toHaveLength(2);
  });
});

describe("Szadek, Lord of Secrets: its combat damage to a player becomes +1/+1 counters on it and a mill", () => {
  const haven = card("Test Haven", "Enchantment", "{2}", { oracleText: "Prevent all damage that would be dealt to you." });
  it("puts that many +1/+1 counters on Szadek and the player mills that many; no life is lost", () => {
    supported(szadek());
    const { s: s0, ap, opp } = setup([]);
    const sz = putOnBattlefield(s0, ap, szadek());
    const life = s0.players[opp]!.life;
    const lib = s0.players[opp]!.library.length;
    const s = attack(s0, ap, [sz], opp);
    expect(s.players[opp]!.life).toBe(life);
    expect(lib - s.players[opp]!.library.length).toBe(5);
    expect(s.objects[sz]!.counters["+1/+1"]).toBe(5);
    expect(s.players[ap]!.commanderDamage?.[sz] ?? 0).toBe(0);
  });

  it("with a prevention effect too, the damaged player chooses which applies first (rulings): prevention stops the counters and the mill", () => {
    const { s: s0, ap, opp } = setup([]);
    const sz = putOnBattlefield(s0, ap, szadek());
    putOnBattlefield(s0, opp, haven);
    const lib = s0.players[opp]!.library.length;
    let s = attack(s0, ap, [sz], opp);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: opp, what: "damageShield" });
    const labels = (s.pending as Extract<GameState["pending"], { kind: "chooseOption" }>).labels!;
    expect(labels[0]).toBe("Prevent the damage");
    expect(labels[1]).toMatch(/counters on Szadek, Lord of Secrets and mill that many cards instead/);
    const prevented = until(act(s, { type: "chooseOption", player: opp, choice: "0" }), (x) => x.step === "endCombat" || x.step === "main2");
    expect(prevented.objects[sz]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(prevented.players[opp]!.library.length).toBe(lib);
    s = until(act(s, { type: "chooseOption", player: opp, choice: "1" }), (x) => x.step === "endCombat" || x.step === "main2");
    expect(s.objects[sz]!.counters["+1/+1"]).toBe(5);
    expect(lib - s.players[opp]!.library.length).toBe(5);
  });
});

describe("Eruth, Tormented Prophet: each draw exiles the top two cards instead, playable this turn", () => {
  it("a draw of two exiles four cards; you may play them this turn, not after it", () => {
    supported(eruth());
    const { s: s0, ap, ids } = setup([draws(2)]);
    putOnBattlefield(s0, ap, eruth());
    const top = s0.players[ap]!.library.slice(0, 4);
    const hand = s0.players[ap]!.hand.length;
    let s = cast(s0, ap, ids[0]!);
    expect(top.map((id) => zone(s, id))).toEqual(["exile", "exile", "exile", "exile"]);
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
    expect(top.every((id) => mayPlayFromExile(s, s.objects[id]!, ap))).toBe(true);
    s = until(s, (x) => x.turn > s0.turn);
    expect(top.some((id) => mayPlayFromExile(s, s.objects[id]!, ap))).toBe(false);
  });

  it("with an empty library nothing is exiled and its player doesn't lose (rulings)", () => {
    const { s: s0, ap, ids } = setup([draws(1)]);
    putOnBattlefield(s0, ap, eruth());
    const p = s0.players[ap]!;
    for (const id of p.library.splice(0)) { s0.objects[id]!.zone = "graveyard"; p.graveyard.push(id); }
    const s = cast(s0, ap, ids[0]!);
    expect(s.players[ap]!.lost).toBeFalsy();
    expect(s.log.some((l) => /would draw from an empty library; Eruth, Tormented Prophet replaces it/.test(l.text))).toBe(true);
  });

  it("with an opponent's Notion Thief too, the drawing player chooses which applies (CR 616.1)", () => {
    const { s: s0, ap, opp, ids } = setup([draws(1)]);
    putOnBattlefield(s0, ap, eruth());
    putOnBattlefield(s0, opp, thief());
    const top = s0.players[ap]!.library.slice(0, 2);
    let s = cast(s0, ap, ids[0]!);
    expect(s.pending).toMatchObject({ kind: "drawInstead", player: ap });
    const pend = s.pending as Extract<GameState["pending"], { kind: "drawInstead" }>;
    expect(pend.options).toContain("thief");
    const ex = pend.options.find((o) => o.startsWith("exiles:"))!;
    expect(pend.labels[pend.options.indexOf(ex)]).toMatch(/Exile the top 2 cards of your library instead; you may play them this turn \(Eruth/);
    s = settle(act(s, { type: "drawInstead", player: ap, choice: ex }));
    expect(top.map((id) => zone(s, id))).toEqual(["exile", "exile"]);
  });
});

describe("Uba Mask: every player's draws are exiled face up, playable by that player this turn while the Mask stays", () => {
  it("an opponent's draw exiles their top card; they may play it, you may not; once the Mask is gone, neither may", () => {
    supported(uba());
    const shatter = card("Test Shatter", "Instant", "{0}", { oracleText: "Destroy target artifact." });
    const { s: s0, ap, opp, ids } = setup([theyDraw, shatter]);
    const mask = putOnBattlefield(s0, ap, uba());
    const top = s0.players[opp]!.library[0]!;
    const hand = s0.players[opp]!.hand.length;
    let s = cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]);
    expect(zone(s, top)).toBe("exile");
    expect(s.objects[top]!.hiddenExile).toBeUndefined();
    expect(s.players[opp]!.hand.length).toBe(hand);
    expect(mayPlayFromExile(s, s.objects[top]!, opp)).toBe(true);
    expect(mayPlayFromExile(s, s.objects[top]!, ap)).toBe(false);
    s = cast(s, ap, ids[1]!, [tgt(mask)]);
    expect(zone(s, mask)).toBe("graveyard");
    expect(mayPlayFromExile(s, s.objects[top]!, opp)).toBe(false);
  });
});

describe("Asmodeus the Archfiend: draws exiled face down, then returned to hand for life", () => {
  it("each draw exiles the top card face down (nobody may look); {B} returns them all to hand and you lose that much life", () => {
    supported(asmodeus());
    const { s: s0, ap, ids } = setup([draws(2)]);
    const asm = putOnBattlefield(s0, ap, asmodeus());
    const top = s0.players[ap]!.library.slice(0, 2);
    let s = cast(s0, ap, ids[0]!);
    expect(top.map((id) => zone(s, id))).toEqual(["exile", "exile"]);
    expect(top.every((id) => s.objects[id]!.hiddenExile?.seen.length === 0)).toBe(true);
    expect(top.some((id) => mayPlayFromExile(s, s.objects[id]!, ap))).toBe(false);
    const life = s.players[ap]!.life;
    s = settle(run(s, planActivate(s, ap, asm, 1)));
    expect(top.map((id) => zone(s, id))).toEqual(["hand", "hand"]);
    expect(s.players[ap]!.life).toBe(life - 2);
  });
});
const saddlebrute = (): CardDef => ({"oracleId":"f9d72bd4-8b4c-47bb-9361-a8cb5e5f64cb","name":"Frenzied Saddlebrute","manaCost":"{4}{R}","cmc":5,"typeLine":"Creature — Orc Warrior","supertypes":[],"types":["Creature"],"subtypes":["Orc","Warrior"],"oracleText":"Haste\nAll creatures can attack your opponents and planeswalkers your opponents control as though those creatures had haste.","power":"5","toughness":"4","colors":["R"],"colorIdentity":["R"],"keywords":["Haste"],"commanderLegal":"legal","set":"cmr","releasedAt":"2020-11-20","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const zidane = (): CardDef => ({"oracleId":"f267fb54-1881-464c-81af-9e03c3f3b41d","name":"Zidane, Tantalus Thief","manaCost":"{3}{R}{W}","cmc":5,"typeLine":"Legendary Creature — Human Mutant Scout","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Mutant","Scout"],"oracleText":"When Zidane enters, gain control of target creature an opponent controls until end of turn. Untap it. It gains lifelink and haste until end of turn.\nWhenever an opponent gains control of a permanent from you, you create a Treasure token.","power":"3","toughness":"3","colors":["R","W"],"colorIdentity":["R","W"],"keywords":["Treasure"],"commanderLegal":"legal","set":"fin","releasedAt":"2025-06-13","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const grolnok = (): CardDef => ({"oracleId":"53029460-50a0-4934-8fa9-0271517cd5d0","name":"Grolnok, the Omnivore","manaCost":"{2}{G}{U}","cmc":4,"typeLine":"Legendary Creature — Frog","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Frog"],"oracleText":"Whenever a Frog you control attacks, mill three cards.\nWhenever a permanent card is put into your graveyard from your library, exile it with a croak counter on it.\nYou may play lands and cast spells from among cards you own in exile with croak counters on them.","power":"3","toughness":"3","colors":["G","U"],"colorIdentity":["G","U"],"keywords":["Mill"],"commanderLegal":"legal","set":"dbl","releasedAt":"2022-01-28","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const ascension = (): CardDef => ({"oracleId":"5966c464-5f63-4c71-9317-e2ca79da5aba","name":"Archmage Ascension","manaCost":"{2}{U}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of each end step, if you drew two or more cards this turn, you may put a quest counter on this enchantment.\nAs long as this enchantment has six or more quest counters on it, if you would draw a card, you may instead search your library for a card, put that card into your hand, then shuffle.","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","set":"zen","releasedAt":"2009-10-02","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);

describe("Frenzied Saddlebrute: any creature may attack your opponents and their planeswalkers as though it had haste", () => {
  it("your creature that just came under your control may attack an opponent; without the Saddlebrute it may not", () => {
    supported(saddlebrute());
    const { s: s0, ap, opp } = setup([]);
    const fresh = putOnBattlefield(s0, ap, bear({ name: "Test Fresh Bear" }), { sick: true });
    expect(potentialAttackers(s0, ap).map((o) => o.id)).not.toContain(fresh);
    const brute = putOnBattlefield(s0, ap, saddlebrute());
    expect(potentialAttackers(s0, ap).map((o) => o.id)).toContain(fresh);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: fresh, defender: opp }, { attacker: brute, defender: opp }] } as Action);
    expect(s.objects[fresh]!.attacking).toBe(opp);
  });

  it("an opponent's summoning-sick creature may attack the Saddlebrute's other opponents, not its controller (rulings)", () => {
    const { s, ap, opp } = setup([]);
    const third = s.turnOrder.find((p) => p !== ap && p !== opp)!;
    putOnBattlefield(s, ap, saddlebrute());
    const theirs = putOnBattlefield(s, opp, bear({ name: "Test Their Bear" }), { sick: true });
    const o = s.objects[theirs]!;
    expect(attackProblem(s, o, ap)).toMatch(/summoning sickness/);
    expect(attackProblem(s, o, third)).toBeNull();
  });
});

describe("Zidane, Tantalus Thief: a Treasure whenever an opponent gains control of a permanent from you", () => {
  it("one Treasure for each permanent an opponent takes, Zidane itself included when it goes at the same time (rulings)", () => {
    supported(zidane());
    const { s: s0, ap, opp } = setup([]);
    const z = putOnBattlefield(s0, ap, zidane());
    const b1 = putOnBattlefield(s0, ap, bear({ name: "Test Taken Bear" }));
    const b2 = putOnBattlefield(s0, ap, bear({ name: "Test Other Bear" }));
    syncControl(s0); // the controllers seen so far
    const treasures = (s: GameState) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap && characteristics(s, s.objects[id]!).subtypes.includes("Treasure")).length;
    addEffect(s0, opp, [b1], [{ kind: "control" }], "game");
    syncControl(s0);
    let s = settle(s0);
    expect(treasures(s)).toBe(1);
    addEffect(s, opp, [z, b2], [{ kind: "control" }], "game");
    syncControl(s);
    s = settle(s);
    expect(treasures(s)).toBe(3);
  });

  it("taking an opponent's creature doesn't make one", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, zidane());
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Test Their Bear" }));
    syncControl(s0);
    addEffect(s0, ap, [theirs], [{ kind: "control" }], "game");
    syncControl(s0);
    const s = settle(s0);
    expect(s.battlefield.some((id) => s.objects[id]!.isToken)).toBe(false);
  });
});

describe("Grolnok, the Omnivore: permanent cards put into your graveyard from your library are exiled with croak counters, and you may play them", () => {
  it("milled permanent cards go to exile with a croak counter and are playable; others stay in the graveyard", () => {
    supported(grolnok());
    const mill = card("Test Mill", "Sorcery", "{0}", { oracleText: "Mill three cards." });
    const { s: s0, ap, opp, ids } = setup([mill]);
    putOnBattlefield(s0, ap, grolnok());
    const top = [card("Test Spell", "Instant", "{U}", { oracleText: "Draw a card." }), bear({ name: "Test Croaked Bear" }), card("Test Croaked Land", "Land")].map((d) => put(s0, ap, d, "library"));
    const theirs = put(s0, opp, bear({ name: "Test Their Bear" }), "graveyard");
    const s = cast(s0, ap, ids[0]!);
    expect(zone(s, top[0]!)).toBe("graveyard");
    for (const id of [top[1]!, top[2]!]) {
      expect(zone(s, id)).toBe("exile");
      expect(s.objects[id]!.counters.croak).toBe(1);
      expect(mayPlayFromExile(s, s.objects[id]!, ap)).toBe(true);
    }
    expect(zone(s, theirs)).toBe("graveyard");
    expect(mayPlayFromExile(s, s.objects[top[1]!]!, opp)).toBe(false);
  });
});

describe("Archmage Ascension: quest counters for turns you drew two cards; then each draw may be a search", () => {
  it("at the end step after drawing two cards you may put a quest counter on it; after drawing one, it doesn't trigger", () => {
    supported(ascension());
    const { s: s0, ap, ids } = setup([draws(2)]);
    const asc = putOnBattlefield(s0, ap, ascension());
    const p = s0.players[ap]!;
    for (const id of p.hand.filter((x) => x !== ids[0])) { p.hand.splice(p.hand.indexOf(id), 1); s0.objects[id]!.zone = "library"; p.library.unshift(id); }
    let s = cast(s0, ap, ids[0]!);
    s = until(s, (x) => x.pending?.kind === "chooseMay" || x.turn > s0.turn);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[asc]!.counters.quest).toBe(1);
  });

  it("with six quest counters each draw may instead search for any card; or the card is drawn", () => {
    const { s: s0, ap, ids } = setup([draws(2)]);
    const asc = putOnBattlefield(s0, ap, ascension());
    s0.objects[asc]!.counters.quest = 6;
    const deep = s0.players[ap]!.library[30]!;
    const topCard = s0.players[ap]!.library[0]!;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "drawInstead", player: ap });
    const pend = s.pending as Extract<GameState["pending"], { kind: "drawInstead" }>;
    expect(pend.options).toHaveLength(2);
    expect(pend.options[1]).toBe("draw");
    s = act(s, { type: "drawInstead", player: ap, choice: pend.options[0]! });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 1, max: 1 });
    s = act(s, { type: "searchLibrary", player: ap, found: [deep] });
    expect(zone(s, deep)).toBe("hand");
    // The second draw asks again; this time the card is drawn.
    expect(s.pending).toMatchObject({ kind: "drawInstead", player: ap });
    const top2 = s.players[ap]!.library[0]!;
    s = settle(act(s, { type: "drawInstead", player: ap, choice: "draw" }));
    expect(zone(s, top2)).toBe("hand");
    expect(s.stack).toHaveLength(0);
    void topCard;
  });
});
