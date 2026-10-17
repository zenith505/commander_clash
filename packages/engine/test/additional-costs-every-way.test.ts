// What pays a cost beyond mana is chosen as the spell is cast (CR 601.2h) or the ability activated (CR 602.2b), on
// every way of casting: a free cast as discover or cascade resolves goes through the same steps (CR 601.2), and an
// activation that names nothing for one of its costs can't skip it.

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, passAll, putOnBattlefield, setup, target } from "./helpers";
import { botActions, isFullySupported, planActivate, planCast, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const daring = card("Daring Discovery", "Sorcery", "{4}{R}", { oracleText: "Up to three target creatures can't block this turn.\nDiscover 4. (Exile cards from the top of your library until you exile a nonland card with mana value 4 or less. Cast it without paying its mana cost or put it into your hand. Put the rest on the bottom in a random order.)" });
const splinters = card("Bone Splinters", "Sorcery", "{B}", { oracleText: "As an additional cost to cast this spell, sacrifice a creature.\nDestroy target creature." });
const seer = card("Viscera Seer", "Creature — Vampire Wizard", "{B}", { power: "1", toughness: "1", oracleText: "Sacrifice a creature: Scry 1. (Look at the top card of your library. You may put that card on the bottom.)" });
const spirit = card("Stonerise Spirit", "Creature — Spirit", "{1}{W}", { power: "1", toughness: "2", keywords: ["Flying"], oracleText: "Flying\n{4}, Exile a card from your graveyard: Target creature gains flying until end of turn." });

const none = [{ kind: "none" as const }, { kind: "none" as const }, { kind: "none" as const }];
function onTop(s: GameState, pid: PlayerId, defs: CardDef[]) {
  const ids = defs.map((d) => {
    const id = putOnBattlefield(s, pid, d);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "library";
    return id;
  });
  s.players[pid]!.library.unshift(...ids);
  return ids;
}
function toGraveyard(s: GameState, pid: PlayerId, d: CardDef) {
  const id = putOnBattlefield(s, pid, d);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  return id;
}
const run = (s: GameState, plan: ReturnType<typeof planCast>) => {
  for (const a of plan ?? []) s = act(s, a);
  return s;
};

describe("additional costs on every way of casting or activating", () => {
  it("compiles them", () => {
    for (const d of [daring, splinters, seer, spirit]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("a spell discovered and cast free still has its sacrifice paid, and can't be cast without saying what", () => {
    let { s, ap, opp, ids } = setup([daring]);
    const mine = putOnBattlefield(s, ap, bear({ name: "Fodder" }));
    const theirs = putOnBattlefield(s, opp, bear({ name: "Their Bear" }));
    const [b] = onTop(s, ap, [splinters]);
    s = passAll(run(s, planCast(s, ap, ids[0]!, none)));
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: b, how: "discover" });
    expect(() => act(s, { type: "castSpell", player: ap, objectId: b!, targets: [target(theirs)] })).toThrow(/additional cost/);
    expect(() => act(s, { type: "castSpell", player: ap, objectId: b!, targets: [target(theirs)], sacrifice: [] })).toThrow(/choose a creature to sacrifice/);
    s = act(s, { type: "castSpell", player: ap, objectId: b!, targets: [target(theirs)], sacrifice: [mine] });
    expect(s.objects[mine]!.zone).toBe("graveyard");
    s = passAll(s);
    expect(s.objects[theirs]!.zone).toBe("graveyard");
  });

  it("a bot casting the discovered card free picks what to sacrifice", () => {
    let { s, ap, opp, ids } = setup([daring]);
    const fodder = putOnBattlefield(s, ap, card("Spirit", "Token Creature — Spirit", "", { power: "1", toughness: "1" }));
    s.objects[fodder]!.isToken = true;
    const theirs = putOnBattlefield(s, opp, bear({ name: "Their Bear" }));
    const [b] = onTop(s, ap, [splinters]);
    s = passAll(run(s, planCast(s, ap, ids[0]!, none)));
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: b });
    for (const a of botActions(s, ap)) s = act(s, a);
    // It casts it, sacrificing the token to do so, and destroys the opponent's creature.
    expect(s.objects[b!]!.zone).toBe("stack");
    expect(s.objects[fodder]?.zone ?? "gone").not.toBe("battlefield");
    s = passAll(s);
    expect(s.objects[theirs]!.zone).toBe("graveyard");
  });

  it("Viscera Seer: an activation that names nothing to sacrifice is refused, even with an empty choice", () => {
    let { s, ap } = setup([]);
    const id = putOnBattlefield(s, ap, seer);
    const fodder = putOnBattlefield(s, ap, bear({ name: "Fodder" }));
    expect(() => act(s, { type: "activateAbility", player: ap, objectId: id, index: 0 })).toThrow(/choose what to pay/);
    expect(() => act(s, { type: "activateAbility", player: ap, objectId: id, index: 0, costs: {} })).toThrow(/choose what to pay/);
    expect(() => act(s, { type: "activateAbility", player: ap, objectId: id, index: 0, costs: { sacrifice: [] } })).toThrow(/choose what to pay/);
    s = act(s, { type: "activateAbility", player: ap, objectId: id, index: 0, costs: { sacrifice: [fodder] } });
    expect(s.objects[fodder]!.zone).toBe("graveyard");
    expect(s.stack.length).toBe(1);
  });

  it("Stonerise Spirit: the card exiled from the graveyard must be chosen", () => {
    let { s, ap } = setup([]);
    const id = putOnBattlefield(s, ap, spirit);
    const b = putOnBattlefield(s, ap, bear());
    const g = toGraveyard(s, ap, forest);
    const plan = planActivate(s, ap, id, 0, [target(b)], undefined, undefined, undefined, { exileCards: [g] })!;
    const taps = plan.filter((a) => a.type !== "activateAbility");
    for (const a of taps) s = act(s, a);
    expect(() => act(s, { type: "activateAbility", player: ap, objectId: id, index: 0, targets: [target(b)] })).toThrow(/choose what to pay/);
    s = act(s, { type: "activateAbility", player: ap, objectId: id, index: 0, targets: [target(b)], costs: { exileCards: [g] } });
    expect(s.objects[g]!.zone).toBe("exile");
    expect(s.stack.length).toBe(1);
  });
});
