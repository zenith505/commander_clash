// For Mirrodin! (CR 702.163), ravenous (CR 702.156), offspring (CR 702.175), squad (CR 702.157).

import { describe, expect, it } from "vitest";
import { act, bear, card, pt, putOnBattlefield, setup } from "./helpers";
import { botActions, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, actions: Action[] | null) => {
  if (!actions) throw new Error("no plan");
  return actions.reduce((x, a) => act(x, a), s);
};
const castNow = (s: GameState, pid: PlayerId, id: string, choices?: Parameters<typeof planCast>[7], x?: number, targets?: Parameters<typeof planCast>[3]) =>
  run(s, planCast(s, pid, id, targets, undefined, "auto", x, choices));
const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name === name);

// Real oracle text (Scryfall), with the keywords Scryfall lists.
const goldwardensHelm = card("Goldwarden's Helm", "Artifact — Equipment", "{2}{W}", { keywords: ["For Mirrodin!", "Equip"], oracleText: "For Mirrodin! (When this Equipment enters, create a 2/2 red Rebel creature token, then attach this to it.)\nEquipped creature gets +0/+1.\nEquip {1}{W} ({1}{W}: Attach to target creature you control. Equip only as a sorcery.)" });
const termagantSwarm = card("Termagant Swarm", "Creature — Tyranid", "{X}{G}", { power: "0", toughness: "0", keywords: ["Death Frenzy", "Ravenous"], oracleText: "Ravenous (This creature enters with X +1/+1 counters on it. If X is 5 or more, draw a card when it enters.)\nDeath Frenzy — When this creature dies, create a number of 1/1 green Tyranid creature tokens equal to this creature's power." });
const intrepidRabbit = card("Intrepid Rabbit", "Creature — Rabbit Soldier", "{2}{W}", { power: "3", toughness: "2", keywords: ["Offspring"], oracleText: "Offspring {1} (You may pay an additional {1} as you cast this spell. If you do, when this creature enters, create a 1/1 token copy of it.)\nWhen this creature enters, target creature you control gets +1/+1 until end of turn." });
const coruscationMage = card("Coruscation Mage", "Creature — Otter Wizard", "{1}{R}", { power: "2", toughness: "2", keywords: ["Offspring"], oracleText: "Offspring {2} (You may pay an additional {2} as you cast this spell. If you do, when this creature enters, create a 1/1 token copy of it.)\nWhenever you cast a noncreature spell, this creature deals 1 damage to each opponent." });
const galadhrimBrigade = card("Galadhrim Brigade", "Creature — Elf Soldier", "{2}{G}", { power: "2", toughness: "2", keywords: ["Squad"], oracleText: "Squad {1}{G} (As an additional cost to cast this spell, you may pay {1}{G} any number of times. When this creature enters, create that many tokens that are copies of it.)\nOther Elves you control get +1/+1." });
const sicarianInfiltrator = card("Sicarian Infiltrator", "Artifact Creature — Human Soldier", "{2}{U}", { power: "1", toughness: "2", keywords: ["Benediction of the Omnissiah", "Flash", "Squad"], oracleText: "Flash\nSquad {2} (As an additional cost to cast this spell, you may pay {2} any number of times. When this creature enters, create that many tokens that are copies of it.)\nBenediction of the Omnissiah — When this creature enters, draw a card." });
const unsummon = card("Unsummon", "Instant", "{U}", { oracleText: "Return target creature to its owner's hand." });

describe("For Mirrodin!", () => {
  it("makes a 2/2 red Rebel and attaches the Equipment to it (CR 702.163a)", () => {
    supported(goldwardensHelm);
    const { s: s0, ap, ids } = setup([goldwardensHelm]);
    const s = settle(castNow(s0, ap, ids[0]!));
    const [rebel] = named(s, ap, "Rebel Token");
    expect(rebel).toBeDefined();
    expect(s.objects[ids[0]!]!.attachedTo).toBe(rebel);
    expect(pt(s, rebel!)).toBe("2/3");
    expect(s.cards[s.objects[rebel!]!.cardId]!.colors).toEqual(["R"]);
  });
});

describe("ravenous", () => {
  it("enters with X +1/+1 counters, and draws a card only if X is 5 or more (CR 702.156a)", () => {
    supported(termagantSwarm);
    const { s: s0, ap, ids } = setup([termagantSwarm, termagantSwarm]);
    const hand = s0.players[ap]!.hand.length;
    let s = settle(castNow(s0, ap, ids[0]!, undefined, 3));
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(3);
    expect(pt(s, ids[0]!)).toBe("3/3");
    // X is 3: the intervening "if" is false, so nothing even triggers (CR 603.4).
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
    expect(s.log.some((e) => /Ravenous/.test(e.text))).toBe(false);
    s = settle(castNow(s, ap, ids[1]!, undefined, 5));
    expect(pt(s, ids[1]!)).toBe("5/5");
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
  });
});

describe("offspring", () => {
  it("is an optional additional cost; paid, the creature's enters trigger makes a 1/1 token copy (CR 702.175a)", () => {
    supported(intrepidRabbit, coruscationMage);
    const { s: s0, ap, ids } = setup([intrepidRabbit, intrepidRabbit]);
    // Not paid: no token.
    let s = settle(castNow(s0, ap, ids[0]!, undefined, undefined));
    for (let i = 0; i < 5 && s.pending?.kind === "chooseTargets"; i++) s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: ids[0]! }] }));
    expect(named(s, ap, "Intrepid Rabbit")).toHaveLength(1);
    const lands = s.battlefield.filter((id) => s.objects[id]!.controller === ap && s.objects[id]!.tapped).length;
    // Paid: {2}{W} plus {1}.
    s = castNow(s, ap, ids[1]!, { kicks: [0] });
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap && s.objects[id]!.tapped).length - lands).toBe(4);
    expect(s.log.some((e) => /paying its offspring cost/.test(e.text))).toBe(true);
    for (let i = 0; i < 20 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: ids[1]! }] });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    const rabbits = named(s, ap, "Intrepid Rabbit");
    expect(rabbits).toHaveLength(3);
    const token = rabbits.find((id) => s.objects[id]!.isToken)!;
    // A copy, except it's 1/1; its own enters ability triggered too (rulings), but not its offspring.
    expect(s.cards[s.objects[token]!.cardId]!.power).toBe("1");
    expect(rabbits.filter((id) => s.objects[id]!.isToken)).toHaveLength(1);
  });

  it("copies the creature as it last existed if it left before the trigger resolved (rulings)", () => {
    const { s: s0, ap, ids } = setup([coruscationMage, unsummon]);
    let s = castNow(s0, ap, ids[0]!, { kicks: [0] });
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    for (let i = 0; i < 4 && s.objects[ids[0]!]!.zone !== "battlefield"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.stack.at(-1)?.description).toMatch(/Offspring/);
    // In response, bounce it.
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "object", id: ids[0]! }]));
    s = settle(s);
    expect(s.objects[ids[0]!]!.zone).toBe("hand");
    const tokens = named(s, ap, "Coruscation Mage").filter((id) => s.objects[id]!.isToken);
    expect(tokens).toHaveLength(1);
    expect(pt(s, tokens[0]!)).toBe("1/1");
  });

  it("does nothing for a permanent that wasn't cast with the cost paid (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const s = s0;
    const id = putOnBattlefield(s, ap, intrepidRabbit);
    expect(s.triggerQueue).toHaveLength(0);
    expect(s.objects[id]!.kicked).toBeUndefined();
  });
});

describe("squad", () => {
  it("can be paid any number of times; it makes that many token copies, all at once (CR 702.157a)", () => {
    supported(galadhrimBrigade, sicarianInfiltrator);
    const { s: s0, ap, ids } = setup([galadhrimBrigade]);
    let s = castNow(s0, ap, ids[0]!, { kicks: [0, 0] });
    expect(s.log.some((e) => /paying its squad cost twice/.test(e.text))).toBe(true);
    s = settle(s);
    const brigades = named(s, ap, "Galadhrim Brigade");
    expect(brigades).toHaveLength(3);
    // Each is a full copy: other Elves get +1/+1 from each of the other two.
    for (const b of brigades) expect(pt(s, b)).toBe("4/4");
  });

  it("each token copy's own enters abilities trigger, and a bot pays squad when it has spare mana", () => {
    const { s: s0, ap, ids } = setup([sicarianInfiltrator]);
    const hand = s0.players[ap]!.hand.length;
    let s = settle(castNow(s0, ap, ids[0]!, { kicks: [0] }));
    expect(named(s, ap, "Sicarian Infiltrator")).toHaveLength(2);
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2);
    // The bot's plan for a squad card pays the squad cost (mana to spare).
    const { s: b0, ap: bp, ids: bids } = setup([galadhrimBrigade]);
    b0.players[bp]!.isBot = true;
    b0.players[bp]!.landsPlayedThisTurn = 1;
    const plan = botActions(b0, bp);
    const castIt = plan.find((a) => a.type === "castSpell" && a.objectId === bids[0]);
    expect(castIt && castIt.type === "castSpell" && castIt.kicks?.length).toBeGreaterThan(0);
  });
});
