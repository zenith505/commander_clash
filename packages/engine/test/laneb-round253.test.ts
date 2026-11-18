// Lane B round B253: Lich ("As ~ enters, you lose life equal to your life total.", "If you would gain life, draw that many
// cards instead.", "Whenever you're dealt damage, sacrifice that many nontoken permanents. If you can't, you lose the game."),
// Nefarious Lich ("If damage would be dealt to you, exile that many cards from your graveyard instead. If you can't, you lose
// the game.") and Dralnu, Lich Lord ("If damage would be dealt to ~, sacrifice that many permanents instead."): CR 107.1b,
// 119.10, 614.1a, 614.5, 614.12, 615.12, 616.1, and the cards' rulings.

import { describe, expect, it } from "vitest";
import { act, bear, passUntil, putOnBattlefield, setup, swamp } from "./helpers";
import { applyAction, botActions, compileCard, invalidateCharacteristics, isFullySupported, moveObject, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const lich = (): CardDef => ({"oracleId":"5b7515f2-7a5a-4e2a-9784-6cbacd768172","name":"Lich","manaCost":"{B}{B}{B}{B}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"As this enchantment enters, you lose life equal to your life total.\nYou don't lose the game for having 0 or less life.\nIf you would gain life, draw that many cards instead.\nWhenever you're dealt damage, sacrifice that many nontoken permanents. If you can't, you lose the game.\nWhen this enchantment is put into a graveyard from the battlefield, you lose the game.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/2/4250caec-0e37-41be-9ec4-8938deb5f0d0.jpg?1783948694","artUrl":"https://cards.scryfall.io/art_crop/front/4/2/4250caec-0e37-41be-9ec4-8938deb5f0d0.jpg?1783948694","layout":"normal"});
const nefariousLich = (): CardDef => ({"oracleId":"d79e8ec4-b44b-4598-991c-7781dab55868","name":"Nefarious Lich","manaCost":"{B}{B}{B}{B}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"If damage would be dealt to you, exile that many cards from your graveyard instead. If you can't, you lose the game.\nIf you would gain life, draw that many cards instead.\nWhen this enchantment leaves the battlefield, you lose the game.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/9/d90f5a4e-8c3a-4803-bb59-d3d7c23761db.jpg?1783945242","artUrl":"https://cards.scryfall.io/art_crop/front/d/9/d90f5a4e-8c3a-4803-bb59-d3d7c23761db.jpg?1783945242","layout":"normal"});
const dralnu = (): CardDef => ({"oracleId":"35ab189a-adc8-48d6-82d2-53eb56a4d5e4","name":"Dralnu, Lich Lord","manaCost":"{3}{U}{B}","cmc":5,"typeLine":"Legendary Creature — Zombie Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Zombie","Wizard"],"oracleText":"If damage would be dealt to Dralnu, sacrifice that many permanents instead.\n{T}: Target instant or sorcery card in your graveyard gains flashback until end of turn. The flashback cost is equal to its mana cost. (You may cast that card from your graveyard for its flashback cost. Then exile it.)","power":"3","toughness":"3","colors":["B","U"],"colorIdentity":["B","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/3/b3828efe-cbe1-473c-8dde-60ea9aaf23a2.jpg?1783943203","artUrl":"https://cards.scryfall.io/art_crop/front/b/3/b3828efe-cbe1-473c-8dde-60ea9aaf23a2.jpg?1783943203","layout":"normal"});
const revitalize = (): CardDef => ({"oracleId":"b1385b03-cb4b-4812-857f-7421f1df39af","name":"Revitalize","manaCost":"{1}{W}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"You gain 3 life.\nDraw a card.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/a/3a9fb75e-c8e5-417b-83d4-5105af9c66c1.jpg?1783928280","artUrl":"https://cards.scryfall.io/art_crop/front/3/a/3a9fb75e-c8e5-417b-83d4-5105af9c66c1.jpg?1783928280","layout":"normal"});
const wordsOfWorship = (): CardDef => ({"oracleId":"f1fad5ab-d087-4912-b1b9-42733fa34707","name":"Words of Worship","manaCost":"{2}{W}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"{1}: The next time you would draw a card this turn, you gain 5 life instead.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/e/0ea5c6e0-8361-4214-997b-32a66b19fae9.jpg?1783945089","artUrl":"https://cards.scryfall.io/art_crop/front/0/e/0ea5c6e0-8361-4214-997b-32a66b19fae9.jpg?1783945089","layout":"normal"});
const rhoxFaithmender = (): CardDef => ({"oracleId":"2abe9303-d498-4aad-b6b2-8b5064bd2ffd","name":"Rhox Faithmender","manaCost":"{3}{W}","cmc":4,"typeLine":"Creature — Rhino Monk","supertypes":[],"types":["Creature"],"subtypes":["Rhino","Monk"],"oracleText":"Lifelink (Damage dealt by this creature also causes you to gain that much life.)\nIf you would gain life, you gain twice that much life instead.","power":"1","toughness":"5","colors":["W"],"colorIdentity":["W"],"keywords":["Lifelink"],"imageUrl":"https://cards.scryfall.io/normal/front/8/5/85ea185a-7b38-49f3-be73-be8180fb6295.jpg?1783940514","artUrl":"https://cards.scryfall.io/art_crop/front/8/5/85ea185a-7b38-49f3-be73-be8180fb6295.jpg?1783940514","layout":"normal"});
const leylineOfPunishment = (): CardDef => ({"oracleId":"2608df54-dfbe-417d-aef5-49afbdfb03da","name":"Leyline of Punishment","manaCost":"{2}{R}{R}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"If this card is in your opening hand, you may begin the game with it on the battlefield.\nPlayers can't gain life.\nDamage can't be prevented.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/1/51a2eec5-f892-4466-b6c6-960626ba5640.jpg?1783941804","artUrl":"https://cards.scryfall.io/art_crop/front/5/1/51a2eec5-f892-4466-b6c6-960626ba5640.jpg?1783941804","layout":"normal"});
const platinumAngel = (): CardDef => ({"oracleId":"b148578c-c0bf-4785-b97c-4b6f83028008","name":"Platinum Angel","manaCost":"{7}","cmc":7,"typeLine":"Artifact Creature — Angel","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Angel"],"oracleText":"Flying\nYou can't lose the game and your opponents can't win the game.","power":"4","toughness":"4","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/9/4/94765871-5785-429b-8980-e2b1667278a5.jpg?1783922247","artUrl":"https://cards.scryfall.io/art_crop/front/9/4/94765871-5785-429b-8980-e2b1667278a5.jpg?1783922247","layout":"normal"});
const sulfurousSprings = (): CardDef => ({"oracleId":"f5c38c01-4a40-469f-91a0-7479daf4e8e7","name":"Sulfurous Springs","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{T}: Add {B} or {R}. This land deals 1 damage to you.","colors":[],"colorIdentity":["B","R"],"keywords":[],"producedMana":["B","C","R"],"imageUrl":"https://cards.scryfall.io/normal/front/3/5/35b403ee-62cc-4f67-911e-4bf26e495374.jpg?1783906205","artUrl":"https://cards.scryfall.io/art_crop/front/3/5/35b403ee-62cc-4f67-911e-4bf26e495374.jpg?1783906205","layout":"normal"});
const pyroclasm = (): CardDef => ({"oracleId":"e4bcd4ea-e7cd-4471-8f3b-18bb51d3d70c","name":"Pyroclasm","manaCost":"{1}{R}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Pyroclasm deals 2 damage to each creature.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/3/4391b0af-2f26-4a45-9e2a-5bd8e9838107.jpg?1783909464","artUrl":"https://cards.scryfall.io/art_crop/front/4/3/4391b0af-2f26-4a45-9e2a-5bd8e9838107.jpg?1783909464","layout":"normal"});
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","layout":"normal"});
const skullcrack = (): CardDef => ({"oracleId":"a6fc0b0c-9ba2-47f2-ab92-26fd20d0f86d","name":"Skullcrack","manaCost":"{1}{R}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Players can't gain life this turn. Damage can't be prevented this turn. Skullcrack deals 3 damage to target player or planeswalker.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/7/170a06cd-501e-43c8-98e0-63ebd61cc0aa.jpg?1783911719","artUrl":"https://cards.scryfall.io/art_crop/front/1/7/170a06cd-501e-43c8-98e0-63ebd61cc0aa.jpg?1783911719","layout":"normal"});
const sunhomeEnforcer = (): CardDef => ({"oracleId":"a4c6f546-ad58-41ba-aadd-724958cd4611","name":"Sunhome Enforcer","manaCost":"{2}{R}{W}","cmc":4,"typeLine":"Creature — Giant Soldier","supertypes":[],"types":["Creature"],"subtypes":["Giant","Soldier"],"oracleText":"Whenever this creature deals combat damage, you gain that much life.\n{1}{R}: This creature gets +1/+0 until end of turn.","power":"2","toughness":"4","colors":["R","W"],"colorIdentity":["R","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/4/c4d5a88e-fc8f-4dd6-a1db-8e44b74ee0a1.jpg?1783943609","artUrl":"https://cards.scryfall.io/art_crop/front/c/4/c4d5a88e-fc8f-4dd6-a1db-8e44b74ee0a1.jpg?1783943609","layout":"normal"});
const vampireNighthawk = (): CardDef => ({"oracleId":"feb244f8-bcb1-44cf-9940-2719221a7309","name":"Vampire Nighthawk","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Creature — Vampire Shaman","supertypes":[],"types":["Creature"],"subtypes":["Vampire","Shaman"],"oracleText":"Flying\nDeathtouch (Any amount of damage this deals to a creature is enough to destroy it.)\nLifelink (Damage dealt by this creature also causes you to gain that much life.)","power":"2","toughness":"3","colors":["B"],"colorIdentity":["B"],"keywords":["Deathtouch","Flying","Lifelink"],"imageUrl":"https://cards.scryfall.io/normal/front/4/4/44f19fe3-7a17-4c45-adfa-590f73dfebfa.jpg?1783942148","artUrl":"https://cards.scryfall.io/art_crop/front/4/4/44f19fe3-7a17-4c45-adfa-590f73dfebfa.jpg?1783942148","layout":"normal"});
const realBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","layout":"normal"});
const healingSalve = (): CardDef => ({"oracleId":"8da8644c-75a1-4fe9-8e94-900d948d631c","name":"Healing Salve","manaCost":"{W}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Choose one —\n• Target player gains 3 life.\n• Prevent the next 3 damage that would be dealt to any target this turn.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/9/89146f6a-583f-4ed1-8b43-75e9a55892c6.jpg?1783946374","artUrl":"https://cards.scryfall.io/art_crop/front/8/9/89146f6a-583f-4ed1-8b43-75e9a55892c6.jpg?1783946374","layout":"normal"});

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
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const ptgt = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const logged = (s: GameState, re: RegExp) => s.log.some((l) => re.test(l.text));
const activateNow = (s: GameState, pid: PlayerId, id: string, index: number, targets: TargetChoice[] = []) => run(s, planActivate(s, pid, id, index, targets));
/** Puts a card in `pid`'s graveyard. */
function inGraveyard(s: GameState, pid: PlayerId, d: CardDef): string {
  const id = putOnBattlefield(s, pid, d);
  moveObject(s, id, "graveyard");
  invalidateCharacteristics(s);
  return id;
}
const shieldPrompt = (s: GameState) => (s.pending?.kind === "chooseOption" && s.pending.what === "damageShield" ? s.pending : undefined);
/** Answers the damage question by the label that starts with `label`. */
function answer(s: GameState, label: string): GameState {
  const p = shieldPrompt(s);
  if (!p) throw new Error(`no damage question: ${JSON.stringify(s.pending)}`);
  const i = (p.labels ?? []).findIndex((l) => l.startsWith(label));
  if (i < 0) throw new Error(`no "${label}" in ${JSON.stringify(p.labels)}`);
  return act(s, { type: "chooseOption", player: p.player, choice: p.options[i]! });
}
const nonland = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && !s.cards[s.objects[id]!.cardId]!.types.includes("Land"));

describe("Lane B round B253", () => {
  it("are fully supported", () => {
    supported(lich(), nefariousLich(), dralnu());
    expect(compileCard(lich()).entersLoseLifeTotal).toBe(true);
    expect(compileCard(lich()).gainLifeDrawsInstead).toBe(true);
    expect(compileCard(nefariousLich()).gainLifeDrawsInstead).toBe(true);
    expect(compileCard(dralnu()).statics[0]?.mods[0]).toMatchObject({ kind: "damageMod", mod: { op: "sacrifice" } });
  });
});

describe("Lane B round B253: Lich", () => {
  it("as it enters, its controller loses life equal to their life total, and doesn't lose for having 0 life", () => {
    const { s: s0, ap, ids } = setup([lich()]);
    putOnBattlefield(s0, ap, swamp);
    putOnBattlefield(s0, ap, swamp);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.players[ap]!.life).toBe(0);
    expect(s.players[ap]!.lost).toBeFalsy();
    expect(logged(s, /loses life equal to their life total \(Lich\)/)).toBe(true);
    // Another one entering at 0 life: nothing (CR 107.1b).
    s = passUntil(s, "main2", ap);
    expect(s.players[ap]!.lost).toBeFalsy();
  });

  it("a life gain is drawn instead: Revitalize draws 3 for the gain, then its own card", () => {
    const { s: s0, ap, ids } = setup([revitalize()]);
    putOnBattlefield(s0, ap, lich());
    const life = s0.players[ap]!.life;
    const hand = s0.players[ap]!.hand.length;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.players[ap]!.life).toBe(life);
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 3 + 1);
    expect(logged(s, /would gain 3 life; they draw 3 cards instead \(Lich\)/)).toBe(true);
    expect(s.turnLog?.gainedLife ?? []).not.toContain(ap);
  });

  it("with two Liches, one card for each life all the same (rulings); \"twice that much\" applies first", () => {
    const { s: s0, ap, ids } = setup([revitalize()]);
    putOnBattlefield(s0, ap, lich());
    putOnBattlefield(s0, ap, nefariousLich());
    putOnBattlefield(s0, ap, rhoxFaithmender());
    const hand = s0.players[ap]!.hand.length;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 6 + 1);
  });

  it("no life can be gained (Leyline of Punishment): nothing to replace, nothing drawn (rulings)", () => {
    const { s: s0, ap, ids } = setup([revitalize()]);
    putOnBattlefield(s0, ap, lich());
    putOnBattlefield(s0, ap, leylineOfPunishment());
    const hand = s0.players[ap]!.hand.length;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 1);
  });

  it("a draw Words of Worship turns back into a gain isn't replaced by that Lich again (CR 614.5), but by another one", () => {
    const { s: s0, ap, ids } = setup([revitalize()]);
    putOnBattlefield(s0, ap, lich());
    const w = putOnBattlefield(s0, ap, wordsOfWorship());
    let s = settle(activateNow(s0, ap, w, 0));
    const life = s.players[ap]!.life;
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    // 3 life into 3 draws; the first is 5 life instead, gained; then 2 draws and Revitalize's.
    expect(s.players[ap]!.life).toBe(life + 5);
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2 + 1);

    const { s: t0, ap: bp, ids: bids } = setup([revitalize()]);
    putOnBattlefield(t0, bp, lich());
    putOnBattlefield(t0, bp, nefariousLich());
    const w2 = putOnBattlefield(t0, bp, wordsOfWorship());
    let t = settle(activateNow(t0, bp, w2, 0));
    const life2 = t.players[bp]!.life;
    const hand2 = t.players[bp]!.hand.length;
    t = settle(run(t, planCast(t, bp, bids[0]!)));
    // The 5 life is the other Lich's to replace: 5 more cards.
    expect(t.players[bp]!.life).toBe(life2);
    expect(t.players[bp]!.hand.length).toBe(hand2 - 1 + 2 + 5 + 1);
  });

  it("lifelink combat damage is drawn instead, once the damage is dealt", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, lich());
    const n = putOnBattlefield(s0, ap, vampireNighthawk());
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: n, defender: opp }] });
    const life = s.players[ap]!.life;
    const hand = s.players[ap]!.hand.length;
    s = passUntil(s, "endCombat", ap);
    expect(s.players[opp]!.life).toBe(40 - 2);
    expect(s.players[ap]!.life).toBe(life);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
  });

  it("dealt damage: sacrifice that many nontoken permanents, all at once", () => {
    const { s: s0, ap, opp, ids } = setup([lightningBolt()]);
    const l = putOnBattlefield(s0, opp, lich());
    const b1 = putOnBattlefield(s0, opp, bear());
    const b2 = putOnBattlefield(s0, opp, bear({ name: "Runeclaw Bear" }));
    const b3 = putOnBattlefield(s0, opp, bear({ name: "Balduvian Bears" }));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [ptgt(opp)])), [opp]);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: opp, count: 3 });
    s = act(s, { type: "pickPermanents", player: opp, ids: [b1, b2, b3] });
    s = settle(s);
    for (const id of [b1, b2, b3]) expect(s.objects[id]!.zone).toBe("graveyard");
    expect(s.objects[l]!.zone).toBe("battlefield");
    expect(s.players[opp]!.lost).toBeFalsy();
  });

  it("with fewer nontoken permanents than that, none is sacrificed and its controller loses (as Egon's rulings read it)", () => {
    const { s: s0, ap, opp, ids } = setup([lightningBolt()]);
    putOnBattlefield(s0, opp, lich());
    for (const id of s0.battlefield.filter((x) => s0.objects[x]!.controller === opp && s0.cards[s0.objects[x]!.cardId]!.types.includes("Land"))) moveObject(s0, id, "graveyard");
    const b1 = putOnBattlefield(s0, opp, bear());
    invalidateCharacteristics(s0);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [ptgt(opp)])));
    expect(s.players[opp]!.lost).toBe(true);
    expect(logged(s, /sacrifices Grizzly Bears/)).toBe(false);
    void b1;
  });

  it("can't lose the game (Platinum Angel): with too few permanents nothing happens", () => {
    const { s: s0, ap, opp, ids } = setup([lightningBolt()]);
    putOnBattlefield(s0, opp, lich());
    putOnBattlefield(s0, opp, platinumAngel());
    for (const id of s0.battlefield.filter((x) => s0.objects[x]!.controller === opp && s0.cards[s0.objects[x]!.cardId]!.types.includes("Land"))) moveObject(s0, id, "graveyard");
    invalidateCharacteristics(s0);
    const before = nonland(s0, opp).length;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [ptgt(opp)])));
    expect(s.players[opp]!.lost).toBeFalsy();
    expect(nonland(s, opp).length).toBe(before);
  });

  it("when it's put into a graveyard from the battlefield, its controller loses", () => {
    const { s: s0, opp } = setup([]);
    const l = putOnBattlefield(s0, opp, lich());
    moveObject(s0, l, "graveyard");
    invalidateCharacteristics(s0);
    const s = settle(s0);
    expect(s.players[opp]!.lost).toBe(true);
  });
});

describe("Lane B round B253: Nefarious Lich", () => {
  it("damage to its controller isn't dealt: they choose that many graveyard cards to exile instead", () => {
    const { s: s0, ap, ids } = setup([skullcrack()]);
    const opp = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!;
    putOnBattlefield(s0, opp, nefariousLich());
    const yard = [bear(), bear({ name: "Runeclaw Bear" }), revitalize(), lightningBolt(), pyroclasm()].map((d) => inGraveyard(s0, opp, d));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [ptgt(opp)])), [opp]);
    // Skullcrack's "Damage can't be prevented" doesn't stop a replacement (CR 615.12): 3 cards, chosen one at a time.
    expect(shieldPrompt(s)).toMatchObject({ player: opp });
    expect(shieldPrompt(s)!.prompt).toMatch(/Nefarious Lich: exile 3 cards from your graveyard instead of the damage \(1 of 3\)/);
    s = answer(s, "Pyroclasm");
    s = answer(s, "Revitalize");
    s = answer(s, "Lightning Bolt");
    s = settle(s, [opp]);
    expect(s.players[opp]!.life).toBe(40);
    expect(yard.map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "graveyard", "exile", "exile", "exile"]);
    expect(s.players[opp]!.lost).toBeFalsy();
  });

  it("with fewer cards in the graveyard, none is exiled and its controller loses the game", () => {
    const { s: s0, ap, opp, ids } = setup([lightningBolt()]);
    putOnBattlefield(s0, opp, nefariousLich());
    const yard = [bear(), revitalize()].map((d) => inGraveyard(s0, opp, d));
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [ptgt(opp)])));
    expect(s.players[opp]!.lost).toBe(true);
    expect(yard.map((id) => s.objects[id]!.zone)).not.toContain("exile");
  });

  it("a painland's damage during a mana ability is replaced too, its cards chosen the way a bot would (lands first)", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, nefariousLich());
    const land = putOnBattlefield(s0, ap, sulfurousSprings());
    const yard = [revitalize(), swamp].map((d) => inGraveyard(s0, ap, d));
    const s = act(s0, { type: "activateMana", player: ap, objectId: land, mana: "B" });
    expect(s.players[ap]!.manaPool.B).toBe(1);
    expect(s.players[ap]!.life).toBe(40);
    expect(yard.map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "exile"]);
  });

  it("combat damage asks as it's dealt; a gain from lifelink is drawn instead", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, nefariousLich());
    const yard = [bear(), revitalize(), lightningBolt()].map((d) => inGraveyard(s0, opp, d));
    const b = putOnBattlefield(s0, ap, bear());
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    for (let i = 0; i < 40 && !shieldPrompt(s); i++) s = s.pending?.kind === "declareBlockers" ? act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] }) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(shieldPrompt(s)).toMatchObject({ player: opp });
    s = answer(s, "Grizzly Bears");
    s = answer(s, "Revitalize");
    s = passUntil(s, "endCombat", ap);
    expect(s.players[opp]!.life).toBe(40);
    expect(yard.map((id) => s.objects[id]!.zone)).toEqual(["exile", "exile", "graveyard"]);
  });
});

describe("Lane B round B253: Dralnu, Lich Lord", () => {
  it("damage to it isn't dealt: its controller chooses that many permanents to sacrifice, Dralnu among them if they like", () => {
    const { s: s0, ap, opp, ids } = setup([lightningBolt()]);
    const d = putOnBattlefield(s0, opp, dralnu());
    const b1 = putOnBattlefield(s0, opp, bear());
    const b2 = putOnBattlefield(s0, opp, bear({ name: "Runeclaw Bear" }));
    const b3 = putOnBattlefield(s0, opp, bear({ name: "Balduvian Bears" }));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(d)])), [opp]);
    expect(shieldPrompt(s)!.prompt).toMatch(/Dralnu, Lich Lord: sacrifice 3 permanents instead of the damage \(1 of 3\)/);
    s = answer(s, "Grizzly Bears");
    s = answer(s, "Dralnu, Lich Lord");
    s = answer(s, "Runeclaw Bear");
    s = settle(s, [opp]);
    for (const id of [d, b1, b2]) expect(s.objects[id]!.zone).toBe("graveyard");
    expect(s.objects[b3]!.zone).toBe("battlefield");
    expect(s.objects[d]!.damage ?? 0).toBe(0);
    expect(logged(s, /isn't dealt; .* sacrifices that many permanents instead/)).toBe(true);
  });

  it("with more damage than permanents, all of them are sacrificed (rulings), without a question", () => {
    const { s: s0, ap, opp, ids } = setup([lightningBolt()]);
    for (const id of s0.battlefield.filter((x) => s0.objects[x]!.controller === opp)) moveObject(s0, id, "graveyard");
    const d = putOnBattlefield(s0, opp, dralnu());
    const b1 = putOnBattlefield(s0, opp, bear());
    invalidateCharacteristics(s0);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(d)])), [opp]);
    expect(shieldPrompt(s)).toBeUndefined();
    expect([d, b1].map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "graveyard"]);
  });

  it("a bot sacrifices what's worth least", () => {
    const { s: s0, ap, opp, ids } = setup([lightningBolt()]);
    const d = putOnBattlefield(s0, opp, dralnu());
    const nh = putOnBattlefield(s0, opp, vampireNighthawk());
    const lands = [swamp, swamp, swamp, swamp].map((l) => putOnBattlefield(s0, opp, l));
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(d)])));
    expect(s.objects[d]!.zone).toBe("battlefield");
    expect(s.objects[nh]!.zone).toBe("battlefield");
    expect(lands.filter((id) => s.objects[id]!.zone === "graveyard").length).toBe(3);
  });

  it("Pyroclasm: the creatures sacrificed are dealt their damage at the same time", () => {
    const { s: s0, ap, ids } = setup([pyroclasm()]);
    const opp = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!;
    const d = putOnBattlefield(s0, opp, dralnu());
    const b1 = putOnBattlefield(s0, opp, bear());
    const b2 = putOnBattlefield(s0, opp, bear({ name: "Runeclaw Bear" }));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), [opp]);
    s = answer(s, "Grizzly Bears");
    s = answer(s, "Runeclaw Bear");
    s = settle(s, [opp]);
    expect(s.objects[d]!.zone).toBe("battlefield");
    expect(s.objects[d]!.damage ?? 0).toBe(0);
    expect([b1, b2].map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "graveyard"]);
  });

  it("in combat, a creature sacrificed still deals its damage, but its own trigger on that damage doesn't trigger (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const d = putOnBattlefield(s0, opp, dralnu());
    const e = putOnBattlefield(s0, opp, sunhomeEnforcer());
    const b3 = putOnBattlefield(s0, opp, bear({ name: "Balduvian Bears" }));
    const a1 = putOnBattlefield(s0, ap, bear());
    const a2 = putOnBattlefield(s0, ap, bear({ name: "Runeclaw Bear" }));
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a1, defender: opp }, { attacker: a2, defender: opp }] });
    for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: d, attacker: a1 }, { blocker: e, attacker: a2 }] });
    for (let i = 0; i < 10 && s.pending?.kind === "declareBlockers"; i++) s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
    const life = s.players[opp]!.life;
    for (let i = 0; i < 40 && !shieldPrompt(s); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = answer(s, "Sunhome Enforcer");
    s = answer(s, "Balduvian Bears");
    s = passUntil(s, "endCombat", ap);
    expect([e, b3].map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "graveyard"]);
    // Runeclaw Bear was dealt the Enforcer's 2 damage and died; no life for its controller.
    expect(s.objects[a2]!.zone).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(life);
    expect(s.objects[d]!.zone).toBe("battlefield");
    expect(s.objects[a1]!.zone).toBe("graveyard");
  });
});
