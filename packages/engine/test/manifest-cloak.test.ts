// Manifest (CR 701.40), cloak (CR 701.58) and manifest dread (CR 701.62): cards put onto the battlefield face down as
// 2/2 creatures (CR 708), turned face up for their mana cost if they're creature cards.

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, putOnBattlefield, setup, target } from "./helpers";
import { botActions, characteristics, faceUpWays, isFullySupported, planCast, planTurnFaceUp, turnFaceUpProblem, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.oracleText).toBe(true));
const logged = (s: GameState, re: RegExp) => s.log.some((l) => re.test(l.text));
const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return settle(passAll(s));
};
/** Put a card on top of a player's library. */
const onTop = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  return id;
};
const pt = (s: GameState, id: string) => {
  const c = characteristics(s, s.objects[id]!);
  return `${c.power}/${c.toughness}`;
};

const fierceInvocation = card("Fierce Invocation", "Sorcery", "{4}{R}", { oracleText: "Manifest the top card of your library, then put two +1/+1 counters on it. (To manifest a card, put it onto the battlefield face down as a 2/2 creature. Turn it face up any time for its mana cost if it's a creature card.)", keywords: ["Manifest"], cmc: 5 });
const unwantedRemake = card("Unwanted Remake", "Instant", "{W}", { oracleText: "Destroy target creature. Its controller manifests dread. (That player looks at the top two cards of their library, then puts one onto the battlefield face down as a 2/2 creature and the other into their graveyard. If it's a creature card, it can be turned face up any time for its mana cost.)", cmc: 1 });
const crypticCoat = card("Cryptic Coat", "Artifact — Equipment", "{2}{U}", { oracleText: "When this Equipment enters, cloak the top card of your library, then attach this Equipment to it. (To cloak a card, put it onto the battlefield face down as a 2/2 creature with ward {2}. Turn it face up any time for its mana cost if it's a creature card.)\nEquipped creature gets +1/+0 and can't be blocked.\n{1}{U}: Return this Equipment to its owner's hand.", keywords: ["Cloak"], cmc: 3 });
const conductiveMachete = card("Conductive Machete", "Artifact — Equipment", "{4}", { oracleText: "When this Equipment enters, manifest dread, then attach this Equipment to that creature. (Look at the top two cards of your library. Put one onto the battlefield face down as a 2/2 creature and the other into your graveyard. Turn it face up any time for its mana cost if it's a creature card.)\nEquipped creature gets +2/+1.\nEquip {4}", keywords: ["Manifest", "Manifest dread", "Equip"], cmc: 4 });
const twistReality = card("Twist Reality", "Instant", "{1}{U}{U}", { oracleText: "Choose one —\n• Counter target spell.\n• Manifest dread. (Look at the top two cards of your library. Put one onto the battlefield face down as a 2/2 creature and the other into your graveyard. Turn it face up any time for its mana cost if it's a creature card.)", keywords: ["Manifest", "Manifest dread"], cmc: 3 });
const realityShift = card("Reality Shift", "Instant", "{1}{U}", { oracleText: "Exile target creature. Its controller manifests the top card of their library. (That player puts the top card of their library onto the battlefield face down as a 2/2 creature. If it's a creature card, it can be turned face up any time for its mana cost.)", keywords: ["Manifest"], cmc: 2 });
const etherealAmbush = card("Ethereal Ambush", "Instant", "{3}{G}{U}", { oracleText: "Manifest the top two cards of your library. (To manifest a card, put it onto the battlefield face down as a 2/2 creature. Turn it face up any time for its mana cost if it's a creature card.)", keywords: ["Manifest"], cmc: 5 });
const bashfulBeastie = card("Bashful Beastie", "Creature — Beast", "{4}{G}", { power: "5", toughness: "4", oracleText: "When this creature dies, manifest dread. (Look at the top two cards of your library. Put one onto the battlefield face down as a 2/2 creature and the other into your graveyard. Turn it face up any time for its mana cost if it's a creature card.)", keywords: ["Manifest", "Manifest dread"], cmc: 5 });
const exaltedAngel = card("Exalted Angel", "Creature — Angel", "{4}{W}{W}", { power: "4", toughness: "5", oracleText: "Flying\nWhenever this creature deals damage, you gain that much life.\nMorph {2}{W}{W} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)", keywords: ["Flying", "Morph"], cmc: 6 });
const healer = card("Enter Healer", "Creature — Human Cleric", "{1}{W}", { power: "1", toughness: "1", oracleText: "When this creature enters, you gain 5 life." });
const xBeast = card("X Beast", "Creature — Beast", "{X}{G}", { power: "3", toughness: "3" });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const forest = card("Forest", "Basic Land — Forest");

describe("manifest, cloak and manifest dread", () => {
  it("compiles the cards", () => {
    supported(fierceInvocation, unwantedRemake, crypticCoat, conductiveMachete, twistReality, realityShift, etherealAmbush, bashfulBeastie);
  });

  it("a manifested card is a nameless 2/2 nobody else sees; its counters stay as it's turned face up for its mana cost (CR 701.40a-b)", () => {
    const { s: s0, ap, ids } = setup([fierceInvocation]);
    const bears = onTop(s0, ap, healer);
    const life = s0.players[ap]!.life;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    const o = s.objects[bears]!;
    expect(o.zone).toBe("battlefield");
    expect(o.faceDown).toBe("manifest");
    expect(characteristics(s, o).name).toBe("Face-down creature");
    expect(pt(s, bears)).toBe("4/4"); // a 2/2 with two +1/+1 counters
    expect(logged(s, /Enter Healer/)).toBe(false);
    expect(s.players[ap]!.life).toBe(life); // face down, it has no enters ability (CR 708.3)
    expect(faceUpWays(s, o)).toEqual([{ kind: "manifest", cost: "{1}{W}" }]);
    s = settle(planTurnFaceUp(s, ap, bears)!.reduce((x, a) => act(x, a), s));
    expect(characteristics(s, s.objects[bears]!).name).toBe("Enter Healer");
    expect(pt(s, bears)).toBe("3/3");
    expect(s.players[ap]!.life).toBe(life); // turning face up isn't entering (CR 708.8)
  });

  it("a manifested noncreature card can't be turned face up (CR 701.40b, 701.40g); X in the cost is 0", () => {
    const { s: s0, ap, ids } = setup([etherealAmbush]);
    const beast = onTop(s0, ap, xBeast);
    onTop(s0, ap, forest);
    const s = run(s0, planCast(s0, ap, ids[0]!));
    const land = s.battlefield.find((id) => s.objects[id]!.faceDown && id !== beast)!;
    expect(s.objects[beast]!.faceDown).toBe("manifest");
    expect(characteristics(s, s.objects[land]!).types).toEqual(["Creature"]);
    expect(turnFaceUpProblem(s, ap, land)).toMatch(/isn't a creature card/);
    expect(faceUpWays(s, s.objects[beast]!)).toEqual([{ kind: "manifest", cost: "{G}" }]);
  });

  it("a manifested card with morph can be turned face up either way (CR 701.40c)", () => {
    const { s: s0, ap, ids } = setup([fierceInvocation]);
    const angel = onTop(s0, ap, exaltedAngel);
    const s = run(s0, planCast(s0, ap, ids[0]!));
    expect(faceUpWays(s, s.objects[angel]!)).toEqual([
      { kind: "morph", cost: "{2}{W}{W}" },
      { kind: "manifest", cost: "{4}{W}{W}" },
    ]);
    for (const id of s.battlefield) s.objects[id]!.tapped = false; // a new turn's mana
    const t = settle(planTurnFaceUp(s, ap, angel, 1)!.reduce((x, a) => act(x, a), s));
    expect(characteristics(t, t.objects[angel]!).name).toBe("Exalted Angel");
    expect(logged(t, /its mana cost \{4\}\{W\}\{W\}/)).toBe(true);
  });

  it("'its controller manifests dread': that player looks at their top two, manifests one and mills the other (CR 701.62a)", () => {
    const { s: s0, ap, ids, opp } = setup([unwantedRemake]);
    const victim = putOnBattlefield(s0, opp, bear());
    const top = onTop(s0, opp, healer);
    const second = onTop(s0, opp, forest);
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!, [target(victim)])!) s = act(s, a);
    s = passAll(s);
    expect(s.objects[victim]!.zone).toBe("graveyard");
    expect(s.pending?.kind).toBe("searchLibrary");
    expect(waitingOn(s)).toBe(opp);
    expect(s.pending?.kind === "searchLibrary" && s.pending.cards).toEqual([second, top]);
    s = act(s, { type: "searchLibrary", player: opp, found: [top] });
    expect(s.objects[top]!.faceDown).toBe("manifest");
    expect(s.objects[top]!.controller).toBe(opp);
    expect(s.objects[second]!.zone).toBe("graveyard");
  });

  it("the bot manifests the creature card it can turn face up", () => {
    const { s: s0, ap, ids, opp } = setup([unwantedRemake]);
    const victim = putOnBattlefield(s0, opp, bear());
    const top = onTop(s0, opp, healer);
    onTop(s0, opp, forest);
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!, [target(victim)])!) s = act(s, a);
    s = passAll(s);
    for (const a of botActions(s, opp)) s = act(s, a);
    expect(s.objects[top]!.faceDown).toBe("manifest");
  });

  it("with one card left, it's manifested; with none, nothing happens (rulings)", () => {
    const { s: s0, ap, ids } = setup([twistReality]);
    const last = s0.players[ap]!.library[s0.players[ap]!.library.length - 1]!;
    s0.players[ap]!.library = [last];
    const s = run(s0, planCast(s0, ap, ids[0]!, undefined, [1]));
    expect(s.objects[last]!.faceDown).toBe("manifest");
    expect(s.players[ap]!.library).toEqual([]);
  });

  it("cloak: a face-down 2/2 with ward {2}; Cryptic Coat attaches to it (CR 701.58a)", () => {
    const { s: s0, ap, ids } = setup([crypticCoat]);
    const cloaked = onTop(s0, ap, healer);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    const o = s.objects[cloaked]!;
    expect(o.faceDown).toBe("cloak");
    expect(characteristics(s, o).keywords).toContain("Ward");
    expect(s.objects[ids[0]!]!.attachedTo).toBe(cloaked);
    expect(pt(s, cloaked)).toBe("3/2");
  });

  it("Conductive Machete: manifest dread, then attach it to that creature", () => {
    const { s: s0, ap, ids } = setup([conductiveMachete]);
    const top = onTop(s0, ap, healer);
    const second = onTop(s0, ap, forest);
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!)!) s = act(s, a);
    s = settle(passAll(s));
    expect(s.pending?.kind).toBe("searchLibrary");
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [second] }));
    expect(s.objects[second]!.faceDown).toBe("manifest");
    expect(s.objects[top]!.zone).toBe("graveyard");
    expect(s.objects[ids[0]!]!.attachedTo).toBe(second);
    expect(pt(s, second)).toBe("4/3");
  });

  it("a face-down permanent leaving the battlefield is revealed (CR 708.9)", () => {
    const { s: s0, ap, ids, opp } = setup([realityShift, shock]);
    const victim = putOnBattlefield(s0, opp, bear());
    const top = onTop(s0, opp, healer);
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(victim)]));
    expect(s.objects[victim]!.zone).toBe("exile");
    expect(s.objects[top]!.faceDown).toBe("manifest");
    expect(s.objects[top]!.controller).toBe(opp);
    s = run(s, planCast(s, ap, ids[1]!, [target(top)]));
    expect(s.objects[top]!.zone).toBe("graveyard");
    expect(s.objects[top]!.faceDown).toBeUndefined();
    expect(logged(s, /face-down creature was Enter Healer/)).toBe(true);
  });
});
