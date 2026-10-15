// Redirection shields (CR 614.9): "The next 1 damage that would be dealt to this creature this turn is dealt to target
// creature you control instead" (the en-Kor), and choosing which simultaneous damage a shield takes (CR 615.7, 616.1).

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, cast, passUntil, plainsCard, putOnBattlefield, setup, target } from "./helpers";
import { botActions, isFullySupported, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

// Real oracle text (Scryfall).
const enKor = (name: string, typeLine: string, manaCost: string, power: string, toughness: string, keyword?: string, reminder = "") =>
  card(name, typeLine, manaCost, {
    power,
    toughness,
    keywords: keyword ? [keyword] : [],
    oracleText: `${keyword ? `${keyword}${reminder}\n` : ""}{0}: The next 1 damage that would be dealt to this creature this turn is dealt to target creature you control instead.`,
  });
const nomads = enKor("Nomads en-Kor", "Creature — Kor Nomad Soldier", "{W}", "1", "1");
const lancers = enKor("Lancers en-Kor", "Creature — Kor Soldier", "{3}{W}{W}", "3", "3", "Trample");
const outrider = enKor("Outrider en-Kor", "Creature — Kor Rebel Knight", "{2}{W}", "2", "2", "Flanking", " (Whenever a creature without flanking blocks this creature, the blocking creature gets -1/-1 until end of turn.)");
const spirit = enKor("Spirit en-Kor", "Creature — Kor Spirit", "{3}{W}", "2", "2", "Flying");
const warrior = enKor("Warrior en-Kor", "Creature — Kor Warrior Knight", "{W}{W}", "2", "2");
const zealous = card("Zealous Inquisitor", "Creature — Human Cleric", "{2}{W}", { power: "2", toughness: "2", oracleText: "{1}{W}: The next 1 damage that would be dealt to this creature this turn is dealt to target creature instead." });
const zhalfirin = card("Zhalfirin Crusader", "Creature — Human Knight", "{1}{W}{W}", {
  power: "2",
  toughness: "2",
  keywords: ["Flanking"],
  oracleText: "Flanking (Whenever a creature without flanking blocks this creature, the blocking creature gets -1/-1 until end of turn.)\n{1}{W}: The next 1 damage that would be dealt to this creature this turn is dealt to any target instead.",
});
const daughter = card("Daughter of Autumn", "Legendary Creature — Avatar", "{2}{G}{G}", { power: "2", toughness: "4", oracleText: "{W}: The next 1 damage that would be dealt to target white creature this turn is dealt to Daughter of Autumn instead." });
const carom = card("Carom", "Instant", "{1}{W}", { oracleText: "The next 1 damage that would be dealt to target creature this turn is dealt to another target creature instead.\nDraw a card." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const rats = card("Typhoid Rats", "Creature — Rat", "{B}", { power: "1", toughness: "1", keywords: ["Deathtouch"], oracleText: "Deathtouch (Any amount of damage this deals to a creature is enough to destroy it.)" });
const wall = card("Wall of Wood", "Creature — Wall", "{G}", { power: "0", toughness: "3", keywords: ["Defender"], oracleText: "Defender (This creature can't attack.)" });
const knight = card("White Knight", "Creature — Human Knight", "{W}{W}", { power: "2", toughness: "2", keywords: ["First strike"], oracleText: "First strike" });

type Answer = (s: GameState) => Action | null;
const bot: Answer = (s) => botActions(s, waitingOn(s)!)[0]!;

/** Attack, have the defenders block as given, and stop when the active player gets priority after blocks. */
function toBlocks(s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[], blocks: { blocker: string; attacker: string }[]) {
  s = passUntil(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks });
  for (let i = 0; i < 100 && !(s.step === "declareBlockers" && !s.pending && !s.stack.length && waitingOn(s) === ap); i++) {
    const pend = s.pending;
    if (pend?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pend.player, blocks: blocks.filter((b) => s.objects[b.blocker]!.controller === pend.player) });
    else if (pend) s = act(s, bot(s)!);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  expect(s.step).toBe("declareBlockers");
  return s;
}

/** Everyone passes (bots of `bots` act) to the end of combat, answering choices with `answer`; the questions asked. */
function toEndOfCombat(s: GameState, answer: Answer = bot, bots: PlayerId[] = []) {
  const asked: string[] = [];
  for (let i = 0; i < 300 && !(s.step === "endCombat" && !s.pending && !s.stack.length); i++) {
    const pend = s.pending;
    if (pend?.kind === "chooseOption" && pend.what === "damageShield") asked.push(`${pend.prompt} [${pend.labels!.join(" | ")}]`);
    if (pend) s = act(s, answer(s) ?? bot(s)!);
    else if (bots.includes(waitingOn(s)!)) s = act(s, bot(s)!);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return { s, asked };
}
const pickLabel = (re: RegExp): Answer => (s) => {
  const p = s.pending;
  if (p?.kind !== "chooseOption" || p.what !== "damageShield") return null;
  const i = p.labels!.findIndex((l) => re.test(l));
  return i < 0 ? null : { type: "chooseOption", player: p.player, choice: p.options[i]! };
};
const zone = (s: GameState, id: string) => s.objects[id]!.zone;

describe("redirection shields (CR 614.9)", () => {
  it("the en-Kor and friends compile", () => {
    supported(nomads, lancers, outrider, spirit, warrior, zealous, zhalfirin, daughter, carom);
  });

  it("the next 1 damage to the en-Kor is dealt to target creature you control instead, by the same source", () => {
    const { s: s0, ap, opp } = setup([]);
    const n = putOnBattlefield(s0, ap, nomads);
    const w = putOnBattlefield(s0, ap, wall);
    const b = putOnBattlefield(s0, opp, bear());
    let s = toBlocks(s0, ap, [{ attacker: n, defender: opp }], [{ blocker: b, attacker: n }]);
    s = activate(s, ap, n, 0, [target(w)]);
    s = activate(s, ap, n, 0, [target(w)]);
    expect(s.objects[n]!.redirectNext?.reduce((a, r) => a + r.n, 0)).toBe(2);
    const r = toEndOfCombat(s);
    expect(r.asked).toEqual([]); // one source: nothing to choose
    expect(zone(r.s, n)).toBe("battlefield");
    expect(r.s.objects[w]!.damage).toBe(2);
    expect(r.s.log.filter((l) => /1 damage from Grizzly Bears to Nomads en-Kor is dealt to Wall of Wood instead/.test(l.text))).toHaveLength(2);
  });

  it("with more shields than damage, the rest stays for later this turn; it ends at cleanup", () => {
    const { s: s0, ap, opp } = setup([shock]);
    const n = putOnBattlefield(s0, ap, nomads);
    const w = putOnBattlefield(s0, ap, wall);
    const b = putOnBattlefield(s0, opp, bear({ name: "Small Bear", power: "1", toughness: "1" }));
    let s = toBlocks(s0, ap, [{ attacker: n, defender: opp }], [{ blocker: b, attacker: n }]);
    for (let i = 0; i < 3; i++) s = activate(s, ap, n, 0, [target(w)]);
    s = toEndOfCombat(s).s;
    expect(zone(s, n)).toBe("battlefield");
    expect(s.objects[w]!.damage).toBe(1);
    expect(s.objects[n]!.redirectNext?.reduce((a, r) => a + r.n, 0)).toBe(2);
    s = passUntil(s, "end");
    expect(s.objects[n]!.redirectNext?.length).toBeTruthy();
    s = passUntil(s, "upkeep");
    expect(s.objects[n]!.redirectNext).toBeUndefined();
  });

  it("does nothing if the creature it would go to is gone (rulings): the damage stays", () => {
    const { s: s0, ap, ids } = setup([shock, shock]);
    const n = putOnBattlefield(s0, ap, warrior);
    const z = putOnBattlefield(s0, ap, bear({ name: "Doomed Bear" }));
    let s = activate(s0, ap, n, 0, [target(z)]);
    s = cast(s, ap, ids[0]!, [target(z)]);
    expect(zone(s, z)).toBe("graveyard");
    s = cast(s, ap, ids[1]!, [target(n)]);
    expect(zone(s, n)).toBe("graveyard"); // all 2 damage stayed on the 2/2
  });

  it("when two sources deal damage at once, the en-Kor's controller chooses which is redirected (rulings on Outrider en-Kor)", () => {
    const { s: s0, ap, opp } = setup([]);
    const l = putOnBattlefield(s0, ap, lancers);
    const w = putOnBattlefield(s0, ap, wall);
    const r1 = putOnBattlefield(s0, opp, rats);
    const b = putOnBattlefield(s0, opp, bear());
    let s = toBlocks(s0, ap, [{ attacker: l, defender: opp }], [
      { blocker: r1, attacker: l },
      { blocker: b, attacker: l },
    ]);
    s = activate(s, ap, l, 0, [target(w)]);
    // Redirect the Rats' deathtouch damage: the Wall dies, the Lancers take the Bears' 2 and live.
    let r = toEndOfCombat(structuredClone(s), pickLabel(/Typhoid Rats/));
    expect(r.asked).toHaveLength(1);
    expect(r.asked[0]).toMatch(/^Lancers en-Kor: deal 1 damage to Wall of Wood instead of Lancers en-Kor/);
    expect(zone(r.s, w)).toBe("graveyard");
    expect(zone(r.s, l)).toBe("battlefield");
    // Redirect 1 of the Bears' damage: the Lancers still take the Rats' deathtouch damage.
    r = toEndOfCombat(structuredClone(s), pickLabel(/Grizzly Bears/));
    expect(zone(r.s, w)).toBe("battlefield");
    expect(r.s.objects[w]!.damage).toBe(1);
    expect(zone(r.s, l)).toBe("graveyard");
    // The bot (and the first option) keeps deathtouch damage off its own other creature.
    r = toEndOfCombat(structuredClone(s));
    expect(zone(r.s, w)).toBe("battlefield");
  });

  it("prevention shields ask too (CR 615.7), and the player chooses which shield applies first (CR 616.1)", () => {
    const { s: s0, ap, opp } = setup([]);
    const l = putOnBattlefield(s0, ap, lancers);
    const w = putOnBattlefield(s0, ap, wall);
    const r1 = putOnBattlefield(s0, opp, rats);
    const b = putOnBattlefield(s0, opp, bear());
    let s = toBlocks(s0, ap, [{ attacker: l, defender: opp }], [
      { blocker: r1, attacker: l },
      { blocker: b, attacker: l },
    ]);
    s.objects[l]!.preventNext = 1;
    // Prevent the deathtouch damage: the Lancers (3/3) take 2 and live.
    let r = toEndOfCombat(structuredClone(s), pickLabel(/Typhoid Rats/));
    expect(r.asked[0]).toMatch(/^Prevent 1 damage to Lancers en-Kor/);
    expect(zone(r.s, l)).toBe("battlefield");
    expect(r.s.objects[l]!.damage).toBe(2);
    r = toEndOfCombat(structuredClone(s), pickLabel(/Grizzly Bears/));
    expect(zone(r.s, l)).toBe("graveyard");

    // A prevention shield and a redirection shield, and only 1 damage: which applies?
    const { s: t0, ap: ap2, opp: opp2 } = setup([]);
    const l2 = putOnBattlefield(t0, ap2, lancers);
    const w2 = putOnBattlefield(t0, ap2, wall);
    const small = putOnBattlefield(t0, opp2, bear({ name: "Small Bear", power: "1", toughness: "1" }));
    let t = toBlocks(t0, ap2, [{ attacker: l2, defender: opp2 }], [{ blocker: small, attacker: l2 }]);
    t = activate(t, ap2, l2, 0, [target(w2)]);
    t.objects[l2]!.preventNext = 1;
    r = toEndOfCombat(structuredClone(t), pickLabel(/Wall of Wood/));
    expect(r.asked[0]).toMatch(/which shield applies first/);
    expect(r.s.objects[w2]!.damage).toBe(1);
    expect(r.s.objects[l2]!.preventNext).toBe(1);
    r = toEndOfCombat(structuredClone(t), pickLabel(/^Prevent/));
    expect(r.s.objects[w2]!.damage).toBe(0);
    expect(r.s.objects[l2]!.redirectNext).toHaveLength(1);
    void w;
  });

  it("redirected combat damage is still combat damage, dealt by its source (rulings): to a player, it's commander damage", () => {
    const { s: s0, ap, opp } = setup([]);
    const other = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    const z = putOnBattlefield(s0, opp, zhalfirin);
    const cmdr = putOnBattlefield(s0, ap, bear({ name: "Bear Commander", power: "3", toughness: "3" }), { commander: true });
    putOnBattlefield(s0, opp, plainsCard);
    putOnBattlefield(s0, opp, plainsCard);
    let s = toBlocks(s0, ap, [{ attacker: cmdr, defender: opp }], [{ blocker: z, attacker: cmdr }]);
    // The Crusader's controller activates it in the declare blockers step.
    s = act(s, { type: "passPriority", player: ap });
    expect(waitingOn(s)).not.toBe(ap);
    while (waitingOn(s) !== opp) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = activate(s, opp, z, 0, [{ kind: "player", id: other }]);
    const life = s.players[other]!.life;
    const r = toEndOfCombat(s);
    expect(r.s.players[other]!.life).toBe(life - 1);
    expect(r.s.players[other]!.commanderDamage[cmdr]).toBe(1);
    expect(r.s.objects[z]!.zone).toBe("graveyard"); // 2 damage still killed the 2/2
  });

  it("Carom and Daughter of Autumn: shields on another creature", () => {
    const { s: s0, ap, opp, ids } = setup([carom, shock]);
    const a = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    const w = putOnBattlefield(s0, ap, wall);
    let s = cast(s0, ap, ids[0]!, [target(a), target(w)]);
    const hand = s.players[ap]!.hand.length;
    expect(hand).toBeGreaterThan(0);
    s = cast(s, ap, ids[1]!, [target(a)]);
    expect(zone(s, a)).toBe("battlefield");
    expect(s.objects[a]!.damage).toBe(1);
    expect(s.objects[w]!.damage).toBe(1);

    const { s: t0, ap: ap2 } = setup([shock]);
    const d = putOnBattlefield(t0, ap2, daughter);
    const k = putOnBattlefield(t0, ap2, knight);
    let t = activate(t0, ap2, d, 0, [target(k)]);
    t = activate(t, ap2, d, 0, [target(k)]);
    const shockId = t.players[ap2]!.hand.find((id) => t.cards[t.objects[id]!.cardId]!.name === "Shock")!;
    t = cast(t, ap2, shockId, [target(k)]);
    expect(zone(t, k)).toBe("battlefield");
    expect(t.objects[k]!.damage).toBe(0);
    expect(t.objects[d]!.damage).toBe(2);
  });

  it("a bot redirects damage away from an en-Kor that would die in combat", () => {
    const { s: s0, ap, opp } = setup([]);
    const n = putOnBattlefield(s0, opp, nomads);
    const w = putOnBattlefield(s0, opp, wall);
    const b = putOnBattlefield(s0, ap, bear());
    let s = toBlocks(s0, ap, [{ attacker: b, defender: opp }], [{ blocker: n, attacker: b }]);
    const r = toEndOfCombat(s, bot, [opp]);
    s = r.s;
    expect(zone(s, n)).toBe("battlefield");
    expect(s.objects[w]!.damage).toBe(2);
  });
});
