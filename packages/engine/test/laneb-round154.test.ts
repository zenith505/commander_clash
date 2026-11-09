// Lane B round B154: Incite Rebellion (each player's own amount, to them and their creatures at once, CR 120.3), Blue
// Dragon (three targets until your next turn, CR 115.3, 611.2a), Hour of Eternity (token copies of the cards exiled this
// way, except 4/4 black Zombies, CR 707.9b), Undiscovered Paradise ("During your next untap step, as you untap your
// permanents, return ~ to its owner's hand", rulings), Viral Spawning (flashback only while an opponent has three or more
// poison counters, CR 702.34a), Trench Gorger (base P/T set by the lands exiled, CR 613.4b, rulings), Faces of the Past
// (tap or untap the creatures that share a creature type with the one that died, CR 608.2h) and Tomb of Urami ("if you
// don't control an Ogre"; "Sacrifice all lands you control", rulings).

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup } from "./helpers";
import { botActions, castProblem, invalidateCharacteristics, isFullySupported, objHasKeyword, objIsType, planActivate, planCast, power, toughness, waitingOn, characteristics, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const rebellion = (): CardDef => ({"oracleId":"26bbc473-cf99-4a82-b432-604757a832c4","name":"Incite Rebellion","manaCost":"{4}{R}{R}","cmc":6,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"For each player, Incite Rebellion deals damage to that player and each creature that player controls equal to the number of creatures they control.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/2/628c4a6f-6970-407d-a774-e67bfcdf7ee2.jpg?1783938867","artUrl":"https://cards.scryfall.io/art_crop/front/6/2/628c4a6f-6970-407d-a774-e67bfcdf7ee2.jpg?1783938867","commanderLegal":"legal","set":"c14","releasedAt":"2014-11-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const dragon = (): CardDef => ({"oracleId":"1d00e54a-5897-43dc-9c38-a0e2ce6a7433","name":"Blue Dragon","manaCost":"{5}{U}{U}","cmc":7,"typeLine":"Creature — Dragon","supertypes":[],"types":["Creature"],"subtypes":["Dragon"],"oracleText":"Flying\nLightning Breath — When this creature enters, until your next turn, target creature an opponent controls gets -3/-0, up to one other target creature gets -2/-0, and up to one other target creature gets -1/-0.","power":"5","toughness":"5","colors":["U"],"colorIdentity":["U"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/9/8/98dea71b-2778-4374-8ea2-7fa82f0f6110.jpg?1783926518","artUrl":"https://cards.scryfall.io/art_crop/front/9/8/98dea71b-2778-4374-8ea2-7fa82f0f6110.jpg?1783926518","commanderLegal":"legal","set":"afr","releasedAt":"2021-07-23","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const hour = (): CardDef => ({"oracleId":"6fbaac3b-37ec-4815-a4ea-544c547e90b1","name":"Hour of Eternity","manaCost":"{X}{X}{U}{U}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Exile X target creature cards from your graveyard. For each card exiled this way, create a token that's a copy of that card, except it's a 4/4 black Zombie.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/1/01040ed3-4f64-4e47-8f80-3d3a339004f7.jpg?1783936052","artUrl":"https://cards.scryfall.io/art_crop/front/0/1/01040ed3-4f64-4e47-8f80-3d3a339004f7.jpg?1783936052","commanderLegal":"legal","set":"hou","releasedAt":"2017-07-14","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const paradise = (): CardDef => ({"oracleId":"76c33d54-ce55-400e-bec5-79d33a5a20fb","name":"Undiscovered Paradise","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add one mana of any color. During your next untap step, as you untap your permanents, return this land to its owner's hand.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/5/f/5f6e8830-5e62-4945-8b73-60f0628d38e7.jpg?1783946969","artUrl":"https://cards.scryfall.io/art_crop/front/5/f/5f6e8830-5e62-4945-8b73-60f0628d38e7.jpg?1783946969","commanderLegal":"legal","set":"vis","releasedAt":"1997-02-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const viral = (): CardDef => ({"oracleId":"9945c7eb-97a9-42df-a051-1ea514973280","name":"Viral Spawning","manaCost":"{2}{G}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Create a 3/3 green Phyrexian Beast creature token with toxic 1. (Players dealt combat damage by it also get a poison counter.)\nCorrupted — As long as an opponent has three or more poison counters and this card is in your graveyard, it has flashback {2}{G}. (You may cast this card from your graveyard for its flashback cost. Then exile it.)","colors":["G"],"colorIdentity":["G"],"keywords":["Corrupted"],"imageUrl":"https://cards.scryfall.io/normal/front/8/5/85ad30a1-3ecc-42ca-afe8-85df5bad9196.jpg?1783918006","artUrl":"https://cards.scryfall.io/art_crop/front/8/5/85ad30a1-3ecc-42ca-afe8-85df5bad9196.jpg?1783918006","commanderLegal":"legal","set":"one","releasedAt":"2023-02-10","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const gorger = (): CardDef => ({"oracleId":"a5e37c6e-ae42-4c98-ba20-840ea3c4a6ab","name":"Trench Gorger","manaCost":"{6}{U}{U}","cmc":8,"typeLine":"Creature — Leviathan","supertypes":[],"types":["Creature"],"subtypes":["Leviathan"],"oracleText":"Trample\nWhen this creature enters, you may search your library for any number of land cards, exile them, then shuffle. If you do, this creature has base power and base toughness each equal to the number of cards exiled this way.","power":"6","toughness":"6","colors":["U"],"colorIdentity":["U"],"keywords":["Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/b/6/b631b71b-78f6-41bc-a26a-c761ee1671a1.jpg?1783941233","artUrl":"https://cards.scryfall.io/art_crop/front/b/6/b631b71b-78f6-41bc-a26a-c761ee1671a1.jpg?1783941233","commanderLegal":"legal","set":"cmd","releasedAt":"2011-06-17","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const faces = (): CardDef => ({"oracleId":"c8cd2b52-6d32-413f-9b26-2f9d436dbeae","name":"Faces of the Past","manaCost":"{2}{U}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever a creature dies, tap all untapped creatures that share a creature type with it or untap all tapped creatures that share a creature type with it.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/f/0f6dc35b-eb26-498f-ae35-0e860871446e.jpg?1783944887","artUrl":"https://cards.scryfall.io/art_crop/front/0/f/0f6dc35b-eb26-498f-ae35-0e860871446e.jpg?1783944887","commanderLegal":"legal","set":"scg","releasedAt":"2003-05-26","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const tomb = (): CardDef => ({"oracleId":"f002be6a-e459-49c4-b765-062e30107439","name":"Tomb of Urami","manaCost":"","cmc":0,"typeLine":"Legendary Land","supertypes":["Legendary"],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add {B}. Tomb of Urami deals 1 damage to you if you don't control an Ogre.\n{2}{B}{B}, {T}, Sacrifice all lands you control: Create Urami, a legendary 5/5 black Demon Spirit creature token with flying.","colors":[],"colorIdentity":["B"],"keywords":[],"producedMana":["B"],"imageUrl":"https://cards.scryfall.io/normal/front/9/0/90fedf90-825c-4814-8f0d-170f537db44c.jpg?1783944128","artUrl":"https://cards.scryfall.io/art_crop/front/9/0/90fedf90-825c-4814-8f0d-170f537db44c.jpg?1783944128","commanderLegal":"legal","set":"sok","releasedAt":"2005-06-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

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
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const lines = (s: GameState) => s.log.map((l) => l.text);

describe("Lane B round B154", () => {
  it("compiles the cards", () => supported(rebellion(), dragon(), hour(), paradise(), viral(), gorger(), faces(), tomb()));

  it("Incite Rebellion: each player and each of their creatures is dealt that player's own creature count, all at once", () => {
    const { s: s0, ap, ids } = setup([rebellion()]);
    const [o1, o2, o3] = others(s0, ap);
    s0.players[ap]!.hand = [ids[0]!];
    const myBear = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    const myBig = putOnBattlefield(s0, ap, card("My Giant", "Creature — Giant", "{4}", { power: "5", toughness: "5" }));
    const one = putOnBattlefield(s0, o1!, card("Lone Giant", "Creature — Giant", "{4}", { power: "5", toughness: "5" }));
    const trio = [0, 1, 2].map((k) => putOnBattlefield(s0, o2!, card(`Wall ${k}`, "Creature — Wall", "{2}", { power: "0", toughness: "4" })));
    const life = (p: PlayerId) => s0.players[p]!.life;
    const before = { ap: life(ap), o1: life(o1!), o2: life(o2!), o3: life(o3!) };
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.players[ap]!.life).toBe(before.ap - 2);
    expect(s.players[o1!]!.life).toBe(before.o1 - 1);
    expect(s.players[o2!]!.life).toBe(before.o2 - 3);
    expect(s.players[o3!]!.life).toBe(before.o3); // no creatures, no damage
    expect(zone(s, myBear)).toBe("graveyard"); // 2 damage
    expect(s.objects[myBig]!.damage).toBe(2);
    expect(s.objects[one]!.damage).toBe(1);
    for (const w of trio) expect(s.objects[w]!.damage).toBe(3);
  });

  it("Blue Dragon: three different targets, each its own -X/-0 until your next turn", () => {
    const { s: s0, ap, ids } = setup([dragon()]);
    const [o1, o2] = others(s0, ap);
    s0.players[ap]!.hand = [ids[0]!];
    const a = putOnBattlefield(s0, o1!, card("Their Giant", "Creature — Giant", "{4}", { power: "5", toughness: "5" }));
    const b = putOnBattlefield(s0, o2!, card("Other Giant", "Creature — Giant", "{4}", { power: "4", toughness: "4" }));
    const mine = putOnBattlefield(s0, ap, card("My Giant", "Creature — Giant", "{4}", { power: "3", toughness: "3" }));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    // The first target is a creature an opponent controls; the same creature can't be chosen twice (rulings).
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(mine), tgt(a), none] })).toThrow();
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(a), tgt(a), none] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(a), tgt(mine), tgt(b)] }));
    expect(pt(s, a)).toBe("2/5");
    expect(pt(s, mine)).toBe("1/3");
    expect(pt(s, b)).toBe("3/4");
    // Through the opponents' turns, gone as your next turn begins (CR 611.2a).
    s = goUntil(s, "upkeep", o2!);
    expect(pt(s, a)).toBe("2/5");
    s = goUntil(s, "upkeep", ap);
    expect(pt(s, a)).toBe("5/5");
    expect(pt(s, b)).toBe("4/4");
    expect(pt(s, mine)).toBe("3/3");
  });

  it("Blue Dragon: the two optional targets may be left out", () => {
    const { s: s0, ap, ids } = setup([dragon()]);
    const [o1] = others(s0, ap);
    s0.players[ap]!.hand = [ids[0]!];
    const a = putOnBattlefield(s0, o1!, card("Their Giant", "Creature — Giant", "{4}", { power: "5", toughness: "5" }));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(a), none, none] }));
    expect(pt(s, a)).toBe("2/5");
  });

  it("Hour of Eternity: a 4/4 black Zombie copy of each card exiled, its other characteristics kept", () => {
    const { s: s0, ap, ids } = setup([hour()]);
    s0.players[ap]!.hand = [ids[0]!];
    const flier = toZone(s0, ap, card("Test Angel", "Creature — Angel", "{3}{W}", { power: "2", toughness: "3", oracleText: "Flying", keywords: ["Flying"], colors: ["W"] }), "graveyard");
    const elf = toZone(s0, ap, card("Test Elf", "Creature — Elf Druid", "{G}", { power: "1", toughness: "1", colors: ["G"] }), "graveyard");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(flier), tgt(elf)], undefined, undefined, 2)));
    expect(zone(s, flier)).toBe("exile");
    expect(zone(s, elf)).toBe("exile");
    const made = s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap);
    expect(made.length).toBe(2);
    for (const id of made) {
      const ch = characteristics(s, s.objects[id]!);
      expect(pt(s, id)).toBe("4/4");
      expect(ch.colors).toEqual(["B"]);
      expect(ch.subtypes).toEqual(["Zombie"]); // instead of its other creature types (rulings)
      expect(objIsType(s, s.objects[id]!, "Creature")).toBe(true);
    }
    const angel = made.find((id) => characteristics(s, s.objects[id]!).name === "Test Angel")!;
    expect(objHasKeyword(s, s.objects[angel]!, "Flying")).toBe(true);
    expect(made.some((id) => characteristics(s, s.objects[id]!).name === "Test Elf")).toBe(true);
  });

  it("Hour of Eternity: a card that left the graveyard isn't exiled and isn't copied", () => {
    const { s: s0, ap, ids } = setup([hour()]);
    s0.players[ap]!.hand = [ids[0]!];
    const x = toZone(s0, ap, bear({ name: "Bear One" }), "graveyard");
    const y = toZone(s0, ap, bear({ name: "Bear Two" }), "graveyard");
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(x), tgt(y)], undefined, undefined, 2));
    // Bear Two goes back to the hand before it resolves.
    const p = s.players[ap]!;
    p.graveyard.splice(p.graveyard.indexOf(y), 1);
    p.hand.push(y);
    s.objects[y]!.zone = "hand";
    s.objects[y]!.zoneChanges = (s.objects[y]!.zoneChanges ?? 0) + 1;
    s = settle(s);
    expect(zone(s, x)).toBe("exile");
    expect(zone(s, y)).toBe("hand");
    const made = s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap);
    expect(made.map((id) => characteristics(s, s.objects[id]!).name)).toEqual(["Bear One"]);
  });

  it("Undiscovered Paradise: tapped for mana, it returns to its owner's hand during your next untap step", () => {
    const { s: s0, ap } = setup([]);
    const land = putOnBattlefield(s0, ap, paradise());
    let s = act(s0, { type: "activateMana", player: ap, objectId: land, mana: "U" });
    expect(s.players[ap]!.manaPool.U).toBe(1);
    expect(zone(s, land)).toBe("battlefield");
    // Not during another player's untap step.
    const [o1] = others(s, ap);
    s = goUntil(s, "upkeep", o1!);
    expect(zone(s, land)).toBe("battlefield");
    s = goUntil(s, "upkeep", ap);
    expect(zone(s, land)).toBe("hand");
    expect(s.players[ap]!.hand).toContain(land);
    expect(lines(s).some((l) => l === "Undiscovered Paradise returns to its owner's hand.")).toBe(true);
  });

  it("Undiscovered Paradise: one that isn't tapped for mana stays", () => {
    const { s: s0, ap } = setup([]);
    const land = putOnBattlefield(s0, ap, paradise());
    let s = goUntil(s0, "upkeep", others(s0, ap)[2]!);
    s = goUntil(s, "upkeep", ap);
    expect(zone(s, land)).toBe("battlefield");
  });

  it("Viral Spawning: flashback only while an opponent has three or more poison counters", () => {
    const { s: s0, ap } = setup([]);
    const [o1] = others(s0, ap);
    const vs = toZone(s0, ap, viral(), "graveyard");
    s0.players[o1!]!.poison = 2;
    expect(planCast(s0, ap, vs, undefined, undefined, undefined, undefined, { via: "flashback" })).toBeNull();
    expect(castProblem(s0, ap, vs, undefined, undefined, undefined, undefined, undefined, { via: "flashback" })).toMatch(/can't cast Viral Spawning from your graveyard now/);
    s0.players[o1!]!.poison = 3;
    const s = settle(run(s0, planCast(s0, ap, vs, undefined, undefined, undefined, undefined, { via: "flashback" })));
    expect(zone(s, vs)).toBe("exile");
    const beast = s.battlefield.find((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Beast"));
    expect(beast).toBeDefined();
    expect(objHasKeyword(s, s.objects[beast!]!, "Toxic 1")).toBe(true);
  });

  it("Trench Gorger: base power and toughness equal to the lands exiled, unchanged once they leave exile", () => {
    const { s: s0, ap, ids } = setup([gorger()]);
    s0.players[ap]!.hand = [ids[0]!];
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const tg = ids[0]!;
    expect(zone(s, tg)).toBe("battlefield");
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    const lands = (s.pending as { cards: string[] }).cards.filter((id) => objIsType(s, s.objects[id]!, "Land")).slice(0, 3);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: lands }));
    for (const l of lands) expect(zone(s, l)).toBe("exile");
    expect(pt(s, tg)).toBe("3/3");
    // A card leaving exile changes nothing (rulings).
    const p = s.players[ap]!;
    p.exile.splice(p.exile.indexOf(lands[0]!), 1);
    s.objects[lands[0]!]!.zone = "graveyard";
    p.graveyard.push(lands[0]!);
    invalidateCharacteristics(s);
    expect(pt(s, tg)).toBe("3/3");
  });

  it("Trench Gorger: if you don't search, it stays 6/6", () => {
    const { s: s0, ap, ids } = setup([gorger()]);
    s0.players[ap]!.hand = [ids[0]!];
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(pt(s, ids[0]!)).toBe("6/6");
  });

  it("Trench Gorger: a bot doesn't search (with no land found it would be 0/0)", () => {
    const { s: s0, ap, ids } = setup([gorger()]);
    s0.players[ap]!.hand = [ids[0]!];
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    const [a] = botActions(s, ap);
    expect(a).toMatchObject({ type: "chooseMay", yes: false });
    s = settle(act(s, a!));
    expect(pt(s, ids[0]!)).toBe("6/6");
  });

  it("Faces of the Past: tap all untapped creatures that share a creature type with the one that died, or untap all tapped ones", () => {
    const { s: s0, ap } = setup([]);
    const [o1] = others(s0, ap);
    putOnBattlefield(s0, ap, faces());
    const dying = putOnBattlefield(s0, o1!, card("Elf Warrior", "Creature — Elf Warrior", "{1}{G}", { power: "1", toughness: "1" }));
    const elfUp = putOnBattlefield(s0, o1!, card("Their Elf", "Creature — Elf", "{G}", { power: "1", toughness: "1" }));
    const warriorDown = putOnBattlefield(s0, ap, card("My Warrior", "Creature — Human Warrior", "{1}{W}", { power: "2", toughness: "2" }));
    const goblin = putOnBattlefield(s0, o1!, card("Their Goblin", "Creature — Goblin", "{R}", { power: "1", toughness: "1" }));
    s0.objects[warriorDown]!.tapped = true;
    const kill = (s: GameState) => {
      s.objects[dying]!.damage = 1;
      invalidateCharacteristics(s);
      return settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    };
    // Tap: the untapped Elf taps; the tapped Warrior stays tapped; the Goblin shares no type.
    let s = kill(structuredClone(s0));
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "either" });
    expect((s.pending as { labels: string[] }).labels).toEqual(["Tap all untapped creatures that share a creature type with it", "Untap all tapped creatures that share a creature type with it"]);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "0" }));
    expect(s.objects[elfUp]!.tapped).toBe(true);
    expect(s.objects[warriorDown]!.tapped).toBe(true);
    expect(s.objects[goblin]!.tapped).toBe(false);
    // Untap: the Warrior untaps.
    s = kill(structuredClone(s0));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "1" }));
    expect(s.objects[warriorDown]!.tapped).toBe(false);
    expect(s.objects[elfUp]!.tapped).toBe(false);
  });

  it("Faces of the Past: a bot taps the opponents' kin rather than untap its own lone creature", () => {
    const { s: s0, ap } = setup([]);
    const [o1, o2] = others(s0, ap);
    putOnBattlefield(s0, o2!, faces());
    const dying = putOnBattlefield(s0, ap, card("Elf Warrior", "Creature — Elf Warrior", "{1}{G}", { power: "1", toughness: "1" }));
    const e1 = putOnBattlefield(s0, ap, card("Elf A", "Creature — Elf", "{G}", { power: "1", toughness: "1" }));
    const e2 = putOnBattlefield(s0, o1!, card("Elf B", "Creature — Elf", "{G}", { power: "1", toughness: "1" }));
    const mine = putOnBattlefield(s0, o2!, card("Elf C", "Creature — Elf", "{G}", { power: "1", toughness: "1" }));
    s0.objects[mine]!.tapped = true;
    s0.objects[dying]!.damage = 1;
    invalidateCharacteristics(s0);
    let s = settle(act(s0, { type: "passPriority", player: waitingOn(s0)! }));
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: o2, what: "either" });
    const [a] = botActions(s, o2!);
    expect(a).toMatchObject({ type: "chooseOption", choice: "0" });
    s = settle(act(s, a!));
    expect(s.objects[e1]!.tapped).toBe(true);
    expect(s.objects[e2]!.tapped).toBe(true);
    expect(s.objects[mine]!.tapped).toBe(true);
  });

  it("Tomb of Urami: 1 damage to you unless you control an Ogre; sacrificing all your lands makes Urami", () => {
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, tomb());
    const life = s0.players[ap]!.life;
    let s = act(structuredClone(s0), { type: "activateMana", player: ap, objectId: t, mana: "B" });
    expect(s.players[ap]!.life).toBe(life - 1);
    const s1 = structuredClone(s0);
    putOnBattlefield(s1, ap, card("Test Ogre", "Creature — Ogre", "{2}{R}", { power: "3", toughness: "3" }));
    s = act(s1, { type: "activateMana", player: ap, objectId: t, mana: "B" });
    expect(s.players[ap]!.life).toBe(life);
    expect(s.players[ap]!.manaPool.B).toBe(1);
    // {2}{B}{B}, {T}, Sacrifice all lands you control: every land, this one too.
    const s2 = structuredClone(s0);
    s2.players[ap]!.manaPool = { ...s2.players[ap]!.manaPool, B: 2, C: 2 };
    const landsBefore = s2.battlefield.filter((id) => s2.objects[id]!.controller === ap && objIsType(s2, s2.objects[id]!, "Land"));
    s = settle(run(s2, planActivate(s2, ap, t, 0)));
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap && objIsType(s, s.objects[id]!, "Land"))).toEqual([]);
    for (const l of landsBefore) expect(zone(s, l)).toBe("graveyard");
    const urami = s.battlefield.find((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).name === "Urami")!;
    expect(urami).toBeDefined();
    const ch = characteristics(s, s.objects[urami]!);
    expect(ch.supertypes).toContain("Legendary");
    expect(pt(s, urami)).toBe("5/5");
    expect(objHasKeyword(s, s.objects[urami]!, "Flying")).toBe(true);
  });
});
