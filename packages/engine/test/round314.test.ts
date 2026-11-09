// Round 314 (Lane A, skip-list cards): Heirloom Epic (creatures tapped for each mana in the activation cost), Waterbender's
// Restoration (waterbend {X} as an additional cost, X targets), Astral Drift (a cycling trigger from the hand and from the
// battlefield), Kros, Defense Contractor ("tap that creature and goad it"), Trove Warden (cards exiled with it return as it
// dies), Keen-Eyed Curator (card types among cards exiled with it), Radiant Scrollwielder (a random instant or sorcery
// exiled, cast this turn, exiled again after) and Brazen Cannonade ("until end of combat on your next turn").

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, abilityProblem, applyAction, botActions, castProblem, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; other players' questions as the bots would. Stops at any question of `me`'s. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) s = act(s, botActions(s, p.player)[0]!);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
/** A copy of `def` in `pid`'s hand, graveyard or library (on top). */
const inZone = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
const tapLands = (s: GameState, pid: PlayerId, keep: string[] = []) => {
  const kept = new Set<string>();
  for (const id of s.battlefield) {
    const o = s.objects[id]!;
    const name = s.cards[o.cardId]!.name;
    if (o.controller !== pid || !s.cards[o.cardId]!.types.includes("Land")) continue;
    const i = keep.indexOf(name);
    if (i >= 0 && !kept.has(`${name}#${i}`)) {
      kept.add(`${name}#${i}`);
      keep = [...keep.slice(0, i), "", ...keep.slice(i + 1)];
      continue;
    }
    o.tapped = true;
  }
};
const logHas = (s: GameState, re: RegExp) => s.log.some((l) => re.test(typeof l === "string" ? l : JSON.stringify(l)));

// Real oracle text (Scryfall).
const epic = (): CardDef => ({"oracleId":"43037ef5-09e8-4881-beff-ed38cf7574c6","name":"Heirloom Epic","manaCost":"{1}","cmc":1,"typeLine":"Artifact — Book","supertypes":[],"types":["Artifact"],"subtypes":["Book"],"oracleText":"{4}, {T}: Draw a card. For each mana in this ability's activation cost, you may tap an untapped creature you control rather than pay that mana. Activate only as a sorcery.","colors":[],"colorIdentity":[],"keywords":[],"layout":"normal"} as CardDef);
const restoration = (): CardDef => ({"oracleId":"285046f6-b3c4-4eb7-8712-9dffebabc762","name":"Waterbender's Restoration","manaCost":"{U}{U}","cmc":2,"typeLine":"Instant — Lesson","supertypes":[],"types":["Instant"],"subtypes":["Lesson"],"oracleText":"As an additional cost to cast this spell, waterbend {X}. (While paying a waterbend cost, you can tap your artifacts and creatures to help. Each one pays for {1}.)\nExile X target creatures you control. Return those cards to the battlefield under their owner's control at the beginning of the next end step.","colors":["U"],"colorIdentity":["U"],"keywords":["Waterbend"],"layout":"normal"} as CardDef);
const drift = (): CardDef => ({"oracleId":"7aa5db50-5057-45fd-bce9-fb4a5e874263","name":"Astral Drift","manaCost":"{2}{W}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever you cycle this card or cycle another card while this enchantment is on the battlefield, you may exile target creature. If you do, return that card to the battlefield under its owner's control at the beginning of the next end step.\nCycling {2}{W} ({2}{W}, Discard this card: Draw a card.)","colors":["W"],"colorIdentity":["W"],"keywords":["Cycling"],"layout":"normal"} as CardDef);
const kros = (): CardDef => ({"oracleId":"debeb004-3157-43cf-95fd-220777417ff7","name":"Kros, Defense Contractor","manaCost":"{1}{G}{W}{U}","cmc":4,"typeLine":"Legendary Creature — Cat Advisor","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Cat","Advisor"],"oracleText":"At the beginning of your upkeep, put a shield counter on target creature an opponent controls.\nWhenever you put one or more counters on a creature you don't control, tap that creature and goad it. It gains trample until your next turn. (Until your next turn, that creature attacks each combat if able and attacks a player other than you if able.)","power":"2","toughness":"4","colors":["G","U","W"],"colorIdentity":["G","U","W"],"keywords":["Goad"],"layout":"normal"} as CardDef);
const warden = (): CardDef => ({"oracleId":"9056eba4-612b-4e82-8689-fe098241b007","name":"Trove Warden","manaCost":"{2}{W}{W}","cmc":4,"typeLine":"Creature — Cat Beast","supertypes":[],"types":["Creature"],"subtypes":["Cat","Beast"],"oracleText":"Vigilance\nLandfall — Whenever a land you control enters, exile target permanent card with mana value 3 or less from your graveyard.\nWhen this creature dies, put each permanent card exiled with it onto the battlefield under the control of that card's owner.","power":"3","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Vigilance","Landfall"],"layout":"normal"} as CardDef);
const curator = (): CardDef => ({"oracleId":"46ce3698-e4e6-44e9-8b99-2b12a703e91e","name":"Keen-Eyed Curator","manaCost":"{G}{G}","cmc":2,"typeLine":"Creature — Raccoon Scout","supertypes":[],"types":["Creature"],"subtypes":["Raccoon","Scout"],"oracleText":"As long as there are four or more card types among cards exiled with this creature, it gets +4/+4 and has trample.\n{1}: Exile target card from a graveyard.","power":"3","toughness":"3","colors":["G"],"colorIdentity":["G"],"keywords":[],"layout":"normal"} as CardDef);
const scrollwielder = (): CardDef => ({"oracleId":"8f5ef838-839a-4eb0-8d65-c8c8def0a233","name":"Radiant Scrollwielder","manaCost":"{2}{R}{W}","cmc":4,"typeLine":"Creature — Dwarf Cleric","supertypes":[],"types":["Creature"],"subtypes":["Dwarf","Cleric"],"oracleText":"Instant and sorcery spells you control have lifelink.\nAt the beginning of your upkeep, exile an instant or sorcery card at random from your graveyard. You may cast it this turn. If a spell cast this way would be put into your graveyard, exile it instead.","power":"2","toughness":"4","colors":["R","W"],"colorIdentity":["R","W"],"keywords":[],"layout":"normal"} as CardDef);
const cannonade = (): CardDef => ({"oracleId":"b9212658-8406-489f-80d6-7af42df8956c","name":"Brazen Cannonade","manaCost":"{3}{R}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever an attacking creature you control dies, this enchantment deals 2 damage to each opponent.\nRaid — At the beginning of each of your postcombat main phases, if you attacked this turn, exile the top card of your library. Until end of combat on your next turn, you may play that card.","colors":["R"],"colorIdentity":["R"],"keywords":["Raid"],"layout":"normal"} as CardDef);
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"} as CardDef);
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"} as CardDef);
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"layout":"normal"} as CardDef);

const bear = (name: string) => card(name, "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" });
const growth = card("Test Growth", "Instant", "{G}", { oracleText: "Put a +1/+1 counter on target creature." });
const cycler = card("Test Cycler", "Creature — Beast", "{3}{G}", { power: "3", toughness: "3", keywords: ["Cycling"], oracleText: "Cycling {2}" });
const cyclingIndex = (s: GameState, id: string) => abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => a.cycling);
const tgt = (id: string) => ({ kind: "object" as const, id });

describe("round 314", () => {
  it("are fully supported", () => supported(epic(), restoration(), drift(), kros(), warden(), curator(), scrollwielder(), cannonade()));
});

describe("round 314: Heirloom Epic", () => {
  it("taps creatures for the mana in its cost, no more than that much, creatures only", () => {
    const { s: s0, ap } = setup([]);
    const book = putOnBattlefield(s0, ap, epic());
    const bears = ["A", "B", "C", "D", "E"].map((n) => putOnBattlefield(s0, ap, bear(`Test Bear ${n}`)));
    const other = putOnBattlefield(s0, ap, epic());
    tapLands(s0, ap);
    let s = s0;
    // Five creatures for {4}: one too many (rulings). An artifact that isn't a creature can't pay.
    expect(abilityProblem(s, ap, book, 0, undefined, undefined, bears)).toMatch(/no more than 4 creatures/);
    expect(abilityProblem(s, ap, book, 0, undefined, undefined, [bears[0]!, bears[1]!, bears[2]!, other])).toMatch(/only creatures you control/);
    expect(abilityProblem(s, ap, book, 0, undefined, undefined, bears.slice(0, 4))).toBeNull();
    // With no mana, autopay taps four creatures and nothing else.
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planActivate(s, ap, book, 0)), ap);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(bears.filter((b) => s.objects[b]!.tapped).length).toBe(4);
    expect(s.objects[other]!.tapped).toBe(false);
    expect(logHas(s, /to pay for it/)).toBe(true);
  });

  it("mixes mana and creatures to pay its cost", () => {
    const { s: s0, ap } = setup([]);
    const book = putOnBattlefield(s0, ap, epic());
    const b1 = putOnBattlefield(s0, ap, bear("Test Bear A"));
    const b2 = putOnBattlefield(s0, ap, bear("Test Bear B"));
    tapLands(s0, ap, ["Forest", "Forest"]);
    let s = s0;
    // Two lands and two creatures pay {4}.
    s = settle(run(s, planActivate(s, ap, book, 0)), ap);
    expect(s.objects[b1]!.tapped && s.objects[b2]!.tapped).toBe(true);
    expect(s.objects[book]!.tapped).toBe(true);
  });
});

describe("round 314: Waterbender's Restoration", () => {
  it("announces X, waterbends {X} with creatures, and exiles X creatures you control until the next end step", () => {
    const { s: s0, ap, opp, ids } = setup([restoration()]);
    const b1 = putOnBattlefield(s0, ap, bear("Test Bear A"));
    const b2 = putOnBattlefield(s0, ap, bear("Test Bear B"));
    const b3 = putOnBattlefield(s0, ap, bear("Test Bear C"));
    const theirs = putOnBattlefield(s0, opp, bear("Test Bear D"));
    tapLands(s0, ap, ["Island", "Island"]);
    let s = s0;
    // X targets exactly (CR 601.2c): two for X = 2, only your own creatures.
    expect(castProblem(s, ap, ids[0]!, [tgt(b1)], undefined, undefined, undefined, 2)).toBeTruthy();
    expect(planCast(s, ap, ids[0]!, [tgt(b1), tgt(theirs)], undefined, "auto", 2)).toBeNull();
    // Only {U}{U} in lands: the {2} is paid by tapping two artifacts or creatures.
    const plan = planCast(s, ap, ids[0]!, [tgt(b1), tgt(b2)], undefined, "auto", 2);
    expect(plan).not.toBeNull();
    s = settle(run(s, plan), ap);
    expect(zone(s, b1)).toBe("exile");
    expect(zone(s, b2)).toBe("exile");
    expect(zone(s, b3)).toBe("battlefield");
    expect(logHas(s, /to waterbend/)).toBe(true);
    // Back at the beginning of the next end step, under their owner's control.
    s = passUntil(s, "end");
    s = settle(s, ap);
    expect(zone(s, b1)).toBe("battlefield");
    expect(zone(s, b2)).toBe("battlefield");
  });

  it("can't tap more than X for the waterbend cost", () => {
    const { s: s0, ap, ids } = setup([restoration()]);
    const b1 = putOnBattlefield(s0, ap, bear("Test Bear A"));
    const b2 = putOnBattlefield(s0, ap, bear("Test Bear B"));
    tapLands(s0, ap, ["Island", "Island"]);
    // X = 1 but two creatures tapped for it.
    expect(castProblem(s0, ap, ids[0]!, [tgt(b1)], undefined, undefined, undefined, 1, { waterbend: [b1, b2] })).toMatch(/no more than 1/);
    // X = 0: no targets, nothing to waterbend.
    expect(planCast(s0, ap, ids[0]!, [], undefined, "auto", 0)).not.toBeNull();
  });
});

describe("round 314: Astral Drift", () => {
  it("cycling it from the hand triggers, before the draw, and the creature comes back at the next end step", () => {
    const { s: s0, ap, opp, ids } = setup([drift()]);
    const theirs = putOnBattlefield(s0, opp, bear("Test Bear D"));
    let s = s0;
    const hand = s.players[ap]!.hand.length;
    s = run(s, planActivate(s, ap, ids[0]!, cyclingIndex(s, ids[0]!)));
    s = settle(s, ap);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(theirs)] });
    s = settle(s, ap);
    expect(s.pending?.kind).toBe("chooseMay");
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = settle(s, ap);
    expect(zone(s, theirs)).toBe("exile");
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand); // cycled one, drew one
    s = passUntil(s, "end");
    s = settle(s, ap);
    expect(zone(s, theirs)).toBe("battlefield");
    expect(s.objects[theirs]!.controller).toBe(opp);
  });

  it("on the battlefield, cycling another card triggers it; saying no leaves the creature", () => {
    const { s: s0, ap, opp, ids } = setup([cycler]);
    putOnBattlefield(s0, ap, drift());
    const theirs = putOnBattlefield(s0, opp, bear("Test Bear D"));
    let s = s0;
    s = run(s, planActivate(s, ap, ids[0]!, cyclingIndex(s, ids[0]!)));
    s = settle(s, ap);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(theirs)] });
    s = settle(s, ap);
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    s = settle(s, ap);
    expect(zone(s, theirs)).toBe("battlefield");
  });
});

describe("round 314: Kros, Defense Contractor", () => {
  it("taps and goads a creature you don't control that you put a counter on, with trample until your next turn", () => {
    const { s: s0, ap, opp, ids } = setup([growth, growth]);
    putOnBattlefield(s0, ap, kros());
    const theirs = putOnBattlefield(s0, opp, bear("Test Bear D"));
    const mine = putOnBattlefield(s0, ap, bear("Test Bear A"));
    let s = s0;
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(theirs)])), ap);
    expect(s.objects[theirs]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[theirs]!.tapped).toBe(true);
    const ch = characteristics(s, s.objects[theirs]!);
    expect(ch.goadedBy).toContain(ap);
    expect(ch.keywords).toContain("Trample");
    // Your own creature: no trigger.
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(mine)])), ap);
    expect(s.objects[mine]!.tapped).toBe(false);
    expect(characteristics(s, s.objects[mine]!).goadedBy).toEqual([]);
  });
});

describe("round 314: Trove Warden", () => {
  it("exiles a permanent card with landfall and puts it onto the battlefield under its owner's control as the Warden dies", () => {
    const { s: s0, ap, ids } = setup([card("Forest", "Basic Land — Forest"), bolt()]);
    const w = putOnBattlefield(s0, ap, warden());
    const hopper = inZone(s0, ap, ornithopter(), "graveyard");
    const bigOne = inZone(s0, ap, kros(), "graveyard");
    let s = s0;
    s = run(s, [{ type: "playLand", player: ap, objectId: ids[0]! }]);
    s = settle(s, ap);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    // Mana value 3 or less only.
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(bigOne)] })).toThrow();
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(hopper)] });
    s = settle(s, ap);
    expect(zone(s, hopper)).toBe("exile");
    // The Warden dies: the Ornithopter comes back.
    s.objects[w]!.damage = 1;
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(w)])), ap);
    expect(zone(s, w)).toBe("graveyard");
    expect(zone(s, hopper)).toBe("battlefield");
    expect(s.objects[hopper]!.controller).toBe(ap);
  });
});

describe("round 314: Keen-Eyed Curator", () => {
  it("gets +4/+4 and trample with four card types among the cards it exiled, an artifact creature counting twice", () => {
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, ap, curator());
    const hopper = inZone(s0, opp, ornithopter(), "graveyard");
    const instant = inZone(s0, opp, bolt(), "graveyard");
    const sorcery = inZone(s0, ap, divination(), "graveyard");
    let s = s0;
    const exileOne = (st: GameState, id: string) => settle(run(st, planActivate(st, ap, c, 0, [tgt(id)])), ap);
    s = exileOne(s, hopper);
    s = exileOne(s, instant);
    expect(zone(s, hopper)).toBe("exile");
    expect(power(s, s.objects[c]!)).toBe(3); // artifact, creature, instant: three
    expect(characteristics(s, s.objects[c]!).keywords).not.toContain("Trample");
    s = exileOne(s, sorcery);
    expect(power(s, s.objects[c]!)).toBe(7);
    expect(toughness(s, s.objects[c]!)).toBe(7);
    expect(characteristics(s, s.objects[c]!).keywords).toContain("Trample");
  });
});

describe("round 314: Radiant Scrollwielder", () => {
  it("exiles an instant or sorcery card at random at your upkeep; cast this turn, it's exiled again instead of going to your graveyard", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, scrollwielder());
    const b = inZone(s0, ap, bolt(), "graveyard");
    inZone(s0, ap, bear("Test Bear A"), "graveyard");
    s0.players[ap]!.hand = [];
    let s = passUntil(s0, "upkeep", s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]);
    s = passUntil(s, "upkeep", ap);
    s = settle(s, ap);
    expect(zone(s, b)).toBe("exile");
    expect(s.objects[b]!.mayPlay?.exileAfter).toBe(true);
    s = passUntil(s, "main1", ap);
    s.players[ap]!.manaPool.R = 1;
    const life = s.players[opp]!.life;
    const mine = s.players[ap]!.life;
    s = settle(run(s, planCast(s, ap, b, [{ kind: "player", id: opp }])), ap);
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(s.players[ap]!.life).toBe(mine + 3); // lifelink from its first ability
    expect(zone(s, b)).toBe("exile");
  });
});

describe("round 314: Brazen Cannonade", () => {
  it("after you attacked, exiles the top card at each postcombat main; playable until end of combat on your next turn", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, cannonade());
    const attacker = putOnBattlefield(s0, ap, bear("Test Bear A"));
    const top = inZone(s0, ap, bolt(), "library");
    let s = passUntil(s0, "declareAttackers", ap);
    const defender = s.turnOrder.find((p) => p !== ap)!;
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker, defender }] });
    s = passUntil(s, "main2", ap);
    s = settle(s, ap);
    expect(zone(s, top)).toBe("exile");
    expect(s.objects[top]!.mayPlay?.until).toBe("yourNextCombat");
    // Still there on the opponents' turns and in your next turn's first main phase.
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]);
    expect(s.objects[top]!.mayPlay).toBeTruthy();
    s = passUntil(s, "main1", ap);
    expect(s.objects[top]!.mayPlay).toBeTruthy();
    // Over once that turn's end of combat step ends.
    s = passUntil(s, "main2", ap);
    expect(s.objects[top]!.mayPlay).toBeUndefined();
    expect(zone(s, top)).toBe("exile");
  });

  it("doesn't trigger in a turn you didn't attack", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, cannonade());
    const top = inZone(s0, ap, bolt(), "library");
    let s = passUntil(s0, "main2", ap);
    s = settle(s, ap);
    expect(zone(s, top)).toBe("library");
  });
});
