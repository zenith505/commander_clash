// Lane B, round 20: the cards the earlier rounds skipped, least played first (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, plains, putOnBattlefield, setup } from "./helpers";
import { abilityProblem, attackProblem, blockWithoutCompany, botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, objHasKeyword, parseManaCost, planActivate, planCast, planMana, power, toughness, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
interface Answers {
  /** Answers to "choose a creature type", "choose a basic land type" or "choose one", in order. */
  options?: string[];
}
/** Everyone passes until the stack is empty, answering choices with `opts`. Stops at any other question. */
const settle = (s: GameState, opts: Answers = {}) => {
  const options = [...(opts.options ?? [])];
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseOption" && options.length) s = act(s, { type: "chooseOption", player: p.player, choice: options.shift()! });
    else if (p?.kind === "chooseMay") s = run(s, [...(p.pay?.mana ? planMana(s, p.player, parseManaCost(p.pay.mana))! : []), { type: "chooseMay", player: p.player, yes: true }]);
    else if (p) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const subtypes = (s: GameState, id: string) => characteristics(s, s.objects[id]!).subtypes;
const creature = (name: string, typeLine: string, manaCost: string, p: number, t: number, extra: Partial<CardDef> = {}) =>
  card(name, typeLine, manaCost, { power: String(p), toughness: String(t), ...extra });
const greenBear = () => creature("Green Bear", "Creature — Bear", "{1}{G}", 2, 2, { cmc: 2 });
const whiteKnight = () => creature("White Knight", "Creature — Human Knight", "{1}{W}", 2, 2, { cmc: 2 });
const blueBird = () => creature("Blue Bird", "Creature — Bird", "{1}{U}", 1, 1, { cmc: 2, keywords: ["Flying"], oracleText: "Flying" });
const into = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "graveyard" | "library" = "hand") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = []) => run(s, planCast(s, pid, id, targets));
const activateNow = (s: GameState, pid: PlayerId, id: string, index: number, targets: TargetChoice[] = [], costs?: CostChoices) =>
  run(s, planActivate(s, pid, id, index, targets, undefined, undefined, undefined, costs));
/** Everyone passes until `pid`'s next upkeep (their lands untap on the way). */
const toUpkeep = (s: GameState, pid: PlayerId) => passUntil(passUntil(s, "end", pid), "upkeep", pid);
/** Passes to the declare attackers step of the active player's turn and declares `attackers` at `defender`. */
const attackWith = (s: GameState, attackers: string[], defender: PlayerId) => {
  for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return settle(act(s, { type: "declareAttackers", player: s.activePlayer, attacks: attackers.map((attacker) => ({ attacker, defender })) }));
};

// Real oracle text (Scryfall).
const aurochs = card("Aurochs", "Creature — Aurochs", "{3}{G}", {"cmc":4,"power":"2","toughness":"3","keywords":["Trample"],"oracleText":"Trample\nWhenever this creature attacks, it gets +1/+0 until end of turn for each other attacking Aurochs."});
const cavalryMaster = card("Cavalry Master", "Creature — Human Knight", "{2}{W}{W}", {"cmc":4,"power":"3","toughness":"3","keywords":["Flanking"],"oracleText":"Flanking (Whenever a creature without flanking blocks this creature, the blocking creature gets -1/-1 until end of turn.)\nOther creatures you control with flanking have flanking. (Each instance of flanking triggers separately.)"});
const chaosHarlequin = card("Chaos Harlequin", "Creature — Human", "{2}{R}{R}", {"cmc":4,"power":"2","toughness":"4","oracleText":"{R}: Exile the top card of your library. If that card is a land card, this creature gets -4/-0 until end of turn. Otherwise, this creature gets +2/+0 until end of turn."});
const cylianSunsinger = card("Cylian Sunsinger", "Creature — Elf Shaman", "{1}{G}", {"cmc":2,"power":"2","toughness":"2","oracleText":"{R}{G}{W}: This creature and each other creature with the same name as it get +3/+3 until end of turn."});
const disappear = card("Disappear", "Enchantment — Aura", "{2}{U}{U}", {"cmc":4,"keywords":["Enchant"],"oracleText":"Enchant creature\n{U}: Return enchanted creature and this Aura to their owners' hands."});
const domineer = card("Domineer", "Enchantment — Aura", "{1}{U}{U}", {"cmc":3,"keywords":["Enchant"],"oracleText":"Enchant artifact creature\nYou control enchanted artifact creature."});
const elsewhereFlask = card("Elsewhere Flask", "Artifact", "{2}", {"cmc":2,"oracleText":"When this artifact enters, draw a card.\nSacrifice this artifact: Choose a basic land type. Each land you control becomes that type until end of turn."});
const elvishSoultiller = card("Elvish Soultiller", "Creature — Elf Mutant", "{3}{G}{G}", {"cmc":5,"power":"5","toughness":"4","oracleText":"When this creature dies, choose a creature type. Shuffle all creature cards of that type from your graveyard into your library."});
const fulgentDistraction = card("Fulgent Distraction", "Instant", "{2}{W}", {"cmc":3,"oracleText":"Choose two target creatures. Tap those creatures, then unattach all Equipment from them."});
const governTheGuildless = card("Govern the Guildless", "Sorcery", "{5}{U}", {"cmc":6,"keywords":["Forecast"],"oracleText":"Gain control of target monocolored creature.\nForecast — {1}{U}, Reveal this card from your hand: Target creature becomes the color or colors of your choice until end of turn. (Activate only during your upkeep and only once each turn.)"});
const harshDeceiver = card("Harsh Deceiver", "Creature — Spirit", "{3}{W}", {"cmc":4,"power":"1","toughness":"4","oracleText":"{1}: Look at the top card of your library.\n{2}: Reveal the top card of your library. If it's a land card, untap this creature and it gets +1/+1 until end of turn. Activate only once each turn."});
const homaridWarrior = card("Homarid Warrior", "Creature — Homarid Warrior", "{4}{U}", {"cmc":5,"power":"3","toughness":"3","oracleText":"{U}: This creature gains shroud until end of turn and doesn't untap during your next untap step. Tap it. (A creature with shroud can't be the target of spells or abilities.)"});
const imagecrafter = card("Imagecrafter", "Creature — Human Wizard", "{U}", {"cmc":1,"power":"1","toughness":"1","oracleText":"{T}: Choose a creature type other than Wall. Target creature becomes that type until end of turn."});
const lavaStorm = card("Lava Storm", "Instant", "{3}{R}{R}", {"cmc":5,"oracleText":"Lava Storm deals 2 damage to each attacking creature or Lava Storm deals 2 damage to each blocking creature."});
const mistformMutant = card("Mistform Mutant", "Creature — Illusion Mutant", "{4}{U}{U}", {"cmc":6,"power":"3","toughness":"4","oracleText":"{1}{U}: Choose a creature type other than Wall. Target creature becomes that type until end of turn."});
const mistformWakecaster = card("Mistform Wakecaster", "Creature — Illusion", "{4}{U}", {"cmc":5,"power":"2","toughness":"3","keywords":["Flying"],"oracleText":"Flying\n{1}: This creature becomes the creature type of your choice until end of turn.\n{2}{U}{U}, {T}: Choose a creature type. Each creature you control becomes that type until end of turn."});
const orcishConscripts = card("Orcish Conscripts", "Creature — Orc", "{R}", {"cmc":1,"power":"2","toughness":"2","oracleText":"This creature can't attack unless at least two other creatures attack.\nThis creature can't block unless at least two other creatures block."});
const piercingRays = card("Piercing Rays", "Sorcery", "{1}{W}", {"cmc":2,"keywords":["Forecast"],"oracleText":"Exile target tapped creature.\nForecast — {2}{W}, Reveal this card from your hand: Tap target untapped creature. (Activate this ability only during your upkeep and only once each turn.)"});
const plumesOfPeace = card("Plumes of Peace", "Enchantment — Aura", "{1}{W}{U}", {"cmc":3,"keywords":["Forecast","Enchant"],"oracleText":"Enchant creature\nEnchanted creature doesn't untap during its controller's untap step.\nForecast — {W}{U}, Reveal this card from your hand: Tap target creature. (Activate only during your upkeep and only once each turn.)"});
const prideOfTheClouds = card("Pride of the Clouds", "Creature — Elemental Cat", "{W}{U}", {"cmc":2,"power":"1","toughness":"1","keywords":["Flying","Forecast"],"oracleText":"Flying\nThis creature gets +1/+1 for each other creature on the battlefield with flying.\nForecast — {2}{W}{U}, Reveal this creature from your hand: Create a 1/1 white and blue Bird creature token with flying. (Activate only during your upkeep and only once each turn.)"});
const proclamationOfRebirth = card("Proclamation of Rebirth", "Sorcery", "{2}{W}", {"cmc":3,"keywords":["Forecast"],"oracleText":"Return up to three target creature cards with mana value 1 or less from your graveyard to the battlefield.\nForecast — {5}{W}, Reveal this card from your hand: Return target creature card with mana value 1 or less from your graveyard to the battlefield. (Activate only during your upkeep and only once each turn.)"});
const reignOfTerror = card("Reign of Terror", "Sorcery", "{3}{B}{B}", {"cmc":5,"oracleText":"Destroy all green creatures or all white creatures. They can't be regenerated. You lose 2 life for each creature that died this way."});
const skyHussar = card("Sky Hussar", "Creature — Human Knight", "{3}{W}{U}", {"cmc":5,"power":"4","toughness":"3","keywords":["Flying","Forecast"],"oracleText":"Flying\nWhen this creature enters, untap all creatures you control.\nForecast — Tap two untapped white and/or blue creatures you control, Reveal this card from your hand: Draw a card. (Activate only during your upkeep and only once each turn.)"});
const skyscribing = card("Skyscribing", "Sorcery", "{X}{U}{U}", {"cmc":2,"keywords":["Forecast"],"oracleText":"Each player draws X cards.\nForecast — {2}{U}, Reveal this card from your hand: Each player draws a card. (Activate only during your upkeep and only once each turn.)"});
const songstitcher = card("Songstitcher", "Creature — Human Cleric", "{W}", {"cmc":1,"power":"1","toughness":"1","oracleText":"{1}{W}: Prevent all combat damage that would be dealt this turn by target attacking creature with flying."});
const spiritEnDal = card("Spirit en-Dal", "Creature — Spirit", "{2}{W}", {"cmc":3,"power":"2","toughness":"1","keywords":["Shadow","Forecast"],"oracleText":"Shadow (This creature can block or be blocked by only creatures with shadow.)\nForecast — {1}{W}, Reveal this creature from your hand: Target creature gains shadow until end of turn. (Activate only during your upkeep and only once each turn.)"});
const standardize = card("Standardize", "Instant", "{U}{U}", {"cmc":2,"oracleText":"Choose a creature type other than Wall. Each creature becomes that type until end of turn."});
const steelingStance = card("Steeling Stance", "Instant", "{1}{W}{W}", {"cmc":3,"keywords":["Forecast"],"oracleText":"Creatures you control get +1/+1 until end of turn.\nForecast — {W}, Reveal this card from your hand: Target creature gets +1/+1 until end of turn. (Activate only during your upkeep and only once each turn.)"});
const telimTor = card("Telim'Tor", "Legendary Creature — Human Knight", "{4}{R}", {"cmc":5,"power":"2","toughness":"2","keywords":["Flanking"],"oracleText":"Flanking (Whenever a creature without flanking blocks this creature, the blocking creature gets -1/-1 until end of turn.)\nWhenever Telim'Tor attacks, all attacking creatures with flanking get +1/+1 until end of turn."});
const terraformer = card("Terraformer", "Creature — Human Wizard", "{2}{U}", {"cmc":3,"power":"2","toughness":"2","oracleText":"{1}: Choose a basic land type. Each land you control becomes that type until end of turn."});
const tsabosDecree = card("Tsabo's Decree", "Instant", "{5}{B}", {"cmc":6,"oracleText":"Choose a creature type. Target player reveals their hand and discards all creature cards of that type. Then destroy all creatures of that type that player controls. They can't be regenerated."});
const unnaturalSelection = card("Unnatural Selection", "Enchantment", "{1}{U}", {"cmc":2,"oracleText":"{1}: Choose a creature type other than Wall. Target creature becomes that type until end of turn."});
const visceridDrone = card("Viscerid Drone", "Creature — Homarid Drone", "{1}{U}", {"cmc":2,"power":"1","toughness":"2","oracleText":"{T}, Sacrifice a creature and a Swamp: Destroy target nonartifact creature. It can't be regenerated.\n{T}, Sacrifice a creature and a snow Swamp: Destroy target creature. It can't be regenerated."});
const writOfPassage = card("Writ of Passage", "Enchantment — Aura", "{U}", {"cmc":1,"keywords":["Forecast","Enchant"],"oracleText":"Enchant creature\nWhenever enchanted creature attacks, if its power is 2 or less, it can't be blocked this turn.\nForecast — {1}{U}, Reveal this card from your hand: Target creature with power 2 or less can't be blocked this turn. (Activate only during your upkeep and only once each turn.)"});

describe("forecast (CR 702.57)", () => {
  it("compiles the forecast cards", () => supported(governTheGuildless, piercingRays, plumesOfPeace, prideOfTheClouds, proclamationOfRebirth, skyHussar, skyscribing, spiritEnDal, steelingStance, writOfPassage));

  it("Steeling Stance: only during your upkeep, only once each turn, and the card stays in your hand", () => {
    const { s: s0, ap, ids } = setup([steelingStance]);
    const stance = ids[0]!;
    const bear = putOnBattlefield(s0, ap, greenBear());
    // Not in a main phase (CR 702.57b).
    expect(abilityProblem(s0, ap, stance, 0, [tgt(bear)])).toMatch(/can.t be activated now/);
    let s = toUpkeep(s0, ap);
    expect(s.step).toBe("upkeep");
    s = settle(activateNow(s, ap, stance, 0, [tgt(bear)]));
    expect(pt(s, bear)).toBe("3/3");
    expect(zone(s, stance)).toBe("hand");
    expect(s.players[ap]!.hand).toContain(stance);
    expect(abilityProblem(s, ap, stance, 0, [tgt(bear)])).toMatch(/once each turn/);
    // Not during an opponent's upkeep either.
    let t = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    while (waitingOn(t) !== ap) t = act(t, { type: "passPriority", player: waitingOn(t)! });
    expect(t.step).toBe("upkeep");
    expect(abilityProblem(t, ap, stance, 0, [tgt(bear)])).toMatch(/can.t be activated now/);
  });

  it("the bot reveals a forecast card in its own upkeep, and not in its main phase", () => {
    const { s: s0, ap, ids } = setup([steelingStance]);
    putOnBattlefield(s0, ap, greenBear());
    const forecast = (s: GameState) => botActions(s, ap).some((a) => a.type === "activateAbility" && a.objectId === ids[0]);
    expect(forecast(s0)).toBe(false);
    const s = toUpkeep(s0, ap);
    expect(forecast(s)).toBe(true);
  });

  it("Skyscribing: each player draws a card; the spell itself draws X", () => {
    const { s: s0, ap, ids } = setup([skyscribing]);
    let s = toUpkeep(s0, ap);
    const hands = s.turnOrder.map((p) => s.players[p]!.hand.length);
    s = settle(activateNow(s, ap, ids[0]!, 0));
    expect(s.turnOrder.map((p) => s.players[p]!.hand.length)).toEqual(hands.map((n) => n + 1));
    expect(zone(s, ids[0]!)).toBe("hand");
  });

  it("Sky Hussar: tap two untapped white and/or blue creatures you control to draw", () => {
    const { s: s0, ap, ids } = setup([skyHussar]);
    const knight = putOnBattlefield(s0, ap, whiteKnight());
    const bird = putOnBattlefield(s0, ap, blueBird());
    const bear = putOnBattlefield(s0, ap, greenBear());
    let s = toUpkeep(s0, ap);
    expect(abilityProblem(s, ap, ids[0]!, 0, [], undefined, undefined, undefined, { tap: [knight, bear] })).not.toBeNull();
    const hand = s.players[ap]!.hand.length;
    s = settle(activateNow(s, ap, ids[0]!, 0, [], { tap: [knight, bird] }));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.objects[knight]!.tapped && s.objects[bird]!.tapped).toBe(true);
    expect(s.objects[bear]!.tapped).toBe(false);
  });

  it("Writ of Passage: target creature with power 2 or less can't be blocked this turn", () => {
    const { s: s0, ap, ids } = setup([writOfPassage]);
    const bear = putOnBattlefield(s0, ap, greenBear());
    let s = toUpkeep(s0, ap);
    s = settle(activateNow(s, ap, ids[0]!, 0, [tgt(bear)]));
    expect(characteristics(s, s.objects[bear]!).cantBeBlocked).toBe(true);
  });

  it("Proclamation of Rebirth: returns a creature card with mana value 1 or less from your graveyard", () => {
    const { s: s0, ap, ids } = setup([proclamationOfRebirth]);
    const conscripts = into(s0, ap, orcishConscripts, "graveyard");
    let s = toUpkeep(s0, ap);
    s = settle(activateNow(s, ap, ids[0]!, 0, [tgt(conscripts)]));
    expect(zone(s, conscripts)).toBe("battlefield");
    expect(zone(s, ids[0]!)).toBe("hand");
  });
});

describe("chosen creature and land types", () => {
  it("compiles them", () => supported(imagecrafter, mistformMutant, mistformWakecaster, standardize, unnaturalSelection, elsewhereFlask, terraformer, tsabosDecree, elvishSoultiller));

  it("Unnatural Selection: target creature becomes the chosen type (CR 205.1b: it loses its other creature types)", () => {
    const { s: s0, ap, ids } = setup([unnaturalSelection]);
    const bear = putOnBattlefield(s0, ap, greenBear());
    let s = settle(castNow(s0, ap, ids[0]!));
    s = settle(activateNow(s, ap, ids[0]!, 0, [tgt(bear)]));
    expect(s.pending?.kind === "chooseOption" && s.pending.options).not.toContain("Wall");
    s = settle(s, { options: ["Goblin"] });
    expect(subtypes(s, bear)).toEqual(["Goblin"]);
  });

  it("Standardize: each creature becomes the chosen type until end of turn", () => {
    const { s: s0, ap, ids, opp } = setup([standardize]);
    const bear = putOnBattlefield(s0, ap, greenBear());
    const knight = putOnBattlefield(s0, opp, whiteKnight());
    let s = settle(castNow(s0, ap, ids[0]!), { options: ["Elf"] });
    expect(subtypes(s, bear)).toEqual(["Elf"]);
    expect(subtypes(s, knight)).toEqual(["Elf"]);
    s = passUntil(s, "upkeep");
    expect(subtypes(s, knight)).toEqual(["Human", "Knight"]);
  });

  it("Terraformer: each land you control becomes the chosen basic land type", () => {
    const { s: s0, ap } = setup([]);
    const former = putOnBattlefield(s0, ap, terraformer);
    const forest = s0.battlefield.find((id) => characteristics(s0, s0.objects[id]!).name === "Forest" && controllerOf(s0, s0.objects[id]!) === ap)!;
    const s = settle(activateNow(s0, ap, former, 0), { options: ["Island"] });
    expect(subtypes(s, forest)).toEqual(["Island"]);
  });

  it("Tsabo's Decree: discards and destroys only the chosen type", () => {
    const { s: s0, ap, ids, opp } = setup([tsabosDecree]);
    const bearOnField = putOnBattlefield(s0, opp, greenBear());
    const knight = putOnBattlefield(s0, opp, whiteKnight());
    const mine = putOnBattlefield(s0, ap, greenBear());
    const bearInHand = into(s0, opp, greenBear());
    const knightInHand = into(s0, opp, whiteKnight());
    const s = settle(castNow(s0, ap, ids[0]!, [{ kind: "player", id: opp }]), { options: ["Bear"] });
    expect(zone(s, bearOnField)).toBe("graveyard");
    expect(zone(s, bearInHand)).toBe("graveyard");
    expect(zone(s, knight)).toBe("battlefield");
    expect(zone(s, knightInHand)).toBe("hand");
    expect(zone(s, mine)).toBe("battlefield");
  });
});

describe("Reign of Terror and Lava Storm: one of two groups", () => {
  it("compiles them", () => supported(reignOfTerror, lavaStorm));

  it("Reign of Terror: you lose 2 life for each creature that died, not one that survived (CR 700.4)", () => {
    const { s: s0, ap, ids, opp } = setup([reignOfTerror]);
    putOnBattlefield(s0, ap, greenBear());
    putOnBattlefield(s0, opp, greenBear());
    const tough = putOnBattlefield(s0, opp, creature("Tough Bear", "Creature — Bear", "{1}{G}", 2, 2, { keywords: ["Indestructible"], oracleText: "Indestructible" }));
    const knight = putOnBattlefield(s0, opp, whiteKnight());
    const before = life(s0, ap);
    let s = settle(castNow(s0, ap, ids[0]!));
    expect(s.pending?.kind).toBe("chooseOption");
    s = settle(s, { options: ["0"] });
    expect(life(s, ap)).toBe(before - 4);
    expect(zone(s, tough)).toBe("battlefield");
    expect(zone(s, knight)).toBe("battlefield");
  });

  it("Lava Storm: 2 damage to each attacking creature, or to each blocking creature", () => {
    const { s: s0, ap, ids, opp } = setup([lavaStorm]);
    const attacker = putOnBattlefield(s0, ap, greenBear());
    const home = putOnBattlefield(s0, ap, whiteKnight());
    let s = attackWith(s0, [attacker], opp);
    s = settle(castNow(s, ap, ids[0]!), { options: ["0"] });
    expect(zone(s, attacker)).toBe("graveyard");
    expect(zone(s, home)).toBe("battlefield");
  });
});

describe("Orcish Conscripts: can't attack or block unless two other creatures do (CR 508.1c, 509.1b)", () => {
  it("compiles it", () => supported(orcishConscripts));

  it("attacks only with two other attackers", () => {
    const { s: s0, ap, opp } = setup([]);
    const orc = putOnBattlefield(s0, ap, orcishConscripts);
    const a = putOnBattlefield(s0, ap, greenBear());
    const b = putOnBattlefield(s0, ap, whiteKnight());
    let s = s0;
    for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [orc, a].map((attacker) => ({ attacker, defender: opp })) })).toThrow(/at least 2 other creatures/);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [orc, a, b].map((attacker) => ({ attacker, defender: opp })) });
    expect(s.objects[orc]!.attacking).toBe(opp);
    expect(attackProblem(s0, s0.objects[orc]!, opp)).toBeNull();
  });

  it("blocks only with two other blockers", () => {
    const { s: s0, opp } = setup([]);
    const orc = putOnBattlefield(s0, opp, orcishConscripts);
    const a = putOnBattlefield(s0, opp, greenBear());
    const b = putOnBattlefield(s0, opp, whiteKnight());
    expect(blockWithoutCompany(s0, [{ blocker: orc }, { blocker: a }], 0)).toMatch(/at least 2 other creatures/);
    expect(blockWithoutCompany(s0, [{ blocker: orc }, { blocker: a }, { blocker: b }], 0)).toBeNull();
    expect(blockWithoutCompany(s0, [{ blocker: orc }, { blocker: a }], 1)).toBeNull();
    expect(blockWithoutCompany(s0, [{ blocker: a }], 0)).toBeNull();
  });
});

describe("attack triggers: Aurochs and Telim'Tor", () => {
  it("compiles them", () => supported(aurochs, telimTor, cavalryMaster));

  it("Aurochs: +1/+0 for each other attacking Aurochs (a creature type, not its name, CR 205.3m)", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, aurochs);
    const b = putOnBattlefield(s0, ap, aurochs);
    const s = attackWith(s0, [a, b], opp);
    expect(pt(s, a)).toBe("3/3");
    expect(pt(s, b)).toBe("3/3");
  });

  it("Telim'Tor: all attacking creatures with flanking get +1/+1", () => {
    const { s: s0, ap, opp } = setup([]);
    const telim = putOnBattlefield(s0, ap, telimTor);
    const master = putOnBattlefield(s0, ap, cavalryMaster);
    const bear = putOnBattlefield(s0, ap, greenBear());
    const s = attackWith(s0, [telim, master, bear], opp);
    expect(pt(s, telim)).toBe("3/3");
    expect(pt(s, master)).toBe("4/4");
    expect(pt(s, bear)).toBe("2/2");
  });
});

describe("other skipped cards", () => {
  it("compiles them", () => supported(chaosHarlequin, cylianSunsinger, disappear, domineer, fulgentDistraction, harshDeceiver, homaridWarrior, songstitcher, visceridDrone, writOfPassage));

  it("Chaos Harlequin: -4/-0 for an exiled land, +2/+0 otherwise", () => {
    const { s: s0, ap } = setup([]);
    const harlequin = putOnBattlefield(s0, ap, chaosHarlequin);
    const land = into(s0, ap, card("Top Land", "Land"), "library");
    let s = settle(activateNow(s0, ap, harlequin, 0));
    expect(zone(s, land)).toBe("exile");
    expect(pt(s, harlequin)).toBe("-2/4");
    const bear = into(s, ap, greenBear(), "library");
    s = settle(activateNow(s, ap, harlequin, 0));
    expect(zone(s, bear)).toBe("exile");
    expect(pt(s, harlequin)).toBe("0/4");
  });

  it("Harsh Deceiver: a revealed land untaps it and gives +1/+1", () => {
    const { s: s0, ap } = setup([]);
    const deceiver = putOnBattlefield(s0, ap, harshDeceiver);
    s0.objects[deceiver]!.tapped = true;
    into(s0, ap, card("Top Land", "Land"), "library");
    const s = settle(activateNow(s0, ap, deceiver, 1));
    expect(s.objects[deceiver]!.tapped).toBe(false);
    expect(pt(s, deceiver)).toBe("2/5");
    expect(abilityProblem(s, ap, deceiver, 1)).toMatch(/once each turn/);
  });

  it("Cylian Sunsinger: it and each other creature with its name get +3/+3", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, cylianSunsinger);
    const b = putOnBattlefield(s0, opp, cylianSunsinger);
    const bear = putOnBattlefield(s0, ap, greenBear());
    const s = settle(activateNow(s0, ap, a, 0));
    expect(pt(s, a)).toBe("5/5");
    expect(pt(s, b)).toBe("5/5");
    expect(pt(s, bear)).toBe("2/2");
  });

  it("Disappear: returns enchanted creature and the Aura to their owners' hands", () => {
    const { s: s0, ap, ids, opp } = setup([disappear]);
    const knight = putOnBattlefield(s0, opp, whiteKnight());
    const s1 = settle(castNow(s0, ap, ids[0]!, [tgt(knight)]));
    const s = settle(activateNow(s1, ap, ids[0]!, 0));
    expect(zone(s, knight)).toBe("hand");
    expect(s.players[opp]!.hand).toContain(knight);
    expect(s.players[ap]!.hand).toContain(ids[0]!);
  });

  it("Domineer: you control the enchanted artifact creature", () => {
    const { s: s0, ap, ids, opp } = setup([domineer]);
    const golem = putOnBattlefield(s0, opp, creature("Test Golem", "Artifact Creature — Golem", "{3}", 3, 3));
    const bear = putOnBattlefield(s0, opp, greenBear());
    expect(planCast(s0, ap, ids[0]!, [tgt(bear)])).toBeNull();
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(golem)]));
    expect(controllerOf(s, s.objects[golem]!)).toBe(ap);
  });

  it("Fulgent Distraction: taps two creatures and unattaches their Equipment", () => {
    const { s: s0, ap, ids, opp } = setup([fulgentDistraction]);
    const a = putOnBattlefield(s0, opp, greenBear());
    const b = putOnBattlefield(s0, opp, whiteKnight());
    const sword = putOnBattlefield(s0, opp, card("Test Sword", "Artifact — Equipment", "{1}", { oracleText: "Equipped creature gets +1/+1.\nEquip {1}" }));
    s0.objects[sword]!.attachedTo = a;
    invalidateCharacteristics(s0);
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(a), tgt(b)]));
    expect(s.objects[a]!.tapped && s.objects[b]!.tapped).toBe(true);
    expect(s.objects[sword]!.attachedTo).toBeUndefined();
    expect(zone(s, sword)).toBe("battlefield");
  });

  it("Homarid Warrior: gains shroud, is tapped, and skips its next untap", () => {
    const { s: s0, ap } = setup([]);
    const warrior = putOnBattlefield(s0, ap, homaridWarrior);
    let s = settle(activateNow(s0, ap, warrior, 0));
    expect(objHasKeyword(s, s.objects[warrior]!, "Shroud")).toBe(true);
    expect(s.objects[warrior]!.tapped).toBe(true);
    s = toUpkeep(s, ap);
    expect(s.objects[warrior]!.tapped).toBe(true);
  });

  it("Songstitcher: prevents the combat damage of an attacking creature with flying", () => {
    const { s: s0, ap, opp } = setup([]);
    const stitcher = putOnBattlefield(s0, opp, songstitcher);
    for (const land of [plains, plains]) putOnBattlefield(s0, opp, land);
    const bird = putOnBattlefield(s0, ap, blueBird());
    const bear = putOnBattlefield(s0, ap, greenBear());
    let s = attackWith(s0, [bird, bear], opp);
    expect(planActivate(s, opp, stitcher, 0, [tgt(bear)])).toBeNull();
    // Opponent activates with priority in the declare attackers step.
    for (let i = 0; i < 8 && waitingOn(s) !== opp; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(activateNow(s, opp, stitcher, 0, [tgt(bird)]));
    const before = life(s, opp);
    s = passUntil(s, "end", ap);
    expect(life(s, opp)).toBe(before - 2);
  });

  it("Viscerid Drone: sacrifice a creature and a Swamp to destroy a nonartifact creature", () => {
    const { s: s0, ap, opp } = setup([]);
    const drone = putOnBattlefield(s0, ap, visceridDrone);
    const fodder = putOnBattlefield(s0, ap, greenBear());
    const swamp = s0.battlefield.find((id) => characteristics(s0, s0.objects[id]!).name === "Swamp" && controllerOf(s0, s0.objects[id]!) === ap)!;
    const knight = putOnBattlefield(s0, opp, whiteKnight());
    const s = settle(activateNow(s0, ap, drone, 0, [tgt(knight)], { sacrifice: [fodder, swamp] }));
    expect(zone(s, knight)).toBe("graveyard");
    expect(zone(s, fodder)).toBe("graveyard");
    expect(zone(s, swamp)).toBe("graveyard");
  });
});
