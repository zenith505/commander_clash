// The initiative (CR 726), Undercity and venturing into it (CR 309, 701.49), goad (CR 701.15), detain (CR 701.35)
// and "until your next turn" (CR 611.2b).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { abilityProblem, botActions, characteristics, isFullySupported, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const logged = (s: GameState, re: RegExp) => s.log.some((l) => re.test(l.text));

/** Pass priority and let bots answer every choice until the stack and the trigger queue are empty. */
function settle(s: GameState, answer?: (s: GameState) => Action | undefined) {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const pid = waitingOn(s)!;
    const mine = answer?.(s);
    if (mine) s = act(s, mine);
    else if (s.pending) s = act(s, botActions(s, pid)[0]!);
    else s = act(s, { type: "passPriority", player: pid });
  }
  return s;
}
const roomOf = (s: GameState, pid: PlayerId) => s.players[pid]!.dungeon?.room;

// Real oracle text (Scryfall).
const aarakocraSneak = card("Aarakocra Sneak", "Creature — Bird Rogue", "{3}{U}", { power: "1", toughness: "4", keywords: ["Flying"], oracleText: "Flying\nWhen this creature enters, you take the initiative." });
const inactionInjunction = card("Inaction Injunction", "Sorcery", "{1}{U}", {
  keywords: ["Detain"],
  oracleText: "Detain target creature an opponent controls. (Until your next turn, that creature can't attack or block and its activated abilities can't be activated.)\nDraw a card.",
});

describe("the initiative (CR 726)", () => {
  it("taking it ventures into Undercity: its first room is Secret Entrance", () => {
    supported(aarakocraSneak);
    const { s: s0, ap, ids } = setup([aarakocraSneak]);
    const lib = s0.players[ap]!.library.length;
    const hand = s0.players[ap]!.hand.length;
    const s = settle(cast(s0, ap, ids[0]!));
    expect(s.initiative).toBe(ap);
    expect(s.players[ap]!.dungeon).toEqual({ name: "Undercity", room: 0 });
    // Secret Entrance: a basic land from the library into the hand.
    expect(s.players[ap]!.library.length).toBe(lib - 1);
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 1);
    expect(logged(s, /moves their venture marker into Secret Entrance/)).toBe(true);
  });

  it("at the beginning of its holder's upkeep they venture again, choosing where the arrows branch", () => {
    const { s: s0, ap, ids } = setup([aarakocraSneak]);
    let s = settle(cast(s0, ap, ids[0]!));
    s = passUntil(s, "upkeep", ap);
    s = settle(s, (x) => (x.pending?.kind === "chooseOption" && x.pending.what === "venture" ? { type: "chooseOption", player: ap, choice: "Lost Well" } : undefined));
    expect(roomOf(s, ap)).toBe(2); // Lost Well
    expect(logged(s, /moves their venture marker into Lost Well/)).toBe(true);
  });

  it("combat damage to the player with the initiative gives it to the attacker's controller, who ventures", () => {
    const { s: s0, ap, opp } = setup([]);
    s0.initiative = opp;
    s0.cards["initiative"] = { oracleId: "initiative", name: "The initiative", manaCost: "", cmc: 0, typeLine: "", supertypes: [], types: [], subtypes: [], oracleText: "", colors: [], colorIdentity: [], keywords: [] };
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, ap, bear({ name: "Second Bear" }));
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }, { attacker: b, defender: opp }] });
    s = passUntil(s, "combatDamage", ap);
    s = settle(s);
    expect(s.initiative).toBe(ap);
    // One trigger for both creatures (CR 726.2: "one or more creatures"), so one venture.
    expect(s.log.filter((l) => /^\w+ takes the initiative\.$/.test(l.text)).length).toBe(1);
    expect(roomOf(s, ap)).toBe(0);
  });

  it("a room ability with a target: Trap! makes the chosen player lose 5 life", () => {
    const { s: s0, ap, opp } = setup([]);
    s0.players[ap]!.dungeon = { name: "Undercity", room: 1 }; // Forge
    s0.initiative = ap;
    const life = s0.players[opp]!.life;
    let s = passUntil(s0, "upkeep", ap);
    s = settle(s, (x) =>
      x.pending?.kind === "chooseOption" && x.pending.what === "venture"
        ? { type: "chooseOption", player: ap, choice: "Trap!" }
        : x.pending?.kind === "chooseTargets"
          ? { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }
          : undefined,
    );
    expect(roomOf(s, ap)).toBe(3);
    expect(s.players[opp]!.life).toBe(life - 5);
  });

  it("the last room, Throne of the Dead Three, and then the dungeon is completed (CR 704.5t)", () => {
    const { s: s0, ap } = setup([]);
    const p = s0.players[ap]!;
    // A creature card among the top ten.
    const giant = putOnBattlefield(s0, ap, card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" }));
    s0.battlefield.splice(s0.battlefield.indexOf(giant), 1);
    s0.objects[giant]!.zone = "library";
    p.library = [...p.library.filter((x) => s0.cards[s0.objects[x]!.cardId]!.types.includes("Land")).slice(0, 5), giant, ...p.library.filter((x) => !s0.cards[s0.objects[x]!.cardId]!.types.includes("Creature"))];
    p.dungeon = { name: "Undercity", room: 6 }; // Archives
    s0.initiative = ap;
    let s = passUntil(s0, "upkeep", ap);
    // It's the next turn of this player: upkeep ventures into Throne of the Dead Three.
    s = settle(s);
    expect(s.objects[giant]!.zone).toBe("battlefield");
    expect(s.objects[giant]!.counters["+1/+1"]).toBe(3);
    expect(characteristics(s, s.objects[giant]!).keywords).toContain("Hexproof");
    expect(s.players[ap]!.dungeon).toBeUndefined();
    expect(s.players[ap]!.completedDungeons).toEqual(["Undercity"]);
  });

  it("if the player who has it leaves the game, the active player takes it (CR 726.4)", () => {
    const { s: s0, ap, opp } = setup([]);
    s0.initiative = opp;
    s0.players[opp]!.life = 0;
    let s = act(s0, { type: "passPriority", player: waitingOn(s0)! });
    s = settle(s);
    expect(s.players[opp]!.lost).toBe(true);
    expect(s.initiative).toBe(ap);
  });
});

describe("goad (CR 701.15) and until your next turn (CR 611.2b)", () => {
  it("a goaded creature attacks a player other than the goader if able, until the goader's next turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const theirs = putOnBattlefield(s0, opp, bear());
    s0.effects.push({ id: "g", timestamp: s0.nextTimestamp++, controller: ap, sourceName: "Arena", duration: "yourNextTurn", turnOf: ap, affected: [theirs], mods: [{ kind: "goad" }] });
    let s = passUntil(s0, "declareAttackers", opp);
    // It must attack, and not the goader.
    expect(() => act(s, { type: "declareAttackers", player: opp, attacks: [] })).toThrow(/attacks each combat if able/);
    expect(() => act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: theirs, defender: ap }] })).toThrow(/goaded/);
    const other = s.turnOrder.find((x) => x !== ap && x !== opp)!;
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: theirs, defender: other }] });
    // A bot does the same.
    expect(botActions(passUntil(s0, "declareAttackers", opp), opp)[0]).toMatchObject({ attacks: [{ attacker: theirs }] });
    expect((botActions(passUntil(s0, "declareAttackers", opp), opp)[0] as { attacks: { defender: number }[] }).attacks[0]!.defender).not.toBe(ap);
    // It ends as the goader's next turn begins.
    s = passUntil(s, "upkeep", ap);
    expect(s.effects.some((e) => e.id === "g")).toBe(false);
    expect(characteristics(s, s.objects[theirs]!).goadedBy).toEqual([]);
  });

  it("detain: can't attack or block, and its activated abilities can't be activated, until your next turn", () => {
    supported(inactionInjunction);
    const { s: s0, ap, ids, opp } = setup([inactionInjunction]);
    const elf = putOnBattlefield(s0, opp, card("Prodigal Pyromancer", "Creature — Human Wizard", "{2}{R}", { power: "1", toughness: "1", oracleText: "{T}: This creature deals 1 damage to any target." }));
    let s = settle(cast(s0, ap, ids[0]!, [target(elf)]));
    const c = characteristics(s, s.objects[elf]!);
    expect(c.cantAttack && c.cantBlock).toBe(true);
    expect(abilityProblem(s, opp, elf, 0)).toMatch(/can't be activated/);
    s = passUntil(s, "upkeep", ap);
    expect(characteristics(s, s.objects[elf]!).cantAttack).toBe(false);
  });
});
