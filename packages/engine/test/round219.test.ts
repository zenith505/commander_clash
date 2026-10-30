// Round 219: fresh cards from EDHREC rank 5,600 on: the Path of the ... sorceries (Will of the Planeswalkers), Maralen of
// the Mornsong and Mornsong Aria ("Players can't draw cards"), ...

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { nextRandom } from "../src/rng";
import { runStateBasedActions } from "../src/game";
import { applyAction, botActions, castProblem, controllerOf, invalidateCharacteristics, isFullySupported, objHasKeyword, objIsType, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const ply = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
/**
 * Everyone passes until the stack is empty, answering "you may" with `may` and trigger targets with `targets`; other
 * players' questions are answered as the bots would. Stops at any other question of `me`'s.
 */
const settle = (s: GameState, opts: { may?: boolean; targets?: TargetChoice[]; me?: PlayerId } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && opts.me !== undefined && p.player !== opts.me) s = act(s, botActions(s, p.player)[0]!);
    else if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: opts.may ?? true });
    else if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets ?? [] });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
/** The next random numbers come up `values` on a die of `sides` (a coin is 1 heads, 2 tails), in order (CR 706.1b). */
function rig(s: GameState, sides: number, values: number[]) {
  for (let st = 1; st < 50_000_000; st++) {
    const t = { rngState: st };
    if (values.every((v) => 1 + Math.floor(nextRandom(t) * sides) === v)) {
      s.rngState = st;
      return;
    }
  }
  throw new Error("no such seed");
}
const emptyHand = (s: GameState, pid: PlayerId) => s.players[pid]!.hand.splice(0).forEach((id) => (s.objects[id]!.zone = "exile"));
/** `me` votes for `word` when asked (the others vote as the bots do), until the vote is over. */
const voteThrough = (s: GameState, me: PlayerId, word: string) => {
  for (let i = 0; i < 20; i++) {
    s = settle(s, { me });
    const p = s.pending;
    if (p?.kind !== "chooseOption" || p.what !== "vote") return s;
    expect(p.options).toEqual(["planeswalk", "chaos"]);
    s = act(s, { type: "chooseOption", player: me, choice: word });
  }
  return s;
};

// Real oracle text (Scryfall).
const pathOfTheEnigm = card("Path of the Enigma", "Sorcery", "{4}{U}", {"cmc":5,"oracleText":"Target player draws four cards.\nWill of the Planeswalkers — Starting with you, each player votes for planeswalk or chaos. If planeswalk gets more votes, planeswalk. If chaos gets more votes or the vote is tied, chaos ensues.","keywords":["Will of the Planeswalkers"],"layout":"normal"});
const pathOfTheAnimi = card("Path of the Animist", "Sorcery", "{3}{G}", {"cmc":4,"oracleText":"Search your library for up to two basic land cards, put them onto the battlefield tapped, then shuffle.\nWill of the Planeswalkers — Starting with you, each player votes for planeswalk or chaos. If planeswalk gets more votes, planeswalk. If chaos gets more votes or the vote is tied, chaos ensues.","keywords":["Will of the Planeswalkers"],"layout":"normal"});
const pathOfTheGhost = card("Path of the Ghosthunter", "Sorcery", "{X}{1}{W}", {"cmc":2,"oracleText":"Create X 1/1 white Spirit creature tokens with flying.\nWill of the Planeswalkers — Starting with you, each player votes for planeswalk or chaos. If planeswalk gets more votes, planeswalk. If chaos gets more votes or the vote is tied, chaos ensues.","keywords":["Will of the Planeswalkers"],"layout":"normal"});
const pathOfThePyrom = card("Path of the Pyromancer", "Sorcery", "{4}{R}", {"cmc":5,"oracleText":"Discard all the cards in your hand. Add {R} for each card discarded this way, then draw that many cards plus one.\nWill of the Planeswalkers — Starting with you, each player votes for planeswalk or chaos. If planeswalk gets more votes, planeswalk. If chaos gets more votes or the vote is tied, chaos ensues.","keywords":["Will of the Planeswalkers"],"layout":"normal"});
const pathOfTheSchem = card("Path of the Schemer", "Sorcery", "{4}{B}", {"cmc":5,"oracleText":"Each player mills two cards. Then you put a creature card from a graveyard onto the battlefield under your control. It's an artifact in addition to its other types.\nWill of the Planeswalkers — Starting with you, each player votes for planeswalk or chaos. If planeswalk gets more votes, planeswalk. If chaos gets more votes or the vote is tied, chaos ensues.","keywords":["Will of the Planeswalkers","Mill"],"layout":"normal"});
const maralenOfTheMo = card("Maralen of the Mornsong", "Legendary Creature — Elf Wizard", "{1}{B}{B}", {"cmc":3,"oracleText":"Players can't draw cards.\nAt the beginning of each player's draw step, that player loses 3 life, searches their library for a card, puts it into their hand, then shuffles.","power":"2","toughness":"3","keywords":[],"layout":"normal"});
const mornsongAria = card("Mornsong Aria", "Legendary Enchantment", "{1}{B}{B}", {"cmc":3,"oracleText":"Players can't draw cards or gain life.\nAt the beginning of each player's draw step, that player loses 3 life, searches their library for a card, puts it into their hand, then shuffles.","keywords":[],"layout":"normal"});
const zilorthaStreng = card("Zilortha, Strength Incarnate", "Legendary Creature — Dinosaur", "{3}{R}{G}", {"cmc":5,"oracleText":"Trample\nLethal damage dealt to creatures you control is determined by their power rather than their toughness.","power":"7","toughness":"3","keywords":["Trample"],"layout":"normal"});
const ralZarekGuestL = card("Ral Zarek, Guest Lecturer", "Legendary Planeswalker — Ral", "{1}{B}{B}", {"cmc":3,"oracleText":"+1: Surveil 2.\n−1: Any number of target players each discard a card.\n−2: Return target creature card with mana value 3 or less from your graveyard to the battlefield.\n−7: Flip five coins. Target opponent skips their next X turns, where X is the number of coins that came up heads.","loyalty":"3","keywords":["Surveil"],"layout":"normal"});
const aluren = card("Aluren", "Enchantment", "{2}{G}{G}", {"cmc":4,"oracleText":"Any player may cast creature spells with mana value 3 or less without paying their mana costs and as though they had flash.","keywords":[],"layout":"normal"});
const kainTraitorous = card("Kain, Traitorous Dragoon", "Legendary Creature — Human Knight", "{2}{B}", {"cmc":3,"oracleText":"Jump — During your turn, Kain has flying.\nWhenever Kain deals combat damage to a player, that player gains control of Kain. If they do, you draw that many cards, create that many tapped Treasure tokens, then lose that much life.","power":"2","toughness":"4","keywords":["Jump","Treasure"],"layout":"normal"});
const galactusDevour = card("Galactus, Devourer of Worlds", "Legendary Creature — Elder Alien", "{10}", {"cmc":10,"oracleText":"Flying, trample, indestructible\nWhen Galactus enters, exile target permanent.\nInsatiable Hunger — Galactus attacks an opponent with the most life among your opponents each combat if able unless you control a creature named Silver Surfer, Galactus's Herald.","power":"12","toughness":"12","keywords":["Flying","Indestructible","Insatiable Hunger","Trample"],"layout":"normal"});

describe("round 219 cards", () => {
  it("compile", () => supported(pathOfTheEnigm, pathOfTheAnimi, pathOfTheGhost, pathOfThePyrom, pathOfTheSchem, maralenOfTheMo, mornsongAria));
  it("compile (2)", () => supported(zilorthaStreng, ralZarekGuestL, aluren, kainTraitorous, galactusDevour));
});

describe("Will of the Planeswalkers", () => {
  it("Path of the Enigma: the target draws four, then everyone votes; outside Planechase the result does nothing", () => {
    const { s: s0, ap, ids, opp } = setup([pathOfTheEnigm]);
    const hand = s0.players[opp]!.hand.length;
    const field = s0.battlefield.length;
    let s = run(s0, planCast(s0, ap, ids[0]!, [ply(opp)]));
    s = voteThrough(s, ap, "chaos");
    expect(s.stack.length).toBe(0);
    expect(s.pending).toBeFalsy();
    expect(s.players[opp]!.hand.length).toBe(hand + 4);
    expect(zone(s, ids[0]!)).toBe("graveyard");
    // No plane, no chaos ability: nothing else changed (CR 701.31a, 311.7).
    expect(s.battlefield.length).toBe(field);
    expect(s.log.some((l) => /chaos/.test(l.text))).toBe(true);
  });

  it("Path of the Pyromancer: adds {R} for each card discarded, then draws that many plus one", () => {
    const { s: s0, ap, ids } = setup([pathOfThePyrom, bear({ name: "Spare A" }), bear({ name: "Spare B" })]);
    // Keep only the three cards set up above.
    const p = s0.players[ap]!;
    for (const id of p.hand.filter((x) => !ids.includes(x))) s0.objects[id]!.zone = "exile";
    p.hand = [...ids];
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = voteThrough(s, ap, "planeswalk");
    expect(zone(s, ids[1]!)).toBe("graveyard");
    expect(zone(s, ids[2]!)).toBe("graveyard");
    expect(s.players[ap]!.manaPool.R).toBe(2);
    expect(s.players[ap]!.hand.length).toBe(3);
  });

  it("Path of the Pyromancer with an empty hand adds no mana and draws one card (rulings)", () => {
    const { s: s0, ap, ids } = setup([pathOfThePyrom]);
    const p = s0.players[ap]!;
    for (const id of p.hand.filter((x) => !ids.includes(x))) s0.objects[id]!.zone = "exile";
    p.hand = [...ids];
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = voteThrough(s, ap, "chaos");
    expect(s.players[ap]!.manaPool.R ?? 0).toBe(0);
    expect(s.players[ap]!.hand.length).toBe(1);
  });

  it("Path of the Schemer: each player mills two, then you put a creature card from any graveyard onto the battlefield, an artifact too", () => {
    const { s: s0, ap, ids, opp } = setup([pathOfTheSchem]);
    const theirs = into(s0, opp, bear({ name: "Their Yard Bear" }), "graveyard");
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = voteThrough(s, ap, "chaos");
    // The choice comes first (the mill already happened), then the vote.
    expect(s.pending?.kind).toBe("searchLibrary");
    if (s.pending?.kind !== "searchLibrary") return;
    expect(s.pending.cards).toContain(theirs);
    s = act(s, { type: "searchLibrary", player: ap, found: [theirs] });
    s = voteThrough(s, ap, "chaos");
    expect(zone(s, theirs)).toBe("battlefield");
    expect(s.objects[theirs]!.controller).toBe(ap);
    expect(objIsType(s, s.objects[theirs]!, "Artifact")).toBe(true);
    expect(objIsType(s, s.objects[theirs]!, "Creature")).toBe(true);
    // Two milled each; the bear left the opponent's, the spell itself is in yours.
    for (const pid of s.turnOrder) expect(s.players[pid]!.graveyard.length).toBe(pid === ap ? 3 : 2);
  });

  it("Path of the Animist and Path of the Ghosthunter do their first paragraph and the vote", () => {
    const { s: s0, ap, ids } = setup([pathOfTheGhost]);
    const field = s0.battlefield.filter((id) => s0.objects[id]!.controller === ap).length;
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 2));
    s = voteThrough(s, ap, "chaos");
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap).length).toBe(field + 2);
  });
});

describe("Maralen of the Mornsong and Mornsong Aria", () => {
  it("nobody draws: not in the draw step, not from effects, and an empty library loses nothing; each draw step tutors for 3 life", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, maralenOfTheMo);
    const life = s0.players[opp]!.life;
    const hand = s0.players[opp]!.hand.length;
    let s = passUntil(s0, "draw", opp);
    s = settle(s, { me: ap });
    s = passUntil(s, "main1", opp);
    // No draw for the turn; the trigger's search put one card in hand.
    expect(s.players[opp]!.hand.length).toBe(hand + 1);
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(s.log.some((l) => /can.t draw cards/.test(l.text))).toBe(true);
  });

  it("an empty library can't make anyone lose by drawing", () => {
    const { s: s0, ap, ids } = setup([card("Quick Study", "Instant", "{1}{U}", { oracleText: "Draw two cards." })]);
    putOnBattlefield(s0, ap, maralenOfTheMo);
    const p = s0.players[ap]!;
    for (const id of p.library) s0.objects[id]!.zone = "exile";
    p.library = [];
    const hand = p.hand.length;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s, { me: ap });
    expect(s.players[ap]!.lost).toBeFalsy();
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
  });

  it("nobody can choose to have another player draw (rulings)", () => {
    const gearhulk = card("Combustible Gearhulk", "Artifact Creature — Construct", "{4}{R}{R}", { power: "6", toughness: "6", oracleText: "First strike\nWhen this creature enters, target opponent may have you draw three cards. If the player doesn't, you mill three cards, then this creature deals damage to that player equal to the total mana value of those cards." });
    const { s: s0, ap, ids, opp } = setup([gearhulk]);
    putOnBattlefield(s0, ap, maralenOfTheMo);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s, { me: ap, targets: [ply(opp)] });
    // The opponent wasn't asked; the mill happened.
    expect(s.players[ap]!.graveyard.length).toBe(3);
  });

  it("Mornsong Aria: players can't gain life either", () => {
    const { s: s0, ap, ids } = setup([card("Heal Up", "Instant", "{W}", { oracleText: "You gain 5 life." })]);
    putOnBattlefield(s0, ap, mornsongAria);
    const life = s0.players[ap]!.life;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s, { me: ap });
    expect(s.players[ap]!.life).toBe(life);
  });
});

describe("Zilortha, Strength Incarnate", () => {
  it("lethal damage to your creatures is measured against their power; a 0-power creature needs 1 damage", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, zilorthaStreng);
    const wall = putOnBattlefield(s0, ap, bear({ name: "Low Wall", power: "1", toughness: "5" }));
    const glass = putOnBattlefield(s0, ap, bear({ name: "Glass Hitter", power: "4", toughness: "1" }));
    const zero = putOnBattlefield(s0, ap, bear({ name: "Zero Wall", power: "0", toughness: "4" }));
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Wall", power: "1", toughness: "5" }));
    for (const id of [wall, theirs]) s0.objects[id]!.damage = 1;
    s0.objects[glass]!.damage = 2;
    runStateBasedActions(s0);
    expect(zone(s0, wall)).toBe("graveyard");
    expect(zone(s0, glass)).toBe("battlefield");
    expect(zone(s0, zero)).toBe("battlefield");
    // Not the opponent's: toughness still.
    expect(zone(s0, theirs)).toBe("battlefield");
    s0.objects[zero]!.damage = 1;
    runStateBasedActions(s0);
    expect(zone(s0, zero)).toBe("graveyard");
  });

  it("a trampler blocked by a creature of Zilortha's controller assigns lethal damage by the blocker's power", () => {
    const { s: s0, ap, opp } = setup([]);
    const trampler = putOnBattlefield(s0, ap, bear({ name: "Big Trampler", power: "4", toughness: "4", keywords: ["Trample"], oracleText: "Trample" }));
    putOnBattlefield(s0, opp, zilorthaStreng);
    s0.objects[s0.battlefield.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === zilorthaStreng.name)!]!.tapped = true;
    const wall = putOnBattlefield(s0, opp, bear({ name: "Low Wall", power: "1", toughness: "5" }));
    const life = s0.players[opp]!.life;
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: trampler, defender: opp }] });
    for (let i = 0; i < 50 && s.step !== "endCombat"; i++) {
      const p = s.pending;
      if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: p.player === opp ? [{ blocker: wall, attacker: trampler }] : [] });
      else if (p) s = act(s, botActions(s, p.player)[0]!);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(zone(s, wall)).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(life - 3);
  });
});

describe("Ral Zarek, Guest Lecturer", () => {
  it("−7: flips five coins, and the target opponent skips their next turn for each heads", () => {
    const { s: s0, ap, opp } = setup([]);
    const r = putOnBattlefield(s0, ap, ralZarekGuestL);
    s0.objects[r]!.counters.loyalty = 7;
    rig(s0, 2, [1, 2, 1, 2, 2]);
    let s = run(s0, planActivate(s0, ap, r, 3, [ply(opp)]));
    s = settle(s, { me: ap });
    expect(s.players[opp]!.skips?.filter((x) => x.what === "turn")).toHaveLength(2);
    expect(s.log.some((l) => /2 came up heads/.test(l.text))).toBe(true);
  });
});

describe("Aluren", () => {
  it("any player may cast creature spells with mana value 3 or less for nothing, at instant speed only that way", () => {
    const { s: s0, ap, opp, ids } = setup([bear({ name: "Small Bear", manaCost: "{2}{G}" }), bear({ name: "Big Bear", manaCost: "{3}{G}" })]);
    putOnBattlefield(s0, opp, aluren);
    // In your main phase: free, any player's Aluren.
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { alt: "payZero" })).toBeNull();
    // Mana value 4: no.
    expect(castProblem(s0, ap, ids[1]!, undefined, undefined, undefined, undefined, undefined, { alt: "payZero" })).not.toBeNull();
    // At instant speed (a spell on the stack): only for free.
    let s = run(s0, planCast(s0, ap, ids[1]!));
    while (waitingOn(s) !== ap || !s.stack.length) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.stack.length).toBe(1);
    expect(castProblem(s, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { alt: "payZero" })).toBeNull();
    expect(castProblem(s, ap, ids[0]!)).toMatch(/sorcery speed/);
    const pool = { ...s.players[ap]!.manaPool };
    s = run(s, planCast(s, ap, ids[0]!, undefined, undefined, undefined, undefined, { alt: "payZero" }));
    expect(s.stack.length).toBe(2);
    expect(s.players[ap]!.manaPool).toEqual(pool);
  });
});

describe("Kain, Traitorous Dragoon", () => {
  it("dealing combat damage gives the player control of it; then you draw, make tapped Treasures and lose life, that many", () => {
    const { s: s0, ap, opp } = setup([]);
    const kain = putOnBattlefield(s0, ap, kainTraitorous);
    const hand = s0.players[ap]!.hand.length;
    const life = s0.players[ap]!.life;
    let s = passUntil(s0, "declareAttackers", ap);
    // Flying during your turn.
    expect(objHasKeyword(s, s.objects[kain]!, "Flying")).toBe(true);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: kain, defender: opp }] });
    for (let i = 0; i < 60 && s.step !== "endCombat"; i++) {
      const p = s.pending;
      if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
      else if (p) s = act(s, botActions(s, p.player)[0]!);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(controllerOf(s, s.objects[kain]!)).toBe(opp);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(s.players[ap]!.life).toBe(life - 2);
    const treasures = s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Treasure Token" && controllerOf(s, s.objects[id]!) === ap);
    expect(treasures).toHaveLength(2);
    expect(treasures.every((id) => s.objects[id]!.tapped)).toBe(true);
  });
});

describe("Galactus, Devourer of Worlds", () => {
  it("has to attack an opponent with the most life, unless you control Silver Surfer, Galactus's Herald", () => {
    const { s: s0, ap } = setup([]);
    const g = putOnBattlefield(s0, ap, galactusDevour);
    const [b, c, d] = s0.turnOrder.filter((p) => p !== ap);
    s0.players[b!]!.life = 30;
    s0.players[c!]!.life = 35;
    s0.players[d!]!.life = 35;
    let s = passUntil(s0, "declareAttackers", ap);
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [] })).toThrow(/must attack/);
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: g, defender: b! }] })).toThrow(/must attack/);
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: g, defender: d! }] })).not.toThrow();
    // The bot attacks one of them too.
    const bot = botActions(s, ap).find((a) => a.type === "declareAttackers");
    expect(bot?.type === "declareAttackers" && bot.attacks.find((a) => a.attacker === g)?.defender).toSatisfy((x: unknown) => x === c || x === d);
    // With Silver Surfer, no requirement.
    const s2 = passUntil(s0, "main1", ap);
    putOnBattlefield(s2, ap, bear({ name: "Silver Surfer, Galactus's Herald", supertypes: ["Legendary"] } as Partial<CardDef>));
    s = passUntil(s2, "declareAttackers", ap);
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [] })).not.toThrow();
  });
});
