// Round 305 (Lane A, skip-list cards): Inalla, Archmage Ritualist (an eminence token copy that gains haste), Boneyard
// Scourge (a Dragon dying while it's in your graveyard), Amzu, Swarm's Hunger (the greatest mana value among the cards
// that left your graveyard), Razorfield Ripper (the amount of {E} you have; reconfigure for {2} or {E}{E}{E}), Enchanter's
// Bane (damage equal to its mana value unless its controller sacrifices it), Canoptek Wraith (pay and sacrifice it, then
// basic lands with one land's name), Tegwyll's Scouring (flash by tapping three flyers) and The Red Terror (a red source
// you control dealing damage, once for each event).

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, island, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";
import { objHasKeyword } from "../src/cards";
import { castProblem, moveObject } from "../src/game";
import { dealDamage, dealDamageBatch, objectSource } from "../src/damage";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Everyone passes until the stack is empty, answering "you may" with `may`; other players' questions as the bots would. Stops at any other question of `me`'s. */
const settle = (s: GameState, opts: { may?: boolean; me?: PlayerId } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && opts.me !== undefined && p.player !== opts.me) s = act(s, botActions(s, p.player)[0]!);
    else if (p?.kind === "chooseMay" && opts.may !== undefined) s = act(s, { type: "chooseMay", player: p.player, yes: opts.may });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tokensOf = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid);

const inalla = (): CardDef => ({"oracleId":"21bdba6e-3f9d-4ead-8212-0cbb0ce7f8cc","name":"Inalla, Archmage Ritualist","manaCost":"{2}{U}{B}{R}","cmc":5,"typeLine":"Legendary Creature — Human Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"Eminence — Whenever another nontoken Wizard you control enters, if Inalla is in the command zone or on the battlefield, you may pay {1}. If you do, create a token that's a copy of that Wizard. The token gains haste. Exile it at the beginning of the next end step.\nTap five untapped Wizards you control: Target player loses 7 life.","power":"4","toughness":"5","colors":["B","R","U"],"colorIdentity":["B","R","U"],"keywords":["Eminence"],"layout":"normal"});
const boneyard = (): CardDef => ({"oracleId":"eef40ab2-9e17-4e8d-9e58-1a82ab871b5b","name":"Boneyard Scourge","manaCost":"{2}{B}{B}","cmc":4,"typeLine":"Creature — Zombie Dragon","supertypes":[],"types":["Creature"],"subtypes":["Zombie","Dragon"],"oracleText":"Flying\nWhenever a Dragon you control dies while this card is in your graveyard, you may pay {1}{B}. If you do, return this card from your graveyard to the battlefield.","power":"4","toughness":"3","colors":["B"],"colorIdentity":["B"],"keywords":["Flying"],"layout":"normal"});
const amzu = (): CardDef => ({"oracleId":"6777863c-e52c-4a7c-b8d2-a16b1438b3d2","name":"Amzu, Swarm's Hunger","manaCost":"{3}{B}{G}","cmc":5,"typeLine":"Legendary Creature — Insect Shaman","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Insect","Shaman"],"oracleText":"Flying, menace\nOther Insects you control have menace.\nWhenever one or more cards leave your graveyard, you may create a 1/1 black and green Insect creature token, then put a number of +1/+1 counters on it equal to the greatest mana value among those cards. Do this only once each turn.","power":"3","toughness":"3","colors":["B","G"],"colorIdentity":["B","G"],"keywords":["Flying","Menace"],"layout":"normal"});
const ripper = (): CardDef => ({"oracleId":"ef842299-8a31-4793-9142-2bcd7a8b2fab","name":"Razorfield Ripper","manaCost":"{2}{W}","cmc":3,"typeLine":"Artifact Creature — Equipment Rhino","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Equipment","Rhino"],"oracleText":"Whenever this creature or equipped creature attacks, you get {E} (an energy counter), then it gets +X/+X until end of turn, where X is the amount of {E} you have.\nReconfigure—Pay {2} or {E}{E}{E}. (Pay {2} or {E}{E}{E}: Attach to target creature you control; or unattach from a creature. Reconfigure only as a sorcery. While attached, this isn't a creature.)","power":"3","toughness":"3","colors":["W"],"colorIdentity":["W"],"keywords":["Reconfigure"],"layout":"normal"});
const bane = (): CardDef => ({"oracleId":"1f0548f8-5dec-44b5-b5a9-e55fa4366e08","name":"Enchanter's Bane","manaCost":"{1}{R}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of your end step, target enchantment deals damage equal to its mana value to its controller unless that player sacrifices it.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"});
const wraith = (): CardDef => ({"oracleId":"61849685-b407-4ed0-aafc-ec3a003200b9","name":"Canoptek Wraith","manaCost":"{3}","cmc":3,"typeLine":"Artifact Creature — Wraith","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Wraith"],"oracleText":"Wraith Form — This creature can't be blocked.\nTransdimensional Scout — When this creature deals combat damage to a player, you may pay {3} and sacrifice it. If you do, choose a land you control. Then search your library for up to two basic land cards which have the same name as the chosen land, put them onto the battlefield tapped, then shuffle.","power":"2","toughness":"1","colors":[],"colorIdentity":[],"keywords":["Transdimensional Scout","Wraith Form"],"layout":"normal"});
const scouring = (): CardDef => ({"oracleId":"58ebaaba-7e35-4588-9679-23b22e39789b","name":"Tegwyll's Scouring","manaCost":"{4}{B}{B}","cmc":6,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"You may cast this spell as though it had flash by tapping three untapped creatures you control with flying in addition to paying its other costs.\nDestroy all creatures. Create three 1/1 black Faerie Rogue creature tokens with flying.","colors":["B"],"colorIdentity":["B"],"keywords":[],"layout":"normal"});
const terror = (): CardDef => ({"oracleId":"557bd3c9-1c60-480d-9650-30c317506097","name":"The Red Terror","manaCost":"{3}{R}","cmc":4,"typeLine":"Legendary Creature — Tyranid","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Tyranid"],"oracleText":"Advanced Species — Whenever a red source you control deals damage to one or more permanents and/or players, put a +1/+1 counter on The Red Terror.","power":"4","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":["Advanced Species"],"layout":"normal"});

const wizard = (name = "Test Wizard") => card(name, "Creature — Human Wizard", "{1}{U}", { power: "1", toughness: "1", oracleText: "" });

describe("round 305: Inalla, Archmage Ritualist", () => {
  const asCommander = (hand: CardDef[]) => {
    const { s, ap, ids, opp } = setup(hand);
    const d = inalla();
    s.cards[d.oracleId] = d;
    const c = s.players[ap]!.command[0]!;
    s.objects[c]!.cardId = d.oracleId;
    invalidateCharacteristics(s);
    return { s, ap, ids, opp, c };
  };

  it("is supported", () => supported(inalla()));

  it("from the command zone: pay {1} for a token copy of the Wizard with haste, exiled at the next end step", () => {
    const { s: s0, ap, ids } = asCommander([wizard()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: ap });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s.players[ap]!.manaPool.C = 1;
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), { me: ap });
    const [tok] = tokensOf(s, ap);
    expect(tok).toBeDefined();
    expect(characteristics(s, s.objects[tok!]!).name).toBe("Test Wizard");
    expect(objHasKeyword(s, s.objects[tok!]!, "Haste")).toBe(true);
    s = passUntil(s, "end", ap);
    s = settle(s, { me: ap });
    expect(s.objects[tok!]?.zone === "battlefield").toBe(false);
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
  });

  it("declining makes no token; a token Wizard and Inalla itself don't trigger it", () => {
    const { s: s0, ap, ids } = asCommander([wizard()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }), { me: ap });
    expect(tokensOf(s, ap)).toHaveLength(0);
  });

  it("the copy uses the Wizard as it last existed if it has left (rulings)", () => {
    const { s: s0, ap, ids } = asCommander([wizard("Test Gone Wizard")]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: ap });
    expect(s.pending).toMatchObject({ kind: "chooseMay" });
    moveObject(s, ids[0]!, "graveyard");
    s.players[ap]!.manaPool.C = 1;
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), { me: ap });
    const [tok] = tokensOf(s, ap);
    expect(tok && characteristics(s, s.objects[tok]!).name).toBe("Test Gone Wizard");
  });
});

describe("round 305: Boneyard Scourge", () => {
  const dragon = () => card("Test Dragon", "Creature — Dragon", "{4}{R}", { power: "4", toughness: "4", keywords: ["Flying"], oracleText: "Flying" });

  it("is supported", () => supported(boneyard()));

  it("a Dragon of yours dies while it's in your graveyard: pay {1}{B} to return it to the battlefield", () => {
    const { s: s0, ap } = setup([]);
    const b = into(s0, ap, boneyard(), "graveyard");
    const d = putOnBattlefield(s0, ap, dragon());
    let s = s0;
    moveObject(s, d, "graveyard");
    s = settle(s, { me: ap });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s.players[ap]!.manaPool.B = 2;
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), { me: ap });
    expect(s.objects[b]!.zone).toBe("battlefield");
  });

  it("not for another player's Dragon, nor when it dies at the same time as the Dragon (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    into(s0, ap, boneyard(), "graveyard");
    const theirs = putOnBattlefield(s0, opp, dragon());
    let s = s0;
    moveObject(s, theirs, "graveyard");
    s = settle(s, { me: ap });
    expect(s.pending).toBeNull();
    // Both on the battlefield, destroyed together (a fresh game: the first one in the graveyard would rightly trigger).
    ({ s } = setup([]));
    const b2 = putOnBattlefield(s, ap, boneyard());
    const d2 = putOnBattlefield(s, ap, dragon());
    const wrath = into(s, ap, card("Test Wrath", "Sorcery", "{2}{W}{W}", { oracleText: "Destroy all creatures." }), "hand");
    s = settle(run(s, planCast(s, ap, wrath)), { me: ap });
    expect(s.objects[b2]!.zone).toBe("graveyard");
    expect(s.objects[d2]!.zone).toBe("graveyard");
    expect(s.pending).toBeNull();
  });
});

describe("round 305: Amzu, Swarm's Hunger", () => {
  it("is supported", () => supported(amzu()));

  it("cards leaving your graveyard together: one Insect with counters equal to the greatest mana value among them, once each turn", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, amzu());
    const a = into(s0, ap, card("Test Three", "Sorcery", "{2}{R}", { oracleText: "Draw a card." }), "graveyard");
    const b = into(s0, ap, card("Test Five", "Creature — Ox", "{4}{G}", { power: "5", toughness: "5", oracleText: "" }), "graveyard");
    const c = into(s0, ap, card("Test One", "Instant", "{R}", { oracleText: "Draw a card." }), "graveyard");
    let s = s0;
    const exile = into(s, ap, card("Test Bury", "Sorcery", "{B}", { oracleText: "Exile up to two target cards from a single graveyard." }), "hand");
    expect(isFullySupported(s.cards[s.objects[exile]!.cardId]!)).toBe(true);
    s = settle(run(s, planCast(s, ap, exile, [tgt(a), tgt(b)])), { me: ap });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), { me: ap });
    const toks = tokensOf(s, ap);
    expect(toks).toHaveLength(1);
    expect(s.objects[toks[0]!]!.counters["+1/+1"]).toBe(5);
    expect(characteristics(s, s.objects[toks[0]!]!).subtypes).toContain("Insect");
    // Done once this turn: another card leaving doesn't ask again.
    const again = into(s, ap, card("Test Bury Again", "Sorcery", "{B}", { oracleText: "Exile target card from a graveyard." }), "hand");
    s = settle(run(s, planCast(s, ap, again, [tgt(c)])), { me: ap });
    expect(s.objects[c]!.zone).toBe("exile");
    expect(s.pending).toBeNull();
    expect(tokensOf(s, ap)).toHaveLength(1);
  });

  it("declining lets it trigger again this turn (rulings on doing it once)", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, amzu());
    const a = into(s0, ap, card("Test Two", "Sorcery", "{1}{R}", { oracleText: "Draw a card." }), "graveyard");
    const b = into(s0, ap, card("Test Four", "Sorcery", "{3}{R}", { oracleText: "Draw a card." }), "graveyard");
    let s = s0;
    const bury = (id: string) => {
      const sp = into(s, ap, card("Test Bury", "Sorcery", "{B}", { oracleText: "Exile target card from a graveyard." }), "hand");
      s = settle(run(s, planCast(s, ap, sp, [tgt(id)])), { me: ap });
    };
    bury(a);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }), { me: ap });
    expect(tokensOf(s, ap)).toHaveLength(0);
    bury(b);
    expect(s.pending).toMatchObject({ kind: "chooseMay" });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), { me: ap });
    expect(s.objects[tokensOf(s, ap)[0]!]!.counters["+1/+1"]).toBe(4);
  });
});

describe("round 305: Razorfield Ripper", () => {
  it("is supported, with reconfigure for {2} or {E}{E}{E}", () => {
    supported(ripper());
    const { s, ap } = setup([]);
    const r = putOnBattlefield(s, ap, ripper());
    const b = putOnBattlefield(s, ap, bear());
    // Both costs work; the energy one only with three {E}.
    expect(planActivate(s, ap, r, 0, [tgt(b)])).not.toBeNull();
    expect(planActivate(s, ap, r, 2, [tgt(b)])).toBeNull();
    s.players[ap]!.energy = 3;
    expect(planActivate(s, ap, r, 2, [tgt(b)])).not.toBeNull();
  });

  it("attacking: you get {E}, then it gets +X/+X where X is the {E} you have then", () => {
    const { s: s0, ap, opp } = setup([]);
    const r = putOnBattlefield(s0, ap, ripper());
    s0.players[ap]!.energy = 2;
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: r, defender: opp }] } as Action);
    s = settle(s, { me: ap });
    expect(s.players[ap]!.energy).toBe(3);
    expect(power(s, s.objects[r]!)).toBe(6);
    expect(toughness(s, s.objects[r]!)).toBe(6);
  });

  it("reconfigured for {E}{E}{E}: the equipped creature attacking gets the bonus, and it isn't a creature", () => {
    const { s: s0, ap, opp } = setup([]);
    const r = putOnBattlefield(s0, ap, ripper());
    const b = putOnBattlefield(s0, ap, bear());
    s0.players[ap]!.energy = 3;
    let s = settle(run(s0, planActivate(s0, ap, r, 2, [tgt(b)])), { me: ap });
    expect(s.objects[r]!.attachedTo).toBe(b);
    expect(s.players[ap]!.energy).toBe(0);
    expect(characteristics(s, s.objects[r]!).types).not.toContain("Creature");
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] } as Action);
    s = settle(s, { me: ap });
    expect(s.players[ap]!.energy).toBe(1);
    expect(power(s, s.objects[b]!)).toBe(3);
    // Unattach for {2} later works too (sorcery speed, main phase).
    s = passUntil(s, "main2", ap);
    s = settle(run(s, planActivate(s, ap, r, 1)), { me: ap });
    expect(s.objects[r]!.attachedTo).toBeUndefined();
    expect(characteristics(s, s.objects[r]!).types).toContain("Creature");
  });
});

describe("round 305: Enchanter's Bane", () => {
  const aura = (name = "Test Pact") => card(name, "Enchantment", "{2}{W}{W}", { oracleText: "" });
  const toEnd = (hold: (s: GameState, ap: PlayerId, opp: PlayerId) => string) => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, bane());
    const e = hold(s0, ap, opp);
    let s = passUntil(s0, "end", ap);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(e)] });
    for (let i = 0; i < 20 && !s.pending && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    return { s, ap, opp, e };
  };

  it("is supported", () => supported(bane()));

  it("its controller sacrifices the enchantment, or takes damage equal to its mana value from it", () => {
    let { s, opp, e } = toEnd((s, _ap, opp) => putOnBattlefield(s, opp, aura()));
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: opp, what: "punisher", labels: ["Sacrifice the enchantment", "Take damage from the enchantment equal to its mana value"] });
    const life = s.players[opp]!.life;
    s = act(s, { type: "chooseOption", player: opp, choice: "none" });
    expect(s.players[opp]!.life).toBe(life - 4);
    expect(s.objects[e]!.zone).toBe("battlefield");
    ({ s, opp, e } = toEnd((s, _ap, opp) => putOnBattlefield(s, opp, aura())));
    const life2 = s.players[opp]!.life;
    s = act(s, { type: "chooseOption", player: opp, choice: "0" });
    expect(s.objects[e]!.zone).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(life2);
  });

  it("it can target itself: it deals 2 damage to you unless you sacrifice it", () => {
    let { s, ap, e } = toEnd((s, ap) => s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Enchanter's Bane")!);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "punisher" });
    const life = s.players[ap]!.life;
    s = act(s, { type: "chooseOption", player: ap, choice: "none" });
    expect(s.players[ap]!.life).toBe(life - 2);
    expect(s.objects[e]!.zone).toBe("battlefield");
  });

  it("a bot chooses", () => {
    const { s: s0, opp } = toEnd((s, _ap, opp) => putOnBattlefield(s, opp, aura()));
    const s = act(s0, botActions(s0, opp)[0]!);
    expect(s.pending?.kind === "chooseOption" && s.pending.what === "punisher").toBe(false);
  });
});

describe("round 305: Canoptek Wraith", () => {
  const hit = (pay: boolean) => {
    const { s: s0, ap, opp } = setup([]);
    const w = putOnBattlefield(s0, ap, wraith());
    const isl = [into(s0, ap, island, "library"), into(s0, ap, island, "library")];
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: w, defender: opp }] } as Action);
    for (let i = 0; i < 50 && s.pending?.kind !== "chooseMay" && s.step !== "main2"; i++) s = s.pending ? act(s, botActions(s, s.pending.player)[0]!) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s.players[ap]!.manaPool.C = 3;
    s = act(s, { type: "chooseMay", player: ap, yes: pay });
    return { s, ap, opp, w, isl };
  };

  it("is supported", () => supported(wraith()));

  it("pay {3} and sacrifice it: up to two basic lands that all share the name of a land you control, tapped", () => {
    let { s, ap, w, isl } = hit(true);
    expect(s.objects[w]!.zone).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 2, oneName: true });
    const forestInLib = s.players[ap]!.library.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Forest")!;
    // An Island and a Forest don't share a name.
    expect(() => applyAction(s, { type: "searchLibrary", player: ap, found: [isl[0]!, forestInLib] })).toThrow(/same name/);
    s = act(s, { type: "searchLibrary", player: ap, found: isl });
    for (const id of isl) {
      expect(s.objects[id]!.zone).toBe("battlefield");
      expect(s.objects[id]!.tapped).toBe(true);
    }
  });

  it("declining keeps it, and a bot picks lands with one name", () => {
    const { s, w } = hit(false);
    expect(s.objects[w]!.zone).toBe("battlefield");
    const { s: s2, ap } = hit(true);
    const [a] = botActions(s2, ap);
    expect(a).toMatchObject({ type: "searchLibrary" });
    const found = (a as Extract<Action, { type: "searchLibrary" }>).found;
    expect(found.length).toBe(2);
    expect(new Set(found.map((id) => s2.cards[s2.objects[id]!.cardId]!.name)).size).toBe(1);
  });
});

describe("round 305: Tegwyll's Scouring", () => {
  const flyer = (n: string) => card(n, "Creature — Bird", "{1}{W}", { power: "1", toughness: "1", keywords: ["Flying"], oracleText: "Flying" });
  const castWith = (s: GameState, pid: PlayerId, id: string, choices: Parameters<typeof planCast>[7]) => settle(run(s, planCast(s, pid, id, undefined, undefined, "auto", undefined, choices)), { me: pid });

  it("is supported", () => supported(scouring()));

  it("at sorcery speed without tapping anything: destroys all creatures, then three 1/1 Faerie Rogues with flying", () => {
    const { s: s0, ap, ids, opp } = setup([scouring()]);
    const b = putOnBattlefield(s0, opp, bear());
    const f = putOnBattlefield(s0, ap, flyer("Bird A"));
    const s = castWith(s0, ap, ids[0]!, {});
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.objects[f]!.zone).toBe("graveyard");
    expect(s.objects[f]!.tapped).toBeFalsy();
    const toks = tokensOf(s, ap);
    expect(toks).toHaveLength(3);
    for (const t of toks) {
      expect(characteristics(s, s.objects[t]!).subtypes).toEqual(expect.arrayContaining(["Faerie", "Rogue"]));
      expect(objHasKeyword(s, s.objects[t]!, "Flying")).toBe(true);
    }
  });

  it("as though it had flash only by tapping three untapped creatures you control with flying", () => {
    const { s: s0, ap, ids } = setup([scouring()]);
    const birds = [putOnBattlefield(s0, ap, flyer("Bird A")), putOnBattlefield(s0, ap, flyer("Bird B"))];
    const grounded = putOnBattlefield(s0, ap, bear());
    let s = passUntil(s0, "beginCombat", ap);
    // Two flyers (and a bear) aren't enough.
    expect(castProblem(s, ap, ids[0]!)).toMatch(/sorcery speed/);
    birds.push(putOnBattlefield(s, ap, flyer("Bird C")));
    expect(castProblem(s, ap, ids[0]!) ?? "").not.toMatch(/sorcery speed/);
    // Without the extra cost it's still a sorcery.
    expect(castProblem(s, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { kicks: [] })).toMatch(/sorcery speed/);
    // A tapped flyer doesn't count.
    s.objects[birds[2]!]!.tapped = true;
    expect(castProblem(s, ap, ids[0]!)).toMatch(/sorcery speed/);
    s.objects[birds[2]!]!.tapped = false;
    s = castWith(s, ap, ids[0]!, { kicks: [0], tap: birds });
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    for (const b of [...birds, grounded]) expect(s.objects[b]!.zone).toBe("graveyard");
    expect(tokensOf(s, ap)).toHaveLength(3);
  });
});

describe("round 305: The Red Terror", () => {
  const red = (n: string) => card(n, "Creature — Goblin", "{1}{R}", { power: "2", toughness: "2", colors: ["R"] });
  const counters = (s: GameState, id: string) => s.objects[id]!.counters["+1/+1"] ?? 0;
  const fight = (attackers: (s: GameState, ap: PlayerId) => string[]) => {
    const { s: s0, ap, opp } = setup([]);
    const t = putOnBattlefield(s0, ap, terror());
    const others = attackers(s0, ap);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [t, ...others].map((a) => ({ attacker: a, defender: opp })) } as Action);
    s = passUntil(s, "main2", ap);
    s = settle(s, { me: ap });
    return { s, t, ap, opp };
  };

  it("is supported", () => supported(terror()));

  it("each red source dealing combat damage puts one counter on it; a green one doesn't", () => {
    const { s, t, opp } = fight((s, ap) => [putOnBattlefield(s, ap, red("Goblin A")), putOnBattlefield(s, ap, bear())]);
    expect(s.players[opp]!.life).toBe(40 - 4 - 2 - 2);
    expect(counters(s, t)).toBe(2);
  });

  it("a red spell dealing damage to several players and creatures at once: one counter; an opponent's red source: none", () => {
    const { s: s0, ap, opp } = setup([]);
    const t = putOnBattlefield(s0, ap, terror());
    putOnBattlefield(s0, opp, bear());
    const sp = into(s0, ap, card("Test Pyre", "Sorcery", "{2}{R}", { colors: ["R"], oracleText: "Test Pyre deals 1 damage to each creature your opponents control and each opponent." }), "hand");
    expect(isFullySupported(s0.cards[s0.objects[sp]!.cardId]!)).toBe(true);
    let s = settle(run(s0, planCast(s0, ap, sp)), { me: ap });
    expect(s.players[opp]!.life).toBe(39);
    expect(counters(s, t)).toBe(1);
    // An opponent's red creature dealing damage doesn't count.
    const theirs = putOnBattlefield(s, opp, red("Their Goblin"));
    dealDamage(s, objectSource(s, s.objects[theirs]!), { player: ap }, 2);
    s = settle(s, { me: ap });
    expect(counters(s, t)).toBe(1);
  });

  it("outside of combat too, one counter for each red source of yours in one batch of damage", () => {
    const { s: s0, ap, opp } = setup([]);
    const t = putOnBattlefield(s0, ap, terror());
    const g = putOnBattlefield(s0, ap, red("Goblin A"));
    putOnBattlefield(s0, opp, bear({ toughness: "5" }));
    let s = s0;
    dealDamage(s, objectSource(s, s.objects[g]!), { player: opp }, 1);
    s = settle(s, { me: ap });
    expect(counters(s, t)).toBe(1);
    dealDamageBatch(s, [{ src: objectSource(s, s.objects[g]!), to: { player: opp }, n: 1 }, { src: objectSource(s, s.objects[t]!), to: { object: s.battlefield.find((id) => s.objects[id]!.controller === opp && s.cards[s.objects[id]!.cardId]!.name === "Grizzly Bears")! }, n: 1 }, { src: objectSource(s, s.objects[t]!), to: { player: opp }, n: 1 }]);
    s = settle(s, { me: ap });
    expect(counters(s, t)).toBe(3);
  });
});
