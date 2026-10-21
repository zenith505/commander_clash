// Round 107, the first popular cards: Mirror Box ("for each other creature you control with the same name as that
// creature"), Twinning Staff (one more copy whenever you copy a spell, CR 614.1a), Extraplanar Lens (a land with the
// imprinted land's name makes one more mana, CR 605.1b, 607.2a), Ardenn (attach any number of Auras and Equipment you
// control to target permanent or player, CR 701.3).

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, mountain, passUntil, pt, putOnBattlefield, setup, target } from "./helpers";
import { botActions, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type GameState } from "../src";

// Real oracle text (Scryfall).
const mirrorBox = card("Mirror Box", "Artifact", "{3}", { oracleText: 'The "legend rule" doesn\'t apply to permanents you control.\nEach legendary creature you control gets +1/+1.\nEach nontoken creature you control gets +1/+1 for each other creature you control with the same name as that creature.' });
const staff = card("Twinning Staff", "Artifact", "{3}", { oracleText: "If you would copy a spell one or more times, instead copy it that many times plus an additional time. You may choose new targets for the additional copy.\n{7}, {T}: Copy target instant or sorcery spell you control. You may choose new targets for the copy." });
const lens = card("Extraplanar Lens", "Artifact", "{3}", { keywords: ["Imprint"], oracleText: "Imprint — When this artifact enters, you may exile target land you control.\nWhenever a land with the same name as the exiled card is tapped for mana, its controller adds one mana of any type that land produced." });
const ardenn = card("Ardenn, Intrepid Archaeologist", "Legendary Creature — Kor Scout", "{2}{W}", { power: "2", toughness: "2", keywords: ["Partner"], oracleText: "At the beginning of combat on your turn, you may attach any number of Auras and Equipment you control to target permanent or player.\nPartner (You can have two commanders if both have partner.)" });
const bolt = card("Lightning Bolt", "Instant", "{R}", { oracleText: "Lightning Bolt deals 3 damage to any target." });
const bonesplitter = card("Bonesplitter", "Artifact — Equipment", "{1}", { keywords: ["Equip"], oracleText: "Equipped creature gets +2/+0.\nEquip {1}" });
const rancor = card("Rancor", "Enchantment — Aura", "{G}", { keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature gets +2/+0 and has trample.\nWhen this Aura is put into a graveyard from the battlefield, return it to its owner's hand." });
const opulence = card("Curse of Opulence", "Enchantment — Aura Curse", "{R}", { keywords: ["Enchant"], oracleText: "Enchant player\nWhenever enchanted player is attacked, create a Gold token. Each opponent attacking that player does the same. (A Gold token is an artifact with \"Sacrifice this token: Add one mana of any color.\")" });
// Test cards.
const legend = card("Test Legend", "Legendary Creature — Human", "{2}", { power: "2", toughness: "2" });
const snowForest = card("Snow-Covered Forest", "Basic Snow Land — Forest");

const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("can't do it");
  for (const a of plan) s = act(s, a);
  return s;
};

describe("round 107: the first popular cards", () => {
  it("parse", () => [mirrorBox, staff, lens, ardenn].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Mirror Box: +1/+1 to each nontoken creature for each other creature you control with its name; tokens count but get none", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, mirrorBox);
    const a = putOnBattlefield(s, ap, bear());
    const b = putOnBattlefield(s, ap, bear());
    const other = putOnBattlefield(s, ap, bear({ name: "Runeclaw Bear" }));
    const theirs = putOnBattlefield(s, opp, bear());
    expect(pt(s, a)).toBe("3/3");
    expect(pt(s, b)).toBe("3/3");
    expect(pt(s, other)).toBe("2/2");
    expect(pt(s, theirs)).toBe("2/2"); // an opponent's creature with the name counts for nobody
    // A token with the name counts, but gets no bonus itself (rulings).
    const tok = putOnBattlefield(s, ap, bear());
    s.objects[tok]!.isToken = true;
    s.objects[tok]!.controlledSinceTurn = -1;
    invalidateCharacteristics(s);
    expect(pt(s, a)).toBe("4/4");
    expect(pt(s, tok)).toBe("2/2");
    // A face-down creature has no name (rulings).
    s.objects[b]!.faceDown = true;
    invalidateCharacteristics(s);
    expect(pt(s, a)).toBe("3/3");
  });

  it("Mirror Box: legendary creatures get +1/+1 and two with the same name both stay", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, mirrorBox);
    const a = putOnBattlefield(s0, ap, legend);
    const b = putOnBattlefield(s0, ap, legend);
    const s = settle(act(s0, { type: "passPriority", player: ap }));
    expect(s.objects[a]!.zone).toBe("battlefield");
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(pt(s, a)).toBe("4/4"); // +1/+1 legendary, +1/+1 for the other one
  });

  it("Twinning Staff: its own ability makes two copies, each with targets chosen anew", () => {
    const { s: s0, ap, ids, opp } = setup([bolt]);
    const st = putOnBattlefield(s0, ap, staff);
    const x = putOnBattlefield(s0, opp, bear());
    const y = putOnBattlefield(s0, opp, bear());
    const z = putOnBattlefield(s0, opp, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(x)]));
    const spell = s.stack.at(-1)!.id;
    s = run(s, planActivate(s, ap, st, 0, [{ kind: "stack", id: spell }]));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "copyTargets", player: ap });
    s = act(s, { type: "copyTargets", player: ap, targets: [target(y)] });
    // The additional copy: its targets may be chosen anew too.
    expect(s.pending).toMatchObject({ kind: "copyTargets", player: ap });
    s = act(s, { type: "copyTargets", player: ap, targets: [target(z)] });
    expect(s.stack.filter((i) => i.copy)).toHaveLength(2);
    s = settle(s);
    for (const id of [x, y, z]) expect(s.objects[id]!.zone).toBe("graveyard");
  });

  it("Twinning Staff: two of them make two additional copies; an opponent's does nothing for you", () => {
    const { s: s0, ap, ids, opp } = setup([bolt]);
    const st = putOnBattlefield(s0, ap, staff);
    putOnBattlefield(s0, ap, staff);
    putOnBattlefield(s0, opp, staff);
    const x = putOnBattlefield(s0, opp, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(x)]));
    const spell = s.stack.at(-1)!.id;
    s = settle(run(s, planActivate(s, ap, st, 0, [{ kind: "stack", id: spell }])));
    let copies = 0;
    while (s.pending?.kind === "copyTargets") {
      copies++;
      s = act(s, { type: "copyTargets", player: ap });
    }
    expect(copies).toBe(3);
    expect(s.stack.filter((i) => i.copy)).toHaveLength(3);
  });

  it("Extraplanar Lens: lands with the imprinted land's name make one more of that mana, anyone's; others don't", () => {
    const { s: s0, ap, ids, opp } = setup([lens]);
    const myForest = s0.battlefield.find((id) => s0.objects[id]!.controller === ap && s0.cards[s0.objects[id]!.cardId]!.name === "Forest")!;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s);
    // Its imprint trigger targets a land we control.
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(myForest)] }));
    if (s.pending?.kind === "chooseMay") s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[myForest]!.zone).toBe("exile");
    const otherForest = s.battlefield.find((id) => s.objects[id]!.controller === ap && !s.objects[id]!.tapped && s.cards[s.objects[id]!.cardId]!.name === "Forest")!;
    const g0 = s.players[ap]!.manaPool.G ?? 0;
    s = act(s, { type: "activateMana", player: ap, objectId: otherForest, mana: "G" });
    expect((s.players[ap]!.manaPool.G ?? 0) - g0).toBe(2);
    const mtn = s.battlefield.find((id) => s.objects[id]!.controller === ap && !s.objects[id]!.tapped && s.cards[s.objects[id]!.cardId]!.name === "Mountain")!;
    s = act(s, { type: "activateMana", player: ap, objectId: mtn, mana: "R" });
    expect(s.players[ap]!.manaPool.R).toBe(1);
    // A Snow-Covered Forest has another name.
    const snow = putOnBattlefield(s, ap, snowForest);
    const g1 = s.players[ap]!.manaPool.G ?? 0;
    s = act(s, { type: "activateMana", player: ap, objectId: snow, mana: "G" });
    expect((s.players[ap]!.manaPool.G ?? 0) - g1).toBe(1);
    // An opponent's Forest: its controller adds the extra mana.
    const theirs = putOnBattlefield(s, opp, forest);
    s = act(s, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(opp);
    s = act(s, { type: "activateMana", player: opp, objectId: theirs, mana: "G" });
    expect(s.players[opp]!.manaPool.G).toBe(2);
  });

  it("Extraplanar Lens: with nothing exiled, nothing has the name", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, lens);
    const f = s0.battlefield.find((id) => s0.objects[id]!.controller === ap && s0.cards[s0.objects[id]!.cardId]!.name === "Forest")!;
    const s = act(s0, { type: "activateMana", player: ap, objectId: f, mana: "G" });
    expect(s.players[ap]!.manaPool.G).toBe(1);
  });

  it("Ardenn: at the beginning of combat, the chosen Auras and Equipment move onto the target; ones that can't aren't offered", () => {
    const { s: s0, ap } = setup([]);
    const ar = putOnBattlefield(s0, ap, ardenn);
    const big = putOnBattlefield(s0, ap, bear({ name: "Big Bear" }));
    const small = putOnBattlefield(s0, ap, bear());
    const eq1 = putOnBattlefield(s0, ap, bonesplitter);
    const eq2 = putOnBattlefield(s0, ap, bonesplitter);
    s0.objects[eq2]!.attachedTo = small;
    const aura = putOnBattlefield(s0, ap, rancor);
    s0.objects[aura]!.attachedTo = small;
    const curse = putOnBattlefield(s0, ap, opulence);
    let s = passUntil(s0, "beginCombat", ap);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(big)] }));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "attach", what: "Big Bear", min: 0 });
    if (s.pending?.kind !== "pickPermanents") return;
    // The Curse can't enchant a creature.
    expect([...s.pending.options].sort()).toEqual([eq1, eq2, aura].sort());
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [eq1, eq2, aura] }));
    for (const id of [eq1, eq2, aura]) expect(s.objects[id]!.attachedTo).toBe(big);
    expect(pt(s, big)).toBe("8/2");
    expect(pt(s, small)).toBe("2/2");
    expect(s.objects[curse]!.attachedToPlayer).toBeUndefined();
    expect(s.objects[ar]!.zone).toBe("battlefield");
  });

  it("Ardenn: targeting a player, only Auras that can enchant players are offered", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, ardenn);
    putOnBattlefield(s0, ap, bonesplitter);
    const curse = putOnBattlefield(s0, ap, opulence);
    const third = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    s0.objects[curse]!.attachedToPlayer = third;
    let s = settle(passUntil(s0, "beginCombat", ap));
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "attach", options: [curse] });
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [curse] }));
    expect(s.objects[curse]!.attachedToPlayer).toBe(opp);
  });

  it("Ardenn: choosing none moves nothing; a bot moves its Equipment onto its best creature", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, ardenn);
    const big = putOnBattlefield(s0, ap, card("Huge Beast", "Creature — Beast", "{5}{G}", { power: "6", toughness: "6" }));
    const eq = putOnBattlefield(s0, ap, bonesplitter);
    let s = settle(passUntil(s0, "beginCombat", ap));
    let none = s;
    none = settle(act(none, { type: "chooseTargets", player: ap, targets: [target(big)] }));
    none = settle(act(none, { type: "pickPermanents", player: ap, ids: [] }));
    expect(none.objects[eq]!.attachedTo).toBeUndefined();
    // The bot's answers.
    for (let i = 0; i < 6 && s.pending; i++) {
      for (const a of botActions(s, waitingOn(s)!)) s = act(s, a);
      s = settle(s);
    }
    expect(s.objects[eq]!.attachedTo).toBe(big);
  });
});
