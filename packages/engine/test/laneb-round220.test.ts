// Lane B round B220: Fervent Mastery (for {2}{R}{R}, an opponent you choose discards any number of cards and draws that
// many; then up to three cards searched for and three discarded at random), Jailbreak (a permanent card back from an
// opponent's graveyard under their control; when it enters, one of yours with equal or lesser mana value), Spirit-Sister's
// Call (a permanent card back at your end step for a sacrifice sharing a card type, exiled if it would leave) and Cultural
// Exchange (any number of creatures of one target player exchanged for as many of another's).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, controllerOf, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const fervent = (): CardDef => ({"oracleId":"cae6d903-3fd6-422d-b21b-92201b78fa1b","name":"Fervent Mastery","manaCost":"{3}{R}{R}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"You may pay {2}{R}{R} rather than pay this spell's mana cost.\nIf the {2}{R}{R} cost was paid, an opponent discards any number of cards, then draws that many cards.\nSearch your library for up to three cards, put them into your hand, shuffle, then discard three cards at random.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/f/1f824caf-b32c-442a-8631-887831a57360.jpg?1783927355","artUrl":"https://cards.scryfall.io/art_crop/front/1/f/1f824caf-b32c-442a-8631-887831a57360.jpg?1783927355","commanderLegal":"legal","set":"stx","releasedAt":"2021-04-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const jailbreak = (): CardDef => ({"oracleId":"169cf74a-07bf-4841-83f3-904df8a0a39b","name":"Jailbreak","manaCost":"{1}{W}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Return target permanent card in an opponent's graveyard to the battlefield under their control. When that permanent enters, return up to one target permanent card with equal or lesser mana value from your graveyard to the battlefield.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/8/5884d98e-3e02-48ae-9904-4ebbf1e90f6d.jpg?1783923374","artUrl":"https://cards.scryfall.io/art_crop/front/5/8/5884d98e-3e02-48ae-9904-4ebbf1e90f6d.jpg?1783923374","commanderLegal":"legal","set":"ncc","releasedAt":"2022-04-29","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const sisters = (): CardDef => ({"oracleId":"83914a83-4de2-4d64-9770-f68a12014167","name":"Spirit-Sister's Call","manaCost":"{3}{W}{B}","cmc":5,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of your end step, choose target permanent card in your graveyard. You may sacrifice a permanent that shares a card type with the chosen card. If you do, return the chosen card from your graveyard to the battlefield and it gains \"If this permanent would leave the battlefield, exile it instead of putting it anywhere else.\"","colors":["B","W"],"colorIdentity":["B","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/9/79e7b4ab-bc2c-4dd0-9433-6266c86c1c84.jpg?1783923728","artUrl":"https://cards.scryfall.io/art_crop/front/7/9/79e7b4ab-bc2c-4dd0-9433-6266c86c1c84.jpg?1783923728","commanderLegal":"legal","set":"neo","releasedAt":"2022-02-18","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const exchange = (): CardDef => ({"oracleId":"c85ba59f-2851-4c75-86db-da798334850c","name":"Cultural Exchange","manaCost":"{4}{U}{U}","cmc":6,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Choose any number of creatures target player controls. Choose the same number of creatures another target player controls. Those players exchange control of those creatures. (This effect lasts indefinitely.)","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/4/d4f38d07-829c-4311-a61b-2785cf2266ef.jpg?1783945262","artUrl":"https://cards.scryfall.io/art_crop/front/d/4/d4f38d07-829c-4311-a61b-2785cf2266ef.jpg?1783945262","commanderLegal":"legal","set":"ody","releasedAt":"2001-10-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const crawWurm = (): CardDef => ({"oracleId":"6a462a69-3e42-41de-a3aa-a488d9f38d69","name":"Craw Wurm","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Creature — Wurm","supertypes":[],"types":["Creature"],"subtypes":["Wurm"],"oracleText":"","power":"6","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/f/bfed1a95-bd67-4e16-a781-81866028af2f.jpg?1783948678","artUrl":"https://cards.scryfall.io/art_crop/front/b/f/bfed1a95-bd67-4e16-a781-81866028af2f.jpg?1783948678","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const pacifism = (): CardDef => ({"oracleId":"5f5e0b10-c8cf-450c-bfd3-bcb0528ec330","name":"Pacifism","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't attack or block.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","artUrl":"https://cards.scryfall.io/art_crop/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const elves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const serra = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","commanderLegal":"legal","set":"sld","releasedAt":"2023-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Passes and lets bots answer until the stack is empty or one of `me` has a question. */
const settle = (s: GameState, me: PlayerId[] = []) => {
  for (let i = 0; i < 400 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && !me.includes(p.player)) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const card = (id: string): TargetChoice => ({ kind: "object", id });
const toZone = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "library" | "graveyard", top = false) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  const p = s.players[pid]!;
  if (where === "library") {
    if (top) p.library.unshift(id);
    else p.library.push(id);
  } else p[where].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Empties a player's hand into their library. */
const emptyHand = (s: GameState, pid: PlayerId) => {
  const p = s.players[pid]!;
  for (const id of p.hand) {
    s.objects[id]!.zone = "library";
    p.library.push(id);
  }
  p.hand = [];
};

describe("Lane B round B220", () => {
  it("compiles all four cards", () => {
    supported(fervent(), jailbreak(), sisters(), exchange());
  });

  describe("Fervent Mastery", () => {
    /** Casts Fervent Mastery for its alternative cost (or not), the opponent holding `n` cards. */
    const master = (alt: boolean) => {
      const { s: s0, ap, opp, ids } = setup([fervent()]);
      const keep = ids[0]!;
      emptyHand(s0, ap);
      s0.players[ap]!.hand.push(keep);
      s0.objects[keep]!.zone = "hand";
      const a = toZone(s0, ap, hillGiant(), "library");
      const b = toZone(s0, ap, crawWurm(), "library");
      const c = toZone(s0, ap, serra(), "library");
      emptyHand(s0, opp);
      const theirs = [toZone(s0, opp, divination(), "hand"), toZone(s0, opp, pacifism(), "hand"), toZone(s0, opp, elves(), "hand")];
      const s = run(s0, planCast(s0, ap, keep, undefined, undefined, undefined, undefined, alt ? { alt: "alternative" } : undefined));
      return { s, ap, opp, mine: [a, b, c], theirs };
    };

    it("for {2}{R}{R}, the opponent you choose discards the cards they choose and draws that many; then your search and three at random", () => {
      let { s, ap, opp, mine, theirs } = master(true);
      const libBefore = s.players[opp]!.library.length;
      for (let i = 0; i < 100 && (s.stack.length || s.pending); i++) {
        const p = s.pending;
        if (p?.kind === "chooseOption" && p.what === "opponent") s = act(s, { type: "chooseOption", player: ap, choice: String(opp) });
        else if (p?.kind === "discard" && p.player === opp) s = act(s, { type: "discard", player: opp, objectIds: [theirs[0]!, theirs[1]!] });
        else if (p?.kind === "searchLibrary" && p.player === ap) s = act(s, { type: "searchLibrary", player: ap, found: mine });
        else if (p) throw new Error(`unexpected ${p.kind}`);
        else s = act(s, { type: "passPriority", player: waitingOn(s)! });
      }
      // The opponent discarded two and drew two.
      expect([zone(s, theirs[0]!), zone(s, theirs[1]!), zone(s, theirs[2]!)]).toEqual(["graveyard", "graveyard", "hand"]);
      expect(s.players[opp]!.hand).toHaveLength(3);
      expect(s.players[opp]!.library).toHaveLength(libBefore - 2);
      // You found three, then discarded three at random: only those three were in your hand.
      expect(mine.map((id) => zone(s, id))).toEqual(["graveyard", "graveyard", "graveyard"]);
      expect(s.players[ap]!.hand).toHaveLength(0);
    });

    it("the opponent may discard nothing, and then draws nothing (rulings)", () => {
      let { s, ap, opp, theirs } = master(true);
      const libBefore = s.players[opp]!.library.length;
      for (let i = 0; i < 100 && (s.stack.length || s.pending); i++) {
        const p = s.pending;
        if (p?.kind === "chooseOption" && p.what === "opponent") s = act(s, { type: "chooseOption", player: ap, choice: String(opp) });
        else if (p?.kind === "discard" && p.player === opp) s = act(s, { type: "discard", player: opp, objectIds: [] });
        else if (p?.kind === "searchLibrary" && p.player === ap) s = act(s, { type: "searchLibrary", player: ap, found: [] });
        else if (p) throw new Error(`unexpected ${p.kind}`);
        else s = act(s, { type: "passPriority", player: waitingOn(s)! });
      }
      expect(theirs.map((id) => zone(s, id))).toEqual(["hand", "hand", "hand"]);
      expect(s.players[opp]!.library).toHaveLength(libBefore);
    });

    it("for its mana cost, no opponent is asked: only the search and the discard", () => {
      let { s, ap, mine, theirs } = master(false);
      for (let i = 0; i < 100 && (s.stack.length || s.pending); i++) {
        const p = s.pending;
        if (p?.kind === "searchLibrary" && p.player === ap) s = act(s, { type: "searchLibrary", player: ap, found: [mine[0]!] });
        else if (p) throw new Error(`unexpected ${p.kind}`);
        else s = act(s, { type: "passPriority", player: waitingOn(s)! });
      }
      expect(zone(s, mine[0]!)).toBe("graveyard");
      expect(theirs.map((id) => zone(s, id))).toEqual(["hand", "hand", "hand"]);
    });
  });

  describe("Jailbreak", () => {
    it("returns an opponent's card under their control, then one of yours with equal or lesser mana value", () => {
      let { s, ap, opp, ids } = setup([jailbreak()]);
      const giant = toZone(s, opp, hillGiant(), "graveyard");
      const elf = toZone(s, ap, elves(), "graveyard");
      const wurm = toZone(s, ap, crawWurm(), "graveyard");
      s = run(s, planCast(s, ap, ids[0]!, [card(giant)]));
      for (let i = 0; i < 40 && s.pending?.kind !== "chooseTargets" && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      expect(zone(s, giant)).toBe("battlefield");
      expect(controllerOf(s, s.objects[giant]!)).toBe(opp);
      // The reflexive trigger's target: mana value 4 or less, so Llanowar Elves but not Craw Wurm.
      expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
      expect(() => act(s, { type: "chooseTargets", player: ap, targets: [card(wurm)] })).toThrow();
      s = act(s, { type: "chooseTargets", player: ap, targets: [card(elf)] });
      s = settle(s, [ap]);
      expect(zone(s, elf)).toBe("battlefield");
      expect(controllerOf(s, s.objects[elf]!)).toBe(ap);
      expect(zone(s, wurm)).toBe("graveyard");
    });

    it("with the opponent's card gone before it resolves, nothing enters and there is no second target (rulings)", () => {
      let { s, ap, opp, ids } = setup([jailbreak()]);
      const giant = toZone(s, opp, hillGiant(), "graveyard");
      const elf = toZone(s, ap, elves(), "graveyard");
      s = run(s, planCast(s, ap, ids[0]!, [card(giant)]));
      const p = s.players[opp]!;
      p.graveyard.splice(p.graveyard.indexOf(giant), 1);
      s.objects[giant]!.zone = "exile";
      s.objects[giant]!.zoneChanges = (s.objects[giant]!.zoneChanges ?? 0) + 1;
      p.exile.push(giant);
      s = settle(s, [ap]);
      expect(s.pending).toBeFalsy();
      expect(zone(s, giant)).toBe("exile");
      expect(zone(s, elf)).toBe("graveyard");
    });
  });

  describe("Spirit-Sister's Call", () => {
    /** At `ap`'s end step with the trigger on the stack, targeting `target`. */
    const toEndStep = (s0: GameState, ap: PlayerId, target: string) => {
      let s = passUntil(s0, "end", ap);
      for (let i = 0; i < 20 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
      s = act(s, { type: "chooseTargets", player: ap, targets: [card(target)] });
      for (let i = 0; i < 20 && !s.pending && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      return s;
    };

    it("sacrificing a permanent that shares a card type returns the card, which is exiled if it would leave", () => {
      let { s, ap } = setup([]);
      putOnBattlefield(s, ap, sisters());
      const elf = putOnBattlefield(s, ap, elves());
      const ring = putOnBattlefield(s, ap, solRing());
      const giant = putOnBattlefield(s, ap, hillGiant());
      const wurm = toZone(s, ap, crawWurm(), "graveyard");
      s = toEndStep(s, ap, wurm);
      expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
      s = act(s, { type: "chooseMay", player: ap, yes: true });
      // Only the creature shares a card type with Craw Wurm: Sol Ring is an artifact.
      expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap });
      if (s.pending?.kind !== "pickPermanents") throw new Error("no pick");
      expect(s.pending.options).toEqual(expect.arrayContaining([elf, giant]));
      expect(s.pending.options).not.toContain(ring);
      s = act(s, { type: "pickPermanents", player: ap, ids: [elf] });
      s = settle(s, [ap]);
      expect(zone(s, elf)).toBe("graveyard");
      expect(zone(s, giant)).toBe("battlefield");
      expect(zone(s, wurm)).toBe("battlefield");
      // It would die: it's exiled instead.
      s.objects[wurm]!.damage = 10;
      invalidateCharacteristics(s);
      s = act(s, { type: "passPriority", player: waitingOn(s)! });
      expect(zone(s, wurm)).toBe("exile");
    });

    it("declined, nothing is sacrificed or returned", () => {
      let { s, ap } = setup([]);
      putOnBattlefield(s, ap, sisters());
      const elf = putOnBattlefield(s, ap, elves());
      const wurm = toZone(s, ap, crawWurm(), "graveyard");
      s = toEndStep(s, ap, wurm);
      s = act(s, { type: "chooseMay", player: ap, yes: false });
      s = settle(s, [ap]);
      expect(zone(s, elf)).toBe("battlefield");
      expect(zone(s, wurm)).toBe("graveyard");
    });

    it("Spirit-Sister's Call itself may be the enchantment sacrificed for an enchantment card", () => {
      let { s, ap } = setup([]);
      const call = putOnBattlefield(s, ap, sisters());
      putOnBattlefield(s, ap, elves());
      const aura = toZone(s, ap, { ...pacifism(), oracleId: "test-anthem", name: "Glorious Anthem", typeLine: "Enchantment", subtypes: [], oracleText: "Creatures you control get +1/+1." } as CardDef, "graveyard");
      s = toEndStep(s, ap, aura);
      s = act(s, { type: "chooseMay", player: ap, yes: true });
      if (s.pending?.kind === "pickPermanents") {
        expect(s.pending.options).toEqual([call]);
        s = act(s, { type: "pickPermanents", player: ap, ids: [call] });
      }
      s = settle(s, [ap]);
      expect(zone(s, call)).toBe("graveyard");
      expect(zone(s, aura)).toBe("battlefield");
    });
  });

  describe("Cultural Exchange", () => {
    const player = (pid: PlayerId): TargetChoice => ({ kind: "player", id: pid });

    it("exchanges the creatures chosen of one target player for as many of the other's, for good", () => {
      let { s, ap, opp, ids } = setup([exchange()]);
      const third = s.turnOrder[(s.turnOrder.indexOf(ap) + 2) % 4]!;
      const elf = putOnBattlefield(s, opp, elves());
      const giant = putOnBattlefield(s, opp, hillGiant());
      const wurm = putOnBattlefield(s, third, crawWurm());
      const angel = putOnBattlefield(s, third, serra());
      const thopter = putOnBattlefield(s, third, ornithopter());
      s = run(s, planCast(s, ap, ids[0]!, [player(opp), player(third)]));
      for (let i = 0; i < 20 && !s.pending && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      // The first choice: any number of the first player's creatures, up to as many as the other player has.
      expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, min: 0, count: 2 });
      s = act(s, { type: "pickPermanents", player: ap, ids: [elf, giant] });
      // Then exactly as many of the second player's.
      expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, count: 2 });
      if (s.pending?.kind !== "pickPermanents") throw new Error("no pick");
      expect(s.pending.options).toEqual(expect.arrayContaining([wurm, angel, thopter]));
      expect(() => act(s, { type: "pickPermanents", player: ap, ids: [wurm] })).toThrow();
      s = act(s, { type: "pickPermanents", player: ap, ids: [wurm, angel] });
      s = settle(s, [ap]);
      expect([elf, giant].map((id) => controllerOf(s, s.objects[id]!))).toEqual([third, third]);
      expect([wurm, angel].map((id) => controllerOf(s, s.objects[id]!))).toEqual([opp, opp]);
      expect(controllerOf(s, s.objects[thopter]!)).toBe(third);
      // It lasts indefinitely: still so next turn.
      s = passUntil(s, "upkeep", third);
      expect(controllerOf(s, s.objects[wurm]!)).toBe(opp);
    });

    it("you may be one of the players, and choosing none exchanges nothing", () => {
      let { s, ap, opp, ids } = setup([exchange()]);
      const mine = putOnBattlefield(s, ap, elves());
      const theirs = putOnBattlefield(s, opp, crawWurm());
      s = run(s, planCast(s, ap, ids[0]!, [player(ap), player(opp)]));
      for (let i = 0; i < 20 && !s.pending && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, count: 1 });
      s = act(s, { type: "pickPermanents", player: ap, ids: [] });
      s = settle(s, [ap]);
      expect(controllerOf(s, s.objects[mine]!)).toBe(ap);
      expect(controllerOf(s, s.objects[theirs]!)).toBe(opp);
    });

    it("with no creature on one side, nothing is asked or exchanged", () => {
      let { s, ap, opp, ids } = setup([exchange()]);
      const theirs = putOnBattlefield(s, opp, crawWurm());
      const third = s.turnOrder[(s.turnOrder.indexOf(ap) + 2) % 4]!;
      s = run(s, planCast(s, ap, ids[0]!, [player(opp), player(third)]));
      s = settle(s, [ap]);
      expect(s.pending).toBeFalsy();
      expect(controllerOf(s, s.objects[theirs]!)).toBe(opp);
    });

    it("a bot casting it gives away its worst creatures for the opponent's best", () => {
      let { s, ap, opp, ids } = setup([exchange()]);
      const mine = putOnBattlefield(s, ap, ornithopter());
      const elf = putOnBattlefield(s, ap, elves());
      const wurm = putOnBattlefield(s, opp, crawWurm());
      const angel = putOnBattlefield(s, opp, serra());
      s = run(s, planCast(s, ap, ids[0]!, [player(ap), player(opp)]));
      s = settle(s);
      expect([wurm, angel].map((id) => controllerOf(s, s.objects[id]!))).toEqual([ap, ap]);
      expect([mine, elf].map((id) => controllerOf(s, s.objects[id]!))).toEqual([opp, opp]);
    });
  });
});
