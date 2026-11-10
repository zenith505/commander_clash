// Round 337 (Lane A): Azor's Gateway (a card exiled from the hand linked to it, and "cards with five or more different
// mana values are exiled with ~"), Mishra, Eminent One (a token copy of an artifact "except its name is Mishra's Warform
// and it's a 4/4 Construct artifact creature in addition to its other types"), Hunted by The Family (a villainous choice
// for each target creature, about it), Frontline Heroism (a copy of the spell aimed at the token just created, one of
// them if a doubler made two, CR 707.10e) and Donal, Herald of Wings (a copy of a creature spell "except the copy is a
// 1/1 Spirit in addition to its other types", once each turn); Imodane, the Pyrohammer (an instant or sorcery spell you
// control that targets only a single creature dealing damage to that creature).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, plainsCard, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PendingDecision, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; other players' questions as the bots would. Stops at any question of `me`'s. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const pend = <K extends PendingDecision["kind"]>(s: GameState, kind: K) => {
  expect(s.pending?.kind).toBe(kind);
  return s.pending as Extract<PendingDecision, { kind: K }>;
};
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const ch = (s: GameState, id: string) => characteristics(s, s.objects[id]!);
const inHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
const tokensNamed = (s: GameState, name: string) => s.battlefield.filter((id) => s.objects[id]!.isToken && ch(s, id).name === name);

// Real oracle text (Scryfall).
const azor = (): CardDef => ({"oracleId":"c0cbb347-b060-43ce-a9c5-8c835be3cf1b","name":"Azor's Gateway // Sanctum of the Sun","manaCost":"{2}","cmc":2,"typeLine":"Legendary Artifact // Legendary Land","supertypes":["Legendary"],"types":["Artifact"],"subtypes":[],"oracleText":"{1}, {T}: Draw a card, then exile a card from your hand. If cards with five or more different mana values are exiled with Azor's Gateway, you gain 5 life, untap Azor's Gateway, and transform it.","colors":[],"colorIdentity":[],"keywords":["Transform"],"producedMana":["B","G","R","U","W"],"commanderLegal":"legal","set":"rix","releasedAt":"2018-01-19","rarity":"mythic","layout":"transform","gameChanger":false,"faces":[{"name":"Azor's Gateway","manaCost":"{2}","typeLine":"Legendary Artifact","supertypes":["Legendary"],"types":["Artifact"],"subtypes":[],"oracleText":"{1}, {T}: Draw a card, then exile a card from your hand. If cards with five or more different mana values are exiled with Azor's Gateway, you gain 5 life, untap Azor's Gateway, and transform it.","colors":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/0/303d51ab-b9c4-4647-950f-291daabe7b81.jpg?1783935273","artUrl":"https://cards.scryfall.io/art_crop/front/3/0/303d51ab-b9c4-4647-950f-291daabe7b81.jpg?1783935273"},{"name":"Sanctum of the Sun","manaCost":"","typeLine":"Legendary Land","supertypes":["Legendary"],"types":["Land"],"subtypes":[],"oracleText":"(Transforms from Azor's Gateway.)\n{T}: Add X mana of any one color, where X is your life total.","colors":[],"imageUrl":"https://cards.scryfall.io/normal/back/3/0/303d51ab-b9c4-4647-950f-291daabe7b81.jpg?1783935273","artUrl":"https://cards.scryfall.io/art_crop/back/3/0/303d51ab-b9c4-4647-950f-291daabe7b81.jpg?1783935273"}]}) as CardDef;
const mishra = (): CardDef => ({"oracleId":"d3438037-3efd-4ce0-88ec-6d48ab521992","name":"Mishra, Eminent One","manaCost":"{2}{U}{B}{R}","cmc":5,"typeLine":"Legendary Creature — Human Artificer","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Artificer"],"oracleText":"At the beginning of combat on your turn, create a token that's a copy of target noncreature artifact you control, except its name is Mishra's Warform and it's a 4/4 Construct artifact creature in addition to its other types. It gains haste until end of turn. Sacrifice it at the beginning of the next end step.","power":"5","toughness":"4","colors":["B","R","U"],"colorIdentity":["B","R","U"],"keywords":[],"commanderLegal":"legal","set":"brc","releasedAt":"2022-11-18","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const hunted = (): CardDef => ({"oracleId":"7d178f1c-faf7-4efd-87a6-201a40c55ec8","name":"Hunted by The Family","manaCost":"{5}{U}{U}","cmc":7,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Choose up to four target creatures you don't control. For each of them, that creature's controller faces a villainous choice — That creature becomes a 1/1 white Human creature and loses all abilities, or you create a token that's a copy of it.","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const frontline = (): CardDef => ({"oracleId":"4c340b82-22e1-445a-b236-82471b442031","name":"Frontline Heroism","manaCost":"{2}{R}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, create a 1/1 red Soldier creature token with haste.\nWhenever you cast a spell that targets only a single creature you control, create a 1/1 red Soldier creature token with haste, then copy that spell. The copy targets that token.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"j25","releasedAt":"2024-11-15","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const donal = (): CardDef => ({"oracleId":"1c9f2b6e-a0eb-493e-8c43-3a14f6d95a53","name":"Donal, Herald of Wings","manaCost":"{2}{U}{U}","cmc":4,"typeLine":"Legendary Creature — Human Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"Whenever you cast a nonlegendary creature spell with flying, you may copy it, except the copy is a 1/1 Spirit in addition to its other types. Do this only once each turn. (The copy becomes a token.)","power":"3","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","set":"voc","releasedAt":"2021-11-19","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const procession = (): CardDef => ({"oracleId":"7246d45b-2185-4cdd-981b-5419b7d52bce","name":"Anointed Procession","manaCost":"{3}{W}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.","colors":["W"],"colorIdentity":["W"],"keywords":[],"commanderLegal":"legal","set":"akh","releasedAt":"2017-04-28","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bonesplitter = (): CardDef => ({"oracleId":"452e3f5f-ce17-4682-966b-5cc100210aee","name":"Bonesplitter","manaCost":"{1}","cmc":1,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +2/+0.\nEquip {1}","colors":[],"colorIdentity":[],"keywords":["Equip"],"commanderLegal":"legal","set":"pal03","releasedAt":"2003-01-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const triumph = (): CardDef => ({"oracleId":"57579799-2582-417f-9864-4560cac39ac3","name":"Moment of Triumph","manaCost":"{W}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target creature gets +2/+2 until end of turn. You gain 2 life.","colors":["W"],"colorIdentity":["W"],"keywords":[],"commanderLegal":"legal","set":"rix","releasedAt":"2018-01-19","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const giantGrowth = (): CardDef => ({"oracleId":"5748ebf1-24e3-499d-ab7c-c2cebd462a24","name":"Giant Growth","manaCost":"{G}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target creature gets +3/+3 until end of turn.","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const serra = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"commanderLegal":"legal","set":"sld","releasedAt":"2023-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const elves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const fireIce = (): CardDef => ({"oracleId":"ae92942b-919c-4ea9-b693-85fcef765d5a","name":"Fire // Ice","manaCost":"{1}{R} // {1}{U}","cmc":4,"typeLine":"Instant // Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Fire deals 2 damage divided as you choose among one or two targets.","colors":["R","U"],"colorIdentity":["R","U"],"keywords":[],"commanderLegal":"legal","set":"ddj","releasedAt":"2012-09-07","rarity":"uncommon","layout":"split","gameChanger":false,"faces":[{"name":"Fire","manaCost":"{1}{R}","typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Fire deals 2 damage divided as you choose among one or two targets.","colors":["R"]},{"name":"Ice","manaCost":"{1}{U}","typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Tap target permanent.\nDraw a card.","colors":["U"]}]}) as CardDef;
const cantor = (): CardDef => ({"oracleId":"24472823-d33c-4d96-add1-233116f6f4f7","name":"Wild Cantor","manaCost":"{R/G}","cmc":1,"typeLine":"Creature — Human Druid","supertypes":[],"types":["Creature"],"subtypes":["Human","Druid"],"oracleText":"({R/G} can be paid with either {R} or {G}.)\nSacrifice this creature: Add one mana of any color.","power":"1","toughness":"1","colors":["G","R"],"colorIdentity":["G","R"],"keywords":[],"producedMana":["B","G","R","U","W"],"commanderLegal":"legal","set":"rvr","releasedAt":"2024-01-12","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const mindStone = (): CardDef => ({"oracleId":"c97361b5-af16-4a7b-af85-a429dbaf4ad2","name":"Mind Stone","manaCost":"{2}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"commanderLegal":"legal","set":"fic","releasedAt":"2025-06-13","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const imodane = (): CardDef => ({"oracleId":"d70d4686-2c35-4149-aed1-7e3b9e022702","name":"Imodane, the Pyrohammer","manaCost":"{2}{R}{R}","cmc":4,"typeLine":"Legendary Creature — Human Knight","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Knight"],"oracleText":"Whenever an instant or sorcery spell you control that targets only a single creature deals damage to that creature, Imodane deals that much damage to each opponent.","power":"4","toughness":"4","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"woe","releasedAt":"2023-09-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const forked = (): CardDef => ({"oracleId":"e0548f0d-4aec-4c39-8c34-52bfa2bf7c60","name":"Forked Bolt","manaCost":"{R}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Forked Bolt deals 2 damage divided as you choose among one or two targets.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"roe","releasedAt":"2010-04-23","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
/** A test card with this mana cost (its own oracleId). */
const mvCard = (name: string, manaCost: string, cmc: number) => card(name, "Sorcery", manaCost, { oracleId: `test-${name}`, cmc, oracleText: "Draw a card." });

describe("round 337: compiles", () => {
  it("every card of the round", () => supported(azor(), mishra(), hunted(), frontline(), donal(), imodane()));
});

describe("round 337: Azor's Gateway", () => {
  /** Activates the Gateway (untapping it first) and exiles `id` from the hand. */
  const use = (s0: GameState, ap: PlayerId, gw: string, id: string) => {
    let s = s0;
    s.objects[gw]!.tapped = false;
    s = settle(run(s, planActivate(s, ap, gw, 0)), ap);
    const p = pend(s, "discard");
    expect(p.exile).toBe(true);
    return settle(act(s, { type: "discard", player: ap, objectIds: [id] }), ap);
  };

  it("transforms once cards with five different mana values are exiled with it, gaining 5 life and untapping", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const gw = putOnBattlefield(s, ap, azor());
    // Fire // Ice counts as mana value 4 (rulings: a split card's halves together).
    const cards = [mvCard("Zero", "", 0), mvCard("One", "{1}", 1), mvCard("Two", "{2}", 2), mvCard("Three", "{3}", 3), fireIce()].map((d) => inHand(s, ap, d));
    const life = s.players[ap]!.life;
    for (const id of cards.slice(0, 4)) s = use(s, ap, gw, id);
    expect(cards.slice(0, 4).every((id) => s.objects[id]!.zone === "exile")).toBe(true);
    expect(ch(s, gw).name).toBe("Azor's Gateway");
    expect(s.players[ap]!.life).toBe(life);
    expect(s.objects[gw]!.tapped).toBe(true);
    s = use(s, ap, gw, cards[4]!);
    expect(ch(s, gw).name).toBe("Sanctum of the Sun");
    expect(s.players[ap]!.life).toBe(life + 5);
    expect(s.objects[gw]!.tapped).toBe(false);
  });

  it("a mana value counts once, and cards it didn't exile don't count", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const gw = putOnBattlefield(s, ap, azor());
    const cards = [mvCard("One", "{1}", 1), mvCard("One Again", "{U}", 1), mvCard("Two", "{2}", 2), mvCard("Three", "{3}", 3), mvCard("Four", "{4}", 4)].map((d) => inHand(s, ap, d));
    // A mana value 0 card in exile that the Gateway didn't exile.
    const other = inHand(s, ap, mvCard("Zero", "", 0));
    s.players[ap]!.hand.splice(s.players[ap]!.hand.indexOf(other), 1);
    s.objects[other]!.zone = "exile";
    s.players[ap]!.exile.push(other);
    for (const id of cards) s = use(s, ap, gw, id);
    expect(ch(s, gw).name).toBe("Azor's Gateway");
    expect(s.objects[gw]!.tapped).toBe(true);
  });
});

describe("round 337: Mishra, Eminent One", () => {
  it("at the beginning of combat, a hasty 4/4 Construct copy of the artifact named Mishra's Warform, sacrificed at the end step", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    putOnBattlefield(s, ap, mishra());
    const stone = putOnBattlefield(s, ap, mindStone());
    s = passUntil(s, "beginCombat", ap);
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: stone }] });
    s = settle(s, ap);
    const [w] = tokensNamed(s, "Mishra's Warform");
    expect(w).toBeDefined();
    const c = ch(s, w!);
    expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(c.subtypes).toContain("Construct");
    expect(c.keywords).toContain("Haste");
    expect(pt(s, w!)).toBe("4/4");
    // It has Mind Stone's abilities (a copy, CR 707.2) and isn't Mind Stone.
    expect(s.cards[s.objects[w!]!.cardId]!.oracleText).toContain("Add {C}");
    expect(ch(s, stone).types).toEqual(["Artifact"]);
    s = passUntil(s, "cleanup", ap);
    expect(s.objects[w!]?.zone === "battlefield").toBe(false);
  });

  it("only a noncreature artifact can be the target", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    putOnBattlefield(s, ap, mishra());
    putOnBattlefield(s, ap, { ...ornithopterLike() });
    s = settle(passUntil(s, "beginCombat", ap), ap);
    expect(tokensNamed(s, "Mishra's Warform")).toHaveLength(0);
  });
});

const ornithopterLike = (): CardDef => card("Test Thopter", "Artifact Creature — Thopter", "{0}", { oracleId: "test-thopter", cmc: 0, power: "0", toughness: "2", oracleText: "Flying", keywords: ["Flying"] });

describe("round 337: Hunted by The Family", () => {
  it("each target's controller faces a villainous choice about it, in turn order; a 1/1 white Human with no abilities, or a copy for you", () => {
    const { s: s0, ap, ids } = setup([hunted()]);
    let s = s0;
    const order = s.turnOrder;
    const opp1 = order[(order.indexOf(ap) + 1) % 4]!;
    const opp2 = order[(order.indexOf(ap) + 2) % 4]!;
    const angel = putOnBattlefield(s, opp2, serra());
    const elf = putOnBattlefield(s, opp1, elves());
    const mine = putOnBattlefield(s, ap, serra());
    // Your own creature can't be a target.
    expect(planCast(s, ap, ids[0]!, [{ kind: "object", id: mine }, { kind: "none" }, { kind: "none" }, { kind: "none" }])).toBeNull();
    s = run(s, planCast(s, ap, ids[0]!, [{ kind: "object", id: angel }, { kind: "object", id: elf }, { kind: "none" }, { kind: "none" }]));
    for (let i = 0; i < 50 && !s.pending && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    // The first player in turn order after you faces it first (CR 701.55d).
    let p = pend(s, "chooseOption");
    expect(p.what).toBe("villainous");
    expect(p.player).toBe(opp1);
    expect(p.about).toBe(elf);
    s = act(s, { type: "chooseOption", player: opp1, choice: "1" });
    p = pend(s, "chooseOption");
    expect(p.player).toBe(opp2);
    expect(p.about).toBe(angel);
    s = settle(act(s, { type: "chooseOption", player: opp2, choice: "0" }));
    // The Angel: a 1/1 white Human creature with no abilities, still opp2's.
    expect(pt(s, angel)).toBe("1/1");
    expect(ch(s, angel).colors).toEqual(["W"]);
    expect(ch(s, angel).subtypes).toEqual(["Human"]);
    expect(ch(s, angel).keywords).toEqual([]);
    expect(ch(s, angel).controller).toBe(opp2);
    // The Elves: unchanged, and you have a token copy of them.
    expect(pt(s, elf)).toBe("1/1");
    expect(ch(s, elf).subtypes).toEqual(["Elf", "Druid"]);
    const copy = s.battlefield.find((id) => s.objects[id]!.isToken && ch(s, id).name === "Llanowar Elves");
    expect(copy && ch(s, copy).controller).toBe(ap);
  });

  it("bots make their own creature the 1/1 rather than hand over a copy", () => {
    const { s: s0, ap, ids } = setup([hunted()]);
    let s = s0;
    const opp1 = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    const angel = putOnBattlefield(s, opp1, serra());
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "object", id: angel }, { kind: "none" }, { kind: "none" }, { kind: "none" }])), ap);
    expect(pt(s, angel)).toBe("1/1");
    expect(s.battlefield.some((id) => s.objects[id]!.isToken && ch(s, id).name === "Serra Angel")).toBe(false);
  });
});


describe("round 337: Frontline Heroism", () => {
  it("a spell that targets only a creature you control: a hasty Soldier, and a copy of the spell targeting it", () => {
    const { s: s0, ap, ids } = setup([giantGrowth()]);
    let s = s0;
    putOnBattlefield(s, ap, frontline());
    const bear = putOnBattlefield(s, ap, card("Test Bear", "Creature — Bear", "{1}{G}", { oracleId: "test-bear", cmc: 2, power: "2", toughness: "2", oracleText: "" }));
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "object", id: bear }])), ap);
    expect(pt(s, bear)).toBe("5/5");
    const [soldier] = tokensNamed(s, "Soldier Token");
    expect(soldier).toBeDefined();
    expect(pt(s, soldier!)).toBe("4/4");
    expect(ch(s, soldier!).keywords).toContain("Haste");
  });

  it("not for a spell targeting an opponent's creature", () => {
    const { s: s0, ap, ids, opp } = setup([giantGrowth()]);
    let s = s0;
    putOnBattlefield(s, ap, frontline());
    const theirs = putOnBattlefield(s, opp, card("Test Bear", "Creature — Bear", "{1}{G}", { oracleId: "test-bear", cmc: 2, power: "2", toughness: "2", oracleText: "" }));
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "object", id: theirs }])), ap);
    expect(tokensNamed(s, "Soldier Token")).toHaveLength(0);
    expect(pt(s, theirs)).toBe("5/5");
  });

  it("with a token doubler, the copy targets one of the two tokens, its controller's choice (CR 707.10e)", () => {
    const { s: s0, ap, ids } = setup([giantGrowth()]);
    let s = s0;
    putOnBattlefield(s, ap, frontline());
    putOnBattlefield(s, ap, procession());
    const bear = putOnBattlefield(s, ap, card("Test Bear", "Creature — Bear", "{1}{G}", { oracleId: "test-bear", cmc: 2, power: "2", toughness: "2", oracleText: "" }));
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "object", id: bear }])), ap);
    const p = pend(s, "chooseOption");
    expect(p.what).toBe("copyOrder");
    expect(p.options).toHaveLength(2);
    const pick = p.options[1]!;
    s = settle(act(s, { type: "chooseOption", player: ap, choice: pick }), ap);
    const soldiers = tokensNamed(s, "Soldier Token");
    expect(soldiers).toHaveLength(2);
    expect(pt(s, pick)).toBe("4/4");
    expect(pt(s, soldiers.find((id) => id !== pick)!)).toBe("1/1");
    expect(pt(s, bear)).toBe("5/5");
  });
});

describe("round 337: Donal, Herald of Wings", () => {
  it("may copy a nonlegendary creature spell with flying as a 1/1 Spirit, once each turn", () => {
    const { s: s0, ap, ids } = setup([serra(), serra()]);
    let s = s0;
    putOnBattlefield(s, ap, donal());
    for (let i = 0; i < 3; i++) putOnBattlefield(s, ap, plainsCard);
    s = settle(run(s, planCast(s, ap, ids[0]!)), ap);
    pend(s, "chooseMay");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    const angels = s.battlefield.filter((id) => ch(s, id).name === "Serra Angel");
    expect(angels).toHaveLength(2);
    const token = angels.find((id) => s.objects[id]!.isToken)!;
    expect(pt(s, token)).toBe("1/1");
    expect(ch(s, token).subtypes).toEqual(expect.arrayContaining(["Angel", "Spirit"]));
    expect(ch(s, token).keywords).toEqual(expect.arrayContaining(["Flying", "Vigilance"]));
    // The second one this turn: no copy.
    s = settle(run(s, planCast(s, ap, ids[1]!)), ap);
    expect(s.pending).toBeFalsy();
    expect(s.battlefield.filter((id) => ch(s, id).name === "Serra Angel")).toHaveLength(3);
  });

  it("not a creature spell without flying", () => {
    const { s: s0, ap, ids } = setup([elves()]);
    let s = s0;
    putOnBattlefield(s, ap, donal());
    s = settle(run(s, planCast(s, ap, ids[0]!)), ap);
    expect(s.pending).toBeFalsy();
    expect(s.battlefield.filter((id) => ch(s, id).name === "Llanowar Elves")).toHaveLength(1);
  });
});

describe("round 337: Imodane, the Pyrohammer", () => {
  const giant = () => card("Test Giant", "Creature — Giant", "{3}{R}", { oracleId: "test-giant", cmc: 4, power: "3", toughness: "5", oracleText: "" });
  it("a spell of yours targeting only a creature deals damage to it: that much to each opponent", () => {
    const { s: s0, ap, ids, opp } = setup([bolt()]);
    let s = s0;
    putOnBattlefield(s, ap, imodane());
    const g = putOnBattlefield(s, opp, giant());
    const others = s.turnOrder.filter((p) => p !== ap);
    const life = others.map((p) => s.players[p]!.life);
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "object", id: g }])), ap);
    expect(s.objects[g]!.damage).toBe(3);
    expect(others.map((p) => s.players[p]!.life)).toEqual(life.map((l) => l - 3));
  });

  it("not for damage to a player, nor a spell with two different targets", () => {
    const { s: s0, ap, ids, opp } = setup([bolt(), forked()]);
    let s = s0;
    putOnBattlefield(s, ap, imodane());
    const a = putOnBattlefield(s, opp, giant());
    const b = putOnBattlefield(s, opp, giant());
    const others = s.turnOrder.filter((p) => p !== ap);
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }])), ap);
    const life = others.map((p) => s.players[p]!.life);
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "object", id: a, amount: 1 }, { kind: "object", id: b, amount: 1 }])), ap);
    expect(s.objects[a]!.damage).toBe(1);
    expect(s.objects[b]!.damage).toBe(1);
    expect(others.map((p) => s.players[p]!.life)).toEqual(life);
  });

  it("Forked Bolt with one target, a creature, does", () => {
    const { s: s0, ap, ids, opp } = setup([forked()]);
    let s = s0;
    putOnBattlefield(s, ap, imodane());
    const a = putOnBattlefield(s, opp, giant());
    const life = s.players[opp]!.life;
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "object", id: a, amount: 2 }, { kind: "none" }])), ap);
    expect(s.objects[a]!.damage).toBe(2);
    expect(s.players[opp]!.life).toBe(life - 2);
  });
});
