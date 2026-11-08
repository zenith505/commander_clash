// Lane B round B142: "An opponent chooses one —" (Misfortune, Fatal Lore, Library of Lat-Nam). The caster chooses an
// opponent, who chooses the mode as it's cast (CR 700.2e, 601.2b); then the caster chooses that mode's targets (601.2c;
// rulings on Fatal Lore). "That player" in the modes is the opponent who chose.

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, controllerOf, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

// Real oracle text (Scryfall).
const misfortune = card("Misfortune", "Sorcery", "{1}{B}{R}{G}", { oracleText: "An opponent chooses one —\n• You put a +1/+1 counter on each creature you control and gain 4 life.\n• You put a -1/-1 counter on each creature that player controls and Misfortune deals 4 damage to that player." });
const fatalLore = card("Fatal Lore", "Sorcery", "{2}{B}{B}", { oracleText: "An opponent chooses one —\n• You draw three cards.\n• You destroy up to two target creatures that player controls. They can't be regenerated. That player draws up to three cards." });
const library = card("Library of Lat-Nam", "Sorcery", "{4}{U}", { oracleText: "An opponent chooses one —\n• You draw three cards at the beginning of the next turn's upkeep.\n• You search your library for a card, put that card into your hand, then shuffle." });

const blessing = card("Nature's Blessing", "Enchantment", "{2}{G}{W}", { keywords: ["Banding"], oracleText: "{G}{W}, Discard a card: Put a +1/+1 counter on target creature or that creature gains banding, first strike, or trample. (This effect lasts indefinitely. Any creatures with banding, and up to one without, can attack in a band. Bands are blocked as a group. If any creatures with banding a player controls are blocking or being blocked by a creature, that player divides that creature's combat damage, not its controller, among any of the creatures it's being blocked by or is blocking.)" });
const ransom = card("Soul Ransom", "Enchantment — Aura", "{2}{U}{B}", { oracleText: "Enchant creature\nYou control enchanted creature.\nDiscard two cards: This Aura's controller sacrifices it, then draws two cards. Only your opponents may activate this ability." });
const shrouded = card("Shrouded Lore", "Sorcery", "{B}", { oracleText: "Target opponent chooses a card in your graveyard. You may pay {B}. If you do, repeat this process except that opponent can't choose a card already chosen for Shrouded Lore. Then put the last chosen card into your hand." });
const forgotten = card("Forgotten Lore", "Sorcery", "{G}", { oracleText: "Target opponent chooses a card in your graveyard. You may pay {G}. If you do, repeat this process except that opponent can't choose a card already chosen for Forgotten Lore. Then put the last chosen card into your hand." });
const wurm = card("Craw Wurm", "Creature — Wurm", "{4}{G}{G}", { power: "6", toughness: "4" });

const giant = card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" });
const ogre = card("Gray Ogre", "Creature — Ogre", "{2}{R}", { power: "2", toughness: "2" });
const elf = card("Llanowar Elves", "Creature — Elf Druid", "{G}", { power: "1", toughness: "1", oracleText: "{T}: Add {G}." });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const NONE: TargetChoice = { kind: "none" };
const pool = (s: GameState, pid: PlayerId, mana: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  for (const [k, n] of Object.entries(mana)) s.players[pid]!.manaPool[k as "W"] += n!;
};
/** A card put into `pid`'s graveyard. */
const toYard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  return id;
};
/** A card put into `pid`'s hand. */
const toHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = toYard(s, pid, def);
  s.players[pid]!.graveyard.splice(s.players[pid]!.graveyard.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  return id;
};
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const opps = (s: GameState, ap: PlayerId) => s.turnOrder.filter((p) => p !== ap);
/** Everyone passes until the stack is empty; questions of the players in `me` stop it, others the bots answer. */
const settle = (s: GameState, opts: { me?: PlayerId[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && opts.me?.includes(p.player)) return s;
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};

describe("parsing", () => {
  it("the three cards are supported, their modes chosen by an opponent", () => {
    supported(misfortune, fatalLore, library);
  });
  it("Nature's Blessing, Soul Ransom, Shrouded Lore and Forgotten Lore are supported", () => {
    supported(blessing, ransom, shrouded, forgotten);
  });
});

describe("Misfortune: an opponent chooses one", () => {
  const start = () => {
    const { s: s0, ap, ids } = setup([misfortune]);
    const [b, c] = opps(s0, ap);
    const mine = putOnBattlefield(s0, ap, ogre);
    const theirs = putOnBattlefield(s0, b!, giant);
    const cs = putOnBattlefield(s0, c!, giant);
    invalidateCharacteristics(s0);
    return { s0, ap, b: b!, c: c!, id: ids[0]!, mine, theirs, cs };
  };

  it("its caster chooses the opponent, who chooses the mode as it's cast; nothing is on the stack until then", () => {
    const { s0, ap, b, id } = start();
    let s = run(s0, planCast(s0, ap, id));
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "modeChooser" });
    expect(s.pending?.kind === "chooseOption" && s.pending.options.length).toBe(3);
    expect(s.stack.length).toBe(0);
    s = act(s, { type: "chooseOption", player: ap, choice: String(b) });
    expect(s.pending).toMatchObject({ kind: "chooseModes", player: b, min: 1, max: 1, legal: [true, true] });
    expect(zone(s, id)).toBe("hand");
    // Only B may choose it: not the caster.
    expect(() => act(s, { type: "chooseModes", player: ap, modes: [0] })).toThrow();
    s = act(s, { type: "chooseModes", player: b, modes: [1] });
    expect(s.pending).toBeNull();
    expect(s.stack.at(-1)).toMatchObject({ modes: [1], modeChooser: b });
    expect(zone(s, id)).toBe("stack");
  });

  it("the second mode puts -1/-1 counters on that player's creatures and deals 4 damage to that player only", () => {
    const { s0, ap, b, c, id, mine, theirs, cs } = start();
    let s = run(s0, planCast(s0, ap, id));
    s = act(s, { type: "chooseOption", player: ap, choice: String(b) });
    s = act(s, { type: "chooseModes", player: b, modes: [1] });
    const life = s.players[b]!.life;
    s = settle(s);
    expect(pt(s, theirs)).toBe("2/2");
    expect(pt(s, cs)).toBe("3/3");
    expect(pt(s, mine)).toBe("2/2");
    expect(s.players[b]!.life).toBe(life - 4);
    expect(s.players[c]!.life).toBe(life);
    expect(zone(s, id)).toBe("graveyard");
  });

  it("the first mode puts +1/+1 counters on the caster's creatures and gains them 4 life", () => {
    const { s0, ap, b, id, mine, theirs } = start();
    let s = run(s0, planCast(s0, ap, id));
    s = act(s, { type: "chooseOption", player: ap, choice: String(b) });
    s = act(s, { type: "chooseModes", player: b, modes: [0] });
    const life = s.players[ap]!.life;
    s = settle(s);
    expect(pt(s, mine)).toBe("3/3");
    expect(pt(s, theirs)).toBe("3/3");
    expect(s.players[ap]!.life).toBe(life + 4);
  });

  it("the caster can't choose the mode, or send an opponent's choice, themselves", () => {
    const { s0, ap, b, id } = start();
    const plan = planCast(s0, ap, id)!;
    const cast = plan.at(-1)! as Extract<Action, { type: "castSpell" }>;
    let s = s0;
    for (const a of plan.slice(0, -1)) s = act(s, a);
    expect(() => act(s, { ...cast, modes: [0] })).toThrow(/opponent chooses the mode/);
    expect(() => act(s, { ...cast, modeChooser: b, chooserModes: [0], modes: [0] })).toThrow(/opponent makes that choice/);
  });

  it("with one opponent left there's nobody to choose between: that opponent chooses the mode", () => {
    const { s0, ap, b, c, id } = start();
    for (const p of opps(s0, ap)) if (p !== c) s0.players[p]!.lost = true;
    const s = run(s0, planCast(s0, ap, id));
    expect(s.pending).toMatchObject({ kind: "chooseModes", player: c });
    void b;
  });

  it("a bot chooses the mode about it when it costs it no creature and little life, else the other", () => {
    const { s0, ap, b, id } = start();
    let s = run(s0, planCast(s0, ap, id));
    s = act(s, { type: "chooseOption", player: ap, choice: String(b) });
    // B's Hill Giant survives a -1/-1 counter and B has 40 life: the -1/-1 counters and the damage.
    expect(botActions(s, b)).toEqual([{ type: "chooseModes", player: b, modes: [1] }]);
    // With an Elf that would die: the caster's counters and life instead.
    const s1 = structuredClone(s0);
    putOnBattlefield(s1, b, elf);
    invalidateCharacteristics(s1);
    let t = run(s1, planCast(s1, ap, id));
    t = act(t, { type: "chooseOption", player: ap, choice: String(b) });
    expect(botActions(t, b)).toEqual([{ type: "chooseModes", player: b, modes: [0] }]);
  });

  it("a bot casts it without a mode and asks an opponent, who chooses", () => {
    const { s0, ap, id } = start();
    s0.players[ap]!.hand = [id];
    s0.players[ap]!.command = [];
    const plan = botActions(s0, ap);
    const cast = plan.find((a) => a.type === "castSpell" && a.objectId === id) as Extract<Action, { type: "castSpell" }> | undefined;
    expect(cast).toBeDefined();
    expect(cast!.modes).toBeUndefined();
    let s = s0;
    for (const a of plan) s = act(s, a);
    s = settle(s);
    expect(zone(s, id)).toBe("graveyard");
  });
});

describe("Fatal Lore: an opponent chooses one, then its caster chooses the targets", () => {
  const start = () => {
    const { s: s0, ap, ids } = setup([fatalLore]);
    const [b, c] = opps(s0, ap);
    const bGiant = putOnBattlefield(s0, b!, giant);
    const bOgre = putOnBattlefield(s0, b!, ogre);
    const cGiant = putOnBattlefield(s0, c!, giant);
    invalidateCharacteristics(s0);
    return { s0, ap, b: b!, c: c!, id: ids[0]!, bGiant, bOgre, cGiant };
  };

  it("the destroy mode: the caster chooses up to two creatures that player controls, then they're destroyed and that player draws up to three", () => {
    const { s0, ap, b, id, bGiant, bOgre, cGiant } = start();
    let s = run(s0, planCast(s0, ap, id));
    s = act(s, { type: "chooseOption", player: ap, choice: String(b) });
    s = act(s, { type: "chooseModes", player: b, modes: [1] });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    expect(s.pending?.kind === "chooseTargets" && s.pending.specs.every((t) => t.controlledBy === b)).toBe(true);
    // Not C's creature: only that player's.
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(cGiant), NONE] })).toThrow();
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(bGiant), tgt(bOgre)] });
    expect(s.pending).toBeNull();
    expect(s.stack.at(-1)?.targets).toMatchObject([tgt(bGiant), tgt(bOgre)]);
    s.objects[bGiant]!.regenShields = 1;
    const hand = s.players[b]!.hand.length;
    s = settle(s, { me: [b] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: b, what: "drawUpTo" });
    s = act(s, { type: "chooseOption", player: b, choice: "3" });
    s = settle(s);
    // They can't be regenerated.
    expect(zone(s, bGiant)).toBe("graveyard");
    expect(zone(s, bOgre)).toBe("graveyard");
    expect(zone(s, cGiant)).toBe("battlefield");
    expect(s.players[b]!.hand.length).toBe(hand + 3);
  });

  it("no targets at all may be chosen for the destroy mode", () => {
    const { s0, ap, b, id, bGiant } = start();
    let s = run(s0, planCast(s0, ap, id));
    s = act(s, { type: "chooseOption", player: ap, choice: String(b) });
    s = act(s, { type: "chooseModes", player: b, modes: [1] });
    s = act(s, { type: "chooseTargets", player: ap, targets: [NONE, NONE] });
    expect(s.stack.length).toBe(1);
    s = settle(s);
    expect(zone(s, bGiant)).toBe("battlefield");
  });

  it("the draw mode: its caster draws three, with no targets to choose", () => {
    const { s0, ap, b, id } = start();
    let s = run(s0, planCast(s0, ap, id));
    s = act(s, { type: "chooseOption", player: ap, choice: String(b) });
    s = act(s, { type: "chooseModes", player: b, modes: [0] });
    expect(s.pending).toBeNull();
    const hand = s.players[ap]!.hand.length;
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(hand + 3);
  });

  it("a bot with creatures has the caster draw; one without takes the destroy mode and the cards", () => {
    const { s0, ap, b, c, id } = start();
    let s = run(s0, planCast(s0, ap, id));
    s = act(s, { type: "chooseOption", player: ap, choice: String(b) });
    expect(botActions(s, b)).toEqual([{ type: "chooseModes", player: b, modes: [0] }]);
    const d = opps(s0, ap).find((p) => p !== b && p !== c)!;
    let t = run(s0, planCast(s0, ap, id));
    t = act(t, { type: "chooseOption", player: ap, choice: String(d) });
    expect(botActions(t, d)).toEqual([{ type: "chooseModes", player: d, modes: [1] }]);
  });

  it("a bot caster asks an opponent and chooses that player's creatures for the destroy mode", () => {
    const { s0, ap, b, id, bGiant, bOgre } = start();
    let s = run(s0, planCast(s0, ap, id));
    s = act(s, { type: "chooseOption", player: ap, choice: String(b) });
    s = act(s, { type: "chooseModes", player: b, modes: [1] });
    const [a] = botActions(s, ap);
    expect(a).toMatchObject({ type: "chooseTargets", player: ap });
    const picked = (a as Extract<Action, { type: "chooseTargets" }>).targets.flatMap((t) => (t.kind === "object" ? [t.id] : []));
    expect(picked.sort()).toEqual([bGiant, bOgre].sort());
    expect(controllerOf(s, s.objects[bGiant]!)).toBe(b);
  });
});

describe("Library of Lat-Nam: an opponent chooses one", () => {
  it("the first mode draws three at the beginning of the next turn's upkeep", () => {
    const { s: s0, ap, ids } = setup([library]);
    const [b] = opps(s0, ap);
    // No discarding to hand size before the upkeep.
    s0.players[ap]!.hand = [ids[0]!];
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = act(s, { type: "chooseOption", player: ap, choice: String(b) });
    s = act(s, { type: "chooseModes", player: b!, modes: [0] });
    const hand = s.players[ap]!.hand.length;
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(hand);
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]);
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(hand + 3);
  });

  it("the second mode searches the caster's library for a card", () => {
    const { s: s0, ap, ids } = setup([library]);
    const [b] = opps(s0, ap);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = act(s, { type: "chooseOption", player: ap, choice: String(b) });
    s = act(s, { type: "chooseModes", player: b!, modes: [1] });
    const hand = s.players[ap]!.hand.length;
    s = settle(s, { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });
});

describe("Nature's Blessing: a +1/+1 counter or banding, first strike or trample, chosen as it resolves", () => {
  const start = () => {
    const { s: s0, ap } = setup([]);
    const nb = putOnBattlefield(s0, ap, blessing);
    const bear = putOnBattlefield(s0, ap, ogre);
    const fodder = toHand(s0, ap, giant);
    invalidateCharacteristics(s0);
    return { s0, ap, nb, bear, fodder };
  };
  it("first strike, for good; the card is discarded as the cost", () => {
    const { s0, ap, nb, bear, fodder } = start();
    let s = run(s0, planActivate(s0, ap, nb, 0, [tgt(bear)], undefined, undefined, undefined, { discard: [fodder] }));
    expect(zone(s, fodder)).toBe("graveyard");
    s = settle(s, { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "either", labels: ["Put a +1/+1 counter on it", "It gains banding", "It gains first strike", "It gains trample"] });
    s = act(s, { type: "chooseOption", player: ap, choice: "2" });
    s = settle(s);
    expect(objHasKeyword(s, s.objects[bear]!, "First strike")).toBe(true);
    expect(pt(s, bear)).toBe("2/2");
    // Still there next turn: no duration (rulings).
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]);
    expect(objHasKeyword(s, s.objects[bear]!, "First strike")).toBe(true);
  });
  it("or the +1/+1 counter", () => {
    const { s0, ap, nb, bear, fodder } = start();
    let s = run(s0, planActivate(s0, ap, nb, 0, [tgt(bear)], undefined, undefined, undefined, { discard: [fodder] }));
    s = settle(s, { me: [ap] });
    s = act(s, { type: "chooseOption", player: ap, choice: "0" });
    s = settle(s);
    expect(pt(s, bear)).toBe("3/3");
    expect(objHasKeyword(s, s.objects[bear]!, "Banding")).toBe(false);
  });
});

describe("Soul Ransom: only its opponents may activate it; its controller sacrifices it and draws two", () => {
  const start = () => {
    const { s: s0, ap } = setup([]);
    const [b] = opps(s0, ap);
    const wurmId = putOnBattlefield(s0, b!, wurm);
    const aura = putOnBattlefield(s0, ap, ransom);
    s0.objects[aura]!.attachedTo = wurmId;
    const discards = [toHand(s0, b!, giant), toHand(s0, b!, ogre)];
    invalidateCharacteristics(s0);
    return { s0, ap, b: b!, wurmId, aura, discards };
  };
  it("you control the enchanted creature, and can't activate the ability yourself", () => {
    const { s0, ap, wurmId, aura } = start();
    expect(controllerOf(s0, s0.objects[wurmId]!)).toBe(ap);
    expect(planActivate(s0, ap, aura, 0, undefined, undefined, undefined, undefined, { discard: s0.players[ap]!.hand.slice(0, 2) })).toBeNull();
  });
  it("an opponent discards two: the Aura's controller sacrifices it and draws two, and the creature goes back", () => {
    const { s0, ap, b, wurmId, aura, discards } = start();
    let s = s0;
    while (waitingOn(s) !== b) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = run(s, planActivate(s, b, aura, 0, undefined, undefined, undefined, undefined, { discard: discards }));
    expect(discards.map((id) => zone(s, id))).toEqual(["graveyard", "graveyard"]);
    const hand = s.players[ap]!.hand.length;
    const theirs = s.players[b]!.hand.length;
    s = settle(s);
    expect(zone(s, aura)).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(s.players[b]!.hand.length).toBe(theirs);
    expect(controllerOf(s, s.objects[wurmId]!)).toBe(b);
  });
});

describe("Shrouded Lore and Forgotten Lore: the opponent chooses again each time you pay", () => {
  const start = (lore: CardDef) => {
    const { s: s0, ap, ids } = setup([lore]);
    const [b] = opps(s0, ap);
    const cards = [toYard(s0, ap, ogre), toYard(s0, ap, giant), toYard(s0, ap, wurm)];
    return { s0, ap, b: b!, id: ids[0]!, cards };
  };
  it("pay once: the second card chosen goes into your hand, and the opponent can't choose the first again", () => {
    const { s0, ap, b, id, cards } = start(shrouded);
    let s = run(s0, planCast(s0, ap, id, [{ kind: "player", id: b }]));
    s = settle(s, { me: [ap, b] });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: b, cards, min: 1, max: 1 });
    s = act(s, { type: "searchLibrary", player: b, found: [cards[0]!] });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap, pay: { mana: "{B}" } });
    pool(s, ap, { B: 1 });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: b, cards: [cards[1], cards[2]] });
    expect(() => act(s, { type: "searchLibrary", player: b, found: [cards[0]!] })).toThrow();
    s = act(s, { type: "searchLibrary", player: b, found: [cards[1]!] });
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    s = settle(s);
    expect(cards.map((c) => zone(s, c))).toEqual(["graveyard", "hand", "graveyard"]);
    expect(zone(s, id)).toBe("graveyard");
  });
  it("with no card left to choose there's nothing to pay for: the last one goes into your hand", () => {
    const { s0, ap, b, id } = start(forgotten);
    const s1 = structuredClone(s0);
    s1.players[ap]!.graveyard = s1.players[ap]!.graveyard.slice(0, 1);
    const only = s1.players[ap]!.graveyard[0]!;
    let s = run(s1, planCast(s1, ap, id, [{ kind: "player", id: b }]));
    s = settle(s, { me: [ap, b] });
    s = act(s, { type: "searchLibrary", player: b, found: [only] });
    expect(s.pending).toBeNull();
    s = settle(s);
    expect(zone(s, only)).toBe("hand");
  });
  it("a bot opponent chooses the card worth least to you; a bot caster pays while it can", () => {
    const { s0, ap, b, id, cards } = start(shrouded);
    let s = run(s0, planCast(s0, ap, id, [{ kind: "player", id: b }]));
    s = settle(s, { me: [ap, b] });
    const [pick] = botActions(s, b);
    expect(pick).toMatchObject({ type: "searchLibrary", found: [cards[0]] });
    s = act(s, pick!);
    // We have Swamps untapped: we pay.
    const answer = botActions(s, ap);
    expect(answer.at(-1)).toEqual({ type: "chooseMay", player: ap, yes: true });
  });
});
