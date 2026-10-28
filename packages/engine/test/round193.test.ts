// Round 193: more of the harder cards both lanes skipped, from the most played down: "whenever you cast a spell this
// turn" as a Saga chapter (Showdown of the Skalds, Origin of Thor), "if you do, it becomes plotted" (Kellan Joins Up, Jace
// Reawakened), Curse of Unbinding, Tersa Lightshatter's random card, The Akroan War, Fall of the First Civilization,
// Primal Surge, "cards of the chosen type" (For the Ancestors), Brass Infiniscope's "half X life", Pia's Revolution,
// "attach any number of Equipment" (Beatrix, Loyal General, Battlefield Improvisation), Legion's Initiative, and day and
// night: "whenever day becomes night or night becomes day", "it becomes day as this creature enters", The Celestus.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { castProblem, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; "you may" questions get `yes`. Stops at any other question. */
const resolveAll = (s: GameState, yes = true) => {
  for (let i = 0; i < 120 && (s.stack.length || s.triggerQueue.length || s.pending?.kind === "chooseMay"); i++) {
    if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: s.pending.player, yes });
    else if (s.pending) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const choose = (s: GameState, targets: TargetChoice[]) => (s.pending?.kind === "chooseTargets" ? act(s, { type: "chooseTargets", player: s.pending.player, targets }) : s);
const option = (s: GameState, choice: string) => {
  if (s.pending?.kind !== "chooseOption") throw new Error(`no option question: ${s.pending?.kind}`);
  return act(s, { type: "chooseOption", player: s.pending.player, choice });
};
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const counters = (s: GameState, id: string, c = "+1/+1") => s.objects[id]!.counters[c] ?? 0;
const pt = (s: GameState, id: ObjectId) => [power(s, s.objects[id]!), toughness(s, s.objects[id]!)];
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && s.cards[s.objects[id]!.cardId]!.name === name);
const next = (s: GameState, pid: PlayerId, k = 1) => s.turnOrder[(s.turnOrder.indexOf(pid) + k) % 4]!;
/** Passes (no attacks or blocks, "you may" answered yes) until `step` of `ap`'s turn with an empty stack, or until another question. */
const toStep = (s: GameState, step: GameState["step"], ap: PlayerId) => {
  for (let i = 0; i < 800; i++) {
    if (s.step === step && s.activePlayer === ap && !s.stack.length && !s.triggerQueue.length && !s.pending) return s;
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: p.player, attacks: [] });
    else if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: true });
    else if (p?.kind === "discardToHandSize") s = act(s, { type: "discard", player: p.player, objectIds: s.players[p.player]!.hand.slice(0, p.count) });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  throw new Error(`never reached ${step}`);
};
const shock = card("Test Shock", "Instant", "{R}", { cmc: 1, oracleText: "This spell deals 2 damage to any target." });
const fireball = card("Test Fireball", "Sorcery", "{X}{R}", { cmc: 1, oracleText: "This spell deals X damage to any target." });
const creature = (name: string, sub: string, p: number, t = p, color = "{R}") => card(name, `Creature — ${sub}`, color, { cmc: 1, power: String(p), toughness: String(t) });
const sword = (name: string) => card(name, "Artifact — Equipment", "{1}", { cmc: 1, oracleText: "Equipped creature gets +1/+1.\nEquip {1}" });

// Real oracle text (Scryfall).
const showdown = card("Showdown of the Skalds", "Enchantment — Saga", "{2}{R}{W}", {"cmc":4,"keywords":[],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — Exile the top four cards of your library. Until the end of your next turn, you may play those cards.\nII, III — Whenever you cast a spell this turn, put a +1/+1 counter on target creature you control.","colors":["R","W"]});
const origin = card("Origin of Thor", "Enchantment — Saga", "{2}{R}", {"cmc":3,"keywords":[],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — You may discard a card. If you do, draw two cards.\nII — Whenever you cast a spell this turn, put a +1/+1 counter on target creature you control.\nIII — Target creature you control deals damage equal to its power to each opponent.","colors":["R"]});
const kellan = card("Kellan Joins Up", "Legendary Enchantment", "{G}{W}{U}", {"cmc":3,"keywords":["Plot"],"oracleText":"When Kellan Joins Up enters, you may exile a nonland card with mana value 3 or less from your hand. If you do, it becomes plotted. (You may cast it as a sorcery on a later turn without paying its mana cost.)\nWhenever a legendary creature you control enters, put a +1/+1 counter on each creature you control.","colors":["G","U","W"]});
const jace = card("Jace Reawakened", "Legendary Planeswalker — Jace", "{U}{U}", {"cmc":2,"loyalty":"3","keywords":["Plot"],"oracleText":"You can't cast Jace Reawakened during your first, second, or third turns of the game.\n+1: Draw a card, then discard a card.\n+1: You may exile a nonland card with mana value 3 or less from your hand. If you do, it becomes plotted.\n−6: Until end of turn, whenever you cast a spell, copy it. You may choose new targets for the copy.","colors":["U"]});
const curse = card("Curse of Unbinding", "Enchantment — Aura Curse", "{6}{U}", {"cmc":7,"keywords":["Enchant"],"oracleText":"Enchant player\nAt the beginning of enchanted player's upkeep, that player reveals cards from the top of their library until they reveal a creature card. Put that card onto the battlefield under your control. That player puts the rest of the revealed cards into their graveyard.","colors":["U"]});
const tersa = card("Tersa Lightshatter", "Legendary Creature — Orc Wizard", "{2}{R}", {"cmc":3,"power":"3","toughness":"3","keywords":["Haste"],"oracleText":"Haste\nWhen Tersa Lightshatter enters, discard up to two cards, then draw that many cards.\nWhenever Tersa Lightshatter attacks, if there are seven or more cards in your graveyard, exile a card at random from your graveyard. You may play that card this turn.","colors":["R"]});
const akroan = card("The Akroan War", "Enchantment — Saga", "{3}{R}", {"cmc":4,"keywords":[],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — Gain control of target creature for as long as this Saga remains on the battlefield.\nII — Until your next turn, creatures your opponents control attack each combat if able.\nIII — Each tapped creature deals damage to itself equal to its power.","colors":["R"]});
const fall = card("Fall of the First Civilization", "Enchantment — Saga", "{2}{W}", {"cmc":3,"keywords":[],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — You and target opponent each draw two cards.\nII — Exile target artifact an opponent controls.\nIII — Each player chooses three nonland permanents they control. Destroy all other nonland permanents.","colors":["W"]});
const primal = card("Primal Surge", "Sorcery", "{8}{G}{G}", {"cmc":10,"keywords":[],"oracleText":"Exile the top card of your library. If it's a permanent card, you may put it onto the battlefield. If you do, repeat this process.","colors":["G"]});
const ancestors = card("For the Ancestors", "Instant", "{2}{G}", {"cmc":3,"keywords":["Flashback"],"oracleText":"Choose a creature type. Look at the top six cards of your library. You may reveal any number of cards of the chosen type from among them and put the revealed cards into your hand. Put the rest on the bottom of your library in a random order.\nFlashback {3}{G} (You may cast this card from your graveyard for its flashback cost. Then exile it.)","colors":["G"]});
const brass = card("Brass Infiniscope", "Artifact", "{4}", {"cmc":4,"keywords":[],"oracleText":"{T}: Add {C}{C}. When you next cast a spell with {X} in its mana cost this turn, you draw a card and gain half X life, rounded down.","colors":[]});
const pias = card("Pia's Revolution", "Enchantment", "{2}{R}", {"cmc":3,"keywords":[],"oracleText":"Whenever a nontoken artifact is put into your graveyard from the battlefield, return that card to your hand unless target opponent has this enchantment deal 3 damage to them.","colors":["R"]});
const beatrix = card("Beatrix, Loyal General", "Legendary Creature — Human Soldier", "{4}{W}{W}", {"cmc":6,"power":"4","toughness":"4","keywords":["Vigilance"],"oracleText":"Vigilance (Attacking doesn't cause this creature to tap.)\nAt the beginning of combat on your turn, you may attach any number of Equipment you control to target creature you control.","colors":["W"]});
const improvisation = card("Battlefield Improvisation", "Instant", "{1}{W}", {"cmc":2,"keywords":[],"oracleText":"Target creature gets +2/+2 until end of turn. If that creature is attacking, you may attach any number of Equipment you control to it.","colors":["W"]});
const legions = card("Legion's Initiative", "Enchantment", "{R}{W}", {"cmc":2,"keywords":[],"oracleText":"Red creatures you control get +1/+0.\nWhite creatures you control get +0/+1.\n{R}{W}, Exile this enchantment: Exile all creatures you control. At the beginning of the next combat, return those cards to the battlefield under their owner's control and those creatures gain haste until end of turn.","colors":["R","W"]});
const theCelestus = card("The Celestus", "Legendary Artifact", "{3}", {"cmc":3,"keywords":[],"oracleText":"If it's neither day nor night, it becomes day as The Celestus enters.\n{T}: Add one mana of any color.\n{3}, {T}: If it's night, it becomes day. Otherwise, it becomes night. Activate only as a sorcery.\nWhenever day becomes night or night becomes day, you gain 1 life. You may draw a card. If you do, discard a card.","colors":[]});
const vadrik = card("Vadrik, Astral Archmage", "Legendary Creature — Human Wizard", "{1}{U}{R}", {"cmc":3,"power":"1","toughness":"2","keywords":[],"oracleText":"If it's neither day nor night, it becomes day as Vadrik enters.\nInstant and sorcery spells you cast cost {X} less to cast, where X is Vadrik's power.\nWhenever day becomes night or night becomes day, put a +1/+1 counter on Vadrik.","colors":["R","U"]});
const brimstone = card("Brimstone Vandal", "Creature — Devil", "{2}{R}", {"cmc":3,"power":"2","toughness":"3","keywords":["Menace"],"oracleText":"Menace (This creature can't be blocked except by two or more creatures.)\nIf it's neither day nor night, it becomes day as this creature enters.\nWhenever day becomes night or night becomes day, this creature deals 1 damage to each opponent.","colors":["R"]});
const collector = card("Component Collector", "Creature — Homunculus", "{2}{U}", {"cmc":3,"power":"1","toughness":"4","keywords":[],"oracleText":"If it's neither day nor night, it becomes day as this creature enters.\nWhenever day becomes night or night becomes day, you may tap or untap target nonland permanent.","colors":["U"]});
const firmament = card("Firmament Sage", "Creature — Human Wizard", "{3}{U}", {"cmc":4,"power":"2","toughness":"3","keywords":[],"oracleText":"If it's neither day nor night, it becomes day as this creature enters.\nWhenever day becomes night or night becomes day, draw a card.","colors":["U"]});
const gavony = card("Gavony Dawnguard", "Creature — Human Soldier", "{1}{W}{W}", {"cmc":3,"power":"3","toughness":"3","keywords":["Ward"],"oracleText":"Ward {1}\nIf it's neither day nor night, it becomes day as this creature enters.\nWhenever day becomes night or night becomes day, look at the top four cards of your library. You may reveal a creature card with mana value 3 or less from among them and put it into your hand. Put the rest on the bottom of your library in any order.","colors":["W"]});
const obsessive = card("Obsessive Astronomer", "Creature — Human Wizard", "{1}{R}", {"cmc":2,"power":"2","toughness":"2","keywords":[],"oracleText":"If it's neither day nor night, it becomes day as this creature enters.\nWhenever day becomes night or night becomes day, discard up to two cards, then draw that many cards.","colors":["R"]});
const sunrise = card("Sunrise Cavalier", "Creature — Human Knight", "{1}{R}{W}", {"cmc":3,"power":"3","toughness":"3","keywords":["Haste","Trample"],"oracleText":"Trample, haste\nIf it's neither day nor night, it becomes day as this creature enters.\nWhenever day becomes night or night becomes day, put a +1/+1 counter on target creature you control.","colors":["R","W"]});
const sunstreak = card("Sunstreak Phoenix", "Creature — Phoenix", "{2}{R}{R}", {"cmc":4,"power":"4","toughness":"2","keywords":["Flying"],"oracleText":"Flying\nIf it's neither day nor night, it becomes day as this creature enters.\nWhenever day becomes night or night becomes day, you may pay {1}{R}. If you do, return this card from your graveyard to the battlefield tapped.","colors":["R"]});
const sanctifier = card("Celestus Sanctifier", "Creature — Human Cleric", "{2}{W}", {"cmc":3,"power":"3","toughness":"2","keywords":[],"oracleText":"If it's neither day nor night, it becomes day as this creature enters.\nWhenever day becomes night or night becomes day, look at the top two cards of your library. Put one of them into your graveyard.","colors":["W"]});
const guildpact = card("Jace, the Living Guildpact", "Legendary Planeswalker — Jace", "{2}{U}{U}", {"cmc":4,"loyalty":"5","keywords":[],"oracleText":"+1: Look at the top two cards of your library. Put one of them into your graveyard.\n−3: Return another target nonland permanent to its owner's hand.\n−8: Each player shuffles their hand and graveyard into their library. You draw seven cards.","colors":["U"]});

const ALL = [showdown, origin, kellan, jace, curse, tersa, akroan, fall, primal, ancestors, brass, pias, beatrix, improvisation, legions, theCelestus, vadrik, brimstone, collector, firmament, gavony, obsessive, sunrise, sunstreak, sanctifier, guildpact];

describe("Round 193", () => {
  it("all compile", () => supported(...ALL));

  it("Origin of Thor: chapter II puts a counter on a creature for each spell cast that turn only; III deals its power to each opponent", () => {
    let { s, ap, ids } = setup([shock, shock]);
    const saga = putOnBattlefield(s, ap, origin);
    s.objects[saga]!.counters.lore = 1;
    const guy = putOnBattlefield(s, ap, creature("Test Brute", "Giant", 3));
    s = toStep(s, "main1", next(s, ap));
    s = toStep(s, "main1", ap);
    expect(s.objects[saga]!.counters.lore).toBe(2);
    const opp = next(s, ap);
    s = run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }]));
    s = choose(s, [tgt(guy)]);
    s = resolveAll(s);
    expect(counters(s, guy)).toBe(1);
    expect(life(s, opp)).toBe(38);
    s = toStep(s, "main1", next(s, ap));
    s = toStep(s, "main1", ap);
    s = choose(s, [tgt(guy)]);
    s = resolveAll(s);
    for (const p of [1, 2, 3]) expect(life(s, next(s, ap, p))).toBe(p === 1 ? 34 : 36);
    expect(zone(s, saga)).toBe("graveyard");
    // Chapter II's trigger lasted only that turn.
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }]));
    expect(s.pending?.kind).not.toBe("chooseTargets");
    s = resolveAll(s);
    expect(counters(s, guy)).toBe(1);
  });

  it("Showdown of the Skalds: chapter II triggers on every spell cast that turn", () => {
    let { s, ap, ids } = setup([shock, shock]);
    const saga = putOnBattlefield(s, ap, showdown);
    s.objects[saga]!.counters.lore = 1;
    const guy = putOnBattlefield(s, ap, creature("Test Brute", "Giant", 3));
    s = toStep(s, "main1", next(s, ap));
    s = toStep(s, "main1", ap);
    const opp = next(s, ap);
    for (const id of ids) {
      s = run(s, planCast(s, ap, id, [{ kind: "player", id: opp }]));
      s = choose(s, [tgt(guy)]);
      s = resolveAll(s);
    }
    expect(counters(s, guy)).toBe(2);
  });

  it("Kellan Joins Up: exile a nonland card with mana value 3 or less from your hand; it's plotted, cast free on a later turn", () => {
    const cheap = creature("Test Cheap", "Goblin", 2);
    let { s, ap, ids } = setup([kellan, cheap]);
    s = run(s, planCast(s, ap, ids[0]!));
    s = resolveAll(s);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 1 });
    expect((s.pending as { cards: string[] }).cards).toContain(ids[1]);
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [ids[1]!] }));
    expect(zone(s, ids[1]!)).toBe("exile");
    expect(s.objects[ids[1]!]!.mayPlay?.until).toBe("plot");
    expect(castProblem(s, ap, ids[1]!)).not.toBeNull(); // not this turn
    s = toStep(s, "main1", next(s, ap));
    expect(castProblem(s, ap, ids[1]!)).not.toBeNull(); // only as a sorcery
    s = toStep(s, "main1", ap);
    expect(castProblem(s, ap, ids[1]!)).toBeNull();
    const pool = (x: GameState) => x.battlefield.filter((id) => controllerOf(x, x.objects[id]!) === ap && !x.objects[id]!.tapped).length;
    const before = pool(s);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(zone(s, ids[1]!)).toBe("battlefield");
    expect(pool(s)).toBe(before + 1); // without paying its mana cost
  });

  it("Curse of Unbinding: at enchanted player's upkeep, their first creature card revealed comes to you, the rest go to their graveyard", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const c = putOnBattlefield(s, ap, curse);
    s.objects[c]!.attachedToPlayer = opp;
    const beast = into(s, opp, creature("Test Beast", "Beast", 4), "library");
    const junk = [into(s, opp, shock, "library"), into(s, opp, fireball, "library")];
    invalidateCharacteristics(s);
    s = toStep(s, "draw", opp);
    expect(zone(s, beast)).toBe("battlefield");
    expect(controllerOf(s, s.objects[beast]!)).toBe(ap);
    for (const j of junk) expect(zone(s, j)).toBe("graveyard");
    expect(s.players[opp]!.graveyard).toEqual(expect.arrayContaining(junk));
  });

  it("Tersa Lightshatter: attacking with seven or more cards in your graveyard exiles one at random, playable this turn", () => {
    let { s, ap } = setup([]);
    const t = putOnBattlefield(s, ap, tersa);
    const yard = Array.from({ length: 7 }, () => into(s, ap, shock, "graveyard"));
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: t, defender: next(s, ap) }] });
    s = resolveAll(s);
    const gone = yard.filter((id) => zone(s, id) === "exile");
    expect(gone).toHaveLength(1);
    expect(s.objects[gone[0]!]!.mayPlay).toMatchObject({ player: ap, until: "thisTurn" });
    s = resolveAll(run(s, planCast(s, ap, gone[0]!, [{ kind: "player", id: next(s, ap) }])));
    expect(zone(s, gone[0]!)).toBe("graveyard");
    expect(life(s, next(s, ap))).toBe(38);
  });

  it("Tersa Lightshatter: nothing with fewer than seven cards in your graveyard", () => {
    let { s, ap } = setup([]);
    const t = putOnBattlefield(s, ap, tersa);
    const yard = Array.from({ length: 6 }, () => into(s, ap, shock, "graveyard"));
    s = passUntil(s, "declareAttackers", ap);
    s = resolveAll(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: t, defender: next(s, ap) }] }));
    expect(yard.every((id) => zone(s, id) === "graveyard")).toBe(true);
  });

  it("The Akroan War: chapter II makes opponents' creatures attack until your next turn; III has each tapped creature deal damage to itself", () => {
    let { s, ap } = setup([]);
    const saga = putOnBattlefield(s, ap, akroan);
    s.objects[saga]!.counters.lore = 1;
    const opp = next(s, ap);
    const theirs = putOnBattlefield(s, opp, creature("Test Ogre", "Ogre", 3));
    const mine = putOnBattlefield(s, ap, creature("Test Brute", "Giant", 3));
    s = toStep(s, "main1", next(s, ap, 3));
    s = toStep(s, "main1", ap);
    expect(s.objects[saga]!.counters.lore).toBe(2);
    s = passUntil(s, "declareAttackers", opp);
    expect(() => act(s, { type: "declareAttackers", player: opp, attacks: [] })).toThrow(/attacks each combat if able/);
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: theirs, defender: next(s, opp) }] });
    s = toStep(s, "upkeep", ap);
    s.objects[theirs]!.tapped = true;
    s.objects[mine]!.tapped = true;
    const untapped = putOnBattlefield(s, opp, creature("Test Troll", "Troll", 3));
    s = toStep(s, "main1", ap);
    s = choose(s, []);
    s = resolveAll(s);
    expect(zone(s, theirs)).toBe("graveyard");
    expect(zone(s, mine)).toBe("graveyard");
    expect(zone(s, untapped)).toBe("battlefield");
  });

  it("Fall of the First Civilization: chapter III, each player keeps three nonland permanents and the rest are destroyed", () => {
    let { s, ap } = setup([]);
    const saga = putOnBattlefield(s, ap, fall);
    s.objects[saga]!.counters.lore = 2;
    const opp = next(s, ap);
    const mine = [1, 2, 3, 4].map((i) => putOnBattlefield(s, ap, creature(`Test Mine ${i}`, "Giant", 1)));
    const theirs = [1, 2].map((i) => putOnBattlefield(s, opp, creature(`Test Theirs ${i}`, "Ogre", 1)));
    s = toStep(s, "main1", next(s, ap, 3));
    s = toStep(s, "main1", ap);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, count: 3, action: "keep" });
    s = act(s, { type: "pickPermanents", player: ap, ids: mine.slice(0, 3) });
    // An opponent with fewer than three keeps them all; the others are asked in turn.
    for (let i = 0; i < 6 && s.pending?.kind === "pickPermanents"; i++) {
      const p = s.pending;
      s = act(s, { type: "pickPermanents", player: p.player, ids: p.options.slice(0, p.count) });
    }
    s = resolveAll(s);
    expect(mine.map((id) => zone(s, id))).toEqual(["battlefield", "battlefield", "battlefield", "graveyard"]);
    for (const id of theirs) expect(zone(s, id)).toBe("battlefield");
    expect(zone(s, saga)).toBe("graveyard");
  });

  it("Primal Surge: permanent cards onto the battlefield until a card that isn't one", () => {
    let { s, ap, ids } = setup([primal]);
    const last = into(s, ap, bear({ name: "Test Last Bear" }), "library");
    const stop = into(s, ap, shock, "library");
    const first = [into(s, ap, sword("Test Sword"), "library"), into(s, ap, bear({ name: "Test Bear" }), "library")];
    s = run(s, planCast(s, ap, ids[0]!));
    s = resolveAll(s);
    expect(first.map((id) => zone(s, id))).toEqual(["battlefield", "battlefield"]);
    expect(zone(s, stop)).toBe("exile");
    expect(zone(s, last)).toBe("library");
  });

  it("Primal Surge: a permanent card you don't put onto the battlefield stays in exile, and it's done", () => {
    let { s, ap, ids } = setup([primal]);
    const second = into(s, ap, bear({ name: "Test Bear 2" }), "library");
    const first = into(s, ap, bear({ name: "Test Bear" }), "library");
    s = run(s, planCast(s, ap, ids[0]!));
    s = resolveAll(s, false);
    expect(zone(s, first)).toBe("exile");
    expect(zone(s, second)).toBe("library");
  });

  it("For the Ancestors: cards of the chosen creature type, changelings included, into your hand; the rest on the bottom", () => {
    let { s, ap, ids } = setup([ancestors]);
    const elf = creature("Test Elf", "Elf Warrior", 1, 1, "{G}");
    const changeling = card("Test Changeling", "Creature — Shapeshifter", "{1}", { cmc: 1, power: "1", toughness: "1", keywords: ["Changeling"], oracleText: "Changeling (This card is every creature type.)" });
    const top = [into(s, ap, elf, "library"), into(s, ap, shock, "library"), into(s, ap, changeling, "library"), into(s, ap, bear({ name: "Test Bear" }), "library"), into(s, ap, elf, "library"), into(s, ap, shock, "library")].reverse();
    s = run(s, planCast(s, ap, ids[0]!));
    s = resolveAll(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "creatureType" });
    s = resolveAll(option(s, "Elf"));
    expect(s.pending?.kind).toBe("searchLibrary");
    const cards = (s.pending as { cards: string[] }).cards;
    expect([...cards].sort()).toEqual([top[1]!, top[3]!, top[5]!].sort());
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [top[1]!, top[3]!] }));
    expect(zone(s, top[1]!)).toBe("hand");
    expect(zone(s, top[3]!)).toBe("hand");
    const lib = s.players[ap]!.library;
    expect(lib.slice(-4).sort()).toEqual([top[0]!, top[2]!, top[4]!, top[5]!].sort());
  });

  it("Brass Infiniscope: the next spell with {X} in its mana cost this turn draws a card and gains half X life, rounded down", () => {
    let { s, ap, ids } = setup([shock, fireball]);
    const b = putOnBattlefield(s, ap, brass);
    const opp = next(s, ap);
    s = act(s, { type: "activateMana", player: ap, objectId: b, mana: "C" });
    expect(s.players[ap]!.manaPool.C).toBe(2);
    // A spell without {X} doesn't use it up.
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }])));
    const hand = s.players[ap]!.hand.length;
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }], undefined, undefined, 5));
    s = resolveAll(s);
    expect(s.players[ap]!.hand.length).toBe(hand); // drew one, cast one
    expect(life(s, ap)).toBe(42);
    expect(life(s, opp)).toBe(33);
  });

  it("Pia's Revolution: an artifact put into your graveyard returns to your hand unless the opponent takes 3 damage", () => {
    const shatter = card("Test Shatter", "Instant", "{1}{R}", { cmc: 2, oracleText: "Destroy target artifact." });
    let { s, ap, ids } = setup([shatter, shatter]);
    putOnBattlefield(s, ap, pias);
    const opp = next(s, ap);
    const swords = [putOnBattlefield(s, ap, sword("Test Sword")), putOnBattlefield(s, ap, sword("Test Blade"))];
    s = run(s, planCast(s, ap, ids[0]!, [tgt(swords[0]!)]));
    s = choose(resolveAll(s), [{ kind: "player", id: opp }]);
    for (let i = 0; i < 20 && s.stack.length && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    // The opponent chooses.
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: opp });
    s = resolveAll(act(s, { type: "chooseMay", player: opp, yes: true }));
    expect(life(s, opp)).toBe(37);
    expect(zone(s, swords[0]!)).toBe("graveyard");
    s = run(s, planCast(s, ap, ids[1]!, [tgt(swords[1]!)]));
    s = choose(resolveAll(s), [{ kind: "player", id: opp }]);
    for (let i = 0; i < 20 && s.stack.length && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = resolveAll(act(s, { type: "chooseMay", player: opp, yes: false }));
    expect(life(s, opp)).toBe(37);
    expect(zone(s, swords[1]!)).toBe("hand");
  });

  it("Beatrix, Loyal General: at the beginning of combat, any number of your Equipment onto target creature you control", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, beatrix);
    const guy = putOnBattlefield(s, ap, creature("Test Brute", "Giant", 2));
    const other = putOnBattlefield(s, ap, creature("Test Squire", "Human", 1));
    const swords = [putOnBattlefield(s, ap, sword("Test Sword")), putOnBattlefield(s, ap, sword("Test Blade")), putOnBattlefield(s, ap, sword("Test Axe"))];
    s.objects[swords[2]!]!.attachedTo = other;
    const aura = putOnBattlefield(s, ap, card("Test Aura", "Enchantment — Aura", "{W}", { cmc: 1, keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature gets +1/+1." }));
    s.objects[aura]!.attachedTo = other;
    invalidateCharacteristics(s);
    s = passUntil(s, "beginCombat", ap);
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = choose(s, [tgt(guy)]);
    s = resolveAll(s);
    // Chosen as it resolves, Equipment only (not Auras), any number of them, the one on another creature too.
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "attach", min: 0, anyNumber: true });
    expect([...(s.pending as { options: string[] }).options].sort()).toEqual([...swords].sort());
    expect((s.pending as { prompt?: string }).prompt).toMatch(/any number of your Equipment/);
    s = resolveAll(act(s, { type: "pickPermanents", player: ap, ids: [swords[0]!, swords[2]!] }));
    expect(s.objects[swords[0]!]!.attachedTo).toBe(guy);
    expect(s.objects[swords[2]!]!.attachedTo).toBe(guy);
    expect(s.objects[swords[1]!]!.attachedTo).toBeUndefined();
    expect(s.objects[aura]!.attachedTo).toBe(other);
    expect(pt(s, guy)).toEqual([4, 4]);
  });

  it("Battlefield Improvisation: +2/+2; Equipment only onto an attacking creature", () => {
    let { s, ap, ids } = setup([improvisation, improvisation]);
    const guy = putOnBattlefield(s, ap, creature("Test Brute", "Giant", 2));
    const blade = putOnBattlefield(s, ap, sword("Test Blade"));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(guy)])));
    expect(s.pending).toBeNull();
    expect(pt(s, guy)).toEqual([4, 4]);
    expect(s.objects[blade]!.attachedTo).toBeUndefined();
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: guy, defender: next(s, ap) }] });
    s = run(s, planCast(s, ap, ids[1]!, [tgt(guy)]));
    s = resolveAll(s);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "attach" });
    s = resolveAll(act(s, { type: "pickPermanents", player: ap, ids: [blade] }));
    expect(s.objects[blade]!.attachedTo).toBe(guy);
    expect(pt(s, guy)).toEqual([7, 7]);
  });

  it("Legion's Initiative: its creatures come back at the beginning of the next combat, with haste until end of turn", () => {
    let { s, ap } = setup([]);
    const li = putOnBattlefield(s, ap, legions);
    const red = putOnBattlefield(s, ap, creature("Test Red", "Goblin", 2));
    const white = putOnBattlefield(s, ap, creature("Test White", "Soldier", 2, 2, "{W}"));
    const token = putOnBattlefield(s, ap, creature("Test Token", "Spirit", 1));
    s.objects[token]!.isToken = true;
    invalidateCharacteristics(s);
    expect(pt(s, red)).toEqual([3, 2]);
    expect(pt(s, white)).toEqual([2, 3]);
    s = resolveAll(run(s, planActivate(s, ap, li, 0)));
    expect(zone(s, red)).toBe("exile");
    expect(zone(s, li)).toBe("exile");
    expect(s.objects[token]).toBeUndefined();
    s = passUntil(s, "beginCombat", ap);
    s = resolveAll(s);
    expect(zone(s, red)).toBe("battlefield");
    expect(zone(s, white)).toBe("battlefield");
    expect(objHasKeyword(s, s.objects[red]!, "Haste")).toBe(true);
    expect(s.objects[red]!.controlledSinceTurn).toBe(s.turn);
    s = toStep(s, "upkeep", next(s, ap));
    expect(objHasKeyword(s, s.objects[red]!, "Haste")).toBe(false);
  });

  it("Day and night: it becomes day as Brimstone Vandal enters, which doesn't trigger; day becoming night does", () => {
    let { s, ap, ids } = setup([brimstone]);
    const sage = putOnBattlefield(s, ap, firmament);
    expect(s.dayNight).toBeUndefined(); // only as it enters
    const v = putOnBattlefield(s, ap, vadrik);
    putOnBattlefield(s, ap, sanctifier);
    const phoenix = into(s, ap, sunstreak, "graveyard");
    expect(s.dayNight).toBeUndefined();
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.dayNight).toBe("day");
    expect(s.stack).toHaveLength(0);
    expect(counters(s, v)).toBe(0);
    // Ap cast a spell this turn, so it stays day; the next player casts none, so it becomes night.
    s = toStep(s, "upkeep", next(s, ap));
    expect(s.dayNight).toBe("day");
    const hand = s.players[ap]!.hand.length;
    s = passUntil(s, "upkeep", next(s, ap, 2));
    expect(s.dayNight).toBe("night");
    for (let i = 0; i < 30 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      if (s.pending?.kind === "chooseMay") {
        Object.assign(s.players[ap]!.manaPool, { R: 1, C: 1 });
        s = act(s, { type: "chooseMay", player: s.pending.player, yes: true });
      } else if (s.pending?.kind === "searchLibrary") s = act(s, { type: "searchLibrary", player: s.pending.player, found: s.pending.cards.slice(0, 1) });
      else if (s.pending) break;
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.pending).toBeNull();
    for (const k of [1, 2, 3]) expect(life(s, next(s, ap, k))).toBe(39);
    expect(counters(s, v)).toBe(1);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(zone(s, phoenix)).toBe("battlefield");
    expect(s.objects[phoenix]!.tapped).toBe(true);
    expect(s.log.some((l) => /looks at the top 2 cards/.test(l.text))).toBe(true);
    expect(zone(s, sage)).toBe("battlefield");
  });

  it("Celestus Sanctifier: one of the top two cards into your graveyard, the other stays on top", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, sanctifier);
    const second = into(s, ap, shock, "library");
    const first = into(s, ap, fireball, "library");
    s.dayNight = "day";
    // Ap casts no spells this turn: night as the next turn begins.
    s = passUntil(s, "upkeep", next(s, ap));
    expect(s.dayNight).toBe("night");
    for (let i = 0; i < 20 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 1, max: 1 });
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [second] }));
    expect(zone(s, second)).toBe("graveyard");
    expect(s.players[ap]!.library[0]).toBe(first);
  });

  it("The Celestus: as a sorcery, day becomes night or night becomes day; its trigger gains 1 life and may loot", () => {
    let { s, ap } = setup([]);
    const c = putOnBattlefield(s, ap, theCelestus);
    s.dayNight = "night";
    const lifeBefore = life(s, ap);
    s = run(s, planActivate(s, ap, c, 0));
    s = resolveAll(s);
    expect(s.dayNight).toBe("day");
    if (s.pending?.kind === "discard") s = resolveAll(act(s, { type: "discard", player: ap, objectIds: s.players[ap]!.hand.slice(0, 1) }));
    expect(life(s, ap)).toBe(lifeBefore + 1);
    expect(s.log.some((l) => /draws 1 card/.test(l.text))).toBe(true);
    // Only as a sorcery.
    s.objects[c]!.tapped = false;
    s = passUntil(s, "beginCombat", ap);
    expect(planActivate(s, ap, c, 0)).toBeNull();
  });

  it("The Celestus: it becomes day as it enters if it's neither, without the trigger", () => {
    let { s, ap, ids } = setup([theCelestus]);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.dayNight).toBe("day");
    expect(s.stack).toHaveLength(0);
    expect(s.pending).toBeNull();
  });

  it("Jace, the Living Guildpact: +1 puts one of the top two cards into your graveyard", () => {
    let { s, ap } = setup([]);
    const j = putOnBattlefield(s, ap, guildpact);
    s.objects[j]!.counters.loyalty = 5;
    const second = into(s, ap, shock, "library");
    const first = into(s, ap, fireball, "library");
    s = run(s, planActivate(s, ap, j, 0));
    s = resolveAll(s);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [first] }));
    expect(zone(s, first)).toBe("graveyard");
    expect(s.players[ap]!.library[0]).toBe(second);
    expect(counters(s, j, "loyalty")).toBe(6);
  });
});
