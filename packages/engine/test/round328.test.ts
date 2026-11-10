// Round 328 (Lane A, skip-list cards): "for each player, choose a creature with power 2 or less that player controls. Then
// destroy all creatures except creatures chosen this way." (Unstable Glyphbridge), its back face Sandswirl Wanderglyph's
// "Whenever an opponent casts a spell during their turn, they can't attack you or planeswalkers you control this turn." and
// "Each opponent who attacked you or a planeswalker you control this turn can't cast spells."; "Tap up to X target
// creatures, then distribute three stun counters among any number of tapped creatures your opponents control." (Crashing
// Wave); "Each Wolf tapped this way deals damage equal to its power to target creature. That creature deals damage equal to
// its power divided as its controller chooses among any number of those Wolves." (Master of the Wild Hunt).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, attackProblem, botActions, castProblem, faceDef, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

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
/** A card in `pid`'s hand. */
const inHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
const creature = (name: string, p: number, t: number, type = "Beast") => card(name, `Creature — ${type}`, "{1}{G}", { cmc: 2, power: String(p), toughness: String(t) });
const zone = (s: GameState, id: string) => s.objects[id]!.zone;

// Real oracle text (Scryfall).
const glyph = (): CardDef => ({"oracleId":"fcd54631-ea47-49a7-ad5f-9a9a51a815ba","name":"Unstable Glyphbridge // Sandswirl Wanderglyph","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Artifact // Artifact Creature — Golem","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"When this artifact enters, if you cast it, for each player, choose a creature with power 2 or less that player controls. Then destroy all creatures except creatures chosen this way.\nCraft with artifact {3}{W}{W} ({3}{W}{W}, Exile this artifact, Exile another artifact you control or an artifact card from your graveyard: Return this card transformed under its owner's control. Craft only as a sorcery.)","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Craft","Transform"],"commanderLegal":"legal","set":"lci","releasedAt":"2023-11-17","rarity":"rare","layout":"transform","gameChanger":false,"faces":[{"name":"Unstable Glyphbridge","manaCost":"{3}{W}{W}","typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"When this artifact enters, if you cast it, for each player, choose a creature with power 2 or less that player controls. Then destroy all creatures except creatures chosen this way.\nCraft with artifact {3}{W}{W} ({3}{W}{W}, Exile this artifact, Exile another artifact you control or an artifact card from your graveyard: Return this card transformed under its owner's control. Craft only as a sorcery.)","colors":["W"]},{"name":"Sandswirl Wanderglyph","manaCost":"","typeLine":"Artifact Creature — Golem","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Golem"],"oracleText":"Flying\nWhenever an opponent casts a spell during their turn, they can't attack you or planeswalkers you control this turn.\nEach opponent who attacked you or a planeswalker you control this turn can't cast spells.","power":"5","toughness":"3","colors":["W"],"colorIndicator":["W"]}]} as CardDef);
const wave = (): CardDef => ({"oracleId":"c8d3936f-4c08-4ffe-83c9-7ed26fb8f9cd","name":"Crashing Wave","manaCost":"{U}{U}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"As an additional cost to cast this spell, waterbend {X}. (While paying a waterbend cost, you can tap your artifacts and creatures to help. Each one pays for {1}.)\nTap up to X target creatures, then distribute three stun counters among any number of tapped creatures your opponents control. (If a permanent with a stun counter would become untapped, remove one from it instead.)","colors":["U"],"colorIdentity":["U"],"keywords":["Waterbend"],"commanderLegal":"legal","set":"tla","releasedAt":"2025-11-21","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const friend = (): CardDef => ({"oracleId":"ae4249de-1b8c-4b15-8960-180557a15065","name":"Animal Friend","manaCost":"{1}{G}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature has \"Whenever this creature attacks, create a 1/1 green Squirrel creature token. Put a +1/+1 counter on that token for each Aura and Equipment attached to this creature other than Animal Friend.\"","colors":["G"],"colorIdentity":["G"],"keywords":["Enchant"],"commanderLegal":"legal","set":"pip","releasedAt":"2024-03-08","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const summons = (): CardDef => ({"oracleId":"c345be5e-243d-44c8-a7c7-280bdb235223","name":"Geth's Summons","manaCost":"{2}{B}{B}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Return up to one target creature card from your graveyard to the battlefield.\nCorrupted — For each opponent who has three or more poison counters as you cast this spell, put up to one target creature card from that player's graveyard onto the battlefield under your control.","colors":["B"],"colorIdentity":["B"],"keywords":["Corrupted"],"commanderLegal":"legal","set":"onc","releasedAt":"2023-02-10","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const sanctuary = (): CardDef => ({"oracleId":"7d1769d0-d942-45b3-a31c-2bbe45e68661","name":"Island Sanctuary","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"If you would draw a card during your draw step, instead you may skip that draw. If you do, until your next turn, you can't be attacked except by creatures with flying and/or islandwalk.","colors":["W"],"colorIdentity":["W"],"keywords":[],"commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const hunt = (): CardDef => ({"oracleId":"dd25cab9-15cc-40f5-9b68-8f345dd7e952","name":"Master of the Wild Hunt","manaCost":"{2}{G}{G}","cmc":4,"typeLine":"Creature — Human Shaman","supertypes":[],"types":["Creature"],"subtypes":["Human","Shaman"],"oracleText":"At the beginning of your upkeep, create a 2/2 green Wolf creature token.\n{T}: Tap all untapped Wolf creatures you control. Each Wolf tapped this way deals damage equal to its power to target creature. That creature deals damage equal to its power divided as its controller chooses among any number of those Wolves.","power":"3","toughness":"3","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","set":"sld","releasedAt":"2023-04-14","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);

describe("round 328", () => {
  it("are fully supported", () => supported(glyph(), wave(), hunt(), friend(), summons(), sanctuary()));
});

describe("round 328: Unstable Glyphbridge", () => {
  it("cast, it keeps one creature with power 2 or less of each player's, chosen by you, and destroys every other creature", () => {
    const { s: s0, ap, ids } = setup([glyph()]);
    const [b, c, d] = s0.turnOrder.filter((p) => p !== ap) as [PlayerId, PlayerId, PlayerId];
    const mineSmall = putOnBattlefield(s0, ap, creature("My Small", 2, 2));
    const mineBig = putOnBattlefield(s0, ap, creature("My Big", 4, 4));
    const bSmall1 = putOnBattlefield(s0, b, creature("B Small One", 1, 1));
    const bSmall2 = putOnBattlefield(s0, b, creature("B Small Two", 2, 3));
    const cBig = putOnBattlefield(s0, c, creature("C Big", 3, 3));
    const dSmall = putOnBattlefield(s0, d, creature("D Small", 0, 4));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    // You choose for B, who has two that qualify; everyone else's is forced (one, or none).
    const p = s.pending;
    expect(p?.kind).toBe("pickPermanents");
    if (p?.kind !== "pickPermanents") return;
    expect(p.player).toBe(ap);
    expect(p.of).toBe(b);
    expect([...p.options].sort()).toEqual([bSmall1, bSmall2].sort());
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [bSmall2] }), ap);
    expect(zone(s, mineSmall)).toBe("battlefield");
    expect(zone(s, bSmall2)).toBe("battlefield");
    expect(zone(s, dSmall)).toBe("battlefield");
    for (const id of [mineBig, bSmall1, cBig]) expect(zone(s, id)).toBe("graveyard");
  });
  it("doesn't trigger when it's put onto the battlefield without being cast", () => {
    const { s: s0, ap, opp } = setup([]);
    const big = putOnBattlefield(s0, opp, creature("Their Big", 5, 5));
    s0.cards[glyph().oracleId] = glyph();
    const id = putOnBattlefield(s0, ap, glyph());
    void id;
    const s = settle(s0, ap);
    expect(s.pending).toBeNull();
    expect(zone(s, big)).toBe("battlefield");
  });
});

describe("round 328: Sandswirl Wanderglyph", () => {
  const wanderglyph = () => faceDef(glyph(), 1);
  it("an opponent who casts a spell during their own turn can't attack you or your planeswalkers that turn", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, wanderglyph());
    const walker = putOnBattlefield(s0, ap, card("Test Walker", "Legendary Planeswalker — Jace", "{2}{U}", { cmc: 3, loyalty: "3" }));
    s0.objects[walker]!.counters.loyalty = 3;
    let s = passUntil(s0, "main1", opp);
    const third = s.turnOrder.find((p) => p !== ap && p !== opp)!;
    const attacker = putOnBattlefield(s, opp, creature("Raider", 3, 3));
    const bolt = inHand(s, opp, card("Test Growth", "Instant", "{G}", { cmc: 1, oracleText: "Target creature gets +1/+1 until end of turn." }));
    putOnBattlefield(s, opp, card("Forest", "Basic Land — Forest"));
    expect(attackProblem(s, s.objects[attacker]!, ap)).toBeNull();
    s = settle(run(s, planCast(s, opp, bolt, [{ kind: "object", id: attacker }])), opp);
    expect(s.objects[bolt]!.zone).toBe("graveyard");
    expect(attackProblem(s, s.objects[attacker]!, ap)).not.toBeNull();
    expect(attackProblem(s, s.objects[attacker]!, ap, true, walker)).not.toBeNull();
    expect(attackProblem(s, s.objects[attacker]!, third)).toBeNull();
  });
  it("doesn't trigger for a spell an opponent casts during another player's turn", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, wanderglyph());
    const third = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    let s = passUntil(s0, "main1", third);
    const raider = putOnBattlefield(s, opp, creature("Raider", 3, 3));
    const growth = inHand(s, opp, card("Test Growth", "Instant", "{G}", { cmc: 1, oracleText: "Target creature gets +1/+1 until end of turn." }));
    putOnBattlefield(s, opp, card("Forest", "Basic Land — Forest"));
    // The active player passes; the opponent casts an instant in that turn.
    for (let i = 0; i < 3 && waitingOn(s) !== opp; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(waitingOn(s)).toBe(opp);
    s = settle(run(s, planCast(s, opp, growth, [{ kind: "object", id: raider }])), opp);
    expect(s.objects[growth]!.zone).toBe("graveyard");
    expect(s.players[opp]!.attackBansThisTurn ?? []).toEqual([]);
  });
  it("an opponent who attacked you or your planeswalker this turn can't cast spells; one who attacked someone else can", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, wanderglyph());
    const walker = putOnBattlefield(s0, ap, card("Test Walker", "Legendary Planeswalker — Jace", "{2}{U}", { cmc: 3, loyalty: "3" }));
    s0.objects[walker]!.counters.loyalty = 3;
    const raider = putOnBattlefield(s0, opp, creature("Raider", 3, 3));
    let s = passUntil(s0, "declareAttackers", opp);
    const third = s.turnOrder.find((p) => p !== ap && p !== opp)!;
    const growth = inHand(s, opp, card("Test Growth", "Instant", "{G}", { cmc: 1, oracleText: "Target creature gets +1/+1 until end of turn." }));
    putOnBattlefield(s, opp, card("Forest", "Basic Land — Forest"));
    const s1 = act(structuredClone(s), { type: "declareAttackers", player: opp, attacks: [{ attacker: raider, defender: ap, planeswalker: walker }] });
    expect(castProblem(s1, opp, growth, [{ kind: "object", id: raider }])).toMatch(/can't cast spells/);
    const s2 = act(structuredClone(s), { type: "declareAttackers", player: opp, attacks: [{ attacker: raider, defender: ap }] });
    expect(castProblem(s2, opp, growth, [{ kind: "object", id: raider }])).toMatch(/can't cast spells/);
    const s3 = act(structuredClone(s), { type: "declareAttackers", player: opp, attacks: [{ attacker: raider, defender: third }] });
    expect(castProblem(s3, opp, growth, [{ kind: "object", id: raider }]) ?? "").not.toMatch(/can't cast spells/);
    expect(planCast(s3, opp, growth, [{ kind: "object", id: raider }])).not.toBeNull();
    expect(planCast(s2, opp, growth, [{ kind: "object", id: raider }])).toBeNull();
  });
});

describe("round 328: Crashing Wave", () => {
  it("taps its targets, then you divide three stun counters among tapped creatures your opponents control", () => {
    const { s: s0, ap, opp, ids } = setup([wave()]);
    const third = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    const untapped = putOnBattlefield(s0, opp, creature("Their Untapped", 3, 3));
    const tapped = putOnBattlefield(s0, third, creature("Their Tapped", 2, 2));
    s0.objects[tapped]!.tapped = true;
    const mine = putOnBattlefield(s0, ap, creature("My Tapped", 2, 2));
    s0.objects[mine]!.tapped = true;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: untapped }], undefined, undefined, 1)), ap);
    expect(s.objects[untapped]!.tapped).toBe(true);
    const p = s.pending;
    expect(p?.kind).toBe("distribute");
    if (p?.kind !== "distribute") return;
    expect(p.total).toBe(3);
    expect(p.counter).toBe("stun");
    expect([...p.options].sort()).toEqual([untapped, tapped].sort());
    s = settle(act(s, { type: "distribute", player: ap, parts: { [untapped]: 2, [tapped]: 1 } }), ap);
    expect(s.objects[untapped]!.counters.stun).toBe(2);
    expect(s.objects[tapped]!.counters.stun).toBe(1);
    expect(s.objects[mine]!.counters.stun ?? 0).toBe(0);
  });
  it("with no targets chosen it still resolves, and the bot puts the counters on a tapped opposing creature", () => {
    const { s: s0, ap, opp, ids } = setup([wave()]);
    const tapped = putOnBattlefield(s0, opp, creature("Their Tapped", 4, 4));
    s0.objects[tapped]!.tapped = true;
    let s = run(s0, planCast(s0, ap, ids[0]!, [], undefined, undefined, 0));
    s = settle(s);
    expect(s.objects[tapped]!.counters.stun).toBe(3);
  });
});

describe("round 328: Master of the Wild Hunt", () => {
  const wolf = (name: string) => creature(name, 2, 2, "Wolf");
  it("taps your untapped Wolves, each deals damage to the target, and its controller divides its damage among those Wolves", () => {
    const { s: s0, ap, opp } = setup([]);
    const master = putOnBattlefield(s0, ap, hunt());
    const w1 = putOnBattlefield(s0, ap, wolf("Wolf One"));
    const w2 = putOnBattlefield(s0, ap, wolf("Wolf Two"));
    const w3 = putOnBattlefield(s0, ap, wolf("Wolf Three"));
    s0.objects[w3]!.tapped = true;
    const big = putOnBattlefield(s0, opp, creature("Their Big", 5, 5));
    let s = settle(run(s0, planActivate(s0, ap, master, 0, [{ kind: "object", id: big }])), opp);
    const p = s.pending;
    expect(p?.kind).toBe("divideDamage");
    if (p?.kind !== "divideDamage") return;
    expect(p.player).toBe(opp);
    expect(p.total).toBe(5);
    // Only the Wolves tapped this way; the one already tapped dealt and is dealt nothing.
    expect([...p.options].sort()).toEqual([w1, w2].sort());
    expect(s.objects[big]!.damage).toBe(4);
    expect(() => act(s, { type: "divideDamage", player: opp, parts: { [w1]: 2, [w2]: 2 } })).toThrow();
    expect(() => act(s, { type: "divideDamage", player: opp, parts: { [w1]: 5, [w3]: 0, [master]: 0 } })).not.toThrow();
    s = settle(act(s, { type: "divideDamage", player: opp, parts: { [w1]: 2, [w2]: 3 } }), ap);
    expect(zone(s, w1)).toBe("graveyard");
    expect(zone(s, w2)).toBe("graveyard");
    expect(zone(s, w3)).toBe("battlefield");
    expect(zone(s, big)).toBe("battlefield");
  });
  it("a bot divides the damage to kill as many Wolves as it can, and the target dies if the Wolves deal enough", () => {
    const { s: s0, ap, opp } = setup([]);
    const master = putOnBattlefield(s0, ap, hunt());
    const wolves = ["Wolf One", "Wolf Two", "Wolf Three"].map((n) => putOnBattlefield(s0, ap, wolf(n)));
    const big = putOnBattlefield(s0, opp, creature("Their Big", 4, 6));
    const s = settle(run(s0, planActivate(s0, ap, master, 0, [{ kind: "object", id: big }])));
    expect(zone(s, big)).toBe("graveyard");
    expect(wolves.filter((id) => zone(s, id) === "graveyard").length).toBe(2);
  });
  it("with the target gone before it resolves, no Wolf is tapped and nothing is dealt", () => {
    const { s: s0, ap, opp } = setup([]);
    const master = putOnBattlefield(s0, ap, hunt());
    const w1 = putOnBattlefield(s0, ap, wolf("Wolf One"));
    const big = putOnBattlefield(s0, opp, creature("Their Big", 5, 5));
    let s = run(s0, planActivate(s0, ap, master, 0, [{ kind: "object", id: big }]));
    s.objects[big]!.zone = "graveyard";
    s.battlefield.splice(s.battlefield.indexOf(big), 1);
    s.players[opp]!.graveyard.push(big);
    invalidateCharacteristics(s);
    s = settle(s, ap);
    expect(s.objects[w1]!.tapped).toBe(false);
    expect(s.objects[w1]!.damage).toBe(0);
  });
});

describe("round 328: Animal Friend", () => {
  const aura = () => card("Test Aura", "Enchantment — Aura", "{W}", { cmc: 1, oracleText: "Enchant creature\nEnchanted creature gets +1/+0." });
  const sword = () => card("Test Sword", "Artifact — Equipment", "{1}", { cmc: 1, oracleText: "Equipped creature gets +1/+0.\nEquip {1}" });
  const attach = (s: GameState, id: string, to: string) => {
    s.objects[id]!.attachedTo = to;
    invalidateCharacteristics(s);
  };
  const squirrels = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid);
  const attackWith = (s0: GameState, ap: PlayerId, opp: PlayerId, attacker: string) => {
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker, defender: opp }] });
    return settle(s, ap);
  };
  it("the enchanted creature's attack makes a Squirrel with a counter for each other Aura and each Equipment on it", () => {
    const { s: s0, ap, opp } = setup([]);
    const bear = putOnBattlefield(s0, ap, creature("Bear", 2, 2));
    attach(s0, putOnBattlefield(s0, ap, friend()), bear);
    attach(s0, putOnBattlefield(s0, ap, aura()), bear);
    attach(s0, putOnBattlefield(s0, ap, sword()), bear);
    const s = attackWith(s0, ap, opp, bear);
    const made = squirrels(s, ap);
    expect(made.length).toBe(1);
    expect(s.objects[made[0]!]!.counters["+1/+1"]).toBe(2);
  });
  it("with only Animal Friend on it, the Squirrel gets no counter", () => {
    const { s: s0, ap, opp } = setup([]);
    const bear = putOnBattlefield(s0, ap, creature("Bear", 2, 2));
    attach(s0, putOnBattlefield(s0, ap, friend()), bear);
    const s = attackWith(s0, ap, opp, bear);
    const made = squirrels(s, ap);
    expect(made.length).toBe(1);
    expect(s.objects[made[0]!]!.counters["+1/+1"] ?? 0).toBe(0);
  });
  it("two Animal Friends on one creature: each makes a Squirrel counting the other one", () => {
    const { s: s0, ap, opp } = setup([]);
    const bear = putOnBattlefield(s0, ap, creature("Bear", 2, 2));
    attach(s0, putOnBattlefield(s0, ap, friend()), bear);
    attach(s0, putOnBattlefield(s0, ap, friend()), bear);
    const s = attackWith(s0, ap, opp, bear);
    const made = squirrels(s, ap);
    expect(made.length).toBe(2);
    for (const id of made) expect(s.objects[id]!.counters["+1/+1"]).toBe(1);
  });
});

describe("round 328: Geth's Summons", () => {
  const yardCard = (s: GameState, pid: PlayerId, def: CardDef) => {
    const id = putOnBattlefield(s, pid, def);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "graveyard";
    s.players[pid]!.graveyard.push(id);
    invalidateCharacteristics(s);
    return id;
  };
  it("returns your creature card, and one from the graveyard of each opponent with three or more poison counters, under your control", () => {
    const { s: s0, ap, ids } = setup([summons()]);
    const [b, c] = s0.turnOrder.filter((p) => p !== ap) as [PlayerId, PlayerId];
    s0.players[b]!.poison = 3;
    s0.players[c]!.poison = 2;
    const mine = yardCard(s0, ap, creature("My Dead", 2, 2));
    const theirs = yardCard(s0, b, creature("B Dead", 3, 3));
    const poor = yardCard(s0, c, creature("C Dead", 4, 4));
    // Only B has a slot: C's card can't be chosen.
    expect(planCast(s0, ap, ids[0]!, [{ kind: "object", id: mine }, { kind: "object", id: poor }])).toBeNull();
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: mine }, { kind: "object", id: theirs }])), ap);
    expect(zone(s, mine)).toBe("battlefield");
    expect(zone(s, theirs)).toBe("battlefield");
    expect(s.objects[theirs]!.controller).toBe(ap);
    expect(zone(s, poor)).toBe("graveyard");
  });
  it("with no opponent poisoned enough it has only your target, up to one", () => {
    const { s: s0, ap, ids } = setup([summons()]);
    const b = s0.turnOrder.find((p) => p !== ap)!;
    const theirs = yardCard(s0, b, creature("B Dead", 3, 3));
    expect(planCast(s0, ap, ids[0]!, [{ kind: "none" }, { kind: "object", id: theirs }])).toBeNull();
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "none" }, { kind: "none" }])), ap);
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(zone(s, theirs)).toBe("graveyard");
  });
});

describe("round 328: Island Sanctuary", () => {
  it("in your draw step you may skip the draw; until your next turn only fliers and islandwalkers can attack you", () => {
    const { s: s0, ap, opp } = setup([]);
    const sanct = putOnBattlefield(s0, ap, sanctuary());
    const ground = putOnBattlefield(s0, opp, creature("Ground", 3, 3));
    const flier = putOnBattlefield(s0, opp, card("Flier", "Creature — Bird", "{1}{U}", { cmc: 2, power: "1", toughness: "1", oracleText: "Flying", keywords: ["Flying"] }));
    let s = passUntil(s0, "draw", ap);
    const p = s.pending;
    expect(p?.kind).toBe("drawInstead");
    if (p?.kind !== "drawInstead") return;
    expect(p.options).toContain(`mayskip:${sanct}`);
    expect(p.options).toContain("draw");
    const hand = s.players[ap]!.hand.length;
    s = act(s, { type: "drawInstead", player: ap, choice: `mayskip:${sanct}` });
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(s.players[ap]!.attackOnlyByUntil).toEqual(["Flying", "Islandwalk"]);
    // It lasts even if Island Sanctuary leaves.
    s.battlefield.splice(s.battlefield.indexOf(sanct), 1);
    s.objects[sanct]!.zone = "graveyard";
    s.players[ap]!.graveyard.push(sanct);
    invalidateCharacteristics(s);
    s = passUntil(s, "declareAttackers", opp);
    expect(attackProblem(s, s.objects[ground]!, ap)).not.toBeNull();
    expect(attackProblem(s, s.objects[flier]!, ap)).toBeNull();
    const third = s.turnOrder.find((x) => x !== ap && x !== opp)!;
    expect(attackProblem(s, s.objects[ground]!, third)).toBeNull();
    // Over as your next turn begins.
    s = passUntil(s, "upkeep", ap);
    expect(s.players[ap]!.attackOnlyByUntil).toBeUndefined();
  });
  it("isn't offered for a draw outside your draw step", () => {
    const { s: s0, ap, ids } = setup([card("Test Divination", "Sorcery", "{U}", { cmc: 1, oracleText: "Draw a card." })]);
    putOnBattlefield(s0, ap, sanctuary());
    const hand = s0.players[ap]!.hand.length;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.hand.length).toBe(hand);
  });
});
