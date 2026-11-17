// Lane B round B241: Wiretapping (a trigger on the first card you draw during your draw step, then the hideaway card
// played for free with nine or more cards in hand), Frantic Scapegoat (its suspicion passed to a creature entering
// under your control), Lucius the Eternal (exiled when it dies until the target opponent's creature leaves the
// battlefield) and Risky Move (each player taking it at their upkeep, then a coin flip for one of their creatures).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, controllerOf, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const wiretapping = (): CardDef => ({"oracleId":"befc5986-f06c-40a4-98ee-ffcace4ceaa8","name":"Wiretapping","manaCost":"{4}{U}","cmc":5,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Hideaway 5 (When this enchantment enters, look at the top five cards of your library, exile one face down, then put the rest on the bottom in a random order.)\nWhenever you draw your first card during each of your draw steps, draw a card. Then if you have nine or more cards in hand, you may play the exiled card without paying its mana cost.","colors":["U"],"colorIdentity":["U"],"keywords":["Hideaway"],"imageUrl":"https://cards.scryfall.io/normal/front/8/5/859ed6fc-1f9a-428d-82d8-8e4b5bae6d5a.jpg?1783923136","artUrl":"https://cards.scryfall.io/art_crop/front/8/5/859ed6fc-1f9a-428d-82d8-8e4b5bae6d5a.jpg?1783923136","commanderLegal":"legal","set":"snc","releasedAt":"2022-04-29","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const franticScapegoat = (): CardDef => ({"oracleId":"d181310f-404b-4f26-8024-b7b537d1fd90","name":"Frantic Scapegoat","manaCost":"{R}","cmc":1,"typeLine":"Creature — Goat","supertypes":[],"types":["Creature"],"subtypes":["Goat"],"oracleText":"Haste\nWhen this creature enters, suspect it. (It has menace and can't block.)\nWhenever one or more other creatures you control enter, if this creature is suspected, you may suspect one of the other creatures. If you do, this creature is no longer suspected.","power":"1","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":["Suspect","Haste"],"imageUrl":"https://cards.scryfall.io/normal/front/3/a/3ae07b33-dcee-41aa-9886-38336d2aff7a.jpg?1783912791","artUrl":"https://cards.scryfall.io/art_crop/front/3/a/3ae07b33-dcee-41aa-9886-38336d2aff7a.jpg?1783912791","commanderLegal":"legal","set":"mkm","releasedAt":"2024-02-09","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const lucius = (): CardDef => ({"oracleId":"fa726aac-f4ae-4e34-ac08-36c1f50215f3","name":"Lucius the Eternal","manaCost":"{3}{B}{R}","cmc":5,"typeLine":"Legendary Creature — Astartes Warrior","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Astartes","Warrior"],"oracleText":"Haste\nArmour of Shrieking Souls — When Lucius the Eternal dies, exile it and choose target creature an opponent controls. When that creature leaves the battlefield, return this card from exile to the battlefield under its owner's control.","power":"5","toughness":"3","colors":["B","R"],"colorIdentity":["B","R"],"keywords":["Armour of Shrieking Souls","Haste"],"imageUrl":"https://cards.scryfall.io/normal/front/6/b/6b86f229-0cbd-4d32-a1dc-ea4b24f835f2.jpg?1783920843","artUrl":"https://cards.scryfall.io/art_crop/front/6/b/6b86f229-0cbd-4d32-a1dc-ea4b24f835f2.jpg?1783920843","commanderLegal":"legal","set":"40k","releasedAt":"2022-10-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const riskyMove = (): CardDef => ({"oracleId":"1a4c03ab-519a-4840-893a-769dfc5cf161","name":"Risky Move","manaCost":"{3}{R}{R}{R}","cmc":6,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of each player's upkeep, that player gains control of this enchantment.\nWhen you gain control of this enchantment from another player, choose a creature you control and an opponent. Flip a coin. If you lose the flip, that opponent gains control of that creature.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/b/0b09315c-d6ff-4fdb-8774-c6402b45e959.jpg?1783945050","artUrl":"https://cards.scryfall.io/art_crop/front/0/b/0b09315c-d6ff-4fdb-8774-c6402b45e959.jpg?1783945050","commanderLegal":"legal","set":"ons","releasedAt":"2002-10-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const unsummon = (): CardDef => ({"oracleId":"837182db-1bf3-4a2c-bd01-1af9d9873561","name":"Unsummon","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Return target creature to its owner's hand.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddad9f16-52d5-49de-82b0-b1a5294a9c44.jpg?1789556722","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddad9f16-52d5-49de-82b0-b1a5294a9c44.jpg?1789556722","commanderLegal":"legal","set":"fra","releasedAt":"2026-10-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const murder = (): CardDef => ({"oracleId":"938b4e2c-88d9-4637-bc00-e228920c9a78","name":"Murder","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target creature.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","artUrl":"https://cards.scryfall.io/art_crop/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const airtightAlibi = (): CardDef => ({"oracleId":"cb666ea8-55e3-4e27-ae6d-806677dfc17a","name":"Airtight Alibi","manaCost":"{2}{G}","cmc":3,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Flash\nEnchant creature\nWhen this Aura enters, untap enchanted creature. It gains hexproof until end of turn. If it's suspected, it's no longer suspected.\nEnchanted creature gets +2/+2 and can't become suspected.","colors":["G"],"colorIdentity":["G"],"keywords":["Enchant","Flash"],"imageUrl":"https://cards.scryfall.io/normal/front/b/f/bffbbe21-0a1d-48b9-903e-81c109aa11de.jpg?1783912873","artUrl":"https://cards.scryfall.io/art_crop/front/b/f/bffbbe21-0a1d-48b9-903e-81c109aa11de.jpg?1783912873","commanderLegal":"legal","set":"mkm","releasedAt":"2024-02-09","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const actOfTreason = (): CardDef => ({"oracleId":"9d08af23-9f4a-4097-9abc-3b17475ab744","name":"Act of Treason","manaCost":"{2}{R}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Gain control of target creature until end of turn. Untap that creature. It gains haste until end of turn. (It can attack and {T} this turn.)","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/f/1f2328c4-7344-48bf-b515-977499bcfd1c.jpg?1783933686","artUrl":"https://cards.scryfall.io/art_crop/front/1/f/1f2328c4-7344-48bf-b515-977499bcfd1c.jpg?1783933686","commanderLegal":"legal","set":"rna","releasedAt":"2019-01-25","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty or a question is asked; bots answer the questions of anyone but `me`. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && me !== undefined && p.player === me) return s;
    if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
/** A card put into `pid`'s `where` (the top of a library, the hand). */
const into = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  return id;
};

describe("Lane B round B241", () => {
  it("are fully supported", () => supported(wiretapping(), franticScapegoat(), lucius(), riskyMove()));
});

describe("Lane B round B241: Wiretapping", () => {
  /** You cast Wiretapping and hide away the Grizzly Bears on top of your library; then on to your next upkeep with `hand` cards in hand. */
  const game = (hand: number) => {
    const { s: s0, ap } = setup([]);
    s0.players[ap]!.hand = [];
    const wire = into(s0, ap, wiretapping(), "hand");
    const bears = into(s0, ap, grizzlyBears(), "library");
    let s = settle(run(s0, planCast(s0, ap, wire)), ap);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, source: "Wiretapping" });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [bears] }), ap);
    expect(zone(s, bears)).toBe("exile");
    s = passUntil(s, "upkeep", ap);
    s.players[ap]!.hand = [];
    for (let i = 0; i < hand; i++) into(s, ap, lightningBolt(), "hand");
    return { s, ap, wire, bears };
  };

  it("draws a card on your draw step and, with nine cards in hand, casts the hidden card for free", () => {
    const { s: s0, ap, bears } = game(7);
    let s = settle(passUntil(s0, "draw", ap), ap);
    // The turn's draw (8 cards), Wiretapping's draw (9): the Bears may be cast without paying its mana cost.
    expect(s.players[ap]!.hand.length).toBe(9);
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: bears, source: "Wiretapping" });
    s = settle(act(s, { type: "castSpell", player: ap, objectId: bears }), ap);
    expect(zone(s, bears)).toBe("battlefield");
    expect(s.players[ap]!.hand.length).toBe(9);
  });

  it("with fewer than nine cards in hand it only draws, and the card stays hidden", () => {
    const { s: s0, ap, bears } = game(6);
    const s = settle(passUntil(s0, "draw", ap), ap);
    expect(s.pending).toBeFalsy();
    expect(s.players[ap]!.hand.length).toBe(8);
    expect(zone(s, bears)).toBe("exile");
  });

  it("only the first card you draw in your own draw step triggers it", () => {
    const { s: s0, ap } = game(0);
    let s = settle(passUntil(s0, "draw", ap), ap);
    // The turn's draw and Wiretapping's draw, once: its own draw isn't the first.
    expect(s.players[ap]!.hand.length).toBe(2);
    const triggers = (st: GameState) => st.log.filter((l) => l.text.startsWith("Wiretapping's ability triggers (draw a card")).length;
    expect(triggers(s)).toBe(1);
    // A draw in your main phase doesn't trigger it.
    s = passUntil(s, "main1", ap);
    const div = into(s, ap, divination(), "hand");
    s = settle(run(s, planCast(s, ap, div)), ap);
    expect(s.players[ap]!.hand.length).toBe(4);
    expect(triggers(s)).toBe(1);
    // Nor does the next player's draw step.
    const next = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    s = settle(passUntil(s, "main1", next), ap);
    expect(triggers(s)).toBe(1);
  });
});

describe("Lane B round B241: Frantic Scapegoat", () => {
  /** You cast Frantic Scapegoat (suspected as it enters), with Grizzly Bears in hand. */
  const game = () => {
    const { s: s0, ap } = setup([]);
    s0.players[ap]!.hand = [];
    const goat = into(s0, ap, franticScapegoat(), "hand");
    const bears = into(s0, ap, grizzlyBears(), "hand");
    const s = settle(run(s0, planCast(s0, ap, goat)), ap);
    expect(s.objects[goat]!.suspected).toBeDefined();
    return { s, ap, goat, bears };
  };

  it("passes its suspicion to a creature entering under your control", () => {
    const { s: s0, ap, goat, bears } = game();
    let s = settle(run(s0, planCast(s0, ap, bears)), ap);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "choose", options: [bears], min: 0, count: 1 });
    // A bot can answer it too.
    expect(botActions(s, ap).length).toBeGreaterThan(0);
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [bears] }), ap);
    expect(s.objects[bears]!.suspected).toBeDefined();
    expect(s.objects[goat]!.suspected).toBeUndefined();
  });

  it("may keep it: choosing none leaves Frantic Scapegoat suspected", () => {
    const { s: s0, ap, goat, bears } = game();
    let s = settle(run(s0, planCast(s0, ap, bears)), ap);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap });
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [] }), ap);
    expect(s.objects[bears]!.suspected).toBeUndefined();
    expect(s.objects[goat]!.suspected).toBeDefined();
  });

  it("doesn't trigger once it's no longer suspected (an intervening if)", () => {
    const { s: s0, ap, goat, bears } = game();
    s0.objects[goat]!.suspected = undefined;
    const s = settle(run(s0, planCast(s0, ap, bears)), ap);
    expect(s.pending).toBeFalsy();
    expect(s.objects[bears]!.suspected).toBeUndefined();
  });

  it("offers only a creature that can become suspected", () => {
    const { s: s0, ap, goat, bears } = game();
    let s = run(s0, planCast(s0, ap, bears));
    // The Bears resolve; Frantic Scapegoat's trigger is on the stack.
    for (let i = 0; i < 20 && !s.stack.some((x) => x.description.includes("suspect one of the other creatures")); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(zone(s, bears)).toBe("battlefield");
    // Something suspects the Bears first: a suspected permanent can't become suspected again (CR 701.60d), so there's
    // nothing to choose and Frantic Scapegoat stays suspected.
    s.objects[bears]!.suspected = s.nextTimestamp++;
    s = settle(s, ap);
    expect(s.pending).toBeFalsy();
    expect(s.objects[goat]!.suspected).toBeDefined();
  });
});

describe("Lane B round B241: Lucius the Eternal", () => {
  /** Lucius on your battlefield, Grizzly Bears on the next player's; Murder and Unsummon in your hand. */
  const game = () => {
    const { s, ap, opp } = setup([]);
    s.players[ap]!.hand = [];
    const luc = putOnBattlefield(s, ap, lucius());
    const theirs = putOnBattlefield(s, opp, grizzlyBears());
    const murder = into(s, ap, murder_(), "hand");
    const unsummonId = into(s, ap, unsummon(), "hand");
    return { s, ap, opp, luc, theirs, murder, unsummonId };
  };
  const murder_ = murder;

  /** Murder Lucius; its dies trigger targets the opponent's Bears. */
  const kill = (s0: GameState, ap: PlayerId, luc: string, murderId: string, theirs: string) => {
    let s = settle(run(s0, planCast(s0, ap, murderId, [tgt(luc)])), ap);
    expect(zone(s, luc)).toBe("graveyard");
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(theirs)] });
    return s;
  };

  it("is exiled when it dies, and returns when the target creature leaves the battlefield", () => {
    const { s: s0, ap, luc, theirs, murder: m, unsummonId } = game();
    let s = settle(kill(s0, ap, luc, m, theirs), ap);
    expect(zone(s, luc)).toBe("exile");
    // Later, the Bears go back to their owner's hand: Lucius returns under its owner's control.
    s = settle(run(s, planCast(s, ap, unsummonId, [tgt(theirs)])), ap);
    expect(zone(s, theirs)).toBe("hand");
    expect(zone(s, luc)).toBe("battlefield");
    expect(controllerOf(s, s.objects[luc]!)).toBe(ap);
  });

  it("stays in the graveyard if the target leaves before its ability resolves", () => {
    const { s: s0, ap, luc, theirs, murder: m, unsummonId } = game();
    let s = kill(s0, ap, luc, m, theirs);
    // The trigger is on the stack; you respond by returning the Bears.
    expect(s.stack.length).toBe(1);
    s = settle(run(s, planCast(s, ap, unsummonId, [tgt(theirs)])), ap);
    expect(zone(s, theirs)).toBe("hand");
    expect(zone(s, luc)).toBe("graveyard");
  });

  it("isn't exiled or returned if it has left the graveyard before its ability resolves", () => {
    const { s: s0, ap, luc, theirs, murder: m, unsummonId } = game();
    let s = kill(s0, ap, luc, m, theirs);
    // Put into its owner's hand in response (a new object, CR 400.7).
    const p = s.players[ap]!;
    p.graveyard.splice(p.graveyard.indexOf(luc), 1);
    p.hand.push(luc);
    s.objects[luc]!.zone = "hand";
    s.objects[luc]!.zoneChanges = (s.objects[luc]!.zoneChanges ?? 0) + 1;
    s = settle(s, ap);
    expect(zone(s, luc)).toBe("hand");
    expect((s.delayed ?? []).some((d) => d.subject.id === theirs)).toBe(false);
    s = settle(run(s, planCast(s, ap, unsummonId, [tgt(theirs)])), ap);
    expect(zone(s, luc)).toBe("hand");
  });
});

describe("Lane B round B241: Risky Move", () => {
  it("each player takes it at their upkeep; the new controller chooses a creature and an opponent and flips a coin", () => {
    const { s: s0, ap, opp } = setup([]);
    const move = putOnBattlefield(s0, ap, riskyMove());
    const oppBears = putOnBattlefield(s0, opp, grizzlyBears());
    // Entering under your control isn't gaining control of it, and your own upkeep changes nothing.
    expect(s0.log.some((l) => l.text.includes("Risky Move's ability triggers"))).toBe(false);
    let s = passUntil(s0, "upkeep", opp);
    s = settle(s);
    expect(controllerOf(s, s.objects[move]!)).toBe(opp);
    const gained = s.log.filter((l) => l.text.startsWith("Risky Move's ability triggers (choose a creature you control"));
    expect(gained.length).toBe(1);
    const flips = s.log.filter((l) => /flips? a coin|wins the flip|loses the flip/.test(l.text));
    expect(flips.length).toBeGreaterThan(0);
    // The only creature the new controller controls is the Bears: theirs still if they won, an opponent's if they lost.
    const lost = s.log.some((l) => /loses the flip/.test(l.text));
    if (lost) expect(controllerOf(s, s.objects[oppBears]!)).not.toBe(opp);
    else expect(controllerOf(s, s.objects[oppBears]!)).toBe(opp);
  });

  it("a lost flip gives the creature to the chosen opponent for good", () => {
    // Try seeds until the new controller loses the flip.
    for (let seed = 1; seed < 40; seed++) {
      const { s: s0, ap, opp } = setup([], seed);
      const move = putOnBattlefield(s0, ap, riskyMove());
      const oppBears = putOnBattlefield(s0, opp, grizzlyBears());
      let s = settle(passUntil(s0, "upkeep", opp));
      expect(controllerOf(s, s.objects[move]!)).toBe(opp);
      if (!s.log.some((l) => /loses the flip/.test(l.text))) continue;
      const to = controllerOf(s, s.objects[oppBears]!);
      expect(to).not.toBe(opp);
      // Still theirs after the turn ends, and after Risky Move leaves the battlefield (rulings).
      s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(opp) + 1) % 4]!);
      s = settle(s);
      expect(controllerOf(s, s.objects[oppBears]!)).toBe(to);
      return;
    }
    throw new Error("no lost flip in 40 seeds");
  });
});
