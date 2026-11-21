// Lane B round B289: Parnesse, the Subtle Brush: Unsettled Mariner's trigger paid with 4 life ("that player", CR 119.4), and
// "Whenever you copy a spell, up to one target opponent may also copy that spell. They may choose new targets for that
// copy." (a copy put on the stack under your control, CR 707.10; that player copies it and chooses its new targets, CR 707.10c).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { botActions, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const parnesse = (): CardDef => ({"oracleId":"c6040e8d-dac3-4bed-8d1d-d7d44aa10c86","name":"Parnesse, the Subtle Brush","manaCost":"{2}{U}{B}{R}","cmc":5,"typeLine":"Legendary Creature — Vampire Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Vampire","Wizard"],"oracleText":"Whenever you or a permanent you control becomes the target of a spell or ability an opponent controls, counter that spell or ability unless that player pays 4 life.\nWhenever you copy a spell, up to one target opponent may also copy that spell. They may choose new targets for that copy.","power":"4","toughness":"4","colors":["B","R","U"],"colorIdentity":["B","R","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/6/36458554-b8b8-4768-a138-eba615b480af.jpg?1783923379","artUrl":"https://cards.scryfall.io/art_crop/front/3/6/36458554-b8b8-4768-a138-eba615b480af.jpg?1783923379","commanderLegal":"legal","set":"ncc","releasedAt":"2022-04-29","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const twincast = (): CardDef => ({"oracleId":"8f878efc-850f-43d2-a6fe-5ea8d1dd5afb","name":"Twincast","manaCost":"{U}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Copy target instant or sorcery spell. You may choose new targets for the copy.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/a/1a367559-1d84-4f6f-9e6e-ff90de420389.jpg?1783944159","artUrl":"https://cards.scryfall.io/art_crop/front/1/a/1a367559-1d84-4f6f-9e6e-ff90de420389.jpg?1783944159","commanderLegal":"legal","set":"sok","releasedAt":"2005-06-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty or a question is asked; bots answer the questions of anyone but `me`. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && me !== undefined && p.player === me) return s;
    if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const obj = (id: string): TargetChoice => ({ kind: "object", id });
const plr = (id: PlayerId): TargetChoice => ({ kind: "player", id });

describe("Lane B round B289: Parnesse, the Subtle Brush", () => {
  it("is fully supported", () => supported(parnesse()));

  describe("becoming the target of an opponent's spell", () => {
    /** `opp` controls Parnesse and Grizzly Bears; `ap`, an opponent of theirs, has Lightning Bolt. */
    const game = () => {
      const { s, ap, ids, opp } = setup([lightningBolt()]);
      putOnBattlefield(s, opp, parnesse());
      const bears = putOnBattlefield(s, opp, grizzlyBears());
      return { s, ap, opp, bolt: ids[0]!, bears };
    };

    it("counters it unless that player pays 4 life", () => {
      const { s: s0, ap, opp, bolt, bears } = game();
      let s = settle(run(s0, planCast(s0, ap, bolt, [obj(bears)])), ap);
      const p = s.pending;
      expect(p?.kind).toBe("payUnless");
      if (p?.kind !== "payUnless") return;
      expect(p.player).toBe(ap);
      expect(p.life).toBe(4);
      s = act(s, { type: "payUnless", player: ap, pay: true });
      s = settle(s, ap);
      expect(s.players[ap]!.life).toBe(s0.players[ap]!.life - 4);
      expect(zone(s, bears)).toBe("graveyard");
      // Not paying: countered.
      const g = game();
      let t = settle(run(g.s, planCast(g.s, g.ap, g.bolt, [obj(g.bears)])), g.ap);
      t = act(t, { type: "payUnless", player: g.ap, pay: false });
      t = settle(t, g.ap);
      expect(zone(t, g.bears)).toBe("battlefield");
      expect(zone(t, g.bolt)).toBe("graveyard");
      expect(t.players[g.ap]!.life).toBe(g.s.players[g.ap]!.life);
      expect(opp).toBe(g.opp);
    });

    it("targeting the player triggers it too; a player with less than 4 life can't pay (CR 119.4)", () => {
      const { s: s0, ap, opp, bolt } = game();
      s0.players[ap]!.life = 3;
      let s = settle(run(s0, planCast(s0, ap, bolt, [plr(opp)])), ap);
      expect(s.pending?.kind === "payUnless" && s.pending.life).toBe(4);
      expect(() => act(s, { type: "payUnless", player: ap, pay: true })).toThrow();
      s = settle(act(s, { type: "payUnless", player: ap, pay: false }), ap);
      expect(s.players[opp]!.life).toBe(s0.players[opp]!.life);
      expect(s.players[ap]!.life).toBe(3);
      expect(zone(s, bolt)).toBe("graveyard");
    });

    it("its controller's own spells don't trigger it", () => {
      const { s: s0, ap, bolt } = game();
      putOnBattlefield(s0, ap, parnesse());
      const mine = putOnBattlefield(s0, ap, grizzlyBears());
      const s = settle(run(s0, planCast(s0, ap, bolt, [obj(mine)])), ap);
      expect(s.pending).toBeNull();
      expect(zone(s, mine)).toBe("graveyard");
      expect(s.players[ap]!.life).toBe(s0.players[ap]!.life);
    });
  });

  describe("copying a spell", () => {
    /** `ap` controls Parnesse and has Lightning Bolt and Twincast; each opponent has Grizzly Bears. */
    const game = () => {
      const { s, ap, ids, opp } = setup([lightningBolt(), twincast()]);
      putOnBattlefield(s, ap, parnesse());
      const bears = s.turnOrder.filter((x) => x !== ap).map((q) => putOnBattlefield(s, q, grizzlyBears()));
      return { s, ap, opp, bolt: ids[0]!, twin: ids[1]!, bears };
    };

    it("the opponent targeted may copy the spell copied and choose new targets for their copy", () => {
      const { s: s0, ap, opp, bolt, twin, bears } = game();
      let s = run(s0, planCast(s0, ap, bolt, [obj(bears[0]!)]));
      const boltItem = s.stack[s.stack.length - 1]!.id;
      s = run(s, planCast(s, ap, twin, [{ kind: "stack", id: boltItem }]));
      s = settle(s, ap);
      // Twincast resolves: our copy, its targets unchanged.
      let p = s.pending;
      expect(p?.kind).toBe("copyTargets");
      s = act(s, { type: "copyTargets", player: ap, targets: [obj(bears[1]!)] });
      // Parnesse's trigger: up to one target opponent.
      s = settle(s, ap);
      p = s.pending;
      expect(p?.kind).toBe("chooseTargets");
      if (p?.kind !== "chooseTargets") return;
      expect(p.specs[0]).toMatchObject({ kind: "player", opponent: true, optional: true });
      s = act(s, { type: "chooseTargets", player: ap, targets: [plr(opp)] });
      s = settle(s, opp);
      p = s.pending;
      expect(p?.kind === "chooseMay" && p.player).toBe(opp);
      s = act(s, { type: "chooseMay", player: opp, yes: true });
      p = s.pending;
      expect(p?.kind === "copyTargets" && p.player).toBe(opp);
      s = act(s, { type: "copyTargets", player: opp, targets: [obj(bears[2]!)] });
      // Their copy is theirs, of Lightning Bolt (not of our copy), on top.
      const top = s.stack[s.stack.length - 1]!;
      expect(top.copy).toBe(true);
      expect(top.controller).toBe(opp);
      expect(top.description).toBe("Lightning Bolt (copy)");
      expect(top.targets?.[0]).toMatchObject({ kind: "object", id: bears[2] });
      s = settle(s, ap);
      for (const b of bears) expect(zone(s, b)).toBe("graveyard");
    });

    it("no opponent targeted, or one who declines: no copy", () => {
      const { s: s0, ap, opp, bolt, twin, bears } = game();
      let s = run(s0, planCast(s0, ap, bolt, [obj(bears[0]!)]));
      s = run(s, planCast(s, ap, twin, [{ kind: "stack", id: s.stack[s.stack.length - 1]!.id }]));
      s = settle(s, ap);
      s = act(s, { type: "copyTargets", player: ap });
      s = settle(s, ap);
      s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "none" }] });
      s = settle(s, ap);
      expect(s.pending).toBeNull();
      expect(s.log.filter((l) => l.text.includes("copies Lightning Bolt")).length).toBe(1);
      // Declining.
      const g = game();
      let t = run(g.s, planCast(g.s, g.ap, g.bolt, [obj(g.bears[0]!)]));
      t = run(t, planCast(t, g.ap, g.twin, [{ kind: "stack", id: t.stack[t.stack.length - 1]!.id }]));
      t = settle(t, g.ap);
      t = act(t, { type: "copyTargets", player: g.ap });
      t = settle(t, g.ap);
      t = act(t, { type: "chooseTargets", player: g.ap, targets: [plr(opp)] });
      t = settle(t, opp);
      t = act(t, { type: "chooseMay", player: opp, yes: false });
      t = settle(t, g.ap);
      expect(t.log.filter((l) => l.text.includes("copies Lightning Bolt")).length).toBe(1);
    });

    it("a bot targeted copies it, once even with a Parnesse of its own; a bot with Parnesse gives no opponent a copy", () => {
      const { s: s0, ap, opp, bolt, twin, bears } = game();
      putOnBattlefield(s0, opp, parnesse());
      let s = run(s0, planCast(s0, ap, bolt, [obj(bears[0]!)]));
      s = run(s, planCast(s, ap, twin, [{ kind: "stack", id: s.stack[s.stack.length - 1]!.id }]));
      s = settle(s, ap);
      s = act(s, { type: "copyTargets", player: ap });
      s = settle(s, ap);
      s = act(s, { type: "chooseTargets", player: ap, targets: [plr(opp)] });
      for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
        const p = s.pending;
        // Our own Parnesse triggers again for nothing (the opponent's copy isn't ours); answer as a bot would.
        if (p) for (const a of botActions(s, p.player)) s = act(s, a);
        else s = act(s, { type: "passPriority", player: waitingOn(s)! });
      }
      expect(s.stack.length).toBe(0);
      expect(s.pending).toBeNull();
      const theirs = s.log.filter((l) => l.text.startsWith(`${s.players[opp]!.name} copies Lightning Bolt`)).length;
      expect(theirs).toBe(1);
      expect(s.log.filter((l) => l.text.includes("copies Lightning Bolt")).length).toBeLessThan(6);
    });
  });
});
