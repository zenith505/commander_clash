// Lane B round B162: choosing as a permanent enters after looking at an opponent's hand (Sorcerous Spyglass, Anointed
// Peacekeeper; CR 614.12), exiling a spell you control as a cost (Nivmagus Elemental; CR 602.2b, 701.6a, 707.10a), X
// defined by a chosen opponent's hand (Bargaining Table; CR 107.3c, rulings), a creature type chosen as a spell is cast
// for its targets (Selective Snare, Aphetto Dredging; CR 601.2b-c, 205.3m), and mana only from creatures (Myr Superion;
// CR 106.6, 109.2).

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, abilityProblem, activationCost, castProblem, exileSpellCandidates, isFullySupported, manaAbilityProblem, planActivate, planCast, spellCost, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";
import { abilityCosts, botActions } from "../src/bot";

// Real card data (Scryfall).
const spyglass = (): CardDef => ({"oracleId":"b2187f45-80ae-4ac4-9f83-5eb7a00978e2","name":"Sorcerous Spyglass","manaCost":"{2}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"As this artifact enters, look at an opponent's hand, then choose any card name.\nActivated abilities of sources with the chosen name can't be activated unless they're mana abilities.","colors":[],"colorIdentity":[],"keywords":[]});
const peacekeeper = (): CardDef => ({"oracleId":"a67f78be-8fbe-414a-9574-bb11ac50e1a5","name":"Anointed Peacekeeper","manaCost":"{2}{W}","cmc":3,"typeLine":"Creature — Human Cleric","supertypes":[],"types":["Creature"],"subtypes":["Human","Cleric"],"oracleText":"Vigilance\nAs this creature enters, look at an opponent's hand, then choose any card name.\nSpells your opponents cast with the chosen name cost {2} more to cast.\nActivated abilities of sources with the chosen name cost {2} more to activate unless they're mana abilities.","power":"3","toughness":"3","colors":["W"],"colorIdentity":["W"],"keywords":["Vigilance"]});
const nivmagus = (): CardDef => ({"oracleId":"d2f9a8a0-509b-4c24-a8cc-f27f77c9eefd","name":"Nivmagus Elemental","manaCost":"{U/R}","cmc":1,"typeLine":"Creature — Elemental","supertypes":[],"types":["Creature"],"subtypes":["Elemental"],"oracleText":"Exile an instant or sorcery spell you control: Put two +1/+1 counters on this creature. (That spell won't resolve.)","power":"1","toughness":"2","colors":["R","U"],"colorIdentity":["R","U"],"keywords":[]});
const table = (): CardDef => ({"oracleId":"151d9035-c8e8-4794-8405-dc7744eb99a2","name":"Bargaining Table","manaCost":"{5}","cmc":5,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{X}, {T}: Draw a card. X is the number of cards in an opponent's hand.","colors":[],"colorIdentity":[],"keywords":[]});
const snare = (): CardDef => ({"oracleId":"85442273-9596-47bf-9b40-6d48fd7183a6","name":"Selective Snare","manaCost":"{X}{U}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Return X target creatures of the creature type of your choice to their owner's hand.","colors":["U"],"colorIdentity":["U"],"keywords":[]});
const dredging = (): CardDef => ({"oracleId":"6cb8c627-6b2f-48a7-b2d9-8772defea560","name":"Aphetto Dredging","manaCost":"{3}{B}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Return up to three target creature cards of the creature type of your choice from your graveyard to your hand.","colors":["B"],"colorIdentity":["B"],"keywords":[]});
const superion = (): CardDef => ({"oracleId":"43dac6fa-4cdf-49ec-9e11-2e5e8f9f928b","name":"Myr Superion","manaCost":"{2}","cmc":2,"typeLine":"Artifact Creature — Myr","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Myr"],"oracleText":"Spend only mana produced by creatures to cast this spell.","power":"5","toughness":"6","colors":[],"colorIdentity":[],"keywords":[]});
const elves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"]});
const counterspell = (): CardDef => ({"oracleId":"cc187110-1148-4090-bbb8-e205694a39f5","name":"Counterspell","manaCost":"{U}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Counter target spell.","colors":["U"],"colorIdentity":["U"],"keywords":[]});
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[]});
const guide = (): CardDef => ({"oracleId":"6b0e23cf-7d68-4329-86db-7adc26abd86b","name":"Elvish Spirit Guide","manaCost":"{2}{G}","cmc":3,"typeLine":"Creature — Elf Spirit","supertypes":[],"types":["Creature"],"subtypes":["Elf","Spirit"],"oracleText":"Exile this card from your hand: Add {G}.","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"]});
const signet = (): CardDef => ({"oracleId":"0bc7f093-bef0-4f1a-852c-4b75ebf54838","name":"Arcane Signet","manaCost":"{2}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add one mana of any color in your commander's color identity.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["B","G","R","U","W"]});
const stone = card("Mind Stone", "Artifact", "{2}", { oracleText: "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card." });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const tgt = (id: string): TargetChoice => ({ kind: "object", id }) as TargetChoice;
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
const inZone = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  (zone === "hand" ? s.players[pid]!.hand : s.players[pid]!.graveyard).push(id);
  return id;
};
const generic = (s: GameState, pid: PlayerId, id: string) => {
  const c = spellCost(s, pid, s.objects[id]!);
  return c.extra + c.cost.symbols.reduce((n, x) => n + (x.kind === "generic" ? x.amount : 0), 0);
};
/** Cast `def` (in hand as `id`), choose `opp` as it enters, check the hand was shown, then name `name`. */
function enterLookingAt(s: GameState, ap: PlayerId, id: string, opp: PlayerId, name: string): GameState {
  s = run(s, planCast(s, ap, id));
  s = settle(s);
  expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "player" });
  expect((s.pending as { options: string[] }).options).not.toContain(String(ap));
  s = act(s, { type: "chooseOption", player: ap, choice: String(opp) });
  expect(s.log.some((l) => l.text.startsWith(`${s.players[opp]!.name}'s hand: `) && l.to === ap)).toBe(true);
  expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "cardName" });
  s = act(s, { type: "chooseOption", player: ap, choice: name });
  s = settle(s);
  expect(s.objects[id]!.zone).toBe("battlefield");
  return s;
}

describe("look at an opponent's hand, then choose any card name", () => {
  it("compiles them", () => supported(spyglass(), peacekeeper()));

  it("Sorcerous Spyglass: you see the chosen opponent's hand; the named source's non-mana abilities can't be activated", () => {
    const { s: s0, ap, opp, ids } = setup([spyglass()]);
    inZone(s0, opp, bolt(), "hand");
    const rock = putOnBattlefield(s0, opp, stone);
    const before = s0.log.length;
    const s = enterLookingAt(s0, ap, ids[0]!, opp, "Mind Stone");
    expect(s.log.slice(before).some((l) => l.text.includes("Lightning Bolt") && l.to === ap)).toBe(true);
    expect(abilityProblem(s, opp, rock, 0)).toMatch(/can't be activated unless they're mana abilities/);
    expect(planActivate(s, opp, rock, 0)).toBeNull();
    // "{T}: Add {C}" is a mana ability: still allowed.
    expect(manaAbilityProblem(s, opp, s.objects[rock]!, 0)).toBeNull();
  });

  it("Anointed Peacekeeper: opponents' spells with the name cost {2} more, not yours", () => {
    const { s: s0, ap, opp, ids } = setup([peacekeeper(), bolt()]);
    const theirs = inZone(s0, opp, bolt(), "hand");
    const s = enterLookingAt(s0, ap, ids[0]!, opp, "Lightning Bolt");
    expect(generic(s, opp, theirs)).toBe(2);
    expect(generic(s, ap, ids[1]!)).toBe(0);
  });

  it("Anointed Peacekeeper: the named sources' activated abilities cost {2} more for everyone, mana abilities don't", () => {
    const { s: s0, ap, opp, ids } = setup([peacekeeper()]);
    const rock = putOnBattlefield(s0, opp, stone);
    const s = enterLookingAt(s0, ap, ids[0]!, opp, "Mind Stone");
    const mine = putOnBattlefield(s, ap, stone);
    for (const [pid, id] of [[opp, rock], [ap, mine]] as const) {
      const ab = abilitiesOf(s, s.objects[id]!).activated[0]!;
      expect(activationCost(s, pid, s.objects[id]!, ab).symbols.reduce((n, x) => n + (x.kind === "generic" ? x.amount : 0), 0)).toBe(3);
      expect(manaAbilityProblem(s, pid, s.objects[id]!, 0)).toBeNull();
    }
  });
});

describe("Nivmagus Elemental: exile an instant or sorcery spell you control", () => {
  it("compiles", () => supported(nivmagus()));

  const withBolt = () => {
    const { s: s0, ap, opp, ids } = setup([bolt(), bear()]);
    const niv = putOnBattlefield(s0, ap, nivmagus());
    const s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    return { s, ap, opp, ids, niv, cost: abilitiesOf(s, s.objects[niv]!).activated[0]!.costs!.find((c) => c.kind === "exileSpell")! as Parameters<typeof exileSpellCandidates>[2] };
  };

  it("exiles the spell from the stack (it doesn't resolve, it isn't countered) for two +1/+1 counters", () => {
    const { s: s0, ap, opp, ids, niv } = withBolt();
    const life = s0.players[opp]!.life;
    expect(abilityProblem(s0, ap, niv, 0)).toBeNull();
    expect(() => act(s0, { type: "activateAbility", player: ap, objectId: niv, index: 0 })).toThrow(/spell/);
    let s = run(s0, planActivate(s0, ap, niv, 0, [], undefined, undefined, undefined, { exileSpell: [ids[0]!] }));
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
    expect(s.stack.some((x) => x.objectId === ids[0])).toBe(false);
    s = settle(s);
    expect(s.objects[niv]!.counters["+1/+1"]).toBe(2);
    expect(s.players[opp]!.life).toBe(life);
  });

  it("only an instant or sorcery spell you control: not a creature spell, not an opponent's spell", () => {
    const { s, ap, opp, niv, cost } = withBolt();
    const theirs = inZone(s, opp, bolt(), "hand");
    s.objects[theirs]!.zone = "stack";
    s.stack.push({ ...s.stack[0]!, id: "fake", objectId: theirs, controller: opp });
    expect(exileSpellCandidates(s, ap, cost)).toEqual([s.stack[0]!.objectId]);
    expect(abilityProblem(s, ap, niv, 0, [], undefined, undefined, undefined, { exileSpell: [theirs] })).not.toBeNull();

    const { s: s1, ap: ap1, ids } = setup([bear()]);
    const niv1 = putOnBattlefield(s1, ap1, nivmagus());
    const s2 = run(s1, planCast(s1, ap1, ids[0]!));
    expect(s2.stack.length).toBe(1);
    expect(exileSpellCandidates(s2, ap1, cost)).toEqual([]);
    expect(abilityProblem(s2, ap1, niv1, 0, [], undefined, undefined, undefined, { exileSpell: [ids[0]!] })).not.toBeNull();
    expect(planActivate(s2, ap1, niv1, 0)).toBeNull();
  });

  it("the bot exiles only a spell of its own that an opponent is countering", () => {
    const { s: s0, ap, opp, ids, niv } = withBolt();
    const ab = abilitiesOf(s0, s0.objects[niv]!).activated[0]!;
    expect(abilityCosts(s0, ap, s0.objects[niv]!, ab, [])).toBeNull();
    const s = s0;
    putOnBattlefield(s, opp, card("Island", "Basic Land — Island"));
    putOnBattlefield(s, opp, card("Island", "Basic Land — Island"));
    const cs = inZone(s, opp, counterspell(), "hand");
    s.priority = opp;
    const s1 = run(s, planCast(s, opp, cs, [{ kind: "stack", id: s.stack[0]!.id }]));
    expect(abilityCosts(s1, ap, s1.objects[niv]!, ab, [])).toEqual({ exileSpell: [ids[0]!] });
  });
});

describe("Bargaining Table: X is the number of cards in an opponent's hand", () => {
  it("compiles", () => supported(table()));

  it("the opponent is chosen as it's activated; X is their hand size, paid, and you draw", () => {
    const { s: s0, ap, opp } = setup([]);
    const t = putOnBattlefield(s0, ap, table());
    const n = s0.players[opp]!.hand.length;
    expect(n).toBeGreaterThan(0);
    expect(() => act(s0, { type: "activateAbility", player: ap, objectId: t, index: 0 })).toThrow(/opponent/);
    expect(abilityProblem(s0, ap, t, 0, [], undefined, undefined, undefined, { xOpponent: ap })).toMatch(/choose an opponent/);
    expect(abilityProblem(s0, ap, t, 0, [], undefined, undefined, n + 1, { xOpponent: opp })).toMatch(/X is/);
    expect(planActivate(s0, ap, t, 0, [], undefined, undefined, n, { xOpponent: opp })).not.toBeNull();
    const hand = s0.players[ap]!.hand.length;
    const untapped = s0.battlefield.filter((id) => s0.objects[id]!.controller === ap && !s0.objects[id]!.tapped).length;
    let s = run(s0, planActivate(s0, ap, t, 0, [], undefined, undefined, undefined, { xOpponent: opp }));
    // n lands tapped for {X}, plus the Table itself.
    expect(untapped - s.battlefield.filter((id) => s.objects[id]!.controller === ap && !s.objects[id]!.tapped).length).toBe(n + 1);
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("an opponent with an empty hand makes X 0", () => {
    const { s: s0, ap, opp } = setup([]);
    const t = putOnBattlefield(s0, ap, table());
    s0.players[opp]!.hand = [];
    expect(abilityProblem(s0, ap, t, 0, [], undefined, undefined, 0, { xOpponent: opp })).toBeNull();
    const s = run(s0, planActivate(s0, ap, t, 0, [], undefined, undefined, undefined, { xOpponent: opp }));
    expect(s.objects[t]!.tapped).toBe(true);
  });
});

describe("a creature type chosen as the spell is cast, for its targets", () => {
  it("compiles them", () => supported(snare(), dredging()));
  const goblin = (name: string) => card(name, "Creature — Goblin Warrior", "{R}", { power: "1", toughness: "1" });
  const elf = card("Test Elf", "Creature — Elf", "{G}", { power: "1", toughness: "1" });

  it("Selective Snare: the type is chosen first, and only creatures of it can be targeted", () => {
    const { s: s0, ap, opp, ids } = setup([snare()]);
    const g1 = putOnBattlefield(s0, opp, goblin("Goblin One"));
    const g2 = putOnBattlefield(s0, ap, goblin("Goblin Two"));
    const e = putOnBattlefield(s0, opp, elf);
    expect(castProblem(s0, ap, ids[0]!, [tgt(g1)], undefined, undefined, undefined, 1)).toMatch(/choose a creature type/);
    expect(castProblem(s0, ap, ids[0]!, [tgt(e)], undefined, undefined, undefined, 1, { creatureType: "Goblin" })).not.toBeNull();
    // Only creature types (rulings): not a card type or another kind of subtype.
    expect(castProblem(s0, ap, ids[0]!, [tgt(g1)], undefined, undefined, undefined, 1, { creatureType: "Equipment" })).toMatch(/isn't a creature type/);
    expect(castProblem(s0, ap, ids[0]!, [tgt(g1)], undefined, undefined, undefined, 1, { creatureType: "Artifact" })).toMatch(/isn't a creature type/);
    expect(planCast(s0, ap, ids[0]!, [tgt(g1), tgt(g2)], undefined, undefined, 2, { creatureType: "Warrior" })).not.toBeNull();
    expect(planCast(s0, ap, ids[0]!, [tgt(g1), tgt(e)], undefined, undefined, 2, { creatureType: "Goblin" })).toBeNull();
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(g1), tgt(g2)], undefined, undefined, 2, { creatureType: "Goblin" }));
    expect(s.stack[s.stack.length - 1]!.description).toContain("(Goblin)");
    s = settle(s);
    expect(s.objects[g1]!.zone).toBe("hand");
    expect(s.objects[g2]!.zone).toBe("hand");
    expect(s.objects[e]!.zone).toBe("battlefield");
  });

  it("a changeling is every creature type", () => {
    const { s: s0, ap, opp, ids } = setup([snare()]);
    const shape = putOnBattlefield(s0, opp, card("Test Changeling", "Creature — Shapeshifter", "{1}", { power: "1", toughness: "1", keywords: ["Changeling"], oracleText: "Changeling (This card is every creature type.)" }));
    expect(planCast(s0, ap, ids[0]!, [tgt(shape)], undefined, undefined, 1, { creatureType: "Goblin" })).not.toBeNull();
  });

  it("Aphetto Dredging: up to three creature cards of the chosen type from your graveyard", () => {
    const { s: s0, ap, ids } = setup([dredging()]);
    const a = inZone(s0, ap, goblin("Goblin One"), "graveyard");
    const b = inZone(s0, ap, goblin("Goblin Two"), "graveyard");
    const e = inZone(s0, ap, elf, "graveyard");
    expect(castProblem(s0, ap, ids[0]!, [tgt(a), tgt(e), { kind: "none" }], undefined, undefined, undefined, undefined, { creatureType: "Goblin" })).toMatch(/target/);
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(a), tgt(b), { kind: "none" }], undefined, undefined, undefined, { creatureType: "Goblin" }));
    s = settle(s);
    expect(s.objects[a]!.zone).toBe("hand");
    expect(s.objects[b]!.zone).toBe("hand");
    expect(s.objects[e]!.zone).toBe("graveyard");
  });

  it("the bot picks the type with the most targets", () => {
    const { s: s0, ap, ids } = setup([dredging()]);
    for (const n of ["Goblin One", "Goblin Two"]) inZone(s0, ap, goblin(n), "graveyard");
    inZone(s0, ap, elf, "graveyard");
    s0.players[ap]!.hand = [ids[0]!];
    const castIt = botActions(s0, ap).find((a) => a.type === "castSpell" && a.objectId === ids[0]);
    expect(castIt).toMatchObject({ creatureType: "Goblin" });
  });
});

describe("Myr Superion: spend only mana produced by creatures", () => {
  it("compiles", () => supported(superion()));

  it("lands can't pay for it; creatures on the battlefield can; Elvish Spirit Guide's mana from the hand can't (rulings)", () => {
    const { s: s0, ap, ids } = setup([superion(), guide()]);
    expect(planCast(s0, ap, ids[0]!)).toBeNull();
    const e1 = putOnBattlefield(s0, ap, elves());
    // One Elf and the Spirit Guide: not enough creature mana.
    let s = act(s0, { type: "activateAbility", player: ap, objectId: ids[1]!, index: 0 });
    s = act(s, { type: "activateMana", player: ap, objectId: e1, mana: "G" });
    expect(() => act(s, { type: "castSpell", player: ap, objectId: ids[0]! } as Action)).toThrow();
    // Two Elves: it's cast.
    const s1 = s0;
    putOnBattlefield(s1, ap, elves());
    const s2 = run(s1, planCast(s1, ap, ids[0]!));
    expect(s2.objects[ids[0]!]!.zone).toBe("stack");
  });
});
