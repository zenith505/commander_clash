// Round 119: round 118's rules gaps (Powerbalance reads the spell's mana value as cast, a split card's half or a
// prototyped spell; Aminatou's Augury asks which type a card with two is cast as), then the most played cards.

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, passUntil, plains, putOnBattlefield, setup } from "./helpers";
import { botActions, byTypeChoices, isFullySupported, objHasKeyword, planActivate, planCast, power, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";
import { invalidateCharacteristics } from "../src/layers";
import { destroyPermanent, moveObject, spellCost } from "../src/game";

const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
const later = (s: GameState, ap: PlayerId, n: number) => s.turnOrder[(s.turnOrder.indexOf(ap) + n) % 4]!;
const toLibraryTop = (s: GameState, pid: PlayerId, d: CardDef) => {
  const id = putOnBattlefield(s, pid, d);
  moveObject(s, id, "library");
  s.players[pid]!.library = [id, ...s.players[pid]!.library.filter((x) => x !== id)];
  return id;
};

// Real oracle text (Scryfall).
const powerbalance = card("Powerbalance", "Enchantment", "{R}{R}", {
  oracleText:
    "Whenever an opponent casts a spell, you may reveal the top card of your library. If you do, you may cast that card without paying its mana cost if the two spells have the same mana value.",
});
const fireIce = card("Fire // Ice", "Instant // Instant", "{1}{R} // {1}{U}", {
  layout: "split",
  oracleText: "Fire deals 2 damage divided as you choose among one or two targets.",
  faces: [
    { name: "Fire", manaCost: "{1}{R}", typeLine: "Instant", supertypes: [], types: ["Instant"], subtypes: [], oracleText: "Fire deals 2 damage divided as you choose among one or two targets.", colors: ["R"] },
    { name: "Ice", manaCost: "{1}{U}", typeLine: "Instant", supertypes: [], types: ["Instant"], subtypes: [], oracleText: "Tap target permanent.\nDraw a card.", colors: ["U"] },
  ],
});
const fleshgorger = card("Phyrexian Fleshgorger", "Creature — Phyrexian Wurm", "{5}{B}", {
  power: "7",
  toughness: "5",
  keywords: ["Ward", "Menace", "Lifelink", "Prototype"],
  oracleText: "Prototype {1}{B}{B} — 3/3 (You can cast this spell with different mana cost, color, and size. It keeps its abilities and types.)\nMenace, lifelink\nWard—Pay life equal to Phyrexian Fleshgorger's power.",
});

describe("Powerbalance compares the spells as cast", () => {
  /** `caster` casts its first card; Powerbalance's controller has `top` on top and says yes to revealing it. */
  const reveal = (cast: CardDef, top: CardDef, targets?: (s: GameState) => Parameters<typeof planCast>[3], face?: number) => {
    const { s: s0, ap, ids } = setup([cast]);
    let s = s0;
    const b = later(s, ap, 1);
    putOnBattlefield(s, b, powerbalance);
    const t = toLibraryTop(s, b, top);
    s = run(s, planCast(s, ap, ids[0]!, targets?.(s), undefined, undefined, undefined, face !== undefined ? { face } : {}));
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: b });
    s = act(s, { type: "chooseMay", player: b, yes: true });
    return { s, ap, b, t };
  };

  it("a split card on top is cast as the half with that mana value, though the card's is 4", () => {
    expect(isFullySupported(powerbalance)).toBe(true);
    let { s, b, t } = reveal(bear({ name: "Cast Bear" }), fireIce);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong", player: b, options: [t, "none"] });
    s = act(s, { type: "chooseOption", player: b, choice: t });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: t, mv: { exact: 2 } });
    const land = s.battlefield.find((id) => s.objects[id]!.controller !== b)!;
    s = run(s, planCast(s, b, t, [{ kind: "object", id: land }], undefined, undefined, undefined, { face: 1 }));
    expect(s.objects[t]!.zone).toBe("stack");
    s = settle(s);
    expect(s.objects[land]!.tapped).toBe(true);
  });

  it("a split card isn't fused for free: the fused spell's mana value is 4", () => {
    let { s, b, t } = reveal(bear({ name: "Cast Bear" }), fireIce);
    s = act(s, { type: "chooseOption", player: b, choice: t });
    expect(planCast(s, b, t, undefined, undefined, undefined, undefined, { face: 2 })).toBeNull();
  });

  it("the opponent's split spell has the mana value of the half cast", () => {
    const { s, b, t } = reveal(fireIce, bear({ name: "Free Bear" }), (s) => [{ kind: "object", id: s.battlefield[0]! }], 1);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong", player: b, options: [t, "none"] });
  });

  it("a prototype card on top may be cast prototyped when only the prototype's mana value matches", () => {
    let { s, b, t } = reveal(card("Three Drop", "Creature — Beast", "{2}{G}", { power: "3", toughness: "3" }), fleshgorger);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong", options: [t, "none"] });
    s = act(s, { type: "chooseOption", player: b, choice: t });
    expect(planCast(s, b, t)).toBeNull();
    s = run(s, planCast(s, b, t, undefined, undefined, undefined, undefined, { alt: "prototype" }));
    s = settle(s);
    expect(s.objects[t]!.zone).toBe("battlefield");
    expect(s.objects[t]!.prototyped).toBe(true);
  });

  it("the bot casts the revealed prototype card prototyped", () => {
    let { s, b, t } = reveal(card("Three Drop", "Creature — Beast", "{2}{G}", { power: "3", toughness: "3" }), fleshgorger);
    for (let i = 0; i < 4 && s.pending?.player === b; i++) s = run(s, botActions(s, b));
    s = settle(s);
    expect(s.objects[t]!.zone).toBe("battlefield");
    expect(s.objects[t]!.prototyped).toBe(true);
  });
});

const augury = card("Aminatou's Augury", "Sorcery", "{6}{U}{U}", {
  oracleText:
    "Exile the top eight cards of your library. You may put a land card from among them onto the battlefield. Until end of turn, for each nonland card type, you may cast a spell of that type from among the exiled cards without paying its mana cost.",
});

describe("Aminatou's Augury: the type a card is cast as", () => {
  const exileEight = () => {
    const { s: s0, ap, ids } = setup([augury]);
    let s = s0;
    const golem = card("Test Golem", "Artifact Creature — Golem", "{3}", { power: "3", toughness: "3" });
    const top = [bear({ name: "Top Bear" }), golem, card("Relic A", "Artifact", "{2}"), forest, forest, forest, forest, forest].map((d) => {
      const id = putOnBattlefield(s, ap, d);
      moveObject(s, id, "library");
      return id;
    });
    s.players[ap]!.library = [...top, ...s.players[ap]!.library.filter((x) => !top.includes(x))];
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "none" }));
    return { s, ap, top };
  };

  it("an artifact creature cast as a creature: no other creature, but an artifact still", () => {
    let { s, ap, top } = exileEight();
    expect(byTypeChoices(s, s.objects[top[1]!]!, ap)).toEqual(["Artifact", "Creature"]);
    s = settle(run(s, planCast(s, ap, top[1]!, undefined, undefined, undefined, undefined, { asType: "Creature" })));
    expect(s.objects[top[1]!]!.zone).toBe("battlefield");
    expect(planCast(s, ap, top[0]!)).toBeNull();
    s = settle(run(s, planCast(s, ap, top[2]!)));
    expect(s.objects[top[2]!]!.zone).toBe("battlefield");
  });

  it("cast as an artifact, the creature can still be cast and the other artifact can't", () => {
    let { s, ap, top } = exileEight();
    s = settle(run(s, planCast(s, ap, top[1]!, undefined, undefined, undefined, undefined, { asType: "Artifact" })));
    expect(planCast(s, ap, top[2]!)).toBeNull();
    expect(byTypeChoices(s, s.objects[top[0]!]!, ap)).toEqual(["Creature"]);
    s = settle(run(s, planCast(s, ap, top[0]!)));
    expect(s.objects[top[0]!]!.zone).toBe("battlefield");
  });

  it("a type the card doesn't have, or one used already, can't be chosen", () => {
    let { s, ap, top } = exileEight();
    expect(planCast(s, ap, top[0]!, undefined, undefined, undefined, undefined, { asType: "Artifact" })).toBeNull();
    s = settle(run(s, planCast(s, ap, top[0]!)));
    expect(planCast(s, ap, top[1]!, undefined, undefined, undefined, undefined, { asType: "Creature" })).toBeNull();
    expect(planCast(s, ap, top[1]!, undefined, undefined, undefined, undefined, { asType: "Artifact" })).not.toBeNull();
  });
});

const zack = card("Zack Fair", "Legendary Creature — Human Soldier", "{W}", {
  power: "0",
  toughness: "1",
  oracleText:
    "Zack Fair enters with a +1/+1 counter on it.\n{1}, Sacrifice Zack Fair: Target creature you control gains indestructible until end of turn. Put Zack Fair's counters on that creature and attach an Equipment that was attached to Zack Fair to that creature.",
});
const bonesplitter = card("Bonesplitter", "Artifact — Equipment", "{1}", { oracleText: "Equipped creature gets +2/+0.\nEquip {1}" });
const shield = card("Leonin Scimitar", "Artifact — Equipment", "{1}", { oracleText: "Equipped creature gets +1/+1.\nEquip {1}" });

describe("Zack Fair", () => {
  const withZack = (equipment: CardDef[]) => {
    const { s: s0, ap } = setup([]);
    const s = s0;
    const z = putOnBattlefield(s, ap, zack);
    s.objects[z]!.counters = { "+1/+1": 1, charge: 2 };
    const eq = equipment.map((d) => {
      const id = putOnBattlefield(s, ap, d);
      s.objects[id]!.attachedTo = z;
      return id;
    });
    const b = putOnBattlefield(s, ap, bear());
    invalidateCharacteristics(s);
    return { s, ap, z, b, eq };
  };

  it("the target gains indestructible, gets each of Zack's counters, and Zack's Equipment", () => {
    expect(isFullySupported(zack)).toBe(true);
    let { s, ap, z, b, eq } = withZack([bonesplitter]);
    s = settle(run(s, planActivate(s, ap, z, 0, [{ kind: "object", id: b }])));
    expect(s.objects[z]!.zone).toBe("graveyard");
    expect(s.objects[b]!.counters).toMatchObject({ "+1/+1": 1, charge: 2 });
    expect(s.objects[eq[0]!]!.attachedTo).toBe(b);
    expect(power(s, s.objects[b]!)).toBe(5);
    expect(objHasKeyword(s, s.objects[b]!, "Indestructible")).toBe(true);
  });

  it("with two Equipment attached, one is chosen and attached; the other stays unattached", () => {
    let { s, ap, z, b, eq } = withZack([bonesplitter, shield]);
    s = settle(run(s, planActivate(s, ap, z, 0, [{ kind: "object", id: b }])));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "enchant" });
    expect((s.pending as { options: string[] }).options.sort()).toEqual([...eq].sort());
    s = settle(act(s, { type: "chooseOption", player: ap, choice: eq[1]! }));
    expect(s.objects[eq[1]!]!.attachedTo).toBe(b);
    expect(s.objects[eq[0]!]!.attachedTo).toBeUndefined();
  });

  it("no Equipment: only the counters and indestructible", () => {
    let { s, ap, z, b } = withZack([]);
    s = settle(run(s, planActivate(s, ap, z, 0, [{ kind: "object", id: b }])));
    expect(s.objects[b]!.counters).toMatchObject({ "+1/+1": 1 });
    expect(power(s, s.objects[b]!)).toBe(3);
  });
});

const incinerator = card("Chandra's Incinerator", "Creature — Elemental", "{5}{R}", {
  power: "6",
  toughness: "6",
  keywords: ["Trample"],
  oracleText:
    "This spell costs {X} less to cast, where X is the total amount of noncombat damage dealt to your opponents this turn.\nTrample\nWhenever a source you control deals noncombat damage to an opponent, this creature deals that much damage to target creature or planeswalker that player controls.",
});
const lavaSpike = card("Lava Spike", "Sorcery — Arcane", "{R}", { oracleText: "Lava Spike deals 3 damage to target player or planeswalker." });

describe("Chandra's Incinerator", () => {
  it("costs {X} less, X the noncombat damage dealt to opponents this turn; not damage dealt to you", () => {
    expect(isFullySupported(incinerator)).toBe(true);
    const { s: s0, ap, ids, opp } = setup([incinerator, lavaSpike, lavaSpike]);
    let s = s0;
    expect(spellCost(s, ap, s.objects[ids[0]!]!).extra).toBe(5);
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }])));
    expect(spellCost(s, ap, s.objects[ids[0]!]!).extra).toBe(2);
    s = settle(run(s, planCast(s, ap, ids[2]!, [{ kind: "player", id: ap }])));
    expect(spellCost(s, ap, s.objects[ids[0]!]!).extra).toBe(2);
    // The next turn, it's gone.
    s = passUntil(s, "upkeep", later(s, ap, 1));
    expect(spellCost(s, ap, s.objects[ids[0]!]!).extra).toBe(5);
  });
});

const scholar = card("Scholar of New Horizons", "Creature — Human Scout", "{1}{W}", {
  power: "1",
  toughness: "1",
  oracleText:
    "This creature enters with a +1/+1 counter on it.\n{T}, Remove a counter from a permanent you control: Search your library for a Plains card and reveal it. If an opponent controls more lands than you, you may put that card onto the battlefield tapped. If you don't put the card onto the battlefield, put it into your hand. Then shuffle.",
});

describe("Scholar of New Horizons", () => {
  const withScholar = (oppLands: number) => {
    const { s: s0, ap } = setup([]);
    const s = s0;
    const sc = putOnBattlefield(s, ap, scholar);
    s.objects[sc]!.counters = { "+1/+1": 1 };
    const pl = toLibraryTop(s, ap, plains);
    const opp = later(s, ap, 1);
    for (let i = 0; i < oppLands; i++) putOnBattlefield(s, opp, forest);
    invalidateCharacteristics(s);
    return { s, ap, sc, pl };
  };
  const lands = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.types.includes("Land")).length;

  it("an opponent with more lands: the Plains may go onto the battlefield tapped", () => {
    expect(isFullySupported(scholar)).toBe(true);
    let { s, ap, sc, pl } = withScholar(20);
    s = settle(run(s, planActivate(s, ap, sc, 0, undefined, undefined, undefined, undefined, { counters: [{ id: sc, kind: "+1/+1" }] })));
    expect(s.objects[sc]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    s = act(s, { type: "searchLibrary", player: ap, found: [pl] });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    const before = lands(s, ap);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[pl]!.zone).toBe("battlefield");
    expect(s.objects[pl]!.tapped).toBe(true);
    expect(lands(s, ap)).toBe(before + 1);
  });

  it("declined, or with no opponent ahead on lands, it goes to the hand", () => {
    let { s, ap, sc, pl } = withScholar(20);
    s = settle(run(s, planActivate(s, ap, sc, 0, undefined, undefined, undefined, undefined, { counters: [{ id: sc, kind: "+1/+1" }] })));
    s = act(s, { type: "searchLibrary", player: ap, found: [pl] });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.objects[pl]!.zone).toBe("hand");
    ({ s, ap, sc, pl } = withScholar(0));
    s = settle(run(s, planActivate(s, ap, sc, 0, undefined, undefined, undefined, undefined, { counters: [{ id: sc, kind: "+1/+1" }] })));
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [pl] }));
    expect(s.pending).toBeNull();
    expect(s.objects[pl]!.zone).toBe("hand");
  });

  it("no counter on a permanent you control: it can't be activated", () => {
    const { s, ap, sc } = withScholar(0);
    s.objects[sc]!.counters = {};
    expect(planActivate(s, ap, sc, 0)).toBeNull();
  });
});

const rhetoric = card("Cunning Rhetoric", "Enchantment", "{2}{B}", {
  oracleText:
    "Whenever an opponent attacks you and/or one or more planeswalkers you control, exile the top card of that player's library. You may play that card for as long as it remains exiled, and you may spend mana as though it were mana of any color to cast it.",
});

describe("Cunning Rhetoric", () => {
  it("once for each opponent's attack on you, however many attackers; you may cast the exiled card with any mana", () => {
    expect(isFullySupported(rhetoric)).toBe(true);
    const { s: s0, ap } = setup([]);
    let s = s0;
    const me = later(s, ap, 1);
    putOnBattlefield(s, me, rhetoric);
    for (let i = 0; i < 3; i++) putOnBattlefield(s, me, card("Swamp", "Basic Land — Swamp"));
    const bears = [putOnBattlefield(s, ap, bear()), putOnBattlefield(s, ap, bear())];
    const top = toLibraryTop(s, ap, card("Green Thing", "Creature — Beast", "{1}{G}", { power: "2", toughness: "2", keywords: ["Flash"], oracleText: "Flash" }));
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: bears.map((attacker) => ({ attacker, defender: me })) });
    s = settle(s);
    expect(s.objects[top]!.zone).toBe("exile");
    expect(s.players[ap]!.library[0]).not.toBe(top);
    expect(s.objects[s.players[ap]!.library[0]!]!.zone).toBe("library"); // just the one card
    // Swamps pay for {1}{G} (flash), on the attacker's turn.
    for (let i = 0; i < 6 && waitingOn(s) !== me; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = run(s, planCast(s, me, top));
    expect(s.objects[top]!.zone).toBe("stack");
  });

  it("not when an opponent attacks someone else", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const me = later(s, ap, 1);
    putOnBattlefield(s, me, rhetoric);
    const b = putOnBattlefield(s, ap, bear());
    const top = s.players[ap]!.library[0]!;
    s = passUntil(s, "declareAttackers", ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: later(s, ap, 2) }] }));
    expect(s.objects[top]!.zone).toBe("library");
  });
});

const tinybones = card("Tinybones, Bauble Burglar", "Legendary Creature — Skeleton Rogue", "{1}{B}", {
  power: "1",
  toughness: "3",
  oracleText:
    "Whenever an opponent discards a card, exile it from their graveyard with a stash counter on it.\nDuring your turn, you may play cards you don't own with stash counters on them from exile, and mana of any type can be spent to cast those spells.\n{3}{B}, {T}: Each opponent discards a card. Activate only as a sorcery.",
});

describe("Tinybones, Bauble Burglar", () => {
  it("each opponent's discarded card is exiled with a stash counter; you may cast it during your turn with any type of mana", () => {
    expect(isFullySupported(tinybones)).toBe(true);
    const { s: s0, ap } = setup([]);
    let s = s0;
    const t = putOnBattlefield(s, ap, tinybones);
    const opps = [1, 2, 3].map((n) => later(s, ap, n));
    // Each opponent holds one green card (paid for with Swamps and Islands, any type of mana).
    const held = opps.map((o) => {
      const id = putOnBattlefield(s, o, bear({ name: `Held Bear ${o}` }));
      moveObject(s, id, "hand");
      s.players[o]!.hand = [id];
      return id;
    });
    s = settle(run(s, planActivate(s, ap, t, 0)));
    for (const id of held) {
      expect(s.objects[id]!.zone).toBe("exile");
      expect(s.objects[id]!.counters.stash).toBe(1);
    }
    // Tap the forests first, so only non-green mana is left.
    for (const id of s.battlefield.filter((b) => s.objects[b]!.controller === ap && s.cards[s.objects[b]!.cardId]!.name === "Forest")) s.objects[id]!.tapped = true;
    s = settle(run(s, planCast(s, ap, held[0]!)));
    expect(s.objects[held[0]!]!.zone).toBe("battlefield");
    expect(s.objects[held[0]!]!.controller).toBe(ap);
  });

  it("not on an opponent's turn, and not a card you own", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    putOnBattlefield(s, ap, tinybones);
    const opp = later(s, ap, 1);
    const theirs = putOnBattlefield(s, opp, bear());
    moveObject(s, theirs, "exile");
    s.objects[theirs]!.counters.stash = 1;
    const mine = putOnBattlefield(s, ap, bear());
    moveObject(s, mine, "exile");
    s.objects[mine]!.counters.stash = 1;
    expect(planCast(s, ap, mine)).toBeNull();
    s = passUntil(s, "main1", opp);
    for (let i = 0; i < 3; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(planCast(s, ap, theirs)).toBeNull();
  });
});

const mari = card("Mari, the Killing Quill", "Legendary Creature — Vampire Assassin", "{1}{B}{B}", {
  power: "3",
  toughness: "2",
  oracleText:
    'Whenever a creature an opponent controls dies, exile it with a hit counter on it.\nAssassins, Mercenaries, and Rogues you control have deathtouch and "Whenever this creature deals combat damage to a player, you may remove a hit counter from a card that player owns in exile. If you do, draw a card and create two Treasure tokens."',
});

describe("Mari, the Killing Quill", () => {
  it("an opponent's creature that dies is exiled with a hit counter; a Rogue's combat damage cashes one in", () => {
    expect(isFullySupported(mari)).toBe(true);
    const { s: s0, ap } = setup([]);
    let s = s0;
    putOnBattlefield(s, ap, mari);
    const rogue = putOnBattlefield(s, ap, card("Test Rogue", "Creature — Human Rogue", "{1}{B}", { power: "1", toughness: "1" }));
    const opp = later(s, ap, 1);
    const victim = putOnBattlefield(s, opp, bear());
    invalidateCharacteristics(s);
    expect(objHasKeyword(s, s.objects[rogue]!, "Deathtouch")).toBe(true);
    destroyPermanent(s, s.objects[victim]!, "destroyed");
    s = settle(s);
    expect(s.objects[victim]!.zone).toBe("exile");
    expect(s.objects[victim]!.counters.hit).toBe(1);
    // My own creature dying isn't exiled.
    const own = putOnBattlefield(s, ap, bear());
    destroyPermanent(s, s.objects[own]!, "destroyed");
    s = settle(s);
    expect(s.objects[own]!.zone).toBe("graveyard");
    const hand = s.players[ap]!.hand.length;
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: rogue, defender: opp }] });
    for (let i = 0; i < 30 && s.pending?.kind !== "chooseMay"; i++) s = act(s, s.pending?.kind === "declareBlockers" ? { type: "declareBlockers", player: waitingOn(s)!, blocks: [] } : { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[victim]!.counters.hit ?? 0).toBe(0);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap).length).toBe(2);
  });
});

const flourishing = card("Unbound Flourishing", "Enchantment", "{2}{G}", {
  oracleText:
    "Whenever you cast a permanent spell with a mana cost that contains {X}, double the value of X.\nWhenever you cast an instant or sorcery spell or activate an ability, if that spell's mana cost or that ability's activation cost contains {X}, copy that spell or ability. You may choose new targets for the copy.",
});
const endless = card("Endless One", "Creature — Eldrazi", "{X}", { power: "0", toughness: "0", oracleText: "This creature enters with X +1/+1 counters on it." });
const blaze = card("Blaze", "Sorcery", "{X}{R}", { oracleText: "Blaze deals X damage to any target." });
const font = card("Life Font", "Artifact", "{1}", { oracleText: "{X}, {T}: You gain X life." });

describe("Unbound Flourishing", () => {
  it("doubles the X of a permanent spell, without more mana paid", () => {
    expect(isFullySupported(flourishing)).toBe(true);
    const { s: s0, ap, ids } = setup([endless]);
    let s = s0;
    putOnBattlefield(s, ap, flourishing);
    s = settle(run(s, planCast(s, ap, ids[0]!, undefined, undefined, undefined, 3)));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(6);
  });

  it("copies an instant or sorcery with {X}, with the same X", () => {
    const { s: s0, ap, ids } = setup([blaze]);
    let s = s0;
    putOnBattlefield(s, ap, flourishing);
    const opp = later(s, ap, 1);
    const life = s.players[opp]!.life;
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, undefined, 2)));
    if (s.pending?.kind === "copyTargets") s = settle(act(s, { type: "copyTargets", player: ap }));
    expect(s.players[opp]!.life).toBe(life - 4);
  });

  it("copies an activated ability with {X} in its cost; not one without", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    putOnBattlefield(s, ap, flourishing);
    const f = putOnBattlefield(s, ap, font);
    const life = s.players[ap]!.life;
    s = settle(run(s, planActivate(s, ap, f, 0, undefined, undefined, undefined, 3)));
    expect(s.players[ap]!.life).toBe(life + 6);
    // A spell without {X}: not copied.
    const plain = putOnBattlefield(s, ap, card("Lava Dart", "Instant", "{R}", { oracleText: "Lava Dart deals 1 damage to any target." }));
    moveObject(s, plain, "hand");
    const opp = later(s, ap, 1);
    const theirs = s.players[opp]!.life;
    s = settle(run(s, planCast(s, ap, plain, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(theirs - 1);
  });
});

describe("Firebender Ascension", () => {
  const ascension = card("Firebender Ascension", "Enchantment", "{1}{R}", { oracleText: "When this enchantment enters, create a 2/2 red Soldier creature token with firebending 1.\nWhenever a creature you control attacking causes a triggered ability of that creature to trigger, put a quest counter on this enchantment. Then if it has four or more quest counters on it, you may copy that ability. You may choose new targets for the copy." });
  const fireSages = card("Fire Sages", "Creature — Human Cleric", "{1}{R}", { power: "2", toughness: "2", keywords: ["Firebending"], oracleText: "Firebending 1 (Whenever this creature attacks, add {R}. This mana lasts until end of combat.)\n{1}{R}{R}: Put a +1/+1 counter on this creature." });
  const watcher = card("Attack Watcher", "Enchantment", "{1}", { oracleText: "Whenever a creature you control attacks, you gain 1 life." });
  const toBlockers = (s: GameState, yes: boolean) => {
    for (let i = 0; i < 80 && !(s.step === "declareBlockers" && !s.stack.length && !s.triggerQueue.length); i++) {
      const p = s.pending;
      if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes });
      else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
      else if (p) s = act(s, botActions(s, waitingOn(s)!)[0]!);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    return s;
  };
  const attackWith = (s: GameState, ap: PlayerId, opp: PlayerId, id: string) => {
    s = passUntil(s, "declareAttackers", ap);
    return act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: id, defender: opp }] });
  };

  it("makes a Soldier with firebending 1, which it then counts (CR 702.189a)", () => {
    expect(isFullySupported(ascension)).toBe(true);
    const { s: s0, ap, opp, ids } = setup([ascension]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const token = s.battlefield.find((x) => s.objects[x]!.isToken)!;
    expect(s.objects[token]!.cardId && s.cards[s.objects[token]!.cardId]!.name).toBe("Soldier Token");
    expect(power(s, s.objects[token]!)).toBe(2);
    s.objects[token]!.controlledSinceTurn = -1;
    s = toBlockers(attackWith(s, ap, opp, token), true);
    const asc = s.battlefield.find((x) => s.cards[s.objects[x]!.cardId]!.name === "Firebender Ascension")!;
    expect(s.objects[asc]!.counters.quest).toBe(1);
    expect(s.players[ap]!.manaPool.R).toBe(1);
  });

  it("copies the ability from the fourth quest counter on, above the original; not another creature's attack trigger", () => {
    const { s: s0, ap, opp } = setup([]);
    const asc = putOnBattlefield(s0, ap, ascension);
    s0.objects[asc]!.counters.quest = 3;
    const sages = putOnBattlefield(s0, ap, fireSages);
    putOnBattlefield(s0, ap, watcher);
    let s = attackWith(s0, ap, opp, sages);
    // Firebending's trigger and the Ascension's; the watcher's ability isn't the creature's.
    s = toBlockers(s, true);
    expect(s.objects[asc]!.counters.quest).toBe(4);
    expect(s.players[ap]!.manaPool.R).toBe(2);
  });

  it("may decline the copy; with fewer than four counters there's none", () => {
    const { s: s0, ap, opp } = setup([]);
    const asc = putOnBattlefield(s0, ap, ascension);
    s0.objects[asc]!.counters.quest = 3;
    const sages = putOnBattlefield(s0, ap, fireSages);
    const s = toBlockers(attackWith(s0, ap, opp, sages), false);
    expect(s.objects[asc]!.counters.quest).toBe(4);
    expect(s.players[ap]!.manaPool.R).toBe(1);
    const { s: t0, ap: ap2, opp: opp2 } = setup([]);
    const asc2 = putOnBattlefield(t0, ap2, ascension);
    t0.objects[asc2]!.counters.quest = 0;
    const t = toBlockers(attackWith(t0, ap2, opp2, putOnBattlefield(t0, ap2, fireSages)), true);
    expect(t.objects[asc2]!.counters.quest).toBe(1);
    expect(t.players[ap2]!.manaPool.R).toBe(1);
  });
});
