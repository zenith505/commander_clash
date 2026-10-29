// Round 209: Cait Sith, Hidetsugu, Devouring Chaos, Hei Bai, Bebop, Barrowin of Clan Undurr, Regal Sliver, Mysterio, Treasure
// Keeper, Azog, Moria's Ruin and others.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

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
const rock = (n = "Test Rock", mv = 3) => card(n, "Artifact", `{${mv}}`, { cmc: mv });
const land = (n = "Test Land") => card(n, "Land");

// Real oracle text (Scryfall).
const caitSithFortuneTeller = card("Cait Sith, Fortune Teller", "Legendary Artifact Creature — Cat Moogle", "{3}{R}", {"cmc":4,"power":"3","toughness":"3","keywords":["Lucky Slots","Scry"],"oracleText":"Lucky Slots — At the beginning of combat on your turn, scry 1, then exile the top card of your library. You may play that card this turn. When you exile a card this way, target creature you control gets +X/+0 until end of turn, where X is that card's mana value.","colors":["R"],"colorIdentity":["R"],"layout":"normal"});
const hidetsuguDevouringChaos = card("Hidetsugu, Devouring Chaos", "Legendary Creature — Ogre Demon", "{3}{B}", {"cmc":4,"power":"4","toughness":"4","keywords":["Scry"],"oracleText":"{B}, Sacrifice a creature: Scry 2.\n{2}{R}, {T}: Exile the top card of your library. You may play that card this turn. When you exile a nonland card this way, Hidetsugu deals damage equal to the exiled card's mana value to any target.","colors":["B"],"colorIdentity":["B","R"],"layout":"normal"});
const heiBaiForestGuardian = card("Hei Bai, Forest Guardian", "Legendary Creature — Bear Spirit", "{3}{G}", {"cmc":4,"power":"4","toughness":"4","keywords":[],"oracleText":"When Hei Bai enters, reveal cards from the top of your library until you reveal a Shrine card. You may put that card onto the battlefield. Then shuffle.\n{W}{U}{B}{R}{G}, {T}: For each legendary enchantment you control, create a 1/1 colorless Spirit creature token with \"This token can't block or be blocked by non-Spirit creatures.\"","colors":["G"],"colorIdentity":["B","G","R","U","W"],"layout":"normal"});
const bebopSkullCrossbones = card("Bebop, Skull & Crossbones", "Legendary Creature — Boar Mutant", "{1}{B}", {"cmc":2,"power":"2","toughness":"1","keywords":["Partner with","Partner","Deathtouch"],"oracleText":"Partner with Rocksteady, Mutant Marauder (When this creature enters, target player may put Rocksteady into their hand from their library, then shuffle.)\nDeathtouch\nWhenever Bebop deals combat damage to a player, you may draw X cards, where X is the number of counters on Bebop. If you do, you lose X life.","colors":["B"],"colorIdentity":["B"],"layout":"normal"});
const barrowinOfClanUndurr = card("Barrowin of Clan Undurr", "Legendary Creature — Dwarf Cleric", "{2}{W}{B}", {"cmc":4,"power":"3","toughness":"3","keywords":["Venture into the dungeon"],"oracleText":"When Barrowin enters, venture into the dungeon. (Enter the first room or advance to the next room.)\nWhenever Barrowin attacks, return up to one creature card with mana value 3 or less from your graveyard to the battlefield if you've completed a dungeon.","colors":["B","W"],"colorIdentity":["B","W"],"layout":"normal"});
const regalSliver = card("Regal Sliver", "Creature — Sliver", "{3}{W}", {"cmc":4,"power":"3","toughness":"3","keywords":[],"oracleText":"Sliver creatures you control have \"When this creature enters, Slivers you control get +1/+1 until end of turn if you're the monarch. Otherwise, you become the monarch.\"","colors":["W"],"colorIdentity":["W"],"layout":"normal"});
const mysterioMasterOfIllusion = card("Mysterio, Master of Illusion", "Legendary Creature — Human Villain", "{3}{U}", {"cmc":4,"power":"3","toughness":"3","keywords":[],"oracleText":"When Mysterio enters, create a 3/3 blue Illusion Villain creature token for each nontoken Villain you control. Exile those tokens when Mysterio leaves the battlefield.","colors":["U"],"colorIdentity":["U"],"layout":"normal"});
const treasureKeeper = card("Treasure Keeper", "Artifact Creature — Construct", "{4}", {"cmc":4,"power":"3","toughness":"3","keywords":[],"oracleText":"When this creature dies, reveal cards from the top of your library until you reveal a nonland card with mana value 3 or less. You may cast that card without paying its mana cost. Put all revealed cards not cast this way on the bottom of your library in a random order.","colors":[],"colorIdentity":[],"layout":"normal"});
const azogMoriasRuin = card("Azog, Moria's Ruin", "Legendary Creature — Goblin Soldier", "{2}{B}", {"cmc":3,"power":"1","toughness":"3","keywords":["Amass"],"oracleText":"When Azog enters, destroy up to one other target creature. Its controller amasses Goblins X, where X is that creature's power. If you controlled that creature, draw a card. (To amass Goblins X, that player puts X +1/+1 counters on an Army they control. It's also a Goblin. If they don't control an Army, they create a 0/0 black Goblin Army creature token first.)","colors":["B"],"colorIdentity":["B"],"layout":"normal"});

describe("exile the top card, you may play it; when you exile a card this way, ... its mana value", () => {
  it("compile", () => supported(caitSithFortuneTeller, hidetsuguDevouringChaos));

  it("Cait Sith: scry 1, then the top card is exiled and playable; the reflexive trigger gives +X/+0 for its mana value", () => {
    const { s: s0, ap } = setup([]);
    const cs = putOnBattlefield(s0, ap, caitSithFortuneTeller);
    const b = putOnBattlefield(s0, ap, bear());
    const r = into(s0, ap, rock("Test Rock", 3), "library");
    let s = passUntil(s0, "beginCombat", ap);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "arrangeTop", how: "scry", cards: [r] });
    s = act(s, { type: "arrangeTop", player: ap, top: [r], away: [] });
    s = settle(s, { targets: [tgt(b)] });
    expect(s.objects[r]!.zone).toBe("exile");
    expect(s.objects[r]!.mayPlay?.until).toBe("thisTurn");
    expect(power(s, s.objects[b]!)).toBe(5);
    expect(power(s, s.objects[cs]!)).toBe(3);
  });

  it("Hidetsugu: a nonland card exiled deals damage equal to its mana value; a land card doesn't trigger", () => {
    const { s: s0, ap, opp } = setup([]);
    const h = putOnBattlefield(s0, ap, hidetsuguDevouringChaos);
    into(s0, ap, rock("Test Rock", 4), "library");
    const life = s0.players[opp]!.life;
    let s = run(s0, planActivate(s0, ap, h, 1));
    s = settle(s, { targets: [{ kind: "player", id: opp }] });
    expect(s.players[opp]!.life).toBe(life - 4);

    const { s: t0, ap: ap2, opp: opp2 } = setup([]);
    const h2 = putOnBattlefield(t0, ap2, hidetsuguDevouringChaos);
    const l = into(t0, ap2, land(), "library");
    const life2 = t0.players[opp2]!.life;
    let t = run(t0, planActivate(t0, ap2, h2, 1));
    t = settle(t, { targets: [{ kind: "player", id: opp2 }] });
    expect(t.objects[l]!.zone).toBe("exile");
    expect(t.players[opp2]!.life).toBe(life2);
  });
});

describe("reveal until a Shrine card, you may put it onto the battlefield, then shuffle", () => {
  const shrine = card("Test Shrine", "Legendary Enchantment — Shrine", "{1}{W}", { cmc: 2 });
  it("compile", () => supported(heiBaiForestGuardian));

  it("Hei Bai: the Shrine found goes onto the battlefield if you choose; if not, it stays in the library", () => {
    for (const yes of [true, false]) {
      const { s: s0, ap } = setup([heiBaiForestGuardian]);
      const hb = s0.players[ap]!.hand.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === heiBaiForestGuardian.name)!;
      for (let i = 0; i < 3; i++) into(s0, ap, bear(), "library");
      const sh = putOnBattlefield(s0, ap, shrine);
      s0.battlefield.splice(s0.battlefield.indexOf(sh), 1);
      s0.objects[sh]!.zone = "library";
      s0.players[ap]!.library.splice(3, 0, sh);
      invalidateCharacteristics(s0);
      const n = s0.players[ap]!.library.length;
      let s = run(s0, planCast(s0, ap, hb));
      s = settle(s, { may: yes });
      expect(s.objects[sh]!.zone).toBe(yes ? "battlefield" : "library");
      expect(s.players[ap]!.library.length).toBe(yes ? n - 1 : n);
    }
  });
});

describe("you may draw X cards; if you do, you lose X life", () => {
  it("compile", () => supported(bebopSkullCrossbones));

  it("Bebop: X is the number of counters on it, drawn and lost", () => {
    const { s: s0, ap, opp } = setup([]);
    emptyHand(s0, ap);
    const b = putOnBattlefield(s0, ap, bebopSkullCrossbones);
    s0.objects[b]!.counters = { "+1/+1": 2, shield: 1 };
    invalidateCharacteristics(s0);
    const life = s0.players[ap]!.life;
    let s = attack(s0, ap, opp, [b]);
    s = passUntil(s, "combatDamage", ap);
    s = settle(s, { may: true });
    expect(s.players[ap]!.hand.length).toBe(3);
    expect(s.players[ap]!.life).toBe(life - 3);
  });
});

describe("return a creature card ... if you've completed a dungeon", () => {
  it("compile", () => supported(barrowinOfClanUndurr));

  it("Barrowin: only with a dungeon completed, checked as the attack trigger resolves", () => {
    for (const done of [false, true]) {
      const { s: s0, ap, opp } = setup([]);
      const b = putOnBattlefield(s0, ap, barrowinOfClanUndurr);
      const dead = into(s0, ap, bear({ name: "Test Dead Bear" }), "graveyard");
      if (done) s0.players[ap]!.completedDungeons = ["Lost Mine of Phandelver"];
      let s = attack(s0, ap, opp, [b]);
      for (let i = 0; i < 20 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
        const p = s.pending;
        if (p?.kind === "searchLibrary") s = act(s, { type: "searchLibrary", player: p.player, found: [dead] });
        else if (p) break;
        else s = act(s, { type: "passPriority", player: waitingOn(s)! });
      }
      expect(s.pending).toBeNull();
      expect(s.objects[dead]!.zone).toBe(done ? "battlefield" : "graveyard");
    }
  });
});

describe("Slivers get +1/+1 if you're the monarch; otherwise you become the monarch", () => {
  it("compile", () => supported(regalSliver));

  it("Regal Sliver: the first Sliver makes you the monarch, the next one pumps the Slivers", () => {
    const sliver = card("Test Sliver", "Creature — Sliver", "{1}{W}", { cmc: 2, power: "1", toughness: "1" });
    const { s: s0, ap } = setup([sliver, sliver]);
    const rs = putOnBattlefield(s0, ap, regalSliver);
    const [a, b] = s0.players[ap]!.hand.filter((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Test Sliver");
    let s = run(s0, planCast(s0, ap, a!));
    s = settle(s);
    expect(s.monarch).toBe(ap);
    expect(power(s, s.objects[rs]!)).toBe(3);
    s = run(s, planCast(s, ap, b!));
    s = settle(s);
    expect(power(s, s.objects[rs]!)).toBe(4);
    expect(toughness(s, s.objects[a!]!)).toBe(2);
  });
});

describe("tokens exiled when ~ leaves the battlefield", () => {
  const villain = card("Test Villain", "Creature — Human Villain", "{1}{B}", { cmc: 2, power: "1", toughness: "1" });
  const kill = card("Test Kill", "Instant", "{B}", { cmc: 1, oracleText: "Destroy target creature." });
  it("compile", () => supported(mysterioMasterOfIllusion));

  it("Mysterio: a 3/3 for each nontoken Villain, exiled once Mysterio leaves", () => {
    const { s: s0, ap } = setup([mysterioMasterOfIllusion, kill]);
    putOnBattlefield(s0, ap, villain);
    const m = s0.players[ap]!.hand.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === mysterioMasterOfIllusion.name)!;
    const k = s0.players[ap]!.hand.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Test Kill")!;
    let s = run(s0, planCast(s0, ap, m));
    s = settle(s);
    const tokens = named(s, ap, "Illusion Villain Token");
    expect(tokens.length).toBe(2);
    const other = putOnBattlefield(s, ap, card("Test Other Token Maker", "Creature — Human", "{1}", { cmc: 1, power: "1", toughness: "1" }));
    s = run(s, planCast(s, ap, k, [tgt(m)]));
    s = settle(s);
    expect(s.objects[m]!.zone).toBe("graveyard");
    for (const t of tokens) expect(s.objects[t]?.zone ?? "gone").not.toBe("battlefield");
    expect(s.objects[other]!.zone).toBe("battlefield");
  });
});

describe("reveal until a nonland card with mana value 3 or less, cast it free, the rest to the bottom", () => {
  it("compile", () => supported(treasureKeeper));

  it("Treasure Keeper: skips lands and bigger cards, casts the card for free; the revealed cards go to the bottom", () => {
    const kill = card("Test Kill", "Instant", "{B}", { cmc: 1, oracleText: "Destroy target creature." });
    const { s: s0, ap } = setup([kill]);
    const tk = putOnBattlefield(s0, ap, treasureKeeper);
    const small = into(s0, ap, rock("Test Small Rock", 2), "library");
    const big = into(s0, ap, rock("Test Big Rock", 5), "library");
    const l = into(s0, ap, land(), "library");
    const k = s0.players[ap]!.hand.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Test Kill")!;
    let s = run(s0, planCast(s0, ap, k, [tgt(tk)]));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: small });
    s = run(s, planCast(s, ap, small));
    s = settle(s);
    expect(s.objects[small]!.zone).toBe("battlefield");
    const lib = s.players[ap]!.library;
    expect(lib.slice(-2).sort()).toEqual([big, l].sort());
  });
});

describe("its controller amasses Goblins X", () => {
  it("compile", () => supported(azogMoriasRuin));

  it("Azog: the destroyed creature's controller amasses its power; you draw if it was yours", () => {
    const { s: s0, ap, opp } = setup([azogMoriasRuin]);
    const big = putOnBattlefield(s0, opp, bear({ name: "Test Big Bear", power: "4", toughness: "4" }));
    const az = s0.players[ap]!.hand.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === azogMoriasRuin.name)!;
    const hand = s0.players[ap]!.hand.length;
    let s = run(s0, planCast(s0, ap, az));
    s = settle(s, { targets: [tgt(big)] });
    expect(s.objects[big]!.zone).toBe("graveyard");
    const army = named(s, opp, "Goblin Army Token");
    expect(army.length).toBe(1);
    expect(s.objects[army[0]!]!.counters["+1/+1"]).toBe(4);
    expect(characteristics(s, s.objects[army[0]!]!).subtypes).toContain("Goblin");
    expect(s.players[ap]!.hand.length).toBe(hand - 1);

    const { s: t0, ap: ap2 } = setup([azogMoriasRuin]);
    const mine = putOnBattlefield(t0, ap2, bear({ name: "Test My Bear", power: "3", toughness: "3" }));
    const az2 = t0.players[ap2]!.hand.find((id) => t0.cards[t0.objects[id]!.cardId]!.name === azogMoriasRuin.name)!;
    const hand2 = t0.players[ap2]!.hand.length;
    let t = run(t0, planCast(t0, ap2, az2));
    t = settle(t, { targets: [tgt(mine)] });
    expect(t.objects[t.battlefield.find((id) => t.cards[t.objects[id]!.cardId]!.name === "Goblin Army Token")!]!.counters["+1/+1"]).toBe(3);
    expect(t.players[ap2]!.hand.length).toBe(hand2);
  });
});
