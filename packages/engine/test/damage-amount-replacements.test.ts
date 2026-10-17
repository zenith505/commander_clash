// Damage amount replacements (CR 614.1a) and prevention effects that take some of each source's damage (CR 615.1a):
// "it deals double that damage instead" (Furnace of Rath), "that much damage plus 2" (Torbran), "half that damage, rounded
// down" (Ghosts of the Innocent), "prevent 1 of that damage" (Urza's Armor). They apply to the damage as divided or
// assigned, once to each source's damage, and the player being dealt it (or the controller of the permanent) orders them
// with the other replacement and prevention effects (CR 616.1; rulings on Furnace of Rath, Torbran, Ghosts of the
// Innocent).

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, mountain, passUntil, plainsCard, putOnBattlefield, setup, swamp } from "./helpers";
import { botActions, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real oracle text (Scryfall).
const furnace = card("Furnace of Rath", "Enchantment", "{1}{R}{R}{R}", { oracleText: "If a source would deal damage to a permanent or player, it deals double that damage to that permanent or player instead." });
const torbran = card("Torbran, Thane of Red Fell", "Legendary Creature — Dwarf Noble", "{1}{R}{R}{R}", { power: "2", toughness: "4", oracleText: "If a red source you control would deal damage to an opponent or a permanent an opponent controls, it deals that much damage plus 2 instead." });
const ghosts = card("Ghosts of the Innocent", "Creature — Spirit", "{5}{W}{W}", { power: "4", toughness: "11", oracleText: "If a source would deal damage to a permanent or player, it deals half that damage, rounded down, to that permanent or player instead." });
const fieryEmancipation = card("Fiery Emancipation", "Enchantment", "{3}{R}{R}{R}", { oracleText: "If a source you control would deal damage to a permanent or player, it deals triple that damage to that permanent or player instead." });
const urzasArmor = card("Urza's Armor", "Artifact", "{6}", { oracleText: "If a source would deal damage to you, prevent 1 of that damage." });
const templeAltisaur = card("Temple Altisaur", "Creature — Dinosaur", "{4}{W}", { power: "3", toughness: "4", oracleText: "If a source would deal damage to another Dinosaur you control, prevent all but 1 of that damage." });
const gisela = card("Gisela, Blade of Goldnight", "Legendary Creature — Angel", "{4}{R}{R}{W}{W}", { power: "5", toughness: "5", keywords: ["Flying", "First strike"], oracleText: "Flying, first strike\nIf a source would deal damage to an opponent or a permanent an opponent controls, that source deals double that damage to that player or permanent instead.\nIf a source would deal damage to you or a permanent you control, prevent half that damage, rounded up." });
const callousGiant = card("Callous Giant", "Creature — Giant", "{4}{R}{R}", { power: "4", toughness: "4", oracleText: "If a source would deal 3 or less damage to this creature, prevent that damage." });
const tuskodon = card("Charging Tuskodon", "Creature — Dinosaur", "{4}{R}{R}", { power: "4", toughness: "4", keywords: ["Trample"], oracleText: "Trample\nIf this creature would deal combat damage to a player, it deals double that damage to that player instead." });
const fireServant = card("Fire Servant", "Creature — Elemental", "{3}{R}", { power: "4", toughness: "3", oracleText: "If a red instant or sorcery spell you control would deal damage, it deals double that damage instead." });
const remKarolus = card("Rem Karolus, Stalwart Slayer", "Legendary Creature — Human Angel", "{2}{R}{W}", { power: "4", toughness: "4", keywords: ["Flying", "Haste"], oracleText: "Flying, haste\nIf a spell would deal damage to you or another permanent you control, prevent that damage.\nIf a spell would deal damage to an opponent or a permanent an opponent controls, it deals that much damage plus 1 instead." });
const flail = card("Inquisitor's Flail", "Artifact — Equipment", "{2}", { keywords: ["Equip"], oracleText: "If equipped creature would deal combat damage, it deals double that damage instead.\nIf another creature would deal combat damage to equipped creature, it deals double that damage to equipped creature instead.\nEquip {2}" });
const hawkeye = card("Hawkeye, Young Avenger", "Legendary Creature — Human Archer Hero", "{2}{R}", { power: "3", toughness: "3", oracleText: "If a source you control would deal noncombat damage to an opponent or a permanent an opponent controls, instead it deals that much damage plus X, where X is Hawkeye's power." });
const unicorn = card("Benevolent Unicorn", "Creature — Unicorn", "{1}{W}", { power: "1", toughness: "2", oracleText: "If a spell would deal damage to a permanent or player, it deals that much damage minus 1 to that permanent or player instead." });
const castigator = card("Goldnight Castigator", "Creature — Human Horror", "{2}{R}{R}", { power: "4", toughness: "9", keywords: ["Flying", "Haste"], oracleText: "Flying, haste\nIf a source would deal damage to you, it deals double that damage to you instead.\nIf a source would deal damage to this creature, it deals double that damage to this creature instead." });
const thunderstaff = card("Thunderstaff", "Artifact", "{3}", { oracleText: "As long as this artifact is untapped, if a creature would deal combat damage to you, prevent 1 of that damage.\n{2}, {T}: Attacking creatures get +1/+0 until end of turn." });
// Anthem of Rakdos's second line only (its first, "it gets +2/+0 until end of turn and this enchantment deals 1 damage to
// you", is still out).
const anthemOfRakdos = card("Anthem of Rakdos", "Enchantment", "{2}{B}{R}{R}", { oracleText: "Hellbent — As long as you have no cards in hand, if a source you control would deal damage to a permanent or player, it deals double that damage to that permanent or player instead." });
const shieldOfTheRealm = card("Shield of the Realm", "Artifact — Equipment", "{2}", { keywords: ["Equip"], oracleText: "If a source would deal damage to equipped creature, prevent 2 of that damage.\nEquip {1}" });

const bolt = card("Lightning Bolt", "Instant", "{R}", { oracleText: "Lightning Bolt deals 3 damage to any target." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const healingSalve = card("Healing Salve", "Instant", "{W}", { oracleText: "Choose one —\n• Target player gains 3 life.\n• Prevent the next 3 damage that would be dealt to any target this turn." });
const sparkmage = card("Prodigal Pyromancer", "Creature — Human Wizard", "{2}{R}", { power: "1", toughness: "1", oracleText: "{T}: This creature deals 1 damage to any target." });
const goblin = card("Raging Goblin", "Creature — Goblin Berserker", "{R}", { power: "1", toughness: "1", keywords: ["Haste"], oracleText: "Haste" });
const ogre = card("Gray Ogre", "Creature — Ogre", "{2}{R}", { power: "2", toughness: "2" });
const lifelinker = card("Lifelink Test", "Creature — Cat", "{1}{W}", { power: "2", toughness: "2", keywords: ["Lifelink"], oracleText: "Lifelink" });
const dino = card("Dino Test", "Creature — Dinosaur", "{2}{G}", { power: "3", toughness: "3" });
const leyline = card("Leyline of Punishment", "Enchantment", "{2}{R}{R}", { oracleText: "If this card is in your opening hand, you may begin the game with it on the battlefield.\nPlayers can't gain life.\nDamage can't be prevented." });
const seven = card("Seven Test", "Creature — Avatar", "{6}{R}{R}", { power: "7", toughness: "7" });

const run = (s: GameState, plan: Action[] | null) => plan!.reduce((x, a) => act(x, a), s);
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const obj = (id: string): TargetChoice => ({ kind: "object", id });
const toHand = (s: GameState, pid: PlayerId, d: CardDef) => {
  const id = putOnBattlefield(s, pid, d);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Everyone passes (bots answer any choice) until the stack is empty. */
const resolveAll = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.pending); i++) s = act(s, s.pending ? botActions(s, waitingOn(s)!)[0]! : { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** `pid` casts `d` from a fresh copy in hand, with lands to pay for it, then everything resolves. */
const castAndResolve = (s: GameState, pid: PlayerId, d: CardDef, targets: TargetChoice[], modes?: number[]) => {
  const id = toHand(s, pid, d);
  for (const l of [mountain, mountain, plainsCard, plainsCard, forest, swamp]) putOnBattlefield(s, pid, l);
  while (waitingOn(s) !== pid || s.pending) s = act(s, s.pending ? botActions(s, waitingOn(s)!)[0]! : { type: "passPriority", player: waitingOn(s)! });
  return resolveAll(run(s, planCast(s, pid, id, targets, modes)));
};
/** `ap` attacks `opp` with `attackers`; `opp` blocks as given; stops at a damage question or the end of combat. */
function fight(s0: GameState, ap: PlayerId, opp: PlayerId, attackers: string[], blocks: { blocker: string; attacker: string }[] = []): GameState {
  let s = passUntil(s0, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks: attackers.map((a) => ({ attacker: a, defender: opp })) });
  for (let i = 0; i < 60 && s.step !== "endCombat" && s.pending?.kind !== "chooseOption"; i++) {
    const p = s.pending;
    s = act(s, p?.kind === "declareBlockers" ? { type: "declareBlockers", player: p.player, blocks: p.player === opp ? blocks : [] } : { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
}
const toEndOfCombat = (s: GameState) => {
  for (let i = 0; i < 60 && s.step !== "endCombat" && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const pick = (s: GameState, label: RegExp) => {
  const p = s.pending as { player: PlayerId; labels: string[]; options: string[] };
  const i = p.labels.findIndex((l) => label.test(l));
  expect(i, p.labels.join(" | ")).toBeGreaterThanOrEqual(0);
  return act(s, { type: "chooseOption", player: p.player, choice: p.options[i]! });
};

describe("damage amount replacements", () => {
  it("are supported", () => {
    for (const d of [furnace, torbran, ghosts, fieryEmancipation, urzasArmor, templeAltisaur, gisela, callousGiant, tuskodon, fireServant, remKarolus, flail, hawkeye, unicorn, castigator, thunderstaff, anthemOfRakdos, shieldOfTheRealm]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Furnace of Rath doubles a Lightning Bolt; two of them multiply it by 4 (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, furnace);
    let s = castAndResolve(s0, ap, bolt, [player(opp)]);
    expect(life(s, opp)).toBe(40 - 6);
    putOnBattlefield(s, ap, furnace);
    s = castAndResolve(s, ap, bolt, [player(opp)]);
    expect(life(s, opp)).toBe(40 - 6 - 12);
  });

  it("Fiery Emancipation triples damage from your sources only", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, fieryEmancipation);
    let s = castAndResolve(s0, ap, shock, [player(opp)]);
    expect(life(s, opp)).toBe(34);
    s = castAndResolve(s, opp, shock, [player(ap)]);
    expect(life(s, ap)).toBe(38);
  });

  it("Torbran adds 2 to a red source's damage to an opponent, not to its controller and not from a nonred source", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, torbran);
    let s = castAndResolve(s0, ap, shock, [player(opp)]);
    expect(life(s, opp)).toBe(36);
    s = castAndResolve(s, ap, shock, [player(ap)]);
    expect(life(s, ap)).toBe(38);
    const salve = card("Colorless Ping", "Instant", "{1}", { oracleText: "Colorless Ping deals 1 damage to any target." });
    s = castAndResolve(s, ap, salve, [player(opp)]);
    expect(life(s, opp)).toBe(35);
  });

  it("Torbran and Furnace of Rath: the player being dealt the damage orders them, a bot doubling first (3 * 2 + 2)", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, torbran);
    putOnBattlefield(s0, ap, furnace);
    const s = castAndResolve(s0, ap, bolt, [player(opp)]);
    expect(life(s, opp)).toBe(40 - 8);
  });

  it("combat: the defending player is asked which applies first, and adding 2 first makes it (2 + 2) * 2", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, torbran);
    putOnBattlefield(s0, opp, furnace);
    const g = putOnBattlefield(s0, ap, ogre);
    let s = fight(s0, ap, opp, [g]);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: opp, what: "damageShield", prompt: `Damage to ${s.players[opp]!.name}: which applies first?` });
    expect((s.pending as { labels: string[] }).labels).toEqual(["Double it (Furnace of Rath)", "Add 2 (Torbran, Thane of Red Fell)"]);
    s = toEndOfCombat(pick(s, /^Add 2/));
    expect(life(s, opp)).toBe(40 - 8);
  });

  it("combat: doubling first makes it 2 * 2 + 2", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, torbran);
    putOnBattlefield(s0, opp, furnace);
    const g = putOnBattlefield(s0, ap, ogre);
    const s = toEndOfCombat(pick(fight(s0, ap, opp, [g]), /^Double it/));
    expect(life(s, opp)).toBe(40 - 6);
  });

  it("no question when the order can't matter: two doublers", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, furnace);
    putOnBattlefield(s0, opp, furnace);
    const s = toEndOfCombat(fight(s0, ap, opp, [putOnBattlefield(s0, ap, ogre)]));
    expect(s.pending).toBeFalsy();
    expect(life(s, opp)).toBe(40 - 8);
  });

  it("Furnace of Rath and a prevention shield: preventing first (rulings: 5 damage, prevent 4, then double the 1)", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, furnace);
    s0.players[opp]!.preventNext = 4;
    const five = card("Five Test", "Creature — Beast", "{4}{G}", { power: "5", toughness: "5" });
    let s = fight(s0, ap, opp, [putOnBattlefield(s0, ap, five)]);
    expect((s.pending as { labels: string[] }).labels).toEqual(["Prevent 4 of it", "Double it (Furnace of Rath)"]);
    s = toEndOfCombat(pick(s, /^Prevent 4/));
    expect(life(s, opp)).toBe(40 - 2);
    expect(s.players[opp]!.preventNext ?? 0).toBe(0);
  });

  it("... or doubling first: 10, then 4 of it prevented", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, furnace);
    s0.players[opp]!.preventNext = 4;
    const five = card("Five Test", "Creature — Beast", "{4}{G}", { power: "5", toughness: "5" });
    const s = toEndOfCombat(pick(fight(s0, ap, opp, [putOnBattlefield(s0, ap, five)]), /^Double it/));
    expect(life(s, opp)).toBe(40 - 6);
  });

  it("a bot prevents first outside combat (Healing Salve on itself, then a doubled Lightning Bolt)", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, furnace);
    let s = castAndResolve(s0, opp, healingSalve, [player(opp)], [1]);
    s = castAndResolve(s, ap, bolt, [player(opp)]);
    expect(life(s, opp)).toBe(40);
  });

  it("Ghosts of the Innocent halves, rounded down; 1 damage becomes none", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, ghosts);
    let s = castAndResolve(s0, ap, bolt, [player(opp)]);
    expect(life(s, opp)).toBe(39);
    const p = putOnBattlefield(s, ap, sparkmage);
    s = resolveAll(run(s, planActivate(s, ap, p, 0, [player(opp)])));
    expect(life(s, opp)).toBe(39);
  });

  it("Ghosts of the Innocent and Furnace of Rath: 3 damage halved then doubled is 2 (rulings), a bot's choice", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, ghosts);
    putOnBattlefield(s0, ap, furnace);
    const s = castAndResolve(s0, ap, bolt, [player(opp)]);
    expect(life(s, opp)).toBe(38);
  });

  it("Ghosts of the Innocent isn't prevention: damage that can't be prevented is still halved (rulings on Excruciator)", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, ghosts);
    putOnBattlefield(s0, ap, leyline);
    const s = toEndOfCombat(fight(s0, ap, opp, [putOnBattlefield(s0, ap, seven)]));
    expect(life(s, opp)).toBe(40 - 3);
  });

  it("damage that's doubled is still combat damage from its source: lifelink gains the doubled amount", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, furnace);
    const before = life(s0, ap);
    const s = toEndOfCombat(fight(s0, ap, opp, [putOnBattlefield(s0, ap, lifelinker)]));
    expect(life(s, opp)).toBe(36);
    expect(life(s, ap)).toBe(before + 4);
  });

  it("Urza's Armor prevents 1 from each source's damage to you (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, urzasArmor);
    const s = toEndOfCombat(fight(s0, ap, opp, [putOnBattlefield(s0, ap, ogre), putOnBattlefield(s0, ap, goblin)]));
    expect(life(s, opp)).toBe(40 - 1);
  });

  it("prevention effects don't apply when damage can't be prevented (Leyline of Punishment and Urza's Armor)", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, urzasArmor);
    putOnBattlefield(s0, ap, leyline);
    const s = toEndOfCombat(fight(s0, ap, opp, [putOnBattlefield(s0, ap, seven)]));
    expect(life(s, opp)).toBe(40 - 7);
  });

  it("Temple Altisaur prevents all but 1 to another Dinosaur you control, not to itself", () => {
    const { s: s0, ap, opp } = setup([]);
    const t = putOnBattlefield(s0, opp, templeAltisaur);
    const d = putOnBattlefield(s0, opp, dino);
    let s = castAndResolve(s0, ap, bolt, [obj(d)]);
    expect(s.objects[d]!.damage).toBe(1);
    s = castAndResolve(s, ap, bolt, [obj(t)]);
    expect(s.objects[t]!.damage).toBe(3);
  });

  it("Gisela doubles damage to her controller's opponents and prevents half the damage to her controller, rounded up", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, gisela);
    let s = castAndResolve(s0, ap, bolt, [player(opp)]);
    expect(life(s, opp)).toBe(34);
    s = castAndResolve(s, opp, bolt, [player(ap)]);
    expect(life(s, ap)).toBe(39);
  });

  it("Callous Giant prevents 3 or less, not 4", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, opp, callousGiant);
    let s = castAndResolve(s0, ap, bolt, [obj(g)]);
    expect(s.objects[g]!.damage).toBe(0);
    putOnBattlefield(s, ap, torbran);
    s = castAndResolve(s, ap, shock, [obj(g)]);
    // Shock's 2 plus 2 is 4 if Torbran applies first; its controller may prevent the 2 first instead (CR 616.1).
    expect(s.objects[g]!.damage).toBe(0);
  });

  it("Charging Tuskodon doubles its trample damage to the player only, as it's dealt (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const t = putOnBattlefield(s0, ap, tuskodon);
    const b = putOnBattlefield(s0, opp, card("Three Test", "Creature — Wall", "{2}{W}", { power: "0", toughness: "3" }));
    const s = toEndOfCombat(fight(s0, ap, opp, [t], [{ blocker: b, attacker: t }]));
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(life(s, opp)).toBe(40 - 2);
  });

  it("Fire Servant doubles a red instant's damage, not a creature's ability", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, fireServant);
    let s = castAndResolve(s0, ap, bolt, [player(opp)]);
    expect(life(s, opp)).toBe(34);
    const p = putOnBattlefield(s, ap, sparkmage);
    s = resolveAll(run(s, planActivate(s, ap, p, 0, [player(opp)])));
    expect(life(s, opp)).toBe(33);
  });

  it("Rem Karolus: spells' damage to you is prevented, to opponents it's 1 more; a creature's isn't changed", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, remKarolus);
    let s = castAndResolve(s0, opp, bolt, [player(ap)]);
    expect(life(s, ap)).toBe(40);
    s = castAndResolve(s, ap, bolt, [player(opp)]);
    expect(life(s, opp)).toBe(36);
    const p = putOnBattlefield(s, ap, sparkmage);
    s = resolveAll(run(s, planActivate(s, ap, p, 0, [player(opp)])));
    expect(life(s, opp)).toBe(35);
  });

  it("Benevolent Unicorn takes 1 away from a spell's damage", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, unicorn);
    const s = castAndResolve(s0, ap, bolt, [player(opp)]);
    expect(life(s, opp)).toBe(38);
  });

  it("Inquisitor's Flail doubles the equipped creature's combat damage", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, ogre);
    const f = putOnBattlefield(s0, ap, flail);
    s0.objects[f]!.attachedTo = g;
    invalidateCharacteristics(s0);
    const s = toEndOfCombat(fight(s0, ap, opp, [g]));
    expect(life(s, opp)).toBe(36);
  });

  it("Shield of the Realm prevents 2 of each source's damage to the equipped creature", () => {
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, opp, bear());
    const f = putOnBattlefield(s0, opp, shieldOfTheRealm);
    s0.objects[f]!.attachedTo = b;
    invalidateCharacteristics(s0);
    const s = castAndResolve(s0, ap, bolt, [obj(b)]);
    expect(s.objects[b]!.damage).toBe(1);
  });

  it("Hawkeye adds its power to noncombat damage to an opponent", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, hawkeye);
    const s = castAndResolve(s0, ap, shock, [player(opp)]);
    expect(life(s, opp)).toBe(35);
  });

  it("Goldnight Castigator doubles damage to its controller and to itself", () => {
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, opp, castigator);
    let s = castAndResolve(s0, ap, shock, [player(opp)]);
    expect(life(s, opp)).toBe(36);
    s = castAndResolve(s, ap, shock, [obj(c)]);
    expect(s.objects[c]!.damage).toBe(4);
  });

  it("Thunderstaff prevents 1 of each creature's combat damage only while it's untapped", () => {
    const { s: s0, ap, opp } = setup([]);
    const t = putOnBattlefield(s0, opp, thunderstaff);
    let s = toEndOfCombat(fight(s0, ap, opp, [putOnBattlefield(s0, ap, ogre)]));
    expect(life(s, opp)).toBe(39);
    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    const t1 = putOnBattlefield(s1, opp1, thunderstaff);
    s1.objects[t1]!.tapped = true;
    s = toEndOfCombat(fight(s1, ap1, opp1, [putOnBattlefield(s1, ap1, ogre)]));
    expect(life(s, opp1)).toBe(38);
    expect(t).toBeTruthy();
  });

  it("Anthem of Rakdos doubles only while you have no cards in hand (hellbent)", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, anthemOfRakdos);
    toHand(s0, ap, forest);
    let s = castAndResolve(s0, ap, shock, [player(opp)]);
    expect(life(s, opp)).toBe(38);
    s.players[ap]!.hand = [];
    invalidateCharacteristics(s);
    s = castAndResolve(s, ap, shock, [player(opp)]);
    expect(life(s, opp)).toBe(34);
  });

  it("redirected damage is halved only once (rulings on Ghosts of the Innocent)", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, ghosts);
    const b = putOnBattlefield(s0, opp, card("Big Test", "Creature — Wall", "{2}{W}", { power: "0", toughness: "8" }));
    s0.players[opp]!.redirectNext = [{ id: "r1", n: 10, to: { object: b, zc: s0.objects[b]!.zoneChanges ?? 0 }, source: "Test Redirect" }];
    const s = castAndResolve(s0, ap, card("Six Test", "Instant", "{R}", { oracleText: "Six Test deals 6 damage to any target." }), [player(opp)]);
    expect(life(s, opp) + s.objects[b]!.damage).toBe(40 + 3);
  });
});
