// Lane B round B221: Cemetery Desecrator (entering or dying, another card exiled from a graveyard; then X counters removed
// or -X/-X, X its mana value), Terminal Velocity (an artifact or creature card put from your hand, with haste, damage to
// each creature as it leaves, and an end-step sacrifice), Callous Oppressor (an opponent chooses the creature type; tap to
// take a creature not of it while tapped) and Storyweave (+1/+1 counters, or lore counters and the next enchantment
// creatures entering with two more).

import { describe, expect, it } from "vitest";
import { act, passUntil, plainsCard, pt, putOnBattlefield, setup } from "./helpers";
import { botActions, controllerOf, objHasKeyword, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";
import { moveObject } from "../src/game";

// Real card data (Scryfall).
const desecrator = (): CardDef => ({"oracleId":"85e9a43e-5676-4d12-ac27-e8cf57307d5e","name":"Cemetery Desecrator","manaCost":"{4}{B}{B}","cmc":6,"typeLine":"Creature — Zombie","supertypes":[],"types":["Creature"],"subtypes":["Zombie"],"oracleText":"Menace\nWhen this creature enters or dies, exile another card from a graveyard. When you do, choose one —\n• Remove X counters from target permanent, where X is the mana value of the exiled card.\n• Target creature an opponent controls gets -X/-X until end of turn, where X is the mana value of the exiled card.","power":"4","toughness":"4","colors":["B"],"colorIdentity":["B"],"keywords":["Menace"],"imageUrl":"https://cards.scryfall.io/normal/front/9/8/981bb380-476c-4ab2-afbe-439fff1a2310.jpg?1783924243","artUrl":"https://cards.scryfall.io/art_crop/front/9/8/981bb380-476c-4ab2-afbe-439fff1a2310.jpg?1783924243","commanderLegal":"legal","set":"dbl","releasedAt":"2022-01-28","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const velocity = (): CardDef => ({"oracleId":"cdda2f04-d59e-4ef8-a26d-964d80750940","name":"Terminal Velocity","manaCost":"{4}{R}{R}","cmc":6,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"You may put an artifact or creature card from your hand onto the battlefield. That permanent gains haste, \"When this permanent leaves the battlefield, it deals damage equal to its mana value to each creature,\" and \"At the beginning of your end step, sacrifice this permanent.\"","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/3/d36147a8-dfcd-4d56-a98d-72fee52578d6.jpg?1783905885","artUrl":"https://cards.scryfall.io/art_crop/front/d/3/d36147a8-dfcd-4d56-a98d-72fee52578d6.jpg?1783905885","commanderLegal":"legal","set":"eoe","releasedAt":"2025-08-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const oppressor = (): CardDef => ({"oracleId":"de14f6a9-1c62-42e9-b174-3e8b1080e0dc","name":"Callous Oppressor","manaCost":"{1}{U}{U}","cmc":3,"typeLine":"Creature — Octopus","supertypes":[],"types":["Creature"],"subtypes":["Octopus"],"oracleText":"You may choose not to untap this creature during your untap step.\nAs this creature enters, an opponent chooses a creature type.\n{T}: Gain control of target creature that isn't of the chosen type for as long as this creature remains tapped.","power":"1","toughness":"2","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/3/b3dd3ce7-e0e3-4412-9983-ff933584f59b.jpg?1783945086","artUrl":"https://cards.scryfall.io/art_crop/front/b/3/b3dd3ce7-e0e3-4412-9983-ff933584f59b.jpg?1783945086","commanderLegal":"legal","set":"ons","releasedAt":"2002-10-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const storyweave = (): CardDef => ({"oracleId":"94389047-4976-4be2-aaca-25dcdc538abe","name":"Storyweave","manaCost":"{2}{G}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Choose one —\n• Put two +1/+1 counters on target creature you control.\n• Put two lore counters on target Saga you control. The next time one or more enchantment creatures you control enter this turn, each enters with two additional +1/+1 counters on it.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/0/50a77eed-aa03-43b7-b3c8-6aee4c96c648.jpg?1783923840","artUrl":"https://cards.scryfall.io/art_crop/front/5/0/50a77eed-aa03-43b7-b3c8-6aee4c96c648.jpg?1783923840","commanderLegal":"legal","set":"neo","releasedAt":"2022-02-18","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const benalia = (): CardDef => ({"oracleId":"c15bb7eb-aaaa-4468-9641-8f706d6137e8","name":"History of Benalia","manaCost":"{1}{W}{W}","cmc":3,"typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI, II — Create a 2/2 white Knight creature token with vigilance.\nIII — Knights you control get +2/+1 until end of turn.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/1/d134385d-b01c-41c7-bb2d-30722b44dc5a.jpg?1783935041","artUrl":"https://cards.scryfall.io/art_crop/front/d/1/d134385d-b01c-41c7-bb2d-30722b44dc5a.jpg?1783935041","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"mythic","layout":"saga","gameChanger":false}) as CardDef;
const courser = (): CardDef => ({"oracleId":"a9b345ea-3e34-48cf-8ab8-887c2b67df9c","name":"Nyxborn Courser","manaCost":"{1}{W}{W}","cmc":3,"typeLine":"Enchantment Creature — Centaur Scout","supertypes":[],"types":["Enchantment","Creature"],"subtypes":["Centaur","Scout"],"oracleText":"","power":"2","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/f/0fd32240-c003-4e18-adf1-e2e992c702b1.jpg?1783931593","artUrl":"https://cards.scryfall.io/art_crop/front/0/f/0fd32240-c003-4e18-adf1-e2e992c702b1.jpg?1783931593","commanderLegal":"legal","set":"thb","releasedAt":"2020-01-24","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const outcast = (): CardDef => ({"oracleId":"a61ef0cc-1da9-49f9-b0dc-01cf9f6205be","name":"Changeling Outcast","manaCost":"{B}","cmc":1,"typeLine":"Creature — Shapeshifter","supertypes":[],"types":["Creature"],"subtypes":["Shapeshifter"],"oracleText":"Changeling (This card is every creature type.)\nThis creature can't block and can't be blocked.","power":"1","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":["Changeling"],"imageUrl":"https://cards.scryfall.io/normal/front/0/8/08151d00-513a-4957-aa16-01c0f0245112.jpg?1783933130","artUrl":"https://cards.scryfall.io/art_crop/front/0/8/08151d00-513a-4957-aa16-01c0f0245112.jpg?1783933130","commanderLegal":"legal","set":"mh1","releasedAt":"2019-06-14","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const piker = (): CardDef => ({"oracleId":"50608184-90d3-43d2-a221-deb186c78323","name":"Goblin Piker","manaCost":"{1}{R}","cmc":2,"typeLine":"Creature — Goblin Warrior","supertypes":[],"types":["Creature"],"subtypes":["Goblin","Warrior"],"oracleText":"","power":"2","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/7/2786834d-dbda-40ce-82a4-e518cd554312.jpg?1783946464","artUrl":"https://cards.scryfall.io/art_crop/front/2/7/2786834d-dbda-40ce-82a4-e518cd554312.jpg?1783946464","commanderLegal":"legal","set":"p02","releasedAt":"1998-06-24","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const crawWurm = (): CardDef => ({"oracleId":"6a462a69-3e42-41de-a3aa-a488d9f38d69","name":"Craw Wurm","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Creature — Wurm","supertypes":[],"types":["Creature"],"subtypes":["Wurm"],"oracleText":"","power":"6","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/f/bfed1a95-bd67-4e16-a781-81866028af2f.jpg?1783948678","artUrl":"https://cards.scryfall.io/art_crop/front/b/f/bfed1a95-bd67-4e16-a781-81866028af2f.jpg?1783948678","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const elves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const ballista = (): CardDef => ({"oracleId":"4b515bb0-f275-4400-8032-3173b799ab40","name":"Walking Ballista","manaCost":"{X}{X}","cmc":0,"typeLine":"Artifact Creature — Construct","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Construct"],"oracleText":"This creature enters with X +1/+1 counters on it.\n{4}: Put a +1/+1 counter on this creature.\nRemove a +1/+1 counter from this creature: It deals 1 damage to any target.","power":"0","toughness":"0","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/0/50507ec0-72ff-4110-a73c-b6f256ac2e35.jpg?1783906229","artUrl":"https://cards.scryfall.io/art_crop/front/5/0/50507ec0-72ff-4110-a73c-b6f256ac2e35.jpg?1783906229","commanderLegal":"legal","set":"fic","releasedAt":"2025-06-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
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
/** Passes until someone has a question or the stack and trigger queue are empty. */
const passToQuestion = (s: GameState, max = 60) => {
  for (let i = 0; i < max && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("Lane B round B221", () => {
  it("compiles all four cards", () => {
    supported(desecrator(), velocity(), oppressor(), storyweave());
  });

  describe("Cemetery Desecrator", () => {
    it("entering, exiles another card of your choice from any graveyard; then -X/-X to an opponent's creature, X its mana value", () => {
      const { s: s0, ap, opp, ids } = setup([desecrator()]);
      const wurm = toZone(s0, opp, crawWurm(), "graveyard");
      const elf = toZone(s0, ap, elves(), "graveyard");
      const giant = putOnBattlefield(s0, opp, hillGiant());
      let s = run(s0, planCast(s0, ap, ids[0]!));
      s = passToQuestion(s);
      // Not a target: chosen as the trigger resolves, from any graveyard.
      expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, anyGraveyard: true });
      if (s.pending?.kind !== "searchLibrary") throw new Error("no pick");
      expect(s.pending.cards).toEqual(expect.arrayContaining([wurm, elf]));
      s = act(s, { type: "searchLibrary", player: ap, found: [wurm] });
      expect(zone(s, wurm)).toBe("exile");
      // The reflexive trigger: its mode and target chosen now, once the card is exiled (rulings).
      s = passToQuestion(s);
      expect(s.pending).toMatchObject({ kind: "chooseModes", player: ap });
      s = act(s, { type: "chooseModes", player: ap, modes: [1] });
      expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
      s = act(s, { type: "chooseTargets", player: ap, targets: [card(giant)] });
      s = passToQuestion(s);
      // Craw Wurm's mana value is 6: Hill Giant gets -6/-6 and dies.
      expect(zone(s, giant)).toBe("graveyard");
      expect(zone(s, elf)).toBe("graveyard");
    });

    it("removes X counters of your choice from target permanent, all of them with fewer than X", () => {
      const { s: s0, ap, opp, ids } = setup([desecrator()]);
      const elf = toZone(s0, opp, elves(), "graveyard");
      const giant = putOnBattlefield(s0, opp, hillGiant());
      s0.objects[giant]!.counters = { "+1/+1": 3 };
      const wurm = putOnBattlefield(s0, ap, crawWurm());
      s0.objects[wurm]!.counters = { "-1/-1": 1 };
      invalidateCharacteristics(s0);
      let s = run(s0, planCast(s0, ap, ids[0]!));
      s = passToQuestion(s);
      // The only other card in a graveyard: exiled with no question, or picked.
      if (s.pending?.kind === "searchLibrary") s = act(s, { type: "searchLibrary", player: ap, found: [elf] });
      expect(zone(s, elf)).toBe("exile");
      s = passToQuestion(s);
      s = act(s, { type: "chooseModes", player: ap, modes: [0] });
      s = act(s, { type: "chooseTargets", player: ap, targets: [card(giant)] });
      s = passToQuestion(s);
      for (let i = 0; i < 5 && s.pending && s.pending.player === ap; i++) s = run(s, botActions(s, ap));
      // Llanowar Elves's mana value is 1: one of the three counters.
      expect(s.objects[giant]!.counters["+1/+1"]).toBe(2);
      // With X greater than the counters there, all of them (rulings).
      expect(s.objects[wurm]!.counters["-1/-1"]).toBe(1);
    });

    it("dying, can't exile itself: with no other card in a graveyard nothing is exiled and nothing more triggers", () => {
      const { s: s0, ap, opp } = setup([]);
      const d = putOnBattlefield(s0, ap, desecrator());
      const giant = putOnBattlefield(s0, opp, hillGiant());
      for (const p of s0.turnOrder) for (const id of [...s0.players[p]!.graveyard]) {
        s0.players[p]!.graveyard = [];
        delete s0.objects[id];
      }
      s0.objects[d]!.damage = 4;
      invalidateCharacteristics(s0);
      let s = act(s0, { type: "passPriority", player: waitingOn(s0)! });
      s = passToQuestion(s);
      expect(zone(s, d)).toBe("graveyard");
      expect(s.pending).toBeFalsy();
      expect(s.stack).toHaveLength(0);
      expect(zone(s, giant)).toBe("battlefield");
    });

    it("dying, exiles another card, not its own: the reflexive ability uses that card's mana value", () => {
      const { s: s0, ap, opp } = setup([]);
      const d = putOnBattlefield(s0, ap, desecrator());
      const giant = putOnBattlefield(s0, opp, hillGiant());
      const elf = toZone(s0, opp, elves(), "graveyard");
      s0.objects[d]!.damage = 4;
      invalidateCharacteristics(s0);
      let s = act(s0, { type: "passPriority", player: waitingOn(s0)! });
      s = passToQuestion(s);
      if (s.pending?.kind === "searchLibrary") {
        expect(s.pending.cards).not.toContain(d);
        s = act(s, { type: "searchLibrary", player: ap, found: [elf] });
      }
      expect(zone(s, d)).toBe("graveyard");
      expect(zone(s, elf)).toBe("exile");
      s = passToQuestion(s);
      s = act(s, { type: "chooseModes", player: ap, modes: [1] });
      s = act(s, { type: "chooseTargets", player: ap, targets: [card(giant)] });
      s = passToQuestion(s);
      // -1/-1: Hill Giant is a 2/2 until end of turn.
      expect(zone(s, giant)).toBe("battlefield");
      expect(pt(s, giant)).toBe("2/2");
    });
  });

  describe("Terminal Velocity", () => {
    /** Casts Terminal Velocity with `defs` in hand and puts the first one onto the battlefield. */
    const velocityWith = (defs: CardDef[]) => {
      const { s: s0, ap, opp, ids } = setup([velocity(), ...defs]);
      const giant = putOnBattlefield(s0, opp, hillGiant());
      const elf = putOnBattlefield(s0, ap, elves());
      let s = run(s0, planCast(s0, ap, ids[0]!));
      s = passToQuestion(s);
      return { s, ap, opp, ids, giant, elf };
    };

    it("puts an artifact or creature card from your hand with haste; at your end step it's sacrificed and deals its mana value to each creature", () => {
      let { s, ap, ids, giant, elf } = velocityWith([crawWurm(), lightningBolt()]);
      const [, wurm, bolt] = ids;
      expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, fromHand: true, min: 0 });
      if (s.pending?.kind !== "searchLibrary") throw new Error("no pick");
      expect(s.pending.cards).toContain(wurm);
      expect(s.pending.cards).not.toContain(bolt);
      s = act(s, { type: "searchLibrary", player: ap, found: [wurm!] });
      s = passToQuestion(s);
      expect(zone(s, wurm!)).toBe("battlefield");
      expect(objHasKeyword(s, s.objects[wurm!]!, "Haste")).toBe(true);
      // Still there in the main phase; at your end step it's sacrificed, and leaving it deals 6 to each creature.
      s = passUntil(s, "end", ap);
      s = passToQuestion(s);
      expect(zone(s, wurm!)).toBe("graveyard");
      expect(zone(s, giant)).toBe("graveyard");
      expect(zone(s, elf)).toBe("graveyard");
    });

    it("an artifact too: Sol Ring is sacrificed at your end step and deals its mana value, 1, to each creature", () => {
      let { s, ap, ids, giant, elf } = velocityWith([solRing()]);
      const ring = ids[1]!;
      s = act(s, { type: "searchLibrary", player: ap, found: [ring] });
      s = passToQuestion(s);
      expect(zone(s, ring)).toBe("battlefield");
      s = passUntil(s, "end", ap);
      s = passToQuestion(s);
      expect(zone(s, ring)).toBe("graveyard");
      expect(zone(s, elf)).toBe("graveyard");
      expect(zone(s, giant)).toBe("battlefield");
      expect(s.objects[giant]!.damage).toBe(1);
    });

    it("a bot doesn't cast it (its own creatures and card would go)", () => {
      let { s, ap, ids } = setup([velocity(), crawWurm()]);
      for (let i = 0; i < 60 && s.step === "main1"; i++) {
        const pid = s.pending?.player ?? waitingOn(s)!;
        for (const a of botActions(s, pid)) s = act(s, a);
      }
      expect(zone(s, ids[0]!)).toBe("hand");
      expect(s.activePlayer === ap || s.step !== "main1").toBe(true);
    });

    it("you may put nothing", () => {
      let { s, ap, ids } = velocityWith([crawWurm()]);
      s = act(s, { type: "searchLibrary", player: ap, found: [] });
      s = passToQuestion(s);
      expect(zone(s, ids[1]!)).toBe("hand");
      expect(zone(s, ids[0]!)).toBe("graveyard");
    });
  });

  describe("Callous Oppressor", () => {
    /** Casts Callous Oppressor; you choose `opp`, who chooses `type`. */
    const oppress = (type: string) => {
      const { s: s0, ap, opp, ids } = setup([oppressor()]);
      const giant = putOnBattlefield(s0, opp, hillGiant());
      const goblin = putOnBattlefield(s0, opp, piker());
      const changeling = putOnBattlefield(s0, opp, outcast());
      let s = run(s0, planCast(s0, ap, ids[0]!));
      s = passToQuestion(s);
      // Its controller chooses the opponent, then that opponent chooses the type, as it enters.
      expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "player" });
      if (s.pending?.kind !== "chooseOption") throw new Error("no choice");
      expect(s.pending.options).not.toContain(String(ap));
      s = act(s, { type: "chooseOption", player: ap, choice: String(opp) });
      expect(s.pending).toMatchObject({ kind: "chooseOption", player: opp, what: "creatureType" });
      expect(() => act(s, { type: "chooseOption", player: ap, choice: type })).toThrow();
      s = act(s, { type: "chooseOption", player: opp, choice: type });
      s = passToQuestion(s);
      return { s, ap, opp, oppressor: ids[0]!, giant, goblin, changeling };
    };

    it("an opponent you choose chooses the type; tapping it takes a creature not of that type for as long as it stays tapped", () => {
      let { s, ap, opp, oppressor: o, giant, goblin, changeling } = oppress("Goblin");
      expect(s.objects[o]!.chosen?.type).toBe("Goblin");
      s.objects[o]!.controlledSinceTurn = -1;
      // Not a Goblin, and not a changeling, which is every type (CR 702.73a).
      expect(() => run(s, planActivate(s, ap, o, 0, [card(goblin)]))).toThrow();
      expect(() => run(s, planActivate(s, ap, o, 0, [card(changeling)]))).toThrow();
      s = run(s, planActivate(s, ap, o, 0, [card(giant)]));
      s = passToQuestion(s);
      expect(controllerOf(s, s.objects[giant]!)).toBe(ap);
      // Kept tapped in your untap step (you may choose not to untap it), you keep the creature.
      const toUntap = (st: GameState, keep: boolean) => {
        for (let i = 0; i < 3000 && !(st.step === "upkeep" && st.activePlayer === ap); i++) {
          const pend = st.pending;
          const pid = waitingOn(st)!;
          if (pend?.kind === "pickPermanents" && pend.action === "keepTapped") st = act(st, { type: "pickPermanents", player: pid, ids: keep && pid === ap ? [o] : [] });
          else if (pend?.kind === "declareAttackers") st = act(st, { type: "declareAttackers", player: pid, attacks: [] });
          else if (pend?.kind === "declareBlockers") st = act(st, { type: "declareBlockers", player: pid, blocks: [] });
          else if (pend?.kind === "discardToHandSize") st = act(st, { type: "discard", player: pid, objectIds: st.players[pid]!.hand.slice(0, pend.count) });
          else if (pend) st = run(st, botActions(st, pend.player));
          else st = act(st, { type: "passPriority", player: pid });
        }
        return st;
      };
      s = toUntap(s, true);
      expect(s.objects[o]!.tapped).toBe(true);
      expect(controllerOf(s, s.objects[giant]!)).toBe(ap);
      // Untapped the next time, the control ends (CR 611.2b).
      s = passUntil(s, "main1", ap);
      s = toUntap(s, false);
      expect(s.objects[o]!.tapped).toBe(false);
      expect(controllerOf(s, s.objects[giant]!)).toBe(opp);
    });

    it("a bot choosing the type picks the one most of its own creatures have", () => {
      const { s: s0, ap, opp, ids } = setup([oppressor()]);
      putOnBattlefield(s0, opp, piker());
      putOnBattlefield(s0, opp, piker());
      putOnBattlefield(s0, opp, hillGiant());
      let s = run(s0, planCast(s0, ap, ids[0]!));
      s = passToQuestion(s);
      s = act(s, { type: "chooseOption", player: ap, choice: String(opp) });
      expect(s.pending).toMatchObject({ kind: "chooseOption", player: opp, what: "creatureType" });
      s = run(s, botActions(s, opp));
      expect(["Goblin", "Warrior"]).toContain(s.objects[ids[0]!]!.chosen?.type);
    });
  });

  describe("Storyweave", () => {
    it("two lore counters on your Saga (its chapters trigger); then the next enchantment creatures entering this turn get two more +1/+1 counters", () => {
      const { s: s0, ap, ids } = setup([storyweave(), courser(), courser(), elves()]);
      putOnBattlefield(s0, ap, plainsCard);
      putOnBattlefield(s0, ap, plainsCard);
      const saga = putOnBattlefield(s0, ap, benalia());
      s0.objects[saga]!.counters = { lore: 1 };
      invalidateCharacteristics(s0);
      let s = run(s0, planCast(s0, ap, ids[0]!, [card(saga)], [1]));
      s = passToQuestion(s);
      for (let i = 0; i < 20 && (s.pending || s.stack.length || s.triggerQueue.length); i++) {
        if (s.pending) s = run(s, botActions(s, s.pending.player));
        else s = act(s, { type: "passPriority", player: waitingOn(s)! });
      }
      // Chapters II and III triggered: a Knight, then +2/+1 for Knights; the Saga is sacrificed after III.
      expect(zone(s, saga)).toBe("graveyard");
      // A creature that isn't an enchantment doesn't use it up.
      s = run(s, planCast(s, ap, ids[3]!));
      s = passToQuestion(s);
      expect(s.objects[ids[3]!]!.counters["+1/+1"] ?? 0).toBe(0);
      s = run(s, planCast(s, ap, ids[1]!));
      s = passToQuestion(s);
      expect(s.objects[ids[1]!]!.counters["+1/+1"]).toBe(2);
      // Only the next time: the second one enters with none.
      s = run(s, planCast(s, ap, ids[2]!));
      s = passToQuestion(s);
      expect(s.objects[ids[2]!]!.counters["+1/+1"] ?? 0).toBe(0);
    });

    it("this turn only, and only for its controller's", () => {
      const { s: s0, ap, opp, ids } = setup([storyweave()]);
      const saga = putOnBattlefield(s0, ap, benalia());
      s0.objects[saga]!.counters = { lore: 1 };
      invalidateCharacteristics(s0);
      let s = run(s0, planCast(s0, ap, ids[0]!, [card(saga)], [1]));
      for (let i = 0; i < 40 && (s.pending || s.stack.length || s.triggerQueue.length); i++) {
        if (s.pending) s = run(s, botActions(s, s.pending.player));
        else s = act(s, { type: "passPriority", player: waitingOn(s)! });
      }
      expect(s.nextEntersCounters).toHaveLength(1);
      // An opponent's enchantment creature entering doesn't get them.
      const theirs = toZone(s, opp, courser(), "hand");
      moveObject(s, theirs, "battlefield");
      expect(zone(s, theirs)).toBe("battlefield");
      expect(s.objects[theirs]!.counters["+1/+1"] ?? 0).toBe(0);
      expect(s.nextEntersCounters).toHaveLength(1);
      s = passUntil(s, "upkeep");
      expect(s.nextEntersCounters ?? []).toHaveLength(0);
    });

    it("the first mode: two +1/+1 counters on target creature you control", () => {
      const { s: s0, ap, ids } = setup([storyweave()]);
      const elf = putOnBattlefield(s0, ap, elves());
      let s = run(s0, planCast(s0, ap, ids[0]!, [card(elf)], [0]));
      s = passToQuestion(s);
      expect(s.objects[elf]!.counters["+1/+1"]).toBe(2);
      expect(s.nextEntersCounters ?? []).toHaveLength(0);
    });
  });
});
