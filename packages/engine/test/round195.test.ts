// Round 195: more of the harder cards from the top: "distribute X +1/+1 counters ..., where X is the number of +1/+1
// counters on ~" (Quirion Beastcaller), "If they can't, ... Then repeat this process for an enchantment and a
// planeswalker" (Invoke Despair), "you may copy ~ and may choose a new target for the copy" in a cast trigger (Malicious
// Affliction), a named legendary Equipment token (Mabel), "Then put an instant, sorcery, or Faerie card from among the
// milled cards into your hand" (Free the Fae), "move a loyalty counter from ~ onto that planeswalker" (Gatewatch Beacon),
// "if your opponents control no permanents with bounty counters on them" (Chevill), "an instant or sorcery spell with mana
// value less than or equal to ~'s power" (Velomachus Lorehold), "copy this spell twice" (Bygone Marvels), "put up to two
// land cards from among them into your hand" (Silvan Rally), "Whenever you scry, if ~ is tapped, you may untap it"
// (Legolas), "Tap two other untapped Halflings you control" (Saradoc), "... with a bounty counter on it is dealt damage"
// (Termination Facilitator), "a spell with mana value equal to the number of charge counters on ~" (Chalice of the Void)
// "the next instant or sorcery spell you cast this turn has storm" (Crackling Spellslinger, Storm, Force of Nature),
// "spells you've cast from anywhere other than your hand this turn" (Impending Flux), "put it on the bottom of its owner's
// library" after a death (The Cauldron of Eternity), "for each legendary creature and planeswalker you control"
// (Mobilized District) and "you may exile this card from your graveyard. If you do (When you do), ..." as a spell is cast
// (Kozilek's Return, Ugin's Binding).

import { describe, expect, it } from "vitest";
import { act, card, mountain, passUntil, putOnBattlefield, scry, setup, swamp } from "./helpers";
import { abilitiesOf, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

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
const pass = (s: GameState, until: (s: GameState) => boolean) => {
  for (let i = 0; i < 20 && !until(s); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const choose = (s: GameState, targets: TargetChoice[]) => (s.pending?.kind === "chooseTargets" ? act(s, { type: "chooseTargets", player: s.pending.player, targets }) : s);
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
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
const creature = (name: string, sub: string, p: number, t = p, cost = "{G}") => card(name, `Creature — ${sub}`, cost, { cmc: cost.match(/\{/g)?.length ?? 0, power: String(p), toughness: String(t) });
const murder = card("Test Murder", "Instant", "{B}", { cmc: 1, oracleText: "Destroy target creature." });
const shock = card("Test Shock", "Instant", "{R}", { cmc: 1, oracleText: "Test Shock deals 2 damage to any target." });
const opt = card("Test Opt", "Instant", "{U}", { cmc: 1, oracleText: "Scry 1." });
const ponder = card("Test Ponder", "Sorcery", "{U}", { cmc: 1, oracleText: "Draw a card." });
const glory = card("Test Glory", "Enchantment", "{W}", { cmc: 1 });
const lands = (s: GameState, pid: PlayerId, land: CardDef, n: number) => {
  for (let i = 0; i < n; i++) putOnBattlefield(s, pid, land);
};
const walker = card("Test Walker", "Legendary Planeswalker — Jace", "{3}", { cmc: 3, loyalty: "3", oracleText: "+1: Draw a card." });

// Real oracle text (Scryfall).
const quirionBeastcaller = card("Quirion Beastcaller", "Creature — Dryad Warrior", "{1}{G}", {"cmc": 2, "power": "2", "toughness": "2", "keywords": [], "oracleText": "Whenever you cast a creature spell, put a +1/+1 counter on this creature.\nWhen this creature dies, distribute X +1/+1 counters among any number of target creatures you control, where X is the number of +1/+1 counters on this creature.", "colors": ["G"]});
const invokeDespair = card("Invoke Despair", "Sorcery", "{1}{B}{B}{B}{B}", {"cmc": 5, "keywords": [], "oracleText": "Target opponent sacrifices a creature of their choice. If they can't, they lose 2 life and you draw a card. Then repeat this process for an enchantment and a planeswalker.", "colors": ["B"]});
const maliciousAffliction = card("Malicious Affliction", "Instant", "{B}{B}", {"cmc": 2, "keywords": ["Morbid"], "oracleText": "Morbid — When you cast this spell, if a creature died this turn, you may copy Malicious Affliction and may choose a new target for the copy.\nDestroy target nonblack creature.", "colors": ["B"]});
const mabel = card("Mabel, Heir to Cragflame", "Legendary Creature — Mouse Soldier", "{1}{R}{W}", {"cmc": 3, "power": "3", "toughness": "3", "keywords": [], "oracleText": "Other Mice you control get +1/+1.\nWhen Mabel enters, create Cragflame, a legendary colorless Equipment artifact token with \"Equipped creature gets +1/+1 and has vigilance, trample, and haste\" and equip {2}.", "colors": ["R", "W"]});
const picklockPrankster = scry("adventure", [{"name": "Picklock Prankster", "mana_cost": "{1}{U}", "type_line": "Creature — Faerie Rogue", "oracle_text": "Flying, vigilance", "power": "1", "toughness": "3"}, {"name": "Free the Fae", "mana_cost": "{1}{U}", "type_line": "Instant — Adventure", "oracle_text": "Mill four cards. Then put an instant, sorcery, or Faerie card from among the milled cards into your hand."}]);
const gatewatchBeacon = card("Gatewatch Beacon", "Artifact", "{2}{W}", {"cmc": 3, "keywords": [], "oracleText": "This artifact enters with three loyalty counters on it.\n{T}: Add {W}.\nWhenever a planeswalker you control enters, if this artifact has loyalty counters on it, you may move a loyalty counter from this artifact onto that planeswalker.", "colors": ["W"]});
const chevill = card("Chevill, Bane of Monsters", "Legendary Creature — Human Rogue", "{B}{G}", {"cmc": 2, "power": "1", "toughness": "3", "keywords": ["Deathtouch"], "oracleText": "Deathtouch\nAt the beginning of your upkeep, if your opponents control no permanents with bounty counters on them, put a bounty counter on target creature or planeswalker an opponent controls.\nWhenever a permanent an opponent controls with a bounty counter on it dies, you gain 3 life and draw a card.", "colors": ["B", "G"]});
const velomachusLorehold = card("Velomachus Lorehold", "Legendary Creature — Elder Dragon", "{5}{R}{W}", {"cmc": 7, "power": "5", "toughness": "5", "keywords": ["Flying", "Vigilance", "Haste"], "oracleText": "Flying, vigilance, haste\nWhenever Velomachus Lorehold attacks, look at the top seven cards of your library. You may cast an instant or sorcery spell with mana value less than or equal to Velomachus Lorehold's power from among them without paying its mana cost. Put the rest on the bottom of your library in a random order.", "colors": ["R", "W"]});
const bygoneMarvels = card("Bygone Marvels", "Sorcery", "{G}{G}", {"cmc": 2, "keywords": ["Descend"], "oracleText": "Descend 8 — When you cast this spell, if there are eight or more permanent cards in your graveyard, copy this spell twice. You may choose new targets for the copies.\nReturn target permanent card from your graveyard to your hand. Exile Bygone Marvels.", "colors": ["G"]});
const thranduil = scry("adventure", [{"name": "Thranduil, Sindarin Liege", "mana_cost": "{2}{G/U}{G/U}", "type_line": "Legendary Creature — Elf Noble", "oracle_text": "Other Elves you control get +1/+1.\nLandfall — Whenever a land you control enters, create a 1/1 green Elf creature token.", "power": "2", "toughness": "3"}, {"name": "Silvan Rally", "mana_cost": "{1}{G/U}{G/U}", "type_line": "Sorcery — Adventure", "oracle_text": "Mill four cards, then put up to two land cards from among them into your hand. (Then exile this card. You may cast the creature later from exile.)"}]);
const legolas = card("Legolas, Counter of Kills", "Legendary Creature — Elf Archer", "{2}{G}{U}", {"cmc": 4, "power": "2", "toughness": "3", "keywords": ["Reach"], "oracleText": "Reach\nWhenever you scry, if Legolas is tapped, you may untap it. Do this only once each turn.\nWhenever a creature an opponent controls dies, put a +1/+1 counter on Legolas.", "colors": ["G", "U"]});
const saradoc = card("Saradoc, Master of Buckland", "Legendary Creature — Halfling Citizen", "{3}{W}", {"cmc": 4, "power": "2", "toughness": "4", "keywords": [], "oracleText": "Whenever Saradoc or another nontoken creature you control with power 2 or less enters, create a 1/1 white Halfling creature token.\nTap two other untapped Halflings you control: Saradoc gets +2/+0 and gains lifelink until end of turn.", "colors": ["W"]});
const terminationFacilitator = card("Termination Facilitator", "Creature — Human Assassin", "{1}{B}", {"cmc": 2, "power": "1", "toughness": "3", "keywords": [], "oracleText": "{T}: Put a bounty counter on target creature or planeswalker. Activate only as a sorcery.\nWhenever a creature or planeswalker an opponent controls with a bounty counter on it is dealt damage, destroy it.", "colors": ["B"]});
const chaliceOfTheVoid = card("Chalice of the Void", "Artifact", "{X}{X}", {"cmc": 0, "keywords": [], "oracleText": "This artifact enters with X charge counters on it.\nWhenever a player casts a spell with mana value equal to the number of charge counters on this artifact, counter that spell.", "colors": []});
const cracklingSpellslinger = card("Crackling Spellslinger", "Creature — Human Wizard", "{3}{R}{R}", {"cmc": 5, "power": "2", "toughness": "2", "keywords": ["Flash"], "oracleText": "Flash\nWhen this creature enters, if you cast it, the next instant or sorcery spell you cast this turn has storm. (When you cast that spell, copy it for each spell cast before it this turn. You may choose new targets for the copies.)", "colors": ["R"]});
const storm = card("Storm, Force of Nature", "Legendary Creature — Mutant Hero", "{1}{G}{U}{R}", {"cmc": 4, "power": "3", "toughness": "4", "keywords": ["Flying", "Vigilance", "Ceaseless Tempest"], "oracleText": "Flying, vigilance\nCeaseless Tempest — Whenever Storm deals combat damage to a player, the next instant or sorcery spell you cast this turn has storm. (When you cast it, copy it for each spell cast before it this turn. You may choose new targets for the copies.)", "colors": ["G", "R", "U"]});
const undercityUpheaval = card("Undercity Upheaval", "Sorcery", "{1}{G}{G}", {"cmc": 3, "keywords": ["Undergrowth"], "oracleText": "Undergrowth — Distribute X +1/+1 counters among any number of target creatures you control, where X is the number of creature cards in your graveyard as you cast this spell. Creatures you control gain vigilance until end of turn.", "colors": ["G"]});
const sageOfTheSkies = card("Sage of the Skies", "Creature — Human Monk", "{2}{W}", {"cmc": 3, "power": "2", "toughness": "3", "keywords": ["Flying", "Lifelink"], "oracleText": "When you cast this spell, if you've cast another spell this turn, copy this spell. (The copy becomes a token.)\nFlying, lifelink", "colors": ["W"]});
const mostDecrepitOldBird = scry("adventure", [{"name": "Most Decrepit Old Bird", "mana_cost": "{U}", "type_line": "Creature — Bird", "oracle_text": "Flying\nThreshold — This creature gets +1/+1 as long as there are seven or more cards in your graveyard.", "power": "1", "toughness": "1"}, {"name": "Speak Secrets", "mana_cost": "{1}{U}", "type_line": "Sorcery — Adventure", "oracle_text": "Mill four cards, then put an instant or sorcery card from among them into your hand."}]);
const springloadedSawblades = scry("transform", [{"name": "Spring-Loaded Sawblades", "mana_cost": "{1}{W}", "type_line": "Artifact", "oracle_text": "Flash\nWhen this artifact enters, it deals 5 damage to target tapped creature an opponent controls.\nCraft with artifact {3}{W} ({3}{W}, Exile this artifact, Exile another artifact you control or an artifact card from your graveyard: Return this card transformed under its owner's control. Craft only as a sorcery.)"}, {"name": "Bladewheel Chariot", "mana_cost": "", "type_line": "Artifact — Vehicle", "oracle_text": "Tap two other untapped artifacts you control: This Vehicle becomes an artifact creature until end of turn.\nCrew 1 (Tap any number of creatures you control with total power 1 or more: This Vehicle becomes an artifact creature until end of turn.)", "power": "5", "toughness": "5"}]);

const impendingFlux = card("Impending Flux", "Sorcery", "{2}{R}", {"cmc": 3, "keywords": ["Paradox", "Foretell"], "oracleText": "Paradox — Impending Flux deals X damage to each opponent and each creature they control, where X is 1 plus the number of spells you've cast from anywhere other than your hand this turn.\nForetell {1}{R}{R} (During your turn, you may pay {2} and exile this card from your hand face down. Cast it on a later turn for its foretell cost.)", "colors": ["R"]});
const theCauldronOfEternity = card("The Cauldron of Eternity", "Legendary Artifact", "{10}{B}{B}", {"cmc": 12, "keywords": [], "oracleText": "This spell costs {2} less to cast for each creature card in your graveyard.\nWhenever a creature you control dies, put it on the bottom of its owner's library.\n{2}{B}, {T}, Pay 2 life: Return target creature card from your graveyard to the battlefield. Activate only as a sorcery.", "colors": ["B"]});
const mobilizedDistrict = card("Mobilized District", "Land", "", {"cmc": 0, "keywords": [], "oracleText": "{T}: Add {C}.\n{4}: This land becomes a 3/3 Citizen creature with vigilance until end of turn. It's still a land. This ability costs {1} less to activate for each legendary creature and planeswalker you control.", "colors": []});
const kozileksReturn = card("Kozilek's Return", "Instant", "{2}{R}", {"cmc": 3, "keywords": ["Devoid"], "oracleText": "Devoid (This card has no color.)\nKozilek's Return deals 2 damage to each creature.\nWhenever you cast an Eldrazi creature spell with mana value 7 or greater, you may exile this card from your graveyard. If you do, this card deals 5 damage to each creature.", "colors": []});
const uginsBinding = card("Ugin's Binding", "Instant", "{2}{U}", {"cmc": 3, "keywords": ["Devoid"], "oracleText": "Devoid (This card has no color.)\nReturn target nonland permanent you don't control to its owner's hand.\nWhenever you cast a colorless spell with mana value 7 or greater, you may exile this card from your graveyard. When you do, return each nonland permanent you don't control to its owner's hand.", "colors": []});
const ALL = [quirionBeastcaller, invokeDespair, maliciousAffliction, mabel, picklockPrankster, gatewatchBeacon, chevill, velomachusLorehold, bygoneMarvels, thranduil, legolas, saradoc, terminationFacilitator, chaliceOfTheVoid, cracklingSpellslinger, storm, undercityUpheaval, sageOfTheSkies, mostDecrepitOldBird, springloadedSawblades, impendingFlux, theCauldronOfEternity, mobilizedDistrict, kozileksReturn, uginsBinding];

describe("Round 195", () => {
  it("all compile", () => supported(...ALL));

  it("Quirion Beastcaller: a counter for each creature spell; dying, its counters are divided among creatures you control as the trigger goes on the stack", () => {
    let { s, ap, ids } = setup([creature("Test Elk", "Elk", 2), murder]);
    const q = putOnBattlefield(s, ap, quirionBeastcaller);
    const a = putOnBattlefield(s, ap, creature("Test A", "Beast", 2));
    const b = putOnBattlefield(s, ap, creature("Test B", "Beast", 2));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(counters(s, q)).toBe(1);
    s.objects[q]!.counters["+1/+1"] = 3;
    invalidateCharacteristics(s);
    s = run(s, planCast(s, ap, ids[1]!, [tgt(q)]));
    s = pass(s, (x) => x.pending?.kind === "chooseTargets");
    expect(s.pending?.kind).toBe("chooseTargets");
    // All three, each target at least one.
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: a, amount: 1 }, { kind: "object", id: b, amount: 1 }] })).toThrow();
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: a, amount: 2 }, { kind: "object", id: b, amount: 1 }] }));
    expect(counters(s, a)).toBe(2);
    expect(counters(s, b)).toBe(1);
  });

  it("Quirion Beastcaller: dying with no counters divides nothing", () => {
    let { s, ap, ids } = setup([murder]);
    const q = putOnBattlefield(s, ap, quirionBeastcaller);
    const a = putOnBattlefield(s, ap, creature("Test A", "Beast", 2));
    s = run(s, planCast(s, ap, ids[0]!, [tgt(q)]));
    s = pass(s, (x) => !s.stack.length && !s.triggerQueue.length || !!x.pending);
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [] });
    s = resolveAll(s);
    expect(zone(s, q)).toBe("graveyard");
    expect(counters(s, a)).toBe(0);
  });

  it("Invoke Despair: a creature, an enchantment and a planeswalker, each one they can't sacrifice costing them 2 life and drawing you a card", () => {
    let { s, ap, ids } = setup([invokeDespair]);
    lands(s, ap, swamp, 3);
    const opp = next(s, ap);
    const ox = putOnBattlefield(s, opp, creature("Test Ox", "Ox", 2));
    const pw = putOnBattlefield(s, opp, walker);
    s.objects[pw]!.counters.loyalty = 3;
    const hand = s.players[ap]!.hand.length;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    expect(zone(s, ox)).toBe("graveyard");
    expect(zone(s, pw)).toBe("graveyard");
    expect(life(s, opp)).toBe(38);
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 1);
  });

  it("Invoke Despair: an enchantment creature sacrificed as the creature doesn't count for the enchantment (rulings)", () => {
    let { s, ap, ids } = setup([invokeDespair]);
    lands(s, ap, swamp, 3);
    const opp = next(s, ap);
    const both = putOnBattlefield(s, opp, card("Test Nyx Ox", "Enchantment Creature — Ox", "{G}", { cmc: 1, power: "2", toughness: "2" }));
    const hand = s.players[ap]!.hand.length;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    expect(zone(s, both)).toBe("graveyard");
    // No enchantment left, no planeswalker: 4 life, two cards.
    expect(life(s, opp)).toBe(36);
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2);
  });

  it("Invoke Despair: with only an enchantment, 4 life and two cards", () => {
    let { s, ap, ids } = setup([invokeDespair]);
    lands(s, ap, swamp, 3);
    const opp = next(s, ap);
    const glo = putOnBattlefield(s, opp, glory);
    const hand = s.players[ap]!.hand.length;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    expect(zone(s, glo)).toBe("graveyard");
    expect(life(s, opp)).toBe(36);
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2);
  });

  it("Malicious Affliction: if a creature died this turn, you may copy it with a new target", () => {
    let { s, ap, ids } = setup([maliciousAffliction, maliciousAffliction]);
    lands(s, ap, swamp, 2);
    const opp = next(s, ap);
    const [x, y, z] = [1, 2, 3].map((i) => putOnBattlefield(s, opp, creature(`Test Ox ${i}`, "Ox", 2)));
    // No creature has died: no copy.
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(x!)])));
    expect(zone(s, x!)).toBe("graveyard");
    expect(zone(s, y!)).toBe("battlefield");
    // Now one has: copy it, aimed at another.
    s = run(s, planCast(s, ap, ids[1]!, [tgt(y!)]));
    s = pass(s, (q) => !!q.pending);
    expect(s.pending?.kind).toBe("chooseMay");
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = pass(s, (q) => !!q.pending);
    expect(s.pending?.kind).toBe("copyTargets");
    s = act(s, { type: "copyTargets", player: ap, targets: [tgt(z!)] });
    s = resolveAll(s);
    expect(zone(s, y!)).toBe("graveyard");
    expect(zone(s, z!)).toBe("graveyard");
  });

  it("Mabel: creates Cragflame, a legendary Equipment giving +1/+1, vigilance, trample and haste; other Mice get +1/+1", () => {
    let { s, ap, ids } = setup([mabel]);
    const mouse = putOnBattlefield(s, ap, creature("Test Mouse", "Mouse", 1));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(pt(s, mouse)).toEqual([2, 2]);
    const [crag] = named(s, ap, "Cragflame");
    expect(crag).toBeDefined();
    const ch = characteristics(s, s.objects[crag!]!);
    expect(ch.supertypes).toContain("Legendary");
    expect(ch.subtypes).toContain("Equipment");
    expect(ch.colors).toEqual([]);
    s = resolveAll(run(s, planActivate(s, ap, crag!, 0, [tgt(mouse)])));
    expect(s.objects[crag!]!.attachedTo).toBe(mouse);
    expect(pt(s, mouse)).toEqual([3, 3]);
    expect(characteristics(s, s.objects[mouse]!).keywords).toEqual(expect.arrayContaining(["Vigilance", "Trample", "Haste"]));
  });

  it("Free the Fae: mill four, then an instant, sorcery or Faerie card from among them into your hand, not optional", () => {
    let { s, ap, ids } = setup([picklockPrankster]);
    const fae = into(s, ap, creature("Test Faerie", "Faerie", 1), "library");
    const elk = into(s, ap, creature("Test Elk", "Elk", 2), "library");
    const spell = into(s, ap, ponder, "library");
    const land = into(s, ap, swamp, "library");
    s = run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto", undefined, { face: 1 }));
    s = pass(s, (x) => !!x.pending);
    expect(s.pending?.kind).toBe("searchLibrary");
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [elk] })).toThrow();
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [] })).toThrow();
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [fae] }));
    expect(zone(s, fae)).toBe("hand");
    expect([zone(s, elk), zone(s, spell), zone(s, land)]).toEqual(["graveyard", "graveyard", "graveyard"]);
    expect(zone(s, ids[0]!)).toBe("exile");
  });

  it("Silvan Rally: up to two land cards from among the four milled into your hand", () => {
    let { s, ap, ids } = setup([thranduil]);
    const l1 = into(s, ap, swamp, "library");
    const l2 = into(s, ap, swamp, "library");
    const l3 = into(s, ap, swamp, "library");
    const elk = into(s, ap, creature("Test Elk", "Elk", 2), "library");
    s = run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto", undefined, { face: 1 }));
    s = pass(s, (x) => !!x.pending);
    expect(s.pending?.kind).toBe("searchLibrary");
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [l1, l2, l3] })).toThrow();
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [l1, l3] }));
    expect([zone(s, l1), zone(s, l2), zone(s, l3), zone(s, elk)]).toEqual(["hand", "graveyard", "hand", "graveyard"]);
  });

  it("Gatewatch Beacon: enters with three loyalty counters and may move one onto a planeswalker you control as it enters", () => {
    let { s, ap, ids } = setup([gatewatchBeacon, walker]);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(counters(s, ids[0]!, "loyalty")).toBe(3);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(counters(s, ids[1]!, "loyalty")).toBe(4);
    expect(counters(s, ids[0]!, "loyalty")).toBe(2);
  });

  it("Gatewatch Beacon: with no loyalty counters left, nothing", () => {
    let { s, ap, ids } = setup([walker]);
    const b = putOnBattlefield(s, ap, gatewatchBeacon);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(counters(s, ids[0]!, "loyalty")).toBe(3);
    expect(counters(s, b, "loyalty")).toBe(0);
  });

  it("Chevill: at your upkeep, a bounty counter on an opponent's creature only while none has one; one dying gains you 3 life and a card", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    putOnBattlefield(s, ap, chevill);
    const ox = putOnBattlefield(s, opp, creature("Test Ox", "Ox", 2));
    const yak = putOnBattlefield(s, opp, creature("Test Yak", "Ox", 3));
    s = passUntil(s, "upkeep", next(s, ap, 4));
    s = pass(s, (x) => !!x.pending);
    expect(s.pending?.kind).toBe("chooseTargets");
    s = resolveAll(choose(s, [tgt(ox)]));
    expect(counters(s, ox, "bounty")).toBe(1);
    // Next upkeep: one still has a bounty counter, so nothing.
    s = passUntil(s, "draw", ap);
    s = passUntil(s, "upkeep", ap);
    s = pass(s, (x) => !!x.pending || !s.stack.length);
    expect(s.pending?.kind).not.toBe("chooseTargets");
    expect(counters(s, yak, "bounty")).toBe(0);
    s = passUntil(s, "main1", ap);
    const hand = s.players[ap]!.hand.length;
    s.objects[ox]!.damage = 5;
    s = resolveAll(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(zone(s, ox)).toBe("graveyard");
    expect(life(s, ap)).toBe(43);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("Termination Facilitator: an opponent's creature with a bounty counter dealt damage is destroyed; one without isn't", () => {
    let { s, ap, ids } = setup([shock, shock]);
    const opp = next(s, ap);
    const tf = putOnBattlefield(s, ap, terminationFacilitator);
    const big = putOnBattlefield(s, opp, creature("Test Wall", "Wall", 0, 6));
    const other = putOnBattlefield(s, opp, creature("Test Other", "Wall", 0, 6));
    s = resolveAll(run(s, planActivate(s, ap, tf, 0, [tgt(big)])));
    expect(counters(s, big, "bounty")).toBe(1);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(other)])));
    expect(zone(s, other)).toBe("battlefield");
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(big)])));
    expect(zone(s, big)).toBe("graveyard");
  });

  it("Velomachus Lorehold: attacking, cast an instant or sorcery with mana value up to its power from the top seven for free; the rest go to the bottom", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const v = putOnBattlefield(s, ap, velomachusLorehold);
    const big = into(s, ap, card("Test Big Spell", "Sorcery", "{5}{U}", { cmc: 6, oracleText: "Draw two cards." }), "library");
    const elk = into(s, ap, creature("Test Elk", "Elk", 2), "library");
    const bolt = into(s, ap, card("Test Blast", "Sorcery", "{4}{R}", { cmc: 5, oracleText: "Test Blast deals 5 damage to target player." }), "library");
    const small = into(s, ap, opt, "library");
    const lib = s.players[ap]!.library.slice(0, 7);
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: v, defender: opp }] });
    s = pass(s, (x) => !!x.pending);
    expect(s.pending?.kind).toBe("chooseOption");
    // The 5-mana sorcery and the 1-mana instant: not the 6-mana one, not the creature.
    expect((s.pending as { options: string[] }).options).toEqual(expect.arrayContaining([bolt, small]));
    expect((s.pending as { options: string[] }).options).not.toContain(big);
    expect((s.pending as { options: string[] }).options).not.toContain(elk);
    s = act(s, { type: "chooseOption", player: ap, choice: bolt });
    s = pass(s, (x) => !!x.pending);
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: bolt });
    s = run(s, planCast(s, ap, bolt, [player(opp)]));
    s = resolveAll(s);
    expect(life(s, opp)).toBe(35);
    expect(zone(s, bolt)).toBe("graveyard");
    expect(s.players[ap]!.library.slice(-6).sort()).toEqual(lib.filter((id) => id !== bolt).sort());
  });

  it("Bygone Marvels: with eight permanent cards in your graveyard, copied twice, each copy may return another card", () => {
    let { s, ap, ids } = setup([bygoneMarvels]);
    const yard = Array.from({ length: 8 }, (_, i) => into(s, ap, creature(`Test Bones ${i}`, "Skeleton", 1), "graveyard"));
    s = run(s, planCast(s, ap, ids[0]!, [tgt(yard[0]!)]));
    for (const id of [yard[1]!, yard[2]!]) {
      s = pass(s, (x) => !!x.pending);
      expect(s.pending?.kind).toBe("copyTargets");
      s = act(s, { type: "copyTargets", player: ap, targets: [tgt(id)] });
    }
    s = resolveAll(s);
    expect([zone(s, yard[0]!), zone(s, yard[1]!), zone(s, yard[2]!), zone(s, yard[3]!)]).toEqual(["hand", "hand", "hand", "graveyard"]);
    expect(zone(s, ids[0]!)).toBe("exile");
  });

  it("Bygone Marvels: with seven, no copies", () => {
    let { s, ap, ids } = setup([bygoneMarvels]);
    const yard = Array.from({ length: 7 }, (_, i) => into(s, ap, creature(`Test Bones ${i}`, "Skeleton", 1), "graveyard"));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(yard[0]!)])));
    expect(s.players[ap]!.graveyard.filter((id) => yard.includes(id))).toHaveLength(6);
  });

  it("Legolas: whenever you scry while it's tapped, you may untap it, once each turn", () => {
    let { s, ap, ids } = setup([opt, opt]);
    const l = putOnBattlefield(s, ap, legolas);
    s.objects[l]!.tapped = true;
    s = run(s, planCast(s, ap, ids[0]!));
    s = pass(s, (x) => !!x.pending);
    if (s.pending?.kind === "arrangeTop") s = act(s, { type: "arrangeTop", player: ap, top: (s.pending as { cards: string[] }).cards, away: [] });
    s = resolveAll(s);
    expect(s.objects[l]!.tapped).toBe(false);
    s.objects[l]!.tapped = true;
    s = run(s, planCast(s, ap, ids[1]!));
    s = pass(s, (x) => !!x.pending);
    if (s.pending?.kind === "arrangeTop") s = act(s, { type: "arrangeTop", player: ap, top: (s.pending as { cards: string[] }).cards, away: [] });
    s = resolveAll(s);
    expect(s.objects[l]!.tapped).toBe(true);
  });

  it("Saradoc: tapping two other untapped Halflings gives +2/+0 and lifelink; Saradoc itself can't be one of them", () => {
    let { s, ap } = setup([]);
    const sd = putOnBattlefield(s, ap, saradoc);
    const h1 = putOnBattlefield(s, ap, creature("Test Halfling", "Halfling", 1));
    expect(planActivate(s, ap, sd, 0)).toBeNull();
    const h2 = putOnBattlefield(s, ap, creature("Test Halfling Two", "Halfling", 1));
    expect(() => run(s, planActivate(s, ap, sd, 0, undefined, undefined, undefined, undefined, { tap: [sd, h1] }))).toThrow();
    s = resolveAll(run(s, planActivate(s, ap, sd, 0, undefined, undefined, undefined, undefined, { tap: [h1, h2] })));
    expect(s.objects[h1]!.tapped && s.objects[h2]!.tapped).toBe(true);
    expect(s.objects[sd]!.tapped).toBe(false);
    expect(pt(s, sd)).toEqual([4, 4]);
    expect(characteristics(s, s.objects[sd]!).keywords).toContain("Lifelink");
  });

  it("Chalice of the Void: counters each spell with mana value equal to its charge counters, as it's cast", () => {
    let { s, ap, ids } = setup([chaliceOfTheVoid, shock, ponder, card("Test Pair", "Sorcery", "{1}{U}", { cmc: 2, oracleText: "Draw a card." })]);
    const opp = next(s, ap);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto", 1)));
    expect(counters(s, ids[0]!, "charge")).toBe(1);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [player(opp)])));
    expect(life(s, opp)).toBe(40);
    expect(zone(s, ids[1]!)).toBe("graveyard");
    const hand = s.players[ap]!.hand.length;
    s = resolveAll(run(s, planCast(s, ap, ids[3]!)));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 1);
  });

  it("Chalice of the Void: with no charge counters, it counters spells with mana value 0", () => {
    let { s, ap, ids } = setup([chaliceOfTheVoid, card("Test Ornament", "Artifact", "{0}", { cmc: 0 }), ponder]);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto", 0)));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(zone(s, ids[1]!)).toBe("graveyard");
    s = resolveAll(run(s, planCast(s, ap, ids[2]!)));
    expect(zone(s, ids[2]!)).toBe("graveyard");
    expect(s.log.join("\n")).not.toMatch(/counter.*Test Ponder/i);
  });

  it("Crackling Spellslinger: cast, the next instant or sorcery spell you cast this turn has storm; the one after doesn't", () => {
    let { s, ap, ids } = setup([cracklingSpellslinger, shock, shock]);
    lands(s, ap, mountain, 2);
    const opp = next(s, ap);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    // Storm counts Crackling Spellslinger: one copy.
    s = run(s, planCast(s, ap, ids[1]!, [player(opp)]));
    s = pass(s, (x) => !!x.pending);
    expect(s.pending?.kind).toBe("copyTargets");
    s = resolveAll(act(s, { type: "copyTargets", player: ap }));
    expect(life(s, opp)).toBe(36);
    s = resolveAll(run(s, planCast(s, ap, ids[2]!, [player(opp)])));
    expect(life(s, opp)).toBe(34);
  });

  it("Crackling Spellslinger: put onto the battlefield without being cast, nothing", () => {
    let { s, ap, ids } = setup([ponder, shock]);
    const opp = next(s, ap);
    putOnBattlefield(s, ap, cracklingSpellslinger);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [player(opp)])));
    expect(life(s, opp)).toBe(38);
  });

  it("Storm, Force of Nature: after combat damage to a player, the next instant or sorcery spell this turn has storm", () => {
    let { s, ap, ids } = setup([ponder, shock]);
    const opp = next(s, ap);
    const st = putOnBattlefield(s, ap, storm);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: st, defender: opp }] });
    s = passUntil(s, "main2", ap);
    expect(life(s, opp)).toBe(37);
    s = run(s, planCast(s, ap, ids[1]!, [player(opp)]));
    s = pass(s, (x) => !!x.pending);
    expect(s.pending?.kind).toBe("copyTargets");
    s = resolveAll(act(s, { type: "copyTargets", player: ap }));
    expect(life(s, opp)).toBe(33);
  });

  it("Undercity Upheaval: X is the creature cards in your graveyard as you cast it, divided among targets then; creatures gain vigilance", () => {
    let { s, ap, ids } = setup([undercityUpheaval]);
    for (let i = 0; i < 3; i++) into(s, ap, creature(`Test Bones ${i}`, "Skeleton", 1), "graveyard");
    const a = putOnBattlefield(s, ap, creature("Test A", "Beast", 2));
    const b = putOnBattlefield(s, ap, creature("Test B", "Beast", 2));
    expect(planCast(s, ap, ids[0]!, [{ kind: "object", id: a, amount: 2 }, { kind: "object", id: b, amount: 2 }])).toBeNull();
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [{ kind: "object", id: a, amount: 2 }, { kind: "object", id: b, amount: 1 }])));
    expect(counters(s, a)).toBe(2);
    expect(counters(s, b)).toBe(1);
    expect(characteristics(s, s.objects[a]!).keywords).toContain("Vigilance");
  });

  it("Sage of the Skies: cast after another spell this turn, it's copied (the copy is a token)", () => {
    let { s, ap, ids } = setup([sageOfTheSkies, ponder, sageOfTheSkies]);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(named(s, ap, "Sage of the Skies")).toHaveLength(1);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    s = resolveAll(run(s, planCast(s, ap, ids[2]!)));
    const sages = named(s, ap, "Sage of the Skies");
    expect(sages).toHaveLength(3);
    expect(sages.filter((id) => s.objects[id]!.isToken)).toHaveLength(1);
  });

  it("Speak Secrets: mill four, then an instant or sorcery card from among them into your hand", () => {
    let { s, ap, ids } = setup([mostDecrepitOldBird]);
    const spell = into(s, ap, ponder, "library");
    for (let i = 0; i < 3; i++) into(s, ap, swamp, "library");
    s = run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto", undefined, { face: 1 }));
    s = pass(s, (x) => !!x.pending || !s.stack.length);
    if (s.pending?.kind === "searchLibrary") s = act(s, { type: "searchLibrary", player: ap, found: [spell] });
    s = resolveAll(s);
    expect(zone(s, spell)).toBe("hand");
  });

  it("Bladewheel Chariot: tapping two other untapped artifacts makes it an artifact creature until end of turn", () => {
    let { s, ap } = setup([]);
    const ch = putOnBattlefield(s, ap, springloadedSawblades);
    s.objects[ch]!.face = 1;
    const [r1, r2] = [1, 2].map((i) => putOnBattlefield(s, ap, card(`Test Rock ${i}`, "Artifact", "{1}", { cmc: 1 })));
    invalidateCharacteristics(s);
    expect(characteristics(s, s.objects[ch]!).types).not.toContain("Creature");
    const idx = abilitiesOf(s, s.objects[ch]!).activated.findIndex((a) => a.costs?.some((c) => c.kind === "tap"));
    s = resolveAll(run(s, planActivate(s, ap, ch, idx, undefined, undefined, undefined, undefined, { tap: [r1!, r2!] })));
    expect(characteristics(s, s.objects[ch]!).types).toContain("Creature");
    expect(s.objects[ch]!.tapped).toBe(false);
  });

  it("Impending Flux: X is 1 plus the spells you've cast from anywhere other than your hand this turn, to each opponent and their creatures", () => {
    let { s, ap, ids } = setup([ponder, impendingFlux]);
    lands(s, ap, mountain, 1);
    const [o1, o2] = [next(s, ap), next(s, ap, 2)];
    const bear = putOnBattlefield(s, o1, creature("Test Bear", "Bear", 2));
    const ox = putOnBattlefield(s, o2, creature("Test Ox", "Ox", 3));
    const mine = putOnBattlefield(s, ap, creature("Test Mine", "Bear", 2));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    // As if Test Ponder had been cast from the graveyard.
    s.castThisTurn = s.castThisTurn!.map((x) => ({ ...x, from: "graveyard" as const }));
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(life(s, o1)).toBe(38);
    expect(life(s, o2)).toBe(38);
    expect(life(s, ap)).toBe(40);
    expect(zone(s, bear)).toBe("graveyard");
    expect(s.objects[ox]!.damage).toBe(2);
    expect(s.objects[mine]!.damage).toBe(0);
  });

  it("Impending Flux: cast from your hand with nothing else, X is 1", () => {
    let { s, ap, ids } = setup([ponder, impendingFlux]);
    lands(s, ap, mountain, 1);
    const opp = next(s, ap);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(life(s, opp)).toBe(39);
  });

  it("The Cauldron of Eternity: a creature you control dying goes to the bottom of its owner's library; an opponent's doesn't", () => {
    let { s, ap, ids } = setup([murder, murder]);
    lands(s, ap, swamp, 1);
    const opp = next(s, ap);
    putOnBattlefield(s, ap, theCauldronOfEternity);
    const mine = putOnBattlefield(s, ap, creature("Test Mine", "Bear", 2));
    const theirs = putOnBattlefield(s, opp, creature("Test Theirs", "Bear", 2));
    s = resolveAll(choose(run(s, planCast(s, ap, ids[0]!, [tgt(mine)])), [tgt(mine)]));
    expect(zone(s, mine)).toBe("library");
    expect(s.players[ap]!.library.at(-1)).toBe(mine);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(theirs)])));
    expect(zone(s, theirs)).toBe("graveyard");
  });

  it("The Cauldron of Eternity: costs {2} less for each creature card in your graveyard; returns a creature card for {2}{B}, {T} and 2 life", () => {
    let { s, ap, ids } = setup([theCauldronOfEternity]);
    const bones = [0, 1, 2, 3, 4].map((i) => into(s, ap, creature(`Test Bones ${i}`, "Skeleton", 1), "graveyard"));
    lands(s, ap, swamp, 1);
    // {10}{B}{B} less {10}: {B}{B}.
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    const [c] = named(s, ap, "The Cauldron of Eternity");
    expect(c).toBeDefined();
    for (const id of s.battlefield) if (s.objects[id]!.controller === ap) s.objects[id]!.tapped = false;
    s = resolveAll(choose(run(s, planActivate(s, ap, c!, 0, [tgt(bones[0]!)])), [tgt(bones[0]!)]));
    expect(zone(s, bones[0]!)).toBe("battlefield");
    expect(life(s, ap)).toBe(38);
  });

  it("Mobilized District: {4} less {1} for each legendary creature and planeswalker you control; becomes a 3/3 vigilant Citizen land", () => {
    let { s, ap } = setup([]);
    const d = putOnBattlefield(s, ap, mobilizedDistrict);
    // Only one other land untapped: two mana with the District's own.
    const others = s.battlefield.filter((id) => id !== d && controllerOf(s, s.objects[id]!) === ap);
    others.slice(1).forEach((id) => (s.objects[id]!.tapped = true));
    const idx = abilitiesOf(s, s.objects[d]!).activated.findIndex((a) => !a.mana);
    expect(planActivate(s, ap, d, idx)).toBeNull();
    putOnBattlefield(s, ap, card("Test Legend", "Legendary Creature — Human", "{W}", { cmc: 1, power: "1", toughness: "1" }));
    expect(planActivate(s, ap, d, idx)).toBeNull();
    s.objects[putOnBattlefield(s, ap, walker)]!.counters.loyalty = 3;
    s = resolveAll(run(s, planActivate(s, ap, d, idx)));
    const ch = characteristics(s, s.objects[d]!);
    expect(ch.types).toEqual(expect.arrayContaining(["Land", "Creature"]));
    expect(ch.keywords).toContain("Vigilance");
    expect(pt(s, d)).toEqual([3, 3]);
  });

  it("Kozilek's Return: 2 damage to each creature; from your graveyard, casting an Eldrazi creature spell with mana value 7 may exile it for 5 damage to each creature", () => {
    const titan = card("Test Titan", "Creature — Eldrazi", "{7}", { cmc: 7, power: "10", toughness: "10" });
    let { s, ap, ids } = setup([kozileksReturn, titan]);
    lands(s, ap, mountain, 5);
    const opp = next(s, ap);
    const big = putOnBattlefield(s, opp, creature("Test Big", "Beast", 6, 6));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.objects[big]!.damage).toBe(2);
    expect(zone(s, ids[0]!)).toBe("graveyard");
    for (const id of s.battlefield) if (s.objects[id]!.controller === ap) s.objects[id]!.tapped = false;
    s = run(s, planCast(s, ap, ids[1]!));
    s = resolveAll(s);
    expect(zone(s, ids[0]!)).toBe("exile");
    expect(zone(s, big)).toBe("graveyard");
    // It resolved before the Eldrazi did.
    expect(named(s, ap, "Test Titan")).toHaveLength(1);
    expect(s.objects[named(s, ap, "Test Titan")[0]!]!.damage).toBe(0);
  });

  it("Kozilek's Return: not in your graveyard, or a spell that isn't an Eldrazi creature, nothing", () => {
    const titan = card("Test Titan", "Creature — Eldrazi", "{7}", { cmc: 7, power: "10", toughness: "10" });
    const golem = card("Test Golem", "Artifact Creature — Golem", "{7}", { cmc: 7, power: "7", toughness: "7" });
    let { s, ap, ids } = setup([golem, titan, kozileksReturn]);
    lands(s, ap, mountain, 9);
    const opp = next(s, ap);
    const big = putOnBattlefield(s, opp, creature("Test Big", "Beast", 6, 6));
    const kr = into(s, ap, kozileksReturn, "graveyard");
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(zone(s, kr)).toBe("graveyard");
    expect(s.objects[big]!.damage).toBe(0);
    // In your hand, casting an Eldrazi does nothing either.
    s.players[ap]!.graveyard = s.players[ap]!.graveyard.filter((x) => x !== kr);
    s.objects[kr]!.zone = "exile";
    s.players[ap]!.exile.push(kr);
    for (const id of s.battlefield) if (s.objects[id]!.controller === ap) s.objects[id]!.tapped = false;
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(zone(s, ids[2]!)).toBe("hand");
    expect(s.objects[big]!.damage).toBe(0);
  });

  it("Ugin's Binding: from your graveyard, casting a colorless spell with mana value 7 may exile it to return each nonland permanent you don't control", () => {
    const monolith = card("Test Monolith", "Artifact", "{7}", { cmc: 7 });
    let { s, ap, ids } = setup([monolith]);
    lands(s, ap, mountain, 2);
    const opp = next(s, ap);
    const ub = into(s, ap, uginsBinding, "graveyard");
    const theirs = putOnBattlefield(s, opp, creature("Test Theirs", "Bear", 2));
    const theirLand = putOnBattlefield(s, opp, swamp);
    const mine = putOnBattlefield(s, ap, creature("Test Mine", "Bear", 2));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(zone(s, ub)).toBe("exile");
    expect(zone(s, theirs)).toBe("hand");
    expect(zone(s, theirLand)).toBe("battlefield");
    expect(zone(s, mine)).toBe("battlefield");
    expect(named(s, ap, "Test Monolith")).toHaveLength(1);
  });

  it("Ugin's Binding: declining leaves it in the graveyard and returns nothing", () => {
    const monolith = card("Test Monolith", "Artifact", "{7}", { cmc: 7 });
    let { s, ap, ids } = setup([monolith]);
    lands(s, ap, mountain, 2);
    const opp = next(s, ap);
    const ub = into(s, ap, uginsBinding, "graveyard");
    const theirs = putOnBattlefield(s, opp, creature("Test Theirs", "Bear", 2));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)), false);
    expect(zone(s, ub)).toBe("graveyard");
    expect(zone(s, theirs)).toBe("battlefield");
  });
});
