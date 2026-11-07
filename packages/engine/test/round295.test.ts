// Round 295: harder cards from the "Out after round N" lists, most played first.

import { describe, expect, it } from "vitest";
import { act, bear, card, forest as forestCard, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, characteristics, controllerOf, planActivate, invalidateCharacteristics, isFullySupported, objHasKeyword, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";
import { cardSource, dealDamage, objectSource } from "../src/damage";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Passes priority until the stack and the trigger queue are empty or someone is asked something. */
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && !s.pending && (s.stack.length || s.triggerQueue.length || i === 0); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
/** A fresh copy of `def` in `pid`'s `where` (the top of the library). */
const put = (s: GameState, pid: PlayerId, def: CardDef, where: "library" | "hand" | "graveyard") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};

// Real oracle text (Scryfall).
const grothama = (): CardDef => ({"oracleId":"34fd52c1-3d81-4005-b826-eeefbd7fd874","name":"Grothama, All-Devouring","manaCost":"{3}{G}{G}","cmc":5,"typeLine":"Legendary Creature — Wurm","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Wurm"],"oracleText":"Other creatures have \"Whenever this creature attacks, you may have it fight Grothama, All-Devouring.\"\nWhen Grothama leaves the battlefield, each player draws cards equal to the amount of damage dealt to Grothama this turn by sources they controlled.","power":"10","toughness":"8","colors":["G"],"colorIdentity":["G"],"keywords":["Fight"],"imageUrl":"https://cards.scryfall.io/normal/front/a/b/ab8935b1-ec87-4330-9952-9ef8cd344531.jpg?1783934853","artUrl":"https://cards.scryfall.io/art_crop/front/a/b/ab8935b1-ec87-4330-9952-9ef8cd344531.jpg?1783934853","commanderLegal":"legal","set":"bbd","releasedAt":"2018-06-08","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const doors = (): CardDef => ({"oracleId":"d82c77a1-2b81-415d-9f18-47e059c15e01","name":"Doors of Durin","manaCost":"{3}{R}{G}","cmc":5,"typeLine":"Legendary Artifact","supertypes":["Legendary"],"types":["Artifact"],"subtypes":[],"oracleText":"Whenever you attack, scry 2, then you may reveal the top card of your library. If a creature card is revealed this way, put it onto the battlefield tapped and attacking. Until your next turn, it gains trample if you control a Dwarf and hexproof if you control an Elf.","colors":["G","R"],"colorIdentity":["G","R"],"keywords":["Scry"],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8ebd8813-4aaf-48bf-9243-3ec4099b8372.jpg?1783916256","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8ebd8813-4aaf-48bf-9243-3ec4099b8372.jpg?1783916256","commanderLegal":"legal","set":"ltr","releasedAt":"2023-06-23","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const backfor = (): CardDef => ({"oracleId":"ee3d21b9-58b4-480c-bae3-26de50f1a5c6","name":"Back for Seconds","manaCost":"{2}{B}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Bargain (You may sacrifice an artifact, enchantment, or token as you cast this spell.)\nReturn up to two target creature cards from your graveyard to your hand. If this spell was bargained, you may put one of those cards with mana value 4 or less onto the battlefield instead of putting it into your hand.","colors":["B"],"colorIdentity":["B"],"keywords":["Bargain"],"imageUrl":"https://cards.scryfall.io/normal/front/6/6/660845b5-96fa-4484-822b-aa0508801306.jpg?1783915111","artUrl":"https://cards.scryfall.io/art_crop/front/6/6/660845b5-96fa-4484-822b-aa0508801306.jpg?1783915111","commanderLegal":"legal","set":"woe","releasedAt":"2023-09-08","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const plaguereav = (): CardDef => ({"oracleId":"eef50ef8-958b-4f5c-b261-16926d9fe672","name":"Plague Reaver","manaCost":"{2}{B}","cmc":3,"typeLine":"Creature — Beast","supertypes":[],"types":["Creature"],"subtypes":["Beast"],"oracleText":"At the beginning of your end step, sacrifice each other creature you control.\nDiscard two cards, Sacrifice this creature: Choose target opponent. Return this creature to the battlefield under that player's control at the beginning of their next upkeep.","power":"6","toughness":"5","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/3/230b9bc8-29c8-49cb-b4f5-1aceeda8bf45.jpg?1783928829","artUrl":"https://cards.scryfall.io/art_crop/front/2/3/230b9bc8-29c8-49cb-b4f5-1aceeda8bf45.jpg?1783928829","commanderLegal":"legal","set":"cmr","releasedAt":"2020-11-20","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const conjurers = (): CardDef => ({"oracleId":"21b520c6-c94a-475a-a824-dd96394ea55b","name":"Conjurer's Mantle","manaCost":"{1}{W}","cmc":2,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +1/+1 and has vigilance.\nWhenever equipped creature attacks, look at the top six cards of your library. You may reveal a card that shares a creature type with that creature from among them and put it into your hand. Put the rest on the bottom of your library in a random order.\nEquip {1}","colors":["W"],"colorIdentity":["W"],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/5/1/51ddebe2-aad6-4097-ac02-fa6c99f30de7.jpg?1783917292","artUrl":"https://cards.scryfall.io/art_crop/front/5/1/51ddebe2-aad6-4097-ac02-fa6c99f30de7.jpg?1783917292","commanderLegal":"legal","set":"moc","releasedAt":"2023-04-21","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const radagast = (): CardDef => ({"oracleId":"dfa47d0d-17f0-4a12-89d3-0d3c7f3db8c6","name":"Radagast the Brown","manaCost":"{2}{G}{G}","cmc":4,"typeLine":"Legendary Creature — Avatar Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Avatar","Wizard"],"oracleText":"Whenever Radagast or another nontoken creature you control enters, look at the top X cards of your library, where X is that creature's mana value. You may reveal a creature card that doesn't share a creature type with a creature you control from among those cards and put it into your hand. Put the rest on the bottom of your library in a random order.","power":"2","toughness":"5","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/3/b3988120-ebbe-4d24-9bb4-8c5331a14034.jpg?1783916261","artUrl":"https://cards.scryfall.io/art_crop/front/b/3/b3988120-ebbe-4d24-9bb4-8c5331a14034.jpg?1783916261","commanderLegal":"legal","set":"ltr","releasedAt":"2023-06-23","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const ninefinger = (): CardDef => ({"oracleId":"e06007cf-dc6e-4b50-93d5-9a7c8ee9c023","name":"Nine-Fingers Keene","manaCost":"{1}{B}{G}{U}","cmc":4,"typeLine":"Legendary Creature — Human Rogue","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Rogue"],"oracleText":"Menace\nWard—Pay 9 life.\nWhenever Nine-Fingers Keene deals combat damage to a player, look at the top nine cards of your library. You may put a Gate card from among them onto the battlefield. Then if you control nine or more Gates, put the rest into your hand. Otherwise, put the rest on the bottom of your library in a random order.","power":"4","toughness":"4","colors":["B","G","U"],"colorIdentity":["B","G","U"],"keywords":["Menace","Ward"],"imageUrl":"https://cards.scryfall.io/normal/front/3/3/33ac9e11-0fa8-4a58-8268-b46ad18c75c2.jpg?1783922622","artUrl":"https://cards.scryfall.io/art_crop/front/3/3/33ac9e11-0fa8-4a58-8268-b46ad18c75c2.jpg?1783922622","commanderLegal":"legal","set":"clb","releasedAt":"2022-06-10","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const pucas = (): CardDef => ({"oracleId":"9b832f87-0bd5-47bd-ab9c-718bd9a6c441","name":"Puca's Covenant","manaCost":"{2}{G}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever a creature you control with a counter on it dies, you may return another target permanent card with mana value less than or equal to the number of counters on that creature from your graveyard to your hand. Do this only once each turn.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/9/1966dbd2-963a-4d37-ab26-c0a0715f523f.jpg?1783904602","artUrl":"https://cards.scryfall.io/art_crop/front/1/9/1966dbd2-963a-4d37-ab26-c0a0715f523f.jpg?1783904602","commanderLegal":"legal","set":"ecc","releasedAt":"2026-01-23","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const kamiz = (): CardDef => ({"oracleId":"49da6a78-f3b2-4691-975c-efbb644311f3","name":"Kamiz, Obscura Oculus","manaCost":"{1}{W}{U}{B}","cmc":4,"typeLine":"Legendary Creature — Octopus Rogue","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Octopus","Rogue"],"oracleText":"Whenever you attack, target attacking creature can't be blocked this turn. It connives. Then choose another attacking creature with lesser power. That creature gains double strike until end of turn. (To have a creature connive, draw a card, then discard a card. If you discarded a nonland card, put a +1/+1 counter on that creature.)","power":"2","toughness":"4","colors":["B","U","W"],"colorIdentity":["B","U","W"],"keywords":["Connive"],"imageUrl":"https://cards.scryfall.io/normal/front/7/4/74b8ae28-e169-46be-8180-ebdaf80efd81.jpg?1783923381","artUrl":"https://cards.scryfall.io/art_crop/front/7/4/74b8ae28-e169-46be-8180-ebdaf80efd81.jpg?1783923381","commanderLegal":"legal","set":"ncc","releasedAt":"2022-04-29","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);

describe("Grothama, All-Devouring: each player draws for the damage their sources dealt it this turn", () => {
  it("when it leaves the battlefield, each player draws that many: what each player's sources dealt it, as they controlled them", () => {
    supported(grothama());
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, grothama());
    const third = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    const mine = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, bear());
    dealDamage(s0, objectSource(s0, s0.objects[mine]!), { object: s0.objects[g]! }, 2);
    dealDamage(s0, objectSource(s0, s0.objects[theirs]!), { object: s0.objects[g]! }, 3);
    dealDamage(s0, { ...cardSource(card("Test Shock", "Instant", "{R}"), opp), spell: true }, { object: s0.objects[g]! }, 2);
    const hands = s0.turnOrder.map((p) => s0.players[p]!.hand.length);
    // Lethal from the third player's spell: it dies, and the trigger counts all of it.
    let s = s0;
    dealDamage(s, { ...cardSource(card("Test Blaze", "Sorcery", "{R}"), third), spell: true }, { object: s.objects[g]! }, 4);
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(zone(s, g)).toBe("graveyard");
    const drew = s.turnOrder.map((p, i) => s.players[p]!.hand.length - hands[i]!);
    const want = s.turnOrder.map((p) => (p === ap ? 2 : p === opp ? 5 : p === third ? 4 : 0));
    expect(drew).toEqual(want);
  });
});

describe("Doors of Durin: scry 2, then a creature card revealed from the top enters tapped and attacking", () => {
  const dwarf = bear({ name: "Test Dwarf", subtypes: ["Dwarf"], typeLine: "Creature — Dwarf" });
  const elf = bear({ name: "Test Elf", subtypes: ["Elf"], typeLine: "Creature — Elf" });
  /** Attacks `opp` with `attacker`, keeps the top two cards on top as they are, and answers the reveal with `reveal`. */
  const attack = (s0: GameState, ap: PlayerId, opp: PlayerId, attacker: string, reveal: boolean) => {
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker, defender: opp }] } as Action);
    s = settle(s);
    expect(s.pending?.kind).toBe("arrangeTop");
    const p = s.pending as Extract<GameState["pending"], { kind: "arrangeTop" }>;
    s = act(s, { type: "arrangeTop", player: ap, top: p.cards, away: [] });
    expect(s.pending?.kind).toBe("searchLibrary");
    const q = s.pending as Extract<GameState["pending"], { kind: "searchLibrary" }>;
    s = act(s, { type: "searchLibrary", player: ap, found: reveal ? q.cards : [] });
    if (s.pending?.kind === "chooseOption") s = act(s, { type: "chooseOption", player: ap, choice: String(opp) });
    return settle(s);
  };
  it("whenever you attack: the creature card enters tapped and attacking; trample for a Dwarf and hexproof for an Elf, the new Elf counting (rulings)", () => {
    supported(doors());
    const { s: s0, ap, opp } = setup([]);
    s0.players[ap]!.hand = [];
    putOnBattlefield(s0, ap, doors());
    const d = putOnBattlefield(s0, ap, dwarf);
    const top = put(s0, ap, elf, "library");
    const s = attack(s0, ap, opp, d, true);
    expect(zone(s, top)).toBe("battlefield");
    const o = s.objects[top]!;
    expect(o.tapped).toBe(true);
    expect(o.attacking).toBeTruthy();
    expect(objHasKeyword(s, o, "Trample")).toBe(true);
    expect(objHasKeyword(s, o, "Hexproof")).toBe(true);
    // Not the attacker that was already there.
    expect(objHasKeyword(s, s.objects[d]!, "Trample")).toBe(false);
  });
  it("no Dwarf or Elf: neither keyword; not revealing leaves the card on top", () => {
    const { s: s0, ap, opp } = setup([]);
    s0.players[ap]!.hand = [];
    putOnBattlefield(s0, ap, doors());
    const a = putOnBattlefield(s0, ap, bear());
    const top = put(s0, ap, bear({ name: "Test Beast" }), "library");
    const s1 = attack(s0, ap, opp, a, true);
    expect(zone(s1, top)).toBe("battlefield");
    expect(objHasKeyword(s1, s1.objects[top]!, "Trample")).toBe(false);
    expect(objHasKeyword(s1, s1.objects[top]!, "Hexproof")).toBe(false);
    const { s: t0, ap: ap2, opp: opp2 } = setup([], 6);
    t0.players[ap2]!.hand = [];
    putOnBattlefield(t0, ap2, doors());
    const b = putOnBattlefield(t0, ap2, bear());
    const top2 = put(t0, ap2, elf, "library");
    const t = attack(t0, ap2, opp2, b, false);
    expect(zone(t, top2)).toBe("library");
    expect(t.players[ap2]!.library[0]).toBe(top2);
  });
});

describe("Back for Seconds: bargained, one returned card with mana value 4 or less may go onto the battlefield", () => {
  const big = bear({ name: "Test Giant", manaCost: "{5}{G}", cmc: 6 } as Partial<CardDef>);
  it("bargained: the chosen card enters, the other goes to the hand", () => {
    supported(backfor());
    const { s: s0, ap, ids } = setup([backfor()]);
    const small = put(s0, ap, bear(), "graveyard");
    const giant = put(s0, ap, big, "graveyard");
    const fodder = putOnBattlefield(s0, ap, card("Test Relic", "Artifact", "{1}"));
    const plan = planCast(s0, ap, ids[0]!, [tgt(small), tgt(giant)], undefined, undefined, undefined, { bargain: fodder });
    let s = run(s0, plan);
    expect(zone(s, fodder)).toBe("graveyard");
    s = settle(s);
    expect(s.pending?.kind).toBe("searchLibrary");
    const q = s.pending as Extract<GameState["pending"], { kind: "searchLibrary" }>;
    expect(q.cards).toEqual([small]);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [small] }));
    expect(zone(s, small)).toBe("battlefield");
    expect(zone(s, giant)).toBe("hand");
  });
  it("bargained, none chosen: both to the hand; not bargained: no choice", () => {
    const { s: s0, ap, ids } = setup([backfor()]);
    const small = put(s0, ap, bear(), "graveyard");
    const other = put(s0, ap, bear({ name: "Test Cub" }), "graveyard");
    const fodder = putOnBattlefield(s0, ap, card("Test Relic", "Artifact", "{1}"));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(small), tgt(other)], undefined, undefined, undefined, { bargain: fodder })));
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [] }));
    expect([zone(s, small), zone(s, other)]).toEqual(["hand", "hand"]);
    const { s: t0, ap: ap2, ids: ids2 } = setup([backfor()]);
    const a = put(t0, ap2, bear(), "graveyard");
    const t = settle(run(t0, planCast(t0, ap2, ids2[0]!, [tgt(a), { kind: "none" }])));
    expect(t.pending ?? null).toBeNull();
    expect(zone(t, a)).toBe("hand");
  });
});

describe("Plague Reaver: returns under the target opponent's control at the beginning of their next upkeep", () => {
  it("not at another player's upkeep; at that player's, under their control", () => {
    supported(plaguereav());
    const { s: s0, ap, opp } = setup([]);
    s0.players[ap]!.hand = [];
    const r = putOnBattlefield(s0, ap, plaguereav());
    put(s0, ap, bear(), "hand");
    put(s0, ap, bear(), "hand");
    // The opponent two seats on: the next player's upkeep comes first.
    const later = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    let s = settle(run(s0, planActivate(s0, ap, r, 0, [{ kind: "player", id: later }], undefined, undefined, undefined, { discard: s0.players[ap]!.hand.slice(0, 2) })));
    expect(zone(s, r)).toBe("graveyard");
    s = passUntil(s, "draw", opp);
    expect(zone(s, r)).toBe("graveyard");
    s = passUntil(s, "upkeep", later);
    s = settle(s);
    expect(zone(s, r)).toBe("battlefield");
    expect(controllerOf(s, s.objects[r]!)).toBe(later);
  });
});

describe("Conjurer's Mantle and Radagast the Brown: looks for cards that do or don't share a creature type", () => {
  const elf = bear({ name: "Test Elf", subtypes: ["Elf", "Warrior"], typeLine: "Creature — Elf Warrior" });
  const elfCard = card("Test Elf Lore", "Kindred Instant — Elf", "{G}");
  const goblin = bear({ name: "Test Goblin", subtypes: ["Goblin"], typeLine: "Creature — Goblin" });
  const plain = bear({ name: "Test Golem", subtypes: [], typeLine: "Creature" });
  /** The top six of the library: these, then forests. */
  const stack = (s: GameState, pid: PlayerId, defs: CardDef[]) => [...defs].reverse().map((d) => put(s, pid, d, "library")).reverse();
  it("Mantle: whenever equipped creature attacks, a card sharing a creature type with it (a Kindred card too) is offered", () => {
    supported(conjurers(), radagast());
    const { s: s0, ap, opp } = setup([]);
    s0.players[ap]!.hand = [];
    const m = putOnBattlefield(s0, ap, conjurers());
    const a = putOnBattlefield(s0, ap, elf);
    s0.objects[m]!.attachedTo = a;
    invalidateCharacteristics(s0);
    const [g, k, e] = stack(s0, ap, [goblin, elfCard, bear({ name: "Test Elf Two", subtypes: ["Elf"], typeLine: "Creature — Elf" })]);
    let s = passUntil(s0, "declareAttackers", ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] } as Action));
    expect(s.pending?.kind).toBe("searchLibrary");
    const q = s.pending as Extract<GameState["pending"], { kind: "searchLibrary" }>;
    expect([...q.cards].sort()).toEqual([k!, e!].sort());
    expect(q.cards).not.toContain(g);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [k!] }));
    expect(zone(s, k!)).toBe("hand");
  });
  it("Radagast: only creature cards sharing no creature type with your creatures (the entering one counts; none shared with no type at all); X is its mana value", () => {
    const { s: s0, ap, ids } = setup([{ ...elf, manaCost: "{2}{G}", cmc: 3 } as CardDef]);
    putOnBattlefield(s0, ap, radagast());
    // Radagast is an Avatar Wizard; the Elf Warrior entering counts too.
    const [w, g, p] = stack(s0, ap, [bear({ name: "Test Wizard", subtypes: ["Wizard"], typeLine: "Creature — Wizard" }), goblin, plain, bear({ name: "Test Elf Two", subtypes: ["Elf"], typeLine: "Creature — Elf" })]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    // The Elf costs {2}{G}: the top three cards.
    expect(s.pending?.kind).toBe("searchLibrary");
    const q = s.pending as Extract<GameState["pending"], { kind: "searchLibrary" }>;
    expect(q.cards).toEqual([g, p]);
    expect(q.dig?.looked).toEqual([w, g, p]);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [g!] }));
    expect(zone(s, g!)).toBe("hand");
  });
});

describe("Nine-Fingers Keene: a Gate from the top nine, then the rest into your hand with nine or more Gates", () => {
  const gate = card("Test Gate", "Land — Gate");
  /** Keene deals combat damage to the next player; returns the state at the pick. */
  const hit = (s0: GameState, ap: PlayerId, opp: PlayerId, k: string) => {
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: k, defender: opp }] } as Action);
    for (let i = 0; i < 40 && s.pending?.kind !== "searchLibrary"; i++) {
      if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: waitingOn(s)!, blocks: [] });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.pending?.kind).toBe("searchLibrary");
    return s;
  };
  it("the ninth Gate put onto the battlefield counts: the other eight cards go into your hand", () => {
    supported(ninefinger());
    const { s: s0, ap, opp } = setup([]);
    s0.players[ap]!.hand = [];
    const k = putOnBattlefield(s0, ap, ninefinger());
    for (let i = 0; i < 8; i++) putOnBattlefield(s0, ap, gate);
    const g = put(s0, ap, gate, "library");
    const top = s0.players[ap]!.library.slice(0, 9);
    let s = hit(s0, ap, opp, k);
    const q = s.pending as Extract<GameState["pending"], { kind: "searchLibrary" }>;
    expect(q.cards).toEqual([g]);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [g] }));
    expect(zone(s, g)).toBe("battlefield");
    expect(top.slice(1).every((id) => zone(s, id) === "hand")).toBe(true);
  });
  it("fewer than nine Gates: the rest go to the bottom", () => {
    const { s: s0, ap, opp } = setup([]);
    s0.players[ap]!.hand = [];
    const k = putOnBattlefield(s0, ap, ninefinger());
    for (let i = 0; i < 7; i++) putOnBattlefield(s0, ap, gate);
    const g = put(s0, ap, gate, "library");
    const top = s0.players[ap]!.library.slice(0, 9);
    let s = hit(s0, ap, opp, k);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [g] }));
    expect(zone(s, g)).toBe("battlefield");
    expect(s.players[ap]!.hand).toHaveLength(0);
    expect(s.players[ap]!.library.slice(-8).sort()).toEqual(top.slice(1).sort());
  });
});

describe("Puca's Covenant: a card with mana value up to the dead creature's counters, once each turn", () => {
  it("counts every kind of counter it had; not the card that died; only once each turn", () => {
    supported(pucas());
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, pucas());
    const a = putOnBattlefield(s0, ap, bear({ name: "Test Elder" }));
    s0.objects[a]!.counters = { charge: 1, "+1/+1": 1 };
    const b = putOnBattlefield(s0, ap, bear({ name: "Test Squire" }));
    s0.objects[b]!.counters = { charge: 3 };
    invalidateCharacteristics(s0);
    const two = put(s0, ap, bear({ name: "Test Two" }), "graveyard");
    const three = put(s0, ap, bear({ name: "Test Three", manaCost: "{2}{G}", cmc: 3 } as Partial<CardDef>), "graveyard");
    const killer = putOnBattlefield(s0, s0.turnOrder.find((p) => p !== ap)!, bear());
    let s = s0;
    dealDamage(s, objectSource(s, s.objects[killer]!), { object: s.objects[a]! }, 5);
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(s.pending?.kind).toBe("chooseTargets");
    // Two counters: not the 3-drop, nor Test Elder itself (now a card in the graveyard).
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(three)] })).toThrow();
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(a)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(two)] }));
    expect(s.pending?.kind).toBe("chooseMay");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(zone(s, two)).toBe("hand");
    // The second death this turn: done already.
    dealDamage(s, objectSource(s, s.objects[killer]!), { object: s.objects[b]! }, 5);
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(s.pending?.kind).not.toBe("chooseTargets");
    expect(zone(s, three)).toBe("graveyard");
  });
});

describe("Kamiz, Obscura Oculus: the target connives, then another attacker with lesser power gains double strike", () => {
  it("lesser than the target's power after it connived; the target itself and bigger attackers aren't offered", () => {
    supported(kamiz());
    const { s: s0, ap, opp } = setup([]);
    s0.players[ap]!.hand = [];
    putOnBattlefield(s0, ap, kamiz());
    const a = putOnBattlefield(s0, ap, bear({ name: "Test Two" }));
    const b = putOnBattlefield(s0, ap, bear({ name: "Test Small", power: "1" }));
    const c = putOnBattlefield(s0, ap, bear({ name: "Test Even", power: "3" }));
    // Conniving draws this nonland card, discarded: a +1/+1 counter makes the target 3/3.
    put(s0, ap, bear({ name: "Test Drawn" }), "library");
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [a, b, c].map((attacker) => ({ attacker, defender: opp })) } as Action);
    s = settle(s);
    expect(s.pending?.kind).toBe("chooseTargets");
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(a)] }));
    // The only card in hand, drawn and discarded: a nonland card, so a +1/+1 counter.
    expect(s.objects[a]!.counters["+1/+1"]).toBe(1);
    // Test Even (3) isn't less than the target's 3 now; only Test Small, chosen as the only one.
    expect(objHasKeyword(s, s.objects[b]!, "Double strike")).toBe(true);
    expect(objHasKeyword(s, s.objects[c]!, "Double strike")).toBe(false);
    expect(objHasKeyword(s, s.objects[a]!, "Double strike")).toBe(false);
  });
  it("two smaller attackers: you choose one of them", () => {
    const { s: s0, ap, opp } = setup([]);
    s0.players[ap]!.hand = [];
    putOnBattlefield(s0, ap, kamiz());
    const a = putOnBattlefield(s0, ap, bear({ name: "Test Big", power: "4" }));
    const b = putOnBattlefield(s0, ap, bear({ name: "Test Small", power: "1" }));
    const c = putOnBattlefield(s0, ap, bear({ name: "Test Mid" }));
    put(s0, ap, forestCard, "library");
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [a, b, c].map((attacker) => ({ attacker, defender: opp })) } as Action);
    s = settle(act(settle(s), { type: "chooseTargets", player: ap, targets: [tgt(a)] }));
    expect(s.pending?.kind).toBe("pickPermanents");
    const q = s.pending as Extract<GameState["pending"], { kind: "pickPermanents" }>;
    expect([...q.options].sort()).toEqual([b, c].sort());
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [c] }));
    expect(objHasKeyword(s, s.objects[c]!, "Double strike")).toBe(true);
    expect(objHasKeyword(s, s.objects[b]!, "Double strike")).toBe(false);
  });
});
