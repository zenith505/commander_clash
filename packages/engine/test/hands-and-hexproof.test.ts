// Looking at a hand (hidden information, CR 402.3), the Leylines' "begin the game with it on the battlefield" (CR
// 103.6a), "you have hexproof" (CR 702.11d) and "Enchant creature or Vehicle".

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, commander, forest, putOnBattlefield, setup } from "./helpers";
import { botActions, createGame, isFullySupported, legalTargets, spellTargetSpecs, waitingOn, type CardDef, type GameState } from "../src";

// Real oracle text (Scryfall).
const talas = card("Talas Explorer", "Creature — Human Pirate Scout", "{1}{U}", {
  power: "1",
  toughness: "1",
  keywords: ["Flying"],
  oracleText: "Flying\nWhen this creature enters, look at target opponent's hand.",
});
const sanctity = card("Leyline of Sanctity", "Enchantment", "{2}{W}{W}", {
  oracleText: "If this card is in your opening hand, you may begin the game with it on the battlefield.\nYou have hexproof. (You can't be the target of spells or abilities your opponents control.)",
});
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const meltdown = card("Aether Meltdown", "Enchantment — Aura", "{1}{U}", {
  keywords: ["Flash", "Enchant"],
  oracleText: "Flash (You may cast this spell any time you could cast an instant.)\nEnchant creature or Vehicle\nWhen this Aura enters, you get {E}{E} (two energy counters).\nEnchanted creature gets -4/-0.",
});
const vehicle = card("Smuggler's Copter", "Artifact — Vehicle", "{2}", {
  power: "3",
  toughness: "3",
  keywords: ["Flying", "Crew"],
  oracleText: "Flying\nWhenever this Vehicle attacks or blocks, you may draw a card. If you do, discard a card.\nCrew 1",
});

const settle = (s: GameState) => {
  for (let i = 0; i < 60 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("hands, Leylines and hexproof", () => {
  it("compile", () => {
    for (const d of [talas, sanctity, meltdown]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("looking at an opponent's hand is logged only for the player who looks", () => {
    const { s: s0, ap, ids, opp } = setup([talas]);
    let s = cast(s0, ap, ids[0]!);
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    const priv = s.log.filter((e) => e.to !== undefined);
    expect(priv).toHaveLength(1);
    expect(priv[0]!.to).toBe(ap);
    expect(priv[0]!.text).toContain(s.players[opp]!.name);
  });

  it("a Leyline in an opening hand can start the game on the battlefield", () => {
    const deck = (extra: CardDef[]) => [...extra, ...Array.from({ length: 99 - extra.length }, () => forest)];
    // Seven Leylines and forests: whoever has one in their opening hand is asked, in turn order from the starting player.
    let s = createGame(["A", "B", "C", "D"].map((name, i) => ({ name, commander: commander(`C${i}`), deck: deck(i === 0 ? Array.from({ length: 50 }, () => sanctity) : []) })), 3);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: 0, fromHand: true, opening: true });
    const cards = (s.pending as { cards: string[] }).cards;
    s = act(s, { type: "searchLibrary", player: 0, found: cards.slice(0, 1) });
    expect(s.objects[cards[0]!]!.zone).toBe("battlefield");
    expect(s.pending?.kind).not.toBe("searchLibrary");
    expect(s.step).not.toBe("untap"); // the first turn began
  });

  it("bots put their Leylines onto the battlefield", () => {
    const deck = (extra: CardDef[]) => [...extra, ...Array.from({ length: 99 - extra.length }, () => forest)];
    let s = createGame(["A", "B", "C", "D"].map((name, i) => ({ name, commander: commander(`C${i}`), deck: deck(Array.from({ length: 50 }, () => sanctity)), isBot: true })), 3);
    for (let i = 0; i < 4 && s.pending?.kind === "searchLibrary"; i++) for (const a of botActions(s, waitingOn(s)!)) s = act(s, a);
    expect(s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Leyline of Sanctity").length).toBeGreaterThan(0);
  });

  it("'you have hexproof': opponents can't target you, you still can", () => {
    const { s, ap, opp, ids } = setup([shock]);
    putOnBattlefield(s, opp, sanctity);
    const spec = spellTargetSpecs(s.cards[s.objects[ids[0]!]!.cardId]!)[0]!;
    const players = (pid: number) => legalTargets(s, spec, pid).filter((t) => t.kind === "player").map((t) => t.id);
    expect(players(ap)).not.toContain(opp);
    putOnBattlefield(s, ap, sanctity);
    expect(players(ap)).toContain(ap); // your own spells can target you
    expect(players(opp)).not.toContain(ap);
  });

  it("'Enchant creature or Vehicle' can enchant a Vehicle that isn't a creature", () => {
    const { s, ap, opp, ids } = setup([meltdown]);
    const v = putOnBattlefield(s, opp, vehicle);
    const b = putOnBattlefield(s, opp, bear());
    const spec = spellTargetSpecs(s.cards[s.objects[ids[0]!]!.cardId]!)[0]!;
    const ok = legalTargets(s, spec, ap).map((t) => (t.kind === "object" ? t.id : ""));
    expect(ok).toContain(v);
    expect(ok).toContain(b);
    const s2 = settle(cast(s, ap, ids[0]!, [{ kind: "object", id: v }]));
    expect(s2.objects[ids[0]!]!.attachedTo).toBe(v);
  });
});
