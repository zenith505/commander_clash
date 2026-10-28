// Round 196: more of the harder cards from the top: "amass Orcs 5, mill five cards, then return a creature card from
// your graveyard to the battlefield" (Sauron, Lord of the Rings), "Add X {G} or X {W}" (Brigid, Doun's Mind), "target
// opponent reveals cards ... until they reveal a land card. Put that card onto the battlefield tapped under your control
// and the rest into their graveyard" (Sméagol, Helpful Guide), "choose target artifact card in your graveyard. You may
// sacrifice an artifact. If you do, return the chosen card" (Daretti, Rocketeer Engineer), "a creature you control with
// power 2 or less" as a combat damage dealer (Subira), "flip a coin for each creature ... Destroy each creature whose coin
// comes up tails" (Rakdos, the Showstopper), "the total number of rad counters among players" (Vault 12), "Ashaya, the
// Awoken World" and "They become 6/6 Elemental creatures. They're still lands." (Nissa, Sage Animist), "Exchange your hand
// and library" (Mordenkainen), "creatures that player controls without flying can't block this turn" as a rule for the
// turn (The Motherlode), "If you search your library this way, put ~ on the bottom ..., then shuffle" (Unlucky Cabbage
// Merchant), "tap it and up to one target creature ... They don't untap ..." (Dragon Turtle), "Until end of turn, you may
// have ~ become an X/X ... where X is the result" (Ebony Fly), "... that's still a planeswalker" (Gideon, Ally of
// Zendikar), a named Equipment token with indestructible (Nahiri, the Lithomancer) and "Return it to your hand at the
// beginning of the next end step" after a search (Nahiri, the Harbinger).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, scry, setup } from "./helpers";
import { blockProblem, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

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
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const counters = (s: GameState, id: string, c = "+1/+1") => s.objects[id]!.counters[c] ?? 0;
const pt = (s: GameState, id: ObjectId) => [power(s, s.objects[id]!), toughness(s, s.objects[id]!)];
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && characteristics(s, s.objects[id]!).name === name);
const next = (s: GameState, pid: PlayerId, k = 1) => s.turnOrder[(s.turnOrder.indexOf(pid) + k) % 4]!;
const creature = (name: string, sub: string, p: number, t = p, cost = "{G}") => card(name, `Creature — ${sub}`, cost, { cmc: cost.match(/\{/g)?.length ?? 0, power: String(p), toughness: String(t) });
const types = (s: GameState, id: ObjectId) => characteristics(s, s.objects[id]!).types;

// Real oracle text (Scryfall).
const sauron = card("Sauron, Lord of the Rings", "Legendary Creature — Avatar Horror", "{5}{U}{B}{R}", {"cmc": 8, "power": "9", "toughness": "9", "keywords": ["Amass", "Trample", "Mill"], "oracleText": "When you cast this spell, amass Orcs 5, mill five cards, then return a creature card from your graveyard to the battlefield.\nTrample\nWhenever a commander an opponent controls dies, the Ring tempts you.", "colors": ["B", "R", "U"]});
const brigid = scry("transform", [{"name": "Brigid, Clachan's Heart", "mana_cost": "{2}{W}", "type_line": "Legendary Creature — Kithkin Warrior", "oracle_text": "Whenever this creature enters or transforms into Brigid, Clachan's Heart, create a 1/1 green and white Kithkin creature token.\nAt the beginning of your first main phase, you may pay {G}. If you do, transform Brigid.", "power": "3", "toughness": "2"}, {"name": "Brigid, Doun's Mind", "mana_cost": "", "type_line": "Legendary Creature — Kithkin Soldier", "oracle_text": "{T}: Add X {G} or X {W}, where X is the number of other creatures you control.\nAt the beginning of your first main phase, you may pay {W}. If you do, transform Brigid.", "power": "3", "toughness": "2"}]);
const smeagol = card("Sméagol, Helpful Guide", "Legendary Creature — Halfling Horror", "{1}{B}{G}", {"cmc": 3, "power": "4", "toughness": "2", "keywords": [], "oracleText": "At the beginning of your end step, if a creature died under your control this turn, the Ring tempts you.\nWhenever the Ring tempts you, target opponent reveals cards from the top of their library until they reveal a land card. Put that card onto the battlefield tapped under your control and the rest into their graveyard.", "colors": ["B", "G"]});
const daretti = card("Daretti, Rocketeer Engineer", "Legendary Creature — Goblin Artificer", "{4}{R}", {"cmc": 5, "power": "*", "toughness": "5", "keywords": [], "oracleText": "Daretti's power is equal to the greatest mana value among artifacts you control.\nWhenever Daretti enters or attacks, choose target artifact card in your graveyard. You may sacrifice an artifact. If you do, return the chosen card to the battlefield.", "colors": ["R"]});
const subira = card("Subira, Tulzidi Caravanner", "Legendary Creature — Human Shaman", "{2}{R}", {"cmc": 3, "power": "2", "toughness": "3", "keywords": ["Haste"], "oracleText": "Haste\n{1}: Another target creature with power 2 or less can't be blocked this turn.\n{1}{R}, {T}, Discard your hand: Until end of turn, whenever a creature you control with power 2 or less deals combat damage to a player, draw a card.", "colors": ["R"]});
const rakdos = card("Rakdos, the Showstopper", "Legendary Creature — Demon", "{4}{B}{R}", {"cmc": 6, "power": "6", "toughness": "6", "keywords": ["Flying", "Trample"], "oracleText": "Flying, trample\nWhen Rakdos enters, flip a coin for each creature that isn't a Demon, Devil, or Imp. Destroy each creature whose coin comes up tails.", "colors": ["B", "R"]});
const vault12 = card("Vault 12: The Necropolis", "Enchantment — Saga", "{4}{B}{B}", {"cmc": 6, "keywords": [], "oracleText": "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — Each player gets three rad counters.\nII — Create X 2/2 black Zombie Mutant creature tokens, where X is the total number of rad counters among players.\nIII — Put two +1/+1 counters on each creature you control that's a Zombie or Mutant.", "colors": ["B"]});
const nissa = scry("transform", [{"name": "Nissa, Vastwood Seer", "mana_cost": "{2}{G}", "type_line": "Legendary Creature — Elf Scout", "oracle_text": "When Nissa enters, you may search your library for a basic Forest card, reveal it, put it into your hand, then shuffle.\nWhenever a land you control enters, if you control seven or more lands, exile Nissa, then return her to the battlefield transformed under her owner's control.", "power": "2", "toughness": "2"}, {"name": "Nissa, Sage Animist", "mana_cost": "", "type_line": "Legendary Planeswalker — Nissa", "oracle_text": "+1: Reveal the top card of your library. If it's a land card, put it onto the battlefield. Otherwise, put it into your hand.\n−2: Create Ashaya, the Awoken World, a legendary 4/4 green Elemental creature token.\n−7: Untap up to six target lands. They become 6/6 Elemental creatures. They're still lands.", "loyalty": "3"}]);
const mordenkainen = card("Mordenkainen", "Legendary Planeswalker — Mordenkainen", "{4}{U}{U}", {"cmc": 6, "loyalty": "5", "keywords": [], "oracleText": "+2: Draw two cards, then put a card from your hand on the bottom of your library.\n−2: Create a blue Dog Illusion creature token with \"This token's power and toughness are each equal to twice the number of cards in your hand.\"\n−10: Exchange your hand and library, then shuffle. You get an emblem with \"You have no maximum hand size.\"", "colors": ["U"]});
const theMotherlode = card("The Motherlode, Excavator", "Legendary Artifact Creature — Robot", "{3}{R}{R}", {"cmc": 5, "power": "5", "toughness": "5", "keywords": [], "oracleText": "When The Motherlode enters, choose target opponent. You get an amount of {E} (energy counters) equal to the number of nonbasic lands that player controls.\nWhenever The Motherlode attacks, you may pay {E}{E}{E}{E}. When you do, destroy target nonbasic land defending player controls, and creatures that player controls without flying can't block this turn.", "colors": ["R"]});
const unluckyCabbageMerchant = card("Unlucky Cabbage Merchant", "Creature — Human Citizen", "{1}{G}", {"cmc": 2, "power": "2", "toughness": "2", "keywords": ["Food"], "oracleText": "When this creature enters, create a Food token. (It's an artifact with \"{2}, {T}, Sacrifice this token: You gain 3 life.\")\nWhenever you sacrifice a Food, you may search your library for a basic land card and put it onto the battlefield tapped. If you search your library this way, put this creature on the bottom of its owner's library, then shuffle.", "colors": ["G"]});
const dragonTurtle = card("Dragon Turtle", "Creature — Dragon Turtle", "{1}{U}{U}", {"cmc": 3, "power": "3", "toughness": "5", "keywords": ["Flash"], "oracleText": "Flash\nDrag Below — When this creature enters, tap it and up to one target creature an opponent controls. They don't untap during their controllers' next untap steps.", "colors": ["U"]});
const ebonyFly = card("Ebony Fly", "Artifact", "{2}", {"cmc": 2, "keywords": [], "oracleText": "This artifact enters tapped.\n{T}: Add {C}.\n{4}: Roll a d6. Until end of turn, you may have this artifact become an X/X Insect artifact creature with flying, where X is the result.\nWhenever this artifact attacks, another target attacking creature gains flying until end of turn.", "colors": []});
const gideon = card("Gideon, Ally of Zendikar", "Legendary Planeswalker — Gideon", "{2}{W}{W}", {"cmc": 4, "loyalty": "4", "keywords": [], "oracleText": "+1: Until end of turn, Gideon becomes a 5/5 Human Soldier Ally creature with indestructible that's still a planeswalker. Prevent all damage that would be dealt to him this turn.\n0: Create a 2/2 white Knight Ally creature token.\n−4: You get an emblem with \"Creatures you control get +1/+1.\"", "colors": ["W"]});
const nahiri = card("Nahiri, the Lithomancer", "Legendary Planeswalker — Nahiri", "{3}{W}{W}", {"cmc": 5, "loyalty": "3", "keywords": [], "oracleText": "+2: Create a 1/1 white Kor Soldier creature token. You may attach an Equipment you control to it.\n−2: You may put an Equipment card from your hand or graveyard onto the battlefield.\n−10: Create a colorless Equipment artifact token named Stoneforged Blade. It has indestructible, \"Equipped creature gets +5/+5 and has double strike,\" and equip {0}.\nNahiri, the Lithomancer can be your commander.", "colors": ["W"]});
const nahiriHarbinger = card("Nahiri, the Harbinger", "Legendary Planeswalker — Nahiri", "{2}{R}{W}", {"cmc": 4, "loyalty": "4", "keywords": [], "oracleText": "+2: You may discard a card. If you do, draw a card.\n−2: Exile target enchantment, tapped artifact, or tapped creature.\n−8: Search your library for an artifact or creature card, put it onto the battlefield, then shuffle. It gains haste. Return it to your hand at the beginning of the next end step.", "colors": ["R", "W"]});
const gideonParagon = card("Gideon, Martial Paragon", "Legendary Planeswalker — Gideon", "{4}{W}", {"cmc": 5, "loyalty": "5", "keywords": [], "oracleText": "+2: Untap all creatures you control. Those creatures get +1/+1 until end of turn.\n0: Until end of turn, Gideon becomes a 5/5 Human Soldier creature with indestructible that's still a planeswalker. Prevent all damage that would be dealt to him this turn.\n−10: Creatures you control get +2/+2 until end of turn. Tap all creatures your opponents control.", "colors": ["W"]});
const ALL = [sauron, brigid, smeagol, daretti, subira, rakdos, vault12, nissa, mordenkainen, theMotherlode, unluckyCabbageMerchant, dragonTurtle, ebonyFly, gideon, gideonParagon, nahiri, nahiriHarbinger];

describe("Round 196", () => {
  it("all compile", () => supported(...ALL));

  it("Sauron: cast, it amasses Orcs 5, mills five, then returns a creature card from your graveyard, one that was there before too (rulings)", () => {
    let { s, ap, ids } = setup([sauron]);
    const old = into(s, ap, creature("Test Old Ox", "Ox", 3), "graveyard");
    const milled = [1, 2, 3, 4, 5].map((i) => into(s, ap, creature(`Test Milled ${i}`, "Elk", 1), "library"));
    s = run(s, planCast(s, ap, ids[0]!));
    for (let i = 0; i < 20 && s.pending?.kind !== "searchLibrary"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    for (const id of milled) expect(zone(s, id)).toBe("graveyard");
    if (s.pending?.kind !== "searchLibrary") throw new Error("no pick");
    expect(s.pending.cards).toEqual(expect.arrayContaining([old, ...milled]));
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [old] }));
    expect(zone(s, old)).toBe("battlefield");
    const [army] = named(s, ap, "Orc Army Token");
    expect(army).toBeDefined();
    expect(counters(s, army!)).toBe(5);
    expect(characteristics(s, s.objects[army!]!).subtypes).toEqual(expect.arrayContaining(["Orc", "Army"]));
    expect(zone(s, ids[0]!)).toBe("battlefield");
  });

  it("Brigid, Doun's Mind: X mana of one color, green or white, X being your other creatures", () => {
    let { s, ap } = setup([]);
    const b = putOnBattlefield(s, ap, brigid);
    s.objects[b]!.face = 1;
    putOnBattlefield(s, ap, creature("Test Ox", "Ox", 2));
    putOnBattlefield(s, ap, creature("Test Elk", "Elk", 2));
    putOnBattlefield(s, next(s, ap), creature("Test Their Ox", "Ox", 2));
    invalidateCharacteristics(s);
    expect(characteristics(s, s.objects[b]!).name).toBe("Brigid, Doun's Mind");
    expect(() => act(s, { type: "activateMana", player: ap, objectId: b, mana: "U" })).toThrow();
    const w = act(s, { type: "activateMana", player: ap, objectId: b, mana: "W" });
    expect(w.players[ap]!.manaPool.W).toBe(2);
    expect(w.players[ap]!.manaPool.G).toBe(0);
    const g = act(s, { type: "activateMana", player: ap, objectId: b, mana: "G" });
    expect(g.players[ap]!.manaPool.G).toBe(2);
  });

  it("Sméagol: when the Ring tempts you, the target opponent reveals until a land, which enters tapped under your control; the rest go to their graveyard", () => {
    const temptation = card("Test Temptation", "Sorcery", "{U}", { cmc: 1, oracleText: "The Ring tempts you." });
    let { s, ap, ids } = setup([temptation]);
    const sm = putOnBattlefield(s, ap, smeagol);
    const opp = next(s, ap);
    const land = into(s, opp, card("Test Waste", "Land", "", { oracleText: "{T}: Add {C}." }), "library");
    const [x, y] = [1, 2].map((i) => into(s, opp, creature(`Test Top ${i}`, "Elk", 1), "library"));
    s = run(s, planCast(s, ap, ids[0]!));
    for (let i = 0; i < 30 && !(s.pending?.kind === "chooseTargets"); i++) {
      if (s.pending?.kind === "pickPermanents") s = act(s, { type: "pickPermanents", player: ap, ids: [sm] });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    s = resolveAll(choose(s, [player(opp)]));
    expect(zone(s, land)).toBe("battlefield");
    expect(controllerOf(s, s.objects[land]!)).toBe(ap);
    expect(s.objects[land]!.owner).toBe(opp);
    expect(s.objects[land]!.tapped).toBe(true);
    expect(zone(s, x!)).toBe("graveyard");
    expect(zone(s, y!)).toBe("graveyard");
    expect(s.players[opp]!.graveyard).toEqual(expect.arrayContaining([x, y]));
  });

  it("Daretti: power is the greatest mana value among your artifacts; entering, the artifact card is targeted and the sacrifice chosen as it resolves", () => {
    let { s, ap, ids } = setup([daretti]);
    const rock = putOnBattlefield(s, ap, card("Test Rock", "Artifact", "{3}", { cmc: 3 }));
    const relic = into(s, ap, card("Test Relic", "Artifact", "{6}", { cmc: 6 }), "graveyard");
    s = run(s, planCast(s, ap, ids[0]!));
    for (let i = 0; i < 30 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(pt(s, ids[0]!)).toEqual([3, 5]);
    s = choose(s, [tgt(relic)]);
    for (let i = 0; i < 30 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind).toBe("chooseMay");
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    if (s.pending?.kind === "pickPermanents") s = act(s, { type: "pickPermanents", player: ap, ids: [rock] });
    s = resolveAll(s);
    expect(zone(s, rock)).toBe("graveyard");
    expect(zone(s, relic)).toBe("battlefield");
    expect(pt(s, ids[0]!)).toEqual([6, 5]);
  });

  it("Daretti: saying no leaves the chosen card in the graveyard", () => {
    let { s, ap, ids } = setup([daretti]);
    const rock = putOnBattlefield(s, ap, card("Test Rock", "Artifact", "{3}", { cmc: 3 }));
    const relic = into(s, ap, card("Test Relic", "Artifact", "{6}", { cmc: 6 }), "graveyard");
    s = run(s, planCast(s, ap, ids[0]!));
    for (let i = 0; i < 30 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = resolveAll(choose(s, [tgt(relic)]), false);
    expect(zone(s, rock)).toBe("battlefield");
    expect(zone(s, relic)).toBe("graveyard");
  });

  it("Subira: after its last ability, each creature you control with power 2 or less that deals combat damage to a player draws you a card", () => {
    let { s, ap } = setup([]);
    const sub = putOnBattlefield(s, ap, subira);
    const small = putOnBattlefield(s, ap, creature("Test Small", "Elk", 2));
    const big = putOnBattlefield(s, ap, creature("Test Big", "Ox", 3));
    const opp = next(s, ap);
    s = resolveAll(run(s, planActivate(s, ap, sub, 1)));
    expect(s.players[ap]!.hand.length).toBe(0);
    expect(s.objects[sub]!.tapped).toBe(true);
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: small, defender: opp }, { attacker: big, defender: opp }] });
    s = passUntil(s, "main2", ap);
    expect(s.players[opp]!.life).toBe(35);
    expect(s.players[ap]!.hand.length).toBe(1);
  });

  it("Rakdos: a coin for each creature that isn't a Demon, Devil or Imp; those that come up tails are destroyed", () => {
    let { s, ap, ids } = setup([rakdos]);
    const opp = next(s, ap);
    const mine = [1, 2, 3, 4, 5, 6].map((i) => putOnBattlefield(s, ap, creature(`Test Mine ${i}`, "Elk", 1)));
    const theirs = [1, 2, 3, 4, 5, 6].map((i) => putOnBattlefield(s, opp, creature(`Test Theirs ${i}`, "Ox", 1)));
    const demon = putOnBattlefield(s, opp, creature("Test Demon", "Demon", 1));
    const imp = putOnBattlefield(s, ap, creature("Test Imp", "Imp", 1));
    const devil = putOnBattlefield(s, opp, creature("Test Devil", "Devil", 1));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    for (const id of [demon, imp, devil, ids[0]!]) expect(zone(s, id)).toBe("battlefield");
    const gone = [...mine, ...theirs].filter((id) => zone(s, id) === "graveyard");
    const kept = [...mine, ...theirs].filter((id) => zone(s, id) === "battlefield");
    expect(gone.length + kept.length).toBe(12);
    // Each coin on its own: with twelve flips, some come up each way.
    expect(gone.length).toBeGreaterThan(0);
    expect(kept.length).toBeGreaterThan(0);
    expect(s.log.some((l) => /flips 12 coins/.test(l.text))).toBe(true);
  });

  it("Vault 12: chapter II makes a 2/2 Zombie Mutant for each rad counter among all players", () => {
    const lore = card("Test Lore", "Instant", "{U}", { cmc: 1, oracleText: "Put a lore counter on target Saga you control." });
    let { s, ap, ids } = setup([lore]);
    const v = putOnBattlefield(s, ap, vault12);
    s.objects[v]!.counters.lore = 1;
    const [a, b, c, d] = s.turnOrder;
    s.players[a!]!.rad = 2;
    s.players[b!]!.rad = 1;
    s.players[d!]!.rad = 3;
    void c;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(v)])));
    const zombies = named(s, ap, "Zombie Mutant Token");
    expect(zombies.length).toBe(6);
    expect(pt(s, zombies[0]!)).toEqual([2, 2]);
  });

  it("Nissa, Sage Animist: −2 makes Ashaya, the Awoken World; −7 untaps six lands that become 6/6 Elementals for good", () => {
    let { s, ap } = setup([]);
    const n = putOnBattlefield(s, ap, nissa);
    s.objects[n]!.face = 1;
    s.objects[n]!.counters.loyalty = 9;
    invalidateCharacteristics(s);
    const ashaya = resolveAll(run(s, planActivate(s, ap, n, 1)));
    const [token] = named(ashaya, ap, "Ashaya, the Awoken World");
    expect(token).toBeDefined();
    expect(pt(ashaya, token!)).toEqual([4, 4]);
    expect(characteristics(ashaya, ashaya.objects[token!]!).supertypes).toContain("Legendary");
    const lands = s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === ap && types(s, id).includes("Land")).slice(0, 6);
    for (const id of lands) s.objects[id]!.tapped = true;
    s = resolveAll(run(s, planActivate(s, ap, n, 2, lands.map(tgt))));
    for (const id of lands) {
      expect(s.objects[id]!.tapped).toBe(false);
      expect(types(s, id)).toEqual(expect.arrayContaining(["Land", "Creature"]));
      expect(characteristics(s, s.objects[id]!).subtypes).toContain("Elemental");
      expect(pt(s, id)).toEqual([6, 6]);
    }
    s = passUntil(s, "upkeep", next(s, ap));
    expect(pt(s, lands[0]!)).toEqual([6, 6]);
    expect(types(s, lands[0]!)).toContain("Creature");
  });

  it("Mordenkainen: −10 exchanges your hand and library, which is then shuffled; the cards aren't drawn, and the emblem lifts the hand size", () => {
    let { s, ap } = setup([]);
    const m = putOnBattlefield(s, ap, mordenkainen);
    s.objects[m]!.counters.loyalty = 10;
    [1, 2, 3].forEach((i) => into(s, ap, creature(`Test Hand ${i}`, "Elk", 1), "hand"));
    const hand = [...s.players[ap]!.hand];
    const lib = [...s.players[ap]!.library];
    s = resolveAll(run(s, planActivate(s, ap, m, 2)));
    expect([...s.players[ap]!.hand].sort()).toEqual([...lib].sort());
    expect([...s.players[ap]!.library].sort()).toEqual([...hand].sort());
    expect(s.players[ap]!.hand.filter((id) => s.objects[id]!.drawn).length).toBe(0);
    expect(Object.values(s.objects).filter((o) => o.emblem && o.owner === ap).length).toBe(1);
    // No discarding down to seven at cleanup.
    s = passUntil(s, "upkeep", next(s, ap));
    expect(s.players[ap]!.hand.length).toBe(lib.length);
  });

  it("The Motherlode: energy for the target opponent's nonbasic lands; attacking, four energy destroys a nonbasic land and their creatures without flying can't block, even ones arriving later (rulings)", () => {
    let { s, ap, ids } = setup([theMotherlode]);
    const opp = next(s, ap);
    const vault = putOnBattlefield(s, opp, card("Test Vault", "Land", "", { oracleText: "{T}: Add {C}." }));
    putOnBattlefield(s, opp, card("Test Tower", "Land", "", { oracleText: "{T}: Add {C}." }));
    s = run(s, planCast(s, ap, ids[0]!));
    for (let i = 0; i < 30 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = resolveAll(choose(s, [player(opp)]));
    expect(s.players[ap]!.energy).toBe(2);
    s.players[ap]!.energy = 5;
    const ml = ids[0]!;
    s.objects[ml]!.controlledSinceTurn = -1;
    const ground = putOnBattlefield(s, opp, creature("Test Ground", "Ox", 2));
    const flyer = putOnBattlefield(s, opp, card("Test Flyer", "Creature — Bird", "{U}", { power: "1", toughness: "1", keywords: ["Flying"], oracleText: "Flying" }));
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: ml, defender: opp }] });
    for (let i = 0; i < 30 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind).toBe("chooseMay");
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    for (let i = 0; i < 30 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = resolveAll(choose(s, [tgt(vault)]));
    expect(s.players[ap]!.energy).toBe(1);
    expect(zone(s, vault)).toBe("graveyard");
    const late = putOnBattlefield(s, opp, creature("Test Late", "Elk", 2));
    expect(blockProblem(s, s.objects[ground]!, s.objects[ml]!)).not.toBeNull();
    expect(blockProblem(s, s.objects[late]!, s.objects[ml]!)).not.toBeNull();
    expect(blockProblem(s, s.objects[flyer]!, s.objects[ml]!)).toBeNull();
  });

  it("Unlucky Cabbage Merchant: sacrificing a Food lets you search for a basic land, tapped; if you searched, it goes to the bottom of your library and that's shuffled", () => {
    const food = card("Food", "Token Artifact — Food", "", { oracleText: "{2}, {T}, Sacrifice this token: You gain 3 life." });
    let { s, ap } = setup([]);
    const m = putOnBattlefield(s, ap, unluckyCabbageMerchant);
    const f = putOnBattlefield(s, ap, food);
    const lands = s.battlefield.length;
    s = run(s, planActivate(s, ap, f, 0));
    for (let i = 0; i < 30 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind).toBe("chooseMay");
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending?.kind).toBe("searchLibrary");
    if (s.pending?.kind !== "searchLibrary") throw new Error("no search");
    const forest = s.pending.cards[0]!;
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [forest] }));
    expect(zone(s, forest)).toBe("battlefield");
    expect(s.objects[forest]!.tapped).toBe(true);
    expect(zone(s, m)).toBe("library");
    expect(s.battlefield.length).toBe(lands - 1);
  });

  it("Unlucky Cabbage Merchant: not searching keeps it on the battlefield", () => {
    const food = card("Food", "Token Artifact — Food", "", { oracleText: "{2}, {T}, Sacrifice this token: You gain 3 life." });
    let { s, ap } = setup([]);
    const m = putOnBattlefield(s, ap, unluckyCabbageMerchant);
    const f = putOnBattlefield(s, ap, food);
    s = resolveAll(run(s, planActivate(s, ap, f, 0)), false);
    expect(zone(s, f)).toBe("graveyard");
    expect(zone(s, m)).toBe("battlefield");
  });

  it("Dragon Turtle: it and the target are tapped and skip their next untap step; with no target, only the Turtle (rulings)", () => {
    let { s, ap, ids } = setup([dragonTurtle, dragonTurtle]);
    const opp = next(s, ap);
    const ox = putOnBattlefield(s, opp, creature("Test Ox", "Ox", 2));
    s = run(s, planCast(s, ap, ids[0]!));
    for (let i = 0; i < 30 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = resolveAll(choose(s, [tgt(ox)]));
    expect(s.objects[ids[0]!]!.tapped).toBe(true);
    expect(s.objects[ox]!.tapped).toBe(true);
    s.players[ap]!.manaPool.U += 3;
    s = run(s, planCast(s, ap, ids[1]!));
    for (let i = 0; i < 30 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = resolveAll(choose(s, [{ kind: "none" }]));
    expect(s.objects[ids[1]!]!.tapped).toBe(true);
    s = passUntil(s, "main1", opp);
    expect(s.objects[ox]!.tapped).toBe(true);
    s = passUntil(s, "main1", ap);
    expect(s.objects[ids[0]!]!.tapped).toBe(true);
    expect(s.objects[ids[1]!]!.tapped).toBe(true);
    s = passUntil(s, "main1", next(s, ap));
    s = passUntil(s, "main1", ap);
    expect(s.objects[ids[0]!]!.tapped).toBe(false);
  });

  it("Ebony Fly: after the d6, you may have it become an X/X flying Insect artifact creature until end of turn", () => {
    let { s, ap } = setup([]);
    const fly = putOnBattlefield(s, ap, ebonyFly);
    s = run(s, planActivate(s, ap, fly, 0));
    for (let i = 0; i < 30 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind).toBe("chooseMay");
    const rolled = s.resolving?.rolled?.result;
    expect(rolled).toBeGreaterThanOrEqual(1);
    const no = resolveAll(s, false);
    expect(types(no, fly)).not.toContain("Creature");
    s = resolveAll(s);
    expect(types(s, fly)).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(pt(s, fly)).toEqual([rolled, rolled]);
    expect(characteristics(s, s.objects[fly]!).keywords).toContain("Flying");
    expect(characteristics(s, s.objects[fly]!).subtypes).toContain("Insect");
    s = passUntil(s, "upkeep", next(s, ap));
    expect(types(s, fly)).not.toContain("Creature");
  });

  it("Gideon, Ally of Zendikar: +1 makes him a 5/5 indestructible creature that's still a planeswalker, and damage to him is prevented", () => {
    const bolt = card("Test Bolt", "Instant", "{R}", { cmc: 1, oracleText: "Test Bolt deals 3 damage to any target." });
    let { s, ap } = setup([]);
    const g = putOnBattlefield(s, ap, gideon);
    s.objects[g]!.counters.loyalty = 4;
    s = resolveAll(run(s, planActivate(s, ap, g, 0)));
    expect(s.objects[g]!.counters.loyalty).toBe(5);
    expect(types(s, g)).toEqual(expect.arrayContaining(["Planeswalker", "Creature"]));
    expect(characteristics(s, s.objects[g]!).subtypes).toEqual(expect.arrayContaining(["Gideon", "Human", "Soldier", "Ally"]));
    expect(pt(s, g)).toEqual([5, 5]);
    expect(characteristics(s, s.objects[g]!).keywords).toContain("Indestructible");
    const opp = next(s, ap);
    const b = into(s, opp, bolt, "hand");
    s.players[opp]!.manaPool.R = 1;
    s = act(s, { type: "passPriority", player: ap });
    s = resolveAll(run(s, planCast(s, opp, b, [tgt(g)])));
    expect(s.objects[g]!.counters.loyalty).toBe(5);
    expect(s.objects[g]!.damage).toBe(0);
    s = passUntil(s, "upkeep", opp);
    expect(types(s, g)).not.toContain("Creature");
  });

  it("Gideon, Martial Paragon: +2 untaps your creatures and gives them +1/+1; 0 makes him a 5/5 creature that's still a planeswalker", () => {
    let { s, ap } = setup([]);
    const g = putOnBattlefield(s, ap, gideonParagon);
    s.objects[g]!.counters.loyalty = 5;
    const ox = putOnBattlefield(s, ap, creature("Test Ox", "Ox", 2));
    s.objects[ox]!.tapped = true;
    s = resolveAll(run(s, planActivate(s, ap, g, 0)));
    expect(s.objects[g]!.counters.loyalty).toBe(7);
    expect(s.objects[ox]!.tapped).toBe(false);
    expect(pt(s, ox)).toEqual([3, 3]);
    s = passUntil(s, "main1", next(s, ap));
    s = passUntil(s, "main1", ap);
    s = resolveAll(run(s, planActivate(s, ap, g, 1)));
    expect(s.objects[g]!.counters.loyalty).toBe(7);
    expect(types(s, g)).toEqual(expect.arrayContaining(["Planeswalker", "Creature"]));
    expect(pt(s, g)).toEqual([5, 5]);
  });

  it("Nahiri, the Lithomancer: −10 makes Stoneforged Blade, an indestructible Equipment that gives +5/+5 and double strike, equip {0}", () => {
    let { s, ap } = setup([]);
    const n = putOnBattlefield(s, ap, nahiri);
    s.objects[n]!.counters.loyalty = 10;
    const ox = putOnBattlefield(s, ap, creature("Test Ox", "Ox", 2));
    s = resolveAll(run(s, planActivate(s, ap, n, 2)));
    const [blade] = named(s, ap, "Stoneforged Blade");
    expect(blade).toBeDefined();
    expect(characteristics(s, s.objects[blade!]!).keywords).toContain("Indestructible");
    expect(characteristics(s, s.objects[blade!]!).supertypes).not.toContain("Legendary");
    s = resolveAll(run(s, planActivate(s, ap, blade!, 0, [tgt(ox)])));
    expect(s.objects[blade!]!.attachedTo).toBe(ox);
    expect(pt(s, ox)).toEqual([7, 7]);
    expect(characteristics(s, s.objects[ox]!).keywords).toContain("Double strike");
  });

  it("Nahiri, the Harbinger: −8 puts an artifact or creature card from your library onto the battlefield with haste, back to your hand at the next end step", () => {
    let { s, ap } = setup([]);
    const n = putOnBattlefield(s, ap, nahiriHarbinger);
    s.objects[n]!.counters.loyalty = 8;
    const big = into(s, ap, creature("Test Colossus", "Giant", 8), "library");
    s = run(s, planActivate(s, ap, n, 2));
    for (let i = 0; i < 30 && s.pending?.kind !== "searchLibrary"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [big] }));
    expect(zone(s, big)).toBe("battlefield");
    expect(characteristics(s, s.objects[big]!).keywords).toContain("Haste");
    s = passUntil(s, "end", ap);
    s = resolveAll(s);
    expect(zone(s, big)).toBe("hand");
  });
});
