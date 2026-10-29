// Round 208: "Draw four cards. When you do, ..." (The Royal Scions).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, scry, setup } from "./helpers";
import { applyAction, botActions, characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, power, runStateBasedActions, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Everyone passes until the stack is empty, answering "you may" with `may` and trigger targets with `targets`; stops at any other question. */
const settle = (s: GameState, opts: { may?: boolean; targets?: TargetChoice[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: opts.may ?? true });
    else if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets ?? [] });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const attack = (s: GameState, ap: PlayerId, defender: PlayerId, attackers: ObjectId[]) => {
  s = passUntil(s, "declareAttackers", ap);
  return act(s, { type: "declareAttackers", player: ap, attacks: attackers.map((attacker) => ({ attacker, defender })) });
};
const emptyHand = (s: GameState, pid: PlayerId) => {
  for (const id of s.players[pid]!.hand.splice(0)) {
    s.objects[id]!.zone = "library";
    s.players[pid]!.library.push(id);
  }
};
const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name === name);
const kill = card("Test Kill", "Instant", "{B}", { cmc: 1, oracleText: "Destroy target creature." });
const rock = (n = "Test Rock") => card(n, "Artifact", "{2}", { cmc: 2 });
const zombie = (n = "Test Zombie") => card(n, "Creature — Zombie", "{1}{B}", { cmc: 2, power: "2", toughness: "2" });

// Real oracle text (Scryfall).
const theRoyalScions = card("The Royal Scions", "Legendary Planeswalker — Will Rowan", "{1}{U}{R}", {"cmc":3,"loyalty":"5","keywords":[],"oracleText":"+1: Draw a card, then discard a card.\n+1: Target creature gets +2/+0 and gains first strike and trample until end of turn.\n−8: Draw four cards. When you do, The Royal Scions deals damage to any target equal to the number of cards in your hand.","colors":["R","U"],"colorIdentity":["R","U"],"layout":"normal"});

describe("draw four cards. When you do, ...", () => {
  it("compile", () => supported(theRoyalScions));

  it("The Royal Scions −8: four cards drawn, then damage equal to the cards in hand to the target chosen after the draw", () => {
    const { s: s0, ap, opp } = setup([]);
    emptyHand(s0, ap);
    const rs = putOnBattlefield(s0, ap, theRoyalScions);
    s0.objects[rs]!.counters = { loyalty: 8 };
    into(s0, ap, bear(), "hand");
    const life = s0.players[opp]!.life;
    let s = run(s0, planActivate(s0, ap, rs, 2));
    s = settle(s, { targets: [{ kind: "player", id: opp }] });
    expect(s.players[ap]!.hand.length).toBe(5);
    expect(s.players[opp]!.life).toBe(life - 5);
  });

  it("The Royal Scions −8: with three cards in the library it doesn't trigger (and its controller loses for drawing from an empty library)", () => {
    const { s: s0, ap, opp } = setup([]);
    emptyHand(s0, ap);
    for (const id of s0.players[ap]!.library.splice(3)) {
      s0.objects[id]!.zone = "exile";
      s0.players[ap]!.exile.push(id);
    }
    const rs = putOnBattlefield(s0, ap, theRoyalScions);
    s0.objects[rs]!.counters = { loyalty: 8 };
    const life = s0.players[opp]!.life;
    let s = run(s0, planActivate(s0, ap, rs, 2));
    s = settle(s, { targets: [{ kind: "player", id: opp }] });
    expect(s.players[ap]!.hand.length).toBe(3);
    expect(s.players[opp]!.life).toBe(life);
  });
});

const mosswoodDreadknight = scry("adventure", [{"name":"Mosswood Dreadknight","type_line":"Creature — Human Knight","mana_cost":"{1}{G}","oracle_text":"Trample\nWhen this creature dies, you may cast it from your graveyard as an Adventure until the end of your next turn.","power":"3","toughness":"2"},{"name":"Dread Whispers","type_line":"Sorcery — Adventure","mana_cost":"{1}{B}","oracle_text":"You draw a card and you lose 1 life. (Then exile this card. You may cast the creature later from exile.)"}], { keywords: ["Trample"], color_identity: ["B","G"] });
const hildibrandManderville = scry("adventure", [{"name":"Hildibrand Manderville","type_line":"Legendary Creature — Human Detective","mana_cost":"{1}{W}","oracle_text":"Creature tokens you control get +1/+1.\nWhen Hildibrand Manderville dies, you may cast it from your graveyard as an Adventure until the end of your next turn.","power":"2","toughness":"2"},{"name":"Gentleman's Rise","type_line":"Instant — Adventure","mana_cost":"{2}{B}","oracle_text":"Create a 2/2 black Zombie creature token. (Then exile this card. You may cast the creature later from exile.)"}], { keywords: [], color_identity: ["B","W"] });
const abigaleEloquentFirstyear = card("Abigale, Eloquent First-Year", "Legendary Creature — Bird Bard", "{W/B}{W/B}", {"cmc":2,"power":"1","toughness":"1","keywords":["Flying","Lifelink","First strike"],"oracleText":"Flying, first strike, lifelink\nWhen Abigale enters, up to one other target creature loses all abilities. Put a flying counter, a first strike counter, and a lifelink counter on that creature.","colors":["B","W"],"colorIdentity":["B","W"],"layout":"normal"});
const transmograntsCrown = card("Transmogrant's Crown", "Artifact — Equipment", "{2}", {"cmc":2,"keywords":["Equip"],"oracleText":"Equipped creature gets +2/+0.\nWhenever equipped creature dies, draw a card.\nEquip {2} or {B}","colors":[],"colorIdentity":["B"],"layout":"normal"});

/** Destroys the creature by lethal damage and lets its dies triggers resolve. */
const dies = (s: GameState, id: ObjectId) => {
  s.objects[id]!.damage = 99;
  runStateBasedActions(s);
  return settle(s);
};
const asAdventure = { via: "permission" as const, face: 1 };

describe("when ~ dies, you may cast it from your graveyard as an Adventure until the end of your next turn", () => {
  it("compile", () => supported(mosswoodDreadknight, hildibrandManderville));

  it("Mosswood Dreadknight: its Adventure from the graveyard, not the creature; then the creature from exile", () => {
    const { s: s0, ap } = setup([]);
    const m = putOnBattlefield(s0, ap, mosswoodDreadknight);
    let s = passUntil(s0, "main1", ap);
    expect(planCast(s, ap, m, undefined, undefined, undefined, undefined, asAdventure)).toBeNull(); // on the battlefield
    s = dies(s, m);
    expect(s.objects[m]!.zone).toBe("graveyard");
    s.players[ap]!.manaPool.B = 2;
    s.players[ap]!.manaPool.G = 2;
    expect(planCast(s, ap, m, undefined, undefined, undefined, undefined, { via: "permission" })).toBeNull();
    const hand = s.players[ap]!.hand.length;
    const life = s.players[ap]!.life;
    s = settle(run(s, planCast(s, ap, m, undefined, undefined, undefined, undefined, asAdventure)));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.players[ap]!.life).toBe(life - 1);
    // It went on an adventure: the creature may now be cast from exile.
    expect(s.objects[m]!.zone).toBe("exile");
    s = settle(run(s, planCast(s, ap, m)));
    expect(s.objects[m]!.zone).toBe("battlefield");
  });

  it("Mosswood Dreadknight: through its controller's next turn, gone after it; only if it died", () => {
    const { s: s0, ap, opp } = setup([]);
    const m = putOnBattlefield(s0, ap, mosswoodDreadknight);
    let s = dies(passUntil(s0, "main1", ap), m);
    s = passUntil(passUntil(s, "upkeep", opp), "main1", ap); // the next turn of ours
    s.players[ap]!.manaPool.B = 2;
    expect(planCast(s, ap, m, undefined, undefined, undefined, undefined, asAdventure)).not.toBeNull();
    s.players[ap]!.manaPool.B = 0;
    s = passUntil(passUntil(s, "upkeep", opp), "main1", ap); // the turn after that
    s.players[ap]!.manaPool.B = 2;
    expect(planCast(s, ap, m, undefined, undefined, undefined, undefined, asAdventure)).toBeNull();
    // Put into the graveyard some other way, there's no permission.
    const { s: t0, ap: p } = setup([]);
    const other = into(t0, p, mosswoodDreadknight, "graveyard");
    const t = passUntil(t0, "main1", p);
    t.players[p]!.manaPool.B = 2;
    expect(planCast(t, p, other, undefined, undefined, undefined, undefined, asAdventure)).toBeNull();
  });

  it("Hildibrand Manderville: its instant Adventure in an opponent's turn; the bot casts it too", () => {
    const { s: s0, ap, opp } = setup([]);
    const h = putOnBattlefield(s0, ap, hildibrandManderville);
    let s = dies(passUntil(s0, "main1", ap), h);
    s = passUntil(s, "upkeep", opp);
    s.players[ap]!.manaPool.B = 3;
    while (waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(run(s, planCast(s, ap, h, undefined, undefined, undefined, undefined, asAdventure)));
    expect(named(s, ap, "Zombie Token").length).toBe(1);
    expect(s.objects[h]!.zone).toBe("exile");
    // A bot whose Hildibrand died casts Gentleman's Rise from its graveyard.
    const { s: b0, ap: bp } = setup([]);
    emptyHand(b0, bp);
    b0.players[bp]!.command = [];
    const bh = putOnBattlefield(b0, bp, hildibrandManderville);
    let b = dies(passUntil(b0, "main1", bp), bh);
    b.players[bp]!.manaPool.B = 3;
    const acts = botActions(b, bp);
    expect(acts.some((a) => a.type === "castSpell" && a.objectId === bh && a.face === 1)).toBe(true);
  });
});

describe("loses all abilities, then keyword counters", () => {
  it("compile", () => supported(abigaleEloquentFirstyear));

  it("Abigale: the target loses its abilities for good and gets flying, first strike and lifelink counters", () => {
    const { s: s0, ap, opp } = setup([abigaleEloquentFirstyear]);
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Test Knight", keywords: ["Vigilance", "Trample"], oracleText: "Vigilance, trample" }));
    let s = passUntil(s0, "main1", ap);
    s.players[ap]!.manaPool.W = 2;
    const a = s.players[ap]!.hand.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Abigale, Eloquent First-Year")!;
    s = settle(run(s, planCast(s, ap, a)), { targets: [tgt(theirs)] });
    const o = s.objects[theirs]!;
    expect(objHasKeyword(s, o, "Vigilance")).toBe(false);
    expect(objHasKeyword(s, o, "Trample")).toBe(false);
    expect(objHasKeyword(s, o, "Flying")).toBe(true);
    expect(objHasKeyword(s, o, "First strike")).toBe(true);
    expect(objHasKeyword(s, o, "Lifelink")).toBe(true);
    // It doesn't end with the turn, nor when Abigale leaves (rulings).
    s = dies(s, a);
    s = passUntil(s, "upkeep", opp);
    expect(objHasKeyword(s, s.objects[theirs]!, "Trample")).toBe(false);
    expect(objHasKeyword(s, s.objects[theirs]!, "Flying")).toBe(true);
  });
});

describe("equip {2} or {B}", () => {
  it("compile", () => supported(transmograntsCrown));

  it("Transmogrant's Crown: equips for {B} or for {2}", () => {
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, transmograntsCrown);
    const b = putOnBattlefield(s0, ap, bear());
    let s = passUntil(s0, "main1", ap);
    expect(s.objects[c] && [0, 1].map((i) => planActivate(s, ap, c, i, [tgt(b)]) !== null)).toEqual([true, true]);
    s.players[ap]!.manaPool.B = 1;
    s = settle(run(s, planActivate(s, ap, c, 1, [tgt(b)])));
    expect(s.objects[c]!.attachedTo).toBe(b);
    expect(power(s, s.objects[b]!)).toBe(4);
    const b2 = putOnBattlefield(s, ap, bear({ name: "Other Bear" }));
    s.players[ap]!.manaPool.C = 2;
    s = settle(run(s, planActivate(s, ap, c, 0, [tgt(b2)])));
    expect(s.objects[c]!.attachedTo).toBe(b2);
  });
});
