// Round 213: Anticognition, Brush Off, Fatal Grudge, Firemind's Foresight, Galvanoth, Riders of Gavony, Ultron, Volatile
// Arsonist, cast-from-graveyard creatures with counters (Undead Sprinter, Worldheart Phoenix, Hundred-Battle Veteran) and
// others (fresh cards around EDHREC ranks 5,800 to 13,200).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, activationCost, applyAction, blockProblem, closeZoneBatch, destroyPermanent, discardCards, draw, objHasKeyword, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, spellCost, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

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
const pt = (s: GameState, id: ObjectId) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const nameOf = (s: GameState, id: ObjectId) => s.cards[s.objects[id]!.cardId]!.name;
const tapLands = (s: GameState, pid: PlayerId, keep: number) => {
  const lands = s.battlefield.filter((id) => s.objects[id]!.controller === pid && characteristics(s, s.objects[id]!).types.includes("Land"));
  lands.slice(keep).forEach((id) => (s.objects[id]!.tapped = true));
};

const giantGrowth = card("Giant Growth", "Instant", "{G}", { oracleText: "Target creature gets +3/+3 until end of turn." });

// Real oracle text (Scryfall).
const anticognition = card("Anticognition", "Instant", "{1}{U}", {"cmc": 2, "oracleText": "Counter target creature or planeswalker spell unless its controller pays {2}. If an opponent has eight or more cards in their graveyard, instead counter that spell, then scry 2.", "keywords": ["Scry"]});
const brushOff = card("Brush Off", "Instant", "{2}{U}{U}", {"cmc": 4, "oracleText": "This spell costs {1}{U} less to cast if it targets an instant or sorcery spell.\nCounter target spell.", "keywords": []});
const callDamageControl = card("Call Damage Control", "Sorcery", "{1}{G}", {"cmc": 2, "oracleText": "Choose up to two. Return those cards from your graveyard to your hand.\n• Target artifact card.\n• Target creature card.\n• Target enchantment card.\n• Target land card.", "keywords": []});
const catalystStone = card("Catalyst Stone", "Artifact", "{2}", {"cmc": 2, "oracleText": "Flashback costs you pay cost {2} less.\nFlashback costs your opponents pay cost {2} more.", "keywords": []});
const darkDabbling = card("Dark Dabbling", "Instant", "{2}{B}", {"cmc": 3, "oracleText": "Regenerate target creature. Draw a card. (The next time the creature would be destroyed this turn, instead tap it, remove it from combat, and heal all damage on it.)\nSpell mastery — If there are two or more instant and/or sorcery cards in your graveyard, also regenerate each other creature you control.", "keywords": ["Heal", "Regenerate", "Spell mastery"]});
const dustAnimus = card("Dust Animus", "Creature — Spirit", "{1}{W}", {"cmc": 2, "oracleText": "Flying\nIf you control five or more untapped lands, this creature enters with two +1/+1 counters and a lifelink counter on it.\nPlot {1}{W} (You may pay {1}{W} and exile this card from your hand. Cast it as a sorcery on a later turn without paying its mana cost. Plot only as a sorcery.)", "power": "2", "toughness": "3", "keywords": ["Flying", "Plot"]});
const embalmersTools = card("Embalmer's Tools", "Artifact", "{2}", {"cmc": 2, "oracleText": "Activated abilities of creature cards in your graveyard cost {1} less to activate.\nTap an untapped Zombie you control: Target player mills a card.", "keywords": ["Mill"]});
const fatalGrudge = card("Fatal Grudge", "Sorcery", "{B}{R}", {"cmc": 2, "oracleText": "As an additional cost to cast this spell, sacrifice a nonland permanent.\nEach opponent chooses a permanent they control that shares a card type with the sacrificed permanent and sacrifices it.\nDraw a card.", "keywords": []});
const firemindsForesight = card("Firemind's Foresight", "Instant", "{5}{U}{R}", {"cmc": 7, "oracleText": "Search your library for an instant card with mana value 3, reveal it, and put it into your hand. Then repeat this process for instant cards with mana values 2 and 1. Then shuffle.", "keywords": []});
const galvanoth = card("Galvanoth", "Creature — Beast", "{3}{R}{R}", {"cmc": 5, "oracleText": "At the beginning of your upkeep, you may look at the top card of your library. You may cast it without paying its mana cost if it's an instant or sorcery spell.", "power": "3", "toughness": "3", "keywords": []});
const heraldOfTheForgotten = card("Herald of the Forgotten", "Creature — Cat Beast", "{6}{W}{W}", {"cmc": 8, "oracleText": "Flying\nWhen this creature enters, if you cast it, return any number of target permanent cards with cycling abilities from your graveyard to the battlefield.", "power": "6", "toughness": "6", "keywords": ["Flying"]});
const hundredbattleVeteran = card("Hundred-Battle Veteran", "Creature — Zombie Warrior", "{3}{B}", {"cmc": 4, "oracleText": "As long as there are three or more different kinds of counters among creatures you control, this creature gets +2/+4.\nYou may cast this card from your graveyard. If you do, it enters with a finality counter on it. (If a creature with a finality counter on it would die, exile it instead.)", "power": "4", "toughness": "2", "keywords": []});
const nyxbornUnicorn = card("Nyxborn Unicorn", "Enchantment Creature — Unicorn", "{1}{W}", {"cmc": 2, "oracleText": "Bestow {3}{W} (If you cast this card for its bestow cost, it's an Aura spell with enchant creature. It becomes a creature again if it's not attached.)\nMentor (Whenever this creature attacks, put a +1/+1 counter on target attacking creature with lesser power.)\nEnchanted creature gets +2/+2 and has mentor.", "power": "2", "toughness": "2", "keywords": ["Mentor", "Bestow"]});
const osgood = card("Osgood, Operation Double", "Legendary Creature — Human Alien Shapeshifter", "{2}{U}{U}", {"cmc": 4, "oracleText": "When you cast this spell, create a token that's a copy of it, except it isn't legendary.\n{T}: Add {C}. Spend this mana only to cast an artifact spell or activate an ability of an artifact.\nParadox — Whenever you cast a spell from anywhere other than your hand, investigate. (Create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")", "power": "2", "toughness": "2", "keywords": ["Investigate", "Paradox"], "producedMana": ["C"]});
const priestOfTheBlessedGraf = card("Priest of the Blessed Graf", "Creature — Human Cleric", "{2}{W}", {"cmc": 3, "oracleText": "At the beginning of your end step, create X 1/1 white Spirit creature tokens with flying, where X is the number of opponents who control more lands than you.", "power": "1", "toughness": "2", "keywords": []});
const raffinesGuidance = card("Raffine's Guidance", "Enchantment — Aura", "{W}", {"cmc": 1, "oracleText": "Enchant creature\nEnchanted creature gets +1/+1.\nYou may cast this card from your graveyard by paying {2}{W} rather than paying its mana cost.", "keywords": ["Enchant"]});
const ridersOfGavony = card("Riders of Gavony", "Creature — Human Knight", "{2}{W}{W}", {"cmc": 4, "oracleText": "Vigilance\nAs this creature enters, choose a creature type.\nHuman creatures you control have protection from creatures of the chosen type.", "power": "3", "toughness": "3", "keywords": ["Vigilance"]});
const rootwireAmalgam = card("Rootwire Amalgam", "Artifact Creature — Golem", "{5}", {"cmc": 5, "oracleText": "Prototype {1}{G} — 2/3 (You may cast this spell with different mana cost, color, and size. It keeps its abilities and types.)\n{3}{G}{G}, Sacrifice this creature: Create an X/X colorless Golem artifact creature token, where X is three times this creature's power. It gains haste until end of turn. Activate only as a sorcery.", "power": "5", "toughness": "5", "keywords": ["Prototype"], "layout": "prototype"});
const shangchiAndTheTenRings = card("Shang-Chi and the Ten Rings", "Legendary Creature — Human Warrior Hero", "{1}{W}{U}", {"cmc": 3, "oracleText": "First strike\nWhenever you draw a card, put a +1/+1 counter on Shang-Chi.\nWhen the tenth +1/+1 counter is put on Shang-Chi, you draw five cards and gain 5 life.", "power": "2", "toughness": "2", "keywords": ["First strike"]});
const tatsunari = card("Tatsunari, Toad Rider", "Legendary Creature — Human Ninja", "{2}{B}", {"cmc": 3, "oracleText": "Whenever you cast an enchantment spell, if you don't control a creature named Keimi, create Keimi, a legendary 3/3 black and green Frog creature token with \"Whenever you cast an enchantment spell, each opponent loses 1 life and you gain 1 life.\"\n{1}{G/U}: Tatsunari and target Frog you control can't be blocked this turn except by creatures with flying or reach.", "power": "3", "toughness": "3", "keywords": []});
const thurid = card("Thurid, Mare of Destiny", "Legendary Creature — Pegasus", "{2}{W}{W}", {"cmc": 4, "oracleText": "Flying, lifelink\nWhenever you cast a Pegasus, Unicorn, or Horse creature spell, copy it. (The copy becomes a token.)\nOther Pegasi, Unicorns, and Horses you control get +1/+1.", "power": "2", "toughness": "4", "keywords": ["Flying", "Lifelink"]});
const ultronTheAnnihilator = card("Ultron the Annihilator", "Legendary Artifact Creature — Robot Villain", "{3}{B}{B}", {"cmc": 5, "oracleText": "Flying\nWhenever Ultron enters or attacks, create a 2/2 colorless Robot Villain artifact creature token.\nWhenever another artifact is put into your graveyard from the battlefield or an artifact card is put into your graveyard from anywhere other than the battlefield, each opponent loses 1 life.", "power": "3", "toughness": "4", "keywords": ["Flying"]});
const ultronsAuxiliary = card("Ultron's Auxiliary", "Artifact Creature — Robot Villain", "{1}{B}", {"cmc": 2, "oracleText": "Menace\nWhenever another artifact is put into your graveyard from the battlefield or an artifact card is put into your graveyard from anywhere other than the battlefield, put a +1/+1 counter on this creature.", "power": "1", "toughness": "1", "keywords": ["Menace"]});
const undeadSprinter = card("Undead Sprinter", "Creature — Zombie", "{B}{R}", {"cmc": 2, "oracleText": "Trample, haste\nYou may cast this card from your graveyard if a non-Zombie creature died this turn. If you do, this creature enters with a +1/+1 counter on it.", "power": "2", "toughness": "2", "keywords": ["Haste", "Trample"]});
const volatileArsonist = card("Volatile Arsonist // Dire-Strain Anarchist", "Creature — Human Werewolf // Creature — Werewolf", "{3}{R}{R}", {"cmc": 5, "oracleText": "Menace, haste\nWhenever this creature attacks, it deals 1 damage to each of up to one target creature, up to one target player, and/or up to one target planeswalker.\nDaybound (If a player casts no spells during their own turn, it becomes night next turn.)", "power": "4", "toughness": "4", "keywords": ["Transform", "Daybound", "Haste", "Menace", "Nightbound"], "layout": "transform", "faces": [{"name": "Volatile Arsonist", "manaCost": "{3}{R}{R}", "typeLine": "Creature — Human Werewolf", "supertypes": [], "types": ["Creature"], "subtypes": ["Human", "Werewolf"], "oracleText": "Menace, haste\nWhenever this creature attacks, it deals 1 damage to each of up to one target creature, up to one target player, and/or up to one target planeswalker.\nDaybound (If a player casts no spells during their own turn, it becomes night next turn.)", "power": "4", "toughness": "4", "colors": ["R"]}, {"name": "Dire-Strain Anarchist", "manaCost": "", "typeLine": "Creature — Werewolf", "supertypes": [], "types": ["Creature"], "subtypes": ["Werewolf"], "oracleText": "Menace, haste\nWhenever this creature attacks, it deals 2 damage to each of up to one target creature, up to one target player, and/or up to one target planeswalker.\nNightbound (If a player casts at least two spells during their own turn, it becomes day next turn.)", "power": "5", "toughness": "5", "colors": ["R"], "colorIndicator": ["R"]}]});
const worldheartPhoenix = card("Worldheart Phoenix", "Creature — Phoenix", "{3}{R}", {"cmc": 4, "oracleText": "Flying\nYou may cast this card from your graveyard by paying {W}{U}{B}{R}{G} rather than paying its mana cost. If you do, it enters with two +1/+1 counters on it.", "power": "2", "toughness": "2", "keywords": ["Flying"]});

describe("round 213 cards", () => {
  it("compile", () =>
    supported(anticognition, brushOff, callDamageControl, catalystStone, darkDabbling, dustAnimus, embalmersTools, fatalGrudge, firemindsForesight, galvanoth, heraldOfTheForgotten, hundredbattleVeteran, nyxbornUnicorn, osgood, priestOfTheBlessedGraf, raffinesGuidance, ridersOfGavony, rootwireAmalgam, shangchiAndTheTenRings, tatsunari, thurid, ultronTheAnnihilator, ultronsAuxiliary, undeadSprinter, volatileArsonist, worldheartPhoenix));
});

describe("Priest of the Blessed Graf", () => {
  it("at your end step, one Spirit for each opponent who controls more lands than you", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    putOnBattlefield(s, ap, priestOfTheBlessedGraf);
    const [o1, o2, o3] = s.turnOrder.filter((p) => p !== ap);
    for (let i = 0; i < 15; i++) putOnBattlefield(s, o1!, card(`Land ${i}`, "Land"));
    for (let i = 0; i < 14; i++) putOnBattlefield(s, o2!, card(`Land ${i}`, "Land")); // as many as you: not more
    for (let i = 0; i < 20; i++) putOnBattlefield(s, o3!, card(`Land ${i}`, "Land"));
    invalidateCharacteristics(s);
    s = settle(passUntil(s, "end"));
    const spirits = s.battlefield.filter((id) => /Spirit/.test(nameOf(s, id)) && s.objects[id]!.controller === ap);
    expect(spirits).toHaveLength(2);
  });
});

describe("Dust Animus", () => {
  it("enters with two +1/+1 counters and a lifelink counter while you control five or more untapped lands", () => {
    const { s: s0, ap, ids } = setup([dustAnimus]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.counters).toMatchObject({ "+1/+1": 2, lifelink: 1 });
    expect(pt(s, ids[0]!)).toBe("4/5");
  });

  it("without five untapped lands, no counters", () => {
    const { s: s0, ap, ids } = setup([dustAnimus]);
    tapLands(s0, ap, 6); // paying {1}{W} leaves four untapped
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(s.objects[ids[0]!]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(s.objects[ids[0]!]!.counters.lifelink ?? 0).toBe(0);
  });
});

describe("Shang-Chi and the Ten Rings", () => {
  it("a draw puts a +1/+1 counter on it; the tenth counter draws five cards and gains 5 life", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const sc = putOnBattlefield(s, ap, shangchiAndTheTenRings);
    s.objects[sc]!.counters["+1/+1"] = 8;
    const hand = s.players[ap]!.hand.length;
    const life = s.players[ap]!.life;
    draw(s, ap, 1);
    s = settle(s);
    expect(s.objects[sc]!.counters["+1/+1"]).toBe(9);
    expect(s.players[ap]!.life).toBe(life);
    draw(s, ap, 1);
    s = settle(s);
    // The tenth counter: five more cards (each one another counter) and 5 life; only the tenth counter triggers it.
    expect(s.players[ap]!.hand.length).toBe(hand + 7);
    expect(s.players[ap]!.life).toBe(life + 5);
    expect(s.objects[sc]!.counters["+1/+1"]).toBe(15);
  });
});

describe("Brush Off", () => {
  it("costs {1}{U} less when it targets an instant or sorcery spell", () => {
    const { s: s0, ap, ids } = setup([giantGrowth, brushOff, bear()]);
    let s = s0;
    const b = putOnBattlefield(s, ap, bear());
    s = run(s, planCast(s, ap, ids[0]!, [tgt(b)]));
    const growth = s.stack.at(-1)!;
    const bo = s.objects[ids[1]!]!;
    const cost = spellCost(s, ap, bo, 0, [], { targets: [{ kind: "stack", id: growth.id }] });
    expect(cost.cost.symbols.filter((x) => x.kind === "colored")).toHaveLength(1);
    expect(cost.extra + cost.cost.symbols.filter((x) => x.kind === "generic").reduce((n, x) => n + (x.kind === "generic" ? x.amount : 0), 0)).toBe(1);
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: growth.id }])));
    expect(pt(s, b)).toBe("2/2"); // countered
  });

  it("full price against a creature spell", () => {
    const { s: s0, ap, ids } = setup([bear({ name: "Bear Spell" }), brushOff]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    const spell = s.stack.at(-1)!;
    const cost = spellCost(s, ap, s.objects[ids[1]!]!, 0, [], { targets: [{ kind: "stack", id: spell.id }] });
    expect(cost.cost.symbols.filter((x) => x.kind === "colored")).toHaveLength(2);
  });
});

describe("Anticognition", () => {
  const go = (yard: number) => {
    const { s: s0, ap, ids, opp } = setup([bear({ name: "Bear Spell" }), anticognition]);
    for (let i = 0; i < yard; i++) into(s0, opp, card(`Junk ${i}`, "Sorcery", "{1}"), "graveyard");
    let s = run(s0, planCast(s0, ap, ids[0]!));
    const spell = s.stack.at(-1)!;
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: spell.id }]));
    s = settle(s);
    return { s, ap, ids };
  };

  it("an opponent with eight cards in their graveyard: the spell is countered outright, then scry 2", () => {
    const { s, ids } = go(8);
    expect(s.pending).toMatchObject({ kind: "arrangeTop" }); // scry 2
    expect(zone(s, ids[0]!)).toBe("graveyard");
  });

  it("otherwise its controller may pay {2}", () => {
    const { s, ids } = go(7);
    expect(s.pending?.kind).not.toBe("arrangeTop");
    expect(zone(s, ids[0]!)).not.toBe("graveyard");
  });
});

describe("Dark Dabbling", () => {
  it("regenerates the target; with spell mastery each other creature you control too", () => {
    for (const mastery of [false, true]) {
      const { s: s0, ap, ids } = setup([darkDabbling]);
      const a = putOnBattlefield(s0, ap, bear());
      const b = putOnBattlefield(s0, ap, bear({ name: "Other Bear" }));
      if (mastery) for (let i = 0; i < 2; i++) into(s0, ap, card(`Old Spell ${i}`, "Instant", "{1}"), "graveyard");
      const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(a)])));
      expect(s.objects[a]!.regenShields).toBe(1);
      expect(s.objects[b]!.regenShields ?? 0).toBe(mastery ? 1 : 0);
    }
  });
});

describe("Firemind's Foresight", () => {
  it("finds an instant with mana value 3, then 2, then 1, then shuffles", () => {
    const { s: s0, ap, ids } = setup([firemindsForesight]);
    const three = into(s0, ap, card("Three", "Instant", "{2}{U}"), "library");
    const two = into(s0, ap, card("Two", "Instant", "{1}{U}"), "library");
    const one = into(s0, ap, card("One", "Instant", "{U}"), "library");
    into(s0, ap, card("Sorcery Three", "Sorcery", "{2}{U}"), "library");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const found: string[] = [];
    for (let i = 0; i < 3; i++) {
      const p = s.pending!;
      expect(p).toMatchObject({ kind: "searchLibrary" });
      const pick = [three, two, one][i]!;
      found.push(nameOf(s, pick));
      s = settle(act(s, { type: "searchLibrary", player: ap, found: [pick] }));
    }
    expect(found).toEqual(["Three", "Two", "One"]);
    for (const id of [three, two, one]) expect(zone(s, id)).toBe("hand");
  });
});

describe("Call Damage Control", () => {
  it("up to two modes: an artifact card and a creature card back to hand", () => {
    const { s: s0, ap, ids } = setup([callDamageControl]);
    const art = into(s0, ap, card("Old Relic", "Artifact", "{2}"), "graveyard");
    const cre = into(s0, ap, bear({ name: "Dead Bear" }), "graveyard");
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(art), tgt(cre)], [0, 1])));
    expect(zone(s, art)).toBe("hand");
    expect(zone(s, cre)).toBe("hand");
    expect(planCast(s0, ap, ids[0]!, [tgt(art), tgt(cre), tgt(art)], [0, 1, 2])).toBeNull();
  });
});

describe("Fatal Grudge", () => {
  it("each opponent sacrifices a permanent that shares a card type with the sacrificed one", () => {
    const { s: s0, ap, ids, opp } = setup([fatalGrudge]);
    const mine = putOnBattlefield(s0, ap, card("My Relic", "Artifact", "{1}"));
    const theirArt = putOnBattlefield(s0, opp, card("Their Relic", "Artifact", "{1}"));
    const theirBear = putOnBattlefield(s0, opp, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!, [], undefined, undefined, undefined, { sacrifice: [mine] }));
    expect(zone(s, mine)).toBe("graveyard");
    s = settle(s);
    for (let i = 0; i < 5 && s.pending; i++) {
      const p = s.pending as { kind: string; player: PlayerId; options?: ObjectId[] };
      s = settle(act(s, { type: "choosePermanents", player: p.player, chosen: p.player === opp ? [theirArt] : [] } as never));
    }
    expect(zone(s, theirArt)).toBe("graveyard");
    expect(zone(s, theirBear)).toBe("battlefield");
  });
});

describe("Rootwire Amalgam", () => {
  it("sacrificed: an X/X Golem with haste, X three times its power", () => {
    const { s: s0, ap } = setup([]);
    const r = putOnBattlefield(s0, ap, rootwireAmalgam);
    const s = settle(run(s0, planActivate(s0, ap, r, 0)));
    expect(zone(s, r)).toBe("graveyard");
    const golem = s.battlefield.find((id) => s.objects[id]!.isToken && /Golem/.test(nameOf(s, id)))!;
    expect(pt(s, golem)).toBe("15/15");
    expect(objHasKeyword(s, s.objects[golem]!, "Haste")).toBe(true);
  });
});

describe("Catalyst Stone", () => {
  it("your flashback costs {2} less, your opponents' {2} more", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, catalystStone);
    const fb = card("Think Twice", "Instant", "{1}{U}", { oracleText: "Draw a card.\nFlashback {2}{U} (You may cast this card from your graveyard for its flashback cost. Then exile it.)", keywords: ["Flashback"] });
    const mine = into(s, ap, fb, "graveyard");
    const theirs = into(s, opp, fb, "graveyard");
    const generic = (c: { cost: { symbols: { kind: string; amount?: number }[] }; extra: number }) => c.extra + c.cost.symbols.reduce((n, x) => n + (x.kind === "generic" ? x.amount! : 0), 0);
    expect(generic(spellCost(s, ap, s.objects[mine]!, 0, [], { via: "flashback" }))).toBe(0);
    expect(generic(spellCost(s, opp, s.objects[theirs]!, 0, [], { via: "flashback" }))).toBe(4);
    // Cast from the hand, no change.
    const inHand = into(s, ap, fb, "hand");
    expect(generic(spellCost(s, ap, s.objects[inHand]!, 0, []))).toBe(1);
  });
});

describe("Embalmer's Tools", () => {
  it("activated abilities of creature cards in your graveyard cost {1} less", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, embalmersTools);
    const zombie = card("Heavyweight Demolisher", "Artifact Creature — Construct", "{7}", { power: "8", toughness: "6", keywords: ["Unearth", "Menace"], oracleText: "Menace\nUnearth {6}{R}{R} ({6}{R}{R}: Return this card from your graveyard to the battlefield. It gains haste. Exile it at the beginning of the next end step or if it would leave the battlefield. Unearth only as a sorcery.)" });
    const mine = into(s, ap, zombie, "graveyard");
    const theirs = into(s, opp, zombie, "graveyard");
    const generic = (pid: PlayerId, id: ObjectId) => {
      const o = s.objects[id]!;
      const ab = abilitiesOf(s, o).activated.find((a) => /Return this card|Unearth/i.test(a.text ?? ""))!;
      return activationCost(s, pid, o, ab).symbols.reduce((n, x) => n + (x.kind === "generic" ? x.amount : 0), 0);
    };
    expect(generic(ap, mine)).toBe(5);
    expect(generic(opp, theirs)).toBe(6);
  });
});

describe("Nyxborn Unicorn", () => {
  it("bestowed, the enchanted creature gets +2/+2 and has mentor", () => {
    const { s: s0, ap, ids } = setup([nyxbornUnicorn]);
    const b = putOnBattlefield(s0, ap, bear());
    const small = putOnBattlefield(s0, ap, card("Small Soldier", "Creature — Human Soldier", "{W}", { power: "1", toughness: "1" }));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)], undefined, undefined, undefined, { alt: "bestow" })));
    expect(s.objects[ids[0]!]!.attachedTo).toBe(b);
    expect(pt(s, b)).toBe("4/4");
    // Mentor (CR 702.134a): attacking, a +1/+1 counter on target attacking creature with lesser power.
    const opp = s.turnOrder.find((p) => p !== ap)!;
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }, { attacker: small, defender: opp }] });
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets" });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(small)] }));
    expect(s.objects[small]!.counters["+1/+1"]).toBe(1);
  });
});

describe("Riders of Gavony", () => {
  it("your Humans have protection from creatures of the chosen type", () => {
    const { s: s0, ap, ids, opp } = setup([ridersOfGavony]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseOption" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Zombie" }));
    expect(s.objects[ids[0]!]!.chosen?.type).toBe("Zombie");
    const human = putOnBattlefield(s, ap, card("Human Soldier", "Creature — Human Soldier", "{W}", { power: "1", toughness: "1" }));
    const bearAtk = putOnBattlefield(s, ap, bear());
    const zombie = putOnBattlefield(s, opp, card("Walking Corpse", "Creature — Zombie", "{1}{B}", { power: "2", toughness: "2" }));
    const shapeshifter = putOnBattlefield(s, opp, card("Changeling Outcast", "Creature — Shapeshifter", "{B}", { power: "1", toughness: "1", keywords: ["Changeling"], oracleText: "Changeling (This card is every creature type.)" }));
    const elf = putOnBattlefield(s, opp, card("Elvish Warrior", "Creature — Elf Warrior", "{G}{G}", { power: "2", toughness: "3" }));
    invalidateCharacteristics(s);
    for (const a of [human, bearAtk]) s.objects[a]!.attacking = opp;
    const o = (id: ObjectId) => s.objects[id]!;
    expect(blockProblem(s, o(zombie), o(human))).not.toBeNull();
    expect(blockProblem(s, o(shapeshifter), o(human))).not.toBeNull(); // a changeling is a Zombie
    expect(blockProblem(s, o(elf), o(human))).toBeNull();
    expect(blockProblem(s, o(zombie), o(bearAtk))).toBeNull(); // not a Human
    expect(blockProblem(s, o(zombie), o(ids[0]!))).not.toBeNull(); // Riders is a Human too
  });
});

describe("Ultron the Annihilator and Ultron's Auxiliary", () => {
  it("another artifact to your graveyard from the battlefield, or an artifact card from anywhere else", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const ultron = putOnBattlefield(s, ap, ultronTheAnnihilator);
    const aux = putOnBattlefield(s, ap, ultronsAuxiliary);
    const opps = s.turnOrder.filter((p) => p !== ap);
    const life = () => opps.map((p) => s.players[p]!.life);
    const start = life();
    const relic = putOnBattlefield(s, ap, card("Old Relic", "Artifact", "{1}"));
    destroyPermanent(s, s.objects[relic]!, "test");
    s = settle(s);
    expect(life()).toEqual(start.map((n) => n - 1));
    expect(s.objects[aux]!.counters["+1/+1"]).toBe(1);
    // Discarded from the hand.
    const inHand = into(s, ap, card("Hand Relic", "Artifact", "{1}"), "hand");
    discardCards(s, ap, [inHand]);
    closeZoneBatch(s); // the discard event is over (CR 603.2c)
    s = settle(s);
    expect(life()).toEqual(start.map((n) => n - 2));
    expect(s.objects[aux]!.counters["+1/+1"]).toBe(2);
    // A nonartifact card: nothing.
    const sorc = into(s, ap, card("Some Sorcery", "Sorcery", "{1}"), "hand");
    discardCards(s, ap, [sorc]);
    closeZoneBatch(s);
    s = settle(s);
    expect(life()).toEqual(start.map((n) => n - 2));
    // Ultron's Auxiliary itself dying: Ultron sees another artifact; the Auxiliary doesn't see itself.
    destroyPermanent(s, s.objects[aux]!, "test");
    s = settle(s);
    expect(life()).toEqual(start.map((n) => n - 3));
    expect(zone(s, ultron)).toBe("battlefield");
  });

  it("Ultron makes a 2/2 Robot Villain as it enters", () => {
    const { s: s0, ap, ids } = setup([ultronTheAnnihilator]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const robot = s.battlefield.find((id) => s.objects[id]!.isToken)!;
    expect(pt(s, robot)).toBe("2/2");
    expect(characteristics(s, s.objects[robot]!).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
  });
});

describe("Volatile Arsonist", () => {
  it("attacking: 1 damage to up to one creature, up to one player and up to one planeswalker", () => {
    const { s: s0, ap, opp } = setup([]);
    const va = putOnBattlefield(s0, ap, volatileArsonist);
    const b = putOnBattlefield(s0, opp, bear());
    const pw = putOnBattlefield(s0, opp, card("Test Walker", "Legendary Planeswalker — Jace", "{3}{U}", { loyalty: "3" }));
    s0.objects[pw]!.counters.loyalty = 3;
    const other = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: va, defender: opp }] });
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets" });
    const life = s.players[other]!.life;
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(b), { kind: "player", id: other }, tgt(pw)] }));
    expect(s.objects[b]!.damage).toBe(1);
    expect(s.players[other]!.life).toBe(life - 1);
    expect(s.objects[pw]!.counters.loyalty).toBe(2);
  });
});

describe("Galvanoth", () => {
  it("at your upkeep, look at the top card and cast it free if it's an instant or sorcery", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, galvanoth);
    let s = passUntil(s0, "upkeep", s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]);
    const bolt = into(s, ap, card("Lightning Bolt", "Instant", "{R}", { oracleText: "Lightning Bolt deals 3 damage to any target." }), "library");
    s = passUntil(s, "upkeep", ap);
    s = settle(s);
    if (s.pending?.kind === "chooseOption") s = act(s, { type: "chooseOption", player: ap, choice: bolt });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: bolt });
    const life = s.players[opp]!.life;
    s = settle(act(s, { type: "castSpell", player: ap, objectId: bolt, targets: [{ kind: "player", id: opp }] }));
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(zone(s, bolt)).toBe("graveyard");
  });

  it("a creature card on top stays there", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, galvanoth);
    let s = passUntil(s0, "upkeep", s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]);
    const top = into(s, ap, bear({ name: "Top Bear" }), "library");
    s = settle(passUntil(s, "upkeep", ap));
    expect(s.pending?.kind).not.toBe("castFree");
    expect(s.players[ap]!.library[0]).toBe(top);
  });
});

describe("Thurid, Mare of Destiny", () => {
  it("copies a Pegasus, Unicorn or Horse creature spell; other Pegasi, Unicorns and Horses get +1/+1", () => {
    const pegasus = card("Test Pegasus", "Creature — Pegasus", "{1}{W}", { power: "2", toughness: "2", keywords: ["Flying"], oracleText: "Flying" });
    const { s: s0, ap, ids } = setup([pegasus, bear({ name: "Bear Spell" })]);
    putOnBattlefield(s0, ap, thurid);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const pegasi = s.battlefield.filter((id) => nameOf(s, id) === "Test Pegasus");
    expect(pegasi).toHaveLength(2);
    expect(pegasi.filter((id) => s.objects[id]!.isToken)).toHaveLength(1);
    for (const id of pegasi) expect(pt(s, id)).toBe("3/3");
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(s.battlefield.filter((id) => nameOf(s, id) === "Bear Spell")).toHaveLength(1);
    expect(pt(s, ids[1]!)).toBe("2/2");
  });
});

describe("Osgood, Operation Double", () => {
  it("cast: a token copy of it that isn't legendary", () => {
    const { s: s0, ap, ids } = setup([osgood]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const all = s.battlefield.filter((id) => nameOf(s, id) === "Osgood, Operation Double");
    expect(all).toHaveLength(2);
    const token = all.find((id) => s.objects[id]!.isToken)!;
    expect(characteristics(s, s.objects[token]!).supertypes).not.toContain("Legendary");
    expect(characteristics(s, s.objects[ids[0]!]!).supertypes).toContain("Legendary");
  });
});

describe("cast from your graveyard, entering with counters", () => {
  const via = { via: "permission" as const };

  it("Undead Sprinter: only once a non-Zombie creature died this turn; it enters with a +1/+1 counter", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const us = into(s, ap, undeadSprinter, "graveyard");
    expect(planCast(s, ap, us, [], undefined, undefined, undefined, via)).toBeNull();
    const zombie = putOnBattlefield(s, opp, card("Walking Corpse", "Creature — Zombie", "{1}{B}", { power: "2", toughness: "2" }));
    destroyPermanent(s, s.objects[zombie]!, "test");
    s = settle(s);
    expect(planCast(s, ap, us, [], undefined, undefined, undefined, via)).toBeNull();
    const b = putOnBattlefield(s, opp, bear());
    destroyPermanent(s, s.objects[b]!, "test");
    s = settle(s);
    s = settle(run(s, planCast(s, ap, us, [], undefined, undefined, undefined, via)));
    expect(zone(s, us)).toBe("battlefield");
    expect(pt(s, us)).toBe("3/3");
  });

  it("Worldheart Phoenix: {W}{U}{B}{R}{G} from the graveyard, entering with two +1/+1 counters; from the hand, none", () => {
    const { s: s0, ap, ids } = setup([worldheartPhoenix]);
    const wp = into(s0, ap, worldheartPhoenix, "graveyard");
    const s = settle(run(s0, planCast(s0, ap, wp, [], undefined, undefined, undefined, via)));
    expect(zone(s, wp)).toBe("battlefield");
    expect(pt(s, wp)).toBe("4/4");
    expect(s.battlefield.filter((id) => s.objects[id]!.tapped && characteristics(s, s.objects[id]!).types.includes("Land"))).toHaveLength(5);
    const t = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(pt(t, ids[0]!)).toBe("2/2");
  });

  it("Hundred-Battle Veteran: from the graveyard with a finality counter; +2/+4 with three kinds of counters among your creatures", () => {
    const { s: s0, ap } = setup([]);
    const v = into(s0, ap, hundredbattleVeteran, "graveyard");
    let s = settle(run(s0, planCast(s0, ap, v, [], undefined, undefined, undefined, via)));
    expect(s.objects[v]!.counters.finality).toBe(1);
    expect(pt(s, v)).toBe("4/2");
    const b = putOnBattlefield(s, ap, bear());
    s.objects[b]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s);
    expect(pt(s, v)).toBe("4/2"); // two kinds
    s.objects[b]!.counters.flying = 1;
    invalidateCharacteristics(s);
    expect(pt(s, v)).toBe("6/6"); // finality, +1/+1, flying
    // An opponent's creature's counters don't count.
    s.objects[b]!.counters.flying = 0;
    delete s.objects[b]!.counters.flying;
    const theirs = putOnBattlefield(s, s.turnOrder.find((p) => p !== ap)!, bear());
    s.objects[theirs]!.counters.lifelink = 1;
    invalidateCharacteristics(s);
    expect(pt(s, v)).toBe("4/2");
  });

  it("Raffine's Guidance: cast from the graveyard for {2}{W}", () => {
    const { s: s0, ap } = setup([]);
    const b = putOnBattlefield(s0, ap, bear());
    const rg = into(s0, ap, raffinesGuidance, "graveyard");
    const s = settle(run(s0, planCast(s0, ap, rg, [tgt(b)], undefined, undefined, undefined, via)));
    expect(s.objects[rg]!.attachedTo).toBe(b);
    expect(pt(s, b)).toBe("3/3");
    expect(s.battlefield.filter((id) => s.objects[id]!.tapped)).toHaveLength(3);
  });
});

describe("Herald of the Forgotten", () => {
  it("cast, it returns any number of permanent cards with cycling abilities from your graveyard", () => {
    const { s: s0, ap, ids } = setup([heraldOfTheForgotten]);
    const ash = into(s0, ap, card("Ash Barrens", "Land", "", { keywords: ["Landcycling", "Basic landcycling", "Typecycling", "Cycling"], oracleText: "{T}: Add {C}.\nBasic landcycling {1} ({1}, Discard this card: Search your library for a basic land card, reveal it, put it into your hand, then shuffle.)" }), "graveyard");
    const tusker = into(s0, ap, card("Krosan Tusker", "Creature — Boar Beast", "{5}{G}{G}", { power: "6", toughness: "5", keywords: ["Cycling"], oracleText: "Cycling {2}{G} ({2}{G}, Discard this card: Draw a card.)\nWhen you cycle this card, you may search your library for a basic land card, reveal that card, put it into your hand, then shuffle." }), "graveyard");
    const plain = into(s0, ap, bear({ name: "Plain Bear" }), "graveyard");
    const instant = into(s0, ap, card("Cycling Instant", "Instant", "{U}", { keywords: ["Cycling"], oracleText: "Draw a card.\nCycling {2}" }), "graveyard");
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets" });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(ash), tgt(tusker)] }));
    expect(zone(s, ash)).toBe("battlefield");
    expect(zone(s, tusker)).toBe("battlefield");
    expect(zone(s, plain)).toBe("graveyard");
    expect(zone(s, instant)).toBe("graveyard");
  });
});

describe("Tatsunari, Toad Rider", () => {
  it("Tatsunari and target Frog you control can't be blocked except by creatures with flying or reach", () => {
    const { s: s0, ap, opp } = setup([]);
    const t = putOnBattlefield(s0, ap, tatsunari);
    const frog = putOnBattlefield(s0, ap, card("Test Frog", "Creature — Frog", "{G}", { power: "1", toughness: "1" }));
    const notFrog = putOnBattlefield(s0, ap, bear());
    expect(planActivate(s0, ap, t, 0, [tgt(notFrog)])).toBeNull();
    const s = settle(run(s0, planActivate(s0, ap, t, 0, [tgt(frog)])));
    const ground = putOnBattlefield(s, opp, bear({ name: "Ground Bear" }));
    const flyer = putOnBattlefield(s, opp, card("Test Bird", "Creature — Bird", "{W}", { power: "1", toughness: "1", keywords: ["Flying"], oracleText: "Flying" }));
    invalidateCharacteristics(s);
    for (const a of [t, frog, notFrog]) s.objects[a]!.attacking = opp;
    const o = (id: ObjectId) => s.objects[id]!;
    expect(blockProblem(s, o(ground), o(t))).not.toBeNull();
    expect(blockProblem(s, o(ground), o(frog))).not.toBeNull();
    expect(blockProblem(s, o(flyer), o(frog))).toBeNull();
    expect(blockProblem(s, o(ground), o(notFrog))).toBeNull();
  });
});
