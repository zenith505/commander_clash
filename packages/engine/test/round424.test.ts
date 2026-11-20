// Round 424 (Lane A): Emissary of Grudges ("Reveal the player you chose: Choose new targets for target spell or ability if
// it's controlled by the chosen player and if it targets you or a permanent you control. Activate only once.", CR 608.2b,
// 115.7d, 602.5b), Swindler's Scheme ("Whenever an opponent casts a spell from their hand, you may reveal the top card
// of your library. If it shares a card type with that spell, counter that spell and that opponent may cast the revealed
// card without paying its mana cost.", CR 205.2a, 608.2h, 701.6a, 608.2g) and Dack Fayden, Helping Hand (revealed until X
// creature cards, put onto the battlefield, goaded for the rest of the game, each given to a different opponent, CR
// 701.20a, 701.15, 613.1b, 611.2a).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real card data (Scryfall).
const scheme = (): CardDef => ({"oracleId":"e3ff6134-10dd-4565-afcb-0f41a2933d19","name":"Swindler's Scheme","manaCost":"{2}{U}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever an opponent casts a spell from their hand, you may reveal the top card of your library. If it shares a card type with that spell, counter that spell and that opponent may cast the revealed card without paying its mana cost.","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","layout":"normal"} as CardDef);
const dack = (): CardDef => ({"oracleId":"3b21abb0-9a58-4e62-9650-4b04ce2bfb12","name":"Dack Fayden, Helping Hand","manaCost":"{4}{W}{W}","cmc":6,"typeLine":"Legendary Creature — Human Advisor","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Advisor"],"oracleText":"When Dack Fayden enters, reveal cards from the top of your library until you reveal X creature cards, where X is the number of opponents you have. Put those creature cards onto the battlefield, then shuffle. They're goaded for the rest of the game. For each of those permanents, choose a different opponent. Each opponent gains control of the permanent for which they were chosen.","power":"4","toughness":"6","colors":["W"],"colorIdentity":["W"],"keywords":[],"commanderLegal":"legal","layout":"normal"} as CardDef);
const serra = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"commanderLegal":"legal","layout":"normal"} as CardDef);
const mindStone = (): CardDef => ({"oracleId":"c97361b5-af16-4a7b-af85-a429dbaf4ad2","name":"Mind Stone","manaCost":"{2}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card.","colors":[],"colorIdentity":[],"keywords":[],"commanderLegal":"legal","layout":"normal"} as CardDef);
const thopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"commanderLegal":"legal","layout":"normal"} as CardDef);
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","layout":"normal"} as CardDef);
const counterspell = (): CardDef => ({"oracleId":"cc187110-1148-4090-bbb8-e205694a39f5","name":"Counterspell","manaCost":"{U}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Counter target spell.","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","layout":"normal"} as CardDef);
const bears = (): CardDef => ({"oracleId": "14c8f55d-d177-4c25-a931-ebeb9e6062a0", "name": "Grizzly Bears", "manaCost": "{1}{G}", "cmc": 2, "typeLine": "Creature — Bear", "supertypes": [], "types": ["Creature"], "subtypes": ["Bear"], "oracleText": "", "power": "2", "toughness": "2", "colors": ["G"], "colorIdentity": ["G"], "keywords": [], "commanderLegal": "legal", "layout": "normal"} as CardDef);
const emissary = (): CardDef => ({"oracleId":"b415684e-40f0-43c1-b8d5-1a90b75c5a47","name":"Emissary of Grudges","manaCost":"{5}{R}","cmc":6,"typeLine":"Creature — Efreet","supertypes":[],"types":["Creature"],"subtypes":["Efreet"],"oracleText":"Flying, haste\nAs this creature enters, secretly choose an opponent.\nReveal the player you chose: Choose new targets for target spell or ability if it's controlled by the chosen player and if it targets you or a permanent you control. Activate only once.","power":"6","toughness":"5","colors":["R"],"colorIdentity":["R"],"keywords":["Flying","Haste"],"commanderLegal":"legal","layout":"normal"} as CardDef);
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","layout":"normal"} as CardDef);
const forestDef = (): CardDef => ({ name: "Forest", oracleId: "b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6", manaCost: "", cmc: 0, typeLine: "Basic Land — Forest", supertypes: ["Basic"], types: ["Land"], subtypes: ["Forest"], oracleText: "({T}: Add {G}.)", colors: [], colorIdentity: ["G"], keywords: [], layout: "normal" } as CardDef);

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** The bots' answers for every question, whoever is asked, until the stack is empty. */
const settleBots = (s: GameState) => {
  for (let i = 0; i < 400 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const pid = waitingOn(s)!;
    s = s.pending ? botActions(s, pid).reduce((x, a) => act(x, a), s) : act(s, { type: "passPriority", player: pid });
  }
  return s;
};
/** `defs` on top of `pid`'s library, `defs[0]` first; their ids in the same order. */
function onTop(s: GameState, pid: PlayerId, defs: CardDef[]): ObjectId[] {
  const ids = defs.map((d) => {
    const id = putOnBattlefield(s, pid, d);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "library";
    return id;
  });
  s.players[pid]!.library.unshift(...ids);
  invalidateCharacteristics(s);
  return ids;
}
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;

/** Swindler's Scheme on the next player's battlefield (`opp`), `top` on top of their library; `hand` in `ap`'s hand. */
function schemeOut(hand: CardDef[], top: CardDef[]) {
  const { s, ap, opp, ids } = setup(hand);
  const schemeId = putOnBattlefield(s, opp, scheme());
  const lib = onTop(s, opp, top);
  return { s, ap, opp, ids, schemeId, lib };
}

describe("round 424: the cards compile", () => {
  it("are fully supported", () => {
    for (const d of [emissary(), scheme(), dack()]) expect(isFullySupported(d), d.name).toBe(true);
  });
});

describe("round 424: Swindler's Scheme", () => {
  it("a revealed card sharing a card type counters the spell, and its caster may cast that card from your library for free", () => {
    const { s: s0, ap, opp, ids, lib } = schemeOut([bears()], [serra()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    // The Scheme's controller decides, without looking first.
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: opp });
    s = settle(act(s, { type: "chooseMay", player: opp, yes: true }));
    // Serra Angel shares the creature type with Grizzly Bears: the Bears are countered, and their caster may cast Serra.
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: lib[0] });
    s = settle(act(s, { type: "castSpell", player: ap, objectId: lib[0]! }));
    expect(zone(s, lib[0]!)).toBe("battlefield");
    // Cast by the Bears' caster, so it's theirs to control; still owned by the Scheme's controller (CR 108.3).
    expect(controllerOf(s, s.objects[lib[0]!]!)).toBe(ap);
    expect(s.objects[lib[0]!]!.owner).toBe(opp);
    expect(s.players[opp]!.library).not.toContain(lib[0]);
  });

  it("declined by the caster, the revealed card stays on top of the library; the spell is still countered", () => {
    const { s: s0, ap, opp, ids, lib } = schemeOut([bears()], [serra()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(act(s, { type: "chooseMay", player: opp, yes: true }));
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(s.players[opp]!.library[0]).toBe(lib[0]);
  });

  it("a revealed card sharing no card type does nothing: the spell resolves and the card stays on top", () => {
    const { s: s0, ap, opp, ids, lib } = schemeOut([bears()], [forestDef()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(act(s, { type: "chooseMay", player: opp, yes: true }));
    expect(s.pending).toBeNull();
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(s.players[opp]!.library[0]).toBe(lib[0]);
  });

  it("an artifact creature card shares a type with an artifact spell", () => {
    const { s: s0, ap, opp, ids, lib } = schemeOut([mindStone()], [thopter()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(act(s, { type: "chooseMay", player: opp, yes: true }));
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: lib[0] });
  });

  it("not revealing does nothing", () => {
    const { s: s0, ap, opp, ids, lib } = schemeOut([divination()], [divination()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(act(s, { type: "chooseMay", player: opp, yes: false }));
    expect(s.pending).toBeNull();
    expect(zone(s, ids[0]!)).toBe("graveyard");
    // Divination drew two cards; the Scheme's controller's top card is untouched.
    expect(s.players[opp]!.library[0]).toBe(lib[0]);
  });

  it("doesn't trigger on its controller's own spells", () => {
    const { s, ap, ids } = setup([bears()]);
    putOnBattlefield(s, ap, scheme());
    const s2 = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(s2.pending).toBeNull();
    expect(zone(s2, ids[0]!)).toBe("battlefield");
  });

  it("with the spell gone first, its card types as it last existed on the stack still count: its caster may cast the card", () => {
    const { s: s0, ap, opp, ids, lib } = schemeOut([bears()], [serra()]);
    // A third player holds Counterspell.
    const third = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    for (const l of ["Island", "Island"]) putOnBattlefield(s0, third, { ...forestDef(), name: l, subtypes: ["Island"], typeLine: "Basic Land — Island", oracleText: "({T}: Add {U}.)", colorIdentity: ["U"] } as CardDef);
    const cs = putOnBattlefield(s0, third, counterspell());
    s0.battlefield.splice(s0.battlefield.indexOf(cs), 1);
    s0.objects[cs]!.zone = "hand";
    s0.players[third]!.hand.push(cs);
    invalidateCharacteristics(s0);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    // The Scheme's trigger is on the stack above the Bears; Counterspell on top of both counters the Bears first.
    for (let i = 0; i < 20 && !s.stack.some((x) => x.kind !== "spell"); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const bearsItem = s.stack.find((x) => x.kind === "spell")!;
    while (waitingOn(s) !== third) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = run(s, planCast(s, third, cs, [{ kind: "stack", id: bearsItem.id } as never]));
    s = settle(s);
    // Counterspell, cast from that player's hand, triggers the Scheme too (they're its controller's opponent): declined.
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: opp });
    s = settle(act(s, { type: "chooseMay", player: opp, yes: false }));
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: opp });
    s = settle(act(s, { type: "chooseMay", player: opp, yes: true }));
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: lib[0] });
  });

  it("bots answer every question", () => {
    const { s: s0, ap, ids } = schemeOut([bears()], [serra()]);
    const s = settleBots(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toBeNull();
    expect(s.stack).toHaveLength(0);
  });
});

describe("round 424: Dack Fayden, Helping Hand", () => {
  /** Dack in `ap`'s hand, `top` on top of their library. */
  function dackOut(top: CardDef[]) {
    const { s, ap, ids } = setup([dack()]);
    const lib = onTop(s, ap, top);
    return { s, ap, dackId: ids[0]!, lib };
  }

  it("reveals until three creature cards (three opponents), puts them onto the battlefield goaded, and gives one to each opponent", () => {
    const { s: s0, ap, dackId, lib } = dackOut([forestDef(), serra(), forestDef(), bears(), thopter(), bears()]);
    const opps = s0.turnOrder.filter((p) => p !== ap);
    let s = settle(run(s0, planCast(s0, ap, dackId)));
    // The first of the three creatures: any of the three opponents.
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "giveControlTo", about: lib[1], options: opps.map(String) });
    s = act(s, { type: "chooseOption", player: ap, choice: String(opps[2]) });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "giveControlTo", about: lib[3], options: [String(opps[0]), String(opps[1])] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: String(opps[0]) }));
    // The last one goes to the opponent left, without a question.
    expect(s.pending).toBeNull();
    const [angel, bear1, bird, bear2] = [lib[1]!, lib[3]!, lib[4]!, lib[5]!];
    expect([angel, bear1, bird].map((id) => zone(s, id))).toEqual(["battlefield", "battlefield", "battlefield"]);
    // The fourth creature card wasn't revealed: it's still in the library, shuffled with the Forests.
    expect(zone(s, bear2)).toBe("library");
    expect(zone(s, lib[0]!)).toBe("library");
    expect([angel, bear1, bird].map((id) => controllerOf(s, s.objects[id]!))).toEqual([opps[2], opps[0], opps[1]]);
    // Goaded by Dack's controller, so each attacks someone else if able (CR 701.15b).
    for (const id of [angel, bear1, bird]) expect(characteristics(s, s.objects[id]!).goadedBy).toEqual([ap]);
    // For the rest of the game: still so turns later.
    for (let i = 0; i < 8; i++) s = settleBots(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(characteristics(s, s.objects[angel]!).goadedBy).toEqual([ap]);
    expect(controllerOf(s, s.objects[angel]!)).toBe(opps[2]);
  });

  it("with fewer creature cards than opponents, the whole library is revealed and each found goes to a different opponent", () => {
    const { s: s0, ap, dackId, lib } = dackOut([serra()]);
    // Only one creature card: empty the rest of the library.
    s0.players[ap]!.library = [lib[0]!];
    const opps = s0.turnOrder.filter((p) => p !== ap);
    let s = settle(run(s0, planCast(s0, ap, dackId)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "giveControlTo", options: opps.map(String) });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: String(opps[1]) }));
    expect(controllerOf(s, s.objects[lib[0]!]!)).toBe(opps[1]);
    expect(s.objects[lib[0]!]!.owner).toBe(ap);
  });

  it("bots give each creature away", () => {
    const { s: s0, ap, dackId, lib } = dackOut([serra(), bears(), thopter()]);
    const s = settleBots(run(s0, planCast(s0, ap, dackId)));
    expect(s.pending).toBeNull();
    const to = lib.map((id) => controllerOf(s, s.objects[id]!));
    expect(new Set(to).size).toBe(3);
    expect(to).not.toContain(ap);
  });
});

describe("round 424: Emissary of Grudges", () => {
  /** `ap` holds Lightning Bolt; the next player (`opp`) has Emissary of Grudges with `chosen` chosen for it. */
  function emissaryOut(chosen: "ap" | "third" | "none") {
    const { s, ap, opp, ids } = setup([bolt()]);
    const third = s.turnOrder[(s.turnOrder.indexOf(ap) + 2) % 4]!;
    const em = putOnBattlefield(s, opp, emissary());
    if (chosen !== "none") s.objects[em]!.chosen = { player: chosen === "ap" ? ap : third };
    return { s, ap, opp, third, em, boltId: ids[0]! };
  }
  /** `ap` casts Bolt at `at`, then passes to `opp`. */
  function boltAt(s: GameState, ap: PlayerId, opp: PlayerId, boltId: ObjectId, at: { kind: "player"; id: PlayerId } | { kind: "object"; id: ObjectId }) {
    s = run(s, planCast(s, ap, boltId, [at]));
    while (waitingOn(s) !== opp) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    return s;
  }

  it("redirects the chosen player's Bolt aimed at you: you choose its new target", () => {
    const { s: s0, ap, opp, em, boltId } = emissaryOut("ap");
    const life = s0.players[ap]!.life;
    const oppLife = s0.players[opp]!.life;
    let s = boltAt(s0, ap, opp, boltId, { kind: "player", id: opp });
    const item = s.stack.find((x) => x.kind === "spell")!;
    s = run(s, planActivate(s, opp, em, 0, [{ kind: "stack", id: item.id } as never]));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "newTargets", player: opp, stackId: item.id });
    s = settle(act(s, { type: "newTargets", player: opp, targets: [{ kind: "player", id: ap }] }));
    expect(s.players[ap]!.life).toBe(life - 3);
    expect(s.players[opp]!.life).toBe(oppLife);
    // Only once (CR 602.5b).
    expect(planActivate(s, opp, em, 0)).toBeNull();
  });

  it("a permanent you control as the target counts too", () => {
    const { s: s0, ap, opp, em, boltId } = emissaryOut("ap");
    const bear = putOnBattlefield(s0, opp, bears());
    let s = boltAt(s0, ap, opp, boltId, { kind: "object", id: bear });
    const item = s.stack.find((x) => x.kind === "spell")!;
    s = settle(run(s, planActivate(s, opp, em, 0, [{ kind: "stack", id: item.id } as never])));
    expect(s.pending).toMatchObject({ kind: "newTargets", player: opp });
  });

  it("nothing happens if the spell's controller isn't the chosen player, or it doesn't target you or yours", () => {
    // Another player chosen.
    {
      const { s: s0, ap, opp, em, boltId } = emissaryOut("third");
      const oppLife = s0.players[opp]!.life;
      let s = boltAt(s0, ap, opp, boltId, { kind: "player", id: opp });
      const item = s.stack.find((x) => x.kind === "spell")!;
      s = settle(run(s, planActivate(s, opp, em, 0, [{ kind: "stack", id: item.id } as never])));
      expect(s.pending).toBeNull();
      expect(s.players[opp]!.life).toBe(oppLife - 3);
    }
    // The chosen player's Bolt aimed at someone else.
    {
      const { s: s0, ap, opp, third, em, boltId } = emissaryOut("ap");
      const thirdLife = s0.players[third]!.life;
      let s = boltAt(s0, ap, opp, boltId, { kind: "player", id: third });
      const item = s.stack.find((x) => x.kind === "spell")!;
      s = settle(run(s, planActivate(s, opp, em, 0, [{ kind: "stack", id: item.id } as never])));
      expect(s.pending).toBeNull();
      expect(s.players[third]!.life).toBe(thirdLife - 3);
    }
  });

  it("can't be activated with no player chosen for it (rulings)", () => {
    const { s: s0, ap, opp, em, boltId } = emissaryOut("none");
    const s = boltAt(s0, ap, opp, boltId, { kind: "player", id: opp });
    const item = s.stack.find((x) => x.kind === "spell")!;
    expect(planActivate(s, opp, em, 0, [{ kind: "stack", id: item.id } as never])).toBeNull();
  });
});
