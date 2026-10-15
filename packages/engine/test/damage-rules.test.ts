// Prevention and redirection effects that last the turn and aren't a shield on one permanent or player (CR 615,
// 614.9): "a source of your choice" (CR 609.7a-b, 615.8-9), chosen as the effect resolves, and "Prevent all damage that
// would be dealt to you and creatures you control this turn", which also covers permanents that arrive later (CR 611.2c).

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, mountain, passAll, passUntil, plainsCard, putOnBattlefield, setup, swamp, target } from "./helpers";
import { botActions, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real oracle text (Scryfall).
const circleRed = card("Circle of Protection: Red", "Enchantment", "{1}{W}", { oracleText: "{1}: The next time a red source of your choice would deal damage to you this turn, prevent that damage." });
const payNoHeed = card("Pay No Heed", "Instant", "{W}", { oracleText: "Prevent all damage a source of your choice would deal this turn." });
const shiningShoal = card("Shining Shoal", "Instant — Arcane", "{X}{W}{W}", { oracleText: "You may exile a white card with mana value X from your hand rather than pay this spell's mana cost.\nThe next X damage that a source of your choice would deal to you and/or creatures you control this turn is dealt to any target instead." });
const harmsWay = card("Harm's Way", "Instant", "{W}", { oracleText: "The next 2 damage that a source of your choice would deal to you and/or permanents you control this turn is dealt to any target instead." });
const sivvisRuse = card("Sivvi's Ruse", "Instant", "{2}{W}{W}", { oracleText: "If an opponent controls a Mountain and you control a Plains, you may cast this spell without paying its mana cost.\nPrevent all damage that would be dealt this turn to creatures you control." });
const safePassage = card("Safe Passage", "Instant", "{2}{W}", { oracleText: "Prevent all damage that would be dealt to you and creatures you control this turn." });
const reverseDamage = card("Reverse Damage", "Instant", "{1}{W}{W}", { oracleText: "The next time a source of your choice would deal damage to you this turn, prevent that damage. You gain life equal to the damage prevented this way." });
const deflectingPalm = card("Deflecting Palm", "Instant", "{R}{W}", { oracleText: "The next time a source of your choice would deal damage to you this turn, prevent that damage. If damage is prevented this way, Deflecting Palm deals that much damage to that source's controller." });
const invulnerability = card("Invulnerability", "Instant", "{1}{W}", { keywords: ["Buyback"], oracleText: "Buyback {3} (You may pay an additional {3} as you cast this spell. If you do, put this card into your hand as it resolves.)\nThe next time a source of your choice would deal damage to you this turn, prevent that damage." });
const healingGrace = card("Healing Grace", "Instant", "{W}", { oracleText: "Prevent the next 3 damage that would be dealt to any target this turn by a source of your choice. You gain 3 life." });
const korChant = card("Kor Chant", "Instant", "{2}{W}", { oracleText: "All damage that would be dealt this turn to target creature you control by a source of your choice is dealt to another target creature instead." });
const etherealHaze = card("Ethereal Haze", "Instant — Arcane", "{W}", { oracleText: "Prevent all damage that would be dealt by creatures this turn." });
const storyCircle = card("Story Circle", "Enchantment", "{1}{W}{W}", { oracleText: "As this enchantment enters, choose a color.\n{W}: The next time a source of your choice of the chosen color would deal damage to you this turn, prevent that damage." });
const hallow = card("Hallow", "Instant", "{W}", { oracleText: "Prevent all damage target spell would deal this turn. You gain life equal to the damage prevented this way." });
const luminesce = card("Luminesce", "Instant", "{W}", { oracleText: "Prevent all damage that black sources and red sources would deal this turn." });
const generalsRegalia = card("General's Regalia", "Artifact", "{3}", { oracleText: "{3}: The next time a source of your choice would deal damage to you this turn, that damage is dealt to target creature you control instead." });
const samiteMinistration = card("Samite Ministration", "Instant", "{1}{W}", { oracleText: "Prevent all damage that would be dealt to you this turn by a source of your choice. Whenever damage from a black or red source is prevented this way this turn, you gain that much life." });
const shadowbane = card("Shadowbane", "Instant", "{1}{W}", { oracleText: "The next time a source of your choice would deal damage to you and/or creatures you control this turn, prevent that damage. If damage from a black source is prevented this way, you gain that much life." });
const pilgrim = card("Pilgrim of Justice", "Creature — Human Cleric", "{2}{W}", { power: "1", toughness: "3", keywords: ["Protection"], oracleText: "Protection from red\n{W}, Sacrifice this creature: The next time a red source of your choice would deal damage this turn, prevent that damage." });
const kithkinArmor = card("Kithkin Armor", "Enchantment — Aura", "{W}", { keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature can't be blocked by creatures with power 3 or greater.\nSacrifice this Aura: The next time a source of your choice would deal damage to enchanted creature this turn, prevent that damage." });
const honorablePassage = card("Honorable Passage", "Instant", "{1}{W}", { oracleText: "The next time a source of your choice would deal damage to any target this turn, prevent that damage. If damage from a red source is prevented this way, Honorable Passage deals that much damage to the source's controller." });
const eerieInterference = card("Eerie Interference", "Instant", "{2}{W}", { oracleText: "Prevent all damage that would be dealt to you and creatures you control this turn by creatures." });
const fogOfWar = card("Fog of War", "Instant", "{2}{G}", { oracleText: "You gain 1 life for each creature on the battlefield. Prevent all combat damage that would be dealt this turn by creatures with power 3 or less." });
const chantOfVituGhazi = card("Chant of Vitu-Ghazi", "Instant", "{6}{W}{W}", { keywords: ["Convoke"], oracleText: "Convoke (Your creatures can help cast this spell. Each creature you tap while casting this spell pays for {1} or one mana of that creature's color.)\nPrevent all damage that would be dealt by creatures this turn. You gain life equal to the damage prevented this way." });
const beacon = card("Beacon of Destiny", "Creature — Human Cleric", "{1}{W}", { power: "1", toughness: "3", oracleText: "{T}: The next time a source of your choice would deal damage to you this turn, that damage is dealt to this creature instead." });
const oraclesAttendants = card("Oracle's Attendants", "Creature — Human Soldier", "{3}{W}", { power: "1", toughness: "5", oracleText: "{T}: All damage that would be dealt to target creature this turn by a source of your choice is dealt to this creature instead." });
const thwart = card("Thwart the Enemy", "Instant", "{2}{G}", { oracleText: "Prevent all damage that would be dealt this turn by creatures your opponents control." });
const chameleonBlur = card("Chameleon Blur", "Instant", "{3}{G}", { oracleText: "Prevent all damage that creatures would deal to players this turn." });
const endure = card("Endure", "Instant", "{3}{W}{W}", { oracleText: "Prevent all damage that would be dealt to you and permanents you control this turn." });
const divineLight = card("Divine Light", "Sorcery", "{W}", { oracleText: "Prevent all damage that would be dealt this turn to creatures you control." });
const forfend = card("Forfend", "Instant", "{1}{W}", { oracleText: "Prevent all damage that would be dealt to creatures this turn." });
const rithsCharm = card("Rith's Charm", "Instant", "{R}{G}{W}", { oracleText: "Choose one —\n• Destroy target nonbasic land.\n• Create three 1/1 green Saproling creature tokens.\n• Prevent all damage a source of your choice would deal this turn." });
const martyrsCause = card("Martyr's Cause", "Enchantment", "{2}{W}", { oracleText: "Sacrifice a creature: The next time a source of your choice would deal damage to any target this turn, prevent that damage." });
const auriokReplica = card("Auriok Replica", "Artifact Creature — Cleric", "{3}", { power: "2", toughness: "2", oracleText: "{W}, Sacrifice this creature: Prevent all damage a source of your choice would deal to you this turn." });
const repel = card("Repel the Abominable", "Instant", "{1}{W}", { oracleText: "Prevent all damage that would be dealt this turn by non-Human sources." });
const forgeTender = card("Burrenton Forge-Tender", "Creature — Kithkin Wizard", "{W}", { power: "1", toughness: "1", keywords: ["Protection"], oracleText: "Protection from red\nSacrifice this creature: Prevent all damage a red source of your choice would deal this turn." });

const penance = card("Penance", "Enchantment", "{2}{W}", { oracleText: "Put a card from your hand on top of your library: The next time a black or red source of your choice would deal damage this turn, prevent that damage." });
const hiddenRetreat = card("Hidden Retreat", "Enchantment", "{2}{W}", { oracleText: "Put a card from your hand on top of your library: Prevent all damage that would be dealt by target instant or sorcery spell this turn." });
const leashling = card("Leashling", "Artifact Creature — Dog", "{6}", { power: "3", toughness: "3", oracleText: "Put a card from your hand on top of your library: Return this creature to its owner's hand." });

const bolt = card("Lightning Bolt", "Instant", "{R}", { oracleText: "Lightning Bolt deals 3 damage to any target." });
const pyroclasm = card("Pyroclasm", "Sorcery", "{1}{R}", { oracleText: "Pyroclasm deals 2 damage to each creature." });
const pinger = () => card("Prodigal Pyromancer", "Creature — Human Wizard", "{2}{R}", { power: "1", toughness: "1", oracleText: "{T}: This creature deals 1 damage to any target." });
const knight = card("Fencing Ace", "Creature — Human Soldier", "{1}{W}", { power: "1", toughness: "1", keywords: ["Double strike"], oracleText: "Double strike" });
const ogre = card("Gray Ogre", "Creature — Ogre", "{2}{R}", { power: "2", toughness: "2" });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => plan!.reduce((x, a) => act(x, a), s);
const toHand = (s: GameState, pid: PlayerId, d: CardDef) => {
  const id = putOnBattlefield(s, pid, d);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
const untilPriority = (s: GameState, pid: PlayerId) => {
  while (waitingOn(s) !== pid || s.pending) s = act(s, s.pending ? botActions(s, waitingOn(s)!)[0]! : { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
/** `pid` casts `d` (from a fresh copy in hand, with lands to pay for it) when they next get priority; it stays on the stack. */
const casts = (s: GameState, pid: PlayerId, d: CardDef, targets?: TargetChoice[], extra?: { x?: number; modes?: number[] }) => {
  const id = toHand(s, pid, d);
  for (const l of [mountain, mountain, mountain, plainsCard, plainsCard, plainsCard, forest, forest, swamp]) putOnBattlefield(s, pid, l);
  s = untilPriority(s, pid);
  return { s: run(s, planCast(s, pid, id, targets, extra?.modes, "auto", extra?.x)), id };
};
/** Pass until the top of the stack resolves (or a choice comes up). */
const resolveTop = (s: GameState) => {
  const n = s.stack.length;
  for (let i = 0; i < 20 && s.stack.length >= n && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Answer the source choice with the option whose label starts with `name`. */
const chooseSource = (s: GameState, name: string) => {
  const p = s.pending;
  if (p?.kind !== "chooseOption" || p.what !== "damageSource") throw new Error(`not choosing a source: ${JSON.stringify(p)}`);
  const i = p.labels!.findIndex((l) => l.startsWith(name));
  if (i < 0) throw new Error(`no ${name} in ${p.labels!.join(" | ")}`);
  return act(s, { type: "chooseOption", player: p.player, choice: p.options[i]! });
};
const labels = (s: GameState) => (s.pending?.kind === "chooseOption" ? s.pending.labels! : []);
const nm = (s: GameState, pid: PlayerId) => s.players[pid]!.name;

describe("prevention effects for the turn and sources of your choice (CR 615, 609.7)", () => {
  it("compile", () =>
    supported(circleRed, payNoHeed, shiningShoal, harmsWay, sivvisRuse, safePassage, reverseDamage, deflectingPalm, invulnerability, healingGrace, korChant, etherealHaze, storyCircle, hallow, luminesce, generalsRegalia, samiteMinistration, shadowbane, pilgrim, kithkinArmor, honorablePassage, eerieInterference, fogOfWar, chantOfVituGhazi, beacon, oraclesAttendants, thwart, chameleonBlur, endure, divineLight, forfend, rithsCharm, martyrsCause, auriokReplica, repel, forgeTender, penance, hiddenRetreat, leashling));

  it("Circle of Protection: Red: only red sources are offered; the chosen Bolt's damage is prevented, the next Bolt's isn't", () => {
    const { s: s0, ap, opp } = setup([]);
    const cop = putOnBattlefield(s0, ap, circleRed);
    putOnBattlefield(s0, ap, bear());
    let { s } = casts(s0, opp, bolt, [player(ap)]);
    s = untilPriority(s, ap);
    s = passAll(run(s, planActivate(s, ap, cop, 0)));
    expect(labels(s)).toEqual([`Lightning Bolt (spell), ${nm(s, opp)}'s`]); // the bear, the lands and the Circle aren't red
    s = chooseSource(s, "Lightning Bolt");
    s = resolveTop(s); // the Bolt
    expect(life(s, ap)).toBe(40);
    expect(s.damageRules).toBeUndefined(); // used up (CR 615.8)
    ({ s } = casts(s, opp, bolt, [player(ap)]));
    s = resolveTop(s);
    expect(life(s, ap)).toBe(37);
  });

  it("with nothing that fits to choose, the effect does nothing; damage that can't be prevented doesn't use the shield up (CR 609.7b)", () => {
    const { s: s0, ap, opp } = setup([]);
    const cop = putOnBattlefield(s0, ap, circleRed);
    let s = passAll(run(s0, planActivate(s0, ap, cop, 0)));
    expect(s.pending).toBeNull();
    expect(s.damageRules).toBeUndefined();
    ({ s } = casts(s, opp, bolt, [player(ap)]));
    s = untilPriority(s, ap);
    s = chooseSource(passAll(run(s, planActivate(s, ap, cop, 0))), "Lightning Bolt");
    s.noPreventionTurn = s.turn;
    s = resolveTop(s);
    expect(life(s, ap)).toBe(37);
    expect(s.damageRules).toHaveLength(1);
  });

  it("Pay No Heed on a creature spell: the permanent it becomes deals no damage this turn (CR 609.7a)", () => {
    const { s: s0, ap, ids, opp } = setup([pinger()]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    ({ s } = casts(s, opp, payNoHeed));
    s = chooseSource(passAll(s), "Prodigal Pyromancer (spell)");
    s = resolveTop(s); // the Pyromancer
    const pyro = ids[0]!;
    expect(s.objects[pyro]!.zone).toBe("battlefield");
    s.objects[pyro]!.controlledSinceTurn = -1;
    s = untilPriority(s, ap);
    s = resolveTop(run(s, planActivate(s, ap, pyro, 0, [player(opp)])));
    expect(life(s, opp)).toBe(40);
    // Not the turn after: "this turn" ends at cleanup.
    s = passUntil(s, "upkeep", opp);
    expect(s.damageRules).toBeUndefined();
  });

  it("Harm's Way: the next 2 damage a source would deal to you and your permanents, split among them, goes to the target; Pyroclasm's damage to the others is dealt (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([pyroclasm]);
    const [b1, b2] = [putOnBattlefield(s0, opp, bear()), putOnBattlefield(s0, opp, bear())];
    const mine = putOnBattlefield(s0, ap, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!));
    ({ s } = casts(s, opp, harmsWay, [player(ap)]));
    s = chooseSource(passAll(s), "Pyroclasm");
    s = resolveTop(s);
    // 1 of each bear's 2 damage is dealt to the caster instead (by Pyroclasm), so both bears live.
    expect(s.objects[b1]!.zone).toBe("battlefield");
    expect(s.objects[b2]!.zone).toBe("battlefield");
    expect(s.objects[b1]!.damage + s.objects[b2]!.damage).toBe(2);
    expect(life(s, ap)).toBe(38);
    expect(s.objects[mine]!.zone).toBe("graveyard");
    expect(s.damageRules).toBeUndefined();
  });

  it("Shining Shoal for X = 3: the next 3 damage the chosen Bolt would deal to you is dealt to the target opponent instead", () => {
    const { s: s0, ap, ids, opp } = setup([shiningShoal]);
    let { s } = casts(s0, opp, bolt, [player(ap)]);
    s = untilPriority(s, ap);
    s = passAll(run(s, planCast(s, ap, ids[0]!, [player(opp)], undefined, "auto", 3)));
    s = chooseSource(s, "Lightning Bolt");
    s = resolveTop(s);
    expect(life(s, ap)).toBe(40);
    expect(life(s, opp)).toBe(37);
    expect(s.log.some((e) => e.text === `3 damage from Lightning Bolt to ${nm(s, ap)} is dealt to ${nm(s, opp)} instead (Shining Shoal).`)).toBe(true);
  });

  it("Safe Passage and Sivvi's Ruse protect creatures that arrive after they resolve (CR 611.2c), not the opponents'", () => {
    for (const d of [safePassage, sivvisRuse]) {
      const { s: s0, ap, ids, opp } = setup([pyroclasm, bolt]);
      let { s } = casts(s0, opp, d);
      s = resolveTop(s);
      const late = putOnBattlefield(s, opp, bear());
      const mine = putOnBattlefield(s, ap, bear());
      s = untilPriority(s, ap);
      s = resolveTop(run(s, planCast(s, ap, ids[0]!)));
      expect(s.objects[late]!.damage, d.name).toBe(0);
      expect(s.objects[mine]!.zone, d.name).toBe("graveyard");
      s = untilPriority(s, ap);
      s = resolveTop(run(s, planCast(s, ap, ids[1]!, [player(opp)])));
      expect(life(s, opp), d.name).toBe(d === safePassage ? 40 : 37);
    }
  });

  it("Sivvi's Ruse is free while an opponent controls a Mountain and you control a Plains", () => {
    const { s: s0, ap, ids, opp } = setup([sivvisRuse]);
    putOnBattlefield(s0, opp, mountain);
    const plan = planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { alt: "alternative" });
    expect(plan!.filter((a) => a.type === "activateMana")).toHaveLength(0);
  });

  it("Reverse Damage gains the life; Deflecting Palm deals it back to the source's controller after the damage", () => {
    for (const d of [reverseDamage, deflectingPalm]) {
      const { s: s0, ap, ids, opp } = setup([d]);
      let { s } = casts(s0, opp, bolt, [player(ap)]);
      s = untilPriority(s, ap);
      s = chooseSource(passAll(run(s, planCast(s, ap, ids[0]!))), "Lightning Bolt");
      s = resolveTop(s);
      expect(life(s, ap), d.name).toBe(d === reverseDamage ? 43 : 40);
      expect(life(s, opp), d.name).toBe(d === reverseDamage ? 40 : 37);
    }
  });

  it("Healing Grace: a shield of 3 on the target against the chosen source, and 3 life now", () => {
    const { s: s0, ap, ids, opp } = setup([healingGrace]);
    let { s } = casts(s0, opp, bolt, [player(ap)]);
    s = untilPriority(s, ap);
    s = chooseSource(passAll(run(s, planCast(s, ap, ids[0]!, [player(ap)]))), "Lightning Bolt");
    expect(life(s, ap)).toBe(43);
    s = resolveTop(s);
    expect(life(s, ap)).toBe(43);
  });

  it("Kor Chant: all damage the chosen source would deal to your creature is dealt to the other target creature instead, by that source", () => {
    const { s: s0, ap, ids, opp } = setup([korChant]);
    const mine = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, bear());
    let { s } = casts(s0, opp, bolt, [target(mine)]);
    s = untilPriority(s, ap);
    s = chooseSource(passAll(run(s, planCast(s, ap, ids[0]!, [target(mine), target(theirs)]))), "Lightning Bolt");
    s = resolveTop(s);
    expect(s.objects[mine]!.zone).toBe("battlefield");
    expect(s.objects[theirs]!.zone).toBe("graveyard");
  });

  it("Story Circle offers only sources of the color chosen as it entered", () => {
    const { s: s0, ap, ids, opp } = setup([storyCircle]);
    putOnBattlefield(s0, opp, ogre);
    putOnBattlefield(s0, opp, bear());
    let s = passAll(run(s0, planCast(s0, ap, ids[0]!)));
    s = passAll(act(s, { type: "chooseOption", player: ap, choice: "Red" }));
    s = passAll(run(s, planActivate(s, ap, ids[0]!, 0)));
    expect(labels(s)).toEqual([`Gray Ogre, ${nm(s, opp)}'s`]);
  });

  it("Invulnerability's next time is one damage event: double strike's first-strike damage is prevented, the regular damage isn't (CR 615.8)", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, knight);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: k, defender: opp }] });
    while (!(s.step === "declareBlockers" && !s.pending && waitingOn(s) === opp)) s = act(s, s.pending?.kind === "declareBlockers" ? { type: "declareBlockers", player: s.pending.player, blocks: [] } : { type: "passPriority", player: waitingOn(s)! });
    const inv = toHand(s, opp, invulnerability);
    putOnBattlefield(s, opp, plainsCard);
    putOnBattlefield(s, opp, plainsCard);
    s = passAll(run(s, planCast(s, opp, inv)));
    s = chooseSource(s, "Fencing Ace");
    for (let i = 0; i < 40 && s.step !== "endCombat"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(life(s, opp)).toBe(39);
  });

  it("Ethereal Haze prevents combat damage by creatures, not a Bolt's; Chant of Vitu-Ghazi gains the life prevented, once per batch", () => {
    const { s: s0, ap, opp } = setup([]);
    const [a1, a2] = [putOnBattlefield(s0, ap, ogre), putOnBattlefield(s0, ap, bear())];
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a1, defender: opp }, { attacker: a2, defender: opp }] });
    while (!(s.step === "declareBlockers" && !s.pending && waitingOn(s) === opp)) s = act(s, s.pending?.kind === "declareBlockers" ? { type: "declareBlockers", player: s.pending.player, blocks: [] } : { type: "passPriority", player: waitingOn(s)! });
    const chant = toHand(s, opp, chantOfVituGhazi);
    const pridemate = putOnBattlefield(s, opp, card("Ajani's Pridemate", "Creature — Cat Soldier", "{1}{W}", { power: "2", toughness: "2", oracleText: "Whenever you gain life, put a +1/+1 counter on this creature." }));
    for (let i = 0; i < 8; i++) putOnBattlefield(s, opp, plainsCard);
    s = passAll(run(s, planCast(s, opp, chant)));
    const before = life(s, opp);
    for (let i = 0; i < 40 && s.step !== "endCombat"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(life(s, opp)).toBe(before + 4);
    expect(s.objects[pridemate]!.counters["+1/+1"]).toBe(1); // one life-gain event for the two attackers' damage
    const { s: t0, ap: ap2, ids, opp: opp2 } = setup([etherealHaze]);
    let t = passAll(run(t0, planCast(t0, ap2, ids[0]!)));
    ({ s: t } = casts(t, opp2, bolt, [player(ap2)]));
    t = resolveTop(t);
    expect(life(t, ap2)).toBe(37);
  });

  it("Luminesce: black and red sources only; Hallow: the target spell's damage, with the life", () => {
    const { s: s0, ap, ids, opp } = setup([luminesce, hallow]);
    let s = passAll(run(s0, planCast(s0, ap, ids[0]!)));
    ({ s } = casts(s, opp, bolt, [player(ap)]));
    s = resolveTop(s);
    expect(life(s, ap)).toBe(40);
    s.damageRules = undefined;
    ({ s } = casts(s, opp, bolt, [player(ap)]));
    s = untilPriority(s, ap);
    s = passAll(run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: s.stack.at(-1)!.id }])));
    s = resolveTop(s);
    expect(life(s, ap)).toBe(43);
  });

  it("General's Regalia sends the chosen source's next damage to you to your creature instead", () => {
    const { s: s0, ap, opp } = setup([]);
    const reg = putOnBattlefield(s0, ap, generalsRegalia);
    const wall = putOnBattlefield(s0, ap, card("Wall of Stone", "Creature — Wall", "{1}{R}{R}", { power: "0", toughness: "8", keywords: ["Defender"], oracleText: "Defender" }));
    let { s } = casts(s0, opp, bolt, [player(ap)]);
    s = untilPriority(s, ap);
    s = chooseSource(passAll(run(s, planActivate(s, ap, reg, 0, [target(wall)]))), "Lightning Bolt");
    s = resolveTop(s);
    expect(life(s, ap)).toBe(40);
    expect(s.objects[wall]!.damage).toBe(3);
  });

  it("a bot answers an opponent's Bolt with its Circle of Protection: Red, choosing that Bolt", () => {
    const { s: s0, ap, opp } = setup([]);
    const cop = putOnBattlefield(s0, opp, circleRed);
    for (const l of [plainsCard, plainsCard]) putOnBattlefield(s0, opp, l);
    const id = toHand(s0, ap, bolt);
    let s = run(s0, planCast(s0, ap, id, [player(opp)]));
    for (let i = 0; i < 30 && s.stack.length; i++) {
      const pid = waitingOn(s)!;
      s = act(s, pid === ap && !s.pending ? { type: "passPriority", player: pid } : botActions(s, pid)[0]!);
    }
    expect(s.log.some((e) => /chooses Lightning Bolt as the source for Circle of Protection: Red/.test(e.text))).toBe(true);
    expect(life(s, opp)).toBe(40);
    expect(s.objects[cop]!.zone).toBe("battlefield");
  });

  it("Penance and Hidden Retreat: the cost puts a card from your hand on top of your library", () => {
    const { s: s0, ap, ids, opp } = setup([bear(), forest]);
    const pen = putOnBattlefield(s0, ap, penance);
    const hr = putOnBattlefield(s0, ap, hiddenRetreat);
    let { s } = casts(s0, opp, bolt, [player(ap)]);
    s = untilPriority(s, ap);
    s = run(s, planActivate(s, ap, pen, 0, undefined, undefined, undefined, undefined, { exileFromHand: [ids[0]!] }));
    expect(s.players[ap]!.library[0]).toBe(ids[0]);
    expect(s.players[ap]!.hand).not.toContain(ids[0]);
    s = chooseSource(passAll(s), "Lightning Bolt");
    s = resolveTop(s);
    expect(life(s, ap)).toBe(40);
    ({ s } = casts(s, opp, bolt, [player(ap)]));
    s = untilPriority(s, ap);
    s = run(s, planActivate(s, ap, hr, 0, [{ kind: "stack", id: s.stack.at(-1)!.id }], undefined, undefined, undefined, { exileFromHand: [ids[1]!] }));
    expect(s.players[ap]!.library.slice(0, 2)).toEqual([ids[1], ids[0]]);
    s = resolveTop(passAll(s));
    expect(life(s, ap)).toBe(40);
  });

  it("Leashling returns to its owner's hand for a card put on top of the library", () => {
    const { s: s0, ap, ids } = setup([bear()]);
    const dog = putOnBattlefield(s0, ap, leashling);
    const s = passAll(run(s0, planActivate(s0, ap, dog, 0, undefined, undefined, undefined, undefined, { exileFromHand: [ids[0]!] })));
    expect(s.players[ap]!.hand).toContain(dog);
    expect(s.objects[dog]!.zone).toBe("hand");
    expect(s.players[ap]!.library[0]).toBe(ids[0]);
  });

  it("bots don't cast prevention spells in their main phase", () => {
    const { s, ap } = setup([safePassage, payNoHeed]);
    const acts = botActions(s, ap);
    expect(acts.some((a) => a.type === "castSpell")).toBe(false);
  });
});
