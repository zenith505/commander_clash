// Round 250: the top of the popularity list and earlier skip lists. Impulsivity ("cast target instant or sorcery card
// from a graveyard", any player's, exiled after, CR 608.2g), Halo Forager (the same in a reflexive ability, with mana value
// exactly the X paid, CR 603.12), Drana, the Last Bloodchief (defending player chooses a card in your graveyard, returned
// with a counter and a Vampire for good), Jolted Awake (energy equal to the target card's mana value, counted as it
// resolves), Reinterpret (any spell with equal or lesser mana value from your hand), Tamiyo, Compleated Sage (a named
// legendary Book token), The Death of Gwen Stacy (each player may discard; each who doesn't loses life) and Visions of
// Phyrexia ("if you didn't play a card from exile this turn"), Dragonspark Reactor ("that much damage" to a second
// target), Belligerent Yearling (base power set to another creature's, layer 7b), Tales of the Ancestors (each
// difference worked out before anyone draws), Territorial Aetherkite (one or more {E} paid, then a reflexive ability) and
// Fall of the Impostor (you choose among the target opponent's creatures with the greatest power, not a target).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, defOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Everyone passes until the stack is empty, answering trigger targets with `targets`; stops at any other question. */
const settle = (s: GameState, opts: { targets?: TargetChoice[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseTargets" && opts.targets) s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** As settle, but the bots' answers for every question (whoever is asked). */
/** Plays on (bots answering every question, attacks and blocks declined) until `stop`; `answer` may take a question first. */
const goUntil = (s: GameState, stop: (s: GameState) => boolean, answer?: (s: GameState) => GameState | undefined) => {
  for (let i = 0; i < 3000; i++) {
    if (stop(s)) return s;
    const mine = answer?.(s);
    if (mine) {
      s = mine;
      continue;
    }
    const p = s.pending;
    const pid = waitingOn(s)!;
    if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: pid });
  }
  throw new Error("never got there");
};
const settleBots = (s: GameState) => {
  for (let i = 0; i < 400 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const pid = waitingOn(s)!;
    s = s.pending ? botActions(s, pid).reduce((x, a) => act(x, a), s) : act(s, { type: "passPriority", player: pid });
  }
  return s;
};

// Real oracle text (Scryfall).
const impulsivity = (): CardDef => ({"oracleId":"02b6900b-219f-4832-8f93-6ef27ee76c0c","name":"Impulsivity","manaCost":"{6}{R}","cmc":7,"typeLine":"Creature — Elemental Incarnation","supertypes":[],"types":["Creature"],"subtypes":["Elemental","Incarnation"],"oracleText":"When this creature enters, you may cast target instant or sorcery card from a graveyard without paying its mana cost. If that spell would be put into a graveyard, exile it instead.\nEncore {7}{R}{R} ({7}{R}{R}, Exile this card from your graveyard: For each opponent, create a token copy that attacks that opponent this turn if able. They gain haste. Sacrifice them at the beginning of the next end step. Activate only as a sorcery.)","power":"7","toughness":"5","colors":["R"],"colorIdentity":["R"],"keywords":["Encore"],"imageUrl":"https://cards.scryfall.io/normal/front/c/1/c1c9ff71-b818-4d8b-8e0a-432becb7bf09.jpg?1783904604","artUrl":"https://cards.scryfall.io/art_crop/front/c/1/c1c9ff71-b818-4d8b-8e0a-432becb7bf09.jpg?1783904604","commanderLegal":"legal","set":"ecc","releasedAt":"2026-01-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const forager = (): CardDef => ({"oracleId":"210d1077-6e60-4f06-a8a4-10b842979ac5","name":"Halo Forager","manaCost":"{1}{U}{B}","cmc":3,"typeLine":"Creature — Faerie Rogue","supertypes":[],"types":["Creature"],"subtypes":["Faerie","Rogue"],"oracleText":"Flying\nWhen this creature enters, you may pay {X}. When you do, you may cast target instant or sorcery card with mana value X from a graveyard without paying its mana cost. If that spell would be put into a graveyard, exile it instead.","power":"3","toughness":"1","colors":["B","U"],"colorIdentity":["B","U"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/e/d/edb5f0cc-c826-4e7b-882c-63f6e51fa932.jpg?1783916950","artUrl":"https://cards.scryfall.io/art_crop/front/e/d/edb5f0cc-c826-4e7b-882c-63f6e51fa932.jpg?1783916950","commanderLegal":"legal","set":"mom","releasedAt":"2023-04-21","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const drana = (): CardDef => ({"oracleId":"3ae3b901-4d36-40e2-b861-26209fa1e823","name":"Drana, the Last Bloodchief","manaCost":"{3}{B}{B}","cmc":5,"typeLine":"Legendary Creature — Vampire Cleric","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Vampire","Cleric"],"oracleText":"Flying\nWhenever Drana attacks, defending player chooses a nonlegendary creature card in your graveyard. You return that card to the battlefield with an additional +1/+1 counter on it. The creature is a Vampire in addition to its other types.","power":"4","toughness":"4","colors":["B"],"colorIdentity":["B"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/5/c/5cd4154e-7681-444b-a0f2-33e887791ba7.jpg?1783929379","artUrl":"https://cards.scryfall.io/art_crop/front/5/c/5cd4154e-7681-444b-a0f2-33e887791ba7.jpg?1783929379","commanderLegal":"legal","set":"znr","releasedAt":"2020-09-25","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const jolted = (): CardDef => ({"oracleId":"4306a9e5-6845-4fd4-96ad-8888147612aa","name":"Jolted Awake","manaCost":"{W}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Choose up to one target artifact or creature card in your graveyard. You get {E}{E} (two energy counters). Then you may pay an amount of {E} equal to that card's mana value. If you do, return it from your graveyard to the battlefield.\nCycling {2} ({2}, Discard this card: Draw a card.)","colors":["W"],"colorIdentity":["W"],"keywords":["Cycling"],"imageUrl":"https://cards.scryfall.io/normal/front/d/5/d51015ef-184c-44bb-b3d2-c74a0549efac.jpg?1783911177","artUrl":"https://cards.scryfall.io/art_crop/front/d/5/d51015ef-184c-44bb-b3d2-c74a0549efac.jpg?1783911177","commanderLegal":"legal","set":"mh3","releasedAt":"2024-06-14","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const reinterpret = (): CardDef => ({"oracleId":"e197104f-5382-4cb2-8afe-5ca0594629c2","name":"Reinterpret","manaCost":"{2}{U}{R}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Counter target spell. You may cast a spell with equal or lesser mana value from your hand without paying its mana cost.","colors":["R","U"],"colorIdentity":["R","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/765e64ae-699c-46bd-a8cc-c8c1075d644f.jpg?1783927584","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/765e64ae-699c-46bd-a8cc-c8c1075d644f.jpg?1783927584","commanderLegal":"legal","set":"c21","releasedAt":"2021-04-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const tamiyo = (): CardDef => ({"oracleId":"021b4745-4a15-462c-a6b0-2dee1dc9d196","name":"Tamiyo, Compleated Sage","manaCost":"{2}{G}{G/U/P}{U}","cmc":5,"typeLine":"Legendary Planeswalker — Tamiyo","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Tamiyo"],"oracleText":"Compleated ({G/U/P} can be paid with {G}, {U}, or 2 life. If life was paid, this planeswalker enters with two fewer loyalty counters.)\n+1: Tap up to one target artifact or creature. It doesn't untap during its controller's next untap step.\n−X: Exile target nonland permanent card with mana value X from your graveyard. Create a token that's a copy of that card.\n−7: Create Tamiyo's Notebook, a legendary colorless Book artifact token with \"Spells you cast cost {2} less to cast\" and \"{T}: Draw a card.\"","loyalty":"5","colors":["G","U"],"colorIdentity":["G","U"],"keywords":["Compleated"],"imageUrl":"https://cards.scryfall.io/normal/front/2/2/222a736e-d819-452d-aeda-eb848c4b2302.jpg?1783923828","artUrl":"https://cards.scryfall.io/art_crop/front/2/2/222a736e-d819-452d-aeda-eb848c4b2302.jpg?1783923828","commanderLegal":"legal","set":"neo","releasedAt":"2022-02-18","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const gwen = (): CardDef => ({"oracleId":"2624b5c5-ba59-4e20-8e66-e463268366e4","name":"The Death of Gwen Stacy","manaCost":"{2}{B}","cmc":3,"typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — Destroy target creature.\nII — Each player may discard a card. Each player who doesn't loses 3 life.\nIII — Exile any number of target players' graveyards.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/9/690f1f31-f8c5-4336-9ec9-72ff761e3adc.jpg?1783905346","artUrl":"https://cards.scryfall.io/art_crop/front/6/9/690f1f31-f8c5-4336-9ec9-72ff761e3adc.jpg?1783905346","commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"rare","layout":"saga","gameChanger":false}) as CardDef;
const visions = (): CardDef => ({"oracleId":"634b46a6-ec8b-41f0-8eb6-1e9144035847","name":"Visions of Phyrexia","manaCost":"{2}{R}{R}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of your upkeep, exile the top card of your library. You may play that card this turn.\nAt the beginning of your end step, if you didn't play a card from exile this turn, create a tapped Powerstone token. (It's an artifact with \"{T}: Add {C}. This mana can't be spent to cast a nonartifact spell.\")","colors":["R"],"colorIdentity":["R"],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/e/9/e922ef35-b62a-4cf8-9282-319f6de150b0.jpg?1783920057","artUrl":"https://cards.scryfall.io/art_crop/front/e/9/e922ef35-b62a-4cf8-9282-319f6de150b0.jpg?1783920057","commanderLegal":"legal","set":"bro","releasedAt":"2022-11-18","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const reactor = (): CardDef => ({"oracleId":"a8acb0b0-7265-42f6-8143-62d0c02d5a28","name":"Dragonspark Reactor","manaCost":"{1}{R}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"Whenever this artifact or another artifact you control enters, put a charge counter on this artifact.\n{4}, Sacrifice this artifact: It deals damage equal to the number of charge counters on it to target player and that much damage to up to one target creature.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/c/5cf531dd-0a93-43e3-880b-f705fa5f533d.jpg?1783923869","artUrl":"https://cards.scryfall.io/art_crop/front/5/c/5cf531dd-0a93-43e3-880b-f705fa5f533d.jpg?1783923869","commanderLegal":"legal","set":"neo","releasedAt":"2022-02-18","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const yearling = (): CardDef => ({"oracleId":"2d785e3e-8e19-4eea-b09f-9a30c792dba1","name":"Belligerent Yearling","manaCost":"{1}{R}","cmc":2,"typeLine":"Creature — Dinosaur","supertypes":[],"types":["Creature"],"subtypes":["Dinosaur"],"oracleText":"Trample\nWhenever another Dinosaur you control enters, you may have this creature's base power become equal to that creature's power until end of turn.","power":"3","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":["Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/0/b/0b2debca-8535-4cf6-a461-c268faaacaae.jpg?1783913766","artUrl":"https://cards.scryfall.io/art_crop/front/0/b/0b2debca-8535-4cf6-a461-c268faaacaae.jpg?1783913766","commanderLegal":"legal","set":"lci","releasedAt":"2023-11-17","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const tales = (): CardDef => ({"oracleId":"49e3c192-862f-483e-abd1-e22863ea88dd","name":"Tales of the Ancestors","manaCost":"{3}{U}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Each player with fewer cards in hand than the player with the most cards in hand draws cards equal to the difference.\nForetell {1}{U} (During your turn, you may pay {2} and exile this card from your hand face down. Cast it on a later turn for its foretell cost.)","colors":["U"],"colorIdentity":["U"],"keywords":["Foretell"],"imageUrl":"https://cards.scryfall.io/normal/front/c/2/c286a74c-3714-4190-8322-84b161debe39.jpg?1783928338","artUrl":"https://cards.scryfall.io/art_crop/front/c/2/c286a74c-3714-4190-8322-84b161debe39.jpg?1783928338","commanderLegal":"legal","set":"khc","releasedAt":"2021-02-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const aetherkite = (): CardDef => ({"oracleId":"4f63d306-cc14-405c-8424-d8990c670c74","name":"Territorial Aetherkite","manaCost":"{4}{R}{R}","cmc":6,"typeLine":"Creature — Cat Dragon","supertypes":[],"types":["Creature"],"subtypes":["Cat","Dragon"],"oracleText":"Flying, haste\nWhen this creature enters, you get {E}{E} (two energy counters). Then you may pay one or more {E}. When you do, this creature deals that much damage to each other creature.","power":"6","toughness":"5","colors":["R"],"colorIdentity":["R"],"keywords":["Flying","Haste"],"imageUrl":"https://cards.scryfall.io/normal/front/c/1/c1e2f2af-dbba-4e4c-9c60-ac4d245e1431.jpg?1783907750","artUrl":"https://cards.scryfall.io/art_crop/front/c/1/c1e2f2af-dbba-4e4c-9c60-ac4d245e1431.jpg?1783907750","commanderLegal":"legal","set":"drc","releasedAt":"2025-02-14","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const impostor = (): CardDef => ({"oracleId":"54deeeef-be90-4975-9213-8355ddf3ce0c","name":"Fall of the Impostor","manaCost":"{1}{G}{W}","cmc":3,"typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI, II — Put a +1/+1 counter on up to one target creature.\nIII — Exile a creature with the greatest power among creatures target opponent controls.","colors":["G","W"],"colorIdentity":["G","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/7/d7de696a-49c2-421d-a86c-bcffd68870c6.jpg?1783928198","artUrl":"https://cards.scryfall.io/art_crop/front/d/7/d7de696a-49c2-421d-a86c-bcffd68870c6.jpg?1783928198","commanderLegal":"legal","set":"khm","releasedAt":"2021-02-05","rarity":"uncommon","layout":"saga","gameChanger":false}) as CardDef;

const bolt = card("Test Bolt", "Instant", "{R}", { oracleText: "Test Bolt deals 3 damage to any target." });
const blast = card("Test Blast", "Sorcery", "{1}{R}", { oracleText: "Test Blast deals 2 damage to any target." });
const rock = card("Test Rock", "Artifact", "{3}", { oracleText: "{T}: Add {C}." });
const beast = card("Test Beast", "Creature — Beast", "{4}{G}", { power: "5", toughness: "5" });
const hero = card("Test Hero", "Legendary Creature — Human", "{1}{W}", { power: "2", toughness: "2" });

describe("round 250", () => {
  it("every card of the round compiles fully", () => {
    supported(impulsivity(), forager(), drana(), jolted(), reinterpret(), tamiyo(), gwen(), visions(), reactor(), yearling(), tales(), aetherkite(), impostor());
  });

  it("Impulsivity: cast an instant from an opponent's graveyard for free; it's exiled, not put into their graveyard", () => {
    const { s: s0, ap, opp, ids } = setup([impulsivity()]);
    const b = into(s0, opp, bolt, "graveyard");
    const life = s0.players[opp]!.life;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { targets: [tgt(b)] });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: b });
    s = settle(run(s, planCast(s, ap, b, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(s.objects[b]!.zone).toBe("exile");
    expect(s.players[opp]!.exile).toContain(b);
    // Your own graveyard too; declined, it stays there.
    const { s: s1, ap: ap1, ids: ids1 } = setup([impulsivity()]);
    const mine = into(s1, ap1, blast, "graveyard");
    let s2 = settle(run(s1, planCast(s1, ap1, ids1[0]!)), { targets: [tgt(mine)] });
    expect(s2.pending).toMatchObject({ kind: "castFree", objectId: mine });
    s2 = settle(act(s2, { type: "chooseMay", player: ap1, yes: false }));
    expect(s2.objects[mine]!.zone).toBe("graveyard");
  });

  it("Halo Forager: pay X, then the reflexive ability targets a card with mana value exactly X in any graveyard", () => {
    const { s: s0, ap, opp, ids } = setup([forager()]);
    const b = into(s0, opp, bolt, "graveyard");
    const bl = into(s0, ap, blast, "graveyard");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "payX" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "2" }));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s.players[ap]!.manaPool.C = 2;
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.pending).toMatchObject({ kind: "chooseTargets" });
    // Test Bolt's mana value is 1, not the 2 paid.
    expect(() => applyAction(s, { type: "chooseTargets", player: ap, targets: [tgt(b)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(bl)] }));
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: bl });
    const life = s.players[opp]!.life;
    s = settle(run(s, planCast(s, ap, bl, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(life - 2);
    expect(s.objects[bl]!.zone).toBe("exile");
    expect(s.objects[b]!.zone).toBe("graveyard");
  });

  it("Halo Forager: not paying, no reflexive ability; the bot plays it through", () => {
    const { s: s0, ap, ids } = setup([forager()]);
    const bl = into(s0, ap, blast, "graveyard");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "none" }));
    expect(s.stack.length + s.triggerQueue.length).toBe(0);
    expect(s.pending).toBeNull();
    expect(s.objects[bl]!.zone).toBe("graveyard");
    const { s: s1, ap: ap1, ids: ids1 } = setup([forager()]);
    into(s1, ap1, blast, "graveyard");
    const s2 = settleBots(run(s1, planCast(s1, ap1, ids1[0]!)));
    expect(s2.pending).toBeNull();
  });

  it("Drana, the Last Bloodchief: the defending player chooses a nonlegendary creature card in your graveyard; it returns with a counter as a Vampire", () => {
    const { s: s0, ap, opp } = setup([]);
    const dr = putOnBattlefield(s0, ap, drana());
    const big = into(s0, ap, beast, "graveyard");
    const small = into(s0, ap, card("Test Squire", "Creature — Human", "{W}", { power: "1", toughness: "1" }), "graveyard");
    const legend = into(s0, ap, hero, "graveyard");
    into(s0, ap, rock, "graveyard");
    let s = passUntil(s0, "declareAttackers");
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: dr, defender: opp }] }));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: opp });
    const p = s.pending!;
    expect(p.kind === "searchLibrary" && [...p.cards].sort()).toEqual([big, small].sort());
    expect(() => applyAction(s, { type: "searchLibrary", player: opp, found: [legend] })).toThrow();
    s = settle(act(s, { type: "searchLibrary", player: opp, found: [small] }));
    const o = s.objects[small]!;
    expect(o.zone).toBe("battlefield");
    expect(o.controller).toBe(ap);
    expect(o.attacking).toBeUndefined();
    expect(o.counters["+1/+1"]).toBe(1);
    expect(pt(s, small)).toBe("2/2");
    expect(characteristics(s, o).subtypes).toEqual(expect.arrayContaining(["Human", "Vampire"]));
    // Still a Vampire after Drana leaves (rulings).
    s.battlefield.splice(s.battlefield.indexOf(dr), 1);
    s.objects[dr]!.zone = "graveyard";
    s.players[ap]!.graveyard.push(dr);
    invalidateCharacteristics(s);
    expect(characteristics(s, s.objects[small]!).subtypes).toContain("Vampire");
    expect(s.objects[big]!.zone).toBe("graveyard");
  });

  it("Drana, the Last Bloodchief: a bot defending player picks the weakest card", () => {
    const { s: s0, ap, opp } = setup([]);
    const dr = putOnBattlefield(s0, ap, drana());
    const big = into(s0, ap, beast, "graveyard");
    const small = into(s0, ap, card("Test Squire", "Creature — Human", "{W}", { power: "1", toughness: "1" }), "graveyard");
    let s = passUntil(s0, "declareAttackers");
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: dr, defender: opp }] });
    for (let i = 0; i < 20 && !(s.pending?.kind === "searchLibrary"); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = botActions(s, opp).reduce((x, a) => act(x, a), s);
    expect(s.objects[small]!.zone).toBe("battlefield");
    expect(s.objects[big]!.zone).toBe("graveyard");
  });

  it("Jolted Awake: two energy, then pay energy equal to the target's mana value to return it", () => {
    const { s: s0, ap, ids } = setup([jolted()]);
    const r = into(s0, ap, rock, "graveyard");
    s0.players[ap]!.energy = 1;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(r)])));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[r]!.zone).toBe("battlefield");
    expect(s.players[ap]!.energy).toBe(0);
    // Too little energy: nothing to ask, the energy stays.
    const { s: s1, ap: ap1, ids: ids1 } = setup([jolted()]);
    const b = into(s1, ap1, beast, "graveyard");
    let s2 = settle(run(s1, planCast(s1, ap1, ids1[0]!, [tgt(b)])));
    expect(s2.pending).toBeNull();
    expect(s2.players[ap1]!.energy).toBe(2);
    expect(s2.objects[b]!.zone).toBe("graveyard");
    // No target: only the energy.
    const { s: s3, ap: ap3, ids: ids3 } = setup([jolted()]);
    const s4 = settle(run(s3, planCast(s3, ap3, ids3[0]!, [{ kind: "none" }])));
    expect(s4.players[ap3]!.energy).toBe(2);
    expect(s4.pending).toBeNull();
  });
  it("Reinterpret: counter the spell, then cast any spell with equal or lesser mana value from your hand for free", () => {
    const { s: s0, ap, opp, ids } = setup([blast, reinterpret(), bolt, beast]);
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    const item = s.stack.find((i) => i.objectId === ids[0])!;
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: item.id }]));
    s = settle(s);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    // Test Bolt's mana value is 1 (and the bears drawn 2), Test Beast's 5: not the beast.
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromHand" });
    const options = s.pending?.kind === "chooseOption" ? s.pending.options : [];
    expect(options).toContain(ids[2]);
    expect(options).not.toContain(ids[3]);
    const life = s.players[opp]!.life;
    s = act(s, { type: "chooseOption", player: ap, choice: ids[2]! });
    if (s.pending?.kind === "castFree") s = run(s, planCast(s, ap, ids[2]!, [{ kind: "player", id: opp }]));
    s = settle(s);
    expect(s.players[opp]!.life).toBe(life - 3);
  });

  it("Tamiyo, Compleated Sage: −7 creates Tamiyo's Notebook, which makes spells cheaper and draws", () => {
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, tamiyo());
    s0.objects[t]!.counters = { loyalty: 7 };
    let s = settle(run(s0, planActivate(s0, ap, t, 2)));
    const nb = s.battlefield.filter((id) => defOf(s, s.objects[id]!).name === "Tamiyo's Notebook");
    expect(nb.length).toBe(1);
    const o = s.objects[nb[0]!]!;
    expect(o.isToken).toBe(true);
    const c = characteristics(s, o);
    expect(c.supertypes).toContain("Legendary");
    expect(c.types).toEqual(["Artifact"]);
    expect(c.subtypes).toEqual(["Book"]);
    expect(c.colors).toEqual([]);
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planActivate(s, ap, nb[0]!, 0)));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    // "Spells you cast cost {2} less to cast": Test Beast ({4}{G}) for {2}{G}, with only three lands untapped.
    const b = into(s, ap, beast, "hand");
    for (const id of s.battlefield) if (s.objects[id]!.controller === ap && characteristics(s, s.objects[id]!).types.includes("Land")) s.objects[id]!.tapped = true;
    const forests = s.battlefield.filter((id) => s.objects[id]!.controller === ap && defOf(s, s.objects[id]!).name === "Forest");
    for (const id of forests) s.objects[id]!.tapped = false;
    s = settle(run(s, planCast(s, ap, b)));
    expect(s.objects[b]!.zone).toBe("battlefield");
  });

  it("The Death of Gwen Stacy II: each player may discard a card; each who doesn't (or can't) loses 3 life", () => {
    const { s: s0, ap, opp } = setup([bolt]);
    const g = putOnBattlefield(s0, ap, gwen());
    s0.objects[g]!.counters = { lore: 1 };
    const others = s0.turnOrder.filter((p) => p !== ap && p !== opp);
    into(s0, opp, bolt, "hand");
    for (const p of [ap, opp, ...others]) if (p !== ap && p !== opp) s0.players[p]!.hand.forEach((id) => (s0.objects[id]!.zone = "library"));
    for (const p of others) {
      s0.players[p]!.library.push(...s0.players[p]!.hand);
      s0.players[p]!.hand = [];
    }
    const life = Object.fromEntries(s0.turnOrder.map((p) => [p, s0.players[p]!.life]));
    const asked: PlayerId[] = [];
    const s = goUntil(
      s0,
      (x) => (x.objects[g]!.counters.lore ?? 0) >= 2 && !x.stack.length && !x.triggerQueue.length && !x.pending,
      (x) => {
        const p = x.pending;
        if (p?.kind === "chooseMay" && p.source === "The Death of Gwen Stacy") {
          asked.push(p.player);
          return act(x, { type: "chooseMay", player: p.player, yes: p.player === ap });
        }
        if (p?.kind === "discard" && p.player === ap) return act(x, { type: "discard", player: ap, objectIds: [x.players[ap]!.hand[0]!] });
        return undefined;
      },
    );
    // Only players with a card in hand are asked (the others draw on their turns; ap drew one this turn too).
    expect(asked).toContain(ap);
    expect(asked).toContain(opp);
    expect(s.players[ap]!.life).toBe(life[ap]);
    expect(s.players[opp]!.life).toBe(life[opp]! - 3);
    for (const p of others) expect(s.players[p]!.life).toBe(life[p]! - 3);
  });

  it("Visions of Phyrexia: a tapped Powerstone at your end step only if you didn't play a card from exile this turn", () => {
    const powerstones = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && characteristics(s, s.objects[id]!).subtypes.includes("Powerstone")).length;
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, visions());
    const s = goUntil(s0, (x) => x.activePlayer !== ap);
    expect(powerstones(s, ap)).toBe(1);
    // A land played from exile (any card, for any reason, rulings): none.
    const { s: s1, ap: ap1 } = setup([]);
    putOnBattlefield(s1, ap1, visions());
    const l = into(s1, ap1, card("Test Wastes", "Land", "", { oracleText: "{T}: Add {C}." }), "exile");
    s1.objects[l]!.mayPlay = { player: ap1, zc: s1.objects[l]!.zoneChanges ?? 0, until: "thisTurn", turn: s1.turn };
    s1.players[ap1]!.landsPlayedThisTurn = 0;
    let s2 = act(s1, { type: "playLand", player: ap1, objectId: l });
    expect(s2.objects[l]!.zone).toBe("battlefield");
    expect(s2.turnLog?.playedFromExile).toEqual([ap1]);
    s2 = goUntil(s2, (x) => x.activePlayer !== ap1);
    expect(powerstones(s2, ap1)).toBe(0);
  });
  it("Dragonspark Reactor: sacrificed, it deals damage equal to its charge counters to target player and that much to up to one target creature", () => {
    const { s: s0, ap, opp } = setup([]);
    const r = putOnBattlefield(s0, ap, reactor());
    s0.objects[r]!.counters = { charge: 3 };
    const b = putOnBattlefield(s0, opp, beast);
    s0.players[ap]!.manaPool.C = 4;
    const life = s0.players[opp]!.life;
    let s = settle(run(s0, planActivate(s0, ap, r, 0, [{ kind: "player", id: opp }, tgt(b)])));
    expect(s.objects[r]!.zone).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(s.objects[b]!.damage).toBe(3);
    // No creature: the player only.
    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    const r1 = putOnBattlefield(s1, ap1, reactor());
    s1.objects[r1]!.counters = { charge: 2 };
    s1.players[ap1]!.manaPool.C = 4;
    const life1 = s1.players[opp1]!.life;
    const s2 = settle(run(s1, planActivate(s1, ap1, r1, 0, [{ kind: "player", id: opp1 }, { kind: "none" }])));
    expect(s2.players[opp1]!.life).toBe(life1 - 2);
  });

  it("Belligerent Yearling: may have its base power become the entering Dinosaur's power until end of turn; counters still count", () => {
    const { s: s0, ap } = setup([]);
    const y = putOnBattlefield(s0, ap, yearling());
    s0.objects[y]!.counters = { "+1/+1": 1 };
    const dino = card("Test Dinosaur", "Creature — Dinosaur", "{4}{G}", { power: "6", toughness: "6" });
    const d = into(s0, ap, dino, "hand");
    s0.players[ap]!.manaPool.G = 5;
    let s = settle(run(s0, planCast(s0, ap, d)));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(pt(s, y)).toBe("7/3");
    s = passUntil(s, "cleanup");
    s = goUntil(s, (x) => x.activePlayer !== ap);
    expect(pt(s, y)).toBe("4/3");
    // A non-Dinosaur doesn't trigger it.
    const { s: s1, ap: ap1 } = setup([]);
    putOnBattlefield(s1, ap1, yearling());
    const bb = into(s1, ap1, beast, "hand");
    s1.players[ap1]!.manaPool.G = 5;
    const s2 = settle(run(s1, planCast(s1, ap1, bb)));
    expect(s2.pending).toBeNull();
  });

  it("Belligerent Yearling: a bot takes the entering Dinosaur's power only when it's bigger", () => {
    for (const [p, want] of [["6", "6/2"], ["1", "3/2"]] as const) {
      const { s: s0, ap } = setup([]);
      const y = putOnBattlefield(s0, ap, yearling());
      const d = into(s0, ap, card("Test Dinosaur", "Creature — Dinosaur", "{4}{G}", { power: p, toughness: "6" }), "hand");
      s0.players[ap]!.manaPool.G = 5;
      let s = settle(run(s0, planCast(s0, ap, d)));
      expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
      s = settleBots(s);
      expect(pt(s, y)).toBe(want);
    }
  });

  it("Tales of the Ancestors: each player behind the biggest hand draws up to it, all worked out before anyone draws", () => {
    const { s: s0, ap, ids } = setup([tales()]);
    const [p1, p2, p3] = s0.turnOrder.filter((p) => p !== ap);
    const sizeTo = (pid: PlayerId, n: number) => {
      const p = s0.players[pid]!;
      while (p.hand.length > n) {
        const id = p.hand.pop()!;
        s0.objects[id]!.zone = "library";
        p.library.push(id);
      }
      while (p.hand.length < n) into(s0, pid, bolt, "hand");
    };
    sizeTo(p1!, 5);
    sizeTo(p2!, 2);
    sizeTo(p3!, 0);
    // Yours: Tales and three more, so three once it's cast.
    const me = s0.players[ap]!;
    for (const id of me.hand.filter((x) => x !== ids[0])) s0.objects[id]!.zone = "library";
    me.library.push(...me.hand.filter((x) => x !== ids[0]));
    me.hand = [ids[0]!];
    for (let i = 0; i < 3; i++) into(s0, ap, bolt, "hand");
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.players[p1!]!.hand.length).toBe(5);
    expect(s.players[p2!]!.hand.length).toBe(5);
    expect(s.players[p3!]!.hand.length).toBe(5);
    expect(s.players[ap]!.hand.length).toBe(5);
  });

  it("Territorial Aetherkite: two energy, then pay one or more; that much damage to each other creature", () => {
    const { s: s0, ap, opp, ids } = setup([aetherkite()]);
    const mine = putOnBattlefield(s0, ap, card("Test Squire", "Creature — Human", "{W}", { power: "1", toughness: "1" }));
    const theirs = putOnBattlefield(s0, opp, beast);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.players[ap]!.energy).toBe(2);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "payEnergy" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "2" }));
    expect(s.players[ap]!.energy).toBe(0);
    expect(s.objects[mine]!.zone).toBe("graveyard");
    expect(s.objects[theirs]!.damage).toBe(2);
    expect(s.objects[ids[0]!]!.damage ?? 0).toBe(0);
    // Paying none isn't paying: no damage, the energy kept.
    const { s: s1, ap: ap1, opp: opp1, ids: ids1 } = setup([aetherkite()]);
    const t1 = putOnBattlefield(s1, opp1, beast);
    let s2 = settle(run(s1, planCast(s1, ap1, ids1[0]!)));
    s2 = settle(act(s2, { type: "chooseOption", player: ap1, choice: "0" }));
    expect(s2.players[ap1]!.energy).toBe(2);
    expect(s2.objects[t1]!.damage ?? 0).toBe(0);
  });
  it("Fall of the Impostor III: you exile one of the target opponent's creatures tied for the greatest power", () => {
    const { s: s0, ap, opp } = setup([]);
    const saga = putOnBattlefield(s0, ap, impostor());
    s0.objects[saga]!.counters = { lore: 2 };
    const other = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    const big1 = putOnBattlefield(s0, opp, beast);
    const big2 = putOnBattlefield(s0, opp, beast);
    const small = putOnBattlefield(s0, opp, card("Test Squire", "Creature — Human", "{W}", { power: "1", toughness: "1" }));
    const huge = putOnBattlefield(s0, other, card("Test Giant", "Creature — Giant", "{6}", { power: "9", toughness: "9" }));
    let seen: string[] = [];
    const s = goUntil(
      s0,
      (x) => x.objects[saga]!.zone !== "battlefield" && !x.stack.length && !x.triggerQueue.length && !x.pending,
      (x) => {
        const p = x.pending;
        if (p?.kind === "chooseTargets" && p.player === ap) return act(x, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] });
        if (p?.kind === "pickPermanents" && p.player === ap) {
          seen = [...p.options];
          return act(x, { type: "pickPermanents", player: ap, ids: [big2] });
        }
        return undefined;
      },
    );
    expect(seen.sort()).toEqual([big1, big2].sort());
    expect(s.objects[big2]!.zone).toBe("exile");
    for (const id of [big1, small, huge]) expect(s.objects[id]!.zone).toBe("battlefield");
  });
});
