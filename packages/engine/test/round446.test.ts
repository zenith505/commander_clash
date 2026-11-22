// Round 446: Psychic Paper's "As this Equipment becomes attached to a creature, choose a creature card name and a creature
// type." and "Equipped creature has ward {1}, it can't be blocked, and its name and creature type are the last chosen name
// and creature type." (the name a text-changing effect, CR 123.6c, 613.1c; the creature type replacing the others, CR
// 205.1b, 613.1d; chosen as it becomes attached, as an "as ~ enters" choice, CR 614.12).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, invalidateCharacteristics, isFullySupported, planActivate, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const paper = (): CardDef => ({"oracleId":"110b601c-bf38-4985-8de6-fcb477f543a8","name":"Psychic Paper","manaCost":"{2}","cmc":2,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"As this Equipment becomes attached to a creature, choose a creature card name and a creature type.\nEquipped creature has ward {1}, it can't be blocked, and its name and creature type are the last chosen name and creature type.\nEquip {2}","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/3/e/3e0aea96-932a-498b-8520-e9b88c788e3a.jpg?1783914376","artUrl":"https://cards.scryfall.io/art_crop/front/3/e/3e0aea96-932a-498b-8520-e9b88c788e3a.jpg?1783914376","commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const isamaru = (): CardDef => ({"oracleId":"cfb756dd-6fe1-430a-8f04-8b10cac62a86","name":"Isamaru, Hound of Konda","manaCost":"{W}","cmc":1,"typeLine":"Legendary Creature — Dog","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Dog"],"oracleText":"","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/e/2e7f9919-0713-4ef9-96eb-3e0c444e47f4.jpg?1783944338","artUrl":"https://cards.scryfall.io/art_crop/front/2/e/2e7f9919-0713-4ef9-96eb-3e0c444e47f4.jpg?1783944338","commanderLegal":"legal","set":"chk","releasedAt":"2004-10-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const jedit = (): CardDef => ({"oracleId":"523cca7d-7d21-45de-b82d-58e777bf7f72","name":"Jedit Ojanen","manaCost":"{4}{W}{W}{U}","cmc":7,"typeLine":"Legendary Creature — Cat Warrior","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Cat","Warrior"],"oracleText":"","power":"5","toughness":"5","colors":["U","W"],"colorIdentity":["U","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/7/97b80124-2b59-425c-93cc-9b032e631c6e.jpg?1783948038","artUrl":"https://cards.scryfall.io/art_crop/front/9/7/97b80124-2b59-425c-93cc-9b032e631c6e.jpg?1783948038","commanderLegal":"legal","set":"leg","releasedAt":"1994-06-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const thopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const elves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Pass, and let bots answer every other choice, until the stack and trigger queue are empty; `answer` gives the test's own answer. */
function settle(s: GameState, answer?: (s: GameState) => Action | undefined) {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const pid = waitingOn(s)!;
    const mine = answer?.(s);
    if (mine) s = act(s, mine);
    else if (s.pending) s = act(s, botActions(s, pid)[0]!);
    else s = act(s, { type: "passPriority", player: pid });
  }
  return s;
}
/** A card of `pid`'s put on top of their library (so its name is one that can be chosen). */
function inLibrary(s: GameState, pid: PlayerId, def: CardDef) {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  invalidateCharacteristics(s);
  return id;
}
const ch = (s: GameState, id: string) => characteristics(s, s.objects[id]!);

/** Equip `p` to `to`, answering the name and type questions (none given: the bot's answers); what was asked, in order. */
function equip(s0: GameState, ap: PlayerId, p: string, to: string, name?: string, type?: string) {
  const asked: { what: string; options: string[]; objectId?: string; player: PlayerId }[] = [];
  const s = settle(run(s0, planActivate(s0, ap, p, 0, [{ kind: "object", id: to }])), (x) => {
    const q = x.pending;
    if (q?.kind !== "chooseOption" || (q.what !== "cardName" && q.what !== "creatureType")) return undefined;
    asked.push({ what: q.what, options: [...q.options], objectId: q.objectId, player: q.player });
    const choice = q.what === "cardName" ? name : type;
    return choice === undefined ? botActions(x, q.player)[0] : { type: "chooseOption", player: q.player, choice };
  });
  return { s, asked };
}

describe("round 446: Psychic Paper", () => {
  it("is fully supported", () => {
    expect(isFullySupported(paper())).toBe(true);
  });

  it("as it becomes attached, a creature card name and then a creature type are chosen: the creature has them, ward {1}, and can't be blocked", () => {
    const { s: s0, ap } = setup([]);
    const p = putOnBattlefield(s0, ap, paper());
    const elf = putOnBattlefield(s0, ap, elves());
    inLibrary(s0, ap, isamaru());
    const before = ch(s0, elf);
    expect(before.name).toBe("Llanowar Elves");
    expect(before.subtypes).toEqual(["Elf", "Druid"]);
    const { s, asked } = equip(s0, ap, p, elf, "Isamaru, Hound of Konda", "Wizard");
    expect(asked.map((a) => a.what)).toEqual(["cardName", "creatureType"]);
    expect(asked.every((a) => a.objectId === p && a.player === ap)).toBe(true);
    // Only creature card names (the lands and the commanders' names aside, every creature card in the game).
    expect(asked[0]!.options).toContain("Isamaru, Hound of Konda");
    expect(asked[0]!.options).toContain("Llanowar Elves");
    expect(asked[0]!.options).not.toContain("Forest");
    expect(asked[0]!.options).not.toContain("Psychic Paper");
    expect(asked[1]!.options).toContain("Wizard");
    expect(asked[1]!.options).not.toContain("Artifact");
    expect(asked[1]!.options).not.toContain("Legendary");
    const after = ch(s, elf);
    expect(s.objects[p]!.attachedTo).toBe(elf);
    expect(after.name).toBe("Isamaru, Hound of Konda");
    // Its creature type replaces its others; it isn't legendary (a name isn't a supertype).
    expect(after.subtypes).toEqual(["Wizard"]);
    expect(after.supertypes).toEqual([]);
    expect(after.keywords.some((k) => /^Ward \{1\}$/i.test(k)) || after.grantedAbilities.some((t) => /^Ward \{1\}$/i.test(t))).toBe(true);
    expect(after.cantBeBlocked).toBeTruthy();
    // The Equipment itself keeps its own name.
    expect(ch(s, p).name).toBe("Psychic Paper");
  });

  it("equipped to another creature, new choices: the first creature has its own name and types again, the last chosen ones go to the new one", () => {
    const { s: s0, ap } = setup([]);
    const p = putOnBattlefield(s0, ap, paper());
    const elf = putOnBattlefield(s0, ap, elves());
    const orni = putOnBattlefield(s0, ap, thopter());
    inLibrary(s0, ap, isamaru());
    const first = equip(s0, ap, p, elf, "Isamaru, Hound of Konda", "Wizard").s;
    const { s, asked } = equip(first, ap, p, orni, "Llanowar Elves", "Elf");
    expect(asked.map((a) => a.what)).toEqual(["cardName", "creatureType"]);
    expect(ch(s, elf).name).toBe("Llanowar Elves");
    expect(ch(s, elf).subtypes).toEqual(["Elf", "Druid"]);
    expect(ch(s, elf).cantBeBlocked).toBeFalsy();
    // Ornithopter: still an artifact creature, its only creature type now Elf, with the name chosen last.
    expect(ch(s, orni).name).toBe("Llanowar Elves");
    expect(ch(s, orni).types).toEqual(["Artifact", "Creature"]);
    expect(ch(s, orni).subtypes).toEqual(["Elf"]);
    expect(ch(s, orni).cantBeBlocked).toBeTruthy();
  });

  it("a legendary creature given another legend's name is under the legend rule with it (CR 704.5j)", () => {
    const { s: s0, ap } = setup([]);
    const p = putOnBattlefield(s0, ap, paper());
    const dog = putOnBattlefield(s0, ap, isamaru());
    const cat = putOnBattlefield(s0, ap, jedit());
    invalidateCharacteristics(s0);
    const { s } = equip(s0, ap, p, cat, "Isamaru, Hound of Konda", "Dog");
    // The legend rule asked its controller (answered as a bot) and one of the two is gone.
    const kept = [dog, cat].filter((id) => s.objects[id]!.zone === "battlefield");
    expect(kept).toHaveLength(1);
    expect(s.players[ap]!.graveyard.some((id) => id === dog || id === cat)).toBe(true);
  });

  it("bots keep the equipped creature's own name", () => {
    const { s: s0, ap } = setup([]);
    const p = putOnBattlefield(s0, ap, paper());
    const elf = putOnBattlefield(s0, ap, elves());
    inLibrary(s0, ap, isamaru());
    const { s, asked } = equip(s0, ap, p, elf);
    expect(asked.map((a) => a.what)).toEqual(["cardName", "creatureType"]);
    expect(ch(s, elf).name).toBe("Llanowar Elves");
    expect(ch(s, elf).subtypes).toHaveLength(1);
    expect(ch(s, elf).cantBeBlocked).toBeTruthy();
  });
});
