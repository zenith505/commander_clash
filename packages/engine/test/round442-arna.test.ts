// Round 442 (Lane A): Arna Kennerüd, Skycaptain ("Whenever a modified creature you control attacks, double the number of
// each kind of counter on it. Then for each nontoken permanent attached to it, create a token that's a copy of that
// permanent attached to that creature.": CR 700.9, 701.10e, 707.2, 303.4h-i, 301.5e; rulings).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { characteristics, compileCard, controllerOf, invalidateCharacteristics, isFullySupported, power, toughness, waitingOn, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real card data (Scryfall).
const arna = (): CardDef => ({"oracleId":"436e7548-f8d5-43af-947d-b382da0d19b3","name":"Arna Kennerüd, Skycaptain","manaCost":"{2}{W}{U}{B}","cmc":5,"typeLine":"Legendary Creature — Human Knight","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Knight"],"oracleText":"Flying, lifelink\nWard—Discard a card.\nWhenever a modified creature you control attacks, double the number of each kind of counter on it. Then for each nontoken permanent attached to it, create a token that's a copy of that permanent attached to that creature.","power":"4","toughness":"4","colors":["B","U","W"],"colorIdentity":["B","U","W"],"keywords":["Flying","Lifelink","Ward","Double"],"imageUrl":"https://cards.scryfall.io/normal/front/1/9/19266b5a-ff78-436c-b0f1-457e80bb647e.jpg?1783911254","artUrl":"https://cards.scryfall.io/art_crop/front/1/9/19266b5a-ff78-436c-b0f1-457e80bb647e.jpg?1783911254","commanderLegal":"legal","set":"mh3","releasedAt":"2024-06-14","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const bonesplitter = (): CardDef => ({"oracleId":"452e3f5f-ce17-4682-966b-5cc100210aee","name":"Bonesplitter","manaCost":"{1}","cmc":1,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +2/+0.\nEquip {1}","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/a/e/ae31d513-7412-4467-b497-a7183ff29a42.jpg?1783944980","artUrl":"https://cards.scryfall.io/art_crop/front/a/e/ae31d513-7412-4467-b497-a7183ff29a42.jpg?1783944980","commanderLegal":"legal","set":"pal03","releasedAt":"2003-01-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const antiMagic = (): CardDef => ({"oracleId":"6f78c1e2-e38f-431b-8864-8aad982e9912","name":"Anti-Magic Aura","manaCost":"{2}{U}","cmc":3,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't be the target of spells and can't be enchanted by other Auras.","colors":["U"],"colorIdentity":["U"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/f/f/ff78eef1-efaa-4a12-bf5d-fec83c14aff8.jpg?1783948078","artUrl":"https://cards.scryfall.io/art_crop/front/f/f/ff78eef1-efaa-4a12-bf5d-fec83c14aff8.jpg?1783948078","commanderLegal":"legal","set":"leg","releasedAt":"1994-06-01","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const boonSatyr = (): CardDef => ({"oracleId":"aedcd2fb-813a-4915-b7b9-ac7479863462","name":"Boon Satyr","manaCost":"{1}{G}{G}","cmc":3,"typeLine":"Enchantment Creature — Satyr","supertypes":[],"types":["Enchantment","Creature"],"subtypes":["Satyr"],"oracleText":"Flash\nBestow {3}{G}{G} (If you cast this card for its bestow cost, it's an Aura spell with enchant creature. It becomes a creature again if it's not attached.)\nEnchanted creature gets +4/+2.","power":"4","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":["Bestow","Flash"],"imageUrl":"https://cards.scryfall.io/normal/front/f/5/f50c12c4-5565-449a-b30e-7cd896da7735.jpg?1783939748","artUrl":"https://cards.scryfall.io/art_crop/front/f/5/f50c12c4-5565-449a-b30e-7cd896da7735.jpg?1783939748","commanderLegal":"legal","set":"ths","releasedAt":"2013-09-27","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const spectralSteel = (): CardDef => ({"oracleId":"95f74c0d-3f89-4944-997e-1bdc408bae71","name":"Spectral Steel","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature gets +2/+2.\n{1}{W}, Exile this card from your graveyard: Return another target Aura or Equipment card from your graveyard to your hand.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/c/f/cf036489-ef9e-40ee-a1bb-24ee37c554f1.jpg?1783928275","artUrl":"https://cards.scryfall.io/art_crop/front/c/f/cf036489-ef9e-40ee-a1bb-24ee37c554f1.jpg?1783928275","commanderLegal":"legal","set":"khm","releasedAt":"2021-02-05","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

const attach = (s: GameState, id: ObjectId, host: ObjectId) => {
  s.objects[id]!.attachedTo = host;
  invalidateCharacteristics(s);
};
const named = (s: GameState, name: string, token: boolean) => s.battlefield.filter((id) => s.objects[id]!.isToken === token && characteristics(s, s.objects[id]!).name === name);
const pt = (s: GameState, id: ObjectId) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;

/** Attack with `attacker` and pass until the stack is empty again (the triggers resolved). */
const attackWith = (s: GameState, ap: PlayerId, opp: PlayerId, attacker: ObjectId) => {
  s = passUntil(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker, defender: opp }] });
  for (let i = 0; i < 50 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("Arna Kennerüd, Skycaptain", () => {
  it("parse: the attack trigger doubles each kind of counter, then copies what's attached", () => {
    expect(isFullySupported(arna())).toBe(true);
    const t = compileCard(arna()).triggers.find((x) => x.event === "creatureYouControlAttacks");
    expect(t?.attacker?.filter).toMatchObject({ status: "modified", controller: "you" });
    expect(t?.body.effects).toEqual([expect.objectContaining({ type: "counters", double: true, everyKind: true, what: { ref: "subject" } }), { type: "tokenCopiesOfAttached", what: { ref: "subject" } }]);
  });

  it("an equipped creature with a counter: two counters, and a Bonesplitter token attached to it", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, arna());
    const b = putOnBattlefield(s0, ap, bears());
    s0.objects[b]!.counters["+1/+1"] = 1;
    s0.objects[b]!.counters["oil"] = 2;
    const bs = putOnBattlefield(s0, ap, bonesplitter());
    attach(s0, bs, b);
    const s = attackWith(s0, ap, opp, b);
    expect(s.objects[b]!.counters["+1/+1"]).toBe(2);
    expect(s.objects[b]!.counters["oil"]).toBe(4); // each kind (CR 701.10e)
    const tokens = named(s, "Bonesplitter", true);
    expect(tokens.length).toBe(1);
    expect(s.objects[tokens[0]!]!.attachedTo).toBe(b);
    expect(controllerOf(s, s.objects[tokens[0]!]!)).toBe(ap);
    expect(s.objects[bs]!.attachedTo).toBe(b);
    expect(pt(s, b)).toBe("8/4"); // 2/2, two +1/+1 counters, two +2/+0
  });

  it("an unmodified creature attacking doesn't trigger it", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, arna());
    const b = putOnBattlefield(s0, ap, bears());
    putOnBattlefield(s0, ap, bonesplitter()); // not attached
    const s = attackWith(s0, ap, opp, b);
    expect(named(s, "Bonesplitter", true).length).toBe(0);
    expect(JSON.stringify(s.log).includes("Arna")).toBe(false);
  });

  it("an Aura token that can't enchant the creature isn't created; the Equipment token still is", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, arna());
    const b = putOnBattlefield(s0, ap, bears());
    const ama = putOnBattlefield(s0, ap, antiMagic());
    attach(s0, ama, b);
    const bs = putOnBattlefield(s0, ap, bonesplitter());
    attach(s0, bs, b);
    const s = attackWith(s0, ap, opp, b);
    // "Can't be enchanted by other Auras": the copy of Anti-Magic Aura can't be attached to it (CR 303.4i, rulings).
    expect(named(s, "Anti-Magic Aura", true).length).toBe(0);
    expect(Object.values(s.objects).filter((o) => o.isToken && s.cards[o.cardId]?.name === "Anti-Magic Aura").length).toBe(0);
    expect(named(s, "Bonesplitter", true).map((id) => s.objects[id]!.attachedTo)).toEqual([b]);
  });

  it("an opponent's Aura on your creature: your token copy, attached to it", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, arna());
    const b = putOnBattlefield(s0, ap, bears());
    s0.objects[b]!.counters["+1/+1"] = 1; // modified by its counter (an Aura another player controls doesn't count, rulings)
    const steel = putOnBattlefield(s0, opp, spectralSteel());
    attach(s0, steel, b);
    const s = attackWith(s0, ap, opp, b);
    const tokens = named(s, "Spectral Steel", true);
    expect(tokens.length).toBe(1);
    expect(s.objects[tokens[0]!]!.attachedTo).toBe(b);
    expect(controllerOf(s, s.objects[tokens[0]!]!)).toBe(ap);
    expect(pt(s, b)).toBe("8/8"); // 2/2, two counters, +2/+2 twice
  });

  it("only enchanted by an Aura an opponent controls: not modified, no trigger", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, arna());
    const b = putOnBattlefield(s0, ap, bears());
    const steel = putOnBattlefield(s0, opp, spectralSteel());
    attach(s0, steel, b);
    const s = attackWith(s0, ap, opp, b);
    expect(named(s, "Spectral Steel", true).length).toBe(0);
  });

  it("a bestowed Aura's copy is an enchantment creature token, entering unattached (CR 707.2, 303.4h)", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, arna());
    const b = putOnBattlefield(s0, ap, bears());
    const satyr = putOnBattlefield(s0, ap, boonSatyr());
    s0.objects[satyr]!.bestowed = true;
    attach(s0, satyr, b);
    expect(pt(s0, b)).toBe("6/4");
    const s = attackWith(s0, ap, opp, b);
    const tokens = named(s, "Boon Satyr", true);
    expect(tokens.length).toBe(1);
    const t = s.objects[tokens[0]!]!;
    expect(t.attachedTo).toBeUndefined();
    expect(characteristics(s, t).types).toEqual(expect.arrayContaining(["Enchantment", "Creature"]));
    expect(pt(s, tokens[0]!)).toBe("4/2");
    expect(pt(s, b)).toBe("6/4");
  });

  it("a token attached to it isn't copied, only the nontoken permanents", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, arna());
    const b = putOnBattlefield(s0, ap, bears());
    const bs = putOnBattlefield(s0, ap, bonesplitter());
    attach(s0, bs, b);
    const tok = putOnBattlefield(s0, ap, bonesplitter());
    s0.objects[tok]!.isToken = true;
    attach(s0, tok, b);
    const s = attackWith(s0, ap, opp, b);
    expect(named(s, "Bonesplitter", true).length).toBe(2); // the old token and one new one
  });
});
