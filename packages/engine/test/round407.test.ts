// Round 407 (Lane A): The Flood of Mars (a creature becomes a copy of it, a land an Island, CR 707.2, 305.6, rulings),
// Grub, Notorious Auntie (a token copy of the blighted creature, tapped and attacking, CR 701.68c, 707.9b), Optimus Prime,
// Autobot Leader (bolster 2, trample, and a delayed convert when that creature deals combat damage to a player, CR 603.7b,
// 701.27f) and Symbiote Spider-Man (Find New Host: the target gains the card's other abilities, CR 201.5b, 611.2a).

import { describe, expect, it } from "vitest";
import { act, forest, putOnBattlefield, setup } from "./helpers";
import { invalidateCharacteristics } from "../src/layers";
import { transformPermanent } from "../src/effects/run-permanents";
import { manaAbilitiesOn } from "../src/manaabilities";
import { applyAction, characteristics, isFullySupported, planActivate, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const flood = (): CardDef => ({"oracleId":"677bd655-b240-4862-912c-29209fb295e1","name":"The Flood of Mars","manaCost":"{2}{U}{U}","cmc":4,"typeLine":"Creature — Alien Zombie Horror","supertypes":[],"types":["Creature"],"subtypes":["Alien","Zombie","Horror"],"oracleText":"Islandwalk (This creature can't be blocked as long as defending player controls an Island.)\nWater Always Wins — Whenever this creature attacks, put a flood counter on another target creature or land. If it's a creature, it becomes a copy of this creature. If it's a land, it becomes an Island in addition to its other types.","power":"3","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Landwalk","Water Always Wins","Islandwalk"],"imageUrl":"https://cards.scryfall.io/normal/front/0/7/07c6b33d-c1c7-442b-91ac-d7ef56ce8fdd.jpg?1783914553","artUrl":"https://cards.scryfall.io/art_crop/front/0/7/07c6b33d-c1c7-442b-91ac-d7ef56ce8fdd.jpg?1783914553","commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const symbiote = (): CardDef => ({"oracleId":"bc681ecf-2a52-4782-9a47-90f5a9f435d8","name":"Symbiote Spider-Man","manaCost":"{2}{U/B}","cmc":3,"typeLine":"Legendary Creature — Symbiote Spider Hero","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Symbiote","Spider","Hero"],"oracleText":"Whenever this creature deals combat damage to a player, look at that many cards from the top of your library. Put one of them into your hand and the rest into your graveyard.\nFind New Host — {2}{U/B}, Exile this card from your graveyard: Put a +1/+1 counter on target creature you control. It gains this card's other abilities. Activate only as a sorcery.","power":"2","toughness":"4","colors":["B","U"],"colorIdentity":["B","U"],"keywords":["Find New Host"],"imageUrl":"https://cards.scryfall.io/normal/front/6/a/6a21c0ff-b51a-4946-9737-7872a7eef97b.jpg?1783905310","artUrl":"https://cards.scryfall.io/art_crop/front/6/a/6a21c0ff-b51a-4946-9737-7872a7eef97b.jpg?1783905310","commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const grub = (): CardDef => ({"oracleId":"180286e4-67fa-44d5-9e90-4a4e99c016a7","name":"Grub, Storied Matriarch // Grub, Notorious Auntie","manaCost":"{2}{B}","cmc":3,"typeLine":"Legendary Creature — Goblin Warlock // Legendary Creature — Goblin Warrior","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Goblin","Warlock"],"oracleText":"Menace\nWhenever this creature enters or transforms into Grub, Storied Matriarch, return up to one target Goblin card from your graveyard to your hand.\nAt the beginning of your first main phase, you may pay {R}. If you do, transform Grub.","power":"2","toughness":"1","colors":["B"],"colorIdentity":["B","R"],"keywords":["Blight","Transform","Menace"],"imageUrl":"https://cards.scryfall.io/normal/front/1/f/1f51adf8-8234-4dae-aedf-7633310d5111.jpg?1783904468","artUrl":"https://cards.scryfall.io/art_crop/front/1/f/1f51adf8-8234-4dae-aedf-7633310d5111.jpg?1783904468","commanderLegal":"legal","set":"ecl","releasedAt":"2026-01-23","rarity":"rare","layout":"transform","gameChanger":false,"faces":[{"name":"Grub, Storied Matriarch","manaCost":"{2}{B}","typeLine":"Legendary Creature — Goblin Warlock","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Goblin","Warlock"],"oracleText":"Menace\nWhenever this creature enters or transforms into Grub, Storied Matriarch, return up to one target Goblin card from your graveyard to your hand.\nAt the beginning of your first main phase, you may pay {R}. If you do, transform Grub.","power":"2","toughness":"1","colors":["B"],"imageUrl":"https://cards.scryfall.io/normal/front/1/f/1f51adf8-8234-4dae-aedf-7633310d5111.jpg?1783904468","artUrl":"https://cards.scryfall.io/art_crop/front/1/f/1f51adf8-8234-4dae-aedf-7633310d5111.jpg?1783904468"},{"name":"Grub, Notorious Auntie","manaCost":"","typeLine":"Legendary Creature — Goblin Warrior","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Goblin","Warrior"],"oracleText":"Menace\nWhenever Grub attacks, you may blight 1. If you do, create a tapped and attacking token that's a copy of the blighted creature, except it has \"At the beginning of the end step, sacrifice this token.\"\nAt the beginning of your first main phase, you may pay {B}. If you do, transform Grub.","power":"2","toughness":"1","colors":["R"],"colorIndicator":["R"],"imageUrl":"https://cards.scryfall.io/normal/back/1/f/1f51adf8-8234-4dae-aedf-7633310d5111.jpg?1783904468","artUrl":"https://cards.scryfall.io/art_crop/back/1/f/1f51adf8-8234-4dae-aedf-7633310d5111.jpg?1783904468"}]} as CardDef);
const optimus = (): CardDef => ({"oracleId":"199c4a1a-2082-417c-a174-f479d7334d15","name":"Optimus Prime, Hero // Optimus Prime, Autobot Leader","manaCost":"{3}{U}{R}{W}","cmc":6,"typeLine":"Legendary Artifact Creature — Robot // Legendary Artifact — Vehicle","supertypes":["Legendary"],"types":["Artifact","Creature"],"subtypes":["Robot"],"oracleText":"More Than Meets the Eye {2}{U}{R}{W} (You may cast this card converted for {2}{U}{R}{W}.)\nAt the beginning of each end step, bolster 1. (Choose a creature with the least toughness among creatures you control and put a +1/+1 counter on it.)\nWhen Optimus Prime dies, return it to the battlefield converted under its owner's control.","power":"4","toughness":"8","colors":["R","U","W"],"colorIdentity":["R","U","W"],"keywords":["Living metal","Trample","Convert","More Than Meets the Eye","Bolster"],"imageUrl":"https://cards.scryfall.io/normal/front/f/0/f04ed2cc-aae1-400b-9cc5-5d4e3e3dd714.jpg?1783919902","artUrl":"https://cards.scryfall.io/art_crop/front/f/0/f04ed2cc-aae1-400b-9cc5-5d4e3e3dd714.jpg?1783919902","commanderLegal":"legal","set":"bot","releasedAt":"2022-11-18","rarity":"mythic","layout":"transform","gameChanger":false,"faces":[{"name":"Optimus Prime, Hero","manaCost":"{3}{U}{R}{W}","typeLine":"Legendary Artifact Creature — Robot","supertypes":["Legendary"],"types":["Artifact","Creature"],"subtypes":["Robot"],"oracleText":"More Than Meets the Eye {2}{U}{R}{W} (You may cast this card converted for {2}{U}{R}{W}.)\nAt the beginning of each end step, bolster 1. (Choose a creature with the least toughness among creatures you control and put a +1/+1 counter on it.)\nWhen Optimus Prime dies, return it to the battlefield converted under its owner's control.","power":"4","toughness":"8","colors":["R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/f/0/f04ed2cc-aae1-400b-9cc5-5d4e3e3dd714.jpg?1783919902","artUrl":"https://cards.scryfall.io/art_crop/front/f/0/f04ed2cc-aae1-400b-9cc5-5d4e3e3dd714.jpg?1783919902"},{"name":"Optimus Prime, Autobot Leader","manaCost":"","typeLine":"Legendary Artifact — Vehicle","supertypes":["Legendary"],"types":["Artifact"],"subtypes":["Vehicle"],"oracleText":"Living metal (During your turn, this Vehicle is also a creature.)\nTrample\nWhenever you attack, bolster 2. The chosen creature gains trample until end of turn. When that creature deals combat damage to a player this turn, convert Optimus Prime.","power":"6","toughness":"8","colors":["R","U","W"],"colorIndicator":["R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/back/f/0/f04ed2cc-aae1-400b-9cc5-5d4e3e3dd714.jpg?1783919902","artUrl":"https://cards.scryfall.io/art_crop/back/f/0/f04ed2cc-aae1-400b-9cc5-5d4e3e3dd714.jpg?1783919902"}]} as CardDef);
const dryad = (): CardDef => ({"oracleId":"e996cd67-739c-40f4-b276-0042acf26c71","name":"Dryad Arbor","manaCost":"","cmc":0,"typeLine":"Land Creature — Forest Dryad","supertypes":[],"types":["Land","Creature"],"subtypes":["Forest","Dryad"],"oracleText":"(This land isn't a spell, it's affected by summoning sickness, and it has \"{T}: Add {G}.\")","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/5/c/5c4fb7f9-a551-4253-a46e-f6284d355388.jpg?1783904262","artUrl":"https://cards.scryfall.io/art_crop/front/5/c/5c4fb7f9-a551-4253-a46e-f6284d355388.jpg?1783904262","commanderLegal":"legal","set":"sld","releasedAt":"2026-02-02","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const angel = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","commanderLegal":"legal","set":"sld","releasedAt":"2023-10-02","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const ace = (): CardDef => ({"oracleId":"2f810936-2ba6-4c2b-84a0-ff4c1deb026b","name":"Fencing Ace","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature — Human Soldier","supertypes":[],"types":["Creature"],"subtypes":["Human","Soldier"],"oracleText":"Double strike (This creature deals both first-strike and regular combat damage.)","power":"1","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":["Double strike"],"imageUrl":"https://cards.scryfall.io/normal/front/a/4/a42d3066-f4ec-4d28-83ab-e48141206c72.jpg?1783940376","artUrl":"https://cards.scryfall.io/art_crop/front/a/4/a42d3066-f4ec-4d28-83ab-e48141206c72.jpg?1783940376","commanderLegal":"legal","set":"rtr","releasedAt":"2012-10-05","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const memnite = (): CardDef => ({"oracleId":"7663ac7c-1de3-4250-b96a-fae9dbd66a27","name":"Memnite","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Construct","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Construct"],"oracleText":"","power":"1","toughness":"1","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/6/469cc4e0-49c0-4009-97ea-28e44addec69.jpg?1783941703","artUrl":"https://cards.scryfall.io/art_crop/front/4/6/469cc4e0-49c0-4009-97ea-28e44addec69.jpg?1783941703","commanderLegal":"legal","set":"som","releasedAt":"2010-10-01","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: ObjectId): TargetChoice => ({ kind: "object", id });
const ch = (s: GameState, id: ObjectId) => characteristics(s, s.objects[id]!);
const pass = (s: GameState) => act(s, { type: "passPriority", player: waitingOn(s)! });
/** Pass priority until `stop` holds (or a question comes up that `stop` doesn't expect). */
function until(s0: GameState, stop: (s: GameState) => boolean, max = 200) {
  let s = s0;
  for (let i = 0; i < max; i++) {
    if (stop(s)) return s;
    // No blocks.
    if (s.pending?.kind === "declareBlockers") {
      s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
      continue;
    }
    // Other players' turns: no attacks.
    if (s.pending?.kind === "declareAttackers") {
      s = act(s, { type: "declareAttackers", player: s.pending.player, attacks: [] });
      continue;
    }
    // A later turn's cleanup: discard the first cards.
    if (s.pending?.kind === "discardToHandSize") {
      const p = s.pending;
      s = act(s, { type: "discard", player: p.player, objectIds: s.players[p.player]!.hand.slice(0, p.count) });
      continue;
    }
    if (s.pending) throw new Error(`unexpected ${s.pending.kind}`);
    s = pass(s);
  }
  throw new Error("never");
}
/** `pid`'s cards in their graveyard. */
function toYard(s: GameState, pid: PlayerId, defs: CardDef[]) {
  const ids = defs.map((def) => {
    const id = putOnBattlefield(s, pid, def);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "graveyard";
    s.players[pid]!.graveyard.push(id);
    return id;
  });
  invalidateCharacteristics(s);
  return ids;
}
/** From main phase 1, declare these attackers against `opp`. */
function attack(s0: GameState, opp: PlayerId, attackers: ObjectId[]) {
  const s = until(s0, (x) => x.pending?.kind === "declareAttackers");
  return act(s, { type: "declareAttackers", player: s.activePlayer, attacks: attackers.map((attacker) => ({ attacker, defender: opp })) });
}
const tokensNamed = (s: GameState, name: string) => s.battlefield.filter((id) => s.objects[id]!.isToken && ch(s, id).name === name);

describe("round 407: the cards compile", () => {
  it("are fully supported", () => {
    for (const d of [flood(), symbiote(), grub(), optimus()]) expect(isFullySupported(d), d.name).toBe(true);
  });
});

describe("round 407: The Flood of Mars", () => {
  const floodAttack = (s0: GameState, opp: PlayerId, fl: ObjectId, target: ObjectId) => {
    let s = attack(s0, opp, [fl]);
    s = until(s, (x) => x.pending?.kind === "chooseTargets");
    s = act(s, { type: "chooseTargets", player: s.activePlayer, targets: [tgt(target)] });
    return until(s, (x) => !x.stack.length && !x.triggerQueue.length);
  };

  it("a creature target gets a flood counter and becomes a copy of it", () => {
    const { s: s0, ap, opp } = setup([]);
    const fl = putOnBattlefield(s0, ap, flood());
    const br = putOnBattlefield(s0, opp, bears());
    const s = floodAttack(s0, opp, fl, br);
    expect(s.objects[br]!.counters.flood).toBe(1);
    const c = ch(s, br);
    expect(c.name).toBe("The Flood of Mars");
    expect([c.power, c.toughness]).toEqual([3, 3]);
    expect(c.subtypes).toEqual(["Alien", "Zombie", "Horror"]);
    expect(c.keywords).toContain("Islandwalk");
    expect(c.types).not.toContain("Land");
    // For the rest of the game: still a copy on a later turn.
    const later = until(s, (x) => x.turn > s.turn && x.step === "main1" && !x.pending);
    expect(ch(later, br).name).toBe("The Flood of Mars");
  });

  it("a land target becomes an Island in addition to its other types and taps for {U}", () => {
    const { s: s0, ap, opp } = setup([]);
    const fl = putOnBattlefield(s0, ap, flood());
    const fo = putOnBattlefield(s0, opp, forest);
    const s = floodAttack(s0, opp, fl, fo);
    expect(s.objects[fo]!.counters.flood).toBe(1);
    const c = ch(s, fo);
    expect(c.subtypes).toEqual(expect.arrayContaining(["Forest", "Island"]));
    expect(c.types).toEqual(["Land"]);
    expect(c.name).toBe("Forest");
    // The Island type gives it "{T}: Add {U}" (CR 305.6), besides the Forest's.
    expect(manaAbilitiesOn(s, s.objects[fo]!).map((m) => m.text)).toEqual(expect.arrayContaining(["{T}: Add {G}.", "{T}: Add {U}."]));
  });

  it("a creature land becomes a copy, which isn't a land, so it doesn't become an Island (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const fl = putOnBattlefield(s0, ap, flood());
    const da = putOnBattlefield(s0, opp, dryad());
    const s = floodAttack(s0, opp, fl, da);
    const c = ch(s, da);
    expect(c.name).toBe("The Flood of Mars");
    expect(c.types).toEqual(["Creature"]);
    expect(c.subtypes).not.toContain("Island");
    expect(c.subtypes).not.toContain("Forest");
  });

  it("the copy has its attack trigger too", () => {
    const { s: s0, ap, opp } = setup([]);
    const fl = putOnBattlefield(s0, ap, flood());
    const br = putOnBattlefield(s0, ap, bears());
    const an = putOnBattlefield(s0, opp, angel());
    let s = floodAttack(s0, opp, fl, br);
    expect(ch(s, br).name).toBe("The Flood of Mars");
    // Next turn of ap's: the copy attacks and makes the Angel a copy too.
    s = until(s, (x) => x.turn > s0.turn && x.activePlayer === ap && x.step === "main1" && !x.pending, 2000);
    s = attack(s, opp, [br]);
    s = until(s, (x) => x.pending?.kind === "chooseTargets");
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(an)] });
    s = until(s, (x) => !x.stack.length && !x.triggerQueue.length);
    expect(ch(s, an).name).toBe("The Flood of Mars");
  });
});

describe("round 407: Grub, Notorious Auntie", () => {
  /** Grub with its back face up (transformed). */
  const auntie = (s: GameState, pid: PlayerId) => {
    const g = putOnBattlefield(s, pid, grub());
    expect(transformPermanent(s, s.objects[g]!)).toBe(true);
    invalidateCharacteristics(s);
    expect(ch(s, g).name).toBe("Grub, Notorious Auntie");
    return g;
  };
  /** Grub attacks; its trigger asks "you may blight 1": answered `yes` and `pick`. */
  const grubAttack = (s0: GameState, opp: PlayerId, g: ObjectId, yes: boolean, pick?: ObjectId) => {
    let s = attack(s0, opp, [g]);
    s = until(s, (x) => x.pending?.kind === "chooseMay");
    s = act(s, { type: "chooseMay", player: s.activePlayer, yes });
    for (let i = 0; i < 10 && s.pending; i++) {
      const p = s.pending;
      if (p.kind === "pickPermanents") {
        // Only one creature to blight: no question (the trigger picks it).
        expect(p.options).toContain(pick);
        s = act(s, { type: "pickPermanents", player: p.player, ids: [pick!] });
      } else if (p.kind === "chooseOption" && p.what === "attackWhom") {
        // Several opponents: the token's controller chooses what it attacks (CR 508.4).
        const key = p.options.find((o) => o === String(opp) || o.endsWith(`:${opp}`)) ?? p.options[0]!;
        s = act(s, { type: "chooseOption", player: p.player, choice: key });
      } else break;
    }
    return until(s, (x) => !x.stack.length && !x.triggerQueue.length);
  };

  it("blight 1: a -1/-1 counter on a creature you control, then a tapped and attacking token copy of it", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = auntie(s0, ap);
    const an = putOnBattlefield(s0, ap, angel());
    const s = grubAttack(s0, opp, g, true, an);
    expect(s.objects[an]!.counters["-1/-1"]).toBe(1);
    expect([ch(s, an).power, ch(s, an).toughness]).toEqual([3, 3]);
    const [tok] = tokensNamed(s, "Serra Angel");
    expect(tok).toBeDefined();
    const t = s.objects[tok!]!;
    expect(t.tapped).toBe(true);
    expect(s.objects[tok!]!.attacking).toBe(opp);
    // Copiable values only: no counter on the token (rulings).
    expect([ch(s, tok!).power, ch(s, tok!).toughness]).toEqual([4, 4]);
    expect(ch(s, tok!).keywords).toEqual(expect.arrayContaining(["Flying", "Vigilance"]));
    // "At the beginning of the end step, sacrifice this token."
    const end = until(s, (x) => x.step === "end" && !x.stack.length && !x.triggerQueue.length && x.objects[tok!]?.zone !== "battlefield", 400);
    expect(end.objects[tok!]?.zone === "battlefield").toBe(false);
    expect(end.objects[an]!.zone).toBe("battlefield");
  });

  it("Grub can blight itself: the token is a copy of Grub, Notorious Auntie, and Grub dies after the ability resolves", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = auntie(s0, ap);
    let s = grubAttack(s0, opp, g, true, g);
    // The token is legendary too: the legend rule asks which to keep (CR 704.5j), as Grub (1/0 now) dies (CR 704.5f).
    expect(s.objects[g]!.counters["-1/-1"]).toBe(1);
    const p = s.pending;
    if (p?.kind !== "chooseOption" || p.what !== "legend") throw new Error("legend rule");
    s = act(s, { type: "chooseOption", player: ap, choice: p.options[p.labels!.findIndex((l) => l.includes("token"))]! });
    expect(s.objects[g]!.zone).toBe("graveyard");
    const [tok] = tokensNamed(s, "Grub, Notorious Auntie");
    expect(tok).toBeDefined();
    expect([ch(s, tok!).power, ch(s, tok!).toughness]).toEqual([2, 1]);
    expect(s.objects[tok!]!.attacking).toBe(opp);
  });

  it("declining makes no token and puts no counter", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = auntie(s0, ap);
    const an = putOnBattlefield(s0, ap, angel());
    const s = grubAttack(s0, opp, g, false);
    expect(s.objects[an]!.counters["-1/-1"] ?? 0).toBe(0);
    expect(tokensNamed(s, "Serra Angel")).toEqual([]);
  });
});

describe("round 407: Optimus Prime, Autobot Leader", () => {
  const leader = (s: GameState, pid: PlayerId) => {
    const o = putOnBattlefield(s, pid, optimus());
    expect(transformPermanent(s, s.objects[o]!, false, true)).toBe(true);
    invalidateCharacteristics(s);
    expect(ch(s, o).name).toBe("Optimus Prime, Autobot Leader");
    return o;
  };
  /** Attack with `attackers`; the bolster pick answered with `pick` if it asks. No blocks; on to the end of combat damage. */
  const go = (s0: GameState, opp: PlayerId, attackers: ObjectId[], pick?: ObjectId) => {
    let s = attack(s0, opp, attackers);
    s = until(s, (x) => !!x.pending || (!x.stack.length && !x.triggerQueue.length && x.step !== "declareAttackers"));
    if (s.pending?.kind === "pickPermanents") s = act(s, { type: "pickPermanents", player: s.activePlayer, ids: [pick!] });
    return s;
  };
  const afterCombat = (s: GameState) => until(s, (x) => (x.step === "main2" || x.step === "end") && !x.stack.length && !x.triggerQueue.length);

  it("bolster 2 on the creature with the least toughness, which gains trample; when it deals combat damage to a player, Optimus converts", () => {
    const { s: s0, ap, opp } = setup([]);
    const o = leader(s0, ap);
    const br = putOnBattlefield(s0, ap, bears());
    let s = go(s0, opp, [br]);
    s = until(s, (x) => !x.stack.length && !x.triggerQueue.length);
    expect(s.objects[br]!.counters["+1/+1"]).toBe(2);
    expect(ch(s, br).keywords).toContain("Trample");
    const life = s.players[opp]!.life;
    s = afterCombat(s);
    expect(s.players[opp]!.life).toBe(life - 4);
    expect(ch(s, o).name).toBe("Optimus Prime, Hero");
  });

  it("a double striker deals combat damage twice: the second trigger doesn't convert it back (CR 701.27f)", () => {
    const { s: s0, ap, opp } = setup([]);
    const o = leader(s0, ap);
    const fa = putOnBattlefield(s0, ap, ace());
    let s = go(s0, opp, [fa]);
    s = afterCombat(s);
    expect(s.objects[fa]!.counters["+1/+1"]).toBe(2);
    expect(ch(s, o).name).toBe("Optimus Prime, Hero");
    expect(s.objects[o]!.transforms).toBe(2);
  });

  it("only that creature: another attacker dealing damage doesn't convert it", () => {
    const { s: s0, ap, opp } = setup([]);
    const o = leader(s0, ap);
    const br = putOnBattlefield(s0, ap, bears());
    const mem = putOnBattlefield(s0, ap, memnite());
    let s = go(s0, opp, [br]);
    // Memnite (1/1) has the least toughness: it gets the counters, and it isn't attacking.
    s = afterCombat(s);
    expect(s.objects[mem]!.counters["+1/+1"]).toBe(2);
    expect(s.objects[br]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(ch(s, o).name).toBe("Optimus Prime, Autobot Leader");
  });
});

describe("round 407: Symbiote Spider-Man", () => {
  it("Find New Host: from the graveyard, a +1/+1 counter on target creature you control, which gains its combat damage trigger for good", () => {
    const { s: s0, ap, opp } = setup([]);
    const [sp] = toYard(s0, ap, [symbiote()]);
    const br = putOnBattlefield(s0, ap, bears());
    const plan = planActivate(s0, ap, sp!, 0, [tgt(br)]);
    expect(plan).not.toBeNull();
    let s = run(s0, plan);
    expect(s.objects[sp!]!.zone).toBe("exile");
    s = until(s, (x) => !x.stack.length);
    expect(s.objects[br]!.counters["+1/+1"]).toBe(1);
    // Attack with it: 3 damage, so look at the top three, one into the hand, the rest into the graveyard.
    const hand = s.players[ap]!.hand.length;
    const yard = s.players[ap]!.graveyard.length;
    s = attack(s, opp, [br]);
    s = until(s, (x) => (!!x.pending && x.pending.kind !== "declareBlockers") || x.step === "main2", 400);
    expect(s.pending?.kind).toBe("searchLibrary");
    const p = s.pending as { cards: ObjectId[] };
    expect(p.cards.length).toBe(3);
    s = act(s, { type: "searchLibrary", player: ap, found: [p.cards[0]!] });
    s = until(s, (x) => !x.stack.length && !x.triggerQueue.length);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.players[ap]!.graveyard.length).toBe(yard + 2);
  });

  it("only from the graveyard, and only as a sorcery", () => {
    const { s: s0, ap } = setup([]);
    const sp = putOnBattlefield(s0, ap, symbiote());
    const br = putOnBattlefield(s0, ap, bears());
    expect(planActivate(s0, ap, sp, 0, [tgt(br)])).toBeNull();
  });
});
