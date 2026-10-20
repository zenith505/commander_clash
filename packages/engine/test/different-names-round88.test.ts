// "With different names" left out of round 87: "basic land cards and/or Town cards" (Reach the Horizon), "that each have
// mana value X" (Uncage the Menagerie, CR 202.3e), "any number of permanent cards with different names from your graveyard"
// (Eerie Ultimatum) and targets with different names (Behold the Sinister Six!, CR 601.2c).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passAll, putOnBattlefield, setup, swamp, target } from "./helpers";
import { botActions, castProblem, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
function settle(s: GameState) {
  for (let i = 0; i < 60 && (s.stack.length || s.resolving || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}
const inZone = (s: GameState, pid: PlayerId, def: CardDef, zone: "library" | "graveyard") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]!.graveyard.push(id);
  return id;
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return settle(passAll(s));
};

// Real oracle text (Scryfall).
const reach = card("Reach the Horizon", "Sorcery", "{3}{G}", { oracleText: "Search your library for up to two basic land cards and/or Town cards with different names, put them onto the battlefield tapped, then shuffle." });
const uncage = card("Uncage the Menagerie", "Sorcery", "{X}{G}{G}", { oracleText: "Search your library for up to X creature cards with different names that each have mana value X, reveal them, put them into your hand, then shuffle." });
const eerie = card("Eerie Ultimatum", "Sorcery", "{W}{W}{B}{B}{B}{G}{G}", { oracleText: "Return any number of permanent cards with different names from your graveyard to the battlefield." });
const behold = card("Behold the Sinister Six!", "Sorcery", "{6}{B}", { oracleText: "Return up to six target creature cards with different names from your graveyard to the battlefield." });
const valueTown = card("Value Town", "Land — Town", "", { oracleText: "Value Town enters the battlefield tapped.\n{T}: Add {U} or {R}." });
const island = card("Island", "Basic Land — Island");
const commandTower = card("Command Tower", "Land", "", { oracleText: "{T}: Add one mana of any color in your commander's color identity." });
const hillGiant = card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" });
const runeclaw = card("Runeclaw Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" });
const sol = card("Sol Ring", "Artifact", "{1}", { oracleText: "{T}: Add {C}{C}." });
const bolt = card("Lightning Bolt", "Instant", "{R}", { oracleText: "Lightning Bolt deals 3 damage to any target." });

describe("cards with different names (round 88)", () => {
  it("compile", () => supported(reach, uncage, eerie, behold));

  it("Reach the Horizon: a basic land and a Town, of different names, onto the battlefield tapped", () => {
    const { s: s0, ap, ids } = setup([reach]);
    const town = inZone(s0, ap, valueTown, "library");
    const tower = inZone(s0, ap, commandTower, "library");
    const isl = inZone(s0, ap, island, "library");
    let s = settle(cast(s0, ap, ids[0]!));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 2 });
    if (s.pending?.kind !== "searchLibrary") throw new Error();
    expect(s.pending.cards).toContain(town);
    expect(s.pending.cards).toContain(isl);
    expect(s.pending.cards).not.toContain(tower);
    // The library's Forests are one name: one of them is offered.
    const forests = s.pending.cards.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Forest");
    expect(forests).toHaveLength(1);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [town, isl] }));
    for (const id of [town, isl]) {
      expect(s.objects[id]!.zone).toBe("battlefield");
      expect(s.objects[id]!.tapped).toBe(true);
    }
  });

  it("Uncage the Menagerie: creature cards whose mana value is exactly X, one of each name", () => {
    const { s: s0, ap, ids } = setup([uncage]);
    const rb = inZone(s0, ap, runeclaw, "library");
    const hg = inZone(s0, ap, hillGiant, "library");
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 2));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 2 });
    if (s.pending?.kind !== "searchLibrary") throw new Error();
    expect(s.pending.cards).toContain(rb);
    expect(s.pending.cards).not.toContain(hg);
    // Runeclaw Bear and one Grizzly Bears (the library's other 2-drops are all Grizzly Bears).
    expect(s.pending.cards).toHaveLength(2);
    const both = s.pending.cards;
    s = settle(act(s, { type: "searchLibrary", player: ap, found: both }));
    for (const id of both) expect(s.objects[id]!.zone).toBe("hand");
  });

  it("Eerie Ultimatum: any number of permanent cards, one of each name, from your graveyard", () => {
    const { s: s0, ap, ids } = setup([eerie]);
    putOnBattlefield(s0, ap, swamp);
    const g1 = inZone(s0, ap, hillGiant, "graveyard");
    const g2 = inZone(s0, ap, hillGiant, "graveyard");
    const ring = inZone(s0, ap, sol, "graveyard");
    const b = inZone(s0, ap, bolt, "graveyard");
    let s = settle(cast(s0, ap, ids[0]!));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, what: "any number of permanent cards with different names", min: 0 });
    if (s.pending?.kind !== "searchLibrary") throw new Error();
    expect(s.pending.cards).toContain(ring);
    expect(s.pending.cards).not.toContain(b);
    expect(s.pending.cards.filter((id) => id === g1 || id === g2)).toHaveLength(1);
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [g1, g2] })).toThrow();
    s = settle(act(s, { type: "searchLibrary", player: ap, found: s.pending.cards }));
    expect(s.objects[ring]!.zone).toBe("battlefield");
    expect([g1, g2].filter((id) => s.objects[id]!.zone === "battlefield")).toHaveLength(1);
    expect(s.objects[b]!.zone).toBe("graveyard");
  });

  it("Behold the Sinister Six!: no two targets with the same name", () => {
    const { s: s0, ap, ids } = setup([behold]);
    const g1 = inZone(s0, ap, hillGiant, "graveyard");
    const g2 = inZone(s0, ap, hillGiant, "graveyard");
    const rb = inZone(s0, ap, runeclaw, "graveyard");
    const none = { kind: "none" } as const;
    expect(castProblem(s0, ap, ids[0]!, [target(g1), target(g2), none, none, none, none])).toMatch(/illegal target/);
    const s = run(s0, planCast(s0, ap, ids[0]!, [target(g1), target(rb), none, none, none, none]));
    expect([s.objects[g1]!.zone, s.objects[rb]!.zone, s.objects[g2]!.zone]).toEqual(["battlefield", "battlefield", "graveyard"]);
  });

  it("Behold the Sinister Six!: a bot targets one card of each name", () => {
    const { s: s0, ap, ids } = setup([behold]);
    inZone(s0, ap, hillGiant, "graveyard");
    inZone(s0, ap, hillGiant, "graveyard");
    inZone(s0, ap, runeclaw, "graveyard");
    inZone(s0, ap, bear(), "graveyard");
    s0.players[ap]!.isBot = true;
    let s = s0;
    let c: Action | undefined;
    // The bot plays a land and casts what else it has first; everyone else passes.
    for (let i = 0; i < 60 && !c; i++) {
      const pid = waitingOn(s)!;
      const a = botActions(s, pid)[0]!;
      if (a.type === "castSpell" && a.objectId === ids[0]) c = a;
      else s = act(s, a);
    }
    expect(c).toBeDefined();
    const ts = (c as Extract<Action, { type: "castSpell" }>).targets!.filter((t) => t.kind === "object");
    const names = ts.map((t) => (t.kind === "object" ? s.cards[s.objects[t.id]!.cardId]!.name : ""));
    expect(new Set(names).size).toBe(names.length);
    expect(names.length).toBe(3);
  });
});
