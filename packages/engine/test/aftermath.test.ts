// Aftermath (CR 702.127a): the second half of the split card is cast only from a graveyard, then exiled.

import { describe, expect, it } from "vitest";
import { act, bear, card, island, putOnBattlefield, scry, setup, target } from "./helpers";
import { botActions, castProblem, defOf, graveyardWays, isFullySupported, planCast, waitingOn, type Action, type GameState } from "../src";

// Real oracle text (Scryfall).
const claimFame = scry(
  "split",
  [
    { name: "Claim", mana_cost: "{B}", type_line: "Sorcery", oracle_text: "Return target creature card with mana value 2 or less from your graveyard to the battlefield." },
    { name: "Fame", mana_cost: "{1}{R}", type_line: "Sorcery", oracle_text: "Aftermath (Cast this spell only from your graveyard. Then exile it.)\nTarget creature gets +2/+0 and gains haste until end of turn." },
  ],
  { keywords: ["Aftermath"] },
);
const farmMarket = scry(
  "split",
  [
    { name: "Farm", mana_cost: "{2}{W}", type_line: "Instant", oracle_text: "Destroy target attacking or blocking creature." },
    { name: "Market", mana_cost: "{2}{U}", type_line: "Sorcery", oracle_text: "Aftermath (Cast this spell only from your graveyard. Then exile it.)\nDraw two cards, then discard two cards." },
  ],
  { keywords: ["Aftermath"] },
);
const spring = scry(
  "split",
  [
    { name: "Spring", mana_cost: "{2}{G}", type_line: "Sorcery", oracle_text: "Search your library for a basic land card, put it onto the battlefield tapped, then shuffle." },
    { name: "Mind", mana_cost: "{4}{U}{U}", type_line: "Instant", oracle_text: "Aftermath (Cast this spell only from your graveyard. Then exile it.)\nDraw two cards." },
  ],
  { keywords: ["Aftermath"] },
);

const counterspell = card("Counterspell", "Instant", "{U}{U}", { oracleText: "Counter target spell." });

const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};
const toGraveyard = (s: GameState, id: string) => {
  const o = s.objects[id]!;
  const p = s.players[o.owner]!;
  p.hand.splice(p.hand.indexOf(id), 1);
  p.graveyard.push(id);
  o.zone = "graveyard";
};

describe("aftermath (CR 702.127a)", () => {
  it("compiles, with the aftermath half's way to be cast from a graveyard", () => {
    for (const d of [claimFame, farmMarket, spring]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Claim from hand, then Fame from the graveyard; Fame is exiled, and can't be cast from hand", () => {
    const { s: s0, ap, ids } = setup([claimFame, bear()]);
    const [cf, bearId] = [ids[0]!, ids[1]!];
    toGraveyard(s0, bearId);
    // From hand, only Claim: the aftermath half can't be cast from any zone but a graveyard.
    expect(castProblem(s0, ap, cf, [target(bearId)], undefined, undefined, undefined, undefined, { face: 1 })).toMatch(/only from a graveyard/);
    let s = settle(run(s0, planCast(s0, ap, cf, [target(bearId)], undefined, "auto", undefined, { face: 0 })));
    expect(s.objects[bearId]!.zone).toBe("battlefield");
    expect(s.objects[cf]!.zone).toBe("graveyard");
    // Claim can't be cast from the graveyard; Fame can, with aftermath.
    expect(graveyardWays(s, s.objects[cf]!)).toEqual([expect.objectContaining({ kind: "aftermath", face: 1 })]);
    expect(castProblem(s, ap, cf, [target(bearId)], undefined, undefined, undefined, undefined, { face: 0 })).not.toBeNull();
    s = run(s, planCast(s, ap, cf, [target(bearId)], undefined, "auto", undefined, { face: 1, via: "aftermath" }));
    expect(defOf(s, s.objects[cf]!).name).toBe("Fame");
    s = settle(s);
    expect(s.objects[bearId]!.zone).toBe("battlefield");
    expect(s.objects[cf]!.zone).toBe("exile");
  });

  it("an aftermath half cast from the graveyard and countered is exiled too", () => {
    const { s: s0, ap, ids } = setup([spring, counterspell]);
    const [id, cs] = [ids[0]!, ids[1]!];
    toGraveyard(s0, id);
    for (let i = 0; i < 2; i++) putOnBattlefield(s0, ap, island);
    let s = run(s0, planCast(s0, ap, id, undefined, undefined, "auto", undefined, { face: 1, via: "aftermath" }));
    s = run(s, planCast(s, ap, cs, [{ kind: "stack", id: s.stack.find((x) => x.objectId === id)!.id }]));
    s = settle(s);
    expect(s.objects[cs]!.zone).toBe("graveyard");
    expect(s.objects[id]!.zone).toBe("exile");
  });

  it("a bot casts the aftermath half from its graveyard", () => {
    const { s: s0, ap, ids } = setup([farmMarket]);
    const id = ids[0]!;
    toGraveyard(s0, id);
    const p = s0.players[ap]!;
    for (const x of p.hand.filter((h) => h !== id)) {
      s0.objects[x]!.zone = "library";
      p.library.push(x);
    }
    p.hand = [];
    p.isBot = true;
    p.landsPlayedThisTurn = 1;
    const plan = botActions(s0, ap);
    expect(plan.find((a) => a.type === "castSpell")).toMatchObject({ objectId: id, face: 1, via: "aftermath" });
    const s = settle(plan.reduce((x, a) => act(x, a), s0));
    expect(s.objects[id]!.zone).toBe("exile");
  });
});
