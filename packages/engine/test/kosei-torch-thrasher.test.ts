// Combat damage to an opponent copied to each other opponent: Kosei, Penitent Warlord (a granted trigger while it's
// enchanted, equipped and has a counter), Human Torch (an intervening-if "you've cast a noncreature spell this turn",
// CR 603.4, and a paid delayed trigger, CR 603.7) and Parapet Thrasher ("one or more Dragons", modes not chosen this
// turn, CR 700.2).

import { describe, expect, it } from "vitest";
import { act, card, cast, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { botActions, compileCard, isFullySupported, objHasKeyword, parseManaCost, planActivate, planMana, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const kosei = card("Kosei, Penitent Warlord", "Legendary Creature — Ogre Samurai", "{1}{G}{G}", { power: "0", toughness: "5", oracleText: 'As long as Kosei is enchanted, equipped, and has a counter on it, Kosei has "Whenever Kosei deals combat damage to an opponent, you draw that many cards and Kosei deals that much damage to each other opponent."' });
const torch = card("Human Torch", "Legendary Creature — Human Hero", "{3}{R}", { power: "3", toughness: "2", oracleText: "At the beginning of combat on your turn, if you've cast a noncreature spell this turn, Human Torch gains flying, double strike, and haste until end of turn.\nWhenever Human Torch attacks, you may pay {R}{G}{W}{U}. If you do, until end of turn, whenever he deals combat damage to an opponent, he deals that much damage to each other opponent." });
const thrasher = card("Parapet Thrasher", "Creature — Dragon", "{2}{R}{R}", { power: "4", toughness: "3", keywords: ["Flying"], oracleText: "Flying\nWhenever one or more Dragons you control deal combat damage to an opponent, choose one that hasn't been chosen this turn —\n• Destroy target artifact that opponent controls.\n• This creature deals 4 damage to each other opponent.\n• Exile the top card of your library. You may play it this turn." });
const bonesplitter = card("Bonesplitter", "Artifact — Equipment", "{1}", { keywords: ["Equip"], oracleText: "Equipped creature gets +2/+0.\nEquip {1}" });
const aura = card("Aura Test", "Enchantment — Aura", "{W}", { keywords: ["Enchant"], oracleText: "Enchant creature" });
const shivanDragon = card("Shivan Dragon", "Creature — Dragon", "{4}{R}{R}", { power: "5", toughness: "5", keywords: ["Flying"], oracleText: "Flying\n{R}: This creature gets +1/+0 until end of turn." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const seeker = card("Seeker of Insight", "Creature — Human Wizard", "{1}{U}", { power: "1", toughness: "3", oracleText: "{T}: Draw a card, then discard a card. Activate only if you've cast a noncreature spell this turn." });
const ornithopter = card("Ornithopter", "Artifact Creature — Thopter", "{0}", { power: "0", toughness: "2", keywords: ["Flying"], oracleText: "Flying" });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
type Answer = (s: GameState) => Action | Action[] | null;
const bot = (s: GameState) => botActions(s, waitingOn(s)!)[0]!;

/** Attack from main 1, nobody blocks, answer what combat asks with `answer` (else the bot), to the end of combat. */
function fight(s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[], answer: Answer = () => null) {
  s = passUntil(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks });
  for (let i = 0; i < 300 && !(s.step === "endCombat" && !s.pending && !s.stack.length); i++) {
    const pend = s.pending;
    if (pend?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pend.player, blocks: [] });
    else if (pend) for (const a of [(pend.player === ap ? answer(s) : null) ?? bot(s)].flat()) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
}
const lives = (s: GameState) => s.turnOrder.map((p) => s.players[p]!.life);

describe("Kosei, Penitent Warlord", () => {
  function kosei0(counter: boolean) {
    const { s, ap, opp } = setup([]);
    const k = putOnBattlefield(s, ap, kosei);
    s.objects[putOnBattlefield(s, ap, bonesplitter)]!.attachedTo = k;
    s.objects[putOnBattlefield(s, ap, aura)]!.attachedTo = k;
    if (counter) s.objects[k]!.counters["+1/+1"] = 1;
    return { s, ap, opp, k };
  }

  it("enchanted, equipped and with a counter: draws that many and deals that much to each other opponent", () => {
    supported(kosei);
    const { s: s0, ap, opp, k } = kosei0(true);
    const hand = s0.players[ap]!.hand.length;
    const others = s0.turnOrder.filter((p) => p !== ap && p !== opp);
    const s = fight(s0, ap, [{ attacker: k, defender: opp }]);
    expect(s.players[opp]!.life).toBe(37); // 0 + 1 counter + 2 Bonesplitter
    for (const p of others) expect(s.players[p]!.life).toBe(37);
    expect(s.players[ap]!.hand.length).toBe(hand + 3);
  });

  it("without the counter it doesn't have the ability", () => {
    const { s: s0, ap, opp, k } = kosei0(false);
    const hand = s0.players[ap]!.hand.length;
    const s = fight(s0, ap, [{ attacker: k, defender: opp }]);
    expect(s.players[opp]!.life).toBe(38);
    expect(lives(s).filter((l) => l === 40)).toHaveLength(3);
    expect(s.players[ap]!.hand.length).toBe(hand);
  });
});

describe("Human Torch", () => {
  it("parses both abilities", () => {
    supported(torch);
    const c = compileCard(torch);
    expect(c.triggers).toHaveLength(2);
    expect(c.triggers[0]!.ifCond).toBeTruthy();
  });

  it("no noncreature spell cast this turn: no keywords at the beginning of combat", () => {
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, torch);
    const s = passUntil(s0, "declareAttackers", ap);
    expect(objHasKeyword(s, s.objects[t]!, "Double strike")).toBe(false);
  });

  it("after a noncreature spell: flying, double strike and haste; paying {R}{G}{W}{U} copies its combat damage to each other opponent", () => {
    const { s: s0, ap, opp, ids } = setup([shock]);
    const t = putOnBattlefield(s0, ap, torch, { sick: true });
    const others = s0.turnOrder.filter((p) => p !== ap && p !== opp);
    let s = cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]);
    while (s.stack.length) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.players[opp]!.life).toBe(38);
    s = passUntil(s, "declareAttackers", ap);
    for (const k of ["Flying", "Double strike", "Haste"]) expect(objHasKeyword(s, s.objects[t]!, k), k).toBe(true);
    s = fight(s, ap, [{ attacker: t, defender: opp }], (st) => (st.pending?.kind === "chooseMay" ? [...planMana(st, ap, parseManaCost("{R}{G}{W}{U}"))!, { type: "chooseMay", player: ap, yes: true }] : null));
    expect(s.players[opp]!.life).toBe(32); // 2 from Shock, 3 + 3 double strike
    for (const p of others) expect(s.players[p]!.life).toBe(34);
  });

  it("declining to pay: only the attacked opponent takes damage", () => {
    const { s: s0, ap, opp } = setup([]);
    const t = putOnBattlefield(s0, ap, torch);
    const s = fight(s0, ap, [{ attacker: t, defender: opp }], (st) => (st.pending?.kind === "chooseMay" ? { type: "chooseMay", player: ap, yes: false } : null));
    expect(s.players[opp]!.life).toBe(37);
    expect(lives(s).filter((l) => l === 40)).toHaveLength(3);
  });
});

describe("if you've cast a noncreature spell this turn", () => {
  it("Seeker of Insight: not before a noncreature spell, nor after only a creature spell", () => {
    supported(seeker);
    const bears = card("Grizzly Bears", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" });
    const { s: s0, ap, opp, ids } = setup([bears, shock]);
    const sk = putOnBattlefield(s0, ap, seeker);
    expect(planActivate(s0, ap, sk, 0)).toBeNull();
    let s = cast(s0, ap, ids[0]!);
    while (s.stack.length) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(planActivate(s, ap, sk, 0)).toBeNull();
    s = cast(s, ap, ids[1]!, [{ kind: "player", id: opp }]);
    expect(planActivate(s, ap, sk, 0)).not.toBeNull();
  });
});

describe("Parapet Thrasher", () => {
  it("one trigger per opponent dealt damage; the second can't repeat the first's mode", () => {
    supported(thrasher);
    expect(compileCard(thrasher).triggers[0]).toMatchObject({ toOpponent: true, body: { modal: { unchosen: "turn" } } });
    const { s: s0, ap, opp } = setup([]);
    const opp2 = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    const opp3 = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 3) % 4]!;
    const th = putOnBattlefield(s0, ap, thrasher);
    const dr = putOnBattlefield(s0, ap, shivanDragon);
    const thopter = putOnBattlefield(s0, opp, ornithopter);
    const thopter2 = putOnBattlefield(s0, opp2, ornithopter);
    const legalSeen: boolean[][] = [];
    const s = fight(s0, ap, [{ attacker: th, defender: opp }, { attacker: dr, defender: opp2 }], (st) => {
      const p = st.pending;
      if (p?.kind === "chooseModes") {
        legalSeen.push([...p.legal!]);
        // First: 4 damage to each opponent other than the one dealt damage; second: destroy that opponent's artifact.
        return { type: "chooseModes", player: ap, modes: legalSeen.length === 1 ? [1] : [0] };
      }
      // "Target artifact that opponent controls": only the one the Dragons damaged (the other is illegal).
      if (p?.kind === "chooseTargets") {
        expect(() => act(st, { type: "chooseTargets", player: ap, targets: [target(thopter)] })).toThrow();
        return { type: "chooseTargets", player: ap, targets: [target(thopter2)] };
      }
      return null;
    });
    expect(legalSeen).toHaveLength(2);
    expect(legalSeen[0]).toEqual([true, true, true]);
    expect(legalSeen[1]).toEqual([true, false, true]);
    // The first trigger (for the opponent the Thrasher hit) dealt 4 to each other opponent; the second destroyed the
    // artifact of the opponent the Shivan Dragon hit.
    expect([s.players[opp]!.life, s.players[opp2]!.life, s.players[opp3]!.life]).toEqual([36, 31, 36]);
    expect(s.objects[thopter2]!.zone).toBe("graveyard");
    expect(s.objects[thopter]!.zone).toBe("battlefield");
  });
});
