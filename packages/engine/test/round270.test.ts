// Round 270, earlier skips from the top of the popularity list: Summoner's Sending ("Put a +1/+1 counter on it if the
// exiled card's mana value is 4 or greater"), Scrap Welder ("Sacrifice an artifact with mana value X: Return target
// artifact card with mana value less than X"), Catastrophe ("Destroy all lands or all creatures. Creatures destroyed this
// way can't be regenerated"), Urborg ("loses first strike or swampwalk", chosen as it resolves), Anchor to Reality ("If it
// has mana value less than the sacrificed permanent's mana value, scry 2"), Ancient Imperiosaur ("two +1/+1 counters on it
// for each creature that convoked it"), Katsumasa, the Animator ("If it's not a Vehicle, it has base power and toughness
// 1/1 until end of turn"), Shilgengar, Sire of Famine ("If you sacrificed an Angel this way, ... equal to its toughness
// instead"; "with a finality counter on it. Those creatures are Vampires"), and with Scrap Welder's target, March of
// Burgeoning Life ("target creature with mana value less than X", the spell's X).

import { describe, expect, it } from "vitest";
import { act, addEffect, bear, card, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { abilityProblem, applyAction, botActions, characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

const C = {
  sending: {"oracleId":"46b01055-4839-4b95-aa53-b954e9669e03","name":"Summoner's Sending","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of your end step, you may exile target creature card from a graveyard. If you do, create a 1/1 white Spirit creature token with flying. Put a +1/+1 counter on it if the exiled card's mana value is 4 or greater.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/1/8150be1a-4bac-4c67-9165-9d6fc04a69cc.jpg?1783906365","artUrl":"https://cards.scryfall.io/art_crop/front/8/1/8150be1a-4bac-4c67-9165-9d6fc04a69cc.jpg?1783906365","commanderLegal":"legal","set":"fic","releasedAt":"2025-06-13","rarity":"rare","layout":"normal","gameChanger":false} as CardDef,
  welder: {"oracleId":"4ebce651-ef95-4a96-b720-a23757d641c8","name":"Scrap Welder","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Goblin Artificer","supertypes":[],"types":["Creature"],"subtypes":["Goblin","Artificer"],"oracleText":"{T}, Sacrifice an artifact with mana value X: Return target artifact card with mana value less than X from your graveyard to the battlefield. It gains haste until end of turn.","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14057067-2325-4229-8580-d9a6397ae343.jpg?1783923860","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14057067-2325-4229-8580-d9a6397ae343.jpg?1783923860","commanderLegal":"legal","set":"neo","releasedAt":"2022-02-18","rarity":"rare","layout":"normal","gameChanger":false} as CardDef,
  catastrophe: {"oracleId":"ed68160e-5e3d-44f2-ac7a-3749fda10119","name":"Catastrophe","manaCost":"{4}{W}{W}","cmc":6,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Destroy all lands or all creatures. Creatures destroyed this way can't be regenerated.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/9/294d21dc-5c76-4449-936f-9b7541d37c86.jpg?1783946377","artUrl":"https://cards.scryfall.io/art_crop/front/2/9/294d21dc-5c76-4449-936f-9b7541d37c86.jpg?1783946377","commanderLegal":"legal","set":"usg","releasedAt":"1998-10-12","rarity":"rare","layout":"normal","gameChanger":false} as CardDef,
  urborg: {"oracleId":"b6114962-035e-4e7f-9009-4739bf83a05a","name":"Urborg","manaCost":"","cmc":0,"typeLine":"Legendary Land","supertypes":["Legendary"],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add {B}.\n{T}: Target creature loses first strike or swampwalk until end of turn.","colors":[],"colorIdentity":["B"],"keywords":[],"producedMana":["B"],"imageUrl":"https://cards.scryfall.io/normal/front/d/0/d0a261d0-7678-46f7-9285-d541486567d8.jpg?1783948022","artUrl":"https://cards.scryfall.io/art_crop/front/d/0/d0a261d0-7678-46f7-9285-d541486567d8.jpg?1783948022","commanderLegal":"legal","set":"leg","releasedAt":"1994-06-01","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef,
  anchor: {"oracleId":"6783f559-33d7-4b13-9a91-02b821e97163","name":"Anchor to Reality","manaCost":"{2}{U}{U}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"As an additional cost to cast this spell, sacrifice an artifact or creature.\nSearch your library for an Equipment or Vehicle card, put that card onto the battlefield, then shuffle. If it has mana value less than the sacrificed permanent's mana value, scry 2.","colors":["U"],"colorIdentity":["U"],"keywords":["Scry"],"imageUrl":"https://cards.scryfall.io/normal/front/5/8/58141ad0-32ea-4e07-a133-ff7812d58c0e.jpg?1783923909","artUrl":"https://cards.scryfall.io/art_crop/front/5/8/58141ad0-32ea-4e07-a133-ff7812d58c0e.jpg?1783923909","commanderLegal":"legal","set":"neo","releasedAt":"2022-02-18","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef,
  imperiosaur: {"oracleId":"3fe95820-cd7f-4f28-82bf-eb4350ea4179","name":"Ancient Imperiosaur","manaCost":"{5}{G}{G}","cmc":7,"typeLine":"Creature — Dinosaur","supertypes":[],"types":["Creature"],"subtypes":["Dinosaur"],"oracleText":"Convoke (Your creatures can help cast this spell. Each creature you tap while casting this spell pays for {1} or one mana of that creature's color.)\nTrample, ward {2}\nThis creature enters with two +1/+1 counters on it for each creature that convoked it.","power":"6","toughness":"6","colors":["G"],"colorIdentity":["G"],"keywords":["Trample","Ward","Convoke"],"imageUrl":"https://cards.scryfall.io/normal/front/6/8/687d3261-dfbf-4c49-986f-20117b7ab5e7.jpg?1783916978","artUrl":"https://cards.scryfall.io/art_crop/front/6/8/687d3261-dfbf-4c49-986f-20117b7ab5e7.jpg?1783916978","commanderLegal":"legal","set":"mom","releasedAt":"2023-04-21","rarity":"rare","layout":"normal","gameChanger":false} as CardDef,
  katsumasa: {"oracleId":"80ba76a6-cc48-4820-bc0b-c9ec18088a3b","name":"Katsumasa, the Animator","manaCost":"{2}{U}{U}","cmc":4,"typeLine":"Legendary Creature — Moonfolk Artificer","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Moonfolk","Artificer"],"oracleText":"Flying\n{2}{U}: Until end of turn, target noncreature artifact you control becomes an artifact creature and gains flying. If it's not a Vehicle, it has base power and toughness 1/1 until end of turn.\nAt the beginning of your upkeep, put a +1/+1 counter on each of up to three target noncreature artifacts.","power":"3","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/a/b/ab4b5ff5-fd6a-4948-9c54-440bf6324bd1.jpg?1783923994","artUrl":"https://cards.scryfall.io/art_crop/front/a/b/ab4b5ff5-fd6a-4948-9c54-440bf6324bd1.jpg?1783923994","commanderLegal":"legal","set":"nec","releasedAt":"2022-02-18","rarity":"rare","layout":"normal","gameChanger":false} as CardDef,
  shilgengar: {"oracleId":"71ac4d8c-5b58-4ea8-996b-f0289717c4bb","name":"Shilgengar, Sire of Famine","manaCost":"{3}{B}{B}","cmc":5,"typeLine":"Legendary Creature — Elder Demon","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Elder","Demon"],"oracleText":"Flying\nSacrifice another creature: Create a Blood token. If you sacrificed an Angel this way, create a number of Blood tokens equal to its toughness instead.\n{W/B}{W/B}{W/B}, Sacrifice six Blood tokens: Return each creature card from your graveyard to the battlefield with a finality counter on it. Those creatures are Vampires in addition to their other types.","power":"6","toughness":"6","colors":["B"],"colorIdentity":["B","W"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/3/f/3f0c7ff3-e483-41f3-b49f-7cdc261527c0.jpg?1783911147","artUrl":"https://cards.scryfall.io/art_crop/front/3/f/3f0c7ff3-e483-41f3-b49f-7cdc261527c0.jpg?1783911147","commanderLegal":"legal","set":"mh3","releasedAt":"2024-06-14","rarity":"rare","layout":"normal","gameChanger":false} as CardDef,
  march: {"oracleId":"a81fd70c-c2bc-4863-97a0-facde86f024c","name":"March of Burgeoning Life","manaCost":"{X}{G}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"As an additional cost to cast this spell, you may exile any number of green cards from your hand. This spell costs {2} less to cast for each card exiled this way.\nChoose target creature with mana value less than X. Search your library for a creature card with the same name as that creature, put it onto the battlefield tapped, then shuffle.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/e/0e223d99-408a-413d-abb1-cb2f11ae521d.jpg?1783923843","artUrl":"https://cards.scryfall.io/art_crop/front/0/e/0e223d99-408a-413d-abb1-cb2f11ae521d.jpg?1783923843","commanderLegal":"legal","set":"neo","releasedAt":"2022-02-18","rarity":"rare","layout":"normal","gameChanger":false} as CardDef,
};

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
const opp = (s: GameState, ap: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % s.turnOrder.length]!;
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
const nameOf = (s: GameState, id: ObjectId) => s.cards[s.objects[id]!.cardId]!.name;
const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && nameOf(s, id) === name);
const trinket = (name: string, cost: string) => card(name, "Artifact", cost);

describe("round 270 cards", () => {
  it("all compile fully", () => {
    for (const def of Object.values(C)) expect(isFullySupported(def), def.name).toBe(true);
  });
});

describe("Summoner's Sending: a counter on the Spirit if the exiled card's mana value is 4 or greater", () => {
  const atEnd = (cost: string, yes: boolean) => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    putOnBattlefield(s, ap, C.sending);
    const dead = into(s, opp(s, ap), card("Test Dead", "Creature — Beast", cost, { power: "3", toughness: "3" }), "graveyard");
    s.players[ap]!.hand = [];
    s = passUntil(s, "end", ap);
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseMay"; i++) {
      if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: dead }] });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.pending?.kind).toBe("chooseMay");
    s = settle(act(s, { type: "chooseMay", player: ap, yes }));
    return { s, ap, dead };
  };

  it("exiles a creature card with mana value 4 or greater for a 2/2 flying Spirit", () => {
    const { s, ap, dead } = atEnd("{3}{G}", true);
    expect(s.objects[dead]!.zone).toBe("exile");
    const [spirit] = named(s, ap, "Spirit Token");
    expect(spirit).toBeDefined();
    expect(pt(s, spirit!)).toBe("2/2");
    expect(objHasKeyword(s, s.objects[spirit!]!, "Flying")).toBe(true);
  });

  it("gives no counter for a smaller card, X counted as 0 (rulings)", () => {
    const { s, ap } = atEnd("{X}{G}{G}", true);
    const [spirit] = named(s, ap, "Spirit Token");
    expect(pt(s, spirit!)).toBe("1/1");
  });

  it("makes nothing if you don't exile", () => {
    const { s, ap, dead } = atEnd("{3}{G}", false);
    expect(s.objects[dead]!.zone).toBe("graveyard");
    expect(named(s, ap, "Spirit Token")).toHaveLength(0);
  });
});

describe("Scrap Welder: sacrifice an artifact with mana value X, return one with mana value less than X", () => {
  it("returns a lesser artifact card with haste, not one with the same mana value (rulings)", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const welder = putOnBattlefield(s, ap, C.welder);
    const three = putOnBattlefield(s, ap, trinket("Test Three", "{3}"));
    const same = into(s, ap, trinket("Test Same", "{3}"), "graveyard");
    const back = into(s, ap, card("Test Golem", "Artifact Creature — Golem", "{2}", { power: "2", toughness: "2" }), "graveyard");
    expect(abilityProblem(s, ap, welder, 0)).toBeNull();
    expect(abilityProblem(s, ap, welder, 0, [{ kind: "object", id: same }], undefined, undefined, 3, { sacrifice: [three] })).not.toBeNull();
    expect(abilityProblem(s, ap, welder, 0, [{ kind: "object", id: back }], undefined, undefined, 2, { sacrifice: [three] })).not.toBeNull();
    s = settle(run(s, planActivate(s, ap, welder, 0, [{ kind: "object", id: back }], undefined, undefined, 3, { sacrifice: [three] })));
    expect(s.objects[three]!.zone).toBe("graveyard");
    const [golem] = named(s, ap, "Test Golem");
    expect(golem).toBeDefined();
    expect(objHasKeyword(s, s.objects[golem!]!, "Haste")).toBe(true);
    expect(s.objects[same]!.zone).toBe("graveyard");
  });

  it("can't be activated with no lesser artifact card to return", () => {
    const { s, ap } = setup([]);
    const welder = putOnBattlefield(s, ap, C.welder);
    putOnBattlefield(s, ap, trinket("Test Two", "{2}"));
    into(s, ap, trinket("Test Same", "{2}"), "graveyard");
    expect(abilityProblem(s, ap, welder, 0)).not.toBeNull();
  });
});

describe("Catastrophe: destroy all lands or all creatures, chosen as it resolves", () => {
  const castIt = (choice: string) => {
    const { s: s0, ap, ids } = setup([C.catastrophe]);
    let s = s0;
    const b = opp(s, ap);
    const troll = putOnBattlefield(s, b, bear({ name: "Test Troll" }));
    s.objects[troll]!.regenShields = 1;
    const land = putOnBattlefield(s, b, card("Test Wastes", "Land"));
    s.objects[land]!.regenShields = 1;
    const manland = putOnBattlefield(s, b, card("Test Manland", "Land"));
    addEffect(s, b, [manland], [{ kind: "addTypes", types: ["Creature"], subtypes: [] }, { kind: "setPT", power: 3, toughness: 3 }], "game");
    s.objects[manland]!.regenShields = 1;
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(s.pending?.kind).toBe("chooseOption");
    if (s.pending?.kind !== "chooseOption") throw new Error();
    expect(s.pending.labels).toEqual(["Destroy all lands", "Destroy all creatures"]);
    s = settle(act(s, { type: "chooseOption", player: ap, choice }));
    return { s, troll, land, manland };
  };

  it("destroys all creatures, which can't be regenerated", () => {
    const { s, troll, land, manland } = castIt("1");
    expect(s.objects[troll]!.zone).toBe("graveyard");
    expect(s.objects[manland]!.zone).toBe("graveyard");
    expect(s.objects[land]!.zone).toBe("battlefield");
  });

  it("destroys all lands: a land that's a creature can't be regenerated, another land can", () => {
    const { s, troll, land, manland } = castIt("0");
    expect(s.objects[troll]!.zone).toBe("battlefield");
    expect(s.objects[manland]!.zone).toBe("graveyard");
    expect(s.objects[land]!.zone).toBe("battlefield");
    expect(s.objects[land]!.tapped).toBe(true);
  });
});

describe("Urborg: target creature loses first strike or swampwalk, chosen as it resolves", () => {
  const go = (keywords: string[], choice: string) => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const urborg = putOnBattlefield(s, ap, C.urborg);
    const b = opp(s, ap);
    const knight = putOnBattlefield(s, b, bear({ name: "Test Knight", keywords }));
    expect(abilityProblem(s, ap, urborg, 0, [{ kind: "object", id: knight }])).toBeNull();
    s = settle(run(s, planActivate(s, ap, urborg, 0, [{ kind: "object", id: knight }])));
    expect(s.pending?.kind).toBe("chooseOption");
    if (s.pending?.kind !== "chooseOption") throw new Error();
    expect(s.pending.labels).toEqual(["It loses first strike until end of turn", "It loses swampwalk until end of turn"]);
    s = settle(act(s, { type: "chooseOption", player: ap, choice }));
    return { s, knight: s.objects[knight]! };
  };

  it("with both, it loses only the one chosen (rulings)", () => {
    const { s, knight } = go(["First strike", "Swampwalk"], "1");
    expect(objHasKeyword(s, knight, "First strike")).toBe(true);
    expect(objHasKeyword(s, knight, "Swampwalk")).toBe(false);
    const r = go(["First strike", "Swampwalk"], "0");
    expect(objHasKeyword(r.s, r.knight, "First strike")).toBe(false);
    expect(objHasKeyword(r.s, r.knight, "Swampwalk")).toBe(true);
  });

  it("doesn't take away double strike (rulings)", () => {
    const { s, knight } = go(["Double strike"], "0");
    expect(objHasKeyword(s, knight, "Double strike")).toBe(true);
  });
});

describe("Anchor to Reality: scry 2 if the card put onto the battlefield has lesser mana value than the sacrificed permanent", () => {
  const castIt = (sacCost: string, foundCost: string) => {
    const { s: s0, ap, ids } = setup([C.anchor]);
    let s = s0;
    const sac = putOnBattlefield(s, ap, trinket("Test Relic", sacCost));
    const gear = into(s, ap, card("Test Gear", "Artifact — Equipment", foundCost), "library");
    s = settle(run(s, planCast(s, ap, ids[0]!, undefined, undefined, undefined, undefined, { sacrifice: [sac] })));
    if (s.pending?.kind === "searchLibrary") s = settle(act(s, { type: "searchLibrary", player: ap, found: [gear] } as Action));
    return { s, ap, sac, gear };
  };

  it("scries 2 when it's less", () => {
    const { s, sac, gear } = castIt("{4}", "{1}");
    expect(s.objects[sac]!.zone).toBe("graveyard");
    expect(s.objects[gear]!.zone).toBe("battlefield");
    expect(s.pending?.kind).toBe("arrangeTop");
  });

  it("doesn't scry when it's the same or more", () => {
    const { s, gear } = castIt("{2}", "{2}");
    expect(s.objects[gear]!.zone).toBe("battlefield");
    expect(s.pending).toBeFalsy();
  });
});

describe("Ancient Imperiosaur: two +1/+1 counters for each creature that convoked it", () => {
  it("counts the creatures tapped to convoke it", () => {
    const { s: s0, ap, ids } = setup([C.imperiosaur]);
    let s = s0;
    const crew = [1, 2, 3].map((n) => putOnBattlefield(s, ap, bear({ name: `Test Bear ${n}` })));
    s = settle(run(s, planCast(s, ap, ids[0]!, undefined, undefined, crew)));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(6);
    expect(crew.every((id) => s.objects[id]!.tapped)).toBe(true);
  });

  it("gets none without convoke", () => {
    const { s: s0, ap, ids } = setup([C.imperiosaur]);
    let s = s0;
    s = settle(run(s, planCast(s, ap, ids[0]!, undefined, undefined, [])));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.objects[ids[0]!]!.counters["+1/+1"] ?? 0).toBe(0);
  });
});

describe("Katsumasa, the Animator: a 1/1 flier unless it's a Vehicle", () => {
  it("makes a noncreature artifact a 1/1 flying artifact creature until end of turn", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const k = putOnBattlefield(s, ap, C.katsumasa);
    const rock = putOnBattlefield(s, ap, trinket("Test Rock", "{2}"));
    s = settle(run(s, planActivate(s, ap, k, 0, [{ kind: "object", id: rock }])));
    const o = s.objects[rock]!;
    expect(characteristics(s, o).types).toContain("Creature");
    expect(pt(s, rock)).toBe("1/1");
    expect(objHasKeyword(s, o, "Flying")).toBe(true);
    s = passUntil(s, "upkeep", opp(s, ap));
    expect(characteristics(s, s.objects[rock]!).types).not.toContain("Creature");
  });

  it("leaves a Vehicle its printed power and toughness", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const k = putOnBattlefield(s, ap, C.katsumasa);
    const cart = putOnBattlefield(s, ap, card("Test Cart", "Artifact — Vehicle", "{2}", { power: "4", toughness: "3" }));
    s = settle(run(s, planActivate(s, ap, k, 0, [{ kind: "object", id: cart }])));
    expect(characteristics(s, s.objects[cart]!).types).toContain("Creature");
    expect(pt(s, cart)).toBe("4/3");
    expect(objHasKeyword(s, s.objects[cart]!, "Flying")).toBe(true);
  });
});

describe("Shilgengar, Sire of Famine", () => {
  it("makes Blood tokens equal to a sacrificed Angel's toughness, one for anything else", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const sh = putOnBattlefield(s, ap, C.shilgengar);
    const angel = putOnBattlefield(s, ap, card("Test Angel", "Creature — Angel", "{3}{W}", { power: "3", toughness: "4" }));
    const grunt = putOnBattlefield(s, ap, bear());
    s = settle(run(s, planActivate(s, ap, sh, 0, undefined, undefined, undefined, undefined, { sacrifice: [angel] })));
    expect(named(s, ap, "Blood Token")).toHaveLength(4);
    s = settle(run(s, planActivate(s, ap, sh, 0, undefined, undefined, undefined, undefined, { sacrifice: [grunt] })));
    expect(named(s, ap, "Blood Token")).toHaveLength(5);
  });

  it("returns each creature card from your graveyard with a finality counter, as Vampires", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const sh = putOnBattlefield(s, ap, C.shilgengar);
    const angel = putOnBattlefield(s, ap, card("Test Angel", "Creature — Angel", "{5}{W}", { power: "6", toughness: "6" }));
    s = settle(run(s, planActivate(s, ap, sh, 0, undefined, undefined, undefined, undefined, { sacrifice: [angel] })));
    const blood = named(s, ap, "Blood Token");
    expect(blood).toHaveLength(6);
    const dead = into(s, ap, bear({ name: "Test Dead" }), "graveyard");
    const rock = into(s, ap, trinket("Test Rock", "{2}"), "graveyard");
    s.players[ap]!.manaPool.W = 3;
    expect(abilityProblem(s, ap, sh, 1, undefined, undefined, undefined, undefined, { sacrifice: blood })).toBeNull();
    s = settle(run(s, planActivate(s, ap, sh, 1, undefined, undefined, undefined, undefined, { sacrifice: blood })));
    const back = s.objects[dead]!;
    expect(back.zone).toBe("battlefield");
    expect(back.counters.finality).toBe(1);
    expect(characteristics(s, back).subtypes).toEqual(expect.arrayContaining(["Bear", "Vampire"]));
    expect(s.objects[rock]!.zone).toBe("graveyard");
    // The Angel sacrificed for the Blood comes back too.
    expect(characteristics(s, s.objects[angel]!).subtypes).toEqual(expect.arrayContaining(["Angel", "Vampire"]));
  });
});

describe("round 270 bots", () => {
  it("Urborg: a bot takes away the keyword the opponent's creature has", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const urborg = putOnBattlefield(s, ap, C.urborg);
    const b = opp(s, ap);
    const walker = putOnBattlefield(s, b, bear({ name: "Test Walker", keywords: ["Swampwalk"] }));
    s = settle(run(s, planActivate(s, ap, urborg, 0, [{ kind: "object", id: walker }])));
    expect(s.pending?.kind).toBe("chooseOption");
    s = run(s, botActions(s, ap));
    s = settle(s);
    expect(objHasKeyword(s, s.objects[walker]!, "Swampwalk")).toBe(false);
  });

  it("Catastrophe: a bot picks one of the two", () => {
    const { s: s0, ap, ids } = setup([C.catastrophe]);
    let s = s0;
    const b = opp(s, ap);
    for (let i = 0; i < 4; i++) putOnBattlefield(s, b, bear({ name: `Test Bear ${i}` }));
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(s.pending?.kind).toBe("chooseOption");
    s = settle(run(s, botActions(s, ap)));
    // Their four creatures go; our fourteen lands are worth more to us than to them.
    expect(named(s, b, "Test Bear 0")).toHaveLength(0);
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap).length).toBeGreaterThan(10);
  });
});

describe("March of Burgeoning Life: target creature with mana value less than X", () => {
  it("targets only a creature with mana value less than X (rulings), and finds one with its name", () => {
    const { s: s0, ap, ids } = setup([C.march]);
    let s = s0;
    const b = opp(s, ap);
    const bears = putOnBattlefield(s, b, bear());
    const giant = putOnBattlefield(s, b, card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" }));
    const mine = into(s, ap, bear(), "library");
    // X 2: Grizzly Bears' mana value 2 isn't less than X.
    expect(planCast(s, ap, ids[0]!, [{ kind: "object", id: bears }], undefined, undefined, 2)).toBeNull();
    expect(planCast(s, ap, ids[0]!, [{ kind: "object", id: giant }], undefined, undefined, 4)).toBeNull();
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "object", id: bears }], undefined, undefined, 3)));
    if (s.pending?.kind === "searchLibrary") s = settle(act(s, { type: "searchLibrary", player: ap, found: [mine] } as Action));
    expect(s.objects[mine]!.zone).toBe("battlefield");
    expect(s.objects[mine]!.tapped).toBe(true);
  });
});
