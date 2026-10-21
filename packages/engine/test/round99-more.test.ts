// Round 99, the cards after the first four: "target opponent may have you ..." punishers (Combustible Gearhulk,
// Palantír of Orthanc, Terrapact Intimidator, Shakedown Heavy), "if it isn't that player's turn" (Tataru Taru),
// activated abilities costing less (Training Grounds, Heartstone, CR 602.2b, 601.2f), "can't have hexproof or shroud"
// (Arcane Lighthouse), "enters untapped" (Charismatic Conqueror), "enters tapped" (Amulet of Vigor), a delayed trigger
// on a creature (Hunter's Insight, CR 603.7), the legend rule turned off (Sakashima, Mirror Gallery, CR 704.5j),
// tiered (Restoration Magic, CR 702.183), Jace, Wielder of Mysteries, Vivi Ornitier's two-colour mana.

import { describe, expect, it } from "vitest";
import { act, activate, addEffect, bear, card, cast, passUntil, pt, putOnBattlefield, setup, target } from "./helpers";
import { abilitiesOf, activationCost, characteristics, colorCombos, compileCard, isFullySupported, objHasKeyword, planActivate, waitingOn, type CardDef, type GameState, type ParsedCost, type PlayerId, type TargetChoice } from "../src";
import { defMv } from "../src";

// Real oracle text (Scryfall).
const armor = card("Ethereal Armor", "Enchantment — Aura", "{W}", { keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature gets +1/+1 for each enchantment you control and has first strike." });
const gearhulk = card("Combustible Gearhulk", "Artifact Creature — Construct", "{4}{R}{R}", { power: "6", toughness: "6", keywords: ["First strike", "Mill"], oracleText: "First strike\nWhen this creature enters, target opponent may have you draw three cards. If the player doesn't, you mill three cards, then this creature deals damage to that player equal to the total mana value of those cards." });
const palantir = card("Palantír of Orthanc", "Legendary Artifact", "{3}", { keywords: ["Mill", "Scry"], oracleText: "At the beginning of your end step, put an influence counter on Palantír of Orthanc and scry 2. Then target opponent may have you draw a card. If that player doesn't, you mill X cards, where X is the number of influence counters on Palantír of Orthanc, and that player loses life equal to the total mana value of those cards." });
const intimidator = card("Terrapact Intimidator", "Creature — Kavu Scout", "{1}{R}", { power: "2", toughness: "1", oracleText: "When this creature enters, target opponent may have you create two Lander tokens. If they don't, put two +1/+1 counters on this creature. (A Lander token is an artifact with \"{2}, {T}, Sacrifice this token: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.\")" });
const heavy = card("Shakedown Heavy", "Creature — Ogre Warrior", "{2}{B}", { power: "6", toughness: "4", keywords: ["Menace"], oracleText: "Menace\nWhenever this creature attacks, defending player may have you draw a card. If they do, untap this creature and remove it from combat." });
const tataru = card("Tataru Taru", "Legendary Creature — Dwarf Advisor", "{1}{W}", { power: "0", toughness: "3", keywords: ["Scions' Secretary", "Treasure"], oracleText: "When Tataru Taru enters, you draw a card and target opponent may draw a card.\nScions' Secretary — Whenever an opponent draws a card, if it isn't that player's turn, create a tapped Treasure token. This ability triggers only once each turn." });
const grounds = card("Training Grounds", "Enchantment", "{U}", { oracleText: "Activated abilities of creatures you control cost {2} less to activate. This effect can't reduce the mana in that cost to less than one mana." });
const heartstone = card("Heartstone", "Artifact", "{3}", { oracleText: "Activated abilities of creatures cost {1} less to activate. This effect can't reduce the mana in that cost to less than one mana." });
const gadgeteer = card("Forensic Gadgeteer", "Creature — Vedalken Artificer Detective", "{2}{U}", { power: "2", toughness: "3", keywords: ["Investigate"], oracleText: "Whenever you cast an artifact spell, investigate. (Create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")\nActivated abilities of artifacts you control cost {1} less to activate. This effect can't reduce the mana in that cost to less than one mana." });
const tortoise = card("Blossoming Tortoise", "Creature — Turtle", "{2}{G}{G}", { power: "3", toughness: "3", keywords: ["Mill"], oracleText: "Whenever this creature enters or attacks, mill three cards, then return a land card from your graveyard to the battlefield tapped.\nActivated abilities of lands you control cost {1} less to activate.\nLand creatures you control get +1/+1." });
const lighthouse = card("Arcane Lighthouse", "Land", "", { oracleText: "{T}: Add {C}.\n{1}, {T}: Until end of turn, creatures your opponents control lose hexproof and shroud and can't have hexproof or shroud." });
const conqueror = card("Charismatic Conqueror", "Creature — Vampire Soldier", "{1}{W}", { power: "2", toughness: "2", keywords: ["Vigilance"], oracleText: "Vigilance\nWhenever an artifact or creature an opponent controls enters untapped, they may tap that permanent. If they don't, you create a 1/1 white Vampire creature token with lifelink." });
const amulet = card("Amulet of Vigor", "Artifact", "{1}", { oracleText: "Whenever a permanent you control enters tapped, untap it." });
const insight = card("Hunter's Insight", "Instant", "{2}{G}", { oracleText: "Choose target creature you control. Whenever that creature deals combat damage to a player or planeswalker this turn, draw that many cards." });
const sakashima = card("Sakashima of a Thousand Faces", "Legendary Creature — Human Rogue", "{3}{U}", { power: "3", toughness: "1", keywords: ["Partner"], oracleText: "You may have Sakashima enter as a copy of another creature you control, except it has Sakashima's other abilities.\nThe \"legend rule\" doesn't apply to permanents you control.\nPartner (You can have two commanders if both have partner.)" });
const gallery = card("Mirror Gallery", "Artifact", "{5}", { oracleText: "The \"legend rule\" doesn't apply." });
const council = card("Council of Reeds", "Legendary Creature — Human Scientist Hero", "{2}{U}", { power: "2", toughness: "2", oracleText: "The \"legend rule\" doesn't apply to creatures you control.\nAt the beginning of combat on your turn, if you've cast a noncreature spell this turn, create a token that's a copy of Council of Reeds." });
const restoration = card("Restoration Magic", "Instant", "{W}", { keywords: ["Curaga", "Cura", "Tiered", "Cure"], oracleText: "Tiered (Choose one additional cost.)\n• Cure — {0} — Target permanent gains hexproof and indestructible until end of turn.\n• Cura — {1} — Target permanent gains hexproof and indestructible until end of turn. You gain 3 life.\n• Curaga — {3}{W} — Permanents you control gain hexproof and indestructible until end of turn. You gain 6 life." });
const jace = card("Jace, Wielder of Mysteries", "Legendary Planeswalker — Jace", "{1}{U}{U}{U}", { loyalty: "4", keywords: ["Mill"], oracleText: "If you would draw a card while your library has no cards in it, you win the game instead.\n+1: Target player mills two cards. Draw a card.\n−8: Draw seven cards. Then if your library has no cards in it, you win the game." });
const vivi = card("Vivi Ornitier", "Legendary Creature — Wizard", "{1}{U}{R}", { power: "0", toughness: "3", oracleText: "{0}: Add X mana in any combination of {U} and/or {R}, where X is Vivi Ornitier's power. Activate only during your turn and only once each turn.\nWhenever you cast a noncreature spell, put a +1/+1 counter on Vivi Ornitier and it deals 1 damage to each opponent." });

const pinger = card("Prodigal Pyromancer", "Creature — Human Wizard", "{2}{R}", { power: "1", toughness: "1", oracleText: "{T}: This creature deals 1 damage to any target." });
const pumper = card("Pump Knight", "Creature — Human Knight", "{1}{W}", { power: "2", toughness: "2", oracleText: "{1}{W}: This creature gets +1/+1 until end of turn." });
const spinner = card("X Spinner", "Creature — Human Wizard", "{1}{U}", { power: "1", toughness: "1", oracleText: "{X}{U}: This creature gets +X/+0 until end of turn." });
const warded = bear({ name: "Hexproof Bear", keywords: ["Hexproof"], oracleText: "Hexproof" });
const cloak = card("Hex Cloak", "Instant", "{U}", { oracleText: "Target creature gains hexproof until end of turn." });
const legend = card("Isamaru, Hound of Konda", "Legendary Creature — Dog", "{W}", { power: "2", toughness: "2" });
const trinket = card("Trinket", "Artifact", "{1}");
const tapland = card("Slow Lands", "Land", "", { oracleText: "This land enters tapped.\n{T}: Add {G}." });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const nextAfter = (s: GameState, p: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(p) + 1) % 4]!;
const name = (s: GameState, id: string) => characteristics(s, s.objects[id]!).name;
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });

/** Resolve the stack, choosing `targets` when asked and answering "may" prompts with `may`. */
function drive(s: GameState, targets: TargetChoice[], may: boolean) {
  for (let i = 0; i < 200; i++) {
    const p = s.pending;
    if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets });
    else if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: may });
    else if (p) break;
    else if (s.stack.length || s.triggerQueue.length) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    else break;
  }
  return s;
}

describe("round 99, more cards", () => {
  it("parse", () => {
    supported(armor, gearhulk, palantir, intimidator, heavy, tataru, grounds, heartstone, gadgeteer, tortoise, lighthouse, conqueror, amulet, insight, sakashima, gallery, council, restoration, jace, vivi);
  });

  it("Ethereal Armor: +1/+1 for each enchantment you control, and first strike", () => {
    const { s: s0, ap, ids } = setup([armor]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = drive(cast(s0, ap, ids[0]!, [target(b)]), [], false);
    expect(pt(s, b)).toBe("3/3");
    expect(objHasKeyword(s, s.objects[b]!, "First strike")).toBe(true);
    putOnBattlefield(s, ap, grounds);
    // An opponent's enchantment doesn't count.
    putOnBattlefield(s, nextAfter(s, ap), grounds);
    expect(pt(s, b)).toBe("4/4");
  });

  for (const [answer, what] of [[true, "draws three"], [false, "mills three and deals their total mana value"]] as const) {
    it(`Combustible Gearhulk: when the opponent ${answer ? "lets you" : "doesn't"}, it ${what}`, () => {
      const { s: s0, ap, ids } = setup([gearhulk]);
      const opp = nextAfter(s0, ap);
      const hand = s0.players[ap]!.hand.length - 1;
      const yard = s0.players[ap]!.graveyard.length;
      const top = s0.players[ap]!.library.slice(0, 3);
      const life = s0.players[opp]!.life;
      const s = drive(cast(s0, ap, ids[0]!), [player(opp)], answer);
      if (answer) {
        expect(s.players[ap]!.hand.length).toBe(hand + 3);
        expect(s.players[opp]!.life).toBe(life);
      } else {
        expect(s.players[ap]!.hand.length).toBe(hand);
        expect(s.players[ap]!.graveyard.length).toBe(yard + 3);
        const mv = top.reduce((n, id) => n + defMv(s.cards[s.objects[id]!.cardId]!), 0);
        expect(s.players[opp]!.life).toBe(life - mv);
      }
    });
  }

  it("Palantír of Orthanc: an influence counter and scry 2 each end step; refused, you mill that many and they lose the total mana value", () => {
    const { s: s0, ap } = setup([]);
    const opp = nextAfter(s0, ap);
    const p = putOnBattlefield(s0, ap, palantir);
    let s = passUntil(s0, "end", ap);
    const top = s.players[ap]!.library.slice(0, 3);
    const life = s.players[opp]!.life;
    for (let i = 0; i < 100; i++) {
      const pend = s.pending;
      if (pend?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: pend.player, targets: [player(opp)] });
      else if (pend?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: pend.player, yes: false });
      // Scry 2: keep both on top in the same order.
      else if (pend?.kind === "arrangeTop") s = act(s, { type: "arrangeTop", player: ap, top: pend.cards, away: [] });
      else if (pend) throw new Error(pend.kind);
      else if (s.stack.length || s.triggerQueue.length) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      else break;
    }
    expect(s.objects[p]!.counters.influence).toBe(1);
    // One counter: one card milled, the one on top.
    expect(s.players[ap]!.graveyard).toContain(top[0]);
    expect(s.players[opp]!.life).toBe(life - defMv(s.cards[s.objects[top[0]!]!.cardId]!));
  });

  it("Terrapact Intimidator: two Landers, or two +1/+1 counters", () => {
    for (const yes of [true, false]) {
      const { s: s0, ap, ids } = setup([intimidator]);
      const s = drive(cast(s0, ap, ids[0]!), [player(nextAfter(s0, ap))], yes);
      expect(s.battlefield.filter((id) => name(s, id) === "Lander Token")).toHaveLength(yes ? 2 : 0);
      expect(s.objects[ids[0]!]!.counters["+1/+1"] ?? 0).toBe(yes ? 0 : 2);
    }
  });

  it("Shakedown Heavy: the defending player may have you draw; then it untaps and leaves combat", () => {
    const { s: s0, ap } = setup([]);
    const opp = nextAfter(s0, ap);
    const h = putOnBattlefield(s0, ap, heavy);
    let s = passUntil(s0, "declareAttackers", ap);
    const hand = s.players[ap]!.hand.length;
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: h, defender: opp }] });
    expect(s.objects[h]!.tapped).toBe(true);
    s = drive(s, [], true);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.objects[h]!.tapped).toBe(false);
    expect(s.objects[h]!.attacking).toBeFalsy();
  });

  it("Tataru Taru: you draw and the opponent may; an opponent drawing on another player's turn makes a tapped Treasure, once a turn", () => {
    const { s: s0, ap, ids } = setup([tataru]);
    const opp = nextAfter(s0, ap);
    const oh = s0.players[opp]!.hand.length;
    const s = drive(cast(s0, ap, ids[0]!), [player(opp)], true);
    expect(s.players[opp]!.hand.length).toBe(oh + 1);
    const treasures = s.battlefield.filter((id) => name(s, id) === "Treasure Token");
    expect(treasures).toHaveLength(1);
    expect(s.objects[treasures[0]!]!.tapped).toBe(true);
    // On the opponent's own turn, their draw step draw makes none.
    const t = drive(passUntil(s, "main1", opp), [], false);
    expect(t.battlefield.filter((id) => name(t, id) === "Treasure Token")).toHaveLength(1);
  });

  it("Training Grounds and Heartstone: {2} and {1} less, never below one mana; X counts as generic", () => {
    const { s: s0, ap } = setup([]);
    const opp = nextAfter(s0, ap);
    const k = putOnBattlefield(s0, ap, pumper);
    const x = putOnBattlefield(s0, ap, spinner);
    const theirs = putOnBattlefield(s0, opp, pumper);
    const p = putOnBattlefield(s0, ap, pinger);
    putOnBattlefield(s0, ap, grounds);
    // {1}{W} with {2} less: just {W} (coloured mana isn't reduced).
    expect(abilityCost(s0, ap, k)).toBe("{W}");
    // An opponent's creature: not yours.
    expect(abilityCost(s0, opp, theirs)).toBe("{1}{W}");
    // {T} alone: nothing to reduce.
    expect(abilityCost(s0, ap, p)).toBe("");
    // {X}{U}, X = 3: the X part is generic, {3} − {2} = {1}.
    expect(abilityCost(s0, ap, x, 0, 3)).toBe("{1}{U}");
    putOnBattlefield(s0, ap, heartstone);
    expect(abilityCost(s0, ap, x, 0, 3)).toBe("{U}");
    // Heartstone affects everyone's creatures.
    expect(abilityCost(s0, opp, theirs)).toBe("{W}");
    // Activating with X = 3 taps one land.
    const before = s0.battlefield.filter((id) => s0.objects[id]!.tapped).length;
    let s = activateX(s0, ap, x, 3);
    expect(s.battlefield.filter((id) => s.objects[id]!.tapped).length - before).toBe(1);
    s = drive(s, [], false);
    expect(pt(s, x)).toBe("4/1");
  });

  it("Forensic Gadgeteer and Blossoming Tortoise: artifacts' and lands' abilities cost {1} less", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, gadgeteer);
    putOnBattlefield(s0, ap, tortoise);
    const t = putOnBattlefield(s0, ap, card("Mind Stone", "Artifact", "{2}", { oracleText: "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card." }));
    const l = putOnBattlefield(s0, ap, lighthouse);
    // The minimum of one mana for the Gadgeteer: still {1}. Blossoming Tortoise has no minimum.
    expect(abilityCost(s0, ap, t, 0)).toBe("{1}");
    expect(abilityCost(s0, ap, l, 0)).toBe("");
    const clue = card("Clue Thing", "Artifact", "{1}", { oracleText: "{2}, Sacrifice this artifact: Draw a card." });
    expect(abilityCost(s0, ap, putOnBattlefield(s0, ap, clue), 0)).toBe("{1}");
  });

  it("Arcane Lighthouse: opponents' creatures lose hexproof and can't have it this turn, even granted later", () => {
    const { s: s0, ap } = setup([]);
    const opp = nextAfter(s0, ap);
    const l = putOnBattlefield(s0, ap, lighthouse);
    const w = putOnBattlefield(s0, opp, warded);
    const mine = putOnBattlefield(s0, ap, warded);
    const other = putOnBattlefield(s0, opp, bear());
    let s = drive(activate(s0, ap, l, 0), [], false);
    expect(objHasKeyword(s, s.objects[w]!, "Hexproof")).toBe(false);
    expect(objHasKeyword(s, s.objects[mine]!, "Hexproof")).toBe(true);
    // One that gains hexproof after it resolved still can't have it (rulings); one that enters later isn't affected.
    addEffect(s, opp, [other], [{ kind: "addKeywords", keywords: ["Hexproof", "Shroud"] }]);
    expect(objHasKeyword(s, s.objects[other]!, "Hexproof")).toBe(false);
    expect(objHasKeyword(s, s.objects[other]!, "Shroud")).toBe(false);
    expect(objHasKeyword(s, s.objects[putOnBattlefield(s, opp, warded)]!, "Hexproof")).toBe(true);
    s = passUntil(s, "upkeep", opp);
    expect(objHasKeyword(s, s.objects[w]!, "Hexproof")).toBe(true);
  });

  it("Charismatic Conqueror: an opponent's creature entering untapped: they tap it or you get a Vampire", () => {
    for (const yes of [true, false]) {
      // The Conqueror is an opponent's; you cast a creature.
      const { s: s0, ap, ids } = setup([bear()]);
      const opp = nextAfter(s0, ap);
      putOnBattlefield(s0, opp, conqueror);
      const s = drive(cast(s0, ap, ids[0]!), [], yes);
      expect(s.objects[ids[0]!]!.tapped).toBe(yes);
      expect(s.battlefield.filter((id) => name(s, id) === "Vampire Token" && s.objects[id]!.controller === opp)).toHaveLength(yes ? 0 : 1);
    }
  });

  it("Amulet of Vigor: a permanent you control entering tapped untaps", () => {
    const { s: s0, ap, ids } = setup([tapland]);
    putOnBattlefield(s0, ap, amulet);
    let s = act(s0, { type: "playLand", player: ap, objectId: ids[0]! });
    expect(s.objects[ids[0]!]!.tapped).toBe(true);
    s = drive(s, [], false);
    expect(s.objects[ids[0]!]!.tapped).toBe(false);
  });

  it("Hunter's Insight: that creature's combat damage to a player draws that many cards, this turn", () => {
    const { s: s0, ap, ids } = setup([insight]);
    const opp = nextAfter(s0, ap);
    const ogre = putOnBattlefield(s0, ap, card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" }));
    let s = drive(cast(s0, ap, ids[0]!, [target(ogre)]), [], false);
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: ogre, defender: opp }] });
    const hand = s.players[ap]!.hand.length;
    s = passUntil(s, "combatDamage", ap);
    s = drive(s, [], false);
    s = passUntil(s, "endCombat", ap);
    expect(s.players[ap]!.hand.length).toBe(hand + 3);
  });

  it("Sakashima: enters as a copy with its other abilities, and your legends ignore the legend rule", () => {
    const { s: s0, ap, ids } = setup([sakashima]);
    const isamaru = putOnBattlefield(s0, ap, legend);
    let s = cast(s0, ap, ids[0]!);
    for (let i = 0; i < 40 && !s.pending && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "copy" });
    s = act(s, { type: "chooseOption", player: ap, choice: isamaru });
    s = drive(s, [], true);
    const sak = s.objects[ids[0]!]!;
    expect(sak.zone).toBe("battlefield");
    expect(characteristics(s, sak).name).toBe("Isamaru, Hound of Konda");
    // Two Isamarus, both stay (CR 704.5j doesn't apply).
    expect(s.objects[isamaru]!.zone).toBe("battlefield");
    expect(abilitiesOf(s, sak).noLegendRule).toHaveLength(1);
  });

  it("Mirror Gallery and Council of Reeds: the legend rule doesn't apply (to anyone, or to your creatures)", () => {
    const { s: s0, ap } = setup([]);
    const opp = nextAfter(s0, ap);
    const isamarus = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && name(s, id) === "Isamaru, Hound of Konda");
    putOnBattlefield(s0, ap, council);
    putOnBattlefield(s0, ap, legend);
    putOnBattlefield(s0, ap, legend);
    putOnBattlefield(s0, opp, legend);
    putOnBattlefield(s0, opp, legend);
    let s = act(s0, { type: "passPriority", player: waitingOn(s0)! });
    expect(isamarus(s, ap)).toHaveLength(2);
    // The opponent's pair still goes down to one (CR 704.5j).
    expect(isamarus(s, opp)).toHaveLength(1);
    putOnBattlefield(s, opp, gallery);
    putOnBattlefield(s, opp, legend);
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(isamarus(s, opp)).toHaveLength(2);
  });

  it("Restoration Magic: tiered, each mode costs its extra mana", () => {
    const { s: s0, ap, ids } = setup([restoration, restoration, restoration]);
    const b = putOnBattlefield(s0, ap, bear());
    const tapped = (s: GameState) => s.battlefield.filter((id) => s.objects[id]!.tapped).length;
    const life = s0.players[ap]!.life;
    let s = cast(s0, ap, ids[0]!, [target(b)], [1]);
    expect(tapped(s)).toBe(2);
    s = drive(s, [], false);
    expect(s.players[ap]!.life).toBe(life + 3);
    expect(objHasKeyword(s, s.objects[b]!, "Indestructible")).toBe(true);
    const t0 = tapped(s);
    s = drive(cast(s, ap, ids[2]!, [], [2]), [], false);
    expect(tapped(s) - t0).toBe(5);
    expect(s.players[ap]!.life).toBe(life + 9);
    // Only one mode (CR 702.183a).
    expect(() => cast(s, ap, ids[1]!, [target(b)], [0, 1])).toThrow();
  });

  it("Jace, Wielder of Mysteries: −8 draws seven, and with an empty library you win", () => {
    const { s: s0, ap } = setup([]);
    const j = putOnBattlefield(s0, ap, jace);
    s0.objects[j]!.counters.loyalty = 9;
    // Seven cards left: the −8 empties the library.
    const lib = s0.players[ap]!.library;
    for (const id of lib.splice(7)) s0.objects[id]!.zone = "exile";
    const s = drive(activate(s0, ap, j, 1), [], false);
    expect(s.players[ap]!.library).toHaveLength(0);
    expect(s.winner).toBe(ap);
  });

  it("Vivi Ornitier: X mana of blue and/or red, X its power", () => {
    const { s: s0, ap, ids } = setup([trinket]);
    const v = putOnBattlefield(s0, ap, vivi);
    s0.objects[v]!.counters["+1/+1"] = 3;
    expect(compileCard(vivi).mana).toHaveLength(1);
    // Its combinations: UUU, UUR, URR, RRR.
    expect(colorCombos(3, ["U", "R"])).toHaveLength(4);
    let s = act(s0, { type: "activateMana", player: ap, objectId: v, mana: "U", ability: 0, combo: 2 });
    expect(s.players[ap]!.manaPool).toMatchObject({ U: 1, R: 2 });
    // Green isn't one of its colours.
    expect(() => act(s0, { type: "activateMana", player: ap, objectId: v, mana: "G" })).toThrow();
    // Once each turn.
    expect(() => act(s, { type: "activateMana", player: ap, objectId: v, mana: "U", combo: 2 })).toThrow();
    // A noncreature spell: a counter and 1 damage to each opponent.
    const opp = nextAfter(s, ap);
    const life = s.players[opp]!.life;
    s = drive(cast(s, ap, ids[0]!), [], false);
    expect(s.objects[v]!.counters["+1/+1"]).toBe(4);
    expect(s.players[opp]!.life).toBe(life - 1);
  });
});

function activateX(s: GameState, pid: PlayerId, id: string, x: number) {
  const plan = planActivate(s, pid, id, 0, undefined, undefined, undefined, x);
  if (!plan) throw new Error("can't activate");
  for (const a of plan) s = act(s, a);
  return s;
}

function abilityCost(s: GameState, pid: PlayerId, id: string, index = 0, x = 0) {
  const o = s.objects[id]!;
  return show(activationCost(s, pid, o, abilitiesOf(s, o).activated[index]!, undefined, x));
}

const show = (c: ParsedCost) => c.symbols.map((sym) => (sym.kind === "generic" ? `{${sym.amount}}` : sym.kind === "colored" ? `{${sym.color}}` : sym.kind === "x" ? "{X}" : "?")).join("");
