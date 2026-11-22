// Round 448: Dinosaur Headdress, the back face of Paleontologist's Pick-Axe: "As this Equipment becomes attached to a
// creature, choose an exiled creature card used to craft this Equipment." (asked each time it becomes attached, CR 614.12,
// among the cards its craft cost exiled still in exile, CR 702.167c) and "Equipped creature is a copy of the last chosen
// card." (a static copy effect of the card as printed, CR 707.2, 611.3a, with the Equipment's timestamp, 613.7e).

import { describe, expect, it } from "vitest";
import { act, bear, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, botActions, characteristics, defOf, invalidateCharacteristics, isFullySupported, planActivate, power, toughness, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const axe = (): CardDef => ({"oracleId":"9b0c6b77-69df-4330-86a7-8dc4666abd38","name":"Paleontologist's Pick-Axe // Dinosaur Headdress","manaCost":"{2}","cmc":2,"typeLine":"Artifact — Equipment // Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Whenever equipped creature attacks, draw a card, then discard a card.\nEquip {1}\nCraft with one or more creatures {5} ({5}, Exile this artifact, Exile one or more creatures you control and/or creature cards from your graveyard: Return this card transformed under its owner's control. Craft only as a sorcery.)","colors":[],"colorIdentity":[],"keywords":["Craft","Transform","Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/e/0/e08c0cf4-3669-4a9a-aa12-7e8fe0f063ad.jpg?1783913936","artUrl":"https://cards.scryfall.io/art_crop/front/e/0/e08c0cf4-3669-4a9a-aa12-7e8fe0f063ad.jpg?1783913936","commanderLegal":"legal","set":"lcc","releasedAt":"2023-11-17","rarity":"mythic","layout":"transform","gameChanger":false,"faces":[{"name":"Paleontologist's Pick-Axe","manaCost":"{2}","typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Whenever equipped creature attacks, draw a card, then discard a card.\nEquip {1}\nCraft with one or more creatures {5} ({5}, Exile this artifact, Exile one or more creatures you control and/or creature cards from your graveyard: Return this card transformed under its owner's control. Craft only as a sorcery.)","colors":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/0/e08c0cf4-3669-4a9a-aa12-7e8fe0f063ad.jpg?1783913936","artUrl":"https://cards.scryfall.io/art_crop/front/e/0/e08c0cf4-3669-4a9a-aa12-7e8fe0f063ad.jpg?1783913936"},{"name":"Dinosaur Headdress","manaCost":"","typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"When this Equipment enters, attach it to target creature you control.\nAs this Equipment becomes attached to a creature, choose an exiled creature card used to craft this Equipment.\nEquipped creature is a copy of the last chosen card.\nEquip {2}","colors":[],"imageUrl":"https://cards.scryfall.io/normal/back/e/0/e08c0cf4-3669-4a9a-aa12-7e8fe0f063ad.jpg?1783913936","artUrl":"https://cards.scryfall.io/art_crop/back/e/0/e08c0cf4-3669-4a9a-aa12-7e8fe0f063ad.jpg?1783913936"}]}) as CardDef;
const serra = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","commanderLegal":"legal","set":"sld","releasedAt":"2023-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const chupa = (): CardDef => ({"oracleId":"7b459306-149b-4f43-abc1-2dd70c748c0e","name":"Ravenous Chupacabra","manaCost":"{2}{B}{B}","cmc":4,"typeLine":"Creature — Beast Horror","supertypes":[],"types":["Creature"],"subtypes":["Beast","Horror"],"oracleText":"When this creature enters, destroy target creature an opponent controls.","power":"2","toughness":"2","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/2/02551196-ecea-472f-9547-3c9658d0489e.jpg?1783935306","artUrl":"https://cards.scryfall.io/art_crop/front/0/2/02551196-ecea-472f-9547-3c9658d0489e.jpg?1783935306","commanderLegal":"legal","set":"rix","releasedAt":"2018-01-19","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const elves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
type Asked = { options: string[]; labels: string[]; objectId?: string; player: PlayerId };
/** Pass, and let bots answer every other question, until the stack and trigger queue are empty; `pick` names the card chosen for the Headdress (none: the bot's answer). */
function settle(s: GameState, asked: Asked[], pick?: string) {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const pid = waitingOn(s)!;
    const q = s.pending;
    if (q?.kind === "chooseOption" && q.what === "attachCopy") {
      asked.push({ options: [...q.options], labels: [...(q.labels ?? [])], objectId: q.objectId, player: q.player });
      const choice = pick === undefined ? undefined : q.options[q.labels!.indexOf(pick)];
      s = act(s, choice ? { type: "chooseOption", player: q.player, choice } : botActions(s, q.player)[0]!);
    } else if (q) s = act(s, botActions(s, pid)[0]!);
    else s = act(s, { type: "passPriority", player: pid });
  }
  return s;
}
/** A card of `pid`'s put into their graveyard. */
function inYard(s: GameState, pid: PlayerId, def: CardDef) {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  invalidateCharacteristics(s);
  return id;
}
const ch = (s: GameState, id: string) => characteristics(s, s.objects[id]!);
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const craftIndex = (s: GameState, id: string) => abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => a.keyword === "Craft");

/** Pick-Axe on the battlefield, Grizzly Bears, and Serra Angel and Ravenous Chupacabra in the graveyard; crafted with those two cards. */
function crafted(pick?: string) {
  const { s: s0, ap, opp } = setup([]);
  const axeId = putOnBattlefield(s0, ap, axe());
  const bears = putOnBattlefield(s0, ap, bear());
  const theirs = putOnBattlefield(s0, opp, bear({ name: "Opposing Bear" }));
  const angel = inYard(s0, ap, serra());
  const chupacabra = inYard(s0, ap, chupa());
  const asked: Asked[] = [];
  const plan = planActivate(s0, ap, axeId, craftIndex(s0, axeId), undefined, undefined, undefined, undefined, { craft: [angel, chupacabra] } as CostChoices);
  const s = settle(run(s0, plan), asked, pick);
  return { s, ap, axeId, bears, theirs, angel, chupacabra, asked };
}

describe("round 448: Paleontologist's Pick-Axe // Dinosaur Headdress", () => {
  it("is fully supported", () => {
    expect(isFullySupported(axe())).toBe(true);
  });

  it("crafted, it enters and is attached to a creature you control, and a card used to craft it is chosen: the creature is a copy of it", () => {
    const { s, ap, axeId, bears, angel, chupacabra, asked } = crafted("Serra Angel");
    expect(defOf(s, s.objects[axeId]!).name).toBe("Dinosaur Headdress");
    expect(s.objects[angel]!.zone).toBe("exile");
    expect(s.objects[axeId]!.attachedTo).toBe(bears);
    // Asked once, its controller, among the two creature cards used to craft it.
    expect(asked).toHaveLength(1);
    expect(asked[0]!.player).toBe(ap);
    expect(asked[0]!.objectId).toBe(axeId);
    expect([...asked[0]!.options].sort()).toEqual([angel, chupacabra].sort());
    expect([...asked[0]!.labels].sort()).toEqual(["Ravenous Chupacabra", "Serra Angel"]);
    const c = ch(s, bears);
    expect(c.name).toBe("Serra Angel");
    expect(c.subtypes).toEqual(["Angel"]);
    expect(c.colors).toEqual(["W"]);
    expect(c.keywords).toEqual(expect.arrayContaining(["Flying", "Vigilance"]));
    expect(pt(s, bears)).toBe("4/4");
    // Still an Equipment, attached to it.
    expect(ch(s, axeId).subtypes).toContain("Equipment");
  });

  it("becoming a copy isn't entering: the copied card's enters ability doesn't trigger, and counters stay (rulings)", () => {
    const { s, bears, theirs } = crafted("Ravenous Chupacabra");
    expect(ch(s, bears).name).toBe("Ravenous Chupacabra");
    expect(pt(s, bears)).toBe("2/2");
    // "When this creature enters, destroy target creature an opponent controls" never triggered.
    expect(s.objects[theirs]!.zone).toBe("battlefield");
    expect(s.stack).toHaveLength(0);
    s.objects[bears]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s);
    expect(pt(s, bears)).toBe("3/3");
  });

  it("equipped to another creature, the card is chosen again: the first creature is itself again, the new one a copy of the last chosen card", () => {
    const { s: s0, ap, axeId, bears } = crafted("Serra Angel");
    const elf = putOnBattlefield(s0, ap, elves());
    invalidateCharacteristics(s0);
    const asked: Asked[] = [];
    const equipIndex = abilitiesOf(s0, s0.objects[axeId]!).activated.findIndex((a) => a.equip);
    const s = settle(run(s0, planActivate(s0, ap, axeId, equipIndex, [{ kind: "object", id: elf }])), asked, "Ravenous Chupacabra");
    expect(asked).toHaveLength(1);
    expect(s.objects[axeId]!.attachedTo).toBe(elf);
    expect(ch(s, bears).name).toBe("Grizzly Bears");
    expect(pt(s, bears)).toBe("2/2");
    expect(ch(s, elf).name).toBe("Ravenous Chupacabra");
    expect(ch(s, elf).subtypes).toEqual(["Beast", "Horror"]);
    // A copy of a card has only its printed abilities: no mana ability of Llanowar Elves now.
    expect(abilitiesOf(s, s.objects[elf]!).mana).toHaveLength(0);
  });

  it("with one card used to craft it left in exile, that one is chosen without asking; the copy stays if the chosen card leaves exile", () => {
    const { s: s0, ap, axeId, bears, angel, chupacabra } = crafted("Serra Angel");
    let s = s0;
    // The Chupacabra card leaves exile: it's no longer used to craft it (CR 702.167c, 400.7).
    const c = s.objects[chupacabra]!;
    s.players[ap]!.exile = s.players[ap]!.exile.filter((x) => x !== chupacabra);
    c.zone = "graveyard";
    c.zoneChanges = (c.zoneChanges ?? 0) + 1;
    s.players[ap]!.graveyard.push(chupacabra);
    const elf = putOnBattlefield(s, ap, elves());
    invalidateCharacteristics(s);
    const asked: Asked[] = [];
    const equipIndex = abilitiesOf(s, s.objects[axeId]!).activated.findIndex((a) => a.equip);
    s = settle(run(s, planActivate(s, ap, axeId, equipIndex, [{ kind: "object", id: elf }])), asked);
    expect(asked).toHaveLength(0);
    expect(ch(s, elf).name).toBe("Serra Angel");
    expect(ch(s, bears).name).toBe("Grizzly Bears");
    // The Serra Angel card leaves exile too: the copiable values were locked in as it was chosen (judgment call, as
    // Metamorphic Alteration's rulings say of its chosen creature leaving the battlefield).
    const a = s.objects[angel]!;
    s.players[ap]!.exile = s.players[ap]!.exile.filter((x) => x !== angel);
    a.zone = "graveyard";
    a.zoneChanges = (a.zoneChanges ?? 0) + 1;
    s.players[ap]!.graveyard.push(angel);
    invalidateCharacteristics(s);
    s = settle(s, []);
    expect(ch(s, elf).name).toBe("Serra Angel");
  });

  it("with no card used to craft it left in exile, nothing is chosen and nothing is copied", () => {
    const { s: s0, ap } = setup([]);
    const axeId = putOnBattlefield(s0, ap, axe());
    const bears = putOnBattlefield(s0, ap, bear());
    // Crafted with a creature from the battlefield that's a token: it doesn't stay in exile (rulings).
    const tok = putOnBattlefield(s0, ap, bear({ name: "Bear Token" }));
    s0.objects[tok]!.isToken = true;
    invalidateCharacteristics(s0);
    const asked: Asked[] = [];
    const plan = planActivate(s0, ap, axeId, craftIndex(s0, axeId), undefined, undefined, undefined, undefined, { craft: [tok] } as CostChoices);
    const s = settle(run(s0, plan), asked);
    expect(defOf(s, s.objects[axeId]!).name).toBe("Dinosaur Headdress");
    expect(s.objects[axeId]!.attachedTo).toBe(bears);
    expect(asked).toHaveLength(0);
    expect(ch(s, bears).name).toBe("Grizzly Bears");
  });

  it("a bot chooses the biggest of the cards", () => {
    const { s, bears } = crafted();
    expect(ch(s, bears).name).toBe("Serra Angel");
  });

  it("unattached, the creature is itself again", () => {
    const { s: s0, axeId, bears } = crafted("Serra Angel");
    let s = s0;
    s.objects[axeId]!.attachedTo = undefined;
    invalidateCharacteristics(s);
    s = settle(s, []);
    // State-based actions end the copy effect (game.ts syncAuraCopies).
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(ch(s, bears).name).toBe("Grizzly Bears");
  });
});
