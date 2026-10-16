// What a cast trigger sees of the spell (CR 601.2i): its mana value on the stack counts the X chosen for it (CR 202.3e), and
// a "*" power comes from its characteristic-defining ability, which works on the stack (CR 604.3). "That spell's mana
// value" in the trigger is the spell's as it was cast (Monstrous Vortex).

import { describe, expect, it } from "vitest";
import { act, card, forest, passAll, putOnBattlefield, setup } from "./helpers";
import { castProblem, compileCard, isFullySupported, planCast, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const spinner = card("Etherium Spinner", "Artifact Creature — Human Wizard", "{2}{U}", { power: "2", toughness: "1", oracleText: "Whenever you cast a spell with mana value 4 or greater, create a 1/1 colorless Thopter artifact creature token with flying." });
const vortex = card("Monstrous Vortex", "Enchantment", "{3}{G}", { keywords: ["Discover"], oracleText: "Whenever you cast a creature spell with power 5 or greater, discover X, where X is that spell's mana value. (Exile cards from the top of your library until you exile a nonland card with that mana value or less. Cast it without paying its mana cost or put it into your hand. Put the rest on the bottom in a random order.)" });
const endless = card("Endless One", "Creature — Eldrazi", "{X}", { power: "0", toughness: "0", oracleText: "This creature enters with X +1/+1 counters on it." });
const maro = card("Maro", "Creature — Elemental", "{2}{G}{G}", { power: "*", toughness: "*", oracleText: "Maro's power and toughness are each equal to the number of cards in your hand." });
const dreadmaw = card("Colossal Dreadmaw", "Creature — Dinosaur", "{4}{G}{G}", { power: "6", toughness: "6", keywords: ["Trample"], oracleText: "Trample" });
const mv = (n: number) => card(`Spell ${n}`, "Sorcery", `{${n}}`, { oracleText: "Draw a card." });

const tokens = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid).length;
const castX = (s: GameState, pid: PlayerId, id: string, x?: number) => {
  const plan = planCast(s, pid, id, undefined, undefined, undefined, x);
  if (!plan) throw new Error(`${castProblem(s, pid, id, undefined, undefined, undefined, undefined, x)} (${s.step})`);
  for (const a of plan) s = act(s, a);
  return s;
};
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

describe("cast triggers and the spell's values on the stack", () => {
  it("compiles them", () => {
    for (const d of [spinner, vortex, endless, maro]) expect(isFullySupported(d), d.name).toBe(true);
    expect(compileCard(vortex).triggers[0]).toMatchObject({ cast: { spell: { types: ["Creature"], power: { min: 5 } } }, body: { effects: [{ type: "discover", n: { count: { kind: "manaValue", of: { ref: "castSpell" } } } }] } });
  });

  it("a spell with X: its mana value counts the X chosen (Etherium Spinner, Endless One)", () => {
    let { s, ap, ids } = setup([endless, endless]);
    putOnBattlefield(s, ap, spinner);
    s = passAll(castX(s, ap, ids[0]!, 3));
    expect(tokens(s, ap)).toBe(0);
    s = passAll(castX(s, ap, ids[1]!, 4));
    expect(tokens(s, ap)).toBe(1);
  });

  it("Monstrous Vortex: power 5 or greater, a \"*\" power from its ability on the stack; discover that spell's mana value", () => {
    let { s, ap, ids } = setup([dreadmaw, maro, maro, mv(1), mv(1), mv(1), mv(1)]);
    // Only these cards in hand.
    s.players[ap]!.hand = [...ids];
    putOnBattlefield(s, ap, vortex);
    for (let i = 0; i < 14; i++) putOnBattlefield(s, ap, forest);
    const [five] = onTop(s, ap, [mv(6)]);
    s = passAll(castX(s, ap, ids[0]!));
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: five });
    s = passAll(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    // Maro with five other cards in hand (four sorceries and the six-drop discovered): 5/5 on the stack, so it triggers.
    expect(s.players[ap]!.hand.length).toBe(7);
    const [four] = onTop(s, ap, [mv(4)]);
    s = passAll(castX(s, ap, ids[1]!));
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: four });
    s = passAll(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.objects[ids[1]!]!.zone).toBe("battlefield");
    // Four cards in hand besides the other Maro: a 4/4 spell, no trigger.
    s.players[ap]!.hand = [ids[2]!, ids[3]!, ids[4]!, ids[5]!, ids[6]!];
    const [top] = onTop(s, ap, [mv(2)]);
    s = passAll(castX(s, ap, ids[2]!));
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.library[0]).toBe(top);
  });
});
