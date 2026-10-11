// Targets in graveyards (CR 109.2a, 115.2), "you may" (CR 608.2d), and the tokens the rules
// define: Treasure, Food and Clue (CR 111.10).

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, cast, passAll, putOnBattlefield, setup, target } from "./helpers";
import {
  botActions,
  compileCard,
  invalidateCharacteristics,
  isFullySupported,
  legalTargets,
  manaOptions,
  planCast,
  spellTargets,
  waitingOn,
  type CardDef,
  type GameState,
  type PlayerId,
} from "../src";

/** A fresh copy of `def` in `pid`'s graveyard. */
function inGraveyard(s: GameState, pid: PlayerId, def: CardDef) {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  invalidateCharacteristics(s);
  return id;
}
const castOnly = (s: GameState, pid: number, id: string, targets?: Parameters<typeof planCast>[3]) => {
  for (const a of planCast(s, pid, id, targets)!) s = act(s, a);
  return s;
};

const raiseDead = card("Raise Dead", "Sorcery", "{B}", { oracleText: "Return target creature card from your graveyard to your hand." });
const zombify = card("Zombify", "Sorcery", "{3}{B}", { oracleText: "Return target creature card from your graveyard to the battlefield." });
const necro = card("Necro", "Sorcery", "{2}{B}", { oracleText: "Put target creature card from a graveyard onto the battlefield under your control." });
const bog = card("Bog", "Land", "", { oracleText: "When this land enters, exile target player's graveyard." });
const ooze = card("Ooze", "Creature — Ooze", "{1}{G}", { oracleText: "{G}: Exile target card from a graveyard.", power: "2", toughness: "2" });
const murder = card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });

describe("targets in graveyards", () => {
  it("compiles 'card from your graveyard' to a graveyard target, and rejects what it can't do correctly", () => {
    expect(spellTargets).toBeDefined();
    expect(compileCard(raiseDead).spell?.targets[0]).toMatchObject({ kind: "card", types: ["Creature"], owner: "you" });
    expect(compileCard(ooze).activated[0]?.body.targets[0]).toMatchObject({ kind: "card", types: [] });
    expect(compileCard(necro).spell?.effects[0]).toMatchObject({ type: "putOntoBattlefield" });
    const mv = card("Unearthish", "Sorcery", "{B}", { oracleText: "Return target creature card with mana value 3 or less from your graveyard to the battlefield." });
    expect(compileCard(mv).spell?.targets[0]).toMatchObject({ kind: "card", manaValue: { max: 3 } });
    // Could be an Aura, which needs a choice of what it enchants (CR 303.4f): not supported yet.
    expect(isFullySupported(card("X", "Sorcery", "{B}", { oracleText: "Return target permanent card from your graveyard to the battlefield." }))).toBe(false);
    expect(isFullySupported(card("X", "Sorcery", "{B}", { oracleText: "Return target enchantment card from your graveyard to the battlefield." }))).toBe(false);
    // An opponent's card can't go "to your hand" by being returned to its owner's hand.
    expect(isFullySupported(card("X", "Sorcery", "{B}", { oracleText: "Return target creature card from a graveyard to your hand." }))).toBe(false);
    // "Destroy" can't aim at a card in a graveyard.
    expect(isFullySupported(card("X", "Sorcery", "{B}", { oracleText: "Destroy target creature card from a graveyard." }))).toBe(false);
  });

  it("only cards in the right graveyard are legal, and a creature on the battlefield isn't a 'creature card' (CR 109.2)", () => {
    const { s, ap, opp } = setup([]);
    const mine = inGraveyard(s, ap, bear());
    const theirs = inGraveyard(s, opp, bear());
    const land = inGraveyard(s, ap, card("Swamp", "Basic Land — Swamp"));
    const onField = putOnBattlefield(s, ap, bear());
    const spec = compileCard(raiseDead).spell!.targets[0]!;
    expect(legalTargets(s, spec, ap).map((t) => t.id)).toEqual([mine]);
    const any = compileCard(ooze).activated[0]!.body.targets[0]!;
    expect(legalTargets(s, any, ap).map((t) => t.id).sort()).toEqual([mine, theirs, land].sort());
    // And a permanent-targeting spell can't reach into a graveyard (CR 115.2).
    const kill = compileCard(murder).spell!.targets[0]!;
    expect(legalTargets(s, kill, ap).map((t) => t.id)).toContain(onField);
    expect(legalTargets(s, kill, ap).map((t) => t.id)).not.toContain(mine);
  });

  it("returns a creature card to its owner's hand", () => {
    const { s: s0, ap, ids } = setup([raiseDead]);
    const dead = inGraveyard(s0, ap, bear({ name: "Old Friend" }));
    const s = cast(s0, ap, ids[0]!, [target(dead)]);
    expect(s.objects[dead]!.zone).toBe("hand");
    expect(s.players[ap]!.hand).toContain(dead);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });

  it("if the card leaves the graveyard before resolution, it's a new object and the spell does nothing (CR 400.7, 608.2b)", () => {
    const { s: s0, ap, ids, opp } = setup([raiseDead]);
    const dead = inGraveyard(s0, ap, bear());
    let s = castOnly(s0, ap, ids[0]!, [target(dead)]);
    // In response the card is exiled and (somehow) comes back to the graveyard: still not the same object.
    const o = s.objects[dead]!;
    o.zoneChanges = (o.zoneChanges ?? 0) + 2;
    s = passAll(s);
    expect(s.objects[dead]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand).not.toContain(dead);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    void opp;
  });

  it("reanimates under the caster's control: it enters the battlefield (triggers, summoning sickness)", () => {
    const etb = card("Herald", "Creature — Spirit", "{3}{W}", { power: "2", toughness: "2", oracleText: "When this creature enters, you gain 3 life." });
    const { s: s0, ap, ids } = setup([zombify]);
    const dead = inGraveyard(s0, ap, etb);
    const life = s0.players[ap]!.life;
    let s = cast(s0, ap, ids[0]!, [target(dead)]);
    expect(s.objects[dead]!.zone).toBe("battlefield");
    expect(s.objects[dead]!.controlledSinceTurn).toBe(s.turn); // summoning sick
    s = passAll(s); // the enters trigger resolves
    expect(s.players[ap]!.life).toBe(life + 3);
  });

  it("'from a graveyard ... under your control' takes an opponent's creature; it still belongs to them (CR 110.2a)", () => {
    const { s: s0, ap, ids, opp } = setup([necro]);
    const dead = inGraveyard(s0, opp, bear({ name: "Their Bear" }));
    let s = cast(s0, ap, ids[0]!, [target(dead)]);
    const o = s.objects[dead]!;
    expect(o.zone).toBe("battlefield");
    expect(o.controller).toBe(ap);
    expect(o.owner).toBe(opp);
    // When it dies it goes to its owner's graveyard.
    const { s: s1 } = { s };
    s1.objects[dead]!.damage = 5;
    s = passAll(s1);
    expect(s.players[opp]!.graveyard).toContain(dead);
  });

  it("'Return ... to the battlefield' without 'under your control' only reaches your own graveyard", () => {
    const { s, ap, opp } = setup([]);
    inGraveyard(s, opp, bear());
    expect(legalTargets(s, compileCard(zombify).spell!.targets[0]!, ap)).toHaveLength(0);
  });

  it("exiles a target card from a graveyard, and a whole graveyard", () => {
    const { s: s0, ap, opp } = setup([]);
    const oozeId = putOnBattlefield(s0, ap, ooze);
    const theirs = inGraveyard(s0, opp, bear());
    let s = activate(s0, ap, oozeId, 0, [target(theirs)]);
    expect(s.objects[theirs]!.zone).toBe("exile");

    const a = inGraveyard(s, opp, bear());
    const b = inGraveyard(s, opp, card("Shock", "Instant", "{R}"));
    const bogId = putOnBattlefield(s, ap, bog);
    // Play-like: move the land from the battlefield and back to fire its enters trigger.
    s.battlefield.splice(s.battlefield.indexOf(bogId), 1);
    s.objects[bogId]!.zone = "hand";
    s.players[ap]!.hand.push(bogId);
    s.players[ap]!.landsPlayedThisTurn = 0;
    s = act(s, { type: "playLand", player: ap, objectId: bogId });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] });
    s = passAll(s);
    expect(s.objects[a]!.zone).toBe("exile");
    expect(s.objects[b]!.zone).toBe("exile");
    expect(s.players[opp]!.graveyard).toHaveLength(0);
  });

  it("a bot reanimates its best creature and exiles an opponent's card rather than its own", () => {
    const { s: s0, ap, ids, opp } = setup([necro]);
    inGraveyard(s0, ap, bear({ name: "Small" }));
    const big = inGraveyard(s0, opp, bear({ name: "Big", power: "6", toughness: "6", manaCost: "{5}{G}" }));
    s0.players[ap]!.hand = [ids[0]!]; // nothing else to do first
    const plan = botActions(s0, ap);
    const castIt = plan.find((a) => a.type === "castSpell" && a.objectId === ids[0]);
    expect(castIt).toMatchObject({ targets: [{ kind: "object", id: big }] });

    const { s: s1, ap: me, opp: them } = setup([]);
    const oozeId = putOnBattlefield(s1, me, ooze);
    const mine = inGraveyard(s1, me, bear());
    const theirs = inGraveyard(s1, them, bear());
    s1.step = "main2";
    s1.players[me]!.hand = []; // nothing else to do first
    s1.players[me]!.command = [];
    const acts = botActions(s1, me);
    const use = acts.find((a) => a.type === "activateAbility" && a.objectId === oozeId);
    expect(use).toMatchObject({ targets: [{ kind: "object", id: theirs }] });
    void mine;
  });
});

describe("'you may' (CR 608.2d)", () => {
  const digger = card("Digger", "Creature — Zombie", "{3}{B}", { power: "2", toughness: "2", oracleText: "When this creature enters, you may return target creature card from your graveyard to your hand." });
  const scorpion = card("Scorpion", "Creature — Scorpion", "{3}{B}", { power: "2", toughness: "2", oracleText: "When this creature enters, you may destroy target creature with power 1 or less." });

  function enterDigger(def: CardDef) {
    const { s: s0, ap, ids, opp } = setup([def]);
    return { s: castOnly(s0, ap, ids[0]!), ap, opp, id: ids[0]! };
  }

  it("asks the controller on resolution; yes does it", () => {
    const { s: s0, ap } = enterDigger(digger);
    const dead = inGraveyard(s0, ap, bear());
    let s = passAll(s0); // the creature resolves; its trigger needs a target
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = act(s, { type: "chooseTargets", player: ap, targets: [target(dead)] });
    s = passAll(s);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    expect(waitingOn(s)).toBe(ap);
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.objects[dead]!.zone).toBe("hand");
  });

  it("no does nothing, and the ability still finishes", () => {
    const { s: s0, ap } = enterDigger(digger);
    const dead = inGraveyard(s0, ap, bear());
    let s = passAll(s0);
    s = act(s, { type: "chooseTargets", player: ap, targets: [target(dead)] });
    s = passAll(s);
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    expect(s.objects[dead]!.zone).toBe("graveyard");
    expect(s.pending).toBeNull();
    expect(s.stack).toHaveLength(0);
  });

  it("a bot forced to target its own creature declines to destroy it", () => {
    const { s: s0, ap, ids } = setup([scorpion]);
    const mine = putOnBattlefield(s0, ap, bear({ name: "Elf", power: "1", toughness: "1" }));
    let s = castOnly(s0, ap, ids[0]!);
    s = passAll(s);
    // Its only legal target is the bot's own Elf: the target must still be chosen (CR 603.3d).
    expect(s.pending).toMatchObject({ kind: "chooseTargets" });
    for (const a of botActions(s, ap)) s = act(s, a);
    s = passAll(s);
    expect(s.pending).toMatchObject({ kind: "chooseMay" });
    const answer = botActions(s, ap);
    expect(answer).toEqual([{ type: "chooseMay", player: ap, yes: false }]);
    s = act(s, answer[0]!);
    expect(s.objects[mine]!.zone).toBe("battlefield");
  });
});

describe("Treasure, Food and Clue (CR 111.10)", () => {
  const innkeeper = card("Innkeeper", "Creature — Human", "{G}", { power: "1", toughness: "1", oracleText: "When this creature enters, create a Treasure token." });
  const snack = card("Snack", "Sorcery", "{G}", { oracleText: "Create two Food tokens." });
  const sleuth = card("Sleuth", "Sorcery", "{W}", { oracleText: "Investigate." });
  const tokensNamed = (s: GameState, name: string) => s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === `${name} Token`);

  it("a Treasure taps and is sacrificed for one mana of any color", () => {
    const { s: s0, ap, ids } = setup([innkeeper]);
    let s = cast(s0, ap, ids[0]!);
    s = passAll(s);
    const [t] = tokensNamed(s, "Treasure");
    expect(t).toBeDefined();
    const o = s.objects[t!]!;
    expect(o.isToken).toBe(true);
    expect(s.cards[o.cardId]!.types).toEqual(["Artifact"]);
    expect(manaOptions(s, o)).toHaveLength(5);
    s = act(s, { type: "activateMana", player: ap, objectId: t!, mana: "U" });
    expect(s.players[ap]!.manaPool.U).toBe(1);
    expect(s.battlefield).not.toContain(t); // sacrificed; a token then ceases to exist (CR 704.5d)
  });

  it("auto-pay leaves Treasures for last", () => {
    const { s: s0, ap, ids } = setup([innkeeper]);
    let s = cast(s0, ap, ids[0]!);
    s = passAll(s);
    const [treasure] = tokensNamed(s, "Treasure");
    const shock = putInHand(s, ap, card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." }));
    const plan = planCast(s, ap, shock, [{ kind: "player", id: (ap + 1) % 4 }])!;
    expect(plan.some((a) => a.type === "activateMana" && a.objectId === treasure)).toBe(false);
  });

  it("Food and Clue sacrifice themselves for life and a card", () => {
    const { s: s0, ap, ids } = setup([snack, sleuth]);
    let s = cast(s0, ap, ids[0]!);
    s = cast(s, ap, ids[1]!);
    const foods = tokensNamed(s, "Food");
    const [clue] = tokensNamed(s, "Clue");
    expect(foods).toHaveLength(2);
    expect(clue).toBeDefined();
    const life = s.players[ap]!.life;
    s = activate(s, ap, foods[0]!, 0);
    expect(s.players[ap]!.life).toBe(life + 3);
    expect(s.battlefield).not.toContain(foods[0]);
    const hand = s.players[ap]!.hand.length;
    s = activate(s, ap, clue!, 0);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.battlefield).not.toContain(clue);
  });

  it("Lotus Petal style cards work as sacrifice mana sources", () => {
    const petal = card("Petal", "Artifact", "{0}", { oracleText: "{T}, Sacrifice this artifact: Add one mana of any color." });
    expect(isFullySupported(petal)).toBe(true);
  });
});

function putInHand(s: GameState, pid: PlayerId, def: CardDef) {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
}

describe("'its controller' of a countered spell (CR 608.2h)", () => {
  it("uses who controlled the spell, even though it's in the graveyard by then", () => {
    const strike = card("Strike", "Instant", "{1}{U}{U}", { oracleText: "Counter target spell. Its controller mills two cards." });
    const { s: s0, ap, ids, opp } = setup([bear(), strike]);
    // The opponent gets a copy to respond with.
    const theirs = putInHand(s0, opp, strike);
    for (const l of ["Island", "Island", "Island", "Island", "Island"]) putOnBattlefield(s0, opp, card(l, "Basic Land — Island"));
    let s = castOnly(s0, ap, ids[0]!); // a bear
    const bearItem = s.stack[0]!.id;
    while (waitingOn(s) !== opp) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const lib = s.players[ap]!.library.length;
    const theirLib = s.players[opp]!.library.length;
    s = castOnly(s, opp, theirs, [{ kind: "stack", id: bearItem }]);
    s = passAll(s);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.players[ap]!.library.length).toBe(lib - 2);
    expect(s.players[opp]!.library.length).toBe(theirLib);
  });
});
