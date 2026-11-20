// Round 430: Nephalia Academy ("If a spell or ability an opponent controls causes you to discard a card, you may reveal that
// card and put it on top of your library instead of putting it anywhere else.").
import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, defOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real oracle text (Scryfall).
const nephaliaAcademy = (): CardDef => ({"oracleId":"3b7e7a11-bf59-413d-8796-640d17c2c1c6","name":"Nephalia Academy","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"If a spell or ability an opponent controls causes you to discard a card, you may reveal that card and put it on top of your library instead of putting it anywhere else.\n{T}: Add {C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"layout":"normal"}) as CardDef;
const hymntoTourach = (): CardDef => ({"oracleId":"992d9a72-d34d-47d7-96fb-37f0efb515ef","name":"Hymn to Tourach","manaCost":"{B}{B}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target player discards two cards at random.","colors":["B"],"colorIdentity":["B"],"keywords":[],"layout":"normal"}) as CardDef;
const duress = (): CardDef => ({"oracleId":"33d405ea-7a9a-4970-b70f-9c05d90dd6f0","name":"Duress","manaCost":"{B}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target opponent reveals their hand. You choose a noncreature, nonland card from it. That player discards that card.","colors":["B"],"colorIdentity":["B"],"keywords":[],"layout":"normal"}) as CardDef;
const painfulQuandary = (): CardDef => ({"oracleId":"c37051cc-6683-4dbb-b5ff-5c3a5bdab1df","name":"Painful Quandary","manaCost":"{3}{B}{B}","cmc":5,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever an opponent casts a spell, that player loses 5 life unless they discard a card.","colors":["B"],"colorIdentity":["B"],"keywords":[],"layout":"normal"}) as CardDef;
const mahaItsFeathersNight = (): CardDef => ({"oracleId":"129476ae-9dab-4e04-8e8e-f249afd56ff9","name":"Maha, Its Feathers Night","manaCost":"{3}{B}{B}","cmc":5,"typeLine":"Legendary Creature — Elemental Bird","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Elemental","Bird"],"oracleText":"Flying, trample\nWard—Discard a card.\nCreatures your opponents control have base toughness 1.","power":"6","toughness":"5","colors":["B"],"colorIdentity":["B"],"keywords":["Flying","Trample","Ward"],"layout":"normal"}) as CardDef;
const chainsofMephistopheles = (): CardDef => ({"oracleId":"eae87919-6322-4bd2-ae9c-b1ce25d686da","name":"Chains of Mephistopheles","manaCost":"{1}{B}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"If a player would draw a card except the first one they draw in each of their draw steps, that player discards a card instead. If the player discards a card this way, they draw a card. If the player doesn't discard a card this way, they mill a card.","colors":["B"],"colorIdentity":["B"],"keywords":["Mill"],"layout":"normal"}) as CardDef;
const fieryTemper = (): CardDef => ({"oracleId":"f07bd49d-8e71-4d56-be2a-638514011318","name":"Fiery Temper","manaCost":"{1}{R}{R}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Fiery Temper deals 3 damage to any target.\nMadness {R} (If you discard this card, discard it into exile. When you do, cast it for its madness cost or put it into your graveyard.)","colors":["R"],"colorIdentity":["R"],"keywords":["Madness"],"layout":"normal"}) as CardDef;
const nebuchadnezzar = (): CardDef => ({"oracleId":"7c48448e-4e13-4cda-999e-e06ae0f7dcea","name":"Nebuchadnezzar","manaCost":"{3}{U}{B}","cmc":5,"typeLine":"Legendary Creature — Human Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"{X}, {T}: Choose a card name. Target opponent reveals X cards at random from their hand. Then that player discards all cards with that name revealed this way. Activate only during your turn.","power":"3","toughness":"3","colors":["B","U"],"colorIdentity":["B","U"],"keywords":[],"layout":"normal"}) as CardDef;
const faithlessLooting = (): CardDef => ({"oracleId":"3d6fa57a-aa53-4b5c-b8af-a7612c823117","name":"Faithless Looting","manaCost":"{R}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards, then discard two cards.\nFlashback {2}{R} (You may cast this card from your graveyard for its flashback cost. Then exile it.)","colors":["R"],"colorIdentity":["R"],"keywords":["Flashback"],"layout":"normal"}) as CardDef;
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"}) as CardDef;
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"layout":"normal"}) as CardDef;
const mindRot = (): CardDef => ({"oracleId":"ad44cf74-b717-48fb-9fa2-77512024d76a","name":"Mind Rot","manaCost":"{2}{B}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target player discards two cards.","colors":["B"],"colorIdentity":["B"],"keywords":[],"layout":"normal"}) as CardDef;
const wordsofWaste = (): CardDef => ({"oracleId":"3fe5cfcd-b25f-49d8-9f60-8b4c388a9c68","name":"Words of Waste","manaCost":"{2}{B}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"{1}: The next time you would draw a card this turn, each opponent discards a card instead.","colors":["B"],"colorIdentity":["B"],"keywords":[],"layout":"normal"}) as CardDef;
const megrim = (): CardDef => ({"oracleId":"633ad9e2-9f55-4a1c-9248-661ad4b0e1dc","name":"Megrim","manaCost":"{2}{B}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever an opponent discards a card, this enchantment deals 2 damage to that player.","colors":["B"],"colorIdentity":["B"],"keywords":[],"layout":"normal"}) as CardDef;

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
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const logText = (s: GameState) => s.log.map((l) => (typeof l === "string" ? l : l.text)).join("\n");
/** A new card for `def` in `pid`'s `zone` (on top of the library). */
const into = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Only these cards stay in `pid`'s hand; the rest go to the bottom of the library. */
const onlyInHand = (s: GameState, pid: PlayerId, keep: string[]) => {
  const p = s.players[pid]!;
  for (const id of p.hand.filter((x) => !keep.includes(x))) (s.objects[id]!.zone = "library"), p.library.push(id);
  p.hand = p.hand.filter((x) => keep.includes(x));
};

/** `opp` controls Nephalia Academy and holds `cards`; `ap` holds `spells`. */
const game = (spells: CardDef[], cards: CardDef[]) => {
  const { s, ap, ids, opp } = setup(spells);
  onlyInHand(s, ap, ids);
  onlyInHand(s, opp, []);
  const academy = putOnBattlefield(s, opp, nephaliaAcademy());
  const held = cards.map((d) => into(s, opp, d, "hand"));
  return { s, ap, opp, ids, held, academy };
};

describe("Round 430: Nephalia Academy", () => {
  it("is fully supported", () => supported(nephaliaAcademy()));

  it("Mind Rot: the player picks the discards, then which of them go on top of their library, revealed (CR 614.1a)", () => {
    const { s: s0, ap, opp, ids, held } = game([mindRot()], [lightningBolt(), grizzlyBears(), divination()]);
    const [bolt, bears, div] = held as [string, string, string];
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])), opp);
    expect(s.pending).toMatchObject({ kind: "discard", player: opp, count: 2 });
    s = act(s, { type: "discard", player: opp, objectIds: [bolt, bears] });
    expect(s.pending).toMatchObject({ kind: "handToTop", player: opp, upTo: true, discarding: [bolt, bears], revealing: "Nephalia Academy" });
    // Only the cards being discarded.
    expect(() => act(s, { type: "handToTop", player: opp, objectIds: [div] })).toThrow(/being discarded/);
    s = settle(act(s, { type: "handToTop", player: opp, objectIds: [bolt] }));
    expect(s.players[opp]!.library[0]).toBe(bolt);
    expect(zone(s, bears)).toBe("graveyard");
    expect(zone(s, div)).toBe("hand");
    expect(logText(s)).toMatch(/reveals Lightning Bolt and puts it on top of their library instead \(Nephalia Academy\)/);
  });

  it("the card is still discarded: Megrim's \"whenever an opponent discards a card\" still triggers (rulings)", () => {
    const { s: s0, ap, opp, ids, held } = game([mindRot()], [lightningBolt(), grizzlyBears()]);
    putOnBattlefield(s0, ap, megrim());
    const life = s0.players[opp]!.life;
    // Two cards: no choice of which, so straight to the Academy's question.
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])), opp);
    expect(s.pending).toMatchObject({ kind: "handToTop", player: opp, discarding: held });
    s = settle(act(s, { type: "handToTop", player: opp, objectIds: [held[1]!, held[0]!] }));
    // Both on top, the first pick ending on top.
    expect(s.players[opp]!.library.slice(0, 2)).toEqual([held[1], held[0]]);
    expect(s.players[opp]!.life).toBe(life - 4);
  });

  it("a discard by its controller's own spell isn't covered: Faithless Looting asks nothing", () => {
    const { s: s0, ap, ids } = setup([faithlessLooting()]);
    onlyInHand(s0, ap, ids);
    putOnBattlefield(s0, ap, nephaliaAcademy());
    const [a, b] = [into(s0, ap, lightningBolt(), "hand"), into(s0, ap, grizzlyBears(), "hand")];
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    expect(s.pending).toMatchObject({ kind: "discard", player: ap, count: 2 });
    s = settle(act(s, { type: "discard", player: ap, objectIds: [a, b] }), ap);
    expect(s.pending).toBeNull();
    expect([zone(s, a), zone(s, b)]).toEqual(["graveyard", "graveyard"]);
  });

  it("Hymn to Tourach: the cards discarded at random, then any of them on top", () => {
    const { s: s0, ap, opp, ids, held } = game([hymntoTourach()], [lightningBolt(), grizzlyBears(), divination()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])), opp);
    const p = s.pending;
    expect(p).toMatchObject({ kind: "handToTop", player: opp, revealing: "Nephalia Academy" });
    if (p?.kind !== "handToTop") return;
    expect(p.discarding).toHaveLength(2);
    s = settle(act(s, { type: "handToTop", player: opp, objectIds: [] }));
    expect(p.discarding!.map((id) => zone(s, id))).toEqual(["graveyard", "graveyard"]);
    expect(held.filter((id) => zone(s, id) === "hand")).toHaveLength(1);
  });

  it("Duress: the card its caster picks, then the Academy's question", () => {
    const { s: s0, ap, opp, ids, held } = game([duress()], [lightningBolt(), grizzlyBears()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])), ap);
    // ap picks the Bolt from the revealed hand.
    for (let i = 0; i < 5 && s.pending?.player === ap; i++) for (const a of botActions(s, ap)) s = act(s, a);
    s = settle(s, opp);
    expect(s.pending).toMatchObject({ kind: "handToTop", player: opp, discarding: [held[0]] });
    s = settle(act(s, { type: "handToTop", player: opp, objectIds: [held[0]!] }));
    expect(s.players[opp]!.library[0]).toBe(held[0]);
  });

  it("madness: on top instead of exiled, so no madness; declined, it's exiled with madness as usual (rulings)", () => {
    for (const top of [true, false]) {
      const { s: s0, ap, opp, ids, held } = game([mindRot()], [fieryTemper(), grizzlyBears()]);
      let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])), opp);
      expect(s.pending).toMatchObject({ kind: "handToTop", player: opp });
      s = act(s, { type: "handToTop", player: opp, objectIds: top ? [held[0]!] : [] });
      if (top) {
        expect(s.players[opp]!.library[0]).toBe(held[0]);
        expect(s.triggerQueue.some((t) => t.body.text.startsWith("Madness"))).toBe(false);
      } else expect(zone(s, held[0]!)).toBe("exile");
    }
  });

  it("Painful Quandary: \"unless they discard a card\", a discard chosen because of an opponent's ability, counts (rulings)", () => {
    // ap controls the Academy this time; an opponent's Quandary punishes ap's spell.
    const { s: s0, ap, ids, opp } = setup([divination()]);
    onlyInHand(s0, ap, ids);
    putOnBattlefield(s0, ap, nephaliaAcademy());
    putOnBattlefield(s0, opp, painfulQuandary());
    const bolt = into(s0, ap, lightningBolt(), "hand");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    // ap chooses to discard rather than lose 5 life.
    for (let i = 0; i < 6 && s.pending?.player === ap && s.pending.kind !== "handToTop"; i++) {
      const p = s.pending;
      if (p.kind === "chooseOption") s = act(s, { type: "chooseOption", player: ap, choice: p.options.find((o, k) => /discard/i.test(p.labels?.[k] ?? o))! });
      else if (p.kind === "discard") s = act(s, { type: "discard", player: ap, objectIds: [bolt] });
      else if (p.kind === "payUnless") s = act(s, { type: "payUnless", player: ap, pay: true });
      else break;
      s = settle(s, ap);
    }
    expect(s.pending).toMatchObject({ kind: "handToTop", player: ap, discarding: [bolt], revealing: "Nephalia Academy" });
    const life = s.players[ap]!.life;
    s = settle(act(s, { type: "handToTop", player: ap, objectIds: [bolt] }), ap);
    expect(s.players[ap]!.life).toBe(life);
    // Divination resolves afterwards and draws the Bolt back.
    s = settle(s);
    expect(zone(s, bolt)).toBe("hand");
  });

  it("ward—discard a card: paid with a card that goes on top, and the spell isn't countered", () => {
    const { s: s0, ap, ids, opp } = setup([lightningBolt()]);
    onlyInHand(s0, ap, ids);
    putOnBattlefield(s0, ap, nephaliaAcademy());
    const maha = putOnBattlefield(s0, opp, mahaItsFeathersNight());
    const bears = into(s0, ap, grizzlyBears(), "hand");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(maha)])), ap);
    for (let i = 0; i < 6 && s.pending?.player === ap && s.pending.kind !== "handToTop"; i++) {
      const p = s.pending;
      if (p.kind === "payUnless") s = act(s, { type: "payUnless", player: ap, pay: true });
      else if (p.kind === "discard") s = act(s, { type: "discard", player: ap, objectIds: [bears] });
      else break;
      s = settle(s, ap);
    }
    expect(s.pending).toMatchObject({ kind: "handToTop", player: ap, discarding: [bears], revealing: "Nephalia Academy" });
    s = settle(act(s, { type: "handToTop", player: ap, objectIds: [bears] }));
    expect(s.players[ap]!.library[0]).toBe(bears);
    // Ward paid: the Bolt resolves.
    expect(s.objects[maha]!.damage).toBe(3);
  });

  it("an opponent's Chains of Mephistopheles: the card discarded instead of a draw may go on top, then the draw takes it back", () => {
    const { s: s0, ap, ids, opp } = setup([divination(), lightningBolt()]);
    onlyInHand(s0, ap, ids);
    putOnBattlefield(s0, ap, nephaliaAcademy());
    putOnBattlefield(s0, opp, chainsofMephistopheles());
    const bolt = ids[1]!;
    const second = s0.players[ap]!.library[0]!;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    // The only card in hand is discarded; first, whether it goes on top.
    expect(s.pending).toMatchObject({ kind: "handToTop", player: ap, discarding: [bolt], source: "Chains of Mephistopheles", revealing: "Nephalia Academy" });
    s = settle(act(s, { type: "handToTop", player: ap, objectIds: [bolt] }), ap);
    // Drawn back by the draw Chains makes; the second draw is replaced the same way.
    expect(s.pending).toMatchObject({ kind: "handToTop", player: ap, discarding: [bolt] });
    s = settle(act(s, { type: "handToTop", player: ap, objectIds: [] }), ap);
    expect(s.pending).toBeNull();
    expect(zone(s, bolt)).toBe("graveyard");
    expect(s.players[ap]!.hand).toEqual([second]);
  });

  it("Nebuchadnezzar: the cards with the chosen name revealed at random, then the Academy's question", () => {
    const { s: s0, ap, ids, opp } = setup([]);
    onlyInHand(s0, ap, ids);
    onlyInHand(s0, opp, []);
    putOnBattlefield(s0, opp, nephaliaAcademy());
    const neb = putOnBattlefield(s0, ap, nebuchadnezzar());
    const bolts = [into(s0, opp, lightningBolt(), "hand"), into(s0, opp, lightningBolt(), "hand")];
    let s = run(s0, planActivate(s0, ap, neb, 0, [{ kind: "player", id: opp }], undefined, undefined, 2));
    s = settle(s, ap);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "cardName" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Lightning Bolt" }), opp);
    expect(s.pending).toMatchObject({ kind: "handToTop", player: opp, revealing: "Nephalia Academy" });
    s = settle(act(s, { type: "handToTop", player: opp, objectIds: [bolts[0]!] }));
    expect(s.players[opp]!.library[0]).toBe(bolts[0]);
    expect(zone(s, bolts[1]!)).toBe("graveyard");
    expect(logText(s).match(/reveals Lightning Bolt, Lightning Bolt at random/g)).toHaveLength(1);
  });

  it("Words of Waste: each opponent's discard instead of its controller's draw may go on top", () => {
    const { s: s0, ap, ids, opp } = setup([divination()]);
    onlyInHand(s0, ap, ids);
    onlyInHand(s0, opp, []);
    putOnBattlefield(s0, opp, nephaliaAcademy());
    const words = putOnBattlefield(s0, ap, wordsofWaste());
    const bolt = into(s0, opp, lightningBolt(), "hand");
    let s = settle(run(s0, planActivate(s0, ap, words, 0)), ap);
    s = settle(run(s, planCast(s, ap, ids[0]!)), opp);
    expect(s.pending).toMatchObject({ kind: "handToTop", player: opp, discarding: [bolt], revealing: "Nephalia Academy" });
    s = settle(act(s, { type: "handToTop", player: opp, objectIds: [bolt] }));
    expect(s.players[opp]!.library[0]).toBe(bolt);
    // One draw replaced, the other made.
    expect(s.players[ap]!.hand).toHaveLength(1);
  });

  it("bots answer the question: a spell they'd draw again goes back on top", () => {
    const { s: s0, ap, opp, ids, held } = game([mindRot()], [lightningBolt(), grizzlyBears()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])), opp);
    expect(s.pending?.kind).toBe("handToTop");
    const acts = botActions(s, opp);
    expect(acts[0]).toMatchObject({ type: "handToTop", player: opp });
    s = settle(acts.reduce((x, a) => act(x, a), s));
    expect(held.some((id) => s.players[opp]!.library.includes(id))).toBe(true);
  });
});
