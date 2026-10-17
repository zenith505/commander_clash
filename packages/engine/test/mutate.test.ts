// Mutate (CR 702.140) and merged permanents (CR 730). "Mutate [cost]": cast it for that cost and it's a mutating
// creature spell targeting a non-Human creature with the same owner (702.140a). If the target is still legal it merges
// with it, on top or underneath, as its controller chooses (702.140c): the same permanent as before (730.2c), with the
// characteristics of its top card (730.2a) and the abilities of all of them (702.140e). If not, it enters as a creature
// (702.140b). When it leaves, all its cards go to the same zone (730.3), each its own object.

import { describe, expect, it } from "vitest";
import { act, bear, card, pt, putOnBattlefield, passAll, setup, target } from "./helpers";
import { characteristics, compileCard, isFullySupported, moveObject, objectSource, planCast, applyAction, botActions, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

// Real oracle text (Scryfall).
const gemrazer = card("Gemrazer", "Creature — Beast", "{3}{G}", { power: "4", toughness: "4", keywords: ["Reach", "Mutate", "Trample"], oracleText: "Mutate {1}{G}{G} (If you cast this spell for its mutate cost, put it over or under target non-Human creature you own. They mutate into the creature on top plus all abilities from under it.)\nReach, trample\nWhenever this creature mutates, destroy target artifact or enchantment an opponent controls." });
const shoreshark = card("Pouncing Shoreshark", "Creature — Shark Beast", "{4}{U}", { power: "4", toughness: "3", keywords: ["Mutate", "Flash"], oracleText: "Mutate {3}{U} (If you cast this spell for its mutate cost, put it over or under target non-Human creature you own. They mutate into the creature on top plus all abilities from under it.)\nFlash\nWhenever this creature mutates, you may return target creature an opponent controls to its owner's hand." });
const liger = card("Huntmaster Liger", "Creature — Cat", "{3}{W}", { power: "3", toughness: "4", keywords: ["Mutate"], oracleText: "Mutate {2}{W} (If you cast this spell for its mutate cost, put it over or under target non-Human creature you own. They mutate into the creature on top plus all abilities from under it.)\nWhenever this creature mutates, other creatures you control get +X/+X until end of turn, where X is the number of times this creature has mutated." });
const hemophage = card("Insatiable Hemophage", "Creature — Nightmare", "{3}{B}", { power: "3", toughness: "3", keywords: ["Mutate", "Deathtouch"], oracleText: "Mutate {2}{B} (If you cast this spell for its mutate cost, put it over or under target non-Human creature you own. They mutate into the creature on top plus all abilities from under it.)\nDeathtouch\nWhenever this creature mutates, each opponent loses X life and you gain X life, where X is the number of times this creature has mutated." });
const porcuparrot = card("Porcuparrot", "Creature — Bird Beast", "{3}{R}", { power: "3", toughness: "4", keywords: ["Mutate"], oracleText: "Mutate {2}{R} (If you cast this spell for its mutate cost, put it over or under target non-Human creature you own. They mutate into the creature on top plus all abilities from under it.)\n{T}: This creature deals X damage to any target, where X is the number of times this creature has mutated." });
const dreamtail = card("Dreamtail Heron", "Creature — Elemental Bird", "{4}{U}", { power: "3", toughness: "4", keywords: ["Flying", "Mutate"], oracleText: "Mutate {3}{U} (If you cast this spell for its mutate cost, put it over or under target non-Human creature you own. They mutate into the creature on top plus all abilities from under it.)\nFlying\nWhenever this creature mutates, draw a card." });
const seaDasher = card("Sea-Dasher Octopus", "Creature — Octopus", "{1}{U}{U}", { power: "2", toughness: "2", keywords: ["Mutate", "Flash"], oracleText: "Mutate {1}{U} (If you cast this spell for its mutate cost, put it over or under target non-Human creature you own. They mutate into the creature on top plus all abilities from under it.)\nFlash\nWhenever this creature deals combat damage to a player, draw a card." });
const cloudshift = card("Cloudshift", "Instant", "{W}", { oracleText: "Exile target creature you control, then return that card to the battlefield under your control." });
const pacifism = card("Pacifism", "Enchantment — Aura", "{1}{W}", { oracleText: "Enchant creature\nEnchanted creature can't attack or block." });
const human = card("Elite Vanguard", "Creature — Human Soldier", "{W}", { power: "2", toughness: "1" });

const run = (s: GameState, actions: Action[] | null) => {
  if (!actions) throw new Error("no plan");
  return actions.reduce((x, a) => act(x, a), s);
};
/** Cast `id` for its mutate cost onto `host`, and pass until it's resolving and its controller chooses top or bottom. */
const mutate = (s: GameState, pid: PlayerId, id: string, host: string) => passAll(run(s, planCast(s, pid, id, [target(host)], undefined, "auto", undefined, { alt: "mutate" })));
const choose = (s: GameState, pid: PlayerId, choice: "top" | "bottom") => act(s, { type: "chooseOption", player: pid, choice });
/** Everyone passes until the stack is empty. */
const resolveAll = (s: GameState) => {
  while (s.stack.length && !s.pending) s = passAll(s);
  return s;
};
const name = (s: GameState, id: string) => characteristics(s, s.objects[id]!).name;

describe("mutate", () => {
  it("parse: the mutate cost is an alternative cost; 'whenever this creature mutates' and 'times it has mutated'", () => {
    supported(gemrazer, shoreshark, liger, hemophage, porcuparrot, dreamtail, seaDasher);
    expect(compileCard(gemrazer).altCosts).toContainEqual(expect.objectContaining({ kind: "mutate", mana: "{1}{G}{G}" }));
    expect(compileCard(gemrazer).triggers[0]).toMatchObject({ event: "selfMutates" });
  });

  it("on top: the same permanent, now a 4/4 Gemrazer with reach and trample, and the mutate trigger", () => {
    const { s: s0, ap, opp, ids } = setup([gemrazer]);
    const b = putOnBattlefield(s0, ap, bear());
    s0.objects[b]!.counters["+1/+1"] = 1;
    const relic = putOnBattlefield(s0, opp, card("Relic", "Artifact", "{1}"));
    let s = mutate(s0, ap, ids[0]!, b);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "mutate", player: ap, options: ["top", "bottom"] });
    s = choose(s, ap, "top");
    const c = characteristics(s, s.objects[b]!);
    expect(c.name).toBe("Gemrazer");
    expect(c.keywords).toEqual(expect.arrayContaining(["Reach", "Trample"]));
    expect(pt(s, b)).toBe("5/5"); // its counter stays (CR 730.2c)
    expect(s.objects[ids[0]!]!.zone).toBe("merged");
    expect(s.battlefield).not.toContain(ids[0]!);
    // Whenever it mutates: destroy target artifact an opponent controls.
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap, description: "Gemrazer: destroy target artifact or enchantment an opponent controls." });
    s = act(s, { type: "chooseTargets", player: ap, targets: [target(relic)] });
    expect(s.stack.length).toBe(1);
    s = resolveAll(s);
    expect(s.objects[relic]!.zone).toBe("graveyard");
    // It didn't enter: no summoning sickness from merging (CR 730.2b-c).
    expect(s.objects[b]!.controlledSinceTurn).toBe(-1);
  });

  it("underneath: still a 2/2 Grizzly Bears, with Gemrazer's reach, trample and trigger", () => {
    const { s: s0, ap, ids } = setup([gemrazer]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = choose(mutate(s0, ap, ids[0]!, b), ap, "bottom");
    const c = characteristics(s, s.objects[b]!);
    expect(c.name).toBe("Grizzly Bears");
    expect(pt(s, b)).toBe("2/2");
    expect(c.keywords).toEqual(expect.arrayContaining(["Reach", "Trample"]));
    expect(s.stack.length).toBe(0); // no artifact or enchantment to destroy, so the trigger isn't put on the stack
  });

  it("if its target is gone, it resolves as a creature spell and enters (CR 702.140b)", () => {
    const { s: s0, ap, ids } = setup([gemrazer]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(b)], undefined, "auto", undefined, { alt: "mutate" }));
    moveObject(s, b, "graveyard");
    s = passAll(s);
    expect(s.pending).toBeNull();
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(name(s, ids[0]!)).toBe("Gemrazer");
  });

  it("only a non-Human creature you own", () => {
    const { s, ap, opp, ids } = setup([gemrazer]);
    const h = putOnBattlefield(s, ap, human);
    const theirs = putOnBattlefield(s, opp, bear());
    expect(planCast(s, ap, ids[0]!, [target(h)], undefined, "auto", undefined, { alt: "mutate" })).toBeNull();
    expect(planCast(s, ap, ids[0]!, [target(theirs)], undefined, "auto", undefined, { alt: "mutate" })).toBeNull();
    // One they control but you own is fine.
    s.objects[theirs]!.owner = ap;
    expect(planCast(s, ap, ids[0]!, [target(theirs)], undefined, "auto", undefined, { alt: "mutate" })).not.toBeNull();
  });

  it("each mutate counts: Huntmaster Liger, then Insatiable Hemophage on top, then Porcuparrot", () => {
    const { s: s0, ap, opp, ids } = setup([liger, hemophage, porcuparrot]);
    const b = putOnBattlefield(s0, ap, bear());
    const other = putOnBattlefield(s0, ap, bear({ name: "Other Bear" }));
    let s = resolveAll(choose(mutate(s0, ap, ids[0]!, b), ap, "top"));
    expect(pt(s, other)).toBe("3/3"); // X = 1
    const life = s.players[opp]!.life;
    s = choose(mutate(s, ap, ids[1]!, b), ap, "top");
    // Both "whenever this creature mutates" abilities trigger (CR 702.140d-e).
    expect(s.stack.length).toBe(2);
    s = resolveAll(s);
    expect(name(s, b)).toBe("Insatiable Hemophage");
    expect(s.players[opp]!.life).toBe(life - 2); // X = 2
    expect(pt(s, other)).toBe("5/5"); // +1/+1, then +2/+2
    s = resolveAll(choose(mutate(s, ap, ids[2]!, b), ap, "bottom"));
    expect(s.objects[b]!.mutations).toBe(3);
    expect(compileCard(s.cards[s.objects[b]!.copyEffects!.at(-1)!.key]!).activated.length).toBe(1); // Porcuparrot's {T} ability
  });

  it("when it dies, all its cards go to the graveyard; a token on the bottom ceases to exist", () => {
    const { s: s0, ap, ids } = setup([dreamtail]);
    const tok = putOnBattlefield(s0, ap, bear({ name: "Bear Token" }));
    s0.objects[tok]!.isToken = true;
    let s = resolveAll(choose(mutate(s0, ap, ids[0]!, tok), ap, "top")); // draw a card
    expect(s.objects[tok]!.isToken).toBe(false); // the top card isn't a token (CR 730.2d)
    moveObject(s, tok, "graveyard");
    s = act(s, { type: "passPriority", player: ap }); // state-based actions
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.players[ap]!.graveyard).toContain(ids[0]!);
    expect(s.objects[tok]).toBeUndefined();
  });

  it("returned to hand: both cards; an Aura on it goes to the graveyard", () => {
    const { s: s0, ap, opp, ids } = setup([seaDasher]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = choose(mutate(s0, ap, ids[0]!, b), ap, "bottom");
    const aura = putOnBattlefield(s, opp, pacifism);
    s.objects[aura]!.attachedTo = b;
    moveObject(s, b, "hand");
    s = act(s, { type: "passPriority", player: ap }); // state-based actions
    expect(s.players[ap]!.hand).toEqual(expect.arrayContaining([b, ids[0]!]));
    expect(s.objects[ids[0]!]!.zone).toBe("hand");
    expect(s.objects[aura]!.zone).toBe("graveyard");
  });

  it("flickered, it comes back as separate creatures (CR 730.3c)", () => {
    const { s: s0, ap, ids } = setup([gemrazer, cloudshift]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = resolveAll(choose(mutate(s0, ap, ids[0]!, b), ap, "top"));
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [target(b)], undefined, "auto")));
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(name(s, b)).toBe("Grizzly Bears");
    expect(name(s, ids[0]!)).toBe("Gemrazer");
    expect(s.objects[b]!.merged).toBeUndefined();
  });

  it("a commander in it makes it a commander; to the library, only the commander card goes to the command zone (CR 903.3c, 903.9c)", () => {
    const { s: s0, ap, ids } = setup([gemrazer]);
    s0.objects[ids[0]!]!.isCommander = true;
    const b = putOnBattlefield(s0, ap, bear());
    let s = choose(mutate(s0, ap, ids[0]!, b), ap, "bottom");
    expect(s.objects[b]!.isCommander).toBe(true);
    // Its combat damage is the commander's (CR 903.10a).
    expect(objectSource(s, s.objects[b]!).commanderId).toBe(ids[0]!);
    moveObject(s, b, "library");
    expect(s.objects[ids[0]!]!.zone).toBe("command");
    expect(s.objects[b]!.zone).toBe("library");
    expect(s.objects[b]!.isCommander).toBe(false);
  });

  it("bots put the bigger creature on top", () => {
    const { s: s0, ap, ids } = setup([gemrazer]);
    const b = putOnBattlefield(s0, ap, bear());
    const s = mutate(s0, ap, ids[0]!, b);
    expect(waitingOn(s)).toBe(ap);
    expect(botActions(s, ap)).toEqual([{ type: "chooseOption", player: ap, choice: "top" }]);
    const big = putOnBattlefield(s0, ap, bear({ name: "Huge Bear", power: "8", toughness: "8" }));
    const s2 = mutate(s0, ap, ids[0]!, big);
    expect(botActions(s2, ap)).toEqual([{ type: "chooseOption", player: ap, choice: "bottom" }]);
    expect(applyAction(s2, botActions(s2, ap)[0]!).objects[big]!.merged?.parts).toEqual([big, ids[0]!]);
  });
});
