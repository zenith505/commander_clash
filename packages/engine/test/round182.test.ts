// Round 182: the most played cards still unsupported, in popularity order, from about rank 12,330 on, and the cards
// that share their templates.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { characteristics, controllerOf, invalidateCharacteristics, isFullySupported, objHasKeyword, parseManaCost, planActivate, planCast, planMana, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

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
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const counters = (s: GameState, id: string, c = "+1/+1") => s.objects[id]!.counters[c] ?? 0;
const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && [name, `${name} Token`].includes(characteristics(s, s.objects[id]!).name));
/** Attacks with `attackers`; `blocks` are declared by the defending player. */
const combat = (s: GameState, ap: PlayerId, opp: PlayerId, attackers: string[], blocks: { blocker: string; attacker: string }[] = []) => {
  s = act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: attackers.map((attacker) => ({ attacker, defender: opp })) });
  s = resolveAll(s);
  s = passUntil(s, "declareBlockers", ap);
  if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: opp, blocks });
  return resolveAll(s);
};
const option = (s: GameState, choice: string) => {
  if (s.pending?.kind !== "chooseOption") throw new Error(`no option question: ${s.pending?.kind}`);
  return act(s, { type: "chooseOption", player: s.pending.player, choice });
};
const types = (s: GameState, id: string) => characteristics(s, s.objects[id]!).types;
const shock = card("Test Shock", "Instant", "{R}", { cmc: 1, oracleText: "This spell deals 2 damage to any target." });
const bolt = card("Test Bolt", "Instant", "{R}", { cmc: 1, oracleText: "This spell deals 3 damage to any target." });
const heal = card("Test Heal", "Instant", "{W}", { cmc: 1, oracleText: "You gain 3 life." });
const human = card("Test Human", "Creature — Human Soldier", "{1}{W}", { cmc: 2, power: "2", toughness: "2" });
const rogue = card("Test Rogue", "Creature — Human Rogue", "{1}{B}", { cmc: 2, power: "2", toughness: "2" });
const robot = card("Test Robot", "Artifact Creature — Robot", "{2}", { cmc: 2, power: "1", toughness: "1" });
const redGreen = card("Test Hellion", "Creature — Hellion", "{R}{G}", { cmc: 2, power: "2", toughness: "2", colors: ["G", "R"] });
const goblin = card("Test Goblin", "Creature — Goblin", "{R}", { cmc: 1, power: "1", toughness: "1" });
const toxicGuy = card("Test Toxic", "Creature — Phyrexian", "{G}", { cmc: 1, power: "1", toughness: "1", keywords: ["Toxic"], oracleText: "Toxic 1" });
const cycler = card("Test Cycler", "Instant", "{W}", { cmc: 1, keywords: ["Cycling"], oracleText: "You gain 1 life.\nCycling {1}" });
const swampCard = card("Swamp", "Basic Land — Swamp");
const forestCard = card("Forest", "Basic Land — Forest");

// Real oracle text (Scryfall).
const stigmaLasher = card("Stigma Lasher", "Creature — Elemental Shaman", "{R}{R}", {cmc: 2,"power":"2","toughness":"2","keywords":["Wither"],"oracleText":"Wither (This deals damage to creatures in the form of -1/-1 counters.)\nWhenever this creature deals damage to a player, that player can't gain life for the rest of the game."});
const temporalCleansing = card("Temporal Cleansing", "Sorcery", "{3}{U}", {cmc: 4,"keywords":["Convoke"],"oracleText":"Convoke (Your creatures can help cast this spell. Each creature you tap while casting this spell pays for {1} or one mana of that creature's color.)\nThe owner of target nonland permanent puts it into their library second from the top or on the bottom."});
const teljiladStylus = card("Tel-Jilad Stylus", "Artifact", "{1}", {cmc: 1,"oracleText":"{T}: Put target permanent you own on the bottom of your library."});
const procrastinate = card("Procrastinate", "Sorcery", "{X}{U}", {cmc: 1,"oracleText":"Tap target creature. Put twice X stun counters on it. (If a permanent with a stun counter would become untapped, remove one from it instead.)"});
const bloodlineCulling = card("Bloodline Culling", "Instant", "{1}{B}{B}", {cmc: 3,"oracleText":"Choose one —\n• Target creature gets -5/-5 until end of turn.\n• Creature tokens get -2/-2 until end of turn."});
const fightToTheDeath = card("Fight to the Death", "Instant", "{R}{W}", {cmc: 2,"oracleText":"Destroy all blocking creatures and all blocked creatures.","colors":["R","W"]});
const flareOfFaith = card("Flare of Faith", "Instant", "{1}{W}", {cmc: 2,"oracleText":"Target creature gets +2/+2 until end of turn. If it's a Human, instead it gets +3/+3 and gains indestructible until end of turn."});
const eddymurkCrab = card("Eddymurk Crab", "Creature — Elemental Crab", "{5}{U}{U}", {cmc: 7,"power":"5","toughness":"5","keywords":["Flash"],"oracleText":"Flash\nThis spell costs {1} less to cast for each instant and sorcery card in your graveyard.\nThis creature enters tapped if it's not your turn.\nWhen this creature enters, tap up to two target creatures."});
const reclaimTheWastes = card("Reclaim the Wastes", "Sorcery", "{G}", {cmc: 1,"keywords":["Kicker"],"oracleText":"Kicker {3} (You may pay an additional {3} as you cast this spell.)\nSearch your library for a basic land card, reveal it, put it into your hand, then shuffle. If this spell was kicked, search your library for two basic land cards instead of one."});
const caravanVigil = card("Caravan Vigil", "Sorcery", "{G}", {cmc: 1,"keywords":["Morbid"],"oracleText":"Search your library for a basic land card, reveal it, put it into your hand, then shuffle.\nMorbid — You may put that card onto the battlefield instead of putting it into your hand if a creature died this turn."});
const poreOverThePages = card("Pore Over the Pages", "Sorcery", "{3}{U}{U}", {cmc: 5,"oracleText":"Draw three cards, untap up to two lands, then discard a card."});
const momentOfTruth = card("Moment of Truth", "Instant", "{1}{U}", {cmc: 2,"oracleText":"Look at the top three cards of your library. Put one of those cards into your hand, one into your graveyard, and one on the bottom of your library."});
const basandraBattleSeraph = card("Basandra, Battle Seraph", "Legendary Creature — Angel", "{3}{R}{W}", {cmc: 5,"power":"4","toughness":"4","keywords":["Flying"],"oracleText":"Flying\nPlayers can't cast spells during combat.\n{R}: Target creature attacks this turn if able.","colors":["R","W"]});
const gnollWarBand = card("Gnoll War Band", "Creature — Gnoll", "{5}{R}", {cmc: 6,"power":"5","toughness":"5","keywords":["Menace","Myriad"],"oracleText":"This spell costs {1} less to cast for each opponent who was dealt damage this turn.\nMenace\nMyriad (Whenever this creature attacks, for each opponent other than defending player, you may create a token copy that's tapped and attacking that player or a planeswalker they control. Exile the tokens at end of combat.)"});
const youveBeenCaughtStealing = card("You've Been Caught Stealing", "Sorcery", "{1}{R}", {cmc: 2,"keywords":["Bribe the Guards","Treasure","Threaten the Merchant"],"oracleText":"Choose one —\n• Threaten the Merchant — Each creature blocks this turn if able.\n• Bribe the Guards — You create a Treasure token for each opponent who was dealt damage this turn. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")"});
const broodBirthing = card("Brood Birthing", "Sorcery", "{1}{R}", {cmc: 2,"oracleText":"If you control an Eldrazi Spawn, create three 0/1 colorless Eldrazi Spawn creature tokens. They have \"Sacrifice this token: Add {C}.\" Otherwise, create one of those tokens."});
const tritonWavebreaker = card("Triton Wavebreaker", "Enchantment Creature — Merfolk Wizard", "{U}", {cmc: 1,"power":"1","toughness":"1","keywords":["Bestow"],"oracleText":"Bestow {1}{U} (If you cast this card for its bestow cost, it's an Aura spell with enchant creature. It becomes a creature again if it's not attached.)\nAs long as this permanent is a creature, it has prowess. (Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn.)\nEnchanted creature gets +1/+1 and has prowess."});
const ulashtTheHateSeed = card("Ulasht, the Hate Seed", "Legendary Creature — Hellion Hydra", "{2}{R}{G}", {cmc: 4,"power":"0","toughness":"0","oracleText":"Ulasht enters with a +1/+1 counter on it for each other red creature you control and a +1/+1 counter on it for each other green creature you control.\n{1}, Remove a +1/+1 counter from Ulasht: Choose one —\n• Ulasht deals 1 damage to target creature.\n• Create a 1/1 green Saproling creature token.","colors":["G","R"]});
const phyrexianHydra = card("Phyrexian Hydra", "Creature — Phyrexian Hydra", "{3}{G}{G}", {cmc: 5,"power":"7","toughness":"7","keywords":["Infect"],"oracleText":"Infect (This creature deals damage to creatures in the form of -1/-1 counters and to players in the form of poison counters.)\nIf damage would be dealt to this creature, prevent that damage. Put a -1/-1 counter on this creature for each 1 damage prevented this way."});
const mortuary = card("Mortuary", "Enchantment", "{3}{B}", {cmc: 4,"oracleText":"Whenever a creature is put into your graveyard from the battlefield, put that card on top of your library."});
const theFinalDays = card("The Final Days", "Sorcery", "{2}{B}{B}", {cmc: 4,"keywords":["Flashback"],"oracleText":"Create two tapped 2/2 black Horror creature tokens. If this spell was cast from a graveyard, instead create X of those tokens, where X is the number of creature cards in your graveyard.\nFlashback {4}{B}{B} (You may cast this card from your graveyard for its flashback cost. Then exile it.)"});
const jetsBrainwashing = card("Jet's Brainwashing", "Sorcery", "{R}", {cmc: 1,"keywords":["Kicker"],"oracleText":"Kicker {3} (You may pay an additional {3} as you cast this spell.)\nTarget creature can't block this turn. If this spell was kicked, gain control of that creature until end of turn, untap it, and it gains haste until end of turn.\nCreate a Clue token. (It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")"});
const cybermat = card("Cybermat", "Artifact Creature — Robot", "{2}", {cmc: 2,"power":"2","toughness":"1","keywords":["Skulk"],"oracleText":"Skulk (This creature can't be blocked by creatures with greater power.)\nWhenever this creature attacks and isn't blocked, it gets +X/+0 until end of turn, where X is the number of attacking artifact creatures."});
const stinkdrinkerBandit = card("Stinkdrinker Bandit", "Creature — Goblin Rogue", "{3}{B}", {cmc: 4,"power":"2","toughness":"1","keywords":["Prowl"],"oracleText":"Prowl {1}{B} (You may cast this for its prowl cost if you dealt combat damage to a player this turn with a Goblin or Rogue.)\nWhenever a Rogue you control attacks and isn't blocked, it gets +2/+1 until end of turn."});
const guardianOfTheGateless = card("Guardian of the Gateless", "Creature — Angel", "{4}{W}", {cmc: 5,"power":"3","toughness":"3","keywords":["Flying"],"oracleText":"Flying\nThis creature can block any number of creatures.\nWhenever this creature blocks, it gets +1/+1 until end of turn for each creature it's blocking."});
const noWitnesses = card("No Witnesses", "Sorcery", "{2}{W}{W}", {cmc: 4,"keywords":["Investigate"],"oracleText":"Each player who controls the most creatures investigates. Then destroy all creatures. (To investigate, create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")"});
const skullStorm = card("Skull Storm", "Sorcery", "{7}{B}{B}", {cmc: 9,"oracleText":"When you cast this spell, copy it for each time you've cast your commander from the command zone this game.\nEach opponent sacrifices a creature of their choice. Each opponent who can't loses half their life, rounded up."});
const mwonvuliBeastTracker = card("Mwonvuli Beast Tracker", "Creature — Human Scout", "{1}{G}{G}", {cmc: 3,"power":"2","toughness":"1","keywords":["Reach","Hexproof"],"oracleText":"When this creature enters, search your library for a creature card with deathtouch, hexproof, reach, or trample and reveal it. Shuffle and put that card on top."});
const naturesRevolt = card("Nature's Revolt", "Enchantment", "{3}{G}{G}", {cmc: 5,"oracleText":"All lands are 2/2 creatures that are still lands."});
const livingLands = card("Living Lands", "Enchantment", "{3}{G}", {cmc: 4,"oracleText":"All Forests are 1/1 creatures that are still lands."});
const painMagnification = card("Pain Magnification", "Enchantment", "{1}{B}{R}", {cmc: 3,"oracleText":"Whenever an opponent is dealt 3 or more damage by a single source, that player discards a card.","colors":["B","R"]});
const slaughterSinger = card("Slaughter Singer", "Creature — Phyrexian Cleric", "{G}{W}", {cmc: 2,"power":"2","toughness":"2","keywords":["Toxic"],"oracleText":"Toxic 2 (Players dealt combat damage by this creature also get two poison counters.)\nWhenever another creature you control with toxic attacks, it gets +1/+1 until end of turn.","colors":["G","W"]});
const angelicGuardian = card("Angelic Guardian", "Creature — Angel", "{4}{W}{W}", {cmc: 6,"power":"5","toughness":"5","keywords":["Flying"],"oracleText":"Flying (This creature can't be blocked except by creatures with flying or reach.)\nWhenever one or more creatures you control attack, they gain indestructible until end of turn. (Damage and effects that say \"destroy\" don't destroy them.)"});
const valiantRescuer = card("Valiant Rescuer", "Creature — Human Soldier", "{1}{W}", {cmc: 2,"power":"3","toughness":"1","keywords":["Cycling"],"oracleText":"Whenever you cycle another card for the first time each turn, create a 1/1 white Human Soldier creature token.\nCycling {2} ({2}, Discard this card: Draw a card.)"});
const simianSling = card("Simian Sling", "Artifact Creature — Equipment Monkey", "{R}", {cmc: 1,"power":"1","toughness":"1","keywords":["Reconfigure"],"oracleText":"Equipped creature gets +1/+1.\nWhenever this creature or equipped creature becomes blocked, it deals 1 damage to defending player.\nReconfigure {2} ({2}: Attach to target creature you control; or unattach from a creature. Reconfigure only as a sorcery. While attached, this isn't a creature.)"});
const chronatogTotem = card("Chronatog Totem", "Artifact", "{3}", {cmc: 3,"oracleText":"{T}: Add {U}.\n{1}{U}: This artifact becomes a 1/2 blue Atog artifact creature until end of turn.\n{0}: This creature gets +3/+3 until end of turn. You skip your next turn. Activate only once each turn and only if this permanent is a creature."});
const deemInferior = card("Deem Inferior", "Sorcery", "{3}{U}", {cmc: 4,"oracleText":"This spell costs {1} less to cast for each card you've drawn this turn.\nThe owner of target nonland permanent puts it into their library second from the top or on the bottom."});
const disharmony = card("Disharmony", "Instant", "{2}{R}", {cmc: 3,"oracleText":"Cast this spell only during combat before blockers are declared.\nUntap target attacking creature and remove it from combat. Gain control of that creature until end of turn."});
const flywheelRacer = card("Flywheel Racer", "Artifact — Vehicle", "{2}", {cmc: 2,"power":"3","toughness":"2","keywords":["Vigilance","Crew"],"oracleText":"Vigilance\n{T}: Add one mana of any color. Activate only if this permanent is a creature.\nCrew 1 (Tap any number of creatures you control with total power 1 or more: This Vehicle becomes an artifact creature until end of turn.)"});
const foriysianTotem = card("Foriysian Totem", "Artifact", "{3}", {cmc: 3,"oracleText":"{T}: Add {R}.\n{4}{R}: This artifact becomes a 4/4 red Giant artifact creature with trample until end of turn.\nAs long as this artifact is a creature, it can block an additional creature each combat."});
const furiousSpinesplitter = card("Furious Spinesplitter", "Creature — Ogre Warrior", "{2}{R/G}{R/G}", {cmc: 4,"power":"3","toughness":"3","keywords":["Trample"],"oracleText":"Trample\nAt the beginning of your end step, put a +1/+1 counter on this creature for each opponent who was dealt damage this turn.","colors":["G","R"]});
const happyHoganBodyguard = card("Happy Hogan, Bodyguard", "Legendary Creature — Human Advisor", "{5}{U}", {cmc: 6,"power":"3","toughness":"3","keywords":["Vigilance"],"oracleText":"Vigilance\nWhen Happy Hogan enters, the owner of target creature an opponent controls puts it into their library second from the top or on the bottom."});
const livingPlane = card("Living Plane", "World Enchantment", "{2}{G}{G}", {cmc: 4,"oracleText":"All lands are 1/1 creatures that are still lands."});
const lostDays = card("Lost Days", "Instant — Lesson", "{4}{U}", {cmc: 5,"oracleText":"The owner of target creature or enchantment puts it into their library second from the top or on the bottom. You create a Clue token. (It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")"});
const trickstersStratagem = card("Trickster's Stratagem", "Sorcery", "{3}{U}", {cmc: 4,"keywords":["Connive"],"oracleText":"The owner of target creature an opponent controls puts it into their library second from the top or on the bottom. Then up to one target creature you control connives. (Draw a card, then discard a card. If you discarded a nonland card, put a +1/+1 counter on that creature.)"});
const kormusBell = card("Kormus Bell", "Artifact", "{4}", {cmc: 4,"oracleText":"All Swamps are 1/1 black creatures that are still lands."});
const ambushCommander = card("Ambush Commander", "Creature — Elf", "{3}{G}{G}", {cmc: 5,"power":"2","toughness":"2","oracleText":"Forests you control are 1/1 green Elf creatures that are still lands.\n{1}{G}, Sacrifice an Elf: Target creature gets +3/+3 until end of turn."});
const invincibleHymn = card("Invincible Hymn", "Sorcery", "{6}{W}{W}", {cmc: 8,"oracleText":"Count the number of cards in your library. Your life total becomes that number."});
const seeBeyond = card("See Beyond", "Sorcery", "{1}{U}", {cmc: 2,"oracleText":"Draw two cards, then shuffle a card from your hand into your library."});

describe("round 182", () => {
  it("all compile", () => supported(stigmaLasher, temporalCleansing, teljiladStylus, procrastinate, bloodlineCulling, fightToTheDeath, flareOfFaith, eddymurkCrab, reclaimTheWastes, caravanVigil, poreOverThePages, momentOfTruth, basandraBattleSeraph, gnollWarBand, youveBeenCaughtStealing, broodBirthing, tritonWavebreaker, ulashtTheHateSeed, phyrexianHydra, mortuary, theFinalDays, jetsBrainwashing, cybermat, stinkdrinkerBandit, guardianOfTheGateless, noWitnesses, skullStorm, mwonvuliBeastTracker, naturesRevolt, livingLands, painMagnification, slaughterSinger, angelicGuardian, valiantRescuer, simianSling, chronatogTotem, deemInferior, disharmony, flywheelRacer, foriysianTotem, furiousSpinesplitter, happyHoganBodyguard, livingPlane, lostDays, trickstersStratagem, kormusBell, ambushCommander, invincibleHymn, seeBeyond));

  it("Temporal Cleansing: the owner puts it second from the top or on the bottom", () => {
    const { s: s0, ap, ids, opp } = setup([temporalCleansing, temporalCleansing]);
    const b = putOnBattlefield(s0, opp, bear());
    const c = putOnBattlefield(s0, opp, bear());
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])));
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: opp, what: "topOrBottom", options: ["second", "bottom"] });
    const top = s.players[opp]!.library[0];
    s = resolveAll(option(s, "second"));
    expect(s.players[opp]!.library[0]).toBe(top);
    expect(s.players[opp]!.library[1]).toBe(b);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(c)])));
    s = resolveAll(option(s, "bottom"));
    const lib = s.players[opp]!.library;
    expect(lib[lib.length - 1]).toBe(c);
  });

  it("Lost Days: second from the top or the bottom, and a Clue for the caster", () => {
    const { s: s0, ap, ids, opp } = setup([lostDays]);
    const b = putOnBattlefield(s0, opp, bear());
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])));
    s = resolveAll(option(s, "bottom"));
    expect(zone(s, b)).toBe("library");
    expect(named(s, ap, "Clue")).toHaveLength(1);
  });

  it("See Beyond: draw two, then shuffle a card from your hand into your library", () => {
    const { s: s0, ap, ids } = setup([seeBeyond, heal]);
    const lib = s0.players[ap]!.library.length;
    const hand = s0.players[ap]!.hand.length;
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "handToTop", player: ap, count: 1, shuffle: true });
    s = resolveAll(act(s, { type: "handToTop", player: ap, objectIds: [ids[1]!] }));
    expect(zone(s, ids[1]!)).toBe("library");
    expect(s.players[ap]!.hand).toHaveLength(hand - 1 + 2 - 1);
    expect(s.players[ap]!.library.length).toBe(lib - 1);
  });

  it("Invincible Hymn: your life total becomes the number of cards in your library", () => {
    const { s: s0, ap, ids } = setup([invincibleHymn]);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.players[ap]!.life).toBe(s.players[ap]!.library.length);
  });

  it("Kormus Bell, Ambush Commander, Nature's Revolt, Living Lands: lands become creatures that are still lands", () => {
    const { s: s0, ap, opp } = setup([]);
    const mySwamp = putOnBattlefield(s0, ap, swampCard);
    const theirSwamp = putOnBattlefield(s0, opp, swampCard);
    const myForest = putOnBattlefield(s0, ap, forestCard);
    const theirForest = putOnBattlefield(s0, opp, forestCard);
    putOnBattlefield(s0, ap, kormusBell);
    invalidateCharacteristics(s0);
    for (const id of [mySwamp, theirSwamp]) {
      expect(types(s0, id)).toEqual(expect.arrayContaining(["Land", "Creature"]));
      expect(characteristics(s0, s0.objects[id]!).colors).toEqual(["B"]);
      expect(pt(s0, id)).toBe("1/1");
    }
    expect(types(s0, myForest)).not.toContain("Creature");
    putOnBattlefield(s0, ap, ambushCommander);
    invalidateCharacteristics(s0);
    expect(types(s0, myForest)).toContain("Creature");
    expect(characteristics(s0, s0.objects[myForest]!).subtypes).toEqual(expect.arrayContaining(["Forest", "Elf"]));
    expect(characteristics(s0, s0.objects[myForest]!).colors).toEqual(["G"]);
    expect(types(s0, theirForest)).not.toContain("Creature");
    putOnBattlefield(s0, ap, livingLands);
    invalidateCharacteristics(s0);
    expect(types(s0, theirForest)).toContain("Creature");
    expect(pt(s0, theirForest)).toBe("1/1");
    putOnBattlefield(s0, ap, naturesRevolt);
    invalidateCharacteristics(s0);
    // The later timestamp wins in layer 7b (CR 613.7).
    expect(pt(s0, theirForest)).toBe("2/2");
    expect(pt(s0, mySwamp)).toBe("2/2");
  });

  it("Phyrexian Hydra: damage is prevented and becomes -1/-1 counters", () => {
    const { s: s0, ap, ids } = setup([shock]);
    const h = putOnBattlefield(s0, ap, phyrexianHydra);
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(h)])));
    expect(s.objects[h]!.damage).toBe(0);
    expect(counters(s, h, "-1/-1")).toBe(2);
    expect(pt(s, h)).toBe("5/5");
  });

  it("Pain Magnification: an opponent dealt 3 or more by one source discards a card", () => {
    const { s: s0, ap, ids, opp } = setup([shock, bolt]);
    putOnBattlefield(s0, ap, painMagnification);
    const hand = s0.players[opp]!.hand.length;
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.hand.length).toBe(hand);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }])));
    if (s.pending?.kind === "discard") s = resolveAll(act(s, { type: "discard", player: opp, objectIds: s.players[opp]!.hand.slice(0, 1) }));
    expect(s.players[opp]!.hand.length).toBe(hand - 1);
  });

  it("Gnoll War Band, You've Been Caught Stealing: opponents dealt damage this turn", () => {
    const { s: s0, ap, ids, opp } = setup([shock, shock, gnollWarBand, youveBeenCaughtStealing]);
    const third = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: third }])));
    // Damage to yourself doesn't count.
    s.damagedThisTurn = [...(s.damagedThisTurn ?? []), ap];
    expect(planCast(s, ap, ids[2]!)!.filter((a) => a.type === "activateMana").length).toBe(4);
    s = resolveAll(run(s, planCast(s, ap, ids[3]!, undefined, [1])));
    expect(named(s, ap, "Treasure")).toHaveLength(2);
  });

  it("No Witnesses: each player with the most creatures investigates, then all creatures are destroyed", () => {
    const { s: s0, ap, ids, opp } = setup([noWitnesses]);
    const third = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    const mine = putOnBattlefield(s0, ap, bear());
    putOnBattlefield(s0, opp, bear());
    putOnBattlefield(s0, opp, bear());
    putOnBattlefield(s0, third, bear());
    putOnBattlefield(s0, third, bear());
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(named(s, opp, "Clue")).toHaveLength(1);
    expect(named(s, third, "Clue")).toHaveLength(1);
    expect(named(s, ap, "Clue")).toHaveLength(0);
    expect(zone(s, mine)).toBe("graveyard");
    expect(s.battlefield.filter((id) => types(s, id).includes("Creature"))).toHaveLength(0);
  });

  it("Skull Storm: each opponent sacrifices a creature; one who can't loses half their life, rounded up", () => {
    const { s: s0, ap, ids, opp } = setup([skullStorm]);
    const b = putOnBattlefield(s0, opp, bear());
    const others = s0.turnOrder.filter((p) => p !== ap && p !== opp);
    s0.players[others[0]!]!.life = 31;
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    for (let i = 0; i < 5 && s.pending; i++) {
      if (s.pending.kind === "pickPermanents") s = resolveAll(act(s, { type: "pickPermanents", player: s.pending.player, ids: s.pending.options.slice(0, s.pending.count) }));
      else break;
    }
    expect(zone(s, b)).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(40);
    expect(s.players[others[0]!]!.life).toBe(15);
    expect(s.players[others[1]!]!.life).toBe(20);
    expect(s.players[ap]!.life).toBe(40);
  });

  it("Basandra: no player can cast spells during combat", () => {
    const { s: s0, ap, ids, opp } = setup([shock]);
    putOnBattlefield(s0, opp, basandraBattleSeraph);
    const a = putOnBattlefield(s0, ap, bear());
    expect(planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])).not.toBeNull();
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] });
    s = resolveAll(s);
    expect(s.step).toBe("declareAttackers");
    expect(planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }])).toBeNull();
  });

  it("Stinkdrinker Bandit: a Rogue you control that attacks and isn't blocked gets +2/+1", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, stinkdrinkerBandit);
    const r = putOnBattlefield(s0, ap, rogue);
    const b = putOnBattlefield(s0, ap, bear());
    const blocker = putOnBattlefield(s0, opp, bear({ toughness: "9" }));
    const r2 = putOnBattlefield(s0, ap, rogue);
    const s = combat(s0, ap, opp, [r, b, r2], [{ blocker, attacker: r2 }]);
    expect(pt(s, r)).toBe("4/3");
    expect(pt(s, b)).toBe("2/2");
    expect(pt(s, r2)).toBe("2/2");
  });

  it("Guardian of the Gateless: blocks any number and gets +1/+1 for each creature it's blocking", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, opp, guardianOfTheGateless);
    const a1 = putOnBattlefield(s0, ap, goblin);
    const a2 = putOnBattlefield(s0, ap, goblin);
    const a3 = putOnBattlefield(s0, ap, goblin);
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [a1, a2, a3].map((attacker) => ({ attacker, defender: opp })) });
    s = passUntil(resolveAll(s), "declareBlockers", ap);
    s = resolveAll(act(s, { type: "declareBlockers", player: opp, blocks: [a1, a2, a3].map((attacker) => ({ blocker: g, attacker })) }));
    expect(pt(s, g)).toBe("6/6");
  });

  it("Angelic Guardian: attacking creatures gain indestructible; Slaughter Singer pumps another toxic attacker", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, angelicGuardian);
    putOnBattlefield(s0, ap, slaughterSinger);
    const t = putOnBattlefield(s0, ap, toxicGuy);
    const b = putOnBattlefield(s0, ap, bear());
    const s = combat(s0, ap, opp, [t, b]);
    expect(objHasKeyword(s, s.objects[t]!, "Indestructible")).toBe(true);
    expect(objHasKeyword(s, s.objects[b]!, "Indestructible")).toBe(true);
    expect(pt(s, t)).toBe("2/2");
    expect(pt(s, b)).toBe("2/2");
  });

  it("Simian Sling: it or the equipped creature becoming blocked deals 1 damage to the defending player", () => {
    const { s: s0, ap, opp } = setup([]);
    const m = putOnBattlefield(s0, ap, simianSling);
    const blocker = putOnBattlefield(s0, opp, bear({ toughness: "9" }));
    const s = combat(s0, ap, opp, [m], [{ blocker, attacker: m }]);
    expect(s.players[opp]!.life).toBe(39);

    const { s: t0, ap: bp, opp: bo } = setup([]);
    const sling = putOnBattlefield(t0, bp, simianSling);
    const b = putOnBattlefield(t0, bp, bear());
    const wall = putOnBattlefield(t0, bo, bear({ toughness: "9" }));
    t0.objects[sling]!.attachedTo = b;
    invalidateCharacteristics(t0);
    expect(pt(t0, b)).toBe("3/3");
    const t = combat(t0, bp, bo, [b], [{ blocker: wall, attacker: b }]);
    expect(t.players[bo]!.life).toBe(39);
  });

  it("Valiant Rescuer: only the first other card you cycle each turn makes a Soldier", () => {
    const { s: s0, ap, ids } = setup([cycler, cycler]);
    putOnBattlefield(s0, ap, valiantRescuer);
    let s = resolveAll(run(s0, planActivate(s0, ap, ids[0]!, 0)));
    expect(named(s, ap, "Human Soldier")).toHaveLength(1);
    s = resolveAll(run(s, planActivate(s, ap, ids[1]!, 0)));
    expect(named(s, ap, "Human Soldier")).toHaveLength(1);
  });

  it("Mortuary: a creature put into your graveyard from the battlefield goes on top of your library", () => {
    const { s: s0, ap, ids } = setup([shock]);
    putOnBattlefield(s0, ap, mortuary);
    const b = putOnBattlefield(s0, ap, bear());
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])));
    expect(zone(s, b)).toBe("library");
    expect(s.players[ap]!.library[0]).toBe(b);
  });

  it("The Final Days: two tapped Horrors, or X of them when cast from a graveyard", () => {
    const { s: s0, ap, ids } = setup([theFinalDays]);
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    const horrors = named(s, ap, "Horror");
    expect(horrors).toHaveLength(2);
    expect(horrors.every((id) => s.objects[id]!.tapped)).toBe(true);

    const { s: t0, ap: bp } = setup([]);
    for (let i = 0; i < 2; i++) putOnBattlefield(t0, bp, swampCard);
    const fd = into(t0, bp, theFinalDays, "graveyard");
    for (let i = 0; i < 3; i++) into(t0, bp, bear(), "graveyard");
    const t = resolveAll(run(t0, planCast(t0, bp, fd, undefined, undefined, undefined, undefined, { via: "flashback" })));
    expect(named(t, bp, "Horror")).toHaveLength(3);
    expect(zone(t, fd)).toBe("exile");
  });

  it("Jet's Brainwashing: can't block; kicked, gain control, untap it, haste", () => {
    const { s: s0, ap, ids, opp } = setup([jetsBrainwashing]);
    const b = putOnBattlefield(s0, opp, bear());
    s0.objects[b]!.tapped = true;
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)], undefined, "auto", undefined, { kicks: [0] })));
    expect(controllerOf(s, s.objects[b]!)).toBe(ap);
    expect(s.objects[b]!.tapped).toBe(false);
    expect(objHasKeyword(s, s.objects[b]!, "Haste")).toBe(true);
  });

  it("Fight to the Death: destroys blocking and blocked creatures only", () => {
    const { s: s0, ap, ids, opp } = setup([fightToTheDeath]);
    const a1 = putOnBattlefield(s0, ap, bear({ toughness: "9" }));
    const a2 = putOnBattlefield(s0, ap, bear());
    const blocker = putOnBattlefield(s0, opp, bear({ toughness: "9" }));
    const idle = putOnBattlefield(s0, opp, bear());
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [a1, a2].map((attacker) => ({ attacker, defender: opp })) });
    s = passUntil(resolveAll(s), "declareBlockers", ap);
    s = resolveAll(act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker, attacker: a1 }] }));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect([zone(s, a1), zone(s, blocker), zone(s, a2), zone(s, idle)]).toEqual(["graveyard", "graveyard", "battlefield", "battlefield"]);
  });

  it("Flare of Faith: +2/+2, or +3/+3 and indestructible for a Human", () => {
    const { s: s0, ap, ids } = setup([flareOfFaith, flareOfFaith]);
    const h = putOnBattlefield(s0, ap, human);
    const b = putOnBattlefield(s0, ap, bear());
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(h)])));
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(b)])));
    expect(pt(s, h)).toBe("5/5");
    expect(objHasKeyword(s, s.objects[h]!, "Indestructible")).toBe(true);
    expect(pt(s, b)).toBe("4/4");
    expect(objHasKeyword(s, s.objects[b]!, "Indestructible")).toBe(false);
  });

  it("Procrastinate: taps it and puts twice X stun counters on it", () => {
    const { s: s0, ap, ids, opp } = setup([procrastinate]);
    const b = putOnBattlefield(s0, opp, bear());
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)], undefined, undefined, 3)));
    expect(s.objects[b]!.tapped).toBe(true);
    expect(counters(s, b, "stun")).toBe(6);
  });

  it("Bloodline Culling: creature tokens get -2/-2", () => {
    const { s: s0, ap, ids, opp } = setup([bloodlineCulling]);
    const tok = putOnBattlefield(s0, opp, bear());
    s0.objects[tok]!.isToken = true;
    const b = putOnBattlefield(s0, opp, bear());
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, undefined, [1])));
    expect(s.objects[tok]).toBeUndefined();
    expect(pt(s, b)).toBe("2/2");
  });

  it("Ulasht: a counter for each other red creature and one for each other green creature", () => {
    const { s: s0, ap, ids } = setup([ulashtTheHateSeed]);
    putOnBattlefield(s0, ap, redGreen);
    putOnBattlefield(s0, ap, goblin);
    putOnBattlefield(s0, ap, bear());
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(counters(s, ids[0]!)).toBe(4);
  });

  it("Cybermat: unblocked, +X/+0 for each attacking artifact creature", () => {
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, ap, cybermat);
    const r = putOnBattlefield(s0, ap, robot);
    const b = putOnBattlefield(s0, ap, bear());
    const s = combat(s0, ap, opp, [c, r, b]);
    expect(pt(s, c)).toBe("4/1");
  });

  it("Triton Wavebreaker: prowess while it's a creature", () => {
    const { s: s0, ap, ids, opp } = setup([shock]);
    const t = putOnBattlefield(s0, ap, tritonWavebreaker);
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(pt(s, t)).toBe("2/2");
  });

  it("Chronatog Totem: the {0} ability only while it's a creature", () => {
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, chronatogTotem);
    expect(planActivate(s0, ap, t, 1)).toBeNull();
    let s = resolveAll(run(s0, planActivate(s0, ap, t, 0)));
    expect(types(s, t)).toContain("Creature");
    s = resolveAll(run(s, planActivate(s, ap, t, 1)));
    expect(pt(s, t)).toBe("4/5");
  });

  it("Eddymurk Crab enters tapped on another player's turn only", () => {
    const none = (s: GameState) => (s.pending?.kind === "chooseTargets" ? resolveAll(act(s, { type: "chooseTargets", player: s.pending.player, targets: [{ kind: "none" }, { kind: "none" }] })) : s);
    const { s: s0, ap, ids } = setup([eddymurkCrab]);
    const s = none(resolveAll(run(s0, planCast(s0, ap, ids[0]!))));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(s.objects[ids[0]!]!.tapped).toBe(false);

    const { s: t0, ap: bp, ids: hand } = setup([eddymurkCrab]);
    let t = passUntil(t0, "upkeep", t0.turnOrder[(t0.turnOrder.indexOf(bp) + 1) % 4]!);
    for (let i = 0; i < 4 && waitingOn(t) !== bp; i++) t = act(t, { type: "passPriority", player: waitingOn(t)! });
    t = none(resolveAll(run(t, planCast(t, bp, hand[0]!))));
    expect(zone(t, hand[0]!)).toBe("battlefield");
    expect(t.objects[hand[0]!]!.tapped).toBe(true);
  });

  it("Reclaim the Wastes: one basic land, or two when kicked", () => {
    const { s: s0, ap, ids } = setup([reclaimTheWastes]);
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { kicks: [0] }));
    s = resolveAll(s);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    const p = s.pending as { cards: string[] };
    const found = p.cards.slice(0, 2);
    const hand = s.players[ap]!.hand.length;
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found }));
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(found.every((id) => zone(s, id) === "hand")).toBe(true);
  });

  it("Caravan Vigil: the land may go onto the battlefield instead if a creature died this turn", () => {
    const { s: s0, ap, ids } = setup([caravanVigil, shock, caravanVigil]);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    let found = (s.pending as { cards: string[] }).cards[0]!;
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [found] }));
    expect(zone(s, found)).toBe("hand");
    const b = putOnBattlefield(s, ap, bear());
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(b)])));
    s = resolveAll(run(s, planCast(s, ap, ids[2]!)));
    found = (s.pending as { cards: string[] }).cards[0]!;
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [found] }));
    expect(zone(s, found)).toBe("battlefield");
  });

  it("Pore Over the Pages: draw three, untap up to two lands, then discard a card", () => {
    const { s: s0, ap, ids } = setup([poreOverThePages]);
    const hand = s0.players[ap]!.hand.length;
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "untap" });
    const tapped = (s.pending as { options: string[] }).options.slice(0, 2);
    s = resolveAll(act(s, { type: "pickPermanents", player: ap, ids: tapped }));
    expect(tapped.every((id) => !s.objects[id]!.tapped)).toBe(true);
    expect(s.pending).toMatchObject({ kind: "discard", player: ap });
    s = resolveAll(act(s, { type: "discard", player: ap, objectIds: s.players[ap]!.hand.slice(0, 1) }));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 3 - 1);
  });

  it("Moment of Truth: one of the top three into your hand, one into your graveyard, one on the bottom", () => {
    const { s: s0, ap, ids } = setup([momentOfTruth]);
    const top = s0.players[ap]!.library.slice(0, 3);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    for (let i = 0; i < 4 && s.pending?.kind === "searchLibrary"; i++) s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: s.pending.cards.slice(0, 1) }));
    const zones = top.map((id) => zone(s, id));
    expect(zones.filter((z) => z === "hand")).toHaveLength(1);
    expect(zones.filter((z) => z === "graveyard")).toHaveLength(1);
    const lib = s.players[ap]!.library;
    expect(top.includes(lib[lib.length - 1]!)).toBe(true);
  });

  it("Brood Birthing: three Spawn with a Spawn already, otherwise one", () => {
    const { s: s0, ap, ids } = setup([broodBirthing, broodBirthing]);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(named(s, ap, "Eldrazi Spawn")).toHaveLength(1);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(named(s, ap, "Eldrazi Spawn")).toHaveLength(4);
  });

  it("Mwonvuli Beast Tracker: a creature card with one of the keywords goes on top after the shuffle", () => {
    const { s: s0, ap, ids } = setup([mwonvuliBeastTracker]);
    const reacher = into(s0, ap, card("Test Reacher", "Creature — Spider", "{1}{G}", { cmc: 2, power: "1", toughness: "3", keywords: ["Reach"], oracleText: "Reach" }), "library");
    s0.players[ap]!.library.push(s0.players[ap]!.library.shift()!);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, cards: [reacher] });
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [reacher] }));
    expect(s.players[ap]!.library[0]).toBe(reacher);
  });

  it("Tel-Jilad Stylus: puts a permanent you own on the bottom of your library", () => {
    const { s: s0, ap } = setup([]);
    const st = putOnBattlefield(s0, ap, teljiladStylus);
    const b = putOnBattlefield(s0, ap, bear());
    const s = resolveAll(run(s0, planActivate(s0, ap, st, 0, [tgt(b)])));
    const lib = s.players[ap]!.library;
    expect(lib[lib.length - 1]).toBe(b);
  });

  it("Stigma Lasher: a player it deals damage to can't gain life for the rest of the game", () => {
    const { s: s0, ap, opp } = setup([]);
    const l = putOnBattlefield(s0, ap, stigmaLasher);
    let s = combat(s0, ap, opp, [l]);
    s = passUntil(s, "end", ap);
    expect(s.players[opp]!.life).toBe(38);
    const before = s.players[opp]!.life;
    const h = into(s, opp, heal, "hand");
    putOnBattlefield(s, opp, card("Plains", "Basic Land — Plains"));
    s = passUntil(s, "main1", opp);
    s = resolveAll(run(s, planCast(s, opp, h)));
    expect(s.players[opp]!.life).toBe(before);
  });

  it("Disharmony: untaps an attacker, removes it from combat, and you gain control of it", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, bear());
    const d = into(s0, opp, disharmony, "hand");
    for (const l of [card("Mountain", "Basic Land — Mountain"), card("Mountain", "Basic Land — Mountain"), card("Mountain", "Basic Land — Mountain")]) putOnBattlefield(s0, opp, l);
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] });
    for (let i = 0; i < 4 && waitingOn(s) !== opp; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = resolveAll(run(s, planCast(s, opp, d, [tgt(a)])));
    expect(controllerOf(s, s.objects[a]!)).toBe(opp);
    expect(s.objects[a]!.tapped).toBe(false);
    expect(s.objects[a]!.attacking).toBeUndefined();
  });

  it("Foriysian Totem: blocks an additional creature while it's a creature", () => {
    const { s: s0, ap, opp } = setup([]);
    const t = putOnBattlefield(s0, opp, foriysianTotem);
    for (let i = 0; i < 5; i++) putOnBattlefield(s0, opp, card("Mountain", "Basic Land — Mountain"));
    const a1 = putOnBattlefield(s0, ap, goblin);
    const a2 = putOnBattlefield(s0, ap, goblin);
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [a1, a2].map((attacker) => ({ attacker, defender: opp })) });
    for (let i = 0; i < 4 && waitingOn(s) !== opp; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = resolveAll(run(s, planActivate(s, opp, t, 0)));
    s = passUntil(s, "declareBlockers", ap);
    s = resolveAll(act(s, { type: "declareBlockers", player: opp, blocks: [a1, a2].map((attacker) => ({ blocker: t, attacker })) }));
    expect(s.objects[t]!.blocking).toEqual([a1, a2]);
  });

  it("Furious Spinesplitter: a counter at your end step for each opponent dealt damage this turn", () => {
    const { s: s0, ap, ids, opp } = setup([shock, shock]);
    const f = putOnBattlefield(s0, ap, furiousSpinesplitter);
    const third = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: third }])));
    s = resolveAll(passUntil(s, "end", ap));
    expect(counters(s, f)).toBe(2);
  });

});
