// Round 282, review follow-up 12: text changes (CR 612) that left a supported card with a line the engine couldn't read.
// "Plains" is read as plural where it is; the swaps that would still break the text aren't offered.

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, defOf, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState } from "../src";
import { withTextChanges } from "../src/text-changes";

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const options = (s: GameState, what: string) => {
  const p = s.pending;
  if (p?.kind !== "chooseOption" || p.what !== what) throw new Error(`no ${what}: ${JSON.stringify(p)}`);
  return p.options;
};
const swapped = (d: CardDef, kind: "color" | "basicLandType", from: string, to: string) => withTextChanges(d, [{ kind, from, to }], `${d.oracleId}|test:${from}>${to}`);

// Real oracle text (Scryfall).
const sleight = (): CardDef => ({"oracleId":"99dba614-40d3-41c1-a3b2-edc8777b010f","name":"Sleight of Mind","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Change the text of target spell or permanent by replacing all instances of one color word with another. (For example, you may change \"target black spell\" to \"target blue spell.\" This effect lasts indefinitely.)","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","set":"ice","releasedAt":"1995-06-03","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const mindBend = (): CardDef => ({"oracleId":"d8377869-f8f7-4b4b-93ad-3ad3c4826b1a","name":"Mind Bend","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Change the text of target permanent by replacing all instances of one color word with another or one basic land type with another. (For example, you may change \"nonblack creature\" to \"nongreen creature\" or \"forestwalk\" to \"islandwalk.\" This effect lasts indefinitely.)","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/5/952eb6ae-a530-4f4f-92f0-a6602beaa7b2.jpg?1783947106","artUrl":"https://cards.scryfall.io/art_crop/front/9/5/952eb6ae-a530-4f4f-92f0-a6602beaa7b2.jpg?1783947106","commanderLegal":"legal","set":"mir","releasedAt":"1996-10-08","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const mimic = (): CardDef => ({"oracleId":"0af189d3-4de1-483e-aac4-dd5d51a57d9c","name":"Battlegate Mimic","manaCost":"{1}{R/W}","cmc":2,"typeLine":"Creature — Shapeshifter","supertypes":[],"types":["Creature"],"subtypes":["Shapeshifter"],"oracleText":"Whenever you cast a spell that's both red and white, this creature has base power and toughness 4/2 until end of turn and gains first strike until end of turn.","power":"2","toughness":"1","colors":["R","W"],"colorIdentity":["R","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/c/dc2a0bc8-d736-45e6-ac20-63c5ca69a8d5.jpg?1783942665","artUrl":"https://cards.scryfall.io/art_crop/front/d/c/dc2a0bc8-d736-45e6-ac20-63c5ca69a8d5.jpg?1783942665","commanderLegal":"legal","set":"eve","releasedAt":"2008-07-25","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const defiler = (): CardDef => ({"oracleId":"88ac2d09-7993-4bce-8aae-b2683c5c25a5","name":"Defiler of Faith","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Phyrexian Human","supertypes":[],"types":["Creature"],"subtypes":["Phyrexian","Human"],"oracleText":"Vigilance\nAs an additional cost to cast white permanent spells, you may pay 2 life. Those spells cost {W} less to cast if you paid life this way. This effect reduces only the amount of white mana you pay.\nWhenever you cast a white permanent spell, create a 1/1 white Soldier creature token.","power":"5","toughness":"5","colors":["W"],"colorIdentity":["W"],"keywords":["Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/f/1/f1fa16ec-b4ab-4da8-a1fa-cf6c303edc7a.jpg?1783921198","artUrl":"https://cards.scryfall.io/art_crop/front/f/1/f1fa16ec-b4ab-4da8-a1fa-cf6c303edc7a.jpg?1783921198","commanderLegal":"legal","set":"dmu","releasedAt":"2022-09-09","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const elephant = (): CardDef => ({"oracleId":"4ed04ece-64d2-41a4-bf36-b993cbbf2aac","name":"Bull Elephant","manaCost":"{3}{G}","cmc":4,"typeLine":"Creature — Elephant","supertypes":[],"types":["Creature"],"subtypes":["Elephant"],"oracleText":"When this creature enters, sacrifice it unless you return two Forests you control to their owner's hand.","power":"4","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/b/6b161f83-a0d9-4b65-af36-6d71aa76c912.jpg?1783947027","artUrl":"https://cards.scryfall.io/art_crop/front/6/b/6b161f83-a0d9-4b65-af36-6d71aa76c912.jpg?1783947027","commanderLegal":"legal","set":"mgb","releasedAt":"1996-11-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const conversion = (): CardDef => ({"oracleId":"a24e05fb-dffb-4400-b4ca-22fdde45e7a7","name":"Conversion","manaCost":"{2}{W}{W}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of your upkeep, sacrifice this enchantment unless you pay {W}{W}.\nAll Mountains are Plains.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/3/13186bc9-8d9c-433b-ba15-121ef94dd68a.jpg?1783948715","artUrl":"https://cards.scryfall.io/art_crop/front/1/3/13186bc9-8d9c-433b-ba15-121ef94dd68a.jpg?1783948715","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

describe("text changes read \"Plains\" as plural where it is", () => {
  it("\"two Plains\", \"All Plains are Plains\": the changed text compiles", () => {
    expect(isFullySupported(swapped(elephant(), "basicLandType", "Forest", "Plains"))).toBe(true);
    expect(swapped(elephant(), "basicLandType", "Forest", "Plains").oracleText).toContain("return two Plains you control");
    expect(isFullySupported(swapped(conversion(), "basicLandType", "Mountain", "Plains"))).toBe(true);
  });

  it("Mind Bend on Bull Elephant: Forest to Plains, then two Plains are returned to keep it", () => {
    const { s: s0, ap, ids } = setup([mindBend()]);
    const el = putOnBattlefield(s0, ap, elephant());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: el }])));
    s = act(s, { type: "chooseOption", player: ap, choice: "Forest" });
    expect(options(s, "textTo")).toContain("Plains");
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Plains" }));
    expect(isFullySupported(defOf(s, s.objects[el]!))).toBe(true);
    expect(s.log.some((l) => /can't read/.test(l.text))).toBe(false);
  });

  it("All Mountains are Mountains: each loses its other land types (CR 305.7)", () => {
    const { s: s0, ap } = setup([]);
    const conv = putOnBattlefield(s0, ap, conversion());
    const s = s0;
    s.objects[conv]!.textChanges = [{ kind: "basicLandType", from: "Plains", to: "Mountain" }];
    const dual = putOnBattlefield(s, ap, { oracleId: "test-dual", name: "Test Dual", manaCost: "", cmc: 0, typeLine: "Land — Mountain Forest", supertypes: [], types: ["Land"], subtypes: ["Mountain", "Forest"], oracleText: "", colors: [], colorIdentity: [], keywords: [] } as CardDef);
    expect(characteristics(s, s.objects[dual]!).subtypes).toEqual(["Mountain"]);
  });
});

describe("a swap that would leave text the engine can't read isn't offered", () => {
  // Round 462 (Swirl the Mists): these swaps read now ("both red and red" is a red spell; Defiler of Faith's cost line
  // reads any color, its {W} reduction then reducing no other color's mana), so every color word is offered for them.
  it("Battlegate Mimic: white can become red since round 462 (\"both red and red\" is a red spell), as other colors can", () => {
    expect(isFullySupported(swapped(mimic(), "color", "white", "red"))).toBe(true);
    const { s: s0, ap, ids, opp } = setup([sleight()]);
    const m = putOnBattlefield(s0, opp, mimic());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: m }])));
    expect(options(s, "textFrom")).toEqual(["white", "blue", "black", "red", "green"]);
    s = act(s, { type: "chooseOption", player: ap, choice: "white" });
    expect(options(s, "textTo")).toEqual(["blue", "black", "red", "green"]);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "red" }));
    expect(isFullySupported(defOf(s, s.objects[m]!))).toBe(true);
  });

  it("Defiler of Faith: white is offered since round 462 (its cost line reads any color); bots pick from what's offered", () => {
    const { s: s0, ap, ids, opp } = setup([sleight()]);
    const d = putOnBattlefield(s0, opp, defiler());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: d }])));
    const from = options(s, "textFrom");
    expect(from).toContain("white");
    expect(from).toContain("blue");
    const a = botActions(s, ap)[0]!;
    expect(a.type === "chooseOption" && from.includes(a.choice)).toBe(true);
  });
});
