// Round 462: Swirl the Mists, "As this enchantment enters, choose a color word. All instances of color words in the text
// of spells and permanents are changed to the chosen color word." (CR 612.1-612.2 text-changing effects, layer 3 in
// timestamp order, CR 613.1c and 613.7; rulings: it affects spells cast and permanents that enter later, and ends as soon
// as Swirl the Mists leaves the battlefield.)

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, defOf, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const swirl = (): CardDef => ({"oracleId":"eed742c3-006f-475c-aa62-41f971d328cb","name":"Swirl the Mists","manaCost":"{2}{U}{U}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"As this enchantment enters, choose a color word.\nAll instances of color words in the text of spells and permanents are changed to the chosen color word.","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","set":"chk","releasedAt":"2004-10-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const doomBlade = (): CardDef => ({"oracleId":"59e7f2ae-4535-4191-98be-3e65b6b2befa","name":"Doom Blade","manaCost":"{1}{B}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target nonblack creature.","colors":["B"],"colorIdentity":["B"],"keywords":[],"commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const whiteKnight = (): CardDef => ({"oracleId":"ddb021df-ae4a-4ac1-8353-d0b375761714","name":"White Knight","manaCost":"{W}{W}","cmc":2,"typeLine":"Creature — Human Knight","supertypes":[],"types":["Creature"],"subtypes":["Human","Knight"],"oracleText":"First strike (This creature deals combat damage before creatures without first strike.)\nProtection from black (This creature can't be blocked, targeted, dealt damage, or enchanted by anything black.)","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":["First strike","Protection"],"commanderLegal":"legal","set":"m10","releasedAt":"2009-07-17","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const blackKnight = (): CardDef => ({"oracleId":"9456c5b6-946d-403a-8ed0-dff9f921d98c","name":"Black Knight","manaCost":"{B}{B}","cmc":2,"typeLine":"Creature — Human Knight","supertypes":[],"types":["Creature"],"subtypes":["Human","Knight"],"oracleText":"First strike (This creature deals combat damage before creatures without first strike.)\nProtection from white (This creature can't be blocked, targeted, dealt damage, or enchanted by anything white.)","power":"2","toughness":"2","colors":["B"],"colorIdentity":["B"],"keywords":["First strike","Protection"],"commanderLegal":"legal","set":"m10","releasedAt":"2009-07-17","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const sleight = (): CardDef => ({"oracleId":"99dba614-40d3-41c1-a3b2-edc8777b010f","name":"Sleight of Mind","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Change the text of target spell or permanent by replacing all instances of one color word with another. (For example, you may change \"target black spell\" to \"target blue spell.\" This effect lasts indefinitely.)","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","set":"ice","releasedAt":"1995-06-03","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const disenchant = (): CardDef => ({"oracleId":"a7e97fa9-4b72-4548-b854-5be5f18a6f1a","name":"Disenchant","manaCost":"{1}{W}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target artifact or enchantment.","colors":["W"],"colorIdentity":["W"],"keywords":[],"commanderLegal":"legal","set":"bro","releasedAt":"2022-11-18","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const terror = (): CardDef => ({"oracleId":"b81f041d-98db-4408-9472-c483e4a502bc","name":"Terror","manaCost":"{1}{B}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target nonartifact, nonblack creature. It can't be regenerated.","colors":["B"],"colorIdentity":["B"],"keywords":[],"commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const kw = (s: GameState, id: ObjectId) => characteristics(s, s.objects[id]!).keywords;
/** Cast Swirl the Mists (in hand as `id`) and choose `word` as it enters. */
function swirlIn(s: GameState, ap: number, id: ObjectId, word: string) {
  s = settle(run(s, planCast(s, ap, id)));
  const p = s.pending;
  if (p?.kind !== "chooseOption" || p.what !== "color" || p.objectId !== id) throw new Error(`no color word asked for: ${JSON.stringify(p)}`);
  return settle(act(s, { type: "chooseOption", player: ap, choice: word }));
}

describe("round 462: Swirl the Mists", () => {
  it("compiles fully", () => {
    expect(isFullySupported(swirl())).toBe(true);
  });

  it("asks for a color word as it enters, then every color word on permanents becomes it; names stay", () => {
    const { s: s0, ap, ids, opp } = setup([swirl()]);
    const white = putOnBattlefield(s0, opp, whiteKnight());
    const black = putOnBattlefield(s0, opp, blackKnight());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const p = s.pending;
    expect(p?.kind === "chooseOption" && p.what === "color" && p.player === ap && p.options).toEqual(["White", "Blue", "Black", "Red", "Green"]);
    expect(p?.kind === "chooseOption" && p.prompt).toMatch(/color word/);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Green" }));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(kw(s, white)).toContain("Protection from green");
    expect(kw(s, white)).not.toContain("Protection from black");
    expect(kw(s, black)).toContain("Protection from green");
    expect(kw(s, black)).not.toContain("Protection from white");
    // A card name isn't a color word (CR 612.2): Black Knight is still Black Knight.
    expect(defOf(s, s.objects[black]!).name).toBe("Black Knight");
    expect(defOf(s, s.objects[white]!).oracleText).toContain("Protection from green");
  });

  it("applies to spells cast after it entered: Doom Blade becomes \"Destroy target nongreen creature\"", () => {
    const { s: s0, ap, ids, opp } = setup([swirl(), doomBlade()]);
    const green = putOnBattlefield(s0, opp, bears());
    const red = putOnBattlefield(s0, opp, giant());
    let s = swirlIn(s0, ap, ids[0]!, "Green");
    // Its target is chosen on the stack, as the spell it is there (CR 601.2a-c).
    expect(planCast(s, ap, ids[1]!, [tgt(green)])).toBeNull();
    expect(s.objects[ids[1]!]!.textChanges).toBeUndefined();
    s = run(s, planCast(s, ap, ids[1]!, [tgt(red)]));
    expect(defOf(s, s.objects[ids[1]!]!).oracleText).toBe("Destroy target nongreen creature.");
    s = settle(s);
    expect(s.objects[red]!.zone).toBe("graveyard");
    expect(s.objects[green]!.zone).toBe("battlefield");
  });

  it("each color word in a list becomes the chosen one: Terror's nonblack too", () => {
    const { s: s0, ap, ids, opp } = setup([swirl(), terror()]);
    const red = putOnBattlefield(s0, opp, giant());
    let s = swirlIn(s0, ap, ids[0]!, "Red");
    // "Destroy target nonartifact, nonred creature."
    expect(planCast(s, ap, ids[1]!, [tgt(red)])).toBeNull();
    const knight = putOnBattlefield(s, opp, blackKnight());
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(knight)])));
    expect(s.objects[knight]!.zone).toBe("graveyard");
  });

  it("text changes apply in timestamp order (CR 613.7): a Sleight of Mind before it is overwritten, one after it changes its word", () => {
    // Sleight first: White Knight's black becomes red, then Swirl (later) makes every color word green.
    {
      const { s: s0, ap, ids, opp } = setup([sleight(), swirl()]);
      const knight = putOnBattlefield(s0, opp, whiteKnight());
      let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(knight)])));
      s = settle(act(s, { type: "chooseOption", player: ap, choice: "black" }));
      s = settle(act(s, { type: "chooseOption", player: ap, choice: "red" }));
      expect(kw(s, knight)).toContain("Protection from red");
      s = swirlIn(s, ap, ids[1]!, "Green");
      expect(kw(s, knight)).toContain("Protection from green");
    }
    // Swirl first (green), then Sleight changes green to red on the Knight only.
    {
      const { s: s0, ap, ids, opp } = setup([swirl(), sleight()]);
      const knight = putOnBattlefield(s0, opp, whiteKnight());
      const other = putOnBattlefield(s0, opp, blackKnight());
      let s = swirlIn(s0, ap, ids[0]!, "Green");
      s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(knight)])));
      s = settle(act(s, { type: "chooseOption", player: ap, choice: "green" }));
      s = settle(act(s, { type: "chooseOption", player: ap, choice: "red" }));
      expect(kw(s, knight)).toContain("Protection from red");
      expect(kw(s, other)).toContain("Protection from green");
    }
  });

  it("applies to permanents that enter later, and ends as soon as it leaves the battlefield; a Sleight of Mind stays", () => {
    const { s: s0, ap, ids, opp } = setup([swirl(), sleight(), disenchant(), blackKnight()]);
    const knight = putOnBattlefield(s0, opp, whiteKnight());
    let s = settle(run(s0, planCast(s0, ap, ids[1]!, [tgt(knight)])));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "black" }));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "red" }));
    s = swirlIn(s, ap, ids[0]!, "Blue");
    expect(kw(s, knight)).toContain("Protection from blue");
    const later = ids[3]!;
    s = settle(run(s, planCast(s, ap, later)));
    expect(s.objects[later]!.zone).toBe("battlefield");
    expect(kw(s, later)).toContain("Protection from blue");
    s = settle(run(s, planCast(s, ap, ids[2]!, [tgt(ids[0]!)])));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(kw(s, knight)).toContain("Protection from red");
    expect(kw(s, later)).toContain("Protection from white");
    expect(s.swirlOn).toBeUndefined();
  });

  it("a bot answers the color word", () => {
    const { s: s0, ap, ids } = setup([swirl()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending?.kind).toBe("chooseOption");
    s = settle(act(s, botActions(s, ap)[0]!));
    expect(s.objects[ids[0]!]!.chosen?.color).toBeDefined();
  });
});
