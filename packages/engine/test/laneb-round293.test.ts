// Lane B round B293: Titania's Song ("Each noncreature artifact loses all abilities and becomes an artifact creature with power
// and toughness each equal to its mana value. If this enchantment leaves the battlefield, this effect continues until end of
// turn.", CR 205.1b, 611.3a, 613.6) and Soundwave, Sonic Spy ("Whenever one or more creature tokens you control deal combat
// damage to a player, exile target instant or sorcery card with mana value equal to the damage dealt from their graveyard.
// Copy it. You may cast the copy without paying its mana cost. If you do, convert Soundwave.", CR 608.2g, 701.28).

import { describe, expect, it } from "vitest";
import { act, bear, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, characteristics, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const titaniasSong = (): CardDef => ({"oracleId":"30ac0f06-3dd3-4827-8136-4cf8adbf9b12","name":"Titania's Song","manaCost":"{3}{G}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Each noncreature artifact loses all abilities and becomes an artifact creature with power and toughness each equal to its mana value. If this enchantment leaves the battlefield, this effect continues until end of turn.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/8/583a53af-2e2a-4f3f-8eab-bd874c6ed80a.jpg?1783948366","artUrl":"https://cards.scryfall.io/art_crop/front/5/8/583a53af-2e2a-4f3f-8eab-bd874c6ed80a.jpg?1783948366","commanderLegal":"legal","set":"atq","releasedAt":"1994-03-04","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const soundwave = (): CardDef => ({"oracleId":"cc18e782-a965-404f-96f1-348f3ed799fd","name":"Soundwave, Sonic Spy // Soundwave, Superior Captain","manaCost":"{1}{W}{U}{B}","cmc":4,"typeLine":"Legendary Artifact Creature — Robot // Legendary Artifact","supertypes":["Legendary"],"types":["Artifact","Creature"],"subtypes":["Robot"],"oracleText":"More Than Meets the Eye {2}{W}{U}{B} (You may cast this card converted for {2}{W}{U}{B}.)\nWhenever one or more creature tokens you control deal combat damage to a player, exile target instant or sorcery card with mana value equal to the damage dealt from their graveyard. Copy it. You may cast the copy without paying its mana cost. If you do, convert Soundwave.","power":"5","toughness":"4","colors":["B","U","W"],"colorIdentity":["B","U","W"],"keywords":["Convert","More Than Meets the Eye"],"imageUrl":"https://cards.scryfall.io/normal/front/8/7/8733cd6f-37e1-4e3a-bb25-7a238f04657e.jpg?1783919896","artUrl":"https://cards.scryfall.io/art_crop/front/8/7/8733cd6f-37e1-4e3a-bb25-7a238f04657e.jpg?1783919896","commanderLegal":"legal","set":"bot","releasedAt":"2022-11-18","rarity":"mythic","layout":"transform","gameChanger":false,"faces":[{"name":"Soundwave, Sonic Spy","manaCost":"{1}{W}{U}{B}","typeLine":"Legendary Artifact Creature — Robot","supertypes":["Legendary"],"types":["Artifact","Creature"],"subtypes":["Robot"],"oracleText":"More Than Meets the Eye {2}{W}{U}{B} (You may cast this card converted for {2}{W}{U}{B}.)\nWhenever one or more creature tokens you control deal combat damage to a player, exile target instant or sorcery card with mana value equal to the damage dealt from their graveyard. Copy it. You may cast the copy without paying its mana cost. If you do, convert Soundwave.","power":"5","toughness":"4","colors":["B","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/8/7/8733cd6f-37e1-4e3a-bb25-7a238f04657e.jpg?1783919896","artUrl":"https://cards.scryfall.io/art_crop/front/8/7/8733cd6f-37e1-4e3a-bb25-7a238f04657e.jpg?1783919896"},{"name":"Soundwave, Superior Captain","manaCost":"","typeLine":"Legendary Artifact","supertypes":["Legendary"],"types":["Artifact"],"subtypes":[],"oracleText":"Whenever you cast a spell with an odd mana value, convert Soundwave. If you do, create Ravage, a legendary 3/3 black Robot artifact creature token with menace and deathtouch.\nWhenever you cast a spell with an even mana value, convert Soundwave. If you do, create Laserbeak, a legendary 2/2 blue Robot artifact creature token with flying and hexproof.","colors":["B","U","W"],"colorIndicator":["B","U","W"],"imageUrl":"https://cards.scryfall.io/normal/back/8/7/8733cd6f-37e1-4e3a-bb25-7a238f04657e.jpg?1783919896","artUrl":"https://cards.scryfall.io/art_crop/back/8/7/8733cd6f-37e1-4e3a-bb25-7a238f04657e.jpg?1783919896"}]}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const mindStone = (): CardDef => ({"oracleId":"c97361b5-af16-4a7b-af85-a429dbaf4ad2","name":"Mind Stone","manaCost":"{2}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/7/f/7fdef0b6-a3b9-4752-bce6-53c0140a1693.jpg?1783906237","artUrl":"https://cards.scryfall.io/art_crop/front/7/f/7fdef0b6-a3b9-4752-bce6-53c0140a1693.jpg?1783906237","commanderLegal":"legal","set":"fic","releasedAt":"2025-06-13","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const disenchant = (): CardDef => ({"oracleId":"a7e97fa9-4b72-4548-b854-5be5f18a6f1a","name":"Disenchant","manaCost":"{1}{W}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target artifact or enchantment.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/5/658c5caa-d739-4d30-a512-43ac4de900cb.jpg?1783920133","artUrl":"https://cards.scryfall.io/art_crop/front/6/5/658c5caa-d739-4d30-a512-43ac4de900cb.jpg?1783920133","commanderLegal":"legal","set":"bro","releasedAt":"2022-11-18","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const nightsWhisper = (): CardDef => ({"oracleId":"7ffae8f8-3006-4969-a339-6d30678f87ea","name":"Night's Whisper","manaCost":"{1}{B}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"You draw two cards and lose 2 life.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/e/1ed2b60b-5f20-4ae6-93fb-51540ad9c9e7.jpg?1783903240","artUrl":"https://cards.scryfall.io/art_crop/front/1/e/1ed2b60b-5f20-4ae6-93fb-51540ad9c9e7.jpg?1783903240","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const opt = (): CardDef => ({"oracleId":"713332c1-5bd8-400f-bfff-c1ca0697a043","name":"Opt","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card.","colors":["U"],"colorIdentity":["U"],"keywords":["Scry"],"imageUrl":"https://cards.scryfall.io/normal/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","artUrl":"https://cards.scryfall.io/art_crop/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","commanderLegal":"legal","set":"sld","releasedAt":"2025-07-25","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const darksteelRelic = (): CardDef => ({"oracleId":"2bda1fb1-528c-4e66-89f1-bb1a85e9181e","name":"Darksteel Relic","manaCost":"{0}","cmc":0,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"Indestructible (Effects that say \"destroy\" don't destroy this artifact.)","colors":[],"colorIdentity":[],"keywords":["Indestructible"],"imageUrl":"https://cards.scryfall.io/normal/front/0/f/0fd8c918-62d9-41be-a3e1-32ddac71b7e7.jpg?1783941297","artUrl":"https://cards.scryfall.io/art_crop/front/0/f/0fd8c918-62d9-41be-a3e1-32ddac71b7e7.jpg?1783941297","commanderLegal":"legal","set":"nph","releasedAt":"2011-05-13","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const autumnsVeil = (): CardDef => ({"oracleId":"03f5946b-e000-4b39-a49f-1c31668b51bd","name":"Autumn's Veil","manaCost":"{G}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Spells you control can't be countered by blue or black spells this turn, and creatures you control can't be the targets of blue or black spells this turn.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/e/7e354ce5-b4c1-4a9c-99d1-7624301b594b.jpg?1783941801","artUrl":"https://cards.scryfall.io/art_crop/front/7/e/7e354ce5-b4c1-4a9c-99d1-7624301b594b.jpg?1783941801","commanderLegal":"legal","set":"m11","releasedAt":"2010-07-16","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
/** Everyone passes until the stack is empty (no blocks); stops at any other question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
const ch = (s: GameState, id: ObjectId) => characteristics(s, s.objects[id]!);
const pt = (s: GameState, id: ObjectId) => `${ch(s, id).power}/${ch(s, id).toughness}`;
const isCreature = (s: GameState, id: ObjectId) => ch(s, id).types.includes("Creature");
const manaAbilities = (s: GameState, id: ObjectId) => abilitiesOf(s, s.objects[id]!).mana.length + abilitiesOf(s, s.objects[id]!).activated.length;

describe("Lane B round B293: Titania's Song", () => {
  it("compiles fully", () => {
    supported(titaniasSong(), solRing(), mindStone(), disenchant(), darksteelRelic(), ornithopter());
  });

  it("each noncreature artifact, anyone's, loses all abilities and is an artifact creature with P/T equal to its mana value", () => {
    const { s, ap, opp } = setup([]);
    const ring = putOnBattlefield(s, opp, solRing());
    const stone = putOnBattlefield(s, ap, mindStone());
    const thopter = putOnBattlefield(s, opp, ornithopter());
    invalidateCharacteristics(s);
    expect(manaAbilities(s, ring)).toBeGreaterThan(0);
    putOnBattlefield(s, ap, titaniasSong());
    invalidateCharacteristics(s);
    expect(ch(s, ring).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(pt(s, ring)).toBe("1/1");
    expect(manaAbilities(s, ring)).toBe(0);
    expect(pt(s, stone)).toBe("2/2");
    expect(manaAbilities(s, stone)).toBe(0);
    // An artifact creature isn't a noncreature artifact: it keeps its abilities and its own P/T.
    expect(pt(s, thopter)).toBe("0/2");
    expect(ch(s, thopter).keywords).toContain("Flying");
    // Not locked in (CR 611.3a): an artifact that enters later is affected too.
    const later = putOnBattlefield(s, opp, mindStone());
    invalidateCharacteristics(s);
    expect(pt(s, later)).toBe("2/2");
    expect(isCreature(s, later)).toBe(true);
  });

  it("a mana value 0 artifact is a 0/0 that loses indestructible, so it's put into the graveyard (CR 704.5f)", () => {
    const { s: s0, ap, ids, opp } = setup([disenchant()]);
    const relic = putOnBattlefield(s0, opp, darksteelRelic());
    putOnBattlefield(s0, ap, titaniasSong());
    const ring = putOnBattlefield(s0, opp, solRing());
    invalidateCharacteristics(s0);
    expect(ch(s0, relic).keywords).not.toContain("Indestructible");
    // State-based actions are checked when a player would receive priority.
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(ring)])));
    expect(s.objects[relic]!.zone).toBe("graveyard");
  });

  it("once it leaves the battlefield the effect goes on until end of turn, still not locked in, then ends", () => {
    const { s: s0, ap, ids, opp } = setup([disenchant()]);
    const ring = putOnBattlefield(s0, opp, solRing());
    const song = putOnBattlefield(s0, ap, titaniasSong());
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(song)])));
    expect(s.objects[song]!.zone).toBe("graveyard");
    expect(isCreature(s, ring)).toBe(true);
    expect(pt(s, ring)).toBe("1/1");
    expect(manaAbilities(s, ring)).toBe(0);
    expect(s.log.some((l) => /Titania's Song has left the battlefield; its effect continues until end of turn/.test(l.text))).toBe(true);
    // A noncreature artifact that enters after it left is affected too (CR 611.3a: the effect isn't locked in).
    const stone = putOnBattlefield(s, ap, mindStone());
    invalidateCharacteristics(s);
    expect(pt(s, stone)).toBe("2/2");
    // The next turn: it ended in the cleanup step (CR 514.2).
    s = passUntil(s, "upkeep", opp);
    expect(isCreature(s, ring)).toBe(false);
    expect(manaAbilities(s, ring)).toBeGreaterThan(0);
    expect(isCreature(s, stone)).toBe(false);
  });

  it("a stored effect for a group isn't ended by another permanent leaving the battlefield (Autumn's Veil)", () => {
    const { s: s0, ap, ids, opp } = setup([autumnsVeil(), disenchant()]);
    const mine = putOnBattlefield(s0, ap, bear());
    const ring = putOnBattlefield(s0, opp, solRing());
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const veil = () => s.effects.filter((e) => e.sourceName === "Autumn's Veil" && e.group).length;
    expect(veil()).toBe(1);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(ring)])));
    expect(s.objects[ring]!.zone).toBe("graveyard");
    expect(veil()).toBe(1);
    expect(s.objects[mine]!.zone).toBe("battlefield");
  });
});

describe("Lane B round B293: Soundwave, Sonic Spy", () => {
  /**
   * The active player controls Soundwave, two 1/1 creature tokens and a nontoken 2/2; the opponent's graveyard has Opt (1),
   * Night's Whisper (2) and Divination (3), the third player's another Night's Whisper.
   */
  const board = () => {
    const { s, ap, opp } = setup([]);
    const third = s.turnOrder[(s.turnOrder.indexOf(ap) + 2) % 4]!;
    const sw = putOnBattlefield(s, ap, soundwave());
    const tokens = [0, 1].map(() => {
      const id = putOnBattlefield(s, ap, bear({ name: "Test Robot", power: "1", toughness: "1" }));
      s.objects[id]!.isToken = true;
      return id;
    });
    const real = putOnBattlefield(s, ap, bear());
    const o = into(s, opp, opt(), "graveyard");
    const nw = into(s, opp, nightsWhisper(), "graveyard");
    const div = into(s, opp, divination(), "graveyard");
    const elsewhere = into(s, third, nightsWhisper(), "graveyard");
    invalidateCharacteristics(s);
    return { s, ap, opp, third, sw, tokens, real, o, nw, div, elsewhere };
  };
  /** The tokens and the 2/2 attack the opponent unblocked; stops at the trigger's target. */
  const hit = (s0: GameState, ap: PlayerId, opp: PlayerId, attackers: ObjectId[]) => {
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: attackers.map((attacker) => ({ attacker, defender: opp })) });
    for (let i = 0; i < 300 && s.pending?.kind !== "chooseTargets"; i++) {
      const p = s.pending;
      if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
      else if (p) break;
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    return s;
  };

  it("compiles fully", () => {
    supported(soundwave(), nightsWhisper(), opt(), divination());
  });

  it("the target has exactly the mana value of the damage the tokens dealt, from that player's graveyard", () => {
    const { s: s0, ap, opp, tokens, real, o, nw, div, elsewhere } = board();
    const s = hit(s0, ap, opp, [...tokens, real]);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    expect(s.players[opp]!.life).toBe(40 - 4);
    // The tokens dealt 2 (the nontoken 2/2's damage doesn't count, rulings).
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(o)] })).toThrow();
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(div)] })).toThrow();
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(elsewhere)] })).toThrow();
    const ok = act(s, { type: "chooseTargets", player: ap, targets: [tgt(nw)] });
    expect(ok.stack.length).toBeGreaterThan(0);
  });

  it("no trigger without a token's damage; with one token, 1 damage, so only Opt can be the target", () => {
    const { s: s0, ap, opp, tokens, real, o, nw } = board();
    let s1 = act(passUntil(structuredClone(s0), "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: real, defender: opp }] });
    s1 = settle(s1);
    s1 = passUntil(s1, "main2", ap);
    expect(s1.players[opp]!.life).toBe(40 - 2);
    expect(s1.objects[o]!.zone).toBe("graveyard");
    expect(s1.objects[nw]!.zone).toBe("graveyard");
    const s2 = hit(s0, ap, opp, [tokens[0]!]);
    expect(s2.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    expect(() => act(s2, { type: "chooseTargets", player: ap, targets: [tgt(nw)] })).toThrow();
    const s3 = settle(act(s2, { type: "chooseTargets", player: ap, targets: [tgt(o)] }));
    expect(s3.objects[o]!.zone).toBe("exile");
  });

  it("casting the copy converts Soundwave; the card stays exiled", () => {
    const { s: s0, ap, opp, sw, tokens, nw } = board();
    let s = settle(act(hit(s0, ap, opp, tokens), { type: "chooseTargets", player: ap, targets: [tgt(nw)] }));
    expect(s.objects[nw]!.zone).toBe("exile");
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong" });
    s = act(s, { type: "chooseOption", player: ap, choice: nw });
    expect(s.pending).toMatchObject({ kind: "castFree" });
    const copy = s.pending?.kind === "castFree" ? s.pending.objectId : "";
    const hand = s.players[ap]!.hand.length;
    const life = s.players[ap]!.life;
    s = settle(run(s, planCast(s, ap, copy)));
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(s.players[ap]!.life).toBe(life - 2);
    expect(s.objects[sw]!.face).toBe(1);
    expect(ch(s, sw).name).toBe("Soundwave, Superior Captain");
    expect(isCreature(s, sw)).toBe(false);
    expect(s.objects[nw]!.zone).toBe("exile");
  });

  it("not casting the copy: no convert, the card stays exiled and the copy is gone", () => {
    const { s: s0, ap, opp, sw, tokens, nw } = board();
    let s = settle(act(hit(s0, ap, opp, tokens), { type: "chooseTargets", player: ap, targets: [tgt(nw)] }));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "none" }));
    expect(s.pending).toBeFalsy();
    expect(s.objects[sw]!.face).toBeUndefined();
    expect(ch(s, sw).name).toBe("Soundwave, Sonic Spy");
    expect(s.objects[nw]!.zone).toBe("exile");
  });
});
