// Round 412 (Lane A): Xanathar, Guild Kingpin (until end of turn, the top card of a target opponent's library is yours to
// look at and play, your mana spent as though it were mana of any color, CR 609.4b, and that player can't cast spells,
// CR 101.2) and Sen Triplets (this turn, the target opponent can't cast spells or activate abilities, mana abilities too,
// and plays with their hand revealed, CR 402.3; you may play lands and cast spells from their hand).

import { describe, expect, it } from "vitest";
import { act, forest, passUntil, putOnBattlefield, setup, swamp } from "./helpers";
import { invalidateCharacteristics } from "../src/layers";
import { abilityProblem, handRevealed, legalActions, moveObject, othersHandPlayable, playerLoses, topPlayable, topVisible } from "../src/game";
import { manaAbilityProblem } from "../src/manaabilities";
import { abilitiesOf } from "../src/cards";
import { applyAction, botActions, castProblem, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real card data (Scryfall).
const xanathar = (): CardDef => ({"oracleId":"1a168ba5-8e11-41dd-8f8a-8cb23bbde056","name":"Xanathar, Guild Kingpin","manaCost":"{4}{U}{B}","cmc":6,"typeLine":"Legendary Creature — Beholder","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Beholder"],"oracleText":"At the beginning of your upkeep, choose target opponent. Until end of turn, that player can't cast spells, you may look at the top card of their library any time, you may play the top card of their library, and you may spend mana as though it were mana of any color to cast spells this way.","power":"5","toughness":"6","colors":["B","U"],"colorIdentity":["B","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/b/5bc58050-a615-4090-9cf5-cd49ccb4e2c6.jpg?1783926441","artUrl":"https://cards.scryfall.io/art_crop/front/5/b/5bc58050-a615-4090-9cf5-cd49ccb4e2c6.jpg?1783926441","commanderLegal":"legal","set":"afr","releasedAt":"2021-07-23","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const angel = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","commanderLegal":"legal","set":"sld","releasedAt":"2023-10-02","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const island = (): CardDef => ({"oracleId":"b2c6aa39-2d2a-459c-a555-fb48ba993373","name":"Island","manaCost":"","cmc":0,"typeLine":"Basic Land — Island","supertypes":["Basic"],"types":["Land"],"subtypes":["Island"],"oracleText":"({T}: Add {U}.)","colors":[],"colorIdentity":["U"],"keywords":[],"producedMana":["U"],"imageUrl":"https://cards.scryfall.io/normal/front/a/4/a44efa5f-8fbb-43e0-adc4-d05f4be6b9a6.jpg?1785981646","artUrl":"https://cards.scryfall.io/art_crop/front/a/4/a44efa5f-8fbb-43e0-adc4-d05f4be6b9a6.jpg?1785981646","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const sen = (): CardDef => ({"oracleId":"f0c5864f-83c3-4d99-8f97-0ab92608fff3","name":"Sen Triplets","manaCost":"{2}{W}{U}{B}","cmc":5,"typeLine":"Legendary Artifact Creature — Human Wizard","supertypes":["Legendary"],"types":["Artifact","Creature"],"subtypes":["Human","Wizard"],"oracleText":"At the beginning of your upkeep, choose target opponent. This turn, that player can't cast spells or activate abilities and plays with their hand revealed. You may play lands and cast spells from that player's hand this turn.","power":"3","toughness":"3","colors":["B","U","W"],"colorIdentity":["B","U","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/1/418f8ecb-544b-430c-8ae9-61aaaf2dfba6.jpg?1783942417","artUrl":"https://cards.scryfall.io/art_crop/front/4/1/418f8ecb-544b-430c-8ae9-61aaaf2dfba6.jpg?1783942417","commanderLegal":"legal","set":"arb","releasedAt":"2009-04-30","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const staggershock = (): CardDef => ({"oracleId":"056c3b7d-b603-40b8-8404-18c2eb7e7129","name":"Staggershock","manaCost":"{2}{R}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Staggershock deals 2 damage to any target.\nRebound (If you cast this spell from your hand, exile it as it resolves. At the beginning of your next upkeep, you may cast this card from exile without paying its mana cost.)","colors":["R"],"colorIdentity":["R"],"keywords":["Rebound"],"imageUrl":"https://cards.scryfall.io/normal/front/7/5/75624ab3-ddbd-4fe8-8a07-7d1f78ec8a84.jpg?1783941971","artUrl":"https://cards.scryfall.io/art_crop/front/7/5/75624ab3-ddbd-4fe8-8a07-7d1f78ec8a84.jpg?1783941971","commanderLegal":"legal","set":"roe","releasedAt":"2010-04-23","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const cave = (): CardDef => ({"oracleId":"394c6de5-7957-4a0b-a6b9-ee0c707cd022","name":"Forgotten Cave","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"This land enters tapped.\n{T}: Add {R}.\nCycling {R} ({R}, Discard this card: Draw a card.)","colors":[],"colorIdentity":["R"],"keywords":["Cycling"],"producedMana":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/f/4/f42f6b8a-d2cf-4cb2-b967-49d3862540f9.jpg?1783911333","artUrl":"https://cards.scryfall.io/art_crop/front/f/4/f42f6b8a-d2cf-4cb2-b967-49d3862540f9.jpg?1783911333","commanderLegal":"legal","set":"m3c","releasedAt":"2024-06-14","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const magistrate = (): CardDef => ({"oracleId":"aadd10d0-6dd0-4bdc-8d93-ff08e29a5863","name":"Drannith Magistrate","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"Your opponents can't cast spells from anywhere other than their hands.","power":"1","toughness":"3","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/8/98b0a4a8-9319-451b-9b79-b0bca7a41e91.jpg?1783931091","artUrl":"https://cards.scryfall.io/art_crop/front/9/8/98b0a4a8-9319-451b-9b79-b0bca7a41e91.jpg?1783931091","commanderLegal":"legal","set":"iko","releasedAt":"2020-04-24","rarity":"rare","layout":"normal","gameChanger":true} as CardDef);
const frenzy = (): CardDef => ({"oracleId":"3715e8b8-31df-499b-8a91-1bcd1199d6eb","name":"Experimental Frenzy","manaCost":"{3}{R}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"You may look at the top card of your library any time.\nYou may play lands and cast spells from the top of your library.\nYou can't play lands or cast spells from your hand.\n{3}{R}: Destroy this enchantment.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/b/4b8f32e2-5dc8-4f1b-8a69-d3ae06378ed8.jpg?1783934164","artUrl":"https://cards.scryfall.io/art_crop/front/4/b/4b8f32e2-5dc8-4f1b-8a69-d3ae06378ed8.jpg?1783934164","commanderLegal":"legal","set":"grn","releasedAt":"2018-10-05","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty or a question comes up. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** `pid`'s cards on top of their library (the first one on top) or in their hand. */
function place(s: GameState, pid: PlayerId, zone: "library" | "hand", defs: CardDef[]) {
  const ids = defs.map((def) => {
    const id = putOnBattlefield(s, pid, def);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = zone;
    return id;
  });
  if (zone === "library") s.players[pid]!.library.unshift(...ids);
  else s.players[pid]![zone].push(...ids);
  invalidateCharacteristics(s);
  return ids;
}
/** Only these lands for `pid`: the others setup() gave are gone. */
function onlyLands(s: GameState, pid: PlayerId, defs: CardDef[]) {
  for (const id of [...s.battlefield]) if (s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.types.includes("Land")) moveObject(s, id, "graveyard");
  return defs.map((d) => putOnBattlefield(s, pid, d));
}
/** The active player's next upkeep with Xanathar's (or Sen Triplets') trigger asking for its target. */
function toUpkeep(def: () => CardDef = xanathar): { s: GameState; ap: PlayerId; opp: PlayerId; other: PlayerId; xan: ObjectId } {
  const { s: s0, ap, opp } = setup([]);
  const xan = putOnBattlefield(s0, ap, def());
  let s = passUntil(s0, "upkeep", ap);
  for (let i = 0; i < 20 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  const other = s.turnOrder.find((p) => p !== ap && p !== opp)!;
  return { s, ap, opp, other, xan };
}

describe("round 412: the cards compile", () => {
  it("are fully supported", () => {
    for (const d of [xanathar(), sen()]) expect(isFullySupported(d), d.name).toBe(true);
  });
});

describe("round 412: Xanathar, Guild Kingpin", () => {
  it("lets you look at and play the top card of the target opponent's library this turn, spending mana as though it were any color; they can't cast spells", () => {
    let { s, ap, opp, other } = toUpkeep();
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    // The opponent can't cast spells this turn, even an instant from their hand.
    const [theirBolt] = place(s, opp, "hand", [bolt()]);
    expect(castProblem(s, opp, theirBolt!)).not.toBeNull();
    s = passUntil(s, "main1", ap);
    const [an, isl] = place(s, opp, "library", [angel(), island()]);
    // Only Xanathar's controller sees that card.
    expect(topVisible(s, opp, ap)).toBe(true);
    expect(topVisible(s, opp, other)).toBe(false);
    expect(topVisible(s, opp, opp)).toBe(false);
    expect(topPlayable(s, ap)).toContain(an);
    expect(topPlayable(s, other)).not.toContain(an);
    // Serra Angel's {3}{W}{W} paid with five Swamps.
    onlyLands(s, ap, [swamp, swamp, swamp, swamp, swamp]);
    s = settle(run(s, planCast(s, ap, an!)));
    expect(s.objects[an!]).toMatchObject({ zone: "battlefield", controller: ap, owner: opp });
    // The next card is a land: played with the land play (rulings), once.
    expect(topPlayable(s, ap)).toContain(isl);
    expect(s.players[ap]!.landsPlayedThisTurn).toBe(0);
    s = act(s, { type: "playLand", player: ap, objectId: isl! });
    expect(s.objects[isl!]).toMatchObject({ zone: "battlefield", controller: ap, owner: opp });
    expect(s.log.map((e) => e.text).join("\n")).toMatch(/may look at the top card of .+'s library any time and may play that card, spending mana as though it were mana of any color/);
    // The next turn it's over: the opponent may cast spells again and the top card is theirs alone.
    s = passUntil(s, "upkeep", opp);
    expect(topPlayable(s, ap)).toEqual(topPlayable(s, ap).filter((id) => s.objects[id]!.owner === ap));
    expect(topVisible(s, opp, ap)).toBe(false);
  });

  it("its own colors still matter only for spells cast this way: a spell from your hand pays its colors as usual", () => {
    let { s, ap, opp } = toUpkeep();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    s = passUntil(s, "main1", ap);
    const [mine] = place(s, ap, "hand", [angel()]);
    onlyLands(s, ap, [swamp, swamp, swamp, swamp, swamp]);
    expect(planCast(s, ap, mine!)).toBeNull();
  });

  it("does nothing if the opponent has left the game as it resolves (rulings)", () => {
    let { s, ap, opp } = toUpkeep();
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] });
    playerLoses(s, opp, "test");
    s = settle(s);
    expect(s.topTurn ?? []).toEqual([]);
  });
});

describe("round 412: Xanathar, Guild Kingpin (bots)", () => {
  it("a bot casts the top card of the opponent's library it chose", () => {
    let { s, ap } = toUpkeep(xanathar);
    s = settle(act(s, botActions(s, ap)[0]!));
    const victim = s.topTurn?.[0]?.of;
    expect(victim).toBeDefined();
    s = passUntil(s, "main1", ap);
    for (const id of [...s.players[ap]!.hand]) moveObject(s, id, "library");
    const [an] = place(s, victim!, "library", [angel()]);
    for (let i = 0; i < 40 && s.step === "main1" && s.activePlayer === ap; i++) {
      const acts = botActions(s, waitingOn(s)!);
      if (!acts.length) break;
      for (const a of acts) s = act(s, a);
    }
    expect(s.objects[an!]).toMatchObject({ zone: "battlefield", controller: ap, owner: victim });
  });
});

describe("round 412: Sen Triplets", () => {
  it("this turn the target opponent can't cast spells or activate abilities, mana abilities too, and plays with their hand revealed", () => {
    let { s, ap, opp, other } = toUpkeep(sen);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    const [theirBolt, theirCave] = place(s, opp, "hand", [bolt(), cave()]);
    const theirForest = putOnBattlefield(s, opp, forest);
    expect(castProblem(s, opp, theirBolt!)).not.toBeNull();
    expect(manaAbilityProblem(s, opp, s.objects[theirForest]!, 0, true)).toMatch(/can't activate abilities/);
    const cycling = abilitiesOf(s, s.objects[theirCave!]!).activated.findIndex((ab) => ab.zone === "hand");
    expect(cycling).toBeGreaterThanOrEqual(0);
    s.priority = opp;
    expect(abilityProblem(s, opp, theirCave!, cycling)).toMatch(/can't activate abilities/);
    s.priority = ap;
    // Its controller can't activate abilities of cards in that hand either (rulings).
    expect(abilityProblem(s, ap, theirCave!, cycling)).not.toBeNull();
    // Everyone sees that hand this turn; another opponent's stays hidden.
    expect(handRevealed(s, opp, other)).toBe(true);
    expect(handRevealed(s, other, ap)).toBe(false);
    expect(s.log.map((e) => e.text).join("\n")).toMatch(/can't activate abilities this turn/);
  });

  it("lets you play a land and cast spells from that player's hand this turn, with your own mana", () => {
    let { s, ap, opp, other } = toUpkeep(sen);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    s = passUntil(s, "main1", ap);
    const [an, isl] = place(s, opp, "hand", [angel(), island()]);
    expect(othersHandPlayable(s, ap)).toEqual(expect.arrayContaining([an, isl]));
    expect(othersHandPlayable(s, other)).toEqual([]);
    expect(legalActions(s, ap)).toContainEqual({ type: "playLand", player: ap, objectId: isl });
    s = act(s, { type: "playLand", player: ap, objectId: isl! });
    expect(s.objects[isl!]).toMatchObject({ zone: "battlefield", controller: ap, owner: opp });
    s = settle(run(s, planCast(s, ap, an!)));
    expect(s.objects[an!]).toMatchObject({ zone: "battlefield", controller: ap, owner: opp });
    // Not "cast from your hand".
    expect(s.objects[an!]!.castFromHand).toBeUndefined();
    // Another player can't.
    const [later] = place(s, opp, "hand", [angel()]);
    expect(castProblem(s, other, later!)).not.toBeNull();
    // The next turn it's over.
    s = passUntil(s, "upkeep", opp);
    expect(othersHandPlayable(s, ap)).toEqual([]);
    expect(castProblem(s, ap, later!)).not.toBeNull();
    expect(handRevealed(s, opp, ap)).toBe(false);
  });

  it("a rebound spell cast from that hand isn't cast from your hand: it goes to its owner's graveyard (CR 702.88a)", () => {
    let { s, ap, opp } = toUpkeep(sen);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    s = passUntil(s, "main1", ap);
    const [shock] = place(s, opp, "hand", [staggershock()]);
    s = settle(run(s, planCast(s, ap, shock!, [{ kind: "player", id: opp }])));
    expect(s.objects[shock!]!.zone).toBe("graveyard");
    expect(s.players[opp]!.graveyard).toContain(shock);
  });

  it("a bot plays a land and casts a spell from that hand", () => {
    let { s, ap, opp } = toUpkeep(sen);
    s = settle(act(s, botActions(s, ap)[0]!));
    const victim = s.handTurn?.[0]?.of;
    expect(victim).toBeDefined();
    s = passUntil(s, "main1", ap);
    for (const id of [...s.players[ap]!.hand]) moveObject(s, id, "library");
    const [an] = place(s, victim!, "hand", [angel(), island()]);
    for (let i = 0; i < 40 && s.step === "main1" && s.activePlayer === ap; i++) {
      const who = waitingOn(s)!;
      const acts = botActions(s, who);
      if (!acts.length) break;
      for (const a of acts) s = act(s, a);
    }
    // A land of that player's, with its land play, and the Angel.
    expect(s.battlefield.some((id) => s.objects[id]!.owner === victim && s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.types.includes("Land"))).toBe(true);
    expect(s.objects[an!]).toMatchObject({ zone: "battlefield", controller: ap, owner: victim });
    void opp;
  });

  it("another player's hand isn't yours: Drannith Magistrate stops the cast, Experimental Frenzy doesn't", () => {
    let { s, ap, opp, other } = toUpkeep(sen);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    s = passUntil(s, "main1", ap);
    const [an] = place(s, opp, "hand", [angel()]);
    putOnBattlefield(s, ap, frenzy());
    expect(planCast(s, ap, an!)).not.toBeNull();
    putOnBattlefield(s, other, magistrate());
    expect(planCast(s, ap, an!)).toBeNull();
  });
});
