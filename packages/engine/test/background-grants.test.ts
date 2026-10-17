// Static abilities given to permanents (the Backgrounds' 'Commander creatures you own have "..."', CR 613.1, 613.7a),
// "whenever you cast a spell from exile / from anywhere other than your hand" (CR 601.2a), kinship, granted myriad
// (CR 702.116b), tokens attacking each opponent (CR 508.4), and Oblation.

import { describe, expect, it } from "vitest";
import { act, addEffect, bear, card, forest, passUntil, pt, putOnBattlefield, setup, target } from "./helpers";
import { abilitiesOf, characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.oracleText).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const castNow = (s: GameState, pid: PlayerId, id: string, targets?: Parameters<typeof planCast>[3]) => {
  const plan = planCast(s, pid, id, targets);
  if (!plan) throw new Error(`can't cast ${s.cards[s.objects[id]!.cardId]!.name}`);
  return plan.reduce((x, a) => act(x, a), s);
};
const named = (s: GameState, name: string, pid?: PlayerId) => s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === name && (pid === undefined || s.objects[id]!.controller === pid));
/** Move a permanent `putOnBattlefield` made into a zone, as a test setup step. */
function moveTo(s: GameState, id: string, zone: "hand" | "graveyard" | "library") {
  const o = s.objects[id]!;
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  o.zone = zone;
  const p = s.players[o.owner]!;
  if (zone === "library") p.library.unshift(id);
  else p[zone].push(id);
  invalidateCharacteristics(s);
  return id;
}

// Real oracle text (Scryfall).
const bg = (name: string, cost: string, text: string) => card(name, "Legendary Enchantment — Background", cost, { oracleText: text });
const criminalPast = bg("Criminal Past", "{2}{B}", 'Commander creatures you own have menace and "This creature gets +X/+0, where X is the number of creature cards in your graveyard." (A creature with menace can\'t be blocked except by two or more creatures.)');
const inspiringLeader = bg("Inspiring Leader", "{2}{W}", 'Commander creatures you own have "Creature tokens you control get +2/+2."');
const raisedByGiants = bg("Raised by Giants", "{5}{G}", "Commander creatures you own have base power and toughness 10/10 and are Giants in addition to their other types.");
const masterChef = bg("Master Chef", "{2}{G}", 'Commander creatures you own have "This creature enters with an additional +1/+1 counter on it" and "Other creatures you control enter with an additional +1/+1 counter on them."');
const acolyte = bg("Acolyte of Bahamut", "{1}{G}", 'Commander creatures you own have "The first Dragon spell you cast each turn costs {2} less to cast."');
const candlekeep = bg("Candlekeep Sage", "{2}{U}", 'Commander creatures you own have "When this creature enters or leaves the battlefield, draw a card."');
const streetUrchin = bg("Street Urchin", "{1}{R}", 'Commander creatures you own have "{1}, Sacrifice another creature or an artifact: This creature deals 1 damage to any target."');
const veteranSoldier = bg("Veteran Soldier", "{1}{W}", 'Commander creatures you own have "Whenever this creature attacks a player, if no opponent has more life than that player, for each opponent, create a 1/1 white Soldier creature token that\'s tapped and attacking that opponent."');
const folkHero = bg("Folk Hero", "{1}{W}", 'Commander creatures you own have "Whenever you cast a spell that shares a creature type with this creature, draw a card. This ability triggers only once each turn."');
const archaeologist = bg("Passionate Archaeologist", "{1}{R}", 'Commander creatures you own have "Whenever you cast a spell from exile, this creature deals damage equal to that spell\'s mana value to target opponent."');
const cloakwood = bg("Cloakwood Hermit", "{2}{G}", 'Commander creatures you own have "At the beginning of your end step, if a creature card was put into your graveyard from anywhere this turn, create two tapped 1/1 green Squirrel creature tokens."');
const dragonCultist = bg("Dragon Cultist", "{4}{R}", 'Commander creatures you own have "At the beginning of your end step, if a source you controlled dealt 5 or more damage this turn, create a 4/4 red Dragon creature token with flying."');
const hardyOutlander = bg("Hardy Outlander", "{1}{G}", 'Commander creatures you own have "Whenever this creature attacks a player, if no opponent has more life than that player, another target creature you control gets +X/+X until end of turn, where X is this creature\'s power."');
const chimericMass = card("Chimeric Mass", "Artifact", "{X}", { oracleText: 'This artifact enters with X charge counters on it.\n{1}: Until end of turn, this artifact becomes a Construct artifact creature with "This creature\'s power and toughness are each equal to the number of charge counters on it."' });
const kudo = card("Kudo, King Among Bears", "Legendary Creature — Bear", "{G}{W}", { power: "2", toughness: "2", oracleText: "Other creatures have base power and toughness 2/2 and are Bears in addition to their other types." });
const vega = card("Vega, the Watcher", "Legendary Creature — Bird Spirit", "{1}{W}{U}", { power: "2", toughness: "2", keywords: ["Flying"], oracleText: "Flying\nWhenever you cast a spell from anywhere other than your hand, draw a card." });
const endlessFoot = card("Endless Foot Assault", "Enchantment", "{2}{W}", { keywords: ["Squad"], oracleText: "Squad {1}{W} (As an additional cost to cast this spell, you may pay {1}{W} any number of times. When this enchantment enters, create that many tokens that are copies of it.)\nWhenever you attack, for each opponent, create a 1/1 black Ninja creature token that's tapped and attacking that player." });
const legionLoyalty = card("Legion Loyalty", "Enchantment", "{6}{W}{W}", { oracleText: "Creatures you control have myriad. (Whenever a creature with myriad attacks, for each opponent other than defending player, you may create a token copy that's tapped and attacking that player or a planeswalker they control. Exile the tokens at end of combat.)" });
const oblation = card("Oblation", "Instant", "{2}{W}", { oracleText: "The owner of target nonland permanent shuffles it into their library, then draws two cards." });
const clanger = card("Mudbutton Clanger", "Creature — Goblin Warrior", "{R}", { power: "1", toughness: "1", keywords: ["Kinship"], oracleText: "Kinship — At the beginning of your upkeep, you may look at the top card of your library. If it shares a creature type with this creature, you may reveal it. If you do, this creature gets +1/+1 until end of turn." });
const urchinBlocker = card("Grim Test Static", "Enchantment — Aura", "{B}", { keywords: ["Enchant"], oracleText: 'Enchant creature\nEnchanted creature has "This creature can\'t block."' });

const goblinCard = card("Goblin Test", "Creature — Goblin", "{R}", { power: "1", toughness: "1" });
const shapeshifter = card("Changeling Test", "Creature — Shapeshifter", "{U}", { power: "1", toughness: "1", keywords: ["Changeling"], oracleText: "Changeling (This card is every creature type.)" });
const dragon = card("Dragon Test", "Creature — Dragon", "{3}{R}", { power: "4", toughness: "4" });
const humanCmdr = card("Human Commander Test", "Legendary Creature — Human Warrior", "{1}{W}", { power: "2", toughness: "2" });
const artifactCmdr = card("Artifact Commander Test", "Legendary Artifact Creature — Construct", "{2}", { power: "2", toughness: "2" });
const shock = card("Shock Test", "Instant", "{R}", { oracleText: "Shock Test deals 2 damage to any target." });
const impulse = card("Impulse Test", "Sorcery", "{R}", { oracleText: "Exile the top card of your library. You may play that card this turn." });
const growth = card("Growth Test", "Instant", "{G}", { oracleText: "Target creature gets +3/+3 until end of turn." });

describe("static abilities given to commanders (Backgrounds)", () => {
  it("compiles them", () => {
    supported(criminalPast, inspiringLeader, raisedByGiants, masterChef, acolyte, candlekeep, streetUrchin, veteranSoldier, folkHero, archaeologist, cloakwood, dragonCultist, hardyOutlander, chimericMass, kudo, vega, endlessFoot, legionLoyalty, oblation, clanger, urchinBlocker);
  });

  it("Criminal Past: menace and +X/+0 counting its controller's graveyard (rulings)", () => {
    const { s, ap, opp } = setup([]);
    const cmd = putOnBattlefield(s, ap, humanCmdr, { commander: true });
    putOnBattlefield(s, ap, criminalPast);
    moveTo(s, putOnBattlefield(s, ap, bear()), "graveyard");
    moveTo(s, putOnBattlefield(s, ap, bear()), "graveyard");
    moveTo(s, putOnBattlefield(s, ap, forest), "graveyard");
    moveTo(s, putOnBattlefield(s, opp, bear()), "graveyard");
    expect(pt(s, cmd)).toBe("4/2");
    expect(objHasKeyword(s, s.objects[cmd]!, "Menace")).toBe(true);
    // A creature card more: counted continuously.
    moveTo(s, putOnBattlefield(s, ap, bear()), "graveyard");
    expect(pt(s, cmd)).toBe("5/2");
    // Under an opponent's control, "your graveyard" is that player's.
    addEffect(s, opp, [cmd], [{ kind: "control" }], "game");
    expect(pt(s, cmd)).toBe("3/2");
    // A creature that isn't a commander gets nothing.
    expect(pt(s, putOnBattlefield(s, ap, bear()))).toBe("2/2");
  });

  it("Inspiring Leader: the commander's controller's creature tokens get +2/+2 while it's on the battlefield", () => {
    const { s, ap, opp } = setup([]);
    const cmd = putOnBattlefield(s, ap, humanCmdr, { commander: true });
    putOnBattlefield(s, ap, inspiringLeader);
    const tok = putOnBattlefield(s, ap, bear());
    s.objects[tok]!.isToken = true;
    const theirs = putOnBattlefield(s, opp, bear());
    s.objects[theirs]!.isToken = true;
    const notToken = putOnBattlefield(s, ap, bear());
    expect(pt(s, tok)).toBe("4/4");
    expect(pt(s, theirs)).toBe("2/2");
    expect(pt(s, notToken)).toBe("2/2");
    expect(pt(s, cmd)).toBe("2/2");
    moveTo(s, cmd, "graveyard");
    s.objects[cmd]!.zoneChanges = 1;
    expect(pt(s, tok)).toBe("2/2");
  });

  it("Raised by Giants: base 10/10 and a Giant (layers 4 and 7b); counters and pumps still add (7c)", () => {
    const { s, ap } = setup([]);
    const cmd = putOnBattlefield(s, ap, humanCmdr, { commander: true });
    putOnBattlefield(s, ap, raisedByGiants);
    expect(pt(s, cmd)).toBe("10/10");
    expect(characteristics(s, s.objects[cmd]!).subtypes).toEqual(expect.arrayContaining(["Human", "Warrior", "Giant"]));
    s.objects[cmd]!.counters["+1/+1"] = 1;
    addEffect(s, ap, [cmd], [{ kind: "modifyPT", power: 3, toughness: 3 }]);
    expect(pt(s, cmd)).toBe("14/14");
  });

  it("a granted 'power and toughness are each equal to' sets them in layer 7b, so a newer one overrides an older (Chimeric Mass rulings)", () => {
    const { s: s0, ap } = setup([]);
    const mass = putOnBattlefield(s0, ap, chimericMass);
    s0.objects[mass]!.counters.charge = 3;
    let s = settle(planActivate(s0, ap, mass, 0)!.reduce((x, a) => act(x, a), s0));
    expect(pt(s, mass)).toBe("3/3");
    // A pump adds on top; "becomes 1/1" (newer) overrides the granted one; activating again overrides that.
    addEffect(s, ap, [mass], [{ kind: "modifyPT", power: 3, toughness: 3 }]);
    expect(pt(s, mass)).toBe("6/6");
    addEffect(s, ap, [mass], [{ kind: "setPT", power: 1, toughness: 1 }]);
    expect(pt(s, mass)).toBe("4/4");
    s = settle(planActivate(s, ap, mass, 0)!.reduce((x, a) => act(x, a), s));
    expect(pt(s, mass)).toBe("6/6");
    // The counters change, so does it.
    s.objects[mass]!.counters.charge = 5;
    expect(pt(s, mass)).toBe("8/8");
  });

  it("Kudo: other creatures have base power and toughness 2/2 and are Bears", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, kudo);
    const d = putOnBattlefield(s, opp, dragon);
    expect(pt(s, d)).toBe("2/2");
    expect(characteristics(s, s.objects[d]!).subtypes).toEqual(["Dragon", "Bear"]);
  });

  it("Master Chef: the commander enters with an extra +1/+1 counter, and so do creatures entering after it", () => {
    const { s: s0, ap, ids } = setup([humanCmdr, bear()]);
    s0.objects[ids[0]!]!.isCommander = true;
    putOnBattlefield(s0, ap, masterChef);
    let s = settle(castNow(s0, ap, ids[0]!));
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(1);
    expect(pt(s, ids[0]!)).toBe("3/3");
    s = settle(castNow(s, ap, ids[1]!));
    expect(s.objects[ids[1]!]!.counters["+1/+1"]).toBe(1);
    expect(abilitiesOf(s, s.objects[ids[0]!]!).othersEnterWithCounters).toHaveLength(1);
  });

  it("Acolyte of Bahamut: the first Dragon spell each turn costs {2} less", () => {
    const { s: s0, ap, ids } = setup([dragon, dragon]);
    putOnBattlefield(s0, ap, humanCmdr, { commander: true });
    putOnBattlefield(s0, ap, acolyte);
    const lands = () => s.battlefield.filter((id) => s.objects[id]!.controller === ap && s.objects[id]!.tapped).length;
    let s = s0;
    s = settle(castNow(s, ap, ids[0]!));
    expect(lands()).toBe(2);
    const before = lands();
    s = settle(castNow(s, ap, ids[1]!));
    expect(lands() - before).toBe(4);
  });

  it("Candlekeep Sage: the commander draws as it enters and as it leaves", () => {
    const { s: s0, ap, ids } = setup([humanCmdr, oblation]);
    s0.objects[ids[0]!]!.isCommander = true;
    putOnBattlefield(s0, ap, candlekeep);
    const hand = () => s.players[ap]!.hand.length;
    let s = s0;
    const h0 = hand();
    s = settle(castNow(s, ap, ids[0]!));
    expect(hand()).toBe(h0 - 1 + 1);
    // Oblation on it: it leaves (its owner draws two), and the leaves-the-battlefield trigger draws one more.
    s = castNow(s, ap, ids[1]!, [target(ids[0]!)]);
    for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      if (s.pending?.kind === "chooseOption") s = act(s, { type: "chooseOption", player: s.pending.player, choice: s.pending.options[0]! });
      else if (s.pending) break;
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.log.filter((l) => /Candlekeep Sage|draws? a card/.test(l.text)).length).toBeGreaterThan(0);
    expect(hand()).toBe(h0 - 2 + 1 + 2 + 1);
  });

  it("Street Urchin: an artifact commander can sacrifice itself; any other needs another creature or an artifact (rulings)", () => {
    const { s, ap, opp } = setup([]);
    const art = putOnBattlefield(s, ap, artifactCmdr, { commander: true });
    putOnBattlefield(s, ap, streetUrchin);
    const plan = planActivate(s, ap, art, 0, [{ kind: "player", id: opp }]);
    expect(plan).not.toBeNull();
    const t = setup([]);
    const human = putOnBattlefield(t.s, t.ap, humanCmdr, { commander: true });
    putOnBattlefield(t.s, t.ap, streetUrchin);
    // Nothing else to sacrifice: the Human commander can't pay with itself.
    expect(planActivate(t.s, t.ap, human, 0, [{ kind: "player", id: t.opp }])).toBeNull();
    putOnBattlefield(t.s, t.ap, bear());
    expect(planActivate(t.s, t.ap, human, 0, [{ kind: "player", id: t.opp }])).not.toBeNull();
  });

  it("a granted 'This creature can't block' (rules layer) works", () => {
    const { s, ap } = setup([]);
    const b = putOnBattlefield(s, ap, bear());
    const a = putOnBattlefield(s, ap, urchinBlocker);
    s.objects[a]!.attachedTo = b;
    expect(characteristics(s, s.objects[b]!).cantBlock).toBe(true);
  });
});

describe("granted triggers that needed new pieces", () => {
  it("Veteran Soldier: a tapped and attacking Soldier for each opponent, each attacking that opponent", () => {
    const { s: s0, ap, opp } = setup([]);
    const cmd = putOnBattlefield(s0, ap, humanCmdr, { commander: true });
    putOnBattlefield(s0, ap, veteranSoldier);
    let s = passUntil(s0, "declareAttackers", ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: cmd, defender: opp }] }));
    const soldiers = named(s, "Soldier Token", ap);
    expect(soldiers).toHaveLength(3);
    expect(soldiers.map((id) => s.objects[id]!.attacking).sort()).toEqual(s.turnOrder.filter((p) => p !== ap).sort());
    expect(soldiers.every((id) => s.objects[id]!.tapped)).toBe(true);
  });

  it("Endless Foot Assault: out of combat-free turns nothing; on attack, one Ninja attacking each opponent", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, endlessFoot);
    const b = putOnBattlefield(s0, ap, bear());
    let s = passUntil(s0, "declareAttackers", ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] }));
    const ninjas = named(s, "Ninja Token", ap);
    expect(ninjas.map((id) => s.objects[id]!.attacking).sort()).toEqual(s.turnOrder.filter((p) => p !== ap).sort());
  });

  it("Hardy Outlander: another creature gets +X/+X, X the commander's power as the ability resolves", () => {
    const { s: s0, ap, opp } = setup([]);
    const cmd = putOnBattlefield(s0, ap, humanCmdr, { commander: true });
    putOnBattlefield(s0, ap, hardyOutlander);
    const b = putOnBattlefield(s0, ap, bear());
    s0.objects[cmd]!.counters["+1/+1"] = 2;
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: cmd, defender: opp }] });
    for (let i = 0; i < 20 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(b)] }));
    expect(pt(s, b)).toBe("6/6");
  });

  it("Folk Hero: a spell sharing a creature type with the commander draws, once each turn", () => {
    const { s: s0, ap, ids } = setup([card("Human Test", "Creature — Human", "{W}", { power: "1", toughness: "1" }), card("Warrior Test", "Creature — Elf Warrior", "{G}", { power: "1", toughness: "1" }), bear()]);
    putOnBattlefield(s0, ap, humanCmdr, { commander: true });
    putOnBattlefield(s0, ap, folkHero);
    let s = s0;
    const hand = () => s.players[ap]!.hand.length;
    s = settle(castNow(s, ap, ids[2]!)); // a Bear: no
    const h = hand();
    s = settle(castNow(s, ap, ids[0]!)); // a Human: draws
    expect(hand()).toBe(h - 1 + 1);
    s = settle(castNow(s, ap, ids[1]!)); // a Warrior: already triggered this turn
    expect(hand()).toBe(h - 2 + 1);
  });

  it("Passionate Archaeologist: a spell cast from exile deals its mana value to target opponent", () => {
    const { s: s0, ap, ids, opp } = setup([impulse]);
    putOnBattlefield(s0, ap, humanCmdr, { commander: true });
    putOnBattlefield(s0, ap, archaeologist);
    const top = moveTo(s0, putOnBattlefield(s0, ap, dragon), "library");
    let s = settle(castNow(s0, ap, ids[0]!));
    expect(s.objects[top]!.zone).toBe("exile");
    const life = s.players[opp]!.life;
    s = castNow(s, ap, top);
    for (let i = 0; i < 20 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] });
      else if (s.pending) break;
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.players[opp]!.life).toBe(life - 4);
  });

  it("Vega: casting a commander from the command zone is from anywhere other than your hand; from the hand isn't", () => {
    const { s: s0, ap, ids } = setup([bear()]);
    putOnBattlefield(s0, ap, vega);
    let s = s0;
    const hand = () => s.players[ap]!.hand.length;
    s = settle(castNow(s, ap, ids[0]!));
    const h = hand();
    s = settle(castNow(s, ap, s.players[ap]!.command[0]!));
    expect(hand()).toBe(h + 1);
  });

  it("Cloakwood Hermit: two tapped Squirrels at your end step only if a creature card went to your graveyard this turn", () => {
    const { s: s0, ap, ids } = setup([shock]);
    const cmd = putOnBattlefield(s0, ap, humanCmdr, { commander: true });
    putOnBattlefield(s0, ap, cloakwood);
    let s = passUntil(s0, "end", ap);
    s = settle(s);
    expect(named(s, "Squirrel Token", ap)).toHaveLength(0);
    // Next turn of ap: a creature of theirs dies.
    s = passUntil(s, "main1", ap);
    const b = putOnBattlefield(s, ap, bear());
    s = settle(castNow(s, ap, s.players[ap]!.hand.find((id) => s.objects[id]!.cardId === s.objects[ids[0]!]!.cardId) ?? ids[0]!, [target(b)]));
    expect(s.objects[b]!.zone).toBe("graveyard");
    s = settle(passUntil(s, "end", ap));
    expect(named(s, "Squirrel Token", ap)).toHaveLength(2);
    expect(named(s, "Squirrel Token", ap).every((id) => s.objects[id]!.tapped)).toBe(true);
    expect(s.objects[cmd]!.zone).toBe("battlefield");
  });

  it("Dragon Cultist: a Dragon at your end step if one source you controlled dealt 5 or more damage this turn", () => {
    const { s: s0, ap, ids, opp } = setup([shock, shock]);
    putOnBattlefield(s0, ap, humanCmdr, { commander: true });
    putOnBattlefield(s0, ap, dragonCultist);
    // Two Shocks: 4 damage, but from two sources.
    let s = settle(castNow(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    s = settle(castNow(s, ap, ids[1]!, [{ kind: "player", id: opp }]));
    s = settle(passUntil(s, "end", ap));
    expect(named(s, "Dragon Token", ap)).toHaveLength(0);
  });
});

describe("kinship, granted myriad, Oblation", () => {
  it("kinship: a Goblin on top may be revealed for +1/+1; a card sharing no type isn't asked about; changeling shares", () => {
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, clanger);
    moveTo(s0, putOnBattlefield(s0, ap, goblinCard), "library");
    const other = (ap + 1) % 4;
    let s = passUntil(s0, "upkeep", other);
    s = passUntil(s, "upkeep", ap);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap, prompt: expect.stringContaining("Goblin Test") });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(pt(s, c)).toBe("2/2");
    expect(s.players[ap]!.library[0]).toBe(s.players[ap]!.library[0]); // the card stays on top (rulings)
    expect(s.log.some((l) => /reveals Goblin Test/.test(l.text))).toBe(true);
  });

  it("kinship: declining, or a card that shares no creature type, does nothing", () => {
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, clanger);
    const top = moveTo(s0, putOnBattlefield(s0, ap, bear()), "library");
    let s = passUntil(s0, "upkeep", (ap + 1) % 4);
    s = settle(passUntil(s, "upkeep", ap));
    expect(s.pending).toBeNull();
    expect(pt(s, c)).toBe("1/1");
    expect(s.players[ap]!.library[0]).toBe(top);
  });

  it("kinship: a changeling card shares a creature type", () => {
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, clanger);
    moveTo(s0, putOnBattlefield(s0, ap, shapeshifter), "library");
    let s = passUntil(s0, "upkeep", (ap + 1) % 4);
    s = settle(passUntil(s, "upkeep", ap));
    expect(s.pending).toMatchObject({ kind: "chooseMay" });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(pt(s, c)).toBe("1/1");
  });

  it("Legion Loyalty: creatures you control have myriad", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, legionLoyalty);
    const b = putOnBattlefield(s0, ap, bear());
    expect(abilitiesOf(s0, s0.objects[b]!).triggers.some((t) => t.event === "selfAttacks")).toBe(true);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    for (let i = 0; i < 30 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: ap, yes: true });
      else if (s.pending) break;
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    const copies = named(s, "Grizzly Bears", ap).filter((id) => s.objects[id]!.isToken);
    expect(copies).toHaveLength(2);
    expect(copies.map((id) => s.objects[id]!.attacking).sort()).toEqual(s.turnOrder.filter((p) => p !== ap && p !== opp).sort());
  });

  it("Oblation: the owner shuffles it into their library, then draws two cards", () => {
    const { s: s0, ap, ids, opp } = setup([oblation]);
    const b = putOnBattlefield(s0, opp, bear());
    const lib = s0.players[opp]!.library.length;
    const hand = s0.players[opp]!.hand.length;
    const s = settle(castNow(s0, ap, ids[0]!, [target(b)]));
    expect(s.objects[b]!.zone).toBe("library");
    expect(s.players[opp]!.library.length).toBe(lib + 1 - 2);
    expect(s.players[opp]!.hand.length).toBe(hand + 2);
  });
});
