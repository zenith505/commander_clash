// Round 294: from the top of the popularity list, names no earlier round looked at.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, applyAction, botActions, characteristics, controllerOf, isFullySupported, planActivate, planCast, power, toughness, waitingOn, invalidateCharacteristics, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";
import { cardSource, dealDamage, objectSource } from "../src/damage";
import { nextRandom } from "../src/rng";
import { isLegalTarget } from "../src/effects/targeting";

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
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
/** A fresh copy of `def` on top of `pid`'s library. */
const onTop = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  invalidateCharacteristics(s);
  return id;
};
const inHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};

// Real oracle text (Scryfall).
const skillborro = (): CardDef => ({"oracleId":"9e862e4a-254d-4d39-b2cf-4beed6db761f","name":"Skill Borrower","manaCost":"{2}{U}","cmc":3,"typeLine":"Artifact Creature — Human Wizard","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Human","Wizard"],"oracleText":"Play with the top card of your library revealed.\nAs long as the top card of your library is an artifact or creature card, this creature has all activated abilities of that card. (If any of the abilities use that card's name, use this creature's name instead.)","power":"1","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/c/ac7ac7c8-8e01-4f80-a3fa-d533cb594d7c.jpg?1783942571","artUrl":"https://cards.scryfall.io/art_crop/front/a/c/ac7ac7c8-8e01-4f80-a3fa-d533cb594d7c.jpg?1783942571","commanderLegal":"legal","set":"ala","releasedAt":"2008-10-03","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const brinehag = (): CardDef => ({"oracleId":"e0165326-f1a6-4fc0-94c1-4b33f24d36f5","name":"Brine Hag","manaCost":"{2}{U}{U}","cmc":4,"typeLine":"Creature — Hag","supertypes":[],"types":["Creature"],"subtypes":["Hag"],"oracleText":"When this creature dies, the base power and toughness of each creature that dealt damage to it this turn become 0/2. (This effect lasts indefinitely.)","power":"2","toughness":"2","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/a/2a1e7796-fbfb-4976-879f-bb748429d5c7.jpg?1783948077","artUrl":"https://cards.scryfall.io/art_crop/front/2/a/2a1e7796-fbfb-4976-879f-bb748429d5c7.jpg?1783948077","commanderLegal":"legal","set":"leg","releasedAt":"1994-06-01","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const blazingeff = (): CardDef => ({"oracleId":"7879b37c-5e2a-4945-9378-47744b715a6c","name":"Blazing Effigy","manaCost":"{1}{R}","cmc":2,"typeLine":"Creature — Elemental","supertypes":[],"types":["Creature"],"subtypes":["Elemental"],"oracleText":"When this creature dies, it deals X damage to target creature, where X is 3 plus the amount of damage dealt to this creature this turn by other sources named Blazing Effigy.","power":"0","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/2/921011ff-1696-4575-9198-abe993a0ee7a.jpg?1783948060","artUrl":"https://cards.scryfall.io/art_crop/front/9/2/921011ff-1696-4575-9198-abe993a0ee7a.jpg?1783948060","commanderLegal":"legal","set":"leg","releasedAt":"1994-06-01","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const giantalbat = (): CardDef => ({"oracleId":"8b59cacb-46ff-4400-a7f6-b258c81a9b14","name":"Giant Albatross","manaCost":"{1}{U}","cmc":2,"typeLine":"Creature — Bird","supertypes":[],"types":["Creature"],"subtypes":["Bird"],"oracleText":"Flying\nWhen this creature dies, you may pay {1}{U}. If you do, for each creature that dealt damage to this creature this turn, destroy that creature unless its controller pays 2 life. A creature destroyed this way can't be regenerated.","power":"1","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/b/c/bce05870-74d3-43f1-92d0-dc1744c0138d.jpg?1783947298","artUrl":"https://cards.scryfall.io/art_crop/front/b/c/bce05870-74d3-43f1-92d0-dc1744c0138d.jpg?1783947298","commanderLegal":"legal","set":"hml","releasedAt":"1995-10-01","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const ydwenefree = (): CardDef => ({"oracleId":"15b9b0cc-47ef-4147-aba7-a7adae41921b","name":"Ydwen Efreet","manaCost":"{R}{R}{R}","cmc":3,"typeLine":"Creature — Efreet","supertypes":[],"types":["Creature"],"subtypes":["Efreet"],"oracleText":"Whenever this creature blocks, flip a coin. If you lose the flip, remove this creature from combat and it can't block this turn. Creatures it was blocking that had become blocked by only this creature this combat become unblocked.","power":"3","toughness":"6","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/f/efdba2a9-d171-45ed-8dd4-9d0046128f68.jpg?1783948382","artUrl":"https://cards.scryfall.io/art_crop/front/e/f/efdba2a9-d171-45ed-8dd4-9d0046128f68.jpg?1783948382","commanderLegal":"legal","set":"arn","releasedAt":"1993-12-17","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const autumnwill = (): CardDef => ({"oracleId":"c8c868f8-19a5-4cc5-b769-aa382f7b97ad","name":"Autumn Willow","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Legendary Creature — Avatar","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Avatar"],"oracleText":"Shroud (This creature can't be the target of spells or abilities.)\n{G}: Until end of turn, Autumn Willow can be the target of spells and abilities controlled by target player as though it didn't have shroud.","power":"4","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":["Shroud"],"imageUrl":"https://cards.scryfall.io/normal/front/c/e/cea60340-bbdb-48e2-94a6-5ac1197e978a.jpg?1783947281","artUrl":"https://cards.scryfall.io/art_crop/front/c/e/cea60340-bbdb-48e2-94a6-5ac1197e978a.jpg?1783947281","commanderLegal":"legal","set":"hml","releasedAt":"1995-10-01","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const shapeshift = (): CardDef => ({"oracleId":"a5a2d17d-5759-46fb-8e44-694bd3b72f5d","name":"Shapeshifter's Marrow","manaCost":"{2}{U}{U}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of each opponent's upkeep, that player reveals the top card of their library. If it's a creature card, the player puts the card into their graveyard and this enchantment becomes a copy of that card. (If it does, it loses this ability.)","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/8/48cb3fa8-555f-4df6-994e-cf01896f7470.jpg?1783943116","artUrl":"https://cards.scryfall.io/art_crop/front/4/8/48cb3fa8-555f-4df6-994e-cf01896f7470.jpg?1783943116","commanderLegal":"legal","set":"fut","releasedAt":"2007-05-04","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const strugglefo = (): CardDef => ({"oracleId":"5c0f63ad-4bb1-479e-9760-5421265da40b","name":"Struggle for Sanity","manaCost":"{2}{B}{B}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target opponent reveals their hand. That player exiles a card from it, then you exile a card from it. Repeat this process until all cards in that hand have been exiled. That player returns the cards they exiled this way to their hand and puts the rest into their graveyard.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/a/ba827c43-5dd5-471f-83b2-cb5428fcd063.jpg?1783944307","artUrl":"https://cards.scryfall.io/art_crop/front/b/a/ba827c43-5dd5-471f-83b2-cb5428fcd063.jpg?1783944307","commanderLegal":"legal","set":"chk","releasedAt":"2004-10-01","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const nullsummon = (): CardDef => ({"oracleId":"56c412be-daab-4461-931f-1e2ea8ecd75d","name":"Null Summoner","manaCost":"{2}{U}{B}","cmc":4,"typeLine":"Creature — Human Warlock","supertypes":[],"types":["Creature"],"subtypes":["Human","Warlock"],"oracleText":"When this creature enters, if you cast it, target opponent reveals their hand. You choose a nonland card from it. Exile that card.\nThreshold — As long as there are seven or more cards in your graveyard, you may cast the exiled card, and mana of any type can be spent to cast that spell.","power":"4","toughness":"2","colors":["B","U"],"colorIdentity":["B","U"],"keywords":["Threshold"],"imageUrl":"https://cards.scryfall.io/normal/front/3/a/3afdc75a-1bf5-4f2f-84eb-d82f77a095cd.jpg?1789127648","artUrl":"https://cards.scryfall.io/art_crop/front/3/a/3afdc75a-1bf5-4f2f-84eb-d82f77a095cd.jpg?1789127648","commanderLegal":"legal","set":"fra","releasedAt":"2026-10-02","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const voltaicvis = (): CardDef => ({"oracleId":"8ffe9e3f-fd9f-4d8b-9467-4cd301e3c8b4","name":"Voltaic Visionary // Volt-Charged Berserker","manaCost":"{1}{R}","cmc":2,"typeLine":"Creature — Human Wizard // Creature — Human Berserker","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"{T}: This creature deals 2 damage to you. Exile the top card of your library. You may play that card this turn. Activate only as a sorcery.\nWhen you play a card exiled with this creature, transform this creature.","power":"3","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":["Transform"],"imageUrl":"https://cards.scryfall.io/normal/front/1/f/1f626db8-58ea-4d1c-a034-2305dac4ae6e.jpg?1783924197","artUrl":"https://cards.scryfall.io/art_crop/front/1/f/1f626db8-58ea-4d1c-a034-2305dac4ae6e.jpg?1783924197","commanderLegal":"legal","set":"dbl","releasedAt":"2022-01-28","rarity":"uncommon","layout":"transform","gameChanger":false,"faces":[{"name":"Voltaic Visionary","manaCost":"{1}{R}","typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"{T}: This creature deals 2 damage to you. Exile the top card of your library. You may play that card this turn. Activate only as a sorcery.\nWhen you play a card exiled with this creature, transform this creature.","power":"3","toughness":"1","colors":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/1/f/1f626db8-58ea-4d1c-a034-2305dac4ae6e.jpg?1783924197","artUrl":"https://cards.scryfall.io/art_crop/front/1/f/1f626db8-58ea-4d1c-a034-2305dac4ae6e.jpg?1783924197"},{"name":"Volt-Charged Berserker","manaCost":"","typeLine":"Creature — Human Berserker","supertypes":[],"types":["Creature"],"subtypes":["Human","Berserker"],"oracleText":"This creature can't block.","power":"4","toughness":"3","colors":["R"],"colorIndicator":["R"],"imageUrl":"https://cards.scryfall.io/normal/back/1/f/1f626db8-58ea-4d1c-a034-2305dac4ae6e.jpg?1783924197","artUrl":"https://cards.scryfall.io/art_crop/back/1/f/1f626db8-58ea-4d1c-a034-2305dac4ae6e.jpg?1783924197"}]} as CardDef);

/** Sets the game's random state so the next flips come out as `wins` (true: won). */
function rig(s: GameState, ...wins: boolean[]) {
  for (let x = 1; x < 1_000_000; x++) {
    const r = { rngState: x };
    if (wins.every((w) => nextRandom(r) < 0.5 === w)) {
      s.rngState = x;
      return;
    }
  }
  throw new Error("no such state");
}

describe("Skill Borrower: the activated abilities of the artifact or creature card on top of your library", () => {
  const fanatic = card("Mogg Fanatic", "Creature — Goblin", "{R}", { power: "1", toughness: "1", oracleText: "Sacrifice Mogg Fanatic: It deals 1 damage to any target." });
  const rod = card("Test Rod", "Artifact", "{2}", { oracleText: "{T}: Test Rod deals 1 damage to target player." });
  const sorcery = card("Test Sorcery", "Sorcery", "{R}", { oracleText: "Test Sorcery deals 2 damage to any target." });
  it("a creature card's: sacrificing ~ means sacrificing Skill Borrower (rulings: its name is this creature's)", () => {
    supported(skillborro());
    const { s: s0, ap, opp } = setup([]);
    const sb = putOnBattlefield(s0, ap, skillborro());
    onTop(s0, ap, fanatic);
    expect(abilitiesOf(s0, s0.objects[sb]!).activated).toHaveLength(1);
    const life = s0.players[opp]!.life;
    const s = settle(run(s0, planActivate(s0, ap, sb, 0, [{ kind: "player", id: opp }])));
    expect(zone(s, sb)).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(life - 1);
  });
  it("an artifact card's too, its {T} tapping Skill Borrower; nothing from a sorcery or a land on top", () => {
    const { s: s0, ap, opp } = setup([]);
    const sb = putOnBattlefield(s0, ap, skillborro());
    onTop(s0, ap, sorcery);
    expect(abilitiesOf(s0, s0.objects[sb]!).activated).toHaveLength(0);
    onTop(s0, ap, rod);
    expect(abilitiesOf(s0, s0.objects[sb]!).activated).toHaveLength(1);
    const life = s0.players[opp]!.life;
    const s = settle(run(s0, planActivate(s0, ap, sb, 0, [{ kind: "player", id: opp }])));
    expect(s.objects[sb]!.tapped).toBe(true);
    expect(s.players[opp]!.life).toBe(life - 1);
  });
});

describe("Brine Hag: the creatures that dealt damage to it this turn become 0/2", () => {
  it("each creature that damaged it, as it dies, has base power and toughness 0/2 for good; others don't", () => {
    supported(brinehag());
    const { s: s0, ap, opp } = setup([]);
    const hag = putOnBattlefield(s0, ap, brinehag());
    const a = putOnBattlefield(s0, opp, bear());
    const b = putOnBattlefield(s0, opp, bear({ name: "Other Bear" }));
    const c = putOnBattlefield(s0, opp, bear({ name: "Third Bear" }));
    dealDamage(s0, objectSource(s0, s0.objects[a]!), { object: s0.objects[hag]! }, 1);
    dealDamage(s0, objectSource(s0, s0.objects[b]!), { object: s0.objects[hag]! }, 1);
    let s = settle(s0);
    expect(zone(s, hag)).toBe("graveyard");
    expect(pt(s, a)).toBe("0/2");
    expect(pt(s, b)).toBe("0/2");
    expect(pt(s, c)).toBe("2/2");
    // Indefinitely: still so next turn.
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(s.activePlayer) + 1) % s.turnOrder.length]);
    expect(pt(s, a)).toBe("0/2");
  });
  it("damage from a spell, or from a creature that left and came back, doesn't count (CR 400.7)", () => {
    const { s: s0, ap, opp } = setup([]);
    const hag = putOnBattlefield(s0, ap, brinehag());
    const a = putOnBattlefield(s0, opp, bear());
    dealDamage(s0, { ...cardSource(card("Test Shock", "Instant", "{R}"), opp), spell: true }, { object: s0.objects[hag]! }, 1);
    dealDamage(s0, objectSource(s0, s0.objects[a]!), { object: s0.objects[hag]! }, 1);
    s0.objects[a]!.zoneChanges = (s0.objects[a]!.zoneChanges ?? 0) + 2; // it left and returned: a new object
    const s = settle(s0);
    expect(zone(s, hag)).toBe("graveyard");
    expect(pt(s, a)).toBe("2/2");
  });
});

describe("Blazing Effigy: 3 damage plus what other Blazing Effigies dealt to it this turn", () => {
  it("one dying deals 3 to another Effigy, which then dies and deals 6 (3 plus 3)", () => {
    supported(blazingeff());
    const { s: s0, ap, opp } = setup([]);
    const e1 = putOnBattlefield(s0, ap, blazingeff());
    const e2 = putOnBattlefield(s0, ap, blazingeff());
    const big = putOnBattlefield(s0, opp, bear({ name: "Big Bear", power: "1", toughness: "9" }));
    dealDamage(s0, objectSource(s0, s0.objects[big]!), { object: s0.objects[e1]! }, 1);
    s0.objects[e1]!.damage = 3;
    let s = settle(s0);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(e2)] }));
    expect(zone(s, e2)).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(big)] }));
    expect(s.objects[big]!.damage).toBe(6);
  });
  it("damage from sources with other names doesn't add: 3", () => {
    const { s: s0, ap, opp } = setup([]);
    const e1 = putOnBattlefield(s0, ap, blazingeff());
    const big = putOnBattlefield(s0, opp, bear({ name: "Big Bear", power: "3", toughness: "9" }));
    dealDamage(s0, objectSource(s0, s0.objects[big]!), { object: s0.objects[e1]! }, 3);
    let s = settle(s0);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(big)] }));
    expect(s.objects[big]!.damage).toBe(3);
  });
});

/** The player `n` seats to `pid`'s left (turn order goes to each player's left, CR 101.4). */
const leftOf = (s: GameState, pid: PlayerId, n = 1) => s.turnOrder[(s.turnOrder.indexOf(pid) + n) % s.turnOrder.length]!;
/** Passes priority (no attacks or blocks) until `done`. */
const until = (s: GameState, done: (s: GameState) => boolean, max = 400) => {
  for (let i = 0; i < max; i++) {
    if (done(s)) return s;
    const pid = waitingOn(s)!;
    if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (s.pending?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (s.pending?.kind === "discardToHandSize") s = act(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, s.pending.count) });
    else s = act(s, { type: "passPriority", player: pid });
  }
  throw new Error("never got there");
};

describe("Ydwen Efreet: a lost flip as it blocks removes it from combat, and what only it blocked is unblocked", () => {
  const block = (lose: boolean, second?: boolean) => {
    const { s: s0, ap } = setup([]);
    const opp = leftOf(s0, ap);
    const att = putOnBattlefield(s0, ap, bear({ name: "Test Attacker", power: "4", toughness: "4" }));
    const y = putOnBattlefield(s0, opp, ydwenefree());
    const other = second ? putOnBattlefield(s0, opp, bear({ name: "Test Wall", power: "0", toughness: "9" })) : undefined;
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: att, defender: opp }] } as Action);
    s = until(s, (x) => x.pending?.kind === "declareBlockers");
    rig(s, !lose);
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: y, attacker: att }, ...(other ? [{ blocker: other, attacker: att }] : [])] } as Action);
    return { s, ap, opp, att, y, other };
  };
  it("lost: removed from combat, can't block this turn, and the attacker deals its damage to the player", () => {
    supported(ydwenefree());
    const r = block(true);
    const life = r.s.players[r.opp]!.life;
    let s = until(r.s, (x) => x.step === "combatDamage" || x.step === "endCombat" || x.step === "end");
    expect(s.objects[r.y]!.blocking).toBeUndefined();
    expect(characteristics(s, s.objects[r.y]!).cantBlock).toBeTruthy();
    s = until(s, (x) => x.step === "end");
    expect(s.players[r.opp]!.life).toBe(life - 4);
    expect(s.objects[r.y]!.damage).toBe(0);
  });
  it("won: it keeps blocking, and the attacker deals its damage to it", () => {
    const r = block(false);
    const life = r.s.players[r.opp]!.life;
    const s = until(r.s, (x) => x.step === "end");
    expect(s.players[r.opp]!.life).toBe(life);
    expect(s.objects[r.y]!.damage).toBe(4);
  });
  it("lost while another creature also blocks: the attacker stays blocked (CR 506.4)", () => {
    const r = block(true, true);
    const life = r.s.players[r.opp]!.life;
    const s = until(r.s, (x) => x.step === "end");
    expect(s.players[r.opp]!.life).toBe(life);
    expect(s.objects[r.other!]!.damage).toBe(4);
  });
});

describe("Autumn Willow: shroud waived for one player's spells and abilities until end of turn", () => {
  const spec = { kind: "object" as const, types: ["Creature"], notTypes: [], notColors: [], text: "creature" };
  it("{G}: the target player can target it this turn, others can't, and it's over at the cleanup step", () => {
    supported(autumnwill());
    const { s: s0, ap, opp } = setup([]);
    const w = putOnBattlefield(s0, ap, autumnwill());
    const third = leftOf(s0, ap, 2);
    expect(isLegalTarget(s0, spec, tgt(w), opp)).toBe(false);
    expect(isLegalTarget(s0, spec, tgt(w), ap)).toBe(false); // not even its controller (CR 702.18a)
    s0.players[ap]!.manaPool.G = 1;
    let s = settle(run(s0, planActivate(s0, ap, w, 0, [{ kind: "player", id: opp }])));
    expect(isLegalTarget(s, spec, tgt(w), opp)).toBe(true);
    expect(isLegalTarget(s, spec, tgt(w), third)).toBe(false);
    expect(isLegalTarget(s, spec, tgt(w), ap)).toBe(false);
    s = until(s, (x) => x.activePlayer !== ap);
    expect(isLegalTarget(s, spec, tgt(w), opp)).toBe(false);
  });
});

describe("Shapeshifter's Marrow: a creature card revealed in an opponent's upkeep goes to the graveyard and Marrow copies it", () => {
  it("a creature card: into its owner's graveyard, and Marrow becomes a copy of it for good (no longer an enchantment)", () => {
    supported(shapeshift());
    const { s: s0, ap, opp } = setup([]);
    const m = putOnBattlefield(s0, ap, shapeshift());
    const top = onTop(s0, opp, bear({ name: "Test Lion", power: "3", toughness: "3" }));
    let s = passUntil(s0, "upkeep", opp);
    s = settle(s);
    expect(zone(s, top)).toBe("graveyard");
    const c = characteristics(s, s.objects[m]!);
    expect(c.name).toBe("Test Lion");
    expect(c.types).toEqual(["Creature"]);
    expect(pt(s, m)).toBe("3/3");
    // For good, and the copy has no Marrow trigger any more.
    s = passUntil(s, "upkeep", leftOf(s, opp));
    expect(characteristics(s, s.objects[m]!).name).toBe("Test Lion");
    expect(s.stack).toHaveLength(0);
  });
  it("a noncreature card stays on top and Marrow stays an enchantment (rulings); not in your own upkeep", () => {
    const { s: s0, ap, opp } = setup([]);
    const m = putOnBattlefield(s0, ap, shapeshift());
    const top = onTop(s0, opp, card("Test Sorcery", "Sorcery", "{R}", { oracleText: "Draw a card." }));
    let s = settle(passUntil(s0, "upkeep", opp));
    expect(zone(s, top)).toBe("library");
    expect(s.players[opp]!.library[0]).toBe(top);
    expect(characteristics(s, s.objects[m]!).types).toEqual(["Enchantment"]);
  });
});

describe("Giant Albatross: pay {1}{U} as it dies, then each creature that damaged it is destroyed unless its controller pays 2 life", () => {
  const dies = () => {
    const { s: s0, ap, opp } = setup([]);
    const third = leftOf(s0, ap, 2);
    const g = putOnBattlefield(s0, ap, giantalbat());
    const a = putOnBattlefield(s0, opp, bear({ name: "Test First" }));
    const b = putOnBattlefield(s0, third, bear({ name: "Test Second" }));
    const c = putOnBattlefield(s0, opp, bear({ name: "Test Bystander" }));
    dealDamage(s0, objectSource(s0, s0.objects[a]!), { object: s0.objects[g]! }, 1);
    dealDamage(s0, objectSource(s0, s0.objects[b]!), { object: s0.objects[g]! }, 1);
    s0.players[ap]!.manaPool.U = 2;
    return { s: settle(s0), ap, opp, third, g, a, b, c };
  };
  it("paid: each controller in turn chooses; one pays 2 life, the other's creature is destroyed (no regeneration)", () => {
    supported(giantalbat());
    const r = dies();
    let s = r.s;
    expect(zone(s, r.g)).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: r.ap });
    s = act(s, { type: "chooseMay", player: r.ap, yes: true });
    s.objects[r.b]!.regenShields = 1;
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: r.opp, what: "payLifeOrDestroy", about: r.a });
    const life = s.players[r.opp]!.life;
    s = act(s, { type: "chooseOption", player: r.opp, choice: "pay" });
    expect(s.players[r.opp]!.life).toBe(life - 2);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: r.third, what: "payLifeOrDestroy", about: r.b });
    s = settle(act(s, { type: "chooseOption", player: r.third, choice: "none" }));
    expect(zone(s, r.a)).toBe("battlefield");
    expect(zone(s, r.b)).toBe("graveyard");
    expect(zone(s, r.c)).toBe("battlefield");
  });
  it("not paid: nothing happens; a player with less than 2 life isn't asked and can't pay (CR 119.4)", () => {
    const r = dies();
    let s = settle(act(r.s, { type: "chooseMay", player: r.ap, yes: false }));
    expect(zone(s, r.a)).toBe("battlefield");
    expect(zone(s, r.b)).toBe("battlefield");
    const r2 = dies();
    r2.s.players[r2.third]!.life = 1;
    s = act(r2.s, { type: "chooseMay", player: r2.ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: r2.opp, about: r2.a });
    s = settle(act(s, { type: "chooseOption", player: r2.opp, choice: "pay" }));
    expect(s.pending).toBeNull();
    expect(zone(s, r2.a)).toBe("battlefield");
    expect(zone(s, r2.b)).toBe("graveyard");
    expect(s.players[r2.third]!.life).toBe(1);
  });
  it("bots decide for their own creatures", () => {
    const r = dies();
    let s = act(r.s, { type: "chooseMay", player: r.ap, yes: true });
    for (let i = 0; i < 5 && s.pending?.kind === "chooseOption"; i++) s = settle(run(s, botActions(s, s.pending.player)));
    expect(s.pending).toBeNull();
  });
});

describe("Struggle for Sanity: the opponent and you take turns exiling cards from their hand", () => {
  it("they exile first, you next, until the hand is empty; theirs go back to their hand, yours to their graveyard", () => {
    supported(strugglefo());
    const { s: s0, ap, opp } = setup([]);
    const p = s0.players[ap]!;
    p.hand = [];
    const sp = inHand(s0, ap, strugglefo());
    s0.players[opp]!.hand = [];
    const h = ["Test A", "Test B", "Test C"].map((n) => inHand(s0, opp, bear({ name: n })));
    p.manaPool.B = 4;
    let s = settle(run(s0, planCast(s0, ap, sp, [{ kind: "player", id: opp }])));
    if (s.pending?.kind === "lookAtHand" as string) s = act(s, { type: "acknowledge", player: ap } as unknown as Action);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: opp, what: "struggleExile" });
    s = act(s, { type: "chooseOption", player: opp, choice: h[1]! });
    expect(zone(s, h[1]!)).toBe("exile");
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "struggleExile", options: [h[0], h[2]] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: h[2]! }));
    // The last card goes to them without a choice.
    expect(s.pending).toBeNull();
    expect(zone(s, h[1]!)).toBe("hand");
    expect(zone(s, h[0]!)).toBe("hand");
    expect(zone(s, h[2]!)).toBe("graveyard");
    expect(zone(s, sp)).toBe("graveyard");
  });
  it("an empty hand: nothing to do; bots pick for themselves", () => {
    const { s: s0, ap, opp } = setup([]);
    const p = s0.players[ap]!;
    p.hand = [];
    const sp = inHand(s0, ap, strugglefo());
    s0.players[opp]!.hand = [];
    p.manaPool.B = 4;
    let s = settle(run(s0, planCast(s0, ap, sp, [{ kind: "player", id: opp }])));
    expect(s.pending).toBeNull();
    expect(zone(s, sp)).toBe("graveyard");
    const { s: t0, ap: ap2, opp: opp2 } = setup([]);
    t0.players[ap2]!.hand = [];
    const sp2 = inHand(t0, ap2, strugglefo());
    t0.players[opp2]!.hand = [];
    const h = ["Test A", "Test B", "Test C", "Test D"].map((n) => inHand(t0, opp2, bear({ name: n })));
    t0.players[ap2]!.manaPool.B = 4;
    let t = settle(run(t0, planCast(t0, ap2, sp2, [{ kind: "player", id: opp2 }])));
    for (let i = 0; i < 6 && t.pending?.kind === "chooseOption"; i++) t = settle(run(t, botActions(t, t.pending.player)));
    expect(t.pending).toBeNull();
    expect(h.filter((id) => zone(t, id) === "hand")).toHaveLength(2);
    expect(h.filter((id) => zone(t, id) === "graveyard")).toHaveLength(2);
  });
});

describe("Null Summoner: with threshold, you may cast the card its enters ability exiled, with mana of any type", () => {
  it("cast: it exiles a nonland card from the opponent's hand; castable only with seven or more cards in your graveyard", () => {
    supported(nullsummon());
    const { s: s0, ap, opp } = setup([]);
    const p = s0.players[ap]!;
    p.hand = [];
    const ns = inHand(s0, ap, nullsummon());
    s0.players[opp]!.hand = [];
    const bolt = inHand(s0, opp, card("Test Bolt", "Instant", "{R}", { oracleText: "Test Bolt deals 3 damage to any target." }));
    const land = inHand(s0, opp, card("Test Land", "Land"));
    Object.assign(p.manaPool, { U: 1, B: 1, C: 2 });
    let s = settle(run(s0, planCast(s0, ap, ns)));
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, cards: [bolt] });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [bolt] }));
    s = until(s, (x) => waitingOn(x) === ap && !x.stack.length);
    expect(zone(s, bolt)).toBe("exile");
    expect(zone(s, land)).toBe("hand");
    s.players[ap]!.manaPool.U = 1;
    expect(planCast(s, ap, bolt, [{ kind: "player", id: opp }])).toBeNull();
    // Threshold: seven cards in your graveyard; blue mana pays its {R} (CR 609.4b).
    for (let i = 0; i < 7; i++) {
      const id = inHand(s, ap, card(`Test Filler ${i}`, "Sorcery", "{1}"));
      s.players[ap]!.hand.splice(s.players[ap]!.hand.indexOf(id), 1);
      s.objects[id]!.zone = "graveyard";
      s.players[ap]!.graveyard.push(id);
    }
    invalidateCharacteristics(s);
    const life = s.players[opp]!.life;
    s = settle(run(s, planCast(s, ap, bolt, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(zone(s, bolt)).toBe("graveyard");
  });
  it("put onto the battlefield without being cast: no trigger", () => {
    const { s: s0, ap, opp } = setup([]);
    s0.players[opp]!.hand = [];
    inHand(s0, opp, card("Test Bolt", "Instant", "{R}", { oracleText: "Test Bolt deals 3 damage to any target." }));
    putOnBattlefield(s0, ap, nullsummon());
    const s = settle(s0);
    expect(s.pending).toBeNull();
    expect(s.players[opp]!.hand).toHaveLength(1);
  });
});

describe("Voltaic Visionary: playing a card it exiled transforms it", () => {
  const start = (top: CardDef) => {
    const { s: s0, ap, opp } = setup([]);
    s0.players[ap]!.hand = [];
    const v = putOnBattlefield(s0, ap, voltaicvis());
    const t = onTop(s0, ap, top);
    const life = s0.players[ap]!.life;
    const s = settle(run(s0, planActivate(s0, ap, v, 0)));
    expect(s.players[ap]!.life).toBe(life - 2);
    expect(zone(s, t)).toBe("exile");
    return { s, ap, opp, v, t };
  };
  it("a land it exiled, played this turn: it transforms into Volt-Charged Berserker", () => {
    supported(voltaicvis());
    const r = start(card("Test Land", "Land", "", { oracleText: "{T}: Add {C}." }));
    let s = act(r.s, { type: "playLand", player: r.ap, objectId: r.t } as Action);
    expect(zone(s, r.t)).toBe("battlefield");
    s = settle(s);
    expect(characteristics(s, s.objects[r.v]!).name).toBe("Volt-Charged Berserker");
  });
  it("a spell it exiled: it transforms before the spell resolves (rulings)", () => {
    const r = start(card("Test Bolt", "Instant", "{R}", { oracleText: "Test Bolt deals 3 damage to any target." }));
    r.s.players[r.ap]!.manaPool.R = 1;
    let s = run(r.s, planCast(r.s, r.ap, r.t, [{ kind: "player", id: r.opp }]));
    expect(s.stack.length + s.triggerQueue.length).toBe(2);
    for (let i = 0; i < 12 && (s.triggerQueue.length || s.stack.length > 1); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(characteristics(s, s.objects[r.v]!).name).toBe("Volt-Charged Berserker");
    expect(zone(s, r.t)).toBe("stack");
  });
  it("a card exiled some other way doesn't transform it; nor does a card from the hand", () => {
    const { s: s0, ap } = setup([]);
    s0.players[ap]!.hand = [];
    const v = putOnBattlefield(s0, ap, voltaicvis());
    const l = inHand(s0, ap, card("Test Land", "Land", "", { oracleText: "{T}: Add {C}." }));
    const s = settle(act(s0, { type: "playLand", player: ap, objectId: l } as Action));
    expect(characteristics(s, s.objects[v]!).name).toBe("Voltaic Visionary");
  });
});
