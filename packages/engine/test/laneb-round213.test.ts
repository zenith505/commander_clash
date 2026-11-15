// Lane B round B213: Battletide Alchemist (you may prevent X of each source's damage to each player, X your Clerics),
// Desolation (each player who tapped a land for mana this turn sacrifices a land; 2 damage to those who sacrificed a
// Plains), Kodama of the Center Tree (soulshift X, X the Spirits you controlled as it died), Light Up the Night (X damage,
// X plus 1 to a creature or planeswalker; flashback by removing X loyalty counters) and Corrosive Ooze (the Equipment on
// a creature it blocks or is blocked by destroyed at end of combat).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, castProblem, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const alchemist = (): CardDef => ({"oracleId":"4867cc47-de84-4958-b1de-4a0a5050210e","name":"Battletide Alchemist","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Kithkin Cleric","supertypes":[],"types":["Creature"],"subtypes":["Kithkin","Cleric"],"oracleText":"If a source would deal damage to a player, you may prevent X of that damage, where X is the number of Clerics you control.","power":"3","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/a/9a5357e0-ff69-4bb9-9a02-b0372e0ea5e5.jpg?1783942808","artUrl":"https://cards.scryfall.io/art_crop/front/9/a/9a5357e0-ff69-4bb9-9a02-b0372e0ea5e5.jpg?1783942808","commanderLegal":"legal","set":"mor","releasedAt":"2008-02-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const desolation = (): CardDef => ({"oracleId":"a80c3af8-470e-4e95-9579-cfdf18fbdbfa","name":"Desolation","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of each end step, each player who tapped a land for mana this turn sacrifices a land of their choice. This enchantment deals 2 damage to each player who sacrificed a Plains this way.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/b/3b186460-d2af-4912-ba19-95b2cb5f1639.jpg?1783946993","artUrl":"https://cards.scryfall.io/art_crop/front/3/b/3b186460-d2af-4912-ba19-95b2cb5f1639.jpg?1783946993","commanderLegal":"legal","set":"vis","releasedAt":"1997-02-03","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const kodama = (): CardDef => ({"oracleId":"88188cc1-3211-4bf8-a591-613b66192695","name":"Kodama of the Center Tree","manaCost":"{4}{G}","cmc":5,"typeLine":"Legendary Creature — Spirit","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Spirit"],"oracleText":"Kodama of the Center Tree's power and toughness are each equal to the number of Spirits you control.\nKodama of the Center Tree has soulshift X, where X is the number of Spirits you control. (When this creature dies, you may return target Spirit card with mana value X or less from your graveyard to your hand.)","power":"*","toughness":"*","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/b/6b9264c5-1ecd-48cc-a12d-d4bd8050cfae.jpg?1783944184","artUrl":"https://cards.scryfall.io/art_crop/front/6/b/6b9264c5-1ecd-48cc-a12d-d4bd8050cfae.jpg?1783944184","commanderLegal":"legal","set":"bok","releasedAt":"2005-02-04","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const lightUp = (): CardDef => ({"oracleId":"4669926b-93f9-4d80-aee3-492fbf8e0a0a","name":"Light Up the Night","manaCost":"{X}{R}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Light Up the Night deals X damage to any target. It deals X plus 1 damage instead if that target is a creature or planeswalker.\nFlashback—{3}{R}, Remove X loyalty counters from among planeswalkers you control. If you cast this spell this way, X can't be 0. (You may cast this card from your graveyard for its flashback cost. Then exile it.)","colors":["R"],"colorIdentity":["R"],"keywords":["Flashback"],"imageUrl":"https://cards.scryfall.io/normal/front/0/9/093370ef-c7b3-48f3-a521-b81d14eb8d9e.jpg?1783924391","artUrl":"https://cards.scryfall.io/art_crop/front/0/9/093370ef-c7b3-48f3-a521-b81d14eb8d9e.jpg?1783924391","commanderLegal":"legal","set":"dbl","releasedAt":"2022-01-28","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const ooze = (): CardDef => ({"oracleId":"416cca4a-b1b2-49d5-9cac-ec347056bdb0","name":"Corrosive Ooze","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Ooze","supertypes":[],"types":["Creature"],"subtypes":["Ooze"],"oracleText":"Whenever this creature blocks or becomes blocked by an equipped creature, destroy all Equipment attached to that creature at end of combat.","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/1/d13deb9c-5985-4355-8716-ee1c7b54b8e2.jpg?1783934982","artUrl":"https://cards.scryfall.io/art_crop/front/d/1/d13deb9c-5985-4355-8716-ee1c7b54b8e2.jpg?1783934982","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const warden = (): CardDef => ({"oracleId":"f3fad295-1af2-4ecc-8546-b121ad6be27b","name":"Soul Warden","manaCost":"{W}","cmc":1,"typeLine":"Creature — Human Cleric","supertypes":[],"types":["Creature"],"subtypes":["Human","Cleric"],"oracleText":"Whenever another creature enters, you gain 1 life.","power":"1","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/3/53b54485-37e2-4ae0-be91-c77ec02c5fe0.jpg?1786456647","artUrl":"https://cards.scryfall.io/art_crop/front/5/3/53b54485-37e2-4ae0-be91-c77ec02c5fe0.jpg?1786456647","commanderLegal":"legal","set":"sld","releasedAt":"2026-08-10","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const kami = (): CardDef => ({"oracleId":"e937e0f5-ca35-4dce-9f05-8f2075731628","name":"Kami of Ancient Law","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature — Spirit","supertypes":[],"types":["Creature"],"subtypes":["Spirit"],"oracleText":"Sacrifice this creature: Destroy target enchantment.","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/7/b7cb7fdc-fa47-4485-b268-7c2ddff28568.jpg?1783944338","artUrl":"https://cards.scryfall.io/art_crop/front/b/7/b7cb7fdc-fa47-4485-b268-7c2ddff28568.jpg?1783944338","commanderLegal":"legal","set":"chk","releasedAt":"2004-10-01","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const splitter = (): CardDef => ({"oracleId":"452e3f5f-ce17-4682-966b-5cc100210aee","name":"Bonesplitter","manaCost":"{1}","cmc":1,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +2/+0.\nEquip {1}","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/a/e/ae31d513-7412-4467-b497-a7183ff29a42.jpg?1783944980","artUrl":"https://cards.scryfall.io/art_crop/front/a/e/ae31d513-7412-4467-b497-a7183ff29a42.jpg?1783944980","commanderLegal":"legal","set":"pal03","releasedAt":"2003-01-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const ajani = (): CardDef => ({"oracleId":"dfb5f660-fd8b-4b7b-934c-6a71cd182f15","name":"Ajani Goldmane","manaCost":"{2}{W}{W}","cmc":4,"typeLine":"Legendary Planeswalker — Ajani","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Ajani"],"oracleText":"+1: You gain 2 life.\n−1: Put a +1/+1 counter on each creature you control. Those creatures gain vigilance until end of turn.\n−6: Create a white Avatar creature token. It has \"This token's power and toughness are each equal to your life total.\"","loyalty":"4","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/a/2a1470a6-d09d-4a2a-84a6-d56e32ed237a.jpg?1783942919","artUrl":"https://cards.scryfall.io/art_crop/front/2/a/2a1470a6-d09d-4a2a-84a6-d56e32ed237a.jpg?1783942919","commanderLegal":"legal","set":"lrw","releasedAt":"2007-10-12","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const grizzly = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const quake = (): CardDef => ({"oracleId":"9a40614b-50a3-422c-849e-53c8b7d3d204","name":"Earthquake","manaCost":"{X}{R}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Earthquake deals X damage to each creature without flying and each player.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/c/ac5d49b5-cf4d-48a4-b21d-0a3b7e6320a4.jpg?1783903402","artUrl":"https://cards.scryfall.io/art_crop/front/a/c/ac5d49b5-cf4d-48a4-b21d-0a3b7e6320a4.jpg?1783903402","commanderLegal":"legal","set":"sld","releasedAt":"2026-06-15","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Passes and lets bots answer until the stack is empty or `me` has a question. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const ply = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const nextOf = (s: GameState, pid: PlayerId, k: number) => s.turnOrder[(s.turnOrder.indexOf(pid) + k) % s.turnOrder.length]!;
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = [], choices: CostChoices = {}, x?: number) => run(s, planCast(s, pid, id, targets, undefined, undefined, x, choices));
/** Moves a new card for `def` into `pid`'s hand (or another zone). */
const toZone = (s: GameState, pid: PlayerId, def: CardDef, z: "hand" | "graveyard" = "hand") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
const answer = (s: GameState, pid: PlayerId, pick: (labels: string[]) => number) => {
  const p = s.pending;
  if (p?.kind !== "chooseOption" || p.player !== pid) throw new Error(`no question for ${pid}: ${JSON.stringify(p)}`);
  const i = pick(p.labels ?? p.options);
  if (i < 0) throw new Error(`no such option: ${JSON.stringify(p)}`);
  return act(s, { type: "chooseOption", player: pid, choice: p.options[i]! });
};
const yes = (l: string[]) => l.findIndex((x) => x.startsWith("Prevent"));
const no = (l: string[]) => l.findIndex((x) => x.startsWith("Don't"));

describe("Lane B round B213", () => {
  it("are fully supported", () => {
    supported(alchemist(), desolation(), kodama(), lightUp(), ooze());
  });

  it("Battletide Alchemist: its controller may prevent X of each source's damage to a player, X the Clerics they control as it's dealt", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, alchemist());
    putOnBattlefield(s0, ap, warden());
    const b1 = toZone(s0, ap, bolt());
    const b2 = toZone(s0, ap, bolt());
    // To you: prevent 2 of Lightning Bolt's 3 (two Clerics).
    const mine = life(s0, ap);
    let s = settle(castNow(s0, ap, b1, [ply(ap)]), ap);
    expect(s.pending?.kind === "chooseOption" && s.pending.prompt).toContain("Prevent 2 of that damage");
    s = settle(answer(s, ap, yes), ap);
    expect(life(s, ap)).toBe(mine - 1);
    // To an opponent: you may decline, and all 3 is dealt.
    const theirs = life(s, opp);
    s = settle(castNow(s, ap, b2, [ply(opp)]), ap);
    s = settle(answer(s, ap, no), ap);
    expect(life(s, opp)).toBe(theirs - 3);
  });

  it("Battletide Alchemist: damage to several players at once is a choice for each player (rulings); not to creatures", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, alchemist());
    const g = putOnBattlefield(s0, ap, giant());
    const q = toZone(s0, ap, quake());
    const before = s0.turnOrder.map((p) => life(s0, p));
    let s = castNow(s0, ap, q, [], {}, 2);
    s = settle(s, ap);
    // One question per player, yours first answered yes, the others no.
    const asked: string[] = [];
    for (let i = 0; i < 8 && s.pending?.kind === "chooseOption" && s.pending.player === ap; i++) {
      const p = s.pending.prompt ?? "";
      asked.push(p);
      s = settle(answer(s, ap, p.includes(` to ${s.players[ap]!.name}.`) ? yes : no), ap);
    }
    expect(asked.length).toBe(4);
    s = settle(s);
    s.turnOrder.forEach((p, i) => expect(life(s, p)).toBe(before[i]! - (p === ap ? 1 : 2)));
    // The Hill Giant's damage isn't asked about: it's 2 on it.
    expect(s.objects[g]!.damage).toBe(2);
  });

  it("Battletide Alchemist: a bot prevents damage to itself only", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, alchemist());
    const third = nextOf(s0, ap, 2);
    const b1 = toZone(s0, ap, bolt());
    const b2 = toZone(s0, ap, bolt());
    const [o0, t0] = [life(s0, opp), life(s0, third)];
    let s = settle(castNow(s0, ap, b1, [ply(opp)]));
    expect(life(s, opp)).toBe(o0 - 2);
    s = settle(castNow(s, ap, b2, [ply(third)]));
    expect(life(s, third)).toBe(t0 - 3);
  });

  it("Desolation: each player who tapped a land for mana this turn sacrifices a land at the end step, and a Plains costs 2 life", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, desolation());
    const third = nextOf(s0, ap, 2);
    const plains = s0.battlefield.filter((id) => s0.objects[id]!.controller === ap && s0.cards[s0.objects[id]!.cardId]!.name === "Plains");
    let s = act(s0, { type: "activateMana", player: ap, objectId: plains[0]!, mana: "W" });
    expect(s.turnLog?.tappedLandForMana).toEqual([ap]);
    // An opponent who tapped none sacrifices nothing; one who did, sacrifices one.
    const oppLand = putOnBattlefield(s, opp, s.cards[s.objects[plains[0]!]!.cardId]!);
    // The opponent gets priority after you pass, and taps it then.
    s = act(s, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(opp);
    s = act(s, { type: "activateMana", player: opp, objectId: oppLand, mana: "W" });
    const thirdLand = putOnBattlefield(s, third, s.cards[s.objects[plains[0]!]!.cardId]!);
    const [lands, mine, theirs, third0] = [s.battlefield.filter((id) => s.objects[id]!.controller === ap).length, life(s, ap), life(s, opp), life(s, third)];
    s = passUntil(s, "end", ap);
    s = settle(s, ap);
    // Your choice of land: a Plains.
    const p = s.pending;
    expect(p?.kind).toBe("pickPermanents");
    if (p?.kind !== "pickPermanents") return;
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [plains[1]!] }), ap);
    s = settle(s);
    expect(zone(s, plains[1]!)).toBe("graveyard");
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap).length).toBe(lands - 1);
    expect(life(s, ap)).toBe(mine - 2);
    // The opponent's only land was a Plains.
    expect(zone(s, oppLand)).toBe("graveyard");
    expect(life(s, opp)).toBe(theirs - 2);
    expect(zone(s, thirdLand)).toBe("battlefield");
    expect(life(s, third)).toBe(third0);
  });

  it("Desolation: no land tapped for mana, no sacrifice; a Swamp sacrificed costs no life", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, desolation());
    const swamps = s0.battlefield.filter((id) => s0.objects[id]!.controller === ap && s0.cards[s0.objects[id]!.cardId]!.name === "Swamp");
    const lands = s0.battlefield.filter((id) => s0.objects[id]!.controller === ap).length;
    let s = settle(passUntil(s0, "end", ap), ap);
    expect(s.pending).toBeFalsy();
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap).length).toBe(lands);
    // Next turn of yours: tap a Swamp, sacrifice it.
    s = passUntil(s, "main1", ap);
    s = act(s, { type: "activateMana", player: ap, objectId: swamps[0]!, mana: "B" });
    const mine = life(s, ap);
    s = settle(passUntil(s, "end", ap), ap);
    if (s.pending?.kind === "pickPermanents") s = settle(act(s, { type: "pickPermanents", player: ap, ids: [swamps[0]!] }), ap);
    s = settle(s);
    expect(zone(s, swamps[0]!)).toBe("graveyard");
    expect(life(s, ap)).toBe(mine);
  });

  it("Kodama of the Center Tree: soulshift X with X the Spirits you controlled as it died, itself included", () => {
    const { s: s0, ap } = setup([]);
    const k = putOnBattlefield(s0, ap, kodama());
    putOnBattlefield(s0, ap, kami());
    const yardKami = toZone(s0, ap, kami(), "graveyard");
    const b = toZone(s0, ap, bolt());
    let s = settle(castNow(s0, ap, b, [tgt(k)]), ap);
    expect(zone(s, k)).toBe("graveyard");
    // The target: a Spirit card with mana value 2 or less (two Spirits); Kodama itself (5) isn't one.
    const p = s.pending;
    expect(p?.kind).toBe("chooseTargets");
    if (p?.kind !== "chooseTargets") return;
    expect(p.specs[0]!.manaValue?.max).toBe(2);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(yardKami)] }), ap);
    if (s.pending?.kind === "chooseOption") s = settle(answer(s, ap, (l) => l.findIndex((x) => /^yes|return/i.test(x))), ap);
    s = settle(s);
    expect(zone(s, yardKami)).toBe("hand");
  });

  it("Kodama of the Center Tree: Spirits dying with it count (CR 603.10a); with five it can return itself (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const k = putOnBattlefield(s0, ap, kodama());
    for (let i = 0; i < 4; i++) putOnBattlefield(s0, ap, kami());
    const q = toZone(s0, ap, quake());
    // Earthquake for 5: Kodama (5/5) and the four Kami die at once; X is 5.
    let s = settle(castNow(s0, ap, q, [], {}, 5), ap);
    expect(zone(s, k)).toBe("graveyard");
    const p = s.pending;
    expect(p?.kind).toBe("chooseTargets");
    if (p?.kind !== "chooseTargets") return;
    expect(p.specs[0]!.manaValue?.max).toBe(5);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(k)] }), ap);
    if (s.pending?.kind === "chooseOption") s = settle(answer(s, ap, (l) => l.findIndex((x) => /^yes|return/i.test(x))), ap);
    s = settle(s);
    expect(zone(s, k)).toBe("hand");
  });

  it("Light Up the Night: X damage to a player, X plus 1 to a creature or planeswalker", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, opp, giant());
    const l1 = toZone(s0, ap, lightUp());
    const l2 = toZone(s0, ap, lightUp());
    const theirs = life(s0, opp);
    let s = settle(castNow(s0, ap, l1, [ply(opp)], {}, 2));
    expect(life(s, opp)).toBe(theirs - 2);
    s = settle(castNow(s, ap, l2, [tgt(g)], {}, 2));
    expect(zone(s, g)).toBe("graveyard");
  });

  it("Light Up the Night: flashback for {3}{R} and X loyalty counters removed from among your planeswalkers, X not 0", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, ajani());
    s0.objects[a]!.counters.loyalty = 4;
    const l = toZone(s0, ap, lightUp(), "graveyard");
    const via: CostChoices = { via: "flashback" };
    expect(castProblem(s0, ap, l, [ply(opp)], undefined, undefined, undefined, 0, via)).toBe("X can't be 0");
    // Before X is announced it could be cast this way; a cast that leaves X out has X 0, which it can't.
    expect(castProblem(s0, ap, l, undefined, undefined, undefined, undefined, undefined, via)).not.toBe("X can't be 0");
    expect(() => castNow(s0, ap, l, [ply(opp)], via)).toThrow("X can't be 0");
    expect(castProblem(s0, ap, l, [ply(opp)], undefined, undefined, undefined, 5, { ...via, counters: Array.from({ length: 5 }, () => ({ id: a, kind: "loyalty" })) })).not.toBeNull();
    const theirs = life(s0, opp);
    let s = settle(castNow(s0, ap, l, [ply(opp)], { ...via, counters: [{ id: a, kind: "loyalty" }, { id: a, kind: "loyalty" }, { id: a, kind: "loyalty" }] }, 3));
    expect(life(s, opp)).toBe(theirs - 3);
    expect(s.objects[a]!.counters.loyalty).toBe(1);
    expect(zone(s, l)).toBe("exile");
  });

  it("Corrosive Ooze: the Equipment on an equipped creature blocking it is destroyed at end of combat, not before", () => {
    const { s: s0, ap, opp } = setup([]);
    const o = putOnBattlefield(s0, ap, ooze());
    const g = putOnBattlefield(s0, opp, giant());
    const eq = putOnBattlefield(s0, opp, splitter());
    s0.objects[eq]!.attachedTo = g;
    invalidateCharacteristics(s0);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: o, defender: opp }] });
    for (let i = 0; i < 20 && !(s.pending?.kind === "declareBlockers" && s.pending.player === opp); i++) s = act(s, s.pending?.kind === "declareBlockers" ? { type: "declareBlockers", player: s.pending.player, blocks: [] } : { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: g, attacker: o }] });
    s = settle(s);
    expect(zone(s, eq)).toBe("battlefield");
    s = passUntil(s, "endCombat", ap);
    s = settle(s);
    s = passUntil(s, "main2", ap);
    expect(zone(s, eq)).toBe("graveyard");
  });

  it("Corrosive Ooze: the Equipment attached just before the creature died is destroyed, even with the Ooze gone too (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const o = putOnBattlefield(s0, ap, ooze());
    const bears = putOnBattlefield(s0, opp, grizzly());
    const eq = putOnBattlefield(s0, opp, splitter());
    const spare = putOnBattlefield(s0, opp, splitter());
    s0.objects[eq]!.attachedTo = bears;
    invalidateCharacteristics(s0);
    let s = passUntil(s0, "declareAttackers", opp);
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: bears, defender: ap }] });
    for (let i = 0; i < 20 && !(s.pending?.kind === "declareBlockers" && s.pending.player === ap); i++) s = act(s, s.pending?.kind === "declareBlockers" ? { type: "declareBlockers", player: s.pending.player, blocks: [] } : { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareBlockers", player: ap, blocks: [{ blocker: o, attacker: bears }] });
    s = settle(s);
    s = passUntil(s, "main2", opp);
    // The bears (4/2) and the Ooze (2/2) died in combat; the Bonesplitter that was on the bears goes too, the other stays.
    expect(zone(s, bears)).toBe("graveyard");
    expect(zone(s, o)).toBe("graveyard");
    expect(zone(s, eq)).toBe("graveyard");
    expect(zone(s, spare)).toBe("battlefield");
  });

  it("Corrosive Ooze: no trigger for a blocker without Equipment", () => {
    const { s: s0, ap, opp } = setup([]);
    const o = putOnBattlefield(s0, ap, ooze());
    const g = putOnBattlefield(s0, opp, giant());
    const eq = putOnBattlefield(s0, opp, splitter());
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: o, defender: opp }] });
    for (let i = 0; i < 20 && !(s.pending?.kind === "declareBlockers" && s.pending.player === opp); i++) s = act(s, s.pending?.kind === "declareBlockers" ? { type: "declareBlockers", player: s.pending.player, blocks: [] } : { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: g, attacker: o }] });
    expect(s.triggerQueue.length + s.stack.length).toBe(0);
    s = passUntil(settle(s), "main2", ap);
    expect(zone(s, eq)).toBe("battlefield");
  });
});
