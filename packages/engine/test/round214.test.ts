// Round 214: Tyrant of Discord, Shiko, Green Dragon, Abeyance, Rigo, Vrestin, the "instant, sorcery or Adventure card"
// counts (Frantic Firebolt, Hearth Elemental, Candlekeep Inspiration, Sailors' Bane) and others (fresh cards around
// EDHREC ranks 11,000 to 14,200).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilityProblem, applyAction, castProblem, characteristics, closeZoneBatch, dealDamage, destroyPermanent, objectSource, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, power, spellCost, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

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
/** Passes until a trigger asks for its targets (or the stack is empty). */
const untilTargets = (s: GameState) => {
  for (let i = 0; i < 50 && s.pending?.kind !== "chooseTargets" && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: true });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const pt = (s: GameState, id: ObjectId) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const nameOf = (s: GameState, id: ObjectId) => s.cards[s.objects[id]!.cardId]!.name;
/** Attacks `defender` with `attackers` and passes to the combat damage step's triggers. */
const attack = (s: GameState, ap: PlayerId, attacks: { attacker: ObjectId; defender: PlayerId; planeswalker?: ObjectId }[]) => {
  s = passUntil(s, "declareAttackers", ap);
  return act(s, { type: "declareAttackers", player: ap, attacks });
};
const toDamage = (s: GameState) => {
  for (let i = 0; i < 200 && s.step !== "combatDamage"; i++) {
    if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
    else if (s.pending) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};

const giantGrowth = card("Giant Growth", "Instant", "{G}", { oracleText: "Target creature gets +3/+3 until end of turn." });

// Real oracle text (Scryfall).
const mezzioMugger = card("Mezzio Mugger", "Creature — Lizard Rogue", "{4}{R}", {"cmc":5,"oracleText":"Whenever this creature attacks, exile the top card of each player's library. You may play those cards this turn, and you may spend mana as though it were mana of any color to cast those spells.\nBlitz {2}{R} (If you cast this spell for its blitz cost, it gains haste and \"When this creature dies, draw a card.\" Sacrifice it at the beginning of the next end step.)","power":"3","toughness":"3","keywords":["Blitz"]});
const lidlessGaze = card("Lidless Gaze", "Sorcery", "{2}{B}{R}", {"cmc":4,"oracleText":"Exile the top card of each player's library. Until the end of your next turn, you may play those cards, and mana of any type can be spent to cast those spells.\nFlashback {2}{B}{R} (You may cast this card from your graveyard for its flashback cost. Then exile it.)","keywords":["Flashback"]});
const dreamPillager = card("Dream Pillager", "Creature — Dragon", "{5}{R}{R}", {"cmc":7,"oracleText":"Flying\nWhenever this creature deals combat damage to a player, exile that many cards from the top of your library. Until end of turn, you may cast spells from among those exiled cards.","power":"4","toughness":"4","keywords":["Flying"]});
const nurglesConscription = card("Nurgle's Conscription", "Instant", "{4}{B}", {"cmc":5,"oracleText":"Put target creature card from an opponent's graveyard onto the battlefield tapped under your control, then exile that player's graveyard.","keywords":[]});
const tyrantOfDiscord = card("Tyrant of Discord", "Creature — Elemental", "{4}{R}{R}{R}", {"cmc":7,"oracleText":"When this creature enters, target opponent chooses a permanent they control at random and sacrifices it. If a nonland permanent is sacrificed this way, repeat this process.","power":"7","toughness":"7","keywords":[]});
const shiko = card("Shiko, Paragon of the Way", "Legendary Creature — Spirit Dragon", "{2}{U}{R}{W}", {"cmc":5,"oracleText":"Flying, vigilance\nWhen Shiko enters, exile target nonland card with mana value 3 or less from your graveyard. Copy it, then you may cast the copy without paying its mana cost. (A copy of a permanent spell becomes a token.)","power":"4","toughness":"5","keywords":["Flying","Vigilance"]});
const flowerfootSwordmaster = card("Flowerfoot Swordmaster", "Creature — Mouse Soldier", "{W}", {"cmc":1,"oracleText":"Offspring {2} (You may pay an additional {2} as you cast this spell. If you do, when this creature enters, create a 1/1 token copy of it.)\nValiant — Whenever this creature becomes the target of a spell or ability you control for the first time each turn, Mice you control get +1/+0 until end of turn.","power":"1","toughness":"2","keywords":["Offspring","Valiant"]});
const rigo = card("Rigo, Streetwise Mentor", "Legendary Creature — Cat Citizen", "{G/W}{W}{W/U}", {"cmc":3,"oracleText":"Rigo enters with a shield counter on it. (If it would be dealt damage or destroyed, remove a shield counter from it instead.)\nWhenever you attack a player or planeswalker with one or more creatures with power 1 or less, draw a card.","power":"2","toughness":"2","keywords":[]});
const vrestin = card("Vrestin, Menoptra Leader", "Legendary Creature — Alien Insect Scout", "{X}{G}{G}{W}", {"cmc":3,"oracleText":"Flying\nVrestin enters with X +1/+1 counters on it.\nWhen Vrestin enters, create X 1/1 green and white Alien Insect creature tokens with flying.\nWhenever you attack with one or more Insects, put a +1/+1 counter on each of them.","power":"0","toughness":"0","keywords":["Flying"]});
const scoutsWarning = card("Scout's Warning", "Instant", "{W}", {"cmc":1,"oracleText":"The next creature card you play this turn can be played as though it had flash.\nDraw a card.","keywords":[]});
const abeyance = card("Abeyance", "Instant", "{1}{W}", {"cmc":2,"oracleText":"Until end of turn, target player can't cast instant or sorcery spells, and that player can't activate abilities that aren't mana abilities.\nDraw a card.","keywords":[]});
const franticFirebolt = card("Frantic Firebolt", "Instant", "{2}{R}", {"cmc":3,"oracleText":"Frantic Firebolt deals X damage to target creature, where X is 2 plus the number of cards in your graveyard that are instant cards, sorcery cards, and/or have an Adventure.","keywords":[]});
const hearthElemental = card("Hearth Elemental // Stoke Genius", "Creature — Elemental // Sorcery — Adventure", "{5}{R} // {1}{R}", {"cmc":6,"oracleText":"This spell costs {X} less to cast, where X is the number of cards in your graveyard that are instant cards, sorcery cards, and/or have an Adventure.","power":"4","toughness":"5","keywords":[],"layout":"adventure","faces":[{"name":"Hearth Elemental","manaCost":"{5}{R}","typeLine":"Creature — Elemental","supertypes":[],"types":["Creature"],"subtypes":["Elemental"],"oracleText":"This spell costs {X} less to cast, where X is the number of cards in your graveyard that are instant cards, sorcery cards, and/or have an Adventure.","power":"4","toughness":"5","colors":["R"]},{"name":"Stoke Genius","manaCost":"{1}{R}","typeLine":"Sorcery — Adventure","supertypes":[],"types":["Sorcery"],"subtypes":["Adventure"],"oracleText":"Discard your hand, then draw two cards. (Then exile this card. You may cast the creature later from exile.)","colors":["R"]}]});
const candlekeepInspiration = card("Candlekeep Inspiration", "Sorcery", "{4}{U}", {"cmc":5,"oracleText":"Until end of turn, creatures you control have base power and toughness X/X, where X is the number of cards you own in exile and in your graveyard that are instant cards, are sorcery cards, and/or have an Adventure.","keywords":[]});
const sailorsBane = card("Sailors' Bane", "Creature — Dragon Turtle", "{7}{U}{U}", {"cmc":9,"oracleText":"This spell costs {1} less to cast for each card you own in exile and in your graveyard that's an instant card, a sorcery card, or a card that has an Adventure.\nWard {4} (Whenever this creature becomes the target of a spell or ability an opponent controls, counter it unless that player pays {4}.)","power":"7","toughness":"7","keywords":["Ward"]});
const queensBayPaladin = card("Queen's Bay Paladin", "Creature — Vampire Knight", "{3}{B}{B}", {"cmc":5,"oracleText":"Whenever this creature enters or attacks, return up to one target Vampire card from your graveyard to the battlefield with a finality counter on it. You lose life equal to its mana value. (If a creature with a finality counter on it would die, exile it instead.)","power":"5","toughness":"4","keywords":[]});
const dutifulReplicator = card("Dutiful Replicator", "Artifact Creature — Assembly-Worker", "{3}", {"cmc":3,"oracleText":"When this creature enters, you may pay {1}. When you do, create a token that's a copy of target token you control not named Dutiful Replicator.","power":"3","toughness":"2","keywords":[]});
const leatherhead = card("Leatherhead, Swamp Stalker", "Legendary Creature — Crocodile Mutant Rogue", "{2}{G}{G}", {"cmc":4,"oracleText":"Trample\nLeatherhead enters with a hexproof counter on her.\nWhenever Leatherhead deals combat damage to a player, you may remove a counter from her. When you do, destroy target artifact or enchantment that player controls.","power":"5","toughness":"4","keywords":["Trample"]});
const talusPaladin = card("Talus Paladin", "Creature — Human Knight Ally", "{3}{W}", {"cmc":4,"oracleText":"Whenever this creature or another Ally you control enters, you may have Allies you control gain lifelink until end of turn, and you may put a +1/+1 counter on this creature.","power":"2","toughness":"3","keywords":[]});
const nantukoCultivator = card("Nantuko Cultivator", "Creature — Insect Druid", "{3}{G}", {"cmc":4,"oracleText":"When this creature enters, you may discard any number of land cards. Put that many +1/+1 counters on this creature and draw that many cards.","power":"2","toughness":"2","keywords":[]});
const mindMaggots = card("Mind Maggots", "Creature — Insect", "{3}{B}", {"cmc":4,"oracleText":"When this creature enters, discard any number of creature cards. For each card discarded this way, put two +1/+1 counters on this creature.","power":"2","toughness":"2","keywords":[]});
const acornCatapult = card("Acorn Catapult", "Artifact", "{4}", {"cmc":4,"oracleText":"{1}, {T}: This artifact deals 1 damage to any target. That permanent's controller or that player creates a 1/1 green Squirrel creature token.","keywords":[]});
const gamekeeper = card("Gamekeeper", "Creature — Elf", "{3}{G}", {"cmc":4,"oracleText":"When this creature dies, you may exile it. If you do, reveal cards from the top of your library until you reveal a creature card. Put that card onto the battlefield and put all other cards revealed this way into your graveyard.","power":"2","toughness":"2","keywords":[]});
const greenDragon = card("Green Dragon", "Creature — Dragon", "{4}{G}{G}", {"cmc":6,"oracleText":"Flying\nPoison Breath — When this creature enters, until end of turn, whenever a creature an opponent controls is dealt damage, destroy it.","power":"4","toughness":"4","keywords":["Flying"]});
const crosis = card("Crosis, the Purger", "Legendary Creature — Dragon", "{3}{U}{B}{R}", {"cmc":6,"oracleText":"Flying\nWhenever Crosis deals combat damage to a player, you may pay {2}{B}. If you do, choose a color, then that player reveals their hand and discards all cards of that color.","power":"6","toughness":"6","keywords":["Flying"]});
// Supported as a side effect of this round's templates.
const carrionLocust = card("Carrion Locust", "Creature — Insect Horror", "{2}{B}", {"cmc":3,"oracleText":"Flying\nWhen this creature enters, exile target card from an opponent's graveyard. If it was a creature card, that player loses 1 life.","power":"2","toughness":"1","keywords":["Flying"]});
const orah = card("Orah, Skyclave Hierophant", "Legendary Creature — Kor Cleric", "{2}{W}{B}", {"cmc":4,"oracleText":"Lifelink\nWhenever Orah or another Cleric you control dies, return target Cleric card with lesser mana value from your graveyard to the battlefield.","power":"3","toughness":"3","keywords":["Lifelink"]});
const rotHulk = card("Rot Hulk", "Creature — Zombie", "{5}{B}{B}", {"cmc":7,"oracleText":"Menace\nWhen this creature enters, return up to X target Zombie cards from your graveyard to the battlefield, where X is the number of opponents you have.","power":"5","toughness":"5","keywords":["Menace"]});
const shrivelingRot = card("Shriveling Rot", "Instant", "{2}{B}{B}", {"cmc":4,"oracleText":"Choose one —\n• Until end of turn, whenever a creature is dealt damage, destroy it.\n• Until end of turn, whenever a creature dies, that creature's controller loses life equal to its toughness.\nEntwine {2}{B} (Choose both if you pay the entwine cost.)","keywords":["Entwine"]});
const slumberingWalker = card("Slumbering Walker", "Creature — Giant Warrior", "{3}{W}{W}", {"cmc":5,"oracleText":"This creature enters with two -1/-1 counters on it.\nAt the beginning of your end step, you may remove a counter from this creature. When you do, return target creature card with power 2 or less from your graveyard to the battlefield.","power":"4","toughness":"7","keywords":[]});
const sisterHospitaller = card("Sister Hospitaller", "Creature — Human Cleric", "{4}{W}{B}", {"cmc":6,"oracleText":"Medicus Ministorum — When this creature enters, return target creature card from your graveyard to the battlefield. You gain life equal to its mana value.","power":"3","toughness":"2","keywords":["Medicus Ministorum"]});

describe("round 214 cards", () => {
  it("compile", () =>
    supported(mezzioMugger, lidlessGaze, dreamPillager, nurglesConscription, tyrantOfDiscord, shiko, flowerfootSwordmaster, rigo, vrestin, scoutsWarning, abeyance, franticFirebolt, hearthElemental, candlekeepInspiration, sailorsBane, queensBayPaladin, dutifulReplicator, leatherhead, talusPaladin, nantukoCultivator, mindMaggots, acornCatapult, gamekeeper, greenDragon, crosis, carrionLocust, orah, rotHulk, shrivelingRot, slumberingWalker, sisterHospitaller));
});

describe("Mezzio Mugger and Lidless Gaze", () => {
  it("Mezzio Mugger: attacking exiles the top card of each player's library, playable this turn with mana of any type", () => {
    const { s: s0, ap, opp } = setup([]);
    const m = putOnBattlefield(s0, ap, mezzioMugger);
    const tops = s0.turnOrder.map((p) => s0.players[p]!.library[0]!);
    const s = settle(attack(s0, ap, [{ attacker: m, defender: opp }]));
    for (const id of tops) {
      expect(zone(s, id)).toBe("exile");
      expect(s.objects[id]!.mayPlay).toMatchObject({ player: ap, until: "thisTurn", anyType: true });
    }
  });

  it("Lidless Gaze: until the end of your next turn", () => {
    const { s: s0, ap, ids } = setup([lidlessGaze]);
    const tops = s0.turnOrder.map((p) => s0.players[p]!.library[0]!);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    for (const id of tops) expect(s.objects[id]!.mayPlay).toMatchObject({ player: ap, until: "nextTurn", anyType: true });
  });
});

describe("Dream Pillager", () => {
  it("combat damage exiles that many cards from the top of your library; you may cast spells (not play lands) from among them this turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const d = putOnBattlefield(s0, ap, dreamPillager);
    const tops = s0.players[ap]!.library.slice(0, 4);
    const s = settle(toDamage(attack(s0, ap, [{ attacker: d, defender: opp }])));
    expect(s.players[opp]!.life).toBe(36);
    for (const id of tops) {
      expect(zone(s, id)).toBe("exile");
      expect(s.objects[id]!.mayPlay).toMatchObject({ player: ap, until: "thisTurn", castOnly: true });
    }
    expect(zone(s, s.players[ap]!.library[0]!)).toBe("library");
  });
});

describe("Nurgle's Conscription", () => {
  it("puts the creature card onto the battlefield tapped under your control, then exiles its owner's graveyard", () => {
    const { s: s0, ap, ids, opp } = setup([nurglesConscription]);
    const b = into(s0, opp, bear({ name: "Their Bear" }), "graveyard");
    const other = into(s0, opp, card("Old Spell", "Sorcery", "{1}"), "graveyard");
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])));
    expect(zone(s, b)).toBe("battlefield");
    expect(s.objects[b]!.controller).toBe(ap);
    expect(s.objects[b]!.tapped).toBe(true);
    expect(zone(s, other)).toBe("exile");
    expect(s.players[opp]!.graveyard).toHaveLength(0);
  });
});

describe("Tyrant of Discord", () => {
  const go = (theirs: CardDef[]) => {
    const { s: s0, ap, ids, opp } = setup([tyrantOfDiscord]);
    const perms = theirs.map((d) => putOnBattlefield(s0, opp, d));
    let s = untilTargets(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(s, { targets: [{ kind: "player", id: opp }] });
    return { s, perms };
  };

  it("nonland permanents sacrificed at random repeat the process until a land is sacrificed or none is left", () => {
    const { s, perms } = go([bear(), bear({ name: "Bear Two" }), card("Relic", "Artifact", "{1}")]);
    for (const id of perms) expect(zone(s, id)).toBe("graveyard");
  });

  it("a land sacrificed ends it", () => {
    const { s, perms } = go([card("Their Land", "Land"), card("Other Land", "Land")]);
    expect(perms.filter((id) => zone(s, id) === "graveyard")).toHaveLength(1);
  });
});

describe("Shiko, Paragon of the Way", () => {
  it("exiles a nonland card with mana value 3 or less from your graveyard; you may cast a copy of it free", () => {
    const { s: s0, ap, ids } = setup([shiko]);
    const div = into(s0, ap, card("Divination", "Sorcery", "{2}{U}", { cmc: 3, oracleText: "Draw two cards." }), "graveyard");
    const big = into(s0, ap, card("Big Spell", "Sorcery", "{3}{U}", { cmc: 4, oracleText: "Draw two cards." }), "graveyard");
    let s = untilTargets(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseTargets" });
    const hand = s.players[ap]!.hand.length;
    s = settle(s, { targets: [tgt(div)] });
    if (s.pending?.kind === "chooseOption") s = settle(act(s, { type: "chooseOption", player: ap, choice: s.pending.options[0]! }));
    expect(s.pending).toMatchObject({ kind: "castFree" });
    s = settle(act(s, { type: "castSpell", player: ap, objectId: (s.pending as { objectId: ObjectId }).objectId } as Action));
    expect(zone(s, div)).toBe("exile");
    expect(zone(s, big)).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
  });
});

describe("Flowerfoot Swordmaster", () => {
  it("valiant: Mice you control get +1/+0", () => {
    const { s: s0, ap, ids } = setup([giantGrowth]);
    const a = putOnBattlefield(s0, ap, flowerfootSwordmaster);
    const b = putOnBattlefield(s0, ap, flowerfootSwordmaster);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(a)])));
    expect(pt(s, a)).toBe("5/5");
    expect(pt(s, b)).toBe("2/2");
  });
});

describe("Rigo, Streetwise Mentor", () => {
  it("enters with a shield counter; draws once for each player and planeswalker attacked with a small creature", () => {
    const { s: s0, ap, ids, opp } = setup([rigo]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.counters.shield).toBe(1);
    const third = s.turnOrder.find((p) => p !== ap && p !== opp)!;
    const pw = putOnBattlefield(s, third, card("Walker", "Legendary Planeswalker — Jace", "{3}", { loyalty: "5" }));
    s.objects[pw]!.counters.loyalty = 5;
    const small = [0, 1, 2].map((i) => putOnBattlefield(s, ap, bear({ name: `Mouse ${i}`, power: "1", toughness: "1" })));
    const big = putOnBattlefield(s, ap, bear({ name: "Big Bear", power: "3" }));
    const fourth = s.turnOrder.find((p) => p !== ap && p !== opp && p !== third)!;
    const hand = s.players[ap]!.hand.length;
    s = settle(attack(s, ap, [{ attacker: small[0]!, defender: opp }, { attacker: small[1]!, defender: opp }, { attacker: small[2]!, defender: third, planeswalker: pw }, { attacker: big, defender: fourth }]));
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
  });
});

describe("Vrestin, Menoptra Leader", () => {
  it("X counters and X Insects; attacking Insects get a +1/+1 counter each", () => {
    const { s: s0, ap, ids, opp } = setup([vrestin]);
    const plan = planCast(s0, ap, ids[0]!, [], undefined, undefined, 2);
    let s = settle(run(s0, plan));
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(2);
    const insects = s.battlefield.filter((id) => s.objects[id]!.isToken && /Insect/.test(characteristics(s, s.objects[id]!).subtypes.join(" ")));
    expect(insects).toHaveLength(2);
    const b = putOnBattlefield(s, ap, bear());
    for (const id of insects) s.objects[id]!.controlledSinceTurn = -1;
    s = settle(attack(s, ap, [{ attacker: insects[0]!, defender: opp }, { attacker: b, defender: opp }]));
    expect(s.objects[insects[0]!]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[insects[1]!]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(s.objects[b]!.counters["+1/+1"] ?? 0).toBe(0);
  });
});

describe("Scout's Warning", () => {
  it("the next creature spell you cast this turn can be cast as though it had flash", () => {
    const { s: s0, ap, ids } = setup([scoutsWarning, bear({ name: "Flash Bear" }), bear({ name: "Second Bear" })]);
    let s = passUntil(s0, "beginCombat", ap);
    expect(planCast(s, ap, ids[1]!)).toBeNull();
    s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = passUntil(s, "beginCombat", ap);
    expect(planCast(s, ap, ids[1]!)).not.toBeNull();
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(zone(s, ids[1]!)).toBe("battlefield");
    // Only the next one.
    expect(planCast(s, ap, ids[2]!)).toBeNull();
  });
});

describe("Abeyance", () => {
  it("the player can't cast instants or sorceries or activate abilities that aren't mana abilities this turn", () => {
    const { s: s0, ap, ids } = setup([abeyance, giantGrowth]);
    const pinger = putOnBattlefield(s0, ap, card("Pinger", "Artifact", "{1}", { oracleText: "{T}: You gain 1 life." }));
    expect(abilityProblem(s0, ap, pinger, 0)).toBeNull();
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: ap }])));
    expect(abilityProblem(s, ap, pinger, 0)).toMatch(/can't activate/);
    expect(castProblem(s, ap, ids[1]!, [tgt(pinger)])).toBeTruthy();
    expect(planCast(s, ap, ids[1]!, [tgt(putOnBattlefield(s, ap, bear()))])).toBeNull();
    // Mana abilities still work: a land can still be tapped for mana.
    const land = s.battlefield.find((id) => s.objects[id]!.controller === ap && nameOf(s, id) === "Forest" && !s.objects[id]!.tapped)!;
    expect(act(s, { type: "activateMana", player: ap, objectId: land, mana: "G" }).players[ap]!.manaPool.G).toBe(1);
    // Next turn it's over.
    const next = passUntil(s, "main1", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]);
    expect(abilityProblem(next, ap, pinger, 0) ?? "").not.toMatch(/can't activate/);
  });
});

describe("instant, sorcery or Adventure cards in your graveyard", () => {
  const stock = (s: GameState, ap: PlayerId) => {
    into(s, ap, card("Old Instant", "Instant", "{1}"), "graveyard");
    into(s, ap, card("Old Sorcery", "Sorcery", "{1}"), "graveyard");
    into(s, ap, hearthElemental, "graveyard"); // has an Adventure
    into(s, ap, bear({ name: "Dead Bear" }), "graveyard");
  };
  const generic = (c: { cost: { symbols: { kind: string; amount?: number }[] }; extra: number }) => c.extra + c.cost.symbols.reduce((n, x) => n + (x.kind === "generic" ? x.amount ?? 0 : 0), 0);

  it("Frantic Firebolt: 2 plus that many damage", () => {
    const { s: s0, ap, ids, opp } = setup([franticFirebolt]);
    stock(s0, ap);
    const big = putOnBattlefield(s0, opp, bear({ name: "Wall", power: "0", toughness: "9" }));
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(big)])));
    expect(s.objects[big]!.damage).toBe(5);
  });

  it("Hearth Elemental costs {X} less", () => {
    const { s, ap, ids } = setup([hearthElemental]);
    expect(generic(spellCost(s, ap, s.objects[ids[0]!]!))).toBe(5);
    stock(s, ap);
    expect(generic(spellCost(s, ap, s.objects[ids[0]!]!))).toBe(2);
  });

  it("Sailors' Bane and Candlekeep Inspiration count cards you own in exile too", () => {
    const { s: s0, ap, ids, opp } = setup([sailorsBane, candlekeepInspiration]);
    expect(generic(spellCost(s0, ap, s0.objects[ids[0]!]!))).toBe(7);
    stock(s0, ap);
    into(s0, ap, card("Exiled Instant", "Instant", "{1}"), "exile");
    into(s0, opp, card("Their Instant", "Instant", "{1}"), "exile"); // not yours
    expect(generic(spellCost(s0, ap, s0.objects[ids[0]!]!))).toBe(3);
    const b = putOnBattlefield(s0, ap, bear({ name: "Big", power: "7", toughness: "7" }));
    const s = settle(run(s0, planCast(s0, ap, ids[1]!)));
    expect(pt(s, b)).toBe("4/4");
  });
});

describe("Queen's Bay Paladin", () => {
  it("returns a Vampire card with a finality counter; you lose life equal to its mana value", () => {
    const { s: s0, ap, ids } = setup([queensBayPaladin]);
    const v = into(s0, ap, card("Old Vampire", "Creature — Vampire", "{2}{B}{B}", { cmc: 4, power: "3", toughness: "3" }), "graveyard");
    let s = untilTargets(run(s0, planCast(s0, ap, ids[0]!)));
    const life = s.players[ap]!.life;
    s = settle(s, { targets: [tgt(v)] });
    expect(zone(s, v)).toBe("battlefield");
    expect(s.objects[v]!.counters.finality).toBe(1);
    expect(s.players[ap]!.life).toBe(life - 4);
  });
});

describe("Dutiful Replicator", () => {
  it("pay {1}: a copy of a token you control not named Dutiful Replicator", () => {
    const { s: s0, ap, ids } = setup([dutifulReplicator]);
    const tok = putOnBattlefield(s0, ap, card("Robot", "Artifact Creature — Robot", "", { power: "2", toughness: "2" }));
    s0.objects[tok]!.isToken = true;
    const rep = putOnBattlefield(s0, ap, dutifulReplicator);
    s0.objects[rep]!.isToken = true;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s.players[ap]!.manaPool.G = 1;
    s = untilTargets(s);
    expect(s.pending).toMatchObject({ kind: "chooseTargets" });
    const spec = (s.pending as { specs: { notNamed?: string }[] }).specs[0]!;
    expect(spec.notNamed).toBe("Dutiful Replicator");
    s = settle(s, { targets: [tgt(tok)] });
    expect(s.battlefield.filter((id) => nameOf(s, id) === "Robot")).toHaveLength(2);
  });
});

describe("Leatherhead, Swamp Stalker", () => {
  it("combat damage: you may remove a counter from her; when you do, destroy an artifact or enchantment that player controls", () => {
    const { s: s0, ap, opp } = setup([]);
    const l = putOnBattlefield(s0, ap, leatherhead);
    s0.objects[l]!.counters.hexproof = 1;
    const relic = putOnBattlefield(s0, opp, card("Relic", "Artifact", "{1}"));
    let s = untilTargets(toDamage(attack(s0, ap, [{ attacker: l, defender: opp }])));
    expect(s.objects[l]!.counters.hexproof ?? 0).toBe(0);
    s = settle(s, { targets: [tgt(relic)] });
    expect(zone(s, relic)).toBe("graveyard");
  });

  it("with no counter on her, nothing", () => {
    const { s: s0, ap, opp } = setup([]);
    const l = putOnBattlefield(s0, ap, leatherhead);
    const relic = putOnBattlefield(s0, opp, card("Relic", "Artifact", "{1}"));
    const s = settle(toDamage(attack(s0, ap, [{ attacker: l, defender: opp }])), { targets: [tgt(relic)] });
    expect(zone(s, relic)).toBe("battlefield");
  });
});

describe("Crosis, the Purger", () => {
  it("pay {2}{B}: choose a color; that player reveals their hand and discards all cards of that color", () => {
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, ap, crosis);
    const red = into(s0, opp, card("Red Card", "Instant", "{R}"), "hand");
    const red2 = into(s0, opp, card("Red Card Two", "Sorcery", "{1}{R}"), "hand");
    const green = into(s0, opp, card("Green Card", "Instant", "{G}"), "hand");
    let s = toDamage(attack(s0, ap, [{ attacker: c, defender: opp }]));
    s.players[ap]!.manaPool.B = 3;
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseOption"; i++) {
      if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: ap, yes: true });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.pending).toMatchObject({ kind: "chooseOption" });
    const choice = (s.pending as { options: string[] }).options.find((o) => /^(R|red)$/i.test(o))!;
    s = settle(act(s, { type: "chooseOption", player: ap, choice }));
    expect(zone(s, red)).toBe("graveyard");
    expect(zone(s, red2)).toBe("graveyard");
    expect(zone(s, green)).toBe("hand");
  });
});

describe("Talus Paladin", () => {
  it("an Ally entering: Allies you control gain lifelink, and a +1/+1 counter on it", () => {
    const { s: s0, ap, ids } = setup([bear({ name: "Ally Bear", typeLine: "Creature — Bear Ally", subtypes: ["Bear", "Ally"] })]);
    const t = putOnBattlefield(s0, ap, talusPaladin);
    const other = putOnBattlefield(s0, ap, bear({ name: "Plain Bear" }));
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(objHasKeyword(s, s.objects[t]!, "Lifelink")).toBe(true);
    expect(objHasKeyword(s, s.objects[ids[0]!]!, "Lifelink")).toBe(true);
    expect(objHasKeyword(s, s.objects[other]!, "Lifelink")).toBe(false);
    expect(s.objects[t]!.counters["+1/+1"]).toBe(1);
  });
});

describe("Nantuko Cultivator and Mind Maggots", () => {
  it("Nantuko Cultivator: discard any number of land cards; that many +1/+1 counters and cards drawn", () => {
    const { s: s0, ap, ids } = setup([nantukoCultivator]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "discard", upTo: true });
    const lands = s.players[ap]!.hand.filter((id) => characteristics(s, s.objects[id]!).types.includes("Land")).slice(0, 2);
    expect(lands).toHaveLength(2);
    const hand = s.players[ap]!.hand.length;
    s = settle(act(s, { type: "discard", player: ap, objectIds: lands }));
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(2);
    expect(s.players[ap]!.hand.length).toBe(hand);
  });

  it("Mind Maggots: two +1/+1 counters for each creature card discarded", () => {
    const { s: s0, ap, ids } = setup([mindMaggots]);
    into(s0, ap, bear({ name: "Spare Bear" }), "hand");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "discard", upTo: true });
    const creatures = s.players[ap]!.hand.filter((id) => characteristics(s, s.objects[id]!).types.includes("Creature"));
    expect(() => act(s, { type: "discard", player: ap, objectIds: [s.players[ap]!.hand.find((id) => !creatures.includes(id))!] })).toThrow();
    s = settle(act(s, { type: "discard", player: ap, objectIds: creatures.slice(0, 1) }));
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(2);
  });
});

describe("Acorn Catapult", () => {
  it("that permanent's controller or that player creates a Squirrel", () => {
    for (const atPlayer of [false, true]) {
      const { s: s0, ap, opp } = setup([]);
      const cat = putOnBattlefield(s0, ap, acornCatapult);
      const b = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
      const s = settle(run(s0, planActivate(s0, ap, cat, 0, [atPlayer ? { kind: "player", id: opp } : tgt(b)])));
      const squirrels = s.battlefield.filter((id) => /Squirrel/.test(nameOf(s, id)));
      expect(squirrels).toHaveLength(1);
      expect(s.objects[squirrels[0]!]!.controller).toBe(opp);
      expect(atPlayer ? s.players[opp]!.life : s.objects[b]!.damage).toBe(atPlayer ? 39 : 1);
    }
  });
});

describe("Gamekeeper", () => {
  it("dies: exile it to reveal until a creature card, put it onto the battlefield and the rest into your graveyard", () => {
    const { s: s0, ap } = setup([]);
    const g = putOnBattlefield(s0, ap, gamekeeper);
    const beast = into(s0, ap, bear({ name: "Found Beast" }), "library");
    const a = into(s0, ap, card("Spell A", "Sorcery", "{1}"), "library");
    const b = into(s0, ap, card("Spell B", "Instant", "{1}"), "library");
    destroyPermanent(s0, s0.objects[g]!, "test");
    closeZoneBatch(s0);
    const s = settle(s0);
    expect(zone(s, g)).toBe("exile");
    expect(zone(s, beast)).toBe("battlefield");
    expect(zone(s, a)).toBe("graveyard");
    expect(zone(s, b)).toBe("graveyard");
  });

  it("not exiled: nothing revealed", () => {
    const { s: s0, ap } = setup([]);
    const g = putOnBattlefield(s0, ap, gamekeeper);
    const beast = into(s0, ap, bear({ name: "Found Beast" }), "library");
    destroyPermanent(s0, s0.objects[g]!, "test");
    closeZoneBatch(s0);
    const s = settle(s0, { may: false });
    expect(zone(s, g)).toBe("graveyard");
    expect(zone(s, beast)).toBe("library");
  });
});

describe("Green Dragon", () => {
  it("this turn, a creature an opponent controls dealt damage is destroyed", () => {
    const { s: s0, ap, ids, opp } = setup([greenDragon]);
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Wall", toughness: "9" }));
    const mine = putOnBattlefield(s0, ap, bear({ name: "My Wall", toughness: "9" }));
    const pinger = putOnBattlefield(s0, ap, card("Pinger", "Artifact", "{1}"));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    dealDamage(s, objectSource(s, s.objects[pinger]!), { object: s.objects[theirs]! }, 1);
    dealDamage(s, objectSource(s, s.objects[pinger]!), { object: s.objects[mine]! }, 1);
    s = settle(s);
    expect(zone(s, theirs)).toBe("graveyard");
    expect(zone(s, mine)).toBe("battlefield");
    // Next turn: over.
    const later = putOnBattlefield(s, opp, bear({ name: "Later Wall", toughness: "9" }));
    s = passUntil(s, "upkeep", opp);
    dealDamage(s, objectSource(s, s.objects[pinger]!), { object: s.objects[later]! }, 1);
    s = settle(s);
    expect(zone(s, later)).toBe("battlefield");
  });
});

describe("cards supported along the way", () => {
  it("Carrion Locust: a creature card exiled makes its owner lose 1 life", () => {
    for (const creature of [true, false]) {
      const { s: s0, ap, ids, opp } = setup([carrionLocust]);
      const c = into(s0, opp, creature ? bear({ name: "Their Bear" }) : card("Their Spell", "Sorcery", "{1}"), "graveyard");
      let s = untilTargets(run(s0, planCast(s0, ap, ids[0]!)));
      s = settle(s, { targets: [tgt(c)] });
      expect(zone(s, c)).toBe("exile");
      expect(s.players[opp]!.life).toBe(creature ? 39 : 40);
    }
  });

  it("Sister Hospitaller: you gain life equal to the returned card's mana value", () => {
    const { s: s0, ap, ids } = setup([sisterHospitaller]);
    const c = into(s0, ap, card("Old Giant", "Creature — Giant", "{3}{G}{G}", { cmc: 5, power: "5", toughness: "5" }), "graveyard");
    let s = untilTargets(run(s0, planCast(s0, ap, ids[0]!)));
    const life = s.players[ap]!.life;
    s = settle(s, { targets: [tgt(c)] });
    expect(zone(s, c)).toBe("battlefield");
    expect(s.players[ap]!.life).toBe(life + 5);
  });

  it("Shriveling Rot: until end of turn, a creature dealt damage is destroyed", () => {
    const { s: s0, ap, ids, opp } = setup([shrivelingRot]);
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Wall", toughness: "9" }));
    const pinger = putOnBattlefield(s0, ap, card("Pinger", "Artifact", "{1}"));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [], [0])));
    dealDamage(s, objectSource(s, s.objects[pinger]!), { object: s.objects[theirs]! }, 1);
    s = settle(s);
    expect(zone(s, theirs)).toBe("graveyard");
  });

  it("Orah: a Cleric dying returns a Cleric card with lesser mana value", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, orah);
    const dying = putOnBattlefield(s0, ap, card("Big Cleric", "Creature — Human Cleric", "{2}{W}", { cmc: 3, power: "2", toughness: "2" }));
    const small = into(s0, ap, card("Small Cleric", "Creature — Human Cleric", "{1}{W}", { cmc: 2, power: "1", toughness: "1" }), "graveyard");
    const same = into(s0, ap, card("Same Cleric", "Creature — Human Cleric", "{1}{W}{W}", { cmc: 3, power: "1", toughness: "1" }), "graveyard");
    destroyPermanent(s0, s0.objects[dying]!, "test");
    closeZoneBatch(s0);
    let s = untilTargets(s0);
    expect(s.pending).toMatchObject({ kind: "chooseTargets" });
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(same)] })).toThrow();
    s = settle(s, { targets: [tgt(small)] });
    expect(zone(s, small)).toBe("battlefield");
  });
});
