// Round 335 (Lane A): Sasaya, Orochi Ascendant // Sasaya's Essence (a "Reveal your hand" cost, more mana for each other
// land with the same name), Tazri, Stalwart Survivor (a granted mana ability "Activate only if this creature has another
// activated ability", creature cards with activated abilities that aren't mana abilities), The Master, Formed Anew (a
// takeover counter on a card in exile, entering as a copy of such a card) and Tezzeret, Cruel Machinist (cards from a hand
// face down as 5/5 artifact creatures).

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, activatedAbilityCount, applyAction, botActions, characteristics, defOf, invalidateCharacteristics, isFullySupported, manaAbilitiesOn, manaOptions, planActivate, planCast, power, toughness, turnFaceUpByEffect, waitingOn, type Action, type CardDef, type GameState, type PendingDecision, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; other players' questions as the bots would. Stops at any question of `me`'s. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Moves a new card for `def` from the battlefield into `pid`'s `zone`. */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library" = "hand") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const name = (s: GameState, id: string) => characteristics(s, s.objects[id]!).name;
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
const pend = <K extends PendingDecision["kind"]>(s: GameState, kind: K) => {
  expect(s.pending?.kind).toBe(kind);
  return s.pending as Extract<PendingDecision, { kind: K }>;
};
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
/** `setup` with only `hand` in the active player's hand: the cards it drew go back into the library. */
const only = (hand: CardDef[]) => {
  const r = setup(hand);
  const p = r.s.players[r.ap]!;
  const drawn = p.hand.filter((id) => !r.ids.includes(id));
  p.hand = p.hand.filter((id) => r.ids.includes(id));
  for (const id of drawn) {
    r.s.objects[id]!.zone = "library";
    p.library.push(id);
  }
  invalidateCharacteristics(r.s);
  return r;
};
const lands = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && characteristics(s, s.objects[id]!).types.includes("Land"));

// Real oracle text (Scryfall).
const sasaya = (): CardDef => ({"oracleId":"f07f3bf0-e1c8-4a24-87c7-1d6d0b5bd242","name":"Sasaya, Orochi Ascendant // Sasaya's Essence","manaCost":"{1}{G}{G}","cmc":3,"typeLine":"Legendary Creature — Snake Monk // Legendary Enchantment","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Snake","Monk"],"oracleText":"Reveal your hand: If you have seven or more land cards in your hand, flip Sasaya.","power":"2","toughness":"3","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/d/2/d224c50f-8146-4c91-9401-04e5bd306d02.jpg?1783944135","artUrl":"https://cards.scryfall.io/art_crop/front/d/2/d224c50f-8146-4c91-9401-04e5bd306d02.jpg?1783944135","commanderLegal":"legal","set":"sok","releasedAt":"2005-06-03","rarity":"rare","layout":"flip","gameChanger":false,"faces":[{"name":"Sasaya, Orochi Ascendant","manaCost":"{1}{G}{G}","typeLine":"Legendary Creature — Snake Monk","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Snake","Monk"],"oracleText":"Reveal your hand: If you have seven or more land cards in your hand, flip Sasaya.","power":"2","toughness":"3","colors":["G"]},{"name":"Sasaya's Essence","manaCost":"{1}{G}{G}","typeLine":"Legendary Enchantment","supertypes":["Legendary"],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever a land you control is tapped for mana, add an additional one mana of any type that land produced for each other land you control with the same name as it.","colors":["G"]}]}) as CardDef;
const tazri = (): CardDef => ({"oracleId":"13a3e61d-c9ff-447d-9016-09a183b7af1d","name":"Tazri, Stalwart Survivor","manaCost":"{2}{W}","cmc":3,"typeLine":"Legendary Creature — Human Warrior","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Warrior"],"oracleText":"Each creature you control has \"{T}: Add one mana of any of this creature's colors. Spend this mana only to activate an ability of a creature. Activate only if this creature has another activated ability.\"\n{W}{U}{B}{R}{G}, {T}: Mill five cards. Put all creature cards with activated abilities that aren't mana abilities from among the milled cards into your hand.","power":"3","toughness":"3","colors":["W"],"colorIdentity":["B","G","R","U","W"],"keywords":["Mill"],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/1/2/12c08ba6-a8a6-4cf5-83a5-c087e3272f66.jpg?1783916452","artUrl":"https://cards.scryfall.io/art_crop/front/1/2/12c08ba6-a8a6-4cf5-83a5-c087e3272f66.jpg?1783916452","commanderLegal":"legal","set":"mat","releasedAt":"2023-05-12","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const master = (): CardDef => ({"oracleId":"e7828284-543d-4f8b-9c5e-a8f082010398","name":"The Master, Formed Anew","manaCost":"{U}{B}","cmc":2,"typeLine":"Legendary Creature — Time Lord Rogue","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Time Lord","Rogue"],"oracleText":"Body Thief — When you cast this spell, you may exile a creature you control and put a takeover counter on it.\nYou may have The Master enter as a copy of a creature card in exile with a takeover counter on it.","power":"0","toughness":"1","colors":["B","U"],"colorIdentity":["B","U"],"keywords":["Body Thief"],"imageUrl":"https://cards.scryfall.io/normal/front/2/2/225fd1e5-cd42-4c33-bfcd-9287289d2098.jpg?1783914297","artUrl":"https://cards.scryfall.io/art_crop/front/2/2/225fd1e5-cd42-4c33-bfcd-9287289d2098.jpg?1783914297","commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const tezzeret = (): CardDef => ({"oracleId":"e5a95145-dc29-4bfc-bb14-b7a269268366","name":"Tezzeret, Cruel Machinist","manaCost":"{4}{U}{U}","cmc":6,"typeLine":"Legendary Planeswalker — Tezzeret","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Tezzeret"],"oracleText":"+1: Draw a card.\n0: Until your next turn, target artifact you control becomes a 5/5 creature in addition to its other types.\n−7: Put any number of cards from your hand onto the battlefield face down. They're 5/5 artifact creatures.","loyalty":"4","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/7/277dbeea-103c-4c5b-8981-3f5f7e60c66a.jpg?1783934489","artUrl":"https://cards.scryfall.io/art_crop/front/2/7/277dbeea-103c-4c5b-8981-3f5f7e60c66a.jpg?1783934489","commanderLegal":"legal","set":"m19","releasedAt":"2018-07-13","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const mossfire = (): CardDef => ({"oracleId":"23bbd091-f6ff-4514-97aa-42c08164b4eb","name":"Mossfire Valley","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"{1}, {T}: Add {R}{G}.","colors":[],"colorIdentity":["G","R"],"keywords":[],"producedMana":["G","R"],"imageUrl":"https://cards.scryfall.io/normal/front/d/e/de5279fc-2532-4e66-bc44-ca395e106ab0.jpg?1783906215","artUrl":"https://cards.scryfall.io/art_crop/front/d/e/de5279fc-2532-4e66-bc44-ca395e106ab0.jpg?1783906215","commanderLegal":"legal","set":"fic","releasedAt":"2025-06-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const wraith = (): CardDef => ({"oracleId":"bd7867f4-4f58-49c2-9c24-a124dfdb506d","name":"Street Wraith","manaCost":"{3}{B}{B}","cmc":5,"typeLine":"Creature — Wraith","supertypes":[],"types":["Creature"],"subtypes":["Wraith"],"oracleText":"Swampwalk (This creature can't be blocked as long as defending player controls a Swamp.)\nCycling—Pay 2 life. (Pay 2 life, Discard this card: Draw a card.)","power":"3","toughness":"4","colors":["B"],"colorIdentity":["B"],"keywords":["Landwalk","Swampwalk","Cycling"],"imageUrl":"https://cards.scryfall.io/normal/front/7/d/7d078cad-7f2b-4bef-b637-46aec9c8ed36.jpg?1783927808","artUrl":"https://cards.scryfall.io/art_crop/front/7/d/7d078cad-7f2b-4bef-b637-46aec9c8ed36.jpg?1783927808","commanderLegal":"legal","set":"tsr","releasedAt":"2021-03-19","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const elves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const sorcerer = (): CardDef => ({"oracleId":"5e961d15-5972-4e4b-9385-1cd7cd7c6bbe","name":"Prodigal Sorcerer","manaCost":"{2}{U}","cmc":3,"typeLine":"Creature — Human Wizard Sorcerer","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard","Sorcerer"],"oracleText":"{T}: This creature deals 1 damage to any target.","power":"1","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/0/50aef269-55f9-4d84-8bc5-29e794297f11.jpg?1783937607","artUrl":"https://cards.scryfall.io/art_crop/front/5/0/50aef269-55f9-4d84-8bc5-29e794297f11.jpg?1783937607","commanderLegal":"legal","set":"ema","releasedAt":"2016-06-10","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const serra = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","commanderLegal":"legal","set":"sld","releasedAt":"2023-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const pacifism = (): CardDef => ({"oracleId":"5f5e0b10-c8cf-450c-bfd3-bcb0528ec330","name":"Pacifism","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't attack or block.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","artUrl":"https://cards.scryfall.io/art_crop/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const arbor = (): CardDef => ({"oracleId":"e996cd67-739c-40f4-b276-0042acf26c71","name":"Dryad Arbor","manaCost":"","cmc":0,"typeLine":"Land Creature — Forest Dryad","supertypes":[],"types":["Land","Creature"],"subtypes":["Forest","Dryad"],"oracleText":"(This land isn't a spell, it's affected by summoning sickness, and it has \"{T}: Add {G}.\")","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/5/c/5c4fb7f9-a551-4253-a46e-f6284d355388.jpg?1783904262","artUrl":"https://cards.scryfall.io/art_crop/front/5/c/5c4fb7f9-a551-4253-a46e-f6284d355388.jpg?1783904262","commanderLegal":"legal","set":"sld","releasedAt":"2026-02-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const shade = card("Test Shade", "Creature — Shade", "{B}", { power: "1", toughness: "1", oracleText: "{B}: Test Shade gets +1/+1 until end of turn." });
const vanilla = card("Test Golem", "Creature — Golem", "{3}", { power: "3", toughness: "3" });

describe("round 335: compiles", () => {
  it("every card of the round", () => supported(sasaya(), tazri(), master(), tezzeret()));
});

describe("round 335: Sasaya, Orochi Ascendant // Sasaya's Essence", () => {
  const flipWith = (hand: CardDef[]) => {
    const { s: s0, ap } = only(hand);
    const id = putOnBattlefield(s0, ap, sasaya());
    expect(abilitiesOf(s0, s0.objects[id]!).activated[0]!.costs).toEqual([{ kind: "revealHand" }]);
    const s = settle(run(s0, planActivate(s0, ap, id, 0)), ap);
    return { s, ap, id };
  };

  it("revealing a hand with seven or more land cards flips it; with fewer it does nothing, and an empty hand can still be revealed", () => {
    const seven = flipWith(Array.from({ length: 7 }, () => forest));
    expect(name(seven.s, seven.id)).toBe("Sasaya's Essence");
    expect(characteristics(seven.s, seven.s.objects[seven.id]!).types).toEqual(["Enchantment"]);
    expect(seven.s.log.some((l) => /reveals their hand: Forest/.test(l.text))).toBe(true);
    // Six lands and a creature card: seven cards, not seven land cards.
    const six = flipWith([...Array.from({ length: 6 }, () => forest), bear()]);
    expect(name(six.s, six.id)).toBe("Sasaya, Orochi Ascendant");
    // No tap in the cost: it can be activated again, even with an empty hand (rulings).
    const empty = flipWith([]);
    expect(name(empty.s, empty.id)).toBe("Sasaya, Orochi Ascendant");
    expect(empty.s.log.some((l) => /reveals their hand \(it's empty\)/.test(l.text))).toBe(true);
  });

  it("the Essence adds one more mana of the type a land made for each other land its controller controls with that name", () => {
    const { s, ap, id } = flipWith(Array.from({ length: 7 }, () => forest));
    expect(name(s, id)).toBe("Sasaya's Essence");
    // Setup gives three Forests: one tapped for {G} adds {G}{G} more. An opponent's Forest doesn't count.
    const opp = s.turnOrder.find((p) => p !== ap)!;
    putOnBattlefield(s, opp, forest);
    const f = lands(s, ap).find((l) => name(s, l) === "Forest")!;
    expect(manaOptions(s, s.objects[f]!).map((o) => o.adds)).toEqual([["G", "G", "G"]]);
    // A Mountain (three of them) the same way, and a Swamp with one other Swamp.
    const m = lands(s, ap).find((l) => name(s, l) === "Mountain")!;
    expect(manaOptions(s, s.objects[m]!).map((o) => o.adds)).toEqual([["R", "R", "R"]]);
    const sw = lands(s, ap).find((l) => name(s, l) === "Swamp")!;
    expect(manaOptions(s, s.objects[sw]!).map((o) => o.adds)).toEqual([["B", "B"]]);
    const t = act(s, { type: "activateMana", player: ap, objectId: f, mana: "G" });
    expect(t.players[ap]!.manaPool.G).toBe(3);
  });

  it("a land that made two kinds of mana: each extra mana is either of them (rulings on Mossfire Valley)", () => {
    const { s, ap, id } = flipWith(Array.from({ length: 7 }, () => forest));
    expect(name(s, id)).toBe("Sasaya's Essence");
    const a = putOnBattlefield(s, ap, mossfire());
    putOnBattlefield(s, ap, mossfire());
    putOnBattlefield(s, ap, mossfire());
    const adds = manaOptions(s, s.objects[a]!).map((o) => [...o.adds].sort().join(""));
    // {R}{G}, then two more in any mix of {R} and {G}.
    expect(adds.sort()).toEqual(["GGGR", "GGRR", "GRRR"]);
  });

  it("a bot reveals its hand only once it has seven land cards in it", () => {
    // Nothing else to do: its lands tapped and its land for the turn played.
    const bot = (hand: CardDef[]) => {
      const r = only(hand);
      for (const l of lands(r.s, r.ap)) r.s.objects[l]!.tapped = true;
      r.s.players[r.ap]!.landsPlayedThisTurn = 1;
      const id = putOnBattlefield(r.s, r.ap, sasaya());
      // Bots use activated abilities in their second main phase.
      const s = passUntil(r.s, "main2", r.ap);
      return { ...r, s, id, acts: botActions(s, r.ap) };
    };
    const few = bot([forest, forest, bear()]);
    expect(few.acts.some((a) => a.type === "activateAbility" && a.objectId === few.id)).toBe(false);
    const many = bot(Array.from({ length: 7 }, () => forest));
    expect(many.acts).toMatchObject([{ type: "activateAbility", player: many.ap, objectId: many.id, index: 0 }]);
    let s = many.s;
    for (const a of many.acts) s = act(s, a);
    s = settle(s);
    expect(name(s, many.id)).toBe("Sasaya's Essence");
  });
});

describe("round 335: Tazri, Stalwart Survivor", () => {
  const grantedIndex = (s: GameState, id: string) => manaAbilitiesOn(s, s.objects[id]!).findIndex((m) => m.produces.kind === "colorsAmong");

  it("each creature gets the mana ability, usable only if it has another activated ability (cycling too, rulings)", () => {
    const { s, ap } = setup([]);
    const tz = putOnBattlefield(s, ap, tazri());
    const elf = putOnBattlefield(s, ap, elves());
    const wr = putOnBattlefield(s, ap, wraith());
    const gol = putOnBattlefield(s, ap, vanilla);
    // Tazri herself has her mill ability; the Elves their own mana ability; Street Wraith cycling (from a hand only).
    expect(activatedAbilityCount(s, s.objects[gol]!)).toBe(1);
    expect(activatedAbilityCount(s, s.objects[wr]!)).toBe(2);
    expect(manaOptions(s, s.objects[tz]!).map((o) => o.adds)).toEqual([["W"]]);
    expect(manaOptions(s, s.objects[elf]!).map((o) => o.adds)).toEqual([["G"], ["G"]]);
    expect(manaOptions(s, s.objects[wr]!).map((o) => o.adds)).toEqual([["B"]]);
    // The colorless Golem has only this ability, and no color to make: none.
    expect(manaOptions(s, s.objects[gol]!)).toEqual([]);
    expect(() => act(s, { type: "activateMana", player: ap, objectId: wr, mana: "B", ability: grantedIndex(s, wr) })).not.toThrow();
    // An opponent's creature doesn't have it.
    const opp = s.turnOrder.find((p) => p !== ap)!;
    const theirs = putOnBattlefield(s, opp, elves());
    expect(manaOptions(s, s.objects[theirs]!).map((o) => o.adds)).toEqual([["G"]]);
  });

  it("its mana is spent only on abilities of creatures on the battlefield, not on spells", () => {
    const { s: s0, ap, ids } = setup([bolt()]);
    let s = s0;
    for (const l of lands(s, ap)) s.objects[l]!.tapped = true;
    putOnBattlefield(s, ap, tazri());
    const sh = putOnBattlefield(s, ap, shade);
    // The Shade's own ability makes it "another activated ability": tap it for {B}.
    s = act(s, { type: "activateMana", player: ap, objectId: sh, mana: "B", ability: grantedIndex(s, sh) });
    expect(s.players[ap]!.manaPool.B).toBe(1);
    expect(planCast(s, ap, ids[0]!, [{ kind: "player", id: s.turnOrder.find((p) => p !== ap)! }])).toBeNull();
    s = settle(run(s, planActivate(s, ap, sh, 0)), ap);
    expect(pt(s, sh)).toBe("2/2");
  });

  it("{W}{U}{B}{R}{G}, {T}: mill five, then every creature card milled with an activated ability that isn't a mana ability goes to the hand", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const tz = putOnBattlefield(s, ap, tazri());
    // From the top: Prodigal Sorcerer, Llanowar Elves, Street Wraith, a vanilla creature, Lightning Bolt.
    const cards = [bolt(), vanilla, wraith(), elves(), sorcerer()].map((d) => into(s, ap, d, "library"));
    const [b, g, w, e, p] = cards;
    s = settle(run(s, planActivate(s, ap, tz, 0)), ap);
    expect(zone(s, p!)).toBe("hand");
    expect(zone(s, w!)).toBe("hand");
    expect(zone(s, e!)).toBe("graveyard");
    expect(zone(s, g!)).toBe("graveyard");
    expect(zone(s, b!)).toBe("graveyard");
  });
});

describe("round 335: The Master, Formed Anew", () => {
  const castMaster = (pick: "yes" | "no", creature?: CardDef, token = false) => {
    const { s: s0, ap, ids } = setup([master()]);
    let s = s0;
    const target = creature ? putOnBattlefield(s, ap, creature) : undefined;
    if (target && token) s.objects[target]!.isToken = true;
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s, ap);
    const may = pend(s, "chooseMay");
    expect(may.player).toBe(ap);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: pick === "yes" }), ap);
    return { s, ap, master: ids[0]!, target };
  };

  it("Body Thief exiles a creature you control with a takeover counter, and The Master may enter as a copy of it", () => {
    let { s, ap, master: m, target } = castMaster("yes", serra());
    // One creature to choose: it's chosen without a question.
    if (s.pending?.kind === "pickPermanents") s = settle(act(s, { type: "pickPermanents", player: ap, ids: [target!] }), ap);
    expect(zone(s, target!)).toBe("exile");
    expect(s.objects[target!]!.counters.takeover).toBe(1);
    const choice = pend(s, "chooseOption");
    expect(choice.what).toBe("copy");
    expect(choice.options).toEqual([target, "none"]);
    expect(choice.labels?.[0]).toMatch(/Serra Angel .*in exile/);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: target! }), ap);
    expect(name(s, m)).toBe("Serra Angel");
    expect(pt(s, m)).toBe("4/4");
    expect(characteristics(s, s.objects[m]!).keywords).toContain("Flying");
  });

  it("any creature card in exile with a takeover counter, whoever owns it; not one without the counter, and not a token", () => {
    // Declined: nothing exiled, so no copy to choose (it enters as itself).
    let { s, master: m } = castMaster("no", serra());
    expect(name(s, m)).toBe("The Master, Formed Anew");
    expect(pt(s, m)).toBe("0/1");
    // An opponent's creature card exiled with a takeover counter (by another Master) can be copied.
    const second = setup([master()]);
    s = second.s;
    const opp = s.turnOrder.find((p) => p !== second.ap)!;
    const theirs = into(s, opp, serra(), "hand");
    s.players[opp]!.hand = s.players[opp]!.hand.filter((x) => x !== theirs);
    s.objects[theirs]!.zone = "exile";
    s.players[opp]!.exile.push(theirs);
    s.objects[theirs]!.counters.takeover = 1;
    const plain = into(s, opp, bear(), "hand");
    s.players[opp]!.hand = s.players[opp]!.hand.filter((x) => x !== plain);
    s.objects[plain]!.zone = "exile";
    s.players[opp]!.exile.push(plain);
    s = run(s, planCast(s, second.ap, second.ids[0]!));
    s = settle(s, second.ap);
    // Nothing of ours to exile: the may is still asked, and declined.
    if (s.pending?.kind === "chooseMay") s = settle(act(s, { type: "chooseMay", player: second.ap, yes: false }), second.ap);
    const choice = pend(s, "chooseOption");
    expect(choice.options).toEqual([theirs, "none"]);
    // A token exiled this way ceases to exist (CR 111.7): no counter, nothing to copy.
    const tok = castMaster("yes", bear(), true);
    expect(tok.s.objects[tok.target!]?.zone ?? "gone").not.toBe("battlefield");
    expect(name(tok.s, tok.master)).toBe("The Master, Formed Anew");
  });
});

describe("round 335: Tezzeret, Cruel Machinist", () => {
  it("−7: any number of cards from the hand face down as 5/5 artifact creatures with no name, color or other text", () => {
    const { s: s0, ap, ids } = only([bolt(), pacifism(), forest, bear()]);
    let s = s0;
    const tz = putOnBattlefield(s, ap, tezzeret());
    s.objects[tz]!.counters.loyalty = 7;
    const played = s.players[ap]!.landsPlayedThisTurn;
    s = settle(run(s, planActivate(s, ap, tz, 2)), ap);
    const search = pend(s, "searchLibrary");
    expect(search).toMatchObject({ min: 0, max: 4, fromHand: true });
    expect(search.cards).toEqual(ids);
    const [b, pac, f, bb] = ids;
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [b!, pac!, f!] }), ap);
    for (const id of [b!, pac!, f!]) {
      expect(zone(s, id)).toBe("battlefield");
      const c = characteristics(s, s.objects[id]!);
      expect(c.types.sort()).toEqual(["Artifact", "Creature"]);
      expect(c.subtypes).toEqual([]);
      expect(c.colors).toEqual([]);
      expect(pt(s, id)).toBe("5/5");
    }
    // Pacifism isn't an Aura face down: attached to nothing. The Forest wasn't played as a land.
    expect(s.objects[pac!]!.attachedTo).toBeUndefined();
    expect(s.players[ap]!.landsPlayedThisTurn).toBe(played);
    expect(zone(s, bb!)).toBe("hand");
    // Seven loyalty removed: Tezzeret is put into the graveyard (CR 704.5i).
    expect(zone(s, tz)).toBe("graveyard");
  });

  it("turned face up by an effect, it's the card again; an instant or sorcery card stays face down (rulings)", () => {
    const { s: s0, ap, ids } = only([bolt(), bear()]);
    let s = s0;
    const tz = putOnBattlefield(s, ap, tezzeret());
    s.objects[tz]!.counters.loyalty = 8;
    s = settle(run(s, planActivate(s, ap, tz, 2)), ap);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [ids[0]!, ids[1]!] }), ap);
    expect(turnFaceUpByEffect(s, s.objects[ids[0]!]!, "Test")).toBe(false);
    expect(s.objects[ids[0]!]!.faceDown).toBe("artifact55");
    expect(turnFaceUpByEffect(s, s.objects[ids[1]!]!, "Test")).toBe(true);
    invalidateCharacteristics(s);
    expect(name(s, ids[1]!)).toBe("Grizzly Bears");
    expect(pt(s, ids[1]!)).toBe("2/2");
    expect(defOf(s, s.objects[ids[0]!]!).name).toBe("Face-down artifact creature");
  });

  it("a bot's −7 puts its whole hand face down", () => {
    const { s: s0, ap, ids } = only([bolt(), bear(), forest]);
    let s = s0;
    const tz = putOnBattlefield(s, ap, tezzeret());
    s.objects[tz]!.counters.loyalty = 7;
    s = run(s, planActivate(s, ap, tz, 2));
    s = settle(s);
    for (const id of ids) expect(zone(s, id)).toBe("battlefield");
  });
});

describe("round 335: The Master, Formed Anew's bot", () => {
  const drifter = card("Test Drifter", "Creature — Elemental", "{4}{U}", { power: "2", toughness: "2", oracleText: "When this creature enters, draw two cards." });
  const botCast = (...defs: CardDef[]) => {
    const { s: s0, ap, ids } = only([master()]);
    let s = s0;
    const mine = defs.map((d) => putOnBattlefield(s, ap, d));
    s = settle(run(s, planCast(s, ap, ids[0]!)), ap);
    for (let i = 0; i < 10 && s.pending; i++) s = settle(act(s, botActions(s, ap)[0]!), ap);
    return { s, ap, master: ids[0]!, mine };
  };

  it("exiles only a creature with an enters trigger, then enters as a copy of it", () => {
    const plain = botCast(serra(), bear());
    expect(plain.mine.map((id) => zone(plain.s, id))).toEqual(["battlefield", "battlefield"]);
    expect(name(plain.s, plain.master)).toBe("The Master, Formed Anew");
    const etb = botCast(serra(), drifter);
    expect(zone(etb.s, etb.mine[1]!)).toBe("exile");
    expect(zone(etb.s, etb.mine[0]!)).toBe("battlefield");
    expect(name(etb.s, etb.master)).toBe("Test Drifter");
  });
});
