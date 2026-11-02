// Round 244: cards from the top of the popularity list. Aura tokens with abilities of their own (CR 111.4, 303.7):
// Estrid, the Masked ("Create a white Aura enchantment token named Mask attached to another target permanent. The token
// has enchant permanent and umbra armor"; its −7 returns non-Aura enchantments, then Auras), The Rani ("Mark of the Rani
// ... "Enchanted creature gets +2/+2 and is goaded"", "Whenever a goaded creature deals combat damage to one of your
// opponents, investigate"), Preston Garvey, Minuteman (Settlement, enchant land), Smoke Spirits' Aid ("For each of up to X
// target creatures, create ... attached to that creature"). Pardic Firecat and Diligent Farmhand ("effects from spells
// named Flame Burst count it as a card named Flame Burst"); Konda's Banner ("Creatures that share a color with equipped
// creature get +1/+1").

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, applyAction, botActions, characteristics, controllerOf, defOf, destroyPermanent, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Everyone passes until the stack is empty, answering trigger targets with `targets`; stops at any other question. */
const settle = (s: GameState, opts: { targets?: TargetChoice[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseTargets" && opts.targets) s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const named = (s: GameState, name: string) => s.battlefield.filter((id) => characteristics(s, s.objects[id]!).name === name);
const attachedTo = (s: GameState, host: ObjectId) => s.battlefield.filter((id) => s.objects[id]!.attachedTo === host);
/** Combat runs to the end step: nobody blocks. */
const toEnd = (s: GameState) => {
  for (let i = 0; i < 80 && s.step !== "end"; i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};

// Real oracle text (Scryfall).
const estrid = (): CardDef => ({"oracleId":"7cf1fa2e-1572-4d9d-8e93-e49016b34458","name":"Estrid, the Masked","manaCost":"{1}{G}{W}{U}","cmc":4,"typeLine":"Legendary Planeswalker — Estrid","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Estrid"],"oracleText":"+2: Untap each enchanted permanent you control.\n−1: Create a white Aura enchantment token named Mask attached to another target permanent. The token has enchant permanent and umbra armor.\n−7: Mill seven cards. Return all non-Aura enchantment cards from your graveyard to the battlefield, then do the same for Aura cards.\nEstrid, the Masked can be your commander.","loyalty":"3","colors":["G","U","W"],"colorIdentity":["G","U","W"],"keywords":["Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/3/3/3340b83e-72dc-42e2-9f93-92f732c047df.jpg?1783934330","artUrl":"https://cards.scryfall.io/art_crop/front/3/3/3340b83e-72dc-42e2-9f93-92f732c047df.jpg?1783934330","commanderLegal":"legal","set":"c18","releasedAt":"2018-08-10","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const rani = (): CardDef => ({"oracleId":"ac9b0bdf-caf8-4dba-a900-e59de35e77d7","name":"The Rani","manaCost":"{1}{U}{B}{R}","cmc":4,"typeLine":"Legendary Creature — Time Lord Scientist","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Time Lord","Scientist"],"oracleText":"Whenever The Rani enters or attacks, create a red Aura enchantment token named Mark of the Rani attached to another target creature. That token has enchant creature and \"Enchanted creature gets +2/+2 and is goaded.\"\nWhenever a goaded creature deals combat damage to one of your opponents, investigate.","power":"3","toughness":"4","colors":["B","R","U"],"colorIdentity":["B","R","U"],"keywords":["Investigate","Goad"],"imageUrl":"https://cards.scryfall.io/normal/front/0/1/01b44c52-b3a3-4954-adcc-53b79921ea24.jpg?1783914627","artUrl":"https://cards.scryfall.io/art_crop/front/0/1/01b44c52-b3a3-4954-adcc-53b79921ea24.jpg?1783914627","commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const preston = (): CardDef => ({"oracleId":"08a0c661-5ed5-47a6-aa1d-3114bf5db3fb","name":"Preston Garvey, Minuteman","manaCost":"{2}{R}{G}{W}","cmc":5,"typeLine":"Legendary Creature — Human Soldier","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Soldier"],"oracleText":"At the beginning of combat on your turn, create a green Aura enchantment token named Settlement attached to up to one target land you control. It has enchant land and \"Enchanted land has '{T}: Add one mana of any color.'\"\nWhenever Preston Garvey attacks, untap each enchanted permanent you control.","power":"4","toughness":"4","colors":["G","R","W"],"colorIdentity":["G","R","W"],"keywords":[],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/2/2/22b60168-1e7b-4c80-bb93-6841c1e961bb.jpg?1783912420","artUrl":"https://cards.scryfall.io/art_crop/front/2/2/22b60168-1e7b-4c80-bb93-6841c1e961bb.jpg?1783912420","commanderLegal":"legal","set":"pip","releasedAt":"2024-03-08","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const smoke = (): CardDef => ({"oracleId":"8fef58ff-4743-4065-9df0-c5edf9aa2502","name":"Smoke Spirits' Aid","manaCost":"{X}{R}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"For each of up to X target creatures, create a red Aura enchantment token named Smoke Blessing attached to that creature. Those tokens have enchant creature and \"When enchanted creature dies, it deals 1 damage to its controller and you create a Treasure token.\"","colors":["R"],"colorIdentity":["R"],"keywords":["Treasure"],"imageUrl":"https://cards.scryfall.io/normal/front/e/4/e492a245-46ba-438e-8d81-4626faa49bff.jpg?1783923991","artUrl":"https://cards.scryfall.io/art_crop/front/e/4/e492a245-46ba-438e-8d81-4626faa49bff.jpg?1783923991","commanderLegal":"legal","set":"nec","releasedAt":"2022-02-18","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const firecat = (): CardDef => ({"oracleId":"c6498ec5-fbbc-472a-9b40-5481e49efe79","name":"Pardic Firecat","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Elemental Cat","supertypes":[],"types":["Creature"],"subtypes":["Elemental","Cat"],"oracleText":"Haste\nIf this card is in a graveyard, effects from spells named Flame Burst count it as a card named Flame Burst.","power":"2","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":["Haste"],"imageUrl":"https://cards.scryfall.io/normal/front/1/6/16858395-c742-4657-88c2-5af20c92718d.jpg?1783945225","artUrl":"https://cards.scryfall.io/art_crop/front/1/6/16858395-c742-4657-88c2-5af20c92718d.jpg?1783945225","commanderLegal":"legal","set":"ody","releasedAt":"2001-10-01","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const flameBurst = (): CardDef => ({"oracleId":"37e44e1c-481d-4f5d-b76b-036f40e9124e","name":"Flame Burst","manaCost":"{1}{R}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Flame Burst deals X damage to any target, where X is 2 plus the number of cards named Flame Burst in all graveyards.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/4/64bbd438-7df2-4d7b-88ad-4531ebaf3931.jpg?1783945230","artUrl":"https://cards.scryfall.io/art_crop/front/6/4/64bbd438-7df2-4d7b-88ad-4531ebaf3931.jpg?1783945230","commanderLegal":"legal","set":"ody","releasedAt":"2001-10-01","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const farmhand = (): CardDef => ({"oracleId":"5f6aa548-0ab3-451f-b291-10cac3f3ea1a","name":"Diligent Farmhand","manaCost":"{G}","cmc":1,"typeLine":"Creature — Human Druid","supertypes":[],"types":["Creature"],"subtypes":["Human","Druid"],"oracleText":"{1}{G}, Sacrifice this creature: Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.\nIf this card is in a graveyard, effects from spells named Muscle Burst count it as a card named Muscle Burst.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/b/7bb40e09-6855-46d5-9bc9-bc6b2b0d7653.jpg?1783945219","artUrl":"https://cards.scryfall.io/art_crop/front/7/b/7bb40e09-6855-46d5-9bc9-bc6b2b0d7653.jpg?1783945219","commanderLegal":"legal","set":"ody","releasedAt":"2001-10-01","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const muscleBurst = (): CardDef => ({"oracleId":"97487ea5-2bbd-4ef6-a870-7e9f2db5e5e0","name":"Muscle Burst","manaCost":"{1}{G}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target creature gets +X/+X until end of turn, where X is 3 plus the number of cards named Muscle Burst in all graveyards.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/1/217dada5-7ffc-488b-8062-34c034906ea9.jpg?1783945215","artUrl":"https://cards.scryfall.io/art_crop/front/2/1/217dada5-7ffc-488b-8062-34c034906ea9.jpg?1783945215","commanderLegal":"legal","set":"ody","releasedAt":"2001-10-01","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const banner = (): CardDef => ({"oracleId":"a355908b-4359-4bfe-9bc4-ccf721ab3a13","name":"Konda's Banner","manaCost":"{2}","cmc":2,"typeLine":"Legendary Artifact — Equipment","supertypes":["Legendary"],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Konda's Banner can be attached only to a legendary creature.\nCreatures that share a color with equipped creature get +1/+1.\nCreatures that share a creature type with equipped creature get +1/+1.\nEquip {2}","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/b/9/b9292a61-e7a9-49a8-b0b1-16a2b3e95c6b.jpg?1787575221","artUrl":"https://cards.scryfall.io/art_crop/front/b/9/b9292a61-e7a9-49a8-b0b1-16a2b3e95c6b.jpg?1787575221","commanderLegal":"legal","set":"sld","releasedAt":"2026-09-14","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const enchantmentCard = card("Test Monument", "Enchantment", "{2}", { oracleText: "" });
const auraOnEnchantment = card("Test Ward", "Enchantment — Aura", "{1}", { oracleText: "Enchant enchantment" });
const legend = (extra: Partial<CardDef> = {}) => card(extra.name ?? "Test Elf Lord", "Legendary Creature — Elf Warrior", "{G}", { power: "2", toughness: "2", colors: ["G"], ...extra });
const walker = (s: GameState, pid: PlayerId, def: CardDef, loyalty: number) => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.counters.loyalty = loyalty;
  invalidateCharacteristics(s);
  return id;
};

describe("round 244", () => {
  it("every card of the round compiles fully", () => {
    supported(estrid(), rani(), preston(), smoke(), firecat(), farmhand(), banner());
  });

  it("Estrid −1: a white Mask Aura token on another target permanent, with umbra armor saving it from destruction", () => {
    const { s: s0, ap } = setup([]);
    const e = walker(s0, ap, estrid(), 4);
    const b = putOnBattlefield(s0, ap, bear());
    let s = run(s0, planActivate(s0, ap, e, 1, [tgt(b)]));
    s = settle(s);
    const [mask] = attachedTo(s, b);
    expect(mask).toBeDefined();
    const c = characteristics(s, s.objects[mask!]!);
    expect(c).toMatchObject({ name: "Mask", colors: ["W"], types: ["Enchantment"] });
    expect(c.subtypes).toContain("Aura");
    expect(s.objects[mask!]!.isToken).toBe(true);
    expect(objHasKeyword(s, s.objects[mask!]!, "Umbra armor")).toBe(true);
    expect(s.objects[e]!.counters.loyalty).toBe(3);
    // Destroyed: the Mask goes instead (CR 702.89a).
    destroyPermanent(s, s.objects[b]!, "destroyed");
    invalidateCharacteristics(s);
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.objects[mask!]?.zone ?? "gone").not.toBe("battlefield");
  });

  it("Estrid −1: the Mask may enchant a land (enchant permanent), and can't target Estrid herself", () => {
    const { s: s0, ap } = setup([]);
    const e = walker(s0, ap, estrid(), 4);
    const land = s0.battlefield.find((id) => controllerOf(s0, s0.objects[id]!) === ap && defOf(s0, s0.objects[id]!).name === "Forest")!;
    expect(planActivate(s0, ap, e, 1, [tgt(e)])).toBeNull();
    const s = settle(run(s0, planActivate(s0, ap, e, 1, [tgt(land)])));
    expect(attachedTo(s, land).map((id) => characteristics(s, s.objects[id]!).name)).toEqual(["Mask"]);
  });

  it("Estrid −7: mills seven, returns the non-Aura enchantments, then the Auras, which may enchant them (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const e = walker(s0, ap, estrid(), 7);
    const old = putOnBattlefield(s0, ap, card("Test Obelisk", "Enchantment", "{3}", { oracleText: "" }));
    const ward = into(s0, ap, auraOnEnchantment, "library");
    const mon = into(s0, ap, enchantmentCard, "library");
    const before = s0.players[ap]!.library.length;
    let s = run(s0, planActivate(s0, ap, e, 2));
    s = settle(s);
    expect(s.players[ap]!.library.length).toBe(before - 7);
    expect(s.objects[mon]!.zone).toBe("battlefield");
    // The Aura asks what it enchants: the Monument returned a moment ago is a choice.
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "enchant" });
    const opts = s.pending?.kind === "chooseOption" ? s.pending.options : [];
    expect(opts).toEqual(expect.arrayContaining([mon, old]));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: mon }));
    expect(s.objects[ward]).toMatchObject({ zone: "battlefield", attachedTo: mon });
  });

  it("The Rani: entering makes Mark of the Rani on another target creature (+2/+2, goaded); a goaded creature's combat damage to one of your opponents investigates", () => {
    const { s: s0, ap, opp, ids } = setup([rani()]);
    const third = s0.turnOrder[(s0.turnOrder.indexOf(opp) + 1) % 4]!;
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Test Ox" }));
    const plain = putOnBattlefield(s0, opp, bear({ name: "Test Yak" }));
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s);
    expect(s.pending?.kind).toBe("chooseTargets");
    // "Another target creature": not The Rani herself.
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(theirs)] }));
    const [mark] = attachedTo(s, theirs);
    expect(characteristics(s, s.objects[mark!]!)).toMatchObject({ name: "Mark of the Rani", colors: ["R"] });
    expect(controllerOf(s, s.objects[mark!]!)).toBe(ap);
    expect(pt(s, theirs)).toBe("4/4");
    s = passUntil(s, "declareAttackers", opp);
    expect(s.pending?.kind).toBe("declareAttackers");
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: theirs, defender: third }, { attacker: plain, defender: third }] });
    const clues = () => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === ap && characteristics(s, s.objects[id]!).subtypes.includes("Clue")).length;
    s = toEnd(s);
    expect(s.players[third]!.life).toBe(40 - 4 - 2);
    // One Clue: the goaded Ox, not the Yak.
    expect(clues()).toBe(1);
  });

  it("Preston Garvey: at the beginning of combat on your turn, a Settlement on up to one target land you control gives it '{T}: Add one mana of any color'", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, preston());
    const land = s0.battlefield.find((id) => controllerOf(s0, s0.objects[id]!) === ap && defOf(s0, s0.objects[id]!).name === "Swamp")!;
    let s = passUntil(s0, "beginCombat", ap);
    s = settle(s, { targets: [tgt(land)] });
    const [settlement] = attachedTo(s, land);
    expect(characteristics(s, s.objects[settlement!]!)).toMatchObject({ name: "Settlement", colors: ["G"] });
    const mana = abilitiesOf(s, s.objects[land]!).mana;
    expect(mana).toEqual([expect.objectContaining({ tap: true, produces: expect.objectContaining({ kind: "oneOf", options: ["W", "U", "B", "R", "G"] }) })]);
  });

  it("Smoke Spirits' Aid: one Smoke Blessing for each target; when an enchanted creature dies, it deals 1 damage to its controller and you create a Treasure", () => {
    const { s: s0, ap, opp, ids } = setup([smoke()]);
    const a = putOnBattlefield(s0, opp, bear({ name: "Test Ox" }));
    const b = putOnBattlefield(s0, ap, bear({ name: "Test Yak" }));
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(a), tgt(b)], undefined, undefined, 2));
    s = settle(s);
    expect(named(s, "Smoke Blessing")).toHaveLength(2);
    expect(attachedTo(s, a)).toHaveLength(1);
    expect(attachedTo(s, b)).toHaveLength(1);
    const life = s.players[opp]!.life;
    destroyPermanent(s, s.objects[a]!, "destroyed");
    s = settle(s);
    expect(s.players[opp]!.life).toBe(life - 1);
    expect(s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === ap && characteristics(s, s.objects[id]!).name === "Treasure Token")).toHaveLength(1);
  });

  it("Pardic Firecat in a graveyard counts as a Flame Burst for Flame Burst; Diligent Farmhand as a Muscle Burst for Muscle Burst", () => {
    const { s: s0, ap, opp, ids } = setup([flameBurst(), muscleBurst()]);
    into(s0, opp, firecat(), "graveyard");
    into(s0, ap, farmhand(), "graveyard");
    into(s0, ap, flameBurst(), "graveyard");
    const life = s0.players[opp]!.life;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    // 2 plus the Flame Burst in the graveyard and the Firecat: 4 (the Farmhand isn't a Flame Burst).
    expect(s.players[opp]!.life).toBe(life - 4);
    const b = putOnBattlefield(s, ap, bear());
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(b)])));
    // 3 plus the Farmhand (the Firecat and the Flame Bursts aren't Muscle Bursts): +4/+4.
    expect(pt(s, b)).toBe("6/6");
  });

  it("Konda's Banner: creatures sharing a color with the equipped creature get +1/+1, sharing a creature type another +1/+1, the equipped creature too", () => {
    const { s: s0, ap, opp } = setup([]);
    const lord = putOnBattlefield(s0, ap, legend());
    const kb = putOnBattlefield(s0, ap, banner());
    const greenBear = putOnBattlefield(s0, opp, bear({ colors: ["G"] }));
    const elf = putOnBattlefield(s0, ap, card("Test Elf", "Creature — Elf", "{1}{G}", { power: "1", toughness: "1", colors: ["G"] }));
    const redWarrior = putOnBattlefield(s0, opp, card("Test Raider", "Creature — Human Warrior", "{1}{R}", { power: "1", toughness: "1", colors: ["R"] }));
    const blue = putOnBattlefield(s0, ap, card("Test Drake", "Creature — Drake", "{1}{U}", { power: "1", toughness: "1", colors: ["U"] }));
    let s = s0;
    expect(pt(s, lord)).toBe("2/2"); // unattached: nothing
    s.objects[kb]!.attachedTo = lord;
    invalidateCharacteristics(s);
    expect(pt(s, lord)).toBe("4/4");
    expect(pt(s, greenBear)).toBe("3/3");
    expect(pt(s, elf)).toBe("3/3");
    expect(pt(s, redWarrior)).toBe("2/2");
    expect(pt(s, blue)).toBe("1/1");
  });
});
