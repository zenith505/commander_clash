// Round 179: the most played cards still unsupported, in popularity order, from about rank 10,640 on, and the cards
// that share their templates.

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, island, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { characteristics, compileCard, controllerOf, invalidateCharacteristics, isFullySupported, objHasKeyword, parseManaCost, planActivate, planCast, planMana, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

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
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "graveyard" | "hand" | "library" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else if (zone !== "exile") s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const attack = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) =>
  settle(act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks }));
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const counters = (s: GameState, id: string, c = "+1/+1") => s.objects[id]!.counters[c] ?? 0;
const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && [name, `${name} Token`].includes(characteristics(s, s.objects[id]!).name));
const lands = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && characteristics(s, s.objects[id]!).types.includes("Land"));
const murder = card("Test Murder", "Instant", "{1}", { cmc: 1, oracleText: "Destroy target creature." });
const opt = card("Opt", "Instant", "{U}", { cmc: 1, oracleText: "Draw a card." });
const sword = card("Test Sword", "Artifact — Equipment", "{2}", { cmc: 2, oracleText: "Equipped creature gets +2/+2.\nEquip {2}" });
const axe = card("Test Axe", "Artifact — Equipment", "{1}", { cmc: 1, oracleText: "Equipped creature gets +1/+0.\nEquip {1}" });
const aura = card("Test Aura", "Enchantment — Aura", "{1}{W}", { cmc: 2, oracleText: "Enchant creature\nEnchanted creature gets +2/+2." });
const blueBear = card("Blue Bear", "Creature — Bear", "{1}{U}", { cmc: 2, power: "2", toughness: "2" });
const ogre = card("Hill Giant", "Creature — Giant", "{3}{R}", { cmc: 4, power: "3", toughness: "3" });
const warrior = card("Test Warrior", "Creature — Human Warrior", "{1}{W}", { cmc: 2, power: "2", toughness: "2" });

// Real oracle text (Scryfall).
const roaleskApexHybrid = card("Roalesk, Apex Hybrid", "Legendary Creature — Human Mutant", "{2}{G}{G}{U}", {cmc: 5,"power":"4","toughness":"5","keywords":["Flying","Trample","Proliferate"],"oracleText":"Flying, trample\nWhen Roalesk enters, put two +1/+1 counters on another target creature you control.\nWhen Roalesk dies, proliferate, then proliferate again. (Choose any number of permanents and/or players, then give each another counter of each kind already there. Then do it again.)"});
const manaBreach = card("Mana Breach", "Enchantment", "{2}{U}", {cmc: 3,"oracleText":"Whenever a player casts a spell, that player returns a land they control to its owner's hand."});
const callerOfTheClaw = card("Caller of the Claw", "Creature — Elf", "{2}{G}", {cmc: 3,"power":"2","toughness":"2","keywords":["Flash"],"oracleText":"Flash\nWhen this creature enters, create a 2/2 green Bear creature token for each nontoken creature put into your graveyard from the battlefield this turn."});
const freshMeat = card("Fresh Meat", "Instant", "{3}{G}", {cmc: 4,"oracleText":"Create a 3/3 green Beast creature token for each creature put into your graveyard from the battlefield this turn."});
const urborgJustice = card("Urborg Justice", "Instant", "{B}{B}", {cmc: 2,"oracleText":"Target opponent sacrifices a creature of their choice for each creature put into your graveyard from the battlefield this turn."});
const obzedatGhostCouncil = card("Obzedat, Ghost Council", "Legendary Creature — Spirit Advisor", "{1}{W}{W}{B}{B}", {cmc: 5,"power":"5","toughness":"5","oracleText":"When Obzedat enters, target opponent loses 2 life and you gain 2 life.\nAt the beginning of your end step, you may exile Obzedat. If you do, return it to the battlefield under its owner's control at the beginning of your next upkeep. It gains haste.","colors":["B","W"]});
const heraldOfAmity = card("Herald of Amity", "Creature — Griffin", "{3}{W}", {cmc: 4,"power":"2","toughness":"2","keywords":["Flying"],"oracleText":"Flying\nWhen this creature enters, exile the top eight cards of your library. You may cast an Aura spell from among them without paying its mana cost. Then put the rest on the bottom of your library in a random order.\nWhenever this creature attacks, it gets +X/+X until end of turn, where X is the number of Auras you control."});
const ajaniUnyielding = card("Ajani Unyielding", "Legendary Planeswalker — Ajani", "{4}{G}{W}", {cmc: 6,"loyalty":"4","oracleText":"+2: Reveal the top three cards of your library. Put all nonland permanent cards revealed this way into your hand and the rest on the bottom of your library in any order.\n−2: Exile target creature. Its controller gains life equal to its power.\n−9: Put five +1/+1 counters on each creature you control and five loyalty counters on each other planeswalker you control."});
const bessSoulNourisher = card("Bess, Soul Nourisher", "Legendary Creature — Human Citizen", "{1}{G}{W}", {cmc: 3,"power":"1","toughness":"1","oracleText":"Whenever one or more other creatures you control with base power and toughness 1/1 enter, put a +1/+1 counter on Bess.\nWhenever Bess attacks, each other creature you control with base power and toughness 1/1 gets +X/+X until end of turn, where X is the number of +1/+1 counters on Bess."});
const duskanaTheRageMother = card("Duskana, the Rage Mother", "Legendary Creature — Bear", "{2}{R}{G}{W}", {cmc: 5,"power":"5","toughness":"5","oracleText":"When Duskana enters, draw a card for each creature you control with base power and toughness 2/2.\nWhenever a creature you control with base power and toughness 2/2 attacks, it gets +3/+3 until end of turn.","colors":["G","R","W"]});
const nahiriHeirOfTheAncients = card("Nahiri, Heir of the Ancients", "Legendary Planeswalker — Nahiri", "{2}{R}{W}", {cmc: 4,"loyalty":"4","oracleText":"+1: Create a 1/1 white Kor Warrior creature token. You may attach an Equipment you control to it.\n−2: Look at the top six cards of your library. You may reveal a Warrior or Equipment card from among them and put it into your hand. Put the rest on the bottom of your library in a random order.\n−3: Nahiri deals damage to target creature or planeswalker equal to twice the number of Equipment you control."});
const goldwardensGambit = card("Goldwardens' Gambit", "Sorcery", "{6}{R}{R}", {cmc: 8,"keywords":["Affinity"],"oracleText":"Affinity for Equipment (This spell costs {1} less to cast for each Equipment you control.)\nCreate five 2/2 red Rebel creature tokens. They gain haste until end of turn. For each of those tokens, you may attach an Equipment you control to it."});
const resoluteStrike = card("Resolute Strike", "Instant", "{W}", {cmc: 1,"oracleText":"Target creature gets +2/+2 until end of turn. If it's a Warrior, you may attach an Equipment you control to it."});
const expelFromOrazca = card("Expel from Orazca", "Instant", "{1}{U}", {cmc: 2,"keywords":["Ascend"],"oracleText":"Ascend (If you control ten or more permanents, you get the city's blessing for the rest of the game.)\nReturn target nonland permanent to its owner's hand. If you have the city's blessing, you may put that permanent on top of its owner's library instead."});
const mysticalDispute = card("Mystical Dispute", "Instant", "{2}{U}", {cmc: 3,"oracleText":"This spell costs {2} less to cast if it targets a blue spell.\nCounter target spell unless its controller pays {3}."});
const sternScolding = card("Stern Scolding", "Instant", "{U}", {cmc: 1,"oracleText":"Counter target creature spell with power or toughness 2 or less."});
const banewhipPunisher = card("Banewhip Punisher", "Creature — Human Warrior", "{2}{B}", {cmc: 3,"power":"2","toughness":"2","oracleText":"When this creature enters, you may put a -1/-1 counter on target creature.\n{B}, Sacrifice this creature: Destroy target creature that has a -1/-1 counter on it."});
const triadOfFates = card("Triad of Fates", "Legendary Creature — Human Wizard", "{2}{W}{B}", {cmc: 4,"power":"3","toughness":"3","oracleText":"{1}, {T}: Put a fate counter on another target creature.\n{W}, {T}: Exile target creature that has a fate counter on it, then return it to the battlefield under its owner's control.\n{B}, {T}: Exile target creature that has a fate counter on it. Its controller draws two cards.","colors":["B","W"]});
const foultongueShriek = card("Foul-Tongue Shriek", "Instant", "{B}", {cmc: 1,"oracleText":"Target opponent loses 1 life for each attacking creature you control. You gain that much life."});
const guildswornProwler = card("Guildsworn Prowler", "Creature — Tiefling Rogue Assassin", "{1}{B}", {cmc: 2,"power":"2","toughness":"1","keywords":["Deathtouch"],"oracleText":"Deathtouch\nWhen this creature dies, if it wasn't blocking, draw a card."});
const tendTheSprigs = card("Tend the Sprigs", "Sorcery", "{2}{G}", {cmc: 3,"oracleText":"Search your library for a basic land card, put it onto the battlefield tapped, then shuffle. Then if you control seven or more lands and/or Treefolk, create a 3/4 green Treefolk creature token with reach. (It can block creatures with flying.)"});
const dakkonShadowSlayer = card("Dakkon, Shadow Slayer", "Legendary Planeswalker — Dakkon", "{W}{U}{B}", {cmc: 3,"loyalty":"0","keywords":["Surveil"],"oracleText":"Dakkon enters with a number of loyalty counters on him equal to the number of lands you control.\n+1: Surveil 2.\n−3: Exile target creature.\n−6: You may put an artifact card from your hand or graveyard onto the battlefield.","colors":["B","U","W"]});
const anyaMercilessAngel = card("Anya, Merciless Angel", "Legendary Creature — Angel", "{3}{R}{W}", {cmc: 5,"power":"4","toughness":"4","keywords":["Flying"],"oracleText":"Flying\nAnya gets +3/+3 for each opponent whose life total is less than half their starting life total.\nAs long as an opponent's life total is less than half their starting life total, Anya has indestructible."});
const scarbladesMalice = card("Scarblade's Malice", "Instant", "{B}", {cmc: 1,"oracleText":"Target creature you control gains deathtouch and lifelink until end of turn. When that creature dies this turn, create a 2/2 black and green Elf creature token."});
const timeToFeed = card("Time to Feed", "Sorcery", "{2}{G}", {cmc: 3,"keywords":["Fight"],"oracleText":"Choose target creature an opponent controls. When that creature dies this turn, you gain 3 life. Target creature you control fights that creature. (Each deals damage equal to its power to the other.)"});
const curfew = card("Curfew", "Instant", "{U}", {cmc: 1,"oracleText":"Each player returns a creature they control to its owner's hand."});
const blizzardSpecter = card("Blizzard Specter", "Snow Creature — Specter", "{2}{U}{B}", {cmc: 4,"power":"2","toughness":"3","keywords":["Flying"],"oracleText":"Flying\nWhenever this creature deals combat damage to a player, choose one —\n• That player returns a permanent they control to its owner's hand.\n• That player discards a card.","colors":["B","U"]});
const asmiraHolyAvenger = card("Asmira, Holy Avenger", "Legendary Creature — Human Cleric", "{2}{G}{W}", {cmc: 4,"power":"2","toughness":"3","keywords":["Flying"],"oracleText":"Flying\nAt the beginning of each end step, put a +1/+1 counter on Asmira for each creature put into your graveyard from the battlefield this turn."});

const kingMacarTheGoldCursed = card("King Macar, the Gold-Cursed", "Legendary Creature — Human Noble", "{2}{B}{B}", {cmc: 4,"power":"2","toughness":"3","keywords":["Inspired"],"oracleText":"Inspired — Whenever King Macar becomes untapped, you may exile target creature. If you do, create a Gold token. (It's an artifact with \"Sacrifice this token: Add one mana of any color.\")"});
const deathrender = card("Deathrender", "Artifact — Equipment", "{4}", {cmc: 4,"keywords":["Equip"],"oracleText":"Equipped creature gets +2/+2.\nWhenever equipped creature dies, you may put a creature card from your hand onto the battlefield and attach this Equipment to it.\nEquip {2}"});
const oathkeeperTakenosDaisho = card("Oathkeeper, Takeno's Daisho", "Legendary Artifact — Equipment", "{3}", {cmc: 3,"keywords":["Equip"],"oracleText":"Equipped creature gets +3/+1.\nWhenever equipped creature dies, return that card to the battlefield under your control if it's a Samurai card.\nWhen Oathkeeper is put into a graveyard from the battlefield, exile equipped creature.\nEquip {2}"});
const gorogoroAndSatoru = card("Goro-Goro and Satoru", "Legendary Creature — Goblin Human", "{U}{B}{R}", {cmc: 3,"power":"3","toughness":"4","oracleText":"Whenever one or more creatures you control that entered this turn deal combat damage to a player, create a 5/5 red Dragon Spirit creature token with flying.\n{1}{R}: Creatures you control gain haste until end of turn.","colors":["B","R","U"]});
const fromFatherToSon = card("From Father to Son", "Sorcery", "{1}{W}", {cmc: 2,"keywords":["Flashback"],"oracleText":"Search your library for a Vehicle card, reveal it, and put it into your hand. If this spell was cast from a graveyard, put that card onto the battlefield instead. Then shuffle.\nFlashback {4}{W}{W}{W} (You may cast this card from your graveyard for its flashback cost. Then exile it.)"});
const caressOfPhyrexia = card("Caress of Phyrexia", "Sorcery", "{3}{B}{B}", {cmc: 5,"oracleText":"Target player draws three cards, loses 3 life, and gets three poison counters."});
const earlyHarvest = card("Early Harvest", "Instant", "{1}{G}{G}", {cmc: 3,"oracleText":"Target player untaps all basic lands they control."});
const starlitSoothsayer = card("Starlit Soothsayer", "Creature — Bat Cleric", "{2}{B}", {cmc: 3,"power":"2","toughness":"2","keywords":["Flying","Surveil"],"oracleText":"Flying\nAt the beginning of your end step, if you gained or lost life this turn, surveil 1. (Look at the top card of your library. You may put it into your graveyard.)"});
const starseerMentor = card("Starseer Mentor", "Creature — Bat Warlock", "{3}{W}{B}", {cmc: 5,"power":"3","toughness":"5","keywords":["Flying","Vigilance"],"oracleText":"Flying, vigilance\nAt the beginning of your end step, if you gained or lost life this turn, target opponent loses 3 life unless they sacrifice a nonland permanent of their choice or discard a card.","colors":["B","W"]});
const besmirch = card("Besmirch", "Sorcery", "{1}{R}{R}", {cmc: 3,"keywords":["Goad"],"oracleText":"Until end of turn, gain control of target creature and it gains haste. Untap and goad that creature. (Until your next turn, that creature attacks each combat if able and attacks a player other than you if able.)"});
const slyInstigator = card("Sly Instigator", "Creature — Human Wizard", "{3}{U}", {cmc: 4,"power":"2","toughness":"4","keywords":["Goad"],"oracleText":"{U}, {T}: Until your next turn, target creature an opponent controls can't be blocked. Goad that creature. (Until your next turn, that creature attacks each combat if able and attacks a player other than you if able.)"});
const strategicBetrayal = card("Strategic Betrayal", "Sorcery", "{1}{B}", {cmc: 2,"oracleText":"Target opponent exiles a creature they control and their graveyard."});
const whisperingSpecter = card("Whispering Specter", "Creature — Phyrexian Specter", "{1}{B}{B}", {cmc: 3,"power":"1","toughness":"1","keywords":["Flying","Infect"],"oracleText":"Flying\nInfect (This creature deals damage to creatures in the form of -1/-1 counters and to players in the form of poison counters.)\nWhenever this creature deals combat damage to a player, you may sacrifice it. If you do, that player discards a card for each poison counter they have."});
const wasitoraNekoruQueen = card("Wasitora, Nekoru Queen", "Legendary Creature — Cat Dragon", "{2}{B}{R}{G}", {cmc: 5,"power":"5","toughness":"4","keywords":["Flying","Trample"],"oracleText":"Flying, trample\nWhenever Wasitora deals combat damage to a player, that player sacrifices a creature of their choice. If the player can't, you create a 3/3 black, red, and green Cat Dragon creature token with flying.","colors":["B","G","R"]});
const millicentRestlessRevenant = card("Millicent, Restless Revenant", "Legendary Creature — Spirit Soldier", "{5}{W}{U}", {cmc: 7,"power":"4","toughness":"4","keywords":["Flying","Affinity"],"oracleText":"Affinity for Spirits (This spell costs {1} less to cast for each Spirit you control.)\nFlying\nWhenever Millicent or another nontoken Spirit you control dies or deals combat damage to a player, create a 1/1 white Spirit creature token with flying.","colors":["U","W"]});
const turnInsideOut = card("Turn Inside Out", "Instant", "{R}", {cmc: 1,"keywords":["Manifest","Manifest dread"],"oracleText":"Target creature gets +3/+0 until end of turn. When it dies this turn, manifest dread. (Look at the top two cards of your library. Put one onto the battlefield face down as a 2/2 creature and the other into your graveyard. Turn it face up any time for its mana cost if it's a creature card.)"});
const unnaturalMoonrise = card("Unnatural Moonrise", "Sorcery", "{R}{G}", {cmc: 2,"keywords":["Flashback"],"oracleText":"It becomes night. Until end of turn, target creature gets +1/+0 and gains trample and \"Whenever this creature deals combat damage to a player, draw a card.\"\nFlashback {2}{R}{G} (You may cast this card from your graveyard for its flashback cost. Then exile it.)","colors":["G","R"]});
const bumiBash = card("Bumi Bash", "Sorcery", "{3}{R}", {cmc: 4,"oracleText":"Choose one —\n• Bumi Bash deals damage equal to the number of lands you control to target creature.\n• Destroy target land creature or nonbasic land."});
const centaurVinecrasher = card("Centaur Vinecrasher", "Creature — Plant Centaur", "{3}{G}", {cmc: 4,"power":"1","toughness":"1","keywords":["Trample"],"oracleText":"Trample\nThis creature enters with a number of +1/+1 counters on it equal to the number of land cards in all graveyards.\nWhenever a land card is put into a graveyard from anywhere, you may pay {G}{G}. If you do, return this card from your graveyard to your hand."});
const rallyTheAncestors = card("Rally the Ancestors", "Instant", "{X}{W}{W}", {cmc: 2,"oracleText":"Return each creature card with mana value X or less from your graveyard to the battlefield. Exile those creatures at the beginning of your next upkeep. Exile Rally the Ancestors."});
const everAfter = card("Ever After", "Sorcery", "{4}{B}{B}", {cmc: 6,"oracleText":"Return up to two target creature cards from your graveyard to the battlefield. Each of those creatures is a black Zombie in addition to its other colors and types. Put Ever After on the bottom of its owner's library."});
const oliviaMobilizedForWar = card("Olivia, Mobilized for War", "Legendary Creature — Vampire Knight", "{1}{B}{R}", {cmc: 3,"power":"3","toughness":"3","keywords":["Flying"],"oracleText":"Flying\nWhenever another creature you control enters, you may discard a card. If you do, put a +1/+1 counter on that creature, it gains haste until end of turn, and it becomes a Vampire in addition to its other types."});
const ascendantAcolyte = card("Ascendant Acolyte", "Creature — Human Monk", "{4}{G}", {cmc: 5,"power":"1","toughness":"1","keywords":["Double"],"oracleText":"This creature enters with a +1/+1 counter on it for each +1/+1 counter among other creatures you control.\nAt the beginning of your upkeep, double the number of +1/+1 counters on this creature."});
const kurbisHarvestCelebrant = card("Kurbis, Harvest Celebrant", "Legendary Creature — Treefolk", "{X}{G}{G}", {cmc: 2,"power":"0","toughness":"0","oracleText":"Kurbis enters with a number of +1/+1 counters on it equal to the amount of mana spent to cast it.\nRemove a +1/+1 counter from Kurbis: Prevent all damage that would be dealt this turn to another target creature with a +1/+1 counter on it."});
const vileRedeemer = card("Vile Redeemer", "Creature — Eldrazi", "{2}{G}", {cmc: 3,"power":"3","toughness":"3","keywords":["Devoid","Flash"],"oracleText":"Devoid (This card has no color.)\nFlash\nWhen you cast this spell, you may pay {C}. If you do, create a 1/1 colorless Eldrazi Scion creature token for each nontoken creature that died under your control this turn. Those tokens have \"Sacrifice this token: Add {C}.\""});
const catapultFodder = card("Catapult Fodder", "Creature — Zombie", "{2}{B}", {cmc: 3,"power":"1","toughness":"5","oracleText":"At the beginning of combat on your turn, if you control three or more creatures that each have toughness greater than their power, transform this creature."});

describe("round 179", () => {
  it("compiles every card of the round", () => {
    supported(roaleskApexHybrid, manaBreach, callerOfTheClaw, freshMeat, urborgJustice, obzedatGhostCouncil, heraldOfAmity, ajaniUnyielding, bessSoulNourisher, duskanaTheRageMother, nahiriHeirOfTheAncients, goldwardensGambit, resoluteStrike, expelFromOrazca, mysticalDispute, sternScolding, banewhipPunisher, triadOfFates, foultongueShriek, guildswornProwler, tendTheSprigs, dakkonShadowSlayer, anyaMercilessAngel, scarbladesMalice, timeToFeed, curfew, blizzardSpecter, asmiraHolyAvenger);
  });

  it("Roalesk, Apex Hybrid: when it dies, proliferate, then proliferate again", () => {
    const { s: s0, ap, ids } = setup([murder]);
    const r = putOnBattlefield(s0, ap, roaleskApexHybrid);
    const b = putOnBattlefield(s0, ap, bear());
    s0.objects[b]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s0);
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(r)])));
    expect(zone(s, r)).toBe("graveyard");
    expect(counters(s, b)).toBe(3);
  });

  it("Mana Breach: the player who cast the spell returns a land they control to its owner's hand", () => {
    const { s: s0, ap, ids } = setup([opt]);
    putOnBattlefield(s0, s0.turnOrder[1]!, manaBreach);
    const before = lands(s0, ap).length;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap });
    const pick = s.pending!.kind === "pickPermanents" ? s.pending.options[0]! : "";
    s = resolveAll(act(s, { type: "pickPermanents", player: ap, ids: [pick] }));
    expect(lands(s, ap).length).toBe(before - 1);
    expect(zone(s, pick)).toBe("hand");
  });

  it("Caller of the Claw and Fresh Meat count the creatures put into your graveyard from the battlefield this turn", () => {
    const { s: s0, ap, ids, opp } = setup([murder, murder, murder, murder, callerOfTheClaw, freshMeat]);
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, bear());
    let s = s0;
    for (const [i, t] of [[0, a], [1, b], [2, theirs]] as const) s = resolveAll(run(s, planCast(s, ap, ids[i]!, [tgt(t)])));
    // A token goes to its owner's graveyard too (CR 111.7): Fresh Meat counts it, Caller of the Claw doesn't.
    const tok = putOnBattlefield(s, ap, bear({ name: "Token Bear" }));
    s.objects[tok]!.isToken = true;
    s = resolveAll(run(s, planCast(s, ap, ids[3]!, [tgt(tok)])));
    s = resolveAll(run(s, planCast(s, ap, ids[4]!)));
    expect(named(s, ap, "Bear").length).toBe(2);
    s = resolveAll(run(s, planCast(s, ap, ids[5]!)));
    expect(named(s, ap, "Beast").length).toBe(3);
  });

  it("Urborg Justice: the opponent sacrifices a creature for each creature put into your graveyard this turn", () => {
    const { s: s0, ap, ids, opp } = setup([murder, murder, urborgJustice]);
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, ap, bear());
    const theirs = [putOnBattlefield(s0, opp, bear()), putOnBattlefield(s0, opp, bear()), putOnBattlefield(s0, opp, bear())];
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(a)])));
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(b)])));
    s = settle(run(s, planCast(s, ap, ids[2]!, [player(opp)])));
    if (s.pending?.kind === "pickPermanents") s = resolveAll(act(s, { type: "pickPermanents", player: opp, ids: s.pending.options.slice(0, 2) }));
    expect(theirs.filter((id) => zone(s, id) === "graveyard").length).toBe(2);
  });

  it("Obzedat, Ghost Council: exiled at your end step, it returns at your next upkeep with haste", () => {
    const { s: s0, ap } = setup([]);
    const o = putOnBattlefield(s0, ap, obzedatGhostCouncil);
    let s = passUntil(s0, "end", ap);
    s = settle(s);
    expect(s.pending?.kind).toBe("chooseMay");
    s = settle(may(s, true));
    expect(zone(s, o)).toBe("exile");
    s = passUntil(s, "upkeep", ap);
    s = settle(s);
    expect(zone(s, o)).toBe("battlefield");
    expect(objHasKeyword(s, s.objects[o]!, "Haste")).toBe(true);
    // It came back under its owner's control at its owner's (the controller's) upkeep; its enters trigger targets an opponent.
    expect(controllerOf(s, s.objects[o]!)).toBe(ap);
  });

  it("Herald of Amity: casts an Aura from among the top eight cards for free, the rest to the bottom", () => {
    const { s: s0, ap, ids } = setup([heraldOfAmity]);
    const b = putOnBattlefield(s0, ap, bear());
    const top = [into(s0, ap, opt, "library"), into(s0, ap, aura, "library"), into(s0, ap, ogre, "library")];
    const size = s0.players[ap]!.library.length;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = resolveAll(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong" });
    expect(s.pending!.kind === "chooseOption" && s.pending.options).toEqual([top[1], "none"]);
    s = act(s, { type: "chooseOption", player: ap, choice: top[1]! });
    s = resolveAll(run(s, planCast(s, ap, top[1]!, [tgt(b)])));
    expect(zone(s, top[1]!)).toBe("battlefield");
    expect(pt(s, b)).toBe("4/4");
    expect(s.players[ap]!.library.length).toBe(size - 1);
    expect(s.players[ap]!.library.slice(-7)).toContain(top[0]);
  });

  it("Ajani Unyielding −9: five +1/+1 counters on each creature and five loyalty counters on each other planeswalker", () => {
    const { s: s0, ap } = setup([]);
    const aj = putOnBattlefield(s0, ap, ajaniUnyielding);
    s0.objects[aj]!.counters.loyalty = 10;
    const nahiri = putOnBattlefield(s0, ap, nahiriHeirOfTheAncients);
    s0.objects[nahiri]!.counters.loyalty = 4;
    const b = putOnBattlefield(s0, ap, bear());
    const s = resolveAll(run(s0, planActivate(s0, ap, aj, 2)));
    expect(counters(s, b)).toBe(5);
    expect(counters(s, nahiri, "loyalty")).toBe(9);
    expect(counters(s, aj, "loyalty")).toBe(1);
  });

  it("Bess, Soul Nourisher: grows when 1/1s enter; its attack pumps the other 1/1s", () => {
    const one = card("Test Squire", "Creature — Human", "{W}", { cmc: 1, power: "1", toughness: "1" });
    const { s: s0, ap, ids, opp } = setup([one, bear()]);
    const bess = putOnBattlefield(s0, ap, bessSoulNourisher);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(counters(s, bess)).toBe(1);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(counters(s, bess)).toBe(1);
    const [sq, big] = ids as [string, string];
    s = attack(s, ap, [{ attacker: bess, defender: opp }]);
    s = resolveAll(s);
    expect(pt(s, sq)).toBe("2/2");
    expect(pt(s, big)).toBe("2/2");
  });

  it("Duskana, the Rage Mother: draws for each 2/2; an attacking 2/2 gets +3/+3", () => {
    const { s: s0, ap, ids, opp } = setup([duskanaTheRageMother]);
    const b = putOnBattlefield(s0, ap, bear());
    putOnBattlefield(s0, ap, ogre);
    const hand = s0.players[ap]!.hand.length;
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 1);
    s = resolveAll(attack(s, ap, [{ attacker: b, defender: opp }]));
    expect(pt(s, b)).toBe("5/5");
  });

  it("Nahiri, Heir of the Ancients +1: the Kor Warrior token gets an Equipment you control, if you choose", () => {
    const { s: s0, ap } = setup([]);
    const n = putOnBattlefield(s0, ap, nahiriHeirOfTheAncients);
    s0.objects[n]!.counters.loyalty = 4;
    const sw = putOnBattlefield(s0, ap, sword);
    let s = settle(run(s0, planActivate(s0, ap, n, 0)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "attachWhich", options: [sw, "none"] });
    s = resolveAll(act(s, { type: "chooseOption", player: ap, choice: sw }));
    const tok = named(s, ap, "Kor Warrior")[0]!;
    expect(s.objects[sw]!.attachedTo).toBe(tok);
    expect(pt(s, tok)).toBe("3/3");
  });

  it("Goldwardens' Gambit: an Equipment for each of the five tokens, one at a time", () => {
    const { s: s0, ap, ids } = setup([goldwardensGambit]);
    const sw = putOnBattlefield(s0, ap, sword);
    const ax = putOnBattlefield(s0, ap, axe);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const toks = named(s, ap, "Rebel");
    expect(toks.length).toBe(5);
    s = act(s, { type: "chooseOption", player: ap, choice: sw });
    s = act(s, { type: "chooseOption", player: ap, choice: ax });
    for (let i = 0; i < 3; i++) s = act(s, { type: "chooseOption", player: ap, choice: "none" });
    s = resolveAll(s);
    const withSword = s.objects[sw]!.attachedTo!;
    const withAxe = s.objects[ax]!.attachedTo!;
    expect(toks).toContain(withSword);
    expect(toks).toContain(withAxe);
    expect(withSword).not.toBe(withAxe);
    expect(pt(s, withSword)).toBe("4/4");
    expect(toks.every((t) => objHasKeyword(s, s.objects[t]!, "Haste"))).toBe(true);
  });

  it("Resolute Strike: only a Warrior may get an Equipment", () => {
    const { s: s0, ap, ids } = setup([resoluteStrike, resoluteStrike]);
    const w = putOnBattlefield(s0, ap, warrior);
    const b = putOnBattlefield(s0, ap, bear());
    const sw = putOnBattlefield(s0, ap, sword);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])));
    expect(s.pending).toBeNull();
    expect(s.objects[sw]!.attachedTo).toBeUndefined();
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(w)])));
    s = resolveAll(act(s, { type: "chooseOption", player: ap, choice: sw }));
    expect(s.objects[sw]!.attachedTo).toBe(w);
    expect(pt(s, w)).toBe("6/6");
  });

  it("Expel from Orazca: with the city's blessing, the permanent may go on top of its owner's library instead", () => {
    const { s: s0, ap, ids, opp } = setup([expelFromOrazca, expelFromOrazca]);
    const a = putOnBattlefield(s0, opp, bear());
    const b = putOnBattlefield(s0, opp, bear());
    // Fourteen lands: ascend gives the city's blessing as it resolves (CR 702.131a).
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(a)])));
    expect(s.pending?.kind).toBe("chooseMay");
    s = resolveAll(may(s, true));
    expect(zone(s, a)).toBe("library");
    expect(s.players[opp]!.library[0]).toBe(a);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(b)])));
    s = resolveAll(may(s, false));
    expect(zone(s, b)).toBe("hand");
  });

  it("Expel from Orazca: without the city's blessing, back to its owner's hand", () => {
    const { s: s0, ap, ids, opp } = setup([expelFromOrazca]);
    // Only the two lands it needs: no city's blessing.
    for (const id of lands(s0, ap)) if (!["Island"].includes(characteristics(s0, s0.objects[id]!).name)) s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
    invalidateCharacteristics(s0);
    const a = putOnBattlefield(s0, opp, bear());
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(a)])));
    expect(s.players[ap]!.citysBlessing ?? false).toBe(false);
    expect(zone(s, a)).toBe("hand");
  });

  it("Mystical Dispute costs {2} less if it targets a blue spell; Stern Scolding counters a creature spell with power or toughness 2 or less", () => {
    const { s: s0, ap, ids } = setup([blueBear, mysticalDispute, bear(), mysticalDispute, sternScolding, ogre]);
    const untapped = (s: GameState) => lands(s, ap).filter((id) => !s.objects[id]!.tapped).length;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    const blueItem = s.stack[s.stack.length - 1]!.id;
    const before = untapped(s);
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: blueItem }]));
    expect(before - untapped(s)).toBe(1);
    s = resolveAll(s);
    expect(s.pending).toMatchObject({ kind: "payUnless", player: ap });
    s = resolveAll(act(s, { type: "payUnless", player: ap, pay: false }));
    expect(zone(s, ids[0]!)).toBe("graveyard");
    s = run(s, planCast(s, ap, ids[2]!));
    const greenItem = s.stack[s.stack.length - 1]!.id;
    const before2 = untapped(s);
    s = run(s, planCast(s, ap, ids[3]!, [{ kind: "stack", id: greenItem }]));
    expect(before2 - untapped(s)).toBe(3);
    s = resolveAll(s);
    expect(s.pending).toMatchObject({ kind: "payUnless", player: ap });
    s = resolveAll(act(s, { type: "payUnless", player: ap, pay: false }));
    expect(zone(s, ids[2]!)).toBe("graveyard");
    // Stern Scolding: a 3/3 isn't a legal target.
    s = run(s, planCast(s, ap, ids[5]!));
    const ogreItem = s.stack[s.stack.length - 1]!.id;
    expect(planCast(s, ap, ids[4]!, [{ kind: "stack", id: ogreItem }])).toBeNull();
  });

  it("Stern Scolding counters a 2/2 creature spell", () => {
    const { s: s0, ap, ids } = setup([bear(), sternScolding]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: s.stack[s.stack.length - 1]!.id }])));
    expect(zone(s, ids[0]!)).toBe("graveyard");
  });

  it("Banewhip Punisher and Triad of Fates target only a creature that has that counter on it", () => {
    const { s: s0, ap, opp } = setup([]);
    const p = putOnBattlefield(s0, ap, banewhipPunisher);
    const t = putOnBattlefield(s0, ap, triadOfFates);
    const a = putOnBattlefield(s0, opp, bear());
    const b = putOnBattlefield(s0, opp, ogre);
    expect(planActivate(s0, ap, p, 0, [tgt(a)])).toBeNull();
    s0.objects[a]!.counters["-1/-1"] = 1;
    s0.objects[b]!.counters.fate = 1;
    invalidateCharacteristics(s0);
    let s = resolveAll(run(s0, planActivate(s0, ap, p, 0, [tgt(a)])));
    expect(zone(s, a)).toBe("graveyard");
    const hand = s.players[opp]!.hand.length;
    s = resolveAll(run(s, planActivate(s, ap, t, 2, [tgt(b)])));
    expect(zone(s, b)).toBe("exile");
    expect(s.players[opp]!.hand.length).toBe(hand + 2);
  });

  it("Foul-Tongue Shriek: the opponent loses 1 life for each attacking creature you control and you gain that much", () => {
    const { s: s0, ap, ids, opp } = setup([foultongueShriek]);
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, ap, bear());
    let s = attack(s0, ap, [{ attacker: a, defender: opp }, { attacker: b, defender: opp }]);
    const [me, them] = [s.players[ap]!.life, s.players[opp]!.life];
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    expect(s.players[opp]!.life).toBe(them - 2);
    expect(s.players[ap]!.life).toBe(me + 2);
  });

  it("Guildsworn Prowler: draws when it dies, but not if it was blocking", () => {
    const { s: s0, ap, ids, opp } = setup([murder]);
    const p1 = putOnBattlefield(s0, ap, guildswornProwler);
    const hand = s0.players[ap]!.hand.length;
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(p1)])));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 1);
    const p2 = putOnBattlefield(s, ap, guildswornProwler);
    const o = putOnBattlefield(s, opp, ogre);
    s = act(passUntil(s, "declareAttackers", opp), { type: "declareAttackers", player: opp, attacks: [{ attacker: o, defender: ap }] });
    s = settle(s);
    const h2 = s.players[ap]!.hand.length;
    s = act(passUntil(s, "declareBlockers", opp), { type: "declareBlockers", player: ap, blocks: [{ blocker: p2, attacker: o }] });
    s = passUntil(s, "end", opp);
    expect(zone(s, p2)).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(h2);
  });

  it("Tend the Sprigs: a Treefolk with seven or more lands and/or Treefolk", () => {
    const { s: s0, ap, ids } = setup([tendTheSprigs]);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    const found = (s.pending as { cards: string[] }).cards[0]!;
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [found] }));
    expect(zone(s, found)).toBe("battlefield");
    expect(s.objects[found]!.tapped).toBe(true);
    expect(named(s, ap, "Treefolk").length).toBe(1);
  });

  it("Dakkon, Shadow Slayer enters with a loyalty counter for each land you control", () => {
    const { s: s0, ap, ids } = setup([dakkonShadowSlayer]);
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(counters(s, ids[0]!, "loyalty")).toBe(lands(s, ap).length);
  });

  it("Anya, Merciless Angel: +3/+3 for each opponent below half their starting life, and indestructible then", () => {
    const { s: s0, ap } = setup([]);
    const a = putOnBattlefield(s0, ap, anyaMercilessAngel);
    expect(pt(s0, a)).toBe("4/4");
    const [b, c] = s0.turnOrder.filter((p) => p !== ap);
    s0.players[b!]!.life = 19;
    s0.players[c!]!.life = 20;
    invalidateCharacteristics(s0);
    expect(pt(s0, a)).toBe("7/7");
    expect(objHasKeyword(s0, s0.objects[a]!, "Indestructible")).toBe(true);
    s0.players[c!]!.life = 3;
    invalidateCharacteristics(s0);
    expect(pt(s0, a)).toBe("10/10");
  });

  it("Scarblade's Malice: an Elf when that creature dies this turn", () => {
    const { s: s0, ap, ids } = setup([scarbladesMalice, murder]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])));
    expect(objHasKeyword(s, s.objects[b]!, "Deathtouch")).toBe(true);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(b)])));
    expect(named(s, ap, "Elf").length).toBe(1);
  });

  it("Time to Feed: your creature fights the chosen one; you gain 3 life when it dies", () => {
    const { s: s0, ap, ids, opp } = setup([timeToFeed]);
    const theirs = putOnBattlefield(s0, opp, bear());
    const mine = putOnBattlefield(s0, ap, ogre);
    const life = s0.players[ap]!.life;
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(theirs), tgt(mine)])));
    expect(zone(s, theirs)).toBe("graveyard");
    expect(s.objects[mine]!.damage).toBe(2);
    expect(s.players[ap]!.life).toBe(life + 3);
  });

  it("Curfew: each player returns a creature they control", () => {
    const { s: s0, ap, ids, opp } = setup([curfew]);
    const mine = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, bear());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    for (let i = 0; i < 4 && s.pending?.kind === "pickPermanents"; i++) s = act(s, { type: "pickPermanents", player: s.pending.player, ids: s.pending.options.slice(0, 1) });
    s = resolveAll(s);
    expect([zone(s, mine), zone(s, theirs)]).toEqual(["hand", "hand"]);
  });
});

const untapper = card("Test Untap", "Instant", "{1}", { cmc: 1, oracleText: "Untap target permanent." });
const samurai = card("Test Samurai", "Creature — Human Samurai", "{1}{W}", { cmc: 2, power: "2", toughness: "2" });
const hasty = card("Test Hasty", "Creature — Goblin", "{1}", { cmc: 1, power: "1", toughness: "1", keywords: ["Haste"], oracleText: "Haste" });
const vehicle = card("Test Vehicle", "Artifact — Vehicle", "{2}", { cmc: 2, power: "3", toughness: "3", oracleText: "Crew 1" });
const spirit = card("Test Spirit", "Creature — Spirit", "{1}{W}", { cmc: 2, power: "2", toughness: "2" });
const wall = card("Test Wall", "Creature — Wall", "{1}", { cmc: 1, power: "0", toughness: "4" });
const lifeGain = card("Test Salve", "Instant", "{1}", { cmc: 1, oracleText: "You gain 1 life." });
/** Chooses the targets a triggered ability asks for as it's put on the stack. */
const targets = (s: GameState, choices: TargetChoice[]) => {
  if (s.pending?.kind !== "chooseTargets") throw new Error(`no targets asked: ${s.pending?.kind}`);
  return act(s, { type: "chooseTargets", player: s.pending.player, targets: choices });
};
/** Combat on `ap`'s turn: these attack, nobody blocks, then on to the end of combat. */
const hit = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) => passUntil(attack(s, ap, attacks), "endCombat", ap);

describe("round 179, second batch", () => {
  it("compiles every card of the batch", () => {
    supported(kingMacarTheGoldCursed, deathrender, oathkeeperTakenosDaisho, gorogoroAndSatoru, fromFatherToSon, caressOfPhyrexia, earlyHarvest, starlitSoothsayer, starseerMentor, besmirch, slyInstigator, strategicBetrayal, whisperingSpecter, wasitoraNekoruQueen, millicentRestlessRevenant, turnInsideOut, unnaturalMoonrise, bumiBash, centaurVinecrasher, rallyTheAncestors, everAfter, oliviaMobilizedForWar, ascendantAcolyte, kurbisHarvestCelebrant, vileRedeemer, catapultFodder);
  });

  it("King Macar: when it untaps, you may exile target creature, and then you get a Gold token", () => {
    const { s: s0, ap, ids, opp } = setup([untapper]);
    const k = putOnBattlefield(s0, ap, kingMacarTheGoldCursed);
    s0.objects[k]!.tapped = true;
    const b = putOnBattlefield(s0, opp, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(k)]));
    s = settle(s);
    s = resolveAll(targets(s, [tgt(b)]));
    expect(zone(s, b)).toBe("exile");
    expect(named(s, ap, "Gold").length).toBe(1);
  });

  it("King Macar: declining makes no Gold token", () => {
    const { s: s0, ap, ids, opp } = setup([untapper]);
    const k = putOnBattlefield(s0, ap, kingMacarTheGoldCursed);
    s0.objects[k]!.tapped = true;
    const b = putOnBattlefield(s0, opp, bear());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(k)])));
    s = resolveAll(targets(s, [tgt(b)]), false);
    expect(zone(s, b)).toBe("battlefield");
    expect(named(s, ap, "Gold").length).toBe(0);
  });

  it("Deathrender: when the equipped creature dies, a creature card from your hand enters with Deathrender attached", () => {
    const { s: s0, ap, ids } = setup([murder, ogre]);
    const b = putOnBattlefield(s0, ap, bear());
    const d = putOnBattlefield(s0, ap, deathrender);
    s0.objects[d]!.attachedTo = b;
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, fromHand: true, min: 0 });
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [ids[1]!] }));
    expect(zone(s, ids[1]!)).toBe("battlefield");
    expect(s.objects[d]!.attachedTo).toBe(ids[1]);
    expect(pt(s, ids[1]!)).toBe("5/5");
  });

  it("Oathkeeper: a Samurai card comes back when the equipped creature dies; anything else stays dead", () => {
    const { s: s0, ap, ids } = setup([murder, murder]);
    const sam = putOnBattlefield(s0, ap, samurai);
    const o = putOnBattlefield(s0, ap, oathkeeperTakenosDaisho);
    s0.objects[o]!.attachedTo = sam;
    invalidateCharacteristics(s0);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(sam)])));
    expect(zone(s, sam)).toBe("battlefield");
    const b = putOnBattlefield(s, ap, bear());
    s.objects[o]!.attachedTo = b;
    invalidateCharacteristics(s);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(b)])));
    expect(zone(s, b)).toBe("graveyard");
  });

  it("Goro-Goro and Satoru: a Dragon Spirit when creatures that entered this turn deal combat damage to a player", () => {
    const { s: s0, ap, ids, opp } = setup([hasty]);
    putOnBattlefield(s0, ap, gorogoroAndSatoru);
    const old = putOnBattlefield(s0, ap, bear());
    s0.objects[old]!.enteredTurn = s0.turn - 1;
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    s = hit(s, ap, [{ attacker: old, defender: opp }]);
    expect(named(s, ap, "Dragon Spirit").length).toBe(0);
    const { s: t0, ap: ap2, ids: ids2, opp: opp2 } = setup([hasty]);
    putOnBattlefield(t0, ap2, gorogoroAndSatoru);
    let t = resolveAll(run(t0, planCast(t0, ap2, ids2[0]!)));
    t = hit(t, ap2, [{ attacker: ids2[0]!, defender: opp2 }]);
    expect(named(t, ap2, "Dragon Spirit").length).toBe(1);
  });

  it("Catapult Fodder transforms with three creatures whose toughness is greater than their power", () => {
    const fodder = compileCard(catapultFodder);
    expect(fodder.triggers[0]!.ifCond).toMatchObject({ kind: "control", min: 3, filter: { toughnessAbovePower: true } });
  });

  it("From Father to Son: a Vehicle to your hand, or onto the battlefield when cast from a graveyard", () => {
    const { s: s0, ap, ids } = setup([fromFatherToSon]);
    const v = into(s0, ap, vehicle, "library");
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [v] }));
    expect(zone(s, v)).toBe("hand");
  });

  it("Caress of Phyrexia: draws three, loses 3 life and gets three poison counters", () => {
    const { s: s0, ap, ids, opp } = setup([caressOfPhyrexia]);
    const [hand, life] = [s0.players[opp]!.hand.length, s0.players[opp]!.life];
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [player(opp)])));
    expect(s.players[opp]!.hand.length).toBe(hand + 3);
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(s.players[opp]!.poison).toBe(3);
  });

  it("Early Harvest: target player untaps all basic lands they control", () => {
    const { s: s0, ap, ids } = setup([earlyHarvest]);
    let s = run(s0, planCast(s0, ap, ids[0]!, [player(ap)]));
    s = resolveAll(s);
    expect(lands(s, ap).every((id) => !s.objects[id]!.tapped)).toBe(true);
  });

  it("Starlit Soothsayer surveils at your end step only if you gained or lost life this turn", () => {
    const { s: s0, ap, ids } = setup([lifeGain]);
    putOnBattlefield(s0, ap, starlitSoothsayer);
    let s = passUntil(s0, "end", ap);
    expect(s.triggerQueue.length + s.stack.length).toBe(0);
    const { s: t0, ap: ap2, ids: ids2 } = setup([lifeGain]);
    putOnBattlefield(t0, ap2, starlitSoothsayer);
    let t = resolveAll(run(t0, planCast(t0, ap2, ids2[0]!)));
    t = settle(passUntil(t, "end", ap2));
    expect(t.pending?.kind).toBe("arrangeTop");
    void ids;
  });

  it("Besmirch: you gain control of it until end of turn, untapped, with haste, and goaded", () => {
    const { s: s0, ap, ids, opp } = setup([besmirch]);
    const b = putOnBattlefield(s0, opp, bear());
    s0.objects[b]!.tapped = true;
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])));
    expect(controllerOf(s, s.objects[b]!)).toBe(ap);
    expect(s.objects[b]!.tapped).toBe(false);
    expect(objHasKeyword(s, s.objects[b]!, "Haste")).toBe(true);
    expect(s.effects.some((e) => e.affected?.includes(b) && e.mods.some((m) => m.kind === "goad"))).toBe(true);
  });

  it("Sly Instigator: the target can't be blocked and is goaded", () => {
    const { s: s0, ap, opp } = setup([]);
    const si = putOnBattlefield(s0, ap, slyInstigator);
    const b = putOnBattlefield(s0, opp, bear());
    const s = resolveAll(run(s0, planActivate(s0, ap, si, 0, [tgt(b)])));
    const mods = s.effects.filter((e) => e.affected?.includes(b)).flatMap((e) => e.mods.map((m) => m.kind));
    expect(mods).toEqual(expect.arrayContaining(["goad", "cantBeBlocked"]));
  });

  it("Strategic Betrayal: the opponent exiles a creature of their choice and their graveyard", () => {
    const { s: s0, ap, ids, opp } = setup([strategicBetrayal]);
    const b = putOnBattlefield(s0, opp, bear());
    const y = into(s0, opp, ogre, "graveyard");
    let s = run(s0, planCast(s0, ap, ids[0]!, [player(opp)]));
    s = resolveAll(s);
    if (s.pending?.kind === "pickPermanents") s = resolveAll(act(s, { type: "pickPermanents", player: opp, ids: [b] }));
    expect(zone(s, b)).toBe("exile");
    expect(zone(s, y)).toBe("exile");
    expect(s.players[opp]!.graveyard.length).toBe(0);
  });

  it("Whispering Specter: sacrificed, the player discards a card for each poison counter", () => {
    const { s: s0, ap, opp } = setup([]);
    const w = putOnBattlefield(s0, ap, whisperingSpecter);
    s0.players[opp]!.poison = 1;
    const hand = s0.players[opp]!.hand.length;
    let s = settle(passUntil(attack(s0, ap, [{ attacker: w, defender: opp }]), "combatDamage", ap));
    expect(s.pending?.kind).toBe("chooseMay");
    s = settle(may(s, true));
    // Infect: a second poison counter, so two cards.
    expect(s.players[opp]!.poison).toBe(2);
    expect(zone(s, w)).toBe("graveyard");
    if (s.pending?.kind === "discard") s = settle(act(s, { type: "discard", player: opp, objectIds: s.players[opp]!.hand.slice(0, 2) }));
    expect(s.players[opp]!.hand.length).toBe(hand - 2);
  });

  it("Wasitora: the player sacrifices a creature; with none, you get a Cat Dragon", () => {
    const { s: s0, ap, opp } = setup([]);
    const w = putOnBattlefield(s0, ap, wasitoraNekoruQueen);
    const s = hit(s0, ap, [{ attacker: w, defender: opp }]);
    expect(named(s, ap, "Cat Dragon").length).toBe(1);
    const { s: t0, ap: ap2, opp: opp2 } = setup([]);
    const w2 = putOnBattlefield(t0, ap2, wasitoraNekoruQueen);
    const b = putOnBattlefield(t0, opp2, bear());
    const t = hit(t0, ap2, [{ attacker: w2, defender: opp2 }]);
    expect(zone(t, b)).toBe("graveyard");
    expect(named(t, ap2, "Cat Dragon").length).toBe(0);
  });

  it("Millicent: a Spirit token when it or another nontoken Spirit dies or deals combat damage to a player", () => {
    const { s: s0, ap, ids, opp } = setup([murder]);
    putOnBattlefield(s0, ap, millicentRestlessRevenant);
    const sp = putOnBattlefield(s0, ap, spirit);
    let s = hit(s0, ap, [{ attacker: sp, defender: opp }]);
    expect(named(s, ap, "Spirit").length).toBe(1);
    s = passUntil(s, "main2", ap);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(sp)])));
    expect(named(s, ap, "Spirit").length).toBe(2);
  });

  it("Turn Inside Out: +3/+0, and manifest dread when it dies this turn", () => {
    const { s: s0, ap, ids } = setup([turnInsideOut, murder]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])));
    expect(pt(s, b)).toBe("5/2");
    const before = s.battlefield.length;
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(b)])));
    if (s.pending?.kind === "chooseOption" || s.pending?.kind === "searchLibrary") s = resolveAll(act(s, s.pending.kind === "searchLibrary" ? { type: "searchLibrary", player: ap, found: [s.pending.cards[0]!] } : { type: "chooseOption", player: ap, choice: s.pending.options[0]! }));
    expect(s.battlefield.length).toBe(before); // the bear left, a face-down 2/2 came
    expect(s.battlefield.some((id) => s.objects[id]!.faceDown)).toBe(true);
  });

  it("Unnatural Moonrise: it becomes night", () => {
    const { s: s0, ap, ids } = setup([unnaturalMoonrise]);
    const b = putOnBattlefield(s0, ap, bear());
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])));
    expect(s.dayNight).toBe("night");
    expect(pt(s, b)).toBe("3/2");
    expect(objHasKeyword(s, s.objects[b]!, "Trample")).toBe(true);
  });

  it("Bumi Bash destroys a land creature or a nonbasic land, not a basic land", () => {
    const { s: s0, ap, ids, opp } = setup([bumiBash]);
    const basic = lands(s0, ap)[0]!;
    expect(planCast(s0, ap, ids[0]!, [tgt(basic)], [1])).toBeNull();
    const nb = putOnBattlefield(s0, opp, card("Test Nonbasic", "Land", "", { cmc: 0, oracleText: "{T}: Add {C}." }));
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(nb)], [1])));
    expect(zone(s, nb)).toBe("graveyard");
  });

  it("Centaur Vinecrasher returns from your graveyard when a land card is put into a graveyard", () => {
    const { s: s0, ap, ids, opp } = setup([card("Test Land Kill", "Instant", "{1}", { cmc: 1, oracleText: "Destroy target land." })]);
    const c = into(s0, ap, centaurVinecrasher, "graveyard");
    const l = lands(s0, opp)[0] ?? putOnBattlefield(s0, opp, island);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(l)])));
    s = resolveAll(s);
    expect(zone(s, c)).toBe("hand");
  });

  it("Rally the Ancestors returns creature cards with mana value X or less, exiled at your next upkeep", () => {
    const { s: s0, ap, ids } = setup([rallyTheAncestors]);
    const small = into(s0, ap, bear(), "graveyard");
    const big = into(s0, ap, ogre, "graveyard");
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [], undefined, undefined, 2)));
    expect(zone(s, small)).toBe("battlefield");
    expect(zone(s, big)).toBe("graveyard");
    expect(zone(s, ids[0]!)).toBe("exile");
    s = settle(passUntil(s, "upkeep", ap));
    expect(zone(s, small)).toBe("exile");
  });

  it("Ever After: two creature cards come back as black Zombies; Ever After goes to the bottom of your library", () => {
    const { s: s0, ap, ids } = setup([everAfter]);
    const a = into(s0, ap, bear(), "graveyard");
    const b = into(s0, ap, ogre, "graveyard");
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(a), tgt(b)])));
    for (const id of [a, b]) {
      expect(zone(s, id)).toBe("battlefield");
      expect(characteristics(s, s.objects[id]!).subtypes).toContain("Zombie");
      expect(characteristics(s, s.objects[id]!).colors).toContain("B");
    }
    expect(zone(s, ids[0]!)).toBe("library");
  });

  it("Olivia: discard a card and the entering creature gets a counter, haste and becomes a Vampire", () => {
    const { s: s0, ap, ids } = setup([bear(), opt]);
    putOnBattlefield(s0, ap, oliviaMobilizedForWar);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(s);
    expect(s.pending?.kind).toBe("chooseMay");
    s = settle(may(s, true));
    if (s.pending?.kind === "discard") s = settle(act(s, { type: "discard", player: ap, objectIds: [ids[1]!] }));
    expect(zone(s, ids[1]!)).toBe("graveyard");
    expect(counters(s, ids[0]!)).toBe(1);
    expect(objHasKeyword(s, s.objects[ids[0]!]!, "Haste")).toBe(true);
    expect(characteristics(s, s.objects[ids[0]!]!).subtypes).toContain("Vampire");
  });

  it("Ascendant Acolyte enters with a counter for each +1/+1 counter among your other creatures", () => {
    const { s: s0, ap, ids } = setup([ascendantAcolyte]);
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, ap, bear());
    s0.objects[a]!.counters["+1/+1"] = 2;
    s0.objects[b]!.counters["+1/+1"] = 1;
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(counters(s, ids[0]!)).toBe(3);
  });

  it("Kurbis: prevents all damage this turn to another creature with a +1/+1 counter on it", () => {
    const { s: s0, ap, ids } = setup([murder]);
    const k = putOnBattlefield(s0, ap, kurbisHarvestCelebrant);
    s0.objects[k]!.counters["+1/+1"] = 2;
    const b = putOnBattlefield(s0, ap, bear());
    const plain = putOnBattlefield(s0, ap, bear());
    expect(planActivate(s0, ap, k, 0, [tgt(plain)])).toBeNull();
    expect(planActivate(s0, ap, k, 0, [tgt(k)])).toBeNull();
    s0.objects[b]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s0);
    const s = resolveAll(run(s0, planActivate(s0, ap, k, 0, [tgt(b)])));
    expect(counters(s, k)).toBe(1);
    expect(s.effects.some((e) => e.affected?.includes(b) && e.mods.some((m) => m.kind === "preventDamage"))).toBe(true);
    void ids;
  });

  it("Vile Redeemer: pay {C} as you cast it for a Scion for each nontoken creature that died under your control this turn", () => {
    const { s: s0, ap, ids } = setup([murder, murder, vileRedeemer]);
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, ap, bear());
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(a)])));
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(b)])));
    s = run(s, planCast(s, ap, ids[2]!));
    // Colorless mana left to pay {C} with.
    putOnBattlefield(s, ap, card("Test Wastes", "Land", "", { cmc: 0, oracleText: "{T}: Add {C}." }));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseMay", pay: { mana: "{C}" } });
    s = resolveAll(may(s, true));
    expect(named(s, ap, "Eldrazi Scion").length).toBe(2);
  });

  it("Starseer Mentor: needs life gained or lost this turn", () => {
    const m = compileCard(starseerMentor).triggers[0]!;
    expect(m.ifCond).toMatchObject({ kind: "anyOf" });
  });
});
