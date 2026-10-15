// Tarmogoyf's card types (CR 205.2a), the greatest power among creatures, "at the beginning of each opponent's
// upkeep, if that player has N or fewer cards in hand" (CR 603.4), adapt (CR 701.46), monstrosity (CR 701.37),
// outlast (CR 702.107), "whenever one or more counters are put on" (CR 122.6), exert (CR 701.43), life-gain and
// draw replacements (CR 616.1), the life floor of Ali from Cairo, "that was dealt damage this turn", Skittering,
// "you gain 1 life and scry 1", "creature tokens get -2/-2" and "you may have it fight".

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, activate, passUntil, putOnBattlefield, setup, pt, target } from "./helpers";
import { botActions, isFullySupported, spellCost, waitingOn, draw, gainLife, loseLife, invalidateCharacteristics, objHasKeyword, planActivate, type Action, type CardDef, type GameState, type PlayerId } from "../src";
import { cardSource, dealDamage } from "../src/damage";

// Real oracle text (Scryfall).
const goyf = card("Tarmogoyf", "Creature — Lhurgoyf", "{1}{G}", {
  power: "*",
  toughness: "1+*",
  oracleText: "Tarmogoyf's power is equal to the number of card types among cards in all graveyards and its toughness is equal to that number plus 1.",
});
const bolt = card("Lightning Bolt", "Instant", "{R}", { oracleText: "Lightning Bolt deals 3 damage to any target." });
const ghalta = card("Ghalta the Unstoppable", "Legendary Creature — Elder Dinosaur", "{8}{G}", {
  power: "8",
  toughness: "8",
  oracleText: "This spell costs {X} less to cast, where X is the greatest power among creatures you control.\nTrample\nOther creatures you control have trample.",
});
const muse = card("Lavaborn Muse", "Creature — Spirit", "{3}{R}", {
  power: "3",
  toughness: "3",
  oracleText: "At the beginning of each opponent's upkeep, if that player has two or fewer cards in hand, this creature deals 3 damage to that player.",
});
const sharktocrab = card("Sharktocrab", "Creature — Shark Octopus Crab", "{2}{G}{U}", {
  power: "4",
  toughness: "4",
  oracleText:
    "{2}{G}{U}: Adapt 1. (If this creature has no +1/+1 counters on it, put a +1/+1 counter on it.)\nWhenever one or more +1/+1 counters are put on this creature, tap target creature an opponent controls. That creature doesn't untap during its controller's next untap step.",
});
const asp = card("Nessian Asp", "Creature — Snake", "{4}{G}", {
  power: "4",
  toughness: "5",
  oracleText: "Reach\n{6}{G}: Monstrosity 4. (If this creature isn't monstrous, put four +1/+1 counters on it and it becomes monstrous.)",
});
const lion = card("Fleecemane Lion", "Creature — Cat", "{G}{W}", {
  power: "3",
  toughness: "3",
  oracleText: "{3}{G}{W}: Monstrosity 1. (If this creature isn't monstrous, put a +1/+1 counter on it and it becomes monstrous.)\nAs long as this creature is monstrous, it has hexproof and indestructible.",
});
const gorgon = card("Keepsake Gorgon", "Creature — Gorgon", "{3}{B}{B}", {
  power: "2",
  toughness: "5",
  oracleText: "Deathtouch\n{5}{B}{B}: Monstrosity 1. (If this creature isn't monstrous, put a +1/+1 counter on it and it becomes monstrous.)\nWhen this creature becomes monstrous, destroy target non-Gorgon creature an opponent controls.",
});
const falconer = card("Abzan Falconer", "Creature — Human Soldier", "{2}{W}", {
  power: "2",
  toughness: "3",
  oracleText: "Outlast {W} ({W}, {T}: Put a +1/+1 counter on this creature. Outlast only as a sorcery.)\nEach creature you control with a +1/+1 counter on it has flying.",
});
const baloth = card("Herd Baloth", "Creature — Beast", "{3}{G}{G}", {
  power: "4",
  toughness: "4",
  oracleText: "Whenever one or more +1/+1 counters are put on this creature, you may create a 4/4 green Beast creature token.",
});
const brawler = card("Hooded Brawler", "Creature — Snake Warrior", "{2}{G}", {
  power: "3",
  toughness: "2",
  oracleText: "You may exert this creature as it attacks. When you do, it gets +2/+2 until end of turn. (An exerted creature won't untap during your next untap step.)",
});
const vizier = card("Vizier of the True", "Creature — Human Cleric", "{3}{W}", {
  power: "3",
  toughness: "2",
  oracleText: "You may exert this creature as it attacks. (It won't untap during your next untap step.)\nWhenever you exert a creature, tap target creature an opponent controls.",
});
const archive = card("Alhammarret's Archive", "Legendary Artifact", "{5}", {
  oracleText: "If you would gain life, you gain twice that much life instead.\nIf you would draw a card except the first one you draw in each of your draw steps, draw two cards instead.",
});
const heron = card("Heron of Hope", "Creature — Bird", "{3}{W}", {
  power: "2",
  toughness: "3",
  oracleText: "Flying\nIf you would gain life, you gain that much life plus 1 instead.\n{1}{W}: This creature gains lifelink until end of turn.",
});
const ali = card("Ali from Cairo", "Creature — Human", "{2}{R}{R}", { power: "0", toughness: "1", oracleText: "Damage that would reduce your life total to less than 1 reduces it to 1 instead." });
const assassin = card("Rooftop Assassin", "Creature — Vampire Assassin", "{3}{B}", {
  power: "2",
  toughness: "2",
  oracleText: "Flash\nFlying, lifelink\nWhen this creature enters, destroy target creature an opponent controls that was dealt damage this turn.",
});
const horror = card("Skittering Horror", "Creature — Phyrexian Horror", "{2}{B}", { power: "4", toughness: "3", oracleText: "When you cast a creature spell, sacrifice this creature." });
const healer = card("Compassionate Healer", "Creature — Human Cleric Ally", "{1}{W}", {
  power: "2",
  toughness: "2",
  oracleText: "Whenever this creature becomes tapped, you gain 1 life and scry 1. (Look at the top card of your library. You may put it on the bottom.)",
});
const plague = card("Virulent Plague", "Enchantment", "{2}{B}", { oracleText: "Creature tokens get -2/-2." });
const stag = card("Somberwald Stag", "Creature — Elk", "{3}{G}{G}", { power: "4", toughness: "3", oracleText: "When this creature enters, you may have it fight target creature you don't control." });
const sorcery = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });
const artifact = card("Sol Ring", "Artifact", "{1}");

const kujar = card("Kujar Seedsculptor", "Creature — Elf Druid", "{1}{G}", { power: "1", toughness: "2", oracleText: "When this creature enters, put a +1/+1 counter on target creature you control." });

const ALL = [goyf, ghalta, muse, sharktocrab, asp, lion, gorgon, falconer, baloth, brawler, vizier, archive, heron, ali, assassin, horror, healer, plague, stag];

const settled = (s: GameState) => !s.pending && s.stack.length === 0;
const bot = (s: GameState): Action => botActions(s, waitingOn(s)!)[0]!;
/** Let the bots answer and everyone pass until `done`. */
function until(s: GameState, done: (s: GameState) => boolean, max = 200) {
  for (let i = 0; i < max && !done(s); i++) s = act(s, s.pending ? bot(s) : { type: "passPriority", player: waitingOn(s)! });
  return s;
}
function toGraveyard(s: GameState, pid: PlayerId, d: CardDef) {
  const id = putOnBattlefield(s, pid, d);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  invalidateCharacteristics(s);
  return id;
}
/** `pid`'s hand is exactly `n` of their library's cards. */
function handSize(s: GameState, pid: PlayerId, n: number) {
  const p = s.players[pid]!;
  for (const id of p.hand.splice(0)) {
    s.objects[id]!.zone = "library";
    p.library.push(id);
  }
  for (let i = 0; i < n; i++) {
    const id = p.library.shift()!;
    s.objects[id]!.zone = "hand";
    p.hand.push(id);
  }
}

describe("this round's cards", () => {
  it("compile", () => {
    for (const d of ALL) expect(isFullySupported(d), d.name).toBe(true);
  });
});

describe("Tarmogoyf (CR 205.2a, 604.3)", () => {
  it("counts card types among cards in all graveyards", () => {
    const { s, ap, opp } = setup([]);
    const g = putOnBattlefield(s, ap, goyf);
    expect(pt(s, g)).toBe("0/1");
    toGraveyard(s, opp, bear());
    toGraveyard(s, ap, bear()); // the same type twice counts once
    expect(pt(s, g)).toBe("1/2");
    toGraveyard(s, opp, artifact);
    toGraveyard(s, ap, card("Dryad Arbor", "Land Creature — Forest Dryad", "", { power: "1", toughness: "1" }));
    expect(pt(s, g)).toBe("3/4"); // creature, artifact, land
  });

  it("survives Lightning Bolt with a creature and a land in graveyards: the Bolt is in the graveyard before state-based actions", () => {
    const { s: s0, ap, opp, ids } = setup([bolt]);
    const g = putOnBattlefield(s0, ap, goyf);
    toGraveyard(s0, opp, bear());
    toGraveyard(s0, opp, card("Forest", "Basic Land — Forest"));
    expect(pt(s0, g)).toBe("2/3");
    const s = cast(s0, ap, ids[0]!, [target(g)]);
    expect(s.objects[g]!.zone).toBe("battlefield");
    expect(pt(s, g)).toBe("3/4");
    expect(s.objects[g]!.damage).toBe(3);
  });
});

describe("the greatest power among creatures you control", () => {
  it("Ghalta the Unstoppable costs that much less", () => {
    const { s, ap, ids } = setup([ghalta]);
    const generic = () => {
      const c = spellCost(s, ap, s.objects[ids[0]!]!);
      return c.extra + c.cost.symbols.reduce((n, x) => n + (x.kind === "generic" ? x.amount : 0), 0);
    };
    expect(generic()).toBe(8);
    putOnBattlefield(s, ap, bear());
    putOnBattlefield(s, ap, card("Big", "Creature — Beast", "{4}", { power: "5", toughness: "5" }));
    expect(generic()).toBe(3); // the greatest power, 5, not the total, 7
  });
});

describe("each opponent's upkeep, if that player has two or fewer cards in hand (CR 603.4)", () => {
  it("Lavaborn Muse hits an opponent with two or fewer cards, but not one with more, and not on your own turn", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, muse);
    const next = (pid: PlayerId) => s0.turnOrder[(s0.turnOrder.indexOf(pid) + 1) % 4]!;
    const third = next(opp);
    handSize(s0, opp, 2);
    handSize(s0, third, 3);
    const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
    let s = passUntil(s0, "draw", opp);
    expect(life(s, opp)).toBe(life(s0, opp) - 3);
    s = passUntil(s, "draw", third);
    expect(life(s, third)).toBe(life(s0, third));
    handSize(s, ap, 0);
    s = passUntil(s, "draw", ap);
    expect(life(s, ap)).toBe(life(s0, ap));
  });
});

describe("adapt (CR 701.46) and counters-put triggers (CR 122.6)", () => {
  it("Sharktocrab adapts once; the trigger taps an opponent's creature; with a counter already, adapt does nothing", () => {
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, ap, sharktocrab);
    const theirs = putOnBattlefield(s0, opp, bear());
    let s = until(activate(s0, ap, c, 0), settled);
    expect(s.objects[c]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[theirs]!.tapped).toBe(true);
    s.objects[theirs]!.tapped = false;
    s = until(activate(s, ap, c, 0), settled);
    expect(s.objects[c]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[theirs]!.tapped).toBe(false);
  });

  it("Herd Baloth: a +1/+1 counter put on it makes a 4/4 Beast", () => {
    const { s: s0, ap, ids } = setup([kujar]);
    const b = putOnBattlefield(s0, ap, baloth);
    let s = cast(s0, ap, ids[0]!);
    s = until(s, (t) => t.pending?.kind === "chooseTargets" || settled(t));
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [target(b)] });
    s = until(s, settled);
    expect(s.objects[b]!.counters["+1/+1"]).toBe(1);
    expect(s.battlefield.some((id) => s.objects[id]!.isToken && s.cards[s.objects[id]!.cardId]!.name === "Beast Token")).toBe(true);
  });
});

describe("monstrosity (CR 701.37)", () => {
  it("Nessian Asp gets four counters once; a second activation does nothing", () => {
    const { s: s0, ap } = setup([]);
    const a = putOnBattlefield(s0, ap, asp);
    let s = activate(s0, ap, a, 0);
    expect(pt(s, a)).toBe("8/9");
    expect(s.objects[a]!.monstrous).toBe(true);
    s = activate(s, ap, a, 0);
    expect(pt(s, a)).toBe("8/9");
  });

  it("Fleecemane Lion is indestructible once monstrous: lethal damage doesn't destroy it", () => {
    const { s: s0, ap, ids } = setup([bolt]);
    const l = putOnBattlefield(s0, ap, lion);
    let s = activate(s0, ap, l, 0);
    expect(s.objects[l]!.monstrous).toBe(true);
    s.objects[l]!.damage = 3; // lethal on a 4/4 with Bolt's 3 more
    s = cast(s, ap, ids[0]!, [target(l)]);
    expect(s.objects[l]!.zone).toBe("battlefield");
  });

  it("Keepsake Gorgon's 'becomes monstrous' trigger destroys a creature", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, gorgon);
    const theirs = putOnBattlefield(s0, opp, bear());
    const s = until(activate(s0, ap, g, 0), settled);
    expect(s.objects[theirs]!.zone).toBe("graveyard");
  });
});

describe("outlast (CR 702.107)", () => {
  it("Abzan Falconer taps for a counter, then has flying", () => {
    const { s: s0, ap } = setup([]);
    const f = putOnBattlefield(s0, ap, falconer);
    const s = activate(s0, ap, f, 0);
    expect(s.objects[f]!.tapped).toBe(true);
    expect(pt(s, f)).toBe("3/4");
    expect(objHasKeyword(s, s.objects[f]!, "Flying")).toBe(true);
  });

  it("only as a sorcery", () => {
    const { s: s0, ap, opp } = setup([]);
    const f = putOnBattlefield(s0, opp, falconer);
    void ap;
    expect(planActivate(s0, opp, f, 0)).toBeNull();
  });
});

describe("exert (CR 701.43)", () => {
  it("Hooded Brawler: exerting it as it attacks gives +2/+2, and it doesn't untap in its controller's next untap step", () => {
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, ap, brawler);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "exert", options: [b], min: 0 });
    s = act(s, { type: "pickPermanents", player: ap, ids: [b] });
    s = until(s, (t) => t.stack.length === 0 && !t.pending && t.step !== "declareAttackers");
    expect(pt(s, b)).toBe("5/4");
    s = passUntil(s, "main1", ap);
    expect(s.objects[b]!.tapped).toBe(true); // skipped this untap step
    s = passUntil(passUntil(s, "upkeep", opp), "main1", ap);
    expect(s.objects[b]!.tapped).toBe(false);
  });

  it("not exerting: no bonus, and it untaps normally", () => {
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, ap, brawler);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    s = act(s, { type: "pickPermanents", player: ap, ids: [] });
    s = until(s, (t) => t.stack.length === 0 && !t.pending && t.step !== "declareAttackers");
    expect(pt(s, b)).toBe("3/2");
    s = passUntil(s, "main1", ap);
    expect(s.objects[b]!.tapped).toBe(false);
  });

  it("Vizier of the True: 'whenever you exert a creature' taps a creature an opponent controls", () => {
    const { s: s0, ap, opp } = setup([]);
    const v = putOnBattlefield(s0, ap, vizier);
    const theirs = putOnBattlefield(s0, opp, bear());
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: v, defender: opp }] });
    s = act(s, { type: "pickPermanents", player: ap, ids: [v] });
    s = until(s, (t) => t.objects[theirs]!.tapped || t.step === "endCombat");
    expect(s.objects[theirs]!.tapped).toBe(true);
  });

  it("the bot exerts only when it gains something", () => {
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, ap, brawler);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    const a = bot(s);
    expect(a).toMatchObject({ type: "pickPermanents", ids: [b] });
  });
});

describe("life-gain and draw replacements (CR 616.1)", () => {
  it("Alhammarret's Archive doubles life gained; Heron of Hope adds one", () => {
    const { s, ap } = setup([]);
    const life = () => s.players[ap]!.life;
    let l = life();
    putOnBattlefield(s, ap, archive);
    gainLife(s, ap, 3);
    expect(life()).toBe(l + 6);
    l = life();
    putOnBattlefield(s, ap, heron);
    gainLife(s, ap, 3); // (3 + 1) × 2: the player gaining life orders the replacements (CR 616.1) and takes the better one
    expect(life() - l).toBe(8);
  });

  it("Archive: draws outside the first draw of your draw step are doubled", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, archive);
    handSize(s0, ap, 0);
    const hand = 0;
    draw(s0, ap, 1);
    expect(s0.players[ap]!.hand.length).toBe(hand + 2);
    let s = passUntil(s0, "upkeep", opp);
    s = passUntil(s, "main1", ap);
    expect(s.players[ap]!.hand.length).toBe(hand + 3); // the draw-step draw is just one
  });
});

describe("Ali from Cairo's life floor", () => {
  it("damage can't take you below 1, but life loss can", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, ali);
    s.players[ap]!.life = 3;
    dealDamage(s, cardSource(bolt, opp), { player: ap }, 3);
    expect(s.players[ap]!.life).toBe(1);
    dealDamage(s, cardSource(bolt, opp), { player: ap }, 3);
    expect(s.players[ap]!.life).toBe(1);
    loseLife(s, ap, 2);
    expect(s.players[ap]!.life).toBe(-1);
  });
});

describe("that was dealt damage this turn", () => {
  it("Rooftop Assassin destroys a damaged creature; an undamaged one isn't a legal target", () => {
    const { s: s0, ap, opp, ids } = setup([assassin]);
    const hurt = putOnBattlefield(s0, opp, card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" }));
    const fine = putOnBattlefield(s0, opp, bear());
    dealDamage(s0, cardSource(bolt, ap), { object: s0.objects[hurt]! }, 1);
    let s = cast(s0, ap, ids[0]!);
    s = until(s, (t) => t.pending?.kind === "chooseTargets" || settled(t));
    if (s.pending?.kind === "chooseTargets") {
      expect(() => act(s, { type: "chooseTargets", player: ap, targets: [target(fine)] })).toThrow();
      s = act(s, { type: "chooseTargets", player: ap, targets: [target(hurt)] });
    }
    s = until(s, settled);
    expect(s.objects[hurt]!.zone).toBe("graveyard");
    expect(s.objects[fine]!.zone).toBe("battlefield");
  });

  it("the damage mark wears off at cleanup", () => {
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, opp, card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" }));
    dealDamage(s0, cardSource(bolt, ap), { object: s0.objects[b]! }, 1);
    expect(s0.objects[b]!.wasDealtDamage).toBe(true);
    const s = passUntil(s0, "upkeep", opp);
    expect(s.objects[b]!.wasDealtDamage).toBeUndefined();
  });
});

describe("smaller lines", () => {
  it("Skittering Horror is sacrificed when you cast a creature spell", () => {
    const { s: s0, ap, ids } = setup([bear()]);
    const h = putOnBattlefield(s0, ap, horror);
    const s = until(cast(s0, ap, ids[0]!), settled);
    expect(s.objects[h]!.zone).toBe("graveyard");
  });

  it("Skittering Horror stays when you cast a noncreature spell", () => {
    const { s: s0, ap, ids } = setup([sorcery]);
    const h = putOnBattlefield(s0, ap, horror);
    const s = until(cast(s0, ap, ids[0]!), settled);
    expect(s.objects[h]!.zone).toBe("battlefield");
  });

  it("Compassionate Healer: becoming tapped gains 1 life and scries 1", () => {
    const { s: s0, ap, opp } = setup([]);
    const h = putOnBattlefield(s0, ap, healer);
    const life = s0.players[ap]!.life;
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: h, defender: opp }] });
    s = until(s, (t) => t.pending?.kind === "arrangeTop" || t.step === "endCombat");
    expect(s.players[ap]!.life).toBe(life + 1); // the life first, then the scry
    expect(s.pending).toMatchObject({ kind: "arrangeTop", player: ap });
  });

  it("Virulent Plague: creature tokens get -2/-2; nontoken creatures don't", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, opp, plague);
    const b = putOnBattlefield(s, ap, card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" }));
    const t = putOnBattlefield(s, ap, card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" }));
    s.objects[t]!.isToken = true;
    invalidateCharacteristics(s);
    expect(pt(s, b)).toBe("3/3");
    expect(pt(s, t)).toBe("1/1");
  });

  it("Somberwald Stag may fight a creature you don't control", () => {
    const { s: s0, ap, opp, ids } = setup([stag]);
    const theirs = putOnBattlefield(s0, opp, bear());
    let s = cast(s0, ap, ids[0]!);
    s = until(s, (t) => t.pending?.kind === "chooseTargets" || settled(t));
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [target(theirs)] });
    s = until(s, settled);
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    const stagId = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Somberwald Stag")!;
    expect(s.objects[stagId]!.damage).toBe(2);
  });
});
