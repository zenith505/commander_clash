// Round 429: Bloodthirsty Adversary: "you may pay {2}{R} any number of times. When you pay this cost one or more times, put
// that many +1/+1 counters on this creature, then exile up to that many target instant and/or sorcery cards with mana value
// 3 or less from your graveyard and copy them. You may cast any number of the copies without paying their mana costs." (a
// reflexive trigger, CR 603.12; copies cast as it resolves, CR 608.2g, 707.12).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { applyAction, characteristics, compileCard, isFullySupported, moveObject, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const adversary = (): CardDef => ({"oracleId":"3b943c3e-1f18-4997-b6d0-28ef75aed88e","name":"Bloodthirsty Adversary","manaCost":"{1}{R}","cmc":2,"typeLine":"Creature — Vampire","supertypes":[],"types":["Creature"],"subtypes":["Vampire"],"oracleText":"Haste\nWhen this creature enters, you may pay {2}{R} any number of times. When you pay this cost one or more times, put that many +1/+1 counters on this creature, then exile up to that many target instant and/or sorcery cards with mana value 3 or less from your graveyard and copy them. You may cast any number of the copies without paying their mana costs.","power":"2","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":["Haste"],"imageUrl":"https://cards.scryfall.io/normal/front/8/2/82e54e38-593d-455d-b206-d95dbaabf68f.jpg?1783924400","artUrl":"https://cards.scryfall.io/art_crop/front/8/2/82e54e38-593d-455d-b206-d95dbaabf68f.jpg?1783924400","commanderLegal":"legal","set":"dbl","releasedAt":"2022-01-28","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const fireball = (): CardDef => ({"oracleId":"aa7714b0-2bfb-458a-8ebf-37ec2c53383e","name":"Fireball","manaCost":"{X}{R}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"This spell costs {1} more to cast for each target beyond the first.\nFireball deals X damage divided evenly, rounded down, among any number of targets.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/2/82a97aae-d8a7-4451-a47e-ea878dea6e4c.jpg?1783922638","artUrl":"https://cards.scryfall.io/art_crop/front/8/2/82a97aae-d8a7-4451-a47e-ea878dea6e4c.jpg?1783922638","commanderLegal":"legal","set":"clb","releasedAt":"2022-06-10","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const ogre = (): CardDef => ({"oracleId":"83c8a3a6-2e1a-4e26-8847-6d066f42d906","name":"Gray Ogre","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Ogre","supertypes":[],"types":["Creature"],"subtypes":["Ogre"],"oracleText":"","power":"2","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/3/73ae5276-b607-4f23-a9d2-e8cc7b8e3693.jpg?1783948685","artUrl":"https://cards.scryfall.io/art_crop/front/7/3/73ae5276-b607-4f23-a9d2-e8cc7b8e3693.jpg?1783948685","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const inYard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  moveObject(s, id, "graveyard");
  return id;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
const nameOf = (s: GameState, id: string) => characteristics(s, s.objects[id]!).name;
const offered = (s: GameState) => (s.pending?.kind === "chooseOption" && s.pending.what === "castFromAmong" ? s.pending.options : []);
const options = (s: GameState) => (s.pending?.kind === "chooseOption" ? s.pending.options : []);

describe("round 429: Bloodthirsty Adversary compiles", () => {
  it("is fully supported", () => expect(isFullySupported(adversary())).toBe(true));
  it("the reflexive trigger's targets are up to X, X the times paid", () => {
    const t = compileCard(adversary()).triggers[0]!;
    const may = t.body.effects[0]!;
    expect(may).toMatchObject({ type: "may", pay: { mana: "{2}{R}" }, payX: { times: true } });
  });
});

describe("Bloodthirsty Adversary", () => {
  it("paid twice: two +1/+1 counters, two cards exiled and copied, the copies cast without paying their mana costs", () => {
    const { s: s0, ap, ids, opp } = setup([adversary()]);
    const b = inYard(s0, ap, bolt());
    const d = inYard(s0, ap, divination());
    const f = inYard(s0, ap, fireball());
    inYard(s0, ap, ogre());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "payX" });
    s.players[ap]!.manaPool.R = 2;
    s.players[ap]!.manaPool.C = 4;
    s = act(s, { type: "chooseOption", player: ap, choice: "2" });
    expect(s.pending).toMatchObject({ kind: "chooseMay", pay: { mana: "{4}{R}{R}" } });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.players[ap]!.manaPool.R + s.players[ap]!.manaPool.C).toBe(0);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap, x: 2 });
    // At most two: the times paid.
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(b), tgt(d), tgt(f)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(b), tgt(d)] }));
    expect(s.objects[ids[0]!]!.counters?.["+1/+1"]).toBe(2);
    expect([zone(s, b), zone(s, d), zone(s, f)]).toEqual(["exile", "exile", "graveyard"]);
    expect(offered(s)).toHaveLength(3);
    const boltCopy = offered(s).find((id) => id !== "none" && nameOf(s, id) === "Lightning Bolt")!;
    s = act(s, { type: "chooseOption", player: ap, choice: boltCopy });
    expect(s.pending).toMatchObject({ kind: "castFree" });
    const made = s.pending!.kind === "castFree" ? s.pending.objectId : "";
    // A copy, not the card: the card stays exiled (rulings).
    expect(made).not.toBe(b);
    const pool = { ...s.players[ap]!.manaPool };
    s = run(s, planCast(s, ap, made, [{ kind: "player", id: opp }]));
    expect(s.players[ap]!.manaPool).toEqual(pool);
    // Back to the choice: the Divination copy too.
    expect(offered(s).filter((id) => id !== "none").map((id) => nameOf(s, id))).toEqual(["Divination"]);
    const divCopy = offered(s).find((id) => id !== "none")!;
    s = act(s, { type: "chooseOption", player: ap, choice: divCopy });
    const made2 = s.pending!.kind === "castFree" ? s.pending.objectId : "";
    s = run(s, planCast(s, ap, made2));
    const life = s.players[opp]!.life;
    const hand = s.players[ap]!.hand.length;
    s = settle(s);
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect([zone(s, b), zone(s, d)]).toEqual(["exile", "exile"]);
  });

  it("not paid: no counters, nothing exiled", () => {
    const { s: s0, ap, ids } = setup([adversary()]);
    const b = inYard(s0, ap, bolt());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(options(s)).toContain("none");
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "none" }));
    expect(s.pending).toBeFalsy();
    expect(s.objects[ids[0]!]!.counters?.["+1/+1"] ?? 0).toBe(0);
    expect(zone(s, b)).toBe("graveyard");
  });

  it("a target gone by resolution isn't exiled or copied; the other one is", () => {
    const { s: s0, ap, ids } = setup([adversary()]);
    const b = inYard(s0, ap, bolt());
    const o = inYard(s0, ap, shock());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s.players[ap]!.manaPool.R = 2;
    s.players[ap]!.manaPool.C = 4;
    s = settle(act(act(s, { type: "chooseOption", player: ap, choice: "2" }), { type: "chooseMay", player: ap, yes: true }));
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(b), tgt(o)] });
    // In response, the Bolt card leaves the graveyard.
    moveObject(s, b, "library");
    s = settle(s);
    expect(s.objects[ids[0]!]!.counters?.["+1/+1"]).toBe(2);
    expect(offered(s).filter((id) => id !== "none").map((id) => nameOf(s, id))).toEqual(["Shock"]);
    expect(zone(s, o)).toBe("exile");
  });
});
