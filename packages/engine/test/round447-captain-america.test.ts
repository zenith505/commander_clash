// Round 447: Captain America, First Avenger's "Throw ... — {3}, Unattach an Equipment from Captain America: He deals damage
// equal to that Equipment's mana value divided as you choose among one, two, or three targets." (the Equipment chosen and
// unattached as the cost, CR 602.2b, 601.2h, 701.3d; its mana value, CR 202.3, divided with at least 1 each, CR 601.2d)
// and "... Catch — At the beginning of combat on your turn, attach up to one target Equipment you control to Captain
// America." ("Throw ..." and "... Catch" a flavor word, CR 207.2d).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilityProblem, botActions, compileCard, invalidateCharacteristics, isFullySupported, planActivate, waitingOn, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const cap = (): CardDef => ({"oracleId":"7d038055-035d-4698-b6b6-e2859bf2f1d1","name":"Captain America, First Avenger","manaCost":"{R}{W}{U}","cmc":3,"typeLine":"Legendary Creature — Human Soldier Hero","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Soldier","Hero"],"oracleText":"Throw ... — {3}, Unattach an Equipment from Captain America: He deals damage equal to that Equipment's mana value divided as you choose among one, two, or three targets.\n... Catch — At the beginning of combat on your turn, attach up to one target Equipment you control to Captain America.","power":"4","toughness":"4","colors":["R","U","W"],"colorIdentity":["R","U","W"],"keywords":["Throw ...","... Catch"],"imageUrl":"https://cards.scryfall.io/normal/front/b/b/bba7e9c8-c24c-4bd3-b398-fe42b1fcfb5d.jpg?1783909142","artUrl":"https://cards.scryfall.io/art_crop/front/b/b/bba7e9c8-c24c-4bd3-b398-fe42b1fcfb5d.jpg?1783909142","commanderLegal":"legal","set":"sld","releasedAt":"2024-11-04","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const bonesplitter = (): CardDef => ({"oracleId":"452e3f5f-ce17-4682-966b-5cc100210aee","name":"Bonesplitter","manaCost":"{1}","cmc":1,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +2/+0.\nEquip {1}","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/a/e/ae31d513-7412-4467-b497-a7183ff29a42.jpg?1783944980","artUrl":"https://cards.scryfall.io/art_crop/front/a/e/ae31d513-7412-4467-b497-a7183ff29a42.jpg?1783944980","commanderLegal":"legal","set":"pal03","releasedAt":"2003-01-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const swordDef = (): CardDef => ({"oracleId":"2ccdc60a-49a9-44b9-a7af-0ebf18b26785","name":"Sword of Fire and Ice","manaCost":"{3}","cmc":3,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +2/+2 and has protection from red and from blue.\nWhenever equipped creature deals combat damage to a player, this Equipment deals 2 damage to any target and you draw a card.\nEquip {2}","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/c/f/cf767c80-ba6e-4206-89a2-727307145ed5.jpg?1783937247","artUrl":"https://cards.scryfall.io/art_crop/front/c/f/cf767c80-ba6e-4206-89a2-727307145ed5.jpg?1783937247","commanderLegal":"legal","set":"mps","releasedAt":"2016-09-30","rarity":"special","layout":"normal","gameChanger":false}) as CardDef;
const mantleDef = (): CardDef => ({"oracleId":"c1121b83-1ba2-473d-89c9-e3bbd4529072","name":"Paradise Mantle","manaCost":"{0}","cmc":0,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature has \"{T}: Add one mana of any color.\"\nEquip {1}","colors":[],"colorIdentity":[],"keywords":["Equip"],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/c/c/ccfffc0b-601f-4e21-90d6-72afbebf2579.jpg?1788258326","artUrl":"https://cards.scryfall.io/art_crop/front/c/c/ccfffc0b-601f-4e21-90d6-72afbebf2579.jpg?1788258326","commanderLegal":"legal","set":"sld","releasedAt":"2026-08-31","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const cloak = (): CardDef => ({"oracleId":"9ad4f730-a18e-4a7c-a468-a926c718c741","name":"Whispersilk Cloak","manaCost":"{3}","cmc":3,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature can't be blocked and has shroud. (It can't be the target of spells or abilities.)\nEquip {2}","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/a/3/a3f31ac4-09ca-4712-a311-50d28824bfad.jpg?1783903208","artUrl":"https://cards.scryfall.io/art_crop/front/a/3/a3f31ac4-09ca-4712-a311-50d28824bfad.jpg?1783903208","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

const obj = (id: string, amount?: number): TargetChoice => ({ kind: "object", id, ...(amount !== undefined ? { amount } : {}) });
const pl = (id: number, amount: number): TargetChoice => ({ kind: "player", id, amount });
const none: TargetChoice = { kind: "none" };
const attach = (s: GameState, pid: PlayerId, def: CardDef, to: ObjectId) => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.attachedTo = to;
  invalidateCharacteristics(s);
  return id;
};
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: ReturnType<typeof planActivate>) => {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return s;
};

describe("Round 447: Captain America, First Avenger", () => {
  it("compiles, both abilities", () => {
    expect(isFullySupported(cap())).toBe(true);
    const c = compileCard(cap());
    expect(c.activated).toHaveLength(1);
    expect(c.activated[0]!.unattachEquipment).toBe(true);
    expect(c.triggers.some((t) => t.event === "yourBeginCombat")).toBe(true);
  });

  it("Throw: the Equipment chosen is unattached, and its mana value is divided among up to three targets", () => {
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, ap, cap());
    const sword = attach(s0, ap, swordDef(), c);
    const split = attach(s0, ap, bonesplitter(), c);
    const b1 = putOnBattlefield(s0, opp, bears());
    const b2 = putOnBattlefield(s0, opp, bears());
    const life = s0.players[opp]!.life;
    // Sword of Fire and Ice: 3 damage, 2 to a Bear and 1 to its controller.
    let s = run(s0, planActivate(s0, ap, c, 0, [obj(b1, 2), pl(opp, 1), none], undefined, undefined, undefined, { unattachEquipment: sword }));
    expect(s.objects[sword]!.attachedTo).toBeUndefined();
    expect(s.objects[sword]!.zone).toBe("battlefield");
    expect(s.objects[split]!.attachedTo).toBe(c);
    s = settle(s);
    expect(s.objects[b1]!.zone).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(life - 1);
    expect(s.objects[b2]!.zone).toBe("battlefield");
  });

  it("the division has to add up to that Equipment's mana value, at least 1 for each target", () => {
    const { s, ap, opp } = setup([]);
    const c = putOnBattlefield(s, ap, cap());
    const split = attach(s, ap, bonesplitter(), c);
    const mantle = attach(s, ap, mantleDef(), c);
    const b1 = putOnBattlefield(s, opp, bears());
    // Bonesplitter's mana value is 1: one target, dealt 1.
    expect(planActivate(s, ap, c, 0, [obj(b1, 1), none, none], undefined, undefined, undefined, { unattachEquipment: split })).not.toBeNull();
    expect(planActivate(s, ap, c, 0, [obj(b1, 2), none, none], undefined, undefined, undefined, { unattachEquipment: split })).toBeNull();
    expect(planActivate(s, ap, c, 0, [obj(b1, 1), pl(opp, 1), none], undefined, undefined, undefined, { unattachEquipment: split })).toBeNull();
    // Paradise Mantle's is 0: nothing to divide, so it can't be the one.
    expect(planActivate(s, ap, c, 0, [obj(b1, 1), none, none], undefined, undefined, undefined, { unattachEquipment: mantle })).toBeNull();
    // An Equipment that isn't attached to it can't be.
    const loose = putOnBattlefield(s, ap, swordDef());
    expect(planActivate(s, ap, c, 0, [obj(b1, 3), none, none], undefined, undefined, undefined, { unattachEquipment: loose })).toBeNull();
    // With none chosen yet, it can be activated as long as one of them would do.
    expect(abilityProblem(s, ap, c, 0) ?? "").not.toMatch(/Equipment|target|divide/);
    s.objects[split]!.attachedTo = undefined;
    s.objects[mantle]!.attachedTo = undefined;
    invalidateCharacteristics(s);
    expect(abilityProblem(s, ap, c, 0)).toMatch(/no Equipment is attached/);
  });

  it("Catch: at the beginning of combat on your turn, an Equipment you control becomes attached to it", () => {
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, cap());
    const sword = putOnBattlefield(s0, ap, swordDef());
    let s = passUntil(s0, "beginCombat", ap);
    for (let i = 0; i < 20 && !s.objects[sword]!.attachedTo; i++) {
      const p = s.pending;
      if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets: [obj(sword)] });
      else if (p) s = act(s, botActions(s, p.player)[0]!);
      else if (s.stack.length || s.triggerQueue.length) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      else break;
    }
    expect(s.objects[sword]!.attachedTo).toBe(c);
  });

  it("a bot throws an Equipment in its second main phase", () => {
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, ap, cap());
    const sword = attach(s0, ap, swordDef(), c);
    const b1 = putOnBattlefield(s0, opp, bears());
    // To our second main phase, the bots answering (Catch attaches the Sword again, as it is).
    let s = s0;
    for (let i = 0; i < 400 && !(s.step === "main2" && s.activePlayer === ap && !s.stack.length && !s.triggerQueue.length && !s.pending); i++) s = act(s, s.pending ? botActions(s, waitingOn(s)!)[0]! : { type: "passPriority", player: waitingOn(s)! });
    expect(s.step).toBe("main2");
    // Its land and spells first, then the ability.
    let thrown: ObjectId | undefined;
    for (let i = 0; i < 60 && thrown === undefined && s.step === "main2"; i++) {
      const who = waitingOn(s)!;
      if (s.pending || who !== ap) {
        s = act(s, s.pending ? botActions(s, who)[0]! : { type: "passPriority", player: who });
        continue;
      }
      const plan = botActions(s, ap);
      const a = plan.find((x) => x.type === "activateAbility" && x.objectId === c);
      if (a?.type === "activateAbility") thrown = a.costs?.unattachEquipment;
      for (const x of plan) s = act(s, x);
    }
    expect(thrown).toBe(sword);
    s = settle(s);
    expect(s.objects[b1]!.zone).toBe("graveyard");
  });
});
