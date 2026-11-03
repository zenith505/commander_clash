// Lane B, round 95: unsupported cards from the bottom of the popularity list (`npm run popular -- --least`). Psychogenic
// Probe, Widespread Panic, Teferi's Reproach, Nael, Avizoa Aeronaut, Aethermage's Touch, Bag of Tricks, Bold Plagiarist,
// Storage Matrix, Timesifter and Fires of Invention.

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { botActions, castProblem, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, shuffleLibrary, tapPermanent, waitingOn, type Action, type CardDef, type GameState, type PendingDecision, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
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
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = []) => run(s, planCast(s, pid, id, targets, undefined, "auto"));
const choose = (s: GameState, choice: string) => act(s, { type: "chooseOption", player: s.pending!.player, choice });
const pend = (s: GameState) => s.pending as Extract<PendingDecision, { kind: "chooseOption" }>;
/** Moves a new card for `def` into `pid`'s hand. */
const inHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Puts a new card for `def` on top of `pid`'s library. */
const onTop = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  invalidateCharacteristics(s);
  return id;
};
/** Empties `pid`'s hand (into exile). */
const emptyHand = (s: GameState, pid: PlayerId) => {
  for (const id of [...s.players[pid]!.hand]) {
    s.players[pid]!.hand.splice(s.players[pid]!.hand.indexOf(id), 1);
    s.objects[id]!.zone = "exile";
    s.players[pid]!.exile.push(id);
  }
  invalidateCharacteristics(s);
};
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target.", colors: ["R"] });
const seek = card("Test Seek", "Sorcery", "{G}", { oracleText: "Search your library for a basic land card, reveal it, put it into your hand, then shuffle.", colors: ["G"] });
const jumble = card("Test Jumble", "Instant", "{U}", { oracleText: "Target player shuffles their library.", colors: ["U"] });
const grow = card("Test Growth", "Instant", "{G}", { oracleText: "Put a +1/+1 counter on target creature.", colors: ["G"] });
const wings = card("Test Wings", "Instant", "{U}", { oracleText: "Put a flying counter on target creature.", colors: ["U"] });
const drain = (): CardDef => card("Test Drain", "Instant", "{B}", { oracleText: "Each opponent loses 3 life.", colors: ["B"] });
const probe = (): CardDef => ({"oracleId":"1beb81a8-b4aa-4964-93d2-2b5414fc6ce3","name":"Psychogenic Probe","manaCost":"{2}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"Whenever a spell or ability causes a player to shuffle their library, this artifact deals 2 damage to that player.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/8/e83d1ed5-3a49-4cfa-bad2-e342ef28649e.jpg?1783944507","artUrl":"https://cards.scryfall.io/art_crop/front/e/8/e83d1ed5-3a49-4cfa-bad2-e342ef28649e.jpg?1783944507","commanderLegal":"legal","set":"mrd","releasedAt":"2003-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const panic = (): CardDef => ({"oracleId":"853a3c2b-3d37-453a-8a77-4d90bd3a1cb7","name":"Widespread Panic","manaCost":"{2}{R}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever a spell or ability causes its controller to shuffle their library, that player puts a card from their hand on top of their library.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/9/d9e1b37f-8168-4dc0-858f-434ee96ff748.jpg?1783939664","artUrl":"https://cards.scryfall.io/art_crop/front/d/9/d9e1b37f-8168-4dc0-858f-434ee96ff748.jpg?1783939664","commanderLegal":"legal","set":"c13","releasedAt":"2013-11-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const reproach = (): CardDef => ({"oracleId":"9381b4a5-a8e0-412d-bc7f-ae15afa0f135","name":"Teferi's Reproach","manaCost":"{2}{W}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Choose target opponent. Until that player's next turn, they gain protection from everything and their life total can't change. All nonland permanents they control phase out. (While they're phased out, they're treated as though they don't exist. They phase in before that player untaps during their next untap step.)\nExile Teferi's Reproach.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/b/fb4a1f07-4c1f-4d08-af5d-17f1bb77f9e5.jpg?1789644215","artUrl":"https://cards.scryfall.io/art_crop/front/f/b/fb4a1f07-4c1f-4d08-af5d-17f1bb77f9e5.jpg?1789644215","commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const nael = (): CardDef => ({"oracleId":"6044696a-0f64-474a-840e-8ed4dbd30221","name":"Nael, Avizoa Aeronaut","manaCost":"{2}{G}{U}","cmc":4,"typeLine":"Legendary Creature — Elf Scout","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Elf","Scout"],"oracleText":"Flying\nDomain — Whenever Nael deals combat damage to a player, look at the top X cards of your library, where X is the number of basic land types among lands you control. Put up to one of them on top of your library and the rest on the bottom in a random order. Then if there are five basic land types among lands you control, draw a card.","power":"2","toughness":"4","colors":["G","U"],"colorIdentity":["G","U"],"keywords":["Flying","Domain"],"imageUrl":"https://cards.scryfall.io/normal/front/5/c/5cd2081c-d53b-4a5e-976b-0b28465c0be8.jpg?1783921214","artUrl":"https://cards.scryfall.io/art_crop/front/5/c/5cd2081c-d53b-4a5e-976b-0b28465c0be8.jpg?1783921214","commanderLegal":"legal","set":"dmu","releasedAt":"2022-09-09","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const touch = (): CardDef => ({"oracleId":"15692698-ef57-4672-bf76-5fe4a00c693a","name":"Aethermage's Touch","manaCost":"{2}{W}{U}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Reveal the top four cards of your library. You may put a creature card from among them onto the battlefield. It gains \"At the beginning of your end step, return this creature to its owner's hand.\" Then put the rest of the cards revealed this way on the bottom of your library in any order.","colors":["U","W"],"colorIdentity":["U","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/d/5debdea2-538f-405b-87b0-3789dba95e8e.jpg?1783943406","artUrl":"https://cards.scryfall.io/art_crop/front/5/d/5debdea2-538f-405b-87b0-3789dba95e8e.jpg?1783943406","commanderLegal":"legal","set":"dis","releasedAt":"2006-05-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bag = (): CardDef => ({"oracleId":"f14ce7d7-6cfa-4f88-a381-d6e912c18b5d","name":"Bag of Tricks","manaCost":"{1}{G}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{4}{G}, {T}: Roll a d8. Reveal cards from the top of your library until you reveal a creature card with mana value equal to the result. Put that card onto the battlefield and the rest on the bottom of your library in a random order.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/0/f0b22a3e-90b0-4dde-8a63-789bab92ba01.jpg?1783926244","artUrl":"https://cards.scryfall.io/art_crop/front/f/0/f0b22a3e-90b0-4dde-8a63-789bab92ba01.jpg?1783926244","commanderLegal":"legal","set":"afc","releasedAt":"2021-07-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const plagiarist = (): CardDef => ({"oracleId":"85277284-1eba-4f87-bf7b-abf1dcbb7691","name":"Bold Plagiarist","manaCost":"{3}{B}","cmc":4,"typeLine":"Creature — Vampire Rogue","supertypes":[],"types":["Creature"],"subtypes":["Vampire","Rogue"],"oracleText":"Flash\nWhenever an opponent puts one or more counters on a creature they control, they put the same number and kind of counters on this creature.","power":"2","toughness":"2","colors":["B"],"colorIdentity":["B"],"keywords":["Flash"],"imageUrl":"https://cards.scryfall.io/normal/front/b/0/b0e0f5f6-8b63-4c63-bd1d-445613bc106b.jpg?1783927598","artUrl":"https://cards.scryfall.io/art_crop/front/b/0/b0e0f5f6-8b63-4c63-bd1d-445613bc106b.jpg?1783927598","commanderLegal":"legal","set":"c21","releasedAt":"2021-04-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const matrix = (): CardDef => ({"oracleId":"03136fe1-17e2-4b1c-860a-dc6373c8fdb5","name":"Storage Matrix","manaCost":"{3}","cmc":3,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"As long as this artifact is untapped, each player chooses artifact, creature, or land during their untap step. That player can untap only permanents of the chosen type this step.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/7/77378279-024c-4c36-b5bf-6294fe5c32f5.jpg?1783946055","artUrl":"https://cards.scryfall.io/art_crop/front/7/7/77378279-024c-4c36-b5bf-6294fe5c32f5.jpg?1783946055","commanderLegal":"legal","set":"uds","releasedAt":"1999-06-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const timesifter = (): CardDef => ({"oracleId":"99f8805f-6618-4838-a4e7-a3660e3b087f","name":"Timesifter","manaCost":"{5}","cmc":5,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"At the beginning of each upkeep, each player exiles the top card of their library. The player who exiled the card with the greatest mana value takes an extra turn after this one. If two or more players' cards are tied for greatest, the tied players repeat this process until the tie is broken.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/6/561cab0e-8874-4534-bf79-0c1488a9f0a5.jpg?1783944498","artUrl":"https://cards.scryfall.io/art_crop/front/5/6/561cab0e-8874-4534-bf79-0c1488a9f0a5.jpg?1783944498","commanderLegal":"legal","set":"mrd","releasedAt":"2003-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const fires = (): CardDef => ({"oracleId":"27e27681-9221-4e64-8c78-e153a86bc6e0","name":"Fires of Invention","manaCost":"{3}{R}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"You can cast spells only during your turn and you can cast no more than two spells each turn.\nYou may cast spells with mana value less than or equal to the number of lands you control without paying their mana costs.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/1/a12b16b0-f75f-42d8-9b24-947c1908e0f7.jpg?1783932623","artUrl":"https://cards.scryfall.io/art_crop/front/a/1/a12b16b0-f75f-42d8-9b24-947c1908e0f7.jpg?1783932623","commanderLegal":"legal","set":"eld","releasedAt":"2019-10-04","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

describe("Lane B round 95", () => {
  it("compiles every card of the round fully", () => {
    supported(probe(), panic(), reproach(), nael(), touch(), bag(), plagiarist(), matrix(), timesifter(), fires());
  });

  it("Psychogenic Probe: 2 damage to whoever a spell or ability makes shuffle, any player, an empty library too", () => {
    let { s, ap, ids, opp } = setup([seek, jumble]);
    putOnBattlefield(s, opp, probe());
    const life = s.players[ap]!.life;
    s = castNow(s, ap, ids[0]!);
    s = settle(s);
    expect(s.players[ap]!.life).toBe(life - 2);
    // A shuffle no spell or ability caused (the game's own, as at the start) doesn't trigger it.
    shuffleLibrary(s, s.players[ap]!);
    expect(s.triggerQueue.length).toBe(0);
    // Another player's library, emptied: still a shuffle.
    s.players[opp]!.library = [];
    const theirs = s.players[opp]!.life;
    s = castNow(s, ap, ids[1]!, [player(opp)]);
    s = settle(s);
    expect(s.players[opp]!.life).toBe(theirs - 2);
  });

  it("Widespread Panic: a player whose own spell makes them shuffle puts a card from their hand on top; another's spell doesn't", () => {
    let { s, ap, ids, opp } = setup([seek, jumble, shock]);
    putOnBattlefield(s, opp, panic());
    emptyHand(s, opp);
    s = castNow(s, ap, ids[0]!);
    s = settle(s, { me: [ap] });
    expect(s.pending?.kind).toBe("searchLibrary");
    const land = s.players[ap]!.library.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Forest")!;
    s = act(s, { type: "searchLibrary", player: ap, found: [land] });
    s = settle(s, { me: [ap] });
    // The land found, Test Jumble and Shock are in hand: they pick one.
    expect(s.pending?.kind).toBe("handToTop");
    s = act(s, { type: "handToTop", player: ap, objectIds: [ids[2]!] } as Action);
    s = settle(s);
    expect(s.players[ap]!.library[0]).toBe(ids[2]);
    // Ken's spell making an opponent shuffle: not that player's own spell, no trigger.
    inHand(s, opp, shock);
    const top = s.players[opp]!.library.length;
    s = castNow(s, ap, ids[1]!, [player(opp)]);
    s = settle(s);
    expect(s.pending).toBeFalsy();
    expect(s.players[opp]!.hand.length).toBe(1);
    expect(s.players[opp]!.library.length).toBe(top);
  });

  it("Teferi's Reproach: until the target's next turn, protection from everything, life can't change, nonland permanents phased out", () => {
    let { s, ap, ids, opp } = setup([reproach(), shock, drain()]);
    const theirBear = putOnBattlefield(s, opp, bear());
    const theirLand = putOnBattlefield(s, opp, forest);
    const life = s.players[opp]!.life;
    s = castNow(s, ap, ids[0]!, [player(opp)]);
    s = settle(s);
    expect(zone(s, ids[0]!)).toBe("exile");
    expect(zone(s, theirBear)).toBe("phasedOut");
    expect(zone(s, theirLand)).toBe("battlefield");
    // Can't be targeted (protection from everything).
    expect(planCast(s, ap, ids[1]!, [player(opp)], undefined, "auto")).toBeNull();
    // Life can't change (an untargeted loss), while the other opponents lose it.
    const other = s.turnOrder.find((p) => p !== ap && p !== opp)!;
    const otherLife = s.players[other]!.life;
    s = castNow(s, ap, ids[2]!);
    s = settle(s);
    expect(s.players[opp]!.life).toBe(life);
    expect(s.players[other]!.life).toBe(otherLife - 3);
    // Over as their next turn begins: the creature phases in as they untap.
    s = passUntil(s, "upkeep", opp);
    s = settle(s);
    expect(zone(s, theirBear)).toBe("battlefield");
    expect(s.players[opp]!.gainedUntilNextTurn).toBeFalsy();
    expect(s.players[opp]!.lifeCantChange).toBeFalsy();
  });

  it("Bold Plagiarist: an opponent's counters on their own creature are copied onto it, kind and number, put by that opponent", () => {
    let { s, ap, ids, opp } = setup([grow, grow, wings]);
    const copycat = putOnBattlefield(s, opp, plagiarist());
    const mine = putOnBattlefield(s, ap, bear());
    // Ken's own Bold Plagiarist doesn't trigger on the counters Ken puts on the opponent's (they're not put by an opponent).
    const myCopycat = putOnBattlefield(s, ap, plagiarist());
    const theirs = putOnBattlefield(s, opp, bear());
    s = castNow(s, ap, ids[0]!, [tgt(mine)]);
    s = settle(s);
    expect(s.objects[copycat]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[myCopycat]!.counters["+1/+1"] ?? 0).toBe(0);
    // On a creature Ken doesn't control: no.
    s = castNow(s, ap, ids[1]!, [tgt(theirs)]);
    s = settle(s);
    expect(s.objects[copycat]!.counters["+1/+1"]).toBe(1);
    // The same kind.
    s = castNow(s, ap, ids[2]!, [tgt(mine)]);
    s = settle(s);
    expect(s.objects[copycat]!.counters.flying).toBe(1);
    expect(characteristics(s, s.objects[copycat]!).keywords).toContain("Flying");
    expect(s.objects[myCopycat]!.counters.flying ?? 0).toBe(0);
  });

  it("Fires of Invention: free spells with mana value up to your lands, at most two spells a turn, none on other turns", () => {
    let { s, ap, ids, opp } = setup([shock, fires(), bear(), shock, shock]);
    s = castNow(s, ap, ids[0]!, [player(opp)]);
    s = settle(s);
    s = castNow(s, ap, ids[1]!);
    s = settle(s);
    // Shock and Fires itself were the two spells this turn (rulings): no third.
    expect(castProblem(s, ap, ids[2]!)).toMatch(/no more than two spells/);
    s = passUntil(s, "upkeep", opp);
    s = settle(s);
    // Another player's turn: no spell, not even an instant.
    for (let i = 0; i < 8 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(waitingOn(s)).toBe(ap);
    expect(castProblem(s, ap, ids[3]!, [player(opp)])).toMatch(/only during your turn/);
    // Ken's next turn: the bear for nothing, every land tapped (14 lands, mana value 2).
    s = passUntil(s, "main1", ap);
    for (const id of s.battlefield) if (s.objects[id]!.controller === ap && characteristics(s, s.objects[id]!).types.includes("Land")) tapPermanent(s, s.objects[id]!);
    s = run(s, planCast(s, ap, ids[2]!, [], undefined, undefined, undefined, { alt: "payZero" }));
    s = settle(s);
    expect(zone(s, ids[2]!)).toBe("battlefield");
  });

  it("Nael: on combat damage, look at the top X (basic land types), one on top, the rest on the bottom; all five types draw", () => {
    for (const five of [true, false]) {
      let { s, ap, opp } = setup([]);
      emptyHand(s, ap);
      if (!five)
        for (const id of [...s.battlefield]) {
          const n = s.cards[s.objects[id]!.cardId]!.name;
          if (s.objects[id]!.controller === ap && (n === "Plains" || n === "Swamp")) {
            s.battlefield.splice(s.battlefield.indexOf(id), 1);
            s.objects[id]!.zone = "exile";
          }
        }
      invalidateCharacteristics(s);
      const flier = putOnBattlefield(s, ap, nael());
      const tops = [shock, grow, wings, jumble, seek].map((d) => onTop(s, ap, d)).reverse();
      s = passUntil(s, "declareAttackers", ap);
      s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: flier, defender: opp }] });
      for (let i = 0; i < 40 && !(s.pending && s.pending.player === ap && s.pending.kind !== "declareBlockers"); i++) {
        if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
        else s = act(s, { type: "passPriority", player: waitingOn(s)! });
      }
      const p = s.pending as Extract<PendingDecision, { kind: "searchLibrary" }>;
      expect(p.kind).toBe("searchLibrary");
      expect(p.cards).toEqual(tops.slice(0, five ? 5 : 3));
      s = act(s, { type: "searchLibrary", player: ap, found: [tops[1]!] });
      s = settle(s, { me: [ap] });
      const lib = s.players[ap]!.library;
      if (five) {
        expect(s.players[ap]!.hand).toEqual([tops[1]]);
        expect(lib.slice(-4).sort()).toEqual([tops[0], tops[2], tops[3], tops[4]].sort());
      } else {
        expect(s.players[ap]!.hand).toEqual([]);
        expect(lib[0]).toBe(tops[1]);
        expect(lib.slice(-2).sort()).toEqual([tops[0], tops[2]].sort());
      }
    }
  });

  it("Aethermage's Touch: a creature from the top four onto the battlefield, back to its owner's hand at your end step; the rest on the bottom", () => {
    let { s, ap, ids } = setup([touch()]);
    const tops = [shock, bear(), grow, wings].map((d) => onTop(s, ap, d)).reverse();
    s = castNow(s, ap, ids[0]!);
    s = settle(s, { me: [ap] });
    const p = s.pending as Extract<PendingDecision, { kind: "searchLibrary" }>;
    expect(p.kind).toBe("searchLibrary");
    s = act(s, { type: "searchLibrary", player: ap, found: [tops[2]!] });
    s = settle(s, { me: [ap] });
    // The rest go to the bottom in the order Ken chooses.
    expect(s.pending?.kind).toBe("arrangeTop");
    s = act(s, { type: "arrangeTop", player: ap, top: [tops[3]!, tops[1]!, tops[0]!], away: [] });
    s = settle(s, { me: [ap] });
    expect(zone(s, tops[2]!)).toBe("battlefield");
    expect(s.players[ap]!.library.slice(-3).sort()).toEqual([tops[0], tops[1], tops[3]].sort());
    s = passUntil(s, "end", ap);
    s = settle(s);
    expect(zone(s, tops[2]!)).toBe("hand");
  });

  it("Bag of Tricks: roll a d8, reveal until a creature card with that mana value, onto the battlefield, the rest on the bottom", () => {
    for (const seed of [1, 2, 3]) {
      let { s, ap } = setup([], seed);
      const tricks = putOnBattlefield(s, ap, bag());
      // From the top: mana value 1, 2, ... 8.
      const bodies = Array.from({ length: 8 }, (_, i) => card(`Test Body ${i + 1}`, "Creature — Golem", `{${i + 1}}`, { power: "1", toughness: "1" }));
      const tops = [...bodies].reverse().map((d) => onTop(s, ap, d)).reverse();
      s = run(s, planActivate(s, ap, tricks, 0, []));
      s = settle(s);
      const entered = tops.filter((id) => zone(s, id) === "battlefield");
      expect(entered.length).toBe(1);
      const r = tops.indexOf(entered[0]!) + 1;
      expect(s.log.some((l) => new RegExp(`rolls a d8 for Bag of Tricks: ${r}\\.`).test(typeof l === "string" ? l : JSON.stringify(l)))).toBe(true);
      const lib = s.players[ap]!.library;
      expect(lib.slice(lib.length - (r - 1)).sort()).toEqual(tops.slice(0, r - 1).sort());
      if (r < 8) expect(lib[0]).toBe(tops[r]);
    }
  });

  it("Timesifter: each upkeep everyone exiles their top card; the greatest mana value takes an extra turn; a tie goes again among the tied", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, timesifter());
    const next = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    const [a, b, c, d] = [0, 1, 2, 3].map((k) => s.turnOrder[(s.turnOrder.indexOf(next) + k) % 4]!);
    const mvCard = (n: number) => card(`Test Cost ${n}`, "Sorcery", `{${n}}`);
    // First round: a and b tie at 5, c 3, d 0 (a land). Second: a 2, b 4: b takes the extra turn.
    onTop(s, a!, mvCard(2));
    onTop(s, b!, mvCard(4));
    for (const [p, n] of [[a, 5], [b, 5], [c, 3]] as const) onTop(s, p!, mvCard(n));
    onTop(s, d!, forest);
    s = passUntil(s, "upkeep", next);
    s = settle(s);
    expect(s.players[a!]!.exile.length).toBeGreaterThanOrEqual(2);
    expect(s.players[c!]!.exile.length).toBe(1);
    expect(s.extraTurns?.map((x) => x.player)).toEqual([b]);
    // An empty library is out of it: the one card exiled wins.
    let t = setup([]).s;
    const tap = t.activePlayer;
    putOnBattlefield(t, tap, timesifter());
    const tnext = t.turnOrder[(t.turnOrder.indexOf(tap) + 1) % 4]!;
    for (const p of t.turnOrder) if (p !== tap) t.players[p]!.library = [];
    onTop(t, tap, mvCard(0));
    t = passUntil(t, "upkeep", tnext);
    t = settle(t);
    expect(t.extraTurns?.map((x) => x.player)).toEqual([tap]);
  });

  it("Storage Matrix: while it's untapped, each player picks artifact, creature, or land in their untap step and only those untap", () => {
    for (const tapped of [false, true]) {
      let { s, ap } = setup([]);
      emptyHand(s, ap);
      const box = putOnBattlefield(s, ap, matrix());
      const golem = putOnBattlefield(s, ap, card("Test Golem", "Artifact Creature — Golem", "{3}", { power: "3", toughness: "3" }));
      const beast = putOnBattlefield(s, ap, bear());
      const land = s.battlefield.find((id) => s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.name === "Island")!;
      for (const id of [golem, beast, land]) tapPermanent(s, s.objects[id]!);
      s = passUntil(s, "end", ap);
      if (tapped) tapPermanent(s, s.objects[box]!);
      // To Ken's next untap step; the other players answer their own questions (bots).
      const asked: PlayerId[] = [];
      for (let i = 0; i < 3000 && !(s.activePlayer === ap && s.step !== "end" && s.step !== "cleanup" && s.turn > 1 && (s.pending?.player === ap || s.step === "upkeep")); i++) {
        const p = s.pending;
        if (p?.kind === "chooseOption" && p.what === "untapType") asked.push(p.player);
        if (p && p.player !== ap) for (const a of botActions(s, p.player)) s = act(s, a);
        else if (p?.kind === "discardToHandSize") s = act(s, { type: "discard", player: ap, objectIds: s.players[ap]!.hand.slice(0, p.count) });
        else if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: ap, attacks: [] });
        else s = act(s, { type: "passPriority", player: waitingOn(s)! });
      }
      if (tapped) {
        // Tapped as each untap step began: no one chose, everything untapped (the Matrix too, in Ken's).
        expect(asked).toEqual([]);
        expect(s.step).toBe("upkeep");
        for (const id of [golem, beast, land, box]) expect(s.objects[id]!.tapped).toBe(false);
        continue;
      }
      expect(asked.length).toBe(3);
      expect(pend(s).what).toBe("untapType");
      expect(pend(s).options).toEqual(["Artifact", "Creature", "Land"]);
      s = choose(s, "Creature");
      // The artifact creature untaps too (it's a creature); the land doesn't.
      expect(s.objects[golem]!.tapped).toBe(false);
      expect(s.objects[beast]!.tapped).toBe(false);
      expect(s.objects[land]!.tapped).toBe(true);
    }
  });
});
