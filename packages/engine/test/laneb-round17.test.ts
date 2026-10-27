// Lane B, round 17: the cards the earlier rounds skipped, least played first (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, card, forest, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, characteristics, controllerOf, endEffectProblem, invalidateCharacteristics, planEndEffect, isFullySupported, objHasKeyword, parseManaCost, planActivate, planCast, planMana, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/**
 * Everyone passes until the stack is empty. "You may" questions get `yes`; a pick gets `pick` (or the first ones
 * offered); a scry keeps the cards on top. Stops at any other question.
 */
const settle = (s: GameState, opts: { yes?: boolean; pick?: string[] } = {}) => {
  for (let i = 0; i < 200 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay") s = run(s, [...((opts.yes ?? true) && p.pay?.mana ? planMana(s, p.player, parseManaCost(p.pay.mana))! : []), { type: "chooseMay", player: p.player, yes: opts.yes ?? true }]);
    else if (p?.kind === "pickPermanents") s = act(s, { type: "pickPermanents", player: p.player, ids: opts.pick ?? p.options.slice(0, p.count) });
    else if (p?.kind === "arrangeTop") s = act(s, { type: "arrangeTop", player: p.player, top: p.cards, away: [] } as Action);
    else if (p) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const choose = (s: GameState, choice: string) => {
  const p = s.pending;
  if (p?.kind !== "chooseOption") throw new Error(`no choice pending: ${p?.kind}`);
  return act(s, { type: "chooseOption", player: p.player, choice });
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const colors = (s: GameState, id: string) => characteristics(s, s.objects[id]!).colors.join("");
const subtypes = (s: GameState, id: string) => characteristics(s, s.objects[id]!).subtypes.join(" ");
const creature = (name: string, typeLine: string, manaCost: string, p: number, t: number, extra: Partial<CardDef> = {}) =>
  card(name, typeLine, manaCost, { power: String(p), toughness: String(t), ...extra });
const greenBear = () => creature("Green Bear", "Creature — Bear", "{1}{G}", 2, 2, { cmc: 2 });
const into = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "graveyard" | "library" = "hand") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Empties a player's hand into their library, then gives them these cards. */
const handOf = (s: GameState, pid: PlayerId, defs: CardDef[]) => {
  const p = s.players[pid]!;
  for (const id of p.hand) s.objects[id]!.zone = "library";
  p.library.push(...p.hand);
  p.hand = [];
  return defs.map((d) => into(s, pid, d));
};
const logged = (s: GameState, re: RegExp) => s.log.some((l) => re.test(l.text));

// Real oracle text (Scryfall).
const riddleOfLightning = card("Riddle of Lightning", "Instant", "{3}{R}{R}", {cmc: 5,keywords: ["Scry"],oracleText: "Choose any target. Scry 3, then reveal the top card of your library. Riddle of Lightning deals damage equal to that card's mana value to that permanent or player."});
const judgeUnworthy = card("Judge Unworthy", "Instant", "{1}{W}", {cmc: 2,keywords: ["Scry"],oracleText: "Choose target attacking or blocking creature. Scry 3, then reveal the top card of your library. Judge Unworthy deals damage equal to that card's mana value to that creature."});
const putridCyclops = card("Putrid Cyclops", "Creature — Zombie Cyclops", "{2}{B}", {cmc: 3,power: "3",toughness: "3",keywords: ["Scry"],oracleText: "When this creature enters, scry 1, then reveal the top card of your library. This creature gets -X/-X until end of turn, where X is that card's mana value. (To scry 1, look at the top card of your library, then you may put that card on the bottom.)"});
const stormchaserChimera = card("Stormchaser Chimera", "Creature — Chimera", "{2}{U}{R}", {cmc: 4,power: "2",toughness: "3",keywords: ["Scry","Flying"],oracleText: "Flying\n{2}{U}{R}: Scry 1, then reveal the top card of your library. This creature gets +X/+0 until end of turn, where X is that card's mana value. (To scry 1, look at the top card of your library, then you may put that card on the bottom.)"});
const kjeldoranEliteGuard = card("Kjeldoran Elite Guard", "Creature — Human Soldier", "{3}{W}", {cmc: 4,power: "2",toughness: "2",oracleText: "{T}: Target creature gets +2/+2 until end of turn. When that creature leaves the battlefield this turn, sacrifice this creature. Activate only during combat."});
const heartWolf = card("Heart Wolf", "Creature — Wolf", "{3}{R}", {cmc: 4,power: "2",toughness: "2",keywords: ["First strike"],oracleText: "First strike\n{T}: Target Dwarf creature gets +2/+0 and gains first strike until end of turn. When that creature leaves the battlefield this turn, sacrifice this creature. Activate only during combat."});
const dwarvenSong = card("Dwarven Song", "Instant", "{R}", {cmc: 1,oracleText: "One or more target creatures become red until end of turn."});
const heavensGate = card("Heaven's Gate", "Instant", "{W}", {cmc: 1,oracleText: "One or more target creatures become white until end of turn."});
const seaKingsBlessing = card("Sea Kings' Blessing", "Instant", "{U}", {cmc: 1,oracleText: "One or more target creatures become blue until end of turn."});
const sylvanParadise = card("Sylvan Paradise", "Instant", "{G}", {cmc: 1,oracleText: "One or more target creatures become green until end of turn."});
const touchOfDarkness = card("Touch of Darkness", "Instant", "{B}", {cmc: 1,oracleText: "One or more target creatures become black until end of turn."});
const incite = card("Incite", "Instant", "{R}", {cmc: 1,oracleText: "Target creature becomes red until end of turn and attacks this turn if able."});
const prismaticLace = card("Prismatic Lace", "Instant", "{U}", {cmc: 1,oracleText: "Target permanent becomes the color or colors of your choice. (This effect lasts indefinitely.)"});
const prismwakeMerrow = card("Prismwake Merrow", "Creature — Merfolk Wizard", "{2}{U}", {cmc: 3,power: "2",toughness: "1",keywords: ["Flash"],oracleText: "Flash\nWhen this creature enters, target permanent becomes the color or colors of your choice until end of turn."});
const quickchange = card("Quickchange", "Instant", "{1}{U}", {cmc: 2,oracleText: "Target creature becomes the color or colors of your choice until end of turn.\nDraw a card."});
const scuttlemutt = card("Scuttlemutt", "Artifact Creature — Scarecrow", "{3}", {cmc: 3,power: "2",toughness: "2",oracleText: "{T}: Add one mana of any color.\n{T}: Target creature becomes the color or colors of your choice until end of turn."});
const shyft = card("Shyft", "Creature — Shapeshifter", "{4}{U}", {cmc: 5,power: "4",toughness: "2",oracleText: "At the beginning of your upkeep, you may have this creature become the color or colors of your choice. (This effect lasts indefinitely.)"});
const swirlingSpriggan = card("Swirling Spriggan", "Creature — Goblin Shaman", "{2}{G}{G}", {cmc: 4,power: "3",toughness: "3",oracleText: "{G/U}{G/U}: Target creature you control becomes the color or colors of your choice until end of turn."});
const dreamCoat = card("Dream Coat", "Enchantment — Aura", "{U}", {cmc: 1,keywords: ["Enchant"],oracleText: "Enchant creature\n{0}: Enchanted creature becomes the color or colors of your choice. Activate only once each turn."});
const alchorsTomb = card("Alchor's Tomb", "Artifact", "{4}", {cmc: 4,oracleText: "{2}, {T}: Target permanent you control becomes the color of your choice. (This effect lasts indefinitely.)"});
const cyclopeanGiant = card("Cyclopean Giant", "Creature — Zombie Giant", "{2}{B}{B}", {cmc: 4,power: "4",toughness: "2",oracleText: "When this creature dies, target land becomes a Swamp. Exile this card."});
const theloniteMonk = card("Thelonite Monk", "Creature — Insect Monk Cleric", "{2}{G}{G}", {cmc: 4,power: "1",toughness: "2",oracleText: "{T}, Sacrifice a green creature: Target land becomes a Forest. (This effect lasts indefinitely.)"});
const tundraKavu = card("Tundra Kavu", "Creature — Kavu", "{2}{R}", {cmc: 3,power: "2",toughness: "2",oracleText: "{T}: Target land becomes a Plains or an Island until end of turn."});
const gracefulAntelope = card("Graceful Antelope", "Creature — Antelope", "{2}{W}{W}", {cmc: 4,power: "1",toughness: "4",keywords: ["Landwalk","Plainswalk"],oracleText: "Plainswalk (This creature can't be blocked as long as defending player controls a Plains.)\nWhenever this creature deals combat damage to a player, you may have target land become a Plains until this creature leaves the battlefield."});
const mondoGecko = card("Mondo Gecko", "Legendary Creature — Lizard Mutant", "{1}{U}{U}", {cmc: 3,power: "2",toughness: "3",oracleText: "{1}, Discard a card: Until end of turn, Mondo Gecko becomes the color of your choice and gains hexproof from that color.\nWhenever Mondo Gecko deals combat damage to a player, draw a card for each color among permanents you control."});
const lobotomy = card("Lobotomy", "Sorcery", "{2}{U}{B}", {cmc: 4,oracleText: "Target player reveals their hand, then you choose a card other than a basic land card from it. Search that player's graveyard, hand, and library for all cards with the same name as the chosen card and exile them. Then that player shuffles."});
const shimianSpecter = card("Shimian Specter", "Creature — Specter", "{2}{B}{B}", {cmc: 4,power: "2",toughness: "2",keywords: ["Flying"],oracleText: "Flying\nWhenever this creature deals combat damage to a player, that player reveals their hand. You choose a nonland card from it. Search that player's graveyard, hand, and library for all cards with the same name as that card and exile them. Then that player shuffles."});
const calmingLicid = card("Calming Licid", "Creature — Licid", "{2}{W}", {cmc: 3,power: "2",toughness: "2",oracleText: "{W}, {T}: This creature loses this ability and becomes an Aura enchantment with enchant creature. Attach it to target creature. You may pay {W} to end this effect.\nEnchanted creature can't attack."});
const dominatingLicid = card("Dominating Licid", "Creature — Licid", "{1}{U}{U}", {cmc: 3,power: "1",toughness: "1",oracleText: "{1}{U}{U}, {T}: This creature loses this ability and becomes an Aura enchantment with enchant creature. Attach it to target creature. You may pay {U} to end this effect.\nYou control enchanted creature."});
const glidingLicid = card("Gliding Licid", "Creature — Licid", "{2}{U}", {cmc: 3,power: "2",toughness: "2",oracleText: "{U}, {T}: This creature loses this ability and becomes an Aura enchantment with enchant creature. Attach it to target creature. You may pay {U} to end this effect.\nEnchanted creature has flying."});
const transmogrifyingLicid = card("Transmogrifying Licid", "Artifact Creature — Licid", "{3}", {cmc: 3,power: "2",toughness: "2",oracleText: "{1}, {T}: This creature loses this ability and becomes an Aura enchantment with enchant creature. Attach it to target creature. You may pay {1} to end this effect.\nEnchanted creature gets +1/+1 and is an artifact in addition to its other types."});
const leechingLicid = card("Leeching Licid", "Creature — Licid", "{1}{B}", {cmc: 2,power: "1",toughness: "1",oracleText: "{B}, {T}: This creature loses this ability and becomes an Aura enchantment with enchant creature. Attach it to target creature. You may pay {B} to end this effect.\nAt the beginning of the upkeep of enchanted creature's controller, this creature deals 1 damage to that player."});
const nurturingLicid = card("Nurturing Licid", "Creature — Licid", "{1}{G}", {cmc: 2,power: "1",toughness: "1",keywords: ["Regenerate"],oracleText: "{G}, {T}: This creature loses this ability and becomes an Aura enchantment with enchant creature. Attach it to target creature. You may pay {G} to end this effect.\n{G}: Regenerate enchanted creature."});
const convulsingLicid = card("Convulsing Licid", "Creature — Licid", "{2}{R}", {cmc: 3,power: "2",toughness: "2",oracleText: "{R}, {T}: This creature loses this ability and becomes an Aura enchantment with enchant creature. Attach it to target creature. You may pay {R} to end this effect.\nEnchanted creature can't block."});
const corruptingLicid = card("Corrupting Licid", "Creature — Licid", "{2}{B}", {cmc: 3,power: "2",toughness: "2",oracleText: "{B}, {T}: This creature loses this ability and becomes an Aura enchantment with enchant creature. Attach it to target creature. You may pay {B} to end this effect.\nEnchanted creature has fear. (It can't be blocked except by artifact creatures and/or black creatures.)"});
const enragingLicid = card("Enraging Licid", "Creature — Licid", "{1}{R}", {cmc: 2,power: "1",toughness: "1",oracleText: "{R}, {T}: This creature loses this ability and becomes an Aura enchantment with enchant creature. Attach it to target creature. You may pay {R} to end this effect.\nEnchanted creature has haste."});
const quickeningLicid = card("Quickening Licid", "Creature — Licid", "{1}{W}", {cmc: 2,power: "1",toughness: "1",oracleText: "{1}{W}, {T}: This creature loses this ability and becomes an Aura enchantment with enchant creature. Attach it to target creature. You may pay {W} to end this effect.\nEnchanted creature has first strike."});
const stingingLicid = card("Stinging Licid", "Creature — Licid", "{1}{U}", {cmc: 2,power: "1",toughness: "1",oracleText: "{1}{U}, {T}: This creature loses this ability and becomes an Aura enchantment with enchant creature. Attach it to target creature. You may pay {U} to end this effect.\nWhenever enchanted creature becomes tapped, this creature deals 2 damage to that creature's controller."});
const temptingLicid = card("Tempting Licid", "Creature — Licid", "{2}{G}", {cmc: 3,power: "2",toughness: "2",oracleText: "{G}, {T}: This creature loses this ability and becomes an Aura enchantment with enchant creature. Attach it to target creature. You may pay {G} to end this effect.\nAll creatures able to block enchanted creature do so."});

const bolt = () => card("Test Bolt", "Instant", "{R}", { cmc: 1, oracleText: "This spell deals 3 damage to any target." });
const fiveDrop = () => creature("Test Five", "Creature — Giant", "{3}{G}{G}", 5, 5, { cmc: 5 });
const dwarf = () => creature("Test Dwarf", "Creature — Dwarf", "{1}{R}", 1, 1, { cmc: 2 });

describe("scry, then reveal the top card and use its mana value: Riddle of Lightning, Judge Unworthy, Putrid Cyclops, Stormchaser Chimera", () => {
  it("compiles them", () => supported(riddleOfLightning, judgeUnworthy, putridCyclops, stormchaserChimera));

  it("Riddle of Lightning: damage to the chosen target equal to the mana value of the card on top after the scry", () => {
    let { s, ap, opp, ids } = setup([riddleOfLightning]);
    into(s, ap, fiveDrop(), "library");
    const land = into(s, ap, forest, "library");
    s = run(s, planCast(s, ap, ids[0]!, [player(opp)]));
    for (let i = 0; i < 20 && s.pending?.kind !== "arrangeTop"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const pend = s.pending!;
    if (pend.kind !== "arrangeTop") throw new Error("no scry");
    expect(pend.cards.length).toBe(3);
    // The land goes to the bottom: the 5-drop under it is revealed.
    s = settle(act(s, { type: "arrangeTop", player: ap, top: pend.cards.filter((c) => c !== land), away: [land] } as Action));
    expect(life(s, opp)).toBe(35);
    expect(logged(s, /reveals Test Five/)).toBe(true);
    expect(logged(s, /scries/)).toBe(true);
  });

  it("Riddle of Lightning: with its target gone, it doesn't resolve, so there's no scry (rulings)", () => {
    let { s, ap, opp, ids } = setup([riddleOfLightning]);
    const b = putOnBattlefield(s, opp, greenBear());
    s = run(s, planCast(s, ap, ids[0]!, [tgt(b)]));
    s.objects[b]!.damage = 2;
    s = settle(s);
    expect(zone(s, b)).toBe("graveyard");
    expect(s.pending).toBeNull();
    expect(logged(s, /scries/)).toBe(false);
  });

  it("Judge Unworthy: only an attacking or blocking creature", () => {
    let { s, ap, opp, ids } = setup([judgeUnworthy]);
    const b = putOnBattlefield(s, opp, greenBear());
    expect(planCast(s, ap, ids[0]!, [tgt(b)])).toBeNull();
    const mine = putOnBattlefield(s, ap, greenBear());
    into(s, ap, fiveDrop(), "library");
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: mine, defender: opp }] });
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(mine)])));
    expect(zone(s, mine)).toBe("graveyard");
  });

  it("Putrid Cyclops: -X/-X where X is the revealed card's mana value; a land on top leaves it 3/3", () => {
    let { s, ap, ids } = setup([putridCyclops, putridCyclops]);
    into(s, ap, fiveDrop(), "library");
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(zone(s, ids[0]!)).toBe("graveyard");
    into(s, ap, forest, "library");
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(zone(s, ids[1]!)).toBe("battlefield");
    expect(pt(s, ids[1]!)).toBe("3/3");
  });

  it("Stormchaser Chimera: +X/+0, X locked in as the ability resolves", () => {
    let { s, ap } = setup([]);
    const c = putOnBattlefield(s, ap, stormchaserChimera);
    into(s, ap, fiveDrop(), "library");
    s = settle(run(s, planActivate(s, ap, c, 0)));
    expect(pt(s, c)).toBe("7/3");
    // The card is still on top; moving it doesn't change the bonus (CR 608.2h).
    const top = s.players[ap]!.library.shift()!;
    s.players[ap]!.hand.push(top);
    s.objects[top]!.zone = "hand";
    invalidateCharacteristics(s);
    expect(pt(s, c)).toBe("7/3");
  });
});

describe("When that creature leaves the battlefield this turn, sacrifice ~: Kjeldoran Elite Guard, Heart Wolf", () => {
  it("compiles them", () => supported(kjeldoranEliteGuard, heartWolf));

  const attackWith = (s: GameState, ap: PlayerId, opp: PlayerId, ids: string[]) => {
    s = passUntil(s, "declareAttackers", ap);
    return act(s, { type: "declareAttackers", player: ap, attacks: ids.map((attacker) => ({ attacker, defender: opp })) });
  };

  it("Kjeldoran Elite Guard: only during combat; when the creature it pumped dies this turn, the Guard is sacrificed", () => {
    let { s, ap, opp, ids } = setup([bolt()]);
    const g = putOnBattlefield(s, ap, kjeldoranEliteGuard);
    const b = putOnBattlefield(s, ap, greenBear());
    expect(planActivate(s, ap, g, 0, [tgt(b)])).toBeNull();
    s = attackWith(s, ap, opp, [b]);
    s = settle(run(s, planActivate(s, ap, g, 0, [tgt(b)])));
    expect(pt(s, b)).toBe("4/4");
    s.objects[b]!.damage = 3;
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(b)])));
    expect(zone(s, b)).toBe("graveyard");
    expect(zone(s, g)).toBe("graveyard");
  });

  it("Kjeldoran Elite Guard: the delayed trigger lasts only this turn", () => {
    let { s, ap, opp } = setup([]);
    const g = putOnBattlefield(s, ap, kjeldoranEliteGuard);
    const b = putOnBattlefield(s, ap, greenBear());
    s = attackWith(s, ap, opp, [b]);
    s = settle(run(s, planActivate(s, ap, g, 0, [tgt(b)])));
    s = passUntil(s, "upkeep", opp);
    // Next turn: the bear dies, the Guard stays.
    s.objects[b]!.damage = 2;
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(zone(s, b)).toBe("graveyard");
    expect(zone(s, g)).toBe("battlefield");
  });

  it("Kjeldoran Elite Guard: a bounce is leaving the battlefield too", () => {
    const bounce = card("Test Unsummon", "Instant", "{U}", { cmc: 1, oracleText: "Return target creature to its owner's hand." });
    let { s, ap, opp, ids } = setup([bounce]);
    const g = putOnBattlefield(s, ap, kjeldoranEliteGuard);
    const b = putOnBattlefield(s, ap, greenBear());
    s = attackWith(s, ap, opp, [b]);
    s = settle(run(s, planActivate(s, ap, g, 0, [tgt(b)])));
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(b)])));
    expect(zone(s, b)).toBe("hand");
    expect(zone(s, g)).toBe("graveyard");
  });

  it("Heart Wolf: a Dwarf only; +2/+0 and first strike; sacrificed when the Dwarf leaves", () => {
    let { s, ap, opp, ids } = setup([bolt()]);
    const w = putOnBattlefield(s, ap, heartWolf);
    const d = putOnBattlefield(s, ap, dwarf());
    const b = putOnBattlefield(s, ap, greenBear());
    s = attackWith(s, ap, opp, [d, b]);
    expect(planActivate(s, ap, w, 0, [tgt(b)])).toBeNull();
    s = settle(run(s, planActivate(s, ap, w, 0, [tgt(d)])));
    expect(pt(s, d)).toBe("3/1");
    expect(objHasKeyword(s, s.objects[d]!, "First strike")).toBe(true);
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(d)])));
    expect(zone(s, w)).toBe("graveyard");
  });
});

describe("one or more target creatures become a color: Dwarven Song, Heaven's Gate, Sea Kings' Blessing, Sylvan Paradise, Touch of Darkness; Incite", () => {
  it("compiles them", () => supported(dwarvenSong, heavensGate, seaKingsBlessing, sylvanParadise, touchOfDarkness, incite));

  it("Dwarven Song: each target becomes red (only red) until end of turn; at least one target", () => {
    let { s, ap, opp, ids } = setup([dwarvenSong]);
    const a = putOnBattlefield(s, ap, greenBear());
    const b = putOnBattlefield(s, opp, greenBear());
    expect(planCast(s, ap, ids[0]!, [])).toBeNull();
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(a), tgt(b)])));
    expect(colors(s, a)).toBe("R");
    expect(colors(s, b)).toBe("R");
    s = passUntil(s, "upkeep", opp);
    expect(colors(s, a)).toBe("G");
  });

  it("Touch of Darkness, Sea Kings' Blessing: one target is enough", () => {
    let { s, ap, ids } = setup([touchOfDarkness, seaKingsBlessing]);
    const a = putOnBattlefield(s, ap, greenBear());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(a)])));
    expect(colors(s, a)).toBe("B");
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(a)])));
    expect(colors(s, a)).toBe("U");
  });

  it("Incite: red until end of turn, and it attacks this turn if able", () => {
    let { s, ap, opp, ids } = setup([incite]);
    const a = putOnBattlefield(s, ap, greenBear());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(a)])));
    expect(colors(s, a)).toBe("R");
    s = passUntil(s, "declareAttackers", ap);
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [] })).toThrow();
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] });
    expect(s.objects[a]!.attacking).toBeTruthy();
  });
});

describe("the color or colors of your choice: Prismatic Lace, Prismwake Merrow, Quickchange, Scuttlemutt, Shyft, Swirling Spriggan, Dream Coat; Alchor's Tomb, Mondo Gecko", () => {
  it("compiles them", () => supported(prismaticLace, prismwakeMerrow, quickchange, scuttlemutt, shyft, swirlingSpriggan, dreamCoat, alchorsTomb, mondoGecko));

  it("Prismatic Lace: one or more colors, which replace the old ones, with no duration", () => {
    let { s, ap, opp, ids } = setup([prismaticLace]);
    const a = putOnBattlefield(s, ap, greenBear());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(a)])));
    const pend = s.pending;
    if (pend?.kind !== "chooseOption" || pend.what !== "colors") throw new Error("no color choice");
    expect(pend.options).toEqual(["White", "Blue", "Black", "Red", "Green"]);
    // Not none, not the same color twice, not colorless (rulings).
    expect(() => choose(s, "")).toThrow();
    expect(() => choose(s, "White,White")).toThrow();
    expect(() => choose(s, "Colorless")).toThrow();
    s = settle(choose(s, "Black,White"));
    expect(colors(s, a)).toBe("WB");
    expect(logged(s, /chooses Black and White/)).toBe(true);
    s = passUntil(s, "upkeep", opp);
    expect(colors(s, a)).toBe("WB");
  });

  it("Quickchange: until end of turn, then draws a card", () => {
    let { s, ap, opp, ids } = setup([quickchange]);
    const a = putOnBattlefield(s, opp, greenBear());
    const hand = s.players[ap]!.hand.length;
    s = settle(choose(settle(run(s, planCast(s, ap, ids[0]!, [tgt(a)]))), "Red,Blue,Green"));
    expect(colors(s, a)).toBe("URG");
    expect(s.players[ap]!.hand.length).toBe(hand);
    s = passUntil(s, "upkeep", opp);
    expect(colors(s, a)).toBe("G");
  });

  it("Scuttlemutt and Swirling Spriggan: until end of turn; the Spriggan only your own creatures", () => {
    let { s, ap, opp } = setup([]);
    const m = putOnBattlefield(s, ap, scuttlemutt);
    const sp = putOnBattlefield(s, ap, swirlingSpriggan);
    const a = putOnBattlefield(s, ap, greenBear());
    const b = putOnBattlefield(s, opp, greenBear());
    expect(planActivate(s, ap, sp, 0, [tgt(b)])).toBeNull();
    s = settle(choose(settle(run(s, planActivate(s, ap, m, 0, [tgt(b)]))), "White"));
    expect(colors(s, b)).toBe("W");
    s = settle(choose(settle(run(s, planActivate(s, ap, sp, 0, [tgt(a)]))), "Blue,Black"));
    expect(colors(s, a)).toBe("UB");
  });

  it("Prismwake Merrow: as it enters, a target permanent's colors until end of turn", () => {
    let { s, ap, ids } = setup([prismwakeMerrow]);
    const a = putOnBattlefield(s, ap, greenBear());
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(a)] } as Action);
    s = settle(choose(settle(s), "White"));
    expect(colors(s, a)).toBe("W");
  });

  it("Shyft: at your upkeep you may have it become the colors of your choice, for good", () => {
    let { s, ap, opp } = setup([]);
    const sh = putOnBattlefield(s, ap, shyft);
    s = passUntil(s, "upkeep", opp);
    s = passUntil(s, "upkeep", ap);
    s = settle(s);
    s = settle(choose(s, "Red,Green"));
    expect(colors(s, sh)).toBe("RG");
    s = passUntil(s, "upkeep", opp);
    expect(colors(s, sh)).toBe("RG");
    // Declining leaves it as it is.
    s = passUntil(s, "upkeep", ap);
    s = settle(s, { yes: false });
    expect(s.pending).toBeNull();
    expect(colors(s, sh)).toBe("RG");
  });

  it("Dream Coat: once each turn; the colors stay even after the Aura is gone (rulings)", () => {
    let { s, ap, opp } = setup([]);
    const a = putOnBattlefield(s, ap, greenBear());
    const coat = putOnBattlefield(s, ap, dreamCoat);
    s.objects[coat]!.attachedTo = a;
    invalidateCharacteristics(s);
    s = settle(choose(settle(run(s, planActivate(s, ap, coat, 0))), "White,Red"));
    expect(colors(s, a)).toBe("WR");
    expect(planActivate(s, ap, coat, 0)).toBeNull();
    s.objects[coat]!.attachedTo = undefined;
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(zone(s, coat)).toBe("graveyard");
    s = passUntil(s, "upkeep", opp);
    expect(colors(s, a)).toBe("WR");
  });

  it("Alchor's Tomb: one color, a permanent you control, indefinitely", () => {
    let { s, ap, opp } = setup([]);
    const t = putOnBattlefield(s, ap, alchorsTomb);
    const a = putOnBattlefield(s, ap, greenBear());
    const b = putOnBattlefield(s, opp, greenBear());
    expect(planActivate(s, ap, t, 0, [tgt(b)])).toBeNull();
    s = settle(run(s, planActivate(s, ap, t, 0, [tgt(a)])));
    const pend = s.pending;
    if (pend?.kind !== "chooseOption" || pend.what !== "color") throw new Error("no color choice");
    s = settle(choose(s, "Black"));
    s = passUntil(s, "upkeep", opp);
    expect(colors(s, a)).toBe("B");
  });

  it("Mondo Gecko: the chosen color and hexproof from it until end of turn", () => {
    let { s, ap, opp, ids } = setup([bolt()]);
    const g = putOnBattlefield(s, ap, mondoGecko);
    s = settle(choose(settle(run(s, planActivate(s, ap, g, 0, undefined, undefined, undefined, undefined, { discard: [ids[0]!] }))), "Red"));
    expect(colors(s, g)).toBe("R");
    expect(objHasKeyword(s, s.objects[g]!, "Hexproof from red")).toBe(true);
    s = passUntil(s, "upkeep", opp);
    expect(colors(s, g)).toBe("U");
  });
});

describe("a land becomes a basic land type: Cyclopean Giant, Thelonite Monk, Tundra Kavu, Graceful Antelope", () => {
  it("compiles them", () => supported(cyclopeanGiant, theloniteMonk, tundraKavu, gracefulAntelope));

  it("Cyclopean Giant: when it dies, target land becomes a Swamp for good, and the Giant is exiled", () => {
    let { s, ap, opp } = setup([]);
    const g = putOnBattlefield(s, ap, cyclopeanGiant);
    const l = putOnBattlefield(s, opp, forest);
    s.objects[g]!.damage = 2;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(l)] } as Action);
    s = settle(s);
    expect(subtypes(s, l)).toBe("Swamp");
    expect(zone(s, g)).toBe("exile");
    s = passUntil(s, "upkeep", opp);
    expect(subtypes(s, l)).toBe("Swamp");
  });

  it("Thelonite Monk: sacrifice a green creature, a land becomes a Forest indefinitely", () => {
    let { s, ap, opp } = setup([]);
    const m = putOnBattlefield(s, ap, theloniteMonk);
    const b = putOnBattlefield(s, ap, greenBear());
    const l = s.battlefield.find((id) => s.objects[id]!.controller === ap && /Island/.test(subtypes(s, id)))!;
    s = settle(run(s, planActivate(s, ap, m, 0, [tgt(l)], undefined, undefined, undefined, { sacrifice: [b] })));
    expect(zone(s, b)).toBe("graveyard");
    expect(subtypes(s, l)).toBe("Forest");
    s = passUntil(s, "upkeep", opp);
    expect(subtypes(s, l)).toBe("Forest");
  });

  it("Tundra Kavu: Plains or Island, chosen as it resolves, until end of turn", () => {
    let { s, ap, opp } = setup([]);
    const k = putOnBattlefield(s, ap, tundraKavu);
    const l = putOnBattlefield(s, opp, forest);
    s = settle(run(s, planActivate(s, ap, k, 0, [tgt(l)])));
    const pend = s.pending;
    if (pend?.kind !== "chooseOption" || pend.what !== "basicLandType") throw new Error("no land type choice");
    expect(pend.options).toEqual(["Plains", "Island"]);
    expect(() => choose(s, "Swamp")).toThrow();
    s = settle(choose(s, "Island"));
    expect(subtypes(s, l)).toBe("Island");
    s = passUntil(s, "upkeep", opp);
    expect(subtypes(s, l)).toBe("Forest");
  });

  it("Graceful Antelope: after combat damage to a player, a land becomes a Plains until the Antelope leaves", () => {
    let { s, ap, opp } = setup([]);
    const a = putOnBattlefield(s, ap, gracefulAntelope);
    const l = putOnBattlefield(s, opp, forest);
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] });
    for (let i = 0; i < 40 && s.pending?.kind !== "chooseTargets" && s.pending?.kind !== "chooseMay"; i++) {
      const p = s.pending;
      if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(l)] } as Action);
    s = settle(s);
    expect(life(s, opp)).toBe(39);
    expect(subtypes(s, l)).toBe("Plains");
    s = passUntil(s, "upkeep", opp);
    expect(subtypes(s, l)).toBe("Plains");
    s.objects[a]!.damage = 4;
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(zone(s, a)).toBe("graveyard");
    expect(subtypes(s, l)).toBe("Forest");
  });
});

describe("cards with the same name as one chosen from a revealed hand: Lobotomy, Shimian Specter", () => {
  it("compiles them", () => supported(lobotomy, shimianSpecter));

  it("Lobotomy: not a basic land; every card with that name in the graveyard, the ones found in hand and library, exiled", () => {
    let { s, ap, opp, ids } = setup([lobotomy]);
    const rite = () => card("Test Rite", "Sorcery", "{B}", { cmc: 1, oracleText: "Target player discards a card." });
    const [r1, f1, other] = handOf(s, opp, [rite(), forest, bolt()]);
    const r2 = into(s, opp, rite(), "graveyard");
    const r3 = into(s, opp, rite(), "library");
    s = run(s, planCast(s, ap, ids[0]!, [player(opp)]));
    for (let i = 0; i < 10 && s.pending?.kind !== "searchLibrary"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const pick = s.pending;
    if (pick?.kind !== "searchLibrary") throw new Error("no pick from the hand");
    // The basic land can't be chosen.
    expect(pick.cards).not.toContain(f1);
    expect(pick.cards).toContain(other);
    s = act(s, { type: "searchLibrary", player: ap, found: [r1!] });
    const search = s.pending;
    if (search?.kind !== "searchLibrary" || search.zonesOf !== opp) throw new Error("no search");
    expect(search.also).toEqual([r2]);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: search.cards }));
    for (const id of [r1!, r2, r3]) expect(zone(s, id)).toBe("exile");
    expect(zone(s, other!)).toBe("hand");
    expect(zone(s, f1!)).toBe("hand");
  });

  it("Shimian Specter: on combat damage, a nonland card from that player's hand names the cards exiled", () => {
    let { s, ap, opp } = setup([]);
    const sp = putOnBattlefield(s, ap, shimianSpecter);
    const [b1] = handOf(s, opp, [bolt(), forest]);
    const b2 = into(s, opp, bolt(), "graveyard");
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: sp, defender: opp }] });
    for (let i = 0; i < 40 && s.pending?.kind !== "searchLibrary"; i++) {
      const p = s.pending;
      if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    const pick = s.pending;
    if (pick?.kind !== "searchLibrary") throw new Error("no pick from the hand");
    expect(pick.cards).toEqual([b1]);
    s = act(s, { type: "searchLibrary", player: ap, found: [b1!] });
    const search = s.pending;
    if (search?.kind !== "searchLibrary") throw new Error("no search");
    s = settle(act(s, { type: "searchLibrary", player: ap, found: search.cards }));
    expect(zone(s, b1!)).toBe("exile");
    expect(zone(s, b2)).toBe("exile");
  });
});

describe("Licids: the creature becomes an Aura until its controller pays to end the effect", () => {
  it("compiles them", () => supported(calmingLicid, dominatingLicid, glidingLicid, transmogrifyingLicid, leechingLicid, nurturingLicid, convulsingLicid, corruptingLicid, enragingLicid, quickeningLicid, stingingLicid, temptingLicid));

  const types = (s: GameState, id: string) => characteristics(s, s.objects[id]!).types.join(" ");

  it("Gliding Licid: it loses the ability, becomes an Aura giving flying, and paying {U} makes it a creature again", () => {
    let { s, ap } = setup([]);
    const l = putOnBattlefield(s, ap, glidingLicid);
    const b = putOnBattlefield(s, ap, greenBear());
    s = settle(run(s, planActivate(s, ap, l, 0, [tgt(b)])));
    expect(types(s, l)).toBe("Enchantment");
    expect(subtypes(s, l)).toBe("Aura"); // no longer a Licid (rulings)
    expect(s.objects[l]!.attachedTo).toBe(b);
    expect(objHasKeyword(s, s.objects[b]!, "Flying")).toBe(true);
    expect(abilitiesOf(s, s.objects[l]!).activated).toHaveLength(0); // "loses this ability"
    s = settle(run(s, planEndEffect(s, ap, l)));
    expect(logged(s, /pays \{U\} to end Gliding Licid's effect/)).toBe(true);
    expect(types(s, l)).toBe("Creature");
    expect(subtypes(s, l)).toBe("Licid");
    expect(s.objects[l]!.attachedTo).toBeUndefined(); // CR 704.5p
    expect(zone(s, l)).toBe("battlefield");
    expect(objHasKeyword(s, s.objects[b]!, "Flying")).toBe(false);
    expect(abilitiesOf(s, s.objects[l]!).activated).toHaveLength(1);
    expect(endEffectProblem(s, ap, l)).not.toBeNull(); // the effect is gone
  });

  it("only the player who activated it may pay, with priority and the mana", () => {
    let { s, ap, opp } = setup([]);
    const l = putOnBattlefield(s, ap, glidingLicid);
    const b = putOnBattlefield(s, opp, greenBear());
    s = settle(run(s, planActivate(s, ap, l, 0, [tgt(b)])));
    expect(s.objects[l]!.attachedTo).toBe(b);
    expect(endEffectProblem(s, opp, l)).not.toBeNull();
    expect(planEndEffect(s, opp, l)).toBeNull();
    for (const id of s.battlefield) if (controllerOf(s, s.objects[id]!) === ap && id !== l) s.objects[id]!.tapped = true;
    expect(endEffectProblem(s, ap, l)).toMatch(/not enough mana/);
    expect(planEndEffect(s, ap, l)).toBeNull();
  });

  it("paying is a special action: a Disenchant aimed at the Aura is left without a legal target (rulings)", () => {
    const disenchant = card("Test Disenchant", "Instant", "{1}{W}", { cmc: 2, oracleText: "Destroy target artifact or enchantment." });
    let { s, ap, ids } = setup([disenchant]);
    const l = putOnBattlefield(s, ap, calmingLicid);
    const b = putOnBattlefield(s, ap, greenBear());
    s = settle(run(s, planActivate(s, ap, l, 0, [tgt(b)])));
    s = run(s, planCast(s, ap, ids[0]!, [tgt(l)]));
    expect(s.stack).toHaveLength(1);
    s = run(s, planEndEffect(s, ap, l));
    expect(s.stack).toHaveLength(1); // it didn't use the stack
    s = settle(s);
    expect(zone(s, l)).toBe("battlefield");
    expect(types(s, l)).toBe("Creature");
  });

  it("Dominating Licid: you control the enchanted creature until the effect ends", () => {
    let { s, ap, opp } = setup([]);
    const l = putOnBattlefield(s, ap, dominatingLicid);
    const b = putOnBattlefield(s, opp, greenBear());
    s = settle(run(s, planActivate(s, ap, l, 0, [tgt(b)])));
    expect(controllerOf(s, s.objects[b]!)).toBe(ap);
    s = settle(run(s, planEndEffect(s, ap, l)));
    expect(controllerOf(s, s.objects[b]!)).toBe(opp);
    expect(controllerOf(s, s.objects[l]!)).toBe(ap);
  });

  it("Transmogrifying Licid: no longer an artifact; when the creature dies, the Aura goes to the graveyard", () => {
    let { s, ap, ids } = setup([bolt()]);
    const l = putOnBattlefield(s, ap, transmogrifyingLicid);
    const b = putOnBattlefield(s, ap, greenBear());
    s = settle(run(s, planActivate(s, ap, l, 0, [tgt(b)])));
    expect(types(s, l)).toBe("Enchantment"); // it stops being an artifact and a creature (rulings)
    expect(pt(s, b)).toBe("3/3");
    expect(types(s, b)).toContain("Artifact");
    s.objects[b]!.damage = 1;
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(b)])));
    expect(zone(s, b)).toBe("graveyard");
    expect(zone(s, l)).toBe("graveyard"); // CR 704.5m
  });

  it("a Licid that targets itself can't enchant itself, so it goes to the graveyard (CR 303.4d)", () => {
    let { s, ap } = setup([]);
    const l = putOnBattlefield(s, ap, enragingLicid);
    s = settle(run(s, planActivate(s, ap, l, 0, [tgt(l)])));
    expect(zone(s, l)).toBe("graveyard");
  });

  it("Nurturing Licid: as an Aura, its other ability regenerates the enchanted creature", () => {
    let { s, ap, ids } = setup([bolt()]);
    const l = putOnBattlefield(s, ap, nurturingLicid);
    const b = putOnBattlefield(s, ap, greenBear());
    expect(abilitiesOf(s, s.objects[l]!).activated).toHaveLength(2);
    s = settle(run(s, planActivate(s, ap, l, 0, [tgt(b)])));
    const left = abilitiesOf(s, s.objects[l]!).activated;
    expect(left).toHaveLength(1);
    expect(left[0]!.text).toMatch(/Regenerate/);
    s = settle(run(s, planActivate(s, ap, l, 0, [])));
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(b)])));
    expect(zone(s, b)).toBe("battlefield");
    expect(s.objects[b]!.tapped).toBe(true);
  });

  it("Leeching Licid: 1 damage to the enchanted creature's controller each of their upkeeps", () => {
    let { s, ap, opp } = setup([]);
    const l = putOnBattlefield(s, ap, leechingLicid);
    const b = putOnBattlefield(s, opp, greenBear());
    s = settle(run(s, planActivate(s, ap, l, 0, [tgt(b)])));
    const was = life(s, opp);
    s = passUntil(s, "draw", opp);
    expect(life(s, opp)).toBe(was - 1);
  });
});
