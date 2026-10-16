// Haunt (CR 702.55): "When this permanent is put into a graveyard from the battlefield, exile it haunting target
// creature"; on an instant or sorcery, "When this spell is put into a graveyard during its resolution, exile it haunting
// target creature" (702.55a). The exiled card haunts that object (702.55b), and its "when the creature it haunts dies"
// abilities trigger from exile (702.55c), under its owner's control (CR 108.4a, 113.8).

import { describe, expect, it } from "vitest";
import { act, bear, card, pt, putOnBattlefield, setup, target } from "./helpers";
import { botActions, destroyPermanent, hauntedBy, isFullySupported, moveObject, planCast, waitingOn, type Action, type CardDef, type GameState } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("can't do that");
  for (const a of plan) s = act(s, a);
  return s;
};
const kill = (s: GameState, id: string) => destroyPermanent(s, s.objects[id]!, "test");
function settle(s: GameState) {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}

// Real oracle text (Scryfall).
const creatureHaunt = "Haunt (When this creature dies, exile it haunting target creature.)";
const spellHaunt = "Haunt (When this spell card is put into a graveyard after resolving, exile it haunting target creature.)";
const blindHunter = card("Blind Hunter", "Creature — Bat", "{2}{W}{B}", { power: "2", toughness: "2", keywords: ["Flying", "Haunt"], oracleText: `Flying\n${creatureHaunt}\nWhen this creature enters or the creature it haunts dies, target player loses 2 life and you gain 2 life.` });
const belfry = card("Belfry Spirit", "Creature — Spirit", "{3}{W}{W}", { power: "1", toughness: "1", keywords: ["Flying", "Haunt"], oracleText: `Flying\n${creatureHaunt}\nWhen this creature enters or the creature it haunts dies, create two 1/1 black Bat creature tokens with flying.` });
const pontiff = card("Orzhov Pontiff", "Creature — Human Cleric", "{1}{W}{B}", { power: "1", toughness: "1", keywords: ["Haunt"], oracleText: `${creatureHaunt}\nWhen this creature enters or the creature it haunts dies, choose one —\n• Creatures you control get +1/+1 until end of turn.\n• Creatures you don't control get -1/-1 until end of turn.` });
const euthanist = card("Orzhov Euthanist", "Creature — Human Assassin", "{2}{B}", { power: "2", toughness: "2", keywords: ["Haunt"], oracleText: `${creatureHaunt}\nWhen this creature enters or the creature it haunts dies, destroy target creature that was dealt damage this turn.` });
const absolver = card("Absolver Thrull", "Creature — Thrull Cleric", "{3}{W}", { power: "2", toughness: "3", keywords: ["Haunt"], oracleText: `${creatureHaunt}\nWhen this creature enters or the creature it haunts dies, destroy target enchantment.` });
const exhumer = card("Exhumer Thrull", "Creature — Thrull", "{5}{B}", { power: "3", toughness: "3", keywords: ["Haunt"], oracleText: `${creatureHaunt}\nWhen this creature enters or the creature it haunts dies, return target creature card from your graveyard to your hand.` });
const dominator = card("Graven Dominator", "Creature — Gargoyle", "{4}{W}{W}", { power: "4", toughness: "4", keywords: ["Flying", "Haunt"], oracleText: `Flying\n${creatureHaunt}\nWhen this creature enters or the creature it haunts dies, each other creature has base power and toughness 1/1 until end of turn.` });
const contrition = card("Cry of Contrition", "Sorcery", "{B}", { keywords: ["Haunt"], oracleText: `Target player discards a card.\n${spellHaunt}\nWhen the creature this card haunts dies, target player discards a card.` });
const benediction = card("Benediction of Moons", "Sorcery", "{W}", { keywords: ["Haunt"], oracleText: `You gain 1 life for each player.\n${spellHaunt}\nWhen the creature this card haunts dies, you gain 1 life for each player.` });
const seize = card("Seize the Soul", "Instant", "{2}{B}{B}", { keywords: ["Haunt"], oracleText: `Destroy target nonwhite, nonblack creature. Create a 1/1 white Spirit creature token with flying.\n${spellHaunt}\nWhen the creature this card haunts dies, destroy target nonwhite, nonblack creature. Create a 1/1 white Spirit creature token with flying.` });

describe("haunt", () => {
  it("parses", () => {
    supported(blindHunter, belfry, pontiff, euthanist, absolver, exhumer, dominator, contrition, benediction, seize);
  });

  it("a creature with haunt that dies is exiled haunting a creature, and its ability triggers again when that creature dies", () => {
    const { s: s0, ap, opp } = setup([]);
    const hunter = putOnBattlefield(s0, ap, blindHunter);
    const victim = putOnBattlefield(s0, opp, bear());
    kill(s0, hunter);
    let s = act(s0, { type: "passPriority", player: waitingOn(s0)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(victim)] }));
    expect(s.objects[hunter]!.zone).toBe("exile");
    expect(s.objects[hunter]!.haunting).toEqual({ id: victim, zc: s.objects[victim]!.zoneChanges ?? 0 });
    expect(hauntedBy(s, s.objects[victim]!).map((o) => o.id)).toEqual([hunter]);

    // The haunted creature dies: "target player loses 2 life and you gain 2 life", controlled by the haunt card's owner.
    const life = s.players[ap]!.life;
    kill(s, victim);
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(s.players[opp]!.life).toBe(38);
    expect(s.players[ap]!.life).toBe(life + 2);
    expect(s.objects[hunter]!.zone).toBe("exile"); // it stays in exile, haunting nothing that's still there
  });

  it("the haunted creature leaving for another zone isn't dying; coming back, it's a new object", () => {
    const { s: s0, ap, opp } = setup([]);
    const spirit = putOnBattlefield(s0, ap, belfry);
    const victim = putOnBattlefield(s0, opp, bear());
    kill(s0, spirit);
    let s = act(s0, { type: "passPriority", player: waitingOn(s0)! });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(victim)] }));
    expect(s.objects[spirit]!.haunting?.id).toBe(victim);
    moveObject(s, victim, "hand");
    moveObject(s, victim, "battlefield");
    expect(hauntedBy(s, s.objects[victim]!)).toEqual([]);
    kill(s, victim);
    expect(s.triggerQueue).toEqual([]);
  });

  it("a haunting card that leaves exile haunts nothing", () => {
    const { s: s0, ap, opp } = setup([]);
    const spirit = putOnBattlefield(s0, ap, belfry);
    const victim = putOnBattlefield(s0, opp, bear());
    kill(s0, spirit);
    let s = act(s0, { type: "passPriority", player: waitingOn(s0)! });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(victim)] }));
    moveObject(s, spirit, "graveyard");
    expect(s.objects[spirit]!.haunting).toBeUndefined();
    kill(s, victim);
    expect(s.triggerQueue).toEqual([]);
  });

  it("with no creature to haunt, the card stays in the graveyard (CR 603.3d)", () => {
    const { s: s0, ap } = setup([]);
    const spirit = putOnBattlefield(s0, ap, belfry);
    kill(s0, spirit);
    const s = settle(s0);
    expect(s.pending).toBeFalsy();
    expect(s.objects[spirit]!.zone).toBe("graveyard");
  });

  it("if the card left the graveyard before haunt resolves, nothing is exiled", () => {
    const { s: s0, ap, opp } = setup([]);
    const spirit = putOnBattlefield(s0, ap, belfry);
    const victim = putOnBattlefield(s0, opp, bear());
    kill(s0, spirit);
    let s = act(s0, { type: "passPriority", player: waitingOn(s0)! });
    s = act(s, { type: "chooseTargets", player: ap, targets: [target(victim)] });
    moveObject(s, spirit, "hand");
    moveObject(s, spirit, "graveyard"); // back in the graveyard, but a new object (CR 400.7)
    s = settle(s);
    expect(s.objects[spirit]!.zone).toBe("graveyard");
    expect(hauntedBy(s, s.objects[victim]!)).toEqual([]);
  });

  it("enters: the same ability triggers when it enters", () => {
    const { s: s0, ap, ids } = setup([pontiff]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseModes", player: ap });
    s = settle(act(s, { type: "chooseModes", player: ap, modes: [0] } as Action));
    expect(pt(s, b)).toBe("3/3");
  });

  it("an instant with haunt is exiled haunting a creature after it resolves; when that creature dies, it does it again", () => {
    const { s: s0, ap, opp, ids } = setup([seize]);
    const first = putOnBattlefield(s0, opp, bear());
    const second = putOnBattlefield(s0, opp, bear());
    const host = putOnBattlefield(s0, opp, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(first)]));
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[first]!.zone).toBe("graveyard");
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(host)] }));
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
    const spirits = () => s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]?.name === "Spirit Token" || /Spirit/.test(s.cards[s.objects[id]!.cardId]?.typeLine ?? "")).length;
    const before = spirits();

    kill(s, host);
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(second)] }));
    expect(s.objects[second]!.zone).toBe("graveyard");
    expect(spirits()).toBe(before + 1);
  });

  it("a countered or fizzled haunt spell isn't put into the graveyard during its resolution, so it doesn't haunt", () => {
    const { s: s0, ap, opp, ids } = setup([seize]);
    const first = putOnBattlefield(s0, opp, bear());
    putOnBattlefield(s0, opp, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(first)]));
    moveObject(s, first, "hand"); // its only target is gone (CR 608.2b)
    s = settle(s);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.pending).toBeFalsy();
  });

  it("Benediction of Moons gains 1 life for each player in the game", () => {
    const { s: s0, ap, ids } = setup([benediction]);
    const life = s0.players[ap]!.life;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.players[ap]!.life).toBe(life + 4);
  });

  it("a bot haunts an opponent's creature", () => {
    const { s: s0, ap, opp } = setup([]);
    const spirit = putOnBattlefield(s0, ap, belfry);
    putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, bear());
    kill(s0, spirit);
    const s = act(s0, { type: "passPriority", player: waitingOn(s0)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    const a = botActions(s, ap)[0];
    expect(a?.type).toBe("chooseTargets");
    const chosen = a?.type === "chooseTargets" ? a.targets[0] : undefined;
    expect(chosen?.kind === "object" && s.objects[chosen.id]!.controller).not.toBe(ap);
    expect(chosen).toBeDefined();
    void theirs;
  });
});
