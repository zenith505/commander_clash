// Lane B, round 1: the least played cards first, working up the popularity list (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, card, pt, putOnBattlefield, setup } from "./helpers";
import { botActions, compileCard, doesNothingNow, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; "you may" questions get `yes`. Stops at any other question. */
const resolveAll = (s: GameState, yes = true) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending?.kind === "chooseMay"); i++) {
    if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: s.pending.player, yes });
    else if (s.pending) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const next = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % s.turnOrder.length]!;
const zone = (s: GameState, id: string) => s.objects[id]?.zone;

// Real oracle text (Scryfall).
const garbageFire = card("Garbage Fire", "Instant", "{2}{R}", {cmc: 3,oracleText: "Reveal this card as you draft it and note how many cards you've drafted this draft round, including this card.\nGarbage Fire deals damage to target creature equal to the highest number you noted for cards named Garbage Fire."});
const custodi = card("Custodi Peacekeeper", "Creature — Human Cleric", "{2}{W}", {cmc: 3,power: "2",toughness: "3",oracleText: "Reveal this card as you draft it and note how many cards you've drafted this draft round, including this card.\n{W}, {T}: Tap target creature with power less than or equal to the highest number you noted for cards named Custodi Peacekeeper."});
const regicide = card("Regicide", "Instant", "{B}", {cmc: 1,oracleText: "Reveal this card as you draft it. The player to your right chooses a color, you choose another color, then the player to your left chooses a third color.\nDestroy target creature that's one or more of the colors chosen as you drafted cards named Regicide."});
const smuggler = card("Smuggler Captain", "Creature — Human Pirate", "{3}{B}", {cmc: 4,power: "2",toughness: "2",oracleText: "Draft this card face up.\nAs you draft a card, you may reveal it, note its name, then turn this card face down.\nWhen this creature enters, you may search your library for a card with a name you noted for cards named Smuggler Captain, reveal it, put it into your hand, then shuffle."});
const searcher = card("Aether Searcher", "Artifact Creature — Construct", "{7}", {cmc: 7,power: "6",toughness: "4",oracleText: "Reveal this card as you draft it. Reveal the next card you draft and note its name.\nWhen this creature enters, you may search your hand and/or library for a card with a name noted as you drafted cards named Aether Searcher. You may cast it without paying its mana cost. If you search your library this way, shuffle."});
const pyretic = card("Pyretic Hunter", "Creature — Elemental Cat", "{4}{R}", {cmc: 5,power: "0",toughness: "0",keywords: ["Menace"],oracleText: "Reveal this card as you draft it and note how many cards you've drafted this draft round, including this card.\nMenace (This creature can't be blocked except by two or more creatures.)\nThis creature enters with X +1/+1 counters on it, where X is the highest number you noted for cards named Pyretic Hunter."});
const grinder = card("Cogwork Grinder", "Artifact Creature — Construct", "{6}", {cmc: 6,power: "0",toughness: "0",oracleText: "Draft this card face up.\nAs you draft a card, you may remove it from the draft face down. (Those cards aren't in your card pool.)\nThis creature enters with X +1/+1 counters on it, where X is the number of cards you removed from the draft with cards named Cogwork Grinder."});
const chimera = card("Volatile Chimera", "Creature — Elemental Chimera", "{2}{R}", {cmc: 3,power: "3",toughness: "2",oracleText: "Before you shuffle your deck to start the game, you may reveal this card from your deck and exile three or more creature cards you drafted that aren't in your deck.\n{1}{R}: Choose a card at random you exiled with cards named Volatile Chimera. This creature becomes a copy of that card, except it has this ability."});
const paliano = card("Paliano, the High City", "Legendary Land", "", {cmc: 0,oracleText: "Reveal this card as you draft it. The player to your right chooses a color, you choose another color, then the player to your left chooses a third color.\n{T}: Add one mana of any color chosen as you drafted cards named Paliano, the High City."});
const banneret = card("Noble Banneret", "Creature — Human Knight", "{2}{W}{W}", {cmc: 4,power: "3",toughness: "3",oracleText: "Draft this card face up.\nAs you draft a creature card, you may reveal it, note its name, then turn this card face down.\nAs long as you control one or more creatures with a name you noted for cards named Noble Banneret, this creature and those creatures get +1/+1 and have lifelink."});
const phantasm = card("Spire Phantasm", "Creature — Gargoyle Illusion", "{2}{U}{U}", {cmc: 4,power: "3",toughness: "2",keywords: ["Flying"],oracleText: "Reveal this card as you draft it. The next time a player drafts a card from this booster pack, guess that card's name. Then that player reveals the drafted card.\nFlying\nWhen this creature enters, if you guessed correctly for a card named Spire Phantasm, draw a card."});
const savant = card("Arcane Savant", "Creature — Human Wizard", "{3}{U}{U}", {cmc: 5,power: "3",toughness: "3",oracleText: "Before you shuffle your deck to start the game, you may reveal this card from your deck and exile an instant or sorcery card you drafted that isn't in your deck.\nWhen this creature enters, copy a card you exiled with cards named Arcane Savant. You may cast the copy without paying its mana cost."});
const tracker = card("Cogwork Tracker", "Artifact Creature — Dog Construct", "{4}", {cmc: 4,power: "4",toughness: "4",oracleText: "Reveal this card as you draft it and note the player who passed it to you.\nThis creature attacks each combat if able.\nThis creature attacks a player you noted for cards named Cogwork Tracker each combat if able."});
const caller = card("Caller of the Untamed", "Creature — Elf Shaman", "{3}{G}", {cmc: 4,power: "2",toughness: "4",oracleText: "Before you shuffle your deck to start the game, you may reveal this card from your deck and exile a creature card you drafted that isn't in your deck.\n{X}, {T}: Create a token that's a copy of a card you exiled with cards named Caller of the Untamed. X is the mana value of that card."});
const vanguard = card("Paliano Vanguard", "Creature — Human Soldier", "{1}{W}", {cmc: 2,power: "2",toughness: "2",oracleText: "Draft this card face up.\nAs you draft a creature card, you may reveal it, note its creature types, then turn this card face down.\nOther creatures you control of a type you noted for cards named Paliano Vanguard get +1/+1."});
const animus = card("Animus of Predation", "Creature — Avatar", "{4}{G}", {cmc: 5,power: "4",toughness: "4",oracleText: "Draft this card face up.\nAs you draft a card, you may remove it from the draft face up. (It isn't in your card pool.)\nIf you removed a creature card with flying from the draft with cards named Animus of Predation, this creature has flying. The same is true for first strike, double strike, deathtouch, haste, hexproof, indestructible, lifelink, menace, reach, and vigilance."});
const loreSeeker = card("Lore Seeker", "Artifact Creature — Construct", "{2}", {cmc: 2,power: "2",toughness: "2",oracleText: "Reveal this card as you draft it. After you draft this card, you may add a booster pack to the draft. (Your next pick is from that booster pack. Pass it to the next player and it's drafted this draft round.)"});

describe("Conspiracy's draft-matters cards, with no draft before the game (CR 905.2, rulings)", () => {
  it("are fully supported", () => supported(garbageFire, custodi, regicide, smuggler, searcher, pyretic, grinder, chimera, paliano, banneret, phantasm, savant, tracker, caller, vanguard, animus, loreSeeker));

  it("Garbage Fire: the highest noted number is 0, so it deals no damage", () => {
    let { s, ap, ids } = setup([garbageFire]);
    const b = putOnBattlefield(s, next(s, ap), card("Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(b)])));
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(s.objects[b]!.damage).toBe(0);
    expect(zone(s, b)).toBe("battlefield");
  });

  it("Custodi Peacekeeper taps only creatures with power 0 or less", () => {
    let { s, ap } = setup([]);
    const c = putOnBattlefield(s, ap, custodi);
    const wall = putOnBattlefield(s, next(s, ap), card("Wall", "Creature — Wall", "{1}", { power: "0", toughness: "4" }));
    const bear = putOnBattlefield(s, next(s, ap), card("Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    expect(planActivate(s, ap, c, 0, [tgt(bear)])).toBeNull();
    s = resolveAll(run(s, planActivate(s, ap, c, 0, [tgt(wall)])));
    expect(s.objects[wall]!.tapped).toBe(true);
  });

  it("Regicide can't be cast: no colors were chosen, so there's no legal target", () => {
    const { s, ap, ids } = setup([regicide]);
    const b = putOnBattlefield(s, next(s, ap), card("Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    expect(planCast(s, ap, ids[0]!, [tgt(b)])).toBeNull();
    expect(planCast(s, ap, ids[0]!)).toBeNull();
  });

  for (const def of [smuggler, searcher])
    it(`${def.name}: you may search your library, which finds nothing and is shuffled`, () => {
      let { s, ap, ids } = setup([def]);
      const hand = s.players[ap]!.hand.length;
      const lib = [...s.players[ap]!.library].sort();
      s = run(s, planCast(s, ap, ids[0]!));
      for (let i = 0; i < 20 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      expect(s.pending?.kind).toBe("chooseMay");
      s = resolveAll(s, true);
      expect(s.players[ap]!.hand.length).toBe(hand - 1);
      expect([...s.players[ap]!.library].sort()).toEqual(lib);
      // It was searched (Archive Trap, "whenever an opponent searches their library"), finding nothing.
      expect(s.turnLog?.searched).toContain(ap);
    });

  it("Pyretic Hunter and Cogwork Grinder enter with no counters (X is 0)", () => {
    let { s, ap, ids } = setup([pyretic, grinder]);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.counters["+1/+1"] ?? 0).toBe(0);
    // A 0/0 is put into its owner's graveyard (CR 704.5f).
    expect(zone(s, ids[0]!)).toBe("graveyard");
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(zone(s, ids[1]!)).toBe("graveyard");
  });

  it("Noble Banneret, Paliano Vanguard and Animus of Predation get nothing from noted names, types or removed cards", () => {
    const { s, ap } = setup([]);
    const nb = putOnBattlefield(s, ap, banneret);
    const pv = putOnBattlefield(s, ap, vanguard);
    const an = putOnBattlefield(s, ap, animus);
    const other = putOnBattlefield(s, ap, card("Knight", "Creature — Human Knight", "{1}{W}", { power: "2", toughness: "2" }));
    expect([pt(s, nb), pt(s, pv), pt(s, an), pt(s, other)]).toEqual(["3/3", "2/2", "4/4", "2/2"]);
    expect(compileCard(animus).statics).toEqual([]);
  });

  it("Spire Phantasm: nobody guessed, so its enters ability doesn't trigger (CR 603.4)", () => {
    let { s, ap, ids } = setup([phantasm]);
    const hand = s.players[ap]!.hand.length;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
  });

  it("Arcane Savant's enters ability triggers and does nothing", () => {
    let { s, ap, ids } = setup([savant]);
    s = run(s, planCast(s, ap, ids[0]!));
    for (let i = 0; i < 20 && !s.stack.some((x) => x.kind === "ability"); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.stack.some((x) => x.kind === "ability")).toBe(true);
    const hand = s.players[ap]!.hand.length;
    s = resolveAll(s);
    expect(s.stack.length).toBe(0);
    expect(s.players[ap]!.hand.length).toBe(hand);
  });

  it("Volatile Chimera can be activated, does nothing, and bots leave it alone", () => {
    let { s, ap } = setup([]);
    const v = putOnBattlefield(s, ap, chimera);
    const ab = compileCard(chimera).activated[0]!;
    expect(doesNothingNow(s, v, ab.body)).toBe(true);
    s = resolveAll(run(s, planActivate(s, ap, v, 0)));
    expect(pt(s, v)).toBe("3/2");
    expect(s.cards[s.objects[v]!.cardId]!.name).toBe("Volatile Chimera");
    expect(botActions(s, ap).some((a) => a.type === "activate" && "objectId" in a && a.objectId === v)).toBe(false);
  });

  it("Paliano, the High City adds no mana: tapping it is an ability that does nothing (CR 605.1a)", () => {
    let { s, ap } = setup([]);
    const p = putOnBattlefield(s, ap, paliano);
    expect(compileCard(paliano).mana).toEqual([]);
    const pool = JSON.stringify(s.players[ap]!.manaPool);
    s = resolveAll(run(s, planActivate(s, ap, p, 0)));
    expect(s.objects[p]!.tapped).toBe(true);
    expect(JSON.stringify(s.players[ap]!.manaPool)).toBe(pool);
  });

  it("Cogwork Tracker attacks each combat if able; there's no noted player", () => {
    const c = compileCard(tracker);
    expect(c.statics.flatMap((st) => st.mods.map((m) => m.kind))).toEqual(["attacksIfAble"]);
  });

  it("Caller of the Untamed has no card exiled with it, so no X to choose: its ability can't be activated", () => {
    expect(compileCard(caller).activated).toEqual([]);
  });

  it("Lore Seeker's draft ability does nothing in a game", () => {
    const c = compileCard(loreSeeker);
    expect([c.triggers, c.activated, c.statics]).toEqual([[], [], []]);
  });
});
