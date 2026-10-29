// Round 209: Cait Sith, Hidetsugu, Devouring Chaos, Hei Bai, Bebop, Barrowin of Clan Undurr, Regal Sliver, Mysterio, Treasure
// Keeper, Azog, Moria's Ruin and others.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, activationCost, applyAction, cantBlockNow, characteristics, spellCost, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

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

const dimensionXPizzasaur = card("Dimension X Pizzasaur", "Artifact Creature — Food Alien Mutant", "{3}{B}", {"cmc":4,"power":"2","toughness":"1","keywords":[],"oracleText":"When this creature enters, put two +1/+1 counters on target creature. When you do, destroy up to one target creature with mana value less than or equal to the number of counters among permanents you control.\n{2}, {T}, Sacrifice this creature: You gain 3 life and each opponent loses 3 life.","colors":["B"],"colorIdentity":["B"],"layout":"normal"});
const intrepidAdversary = card("Intrepid Adversary", "Creature — Human Scout", "{1}{W}", {"cmc":2,"power":"3","toughness":"1","keywords":["Lifelink"],"oracleText":"Lifelink\nWhen this creature enters, you may pay {1}{W} any number of times. When you pay this cost one or more times, put that many valor counters on this creature.\nCreatures you control get +1/+1 for each valor counter on this creature.","colors":["W"],"colorIdentity":["W"],"layout":"normal"});
const primalAdversary = card("Primal Adversary", "Creature — Wolf", "{2}{G}", {"cmc":3,"power":"4","toughness":"3","keywords":["Trample"],"oracleText":"Trample\nWhen this creature enters, you may pay {1}{G} any number of times. When you pay this cost one or more times, put that many +1/+1 counters on this creature, then up to that many target lands you control become 3/3 Wolf creatures with haste that are still lands.","colors":["G"],"colorIdentity":["G"],"layout":"normal"});
const spectralAdversary = card("Spectral Adversary", "Creature — Spirit", "{1}{U}", {"cmc":2,"power":"2","toughness":"1","keywords":["Flying","Flash"],"oracleText":"Flash\nFlying\nWhen this creature enters, you may pay {1}{U} any number of times. When you pay this cost one or more times, put that many +1/+1 counters on this creature, then up to that many other target artifacts, creatures, and/or enchantments phase out.","colors":["U"],"colorIdentity":["U"],"layout":"normal"});
const taintedAdversary = card("Tainted Adversary", "Creature — Zombie", "{1}{B}", {"cmc":2,"power":"2","toughness":"3","keywords":["Deathtouch"],"oracleText":"Deathtouch\nWhen this creature enters, you may pay {2}{B} any number of times. When you pay this cost one or more times, put that many +1/+1 counters on this creature, then create twice that many 2/2 black Zombie creature tokens with decayed. (A creature with decayed can't block. When it attacks, sacrifice it at end of combat.)","colors":["B"],"colorIdentity":["B"],"layout":"normal"});
const pollywogSymbiote = card("Pollywog Symbiote", "Creature — Frog", "{1}{U}", {"cmc":2,"power":"1","toughness":"3","keywords":[],"oracleText":"Each creature spell you cast costs {1} less to cast if it has mutate.\nWhenever you cast a creature spell, if it has mutate, draw a card, then discard a card.","colors":["U"],"colorIdentity":["U"],"layout":"normal"});
const powerArtifact = card("Power Artifact", "Enchantment — Aura", "{U}{U}", {"cmc":2,"keywords":["Enchant"],"oracleText":"Enchant artifact\nEnchanted artifact's activated abilities cost {2} less to activate. This effect can't reduce the mana in that cost to less than one mana.","colors":["U"],"colorIdentity":["U"],"layout":"normal"});
const ozoxTheClatteringKing = card("Ozox, the Clattering King", "Legendary Creature — Skeleton Noble", "{2}{B}", {"cmc":3,"power":"3","toughness":"2","keywords":[],"oracleText":"Ozox can't block.\nWhen Ozox dies, create Jumblebones, a legendary 2/1 black Skeleton creature token with \"Jumblebones can't block\" and \"When Jumblebones leaves the battlefield, return target card named Ozox, the Clattering King from your graveyard to your hand.\"","colors":["B"],"colorIdentity":["B"],"layout":"normal"});
const roothaMasteringTheMoment = card("Rootha, Mastering the Moment", "Legendary Creature — Orc Sorcerer", "{2}{U}{R}", {"cmc":4,"power":"3","toughness":"4","keywords":[],"oracleText":"At the beginning of combat on your turn, if you've cast an instant or sorcery spell this turn, create an X/X blue and red Elemental creature token with flying and haste, where X is the greatest mana value among instant and sorcery spells you've cast this turn.","colors":["R","U"],"colorIdentity":["R","U"],"layout":"normal"});

/** Like settle, but the trigger targets are answered in turn from `queue`. */
const settleQ = (s: GameState, queue: TargetChoice[][], may = true) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: may });
    else if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets: queue.shift() ?? [] });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const inHand = (s: GameState, pid: PlayerId, name: string) => s.players[pid]!.hand.filter((id) => s.cards[s.objects[id]!.cardId]!.name === name);

describe("put two +1/+1 counters on target creature; when you do, destroy ... mana value <= counters among your permanents", () => {
  it("compile", () => supported(dimensionXPizzasaur));

  it("Dimension X Pizzasaur: the counters count toward the reflexive trigger's limit", () => {
    const { s: s0, ap, opp } = setup([dimensionXPizzasaur]);
    const b = putOnBattlefield(s0, ap, bear());
    s0.objects[b]!.counters = { "+1/+1": 1 };
    const three = putOnBattlefield(s0, opp, bear({ name: "Test Three", manaCost: "{2}{G}", cmc: 3 }));
    invalidateCharacteristics(s0);
    let s = run(s0, planCast(s0, ap, inHand(s0, ap, dimensionXPizzasaur.name)[0]!));
    s = settleQ(s, [[tgt(b)], [tgt(three)]]);
    expect(s.objects[b]!.counters["+1/+1"]).toBe(3);
    expect(s.objects[three]!.zone).toBe("graveyard");
  });
});

describe("X is the greatest mana value among instant and sorcery spells you've cast this turn", () => {
  it("compile", () => supported(roothaMasteringTheMoment));

  it("Rootha, Mastering the Moment: an X/X flier for the biggest one; none without such a spell", () => {
    const big = card("Test Big Draw", "Instant", "{2}{U}", { cmc: 3, oracleText: "Draw a card." });
    const small = card("Test Small Draw", "Instant", "{U}", { cmc: 1, oracleText: "Draw a card." });
    const { s: s0, ap } = setup([big, small]);
    putOnBattlefield(s0, ap, roothaMasteringTheMoment);
    let s = run(s0, planCast(s0, ap, inHand(s0, ap, big.name)[0]!));
    s = settle(s);
    s = run(s, planCast(s, ap, inHand(s, ap, small.name)[0]!));
    s = settle(s);
    s = passUntil(s, "beginCombat", ap);
    s = settle(s);
    const tok = named(s, ap, "Elemental Token");
    expect(tok.length).toBe(1);
    expect(power(s, s.objects[tok[0]!]!)).toBe(3);
    expect(toughness(s, s.objects[tok[0]!]!)).toBe(3);
    expect(characteristics(s, s.objects[tok[0]!]!).keywords).toEqual(expect.arrayContaining(["Flying", "Haste"]));

    const { s: t0, ap: ap2 } = setup([]);
    putOnBattlefield(t0, ap2, roothaMasteringTheMoment);
    let t = passUntil(t0, "beginCombat", ap2);
    t = settle(t);
    expect(named(t, ap2, "Elemental Token").length).toBe(0);
  });
});

describe("you may pay ... any number of times; when you pay this cost one or more times, ... that many", () => {
  it("compile", () => supported(intrepidAdversary, primalAdversary, spectralAdversary, taintedAdversary));

  /** Casts `def` and answers its enters trigger: pays the cost `times` times. */
  const castPaying = (def: CardDef, times: number, pool: Partial<Record<"W" | "U" | "B" | "R" | "G", number>> = {}, prep?: (s: GameState, ap: PlayerId, opp: PlayerId) => void) => {
    const { s: s0, ap, opp } = setup([def]);
    prep?.(s0, ap, opp);
    invalidateCharacteristics(s0);
    let s = run(s0, planCast(s0, ap, inHand(s0, ap, def.name)[0]!));
    // The payment comes from mana in the pool (as the app and the bots tap for it first).
    Object.assign(s.players[ap]!.manaPool, pool);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "payX", player: ap });
    if (s.pending?.kind !== "chooseOption") throw new Error("no prompt");
    expect(s.pending.options).toContain(String(times));
    s = act(s, { type: "chooseOption", player: ap, choice: String(times) });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    const self = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === def.name)!;
    return { s, ap, opp, self };
  };

  it("Intrepid Adversary: two payments give two valor counters, +2/+2 to your creatures", () => {
    const r = castPaying(intrepidAdversary, 2, { W: 4 });
    const b = putOnBattlefield(r.s, r.ap, bear());
    invalidateCharacteristics(r.s);
    const s = settle(r.s);
    expect(s.objects[r.self]!.counters.valor).toBe(2);
    expect(power(s, s.objects[r.self]!)).toBe(5);
    expect(power(s, s.objects[b]!)).toBe(4);
  });

  it("Intrepid Adversary: not paying puts no counters", () => {
    const { s: s0, ap } = setup([intrepidAdversary]);
    let s = run(s0, planCast(s0, ap, inHand(s0, ap, intrepidAdversary.name)[0]!));
    s = settle(s);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "none" }));
    const self = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === intrepidAdversary.name)!;
    expect(s.objects[self]!.counters.valor ?? 0).toBe(0);
    expect(s.pending).toBeNull();
  });

  it("Primal Adversary: two +1/+1 counters, then up to two of your lands become 3/3 Wolves with haste", () => {
    const r = castPaying(primalAdversary, 2, { G: 4 });
    const lands = r.s.battlefield.filter((id) => r.s.objects[id]!.controller === r.ap && r.s.cards[r.s.objects[id]!.cardId]!.name === "Plains").slice(0, 2);
    const s = settleQ(r.s, [lands.map(tgt)]);
    expect(s.objects[r.self]!.counters["+1/+1"]).toBe(2);
    for (const l of lands) {
      const c = characteristics(s, s.objects[l]!);
      expect(c.types).toEqual(expect.arrayContaining(["Land", "Creature"]));
      expect(c.subtypes).toContain("Wolf");
      expect(c.keywords).toContain("Haste");
      expect(power(s, s.objects[l]!)).toBe(3);
      expect(toughness(s, s.objects[l]!)).toBe(3);
    }
  });

  it("Spectral Adversary: up to two other target permanents phase out", () => {
    let a = "", b = "";
    const r = castPaying(spectralAdversary, 2, { U: 4 }, (s, _ap, opp) => {
      a = putOnBattlefield(s, opp, bear({ name: "Test Bear A" }));
      b = putOnBattlefield(s, opp, rock("Test Rock B", 2));
    });
    const s = settleQ(r.s, [[tgt(a), tgt(b)]]);
    expect(s.objects[r.self]!.counters["+1/+1"]).toBe(2);
    expect(s.objects[a]!.zone).toBe("phasedOut");
    expect(s.objects[b]!.zone).toBe("phasedOut");
  });

  it("Tainted Adversary: two payments, two counters and four decayed Zombies", () => {
    const r = castPaying(taintedAdversary, 2, { B: 6 });
    const s = settle(r.s);
    expect(s.objects[r.self]!.counters["+1/+1"]).toBe(2);
    const z = named(s, r.ap, "Zombie Token");
    expect(z.length).toBe(4);
    expect(characteristics(s, s.objects[z[0]!]!).keywords).toContain("Decayed");
  });
});

describe("creature spells with mutate cost {1} less; casting one loots", () => {
  const mutant = card("Test Mutant", "Creature — Beast", "{3}{U}", { cmc: 4, power: "3", toughness: "3", keywords: ["Mutate"], oracleText: "Mutate {2}{U} (If you cast this spell for its mutate cost, put it over or under target non-Human creature you own. They mutate into the creature on top plus all abilities from under it.)" });
  it("compile", () => supported(pollywogSymbiote));

  it("Pollywog Symbiote: {1} less for a mutate creature spell, cast for its mutate cost or not; a bear costs the same", () => {
    const { s, ap, ids } = setup([mutant, bear()]);
    const before = [spellCost(s, ap, s.objects[ids[0]!]!).extra, spellCost(s, ap, s.objects[ids[0]!]!, 0, [], { alt: "mutate" }).extra, spellCost(s, ap, s.objects[ids[1]!]!).extra];
    putOnBattlefield(s, ap, pollywogSymbiote);
    invalidateCharacteristics(s);
    const after = [spellCost(s, ap, s.objects[ids[0]!]!).extra, spellCost(s, ap, s.objects[ids[0]!]!, 0, [], { alt: "mutate" }).extra, spellCost(s, ap, s.objects[ids[1]!]!).extra];
    expect(before.map((n, i) => n - after[i]!)).toEqual([1, 1, 0]);
  });

  it("Pollywog Symbiote: casting a mutate creature draws then discards; a bear doesn't", () => {
    const { s: s0, ap, ids } = setup([mutant, bear({ name: "Test Plain Bear" })]);
    putOnBattlefield(s0, ap, pollywogSymbiote);
    const hand = s0.players[ap]!.hand.length;
    let s = run(s0, planCast(s0, ap, ids[1]!));
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "discard", player: ap, count: 1 });
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
    const d = s.players[ap]!.hand[0]!;
    s = settle(act(s, { type: "discard", player: ap, objectIds: [d] }));
    expect(s.objects[d]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand - 2);
  });
});

describe("enchanted artifact's activated abilities cost {2} less, not below one mana", () => {
  it("compile", () => supported(powerArtifact));

  it("Power Artifact: {3} becomes {1}, {1} stays {1}, {2}{U} becomes {U}; another artifact is unaffected", () => {
    const costOf = (s: GameState, pid: PlayerId, id: string, i = 0) => {
      const c = activationCost(s, pid, s.objects[id]!, abilitiesOf(s, s.objects[id]!).activated[i]!);
      return c.symbols.map((x) => (x.kind === "generic" ? `{${x.amount}}` : x.kind === "colored" ? `{${x.color}}` : x.kind)).join("");
    };
    const { s, ap } = setup([]);
    const eng = putOnBattlefield(s, ap, card("Test Engine", "Artifact", "{2}", { cmc: 2, oracleText: "{3}, {T}: Draw a card.\n{1}, {T}: You gain 1 life.\n{2}{U}: Test Engine becomes a 2/2 Construct artifact creature until end of turn." }));
    const other = putOnBattlefield(s, ap, card("Test Other Engine", "Artifact", "{2}", { cmc: 2, oracleText: "{3}, {T}: Draw a card." }));
    const pa = putOnBattlefield(s, ap, powerArtifact);
    s.objects[pa]!.attachedTo = eng;
    invalidateCharacteristics(s);
    expect([costOf(s, ap, eng, 0), costOf(s, ap, eng, 1), costOf(s, ap, eng, 2), costOf(s, ap, other, 0)]).toEqual(["{1}", "{1}", "{U}", "{3}"]);
  });
});

describe("create a named legendary token with two quoted abilities", () => {
  it("compile", () => supported(ozoxTheClatteringKing));

  it("Ozox: Jumblebones can't block, and when it leaves, Ozox returns from the graveyard to your hand", () => {
    const kill = card("Test Kill", "Instant", "{B}", { cmc: 1, oracleText: "Destroy target creature." });
    const { s: s0, ap } = setup([kill, kill]);
    const oz = putOnBattlefield(s0, ap, ozoxTheClatteringKing);
    const [k1, k2] = inHand(s0, ap, kill.name);
    let s = run(s0, planCast(s0, ap, k1!, [tgt(oz)]));
    s = settle(s);
    expect(s.objects[oz]!.zone).toBe("graveyard");
    const jb = named(s, ap, "Jumblebones");
    expect(jb.length).toBe(1);
    expect(characteristics(s, s.objects[jb[0]!]!).supertypes).toContain("Legendary");
    s = run(s, planCast(s, ap, k2!, [tgt(jb[0]!)]));
    s = settleQ(s, [[tgt(oz)]]);
    expect(s.objects[oz]!.zone).toBe("hand");
  });
});

const aspiringChampion = card("Aspiring Champion", "Creature — Astartes Warrior", "{3}{R}", {"cmc":4,"power":"3","toughness":"3","keywords":["Menace","Ruinous Ascension"],"oracleText":"Menace\nRuinous Ascension — When this creature deals combat damage to a player, sacrifice it. If you do, reveal cards from the top of your library until you reveal a creature card. Put that card onto the battlefield, then shuffle the rest into your library. If that creature is a Demon, it deals damage equal to its power to each opponent.","colors":["R"],"colorIdentity":["R"],"layout":"normal"});

describe("sacrifice it; if you do, reveal until a creature card, put it onto the battlefield, then shuffle", () => {
  it("compile", () => supported(aspiringChampion));

  it("Aspiring Champion: a Demon found deals damage equal to its power to each opponent; another creature doesn't", () => {
    for (const demon of [true, false]) {
      const { s: s0, ap, opp } = setup([]);
      const ch = putOnBattlefield(s0, ap, aspiringChampion);
      const found = into(s0, ap, demon ? card("Test Demon", "Creature — Demon", "{4}{B}", { cmc: 5, power: "4", toughness: "4" }) : bear({ name: "Test Bear" }), "library");
      const l = into(s0, ap, land(), "library");
      const life = Object.fromEntries(s0.turnOrder.map((p) => [p, s0.players[p]!.life]));
      let s = attack(s0, ap, opp, [ch]);
      s = passUntil(s, "combatDamage", ap);
      s = settle(s);
      expect(s.objects[ch]!.zone).toBe("graveyard");
      expect(s.objects[found]!.zone).toBe("battlefield");
      expect(s.objects[l]!.zone).toBe("library");
      const extra = demon ? 4 : 0;
      expect(s.players[opp]!.life).toBe(life[opp]! - 3 - extra);
      for (const p of s.turnOrder.filter((p) => p !== opp && p !== ap)) expect(s.players[p]!.life).toBe(life[p]! - extra);
      expect(s.players[ap]!.life).toBe(life[ap]);
    }
  });
});

const pursuedWhale = card("Pursued Whale", "Creature — Whale", "{5}{U}{U}", {"cmc":7,"power":"8","toughness":"8","keywords":[],"oracleText":"When this creature enters, each opponent creates a 1/1 red Pirate creature token with \"This token can't block\" and \"Creatures you control attack each combat if able.\"\nSpells your opponents cast that target this creature cost {3} more to cast.","colors":["U"],"colorIdentity":["U"],"layout":"normal"});
const relicRobber = card("Relic Robber", "Creature — Goblin Rogue", "{2}{R}", {"cmc":3,"power":"2","toughness":"2","keywords":["Haste"],"oracleText":"Haste\nWhenever this creature deals combat damage to a player, that player creates a 0/1 colorless Goblin Construct artifact creature token with \"This token can't block\" and \"At the beginning of your upkeep, this token deals 1 damage to you.\"","colors":["R"],"colorIdentity":["R"],"layout":"normal"});

describe("a token with two quoted abilities, for other players", () => {
  it("compile", () => supported(pursuedWhale, relicRobber));

  it("Pursued Whale: each opponent gets a Pirate that can't block", () => {
    const { s: s0, ap } = setup([pursuedWhale]);
    let s = run(s0, planCast(s0, ap, inHand(s0, ap, pursuedWhale.name)[0]!));
    s = settle(s);
    for (const p of s.turnOrder.filter((p) => p !== ap)) {
      const t = named(s, p, "Pirate Token");
      expect(t.length).toBe(1);
      expect(cantBlockNow(s, s.objects[t[0]!]!)).toBe(true);
    }
    expect(named(s, ap, "Pirate Token").length).toBe(0);
  });

  it("Relic Robber: the damaged player gets a Goblin Construct that can't block and pings them each upkeep", () => {
    const { s: s0, ap, opp } = setup([]);
    const rr = putOnBattlefield(s0, ap, relicRobber);
    let s = attack(s0, ap, opp, [rr]);
    s = passUntil(s, "combatDamage", ap);
    s = settle(s);
    const t = named(s, opp, "Goblin Construct Token");
    expect(t.length).toBe(1);
    expect(cantBlockNow(s, s.objects[t[0]!]!)).toBe(true);
    const life = s.players[opp]!.life;
    s = passUntil(s, "upkeep", opp);
    s = settle(s);
    expect(s.players[opp]!.life).toBe(life - 1);
  });
});
