// Round 185: more of the harder cards both lanes skipped, from the most played down: "A or B" activation costs (the
// Shards), "if it's not that player's turn", cards "put there from the battlefield this turn" (Faith's Reward), "the
// next spell you cast this turn has convoke", "whenever you investigate for the first time each turn", "if you put a
// counter on a creature this turn", delayed "whenever a card is put into an opponent's graveyard" triggers and more.

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, island, passUntil, putOnBattlefield, setup, swamp } from "./helpers";
import { abilitiesOf, botActions, castProblem, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, moveObject, parseManaCost, planActivate, planCast, planMana, power, spellCost, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Says yes (or no) to a "you may" question, paying its mana first. */
const may = (s: GameState, yes: boolean) => {
  if (s.pending?.kind !== "chooseMay") throw new Error("no question");
  const pid = s.pending.player;
  if (yes && s.pending.pay?.mana) for (const a of planMana(s, pid, parseManaCost(s.pending.pay.mana))!) s = act(s, a);
  return act(s, { type: "chooseMay", player: pid, yes });
};
/** Everyone passes until the stack is empty; "you may" questions get `yes`. Stops at any other question. */
const resolveAll = (s: GameState, yes = true) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending?.kind === "chooseMay"); i++) {
    if (s.pending?.kind === "chooseMay") s = may(s, yes);
    else if (s.pending) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** A card put straight into a zone, not from the battlefield. */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "graveyard" | "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** A game where `ap` controls none of their lands: they're moved to the graveyard. */
const bare = (hand: CardDef[]) => {
  const g = setup(hand);
  for (const id of [...g.s.battlefield]) if (g.s.objects[id]!.controller === g.ap) moveObject(g.s, id, "graveyard");
  for (const id of g.s.players[g.ap]!.graveyard) delete g.s.objects[id]!.fromBattlefieldTurn;
  invalidateCharacteristics(g.s);
  return g;
};
/** Puts a permanent from the battlefield into its owner's graveyard, as dying does. */
const kill = (s: GameState, id: ObjectId) => {
  moveObject(s, id, "graveyard");
  invalidateCharacteristics(s);
};
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const pt = (s: GameState, id: ObjectId) => [power(s, s.objects[id]!), toughness(s, s.objects[id]!)];
const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && [name, `${name} Token`].includes(characteristics(s, s.objects[id]!).name));
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const others = (s: GameState, ap: PlayerId) => s.turnOrder.filter((p) => p !== ap);
const big = card("Test Giant", "Creature — Giant", "{4}{G}", { cmc: 5, power: "5", toughness: "5" });
const relic = card("Test Relic", "Artifact", "{1}", { cmc: 1 });
const aura = card("Test Charm", "Enchantment", "{1}", { cmc: 1 });
const opt = card("Test Opt", "Instant", "{U}", { cmc: 1, oracleText: "Draw a card." });
const vampire = card("Test Vampire", "Creature — Vampire", "{1}{B}", { cmc: 2, power: "2", toughness: "2" });
const flyer = card("Test Bird", "Creature — Bird", "{1}{W}", { cmc: 2, power: "1", toughness: "1", keywords: ["Flying"], oracleText: "Flying" });
const shock = card("Shock", "Instant", "{R}", { cmc: 1, oracleText: "Shock deals 2 damage to any target." });

// Real oracle text (Scryfall).
const priceOfGlory = card("Price of Glory", "Enchantment", "{2}{R}", {"cmc":3,"oracleText":"Whenever a player taps a land for mana, if it's not that player's turn, destroy that land.","colors":["R"]});
const fireNationTurret = card("Fire Nation Turret", "Artifact", "{2}{R}", {"cmc":3,"oracleText":"At the beginning of combat on your turn, up to one target creature gets +2/+0 and gains firebending 2 until end of turn.\n{R}: Put a charge counter on this artifact.\nRemove fifty charge counters from this artifact: It deals 50 damage to any target.","colors":["R"]});
const gavelOfTheRighteous = card("Gavel of the Righteous", "Artifact — Equipment", "{2}", {"cmc":2,"keywords":["Equip"],"oracleText":"At the beginning of combat on your turn, put a charge counter on this Equipment.\nEquipped creature gets +1/+1 for each counter on this Equipment.\nAs long as this Equipment has four or more counters on it, equipped creature has double strike.\nEquip—Pay {3} or remove a counter from this Equipment."});
const crystalShard = card("Crystal Shard", "Artifact", "{3}", {"cmc":3,"oracleText":"{3}, {T} or {U}, {T}: Return target creature to its owner's hand unless its controller pays {1}."});
const graniteShard = card("Granite Shard", "Artifact", "{3}", {"cmc":3,"oracleText":"{3}, {T} or {R}, {T}: This artifact deals 1 damage to any target."});
const heartwoodShard = card("Heartwood Shard", "Artifact", "{3}", {"cmc":3,"oracleText":"{3}, {T} or {G}, {T}: Target creature gains trample until end of turn."});
const pearlShard = card("Pearl Shard", "Artifact", "{3}", {"cmc":3,"oracleText":"{3}, {T} or {W}, {T}: Prevent the next 2 damage that would be dealt to any target this turn."});
const skeletonShard = card("Skeleton Shard", "Artifact", "{3}", {"cmc":3,"oracleText":"{3}, {T} or {B}, {T}: Return target artifact creature card from your graveyard to your hand."});
const bloodTribute = card("Blood Tribute", "Sorcery", "{4}{B}{B}", {"cmc":6,"keywords":["Kicker"],"oracleText":"Kicker—Tap an untapped Vampire you control. (You may tap a Vampire you control in addition to any other costs as you cast this spell.)\nTarget opponent loses half their life, rounded up. If this spell was kicked, you gain life equal to the life lost this way.","colors":["B"]});
const wandOfTheWorldsoul = card("Wand of the Worldsoul", "Artifact", "{2}{W}", {"cmc":3,"oracleText":"This artifact enters tapped.\n{T}: Add {W}.\n{T}: The next spell you cast this turn has convoke.","colors":["W"]});
const enhancedSurveillance = card("Enhanced Surveillance", "Enchantment", "{1}{U}", {"cmc":2,"oracleText":"You may look at an additional two cards each time you surveil.\nExile this enchantment: Shuffle your graveyard into your library.","colors":["U"]});
const erdwalIlluminator = card("Erdwal Illuminator", "Creature — Spirit", "{1}{U}", {"cmc":2,"power":"1","toughness":"3","keywords":["Flying","Investigate"],"oracleText":"Flying\nWhenever you investigate for the first time each turn, investigate an additional time.","colors":["U"]});
const lastingTarfire = card("Lasting Tarfire", "Enchantment", "{1}{R}", {"cmc":2,"oracleText":"At the beginning of each end step, if you put a counter on a creature this turn, this enchantment deals 2 damage to each opponent.","colors":["R"]});
const duskmantleGuildmage = card("Duskmantle Guildmage", "Creature — Human Wizard", "{U}{B}", {"cmc":2,"power":"2","toughness":"2","keywords":["Mill"],"oracleText":"{1}{U}{B}: Whenever a card is put into an opponent's graveyard from anywhere this turn, that player loses 1 life.\n{2}{U}{B}: Target player mills two cards.","colors":["B","U"]});
const strongTheBrutishThespian = card("Strong, the Brutish Thespian", "Legendary Creature — Mutant Berserker", "{4}{G}{G}", {"cmc":6,"power":"7","toughness":"7","keywords":["Enrage","Ward"],"oracleText":"Ward {2}\nEnrage — Whenever Strong is dealt damage, you get three rad counters and put three +1/+1 counters on Strong.\nYou gain life rather than lose life from radiation.","colors":["G"]});
const energybending = card("Energybending", "Instant — Lesson", "{2}", {"cmc":2,"oracleText":"Lands you control gain all basic land types until end of turn.\nDraw a card."});
const grangran = card("Gran-Gran", "Legendary Creature — Human Peasant Ally", "{U}", {"cmc":1,"power":"1","toughness":"2","oracleText":"Whenever Gran-Gran becomes tapped, draw a card, then discard a card.\nNoncreature spells you cast cost {1} less to cast as long as there are three or more Lesson cards in your graveyard.","colors":["U"]});
const jubilantSkybonder = card("Jubilant Skybonder", "Creature — Human Wizard", "{1}{W/U}{W/U}", {"cmc":3,"power":"2","toughness":"2","keywords":["Flying"],"oracleText":"Flying\nCreatures you control with flying have \"Spells your opponents cast that target this creature cost {2} more to cast.\"","colors":["U","W"]});
const reverseThePolarity = card("Reverse the Polarity", "Instant", "{1}{U}{U}", {"cmc":3,"oracleText":"Choose one —\n• Counter all other spells.\n• Switch each creature's power and toughness until end of turn.\n• Creatures can't be blocked this turn.","colors":["U"]});
const faithsReward = card("Faith's Reward", "Instant", "{3}{W}", {"cmc":4,"oracleText":"Return to the battlefield all permanent cards in your graveyard that were put there from the battlefield this turn.","colors":["W"]});
const secondSunrise = card("Second Sunrise", "Instant", "{1}{W}{W}", {"cmc":3,"oracleText":"Each player returns to the battlefield all artifact, creature, enchantment, and land cards in their graveyard that were put there from the battlefield this turn.","colors":["W"]});
const gerrardsHourglassPendant = card("Gerrard's Hourglass Pendant", "Legendary Artifact", "{1}", {"cmc":1,"keywords":["Flash"],"oracleText":"Flash\nIf a player would begin an extra turn, that player skips that turn instead.\n{4}, {T}, Exile Gerrard's Hourglass Pendant: Return to the battlefield tapped all artifact, creature, enchantment, and land cards in your graveyard that were put there from the battlefield this turn."});
const gleancrawler = card("Gleancrawler", "Creature — Insect Horror", "{3}{B/G}{B/G}{B/G}", {"cmc":6,"power":"6","toughness":"6","keywords":["Trample"],"oracleText":"({B/G} can be paid with either {B} or {G}.)\nTrample\nAt the beginning of your end step, return to your hand all creature cards in your graveyard that were put there from the battlefield this turn.","colors":["B","G"]});
const noRestForTheWicked = card("No Rest for the Wicked", "Enchantment", "{1}{B}", {"cmc":2,"oracleText":"Sacrifice this enchantment: Return to your hand all creature cards in your graveyard that were put there from the battlefield this turn.","colors":["B"]});
const thrillingEncore = card("Thrilling Encore", "Instant", "{4}{B}", {"cmc":5,"oracleText":"Put onto the battlefield under your control all creature cards in all graveyards that were put there from the battlefield this turn.","colors":["B"]});
const twilightShepherd = card("Twilight Shepherd", "Creature — Angel", "{3}{W}{W}{W}", {"cmc":6,"power":"5","toughness":"5","keywords":["Flying","Persist","Vigilance"],"oracleText":"Flying, vigilance\nWhen this creature enters, return to your hand all cards in your graveyard that were put there from the battlefield this turn.\nPersist (When this creature dies, if it had no -1/-1 counters on it, return it to the battlefield under its owner's control with a -1/-1 counter on it.)","colors":["W"]});
const gerrardWeatherlightHero = card("Gerrard, Weatherlight Hero", "Legendary Creature — Human Soldier", "{2}{R}{W}", {"cmc":4,"power":"3","toughness":"3","keywords":["First strike"],"oracleText":"First strike\nWhen Gerrard dies, exile it and return to the battlefield all artifact and creature cards in your graveyard that were put there from the battlefield this turn.","colors":["R","W"]});
const corruptedCrossroads = card("Corrupted Crossroads", "Land", "", {"cmc":0,"oracleText":"{T}: Add {C}. ({C} represents colorless mana.)\n{T}, Pay 1 life: Add one mana of any color. Spend this mana only to cast a spell with devoid."});
const shadowMysteriousAssassin = card("Shadow, Mysterious Assassin", "Legendary Creature — Human Assassin", "{2}{B}", {"cmc":3,"power":"3","toughness":"3","keywords":["Deathtouch"],"oracleText":"Deathtouch\nThrow — Whenever Shadow deals combat damage to a player, you may sacrifice another nonland permanent. If you do, draw two cards and each opponent loses life equal to the mana value of the sacrificed permanent.","colors":["B"]});

const callapheBelovedOfTheSea = card("Callaphe, Beloved of the Sea", "Legendary Enchantment Creature — Demigod", "{1}{U}{U}", {"cmc":3,"power":"*","toughness":"3","oracleText":"Callaphe's power is equal to your devotion to blue. (Each {U} in the mana costs of permanents you control counts toward your devotion to blue.)\nCreatures and enchantments you control have \"Spells your opponents cast that target this permanent cost {1} more to cast.\"","colors":["U"]});
const erraticPortal = card("Erratic Portal", "Artifact", "{4}", {"cmc":4,"oracleText":"{1}, {T}: Return target creature to its owner's hand unless its controller pays {1}."});
const lordJyscalGuado = card("Lord Jyscal Guado", "Legendary Creature — Spirit Cleric", "{1}{W}", {"cmc":2,"power":"2","toughness":"1","keywords":["Flying","Investigate"],"oracleText":"Flying\nAt the beginning of each end step, if you put a counter on a creature this turn, investigate. (Create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")","colors":["W"]});

const surveil = card("Test Surveil", "Sorcery", "{U}", { cmc: 1, oracleText: "Surveil 1." });
const clue = card("Test Clue", "Instant", "{U}", { cmc: 1, oracleText: "Investigate." });
const grow = card("Test Growth", "Instant", "{G}", { cmc: 1, oracleText: "Put a +1/+1 counter on target creature." });
const lesson = card("Test Lesson", "Sorcery — Lesson", "{1}{U}", { cmc: 2, oracleText: "Draw a card." });
const study = card("Test Study", "Sorcery", "{1}{U}", { cmc: 2, oracleText: "Draw a card." });
const eldrazi = card("Test Eldrazi", "Creature — Eldrazi Drone", "{B}", { cmc: 1, power: "1", toughness: "1", keywords: ["Devoid"], oracleText: "Devoid (This card has no color.)" });
const knight = card("Test Knight", "Creature — Knight", "{B}", { cmc: 1, power: "1", toughness: "1", colors: ["B"] });

describe("round 185", () => {
  it("all compile", () => supported(priceOfGlory, fireNationTurret, gavelOfTheRighteous, crystalShard, graniteShard, heartwoodShard, pearlShard, skeletonShard, bloodTribute, wandOfTheWorldsoul, enhancedSurveillance, erdwalIlluminator, lastingTarfire, duskmantleGuildmage, strongTheBrutishThespian, energybending, grangran, jubilantSkybonder, reverseThePolarity, faithsReward, secondSunrise, gerrardsHourglassPendant, gleancrawler, noRestForTheWicked, thrillingEncore, twilightShepherd, gerrardWeatherlightHero, corruptedCrossroads, shadowMysteriousAssassin, callapheBelovedOfTheSea, erraticPortal, lordJyscalGuado));

  it("Price of Glory: a land tapped for mana on someone else's turn is destroyed, not one tapped on its controller's turn", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, priceOfGlory);
    const theirs = putOnBattlefield(s, opp, forest);
    s = act(s, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(opp);
    s = run(s, planMana(s, opp, parseManaCost("{G}")));
    s = resolveAll(s);
    expect(zone(s, theirs)).toBe("graveyard");
    const mine = s.battlefield.find((id) => controllerOf(s, s.objects[id]!) === ap && characteristics(s, s.objects[id]!).name === "Forest")!;
    s = run(s, planMana(s, ap, parseManaCost("{G}")));
    s = resolveAll(s);
    expect(zone(s, mine)).toBe("battlefield");
  });

  it("Fire Nation Turret: fifty charge counters deal 50 damage, and it can't be activated with fewer", () => {
    let { s, ap, opp } = setup([]);
    const t = putOnBattlefield(s, ap, fireNationTurret);
    s.objects[t]!.counters.charge = 49;
    expect(planActivate(s, ap, t, 1, [player(opp)])).toBeNull();
    s = resolveAll(run(s, planActivate(s, ap, t, 0)));
    expect(s.objects[t]!.counters.charge).toBe(50);
    s = resolveAll(run(s, planActivate(s, ap, t, 1, [player(opp)])));
    expect(s.objects[t]!.counters.charge ?? 0).toBe(0);
    expect(life(s, opp)).toBe(-10);
  });

  it("Gavel of the Righteous: equip by removing a counter instead of paying {3}", () => {
    let { s, ap } = setup([]);
    const g = putOnBattlefield(s, ap, gavelOfTheRighteous);
    const b = putOnBattlefield(s, ap, bear());
    s.objects[g]!.counters.charge = 2;
    invalidateCharacteristics(s);
    s = resolveAll(run(s, planActivate(s, ap, g, 1, [tgt(b)], undefined, undefined, undefined, { counters: [{ id: g, kind: "charge" }] })));
    expect(s.objects[g]!.attachedTo).toBe(b);
    expect(s.objects[g]!.counters.charge).toBe(1);
    expect(pt(s, b)).toEqual([3, 3]);
    // With no counter left it can only be equipped by paying {3}.
    s.objects[g]!.counters.charge = 0;
    invalidateCharacteristics(s);
    const b2 = putOnBattlefield(s, ap, bear());
    expect(planActivate(s, ap, g, 1, [tgt(b2)], undefined, undefined, undefined, { counters: [{ id: g, kind: "charge" }] })).toBeNull();
    expect(planActivate(s, ap, g, 0, [tgt(b2)])).not.toBeNull();
  });

  it("Granite Shard: either cost works, {3} or {R}", () => {
    for (const [index, cost] of [[0, "{3}"], [1, "{R}"]] as const) {
      let { s, ap, opp } = bare([]);
      const m = putOnBattlefield(s, ap, card("Mountain", "Basic Land — Mountain"));
      const sh = putOnBattlefield(s, ap, graniteShard);
      expect(abilitiesOf(s, s.objects[sh]!).activated[index]!.manaCost).toBe(cost);
      if (index === 0) expect(planActivate(s, ap, sh, 0, [player(opp)])).toBeNull(); // one Mountain can't pay {3}
      else {
        s = resolveAll(run(s, planActivate(s, ap, sh, 1, [player(opp)])));
        expect(s.objects[m]!.tapped).toBe(true);
        expect(s.objects[sh]!.tapped).toBe(true);
        expect(life(s, opp)).toBe(39);
      }
    }
  });

  it("Crystal Shard: the creature is returned unless its controller pays {1}", () => {
    for (const pays of [true, false]) {
      let { s, ap, opp } = setup([]);
      const sh = putOnBattlefield(s, ap, crystalShard);
      putOnBattlefield(s, opp, island);
      const b = putOnBattlefield(s, opp, bear());
      s = run(s, planActivate(s, ap, sh, 1, [tgt(b)]));
      for (let i = 0; i < 20 && (s.stack.length || s.pending); i++) {
        const p = s.pending;
        if (p?.kind === "payUnless") {
          expect(p.player).toBe(opp);
          if (pays) s = run(s, planMana(s, opp, parseManaCost("{1}")));
          s = act(s, { type: "payUnless", player: opp, pay: pays });
        } else s = act(s, { type: "passPriority", player: waitingOn(s)! });
      }
      expect(zone(s, b)).toBe(pays ? "battlefield" : "hand");
    }
  });

  it("Blood Tribute: half their life, rounded up; kicked, you gain the life lost", () => {
    for (const kicked of [false, true]) {
      let { s, ap, ids, opp } = setup([bloodTribute]);
      const v = putOnBattlefield(s, ap, vampire);
      s.players[opp]!.life = 39;
      s = resolveAll(run(s, planCast(s, ap, ids[0]!, [player(opp)], undefined, "auto", undefined, kicked ? { kicks: [0], tap: [v] } : {})));
      expect(life(s, opp)).toBe(19);
      expect(life(s, ap)).toBe(kicked ? 60 : 40);
      expect(s.objects[v]!.tapped).toBe(kicked);
    }
  });

  it("Wand of the Worldsoul: the next spell you cast this turn has convoke, and only that one", () => {
    let { s, ap, ids } = bare([bear({ name: "Bear A" }), bear({ name: "Bear B" })]);
    const w = putOnBattlefield(s, ap, wandOfTheWorldsoul);
    const c1 = putOnBattlefield(s, ap, bear()), c2 = putOnBattlefield(s, ap, bear());
    expect(castProblem(s, ap, ids[0]!, undefined, undefined, [c1, c2])).not.toBeNull();
    s = resolveAll(run(s, planActivate(s, ap, w, 0)));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, undefined, undefined, [c1, c2])));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect([s.objects[c1]!.tapped, s.objects[c2]!.tapped]).toEqual([true, true]);
    const c3 = putOnBattlefield(s, ap, bear()), c4 = putOnBattlefield(s, ap, bear());
    expect(castProblem(s, ap, ids[1]!, undefined, undefined, [c3, c4])).not.toBeNull();
  });

  it("Enhanced Surveillance: surveil looks at two more cards", () => {
    let { s, ap, ids } = setup([surveil]);
    putOnBattlefield(s, ap, enhancedSurveillance);
    const top = s.players[ap]!.library.slice(0, 3);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "arrangeTop", player: ap, how: "surveil", cards: top });
    s = act(s, { type: "arrangeTop", player: ap, top: [top[2]!], away: [top[0]!, top[1]!] });
    expect([zone(s, top[0]!), zone(s, top[1]!)]).toEqual(["graveyard", "graveyard"]);
    expect(s.players[ap]!.library[0]).toBe(top[2]);
  });

  it("Erdwal Illuminator: the first investigate each turn investigates again, the second doesn't", () => {
    let { s, ap, ids } = setup([clue, { ...clue }]);
    putOnBattlefield(s, ap, erdwalIlluminator);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(named(s, ap, "Clue").length).toBe(2);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(named(s, ap, "Clue").length).toBe(3);
  });

  it("Lasting Tarfire: 2 damage to each opponent at each end step, if you put a counter on a creature this turn", () => {
    for (const grew of [false, true]) {
      let { s, ap, ids, opp } = setup([grow]);
      putOnBattlefield(s, ap, lastingTarfire);
      const b = putOnBattlefield(s, opp, bear());
      if (grew) s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(b)])));
      s = resolveAll(passUntil(s, "cleanup", ap));
      for (const o of others(s, ap)) expect(life(s, o)).toBe(grew ? 38 : 40);
    }
  });

  it("Duskmantle Guildmage: each card put into an opponent's graveyard this turn makes them lose 1 life", () => {
    let { s, ap, opp } = setup([]);
    const g = putOnBattlefield(s, ap, duskmantleGuildmage);
    putOnBattlefield(s, ap, swamp);
    s = resolveAll(run(s, planActivate(s, ap, g, 0)));
    s = resolveAll(run(s, planActivate(s, ap, g, 1, [player(opp)])));
    expect(s.players[opp]!.graveyard.length).toBe(2);
    expect(life(s, opp)).toBe(38);
    // Your own graveyard doesn't count.
    s = resolveAll(run(s, planActivate(s, ap, g, 1, [player(ap)])));
    expect(life(s, ap)).toBe(40);
    // A token isn't a card.
    const tok = putOnBattlefield(s, opp, bear());
    s.objects[tok]!.isToken = true;
    kill(s, tok);
    s = resolveAll(s);
    expect(life(s, opp)).toBe(38);
    // Only this turn.
    const opp2 = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    s = passUntil(s, "main1", opp2);
    const before = life(s, opp);
    kill(s, putOnBattlefield(s, opp, bear()));
    s = resolveAll(s);
    expect(life(s, opp)).toBe(before);
  });

  it("Strong, the Brutish Thespian: you gain life rather than lose life from radiation", () => {
    for (const strong of [false, true]) {
      let { s, ap } = setup([]);
      if (strong) putOnBattlefield(s, ap, strongTheBrutishThespian);
      for (let i = 0; i < 4; i++) into(s, ap, bear(), "library");
      s.players[ap]!.rad = 3;
      s = passUntil(passUntil(s, "end", ap), "main1", ap);
      s = resolveAll(s);
      expect(life(s, ap)).toBe(strong ? 43 : 37);
      expect(s.players[ap]!.rad ?? 0).toBe(0);
    }
  });

  it("Energybending: your lands gain all basic land types until end of turn", () => {
    let { s, ap, ids } = bare([energybending]);
    const lands = [putOnBattlefield(s, ap, forest), putOnBattlefield(s, ap, forest), putOnBattlefield(s, ap, forest)];
    const hand = s.players[ap]!.hand.length;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.players[ap]!.hand.length).toBe(hand); // cast one, drew one
    for (const l of lands) expect(characteristics(s, s.objects[l]!).subtypes).toEqual(expect.arrayContaining(["Plains", "Island", "Swamp", "Mountain", "Forest"]));
    expect(planMana(s, ap, parseManaCost("{U}"))).not.toBeNull();
    s = passUntil(s, "main1", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    expect(characteristics(s, s.objects[lands[0]!]!).subtypes).toEqual(["Forest"]);
  });

  it("Gran-Gran: noncreature spells cost {1} less while three or more Lesson cards are in your graveyard", () => {
    const { s, ap, ids } = setup([study, bear()]);
    putOnBattlefield(s, ap, grangran);
    /** The generic mana it costs. */
    const cost = (id: ObjectId) => spellCost(s, ap, s.objects[id]!, 0, []).extra;
    into(s, ap, lesson, "graveyard");
    into(s, ap, lesson, "graveyard");
    into(s, ap, study, "graveyard");
    expect(cost(ids[0]!)).toBe(1);
    into(s, ap, lesson, "graveyard");
    invalidateCharacteristics(s);
    expect(cost(ids[0]!)).toBe(0);
    expect(cost(ids[1]!)).toBe(1);
  });

  it("Jubilant Skybonder: opponents' spells that target your flyers cost {2} more", () => {
    const { s, ap, ids, opp } = setup([shock]);
    const bird = putOnBattlefield(s, opp, flyer);
    const walker = putOnBattlefield(s, opp, bear());
    const mine = putOnBattlefield(s, ap, flyer);
    putOnBattlefield(s, opp, jubilantSkybonder);
    const o = s.objects[ids[0]!]!;
    expect(spellCost(s, ap, o, 0, [], { targets: [tgt(bird)] }).extra).toBe(2);
    expect(spellCost(s, ap, o, 0, [], { targets: [tgt(walker)] }).extra).toBe(0);
    expect(spellCost(s, ap, o, 0, [], { targets: [tgt(mine)] }).extra).toBe(0);
  });

  it("Reverse the Polarity: counter all other spells", () => {
    let { s, ap, ids } = setup([opt, reverseThePolarity]);
    const hand = s.players[ap]!.hand.length;
    s = run(s, planCast(s, ap, ids[0]!));
    s = run(s, planCast(s, ap, ids[1]!, undefined, [0]));
    s = resolveAll(s);
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(zone(s, ids[1]!)).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand - 2); // Test Opt didn't draw
  });

  it("Faith's Reward: returns your permanent cards put into your graveyard from the battlefield this turn", () => {
    let { s, ap, ids, opp } = setup([faithsReward]);
    const b = putOnBattlefield(s, ap, bear()), r = putOnBattlefield(s, ap, relic), theirs = putOnBattlefield(s, opp, bear());
    const old = into(s, ap, big, "graveyard");
    const discarded = into(s, ap, aura, "graveyard");
    for (const id of [b, r, theirs]) kill(s, id);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect([zone(s, b), zone(s, r)]).toEqual(["battlefield", "battlefield"]);
    expect([zone(s, old), zone(s, discarded), zone(s, theirs)]).toEqual(["graveyard", "graveyard", "graveyard"]);
    expect(zone(s, ids[0]!)).toBe("graveyard");
  });

  it("Second Sunrise: each player gets back their own, under their own control", () => {
    let { s, ap, ids, opp } = setup([secondSunrise]);
    const b = putOnBattlefield(s, ap, bear()), theirs = putOnBattlefield(s, opp, bear()), land = putOnBattlefield(s, opp, swamp);
    for (const id of [b, theirs, land]) kill(s, id);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect([zone(s, b), zone(s, theirs), zone(s, land)]).toEqual(["battlefield", "battlefield", "battlefield"]);
    expect(controllerOf(s, s.objects[theirs]!)).toBe(opp);
  });

  it("Thrilling Encore: creature cards from every graveyard, under your control", () => {
    let { s, ap, ids, opp } = setup([thrillingEncore]);
    const theirs = putOnBattlefield(s, opp, bear()), land = putOnBattlefield(s, opp, swamp);
    for (const id of [theirs, land]) kill(s, id);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(zone(s, theirs)).toBe("battlefield");
    expect(controllerOf(s, s.objects[theirs]!)).toBe(ap);
    expect(zone(s, land)).toBe("graveyard");
  });

  it("Gerrard's Hourglass Pendant: returns them tapped", () => {
    let { s, ap } = setup([]);
    const p = putOnBattlefield(s, ap, gerrardsHourglassPendant);
    const b = putOnBattlefield(s, ap, bear()), l = putOnBattlefield(s, ap, forest);
    for (const id of [b, l]) kill(s, id);
    s = resolveAll(run(s, planActivate(s, ap, p, 0)));
    expect(zone(s, p)).toBe("exile");
    expect([zone(s, b), zone(s, l)]).toEqual(["battlefield", "battlefield"]);
    expect([s.objects[b]!.tapped, s.objects[l]!.tapped]).toEqual([true, true]);
  });

  it("Gleancrawler and No Rest for the Wicked: creature cards back to your hand", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, gleancrawler);
    const b = putOnBattlefield(s, ap, bear()), r = putOnBattlefield(s, ap, relic);
    for (const id of [b, r]) kill(s, id);
    s = resolveAll(passUntil(s, "cleanup", ap));
    expect([zone(s, b), zone(s, r)]).toEqual(["hand", "graveyard"]);

    let g = setup([]);
    const n = putOnBattlefield(g.s, g.ap, noRestForTheWicked);
    const b2 = putOnBattlefield(g.s, g.ap, bear());
    kill(g.s, b2);
    g.s = resolveAll(run(g.s, planActivate(g.s, g.ap, n, 0)));
    expect([zone(g.s, b2), zone(g.s, n)]).toEqual(["hand", "graveyard"]);
  });

  it("Twilight Shepherd: all cards put there from the battlefield this turn, lands too", () => {
    let { s, ap, ids } = setup([twilightShepherd]);
    const b = putOnBattlefield(s, ap, bear()), l = putOnBattlefield(s, ap, forest);
    for (const id of [b, l]) kill(s, id);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect([zone(s, b), zone(s, l)]).toEqual(["hand", "hand"]);
  });

  it("Gerrard, Weatherlight Hero: exiles itself, then returns artifacts and creatures", () => {
    let { s, ap } = setup([]);
    const g = putOnBattlefield(s, ap, gerrardWeatherlightHero);
    const b = putOnBattlefield(s, ap, bear()), r = putOnBattlefield(s, ap, relic), l = putOnBattlefield(s, ap, forest);
    for (const id of [b, r, l, g]) kill(s, id);
    s = resolveAll(s);
    expect(zone(s, g)).toBe("exile");
    expect([zone(s, b), zone(s, r), zone(s, l)]).toEqual(["battlefield", "battlefield", "graveyard"]);
  });

  it("Corrupted Crossroads: its colored mana only casts spells with devoid", () => {
    let { s, ap, ids } = bare([eldrazi, knight]);
    const c = putOnBattlefield(s, ap, corruptedCrossroads);
    expect(planCast(s, ap, ids[1]!)).toBeNull();
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(s.objects[c]!.tapped).toBe(true);
    expect(life(s, ap)).toBe(39);
  });

  it("Shadow, Mysterious Assassin: sacrifice another nonland permanent to draw two and drain its mana value", () => {
    let { s, ap, opp } = setup([]);
    const sh = putOnBattlefield(s, ap, shadowMysteriousAssassin);
    const giant = putOnBattlefield(s, ap, big);
    const hand = s.players[ap]!.hand.length;
    s = act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: sh, defender: opp }] });
    s = resolveAll(s);
    s = passUntil(s, "declareBlockers", ap);
    if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: opp, blocks: [] });
    s = resolveAll(passUntil(resolveAll(s), "combatDamage", ap));
    for (let i = 0; i < 10 && s.pending; i++) {
      const p = s.pending;
      if (p.kind === "pickPermanents") {
        expect(p.options).not.toContain(sh);
        s = act(s, { type: "pickPermanents", player: ap, ids: [giant] });
      } else if (p.kind === "chooseMay") s = may(s, true);
      else break;
      s = resolveAll(s);
    }
    expect(zone(s, giant)).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    for (const o of others(s, ap)) expect(life(s, o)).toBe(o === opp ? 40 - 3 - 5 : 35);
  });
  it("Callaphe, Beloved of the Sea: opponents' spells that target your creatures and enchantments cost {1} more", () => {
    const { s, ap, ids, opp } = setup([shock]);
    const b = putOnBattlefield(s, opp, bear());
    const e = putOnBattlefield(s, opp, aura);
    const r = putOnBattlefield(s, opp, relic);
    const c = putOnBattlefield(s, opp, callapheBelovedOfTheSea);
    const o = s.objects[ids[0]!]!;
    for (const [id, extra] of [[b, 1], [e, 1], [c, 1], [r, 0]] as const) expect(spellCost(s, ap, o, 0, [], { targets: [tgt(id)] }).extra).toBe(extra);
  });

  it("Erratic Portal: the creature is returned unless its controller pays {1}", () => {
    let { s, ap, opp } = setup([]);
    const portal = putOnBattlefield(s, ap, erraticPortal);
    const b = putOnBattlefield(s, opp, bear());
    s = run(s, planActivate(s, ap, portal, 0, [tgt(b)]));
    for (let i = 0; i < 20 && (s.stack.length || s.pending); i++) {
      if (s.pending?.kind === "payUnless") s = act(s, { type: "payUnless", player: opp, pay: false });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(zone(s, b)).toBe("hand");
  });

  it("Lord Jyscal Guado: investigate at each end step if you put a counter on a creature this turn", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, lordJyscalGuado);
    s = resolveAll(passUntil(s, "cleanup", ap));
    expect(named(s, ap, "Clue").length).toBe(0);
    s = resolveAll(passUntil(s, "main1", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!));
    expect(named(s, ap, "Clue").length).toBe(0);
    let g = setup([grow]);
    putOnBattlefield(g.s, g.ap, lordJyscalGuado);
    const b2 = putOnBattlefield(g.s, g.ap, bear());
    g.s = resolveAll(run(g.s, planCast(g.s, g.ap, g.ids[0]!, [tgt(b2)])));
    g.s = resolveAll(passUntil(g.s, "cleanup", g.ap));
    expect(named(g.s, g.ap, "Clue").length).toBe(1);
  });
});
