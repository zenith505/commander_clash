// Sagas (CR 714): a Saga enters with a lore counter (714.3a) and gets another as its controller's precombat main
// phase begins (714.3c, 505.4); each chapter ability triggers when lore counters are put on it and their number goes
// from below its chapter number to at least it (714.2b). With its final chapter done and no chapter ability of it
// waiting or on the stack, it's sacrificed (714.4, 704.5s). Read ahead (702.155): it enters with the chapter number
// its controller chooses, and that turn only the chapter matching its lore counters exactly triggers.

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { botActions, isFullySupported, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";
import { putCounters } from "../src/counters";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

// Real oracle text (Scryfall).
const REMINDER = "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)";
const READ_AHEAD = "Read ahead (Choose a chapter and start with that many lore counters. Add one after your draw step. Skipped chapters don't trigger. Sacrifice after III.)";
const benalia = card("History of Benalia", "Enchantment — Saga", "{1}{W}{W}", { oracleText: `${REMINDER}\nI, II — Create a 2/2 white Knight creature token with vigilance.\nIII — Knights you control get +2/+1 until end of turn.` });
const eldest = card("The Eldest Reborn", "Enchantment — Saga", "{4}{B}", { oracleText: `${REMINDER}\nI — Each opponent sacrifices a creature or planeswalker of their choice.\nII — Each opponent discards a card.\nIII — Put target creature or planeswalker card from a graveyard onto the battlefield under your control.` });
const binding = card("Binding the Old Gods", "Enchantment — Saga", "{2}{B}{G}", { oracleText: `${REMINDER}\nI — Destroy target nonland permanent an opponent controls.\nII — Search your library for a Forest card, put it onto the battlefield tapped, then shuffle.\nIII — Creatures you control gain deathtouch until end of turn.` });
const shiva = card("Summon: Shiva", "Enchantment Creature — Saga Elemental", "{3}{U}{U}", { power: "4", toughness: "5", oracleText: `${REMINDER}\nI, II — Heavenly Strike — Tap target creature an opponent controls. Put a stun counter on it. (If a permanent with a stun counter would become untapped, remove one from it instead.)\nIII — Diamond Dust — Draw a card for each tapped creature your opponents control.` });
const weatherseed = card("The Weatherseed Treaty", "Enchantment — Saga", "{2}{G}", { keywords: ["Read Ahead", "Domain"], oracleText: `${READ_AHEAD}\nI — Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.\nII — Create a 1/1 green Saproling creature token.\nIII — Domain — Target creature you control gets +X/+X and gains trample until end of turn, where X is the number of basic land types among lands you control.` });
const gix = card("The Cruelty of Gix", "Enchantment — Saga", "{3}{B}{B}", { keywords: ["Read Ahead"], oracleText: `${READ_AHEAD}\nI — Target opponent reveals their hand. You choose a creature or planeswalker card from it. That player discards that card.\nII — Search your library for a card, put that card into your hand, then shuffle. You lose 3 life.\nIII — Put target creature card from a graveyard onto the battlefield under your control.` });
const knight = card("Knight Test", "Creature — Human Knight", "{1}{W}", { power: "2", toughness: "2" });

function run(s: GameState, plan: Action[] | null): GameState {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return s;
}

/** Pass until the stack and the trigger queue are empty or someone has to decide something. */
function settle(s: GameState): GameState {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}

/** On to `pid`'s next precombat main phase, its lore counter put on and its chapter abilities resolved. */
function nextMain(s: GameState, pid: PlayerId): GameState {
  s = passUntil(s, "end", pid);
  s = passUntil(s, "main1", pid);
  return settle(s);
}

const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name === name);

describe("Sagas", () => {
  it("parse", () => {
    supported(benalia, eldest, binding, shiva, weatherseed, gix);
  });

  it("History of Benalia: chapter I as it enters, II and III in the next main phases, then it's sacrificed", () => {
    const { s: s0, ap, ids } = setup([benalia]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const saga = ids[0]!;
    expect(s.objects[saga]!.counters.lore).toBe(1);
    expect(named(s, ap, "Knight Token")).toHaveLength(1);
    s = nextMain(s, ap);
    expect(s.objects[saga]!.counters.lore).toBe(2);
    expect(named(s, ap, "Knight Token")).toHaveLength(2);
    expect(s.log.some((l) => /puts a lore counter on History of Benalia/.test(l.text))).toBe(true);
    // Chapter III: it stays while its chapter ability is on the stack (CR 714.4), then it's sacrificed.
    s = passUntil(passUntil(s, "end", ap), "main1", ap);
    expect(s.objects[saga]!.counters.lore).toBe(3);
    expect(s.objects[saga]!.zone).toBe("battlefield");
    expect(s.stack.some((x) => x.chapter && x.sourceId === saga) || s.triggerQueue.some((t) => t.chapter && t.sourceId === saga)).toBe(true);
    s = settle(s);
    expect(s.objects[saga]!.zone).toBe("graveyard");
    const k = named(s, ap, "Knight Token")[0]!;
    expect([power(s, s.objects[k]!), toughness(s, s.objects[k]!)]).toEqual([4, 3]);
  });

  it("two lore counters at once trigger both chapters (CR 714.2b)", () => {
    const { s: s0, ap } = setup([]);
    const saga = putOnBattlefield(s0, ap, benalia);
    s0.objects[saga]!.counters.lore = 1;
    putCounters(s0, s0.objects[saga]!, "lore", 2);
    expect(s0.triggerQueue.filter((t) => t.chapter)).toHaveLength(2);
    const s = settle(s0);
    expect(named(s, ap, "Knight Token")).toHaveLength(1); // chapter II's Knight; III pumps it
    expect(s.objects[saga]!.zone).toBe("graveyard");
  });

  it("a Saga at its final chapter with nothing of it waiting is sacrificed (CR 704.5s)", () => {
    const { s: s0, ap } = setup([]);
    const saga = putOnBattlefield(s0, ap, eldest);
    s0.objects[saga]!.counters.lore = 3;
    // Any player's action makes the game check state-based actions.
    const s = act(s0, { type: "passPriority", player: waitingOn(s0)! });
    expect(s.objects[saga]!.zone).toBe("graveyard");
  });

  it("read ahead: its controller chooses the chapter; the ones before it don't trigger (CR 702.155)", () => {
    const { s: s0, ap, ids } = setup([weatherseed]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending?.kind).toBe("chooseOption");
    if (s.pending?.kind !== "chooseOption") return;
    expect(s.pending.what).toBe("readAhead");
    expect(s.pending.options).toEqual(["1", "2", "3"]);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "2" }));
    expect(s.objects[ids[0]!]!.counters.lore).toBe(2);
    expect(named(s, ap, "Saproling Token")).toHaveLength(1);
    expect(s.log.some((l) => /Search your library/.test(l.text) || /searches/.test(l.text))).toBe(false);
    // Its next chapter as usual.
    const bear = putOnBattlefield(s, ap, knight);
    s = passUntil(passUntil(s, "end", ap), "main1", ap);
    s = settle(s);
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(bear)] }));
    expect(power(s, s.objects[bear]!)).toBeGreaterThan(2);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });

  it("read ahead to the last chapter: only it triggers, then the Saga is sacrificed", () => {
    const { s: s0, ap, ids } = setup([weatherseed]);
    const bear = putOnBattlefield(s0, ap, knight);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = act(s, { type: "chooseOption", player: ap, choice: "3" });
    expect(s.triggerQueue.filter((t) => t.chapter)).toHaveLength(1);
    s = settle(s);
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(bear)] }));
    expect(named(s, ap, "Saproling Token")).toHaveLength(0);
    expect(power(s, s.objects[bear]!)).toBeGreaterThan(2);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });

  it("a bot reads ahead from chapter I", () => {
    const { s: s0, ap, ids } = setup([gix]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending?.kind).toBe("chooseOption");
    expect(botActions(s, ap)).toEqual([{ type: "chooseOption", player: ap, choice: "1" }]);
  });
});
