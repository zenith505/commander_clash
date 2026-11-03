// Lane B round B101: Heirloom Mirror // Inherited Fiend, Auditore Ambush, Teachings of the Kirin // Kirin-Touched Orochi,
// Kumano Faces Kakkazan // Etching of Kumano, The Lady of Otaria, Fugitive of the Judoon, Weight of Spires, Devour Flesh,
// Sudden Insight and Gladewalker Ritualist.

import { describe, expect, it } from "vitest";
import { putCounters } from "../src/counters";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, defOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

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
const player = (pid: PlayerId): TargetChoice => ({ kind: "player", id: pid });
/** Moves a new card for `def` from the battlefield into `pid`'s `zone`. */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
const nameOf = (s: GameState, id: string) => defOf(s, s.objects[id]!).name;
const named = (s: GameState, name: string) => s.battlefield.filter((id) => nameOf(s, id) === name);
const mirror = (): CardDef => ({"oracleId":"b33390dd-f2f8-4059-83a9-45c0edccd5e4","name":"Heirloom Mirror // Inherited Fiend","manaCost":"{1}{B}","cmc":2,"typeLine":"Artifact // Creature — Demon","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{1}, {T}, Pay 1 life, Discard a card: Draw a card, mill a card, then put a ritual counter on this artifact. Then if it has three or more ritual counters on it, remove them and transform it. Activate only as a sorcery.","colors":["B"],"colorIdentity":["B"],"keywords":["Flying","Transform","Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/8/8/88a28a48-d4a1-47ce-9aa0-ee65325029c4.jpg?1783924423","artUrl":"https://cards.scryfall.io/art_crop/front/8/8/88a28a48-d4a1-47ce-9aa0-ee65325029c4.jpg?1783924423","commanderLegal":"legal","set":"dbl","releasedAt":"2022-01-28","rarity":"uncommon","layout":"transform","gameChanger":false,"faces":[{"name":"Heirloom Mirror","manaCost":"{1}{B}","typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{1}, {T}, Pay 1 life, Discard a card: Draw a card, mill a card, then put a ritual counter on this artifact. Then if it has three or more ritual counters on it, remove them and transform it. Activate only as a sorcery.","colors":["B"],"imageUrl":"https://cards.scryfall.io/normal/front/8/8/88a28a48-d4a1-47ce-9aa0-ee65325029c4.jpg?1783924423","artUrl":"https://cards.scryfall.io/art_crop/front/8/8/88a28a48-d4a1-47ce-9aa0-ee65325029c4.jpg?1783924423"},{"name":"Inherited Fiend","manaCost":"","typeLine":"Creature — Demon","supertypes":[],"types":["Creature"],"subtypes":["Demon"],"oracleText":"Flying\n{2}{B}: Exile target creature card from a graveyard. Put a +1/+1 counter on this creature.","power":"4","toughness":"4","colors":["B"],"colorIndicator":["B"],"imageUrl":"https://cards.scryfall.io/normal/back/8/8/88a28a48-d4a1-47ce-9aa0-ee65325029c4.jpg?1783924423","artUrl":"https://cards.scryfall.io/art_crop/back/8/8/88a28a48-d4a1-47ce-9aa0-ee65325029c4.jpg?1783924423"}]}) as CardDef;
const ambush = (): CardDef => ({"oracleId":"72075231-e3b3-46cc-b994-2d95b24cf904","name":"Auditore Ambush","manaCost":"{2}{U}{B}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Choose one or both —\n• Return target creature to its owner's hand.\n• Target player searches their library and/or graveyard for a card named Ezio, Blade of Vengeance, reveals it, and puts it into their hand. If they search their library this way, they shuffle.","colors":["B","U"],"colorIdentity":["B","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/4/7426f3dc-385b-42ea-85cb-853e6035ca6f.jpg?1783910892","artUrl":"https://cards.scryfall.io/art_crop/front/7/4/7426f3dc-385b-42ea-85cb-853e6035ca6f.jpg?1783910892","commanderLegal":"legal","set":"acr","releasedAt":"2024-07-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const ezio = (): CardDef => ({"oracleId":"2127a245-d664-45cb-8ed1-0024de1a10df","name":"Ezio, Blade of Vengeance","manaCost":"{3}{U}{B}","cmc":5,"typeLine":"Legendary Creature — Human Assassin","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Assassin"],"oracleText":"Deathtouch (Any amount of damage this deals to a creature is enough to destroy it.)\nWhenever an Assassin you control deals combat damage to a player, draw a card.","power":"5","toughness":"5","colors":["B","U"],"colorIdentity":["B","U"],"keywords":["Deathtouch"],"imageUrl":"https://cards.scryfall.io/normal/front/b/b/bbdc8019-9b5e-4d9a-a09b-2a14f41ddfe1.jpg?1783910897","artUrl":"https://cards.scryfall.io/art_crop/front/b/b/bbdc8019-9b5e-4d9a-a09b-2a14f41ddfe1.jpg?1783910897","commanderLegal":"legal","set":"acr","releasedAt":"2024-07-05","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const kirin = (): CardDef => ({"oracleId":"cb7edb5e-3a90-41c7-ae52-dc564086bf22","name":"Teachings of the Kirin // Kirin-Touched Orochi","manaCost":"{1}{G}","cmc":2,"typeLine":"Enchantment — Saga // Enchantment Creature — Snake Monk","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter.)\nI — Mill three cards. Create a 1/1 colorless Spirit creature token.\nII — Put a +1/+1 counter on target creature you control.\nIII — Exile this Saga, then return it to the battlefield transformed under your control.","colors":["G"],"colorIdentity":["G"],"keywords":["Transform","Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/4/c/4c0c6c2a-4352-4c65-b41d-2a722bbef6c5.jpg?1783923843","artUrl":"https://cards.scryfall.io/art_crop/front/4/c/4c0c6c2a-4352-4c65-b41d-2a722bbef6c5.jpg?1783923843","commanderLegal":"legal","set":"neo","releasedAt":"2022-02-18","rarity":"rare","layout":"transform","gameChanger":false,"faces":[{"name":"Teachings of the Kirin","manaCost":"{1}{G}","typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter.)\nI — Mill three cards. Create a 1/1 colorless Spirit creature token.\nII — Put a +1/+1 counter on target creature you control.\nIII — Exile this Saga, then return it to the battlefield transformed under your control.","colors":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/4/c/4c0c6c2a-4352-4c65-b41d-2a722bbef6c5.jpg?1783923843","artUrl":"https://cards.scryfall.io/art_crop/front/4/c/4c0c6c2a-4352-4c65-b41d-2a722bbef6c5.jpg?1783923843"},{"name":"Kirin-Touched Orochi","manaCost":"","typeLine":"Enchantment Creature — Snake Monk","supertypes":[],"types":["Enchantment","Creature"],"subtypes":["Snake","Monk"],"oracleText":"Whenever this creature attacks, choose one —\n• Exile target creature card from a graveyard. When you do, create a 1/1 colorless Spirit creature token.\n• Exile target noncreature card from a graveyard. When you do, put a +1/+1 counter on target creature you control.","power":"1","toughness":"1","colors":["G"],"colorIndicator":["G"],"imageUrl":"https://cards.scryfall.io/normal/back/4/c/4c0c6c2a-4352-4c65-b41d-2a722bbef6c5.jpg?1783923843","artUrl":"https://cards.scryfall.io/art_crop/back/4/c/4c0c6c2a-4352-4c65-b41d-2a722bbef6c5.jpg?1783923843"}]}) as CardDef;
const kumano = (): CardDef => ({"oracleId":"535916f8-b51a-4414-8ab0-fdccdefd9433","name":"Kumano Faces Kakkazan // Etching of Kumano","manaCost":"{R}","cmc":1,"typeLine":"Enchantment — Saga // Enchantment Creature — Human Shaman","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter.)\nI — This Saga deals 1 damage to each opponent and each planeswalker they control.\nII — When you next cast a creature spell this turn, that creature enters with an additional +1/+1 counter on it.\nIII — Exile this Saga, then return it to the battlefield transformed under your control.","colors":["R"],"colorIdentity":["R"],"keywords":["Transform","Haste"],"imageUrl":"https://cards.scryfall.io/normal/front/2/8/28d92cad-45b0-479d-97fc-c175f3a3f259.jpg?1783923870","artUrl":"https://cards.scryfall.io/art_crop/front/2/8/28d92cad-45b0-479d-97fc-c175f3a3f259.jpg?1783923870","commanderLegal":"legal","set":"neo","releasedAt":"2022-02-18","rarity":"uncommon","layout":"transform","gameChanger":false,"faces":[{"name":"Kumano Faces Kakkazan","manaCost":"{R}","typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter.)\nI — This Saga deals 1 damage to each opponent and each planeswalker they control.\nII — When you next cast a creature spell this turn, that creature enters with an additional +1/+1 counter on it.\nIII — Exile this Saga, then return it to the battlefield transformed under your control.","colors":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/2/8/28d92cad-45b0-479d-97fc-c175f3a3f259.jpg?1783923870","artUrl":"https://cards.scryfall.io/art_crop/front/2/8/28d92cad-45b0-479d-97fc-c175f3a3f259.jpg?1783923870"},{"name":"Etching of Kumano","manaCost":"","typeLine":"Enchantment Creature — Human Shaman","supertypes":[],"types":["Enchantment","Creature"],"subtypes":["Human","Shaman"],"oracleText":"Haste\nIf a creature dealt damage this turn by a source you controlled would die, exile it instead.","power":"2","toughness":"2","colors":["R"],"colorIndicator":["R"],"imageUrl":"https://cards.scryfall.io/normal/back/2/8/28d92cad-45b0-479d-97fc-c175f3a3f259.jpg?1783923870","artUrl":"https://cards.scryfall.io/art_crop/back/2/8/28d92cad-45b0-479d-97fc-c175f3a3f259.jpg?1783923870"}]}) as CardDef;
const lady = (): CardDef => ({"oracleId":"1ea4f882-6872-4d9e-9532-5ba2bf848d00","name":"The Lady of Otaria","manaCost":"{3}{R}{G}","cmc":5,"typeLine":"Legendary Creature — Avatar","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Avatar"],"oracleText":"You may tap three untapped Dwarves you control rather than pay this spell's mana cost.\nAt the beginning of each end step, if a land you controlled was put into a graveyard from the battlefield this turn, reveal the top four cards of your library. You may put any number of Dwarf cards from among them into your hand. Put the rest on the bottom of your library in a random order.","power":"5","toughness":"5","colors":["G","R"],"colorIdentity":["G","R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/9/d96a5a00-22a7-4a7b-a7e2-5c055a8384ba.jpg?1783921463","artUrl":"https://cards.scryfall.io/art_crop/front/d/9/d96a5a00-22a7-4a7b-a7e2-5c055a8384ba.jpg?1783921463","commanderLegal":"legal","set":"dmc","releasedAt":"2022-09-09","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const judoon = (): CardDef => ({"oracleId":"cacda1c2-2fe8-40a3-89f3-38a835f10af3","name":"Fugitive of the Judoon","manaCost":"{4}{G}","cmc":5,"typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — Create a 1/1 white Human creature token with ward {2} and a 4/4 white Alien Rhino creature token.\nII — Investigate.\nIII — You may exile a Human you control and an artifact you control. If you do, search your library for a Doctor card, put it onto the battlefield, then shuffle.","colors":["G"],"colorIdentity":["G"],"keywords":["Investigate"],"imageUrl":"https://cards.scryfall.io/normal/front/e/1/e15f1891-4f80-4c68-8421-8e16ff8d6a6d.jpg?1783914644","artUrl":"https://cards.scryfall.io/art_crop/front/e/1/e15f1891-4f80-4c68-8421-8e16ff8d6a6d.jpg?1783914644","commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"rare","layout":"saga","gameChanger":false}) as CardDef;
const spires = (): CardDef => ({"oracleId":"722324de-3e77-4a22-aa07-7f8a21be76c2","name":"Weight of Spires","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Weight of Spires deals damage to target creature equal to the number of nonbasic lands that creature's controller controls.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/5/d5f26a87-4562-450c-800b-7d4acc1ae17b.jpg?1783943416","artUrl":"https://cards.scryfall.io/art_crop/front/d/5/d5f26a87-4562-450c-800b-7d4acc1ae17b.jpg?1783943416","commanderLegal":"legal","set":"dis","releasedAt":"2006-05-05","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const devour = (): CardDef => ({"oracleId":"6c40f825-836e-4b76-8e43-267b4abf013b","name":"Devour Flesh","manaCost":"{1}{B}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target player sacrifices a creature of their choice, then gains life equal to that creature's toughness.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/8/88c42ebd-114a-430d-b3a4-ff2fb3093bf5.jpg?1783940131","artUrl":"https://cards.scryfall.io/art_crop/front/8/8/88c42ebd-114a-430d-b3a4-ff2fb3093bf5.jpg?1783940131","commanderLegal":"legal","set":"gtc","releasedAt":"2013-02-01","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const insight = (): CardDef => ({"oracleId":"8e0b605f-2095-4189-8c71-9d1ac93db42e","name":"Sudden Insight","manaCost":"{4}{U}{U}","cmc":6,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Draw a card for each different mana value among nonland cards in your graveyard.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/9/99d082a0-abb9-42a1-9edc-0f9faca6d648.jpg?1783908835","artUrl":"https://cards.scryfall.io/art_crop/front/9/9/99d082a0-abb9-42a1-9edc-0f9faca6d648.jpg?1783908835","commanderLegal":"legal","set":"j25","releasedAt":"2024-11-15","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const ritualist = (): CardDef => ({"oracleId":"37420ccd-c6c6-4f15-a696-d8986934afb5","name":"Gladewalker Ritualist","manaCost":"{2}{G}","cmc":3,"typeLine":"Creature — Shapeshifter","supertypes":[],"types":["Creature"],"subtypes":["Shapeshifter"],"oracleText":"Changeling (This card is every creature type.)\nWhenever another creature you control named Gladewalker Ritualist enters, draw a card.","power":"3","toughness":"3","colors":["G"],"colorIdentity":["G"],"keywords":["Changeling"],"imageUrl":"https://cards.scryfall.io/normal/front/8/0/8053b888-a680-4318-88c3-0924e596e780.jpg?1783928116","artUrl":"https://cards.scryfall.io/art_crop/front/8/0/8053b888-a680-4318-88c3-0924e596e780.jpg?1783928116","commanderLegal":"legal","set":"khm","releasedAt":"2021-02-05","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

const human = card("Test Villager", "Creature — Human", "{W}", { power: "1", toughness: "1", colors: ["W"] });
const humanArtifact = card("Test Clockwork Human", "Artifact Creature — Human Construct", "{2}", { power: "1", toughness: "1" });
const trinket = card("Test Trinket", "Artifact", "{1}");
const doctor = card("Test Time Lord", "Legendary Creature — Time Lord Doctor", "{3}{W}", { power: "3", toughness: "3", colors: ["W"] });
const dwarf = card("Test Dwarf", "Creature — Dwarf", "{R}", { power: "1", toughness: "1", colors: ["R"] });
const shock = card("Test Shock", "Instant", "{R}", { oracleText: "Test Shock deals 2 damage to any target.", colors: ["R"] });
const kill = card("Test Kill", "Instant", "{B}", { oracleText: "Destroy target creature.", colors: ["B"] });
const wasteland = card("Test Wasteland", "Land", "", { oracleText: "{T}: Add {C}." });
const nonbasic = card("Test Ruins", "Land", "", { oracleText: "{T}: Add {C}." });
const ogre = card("Test Ogre", "Creature — Ogre", "{2}{R}", { power: "3", toughness: "4", colors: ["R"] });

describe("Lane B round B101", () => {
  it("all ten cards are supported", () => supported(mirror(), ambush(), kirin(), kumano(), lady(), judoon(), spires(), devour(), insight(), ritualist()));

  it("Heirloom Mirror: draw, mill, a ritual counter; with three or more, they're removed and it transforms, still tapped", () => {
    for (const before of [0, 2]) {
      let { s, ap, ids } = setup([bear()]);
      const m = putOnBattlefield(s, ap, mirror());
      if (before) s.objects[m]!.counters.ritual = before;
      const life = s.players[ap]!.life;
      const hand = s.players[ap]!.hand.length;
      const yard = s.players[ap]!.graveyard.length;
      s = settle(run(s, planActivate(s, ap, m, 0, undefined, undefined, undefined, undefined, { discard: [ids[0]!] })));
      expect(s.players[ap]!.life).toBe(life - 1);
      // The discarded card and the milled one; the drawn card replaces the discarded one in hand.
      expect(s.players[ap]!.graveyard.length).toBe(yard + 2);
      expect(s.players[ap]!.hand.length).toBe(hand);
      expect(s.objects[m]!.tapped).toBe(true);
      if (!before) {
        expect(s.objects[m]!.counters.ritual).toBe(1);
        expect(nameOf(s, m)).toBe("Heirloom Mirror");
      } else {
        expect(s.objects[m]!.counters.ritual ?? 0).toBe(0);
        expect(nameOf(s, m)).toBe("Inherited Fiend");
      }
    }
  });

  it("Auditore Ambush: target player searches their library and/or graveyard for Ezio and puts it into their hand", () => {
    // You: Ezio in your library, nothing fitting in the graveyard, so the library is searched (and shuffled).
    let { s, ap, ids } = setup([ambush()]);
    const ez = into(s, ap, ezio(), "library");
    const shuffles = s.players[ap]!.shuffles ?? 0;
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(ap)], [1], "auto")), { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [ez] }));
    expect(zone(s, ez)).toBe("hand");
    expect(s.players[ap]!.shuffles ?? 0).toBe(shuffles + 1);
    // An opponent with Ezio in their graveyard: they choose the zones and the card, it goes to their hand.
    let t = setup([ambush()]);
    const theirs = into(t.s, t.opp, ezio(), "graveyard");
    t.s = settle(run(t.s, planCast(t.s, t.ap, t.ids[0]!, [player(t.opp)], [1], "auto")), { me: [t.ap] });
    expect(zone(t.s, theirs)).toBe("hand");
    expect(t.s.players[t.opp]!.hand).toContain(theirs);
  });

  it("Auditore Ambush: both modes, the creature back to its owner's hand and the search", () => {
    let { s, ap, opp, ids } = setup([ambush()]);
    const b = putOnBattlefield(s, opp, bear());
    const ez = into(s, ap, ezio(), "graveyard");
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(b), player(ap)], [0, 1], "auto")), { me: [ap] });
    expect(zone(s, b)).toBe("hand");
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "searchZones" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "graveyard" }), { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", cards: [ez] });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [ez] }));
    expect(zone(s, ez)).toBe("hand");
  });

  it("Kirin-Touched Orochi: exile a creature card from a graveyard, and when you do, a Spirit; a noncreature card, a counter", () => {
    for (const mode of [0, 1]) {
      let { s, ap, opp } = setup([]);
      const o = putOnBattlefield(s, ap, kirin());
      s.objects[o]!.face = 1;
      invalidateCharacteristics(s);
      expect(nameOf(s, o)).toBe("Kirin-Touched Orochi");
      const b = putOnBattlefield(s, ap, bear());
      const card0 = into(s, opp, mode === 0 ? bear() : shock, "graveyard");
      s = passUntil(s, "declareAttackers", ap);
      s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: o, defender: opp }] });
      for (let i = 0; i < 40 && s.pending?.kind !== "chooseModes" && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      if (s.pending?.kind === "chooseModes") s = act(s, { type: "chooseModes", player: ap, modes: [mode] });
      expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
      s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(card0)] });
      s = settle(s, { me: [ap] });
      if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(b)] }), { me: [ap] });
      expect(zone(s, card0)).toBe("exile");
      if (mode === 0) expect(named(s, "Spirit Token").length + s.battlefield.filter((id) => s.objects[id]!.isToken && defOf(s, s.objects[id]!).subtypes.includes("Spirit")).length).toBeGreaterThan(0);
      else expect(s.objects[b]!.counters["+1/+1"]).toBe(1);
    }
  });

  it("Etching of Kumano: a creature dealt damage this turn by a source you controlled is exiled instead of dying; not by another's", () => {
    let { s, ap, opp, ids } = setup([shock, shock]);
    const e = putOnBattlefield(s, ap, kumano());
    s.objects[e]!.face = 1;
    invalidateCharacteristics(s);
    expect(nameOf(s, e)).toBe("Etching of Kumano");
    // Your Shock kills it: exiled.
    const b1 = putOnBattlefield(s, opp, bear());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(b1)], undefined, "auto")));
    expect(zone(s, b1)).toBe("exile");
    // Damaged by your source, then destroyed: still exiled.
    const b2 = putOnBattlefield(s, opp, ogre);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(b2)], undefined, "auto")));
    expect(zone(s, b2)).toBe("battlefield");
    const k = into(s, ap, kill, "hand");
    s = settle(run(s, planCast(s, ap, k, [tgt(b2)], undefined, "auto")));
    expect(zone(s, b2)).toBe("exile");
    // Damaged by an opponent's source only: it dies.
    const b3 = putOnBattlefield(s, opp, bear());
    const theirShock = into(s, opp, shock, "hand");
    s.players[opp]!.manaPool.R = 1;
    s.priority = opp;
    s = settle(run(s, planCast(s, opp, theirShock, [tgt(b3)], undefined, "auto")));
    expect(zone(s, b3)).toBe("graveyard");
  });

  it("The Lady of Otaria: at each end step, if a land you controlled went to a graveyard from the battlefield, Dwarves from the top four", () => {
    for (const lost of [false, true]) {
      let { s, ap, opp } = setup([]);
      s.players[ap]!.hand = [];
      putOnBattlefield(s, ap, lady());
      const top = [into(s, ap, dwarf, "library"), into(s, ap, bear(), "library"), into(s, ap, dwarf, "library"), into(s, ap, bear(), "library")];
      if (lost) {
        const land = putOnBattlefield(s, ap, wasteland);
        const k = card("Test Land Wrecker", "Sorcery", "{0}", { oracleText: "Destroy target land." });
        const w = into(s, ap, k, "hand");
        s = settle(run(s, planCast(s, ap, w, [tgt(land)], undefined, "auto")));
        expect(zone(s, land)).toBe("graveyard");
      }
      s = passUntil(s, "end", ap);
      s = settle(s, { me: [ap] });
      if (!lost) {
        expect(s.pending).toBeFalsy();
        expect(top.every((id) => zone(s, id) === "library")).toBe(true);
        continue;
      }
      expect(s.pending).toMatchObject({ player: ap });
      const dwarves = top.filter((id) => nameOf(s, id) === "Test Dwarf");
      s = settle(act(s, { type: "searchLibrary", player: ap, found: dwarves }));
      expect(dwarves.every((id) => zone(s, id) === "hand")).toBe(true);
      expect(top.filter((id) => nameOf(s, id) === "Grizzly Bears").every((id) => zone(s, id) === "library")).toBe(true);
    }
  });

  it("Fugitive of the Judoon: I makes a ward 2 Human and a 4/4 Alien Rhino; III exiles a Human and an artifact for a Doctor", () => {
    let { s, ap, ids } = setup([judoon()]);
    const doc = into(s, ap, doctor, "library");
    s = settle(run(s, planCast(s, ap, ids[0]!, [], undefined, "auto")));
    const humans = s.battlefield.filter((id) => s.objects[id]!.isToken && defOf(s, s.objects[id]!).subtypes.includes("Human"));
    expect(humans.length).toBe(1);
    expect(defOf(s, s.objects[humans[0]!]!).oracleText).toContain("Ward {2}");
    expect(s.battlefield.some((id) => s.objects[id]!.isToken && defOf(s, s.objects[id]!).subtypes.includes("Rhino"))).toBe(true);
    // II: a Clue (an artifact).
    putCounters(s, s.objects[ids[0]!]!, "lore", 1);
    s = settle(s);
    const clue = s.battlefield.find((id) => s.objects[id]!.isToken && defOf(s, s.objects[id]!).subtypes.includes("Clue"))!;
    expect(clue).toBeDefined();
    putCounters(s, s.objects[ids[0]!]!, "lore", 1);
    s = settle(s, { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), { me: [ap] });
    // One Human and one artifact: each pick has a single option, so nothing is asked.
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [doc] }));
    // Tokens that leave the battlefield cease to exist (CR 111.7).
    expect(s.battlefield.includes(humans[0]!)).toBe(false);
    expect(s.battlefield.includes(clue)).toBe(false);
    expect(zone(s, doc)).toBe("battlefield");
  });

  it("Fugitive of the Judoon III: an artifact Human alone can't be both; with another artifact, the Human picked leaves one", () => {
    for (const withTrinket of [false, true]) {
      let { s, ap } = setup([]);
      const saga = putOnBattlefield(s, ap, judoon());
      s.objects[saga]!.counters.lore = 2;
      const ah = putOnBattlefield(s, ap, humanArtifact);
      const h = putOnBattlefield(s, ap, human);
      const t = withTrinket ? putOnBattlefield(s, ap, trinket) : undefined;
      // Without the Trinket, the only artifact is the artifact Human: Test Villager and it can still be both.
      if (!withTrinket) {
        s.battlefield.splice(s.battlefield.indexOf(h), 1);
        s.objects[h]!.zone = "graveyard";
        s.players[ap]!.graveyard.push(h);
        invalidateCharacteristics(s);
      }
      putCounters(s, s.objects[saga]!, "lore", 1);
      s = settle(s, { me: [ap] });
      if (!withTrinket) {
        // Not offered: one permanent can't be exiled as both (CR 609.3).
        expect(s.pending).toBeFalsy();
        expect(zone(s, ah)).toBe("battlefield");
        continue;
      }
      s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), { me: [ap] });
      expect(s.pending).toMatchObject({ kind: "pickPermanents" });
      expect([...(s.pending as { options: string[] }).options].sort()).toEqual([ah, h].sort());
      // Picking the artifact Human as the Human leaves the Trinket as the artifact.
      s = settle(act(s, { type: "pickPermanents", player: ap, ids: [ah] }), { me: [ap] });
      if (s.pending?.kind === "pickPermanents") {
        expect((s.pending as { options: string[] }).options).toEqual([t]);
        s = settle(act(s, { type: "pickPermanents", player: ap, ids: [t!] }), { me: [ap] });
      }
      expect(zone(s, ah)).toBe("exile");
      expect(zone(s, t!)).toBe("exile");
    }
  });

  it("Weight of Spires: damage equal to the nonbasic lands the creature's controller controls", () => {
    let { s, ap, opp, ids } = setup([spires()]);
    const b = putOnBattlefield(s, opp, ogre);
    putOnBattlefield(s, opp, nonbasic);
    putOnBattlefield(s, opp, card("Test Other Ruins", "Land", ""));
    putOnBattlefield(s, opp, card("Forest", "Basic Land — Forest"));
    // Yours don't count.
    putOnBattlefield(s, ap, card("Test Your Ruins", "Land", ""));
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(b)], undefined, "auto")));
    expect(s.objects[b]!.damage).toBe(2);
  });

  it("Devour Flesh: the target player sacrifices a creature and gains life equal to its toughness; with none, no life", () => {
    let { s, ap, opp, ids } = setup([devour(), devour()]);
    const o = putOnBattlefield(s, opp, ogre);
    const life = s.players[opp]!.life;
    const mine = s.players[ap]!.life;
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)], undefined, "auto")));
    expect(zone(s, o)).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(life + 4);
    expect(s.players[ap]!.life).toBe(mine);
    s = settle(run(s, planCast(s, ap, ids[1]!, [player(opp)], undefined, "auto")));
    expect(s.players[opp]!.life).toBe(life + 4);
  });

  it("Sudden Insight: a card for each different mana value among nonland cards in your graveyard", () => {
    let { s, ap, ids } = setup([insight()]);
    for (const d of [bear(), bear(), shock, ogre, wasteland, card("Test Zero", "Artifact", "")]) into(s, ap, d, "graveyard");
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, ids[0]!, [], undefined, "auto")));
    // Mana values 2, 1, 3 and 0; the land doesn't count.
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 4);
  });

  it("Gladewalker Ritualist: another creature you control named Gladewalker Ritualist entering draws a card; others don't", () => {
    let { s, ap, opp, ids } = setup([ritualist(), bear()]);
    putOnBattlefield(s, ap, ritualist());
    putOnBattlefield(s, opp, ritualist());
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, ids[1]!, [], undefined, "auto")));
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
    s = settle(run(s, planCast(s, ap, ids[0]!, [], undefined, "auto")));
    // Each of yours already there sees the new one (the new one sees the other as "another"? no: it enters, the old one triggers).
    expect(s.players[ap]!.hand.length).toBe(hand - 2 + 1);
  });
});
