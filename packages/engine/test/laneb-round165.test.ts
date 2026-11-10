// Lane B round B165: white mana spent as though it were red (Sunglasses of Urza; CR 609.4b), mana only from basic lands
// (Imperiosaur; CR 106.3, rulings), an ability gained only once by its text (Musician; rulings), a payment that keeps a
// group of creatures named alike (Rohgahh of Kher Keep; rulings), a search for a card with the cast spell's name (Mishra,
// Artificer Prodigy), two card names chosen by you and an opponent (Null Chamber; CR 101.4, rulings) and a source sharing a
// color with the mana spent on an activation (Protective Sphere; CR 609.7a).

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup } from "./helpers";
import { botActions, canPlayLandNow, castProblem, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const sunglasses = (): CardDef => ({"oracleId":"eea64b1f-d6a9-4f72-8612-efab4b124b63","name":"Sunglasses of Urza","manaCost":"{3}","cmc":3,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"You may spend white mana as though it were red mana.","colors":[],"colorIdentity":[],"keywords":[],"layout":"normal"}) as CardDef;
const imperiosaur = (): CardDef => ({"oracleId":"e9ced5d8-8337-403f-86a3-bddb9c77d658","name":"Imperiosaur","manaCost":"{2}{G}{G}","cmc":4,"typeLine":"Creature — Dinosaur","supertypes":[],"types":["Creature"],"subtypes":["Dinosaur"],"oracleText":"Spend only mana produced by basic lands to cast this spell.","power":"5","toughness":"5","colors":["G"],"colorIdentity":["G"],"keywords":[],"layout":"normal"}) as CardDef;
const musician = (): CardDef => ({"oracleId":"0d6e9468-adb2-4feb-87cf-9113db8717b1","name":"Musician","manaCost":"{2}{U}","cmc":3,"typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"Cumulative upkeep {1} (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)\n{T}: Put a music counter on target creature. If it doesn't have \"At the beginning of your upkeep, destroy this creature unless you pay {1} for each music counter on it,\" it gains that ability.","power":"1","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Cumulative upkeep"],"layout":"normal"}) as CardDef;
const rohgahh = (): CardDef => ({"oracleId":"44412804-aa69-4e62-b118-123741d91914","name":"Rohgahh of Kher Keep","manaCost":"{2}{B}{B}{R}{R}","cmc":6,"typeLine":"Legendary Creature — Kobold","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Kobold"],"oracleText":"At the beginning of your upkeep, you may pay {R}{R}{R}. If you don't, tap Rohgahh and all creatures named Kobolds of Kher Keep, then an opponent gains control of them.\nCreatures you control named Kobolds of Kher Keep get +2/+2.","power":"5","toughness":"5","colors":["B","R"],"colorIdentity":["B","R"],"keywords":[],"layout":"normal"}) as CardDef;
const kobolds = (): CardDef => ({"oracleId":"badf0669-9f65-44e3-bf91-6c57ac2fecff","name":"Kobolds of Kher Keep","manaCost":"{0}","cmc":0,"typeLine":"Creature — Kobold","supertypes":[],"types":["Creature"],"subtypes":["Kobold"],"oracleText":"","power":"0","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const mishra = (): CardDef => ({"oracleId":"b38adaac-3714-4348-9fec-cb2e2ad518b1","name":"Mishra, Artificer Prodigy","manaCost":"{1}{U}{B}{R}","cmc":4,"typeLine":"Legendary Creature — Human Artificer","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Artificer"],"oracleText":"Whenever you cast an artifact spell, you may search your graveyard, hand, and/or library for a card with the same name as that spell and put it onto the battlefield. If you search your library this way, shuffle.","power":"4","toughness":"4","colors":["B","R","U"],"colorIdentity":["B","R","U"],"keywords":[],"layout":"normal"}) as CardDef;
const chamber = (): CardDef => ({"oracleId":"cb75aca6-dfc7-460d-b90c-80b7988f39a8","name":"Null Chamber","manaCost":"{3}{W}","cmc":4,"typeLine":"World Enchantment","supertypes":["World"],"types":["Enchantment"],"subtypes":[],"oracleText":"As this enchantment enters, you and an opponent each choose a card name other than a basic land card name.\nSpells with the chosen names can't be cast and lands with the chosen names can't be played.","colors":["W"],"colorIdentity":["W"],"keywords":[],"layout":"normal"}) as CardDef;
const sphere = (): CardDef => ({"oracleId":"2037c4bf-bf0d-46ab-8b4b-61d9a50c431e","name":"Protective Sphere","manaCost":"{2}{W}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"{1}, Pay 1 life: Prevent all damage that would be dealt to you this turn by a source of your choice that shares a color with the mana spent on this activation cost. (Colorless mana prevents no damage.)","colors":["W"],"colorIdentity":["W"],"keywords":[],"layout":"normal"}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"layout":"normal"}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"layout":"normal"}) as CardDef;
const sprawl = (): CardDef => ({"oracleId":"00d8efa6-a2d9-4249-8da7-b45173675329","name":"Utopia Sprawl","manaCost":"{G}","cmc":1,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant Forest\nAs this Aura enters, choose a color.\nWhenever enchanted Forest is tapped for mana, its controller adds an additional one mana of the chosen color.","colors":["G"],"colorIdentity":["G"],"keywords":["Enchant"],"layout":"normal"}) as CardDef;
const guildgate = (): CardDef => ({"oracleId":"73c423b7-cab8-4e69-8070-9edbf96a6c2c","name":"Boros Guildgate","manaCost":"","cmc":0,"typeLine":"Land — Gate","supertypes":[],"types":["Land"],"subtypes":["Gate"],"oracleText":"This land enters tapped.\n{T}: Add {R} or {W}.","colors":[],"colorIdentity":["R","W"],"keywords":[],"layout":"normal"}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const tgt = (id: string): TargetChoice => ({ kind: "object", id }) as TargetChoice;
const ply = (id: PlayerId): TargetChoice => ({ kind: "player", id }) as TargetChoice;
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
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Leaves only these lands of `pid`'s on the battlefield. */
const keepLands = (s: GameState, pid: PlayerId, names: string[]) => {
  for (const id of [...s.battlefield]) {
    const o = s.objects[id]!;
    if (o.controller === pid && s.cards[o.cardId]!.types.includes("Land") && !names.includes(s.cards[o.cardId]!.name)) {
      s.battlefield.splice(s.battlefield.indexOf(id), 1);
      o.zone = "graveyard";
      s.players[pid]!.graveyard.push(id);
    }
  }
  invalidateCharacteristics(s);
};
const others = (s: GameState, ap: PlayerId) => {
  const i = s.turnOrder.indexOf(ap);
  return [1, 2, 3].map((k) => s.turnOrder[(i + k) % 4]!);
};
const pool = (s: GameState, pid: PlayerId, m: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  s.players[pid]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...m };
};
const named = (s: GameState, name: string) => s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === name);
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
/** Taps `pid`'s untapped lands named `name` for mana, `n` of them. */
const tapFor = (s: GameState, pid: PlayerId, name: string, mana: "G" | "C", n = 1) => {
  for (const id of named(s, name).filter((x) => !s.objects[x]!.tapped && s.objects[x]!.controller === pid).slice(0, n)) s = act(s, { type: "activateMana", player: pid, objectId: id, mana });
  return s;
};

describe("Sunglasses of Urza: white mana spent as though it were red", () => {
  it("compiles", () => supported(sunglasses()));

  it("a Plains pays {R}; without the Sunglasses it can't", () => {
    const { s: s0, ap, ids, opp } = setup([bolt()]);
    keepLands(s0, ap, ["Plains"]);
    expect(planCast(s0, ap, ids[0]!, [ply(opp)])).toBeNull();
    putOnBattlefield(s0, ap, sunglasses());
    invalidateCharacteristics(s0);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [ply(opp)])));
    expect(s.players[opp]!.life).toBe(37);
    // The mana spent stays white: a Plains was tapped (CR 609.4b).
    expect(named(s, "Plains").filter((id) => s.objects[id]!.tapped).length).toBe(1);
  });

  it("white mana in the pool pays {R}{R} and a hybrid's red half; other colors still don't", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, sunglasses());
    keepLands(s0, ap, []);
    const twoRed = toZone(s0, ap, card("Twin Bolt", "Instant", "{R}{R}", { oracleText: "Twin Bolt deals 2 damage to any target." }), "hand");
    pool(s0, ap, { W: 2 });
    expect(castProblem(s0, ap, twoRed, [ply(others(s0, ap)[0]!)])).toBeNull();
    pool(s0, ap, { W: 1, U: 1 });
    expect(planCast(s0, ap, twoRed, [ply(others(s0, ap)[0]!)])).toBeNull();
    const rg = toZone(s0, ap, card("Hybrid Bolt", "Instant", "{R/G}", { oracleText: "Hybrid Bolt deals 2 damage to any target." }), "hand");
    pool(s0, ap, { W: 1 });
    expect(planCast(s0, ap, rg, [ply(others(s0, ap)[0]!)])).not.toBeNull();
  });

  it("only its controller's costs: an opponent's Plains still can't pay {R}", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, sunglasses());
    const theirs = toZone(s0, opp, bolt(), "hand");
    pool(s0, opp, { W: 1 });
    invalidateCharacteristics(s0);
    expect(planCast(s0, opp, theirs, [ply(ap)])).toBeNull();
  });
});

describe("Imperiosaur: spend only mana produced by basic lands to cast it", () => {
  it("compiles", () => supported(imperiosaur()));

  it("four basic lands cast it", () => {
    const { s: s0, ap, ids } = setup([imperiosaur()]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(named(s, "Imperiosaur").length).toBe(1);
  });

  it("Sol Ring's mana can't pay for it, in the pool or not", () => {
    const { s: s0, ap, ids } = setup([imperiosaur()]);
    keepLands(s0, ap, ["Forest", "Mountain"]);
    for (const id of named(s0, "Mountain")) s0.objects[id]!.tapped = true;
    const ring = putOnBattlefield(s0, ap, solRing());
    invalidateCharacteristics(s0);
    expect(planCast(s0, ap, ids[0]!)).toBeNull();
    let s = tapFor(s0, ap, "Sol Ring", "C");
    expect(s.objects[ring]!.tapped).toBe(true);
    expect(s.players[ap]!.manaPool.C).toBe(2);
    expect(planCast(s, ap, ids[0]!)).toBeNull();
    // A fourth basic land does it, and Sol Ring's mana stays in the pool.
    s.objects[named(s, "Mountain")[0]!]!.tapped = false;
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(named(s, "Imperiosaur").length).toBe(1);
    expect(s.players[ap]!.manaPool.C).toBe(2);
  });

  it("a nonbasic land's mana doesn't count, nor a creature's", () => {
    const { s: s0, ap, ids } = setup([imperiosaur()]);
    keepLands(s0, ap, ["Forest"]);
    for (const id of named(s0, "Forest").slice(2)) s0.objects[id]!.tapped = true;
    putOnBattlefield(s0, ap, guildgate());
    putOnBattlefield(s0, ap, bear({ name: "Mana Bear", oracleText: "{T}: Add {C}." }));
    putOnBattlefield(s0, ap, card("Wastes Gate", "Land", "", { oracleText: "{T}: Add {C}." }));
    invalidateCharacteristics(s0);
    expect(planCast(s0, ap, ids[0]!)).toBeNull();
  });

  it("Utopia Sprawl's extra mana comes from the Aura, not the Forest (rulings)", () => {
    const { s: s0, ap, ids } = setup([imperiosaur()]);
    keepLands(s0, ap, ["Forest"]);
    const forests = named(s0, "Forest");
    for (const id of forests.slice(1)) s0.objects[id]!.tapped = true;
    const aura = putOnBattlefield(s0, ap, sprawl());
    s0.objects[aura]!.attachedTo = forests[0]!;
    s0.objects[aura]!.chosen = { color: "G" };
    s0.objects[forests[1]!]!.tapped = false;
    s0.objects[forests[2]!]!.tapped = false;
    invalidateCharacteristics(s0);
    // Three basic Forests and the Sprawl's {G}: four mana, but only three from basic lands.
    let s = tapFor(s0, ap, "Forest", "G", 3);
    s = settle(s);
    expect(s.players[ap]!.manaPool.G).toBe(4);
    expect(planCast(s, ap, ids[0]!)).toBeNull();
  });
});

describe("Musician: a music counter, and the ability gained once", () => {
  it("compiles", () => supported(musician()));

  it("the target gets a counter and the upkeep ability, only once however many times it's targeted", () => {
    const { s: s0, ap, opp } = setup([]);
    const mus = putOnBattlefield(s0, ap, musician());
    const target = putOnBattlefield(s0, opp, bear());
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planActivate(s0, ap, mus, 0, [tgt(target)])));
    expect(s.objects[target]!.counters.music).toBe(1);
    const text = "At the beginning of your upkeep, destroy ~ unless you pay {1} for each music counter on it.";
    expect(characteristics(s, s.objects[target]!).grantedAbilities.filter((t) => t === text).length).toBe(1);
    s.objects[mus]!.tapped = false;
    s = settle(run(s, planActivate(s, ap, mus, 0, [tgt(target)])));
    expect(s.objects[target]!.counters.music).toBe(2);
    expect(characteristics(s, s.objects[target]!).grantedAbilities.filter((t) => t === text).length).toBe(1);
  });

  it("at its controller's upkeep: pay {1} for each music counter or it's destroyed", () => {
    const { s: s0, ap, opp } = setup([]);
    const mus = putOnBattlefield(s0, ap, musician());
    const target = putOnBattlefield(s0, opp, bear());
    const kept = putOnBattlefield(s0, opp, bear({ name: "Kept Bear" }));
    // One Forest to pay with: {1} for the one music counter on the Kept Bear.
    putOnBattlefield(s0, opp, card("Forest", "Basic Land — Forest"));
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planActivate(s0, ap, mus, 0, [tgt(target)])));
    s.objects[mus]!.tapped = false;
    s = settle(run(s, planActivate(s, ap, mus, 0, [tgt(kept)])));
    s = goUntil(s, "upkeep", opp);
    // Two triggers, one for each creature: decline the first asked, pay for the other.
    for (let i = 0; i < 20 && (s.pending || s.stack.length || s.triggerQueue.length); i++) {
      const pend = s.pending;
      if (pend?.kind === "chooseMay") {
        const about = s.resolving?.item.sourceId === kept;
        if (about) pool(s, opp, { C: 1 });
        s = act(s, { type: "chooseMay", player: opp, yes: about });
      } else if (pend) s = run(s, botActions(s, waitingOn(s)!));
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.objects[target]!.zone).toBe("graveyard");
    expect(s.objects[kept]!.zone).toBe("battlefield");
  });

  it("a music counter from elsewhere does nothing (rulings)", () => {
    const { s: s0, opp } = setup([]);
    const target = putOnBattlefield(s0, opp, bear());
    s0.objects[target]!.counters.music = 3;
    invalidateCharacteristics(s0);
    const s = goUntil(s0, "upkeep", opp);
    expect(s.pending).toBeNull();
    expect(s.stack.length).toBe(0);
    expect(s.objects[target]!.zone).toBe("battlefield");
  });
});

describe("Rohgahh of Kher Keep: pay {R}{R}{R} or the Kobolds go to an opponent", () => {
  it("compiles", () => supported(rohgahh(), kobolds()));

  it("Kobolds of Kher Keep you control get +2/+2; others' don't", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, rohgahh());
    const mine = putOnBattlefield(s, ap, kobolds());
    const theirs = putOnBattlefield(s, opp, kobolds());
    invalidateCharacteristics(s);
    expect(pt(s, mine)).toBe("2/3");
    expect(pt(s, theirs)).toBe("0/1");
  });

  it("not paid: Rohgahh and every creature named Kobolds of Kher Keep, anyone's, tapped and given to the opponent chosen", () => {
    const { s: s0, ap } = setup([]);
    const [o1, o2] = others(s0, ap);
    const boss = putOnBattlefield(s0, ap, rohgahh());
    const mine = putOnBattlefield(s0, ap, kobolds());
    const theirs = putOnBattlefield(s0, o1!, kobolds());
    s0.objects[theirs]!.tapped = true;
    const other = putOnBattlefield(s0, ap, bear());
    invalidateCharacteristics(s0);
    let s = goUntil(s0, "upkeep", ap);
    s = goUntil(s, "upkeep", ap);
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "opponent" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: String(o2) }));
    for (const id of [boss, mine, theirs]) {
      expect(s.objects[id]!.tapped).toBe(true);
      expect(controllerOf(s, s.objects[id]!)).toBe(o2);
    }
    expect(controllerOf(s, s.objects[other]!)).toBe(ap);
    // Now o2's: o2's Kobolds get +2/+2 from o2's Rohgahh.
    expect(pt(s, theirs)).toBe("2/3");
  });

  it("paid: nothing happens", () => {
    const { s: s0, ap } = setup([]);
    const boss = putOnBattlefield(s0, ap, rohgahh());
    const mine = putOnBattlefield(s0, ap, kobolds());
    invalidateCharacteristics(s0);
    let s = goUntil(s0, "upkeep", others(s0, ap)[0]!);
    s = goUntil(s, "upkeep", ap);
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    pool(s, ap, { R: 3 });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.players[ap]!.manaPool.R).toBe(0);
    for (const id of [boss, mine]) {
      expect(s.objects[id]!.tapped).toBe(false);
      expect(controllerOf(s, s.objects[id]!)).toBe(ap);
    }
  });
});

describe("Mishra, Artificer Prodigy: a card with the cast artifact spell's name onto the battlefield", () => {
  it("compiles", () => supported(mishra()));

  it("from the graveyard, the hand or (searching it) the library", () => {
    const { s: s0, ap, ids } = setup([solRing()]);
    putOnBattlefield(s0, ap, mishra());
    const inYard = toZone(s0, ap, solRing(), "graveyard");
    toZone(s0, ap, ornithopter(), "graveyard");
    invalidateCharacteristics(s0);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    if (s.pending?.kind === "chooseOption" && s.pending.what === "searchZones") s = settle(act(s, { type: "chooseOption", player: ap, choice: "graveyard" }));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    if (s.pending?.kind !== "searchLibrary") throw new Error("no search");
    // Only Sol Rings are offered, not the Ornithopter.
    const offered = s.pending.cards;
    expect(offered).toContain(inYard);
    expect(offered.every((id) => s.cards[s.objects[id]!.cardId]!.name === "Sol Ring")).toBe(true);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [inYard] }));
    expect(named(s, "Sol Ring").length).toBe(2);
  });
});

describe("Null Chamber: you and an opponent each choose a card name", () => {
  it("compiles", () => supported(chamber()));

  it("the opponent first, then the names in turn order; spells and lands with either name are banned for everyone", () => {
    const { s: s0, ap, ids } = setup([chamber()]);
    const [o1] = others(s0, ap);
    const myBolt = toZone(s0, ap, bolt(), "hand");
    const theirRing = toZone(s0, o1!, solRing(), "hand");
    const myGate = toZone(s0, ap, guildgate(), "hand");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "player" });
    s = act(s, { type: "chooseOption", player: ap, choice: String(o1) });
    // Its controller is the active player: first.
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "cardName" });
    if (s.pending?.kind !== "chooseOption") throw new Error("no name");
    expect(s.pending.options).not.toContain("Forest");
    s = act(s, { type: "chooseOption", player: ap, choice: "Sol Ring" });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: o1, what: "cardName" });
    if (s.pending?.kind !== "chooseOption") throw new Error("no name");
    expect(s.pending.prompt).toContain("chose Sol Ring");
    s = settle(act(s, { type: "chooseOption", player: o1!, choice: "Boros Guildgate" }));
    const ch = s.objects[named(s, "Null Chamber")[0]!]!;
    expect(ch.chosen).toMatchObject({ name: "Sol Ring", opponentName: "Boros Guildgate", player: o1 });
    // Sol Ring can't be cast, by anyone; the Guildgate can't be played; Lightning Bolt can.
    s.players[o1!]!.manaPool.C = 1;
    expect(castProblem(s, o1!, theirRing)).toMatch(/can't be cast/);
    expect(canPlayLandNow(s, ap, myGate)).toBe(false);
    expect(() => act(s, { type: "playLand", player: ap, objectId: myGate })).toThrow(/can't be played/);
    expect(planCast(s, ap, myBolt, [ply(o1!)])).not.toBeNull();
  });

  it("a bot opponent names one of the Chamber's controller's cards", () => {
    const { s: s0, ap, ids } = setup([chamber()]);
    const [o1] = others(s0, ap);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = act(s, { type: "chooseOption", player: ap, choice: String(o1) });
    s = act(s, { type: "chooseOption", player: ap, choice: "Grizzly Bears" });
    s = settle(run(s, botActions(s, o1!)));
    const ch = s.objects[named(s, "Null Chamber")[0]!]!;
    // Its controller's commander is the card it has shown most.
    expect(ch.chosen?.opponentName).toBe(s.cards[s.objects[s.players[ap]!.command[0]!]!.cardId]!.name);
  });
});

describe("Protective Sphere: a source sharing a color with the mana spent", () => {
  it("compiles", () => supported(sphere()));

  it("paid with red mana: only a red source is offered, and its damage to you is prevented this turn", () => {
    const { s: s0, ap } = setup([]);
    const [o1] = others(s0, ap);
    const sph = putOnBattlefield(s0, ap, sphere());
    const redOgre = putOnBattlefield(s0, o1!, card("Hot Ogre", "Creature — Ogre", "{2}{R}", { power: "3", toughness: "3" }));
    const green = putOnBattlefield(s0, o1!, bear({ name: "Green Bear" }));
    invalidateCharacteristics(s0);
    pool(s0, ap, { R: 1 });
    let s = settle(run(s0, planActivate(s0, ap, sph, 0)));
    expect(s.players[ap]!.life).toBe(39);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap });
    if (s.pending?.kind !== "chooseOption") throw new Error("no source");
    expect(s.pending.options.some((o) => o.startsWith(`${green}@`))).toBe(false);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: s.pending.options.find((o) => o.startsWith(`${redOgre}@`))! }));
    expect((s.damageRules ?? []).some((r) => r.by?.chosen?.id === redOgre)).toBe(true);
  });

  it("paid with colorless mana: no damage is prevented", () => {
    const { s: s0, ap } = setup([]);
    const [o1] = others(s0, ap);
    const sph = putOnBattlefield(s0, ap, sphere());
    putOnBattlefield(s0, o1!, card("Hot Ogre", "Creature — Ogre", "{2}{R}", { power: "3", toughness: "3" }));
    invalidateCharacteristics(s0);
    pool(s0, ap, { C: 1 });
    const s = settle(run(s0, planActivate(s0, ap, sph, 0)));
    expect(s.pending).toBeNull();
    expect(s.damageRules ?? []).toEqual([]);
  });
});
