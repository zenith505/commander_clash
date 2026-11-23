// Round 456 (Lane A): Chef's Kiss ("Gain control of target spell that targets only a single permanent or player. Copy it,
// then reselect the targets at random for the spell and the copy. The new targets can't be you or a permanent you
// control."): control of a spell, a copy of it (CR 707.10), then each target reselected at random among the legal ones that
// aren't you or yours, the one it had among them (rulings).

import { describe, expect, it } from "vitest";
import { act, bear, mountain, putOnBattlefield, setup } from "./helpers";
import { invalidateCharacteristics } from "../src/layers";
import { applyAction, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";
import { legalTargets } from "../src/effects/targeting";

// Real card data (Scryfall).
const kiss = (): CardDef => ({"oracleId":"3d177c04-9aa3-44b8-bbe4-df5de23a4ce6","name":"Chef's Kiss","manaCost":"{1}{R}{R}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Gain control of target spell that targets only a single permanent or player. Copy it, then reselect the targets at random for the spell and the copy. The new targets can't be you or a permanent you control.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/9/c936ebbd-512a-49a6-ab23-16ac34b4a3a9.jpg?1783926847","artUrl":"https://cards.scryfall.io/art_crop/front/c/9/c936ebbd-512a-49a6-ab23-16ac34b4a3a9.jpg?1783926847","commanderLegal":"legal","set":"mh2","releasedAt":"2021-06-18","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const staff = (): CardDef => ({"oracleId":"3ca8113b-f5b8-41a7-aae6-ebb32554dfe3","name":"Twinning Staff","manaCost":"{3}","cmc":3,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"If you would copy a spell one or more times, instead copy it that many times plus an additional time. You may choose new targets for the additional copy.\n{7}, {T}: Copy target instant or sorcery spell you control. You may choose new targets for the copy.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/7/e7971306-700e-4677-bf52-83e4f9ac04c1.jpg?1783931206","artUrl":"https://cards.scryfall.io/art_crop/front/e/7/e7971306-700e-4677-bf52-83e4f9ac04c1.jpg?1783931206","commanderLegal":"legal","set":"c20","releasedAt":"2020-04-17","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const arcTrail = (): CardDef => ({"oracleId":"f1c26b25-371e-4fbf-a43d-7fd59a364d3a","name":"Arc Trail","manaCost":"{1}{R}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Arc Trail deals 2 damage to any target and 1 damage to any other target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/4/445e3a0a-29a7-4dc0-80fe-569b9e751db3.jpg?1783941727","artUrl":"https://cards.scryfall.io/art_crop/front/4/4/445e3a0a-29a7-4dc0-80fe-569b9e751db3.jpg?1783941727","commanderLegal":"legal","set":"som","releasedAt":"2010-10-01","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const leyline = (): CardDef => ({"oracleId":"492e0e6c-8c27-4376-938b-f8a8b6205810","name":"Leyline of Sanctity","manaCost":"{2}{W}{W}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"If this card is in your opening hand, you may begin the game with it on the battlefield.\nYou have hexproof. (You can't be the target of spells or abilities your opponents control.)","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/e/be8b1acf-dd87-42ca-ad19-c27d21066030.jpg?1783933025","artUrl":"https://cards.scryfall.io/art_crop/front/b/e/be8b1acf-dd87-42ca-ad19-c27d21066030.jpg?1783933025","commanderLegal":"legal","set":"m20","releasedAt":"2019-07-12","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false} as CardDef);

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until `pid` has priority (nothing resolves on the way: each of the others passes once). */
const passTo = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 4 && waitingOn(s) !== pid && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  expect(waitingOn(s)).toBe(pid);
  return s;
};
/** Everyone passes until Chef's Kiss has resolved (or a question comes up), and no further. */
const resolveTop = (s: GameState) => {
  for (let i = 0; i < 20 && s.stack.some((x) => x.description.startsWith("Chef's Kiss")) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
function inHand(s: GameState, pid: PlayerId, def: CardDef): ObjectId {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
}
const log = (s: GameState) => s.log.map((e) => e.text).join("\n");
const key = (t: TargetChoice | undefined) => (t?.kind === "player" ? `p${t.id}` : t?.kind === "object" ? t.id : "none");

/**
 * The active player (A) holds `spell` and casts it with `targets`; C, two seats on, holds Chef's Kiss and three Mountains
 * and gets priority with the spell on the stack.
 */
function scene(spell: CardDef, seed = 5, extra: (s: GameState, ids: { ap: PlayerId; opp: PlayerId; c: PlayerId }) => TargetChoice[] = () => []) {
  const { s: s0, ap, opp, ids } = setup([spell], seed);
  const c = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
  for (let i = 0; i < 3; i++) putOnBattlefield(s0, c, mountain);
  const k = inHand(s0, c, kiss());
  const targets = extra(s0, { ap, opp, c });
  let s = run(s0, planCast(s0, ap, ids[0]!, targets));
  s = passTo(s, c);
  return { s, ap, opp, c, k, spell: s.stack[s.stack.length - 1]! };
}

describe("round 456: the card compiles", () => {
  it("is fully supported", () => {
    expect(isFullySupported(kiss())).toBe(true);
  });
});

describe("round 456: Chef's Kiss", () => {
  it("takes the spell, copies it, and reselects both targets at random, never you or yours", () => {
    const seen = new Set<string>();
    let kept = 0;
    for (let seed = 1; seed <= 24; seed++) {
      let bBear = "";
      let cBear = "";
      let { s, ap, c, k, spell } = scene(bolt(), seed, (st, p) => {
        bBear = putOnBattlefield(st, p.opp, bear());
        cBear = putOnBattlefield(st, p.c, bear());
        return [{ kind: "object", id: bBear }];
      });
      s = run(s, planCast(s, c, k, [{ kind: "stack", id: spell.id }]));
      s = resolveTop(s);
      expect(s.pending ?? undefined).toBeUndefined();
      const orig = s.stack.find((x) => x.id === spell.id)!;
      const copy = s.stack.find((x) => x.copy)!;
      // You control the spell and its copy (CR 707.10).
      expect(orig.controller).toBe(c);
      expect(copy.controller).toBe(c);
      expect(copy.description).toBe("Lightning Bolt (copy)");
      for (const item of [orig, copy]) {
        const t = item.targets![0]!;
        expect(t.kind === "player" && t.id === c).toBe(false);
        expect(t.kind === "object" && t.id === cBear).toBe(false);
        // Among the Bolt's legal targets.
        expect(legalTargets(s, { kind: "any", text: "any target" }, c).some((x) => key(x) === key(t))).toBe(true);
        seen.add(key(t));
        if (key(t) === bBear) kept++;
      }
      expect(log(s)).toMatch(/Chef's Kiss reselects the target of Lightning Bolt (\(copy\) )?at random/);
      void ap;
    }
    // The one it had is among the choices (rulings: the legal targets that could be selected), and so are others.
    expect(kept).toBeGreaterThan(0);
    expect(seen.size).toBeGreaterThan(2);
  });

  it("keeps a target that has no other legal one besides you and yours, and both spells resolve", () => {
    let bBear = "";
    let { s, c, k, spell } = scene(bolt(), 5, (st, p) => {
      bBear = putOnBattlefield(st, p.opp, bear());
      // Every player but C has hexproof, and B's Bears are the only creature not C's: the Bolt can only go there or to C.
      for (const pid of st.turnOrder) if (pid !== p.c) putOnBattlefield(st, pid, leyline());
      putOnBattlefield(st, p.c, bear());
      return [{ kind: "object", id: bBear }];
    });
    void c;
    s = run(s, planCast(s, c, k, [{ kind: "stack", id: spell.id }]));
    s = resolveTop(s);
    const copy = s.stack.find((x) => x.copy)!;
    expect(key(copy.targets![0])).toBe(bBear);
    expect(key(s.stack.find((x) => x.id === spell.id)!.targets![0])).toBe(bBear);
    s = settle(s);
    // The copy kills the Bears; the original's target is gone, so it does nothing.
    expect(s.objects[bBear]!.zone).toBe("graveyard");
  });

  it("leaves the target unchanged when there's no legal target but you (rulings: Lava Spike still hits you)", () => {
    let { s, c, k, spell } = scene(bolt(), 5, (st, p) => {
      for (const pid of st.turnOrder) if (pid !== p.c) putOnBattlefield(st, pid, leyline());
      return [{ kind: "player", id: p.c }];
    });
    const life = s.players[c]!.life;
    s = run(s, planCast(s, c, k, [{ kind: "stack", id: spell.id }]));
    s = resolveTop(s);
    for (const item of s.stack.filter((x) => x.description.startsWith("Lightning Bolt"))) expect(key(item.targets![0])).toBe(`p${c}`);
    expect(log(s)).toMatch(/it stays/);
    s = settle(s);
    expect(s.players[c]!.life).toBe(life - 6);
  });

  it("can't target a spell with two different targets or none", () => {
    let { s, c, k, spell } = scene(arcTrail(), 5, (st, p) => {
      const g = putOnBattlefield(st, p.opp, giant());
      return [{ kind: "object", id: g }, { kind: "player", id: p.opp }];
    });
    expect(planCast(s, c, k, [{ kind: "stack", id: spell.id }])).toBeNull();
    void s;
  });

  it("with Twinning Staff, the additional copy gets new targets chosen and only the original copy is reselected", () => {
    let bBear = "";
    let { s, c, k, spell } = scene(bolt(), 5, (st, p) => {
      bBear = putOnBattlefield(st, p.opp, bear());
      putOnBattlefield(st, p.c, staff());
      return [{ kind: "object", id: bBear }];
    });
    s = run(s, planCast(s, c, k, [{ kind: "stack", id: spell.id }]));
    s = resolveTop(s);
    expect(s.pending).toMatchObject({ kind: "copyTargets", player: c });
    s = act(s, { type: "copyTargets", player: c, targets: [{ kind: "player", id: c }] } as Action);
    expect(s.pending ?? undefined).toBeUndefined();
    const copies = s.stack.filter((x) => x.copy);
    expect(copies.length).toBe(2);
    // The additional copy (Twinning Staff) keeps the target its controller chose, even C (it isn't "the copy").
    expect(key(copies[1]!.targets![0])).toBe(`p${c}`);
    expect(key(copies[0]!.targets![0])).not.toBe(`p${c}`);
  });
});
