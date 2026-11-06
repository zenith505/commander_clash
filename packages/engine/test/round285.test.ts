// Round 285: from the top of the popularity list. Each other creature becoming a copy that isn't legendary (Echoing
// Equation), a heroic trigger for any player's spell that may retarget it (Speedball, New Warrior), a ban on spells with a
// spell's mana value until your next turn (Living Breakthrough), converting only when the attackers have total power 8
// (Ultra Magnus, Armored Carrier), "convert it. If you do, there is an additional beginning phase" (Cyclonus), playing a
// snow permanent card from your graveyard that enters tapped (Kaldring, the Rimestaff), casting a creature spell from the
// damaged player's graveyard with mana of any color (Whispersteel Dagger), and damage that heals the damage already
// dealt (Wolverine, Fierce Fighter), excess damage sent to the creature's controller before converting (Megatron,
// Destructive Force), and cheaper abilities of cards in your graveyard while you control your commander (Convergence of
// Dominion).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";
import { moveObject } from "../src/game";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const ch = (s: GameState, id: string) => characteristics(s, s.objects[id]!);
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const into = (s: GameState, pid: PlayerId, def: CardDef, to: "hand" | "graveyard") => {
  const id = putOnBattlefield(s, pid, def);
  moveObject(s, id, to);
  return id;
};
const backFace = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.face = 1;
  invalidateCharacteristics(s);
  return id;
};
/** Taps every land `pid` controls but the ones named. */
const tapAllBut = (s: GameState, pid: PlayerId, keep: string[]) => {
  for (const id of s.battlefield) {
    const o = s.objects[id]!;
    if (o.controller === pid && ch(s, id).types.includes("Land") && !keep.includes(ch(s, id).name)) o.tapped = true;
  }
};
const shock = card("Test Shock", "Instant", "{R}", { oracleText: "Test Shock deals 2 damage to any target." });
const bolt = card("Test Bolt", "Instant", "{R}", { oracleText: "Test Bolt deals 3 damage to any target." });
const giant = (p = 4) => card(`Test Giant ${p}`, "Creature — Giant", "{3}{G}", { power: String(p), toughness: "4" });
const legend = () => card("Test Legend", "Legendary Creature — Elf", "{2}{G}", { power: "5", toughness: "5", oracleText: "Trample", keywords: ["Trample"] });

// Real oracle text (Scryfall).
const speedball = (): CardDef => ({"oracleId": "53d3ef8f-8e0f-4119-8cdc-a0bf076b4e91", "name": "Speedball, New Warrior", "manaCost": "{2}{U/R}", "cmc": 3, "typeLine": "Legendary Creature — Human Hero", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Human", "Hero"], "oracleText": "Whenever a player casts a spell that targets Speedball, he gets +2/+2 until end of turn. You may choose new targets for that spell.", "power": "2", "toughness": "2", "colors": ["R", "U"], "colorIdentity": ["R", "U"], "keywords": [], "commanderLegal": "legal", "set": "msh", "releasedAt": "2026-06-26", "rarity": "uncommon", "layout": "normal", "gameChanger": false}) as CardDef;
const wolverine = (): CardDef => ({"oracleId": "8429ba6a-6c06-4a83-a6ee-023b64b825f8", "name": "Wolverine, Fierce Fighter", "manaCost": "{2}{R}{G}", "cmc": 4, "typeLine": "Legendary Creature — Mutant Berserker Hero", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Mutant", "Berserker", "Hero"], "oracleText": "Haste\nWhen Wolverine enters, he fights up to one other target creature.\nIf damage would be dealt to Wolverine, instead that damage is dealt, but all other damage already dealt to him is healed.", "power": "3", "toughness": "5", "colors": ["G", "R"], "colorIdentity": ["G", "R"], "keywords": ["Heal", "Haste", "Fight"], "commanderLegal": "legal", "set": "msh", "releasedAt": "2026-06-26", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const jorn = (): CardDef => ({"oracleId": "bd43b485-e42e-4c20-adcb-799b0ce18a59", "name": "Jorn, God of Winter // Kaldring, the Rimestaff", "manaCost": "{2}{G}", "cmc": 3, "typeLine": "Legendary Snow Creature — God // Legendary Snow Artifact", "supertypes": ["Legendary", "Snow"], "types": ["Creature"], "subtypes": ["God"], "oracleText": "Whenever Jorn attacks, untap each snow permanent you control.", "power": "3", "toughness": "3", "colors": ["G"], "colorIdentity": ["B", "G", "U"], "keywords": [], "commanderLegal": "legal", "set": "khm", "releasedAt": "2021-02-05", "rarity": "rare", "layout": "modal_dfc", "gameChanger": false, "faces": [{"name": "Jorn, God of Winter", "manaCost": "{2}{G}", "typeLine": "Legendary Snow Creature — God", "supertypes": ["Legendary", "Snow"], "types": ["Creature"], "subtypes": ["God"], "oracleText": "Whenever Jorn attacks, untap each snow permanent you control.", "power": "3", "toughness": "3", "colors": ["G"]}, {"name": "Kaldring, the Rimestaff", "manaCost": "{1}{U}{B}", "typeLine": "Legendary Snow Artifact", "supertypes": ["Legendary", "Snow"], "types": ["Artifact"], "subtypes": [], "oracleText": "{T}: You may play target snow permanent card from your graveyard this turn. If you do, it enters tapped.", "colors": ["B", "U"]}]}) as CardDef;
const iteration = (): CardDef => ({"oracleId": "e711a213-2a6b-4b34-a788-95b6c0b7ba48", "name": "Inventive Iteration // Living Breakthrough", "manaCost": "{3}{U}", "cmc": 4, "typeLine": "Enchantment — Saga // Enchantment Creature — Moonfolk", "supertypes": [], "types": ["Enchantment"], "subtypes": ["Saga"], "oracleText": "(As this Saga enters and after your draw step, add a lore counter.)\nI — Return up to one target creature or planeswalker to its owner's hand.\nII — Return an artifact card from your graveyard to your hand. If you can't, draw a card.\nIII — Exile this Saga, then return it to the battlefield transformed under your control.", "colors": ["U"], "colorIdentity": ["U"], "keywords": ["Flying", "Transform"], "commanderLegal": "legal", "set": "neo", "releasedAt": "2022-02-18", "rarity": "rare", "layout": "transform", "gameChanger": false, "faces": [{"name": "Inventive Iteration", "manaCost": "{3}{U}", "typeLine": "Enchantment — Saga", "supertypes": [], "types": ["Enchantment"], "subtypes": ["Saga"], "oracleText": "(As this Saga enters and after your draw step, add a lore counter.)\nI — Return up to one target creature or planeswalker to its owner's hand.\nII — Return an artifact card from your graveyard to your hand. If you can't, draw a card.\nIII — Exile this Saga, then return it to the battlefield transformed under your control.", "colors": ["U"]}, {"name": "Living Breakthrough", "manaCost": "", "typeLine": "Enchantment Creature — Moonfolk", "supertypes": [], "types": ["Enchantment", "Creature"], "subtypes": ["Moonfolk"], "oracleText": "Flying\nWhenever you cast a spell, your opponents can't cast spells with the same mana value as that spell until your next turn.", "power": "3", "toughness": "3", "colors": ["U"], "colorIndicator": ["U"]}]}) as CardDef;
const pugilist = (): CardDef => ({"oracleId": "9110339d-72ba-4132-801f-cd2fd738b71d", "name": "Augmenter Pugilist // Echoing Equation", "manaCost": "{1}{G}{G}", "cmc": 3, "typeLine": "Creature — Troll Druid // Sorcery", "supertypes": [], "types": ["Creature"], "subtypes": ["Troll", "Druid"], "oracleText": "Trample\nAs long as you control eight or more lands, this creature gets +5/+5.", "power": "3", "toughness": "3", "colors": ["G"], "colorIdentity": ["G", "U"], "keywords": ["Trample"], "commanderLegal": "legal", "set": "stx", "releasedAt": "2021-04-23", "rarity": "rare", "layout": "modal_dfc", "gameChanger": false, "faces": [{"name": "Augmenter Pugilist", "manaCost": "{1}{G}{G}", "typeLine": "Creature — Troll Druid", "supertypes": [], "types": ["Creature"], "subtypes": ["Troll", "Druid"], "oracleText": "Trample\nAs long as you control eight or more lands, this creature gets +5/+5.", "power": "3", "toughness": "3", "colors": ["G"]}, {"name": "Echoing Equation", "manaCost": "{3}{U}{U}", "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "Choose target creature you control. Each other creature you control becomes a copy of it until end of turn, except those creatures aren't legendary.", "colors": ["U"]}]}) as CardDef;
const magnus = (): CardDef => ({"oracleId": "48e913c0-efeb-47f5-9dcb-b795751e6b6d", "name": "Ultra Magnus, Tactician // Ultra Magnus, Armored Carrier", "manaCost": "{4}{R}{G}{W}", "cmc": 7, "typeLine": "Legendary Artifact Creature — Robot // Legendary Artifact — Vehicle", "supertypes": ["Legendary"], "types": ["Artifact", "Creature"], "subtypes": ["Robot"], "oracleText": "More Than Meets the Eye {2}{R}{G}{W} (You may cast this card converted for {2}{R}{G}{W}.)\nWard {2}\nWhenever Ultra Magnus attacks, you may put an artifact creature card from your hand onto the battlefield tapped and attacking. If you do, convert Ultra Magnus at end of combat.", "power": "7", "toughness": "7", "colors": ["G", "R", "W"], "colorIdentity": ["G", "R", "W"], "keywords": ["Living metal", "Haste", "Convert", "More Than Meets the Eye", "Ward", "Formidable"], "commanderLegal": "legal", "set": "bot", "releasedAt": "2022-11-18", "rarity": "mythic", "layout": "transform", "gameChanger": false, "faces": [{"name": "Ultra Magnus, Tactician", "manaCost": "{4}{R}{G}{W}", "typeLine": "Legendary Artifact Creature — Robot", "supertypes": ["Legendary"], "types": ["Artifact", "Creature"], "subtypes": ["Robot"], "oracleText": "More Than Meets the Eye {2}{R}{G}{W} (You may cast this card converted for {2}{R}{G}{W}.)\nWard {2}\nWhenever Ultra Magnus attacks, you may put an artifact creature card from your hand onto the battlefield tapped and attacking. If you do, convert Ultra Magnus at end of combat.", "power": "7", "toughness": "7", "colors": ["G", "R", "W"]}, {"name": "Ultra Magnus, Armored Carrier", "manaCost": "", "typeLine": "Legendary Artifact — Vehicle", "supertypes": ["Legendary"], "types": ["Artifact"], "subtypes": ["Vehicle"], "oracleText": "Living metal (During your turn, this Vehicle is also a creature.)\nHaste\nFormidable — Whenever Ultra Magnus attacks, attacking creatures you control gain indestructible until end of turn. If those creatures have total power 8 or greater, convert Ultra Magnus.", "power": "4", "toughness": "7", "colors": ["G", "R", "W"], "colorIndicator": ["G", "R", "W"]}]}) as CardDef;
const dagger = (): CardDef => ({"oracleId": "ca59fbf4-c774-49d3-8630-108c053e01fb", "name": "Whispersteel Dagger", "manaCost": "{2}{B}", "cmc": 3, "typeLine": "Artifact — Equipment", "supertypes": [], "types": ["Artifact"], "subtypes": ["Equipment"], "oracleText": "Equipped creature gets +2/+0.\nWhenever equipped creature deals combat damage to a player, you may cast a creature spell from that player's graveyard this turn, and you may spend mana as though it were mana of any color to cast that spell.\nEquip {3}", "colors": ["B"], "colorIdentity": ["B"], "keywords": ["Equip"], "commanderLegal": "legal", "set": "znc", "releasedAt": "2020-09-25", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const cyclonus = (): CardDef => ({"oracleId": "7ead01b9-def3-4f9d-a860-af64e94cb45e", "name": "Cyclonus, the Saboteur // Cyclonus, Cybertronian Fighter", "manaCost": "{2}{U}{B}", "cmc": 4, "typeLine": "Legendary Artifact Creature — Robot // Legendary Artifact — Vehicle", "supertypes": ["Legendary"], "types": ["Artifact", "Creature"], "subtypes": ["Robot"], "oracleText": "More Than Meets the Eye {5}{U}{B} (You may cast this card converted for {5}{U}{B}.)\nFlying\nWhenever Cyclonus deals combat damage to a player, it connives. Then if Cyclonus's power is 5 or greater, convert it. (To have a creature connive, draw a card, then discard a card. If you discarded a nonland card, put a +1/+1 counter on that creature.)", "power": "2", "toughness": "5", "colors": ["B", "U"], "colorIdentity": ["B", "U"], "keywords": ["Flying", "Living metal", "Convert", "More Than Meets the Eye", "Connive"], "commanderLegal": "legal", "set": "bot", "releasedAt": "2022-11-18", "rarity": "mythic", "layout": "transform", "gameChanger": false, "faces": [{"name": "Cyclonus, the Saboteur", "manaCost": "{2}{U}{B}", "typeLine": "Legendary Artifact Creature — Robot", "supertypes": ["Legendary"], "types": ["Artifact", "Creature"], "subtypes": ["Robot"], "oracleText": "More Than Meets the Eye {5}{U}{B} (You may cast this card converted for {5}{U}{B}.)\nFlying\nWhenever Cyclonus deals combat damage to a player, it connives. Then if Cyclonus's power is 5 or greater, convert it. (To have a creature connive, draw a card, then discard a card. If you discarded a nonland card, put a +1/+1 counter on that creature.)", "power": "2", "toughness": "5", "colors": ["B", "U"]}, {"name": "Cyclonus, Cybertronian Fighter", "manaCost": "", "typeLine": "Legendary Artifact — Vehicle", "supertypes": ["Legendary"], "types": ["Artifact"], "subtypes": ["Vehicle"], "oracleText": "Living metal (During your turn, this Vehicle is also a creature.)\nFlying\nWhenever Cyclonus deals combat damage to a player, convert it. If you do, there is an additional beginning phase after this phase. (The beginning phase includes the untap, upkeep, and draw steps.)", "power": "5", "toughness": "5", "colors": ["B", "U"], "colorIndicator": ["B", "U"]}]}) as CardDef;

const stun = card("Test Stun", "Instant", "{1}{R}", { oracleText: "Tap target creature." });
/** Declares these attacks on `ap`'s turn and passes to the second main phase, answering nothing else. */
const attackThrough = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) => {
  s = passUntil(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks });
  return passUntil(s, "main2", ap);
};

describe("round 285", () => {
  it("every card of the round compiles fully", () => {
    supported(speedball(), wolverine(), jorn(), iteration(), pugilist(), magnus(), dagger(), cyclonus(), megatron(), convergence());
  });
});

describe("Echoing Equation", () => {
  it("each other creature you control becomes a copy of the target until end of turn, except not legendary", () => {
    const { s: s0, ap, ids, opp } = setup([pugilist()]);
    const lord = putOnBattlefield(s0, ap, legend());
    const b1 = putOnBattlefield(s0, ap, bear());
    const b2 = putOnBattlefield(s0, ap, giant());
    const theirs = putOnBattlefield(s0, opp, bear());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(lord)], undefined, "auto", undefined, { face: 1 })));
    for (const id of [b1, b2]) {
      expect([ch(s, id).name, ch(s, id).power, ch(s, id).toughness, ch(s, id).keywords, ch(s, id).supertypes]).toEqual(["Test Legend", 5, 5, ["Trample"], []]);
    }
    // The target itself keeps being legendary; an opponent's creature isn't touched; the legend rule doesn't apply.
    expect(ch(s, lord).supertypes).toEqual(["Legendary"]);
    expect(ch(s, theirs).name).toBe("Grizzly Bears");
    expect([lord, b1, b2].every((id) => zone(s, id) === "battlefield")).toBe(true);
    s = passUntil(s, "upkeep", opp);
    expect(ch(s, b1).name).toBe("Grizzly Bears");
    expect(ch(s, b2).name).toBe("Test Giant 4");
  });
});

describe("Speedball, New Warrior", () => {
  it("another player's spell that targets it: +2/+2, and its controller may choose new targets for that spell", () => {
    const { s: s0, ap, ids, opp } = setup([shock]);
    const sb = putOnBattlefield(s0, opp, speedball());
    const mine = putOnBattlefield(s0, ap, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(sb)], undefined, "auto"));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "newTargets", player: opp });
    expect(ch(s, sb).power).toBe(4);
    s = settle(act(s, { type: "newTargets", player: opp, targets: [tgt(mine)] }));
    expect(zone(s, mine)).toBe("graveyard");
    expect(s.objects[sb]!.damage).toBe(0);
    expect([ch(s, sb).power, ch(s, sb).toughness]).toEqual([4, 4]);
  });

  it("its controller's own spell triggers it too, and keeping the targets is allowed", () => {
    const { s: s0, ap, ids } = setup([shock]);
    const sb = putOnBattlefield(s0, ap, speedball());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(sb)], undefined, "auto")));
    expect(s.pending).toMatchObject({ kind: "newTargets", player: ap });
    s = settle(act(s, { type: "newTargets", player: ap }));
    // Shock's 2 damage to a 4/4 now.
    expect(zone(s, sb)).toBe("battlefield");
    expect(s.objects[sb]!.damage).toBe(2);
  });

  it("a spell that targets another creature doesn't trigger it", () => {
    const { s: s0, ap, ids, opp } = setup([shock]);
    const sb = putOnBattlefield(s0, opp, speedball());
    const theirs = putOnBattlefield(s0, opp, bear());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(theirs)], undefined, "auto")));
    expect(s.pending).toBeFalsy();
    expect(ch(s, sb).power).toBe(2);
    expect(zone(s, theirs)).toBe("graveyard");
  });
});

describe("Living Breakthrough", () => {
  it("your opponents can't cast spells with the same mana value until your next turn; other mana values are fine", () => {
    const { s: s0, ap, ids, opp } = setup([bear()]);
    const lb = backFace(s0, ap, iteration());
    expect(ch(s0, lb).name).toBe("Living Breakthrough");
    const st = into(s0, opp, stun, "hand");
    const sh = into(s0, opp, shock, "hand");
    s0.players[opp]!.manaPool.R = 4;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto")));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    s = act(s, { type: "passPriority", player: ap });
    expect(s.priority).toBe(opp);
    expect(planCast(s, opp, st, [tgt(ids[0]!)], undefined, "auto")).toBeNull();
    expect(planCast(s, opp, sh, [tgt(ids[0]!)], undefined, "auto")).not.toBeNull();
    // Still during the opponent's own turn.
    s = passUntil(s, "upkeep", opp);
    expect(s.cantCastThisTurn?.some((c) => c.player === opp && c.mv === 2)).toBe(true);
    // Gone once your next turn begins (CR 611.2b).
    s = passUntil(s, "upkeep", ap);
    expect(s.cantCastThisTurn?.some((c) => c.player === opp && c.mv === 2) ?? false).toBe(false);
  });

  it("the spell's mana value counts X as cast (CR 202.3e)", () => {
    const fireball = card("Test Blaze", "Sorcery", "{X}{R}", { oracleText: "Test Blaze deals X damage to any target." });
    const { s: s0, ap, ids, opp } = setup([fireball]);
    backFace(s0, ap, iteration());
    const st = into(s0, opp, stun, "hand");
    s0.players[opp]!.manaPool.R = 4;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, "auto", 1)));
    expect(s.cantCastThisTurn?.find((c) => c.player === opp)?.mv).toBe(2);
    s = act(s, { type: "passPriority", player: ap });
    expect(planCast(s, opp, st, [tgt(st)], undefined, "auto")).toBeNull();
  });
});

describe("Ultra Magnus, Armored Carrier", () => {
  it("attacking creatures you control gain indestructible; with total power 8 or greater it converts", () => {
    const { s: s0, ap, opp } = setup([]);
    const um = backFace(s0, ap, magnus());
    const g = putOnBattlefield(s0, ap, giant(4));
    expect(ch(s0, um).types).toContain("Creature");
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: um, defender: opp }, { attacker: g, defender: opp }] });
    s = settle(s);
    expect(ch(s, g).keywords).toContain("Indestructible");
    // 4 + 4 = 8: converted to Ultra Magnus, Tactician.
    expect(ch(s, um).name).toBe("Ultra Magnus, Tactician");
  });

  it("with less total power it gives indestructible but doesn't convert", () => {
    const { s: s0, ap, opp } = setup([]);
    const um = backFace(s0, ap, magnus());
    const g = putOnBattlefield(s0, ap, giant(3));
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: um, defender: opp }, { attacker: g, defender: opp }] });
    s = settle(s);
    expect(ch(s, g).keywords).toContain("Indestructible");
    expect(ch(s, um).keywords).toContain("Indestructible");
    expect(ch(s, um).name).toBe("Ultra Magnus, Armored Carrier");
  });
});

describe("Cyclonus, Cybertronian Fighter", () => {
  it("combat damage to a player converts it, and if it does, an additional beginning phase follows combat", () => {
    const { s: s0, ap, opp } = setup([]);
    const cy = backFace(s0, ap, cyclonus());
    const life = s0.players[opp]!.life;
    const s = attackThrough(s0, ap, [{ attacker: cy, defender: opp }]);
    expect(s.players[opp]!.life).toBe(life - 5);
    expect(ch(s, cy).name).toBe("Cyclonus, the Saboteur");
    expect(s.log.some((l) => /An additional beginning phase begins/.test(typeof l === "string" ? l : JSON.stringify(l)))).toBe(true);
    // Its untap step untapped the attacker (CR 502.3).
    expect(s.objects[cy]!.tapped).toBe(false);
    expect(s.activePlayer).toBe(ap);
  });
});

describe("Kaldring, the Rimestaff", () => {
  const snowLand = card("Test Snow Forest", "Basic Snow Land — Forest", "", { oracleText: "({T}: Add {G}.)" });
  const snowBear = card("Test Snow Bear", "Snow Creature — Bear", "{1}{G}", { power: "2", toughness: "2" });
  it("a snow land played from your graveyard this turn enters tapped and is the turn's land play", () => {
    const { s: s0, ap } = setup([]);
    const k = backFace(s0, ap, jorn());
    expect(ch(s0, k).name).toBe("Kaldring, the Rimestaff");
    const land = into(s0, ap, snowLand, "graveyard");
    const plain = into(s0, ap, card("Test Plain Land", "Land", ""), "graveyard");
    // Not a snow card: not a legal target.
    expect(() => run(s0, planActivate(s0, ap, k, 0, [tgt(plain)]))).toThrow();
    let s = settle(run(s0, planActivate(s0, ap, k, 0, [tgt(land)])));
    expect(s.objects[land]!.mayPlay).toMatchObject({ tapped: true });
    s = act(s, { type: "playLand", player: ap, objectId: land });
    expect(zone(s, land)).toBe("battlefield");
    expect(s.objects[land]!.tapped).toBe(true);
    expect(s.players[ap]!.landsPlayedThisTurn).toBe(1);
  });

  it("a snow permanent spell cast this way enters tapped; the permission ends with the turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = backFace(s0, ap, jorn());
    const sb = into(s0, ap, snowBear, "graveyard");
    let s = settle(run(s0, planActivate(s0, ap, k, 0, [tgt(sb)])));
    s = settle(run(s, planCast(s, ap, sb, undefined, undefined, "auto", undefined, { via: "permission" })));
    expect(zone(s, sb)).toBe("battlefield");
    expect(s.objects[sb]!.tapped).toBe(true);
    // Another one targeted but not cast this turn stays in the graveyard and can't be cast next turn.
    const sb2 = into(s, ap, snowBear, "graveyard");
    s.objects[k]!.tapped = false;
    s = settle(run(s, planActivate(s, ap, k, 0, [tgt(sb2)])));
    s = passUntil(s, "main1", opp);
    s = passUntil(s, "main1", ap);
    expect(planCast(s, ap, sb2, undefined, undefined, "auto", undefined, { via: "permission" })).toBeNull();
  });
});

describe("Whispersteel Dagger", () => {
  const elk = () => card("Test Elk", "Creature — Elk", "{1}{G}{G}", { power: "3", toughness: "3" });
  it("one creature spell from the damaged player's graveyard this turn, paid with mana of any color", () => {
    const { s: s0, ap, opp } = setup([]);
    const other = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    const b = putOnBattlefield(s0, ap, bear());
    const d = putOnBattlefield(s0, ap, dagger());
    s0.objects[d]!.attachedTo = b;
    invalidateCharacteristics(s0);
    expect(ch(s0, b).power).toBe(4);
    const e1 = into(s0, opp, elk(), "graveyard");
    const e2 = into(s0, opp, elk(), "graveyard");
    const e3 = into(s0, other, elk(), "graveyard");
    let s = attackThrough(s0, ap, [{ attacker: b, defender: opp }]);
    expect(s.graveGrants?.some((g) => g.player === ap && g.fromYardOf === opp && g.anyType)).toBe(true);
    // Not from another player's graveyard.
    expect(planCast(s, ap, e3, undefined, undefined, "auto", undefined, { via: "turnPermission" })).toBeNull();
    // Only Mountains untapped: {1}{G}{G} paid with red mana.
    tapAllBut(s, ap, ["Mountain"]);
    s = settle(run(s, planCast(s, ap, e1, undefined, undefined, "auto", undefined, { via: "turnPermission" })));
    expect(zone(s, e1)).toBe("battlefield");
    expect(s.objects[e1]!.controller).toBe(ap);
    expect(s.objects[e1]!.owner).toBe(opp);
    // One spell for each time it triggered.
    for (const id of s.battlefield) if (ch(s, id).types.includes("Land")) s.objects[id]!.tapped = false;
    expect(planCast(s, ap, e2, undefined, undefined, "auto", undefined, { via: "turnPermission" })).toBeNull();
  });

  it("without the permission, the opponent's creature card can't be cast", () => {
    const { s, ap, opp } = setup([]);
    const e1 = into(s, opp, elk(), "graveyard");
    expect(planCast(s, ap, e1, undefined, undefined, "auto", undefined, { via: "turnPermission" })).toBeNull();
  });
});

describe("Wolverine, Fierce Fighter", () => {
  it("damage dealt to it heals the damage already dealt", () => {
    const { s: s0, ap, ids } = setup([bolt, shock, bolt]);
    const w = putOnBattlefield(s0, ap, wolverine());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(w)], undefined, "auto")));
    expect(s.objects[w]!.damage).toBe(3);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(w)], undefined, "auto")));
    expect(s.objects[w]!.damage).toBe(2);
    s = settle(run(s, planCast(s, ap, ids[2]!, [tgt(w)], undefined, "auto")));
    expect(zone(s, w)).toBe("battlefield");
    expect(s.objects[w]!.damage).toBe(3);
  });

  it("combat damage from two blockers is one event: both are dealt, and 6 damage kills it", () => {
    const { s: s0, ap, opp } = setup([]);
    const w = putOnBattlefield(s0, ap, wolverine());
    s0.objects[w]!.damage = 2;
    const b1 = putOnBattlefield(s0, opp, giant(3));
    const b2 = putOnBattlefield(s0, opp, giant(3));
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: w, defender: opp }] });
    for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: b1, attacker: w }, { blocker: b2, attacker: w }] });
    for (let i = 0; i < 40 && s.step !== "endCombat" && s.step !== "main2"; i++) {
      if (s.pending?.kind === "orderBlockers" || s.pending?.kind === "assignCombatDamage") break;
      s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    // The 2 damage from before is healed; the two blockers' 3 + 3 are both dealt (lethal for a 3/5).
    expect(zone(s, w)).toBe("graveyard");
  });

  it("a single blocker's damage heals what it had: it survives", () => {
    const { s: s0, ap, opp } = setup([]);
    const w = putOnBattlefield(s0, ap, wolverine());
    s0.objects[w]!.damage = 4;
    const b1 = putOnBattlefield(s0, opp, giant(3));
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: w, defender: opp }] });
    for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: b1, attacker: w }] });
    s = passUntil(s, "main2", ap);
    expect(zone(s, w)).toBe("battlefield");
    expect(s.objects[w]!.damage).toBe(3);
  });
});
const megatron = (): CardDef => ({"oracleId": "33e88072-3840-4090-8d0b-7fb38279e150", "name": "Megatron, Tyrant // Megatron, Destructive Force", "manaCost": "{3}{R}{W}{B}", "cmc": 6, "typeLine": "Legendary Artifact Creature — Robot // Legendary Artifact — Vehicle", "supertypes": ["Legendary"], "types": ["Artifact", "Creature"], "subtypes": ["Robot"], "oracleText": "More Than Meets the Eye {1}{R}{W}{B} (You may cast this card converted for {1}{R}{W}{B}.)\nYour opponents can't cast spells during combat.\nAt the beginning of each of your postcombat main phases, you may convert Megatron. If you do, add {C} for each 1 life your opponents have lost this turn.", "power": "7", "toughness": "5", "colors": ["B", "R", "W"], "colorIdentity": ["B", "R", "W"], "keywords": ["Living metal", "Convert", "More Than Meets the Eye"], "producedMana": ["C"], "commanderLegal": "legal", "set": "bot", "releasedAt": "2022-11-18", "rarity": "mythic", "layout": "transform", "gameChanger": false, "faces": [{"name": "Megatron, Tyrant", "manaCost": "{3}{R}{W}{B}", "typeLine": "Legendary Artifact Creature — Robot", "supertypes": ["Legendary"], "types": ["Artifact", "Creature"], "subtypes": ["Robot"], "oracleText": "More Than Meets the Eye {1}{R}{W}{B} (You may cast this card converted for {1}{R}{W}{B}.)\nYour opponents can't cast spells during combat.\nAt the beginning of each of your postcombat main phases, you may convert Megatron. If you do, add {C} for each 1 life your opponents have lost this turn.", "power": "7", "toughness": "5", "colors": ["B", "R", "W"]}, {"name": "Megatron, Destructive Force", "manaCost": "", "typeLine": "Legendary Artifact — Vehicle", "supertypes": ["Legendary"], "types": ["Artifact"], "subtypes": ["Vehicle"], "oracleText": "Living metal (During your turn, this Vehicle is also a creature.)\nWhenever Megatron attacks, you may sacrifice another artifact. When you do, Megatron deals damage equal to the sacrificed artifact's mana value to target creature. If excess damage would be dealt to that creature this way, instead that damage is dealt to that creature's controller and you convert Megatron.", "power": "4", "toughness": "5", "colors": ["B", "R", "W"], "colorIndicator": ["B", "R", "W"]}]}) as CardDef;
const convergence = (): CardDef => ({"oracleId": "655aece2-f33a-46e0-8f80-112ae8a457fe", "name": "Convergence of Dominion", "manaCost": "{3}", "cmc": 3, "typeLine": "Artifact", "supertypes": [], "types": ["Artifact"], "subtypes": [], "oracleText": "Dynastic Command Node — As long as you control your commander, activated abilities of cards in your graveyard cost {2} less to activate. This effect can't reduce the mana in that ability's activation cost to less than one mana.\nTranslocation Protocols — {3}, {T}: Mill three cards.", "colors": [], "colorIdentity": [], "keywords": ["Dynastic Command Node", "Translocation Protocols", "Mill"], "commanderLegal": "legal", "set": "40k", "releasedAt": "2022-10-07", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;

describe("Megatron, Destructive Force", () => {
  const relic = (mv: number) => card(`Test Relic ${mv}`, "Artifact", `{${mv}}`, {});
  const attackSacrifice = (s: GameState, ap: PlayerId, opp: PlayerId, meg: string, art: string, victim: string) => {
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: meg, defender: opp }] });
    s = settle(s);
    expect(s.pending?.kind).toBe("chooseMay");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    if (s.pending?.kind === "pickPermanents") s = settle(act(s, { type: "pickPermanents", player: ap, ids: [art] }));
    expect(s.pending?.kind).toBe("chooseTargets");
    return settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(victim)] }));
  };
  it("excess damage goes to the creature's controller instead, and then it converts", () => {
    const { s: s0, ap, opp } = setup([]);
    const meg = backFace(s0, ap, megatron());
    const art = putOnBattlefield(s0, ap, relic(5));
    const victim = putOnBattlefield(s0, opp, bear());
    const life = s0.players[opp]!.life;
    const s = attackSacrifice(s0, ap, opp, meg, art, victim);
    expect(zone(s, art)).toBe("graveyard");
    expect(zone(s, victim)).toBe("graveyard");
    // 5 damage to a 2/2: 2 to it, 3 to its controller.
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(ch(s, meg).name).toBe("Megatron, Tyrant");
  });

  it("with no excess damage, nothing goes to the player and it doesn't convert", () => {
    const { s: s0, ap, opp } = setup([]);
    const meg = backFace(s0, ap, megatron());
    const art = putOnBattlefield(s0, ap, relic(2));
    const victim = putOnBattlefield(s0, opp, giant(4));
    const life = s0.players[opp]!.life;
    const s = attackSacrifice(s0, ap, opp, meg, art, victim);
    expect(s.objects[victim]!.damage).toBe(2);
    expect(s.players[opp]!.life).toBe(life);
    expect(ch(s, meg).name).toBe("Megatron, Destructive Force");
  });
});

describe("Convergence of Dominion", () => {
  const ghoul = (cost: string) => card(`Test Ghoul ${cost}`, "Creature — Zombie", "{1}{B}", { power: "2", toughness: "2", oracleText: `Unearth ${cost}`, keywords: ["Unearth"] });
  const untapped = (s: GameState, ap: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === ap && !s.objects[id]!.tapped && ch(s, id).types.includes("Land")).length;
  it("while you control your commander, abilities of cards in your graveyard cost {2} less, not below one mana", () => {
    for (const withCommander of [true, false]) {
      const { s: s0, ap } = setup([]);
      putOnBattlefield(s0, ap, convergence());
      if (withCommander) putOnBattlefield(s0, ap, card("Test Commander Card", "Legendary Creature — Elf", "{1}{G}", { power: "1", toughness: "1" }), { commander: true });
      const g = into(s0, ap, ghoul("{3}{B}"), "graveyard");
      const before = untapped(s0, ap);
      const s = settle(run(s0, planActivate(s0, ap, g, 0)));
      expect(zone(s, g)).toBe("battlefield");
      expect(before - untapped(s, ap)).toBe(withCommander ? 2 : 4);
    }
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, convergence());
    putOnBattlefield(s0, ap, card("Test Commander Card", "Legendary Creature — Elf", "{1}{G}", { power: "1", toughness: "1" }), { commander: true });
    const g = into(s0, ap, ghoul("{2}"), "graveyard");
    const before = untapped(s0, ap);
    const s = settle(run(s0, planActivate(s0, ap, g, 0)));
    expect(before - untapped(s, ap)).toBe(1);
  });

  it("a permanent's activated ability costs as much as before", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, convergence());
    putOnBattlefield(s0, ap, card("Test Commander Card", "Legendary Creature — Elf", "{1}{G}", { power: "1", toughness: "1" }), { commander: true });
    const pinger = putOnBattlefield(s0, ap, card("Test Pinger", "Artifact", "{1}", { oracleText: "{3}, {T}: You gain 1 life." }));
    const before = untapped(s0, ap);
    const s = settle(run(s0, planActivate(s0, ap, pinger, 0)));
    expect(before - untapped(s, ap)).toBe(3);
  });
});
