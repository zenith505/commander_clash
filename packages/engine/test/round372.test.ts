// Round 372 (Lane A): a time counter removed as a cost from a permanent or a suspended card (Rift Elemental), a target
// count set by another target as the spell is cast (Reap) and a land put onto the battlefield from among the cards
// cascade exiled (Averna, the Chaos Bloom).

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup, target } from "./helpers";
import { applyAction, botActions, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
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
const moveTo = (zone: "graveyard" | "hand" | "library" | "exile") => (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const toYard = moveTo("graveyard");
const toLibrary = moveTo("library");
/** A card exiled with time counters on it: suspended if it has suspend (CR 702.62b). */
const suspend = (s: GameState, pid: PlayerId, def: CardDef, n: number) => {
  const id = moveTo("exile")(s, pid, def);
  s.objects[id]!.counters.time = n;
  return id;
};
const player = (id: PlayerId) => ({ kind: "player" as const, id });

const thrull = card("Test Thrull", "Creature — Thrull", "{B}", { cmc: 1, power: "1", toughness: "1", colors: ["B"] });
const relic = card("Test Relic", "Artifact", "{1}", { cmc: 1 });
const hourglass = card("Test Hourglass", "Artifact", "{1}", { cmc: 1 });
const shock = card("Test Shock", "Instant", "{R}", { cmc: 1, oracleText: "Test Shock deals 2 damage to any target.", colors: ["R"] });
const wastes = card("Test Wastes", "Land");
const tundra = card("Test Tundra", "Land");

// Real oracle text (Scryfall).
const rift = (): CardDef => ({"oracleId":"e9602731-2e8e-44ea-96a1-6b38e1efbbd9","name":"Rift Elemental","manaCost":"{R}","cmc":1,"typeLine":"Creature — Elemental","supertypes":[],"types":["Creature"],"subtypes":["Elemental"],"oracleText":"{1}{R}, Remove a time counter from a permanent you control or suspended card you own: This creature gets +2/+0 until end of turn.","power":"1","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"fut","releasedAt":"2007-05-04","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const reap = (): CardDef => ({"oracleId":"7fcb8472-1e77-4dcd-b18f-8abf8806da08","name":"Reap","manaCost":"{1}{G}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Return up to X target cards from your graveyard to your hand, where X is the number of black permanents target opponent controls as you cast this spell.","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","set":"tmp","releasedAt":"1997-10-14","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const averna = (): CardDef => ({"oracleId":"23695bc2-86d3-4d78-b374-9e83c4cc9cc4","name":"Averna, the Chaos Bloom","manaCost":"{G}{U}{R}","cmc":3,"typeLine":"Legendary Creature — Elemental Shaman","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Elemental","Shaman"],"oracleText":"As you cascade, you may put a land card from among the exiled cards onto the battlefield tapped. (Do this after the last card is exiled but before deciding whether to cast a nonland card.)","power":"4","toughness":"2","colors":["G","R","U"],"colorIdentity":["G","R","U"],"keywords":[],"commanderLegal":"legal","set":"j25","releasedAt":"2024-11-15","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const vision = (): CardDef => ({"oracleId":"9728dec9-d482-4c7a-8cdc-44d010dc878d","name":"Ancestral Vision","manaCost":"","cmc":0,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Suspend 4—{U} (Rather than cast this card from your hand, pay {U} and exile it with four time counters on it. At the beginning of your upkeep, remove a time counter. When the last is removed, you may cast it without paying its mana cost.)\nTarget player draws three cards.","colors":["U"],"colorIdentity":["U"],"keywords":["Suspend"],"commanderLegal":"legal","set":"ima","releasedAt":"2017-11-17","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const jetfire = (): CardDef => ({"oracleId":"38de7183-81ef-4a79-b231-7195ba89a281","name":"Jetfire, Ingenious Scientist // Jetfire, Air Guardian","manaCost":"{4}{U}","cmc":5,"typeLine":"Legendary Artifact Creature — Robot // Legendary Artifact — Vehicle","supertypes":["Legendary"],"types":["Artifact","Creature"],"subtypes":["Robot"],"oracleText":"More Than Meets the Eye {3}{U} (You may cast this card converted for {3}{U}.)\nFlying\nRemove one or more +1/+1 counters from among artifacts you control: Target player adds that much {C}. This mana can't be spent to cast nonartifact spells. Convert Jetfire.","power":"3","toughness":"4","colors":["U"],"colorIdentity":["U"],"keywords":["Flying","Adapt","Living metal","Convert","More Than Meets the Eye"],"producedMana":["C"],"commanderLegal":"legal","set":"bot","releasedAt":"2022-11-18","rarity":"mythic","layout":"transform","gameChanger":false,"faces":[{"name":"Jetfire, Ingenious Scientist","manaCost":"{4}{U}","typeLine":"Legendary Artifact Creature — Robot","supertypes":["Legendary"],"types":["Artifact","Creature"],"subtypes":["Robot"],"oracleText":"More Than Meets the Eye {3}{U} (You may cast this card converted for {3}{U}.)\nFlying\nRemove one or more +1/+1 counters from among artifacts you control: Target player adds that much {C}. This mana can't be spent to cast nonartifact spells. Convert Jetfire.","power":"3","toughness":"4","colors":["U"]},{"name":"Jetfire, Air Guardian","manaCost":"","typeLine":"Legendary Artifact — Vehicle","supertypes":["Legendary"],"types":["Artifact"],"subtypes":["Vehicle"],"oracleText":"Living metal (During your turn, this Vehicle is also a creature.)\nFlying\n{U}{U}{U}: Convert Jetfire, then adapt 3. (If it has no +1/+1 counters on it, put three +1/+1 counters on it.)","power":"3","toughness":"4","colors":["U"],"colorIndicator":["U"]}]}) as CardDef;
const bloodbraid = (): CardDef => ({"oracleId":"3f0c9466-5ab9-4205-a84f-b4b27b5a678e","name":"Bloodbraid Elf","manaCost":"{2}{R}{G}","cmc":4,"typeLine":"Creature — Elf Berserker","supertypes":[],"types":["Creature"],"subtypes":["Elf","Berserker"],"oracleText":"Haste (This creature can attack and {T} as soon as it comes under your control.)\nCascade (When you cast this spell, exile cards from the top of your library until you exile a nonland card that costs less. You may cast it without paying its mana cost. Put the exiled cards on the bottom in a random order.)","power":"3","toughness":"2","colors":["G","R"],"colorIdentity":["G","R"],"keywords":["Haste","Cascade"],"commanderLegal":"legal","set":"ema","releasedAt":"2016-06-10","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

describe("round 372: compiles", () => {
  it("every card of the round", () => supported(rift(), reap(), averna(), jetfire()));
});

describe("Rift Elemental", () => {
  it("removing the last time counter from a suspended card you own: +2/+0, and suspend triggers above the ability (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const r = putOnBattlefield(s0, ap, rift());
    const v = suspend(s0, ap, vision(), 1);
    let s = run(s0, planActivate(s0, ap, r, 0, undefined, undefined, undefined, undefined, { counters: [{ id: v, kind: "time" }] }));
    expect(s.objects[v]!.counters.time ?? 0).toBe(0);
    // Suspend's last ability triggered, on the stack above the Elemental's ability: its cast comes first.
    s = settle(s, ap);
    expect(s.pending?.kind).toBe("castFree");
    expect(s.pending?.kind === "castFree" && s.pending.objectId).toBe(v);
    expect(s.stack.length).toBe(1);
  });

  it("from a permanent you control with a time counter on it", () => {
    const { s: s0, ap } = setup([]);
    const r = putOnBattlefield(s0, ap, rift());
    const h = putOnBattlefield(s0, ap, hourglass);
    s0.objects[h]!.counters.time = 2;
    const s = settle(run(s0, planActivate(s0, ap, r, 0, undefined, undefined, undefined, undefined, { counters: [{ id: h, kind: "time" }] })));
    expect(s.objects[h]!.counters.time).toBe(1);
    expect(power(s, s.objects[r]!)).toBe(3);
  });

  it("not from an opponent's suspended card, an exiled card without suspend, or with no time counter around", () => {
    const { s: s0, ap, opp } = setup([]);
    const r = putOnBattlefield(s0, ap, rift());
    expect(planActivate(s0, ap, r, 0)).toBeNull();
    const theirs = suspend(s0, opp, vision(), 2);
    expect(planActivate(s0, ap, r, 0, undefined, undefined, undefined, undefined, { counters: [{ id: theirs, kind: "time" }] })).toBeNull();
    // A card in exile with a time counter but no suspend isn't suspended (CR 702.62b).
    const plain = suspend(s0, ap, relic, 2);
    expect(planActivate(s0, ap, r, 0, undefined, undefined, undefined, undefined, { counters: [{ id: plain, kind: "time" }] })).toBeNull();
    expect(planActivate(s0, ap, r, 0)).toBeNull();
    // With one of yours.
    const mine = suspend(s0, ap, vision(), 3);
    const s = settle(run(s0, planActivate(s0, ap, r, 0, undefined, undefined, undefined, undefined, { counters: [{ id: mine, kind: "time" }] })));
    expect(s.objects[mine]!.counters.time).toBe(2);
    expect(power(s, s.objects[r]!)).toBe(3);
  });
});

describe("Reap", () => {
  it("returns up to as many cards as the targeted opponent's black permanents", () => {
    const { s: s0, ap, opp, ids } = setup([reap()]);
    putOnBattlefield(s0, opp, thrull);
    putOnBattlefield(s0, opp, thrull);
    const a = toYard(s0, ap, relic);
    const b = toYard(s0, ap, shock);
    const c = toYard(s0, ap, hourglass);
    // Two black permanents: not three cards.
    expect(planCast(s0, ap, ids[0]!, [player(opp), target(a), target(b), target(c)])).toBeNull();
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [player(opp), target(a), target(b)])));
    expect(s.objects[a]!.zone).toBe("hand");
    expect(s.objects[b]!.zone).toBe("hand");
    expect(s.objects[c]!.zone).toBe("graveyard");
  });

  it("an opponent with no black permanents: no cards, but it can still be cast at them", () => {
    const { s: s0, ap, opp, ids } = setup([reap()]);
    const other = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    putOnBattlefield(s0, opp, thrull);
    const a = toYard(s0, ap, relic);
    expect(planCast(s0, ap, ids[0]!, [player(other), target(a)])).toBeNull();
    // Not yourself: "target opponent".
    putOnBattlefield(s0, ap, thrull);
    expect(planCast(s0, ap, ids[0]!, [player(ap), target(a)])).toBeNull();
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [player(other)])));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.objects[a]!.zone).toBe("graveyard");
  });

  it("the count is made as it's cast, not again later (rulings)", () => {
    const { s: s0, ap, opp, ids } = setup([reap()]);
    const t1 = putOnBattlefield(s0, opp, thrull);
    putOnBattlefield(s0, opp, thrull);
    const a = toYard(s0, ap, relic);
    const b = toYard(s0, ap, shock);
    let s = run(s0, planCast(s0, ap, ids[0]!, [player(opp), target(a), target(b)]));
    // One of the black permanents leaves before it resolves: both cards still return.
    s.battlefield.splice(s.battlefield.indexOf(t1), 1);
    s.objects[t1]!.zone = "graveyard";
    s.players[opp]!.graveyard.push(t1);
    invalidateCharacteristics(s);
    s = settle(s);
    expect(s.objects[a]!.zone).toBe("hand");
    expect(s.objects[b]!.zone).toBe("hand");
  });

  it("a bot casts it for as many cards as it may", () => {
    const { s: s0, ap, opp, ids } = setup([reap()]);
    putOnBattlefield(s0, opp, thrull);
    const a = toYard(s0, ap, shock);
    // Only Reap in hand, the land for the turn played.
    s0.players[ap]!.hand = [ids[0]!];
    s0.players[ap]!.landsPlayedThisTurn = 1;
    for (const o of Object.values(s0.objects)) if (o.isCommander && o.owner === ap) o.zone = "exile";
    const plan = botActions(s0, ap);
    const cast = plan.find((x) => x.type === "castSpell");
    expect(cast?.type === "castSpell" && cast.objectId).toBe(ids[0]);
    // At the opponent with the black permanent, for the one card.
    expect(cast?.type === "castSpell" && cast.targets).toEqual([player(opp), target(a)]);
    const s = settle(run(s0, plan));
    expect(s.objects[a]!.zone).toBe("hand");
  });
});

describe("Averna, the Chaos Bloom", () => {
  /** Bloodbraid Elf cast with Averna out: the library's top is Wastes, Tundra, then a Shock to cascade into. */
  const cascading = (withAverna = true) => {
    const { s: s0, ap, opp, ids } = setup([bloodbraid()]);
    if (withAverna) putOnBattlefield(s0, ap, averna());
    const shk = toLibrary(s0, ap, shock);
    const tun = toLibrary(s0, ap, tundra);
    const wst = toLibrary(s0, ap, wastes);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    return { s, ap, opp, shk, tun, wst };
  };

  it("after the last card is exiled, a land among them onto the battlefield tapped, then the cast", () => {
    const { s: s1, ap, shk, tun, wst } = cascading();
    expect(s1.pending?.kind).toBe("searchLibrary");
    expect(s1.pending?.kind === "searchLibrary" && [...s1.pending.cards].sort()).toEqual([tun, wst].sort());
    expect(s1.pending?.kind === "searchLibrary" && s1.pending.max).toBe(1);
    let s = act(s1, { type: "searchLibrary", player: ap, found: [tun] });
    expect(s.objects[tun]!.zone).toBe("battlefield");
    expect(s.objects[tun]!.tapped).toBe(true);
    // The nonland card is cast or not next (the reminder text).
    expect(s.pending?.kind).toBe("castFree");
    expect(s.pending?.kind === "castFree" && s.pending.objectId).toBe(shk);
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    s = settle(s, ap);
    // The rest go to the bottom of the library (CR 702.85a).
    expect(s.objects[wst]!.zone).toBe("library");
    expect(s.objects[shk]!.zone).toBe("library");
  });

  it("you may put none; it isn't playing a land, so it's fine after your land for the turn (rulings)", () => {
    const { s: s1, ap, tun, wst } = cascading();
    let s = act(s1, { type: "searchLibrary", player: ap, found: [] });
    expect(s.objects[tun]!.zone).toBe("exile");
    expect(s.objects[wst]!.zone).toBe("exile");
    expect(s.pending?.kind).toBe("castFree");
    // A bot puts one in.
    const { s: s2, ap: ap2 } = cascading();
    s2.players[ap2]!.landsPlayedThisTurn = 1;
    const answer = botActions(s2, ap2);
    expect(answer[0]?.type).toBe("searchLibrary");
    s = act(s2, answer[0]!);
    expect(s.battlefield.filter((id) => [s2.objects[id]?.cardId].length && ["Test Wastes", "Test Tundra"].includes(s.cards[s.objects[id]!.cardId]!.name)).length).toBe(1);
  });

  it("without Averna, straight to the cast", () => {
    const { s } = cascading(false);
    expect(s.pending?.kind).toBe("castFree");
  });
});

describe("Jetfire, Ingenious Scientist", () => {
  const withCounters = () => {
    const { s: s0, ap, opp, ids } = setup([]);
    const j = putOnBattlefield(s0, ap, jetfire());
    const r = putOnBattlefield(s0, ap, relic);
    const b = putOnBattlefield(s0, ap, bear());
    s0.objects[j]!.counters["+1/+1"] = 2;
    s0.objects[r]!.counters["+1/+1"] = 1;
    s0.objects[b]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s0);
    return { s0, ap, opp, ids, j, r, b };
  };

  it("counters from among artifacts you control: the target player adds that much {C}, and Jetfire converts", () => {
    const { s0, ap, opp, j, r } = withCounters();
    const counters = [{ id: j, kind: "+1/+1" }, { id: j, kind: "+1/+1" }, { id: r, kind: "+1/+1" }];
    let s = run(s0, planActivate(s0, ap, j, 0, [player(opp)], undefined, undefined, 3, { counters }));
    // A target: not a mana ability, it uses the stack (CR 605.1a, rulings).
    expect(s.stack.length).toBe(1);
    expect(s.players[opp]!.manaPool.C).toBe(0);
    s = settle(s);
    expect(s.players[opp]!.manaPool.C).toBe(3);
    expect(s.objects[j]!.face).toBe(1);
    expect(s.objects[j]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(s.objects[r]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("not from a creature that isn't an artifact, and not none", () => {
    const { s0, ap, opp, j, b } = withCounters();
    expect(planActivate(s0, ap, j, 0, [player(opp)], undefined, undefined, 1, { counters: [{ id: b, kind: "+1/+1" }] })).toBeNull();
    expect(planActivate(s0, ap, j, 0, [player(opp)], undefined, undefined, 0, { counters: [] })).toBeNull();
  });

  it("the mana can't be spent to cast a nonartifact spell, but it can an artifact spell", () => {
    const { s0, ap, j } = withCounters();
    const counters = [{ id: j, kind: "+1/+1" }, { id: j, kind: "+1/+1" }];
    const s = settle(run(s0, planActivate(s0, ap, j, 0, [player(ap)], undefined, undefined, 2, { counters })));
    expect(s.players[ap]!.manaPool.C).toBe(2);
    // Only that mana to pay with.
    for (const id of s.battlefield) if (s.objects[id]!.owner === ap) s.objects[id]!.tapped = true;
    const art = putOnBattlefield(s, ap, card("Test Idol", "Artifact", "{2}", { cmc: 2 }));
    const crit = putOnBattlefield(s, ap, card("Test Ox", "Creature — Ox", "{2}", { cmc: 2, power: "2", toughness: "2" }));
    for (const id of [art, crit]) {
      s.battlefield.splice(s.battlefield.indexOf(id), 1);
      s.objects[id]!.zone = "hand";
      s.players[ap]!.hand.push(id);
    }
    invalidateCharacteristics(s);
    expect(planCast(s, ap, crit)).toBeNull();
    expect(planCast(s, ap, art)).not.toBeNull();
  });
});
