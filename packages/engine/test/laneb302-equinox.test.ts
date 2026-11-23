// Lane B round B302: Equinox ("Enchant land / Enchanted land has "{T}: Counter target spell if it would destroy a land you
// control.""): its rulings (any spell can be targeted; "determine whether the targeted spell would destroy a land if it
// resolved right then"; not by chance, not by damage and a game rule, not by sacrifice, not only if a choice is made),
// CR 702.12b (indestructible), 704.5g (lethal damage), 614.1a and 701.19a ("would be destroyed").

import { describe, expect, it } from "vitest";
import { act, forest, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, applyAction, botActions, invalidateCharacteristics, isFullySupported, planActivate, planCast, spellWouldDestroyLand, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const equinox = (): CardDef => ({"oracleId":"0fa2cb01-476e-4e82-94e6-9639e53a7743","name":"Equinox","manaCost":"{W}","cmc":1,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant land\nEnchanted land has \"{T}: Counter target spell if it would destroy a land you control.\"","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"commanderLegal":"legal","set":"leg","releasedAt":"1994-06-01","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const stoneRain = (): CardDef => ({"oracleId":"6e880df6-fc00-43d2-a9c8-f575f40b78c6","name":"Stone Rain","manaCost":"{2}{R}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Destroy target land.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"sta","releasedAt":"2021-04-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const armageddon = (): CardDef => ({"oracleId":"c9ed8b01-959a-47d6-891e-0abbdccf6e4f","name":"Armageddon","manaCost":"{3}{W}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Destroy all lands.","colors":["W"],"colorIdentity":["W"],"keywords":[],"commanderLegal":"legal","set":"v14","releasedAt":"2014-08-22","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const citadel = (): CardDef => ({"oracleId":"8dc067bf-f78f-4ac4-b6e7-b305c42cf0bc","name":"Darksteel Citadel","manaCost":"","cmc":0,"typeLine":"Artifact Land","supertypes":[],"types":["Artifact","Land"],"subtypes":[],"oracleText":"Indestructible\n{T}: Add {C}.","colors":[],"colorIdentity":[],"keywords":["Indestructible"],"producedMana":["C"],"commanderLegal":"legal","set":"sld","releasedAt":"2021-10-15","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const tectonic = (): CardDef => ({"oracleId":"4a3c6d0e-6d77-4434-95f4-737879de026f","name":"Tectonic Break","manaCost":"{X}{R}{R}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Each player sacrifices X lands of their choice.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"mmq","releasedAt":"1999-10-04","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const wildSwing = (): CardDef => ({"oracleId":"92d07c7c-be30-4bcc-a632-99986fc5315c","name":"Wild Swing","manaCost":"{3}{R}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Choose three target nonenchantment permanents. Destroy one of them at random.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"shm","releasedAt":"2008-05-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const bendOrBreak = (): CardDef => ({"oracleId":"4362efe4-339d-40e1-bd72-3cc9e41bf93f","name":"Bend or Break","manaCost":"{3}{R}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Each player separates all nontoken lands they control into two piles. For each player, one of their piles is chosen by one of their opponents of their choice. Destroy all lands in the chosen piles. Tap all lands in the other piles.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"inv","releasedAt":"2000-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const arbor = (): CardDef => ({"oracleId":"e996cd67-739c-40f4-b276-0042acf26c71","name":"Dryad Arbor","manaCost":"","cmc":0,"typeLine":"Land Creature — Forest Dryad","supertypes":[],"types":["Land","Creature"],"subtypes":["Forest","Dryad"],"oracleText":"(This land isn't a spell, it's affected by summoning sickness, and it has \"{T}: Add {G}.\")","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"commanderLegal":"legal","set":"sld","releasedAt":"2026-02-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const moltenRain = (): CardDef => ({"oracleId":"e9774695-b2f1-4014-8504-04b2339be568","name":"Molten Rain","manaCost":"{1}{R}{R}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Destroy target land. If that land was nonbasic, Molten Rain deals 2 damage to the land's controller.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"mm3","releasedAt":"2017-03-17","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...ds: CardDef[]) => ds.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 200 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const landsOf = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.types.includes("Land"));
/** Equinox on one of `pid`'s lands (a Forest it gets), and that land. */
const enchant = (s: GameState, pid: PlayerId, on?: CardDef) => {
  const land = on ? putOnBattlefield(s, pid, on) : landsOf(s, pid).find((id) => s.cards[s.objects[id]!.cardId]!.name === "Forest")!;
  const aura = putOnBattlefield(s, pid, equinox());
  s.objects[aura]!.attachedTo = land;
  s.objects[land]!.tapped = false;
  invalidateCharacteristics(s);
  return { land, aura, index: abilitiesOf(s, s.objects[land]!).activated.findIndex((a) => /Counter target spell/.test(a.text ?? "")) };
};
/** `pid` casts `id` (in their hand) at `targets`; the spell's stack id. */
const castIt = (s0: GameState, pid: PlayerId, id: ObjectId, targets?: TargetChoice[], x?: number) => {
  const s = run(s0, planCast(s0, pid, id, targets, undefined, "auto", x));
  return { s, top: s.stack[s.stack.length - 1]!.id };
};
const inHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  return id;
};

describe("Equinox", () => {
  it("is supported", () => supported(equinox(), stoneRain(), armageddon(), citadel(), bolt(), tectonic(), wildSwing(), bendOrBreak(), arbor(), moltenRain()));

  it("counters Stone Rain aimed at a land you control: the land stays", () => {
    const { s: s0, ap, ids } = setup([stoneRain()]);
    const { land, index } = enchant(s0, ap);
    expect(index).toBeGreaterThanOrEqual(0);
    const target = landsOf(s0, ap).find((id) => id !== land && !s0.objects[id]!.tapped)!;
    let { s, top } = castIt(s0, ap, ids[0]!, [tgt(target)]);
    // The look-ahead leaves the game as it was.
    const before = JSON.stringify(s);
    expect(spellWouldDestroyLand(s, top, ap)).toBe(true);
    expect(JSON.stringify(s)).toBe(before);
    s = run(s, planActivate(s, ap, land, index, [{ kind: "stack", id: top }]));
    s = settle(s);
    expect(s.objects[target]!.zone).toBe("battlefield");
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.log.some((l) => /counter/i.test(typeof l === "string" ? l : JSON.stringify(l)))).toBe(true);
  });

  it("doesn't counter Stone Rain aimed at an opponent's land, or a Lightning Bolt (any spell can be targeted)", () => {
    const { s: s0, ap, ids, opp } = setup([stoneRain(), bolt()]);
    const { land, index } = enchant(s0, ap);
    const theirs = putOnBattlefield(s0, opp, forest);
    let { s, top } = castIt(s0, ap, ids[0]!, [tgt(theirs)]);
    expect(spellWouldDestroyLand(s, top, ap)).toBe(false);
    // Their own Equinox would counter it.
    expect(spellWouldDestroyLand(s, top, opp)).toBe(true);
    s = run(s, planActivate(s, ap, land, index, [{ kind: "stack", id: top }]));
    s = settle(s);
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    const b = castIt(s, ap, ids[1]!, [{ kind: "player", id: opp }]);
    expect(spellWouldDestroyLand(b.s, b.top, ap)).toBe(false);
  });

  it("Armageddon and Molten Rain would; not an indestructible Darksteel Citadel", () => {
    const { s: s0, ap, ids } = setup([armageddon(), moltenRain(), stoneRain()]);
    const a = castIt(s0, ap, ids[0]!);
    expect(spellWouldDestroyLand(a.s, a.top, ap)).toBe(true);
    const s1 = setup([moltenRain(), stoneRain()]);
    const target = landsOf(s1.s, s1.ap)[0]!;
    const m = castIt(s1.s, s1.ap, s1.ids[0]!, [tgt(target)]);
    expect(spellWouldDestroyLand(m.s, m.top, s1.ap)).toBe(true);
    // Stone Rain at an indestructible land: it can't be destroyed (CR 702.12b).
    const s2 = setup([stoneRain()]);
    const cit = putOnBattlefield(s2.s, s2.ap, citadel());
    invalidateCharacteristics(s2.s);
    const r = castIt(s2.s, s2.ap, s2.ids[0]!, [tgt(cit)]);
    expect(spellWouldDestroyLand(r.s, r.top, s2.ap)).toBe(false);
  });

  it("not a sacrifice (Tectonic Break), damage to a land creature (Dryad Arbor), a random pick (Wild Swing) or a choice (Bend or Break)", () => {
    const { s: s0, ap, ids, opp } = setup([tectonic(), bolt(), wildSwing(), bendOrBreak()]);
    const arborId = putOnBattlefield(s0, ap, arbor());
    invalidateCharacteristics(s0);
    const t = castIt(s0, ap, ids[0]!, undefined, 1);
    expect(spellWouldDestroyLand(t.s, t.top, ap)).toBe(false);
    const b = castIt(s0, ap, ids[1]!, [tgt(arborId)]);
    expect(spellWouldDestroyLand(b.s, b.top, ap)).toBe(false);
    const mine = landsOf(s0, ap).filter((id) => !s0.objects[id]!.tapped).slice(-3);
    const w = castIt(s0, ap, ids[2]!, mine.map(tgt));
    expect(spellWouldDestroyLand(w.s, w.top, ap)).toBe(false);
    const k = castIt(s0, ap, ids[3]!);
    expect(spellWouldDestroyLand(k.s, k.top, ap)).toBe(false);
    void opp;
  });

  it("a bot taps its Equinox land against an opponent's Stone Rain at its land", () => {
    const { s: s0, ap, ids, opp } = setup([stoneRain()]);
    const { land, index } = enchant(s0, opp, forest);
    const target = putOnBattlefield(s0, opp, forest);
    invalidateCharacteristics(s0);
    const { s, top } = castIt(s0, ap, ids[0]!, [tgt(target)]);
    let t = s;
    for (let i = 0; i < 6 && waitingOn(t) !== opp; i++) t = act(t, { type: "passPriority", player: waitingOn(t)! });
    expect(waitingOn(t)).toBe(opp);
    const acts = botActions(t, opp);
    expect(acts.some((a) => a.type === "activateAbility" && a.objectId === land && a.index === index)).toBe(true);
    for (const a of acts) t = act(t, a);
    t = settle(t);
    expect(t.objects[target]!.zone).toBe("battlefield");
    void top;
  });
});
