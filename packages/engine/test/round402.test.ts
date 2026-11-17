// Round 402 (Lane A): Duelist's Flame (a granted "look at that many cards" trigger: one nonland card exiled and cast free
// as it resolves, the rest on the bottom in a random order), Scheming Fence (a nonland permanent chosen as it enters,
// CR 614.12: its activated abilities can't be activated, and Fence has them, CR 613.1f, paying with mana of any color,
// CR 609.4b), and Braided Net ("Its activated abilities can't be activated for as long as it remains tapped", CR 611.2b).

import { describe, expect, it } from "vitest";
import { act, bear, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf } from "../src/cards";
import { manaAbilitiesOn } from "../src/manaabilities";
import { moveObject } from "../src/game";
import { applyAction, botActions, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real card data (Scryfall).
const flame = (): CardDef => ({"oracleId":"bbc990e4-1601-498f-9031-0cd663139367","name":"Duelist's Flame","manaCost":"{X}{R}{R}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Until end of turn, target blocked creature you control gets +X/+0 and gains trample and \"Whenever this creature deals combat damage to a player, look at that many cards from the top of your library. Exile up to one nonland card from among them and put the rest on the bottom of your library in a random order. You may cast the exiled card without paying its mana cost.\"","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/3/230e997e-3736-4afd-8571-1cc1b1d6ed96.jpg?1783904653","artUrl":"https://cards.scryfall.io/art_crop/front/2/3/230e997e-3736-4afd-8571-1cc1b1d6ed96.jpg?1783904653","commanderLegal":"legal","set":"fic","releasedAt":"2025-12-05","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const fence = (): CardDef => ({"oracleId":"cef87a98-61a0-4a88-950f-867144f685e3","name":"Scheming Fence","manaCost":"{W}{U}","cmc":2,"typeLine":"Creature — Human Citizen","supertypes":[],"types":["Creature"],"subtypes":["Human","Citizen"],"oracleText":"As this creature enters, you may choose a nonland permanent.\nActivated abilities of the chosen permanent can't be activated.\nThis creature has all activated abilities of the chosen permanent except for loyalty abilities. You may spend mana as though it were mana of any color to activate those abilities.","power":"2","toughness":"3","colors":["U","W"],"colorIdentity":["U","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/3/53ac46c1-4439-46c3-8180-302057dbbd69.jpg?1783922972","artUrl":"https://cards.scryfall.io/art_crop/front/5/3/53ac46c1-4439-46c3-8180-302057dbbd69.jpg?1783922972","commanderLegal":"legal","set":"snc","releasedAt":"2022-04-29","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const net = (): CardDef => ({"oracleId":"86ef06b3-2049-494d-9ecb-ca14766d3b68","name":"Braided Net // Braided Quipu","manaCost":"{2}{U}","cmc":3,"typeLine":"Artifact // Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"This artifact enters with three net counters on it.\n{T}, Remove a net counter from this artifact: Tap another target nonland permanent. Its activated abilities can't be activated for as long as it remains tapped.\nCraft with artifact {1}{U}","colors":["U"],"colorIdentity":["U"],"keywords":["Craft","Transform"],"imageUrl":"https://cards.scryfall.io/normal/front/c/8/c8157978-259e-4af1-890e-ea56a55a9997.jpg?1783913690","artUrl":"https://cards.scryfall.io/art_crop/front/c/8/c8157978-259e-4af1-890e-ea56a55a9997.jpg?1783913690","commanderLegal":"legal","set":"lci","releasedAt":"2023-11-17","rarity":"rare","layout":"transform","gameChanger":false,"faces":[{"name":"Braided Net","manaCost":"{2}{U}","typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"This artifact enters with three net counters on it.\n{T}, Remove a net counter from this artifact: Tap another target nonland permanent. Its activated abilities can't be activated for as long as it remains tapped.\nCraft with artifact {1}{U}","colors":["U"],"imageUrl":"https://cards.scryfall.io/normal/front/c/8/c8157978-259e-4af1-890e-ea56a55a9997.jpg?1783913690","artUrl":"https://cards.scryfall.io/art_crop/front/c/8/c8157978-259e-4af1-890e-ea56a55a9997.jpg?1783913690"},{"name":"Braided Quipu","manaCost":"","typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{3}{U}, {T}: Draw a card for each artifact you control, then put this artifact into its owner's library third from the top.","colors":["U"],"colorIndicator":["U"],"imageUrl":"https://cards.scryfall.io/normal/back/c/8/c8157978-259e-4af1-890e-ea56a55a9997.jpg?1783913690","artUrl":"https://cards.scryfall.io/art_crop/back/c/8/c8157978-259e-4af1-890e-ea56a55a9997.jpg?1783913690"}]} as CardDef);
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const tutor = (): CardDef => ({"oracleId":"82004860-e589-4e38-8d61-8c0210e4ea39","name":"Demonic Tutor","manaCost":"{1}{B}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Search your library for a card, put that card into your hand, then shuffle.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/b/3bdbc231-5316-4abd-9d8d-d87cff2c9847.jpg?1783933824","artUrl":"https://cards.scryfall.io/art_crop/front/3/b/3bdbc231-5316-4abd-9d8d-d87cff2c9847.jpg?1783933824","commanderLegal":"legal","set":"uma","releasedAt":"2018-12-07","rarity":"rare","layout":"normal","gameChanger":true} as CardDef);
const monolith = (): CardDef => ({"oracleId":"6b8cf2a0-b045-4d91-9d91-c602d40c6237","name":"Basalt Monolith","manaCost":"{3}","cmc":3,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"This artifact doesn't untap during your untap step.\n{T}: Add {C}{C}{C}.\n{3}: Untap this artifact.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/7/7/7770e48e-72e1-4475-a4b5-c1c561a1beaa.jpg?1783939641","artUrl":"https://cards.scryfall.io/art_crop/front/7/7/7770e48e-72e1-4475-a4b5-c1c561a1beaa.jpg?1783939641","commanderLegal":"legal","set":"c13","releasedAt":"2013-11-01","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const pyromancer = (): CardDef => ({"oracleId":"29b3cb3e-aeb1-43eb-8095-9f7881aa34bd","name":"Prodigal Pyromancer","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"{T}: This creature deals 1 damage to any target.","power":"1","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/7/97787109-408e-42d3-acc5-300f5f5bf2ff.jpg?1783943143","artUrl":"https://cards.scryfall.io/art_crop/front/9/7/97787109-408e-42d3-acc5-300f5f5bf2ff.jpg?1783943143","commanderLegal":"legal","set":"plc","releasedAt":"2007-02-02","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const shivan = (): CardDef => ({"oracleId":"711eea87-0fa3-46e0-a42b-fa5a86455f04","name":"Shivan Dragon","manaCost":"{4}{R}{R}","cmc":6,"typeLine":"Creature — Dragon","supertypes":[],"types":["Creature"],"subtypes":["Dragon"],"oracleText":"Flying\n{R}: This creature gets +1/+0 until end of turn.","power":"5","toughness":"5","colors":["R"],"colorIdentity":["R"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/2/9/294ca89d-549a-4302-9284-df5b4e833a69.jpg?1789446860","artUrl":"https://cards.scryfall.io/art_crop/front/2/9/294ca89d-549a-4302-9284-df5b4e833a69.jpg?1789446860","commanderLegal":"legal","set":"sld","releasedAt":"2026-08-31","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const elves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; other players' questions are answered as the bots would. Stops at any question of `me`'s. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const ch = (s: GameState, id: ObjectId) => characteristics(s, s.objects[id]!);
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
/** Ap passes priority, so the next player in turn order has it (CR 117.3d). */
const toNext = (s: GameState, ap: PlayerId) => act(s, { type: "passPriority", player: ap });
const index = (s: GameState, id: ObjectId, re: RegExp) => abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => re.test(a.text));

describe("round 402: parse", () => {
  it("every card of the round is fully supported", () => {
    for (const d of [flame(), fence(), net()]) expect(isFullySupported(d), d.name).toBe(true);
  });
});

describe("round 402: Scheming Fence", () => {
  /** Ap casts Scheming Fence with these permanents on the battlefield (opp's), stopping at its "you may choose". */
  function castFence(theirs: CardDef[], ours: CardDef[] = []) {
    const { s: s0, ap, opp, ids } = setup([fence()]);
    const t = theirs.map((d) => putOnBattlefield(s0, opp, d));
    const o = ours.map((d) => putOnBattlefield(s0, ap, d));
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    return { s, ap, opp, f: ids[0]!, theirs: t, ours: o };
  }
  /** Fence as if it had been under ap's control since their last turn (no summoning sickness for {T} abilities). */
  const unsick = (s: GameState, id: ObjectId) => {
    s.objects[id]!.controlledSinceTurn = -1;
    invalidateCharacteristics(s);
    return s;
  };

  it("offers any player's nonland permanent, not lands, and choosing nothing", () => {
    const { s, ap, theirs, ours } = castFence([pyromancer()], [shivan()]);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "chosenObject" });
    const p = s.pending as { options: string[]; labels: string[] };
    expect(p.options).toEqual(expect.arrayContaining([theirs[0], ours[0], "none"]));
    expect(p.options.every((x) => x === "none" || !ch(s, x).types.includes("Land"))).toBe(true);
    expect(p.labels[p.options.indexOf(theirs[0]!)]).toMatch(/^Prodigal Pyromancer \(/);
    expect(p.labels[p.options.length - 1]).toBe("Choose nothing");
  });

  it("choosing an opponent's Prodigal Pyromancer: its ability can't be activated, and Fence has it", () => {
    let { s, ap, opp, f, theirs } = castFence([pyromancer()]);
    const py = theirs[0]!;
    s = settle(act(s, { type: "chooseOption", player: ap, choice: py }), ap);
    expect(zone(s, f)).toBe("battlefield");
    const s1 = toNext(s, ap);
    expect(waitingOn(s1)).toBe(opp);
    expect(planActivate(s1, opp, py, 0, [{ kind: "player", id: ap }])).toBeNull();
    s = unsick(s, f);
    const i = index(s, f, /deals 1 damage to any target/);
    expect(i).toBeGreaterThanOrEqual(0);
    const life = s.players[opp]!.life;
    s = settle(run(s, planActivate(s, ap, f, i, [{ kind: "player", id: opp }])), ap);
    expect(s.players[opp]!.life).toBe(life - 1);
    expect(s.objects[f]!.tapped).toBe(true);
  });

  it("its mana abilities too: Fence taps for {C}{C} with Sol Ring chosen, and Sol Ring can't", () => {
    let { s, ap, opp, f, theirs } = castFence([solRing()]);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: theirs[0]! }), ap);
    s = unsick(s, f);
    expect(manaAbilitiesOn(s, s.objects[f]!).map((a) => a.text)).toContain("{T}: Add {C}{C}.");
    const s1 = toNext(s, ap);
    expect(() => act(s1, { type: "activateMana", player: opp, objectId: theirs[0]!, mana: "C" })).toThrow(/can't be activated|can't/);
    const c = s.players[ap]!.manaPool.C ?? 0;
    s = act(s, { type: "activateMana", player: ap, objectId: f, mana: "C" });
    expect(s.players[ap]!.manaPool.C).toBe(c + 2);
  });

  it("mana of any color pays for them (CR 609.4b): Shivan Dragon's {R} pump paid with {U}", () => {
    let { s, ap, f, ours } = castFence([], [shivan()]);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: ours[0]! }), ap);
    const i = index(s, f, /^\{R\}: /);
    expect(i).toBeGreaterThanOrEqual(0);
    for (const c of ["W", "U", "B", "R", "G", "C"] as const) s.players[ap]!.manaPool[c] = 0;
    s.players[ap]!.manaPool.U = 1;
    const before = ch(s, f).power;
    s = settle(run(s, planActivate(s, ap, f, i)), ap);
    expect(ch(s, f).power).toBe(before + 1);
    // The Dragon's own ability can't be activated.
    s.players[ap]!.manaPool.R = 1;
    expect(planActivate(s, ap, ours[0]!, 0)).toBeNull();
  });

  it("choosing nothing: no ability gained, nothing shut off", () => {
    let { s, ap, opp, f, theirs } = castFence([pyromancer()]);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "none" }), ap);
    expect(s.objects[f]!.chosen?.object).toBeUndefined();
    expect(abilitiesOf(s, s.objects[f]!).activated.length).toBe(0);
    const s1 = toNext(s, ap);
    expect(waitingOn(s1)).toBe(opp);
    expect(planActivate(s1, opp, theirs[0]!, 0, [{ kind: "player", id: ap }])).not.toBeNull();
  });

  it("once the chosen permanent leaves and returns, it's a new object (CR 400.7): Fence has nothing and it's free", () => {
    let { s, ap, opp, f, theirs } = castFence([pyromancer()]);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: theirs[0]! }), ap);
    moveObject(s, theirs[0]!, "hand");
    expect(abilitiesOf(s, s.objects[f]!).activated.length).toBe(0);
    moveObject(s, theirs[0]!, "battlefield");
    s.objects[theirs[0]!]!.controlledSinceTurn = -1;
    invalidateCharacteristics(s);
    expect(abilitiesOf(s, s.objects[f]!).activated.length).toBe(0);
    expect(planActivate(toNext(s, ap), opp, theirs[0]!, 0, [{ kind: "player", id: ap }])).not.toBeNull();
  });

  it("with no other nonland permanent, nothing is asked", () => {
    const { s, f } = castFence([]);
    expect(s.pending).toBeFalsy();
    expect(zone(s, f)).toBe("battlefield");
  });

  it("a bot chooses an opponent's permanent with activated abilities over one without", () => {
    const { s, ap, theirs } = castFence([pyromancer(), bear()]);
    const [a] = botActions(s, ap);
    expect(a).toEqual({ type: "chooseOption", player: ap, choice: theirs[0] });
  });

  it("a bot chooses nothing when no permanent has an activated ability", () => {
    const { s, ap } = castFence([bear()]);
    const [a] = botActions(s, ap);
    expect(a).toEqual({ type: "chooseOption", player: ap, choice: "none" });
  });
});

describe("round 402: Braided Net", () => {
  /** Ap's Braided Net (three net counters) and opp's permanents; it's ap's main phase. */
  function board(theirs: CardDef[]) {
    const { s, ap, opp } = setup([]);
    const n = putOnBattlefield(s, ap, net());
    s.objects[n]!.counters.net = 3;
    const t = theirs.map((d) => putOnBattlefield(s, opp, d));
    invalidateCharacteristics(s);
    return { s, ap, opp, n, theirs: t };
  }
  const netIt = (s: GameState, ap: PlayerId, n: ObjectId, id: ObjectId) => settle(run(s, planActivate(s, ap, n, 0, [{ kind: "object", id }])), ap);

  it("taps an opponent's Shivan Dragon; its {R} ability can't be activated while it stays tapped, and can again once it untaps", () => {
    let { s, ap, opp, n, theirs } = board([shivan()]);
    const d = theirs[0]!;
    s = netIt(s, ap, n, d);
    expect(s.objects[d]!.tapped).toBe(true);
    expect(s.objects[n]!.counters.net).toBe(2);
    let s1 = toNext(s, ap);
    expect(waitingOn(s1)).toBe(opp);
    s1.players[opp]!.manaPool.R = 1;
    expect(planActivate(s1, opp, d, 0)).toBeNull();
    // Opp's untap step untaps it (CR 502.3): the effect is over.
    s = passUntil(s, "upkeep", opp);
    expect(s.objects[d]!.tapped).toBe(false);
    s.players[opp]!.manaPool.R = 1;
    expect(waitingOn(s)).toBe(opp);
    expect(planActivate(s, opp, d, 0)).not.toBeNull();
  });

  it("an already tapped Basalt Monolith: even its untap ability can't be activated (rulings)", () => {
    let { s, ap, opp, n, theirs } = board([monolith()]);
    const m = theirs[0]!;
    s.objects[m]!.tapped = true;
    s = netIt(s, ap, n, m);
    const s1 = toNext(s, ap);
    s1.players[opp]!.manaPool.C = 3;
    expect(planActivate(s1, opp, m, 0)).toBeNull();
  });

  it("without the Net's effect the tapped Monolith can untap itself", () => {
    const { s, ap, opp, theirs } = board([monolith()]);
    const m = theirs[0]!;
    s.objects[m]!.tapped = true;
    const s1 = toNext(s, ap);
    s1.players[opp]!.manaPool.C = 3;
    expect(planActivate(s1, opp, m, 0)).not.toBeNull();
  });

  it("once it untaps and is tapped again by other means, the effect stays over (CR 611.2b)", () => {
    let { s, ap, opp, n, theirs } = board([shivan()]);
    const d = theirs[0]!;
    s = netIt(s, ap, n, d);
    s = passUntil(s, "upkeep", opp);
    expect(s.objects[d]!.tapped).toBe(false);
    s.objects[d]!.tapped = true;
    s.players[opp]!.manaPool.R = 1;
    expect(planActivate(s, opp, d, 0)).not.toBeNull();
  });

  it("can't be activated without a net counter", () => {
    const { s, ap, n, theirs } = board([shivan()]);
    s.objects[n]!.counters.net = 0;
    expect(planActivate(s, ap, n, 0, [{ kind: "object", id: theirs[0]! }])).toBeNull();
  });
});

describe("round 402: Duelist's Flame", () => {
  /**
   * Ap's Grizzly Bears attacks opp and opp's Bears blocks it; ap holds Duelist's Flame and has priority in the declare
   * blockers step. The top of ap's library is Demonic Tutor, then forests.
   */
  function blocked() {
    const { s: s0, ap, opp, ids } = setup([flame()]);
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, opp, bear());
    const tut = putOnBattlefield(s0, ap, tutor());
    moveObject(s0, tut, "library");
    s0.players[ap]!.library = [tut, ...s0.players[ap]!.library.filter((x) => x !== tut)];
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] });
    for (let i = 0; i < 40 && !(s.step === "declareBlockers" && waitingOn(s) === ap && !s.pending && !s.stack.length); i++) {
      const pid = waitingOn(s)!;
      if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [{ blocker: b, attacker: a }] });
      else if (s.pending && s.pending.player !== ap) for (const x of botActions(s, s.pending.player)) s = act(s, x);
      else s = act(s, { type: "passPriority", player: pid });
    }
    expect(s.step).toBe("declareBlockers");
    return { s, ap, opp, a, b, f: ids[0]!, tut };
  }
  /** Everyone passes until ap is asked something or the turn reaches its end step. */
  const toAsk = (s: GameState, ap: PlayerId) => {
    for (let i = 0; i < 200; i++) {
      if (s.pending?.player === ap) return s;
      if (s.step === "end") return s;
      const p = s.pending;
      if (p) for (const x of botActions(s, p.player)) s = act(s, x);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    return s;
  };

  it("X=3 on the blocked Bears: +3/+0 and trample, 3 damage tramples over, it looks at three cards and casts Demonic Tutor free", () => {
    let { s, ap, opp, a, f, tut } = blocked();
    s = settle(run(s, planCast(s, ap, f, [{ kind: "object", id: a }], undefined, undefined, 3)), ap);
    expect(ch(s, a).power).toBe(5);
    expect(ch(s, a).keywords).toContain("Trample");
    const life = s.players[opp]!.life;
    // Combat damage: 2 to the blocker, 3 to opp (CR 702.19c); the trigger looks at three cards.
    s = toAsk(s, ap);
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, cards: [tut], min: 0, max: 1 });
    const looked = s.players[ap]!.library.slice(0, 3);
    s = act(s, { type: "searchLibrary", player: ap, found: [tut] });
    expect(zone(s, tut)).toBe("exile");
    const lib = s.players[ap]!.library;
    expect(lib.slice(-2).sort()).toEqual(looked.slice(1).sort());
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: tut });
    s = settle(run(s, planCast(s, ap, tut)), ap);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
  });

  it("can't target an unblocked attacker", () => {
    const { s: s0, ap, opp, ids } = setup([flame()]);
    const a = putOnBattlefield(s0, ap, bear());
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] });
    for (let i = 0; i < 40 && !(s.step === "declareBlockers" && waitingOn(s) === ap && !s.pending); i++) {
      const pid = waitingOn(s)!;
      s = act(s, s.pending?.kind === "declareBlockers" ? { type: "declareBlockers", player: pid, blocks: [] } : { type: "passPriority", player: pid });
    }
    expect(planCast(s, ap, ids[0]!, [{ kind: "object", id: a }], undefined, undefined, 1)).toBeNull();
  });

  it("the trigger lasts only this turn: it's gone from the Bears afterwards", () => {
    let { s, ap, a, f } = blocked();
    s = settle(run(s, planCast(s, ap, f, [{ kind: "object", id: a }], undefined, undefined, 1)), ap);
    expect(abilitiesOf(s, s.objects[a]!).triggers.length).toBe(1);
    const next = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    for (let i = 0; i < 400 && !(s.step === "upkeep" && s.activePlayer === next); i++) {
      const p = s.pending;
      if (p) for (const x of botActions(s, p.player)) s = act(s, x);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.activePlayer).toBe(next);
    expect(abilitiesOf(s, s.objects[a]!).triggers.length).toBe(0);
    expect(ch(s, a).power).toBe(2);
  });
});
