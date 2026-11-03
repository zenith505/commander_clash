// Round 261: a dies trigger's "its power" when the card has left the graveyard again before the trigger resolves: the
// creature as it last existed on the battlefield (CR 603.10a, 608.2h, 113.7a), not the card's printed power. Then Kaito,
// Dancing Shadow (return a creature that dealt combat damage, loyalty abilities twice this turn), The Mimeoplasm (enters
// as a copy of one of two exiled creature cards, with counters for the other's power) and Mirror-Mad Phantasm (its
// owner shuffles it in and reveals until a card named Mirror-Mad Phantasm, the rest milled; bots don't activate it).

import { describe, expect, it } from "vitest";
import { act, bear, card, pt, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, abilityProblem, applyAction, botActions, characteristics, invalidateCharacteristics, isFullySupported, moveObject, planActivate, planCast, runStateBasedActions, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
/** Everyone passes until the stack is empty, or until `stop` says so; stops at any question. */
const settle = (s: GameState, stop?: (s: GameState) => boolean) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (stop?.(s)) return s;
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const opps = (s: GameState, ap: PlayerId) => [1, 2, 3].map((k) => s.turnOrder[(s.turnOrder.indexOf(ap) + k) % s.turnOrder.length]!);
/** Exile a card from its owner's graveyard, as Bojuka Bog would. */
const exileFromYard = (s: GameState, id: ObjectId) => {
  moveObject(s, id, "exile");
  invalidateCharacteristics(s);
};

const epiphany = (): CardDef => ({"oracleId":"00cfbea0-e862-468b-90d5-7478eb9847c0","name":"End-Blaze Epiphany","manaCost":"{X}{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"End-Blaze Epiphany deals X damage to target creature. When that creature dies this turn, exile a number of cards from the top of your library equal to its power, then choose a card exiled this way. Until the end of your next turn, you may play that card.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"ecl","releasedAt":"2026-01-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const vengeance = (): CardDef => ({"oracleId":"5f4ff27f-ebc1-4a86-8b0b-eeea470a25fb","name":"Stalking Vengeance","manaCost":"{5}{R}{R}","cmc":7,"typeLine":"Creature — Avatar","supertypes":[],"types":["Creature"],"subtypes":["Avatar"],"oracleText":"Haste\nWhenever another creature you control dies, it deals damage equal to its power to target player or planeswalker.","power":"5","toughness":"5","colors":["R"],"colorIdentity":["R"],"keywords":["Haste"],"commanderLegal":"legal","set":"dis","releasedAt":"2006-05-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const golem = card("Test Golem", "Artifact Creature — Golem", "{3}", { cmc: 3, power: "3", toughness: "3" });

describe("a dies trigger's 'its power' after the card left the graveyard", () => {
  it("End-Blaze Epiphany: the delayed trigger still counts the creature's last known power once the card is exiled from the graveyard", () => {
    expect(isFullySupported(epiphany())).toBe(true);
    const { s: s0, ap, ids } = setup([epiphany()]);
    const opp = opps(s0, ap)[0]!;
    const g = putOnBattlefield(s0, opp, golem);
    // A 4/4 (printed 3/3).
    s0.objects[g]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s0);
    const top = s0.players[ap]!.library.slice(0, 5);
    s0.players[ap]!.manaPool.R = 5;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(g)], undefined, "auto", 4)), (x) => zone(x, g) === "graveyard" && x.stack.length > 0);
    expect(zone(s, g)).toBe("graveyard");
    expect(s.stack.length).toBe(1);
    exileFromYard(s, g);
    expect(zone(s, g)).toBe("exile");
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "impulseChoice", player: ap, options: top.slice(0, 4) });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: top[0]! }));
    expect(top.slice(0, 4).map((id) => zone(s, id))).toEqual(["exile", "exile", "exile", "exile"]);
    expect(zone(s, top[4]!)).toBe("library");
  });

  it("Stalking Vengeance: the creature deals damage equal to its last known power although the card was exiled from the graveyard", () => {
    expect(isFullySupported(vengeance())).toBe(true);
    const { s: s0, ap } = setup([]);
    const opp = opps(s0, ap)[0]!;
    putOnBattlefield(s0, ap, vengeance());
    const b = putOnBattlefield(s0, ap, bear());
    // A 4/4 (printed 2/2).
    s0.objects[b]!.counters["+1/+1"] = 2;
    s0.objects[b]!.damage = 4;
    invalidateCharacteristics(s0);
    runStateBasedActions(s0);
    expect(zone(s0, b)).toBe("graveyard");
    let s = settle(s0);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] });
    expect(s.stack.length).toBe(1);
    exileFromYard(s, b);
    const life = s.players[opp]!.life;
    s = settle(s);
    expect(s.players[opp]!.life).toBe(life - 4);
  });

  it("Stalking Vengeance: still in the graveyard, the same last known power", () => {
    const { s: s0, ap } = setup([]);
    const opp = opps(s0, ap)[0]!;
    putOnBattlefield(s0, ap, vengeance());
    const b = putOnBattlefield(s0, ap, bear());
    s0.objects[b]!.counters["+1/+1"] = 1;
    s0.objects[b]!.damage = 3;
    invalidateCharacteristics(s0);
    runStateBasedActions(s0);
    let s = settle(s0);
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] });
    const life = s.players[opp]!.life;
    s = settle(s);
    expect(zone(s, b)).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(life - 3);
  });
});

const kaito = (): CardDef => ({"oracleId":"17fd42f6-f388-4ffc-8fec-ca9ada2506ee","name":"Kaito, Dancing Shadow","manaCost":"{2}{U}{B}","cmc":4,"typeLine":"Legendary Planeswalker — Kaito","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Kaito"],"oracleText":"Whenever one or more creatures you control deal combat damage to a player, you may return one of them to its owner's hand. If you do, you may activate loyalty abilities of Kaito twice this turn rather than only once.\n+1: Up to one target creature can't attack or block until your next turn.\n0: Draw a card.\n−2: Create a 2/2 colorless Drone artifact creature token with deathtouch and \"When this token leaves the battlefield, each opponent loses 2 life and you gain 2 life.\"","loyalty":"3","colors":["B","U"],"colorIdentity":["B","U"],"keywords":[],"commanderLegal":"legal","set":"one","releasedAt":"2023-02-10","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const mimeoplasm = (): CardDef => ({"oracleId":"55123455-d435-46d4-b0cd-0c1614343be2","name":"The Mimeoplasm","manaCost":"{2}{B}{G}{U}","cmc":5,"typeLine":"Legendary Creature — Ooze","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Ooze"],"oracleText":"As The Mimeoplasm enters, you may exile two creature cards from graveyards. If you do, it enters as a copy of one of those cards with a number of additional +1/+1 counters on it equal to the power of the other card.","power":"0","toughness":"0","colors":["B","G","U"],"colorIdentity":["B","G","U"],"keywords":[],"commanderLegal":"legal","set":"sld","releasedAt":"2024-09-30","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const phantasm = (): CardDef => ({"oracleId":"fd26127d-6807-41e3-9dcf-20ef257d71d3","name":"Mirror-Mad Phantasm","manaCost":"{3}{U}{U}","cmc":5,"typeLine":"Creature — Spirit","supertypes":[],"types":["Creature"],"subtypes":["Spirit"],"oracleText":"Flying\n{1}{U}: This creature's owner shuffles it into their library. If that player does, they reveal cards from the top of that library until a card named Mirror-Mad Phantasm is revealed. The player puts that card onto the battlefield and all other cards revealed this way into their graveyard.","power":"5","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":["Flying"],"commanderLegal":"legal","set":"isd","releasedAt":"2011-09-30","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const drawer = card("Test Seer", "Creature — Human Wizard", "{2}{U}", { cmc: 3, power: "1", toughness: "1", oracleText: "When this creature enters, draw a card." });
const ogre = card("Test Ogre", "Creature — Ogre", "{3}{R}", { cmc: 4, power: "4", toughness: "3" });

/** Passes until a question of this kind, declaring no blockers on the way. */
const passTo = (s: GameState, kind: string, max = 60) => {
  for (let i = 0; i < max && s.pending?.kind !== kind; i++) {
    if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: waitingOn(s)!, blocks: [] });
    else if (s.pending?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: waitingOn(s)!, attacks: [] });
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const toStep = (s: GameState, step: string, max = 80) => {
  for (let i = 0; i < max && !(s.step === step && !s.stack.length && !s.pending); i++) {
    if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: waitingOn(s)!, blocks: [] });
    else if (s.pending) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** The index of the permanent's activated ability whose text matches. */
const indexOf = (s: GameState, id: ObjectId, text: RegExp) => {
  const i = abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => text.test(a.text));
  if (i < 0) throw new Error(`no ability ${text}`);
  return i;
};

describe("Kaito, Dancing Shadow", () => {
  const ready = () => {
    const { s, ap, opp } = setup([]);
    const k = putOnBattlefield(s, ap, kaito());
    s.objects[k]!.counters.loyalty = 3;
    const b = putOnBattlefield(s, ap, bear());
    invalidateCharacteristics(s);
    return { s, ap, opp, k, b };
  };
  const zero = (s: GameState, k: ObjectId) => indexOf(s, k, /^0: Draw a card/);

  it("returning one of the creatures that dealt combat damage lets you activate its loyalty abilities twice this turn, not three times", () => {
    expect(isFullySupported(kaito())).toBe(true);
    const { s: s0, ap, opp, k, b } = ready();
    let s = run(s0, planActivate(s0, ap, k, zero(s0, k)));
    s = settle(s);
    expect(abilityProblem(s, ap, k, zero(s, k))).not.toBeNull();
    s = passTo(s, "declareAttackers");
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    s = passTo(s, "chooseMay");
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = toStep(s, "main2");
    expect(zone(s, b)).toBe("hand");
    expect(s.step).toBe("main2");
    // A second loyalty ability this turn (CR 606.3, rulings).
    expect(abilityProblem(s, ap, k, zero(s, k))).toBeNull();
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planActivate(s, ap, k, zero(s, k))));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(abilityProblem(s, ap, k, zero(s, k))).not.toBeNull();
  });

  it("declining to return a creature leaves it at once", () => {
    const { s: s0, ap, opp, k, b } = ready();
    let s = settle(run(s0, planActivate(s0, ap, k, zero(s0, k))));
    s = passTo(s, "declareAttackers");
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    s = passTo(s, "chooseMay");
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    s = toStep(s, "main2");
    expect(zone(s, b)).toBe("battlefield");
    expect(abilityProblem(s, ap, k, zero(s, k))).not.toBeNull();
  });
});

describe("The Mimeoplasm", () => {
  const cast5 = () => {
    const { s, ap, ids, opp } = setup([mimeoplasm()]);
    return { s, ap, ids, opp };
  };
  const yard = (s: GameState, pid: PlayerId, def: CardDef) => {
    const id = putOnBattlefield(s, pid, def);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "graveyard";
    s.players[pid]!.graveyard.push(id);
    invalidateCharacteristics(s);
    return id;
  };

  it("exiles two creature cards from graveyards and enters as a copy of the first, with +1/+1 counters equal to the other's power; its enters ability works", () => {
    expect(isFullySupported(mimeoplasm())).toBe(true);
    const { s: s0, ap, ids, opp } = cast5();
    const seer = yard(s0, ap, drawer);
    const og = yard(s0, opp, ogre);
    const hand = s0.players[ap]!.hand.length;
    let s = passTo(run(s0, planCast(s0, ap, ids[0]!, [])), "chooseOption");
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "copy", player: ap });
    expect((s.pending as { options: string[] }).options.sort()).toEqual([seer, og, "none"].sort());
    s = act(s, { type: "chooseOption", player: ap, choice: seer });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "copyOther", player: ap, options: [og] });
    expect(() => applyAction(s, { type: "chooseOption", player: ap, choice: seer })).toThrow();
    s = settle(act(s, { type: "chooseOption", player: ap, choice: og }));
    const m = ids[0]!;
    expect(zone(s, m)).toBe("battlefield");
    expect(characteristics(s, s.objects[m]!).name).toBe("Test Seer");
    expect(s.objects[m]!.counters["+1/+1"]).toBe(4);
    expect(pt(s, m)).toBe("5/5");
    expect([zone(s, seer), zone(s, og)]).toEqual(["exile", "exile"]);
    // "When this creature enters, draw a card" as the copy (rulings).
    expect(s.players[ap]!.hand.length).toBe(hand);
  });

  it("you may choose not to; with only one creature card in graveyards there is no choice and it enters as a 0/0", () => {
    const { s: s0, ap, ids, opp } = cast5();
    yard(s0, ap, drawer);
    yard(s0, opp, ogre);
    let s = passTo(run(s0, planCast(s0, ap, ids[0]!, [])), "chooseOption");
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "none" }));
    expect(zone(s, ids[0]!)).toBe("graveyard");

    const { s: t0, ap: a2, ids: i2 } = cast5();
    const lone = yard(t0, a2, ogre);
    const t = settle(run(t0, planCast(t0, a2, i2[0]!, [])));
    expect(zone(t, i2[0]!)).toBe("graveyard");
    expect(zone(t, lone)).toBe("graveyard");
  });

  it("a bot copies one and takes the other with the greatest power for counters", () => {
    const { s: s0, ap, ids, opp } = cast5();
    yard(s0, opp, drawer);
    const og = yard(s0, opp, ogre);
    const b = yard(s0, opp, bear());
    let s = passTo(run(s0, planCast(s0, ap, ids[0]!, [])), "chooseOption");
    const first = (botActions(s, ap)[0] as { choice: string }).choice;
    expect(first).not.toBe("none");
    s = act(s, { type: "chooseOption", player: ap, choice: b });
    expect(botActions(s, ap)[0]).toMatchObject({ type: "chooseOption", choice: og });
  });
});

describe("Mirror-Mad Phantasm", () => {
  it("its owner shuffles it in, then reveals until a card named Mirror-Mad Phantasm: that card onto the battlefield, the rest into the graveyard", () => {
    expect(isFullySupported(phantasm())).toBe(true);
    const { s: s0, ap } = setup([]);
    const ph = putOnBattlefield(s0, ap, phantasm());
    const libBefore = s0.players[ap]!.library.length;
    const yardBefore = s0.players[ap]!.graveyard.length;
    const s = settle(run(s0, planActivate(s0, ap, ph, 0)));
    // The card shuffled in is the one found (a new object, CR 400.7).
    expect(zone(s, ph)).toBe("battlefield");
    const milled = s.players[ap]!.graveyard.length - yardBefore;
    expect(s.players[ap]!.library.length).toBe(libBefore - milled);
    expect(s.objects[ph]!.controller).toBe(ap);
  });

  it("owned by an opponent: that player's library, graveyard and control", () => {
    const { s: s0, ap, opp } = setup([]);
    const ph = putOnBattlefield(s0, opp, phantasm());
    s0.objects[ph]!.controller = ap;
    invalidateCharacteristics(s0);
    const myLib = s0.players[ap]!.library.length;
    const s = settle(run(s0, planActivate(s0, ap, ph, 0)));
    expect(zone(s, ph)).toBe("battlefield");
    expect(s.objects[ph]!.controller).toBe(opp);
    expect(s.players[ap]!.library.length).toBe(myLib);
  });

  it("if it left the battlefield before the ability resolves, nothing is revealed", () => {
    const { s: s0, ap } = setup([]);
    const ph = putOnBattlefield(s0, ap, phantasm());
    const lib = s0.players[ap]!.library.length;
    let s = run(s0, planActivate(s0, ap, ph, 0));
    moveObject(s, ph, "graveyard");
    invalidateCharacteristics(s);
    s = settle(s);
    expect(zone(s, ph)).toBe("graveyard");
    expect(s.players[ap]!.graveyard.length).toBe(1);
    expect(s.players[ap]!.library.length).toBe(lib);
  });

  it("a bot doesn't activate it", () => {
    const { s, ap } = setup([]);
    const ph = putOnBattlefield(s, ap, phantasm());
    const acts = botActions(s, ap);
    expect(acts.some((a) => a.type === "activateAbility" && a.objectId === ph)).toBe(false);
  });
});
