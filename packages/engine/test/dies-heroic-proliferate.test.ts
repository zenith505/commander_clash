// "Whenever another creature dies" triggers, which look back in time (CR 603.10a), heroic, proliferate
// (CR 701.27), amass (CR 701.47), and exiling a permanent then returning it (blink, CR 603.7 for the
// delayed kind).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { compileCard, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.oracleText).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return settle(plan!.reduce((x, a) => act(x, a), s));
};
const castIt = (s: GameState, pid: PlayerId, id: string, targets?: Parameters<typeof planCast>[3]) => run(s, planCast(s, pid, id, targets));
const creature = (name: string, text: string, p = "2", t = "2") => card(name, "Creature — Vampire", "{1}", { power: p, toughness: t, oracleText: text });
const spell = (name: string, text: string, type = "Sorcery") => card(name, type, "{1}", { oracleText: text });

const wrath = spell("Wrath Test", "Destroy all creatures.");
const kill = spell("Kill Test", "Destroy target creature.", "Instant");

describe("whenever a creature dies (CR 603.10a)", () => {
  it("a creature dying with others sees them all die, itself included", () => {
    const artist = creature("Artist Test", "Whenever this creature or another creature dies, each opponent loses 1 life.", "0", "1");
    supported(artist);
    const { s, ap, opp, ids } = setup([wrath]);
    putOnBattlefield(s, ap, artist);
    putOnBattlefield(s, ap, bear());
    putOnBattlefield(s, opp, bear());
    const life = s.players[opp]!.life;
    const t = castIt(s, ap, ids[0]!);
    expect(t.players[opp]!.life).toBe(life - 3);
  });

  it("'another creature you control' and 'with a +1/+1 counter on it' use the creature as it last existed", () => {
    const mourner = creature("Mourner Test", "Whenever another creature you control dies, you gain 2 life.");
    const marked = creature("Marked Test", "Whenever a creature you control with a +1/+1 counter on it dies, draw a card.");
    supported(mourner, marked);
    const { s, ap, opp, ids } = setup([kill, kill, kill]);
    const m = putOnBattlefield(s, ap, mourner);
    putOnBattlefield(s, ap, marked);
    const mine = putOnBattlefield(s, ap, bear());
    s.objects[mine]!.counters["+1/+1"] = 1;
    const theirs = putOnBattlefield(s, opp, bear());
    const life = s.players[ap]!.life;
    const hand = s.players[ap]!.hand.length;
    let t = castIt(s, ap, ids[0]!, [target(mine)]);
    expect(t.players[ap]!.life).toBe(life + 2);
    expect(t.players[ap]!.hand.length).toBe(hand - 1 + 1); // cast one, drew one
    t = castIt(t, ap, ids[1]!, [target(theirs)]);
    expect(t.players[ap]!.life).toBe(life + 2);
    t = castIt(t, ap, ids[2]!, [target(m)]);
    expect(t.players[ap]!.life).toBe(life + 2); // not "another" when it's the one dying
  });

  it("'its toughness' is as it last existed, and 'a creature dealt damage by ~ this turn'", () => {
    const ghoul = creature("Ghoul Test", "{T}: This creature deals 1 damage to target creature.\nWhenever a creature dealt damage by this creature this turn dies, you gain life equal to that creature's toughness.");
    supported(ghoul);
    const { s, ap, opp, ids } = setup([kill]);
    const g = putOnBattlefield(s, ap, ghoul);
    const b = putOnBattlefield(s, opp, bear({ name: "Tough Bear", toughness: "3" }));
    const other = putOnBattlefield(s, opp, bear({ name: "Other Bear" }));
    const life = s.players[ap]!.life;
    let t = run(s, planActivate(s, ap, g, 0, [target(b)]));
    expect(t.objects[b]!.damagedBy).toEqual([g]);
    t = castIt(t, ap, ids[0]!, [target(b)]);
    expect(t.players[ap]!.life).toBe(life + 3);
    expect(t.objects[other]!.damagedBy).toBeUndefined();
  });

  it("'whenever equipped creature dies, return that card to its owner's hand'", () => {
    const shroud = card("Shroud Test", "Artifact — Equipment", "{1}", { oracleText: "Whenever equipped creature dies, return that card to its owner's hand.\nEquip {1}" });
    supported(shroud);
    const { s, ap, ids } = setup([kill]);
    const b = putOnBattlefield(s, ap, bear());
    const e = putOnBattlefield(s, ap, shroud);
    s.objects[e]!.attachedTo = b;
    const t = castIt(s, ap, ids[0]!, [target(b)]);
    expect(t.objects[b]!.zone).toBe("hand");
  });
});

describe("heroic", () => {
  it("triggers when you cast a spell that targets it, not an opponent's creature", () => {
    const hoplite = creature("Hoplite Test", "Heroic — Whenever you cast a spell that targets this creature, put a +1/+1 counter on this creature.");
    const grow = spell("Grow Test", "Target creature gets +1/+1 until end of turn.", "Instant");
    supported(hoplite);
    expect(compileCard(hoplite).triggers[0]?.event).toBe("selfTargetedByYourSpell");
    const { s, ap, ids } = setup([grow]);
    const h = putOnBattlefield(s, ap, hoplite);
    const t = castIt(s, ap, ids[0]!, [target(h)]);
    expect(t.objects[h]!.counters["+1/+1"]).toBe(1);
  });
});

describe("proliferate and amass", () => {
  it("proliferate adds your helpful counters and opponents' harmful ones", () => {
    const grow = spell("Spread Test", "Proliferate.");
    const { s, ap, opp, ids } = setup([grow]);
    const mine = putOnBattlefield(s, ap, bear());
    s.objects[mine]!.counters = { "+1/+1": 2, stun: 1 };
    const theirs = putOnBattlefield(s, opp, bear());
    s.objects[theirs]!.counters = { shield: 1, stun: 1 };
    s.players[opp]!.poison = 3;
    s.players[ap]!.poison = 2;
    const t = castIt(s, ap, ids[0]!);
    expect(t.objects[mine]!.counters).toEqual({ "+1/+1": 3, stun: 1 });
    expect(t.objects[theirs]!.counters).toEqual({ shield: 1, stun: 2 });
    expect(t.players[opp]!.poison).toBe(4);
    expect(t.players[ap]!.poison).toBe(2);
  });

  it("amass makes an Army once, then grows it", () => {
    const amass = spell("Amass Test", "Amass Zombies 2.");
    const amass2 = spell("Amass Orc Test", "Amass Orcs 1.");
    supported(amass, amass2);
    const { s, ap, ids } = setup([amass, amass2]);
    let t = castIt(s, ap, ids[0]!);
    const armies = () => t.battlefield.filter((id) => t.cards[t.objects[id]!.cardId]!.subtypes.includes("Army"));
    expect(armies()).toHaveLength(1);
    const army = armies()[0]!;
    expect(t.objects[army]!.counters["+1/+1"]).toBe(2);
    t = castIt(t, ap, ids[1]!);
    expect(armies()).toEqual([army]);
    expect(t.objects[army]!.counters["+1/+1"]).toBe(3);
  });
});

describe("blink", () => {
  it("exile and return now: it's a new object, and its enters ability triggers again", () => {
    const blink = spell("Blink Test", "Exile target creature you control, then return it to the battlefield under its owner's control.", "Instant");
    const elf = creature("Enters Test", "When this creature enters, you gain 3 life.");
    supported(blink);
    const { s, ap, ids } = setup([blink]);
    const e = putOnBattlefield(s, ap, elf);
    s.objects[e]!.counters["+1/+1"] = 2;
    const life = s.players[ap]!.life;
    const t = castIt(s, ap, ids[0]!, [target(e)]);
    expect(t.objects[e]!.zone).toBe("battlefield");
    expect(t.objects[e]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(t.players[ap]!.life).toBe(life + 3);
  });

  it("exile now, return at the beginning of the next end step with a counter", () => {
    const flick = spell("Flick Test", "Exile target creature. At the beginning of the next end step, return that card to the battlefield under its owner's control with a +1/+1 counter on it.", "Instant");
    supported(flick);
    const { s, ap, opp, ids } = setup([flick]);
    const b = putOnBattlefield(s, opp, bear());
    let t = castIt(s, ap, ids[0]!, [target(b)]);
    expect(t.objects[b]!.zone).toBe("exile");
    t = settle(passUntil(t, "end", ap));
    expect(t.objects[b]!.zone).toBe("battlefield");
    expect(t.objects[b]!.controller).toBe(opp);
    expect(t.objects[b]!.counters["+1/+1"]).toBe(1);
  });
});
