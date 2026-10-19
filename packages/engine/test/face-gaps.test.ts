// Rules gaps left from the round that modeled card faces: a token copy of a double-faced permanent is a double-faced
// token (CR 707.8a) whose back face has mana value 0 (202.3b), as is a copy of a disturbed spell; an Aura back face
// entering transformed enchants as that face (712.14a, 303.4f); an Aura's "when enchanted creature dies, return this
// card" finds the Aura card in the graveyard (Angelic Destiny rulings); a split card has two names (709.4a).

import { describe, expect, it } from "vitest";
import { act, card, cast, island, plainsCard, pt, putOnBattlefield, scry, setup, swamp, target } from "./helpers";
import { defOf, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState } from "../src";
import { transformPermanent } from "../src/effects/run-permanents";
import { defMv, sameName } from "../src/faces";

// Real oracle text (Scryfall).
const gargoyle = scry(
  "transform",
  [
    { name: "Thraben Gargoyle", mana_cost: "{1}", type_line: "Artifact Creature — Gargoyle", oracle_text: "Defender\n{6}: Transform this creature.", power: "2", toughness: "2" },
    { name: "Stonewing Antagonizer", type_line: "Artifact Creature — Gargoyle Horror", oracle_text: "Flying", power: "4", toughness: "2" },
  ],
  { keywords: ["Flying", "Transform", "Defender"] },
);
const beggar = scry(
  "transform",
  [
    { name: "Beloved Beggar", mana_cost: "{1}{W}", type_line: "Creature — Human Peasant", oracle_text: "Disturb {4}{W}{W} (You may cast this card from your graveyard transformed for its disturb cost.)", power: "0", toughness: "4" },
    { name: "Generous Soul", type_line: "Creature — Spirit", oracle_text: "Flying, vigilance\nIf Generous Soul would be put into a graveyard from anywhere, exile it instead.", power: "4", toughness: "4" },
  ],
  { keywords: ["Flying", "Vigilance", "Transform", "Disturb"] },
);
// Accursed Witch's dies trigger and one line of Infectious Curse (their other lines aren't supported yet).
const witch = scry(
  "transform",
  [
    { name: "Accursed Witch", mana_cost: "{3}{B}", type_line: "Creature — Human Shaman", oracle_text: "When this creature dies, return it to the battlefield transformed under your control attached to target opponent.", power: "4", toughness: "2" },
    { name: "Infectious Curse", type_line: "Enchantment — Aura Curse", oracle_text: "Enchant player\nAt the beginning of enchanted player's upkeep, that player loses 1 life and you gain 1 life." },
  ],
  { keywords: ["Transform", "Enchant"] },
);
const skinInvasion = scry(
  "transform",
  [
    { name: "Skin Invasion", mana_cost: "{R}", type_line: "Enchantment — Aura", oracle_text: "Enchant creature\nEnchanted creature attacks each combat if able.\nWhen enchanted creature dies, return this card to the battlefield transformed under your control." },
    { name: "Skin Shedder", type_line: "Creature — Insect Horror", oracle_text: "", power: "3", toughness: "4" },
  ],
  { keywords: ["Enchant", "Transform"] },
);
const journey = scry(
  "transform",
  [
    { name: "Journey to Eternity", mana_cost: "{1}{B}{G}", type_line: "Legendary Enchantment — Aura", oracle_text: "Enchant creature you control\nWhen enchanted creature dies, return it to the battlefield under your control, then return this card to the battlefield transformed under your control." },
    { name: "Atzal, Cave of Eternity", type_line: "Legendary Land", oracle_text: "(Transforms from Journey to Eternity.)\n{T}: Add one mana of any color.\n{3}{B}{G}, {T}: Return target creature card from your graveyard to the battlefield." },
  ],
  { keywords: ["Enchant", "Transform"] },
);
const destiny = card("Angelic Destiny", "Enchantment — Aura", "{2}{W}{W}", { oracleText: "Enchant creature\nEnchanted creature gets +4/+4, has flying and first strike, and is an Angel in addition to its other types.\nWhen enchanted creature dies, return this card to its owner's hand." });
const screams = card("Screams from Within", "Enchantment — Aura", "{1}{B}{B}", { oracleText: "Enchant creature\nEnchanted creature gets -1/-1.\nWhen enchanted creature dies, return this card from your graveyard to the battlefield." });
const twin = card("Twin Test", "Instant", "{2}{U}", { oracleText: "Create a token that's a copy of target creature you control, except it isn't legendary." });
const cackle = card("Cackling Test", "Instant", "{1}{U}{U}", { oracleText: "Create a token that's a copy of target creature you control." });
const doubleMajor = card("Double Test", "Instant", "{G}{U}", { oracleText: "Copy target creature spell you control." });
const murder = card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });
const bear = card("Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" });

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const name = (s: GameState, id: string) => defOf(s, s.objects[id]!).name;
const created = (s: GameState, before: GameState) => s.battlefield.filter((id) => !before.objects[id] && s.objects[id]!.isToken);
const toGraveyard = (s: GameState, id: string) => {
  const o = s.objects[id]!;
  const p = s.players[o.owner]!;
  p.hand.splice(p.hand.indexOf(id), 1);
  p.graveyard.push(id);
  o.zone = "graveyard";
};

describe("rules gaps of card faces", () => {
  it("compile", () => {
    for (const d of [witch, skinInvasion, journey, destiny, screams, doubleMajor] as CardDef[]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("a token copy of a transformed Thraben Gargoyle is a double-faced token, back face up with mana value 0, that can transform (CR 707.8a, 202.3b)", () => {
    const { s: s0, ap, ids } = setup([twin]);
    const g = putOnBattlefield(s0, ap, gargoyle);
    expect(transformPermanent(s0, s0.objects[g]!)).toBe(true);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(g)])));
    const [t] = created(s, s0);
    expect(t).toBeDefined();
    expect(name(s, t!)).toBe("Stonewing Antagonizer");
    expect(s.objects[t!]!.face).toBe(1);
    expect(pt(s, t!)).toBe("4/2");
    expect(defMv(defOf(s, s.objects[t!]!))).toBe(0);
    // The original keeps its front face's mana value.
    expect(defMv(defOf(s, s.objects[g]!))).toBe(1);
    // It transforms like the card: front face up, Thraben Gargoyle with mana value 1.
    expect(transformPermanent(s, s.objects[t!]!)).toBe(true);
    expect(name(s, t!)).toBe("Thraben Gargoyle");
    expect(defMv(defOf(s, s.objects[t!]!))).toBe(1);
    expect(pt(s, t!)).toBe("2/2");
  });

  it("a token copy of a front-face-up double-faced creature has both faces, the exceptions on each (rulings on Soul Separator)", () => {
    const legendaryGargoyle = { ...gargoyle, oracleId: "legend-gargoyle", supertypes: ["Legendary"], faces: gargoyle.faces!.map((f) => ({ ...f, supertypes: ["Legendary"] })) };
    const { s: s0, ap, ids } = setup([twin]);
    const g = putOnBattlefield(s0, ap, legendaryGargoyle);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(g)])));
    const [t] = created(s, s0);
    expect(name(s, t!)).toBe("Thraben Gargoyle");
    expect(s.objects[t!]!.face).toBeUndefined();
    expect(defOf(s, s.objects[t!]!).supertypes).not.toContain("Legendary");
    // Its own transform ability turns it over; the back face isn't legendary either.
    for (let i = 0; i < 6; i++) putOnBattlefield(s, ap, swamp);
    s = settle(run(s, planActivate(s, ap, t!, 0)));
    expect(name(s, t!)).toBe("Stonewing Antagonizer");
    expect(defOf(s, s.objects[t!]!).supertypes).not.toContain("Legendary");
    expect(defMv(defOf(s, s.objects[t!]!))).toBe(0);
  });

  it("a token copy of a card that's not double-faced can't transform (CR 712.9)", () => {
    const { s: s0, ap, ids } = setup([cackle]);
    const b = putOnBattlefield(s0, ap, bear);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(b)])));
    const [t] = created(s, s0);
    expect(transformPermanent(s, s.objects[t!]!)).toBe(false);
  });

  it("a copy of a Generous Soul spell cast with disturb has mana value 0, and so has the token it becomes (CR 202.3b)", () => {
    const { s: s0, ap, ids } = setup([beggar, doubleMajor]);
    const [b, dm] = [ids[0]!, ids[1]!];
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, ap, plainsCard);
    toGraveyard(s0, b);
    let s = run(s0, planCast(s0, ap, b, undefined, undefined, "auto", undefined, { face: 1, via: "disturb" }));
    const spell = s.stack.find((x) => x.objectId === b)!;
    s = run(s, planCast(s, ap, dm, [{ kind: "stack", id: spell.id }]));
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    for (let i = 0; i < 3 && s.stack.length === 2; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const copy = s.stack.find((x) => x.copy)!;
    expect(copy).toBeDefined();
    expect(defMv(defOf(s, s.objects[copy.objectId!]!))).toBe(0);
    expect(defMv(defOf(s, s.objects[b]!))).toBe(2);
    s = settle(s);
    const t = s.battlefield.find((id) => s.objects[id]!.isToken);
    expect(name(s, t!)).toBe("Generous Soul");
    expect(defMv(defOf(s, s.objects[t!]!))).toBe(0);
  });

  it("Accursed Witch dies and returns transformed as Infectious Curse, attached to the opponent it targets", () => {
    const { s: s0, ap, ids, opp } = setup([murder]);
    const w = putOnBattlefield(s0, ap, witch);
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(w)]));
    for (let i = 0; i < 20 && !s.pending && (s.stack.length || s.triggerQueue.length) && s.objects[w]!.zone !== "graveyard"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    for (let i = 0; i < 20 && !s.pending && !s.stack.some((x) => x.sourceId === w); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] });
    s = settle(s);
    const o = s.objects[w]!;
    expect(o.zone).toBe("battlefield");
    expect(name(s, w)).toBe("Infectious Curse");
    expect(o.attachedToPlayer).toBeDefined();
    expect(o.attachedToPlayer).not.toBe(ap);
  });

  it("Skin Invasion returns transformed from the graveyard when its creature dies, a 3/4 Skin Shedder", () => {
    const { s: s0, ap, ids, opp } = setup([skinInvasion, murder]);
    const b = putOnBattlefield(s0, opp, bear);
    let s = cast(s0, ap, ids[0]!, [target(b)]);
    s = settle(s);
    expect(s.objects[ids[0]!]!.attachedTo).toBe(b);
    s = settle(run(s, planCast(s, ap, ids[1]!, [target(b)])));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(name(s, ids[0]!)).toBe("Skin Shedder");
    expect(pt(s, ids[0]!)).toBe("3/4");
    expect(s.objects[ids[0]!]!.controller).toBe(ap);
  });

  it("Journey to Eternity returns the creature and then itself transformed, a land", () => {
    const { s: s0, ap, ids } = setup([journey, murder]);
    const b = putOnBattlefield(s0, ap, bear);
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, ap, swamp);
    let s = settle(cast(s0, ap, ids[0]!, [target(b)]));
    s = settle(run(s, planCast(s, ap, ids[1]!, [target(b)])));
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(name(s, ids[0]!)).toBe("Atzal, Cave of Eternity");
    expect(defOf(s, s.objects[ids[0]!]!).types).toEqual(["Land"]);
  });

  it("Angelic Destiny returns to its owner's hand from the graveyard; not if it has left the graveyard (rulings)", () => {
    const { s: s0, ap, ids } = setup([destiny, murder]);
    const b = putOnBattlefield(s0, ap, bear);
    let s = settle(cast(s0, ap, ids[0]!, [target(b)]));
    expect(pt(s, b)).toBe("6/6");
    s = settle(run(s, planCast(s, ap, ids[1]!, [target(b)])));
    expect(s.objects[ids[0]!]!.zone).toBe("hand");

    // The Aura leaves the graveyard before its trigger resolves: it stays where it went.
    const { s: t0, ap: ap2, ids: ids2 } = setup([destiny, murder]);
    const b2 = putOnBattlefield(t0, ap2, bear);
    let t = settle(cast(t0, ap2, ids2[0]!, [target(b2)]));
    t = run(t, planCast(t, ap2, ids2[1]!, [target(b2)]));
    for (let i = 0; i < 20 && !t.stack.some((x) => x.sourceId === ids2[0]); i++) t = act(t, { type: "passPriority", player: waitingOn(t)! });
    const aura = t.objects[ids2[0]!]!;
    expect(aura.zone).toBe("graveyard");
    t.players[ap2]!.graveyard.splice(t.players[ap2]!.graveyard.indexOf(aura.id), 1);
    t.players[ap2]!.exile.push(aura.id);
    aura.zone = "exile";
    aura.zoneChanges = (aura.zoneChanges ?? 0) + 1;
    t = settle(t);
    expect(t.objects[ids2[0]!]!.zone).toBe("exile");
  });

  it("Screams from Within returns from its controller's graveyard to the battlefield, enchanting a creature", () => {
    const { s: s0, ap, ids, opp } = setup([screams, murder]);
    const a = putOnBattlefield(s0, opp, bear);
    putOnBattlefield(s0, opp, bear);
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, ap, swamp);
    let s = settle(cast(s0, ap, ids[0]!, [target(a)]));
    s = run(s, planCast(s, ap, ids[1]!, [target(a)]));
    for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      if (s.pending?.kind === "chooseOption") s = act(s, { type: "chooseOption", player: s.pending.player, choice: s.pending.options[0]! });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    const o = s.objects[ids[0]!]!;
    expect(o.zone).toBe("battlefield");
    expect(o.attachedTo).toBeDefined();
  });

  it("a split card has the same name as anything with either of its names (CR 709.4a)", () => {
    expect(sameName("Fire // Ice", "Ice")).toBe(true);
    expect(sameName("Fire", "Fire // Ice")).toBe(true);
    expect(sameName("Fire // Ice", "Wear // Tear")).toBe(false);
    expect(sameName("Fire // Ice", "Fire // Ice")).toBe(true);
    expect(sameName("Fire", "Ice")).toBe(false);
  });
});
