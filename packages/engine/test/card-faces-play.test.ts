// Playing cards with several faces: adventurer cards (CR 715), modal double-faced cards (712.3, 712.11b, 712.12) and
// split cards (709.3, 709.4). Each face has its own characteristics where it's up; anywhere else the card has its
// resting ones (faces.ts).

import { describe, expect, it } from "vitest";
import { act, bear, passAll, putOnBattlefield, setup, swamp, target } from "./helpers";
import { botActions, castProblem, cardFromScryfall, defOf, isFullySupported, planCast, spellManaValue, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

let n = 0;
type Face = { name: string; mana_cost?: string; type_line: string; oracle_text?: string; power?: string; toughness?: string };
/** A card as Scryfall has it, read the way the card database is built (tools/build-cards.ts). */
function scry(layout: string, faces: Face[], extra: { keywords?: string[]; color_identity?: string[] } = {}): CardDef {
  const top = layout === "split" || layout === "adventure" ? { mana_cost: faces.map((f) => f.mana_cost ?? "").join(" // ") } : {};
  const colors = [...new Set(faces.flatMap((f) => [...(f.mana_cost ?? "").matchAll(/[WUBRG]/g)].map((m) => m[0])))];
  return cardFromScryfall({
    oracle_id: `faces-${n++}`,
    name: faces.map((f) => f.name).join(" // "),
    layout,
    cmc: 0,
    type_line: faces.map((f) => f.type_line).join(" // "),
    color_identity: extra.color_identity ?? colors,
    keywords: extra.keywords ?? [],
    legalities: { commander: "legal" },
    ...top,
    card_faces: faces.map((f) => ({ object: "card_face", mana_cost: "", oracle_text: "", ...f })),
  });
}

// Real oracle text (Scryfall).
const rider = scry(
  "adventure",
  [
    { name: "Murderous Rider", mana_cost: "{1}{B}{B}", type_line: "Creature — Zombie Knight", oracle_text: "Lifelink\nWhen this creature dies, put it on the bottom of its owner's library.", power: "2", toughness: "3" },
    { name: "Swift End", mana_cost: "{1}{B}{B}", type_line: "Instant — Adventure", oracle_text: "Destroy target creature or planeswalker. You lose 2 life. (Then exile this card. You may cast the creature later from exile.)" },
  ],
  { keywords: ["Lifelink"] },
);
const borrower = scry(
  "adventure",
  [
    { name: "Brazen Borrower", mana_cost: "{1}{U}{U}", type_line: "Creature — Faerie Rogue", oracle_text: "Flash\nFlying\nThis creature can block only creatures with flying.", power: "3", toughness: "1" },
    { name: "Petty Theft", mana_cost: "{1}{U}", type_line: "Instant — Adventure", oracle_text: "Return target nonland permanent an opponent controls to its owner's hand." },
  ],
  { keywords: ["Flying", "Flash"] },
);
const ishgard = scry("adventure", [
  { name: "Ishgard, the Holy See", type_line: "Land — Town", oracle_text: "This land enters tapped.\n{T}: Add {W}." },
  { name: "Faith & Grief", mana_cost: "{3}{W}{W}", type_line: "Sorcery — Adventure", oracle_text: "Return up to two target artifact and/or enchantment cards from your graveyard to your hand. (Then exile this card. You may play the land later from exile.)" },
]);
const mammoth = scry(
  "modal_dfc",
  [
    { name: "Kazandu Mammoth", mana_cost: "{1}{G}{G}", type_line: "Creature — Elephant", oracle_text: "Landfall — Whenever a land you control enters, this creature gets +2/+2 until end of turn.", power: "3", toughness: "3" },
    { name: "Kazandu Valley", type_line: "Land", oracle_text: "This land enters tapped.\n{T}: Add {G}." },
  ],
  { keywords: ["Landfall"] },
);
const emeria = scry("modal_dfc", [
  { name: "Emeria's Call", mana_cost: "{4}{W}{W}{W}", type_line: "Sorcery", oracle_text: "Create two 4/4 white Angel Warrior creature tokens with flying. Non-Angel creatures you control gain indestructible until your next turn." },
  { name: "Emeria, Shattered Skyclave", type_line: "Land", oracle_text: "As this land enters, you may pay 3 life. If you don't, it enters tapped.\n{T}: Add {W}." },
]);
const pathway = scry(
  "modal_dfc",
  [
    { name: "Clearwater Pathway", type_line: "Land", oracle_text: "{T}: Add {U}." },
    { name: "Murkwater Pathway", type_line: "Land", oracle_text: "{T}: Add {B}." },
  ],
  { color_identity: ["B", "U"] },
);
const fireIce = scry("split", [
  { name: "Fire", mana_cost: "{1}{R}", type_line: "Instant", oracle_text: "Fire deals 2 damage divided as you choose among one or two targets." },
  { name: "Ice", mana_cost: "{1}{U}", type_line: "Instant", oracle_text: "Tap target permanent.\nDraw a card." },
]);
const assault = scry("split", [
  { name: "Assault", mana_cost: "{R}", type_line: "Sorcery", oracle_text: "Assault deals 2 damage to any target." },
  { name: "Battery", mana_cost: "{3}{G}", type_line: "Sorcery", oracle_text: "Create a 3/3 green Elephant creature token." },
]);

const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};
const named = (s: GameState, id: string) => defOf(s, s.objects[id]!).name;
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
const opponentBear = (s: GameState, pid: PlayerId) => putOnBattlefield(s, pid, bear());

describe("adventurer cards (CR 715)", () => {
  it("compile, each face on its own", () => {
    for (const d of [rider, borrower, ishgard]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Murderous Rider is the creature in hand; Swift End is an instant on the stack, then goes on an adventure into exile, from which only the creature can be cast", () => {
    const { s: s0, ap, ids, opp } = setup([rider]);
    const id = ids[0]!;
    const victim = opponentBear(s0, opp);
    for (let i = 0; i < 2; i++) putOnBattlefield(s0, ap, swamp);
    // In hand it has only its normal characteristics (CR 715.4).
    expect(defOf(s0, s0.objects[id]!)).toMatchObject({ name: "Murderous Rider", types: ["Creature"], cmc: 3, power: "2" });
    let s = run(s0, planCast(s0, ap, id, [target(victim)], undefined, "auto", undefined, { face: 1 }));
    // On the stack as an Adventure it has only the Adventure's (CR 715.3b).
    expect(defOf(s, s.objects[id]!)).toMatchObject({ name: "Swift End", types: ["Instant"], subtypes: ["Adventure"] });
    expect(spellManaValue(s, s.stack[0]!)).toBe(3);
    expect(s.log.some((l) => l.text.includes("casts Swift End"))).toBe(true);
    s = settle(s);
    expect(zone(s, victim)).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(38);
    // Exiled instead of going to the graveyard, its controller may cast it later (CR 715.3d).
    expect(zone(s, id)).toBe("exile");
    expect(named(s, id)).toBe("Murderous Rider");
    expect(castProblem(s, ap, id, [target(victim)], undefined, undefined, undefined, undefined, { face: 1 })).toMatch(/adventure again/);
    s = settle(run(s, planCast(s, ap, id)));
    expect(zone(s, id)).toBe("battlefield");
    expect(defOf(s, s.objects[id]!)).toMatchObject({ name: "Murderous Rider", power: "2", toughness: "3" });
  });

  it("the creature cast from hand is just a creature spell, and an Adventure that's countered goes to the graveyard", () => {
    const { s: s0, ap, ids } = setup([rider, rider]);
    for (let i = 0; i < 2; i++) putOnBattlefield(s0, ap, swamp);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    // Swift End on the creature that just entered; it's countered on resolution for want of a legal target.
    const victim = ids[0]!;
    s = run(s, planCast(s, ap, ids[1]!, [target(victim)], undefined, "auto", undefined, { face: 1 }));
    s.objects[victim]!.zone = "exile"; // the target is gone (CR 608.2b)
    s.battlefield.splice(s.battlefield.indexOf(victim), 1);
    s = settle(s);
    expect(zone(s, ids[1]!)).toBe("graveyard");
    expect(s.objects[ids[1]!]!.mayPlay).toBeUndefined();
  });

  it("an Adventure is cast with its own timing: Petty Theft at instant speed on another player's turn", () => {
    const { s: s0, ap, ids, opp } = setup([borrower]);
    const theirs = opponentBear(s0, opp);
    // It's the opponent's turn now, and we have priority.
    let s = s0;
    s.activePlayer = opp;
    s.priority = ap;
    s = settle(run(s, planCast(s, ap, ids[0]!, [target(theirs)], undefined, "auto", undefined, { face: 1 })));
    expect(zone(s, theirs)).toBe("hand");
    expect(zone(s, ids[0]!)).toBe("exile");
  });

  it("a land with an Adventure: Faith & Grief goes on an adventure, then the land is played from exile", () => {
    const { s: s0, ap, ids } = setup([ishgard]);
    s0.players[ap]!.landsPlayedThisTurn = 0;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "none" }, { kind: "none" }], undefined, "auto", undefined, { face: 1 })));
    expect(zone(s, ids[0]!)).toBe("exile");
    s = act(s, { type: "playLand", player: ap, objectId: ids[0]! });
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(named(s, ids[0]!)).toBe("Ishgard, the Holy See");
    expect(s.objects[ids[0]!]!.tapped).toBe(true);
  });
});

describe("modal double-faced cards (CR 712)", () => {
  it("compile, each face on its own", () => {
    for (const d of [mammoth, emeria, pathway]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Kazandu Mammoth is the creature everywhere but the battlefield; played as Kazandu Valley, it enters with its land face up", () => {
    const { s: s0, ap, ids } = setup([mammoth]);
    const id = ids[0]!;
    s0.players[ap]!.landsPlayedThisTurn = 0;
    expect(defOf(s0, s0.objects[id]!)).toMatchObject({ name: "Kazandu Mammoth", types: ["Creature"], cmc: 3 });
    // The front face isn't a land (CR 712.12), and a land face isn't cast.
    expect(() => act(s0, { type: "playLand", player: ap, objectId: id })).toThrow(/not a land/);
    expect(castProblem(s0, ap, id, undefined, undefined, undefined, undefined, undefined, { face: 1 })).toMatch(/lands are played/);
    let s = act(s0, { type: "playLand", player: ap, objectId: id, face: 1 });
    expect(zone(s, id)).toBe("battlefield");
    expect(defOf(s, s.objects[id]!)).toMatchObject({ name: "Kazandu Valley", types: ["Land"], cmc: 0 });
    expect(s.objects[id]!.tapped).toBe(true);
    expect(s.players[ap]!.landsPlayedThisTurn).toBe(1);
    // Back to a hand, it's a new object with its front face up (CR 712.8a, 400.7).
    s.objects[id]!.tapped = false;
    s = act(s, { type: "activateMana", player: ap, objectId: id, mana: "G" });
    expect(s.players[ap]!.manaPool.G).toBeGreaterThan(0);
  });

  it("Emeria, Shattered Skyclave: paying 3 life as the land face enters keeps it untapped", () => {
    const { s: s0, ap, ids } = setup([emeria]);
    s0.players[ap]!.landsPlayedThisTurn = 0;
    const s = act(s0, { type: "playLand", player: ap, objectId: ids[0]!, face: 1, untapped: true });
    expect(named(s, ids[0]!)).toBe("Emeria, Shattered Skyclave");
    expect(s.objects[ids[0]!]!.tapped).toBe(false);
    expect(s.players[ap]!.life).toBe(37);
  });

  it("Emeria's Call is cast as its front face, a sorcery", () => {
    const { s: s0, ap, ids } = setup([emeria]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(s.battlefield.filter((id) => defOf(s, s.objects[id]!).name === "Angel Warrior Token")).toHaveLength(2);
  });

  it("a Pathway is played as either land", () => {
    const { s: s0, ap, ids } = setup([pathway]);
    s0.players[ap]!.landsPlayedThisTurn = 0;
    let s = act(s0, { type: "playLand", player: ap, objectId: ids[0]!, face: 1 });
    expect(named(s, ids[0]!)).toBe("Murkwater Pathway");
    s = act(s, { type: "activateMana", player: ap, objectId: ids[0]!, mana: "B" });
    expect(s.players[ap]!.manaPool.B).toBeGreaterThan(0);
    expect(() => act(s, { type: "activateMana", player: ap, objectId: ids[0]!, mana: "U" })).toThrow();
  });
});

describe("split cards (CR 709)", () => {
  it("compile, each half on its own", () => {
    for (const d of [fireIce, assault]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Fire // Ice has both halves' characteristics combined off the stack, and only the half cast on it", () => {
    const { s: s0, ap, ids, opp } = setup([fireIce]);
    const id = ids[0]!;
    const theirs = opponentBear(s0, opp);
    // Combined: both names, the combined mana cost (CR 709.4, 709.4b).
    expect(defOf(s0, s0.objects[id]!)).toMatchObject({ name: "Fire // Ice", cmc: 4, colors: ["U", "R"], types: ["Instant"] });
    // A half has to be chosen (CR 709.3).
    expect(castProblem(s0, ap, id)).toMatch(/choose which half/);
    const hand = s0.players[ap]!.hand.length;
    let s = run(s0, planCast(s0, ap, id, [target(theirs)], undefined, "auto", undefined, { face: 1 }));
    expect(defOf(s, s.objects[id]!)).toMatchObject({ name: "Ice", cmc: 2, colors: ["U"] });
    expect(spellManaValue(s, s.stack[0]!)).toBe(2);
    s = settle(s);
    expect(s.objects[theirs]!.tapped).toBe(true);
    expect(s.players[ap]!.hand.length).toBe(hand); // Ice left the hand, a card was drawn
    expect(zone(s, id)).toBe("graveyard");
    expect(named(s, id)).toBe("Fire // Ice");
  });

  it("Fire divides its damage; Assault // Battery's halves are sorceries", () => {
    const { s: s0, ap, ids, opp } = setup([fireIce, assault]);
    const a = opponentBear(s0, opp);
    const b = opponentBear(s0, opp);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: a, amount: 1 }, { kind: "object", id: b, amount: 1 }], undefined, "auto", undefined, { face: 0 })));
    expect(zone(s, a)).toBe("battlefield"); // 1 damage each to two 2/2s
    expect(s.objects[a]!.damage).toBe(1);
    s = settle(run(s, planCast(s, ap, ids[1]!, undefined, undefined, "auto", undefined, { face: 1 })));
    expect(s.battlefield.filter((id) => defOf(s, s.objects[id]!).name === "Elephant Token")).toHaveLength(1);
    // Not at instant speed.
    const t = passAll(s);
    t.activePlayer = opp;
    expect(castProblem(t, ap, ids[1]!, [{ kind: "player", id: opp }], undefined, undefined, undefined, undefined, { face: 0 })).not.toBeNull();
  });
});

/** A bot's hand of just these cards (the rest back to the library), with the land for the turn played or not. */
function botHand(s: GameState, pid: PlayerId, keep: string[], landPlayed: boolean) {
  const p = s.players[pid]!;
  for (const id of p.hand.filter((x) => !keep.includes(x))) {
    s.objects[id]!.zone = "library";
    p.library.push(id);
  }
  p.hand = p.hand.filter((x) => keep.includes(x));
  p.isBot = true;
  if (landPlayed) p.landsPlayedThisTurn = 1;
}

describe("bots and cards with faces", () => {
  it("a bot sends Murderous Rider on an adventure first, then casts it from exile", () => {
    const { s: s0, ap, ids, opp } = setup([rider]);
    const id = ids[0]!;
    opponentBear(s0, opp);
    for (let i = 0; i < 4; i++) putOnBattlefield(s0, ap, swamp);
    botHand(s0, ap, ids, true);
    const plan = botActions(s0, ap);
    expect(plan.find((a) => a.type === "castSpell")).toMatchObject({ objectId: id, face: 1 });
    const s = settle(plan.reduce((x, a) => act(x, a), s0));
    expect(zone(s, id)).toBe("exile");
    // Back to the bot in its main phase, with mana left: the creature from exile.
    const cast = botActions(s, ap).find((a) => a.type === "castSpell");
    expect(cast).toMatchObject({ objectId: id });
    expect(cast).not.toHaveProperty("face");
  });

  it("a bot plays a modal double-faced card's land face only when it has no other land", () => {
    const { s: s0, ap, ids } = setup([mammoth]);
    botHand(s0, ap, ids, false);
    expect(botActions(s0, ap).find((a) => a.type === "playLand")).toMatchObject({ objectId: ids[0], face: 1 });
    const { s: s1, ap: ap1, ids: ids1 } = setup([mammoth, swamp]);
    botHand(s1, ap1, ids1, false);
    expect(botActions(s1, ap1).find((a) => a.type === "playLand")).toMatchObject({ objectId: ids1[1] });
  });
});
