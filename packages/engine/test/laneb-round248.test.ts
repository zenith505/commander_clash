// Lane B round B248: replicate given to the spells you cast (CR 702.56a-b): Hatchery Sliver ("Each Sliver spell you cast
// has replicate. The replicate cost is equal to its mana cost."), Djinn Illuminatus (instants and sorceries), Ian
// Chesterton (Sagas) and Threefold Signal ("Each spell you cast that's exactly three colors has replicate {3}."). Each
// instance is paid separately and copies the spell for its own payments only (CR 702.56b, rulings); a copy of a permanent
// spell becomes a token (CR 608.3f, 111.12); X in the replicate cost is the spell's X (rulings).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, castProblem, invalidateCharacteristics, isFullySupported, planCast, replicateGranted, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const hatchery = (): CardDef => ({"oracleId":"6227fb65-d7ef-4bc6-a076-9aa10941632c","name":"Hatchery Sliver","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Sliver","supertypes":[],"types":["Creature"],"subtypes":["Sliver"],"oracleText":"Replicate {1}{G} (When you cast this spell, copy it for each time you paid its replicate cost.)\nEach Sliver spell you cast has replicate. The replicate cost is equal to its mana cost. (A copy of a permanent spell becomes a token.)","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":["Replicate"],"imageUrl":"https://cards.scryfall.io/normal/front/1/5/15d2737c-d8ef-4b03-9316-be3f61288d3c.jpg?1783915479","artUrl":"https://cards.scryfall.io/art_crop/front/1/5/15d2737c-d8ef-4b03-9316-be3f61288d3c.jpg?1783915479","commanderLegal":"legal","set":"cmm","releasedAt":"2023-08-04","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const djinn = (): CardDef => ({"oracleId":"d7dcf1be-2779-419d-8c90-03800f9e7ea2","name":"Djinn Illuminatus","manaCost":"{5}{U/R}{U/R}","cmc":7,"typeLine":"Creature — Djinn","supertypes":[],"types":["Creature"],"subtypes":["Djinn"],"oracleText":"({U/R} can be paid with either {U} or {R}.)\nFlying\nEach instant and sorcery spell you cast has replicate. The replicate cost is equal to its mana cost. (When you cast it, copy it for each time you paid its replicate cost. You may choose new targets for the copies.)","power":"3","toughness":"5","colors":["R","U"],"colorIdentity":["R","U"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/e/a/eafc3bb4-657c-46fa-9ad5-c924fdaefc83.jpg?1783943463","artUrl":"https://cards.scryfall.io/art_crop/front/e/a/eafc3bb4-657c-46fa-9ad5-c924fdaefc83.jpg?1783943463","commanderLegal":"legal","set":"gpt","releasedAt":"2006-02-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const ian = (): CardDef => ({"oracleId":"32c9ce8c-a19d-49e4-bc6d-c7182fa00b51","name":"Ian Chesterton","manaCost":"{2}{W}","cmc":3,"typeLine":"Legendary Creature — Human Scientist","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Scientist"],"oracleText":"Science Teacher — Each Saga spell you cast has replicate. The replicate cost is equal to its mana cost. (When you cast that Saga, copy it for each time you paid its replicate cost. Copies of Saga spells become tokens.)\nDoctor's companion (You can have two commanders if the other is the Doctor.)","power":"2","toughness":"3","colors":["W"],"colorIdentity":["W"],"keywords":["Science Teacher","Doctor's companion"],"imageUrl":"https://cards.scryfall.io/normal/front/8/b/8bce4bde-33af-4c91-903f-c46218664353.jpg?1783914679","artUrl":"https://cards.scryfall.io/art_crop/front/8/b/8bce4bde-33af-4c91-903f-c46218664353.jpg?1783914679","commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const signal = (): CardDef => ({"oracleId":"bc48da27-77e0-440f-b47b-4bdea3c3cc5e","name":"Threefold Signal","manaCost":"{3}","cmc":3,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"When this artifact enters, scry 3.\nEach spell you cast that's exactly three colors has replicate {3}. (When you cast it, copy it for each time you paid its replicate cost. You may choose new targets for the copies. A copy of a permanent spell becomes a token.)","colors":[],"colorIdentity":[],"keywords":["Scry"],"imageUrl":"https://cards.scryfall.io/normal/front/4/2/4234e98b-c89c-4169-bddc-141cc1ba363d.jpg?1783923330","artUrl":"https://cards.scryfall.io/art_crop/front/4/2/4234e98b-c89c-4169-bddc-141cc1ba363d.jpg?1783923330","commanderLegal":"legal","set":"ncc","releasedAt":"2022-04-29","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const fireball = (): CardDef => ({"oracleId":"aa7714b0-2bfb-458a-8ebf-37ec2c53383e","name":"Fireball","manaCost":"{X}{R}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"This spell costs {1} more to cast for each target beyond the first.\nFireball deals X damage divided evenly, rounded down, among any number of targets.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/2/82a97aae-d8a7-4451-a47e-ea878dea6e4c.jpg?1783922638","artUrl":"https://cards.scryfall.io/art_crop/front/8/2/82a97aae-d8a7-4451-a47e-ea878dea6e4c.jpg?1783922638","commanderLegal":"legal","set":"clb","releasedAt":"2022-06-10","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const muscle = (): CardDef => ({"oracleId":"06e0459f-d691-4470-884a-27c09b6612d2","name":"Muscle Sliver","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Sliver","supertypes":[],"types":["Creature"],"subtypes":["Sliver"],"oracleText":"All Sliver creatures get +1/+1.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/0/602a1e1f-4195-48c0-8290-562e7e0db6d8.jpg?1783946616","artUrl":"https://cards.scryfall.io/art_crop/front/6/0/602a1e1f-4195-48c0-8290-562e7e0db6d8.jpg?1783946616","commanderLegal":"legal","set":"tmp","releasedAt":"1997-10-14","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const eldest = (): CardDef => ({"oracleId":"44ed4c0c-a012-4895-a547-b04150553bba","name":"The Eldest Reborn","manaCost":"{4}{B}","cmc":5,"typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — Each opponent sacrifices a creature or planeswalker of their choice.\nII — Each opponent discards a card.\nIII — Put target creature or planeswalker card from a graveyard onto the battlefield under your control.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/8/c8318f40-ecd5-429e-8fe2-febf31f64841.jpg?1783935009","artUrl":"https://cards.scryfall.io/art_crop/front/c/8/c8318f40-ecd5-429e-8fe2-febf31f64841.jpg?1783935009","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"uncommon","layout":"saga","gameChanger":false}) as CardDef;
const jundCharm = (): CardDef => ({"oracleId":"7bd2ac13-d598-4cf1-a483-2a6878aed93b","name":"Jund Charm","manaCost":"{B}{R}{G}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Choose one —\n• Exile target player's graveyard.\n• Jund Charm deals 2 damage to each creature.\n• Put two +1/+1 counters on target creature.","colors":["B","G","R"],"colorIdentity":["B","G","R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/a/7a0ddf00-926c-4283-a8b2-daa02fa99b8b.jpg?1783942544","artUrl":"https://cards.scryfall.io/art_crop/front/7/a/7a0ddf00-926c-4283-a8b2-daa02fa99b8b.jpg?1783942544","commanderLegal":"legal","set":"ala","releasedAt":"2008-10-03","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const helix = (): CardDef => ({"oracleId":"800c258a-cfc4-4a54-a667-065ea8dea69e","name":"Lightning Helix","manaCost":"{R}{W}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Helix deals 3 damage to any target and you gain 3 life.","colors":["R","W"],"colorIdentity":["R","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/1/4101e3fe-b0e7-4f0f-b9ac-9b61a4d628b3.jpg?1783912843","artUrl":"https://cards.scryfall.io/art_crop/front/4/1/4101e3fe-b0e7-4f0f-b9ac-9b61a4d628b3.jpg?1783912843","commanderLegal":"legal","set":"mkm","releasedAt":"2024-02-09","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...ds: CardDef[]) => ds.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
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
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const named = (s: GameState, name: string) => s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === name);
const tappedLands = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.objects[id]!.tapped && s.cards[s.objects[id]!.cardId]!.types.includes("Land")).length;
/** Casts it and resolves only the replicate triggers, leaving the spell and its copies on the stack. */
const castThenCopies = (s: GameState, plan: Action[] | null) => {
  s = run(s, plan);
  for (let i = 0; i < 50 && (s.triggerQueue.length || s.pending || s.stack.at(-1)?.kind === "ability"); i++) {
    const p = s.pending;
    if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};

describe("Lane B round B248", () => {
  it("are fully supported", () => {
    supported(hatchery(), djinn(), ian(), signal());
  });
});

describe("Lane B round B248: Djinn Illuminatus", () => {
  it("gives an instant replicate equal to its mana cost: paid once, it's copied once", () => {
    const { s: s0, ap, opp, ids } = setup([bolt()]);
    putOnBattlefield(s0, ap, djinn());
    invalidateCharacteristics(s0);
    expect(replicateGranted(s0, ap, bolt()).map((g) => g.cost)).toEqual(["{R}"]);
    const s1 = castThenCopies(s0, planCast(s0, ap, ids[0]!, [player(opp)], undefined, undefined, undefined, { replicate: [1] }));
    // {R} plus {R} for the replicate cost.
    expect(tappedLands(s1, ap)).toBe(2);
    expect(s1.stack.map((x) => x.description)).toEqual(["Lightning Bolt", "Lightning Bolt (copy)"]);
    expect(s1.log.some((l) => /casts Lightning Bolt, paying replicate \{R\} once \(from Djinn Illuminatus\)/.test(l.text))).toBe(true);
    const life = s1.players[opp]!.life;
    const s2 = settle(s1);
    expect(life - s2.players[opp]!.life).toBe(3); // the original; the copy went where the bot chose
    expect(Object.values(s2.players).reduce((n, p) => n + p.life, 0)).toBe(Object.values(s1.players).reduce((n, p) => n + p.life, 0) - 6);
  });

  it("keeps the X chosen for the spell in its replicate cost, and copies it as many times as it was paid", () => {
    const { s: s0, ap, opp, ids } = setup([fireball()]);
    putOnBattlefield(s0, ap, djinn());
    invalidateCharacteristics(s0);
    // {2}{R} three times: the spell and its replicate cost paid twice (rulings).
    const s1 = castThenCopies(s0, planCast(s0, ap, ids[0]!, [player(opp)], undefined, undefined, 2, { replicate: [2] }));
    expect(tappedLands(s1, ap)).toBe(9);
    expect(s1.stack.map((x) => x.description)).toEqual(["Fireball (X=2)", "Fireball (X=2) (copy)", "Fireball (X=2) (copy)"]);
    expect(s1.stack.every((x) => x.x === 2)).toBe(true);
    // Paying it a third time would be {2}{R} more than the lands left can make (three Mountains).
    expect(planCast(s0, ap, ids[0]!, [player(opp)], undefined, undefined, 2, { replicate: [3] })).toBeNull();
  });

  it("gives each Djinn its own instance, each paid separately and copying for its own payments", () => {
    const { s: s0, ap, opp, ids } = setup([bolt()]);
    putOnBattlefield(s0, ap, djinn());
    putOnBattlefield(s0, ap, djinn());
    invalidateCharacteristics(s0);
    expect(replicateGranted(s0, ap, bolt())).toHaveLength(2);
    const s1 = run(s0, planCast(s0, ap, ids[0]!, [player(opp)], undefined, undefined, undefined, { replicate: [1, 1] }));
    expect(tappedLands(s1, ap)).toBe(3);
    // Two triggers, one for each instance (CR 702.56b), each copying it once.
    expect(s1.log.filter((l) => /Replicate: copy Lightning Bolt once/.test(l.text))).toHaveLength(2);
    // The copy made by the first resolves before the second trigger does; two copies in all.
    const s2 = settle(s1);
    expect(s2.log.filter((l) => /copies Lightning Bolt/.test(l.text))).toHaveLength(2);
    // The second Djinn's instance only: {R} twice more.
    const s3 = castThenCopies(s0, planCast(s0, ap, ids[0]!, [player(opp)], undefined, undefined, undefined, { replicate: [0, 2] }));
    expect(tappedLands(s3, ap)).toBe(3);
    expect(s3.stack.filter((x) => x.description === "Lightning Bolt (copy)")).toHaveLength(2);
    expect(s3.log.filter((l) => /Replicate: copy Lightning Bolt twice/.test(l.text))).toHaveLength(1);
    expect(castProblem(s0, ap, ids[0]!, [player(opp)], undefined, undefined, undefined, undefined, { replicate: [1, 1, 1] })).toMatch(/doesn't have that many instances of replicate/);
  });

  it("isn't given to creature spells, or by an opponent's Djinn", () => {
    const { s: s0, ap, opp, ids } = setup([bolt(), muscle()]);
    putOnBattlefield(s0, opp, djinn());
    invalidateCharacteristics(s0);
    expect(replicateGranted(s0, ap, bolt())).toHaveLength(0);
    expect(castProblem(s0, ap, ids[0]!, [player(opp)], undefined, undefined, undefined, undefined, { replicate: [1] })).toMatch(/instances of replicate/);
    putOnBattlefield(s0, ap, djinn());
    invalidateCharacteristics(s0);
    expect(replicateGranted(s0, ap, muscle())).toHaveLength(0);
    expect(castProblem(s0, ap, ids[1]!, undefined, undefined, undefined, undefined, undefined, { replicate: [1] })).toMatch(/instances of replicate/);
  });

  it("isn't paid a fraction or a negative number of times, and not paid at all is the same as not asked", () => {
    const { s: s0, ap, opp, ids } = setup([bolt()]);
    putOnBattlefield(s0, ap, djinn());
    invalidateCharacteristics(s0);
    expect(castProblem(s0, ap, ids[0]!, [player(opp)], undefined, undefined, undefined, undefined, { replicate: [-1] })).toMatch(/whole number/);
    expect(castProblem(s0, ap, ids[0]!, [player(opp)], undefined, undefined, undefined, undefined, { replicate: [0.5] })).toMatch(/whole number/);
    const s1 = castThenCopies(s0, planCast(s0, ap, ids[0]!, [player(opp)], undefined, undefined, undefined, { replicate: [0] }));
    expect(s1.stack.map((x) => x.description)).toEqual(["Lightning Bolt"]);
  });
});

describe("Lane B round B248: bots", () => {
  /** `setup` with only `hand` in the active player's hand (the opening hand put back into the library). */
  const only = (hand: CardDef[]) => {
    const r = setup([]);
    const p = r.s.players[r.ap]!;
    for (const id of p.hand) r.s.objects[id]!.zone = "library";
    p.library.push(...p.hand);
    p.hand = [];
    const ids = hand.map((d) => {
      const id = putOnBattlefield(r.s, r.ap, d);
      r.s.battlefield.splice(r.s.battlefield.indexOf(id), 1);
      r.s.objects[id]!.zone = "hand";
      p.hand.push(id);
      return id;
    });
    invalidateCharacteristics(r.s);
    return { ...r, ids };
  };
  it("pay a replicate a permanent gives the spell with the mana they can spare", () => {
    const { s: s0, ap, ids } = only([divination()]);
    putOnBattlefield(s0, ap, djinn());
    invalidateCharacteristics(s0);
    const acts = botActions(s0, ap);
    const cast = acts.find((a) => a.type === "castSpell" && a.objectId === ids[0]);
    expect(cast, JSON.stringify(acts)).toBeDefined();
    // Fourteen lands: {2}{U} for Divination and {2}{U} twice more for the copies (three Islands; three times at most).
    expect(cast && "replicate" in cast ? cast.replicate : undefined).toEqual([2]);
  });
});

describe("Lane B round B248: Hatchery Sliver", () => {
  it("gives Sliver spells replicate: the copy of the creature spell becomes a token", () => {
    const { s: s0, ap, ids } = setup([muscle()]);
    putOnBattlefield(s0, ap, hatchery());
    invalidateCharacteristics(s0);
    const s1 = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { replicate: [1] })));
    const slivers = named(s1, "Muscle Sliver");
    expect(slivers).toHaveLength(2);
    expect(slivers.filter((id) => s1.objects[id]!.isToken)).toHaveLength(1);
  });

  it("adds an instance beside a Hatchery Sliver spell's own replicate: either or both can be paid", () => {
    const { s: s0, ap, ids } = setup([hatchery()]);
    putOnBattlefield(s0, ap, hatchery());
    invalidateCharacteristics(s0);
    // Its own replicate {1}{G} once (kicks) and the given one once: {1}{G} three times.
    const s1 = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { kicks: [0], replicate: [1] })));
    expect(tappedLands(s1, ap)).toBe(6);
    const all = named(s1, "Hatchery Sliver");
    expect(all).toHaveLength(4);
    expect(all.filter((id) => s1.objects[id]!.isToken)).toHaveLength(2);
  });

  it("doesn't give a non-Sliver spell replicate", () => {
    const { s: s0, ap, ids } = setup([fireball()]);
    putOnBattlefield(s0, ap, hatchery());
    invalidateCharacteristics(s0);
    expect(replicateGranted(s0, ap, fireball())).toHaveLength(0);
  });
});

describe("Lane B round B248: Ian Chesterton", () => {
  it("gives Saga spells replicate: the copy becomes a token Saga with its own lore counter", () => {
    const { s: s0, ap, ids } = setup([eldest()]);
    putOnBattlefield(s0, ap, ian());
    invalidateCharacteristics(s0);
    expect(replicateGranted(s0, ap, eldest()).map((g) => g.cost)).toEqual(["{4}{B}"]);
    const s1 = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { replicate: [1] })));
    expect(tappedLands(s1, ap)).toBe(10);
    const sagas = named(s1, "The Eldest Reborn");
    expect(sagas).toHaveLength(2);
    expect(sagas.filter((id) => s1.objects[id]!.isToken)).toHaveLength(1);
    expect(sagas.every((id) => (s1.objects[id]!.counters?.lore ?? 0) === 1)).toBe(true);
  });

  it("doesn't give instants replicate", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, ian());
    invalidateCharacteristics(s0);
    expect(replicateGranted(s0, ap, bolt())).toHaveLength(0);
  });
});

describe("Lane B round B248: Threefold Signal", () => {
  it("gives a spell that's exactly three colors replicate {3}", () => {
    const { s: s0, ap, ids } = setup([jundCharm(), helix()]);
    putOnBattlefield(s0, ap, signal());
    invalidateCharacteristics(s0);
    expect(replicateGranted(s0, ap, jundCharm()).map((g) => g.cost)).toEqual(["{3}"]);
    expect(replicateGranted(s0, ap, helix())).toHaveLength(0);
    expect(replicateGranted(s0, ap, divination())).toHaveLength(0);
    // "Jund Charm deals 2 damage to each creature": the copy has the same mode (CR 707.10).
    const s1 = castThenCopies(s0, planCast(s0, ap, ids[0]!, undefined, [1], undefined, undefined, { replicate: [1] }));
    expect(tappedLands(s1, ap)).toBe(6);
    expect(s1.stack.map((x) => x.description)).toEqual(["Jund Charm", "Jund Charm (copy)"]);
    expect(s1.stack.every((x) => JSON.stringify(x.modes) === "[1]")).toBe(true);
  });

  it("scries 3 as it enters", () => {
    const { s: s0, ap, ids } = setup([signal()]);
    const s1 = settle(run(s0, planCast(s0, ap, ids[0]!)), []);
    expect(named(s1, "Threefold Signal")).toHaveLength(1);
    expect(s1.log.some((l) => /scr(y|ies)/i.test(l.text))).toBe(true);
  });
});
