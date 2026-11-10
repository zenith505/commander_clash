// Round 330 (Lane A, skip-list cards): emblems with activated abilities, activated by their owner from the command zone
// (CR 114.4): "Tap an untapped artifact you control: This emblem deals 1 damage to any target." (Karn, Living Legacy)
// and "{1}{B}, Sacrifice a creature: You gain X life and draw X cards, where X is the sacrificed creature's power." (Ob
// Nixilis of the Black Oath); "Pay any amount of mana. Look at that many cards from the top of your library, then put one
// of those cards into your hand and the rest on the bottom of your library in a random order." (Karn's −1).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, abilityProblem, activationCost, applyAction, botActions, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";
import { faceDef, restingDef } from "../src/faces";
import { manaValue, parseManaCost } from "../src/mana";

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
    if (p && p.player !== me) s = act(s, botActions(s, p.player)[0]!);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string) => ({ kind: "object" as const, id });

// Real oracle text (Scryfall).
const reidane = (): CardDef => ({"oracleId":"35ae7b25-6d0f-49f8-a40d-dd2cf88e6f44","name":"Reidane, God of the Worthy // Valkmira, Protector's Shield","manaCost":"{2}{W}","cmc":3,"typeLine":"Legendary Creature — God // Legendary Artifact","supertypes":["Legendary"],"types":["Creature"],"subtypes":["God"],"oracleText":"Flying, vigilance\nSnow lands your opponents control enter tapped.\nNoncreature spells your opponents cast with mana value 4 or greater cost {2} more to cast.","power":"2","toughness":"3","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"commanderLegal":"legal","set":"khm","releasedAt":"2021-02-05","rarity":"rare","layout":"modal_dfc","gameChanger":false,"faces":[{"name":"Reidane, God of the Worthy","manaCost":"{2}{W}","typeLine":"Legendary Creature — God","supertypes":["Legendary"],"types":["Creature"],"subtypes":["God"],"oracleText":"Flying, vigilance\nSnow lands your opponents control enter tapped.\nNoncreature spells your opponents cast with mana value 4 or greater cost {2} more to cast.","power":"2","toughness":"3","colors":["W"]},{"name":"Valkmira, Protector's Shield","manaCost":"{3}{W}","typeLine":"Legendary Artifact","supertypes":["Legendary"],"types":["Artifact"],"subtypes":[],"oracleText":"If a source an opponent controls would deal damage to you or a permanent you control, prevent 1 of that damage.\nWhenever you or another permanent you control becomes the target of a spell or ability an opponent controls, counter that spell or ability unless its controller pays {1}.","colors":["W"]}]} as CardDef);
const valkmira = () => faceDef(restingDef(reidane()), 1);
const karn = (): CardDef => ({"oracleId":"09ab1278-811f-4b97-bd34-7493d6e081e9","name":"Karn, Living Legacy","manaCost":"{4}","cmc":4,"typeLine":"Legendary Planeswalker — Karn","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Karn"],"oracleText":"+1: Create a tapped Powerstone token. (It's an artifact with \"{T}: Add {C}. This mana can't be spent to cast a nonartifact spell.\")\n−1: Pay any amount of mana. Look at that many cards from the top of your library, then put one of those cards into your hand and the rest on the bottom of your library in a random order.\n−7: You get an emblem with \"Tap an untapped artifact you control: This emblem deals 1 damage to any target.\"","loyalty":"4","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"commanderLegal":"legal","set":"dmu","releasedAt":"2022-09-09","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const obNix = (): CardDef => ({"oracleId":"cfc9a2f9-92fa-4608-b98d-f9763c89fc40","name":"Ob Nixilis of the Black Oath","manaCost":"{3}{B}{B}","cmc":5,"typeLine":"Legendary Planeswalker — Nixilis","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Nixilis"],"oracleText":"+2: Each opponent loses 1 life. You gain life equal to the life lost this way.\n−2: Create a 5/5 black Demon creature token with flying. You lose 2 life.\n−8: You get an emblem with \"{1}{B}, Sacrifice a creature: You gain X life and draw X cards, where X is the sacrificed creature's power.\"\nOb Nixilis of the Black Oath can be your commander.","loyalty":"3","colors":["B"],"colorIdentity":["B"],"keywords":[],"commanderLegal":"legal","set":"c14","releasedAt":"2014-11-07","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const golem = card("Test Golem", "Artifact Creature — Golem", "{3}", { power: "3", toughness: "3" });
const rock = card("Test Rock", "Artifact", "{2}");
const ogre = card("Test Ogre", "Creature — Ogre", "{2}{R}", { power: "3", toughness: "2" });
const elf = card("Test Elf", "Creature — Elf", "{G}", { power: "1", toughness: "1" });

function walker(s: GameState, pid: PlayerId, d: CardDef, loyalty: number) {
  const id = putOnBattlefield(s, pid, d);
  s.objects[id]!.counters.loyalty = loyalty;
  return id;
}
const emblemOf = (s: GameState, pid: PlayerId) => (s.emblems ?? []).find((id) => s.objects[id]!.owner === pid)!;

describe("round 330: emblems with activated abilities", () => {
  it("compile", () => {
    supported(karn(), obNix());
  });

  it("Ob Nixilis of the Black Oath's emblem: its owner activates it from the command zone, sacrificing a creature for X life and X cards", () => {
    const { s: s0, ap } = setup([]);
    const ob = walker(s0, ap, obNix(), 8);
    let s = settle(run(s0, planActivate(s0, ap, ob, 2)));
    const em = emblemOf(s, ap);
    expect(s.objects[em]).toMatchObject({ zone: "command", emblem: true });
    const ogreId = putOnBattlefield(s, ap, ogre);
    const life = s.players[ap]!.life;
    const hand = s.players[ap]!.hand.length;
    // Only its owner can activate it (CR 114.4, 602.1).
    const other = s.turnOrder.find((p) => p !== ap)!;
    expect(abilityProblem(s, other, em, 0)).toMatch(/command zone|priority/);
    s = settle(run(s, planActivate(s, ap, em, 0, undefined, undefined, undefined, undefined, { sacrifice: [ogreId] })));
    expect(s.objects[ogreId]!.zone).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(life + 3);
    expect(s.players[ap]!.hand.length).toBe(hand + 3);
    // Still there: it can be activated again.
    expect(s.emblems).toContain(em);
  });

  it("Karn, Living Legacy's emblem: tap an untapped artifact you control, even one that just entered, for 1 damage to any target from the emblem", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = walker(s0, ap, karn(), 7);
    let s = settle(run(s0, planActivate(s0, ap, k, 2)));
    const em = emblemOf(s, ap);
    // A summoning-sick artifact creature can pay it (rulings: its own {T} isn't the cost).
    const g = putOnBattlefield(s, ap, golem, { sick: true });
    const e = putOnBattlefield(s, opp, elf);
    s = settle(run(s, planActivate(s, ap, em, 0, [tgt(e)], undefined, undefined, undefined, { tap: [g] })));
    expect(s.objects[g]!.tapped).toBe(true);
    expect(s.objects[e]!.zone).toBe("graveyard");
    // A tapped artifact can't pay it again.
    expect(abilityProblem(s, ap, em, 0, [{ kind: "player", id: opp }], undefined, undefined, undefined, { tap: [g] })).not.toBeNull();
    const r = putOnBattlefield(s, ap, rock);
    const life = s.players[opp]!.life;
    s = settle(run(s, planActivate(s, ap, em, 0, [{ kind: "player", id: opp }], undefined, undefined, undefined, { tap: [r] })));
    expect(s.players[opp]!.life).toBe(life - 1);
  });

  it("Karn, Living Legacy's −1: pay any amount of mana as it resolves, look at that many cards, one into your hand, the rest on the bottom", () => {
    const { s: s0, ap } = setup([]);
    const k = walker(s0, ap, karn(), 4);
    let s = settle(run(s0, planActivate(s0, ap, k, 1)), ap);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "payX", player: ap });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "3" }), ap);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s.players[ap]!.manaPool.C = 3;
    const top3 = s.players[ap]!.library.slice(0, 3);
    const hand = s.players[ap]!.hand.length;
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(s.players[ap]!.manaPool.C ?? 0).toBe(0);
    // One of the three must be taken (rulings).
    const p = s.pending!;
    expect(p).toBeDefined();
    s = settle(act(s, botActions(s, ap)[0]!), ap);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    const taken = s.players[ap]!.hand.find((id) => top3.includes(id))!;
    expect(taken).toBeDefined();
    const lib = s.players[ap]!.library;
    for (const id of top3.filter((x) => x !== taken)) expect(lib.slice(-2)).toContain(id);
  });

  it("Karn, Living Legacy's −1 with nothing paid: no card is looked at or taken (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const k = walker(s0, ap, karn(), 4);
    const lib = [...s0.players[ap]!.library];
    const hand = s0.players[ap]!.hand.length;
    let s = settle(run(s0, planActivate(s0, ap, k, 1)), ap);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "none" }), ap);
    expect(s.pending).toBeFalsy();
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(s.players[ap]!.library).toEqual(lib);
  });

  it("bots: Karn's emblem pings an opponent with an idle artifact in the second main phase; not again with nothing to tap", () => {
    const { s: s0, ap } = setup([]);
    const k = walker(s0, ap, karn(), 7);
    let s = settle(run(s0, planActivate(s0, ap, k, 2)));
    const em = emblemOf(s, ap);
    putOnBattlefield(s, ap, rock);
    s = passUntil(s, "main2", ap);
    s.players[ap]!.hand = [];
    // No mana for anything else (its commander).
    for (const id of s.battlefield) if (s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.types.includes("Land")) s.objects[id]!.tapped = true;
    let plan = botActions(s, ap);
    const use = plan.find((a) => a.type === "activateAbility" && a.objectId === em);
    expect(use).toBeDefined();
    const t = (use as { targets?: { kind: string; id: string | number }[] }).targets?.[0];
    expect(t && (t.kind === "object" || t.id !== ap)).toBe(true);
    s = settle(run(s, plan));
    // With its only artifact tapped, nothing more.
    plan = botActions(s, ap);
    expect(plan.some((a) => a.type === "activateAbility" && a.objectId === em)).toBe(false);
  });

  it("bots: Ob Nixilis's emblem eats a creature token of power 2 or more, not a nontoken creature", () => {
    const { s: s0, ap } = setup([]);
    const ob = walker(s0, ap, obNix(), 8);
    let s = settle(run(s0, planActivate(s0, ap, ob, 2)));
    const em = emblemOf(s, ap);
    s = passUntil(s, "main2", ap);
    s.players[ap]!.hand = [];
    putOnBattlefield(s, ap, ogre);
    const swamps = s.battlefield.filter((id) => s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.name !== "Swamp" && s.cards[s.objects[id]!.cardId]!.types.includes("Land"));
    for (const id of swamps) s.objects[id]!.tapped = true;
    expect(botActions(s, ap).some((a) => a.type === "activateAbility" && a.objectId === em)).toBe(false);
    const token = putOnBattlefield(s, ap, card("Demon Token", "Token Creature — Demon", "", { power: "5", toughness: "5" }));
    s.objects[token]!.isToken = true;
    const plan = botActions(s, ap);
    const use = plan.find((a) => a.type === "activateAbility" && a.objectId === em) as { costs?: { sacrifice?: string[] } } | undefined;
    expect(use?.costs?.sacrifice).toEqual([token]);
  });
});

const shock = card("Test Shock", "Instant", "{R}", { oracleText: "Test Shock deals 2 damage to any target." });
const shatter = card("Test Shatter", "Instant", "{1}{R}", { oracleText: "Destroy target artifact." });
const resolveAll = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("round 330: Valkmira, Protector's Shield", () => {
  it("is fully supported, both faces", () => {
    supported(reidane());
    expect(isFullySupported(valkmira())).toBe(true);
  });

  it("an opponent's spell targeting you is countered unless they pay {1}; paid, its damage to you is 1 less", () => {
    const { s: s0, ap, opp, ids } = setup([shock, shock]);
    putOnBattlefield(s0, opp, valkmira());
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(s.pending).toMatchObject({ kind: "payUnless", player: ap, cost: "{1}" });
    s = resolveAll(act(s, { type: "payUnless", player: ap, pay: false }));
    expect(s.players[opp]!.life).toBe(40);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }])));
    expect(s.pending).toMatchObject({ kind: "payUnless", player: ap });
    s.players[ap]!.manaPool.R += 1;
    s = resolveAll(act(s, { type: "payUnless", player: ap, pay: true }));
    // 2 damage, 1 prevented.
    expect(s.players[opp]!.life).toBe(39);
  });

  it("another permanent you control triggers it; Valkmira itself doesn't (\"another\")", () => {
    const { s: s0, ap, opp, ids } = setup([shock, shatter]);
    const v = putOnBattlefield(s0, opp, valkmira());
    const b = putOnBattlefield(s0, opp, ogre);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: b }])));
    expect(s.pending).toMatchObject({ kind: "payUnless", player: ap });
    s = resolveAll(act(s, { type: "payUnless", player: ap, pay: false }));
    expect(s.objects[b]!.zone).toBe("battlefield");
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [{ kind: "object", id: v }])));
    expect(s.pending).toBeFalsy();
    expect(s.objects[v]!.zone).toBe("graveyard");
  });

  it("its controller's own spells don't trigger it", () => {
    const { s: s0, ap, ids } = setup([shock]);
    putOnBattlefield(s0, ap, valkmira());
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: ap }])));
    expect(s.pending).toBeFalsy();
    expect(s.players[ap]!.life).toBe(38);
  });
});

const disorienting = (): CardDef => ({"oracleId":"7aa34ef4-5e11-491b-8dbe-6ef80e0ad26c","name":"Disorienting Choice","manaCost":"{3}{G}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"For each opponent, choose up to one target artifact or enchantment that player controls. For each permanent chosen this way, its controller may exile it. Then if one or more of the chosen permanents are still on the battlefield, you search your library for up to that many land cards, put them onto the battlefield tapped, then shuffle.","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","set":"dsc","releasedAt":"2024-09-27","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const charm = card("Test Charm", "Enchantment", "{1}{W}");
const treasure = card("Treasure", "Token Artifact — Treasure", "", { oracleText: "{T}, Sacrifice this artifact: Add one mana of any color." });

describe("round 330: Disorienting Choice", () => {
  it("is fully supported", () => {
    supported(disorienting());
  });

  it("each controller chooses in turn order from the next player; exiled ones go at once; you search for as many lands as stayed", () => {
    const { s: s0, ap, ids } = setup([disorienting()]);
    const [o1, o2, o3] = [1, 2, 3].map((k) => s0.turnOrder[(s0.turnOrder.indexOf(ap) + k) % 4]!);
    const a = putOnBattlefield(s0, o1!, rock);
    const b = putOnBattlefield(s0, o2!, charm);
    const c = putOnBattlefield(s0, o3!, rock);
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(a), tgt(b), tgt(c)]));
    s = resolveAll(s);
    // The next opponent first, and so on.
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: o1 });
    s = act(s, { type: "chooseMay", player: o1!, yes: true });
    // Still on the battlefield until everyone has answered.
    expect(s.objects[a]!.zone).toBe("battlefield");
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: o2 });
    s = act(s, { type: "chooseMay", player: o2!, yes: false });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: o3 });
    s = act(s, { type: "chooseMay", player: o3!, yes: false });
    expect(s.objects[a]!.zone).toBe("exile");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 2 });
    const lands = (s.pending as { cards: string[] }).cards.slice(0, 2);
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: lands }));
    for (const l of lands) expect(s.objects[l]).toMatchObject({ zone: "battlefield", tapped: true });
    expect(s.objects[b]!.zone).toBe("battlefield");
  });

  it("all exiled: no search", () => {
    const { s: s0, ap, ids } = setup([disorienting()]);
    const o1 = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!;
    const a = putOnBattlefield(s0, o1, rock);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(a), { kind: "none" }, { kind: "none" }])));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: o1 });
    s = resolveAll(act(s, { type: "chooseMay", player: o1, yes: true }));
    expect(s.pending).toBeFalsy();
    expect(s.objects[a]!.zone).toBe("exile");
    expect(s.stack).toHaveLength(0);
  });

  it("bots exile a token and keep anything else", () => {
    const { s: s0, ap, ids } = setup([disorienting()]);
    const [o1, o2] = [1, 2].map((k) => s0.turnOrder[(s0.turnOrder.indexOf(ap) + k) % 4]!);
    const tr = putOnBattlefield(s0, o1!, treasure);
    s0.objects[tr]!.isToken = true;
    const r = putOnBattlefield(s0, o2!, rock);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(tr), tgt(r), { kind: "none" }])), ap);
    expect(s.objects[tr]?.zone).not.toBe("battlefield");
    expect(s.objects[r]!.zone).toBe("battlefield");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 1 });
  });

  it("a bot casts it at its opponents' artifacts and enchantments", () => {
    const { s: s0, ap } = setup([disorienting()]);
    const o1 = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!;
    putOnBattlefield(s0, o1, rock);
    s0.players[ap]!.hand = s0.players[ap]!.hand.filter((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Disorienting Choice");
    const d = s0.players[ap]!.hand[0]!;
    // Its commander out of reach.
    for (const c of s0.players[ap]!.command) s0.players[ap]!.commanderCasts[c] = 20;
    const castIt = botActions(s0, ap).find((a) => a.type === "castSpell" && a.objectId === d) as { targets?: { kind: string }[] } | undefined;
    expect(castIt?.targets?.filter((t) => t.kind === "object")).toHaveLength(1);
  });
});

const tyvar = (): CardDef => ({"oracleId":"a21d321b-2172-4577-a05b-399a019e3448","name":"Tyvar the Bellicose","manaCost":"{2}{B}{G}","cmc":4,"typeLine":"Legendary Creature — Elf Warrior","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Elf","Warrior"],"oracleText":"Whenever one or more Elves you control attack, they gain deathtouch until end of turn.\nEach creature you control has \"Whenever a mana ability of this creature resolves, put a number of +1/+1 counters on it equal to the amount of mana this creature produced. This ability triggers only once each turn.\"","power":"5","toughness":"4","colors":["B","G"],"colorIdentity":["B","G"],"keywords":[],"commanderLegal":"legal","set":"mat","releasedAt":"2023-05-12","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const dork = card("Test Dork", "Creature — Elf Druid", "{G}", { power: "1", toughness: "1", oracleText: "{T}: Add {G}." });
const twoDork = card("Test Twin Dork", "Creature — Elf Druid", "{2}{G}", { power: "1", toughness: "1", oracleText: "{T}: Add {G}{G}." });
const sacDork = card("Test Sac Dork", "Creature — Eldrazi Spawn", "", { power: "0", toughness: "1", oracleText: "Sacrifice this creature: Add {C}." });
const elfSpell = card("Test Growth", "Instant", "{G}", { oracleText: "Target creature gets +3/+3 until end of turn." });

describe("round 330: Tyvar the Bellicose", () => {
  const tapFor = (s: GameState, pid: PlayerId, id: string, mana: "G" | "C" = "G") => {
    const plan = planManaAbilityPlan(s, pid, id, mana);
    for (const a of plan) s = act(s, a);
    return s;
  };
  const planManaAbilityPlan = (s: GameState, pid: PlayerId, id: string, mana: "G" | "C"): Action[] => [{ type: "activateMana", player: pid, objectId: id, mana, ability: 0 }];

  it("is fully supported", () => {
    supported(tyvar());
  });

  it("each creature's mana ability resolving puts that much +1/+1 counters on it, once each turn for each creature", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, tyvar());
    const a = putOnBattlefield(s0, ap, dork);
    const b = putOnBattlefield(s0, ap, twoDork);
    let s = tapFor(s0, ap, a);
    // A triggered ability that isn't a mana ability: on the stack once a player would get priority.
    expect(s.players[ap]!.manaPool.G).toBe(1);
    s = tapFor(s, ap, b);
    s = resolveAll(s);
    expect(s.objects[a]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[b]!.counters["+1/+1"]).toBe(2);
    // Once each turn for each of them.
    s.objects[a]!.tapped = false;
    s = resolveAll(tapFor(s, ap, a));
    expect(s.objects[a]!.counters["+1/+1"]).toBe(1);
  });

  it("paying for a spell: the counters come before the spell resolves (rulings)", () => {
    const { s: s0, ap, ids } = setup([elfSpell]);
    putOnBattlefield(s0, ap, tyvar());
    const a = putOnBattlefield(s0, ap, dork);
    for (const id of s0.battlefield) if (s0.objects[id]!.controller === ap && s0.cards[s0.objects[id]!.cardId]!.types.includes("Land")) s0.objects[id]!.tapped = true;
    let s = tapFor(s0, ap, a);
    s = run(s, planCast(s, ap, ids[0]!, [tgt(a)]));
    // The trigger is on top of the spell.
    expect(s.stack.length).toBe(2);
    expect(s.stack.at(-1)!.kind).toBe("ability");
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = resolveAll(s);
    expect(s.objects[a]!.counters["+1/+1"]).toBe(1);
  });

  it("an opponent's creatures don't have it; a creature sacrificed for its own mana doesn't trigger it", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, tyvar());
    const theirs = putOnBattlefield(s0, opp, dork);
    const spawn = putOnBattlefield(s0, ap, sacDork);
    let s = tapFor(s0, ap, spawn, "C");
    expect(s.triggerQueue.length + s.stack.length).toBe(0);
    s = resolveAll(s);
    expect(s.objects[spawn]?.zone).not.toBe("battlefield");
    expect(abilitiesOf(s, s.objects[theirs]!).triggers.some((t) => t.event === "selfManaAbilityResolves")).toBe(false);
    const mine = putOnBattlefield(s, ap, dork);
    expect(abilitiesOf(s, s.objects[mine]!).triggers.some((t) => t.event === "selfManaAbilityResolves")).toBe(true);
  });
});

const hojo = (): CardDef => ({"oracleId":"4ca66b33-28c2-4d0d-8a44-9d891ab13e18","name":"Professor Hojo","manaCost":"{1}{G}","cmc":2,"typeLine":"Legendary Creature — Human Scientist","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Scientist"],"oracleText":"The first activated ability you activate during your turn that targets a creature you control costs {2} less to activate.\nWhenever one or more creatures you control become the target of an activated ability, draw a card. This ability triggers only once each turn.","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","set":"fic","releasedAt":"2025-06-13","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const pump = card("Test Pump Rod", "Artifact", "{1}", { oracleText: "{3}: Put a +1/+1 counter on target creature." });
const greenPump = card("Test Green Rod", "Artifact", "{1}", { oracleText: "{G}: Target creature gets +1/+1 until end of turn." });
const pinger2 = bear({ name: "Test Pinger", power: "1", toughness: "1", oracleText: "When this creature enters, put a +1/+1 counter on target creature." });

describe("round 330: Professor Hojo", () => {
  const noLands = (s: GameState, pid: PlayerId) => {
    for (const id of s.battlefield) if (s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.types.includes("Land")) s.objects[id]!.tapped = true;
  };

  it("is fully supported", () => {
    supported(hojo());
  });

  it("the first activated ability you activate during your turn that targets a creature you control costs {2} less; generic mana only", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, hojo());
    const rod = putOnBattlefield(s0, ap, pump);
    const mine = putOnBattlefield(s0, ap, ogre);
    const theirs = putOnBattlefield(s0, opp, ogre);
    const rodAb = abilitiesOf(s0, s0.objects[rod]!).activated[0]!;
    // Targeting an opponent's creature: the full {3}.
    expect(manaValue(activationCost(s0, ap, s0.objects[rod]!, rodAb, [tgt(theirs)]))).toBe(3);
    expect(manaValue(activationCost(s0, ap, s0.objects[rod]!, rodAb, [tgt(mine)]))).toBe(1);
    noLands(s0, ap);
    s0.players[ap]!.manaPool.C = 1;
    let s = run(s0, planActivate(s0, ap, rod, 0, [tgt(mine)]));
    expect(s.players[ap]!.manaPool.C ?? 0).toBe(0);
    s = resolveAll(s);
    expect(s.objects[mine]!.counters["+1/+1"]).toBe(1);
    // The second one this turn: the full cost.
    expect(manaValue(activationCost(s, ap, s.objects[rod]!, rodAb, [tgt(mine)]))).toBe(3);
  });

  it("not during an opponent's turn", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, hojo());
    const rod = putOnBattlefield(s0, opp, pump);
    const theirs = putOnBattlefield(s0, opp, ogre);
    expect(s0.activePlayer).toBe(ap);
    const rodAb = abilitiesOf(s0, s0.objects[rod]!).activated[0]!;
    expect(manaValue(activationCost(s0, opp, s0.objects[rod]!, rodAb, [tgt(theirs)]))).toBe(3);
  });

  it("only generic mana comes off (rulings)", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, hojo());
    const rod = putOnBattlefield(s0, ap, greenPump);
    const mine = putOnBattlefield(s0, ap, ogre);
    const c = activationCost(s0, ap, s0.objects[rod]!, abilitiesOf(s0, s0.objects[rod]!).activated[0]!, [tgt(mine)]);
    expect(c.symbols).toEqual(parseManaCost("{G}").symbols);
  });

  it("draws a card when an activated ability, anyone's, targets one or more of your creatures, once each turn; not a triggered ability", () => {
    const { s: s0, ap, opp, ids } = setup([pinger2]);
    putOnBattlefield(s0, ap, hojo());
    const rod = putOnBattlefield(s0, ap, greenPump);
    const mine = putOnBattlefield(s0, ap, ogre);
    const hand = s0.players[ap]!.hand.length;
    // A triggered ability targeting it: nothing.
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    if (s.pending?.kind === "chooseTargets") s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [tgt(mine)] }));
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
    s = resolveAll(run(s, planActivate(s, ap, rod, 0, [tgt(mine)])));
    expect(s.players[ap]!.hand.length).toBe(hand);
    s = resolveAll(run(s, planActivate(s, ap, rod, 0, [tgt(mine)])));
    expect(s.players[ap]!.hand.length).toBe(hand);
    void opp;
  });
});
