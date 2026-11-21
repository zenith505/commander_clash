// Round 437 (Lane A): Pygmy Hippo ("Whenever ~ attacks and isn't blocked, you may have defending player activate a mana
// ability of each land they control and lose all unspent mana. If you do, ~ assigns no combat damage this turn and at the
// beginning of your next main phase this turn, you add an amount of {C} equal to the amount of mana that player lost this
// way."; CR 106.4, 510.1, 603.7c, 605.3a, 608.2c, 608.2h; Drain Power's piece from round B281).

import { describe, expect, it } from "vitest";
import { act, forest, island, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, invalidateCharacteristics, isFullySupported, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const hippo = (): CardDef => ({"oracleId":"0d39513a-1f05-4d9a-a772-745f4f1a3471","name":"Pygmy Hippo","manaCost":"{G}{U}","cmc":2,"typeLine":"Creature — Hippo","supertypes":[],"types":["Creature"],"subtypes":["Hippo"],"oracleText":"Whenever this creature attacks and isn't blocked, you may have defending player activate a mana ability of each land they control and lose all unspent mana. If you do, this creature assigns no combat damage this turn and at the beginning of your next main phase this turn, you add an amount of {C} equal to the amount of mana that player lost this way.","power":"2","toughness":"2","colors":["G","U"],"colorIdentity":["G","U"],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/2/e/2e3f6220-6ead-46b4-8663-57609ef5a12e.jpg?1783946978","artUrl":"https://cards.scryfall.io/art_crop/front/2/e/2e3f6220-6ead-46b4-8663-57609ef5a12e.jpg?1783946978","commanderLegal":"legal","set":"vis","releasedAt":"1997-02-03","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const yurlok = (): CardDef => ({"oracleId":"7baaf462-b0e6-4e21-86a7-73a883c4c9f7","name":"Yurlok of Scorch Thrash","manaCost":"{1}{B}{R}{G}","cmc":4,"typeLine":"Legendary Creature — Lizard Shaman","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Lizard","Shaman"],"oracleText":"Vigilance\nA player losing unspent mana causes that player to lose that much life.\n{1}, {T}: Each player adds {B}{R}{G}.","power":"4","toughness":"4","colors":["B","G","R"],"colorIdentity":["B","G","R"],"keywords":["Vigilance"],"producedMana":["B","G","R"],"imageUrl":"https://cards.scryfall.io/normal/front/e/a/ead8a1f5-6260-47fa-a649-43711ec5bbeb.jpg?1783928767","artUrl":"https://cards.scryfall.io/art_crop/front/e/a/ead8a1f5-6260-47fa-a649-43711ec5bbeb.jpg?1783928767","commanderLegal":"legal","set":"cmr","releasedAt":"2020-11-20","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const tundra = (): CardDef => ({"oracleId":"02418479-9455-417f-a6a1-004356faff37","name":"Tundra","manaCost":"","cmc":0,"typeLine":"Land — Plains Island","supertypes":[],"types":["Land"],"subtypes":["Plains","Island"],"oracleText":"({T}: Add {W} or {U}.)","colors":[],"colorIdentity":["U","W"],"keywords":[],"producedMana":["U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/a/0/a03e8c5b-f4ed-4fd7-ba05-db813ccc05eb.jpg?1783948659","artUrl":"https://cards.scryfall.io/art_crop/front/a/0/a03e8c5b-f4ed-4fd7-ba05-db813ccc05eb.jpg?1783948659","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const upwelling = (): CardDef => ({"oracleId":"420ff0f4-6056-4b40-9a28-fd4c23d6b81c","name":"Upwelling","manaCost":"{3}{G}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Players don't lose unspent mana as steps and phases end.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/5/d5c47cac-679f-4b48-977f-2fa149a6c3c3.jpg?1783942989","artUrl":"https://cards.scryfall.io/art_crop/front/d/5/d5c47cac-679f-4b48-977f-2fa149a6c3c3.jpg?1783942989","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes (no blocks) until `done` holds; any question of `me`'s stops it, others' answered as the bots would. */
const until = (s: GameState, done: (s: GameState) => boolean, me?: PlayerId) => {
  for (let i = 0; i < 600 && !done(s); i++) {
    const pid = waitingOn(s)!;
    const p = s.pending;
    if (p && p.player === me && p.kind !== "declareBlockers") return s;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (p) s = run(s, botActions(s, p.player));
    else s = act(s, { type: "passPriority", player: pid });
  }
  return s;
};
const total = (s: GameState, pid: PlayerId) => Object.values(s.players[pid]!.manaPool).reduce((a, b) => a + b, 0);
type May = Extract<NonNullable<GameState["pending"]>, { kind: "chooseMay" }>;

/** Pygmy Hippo attacks `opp`, unblocked: the may is asked of `ap`. `opp` has an untapped Forest and Island, plus `more`. */
const attack = (more: CardDef[] = []) => {
  const { s: s0, ap, opp } = setup([]);
  const h = putOnBattlefield(s0, ap, hippo());
  const lands = [forest, island, ...more].map((d) => putOnBattlefield(s0, opp, d));
  invalidateCharacteristics(s0);
  let s = passUntil(s0, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: h, defender: opp }] });
  s = until(s, (x) => x.pending?.kind === "chooseMay", ap);
  return { s, ap, opp, h, lands };
};

describe("Pygmy Hippo", () => {
  it("is fully supported", () => {
    expect(isFullySupported(hippo())).toBe(true);
  });

  it("yes: the defending player taps their lands and loses that mana and what they had; no combat damage; {C} for each in your postcombat main phase", () => {
    let { s, ap, opp, lands } = attack();
    expect((s.pending as May).player).toBe(ap);
    // Mana the defending player already had is lost too (CR 106.4).
    s.players[opp]!.manaPool.R = 1;
    const life = s.players[opp]!.life;
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = until(s, (x) => !x.stack.length && !x.pending, ap);
    expect(lands.every((id) => s.objects[id]!.tapped)).toBe(true);
    expect(total(s, opp)).toBe(0);
    expect(total(s, ap)).toBe(0);
    expect(s.log.some((l) => /loses all unspent mana \(\{U\}\{R\}\{G\}\)/.test(l.text))).toBe(true);
    s = until(s, (x) => x.step === "main2", ap);
    // No combat damage from the Hippo (CR 510.1).
    expect(s.players[opp]!.life).toBe(life);
    s = until(s, (x) => x.step === "main2" && !x.stack.length && !x.triggerQueue.length && !x.pending, ap);
    expect(s.players[ap]!.manaPool.C).toBe(3);
  });

  it("no: the lands stay untapped and the Hippo deals its 2 combat damage", () => {
    let { s, ap, opp, lands } = attack();
    const life = s.players[opp]!.life;
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    s = until(s, (x) => x.step === "main2" && !x.stack.length && !x.triggerQueue.length && !x.pending, ap);
    expect(lands.some((id) => s.objects[id]!.tapped)).toBe(false);
    expect(s.players[opp]!.life).toBe(life - 2);
    expect(s.players[ap]!.manaPool.C).toBe(0);
  });

  it("a land with a choice of mana: the defending player chooses which (Tundra)", () => {
    let { s, ap, opp, lands } = attack([tundra()]);
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = until(s, (x) => x.pending?.kind === "chooseOption", opp);
    const pend = s.pending as Extract<NonNullable<GameState["pending"]>, { kind: "chooseOption" }>;
    expect(pend.what).toBe("drainLand");
    expect(pend.player).toBe(opp);
    expect(pend.about).toBe(lands[2]);
    expect(pend.labels).toEqual(["Add {W}", "Add {U}"]);
    s = act(s, { type: "chooseOption", player: opp, choice: pend.options[0]! });
    s = until(s, (x) => !x.stack.length && !x.pending, ap);
    expect(s.objects[lands[2]!]!.tapped).toBe(true);
    expect(s.log.some((l) => /loses all unspent mana \(\{W\}\{U\}\{G\}\)/.test(l.text))).toBe(true);
    s = until(s, (x) => x.step === "main2" && !x.stack.length && !x.triggerQueue.length && !x.pending, ap);
    expect(s.players[ap]!.manaPool.C).toBe(3);
  });

  it("with no untapped land and no mana: still no combat damage, and no {C} later", () => {
    let { s, ap, opp, lands } = attack();
    for (const id of lands) s.objects[id]!.tapped = true;
    const life = s.players[opp]!.life;
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = until(s, (x) => x.step === "main2" && !x.stack.length && !x.triggerQueue.length && !x.pending, ap);
    expect(s.players[opp]!.life).toBe(life);
    expect(s.players[ap]!.manaPool.C).toBe(0);
  });

  it("Yurlok of Scorch Thrash: the defending player loses life for the mana lost this way", () => {
    let { s, ap, opp } = attack();
    putOnBattlefield(s, ap, yurlok());
    invalidateCharacteristics(s);
    const life = s.players[opp]!.life;
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = until(s, (x) => !x.stack.length && !x.pending, ap);
    expect(s.players[opp]!.life).toBe(life - 2);
  });

  it("Upwelling: the mana is lost anyway, and the {C} added in the postcombat main phase is what was lost", () => {
    let { s, ap, opp } = attack();
    putOnBattlefield(s, opp, upwelling());
    invalidateCharacteristics(s);
    s.players[opp]!.manaPool.B = 2;
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = until(s, (x) => x.step === "main2" && !x.stack.length && !x.triggerQueue.length && !x.pending, ap);
    expect(total(s, opp)).toBe(0);
    expect(s.players[ap]!.manaPool.C).toBe(4);
  });

  it("a bot attacking with it drains when that makes 3 or more mana and it has a spell to spend it on, not otherwise", () => {
    const yes = attack([forest]);
    const ap = yes.ap;
    yes.s.players[ap]!.hand = [];
    // Nothing to spend it on: the damage.
    expect((botActions(yes.s, ap) as { yes?: boolean }[])[0]!.yes).toBe(false);
    const spell = putOnBattlefield(yes.s, ap, yurlok());
    yes.s.battlefield.splice(yes.s.battlefield.indexOf(spell), 1);
    yes.s.objects[spell]!.zone = "hand";
    yes.s.players[ap]!.hand.push(spell);
    expect((botActions(yes.s, ap) as { yes?: boolean }[])[0]!.yes).toBe(true);
    // Two lands only: not enough, even with that spell in hand.
    const no = attack();
    const spell2 = putOnBattlefield(no.s, no.ap, yurlok());
    no.s.battlefield.splice(no.s.battlefield.indexOf(spell2), 1);
    no.s.objects[spell2]!.zone = "hand";
    no.s.players[no.ap]!.hand = [spell2];
    expect((botActions(no.s, no.ap) as { yes?: boolean }[])[0]!.yes).toBe(false);
  });
});
