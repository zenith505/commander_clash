// Round 98: Breach the Multiverse (you choose a card in each graveyard, CR 205.3d for "becomes a Phyrexian"), The Soul
// Stone (harness and ∞, CR 701.64, 702.186; "Exile a creature you control" as a cost), Throne of Eldraine (mana spent only
// on monocolored spells of the chosen color, an ability that takes only mana of that color), Ripples of Potential
// (proliferate, then phase out, CR 702.26), Sword of Hearth and Home ("put both cards onto the battlefield", rulings),
// Archway of Innovation (the next spell has improvise, CR 702.126), Myr Battlesphere and Hellrider ("the player or
// planeswalker it's attacking", CR 506.2), Promise of Loyalty (a vow counter that keeps "can't attack you", CR 611.2b) and
// City of Shadows.

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { abilitiesOf, characteristics, compileCard, isFullySupported, objIsType, planActivate, planCast, power, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const breach = card("Breach the Multiverse", "Sorcery", "{5}{B}{B}", { keywords: ["Mill"], oracleText: "Each player mills ten cards. For each player, choose a creature or planeswalker card in that player's graveyard. Put those cards onto the battlefield under your control. Then each creature you control becomes a Phyrexian in addition to its other types." });
const soulStone = card("The Soul Stone", "Legendary Artifact — Infinity Stone", "{1}{B}", { keywords: ["Indestructible"], oracleText: "Indestructible\n{T}: Add {B}.\n{6}{B}, {T}, Exile a creature you control: Harness The Soul Stone. (Once harnessed, its ∞ ability is active.)\n∞ — At the beginning of your upkeep, return target creature card from your graveyard to the battlefield." });
const throne = card("Throne of Eldraine", "Legendary Artifact", "{5}", { oracleText: "As Throne of Eldraine enters, choose a color.\n{T}: Add four mana of the chosen color. Spend this mana only to cast monocolored spells of that color.\n{3}, {T}: Draw two cards. Spend only mana of the chosen color to activate this ability." });
const ripples = card("Ripples of Potential", "Instant", "{1}{U}", { keywords: ["Proliferate"], oracleText: "Proliferate, then choose any number of permanents you control that had a counter put on them this way. Those permanents phase out. (To proliferate, choose any number of permanents and/or players, then give each another counter of each kind already there. Treat phased-out permanents and anything attached to them as though they don't exist until their controller's next turn.)" });
const sword = card("Sword of Hearth and Home", "Artifact — Equipment", "{3}", { keywords: ["Equip"], oracleText: "Equipped creature gets +2/+2 and has protection from green and from white.\nWhenever equipped creature deals combat damage to a player, exile up to one target creature you own, then search your library for a basic land card. Put both cards onto the battlefield under your control, then shuffle.\nEquip {2}" });
const archway = card("Archway of Innovation", "Land", "", { oracleText: "This land enters tapped unless you control an Island.\n{T}: Add {U}.\n{U}, {T}: The next spell you cast this turn has improvise. (Your artifacts can help cast that spell. Each artifact you tap after you're done activating mana abilities pays for {1}.)" });
const battlesphere = card("Myr Battlesphere", "Artifact Creature — Myr Construct", "{7}", { power: "4", toughness: "7", oracleText: "When this creature enters, create four 1/1 colorless Myr artifact creature tokens.\nWhenever this creature attacks, you may tap X untapped Myr you control. If you do, this creature gets +X/+0 until end of turn and deals X damage to the player or planeswalker it's attacking." });
const promise = card("Promise of Loyalty", "Sorcery", "{4}{W}", { oracleText: "Each player puts a vow counter on a creature they control and sacrifices the rest. Each of those creatures can't attack you or planeswalkers you control for as long as it has a vow counter on it." });
const city = card("City of Shadows", "Land", "", { oracleText: "{T}, Exile a creature you control: Put a storage counter on this land.\n{T}: Add {C} for each storage counter on this land." });
const hellrider = card("Hellrider", "Creature — Devil", "{2}{R}{R}", { power: "3", toughness: "3", keywords: ["Haste"], oracleText: "Haste\nWhenever a creature you control attacks, this creature deals 1 damage to the player or planeswalker it's attacking." });
const mageSlayer = card("Mage Slayer", "Artifact — Equipment", "{1}{R}{G}", { keywords: ["Equip"], oracleText: "Whenever equipped creature attacks, it deals damage equal to its power to the player or planeswalker it's attacking.\nEquip {3}" });

const giant = card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" });
const walker = card("Test Walker", "Legendary Planeswalker — Jace", "{2}{U}", { loyalty: "5", oracleText: "+1: Draw a card." });
const myr = card("Myr Token Maker", "Artifact Creature — Myr", "{1}", { power: "1", toughness: "1" });
const trinket = card("Trinket", "Artifact", "{1}");
const lightningBolt = card("Lightning Bolt", "Instant", "{R}", { oracleText: "Lightning Bolt deals 3 damage to any target." });
const shock = card("Red Thing", "Instant", "{1}{R}", { oracleText: "Red Thing deals 2 damage to any target." });
const boros = card("Boros Thing", "Instant", "{R}{W}", { oracleText: "Boros Thing deals 2 damage to any target." });
const growth = card("Grow Strong", "Sorcery", "{G}", { oracleText: "Put three +1/+1 counters on target creature." });
const sorcery = card("Big Draw", "Sorcery", "{4}{U}", { oracleText: "Draw two cards." });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};
const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const nextAfter = (s: GameState, p: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(p) + 1) % 4]!;
function to(s: GameState, pid: PlayerId, zone: "graveyard" | "library" | "hand", def: CardDef, top = true) {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library[top ? "unshift" : "push"](id);
  else s.players[pid]![zone].push(id);
  return id;
}
const attack = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId; planeswalker?: string }[]) => settle(act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks }));
const name = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]!.name;

describe("round 98, first cards", () => {
  it("parse", () => {
    supported(breach, soulStone, throne, ripples, sword, archway, battlesphere, promise, city, hellrider, mageSlayer);
    expect(compileCard(soulStone).activated.find((a) => a.body.effects[0]?.type === "harness")?.costs).toEqual([expect.objectContaining({ kind: "sacrifice", exile: true })]);
  });

  it("Breach the Multiverse: you choose a creature or planeswalker card in each graveyard; they all enter under your control as Phyrexians", () => {
    const { s: s0, ap, ids } = setup([breach]);
    const others = s0.turnOrder.filter((p) => p !== ap);
    // Nothing but lands to mill, so the cards to choose are the ones put there.
    for (const p of s0.turnOrder) s0.players[p]!.library = s0.players[p]!.library.filter((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Forest");
    // Two to choose from in each graveyard (with only one, it's chosen for you).
    const mine = to(s0, ap, "graveyard", giant);
    to(s0, ap, "graveyard", bear({ name: "Spare Bear" }));
    const theirs = others.map((p, i) => to(s0, p, "graveyard", i === 0 ? walker : bear({ name: `Bear ${i}` })));
    for (const p of others) to(s0, p, "graveyard", bear({ name: "Spare Bear" }));
    let s = cast(s0, ap, ids[0]!);
    for (let i = 0; i < 4; i++) {
      expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
      const cards = s.pending?.kind === "searchLibrary" ? s.pending.cards : [];
      const want = [mine, ...theirs].find((id) => cards.includes(id));
      expect(want).toBeDefined();
      s = act(s, { type: "searchLibrary", player: ap, found: [want!] });
    }
    s = settle(s);
    for (const id of [mine, ...theirs]) {
      expect(s.objects[id]!.zone).toBe("battlefield");
      expect(s.objects[id]!.controller).toBe(ap);
    }
    expect(characteristics(s, s.objects[mine]!).subtypes).toEqual(expect.arrayContaining(["Giant", "Phyrexian"]));
    // The planeswalker isn't a creature: no Phyrexian (CR 205.3d).
    expect(characteristics(s, s.objects[theirs[0]!]!).subtypes).not.toContain("Phyrexian");
    for (const p of s.turnOrder) expect(s.players[p]!.graveyard.length).toBeGreaterThanOrEqual(9);
  });

  it("The Soul Stone: exile a creature to harness it; then its ∞ ability returns a creature card at your upkeep", () => {
    const { s: s0, ap } = setup([]);
    const stone = putOnBattlefield(s0, ap, soulStone);
    const fodder = putOnBattlefield(s0, ap, bear());
    const dead = to(s0, ap, "graveyard", giant);
    // The ∞ ability is there only while it's harnessed (CR 702.186b).
    expect(compileCard(soulStone).triggers[0]?.activeIf).toEqual({ kind: "harnessed" });
    const index = compileCard(soulStone).activated.findIndex((a) => a.body.effects[0]?.type === "harness");
    let s = settle(run(s0, planActivate(s0, ap, stone, index, undefined, undefined, undefined, undefined, { sacrifice: [fodder] })));
    expect(s.objects[fodder]!.zone).toBe("exile");
    expect(s.objects[stone]!.harnessed).toBe(true);
    expect(abilitiesOf(s, s.objects[stone]!).triggers).toHaveLength(1);
    s = passUntil(s, "upkeep", ap);
    for (let i = 0; i < 20 && s.objects[dead]!.zone !== "battlefield"; i++) {
      const pend = s.pending;
      if (pend?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: pend.player, targets: [target(dead)] });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.objects[dead]!.zone).toBe("battlefield");
  });

  it("Throne of Eldraine: its four mana casts only monocolored spells of the chosen color; its draw takes only that color", () => {
    const { s: s0, ap, ids } = setup([lightningBolt, boros, sorcery]);
    // Only the Throne for mana.
    for (const id of [...s0.battlefield]) if (s0.objects[id]!.controller === ap) s0.objects[id]!.tapped = true;
    const t = putOnBattlefield(s0, ap, throne);
    s0.objects[t]!.chosen = { color: "R" };
    // A blue sorcery and a red-white instant can't use it.
    expect(planCast(s0, ap, ids[2]!)).toBeNull();
    expect(planCast(s0, ap, ids[1]!, [{ kind: "player", id: nextAfter(s0, ap) }])).toBeNull();
    const opp = nextAfter(s0, ap);
    const life = s0.players[opp]!.life;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(life - 3);
    // The draw ability: {3} of the chosen color only.
    const { s: s1, ap: ap1 } = setup([]);
    const t1 = putOnBattlefield(s1, ap1, throne);
    s1.objects[t1]!.chosen = { color: "U" };
    for (const id of [...s1.battlefield]) {
      const o = s1.objects[id]!;
      if (o.controller === ap1 && id !== t1 && s1.cards[o.cardId]!.name === "Island") o.tapped = true;
    }
    expect(planActivate(s1, ap1, t1, 0)).toBeNull();
    for (const id of s1.battlefield) if (s1.cards[s1.objects[id]!.cardId]!.name === "Island") s1.objects[id]!.tapped = false;
    const hand = s1.players[ap1]!.hand.length;
    const s2 = settle(run(s1, planActivate(s1, ap1, t1, 0)));
    expect(s2.players[ap1]!.hand.length).toBe(hand + 2);
  });

  it("Ripples of Potential: proliferate, then phase out any of yours that got a counter", () => {
    const { s: s0, ap, ids } = setup([growth, ripples]);
    const b = putOnBattlefield(s0, ap, bear());
    const other = putOnBattlefield(s0, ap, bear({ name: "Plain Bear" }));
    let s = settle(cast(s0, ap, ids[0]!, [target(b)]));
    s = cast(s, ap, ids[1]!);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "phaseOut", options: [b], min: 0 });
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [b] }));
    expect(s.objects[b]!.counters["+1/+1"]).toBe(4);
    expect(s.objects[b]!.zone).toBe("phasedOut");
    expect(s.objects[other]!.zone).toBe("battlefield");
  });

  it("Sword of Hearth and Home: flickers a creature you own and fetches a basic land, both entering together", () => {
    const { s: s0, ap } = setup([]);
    const opp = nextAfter(s0, ap);
    const b = putOnBattlefield(s0, ap, bear());
    const sw = putOnBattlefield(s0, ap, sword);
    s0.objects[sw]!.attachedTo = b;
    const friend = putOnBattlefield(s0, ap, giant);
    s0.objects[friend]!.counters["+1/+1"] = 2;
    const land = to(s0, ap, "library", card("Plains", "Basic Land — Plains"));
    let s = attack(s0, ap, [{ attacker: b, defender: opp }]);
    for (let i = 0; i < 40 && !s.pending?.kind.match(/chooseTargets|searchLibrary/) && s.objects[land]!.zone === "library"; i++) {
      const pid = waitingOn(s)!;
      s = act(s, s.pending?.kind === "declareBlockers" ? { type: "declareBlockers", player: pid, blocks: [] } : { type: "passPriority", player: pid });
    }
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [target(friend)] });
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [land] }));
    expect(s.objects[land]!.zone).toBe("battlefield");
    // The Giant came back as a new object, without its counters (CR 400.7).
    const back = s.battlefield.find((id) => name(s, id) === "Hill Giant")!;
    expect(back).toBeDefined();
    expect(s.objects[back]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("Archway of Innovation: the next spell this turn has improvise", () => {
    const { s: s0, ap, ids } = setup([sorcery]);
    for (const id of [...s0.battlefield]) if (s0.objects[id]!.controller === ap) s0.objects[id]!.tapped = true;
    const arch = putOnBattlefield(s0, ap, archway);
    const isl = putOnBattlefield(s0, ap, card("Island", "Basic Land — Island"));
    const isl2 = putOnBattlefield(s0, ap, card("Island", "Basic Land — Island"));
    for (let i = 0; i < 4; i++) putOnBattlefield(s0, ap, trinket);
    expect(planCast(s0, ap, ids[0]!, undefined, undefined, "auto")).toBeNull();
    let s = settle(run(s0, planActivate(s0, ap, arch, 0)));
    expect(s.players[ap]!.nextSpellImprovise).toBe(s.turn);
    expect(s.objects[isl]!.tapped || s.objects[isl2]!.tapped).toBe(true);
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto")));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2);
    expect(s.players[ap]!.nextSpellImprovise).toBeUndefined();
  });

  it("Myr Battlesphere: tap X Myr for +X/+0 and X damage to the planeswalker it's attacking", () => {
    const { s: s0, ap } = setup([]);
    const opp = nextAfter(s0, ap);
    const bs = putOnBattlefield(s0, ap, battlesphere);
    const myrs = [0, 1, 2].map(() => putOnBattlefield(s0, ap, myr));
    const pw = putOnBattlefield(s0, opp, walker);
    s0.objects[pw]!.counters.loyalty = 5;
    let s = attack(s0, ap, [{ attacker: bs, defender: opp, planeswalker: pw }]);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "tap" });
    const life = s.players[opp]!.life;
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: myrs.slice(0, 2) }));
    expect(power(s, s.objects[bs]!)).toBe(6);
    expect(s.objects[pw]!.counters.loyalty).toBe(3);
    expect(s.players[opp]!.life).toBe(life);
  });

  it("Hellrider and Mage Slayer: each attacking creature's own defender is dealt the damage", () => {
    const { s: s0, ap } = setup([]);
    const [o1, o2] = [nextAfter(s0, ap), nextAfter(s0, nextAfter(s0, ap))];
    putOnBattlefield(s0, ap, hellrider);
    const a = putOnBattlefield(s0, ap, giant);
    const b = putOnBattlefield(s0, ap, bear());
    const slayer = putOnBattlefield(s0, ap, mageSlayer);
    s0.objects[slayer]!.attachedTo = a;
    const [l1, l2] = [s0.players[o1]!.life, s0.players[o2]!.life];
    const s = attack(s0, ap, [{ attacker: a, defender: o1 }, { attacker: b, defender: o2 }]);
    // Hellrider: 1 to each defender; Mage Slayer: the Giant's 3 to its own.
    expect(s.players[o1]!.life).toBe(l1 - 1 - 3);
    expect(s.players[o2]!.life).toBe(l2 - 1);
  });

  it("Promise of Loyalty: each player keeps one creature with a vow counter, which can't attack you while it has it", () => {
    const { s: s0, ap, ids } = setup([promise]);
    const opp = nextAfter(s0, ap);
    const mine = [putOnBattlefield(s0, ap, bear()), putOnBattlefield(s0, ap, giant)];
    const theirs = [putOnBattlefield(s0, opp, bear({ name: "Their Bear" })), putOnBattlefield(s0, opp, giant)];
    let s = cast(s0, ap, ids[0]!);
    for (let i = 0; i < 6 && s.pending?.kind === "pickPermanents"; i++) {
      const p = s.pending.player;
      s = act(s, { type: "pickPermanents", player: p, ids: [p === ap ? mine[1]! : p === opp ? theirs[0]! : s.pending.options[0]!] });
    }
    s = settle(s);
    expect(s.objects[mine[0]!]!.zone).toBe("graveyard");
    expect(s.objects[theirs[1]!]!.zone).toBe("graveyard");
    expect(s.objects[theirs[0]!]!.counters.vow).toBe(1);
    // On the opponent's turn, their vowed Bear can't attack you, but can attack someone else.
    s = passUntil(s, "declareAttackers", opp);
    expect(() => act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: theirs[0]!, defender: ap }] })).toThrow();
    const third = nextAfter(s, opp) === ap ? nextAfter(s, ap) : nextAfter(s, opp);
    const s2 = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: theirs[0]!, defender: third }] });
    expect(s2.objects[theirs[0]!]!.attacking).toBe(third);
    // Without the counter it can.
    s.objects[theirs[0]!]!.counters.vow = 0;
    const s3 = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: theirs[0]!, defender: ap }] });
    expect(s3.objects[theirs[0]!]!.attacking).toBe(ap);
  });

  it("City of Shadows: exile a creature you control to put a storage counter on it", () => {
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, city);
    const b = putOnBattlefield(s0, ap, bear());
    const s = settle(run(s0, planActivate(s0, ap, c, 0, undefined, undefined, undefined, undefined, { sacrifice: [b] })));
    expect(s.objects[b]!.zone).toBe("exile");
    expect(s.objects[c]!.counters.storage).toBe(1);
    expect(objIsType(s, s.objects[c]!, "Land")).toBe(true);
  });
});
