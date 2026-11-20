// Lane B round B275: Tawnos's Coffin ("{3}, {T}: Exile target creature and all Auras attached to it. Note the number and
// kind of counters that were on that creature. When this artifact leaves the battlefield or becomes untapped, return that
// exiled card to the battlefield under its owner's control tapped with the noted number and kind of counters on it. If you
// do, return the other exiled cards to the battlefield under their owner's control attached to that permanent."; CR 603.7c,
// 400.7, 614.1c, 303.4f; rulings) and Takklemaggot ("When enchanted creature dies, that creature's controller chooses a
// creature that this card could enchant. ..."; CR 603.10a, 608.2h, 303.4f, 613.1d, 613.1f, 614.12; rulings).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { botActions } from "../src/bot";
import { applyAction, characteristics, invalidateCharacteristics, isFullySupported, moveObject, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";
import { enchantOf } from "../src/cards";
import { compileCard } from "../src/oracle/compile";
import { harmfulTargets } from "../src/effects/heuristics";

// Real card data (Scryfall).
const coffin = (): CardDef => ({"oracleId":"05f20087-416f-4928-a0ab-6d0d2ca2ad05","name":"Tawnos's Coffin","manaCost":"{4}","cmc":4,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"You may choose not to untap this artifact during your untap step.\n{3}, {T}: Exile target creature and all Auras attached to it. Note the number and kind of counters that were on that creature. When this artifact leaves the battlefield or becomes untapped, return that exiled card to the battlefield under its owner's control tapped with the noted number and kind of counters on it. If you do, return the other exiled cards to the battlefield under their owner's control attached to that permanent.","colors":[],"colorIdentity":[],"keywords":[],"layout":"normal"}) as CardDef;
const takklemaggot = (): CardDef => ({"oracleId":"31d01633-86f8-4a3f-9c28-f6968e056ba3","name":"Takklemaggot","manaCost":"{2}{B}{B}","cmc":4,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nAt the beginning of the upkeep of enchanted creature's controller, put a -0/-1 counter on that creature.\nWhen enchanted creature dies, that creature's controller chooses a creature that this card could enchant. If the player does, return this card to the battlefield under your control attached to that creature. If they don't, return this card to the battlefield under your control as a non-Aura enchantment. It loses \"enchant creature\" and gains \"At the beginning of that player's upkeep, this enchantment deals 1 damage to that player.\"","colors":["B"],"colorIdentity":["B"],"keywords":["Enchant"],"layout":"normal"}) as CardDef;
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"layout":"normal"}) as CardDef;
const pacifism = (): CardDef => ({"oracleId":"5f5e0b10-c8cf-450c-bfd3-bcb0528ec330","name":"Pacifism","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't attack or block.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"layout":"normal"}) as CardDef;
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const whiteKnight = (): CardDef => ({"oracleId":"ddb021df-ae4a-4ac1-8353-d0b375761714","name":"White Knight","manaCost":"{W}{W}","cmc":2,"typeLine":"Creature — Human Knight","supertypes":[],"types":["Creature"],"subtypes":["Human","Knight"],"oracleText":"First strike (This creature deals combat damage before creatures without first strike.)\nProtection from black (This creature can't be blocked, targeted, dealt damage, or enchanted by anything black.)","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":["First strike","Protection"],"layout":"normal"}) as CardDef;
const mutavault = (): CardDef => ({"oracleId":"6b3cc59a-7ea5-4eb5-9bf9-5a9c07f80e2b","name":"Mutavault","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{1}: This land becomes a 2/2 creature with all creature types until end of turn. It's still a land.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"layout":"normal"}) as CardDef;
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const shatter = (): CardDef => ({"oracleId":"84d32e68-72b9-432d-a023-7bc6a26b8ad0","name":"Shatter","manaCost":"{1}{R}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target artifact.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const llanowarElves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"layout":"normal"}) as CardDef;

const supported = (...ds: CardDef[]) => ds.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 400 && !s.over && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const logged = (s: GameState, re: RegExp) => s.log.some((l) => re.test(l.text));
const nth = (s: GameState, ap: PlayerId, n: number) => s.turnOrder[(s.turnOrder.indexOf(ap) + n) % 4]!;
/** Only the cards the test put in `pid`'s hand stay there; the drawn ones go back on top of the library. */
const onlyHand = (s: GameState, pid: PlayerId, keep: string[]) => {
  for (const id of s.players[pid]!.hand.filter((h) => !keep.includes(h))) {
    s.players[pid]!.hand.splice(s.players[pid]!.hand.indexOf(id), 1);
    s.objects[id]!.zone = "library";
    s.players[pid]!.library.unshift(id);
  }
};
/** Every creature the setup's players start with (their commanders are in the command zone; none on the battlefield). */
const attach = (s: GameState, aura: string, to: string) => {
  s.objects[aura]!.attachedTo = to;
  invalidateCharacteristics(s);
};

describe("Tawnos's Coffin", () => {
  it("is supported", () => supported(coffin(), takklemaggot()));

  /** Your Coffin; the next player's Grizzly Bears with two +1/+1 counters and a charge counter, and your Pacifism on it. */
  const board = () => {
    const { s, ap, opp, ids } = setup([shock()]);
    onlyHand(s, ap, ids);
    const box = putOnBattlefield(s, ap, coffin());
    const bears = putOnBattlefield(s, opp, grizzlyBears());
    s.objects[bears]!.counters = { "+1/+1": 2, charge: 1 };
    const pac = putOnBattlefield(s, ap, pacifism());
    attach(s, pac, bears);
    return { s, ap, opp, box, bears, pac, shock: ids[0]! };
  };
  const activate = (s: GameState, pid: PlayerId, box: string, t: string) => run(s, planActivate(s, pid, box, 0, [target(t)]));

  it("exiles the creature and its Auras, and returns them when ~ untaps: tapped, with the noted counters, the Aura attached", () => {
    let { s, ap, opp, box, bears, pac } = board();
    s = settle(activate(s, ap, box, bears));
    expect(zone(s, bears)).toBe("exile");
    expect(zone(s, pac)).toBe("exile");
    expect(s.objects[box]!.tapped).toBe(true);
    // Not before ~ untaps: the opponents' turns go by.
    s = settle(passUntil(s, "upkeep", nth(s, ap, 3)));
    expect(zone(s, bears)).toBe("exile");
    // Your untap step: passUntil untaps everything (nothing kept tapped), so the trigger goes on the stack in your upkeep.
    s = settle(passUntil(s, "upkeep", ap));
    expect(zone(s, bears)).toBe("battlefield");
    const b = s.objects[bears]!;
    expect(b.controller).toBe(opp);
    expect(b.tapped).toBe(true);
    expect(b.counters).toMatchObject({ "+1/+1": 2, charge: 1 });
    expect(zone(s, pac)).toBe("battlefield");
    expect(s.objects[pac]!.attachedTo).toBe(bears);
    expect(s.objects[pac]!.controller).toBe(ap);
    expect(logged(s, /returns Grizzly Bears to the battlefield tapped with 2 \+1\/\+1 counters, 1 charge counter/)).toBe(true);
  });

  it("returns them when ~ leaves the battlefield, whatever zone it goes to", () => {
    let { s, ap, box, bears, pac } = board();
    s = settle(activate(s, ap, box, bears));
    moveObject(s, box, "hand");
    s = settle(s);
    expect(zone(s, bears)).toBe("battlefield");
    expect(s.objects[bears]!.tapped).toBe(true);
    expect(s.objects[pac]!.attachedTo).toBe(bears);
  });

  it("triggers only once: once it has returned the card, ~ leaving does nothing more", () => {
    let { s, ap, box, bears } = board();
    s = settle(activate(s, ap, box, bears));
    expect(s.delayed?.filter((d) => d.subject.id === box).length).toBe(1);
    s = settle(passUntil(s, "upkeep", ap));
    expect(zone(s, bears)).toBe("battlefield");
    expect(s.delayed?.some((d) => d.subject.id === box)).toBeFalsy();
    moveObject(s, box, "graveyard");
    s = settle(s);
    expect(s.stack.length).toBe(0);
    expect(s.objects[bears]!.zoneChanges).toBe(2);
  });

  it("if ~ leaves before its ability resolves, the creature stays exiled forever (rulings)", () => {
    let { s, ap, box, bears, pac } = board();
    s = activate(s, ap, box, bears);
    // In response, ~ leaves the battlefield.
    moveObject(s, box, "graveyard");
    invalidateCharacteristics(s);
    s = settle(s);
    expect(zone(s, bears)).toBe("exile");
    expect(zone(s, pac)).toBe("exile");
    expect(s.delayed?.some((d) => d.body.effects.some((e) => e.type === "coffinReturn"))).toBeFalsy();
  });

  it("a token ceases to exist, and the Auras attached to it stay exiled (rulings)", () => {
    let { s, ap, opp, box, pac } = board();
    const tok = putOnBattlefield(s, opp, { ...grizzlyBears(), oracleId: "b275-token", name: "Bear" } as CardDef);
    s.objects[tok]!.isToken = true;
    attach(s, pac, tok);
    s = settle(activate(s, ap, box, tok));
    expect(s.objects[tok]).toBeUndefined();
    expect(zone(s, pac)).toBe("exile");
    moveObject(s, box, "graveyard");
    s = settle(s);
    expect(zone(s, pac)).toBe("exile");
  });

  it("an Aura that can't enchant what comes back stays exiled: an animated Mutavault returns as a land (rulings)", () => {
    let { s, ap, opp, box, pac } = board();
    // Your own Mutavault, animated.
    const vault = putOnBattlefield(s, ap, mutavault());
    void opp;
    s = settle(run(s, planActivate(s, ap, vault, 0, [])));
    expect(characteristics(s, s.objects[vault]!).types).toContain("Creature");
    attach(s, pac, vault);
    s = settle(activate(s, ap, box, vault));
    expect(zone(s, vault)).toBe("exile");
    moveObject(s, box, "graveyard");
    s = settle(s);
    expect(zone(s, vault)).toBe("battlefield");
    expect(characteristics(s, s.objects[vault]!).types).not.toContain("Creature");
    expect(zone(s, pac)).toBe("exile");
    expect(logged(s, /Pacifism can't be attached to Mutavault, so it stays in exile/)).toBe(true);
  });

  it("a card that left exile in the meantime doesn't come back, and neither do the Auras", () => {
    let { s, ap, opp, box, bears, pac } = board();
    s = settle(activate(s, ap, box, bears));
    moveObject(s, bears, "graveyard");
    void opp;
    moveObject(s, box, "graveyard");
    s = settle(s);
    expect(zone(s, bears)).toBe("graveyard");
    expect(zone(s, pac)).toBe("exile");
  });

  it("a bot keeps ~ tapped while it holds an opponent's card", () => {
    let { s, ap, box, bears } = board();
    s = settle(activate(s, ap, box, bears));
    // To your untap step, where you're asked which permanents to keep tapped.
    for (let i = 0; i < 3000 && !(s.pending?.kind === "pickPermanents" && s.pending.action === "keepTapped" && s.pending.player === ap); i++) {
      const who = waitingOn(s)!;
      const pend = s.pending;
      if (pend?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: who, attacks: [] });
      else if (pend?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: who, blocks: [] });
      else if (pend?.kind === "discardToHandSize") s = act(s, { type: "discard", player: who, objectIds: s.players[who]!.hand.slice(0, pend.count) });
      else if (pend?.kind === "pickPermanents" && pend.action === "keepTapped") s = act(s, { type: "pickPermanents", player: who, ids: [] });
      else s = act(s, { type: "passPriority", player: who });
    }
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "keepTapped", player: ap });
    const acts = botActions(s, ap);
    expect(acts[0]).toMatchObject({ type: "pickPermanents", ids: [box] });
    for (const a of acts) s = applyAction(s, a);
    s = settle(s);
    expect(zone(s, bears)).toBe("exile");
    expect(s.objects[box]!.tapped).toBe(true);
  });

  it("bots treat it as removal: its target is one to aim at an opponent's creature", () => {
    const ab = compileCard(coffin()).activated[0]!;
    expect(ab.tap).toBe(true);
    expect(harmfulTargets(ab.body)).toEqual([true]);
  });
});

describe("Takklemaggot", () => {
  /** Your Takklemaggot on the next player's Grizzly Bears; that player also has a Hill Giant, you a Llanowar Elves. */
  const board = (extra: CardDef[] = []) => {
    const { s, ap, opp, ids } = setup([takklemaggot(), shock(), ...extra]);
    onlyHand(s, ap, ids);
    for (let i = 0; i < 2; i++) putOnBattlefield(s, ap, { ...grizzlyBears(), oracleId: `b275-swamp-${i}`, name: "Swamp", typeLine: "Basic Land — Swamp", supertypes: ["Basic"], types: ["Land"], subtypes: ["Swamp"], power: undefined, toughness: undefined, manaCost: "", oracleText: "({T}: Add {B}.)", producedMana: ["B"], colors: [] } as CardDef);
    const bears = putOnBattlefield(s, opp, grizzlyBears());
    const giant = putOnBattlefield(s, opp, hillGiant());
    const elves = putOnBattlefield(s, ap, llanowarElves());
    const takk = ids[0]!;
    const s2 = settle(run(s, planCast(s, ap, takk, [target(bears)])));
    expect(s2.objects[takk]!.attachedTo).toBe(bears);
    return { s: s2, ap, opp, takk, bears, giant, elves, shock: ids[1]!, extra: ids.slice(2) };
  };

  it("puts a -0/-1 counter on the creature at its controller's upkeep", () => {
    let { s, ap, opp, bears } = board();
    s = settle(passUntil(s, "upkeep", opp));
    expect(s.objects[bears]!.counters["-0/-1"]).toBe(1);
    void ap;
  });

  it("when the creature dies, its controller chooses another creature it could enchant; ~ returns under your control attached to it", () => {
    let { s, ap, opp, takk, bears, giant, elves, shock } = board();
    s = settle(run(s, planCast(s, ap, shock, [target(bears)])));
    expect(zone(s, bears)).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "enchant", player: opp });
    if (s.pending?.kind !== "chooseOption") throw new Error("no choice");
    expect([...s.pending.options].sort()).toEqual([giant, elves].sort());
    // They may choose their own creature: they must choose one if they can.
    s = settle(act(s, { type: "chooseOption", player: opp, choice: giant }));
    expect(zone(s, takk)).toBe("battlefield");
    expect(s.objects[takk]!.attachedTo).toBe(giant);
    expect(s.objects[takk]!.controller).toBe(ap);
  });

  it("only creatures it could legally enchant are offered: not one with protection from black, but one with shroud", () => {
    let { s, ap, opp, takk, bears, giant, elves, shock } = board();
    const knight = putOnBattlefield(s, opp, whiteKnight());
    const shrouded = putOnBattlefield(s, opp, { ...hillGiant(), oracleId: "b275-shroud", name: "Shrouded Giant", oracleText: "Shroud", keywords: ["Shroud"] } as CardDef);
    s = settle(run(s, planCast(s, ap, shock, [target(bears)])));
    if (s.pending?.kind !== "chooseOption") throw new Error("no choice");
    expect(s.pending.options).not.toContain(knight);
    expect([...s.pending.options].sort()).toEqual([giant, elves, shrouded].sort());
    void takk;
  });

  it("with only one creature to choose, it goes there without a question", () => {
    let { s, ap, takk, bears, giant, elves, shock } = board();
    moveObject(s, elves, "exile");
    invalidateCharacteristics(s);
    s = settle(run(s, planCast(s, ap, shock, [target(bears)])));
    expect(s.pending).toBeFalsy();
    expect(s.objects[takk]!.attachedTo).toBe(giant);
  });

  it("with no creature to choose, it returns as a non-Aura enchantment that deals 1 damage at that player's upkeep", () => {
    let { s, ap, opp, takk, bears, giant, elves, shock } = board();
    moveObject(s, elves, "exile");
    moveObject(s, giant, "exile");
    invalidateCharacteristics(s);
    s = settle(run(s, planCast(s, ap, shock, [target(bears)])));
    expect(s.pending).toBeFalsy();
    expect(zone(s, takk)).toBe("battlefield");
    const t = s.objects[takk]!;
    expect(t.attachedTo).toBeUndefined();
    expect(t.controller).toBe(ap);
    const c = characteristics(s, t);
    expect(c.types).toEqual(["Enchantment"]);
    expect(c.subtypes).not.toContain("Aura");
    expect(enchantOf(s, t)).toBeUndefined();
    // Still there after state-based actions: it isn't an Aura attached to nothing.
    s = settle(passUntil(s, "end", ap));
    expect(zone(s, takk)).toBe("battlefield");
    // Not at the next player's upkeep unless that's the player who couldn't choose: here it is (the creature's controller).
    const life = s.players[opp]!.life;
    const apLife = s.players[ap]!.life;
    s = settle(passUntil(s, "upkeep", opp));
    expect(s.players[opp]!.life).toBe(life - 1);
    s = settle(passUntil(s, "upkeep", nth(s, opp, 1)));
    expect(s.players[opp]!.life).toBe(life - 1);
    s = settle(passUntil(s, "upkeep", ap));
    expect(s.players[ap]!.life).toBe(apLife);
    expect(zone(s, takk)).toBe("battlefield");
  });

  it("if ~ has left the graveyard by the time the ability resolves, nothing happens (rulings)", () => {
    let { s, ap, takk, bears, shock } = board();
    s = run(s, planCast(s, ap, shock, [target(bears)]));
    // Shock resolves; the dies trigger goes on the stack and ~ goes to the graveyard as a state-based action.
    for (let i = 0; i < 20 && !s.stack.some((it) => it.kind === "ability"); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(zone(s, takk)).toBe("graveyard");
    moveObject(s, takk, "exile");
    s = settle(s);
    expect(zone(s, takk)).toBe("exile");
    expect(s.pending).toBeFalsy();
  });

  it("if the creature leaves the battlefield without dying, ~ just goes to the graveyard (rulings)", () => {
    let { s, takk, bears } = board();
    moveObject(s, bears, "hand");
    invalidateCharacteristics(s);
    // State-based actions are checked as a player would get priority.
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(zone(s, takk)).toBe("graveyard");
    expect(s.pending).toBeFalsy();
  });

  it("a bot choosing puts it on an opponent's creature", () => {
    let { s, ap, opp, takk, bears, giant, elves, shock } = board();
    s = settle(run(s, planCast(s, ap, shock, [target(bears)])));
    expect(s.pending).toMatchObject({ player: opp });
    for (const a of botActions(s, opp)) s = applyAction(s, a);
    s = settle(s);
    expect(s.objects[takk]!.attachedTo).toBe(elves);
    void giant;
  });
});
