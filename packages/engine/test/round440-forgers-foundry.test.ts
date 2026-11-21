// Round 440 (Lane A): Forger's Foundry ("{T}: Add {U}. When you spend this mana to cast an instant or sorcery spell with
// mana value 3 or less, you may exile that spell instead of putting it into its owner's graveyard as it resolves." and
// "{3}{U}{U}, {T}: You may cast any number of spells from among cards exiled with this artifact without paying their mana
// costs. Activate only as a sorcery.": a delayed trigger for the mana, CR 106.6, 603.7a; a replacement as the spell
// resolves, CR 608.2n, 614.1a; the exiled cards linked to the Foundry, CR 607.2a).

import { describe, expect, it } from "vitest";
import { act, island, putOnBattlefield, setup } from "./helpers";
import { botActions, compileCard, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real card data (Scryfall).
const foundry = (): CardDef => ({"oracleId":"118da256-d1ea-44e8-9026-317e49694d29","name":"Forger's Foundry","manaCost":"{2}{U}","cmc":3,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {U}. When you spend this mana to cast an instant or sorcery spell with mana value 3 or less, you may exile that spell instead of putting it into its owner's graveyard as it resolves.\n{3}{U}{U}, {T}: You may cast any number of spells from among cards exiled with this artifact without paying their mana costs. Activate only as a sorcery.","colors":["U"],"colorIdentity":["U"],"keywords":[],"producedMana":["U"],"imageUrl":"https://cards.scryfall.io/normal/front/1/6/16c32c5a-e011-4729-a4a0-b2deac7d5056.jpg?1783911969","artUrl":"https://cards.scryfall.io/art_crop/front/1/6/16c32c5a-e011-4729-a4a0-b2deac7d5056.jpg?1783911969","commanderLegal":"legal","set":"otc","releasedAt":"2024-04-19","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const opt = (): CardDef => ({"oracleId":"713332c1-5bd8-400f-bfff-c1ca0697a043","name":"Opt","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card.","colors":["U"],"colorIdentity":["U"],"keywords":["Scry"],"imageUrl":"https://cards.scryfall.io/normal/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","artUrl":"https://cards.scryfall.io/art_crop/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","commanderLegal":"legal","set":"sld","releasedAt":"2025-07-25","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const factOrFiction = (): CardDef => ({"oracleId":"437b2dab-15e0-4b9a-a204-58622d37a3b3","name":"Fact or Fiction","manaCost":"{3}{U}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Reveal the top five cards of your library. An opponent separates those cards into two piles. Put one pile into your hand and the other into your graveyard.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/7/f758a8b6-f586-4d27-9379-8f7c4a78d90c.jpg?1783918495","artUrl":"https://cards.scryfall.io/art_crop/front/f/7/f758a8b6-f586-4d27-9379-8f7c4a78d90c.jpg?1783918495","commanderLegal":"legal","set":"dmr","releasedAt":"2023-01-13","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const stroke = (): CardDef => ({"oracleId":"0cc6d683-366f-4ae4-be60-20ad9621fdaf","name":"Stroke of Genius","manaCost":"{X}{2}{U}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target player draws X cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/a/2a5b8542-f8b9-4b98-89ee-ce577b862bce.jpg?1783918487","artUrl":"https://cards.scryfall.io/art_crop/front/2/a/2a5b8542-f8b9-4b98-89ee-ce577b862bce.jpg?1783918487","commanderLegal":"legal","set":"dmr","releasedAt":"2023-01-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const cancel = (): CardDef => ({"oracleId":"7d00fb28-ea6c-49a9-b4af-ffb38860a9a7","name":"Cancel","manaCost":"{1}{U}{U}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Counter target spell.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/f/cf6e5ad6-ffe2-4588-b357-c415c33fbc11.jpg?1783935790","artUrl":"https://cards.scryfall.io/art_crop/front/c/f/cf6e5ad6-ffe2-4588-b357-c415c33fbc11.jpg?1783935790","commanderLegal":"legal","set":"xln","releasedAt":"2017-09-29","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const mulldrifter = (): CardDef => ({"oracleId":"24d0f5e7-0d9e-4b76-900e-a7274e80312d","name":"Mulldrifter","manaCost":"{4}{U}","cmc":5,"typeLine":"Creature — Elemental","supertypes":[],"types":["Creature"],"subtypes":["Elemental"],"oracleText":"Flying\nWhen this creature enters, draw two cards.\nEvoke {2}{U} (You may cast this spell for its evoke cost. If you do, it's sacrificed when it enters.)","power":"2","toughness":"2","colors":["U"],"colorIdentity":["U"],"keywords":["Flying","Evoke"],"imageUrl":"https://cards.scryfall.io/normal/front/3/b/3bdcae2f-fcf3-4dfd-8818-606d16a03beb.jpg?1783925153","artUrl":"https://cards.scryfall.io/art_crop/front/3/b/3bdcae2f-fcf3-4dfd-8818-606d16a03beb.jpg?1783925153","commanderLegal":"legal","set":"sld","releasedAt":"2021-11-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; questions answered as the bots would, or "you may" with `may`. */
const settle = (s: GameState, may?: boolean) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay" && may !== undefined) s = act(s, { type: "chooseMay", player: p.player, yes: may });
    else if (p) s = run(s, botActions(s, p.player));
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const toZone = (s: GameState, pid: PlayerId, def: CardDef, z: "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "hand") s.players[pid]!.hand.push(id);
  else s.players[pid]!.library.unshift(id);
  invalidateCharacteristics(s);
  return id;
};
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const CAST = compileCard(foundry()).activated.findIndex((a) => !a.mana);

/** Forger's Foundry tapped for its {U}, `spell` in hand. */
const tapped = (spell: () => CardDef) => {
  const { s: s0, ap, opp } = setup([]);
  const f = putOnBattlefield(s0, ap, foundry());
  for (let i = 0; i < 5; i++) toZone(s0, ap, island, "library");
  const c = toZone(s0, ap, spell(), "hand");
  const s = act(s0, { type: "activateMana", player: ap, objectId: f, mana: "U" });
  return { s, ap, opp, f, c };
};
/** The cards linked to the Foundry `f` (CR 607.2a). */
const linked = (s: GameState, f: ObjectId) => Object.entries(s.linkedExile ?? {}).filter(([k]) => k.startsWith(`${f}@`)).flatMap(([, v]) => v.map((x) => x.id));

describe("round 440: Forger's Foundry", () => {
  it("is fully supported: its {U} has a trigger, and its second ability casts the linked cards", () => {
    expect(isFullySupported(foundry())).toBe(true);
    const c = compileCard(foundry());
    expect(c.mana).toEqual([expect.objectContaining({ tap: true, spentTrigger: expect.objectContaining({ spell: expect.objectContaining({ kind: "spell", types: ["Instant", "Sorcery"], manaValue: { max: 3 } }), body: expect.objectContaining({ effects: [expect.objectContaining({ type: "may", effects: [{ type: "exileAsResolves", anyGraveyard: true, linked: true }] })] }) }) })]);
    expect(c.activated[CAST]).toMatchObject({ manaCost: "{3}{U}{U}", tap: true, sorcerySpeed: true, body: { effects: [{ type: "castFromAmong", fromLinked: true, n: 0 }] } });
  });

  it("spent on Opt: you may exile it as it resolves, and it's exiled with the Foundry", () => {
    const { s: s0, ap, f, c } = tapped(opt);
    expect(s0.players[ap]!.manaPool.U).toBe(1);
    let s = run(s0, planCast(s0, ap, c));
    expect(s.players[ap]!.manaPool.U).toBe(0);
    expect(s.triggerQueue.length + s.stack.filter((x) => x.kind === "ability").length).toBe(1);
    // The trigger resolves first, asking; Opt then resolves (scry 1, draw a card) and goes to exile.
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(s, true);
    expect(zone(s, c)).toBe("exile");
    expect(linked(s, f)).toEqual([c]);
  });

  it("declined, the spell goes to the graveyard as usual", () => {
    const { s: s0, ap, f, c } = tapped(opt);
    const s = settle(run(s0, planCast(s0, ap, c)), false);
    expect(zone(s, c)).toBe("graveyard");
    expect(linked(s, f)).toEqual([]);
  });

  it("not for a spell with mana value 4: Fact or Fiction paid with the {U} triggers nothing", () => {
    const { s: s0, ap, c } = tapped(factOrFiction);
    const s = run(s0, planCast(s0, ap, c));
    expect(s.players[ap]!.manaPool.U).toBe(0);
    expect(s.triggerQueue.length).toBe(0);
    expect(s.stack.filter((x) => x.kind === "ability").length).toBe(0);
  });

  it("not for a creature spell: Mulldrifter paid with the {U} triggers nothing (the mana can pay for anything, rulings)", () => {
    const { s: s0, ap, c } = tapped(mulldrifter);
    const s = run(s0, planCast(s0, ap, c));
    expect(s.players[ap]!.manaPool.U).toBe(0);
    expect(s.triggerQueue.length).toBe(0);
  });

  it("X counts as chosen (rulings): Stroke of Genius with X = 0 triggers, with X = 1 it doesn't", () => {
    const a = tapped(stroke);
    const s1 = run(a.s, planCast(a.s, a.ap, a.c, [{ kind: "player", id: a.ap }], undefined, undefined, 0));
    expect(s1.players[a.ap]!.manaPool.U).toBe(0);
    expect(s1.triggerQueue.length + s1.stack.filter((x) => x.kind === "ability").length).toBe(1);
    const b = tapped(stroke);
    const s2 = run(b.s, planCast(b.s, b.ap, b.c, [{ kind: "player", id: b.ap }], undefined, undefined, 1));
    expect(s2.players[b.ap]!.manaPool.U).toBe(0);
    expect(s2.triggerQueue.length + s2.stack.filter((x) => x.kind === "ability").length).toBe(0);
  });

  it("countered, the spell goes to its owner's graveyard: the exile applies only as it resolves", () => {
    const { s: s0, ap, opp, c } = tapped(opt);
    const k = toZone(s0, opp, cancel(), "hand");
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, opp, island);
    let s = run(s0, planCast(s0, ap, c));
    // The trigger resolves (yes), then the opponent counters Opt.
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.stack.length).toBe(1);
    for (let i = 0; i < 20 && waitingOn(s) !== opp; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const spell = s.stack[0]!;
    s = run(s, planCast(s, opp, k, [{ kind: "stack", id: spell.id }]));
    s = settle(s);
    expect(zone(s, c)).toBe("graveyard");
  });

  it("the trigger works even after the Foundry has left the battlefield (rulings)", () => {
    const { s: s0, ap, f, c } = tapped(opt);
    let s = run(s0, planCast(s0, ap, c));
    // Gone before the trigger resolves.
    const i = s.battlefield.indexOf(f);
    s.battlefield.splice(i, 1);
    s.objects[f]!.zone = "graveyard";
    s.players[ap]!.graveyard.push(f);
    invalidateCharacteristics(s);
    s = settle(s, true);
    expect(zone(s, c)).toBe("exile");
  });

  it("{3}{U}{U}, {T}: casts the exiled cards without paying their mana costs as it resolves", () => {
    const { s: s0, ap, f, c } = tapped(opt);
    let s = settle(run(s0, planCast(s0, ap, c)), true);
    expect(zone(s, c)).toBe("exile");
    s.objects[f]!.tapped = false;
    const hand = s.players[ap]!.hand.length;
    s = run(s, planActivate(s, ap, f, CAST));
    expect(s.objects[f]!.tapped).toBe(true);
    s = settle(s);
    // Opt cast again for free: it drew a card and is in the graveyard now (cast from exile, not by its mana).
    expect(zone(s, c)).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("only as a sorcery", () => {
    const { s: s0, ap, f, c } = tapped(opt);
    let s = settle(run(s0, planCast(s0, ap, c)), true);
    s.objects[f]!.tapped = false;
    s.step = "upkeep";
    expect(planActivate(s, ap, f, CAST)).toBeNull();
  });
});
