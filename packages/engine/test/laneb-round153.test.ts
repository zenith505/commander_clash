// Lane B round B153: Teferi, Timeless Voyager ("Until the end of your next turn, they can't phase in", CR 702.26a),
// Capricious Efreet ("Destroy one of them at random", rulings, CR 608.2b), Fickle Efreet (a flip at end of combat, then
// "an opponent gains control of ~", CR 603.7, 705), Dancing Sword (it becomes a 2/1 Construct artifact creature and
// isn't an Equipment, CR 205.1a), Boros Battleshaper ("this combat", CR 500.5a, 508.1d, 509.1c), Ardent Dustspeaker ("you
// may put an instant or sorcery card from your graveyard on the bottom of your library. If you do, ..."), Aura Graft
// ("Attach it to another permanent it can enchant", CR 303.4d) and Split the Spoils (you separate the exiled cards, an
// opponent chooses the pile put into your hand, CR 700.3).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, runStateBasedActions, waitingOn, wardCosts, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const teferi = (): CardDef => ({"oracleId":"7240037f-ddea-425e-9824-866e2bb0dc84","name":"Teferi, Timeless Voyager","manaCost":"{4}{U}{U}","cmc":6,"typeLine":"Legendary Planeswalker — Teferi","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Teferi"],"oracleText":"+1: Draw a card.\n−3: Put target creature on top of its owner's library.\n−8: Each creature target opponent controls phases out. Until the end of your next turn, they can't phase in. (Treat them and anything attached to them as though they don't exist.)","loyalty":"4","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/2/62d05287-ad7f-4de8-9f68-8f36c62fae72.jpg?1783930622","artUrl":"https://cards.scryfall.io/art_crop/front/6/2/62d05287-ad7f-4de8-9f68-8f36c62fae72.jpg?1783930622","commanderLegal":"legal","set":"m21","releasedAt":"2020-07-03","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const capricious = (): CardDef => ({"oracleId":"9abd2286-23e9-49cd-be53-39423890f35c","name":"Capricious Efreet","manaCost":"{4}{R}{R}","cmc":6,"typeLine":"Creature — Efreet","supertypes":[],"types":["Creature"],"subtypes":["Efreet"],"oracleText":"At the beginning of your upkeep, choose target nonland permanent you control and up to two target nonland permanents you don't control. Destroy one of them at random.","power":"6","toughness":"4","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/d/3d844b29-3b5e-4824-befc-affe6aac6d87.jpg?1783942375","artUrl":"https://cards.scryfall.io/art_crop/front/3/d/3d844b29-3b5e-4824-befc-affe6aac6d87.jpg?1783942375","commanderLegal":"legal","set":"m10","releasedAt":"2009-07-17","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const fickle = (): CardDef => ({"oracleId":"e5cd1024-ec1a-4df9-8bc6-ad2f3f443d06","name":"Fickle Efreet","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Efreet","supertypes":[],"types":["Creature"],"subtypes":["Efreet"],"oracleText":"Whenever this creature attacks or blocks, flip a coin at end of combat. If you lose the flip, an opponent gains control of this creature.","power":"5","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/ca6d047a-f3dc-4c34-9679-fb76037e4044.jpg?1783945778","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/ca6d047a-f3dc-4c34-9679-fb76037e4044.jpg?1783945778","commanderLegal":"legal","set":"pcy","releasedAt":"2000-06-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const sword = (): CardDef => ({"oracleId":"da3b12d1-8867-4063-b50d-3b2f5ce0549f","name":"Dancing Sword","manaCost":"{1}{W}","cmc":2,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +2/+1.\nWhen equipped creature dies, you may have this Equipment become a 2/1 Construct artifact creature with flying and ward {1}. If you do, it isn't an Equipment.\nEquip {1}","colors":["W"],"colorIdentity":["W"],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/8/b/8b8b5883-b2e7-4c56-89b5-b40fb8416a3a.jpg?1783926397","artUrl":"https://cards.scryfall.io/art_crop/front/8/b/8b8b5883-b2e7-4c56-89b5-b40fb8416a3a.jpg?1783926397","commanderLegal":"legal","set":"afr","releasedAt":"2021-07-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const shaper = (): CardDef => ({"oracleId":"cf5bf1ef-e40b-4fb5-8148-d4ca7a307501","name":"Boros Battleshaper","manaCost":"{5}{R}{W}","cmc":7,"typeLine":"Creature — Minotaur Soldier","supertypes":[],"types":["Creature"],"subtypes":["Minotaur","Soldier"],"oracleText":"At the beginning of each combat, up to one target creature attacks or blocks this combat if able and up to one target creature can't attack or block this combat.","power":"5","toughness":"5","colors":["R","W"],"colorIdentity":["R","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/c/6c43e449-acf2-4e94-b7cf-8c84d70191da.jpg?1783940032","artUrl":"https://cards.scryfall.io/art_crop/front/6/c/6c43e449-acf2-4e94-b7cf-8c84d70191da.jpg?1783940032","commanderLegal":"legal","set":"dgm","releasedAt":"2013-05-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const dust = (): CardDef => ({"oracleId":"370974e7-d242-4f24-a031-cba71c935306","name":"Ardent Dustspeaker","manaCost":"{4}{R}","cmc":5,"typeLine":"Creature — Minotaur Shaman","supertypes":[],"types":["Creature"],"subtypes":["Minotaur","Shaman"],"oracleText":"Whenever this creature attacks, you may put an instant or sorcery card from your graveyard on the bottom of your library. If you do, exile the top two cards of your library. You may play those cards this turn.","power":"3","toughness":"4","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/f/7ff4832a-26c0-4da5-abbb-1941e7084e72.jpg?1783927358","artUrl":"https://cards.scryfall.io/art_crop/front/7/f/7ff4832a-26c0-4da5-abbb-1941e7084e72.jpg?1783927358","commanderLegal":"legal","set":"stx","releasedAt":"2021-04-23","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const graft = (): CardDef => ({"oracleId":"00317e4f-0228-469a-9789-fb6c39976860","name":"Aura Graft","manaCost":"{1}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Gain control of target Aura that's attached to a permanent. Attach it to another permanent it can enchant.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7553877-7df2-42f7-98a3-1a07f66a4905.jpg?1783945267","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7553877-7df2-42f7-98a3-1a07f66a4905.jpg?1783945267","commanderLegal":"legal","set":"ody","releasedAt":"2001-10-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const spoils = (): CardDef => ({"oracleId":"48ad5bd6-9568-4813-be29-99aef8b9327a","name":"Split the Spoils","manaCost":"{2}{G}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Exile up to five target permanent cards from your graveyard and separate them into two piles. An opponent chooses one of those piles. Put that pile into your hand and the other into your graveyard. (Piles can be empty.)","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/5/55893f8b-0fea-40a5-b96d-954c99938810.jpg?1783922701","artUrl":"https://cards.scryfall.io/art_crop/front/5/5/55893f8b-0fea-40a5-b96d-954c99938810.jpg?1783922701","commanderLegal":"legal","set":"clb","releasedAt":"2022-06-10","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const tgt = (id: string) => ({ kind: "object" as const, id });
const none = { kind: "none" as const };
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
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
/** Everyone passes, answering the end-of-turn questions, until `active`'s `step`; stops at any other question. */
const goUntil = (s: GameState, step: GameState["step"], active: PlayerId, max = 3000) => {
  for (let i = 0; i < max; i++) {
    if (s.step === step && s.activePlayer === active) return s;
    const pid = waitingOn(s)!;
    const pend = s.pending;
    if (pend?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (pend?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (pend?.kind === "discardToHandSize") s = act(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, pend.count) });
    else if (pend) return s;
    else s = act(s, { type: "passPriority", player: pid });
  }
  throw new Error(`never reached ${step}`);
};
const toZone = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone === "hand" ? "hand" : "graveyard"].push(id);
  invalidateCharacteristics(s);
  return id;
};
const others = (s: GameState, ap: PlayerId) => {
  const i = s.turnOrder.indexOf(ap);
  return [1, 2, 3].map((k) => s.turnOrder[(i + k) % 4]!);
};
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
const lines = (s: GameState) => s.log.map((l) => l.text);

describe("Lane B round B153", () => {
  it("compiles the cards", () => supported(teferi(), capricious(), fickle(), sword(), shaper(), dust(), graft(), spoils()));

  it("Teferi, Timeless Voyager: the opponent's creatures phase out and stay out until the end of your next turn", () => {
    const { s: s0, ap } = setup([]);
    const [o1, o2] = others(s0, ap);
    const t = putOnBattlefield(s0, ap, teferi());
    s0.objects[t]!.counters.loyalty = 8;
    const a = putOnBattlefield(s0, o1!, bear({ name: "Their Bear" }));
    const aura = putOnBattlefield(s0, o1!, card("Test Aura", "Enchantment — Aura", "{G}", { oracleText: "Enchant creature" }));
    s0.objects[aura]!.attachedTo = a;
    const b = putOnBattlefield(s0, o2!, bear({ name: "Other Bear" }));
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planActivate(s0, ap, t, 2, [{ kind: "player", id: o1! }])));
    expect(zone(s, a)).toBe("phasedOut");
    expect(zone(s, aura)).toBe("phasedOut"); // with the creature (CR 702.26g)
    expect(zone(s, b)).toBe("battlefield");
    const turn = s.turn;
    // Their next untap step: still phased out.
    s = goUntil(s, "upkeep", o1!);
    expect(zone(s, a)).toBe("phasedOut");
    // Your next turn: still out until it ends.
    s = goUntil(s, "main1", ap);
    expect(s.turn).toBeGreaterThan(turn);
    expect(zone(s, a)).toBe("phasedOut");
    // Their untap step after your next turn: both phase in, the Aura still attached.
    s = goUntil(s, "upkeep", o1!);
    expect(zone(s, a)).toBe("battlefield");
    expect(zone(s, aura)).toBe("battlefield");
    expect(s.objects[aura]!.attachedTo).toBe(a);
  });

  it("Capricious Efreet: one of the targets, chosen at random, is destroyed; one that left isn't chosen", () => {
    const { s: s0, ap } = setup([]);
    const [o1, o2] = others(s0, ap);
    const ef = putOnBattlefield(s0, ap, capricious());
    const mine = putOnBattlefield(s0, ap, card("My Relic", "Artifact", "{1}"));
    const x = putOnBattlefield(s0, o1!, bear({ name: "Their Bear" }));
    const y = putOnBattlefield(s0, o2!, card("Their Relic", "Artifact", "{1}"));
    let s = goUntil(s0, "upkeep", ap);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    // The first target must be yours, the others not; a land isn't a target.
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(x), tgt(mine), none] })).toThrow();
    const done = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(mine), tgt(x), tgt(y)] }));
    const gone = [mine, x, y].filter((id) => zone(done, id) === "graveyard");
    expect(gone.length).toBe(1);
    expect(lines(done).some((l) => /^Capricious Efreet chooses .+ at random\.$/.test(l))).toBe(true);
    // The only target still legal is the one destroyed (rulings): the other two left before it resolved.
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(ef), tgt(x), none] });
    s.battlefield.splice(s.battlefield.indexOf(ef), 1);
    s.objects[ef]!.zone = "graveyard";
    s.objects[ef]!.zoneChanges = (s.objects[ef]!.zoneChanges ?? 0) + 1;
    s.players[ap]!.graveyard.push(ef);
    invalidateCharacteristics(s);
    s = settle(s);
    expect(zone(s, x)).toBe("graveyard");
    expect(zone(s, mine)).toBe("battlefield");
  });

  it("Fickle Efreet: at end of combat a lost flip gives it to an opponent of your choice; a won flip keeps it", () => {
    const outcomes = new Set<string>();
    for (let seed = 1; seed <= 12 && outcomes.size < 2; seed++) {
      const { s: s0, ap } = setup([], seed);
      const [o1, o2] = others(s0, ap);
      const ef = putOnBattlefield(s0, ap, fickle());
      let s = goUntil(s0, "declareAttackers", ap);
      s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: ef, defender: o1! }] });
      // The attack trigger only sets up the flip; nothing is flipped before end of combat.
      s = settle(s);
      expect(lines(s).filter((l) => /(?:wins|loses) the flip|flips a coin/i.test(l))).toEqual([]);
      for (let i = 0; i < 400 && !s.pending && !(s.step === "main2"); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      if (s.pending?.kind === "declareBlockers") {
        s = settle(act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] }));
        for (let i = 0; i < 400 && !s.pending && !(s.step === "main2"); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      }
      if (s.pending) {
        // Lost: you choose the opponent.
        expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap });
        expect(s.step).toBe("endCombat");
        s = settle(act(s, { type: "chooseOption", player: ap, choice: String(o2!) }));
        expect(controllerOf(s, s.objects[ef]!)).toBe(o2);
        outcomes.add("lost");
      } else {
        expect(controllerOf(s, s.objects[ef]!)).toBe(ap);
        outcomes.add("won");
      }
    }
    expect([...outcomes].sort()).toEqual(["lost", "won"]);
  });

  it("Dancing Sword: when the equipped creature dies you may have it become a 2/1 flying Construct that isn't an Equipment", () => {
    for (const yes of [true, false]) {
      const { s: s0, ap } = setup([]);
      const sw = putOnBattlefield(s0, ap, sword());
      const b = putOnBattlefield(s0, ap, bear());
      let s = settle(run(s0, planActivate(s0, ap, sw, 0, [tgt(b)])));
      expect(s.objects[sw]!.attachedTo).toBe(b);
      s.objects[b]!.damage = 5;
      runStateBasedActions(s);
      s = settle(s);
      expect(zone(s, b)).toBe("graveyard");
      expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
      s = settle(act(s, { type: "chooseMay", player: ap, yes }));
      const ch = characteristics(s, s.objects[sw]!);
      if (yes) {
        expect(ch.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
        expect(ch.subtypes).toEqual(["Construct"]);
        expect([ch.power, ch.toughness]).toEqual([2, 1]);
        expect(objHasKeyword(s, s.objects[sw]!, "Flying")).toBe(true);
        expect(wardCosts(s, others(s, ap)[0]!, [tgt(sw)])).toEqual(["{1}"]);
      } else {
        expect(ch.types).toEqual(["Artifact"]);
        expect(ch.subtypes).toEqual(["Equipment"]);
      }
    }
  });

  it("Boros Battleshaper: one creature must attack this combat, another can't; both end with the combat", () => {
    const { s: s0, ap } = setup([]);
    const [o1] = others(s0, ap);
    const shp = putOnBattlefield(s0, ap, shaper());
    const forced = putOnBattlefield(s0, ap, bear({ name: "Forced Bear" }));
    const stopped = putOnBattlefield(s0, ap, bear({ name: "Stopped Bear" }));
    let s = goUntil(s0, "beginCombat", ap);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(forced), tgt(stopped)] }));
    s = goUntil(s, "declareAttackers", ap);
    expect(s.pending).toMatchObject({ kind: "declareAttackers" });
    // The forced one has to attack; the other can't.
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [] })).toThrow();
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: forced, defender: o1! }, { attacker: stopped, defender: o1! }] })).toThrow();
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: forced, defender: o1! }, { attacker: shp, defender: o1! }] });
    s = goUntil(s, "main2", ap);
    // "This combat" only (CR 500.5a).
    expect(s.effects.filter((e) => e.sourceName === "Boros Battleshaper").length).toBe(0);
  });

  it("Boros Battleshaper: the same creature for both targets can't attack (CR 115.3, 508.1d)", () => {
    const { s: s0, ap } = setup([]);
    const [o1] = others(s0, ap);
    putOnBattlefield(s0, ap, shaper());
    const both = putOnBattlefield(s0, ap, bear({ name: "Both Bear" }));
    let s = goUntil(s0, "beginCombat", ap);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(both), tgt(both)] }));
    s = goUntil(s, "declareAttackers", ap);
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: both, defender: o1! }] })).toThrow();
    s = act(s, { type: "declareAttackers", player: ap, attacks: [] });
    expect(s.objects[both]!.attacking).toBeFalsy();
  });

  it("Ardent Dustspeaker: an instant or sorcery card from your graveyard to the bottom, then the top two exiled to play this turn", () => {
    const { s: s0, ap } = setup([]);
    const [o1] = others(s0, ap);
    const d = putOnBattlefield(s0, ap, dust());
    const bolt = toZone(s0, ap, card("Test Bolt", "Instant", "{R}", { oracleText: "Test Bolt deals 3 damage to any target." }), "graveyard");
    const top = s0.players[ap]!.library.slice(0, 2);
    let s = goUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: d, defender: o1! }] });
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    if (s.pending?.kind === "searchLibrary") s = settle(act(s, { type: "searchLibrary", player: ap, found: [bolt] }));
    expect(zone(s, bolt)).toBe("library");
    expect(s.players[ap]!.library[s.players[ap]!.library.length - 1]).toBe(bolt);
    for (const id of top) expect(zone(s, id)).toBe("exile");
  });

  it("Ardent Dustspeaker: with no instant or sorcery card in your graveyard, nothing is exiled", () => {
    const { s: s0, ap } = setup([]);
    const [o1] = others(s0, ap);
    const d = putOnBattlefield(s0, ap, dust());
    toZone(s0, ap, bear(), "graveyard");
    const top = s0.players[ap]!.library.slice(0, 2);
    let s = goUntil(s0, "declareAttackers", ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: d, defender: o1! }] }));
    if (s.pending?.kind === "chooseMay") s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.pending?.kind).not.toBe("searchLibrary");
    for (const id of top) expect(zone(s, id)).toBe("library");
  });

  it("Aura Graft: you gain control of the Aura and attach it to another permanent it can enchant", () => {
    const { s: s0, ap, ids } = setup([graft()]);
    const [o1] = others(s0, ap);
    const theirs = putOnBattlefield(s0, o1!, bear({ name: "Their Bear" }));
    const mine = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    const other = putOnBattlefield(s0, o1!, bear({ name: "Other Bear" }));
    const aura = putOnBattlefield(s0, o1!, card("Test Might", "Enchantment — Aura", "{G}", { oracleText: "Enchant creature\nEnchanted creature gets +2/+2." }));
    s0.objects[aura]!.attachedTo = theirs;
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(aura)])));
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "enchant" });
    if (s.pending?.kind !== "chooseOption") throw new Error("no host choice");
    // Another permanent: not the one it's on; a land isn't a creature it can enchant.
    expect(s.pending.options).toContain(mine);
    expect(s.pending.options).toContain(other);
    expect(s.pending.options).not.toContain(theirs);
    expect(s.pending.prompt).toMatch(/permanent/);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: mine }));
    expect(controllerOf(s, s.objects[aura]!)).toBe(ap);
    expect(s.objects[aura]!.attachedTo).toBe(mine);
    expect(characteristics(s, s.objects[mine]!).power).toBe(4);
  });

  it("Aura Graft: with nowhere else to go the Aura stays where it is, under your control (rulings)", () => {
    const { s: s0, ap, ids } = setup([graft()]);
    const [o1] = others(s0, ap);
    const relic = putOnBattlefield(s0, o1!, card("Their Relic", "Artifact", "{1}"));
    const aura = putOnBattlefield(s0, o1!, card("Test Lock", "Enchantment — Aura", "{W}", { oracleText: "Enchant artifact" }));
    s0.objects[aura]!.attachedTo = relic;
    invalidateCharacteristics(s0);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(aura)])));
    expect(s.pending ?? undefined).toBeUndefined();
    expect(controllerOf(s, s.objects[aura]!)).toBe(ap);
    expect(s.objects[aura]!.attachedTo).toBe(relic);
  });

  it("Split the Spoils: you separate the exiled cards, an opponent chooses the pile for your hand, the other goes to your graveyard", () => {
    const { s: s0, ap, ids } = setup([spoils()]);
    const [o1] = others(s0, ap);
    const a = toZone(s0, ap, bear({ name: "Bear A" }), "graveyard");
    const b = toZone(s0, ap, bear({ name: "Bear B" }), "graveyard");
    const c = toZone(s0, ap, card("Relic C", "Artifact", "{1}"), "graveyard");
    const bolt = toZone(s0, ap, card("Test Bolt", "Instant", "{R}", { oracleText: "Test Bolt deals 3 damage to any target." }), "graveyard");
    // An instant isn't a permanent card.
    expect(planCast(s0, ap, ids[0]!, [tgt(bolt), none, none, none, none])).toBeNull();
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(a), tgt(b), tgt(c), none, none])));
    for (const id of [a, b, c]) expect(zone(s, id)).toBe("exile");
    if (s.pending?.kind === "chooseOption" && s.pending.what === "opponent") s = settle(act(s, { type: "chooseOption", player: ap, choice: String(o1!) }));
    // You separate them.
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, piles: true });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [a] }));
    // The opponent chooses (here the bot: the pile worth less to you).
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: o1, what: "pile", of: ap });
    const bot = botActions(s, o1!);
    expect(bot[0]).toMatchObject({ type: "chooseOption", choice: "0" });
    s = settle(act(s, { type: "chooseOption", player: o1!, choice: "1" }));
    expect(zone(s, a)).toBe("graveyard");
    expect(zone(s, b)).toBe("hand");
    expect(zone(s, c)).toBe("hand");
    expect(zone(s, ids[0]!)).toBe("graveyard");
  });

  it("bots: Capricious Efreet risks their own cheapest permanent and aims the rest at opponents'; Battleshaper's targets are legal", () => {
    const { s: s0, ap } = setup([]);
    const [o1, o2] = others(s0, ap);
    const ef = putOnBattlefield(s0, o1!, capricious());
    const junk = putOnBattlefield(s0, o1!, card("Bot Trinket", "Artifact", "{1}"));
    const mineA = putOnBattlefield(s0, ap, card("Big Relic", "Artifact", "{6}"));
    const theirB = putOnBattlefield(s0, o2!, bear({ name: "Other Bear" }));
    let s = goUntil(s0, "upkeep", o1!);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: o1 });
    const a = botActions(s, o1!)[0]!;
    if (a.type !== "chooseTargets") throw new Error(a.type);
    expect(a.targets[0]).toEqual(tgt(junk));
    const rest = a.targets.slice(1).flatMap((x) => (x.kind === "object" ? [x.id] : []));
    expect(rest.length).toBeGreaterThan(0);
    for (const id of rest) expect([mineA, theirB]).toContain(id);
    expect(rest).not.toContain(ef);
    s = settle(act(s, a));
    putOnBattlefield(s, o2!, shaper());
    // Battleshaper's trigger at o1's beginning of combat: the bot's choice is legal.
    s = goUntil(s, "beginCombat", o1!);
    for (let i = 0; i < 20 && s.pending?.kind === "chooseTargets"; i++) s = settle(act(s, botActions(s, s.pending.player)[0]!));
    expect(s.pending?.kind).not.toBe("chooseTargets");
  });
});
