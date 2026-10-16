// "Whenever a player activates an ability that isn't a mana ability" (Burning-Tree Shaman), "Whenever an opponent
// activates an ability of an artifact, creature, or land on the battlefield, if it isn't a mana ability" (Harsh
// Mentor): it triggers once the ability is activated (CR 602.2i), its source as it was then; mana abilities (CR 605.1a)
// don't count. "That player" is who activated it.

import { describe, expect, it } from "vitest";
import { act, card, forest, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, waitingOn, type CardDef, type GameState } from "../src";
import { addMana } from "../src/spend";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

// Real oracle text (Scryfall).
const shaman = card("Burning-Tree Shaman", "Creature — Centaur Shaman", "{1}{R}{G}", { power: "3", toughness: "4", oracleText: "Whenever a player activates an ability that isn't a mana ability, this creature deals 1 damage to that player." });
const mentor = card("Harsh Mentor", "Creature — Human Cleric", "{1}{R}", { power: "2", toughness: "2", oracleText: "Whenever an opponent activates an ability of an artifact, creature, or land on the battlefield, if it isn't a mana ability, this creature deals 2 damage to that player." });
const wizened = card("Wizened Mentor", "Creature — Human Cleric", "{2}{W}", { power: "2", toughness: "2", oracleText: "Whenever an opponent activates an ability of a permanent that isn't a mana ability, you create a 1/1 white Zombie creature token. This ability triggers only once each turn." });
const runic = card("Runic Armasaur", "Creature — Dinosaur", "{1}{G}{G}", { power: "2", toughness: "5", oracleText: "Whenever an opponent activates an ability of a creature or land that isn't a mana ability, you may draw a card." });

const pumper = card("Test Pumper", "Creature — Shade", "{B}", { power: "1", toughness: "1", oracleText: "{B}: This creature gets +1/+1 until end of turn." });
const cycler = card("Test Cycler", "Creature — Beast", "{3}{G}", { power: "3", toughness: "3", keywords: ["Cycling"], oracleText: "Cycling {2} ({2}, Discard this card: Draw a card.)" });

function pump(s: GameState, pid: number, id: string): GameState {
  addMana(s, pid, ["B"], {});
  return act(s, { type: "activateAbility", player: pid, objectId: id, index: 0 });
}
function settle(s: GameState): GameState {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}

describe("whenever a player activates an ability", () => {
  it("parse", () => supported(shaman, mentor, wizened, runic));

  it("Burning-Tree Shaman: each activation deals 1 damage to whoever activated it, its controller included; mana abilities don't", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, shaman);
    const p = putOnBattlefield(s0, ap, pumper);
    const life = s0.players[ap]!.life;
    let s = settle(pump(s0, ap, p));
    expect(s.players[ap]!.life).toBe(life - 1);
    s = settle(pump(s, ap, p));
    expect(s.players[ap]!.life).toBe(life - 2);
    // Tapping a land for mana: a mana ability.
    const f = putOnBattlefield(s, ap, forest);
    s = settle(act(s, { type: "activateMana", player: ap, objectId: f, mana: "G" }));
    expect(s.players[ap]!.life).toBe(life - 2);
  });

  it("Harsh Mentor: an opponent's permanent's ability, not its controller's and not cycling from a hand", () => {
    const { s: s0, ap, opp, ids } = setup([cycler]);
    putOnBattlefield(s0, opp, mentor);
    const p = putOnBattlefield(s0, ap, pumper);
    const life = s0.players[ap]!.life;
    let s = settle(pump(s0, ap, p));
    expect(s.players[ap]!.life).toBe(life - 2);
    addMana(s, ap, ["C", "C"], {});
    s = settle(act(s, { type: "activateAbility", player: ap, objectId: ids[0]!, index: 0 }));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(life - 2);
    // Its controller's own: no trigger.
    const own = putOnBattlefield(s, opp, pumper);
    const oppLife = s.players[opp]!.life;
    s.priority = opp;
    s = settle(pump(s, opp, own));
    expect(s.players[opp]!.life).toBe(oppLife);
  });

  it("Wizened Mentor: once each turn", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, wizened);
    const p = putOnBattlefield(s0, ap, pumper);
    const zombies = (s: GameState) => s.battlefield.filter((id) => s.objects[id]!.controller === opp && s.objects[id]!.isToken).length;
    let s = settle(pump(s0, ap, p));
    s = settle(pump(s, ap, p));
    expect(zombies(s)).toBe(1);
  });
});
