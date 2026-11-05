// Lane B round B109: Overload, Agonizing Demise, Morgue Burst, Pristine Skywise, Silence the Believers, Enshrouding Mist,
// Ichor Shade, Gideon's Triumph, Vizier of Deferment, Driftgloom Coyote, Furious Forebear, Danitha, Sword of Hope and Flames
// of the Blood Hand.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, gainLife, invalidateCharacteristics, isFullySupported, moveObject, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; questions of the players in `me` stop it, others the bots answer. */
const settle = (s: GameState, opts: { me?: PlayerId[]; may?: boolean } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay" && opts.may !== undefined) s = act(s, { type: "chooseMay", player: p.player, yes: opts.may });
    else if (p && opts.me?.includes(p.player)) return s;
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (pid: PlayerId): TargetChoice => ({ kind: "player", id: pid });
/** Moves a new card for `def` from the battlefield into `pid`'s `zone`. */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
/** `ap` attacks with `attacks`, then `defender` blocks with `blocks`, everyone else blocking nothing. */
const combat = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[], defender: PlayerId, blocks: { blocker: string; attacker: string }[]) => {
  s = passUntil(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks });
  for (let i = 0; i < 20 && !(s.pending?.kind === "declareBlockers" && s.pending.player === defender); i++) {
    if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return act(s, { type: "declareBlockers", player: defender, blocks });
};
/** Passes until `ap`'s postcombat main phase, everyone else doing nothing. */
const toMain2 = (s: GameState, ap: PlayerId) => {
  for (let i = 0; i < 200 && !(s.step === "main2" && s.activePlayer === ap && !s.stack.length && !s.pending); i++) {
    if (s.pending) for (const a of botActions(s, s.pending.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};

// Real oracle text (Scryfall).
const overload = (): CardDef => ({"oracleId":"07159efc-c69f-4164-a8ca-9da641dbf702","name":"Overload","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Kicker {2} (You may pay an additional {2} as you cast this spell.)\nDestroy target artifact if its mana value is 2 or less. If this spell was kicked, destroy that artifact if its mana value is 5 or less instead.","colors":["R"],"colorIdentity":["R"],"keywords":["Kicker"],"imageUrl":"https://cards.scryfall.io/normal/front/c/9/c91fca91-7296-422e-b251-d571b710ff71.jpg?1783945681","artUrl":"https://cards.scryfall.io/art_crop/front/c/9/c91fca91-7296-422e-b251-d571b710ff71.jpg?1783945681","commanderLegal":"legal","set":"inv","releasedAt":"2000-10-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const demise = (): CardDef => ({"oracleId":"41681a1f-0777-4b96-8c7e-d6a5d1b1c8fc","name":"Agonizing Demise","manaCost":"{3}{B}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Kicker {1}{R} (You may pay an additional {1}{R} as you cast this spell.)\nDestroy target nonblack creature. It can't be regenerated. If this spell was kicked, Agonizing Demise deals damage equal to that creature's power to the creature's controller.","colors":["B"],"colorIdentity":["B","R"],"keywords":["Kicker"],"imageUrl":"https://cards.scryfall.io/normal/front/5/3/539ac5e1-4bad-4f70-abac-e70c406bebec.jpg?1783945699","artUrl":"https://cards.scryfall.io/art_crop/front/5/3/539ac5e1-4bad-4f70-abac-e70c406bebec.jpg?1783945699","commanderLegal":"legal","set":"inv","releasedAt":"2000-10-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const morgue = (): CardDef => ({"oracleId":"ee3b72ac-35b6-45d0-bb50-5a5899b291b1","name":"Morgue Burst","manaCost":"{4}{B}{R}","cmc":6,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Return target creature card from your graveyard to your hand. Morgue Burst deals damage to any target equal to the power of the card returned this way.","colors":["B","R"],"colorIdentity":["B","R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/b/7b3c2909-87ab-4027-9b56-58a2abae3fa3.jpg?1783940025","artUrl":"https://cards.scryfall.io/art_crop/front/7/b/7b3c2909-87ab-4027-9b56-58a2abae3fa3.jpg?1783940025","commanderLegal":"legal","set":"dgm","releasedAt":"2013-05-03","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const skywise = (): CardDef => ({"oracleId":"de80c742-4da0-4d67-9711-2b4e6452e2d0","name":"Pristine Skywise","manaCost":"{4}{W}{U}","cmc":6,"typeLine":"Creature — Dragon","supertypes":[],"types":["Creature"],"subtypes":["Dragon"],"oracleText":"Flying\nWhenever you cast a noncreature spell, untap this creature. It gains protection from the color of your choice until end of turn.","power":"6","toughness":"4","colors":["U","W"],"colorIdentity":["U","W"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/0/8/083eabac-f7c9-45d9-b3c7-10d719da1e0b.jpg?1783938571","artUrl":"https://cards.scryfall.io/art_crop/front/0/8/083eabac-f7c9-45d9-b3c7-10d719da1e0b.jpg?1783938571","commanderLegal":"legal","set":"dtk","releasedAt":"2015-03-27","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const silence = (): CardDef => ({"oracleId":"3c2de008-5747-49c0-89c1-83331cb55896","name":"Silence the Believers","manaCost":"{2}{B}{B}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Strive — This spell costs {2}{B} more to cast for each target beyond the first.\nExile any number of target creatures and all Auras attached to them.","colors":["B"],"colorIdentity":["B"],"keywords":["Strive"],"imageUrl":"https://cards.scryfall.io/normal/front/d/6/d6dc2bd1-a980-4eab-8bb3-1ce28c3f9ef4.jpg?1783939430","artUrl":"https://cards.scryfall.io/art_crop/front/d/6/d6dc2bd1-a980-4eab-8bb3-1ce28c3f9ef4.jpg?1783939430","commanderLegal":"legal","set":"jou","releasedAt":"2014-05-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const mist = (): CardDef => ({"oracleId":"e513c05c-14c0-4d2e-a5b3-e4f29cb4c1a2","name":"Enshrouding Mist","manaCost":"{W}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target creature gets +1/+1 until end of turn. Prevent all damage that would be dealt to it this turn. If it's renowned, untap it.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/0/b059bd3e-451c-445a-b299-544c82fc0eb9.jpg?1783938362","artUrl":"https://cards.scryfall.io/art_crop/front/b/0/b059bd3e-451c-445a-b299-544c82fc0eb9.jpg?1783938362","commanderLegal":"legal","set":"ori","releasedAt":"2015-07-17","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const shade = (): CardDef => ({"oracleId":"083ea8b0-ff2a-406e-90f1-668f33443747","name":"Ichor Shade","manaCost":"{2}{B}","cmc":3,"typeLine":"Creature — Phyrexian Shade","supertypes":[],"types":["Creature"],"subtypes":["Phyrexian","Shade"],"oracleText":"At the beginning of your end step, if an artifact or creature was put into a graveyard from the battlefield this turn, put a +1/+1 counter on this creature.","power":"2","toughness":"3","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/f/0fd86fbf-eac2-456b-b4bb-437ff9be9b58.jpg?1783917006","artUrl":"https://cards.scryfall.io/art_crop/front/0/f/0fd86fbf-eac2-456b-b4bb-437ff9be9b58.jpg?1783917006","commanderLegal":"legal","set":"mom","releasedAt":"2023-04-21","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const triumph = (): CardDef => ({"oracleId":"daec03b6-e3f8-4e44-9766-c64dc23fa3dc","name":"Gideon's Triumph","manaCost":"{1}{W}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target opponent sacrifices a creature of their choice that attacked or blocked this turn. If you control a Gideon planeswalker, that player sacrifices two of those creatures of their choice instead.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/6/d6610c6a-717f-406e-a49d-b6e548880946.jpg?1783933481","artUrl":"https://cards.scryfall.io/art_crop/front/d/6/d6610c6a-717f-406e-a49d-b6e548880946.jpg?1783933481","commanderLegal":"legal","set":"war","releasedAt":"2019-05-03","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const vizier = (): CardDef => ({"oracleId":"008d5896-6fc9-4aaa-8c6f-a44c2feb98bb","name":"Vizier of Deferment","manaCost":"{2}{W}","cmc":3,"typeLine":"Creature — Human Cleric","supertypes":[],"types":["Creature"],"subtypes":["Human","Cleric"],"oracleText":"Flash\nWhen this creature enters, you may exile target creature if it attacked or blocked this turn. Return that card to the battlefield under its owner's control at the beginning of the next end step.","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":["Flash"],"imageUrl":"https://cards.scryfall.io/normal/front/2/6/2684f2e5-e3f9-4277-94a1-aba6913ac53b.jpg?1783936529","artUrl":"https://cards.scryfall.io/art_crop/front/2/6/2684f2e5-e3f9-4277-94a1-aba6913ac53b.jpg?1783936529","commanderLegal":"legal","set":"akh","releasedAt":"2017-04-28","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const flames = (): CardDef => ({"oracleId":"4e9df979-c1c2-4de1-944e-c5e2d782e66e","name":"Flames of the Blood Hand","manaCost":"{2}{R}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Flames of the Blood Hand deals 4 damage to target player or planeswalker. The damage can't be prevented. If that player or that planeswalker's controller would gain life this turn, that player gains no life instead.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/7/a79701b4-d220-4c3e-b96c-7a77a22ba899.jpg?1783944191","artUrl":"https://cards.scryfall.io/art_crop/front/a/7/a79701b4-d220-4c3e-b96c-7a77a22ba899.jpg?1783944191","commanderLegal":"legal","set":"bok","releasedAt":"2005-02-04","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const coyote = (): CardDef => ({"oracleId":"f76a86f3-568a-40b3-8e2c-f84db4141293","name":"Driftgloom Coyote","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Elemental Coyote","supertypes":[],"types":["Creature"],"subtypes":["Elemental","Coyote"],"oracleText":"When this creature enters, exile target creature an opponent controls until this creature leaves the battlefield. If that creature had power 2 or less, put a +1/+1 counter on this creature.","power":"3","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/7/d7ab2de3-3aea-461a-a74f-fb742cf8a198.jpg?1783910861","artUrl":"https://cards.scryfall.io/art_crop/front/d/7/d7ab2de3-3aea-461a-a74f-fb742cf8a198.jpg?1783910861","commanderLegal":"legal","set":"blb","releasedAt":"2024-08-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const forebear = (): CardDef => ({"oracleId":"4fb1d33f-a87d-46cf-a73e-882c3dbcb26f","name":"Furious Forebear","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature — Spirit Warrior","supertypes":[],"types":["Creature"],"subtypes":["Spirit","Warrior"],"oracleText":"Whenever a creature you control dies while this card is in your graveyard, you may pay {1}{W}. If you do, return this card from your graveyard to your hand.","power":"3","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/4/a4f247b6-8212-4e78-a452-d2d3be228d8e.jpg?1783907413","artUrl":"https://cards.scryfall.io/art_crop/front/a/4/a4f247b6-8212-4e78-a452-d2d3be228d8e.jpg?1783907413","commanderLegal":"legal","set":"tdm","releasedAt":"2025-04-11","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const danitha = (): CardDef => ({"oracleId":"f7b754d3-9863-420d-895d-00e70b8b078a","name":"Danitha, Sword of Hope","manaCost":"{2}{W}","cmc":3,"typeLine":"Legendary Creature — Human Knight","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Knight"],"oracleText":"First strike\nWhenever you cast an Equipment spell or a spell that targets a creature you control, draw a card. This ability triggers only once each turn.","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":["First strike"],"imageUrl":"https://cards.scryfall.io/normal/front/d/5/d5cb9810-3c2d-4ae4-b8b6-0155ca3f47ad.jpg?1789127178","artUrl":"https://cards.scryfall.io/art_crop/front/d/5/d5cb9810-3c2d-4ae4-b8b6-0155ca3f47ad.jpg?1789127178","commanderLegal":"legal","set":"fra","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

// Test cards.
const trinket = (name: string, mv: number) => card(name, "Artifact", `{${mv}}`, { cmc: mv });
const wall = (name: string) => card(name, "Creature — Wall", "{1}{W}", { cmc: 2, power: "0", toughness: "6", colors: ["W"] });
const vanilla = (name: string, p: number, t: number) => card(name, "Creature — Beast", "{2}{G}", { cmc: 3, power: String(p), toughness: String(t), colors: ["G"] });
const sorcery = () => card("Test Thought", "Sorcery", "{U}", { cmc: 1, colors: ["U"], oracleText: "Draw a card." });
const bolt = () => card("Test Bolt", "Instant", "{R}", { cmc: 1, colors: ["R"], oracleText: "Test Bolt deals 3 damage to any target." });
const heal = () => card("Test Heal", "Instant", "{W}", { cmc: 1, colors: ["W"], oracleText: "Target player gains 5 life." });
const pump = () => card("Test Pump", "Instant", "{W}", { cmc: 1, colors: ["W"], oracleText: "Target creature gets +1/+1 until end of turn." });
const sword = () => card("Test Sword", "Artifact — Equipment", "{1}", { cmc: 1, oracleText: "Equipped creature gets +1/+1.\nEquip {1}" });
const aura = () => card("Test Aura", "Enchantment — Aura", "{W}", { cmc: 1, colors: ["W"], oracleText: "Enchant creature\nEnchanted creature gets +1/+1." });
const wrath = () => card("Test Wrath", "Sorcery", "{W}", { cmc: 1, colors: ["W"], oracleText: "Destroy all creatures." });
const gideon = () => card("Gideon Test", "Legendary Planeswalker — Gideon", "{3}{W}", { cmc: 4, colors: ["W"], loyalty: "4", oracleText: "+1: You gain 1 life." });
const walker = () => card("Test Walker", "Legendary Planeswalker — Ajani", "{3}{W}", { cmc: 4, colors: ["W"], loyalty: "4", oracleText: "+1: You gain 1 life." });

describe("Lane B round B109", () => {
  it("every card here is fully supported", () => {
    supported(overload(), demise(), morgue(), skywise(), silence(), mist(), shade(), triumph(), vizier(), flames(), coyote(), forebear(), danitha());
  });

  it("Overload: destroys an artifact with mana value 2 or less, 5 or less if kicked, checked as it resolves", () => {
    for (const [mv, kicked, destroyed] of [[2, false, true], [3, false, false], [5, true, true], [6, true, false]] as const) {
      let { s, ap, opp, ids } = setup([overload()]);
      const a = putOnBattlefield(s, opp, trinket(`Trinket ${mv}`, mv));
      s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(a)], undefined, "auto", undefined, kicked ? { kicks: [0] } : {})));
      expect(zone(s, a), `${mv} ${kicked}`).toBe(destroyed ? "graveyard" : "battlefield");
    }
  });

  it("Agonizing Demise: kicked, it deals damage equal to the destroyed creature's last known power to its controller", () => {
    for (const kicked of [false, true]) {
      let { s, ap, opp, ids } = setup([demise()]);
      const big = putOnBattlefield(s, opp, vanilla("Big Beast", 5, 5));
      const life = s.players[opp]!.life;
      s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(big)], undefined, "auto", undefined, kicked ? { kicks: [0] } : {})));
      expect(zone(s, big)).toBe("graveyard");
      expect(s.players[opp]!.life, `kicked ${kicked}`).toBe(life - (kicked ? 5 : 0));
    }
  });

  it("Agonizing Demise: a nonblack creature only", () => {
    const { s, ap, opp, ids } = setup([demise()]);
    const black = putOnBattlefield(s, opp, card("Black Bear", "Creature — Bear", "{1}{B}", { cmc: 2, power: "2", toughness: "2", colors: ["B"] }));
    expect(planCast(s, ap, ids[0]!, [tgt(black)])).toBeNull();
  });

  it("Morgue Burst: returns the card and deals damage equal to its power; none if the card is gone", () => {
    for (const gone of [false, true]) {
      let { s, ap, opp, ids } = setup([morgue()]);
      const big = into(s, ap, vanilla("Big Beast", 4, 4), "graveyard");
      const life = s.players[opp]!.life;
      s = run(s, planCast(s, ap, ids[0]!, [tgt(big), player(opp)]));
      if (gone) moveObject(s, big, "exile");
      s = settle(s);
      expect(zone(s, big)).toBe(gone ? "exile" : "hand");
      expect(s.players[opp]!.life, `gone ${gone}`).toBe(life - (gone ? 0 : 4));
    }
  });

  it("Pristine Skywise: casting a noncreature spell untaps it and gives it protection from a color", () => {
    let { s, ap, ids } = setup([sorcery(), bear()]);
    const sky = putOnBattlefield(s, ap, skywise());
    s.objects[sky]!.tapped = true;
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(s.objects[sky]!.tapped).toBe(false);
    const kws = characteristics(s, s.objects[sky]!).keywords.join("|");
    expect(kws).toMatch(/Protection from (white|blue|black|red|green)/i);
  });

  it("Pristine Skywise: a creature spell doesn't trigger it", () => {
    let { s, ap, ids } = setup([bear()]);
    const sky = putOnBattlefield(s, ap, skywise());
    s.objects[sky]!.tapped = true;
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(s.objects[sky]!.tapped).toBe(true);
  });

  it("Silence the Believers: exiles any number of target creatures and the Auras attached to them, at once", () => {
    let { s, ap, opp, ids } = setup([silence()]);
    const a = putOnBattlefield(s, opp, vanilla("Beast A", 3, 3));
    const b = putOnBattlefield(s, opp, vanilla("Beast B", 3, 3));
    const c = putOnBattlefield(s, opp, vanilla("Beast C", 3, 3));
    const spare = putOnBattlefield(s, opp, vanilla("Beast D", 3, 3));
    const au = putOnBattlefield(s, opp, aura());
    s.objects[au]!.attachedTo = b;
    invalidateCharacteristics(s);
    expect(pt(s, b)).toBe("4/4");
    // Strive: {2}{B} more for each target beyond the first.
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, B: 4, C: 6 };
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(a), tgt(b), tgt(c)])));
    expect([a, b, c, au, spare].map((id) => zone(s, id))).toEqual(["exile", "exile", "exile", "exile", "battlefield"]);
  });

  it("Enshrouding Mist: +1/+1 and prevents all damage to it this turn; untaps it only if it's renowned", () => {
    for (const renowned of [false, true]) {
      let { s, ap, opp, ids } = setup([mist()]);
      const mine = putOnBattlefield(s, ap, vanilla("Hero", 2, 2));
      s.objects[mine]!.tapped = true;
      if (renowned) s.objects[mine]!.renowned = true;
      s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(mine)])));
      expect(pt(s, mine)).toBe("3/3");
      expect(s.objects[mine]!.tapped, `renowned ${renowned}`).toBe(!renowned);
      // The damage of an opponent's bolt is prevented.
      const b = into(s, opp, bolt(), "hand");
      s.players[opp]!.manaPool = { ...s.players[opp]!.manaPool, R: 1 };
      s = act(s, { type: "passPriority", player: ap });
      s = settle(run(s, planCast(s, opp, b, [tgt(mine)])));
      expect(zone(s, mine)).toBe("battlefield");
      expect(s.objects[mine]!.damage ?? 0).toBe(0);
    }
  });

  it("Ichor Shade: a +1/+1 counter at your end step if an artifact or creature went to a graveyard from the battlefield this turn", () => {
    for (const what of ["none", "artifact", "token"] as const) {
      let { s, ap, opp } = setup([]);
      const shadeId = putOnBattlefield(s, ap, shade());
      if (what === "artifact") moveObject(s, putOnBattlefield(s, opp, trinket("Trinket", 1)), "graveyard");
      if (what === "token") {
        const t = putOnBattlefield(s, opp, bear());
        s.objects[t]!.isToken = true;
        moveObject(s, t, "graveyard");
      }
      s = passUntil(s, "end", ap);
      s = settle(s);
      expect(s.objects[shadeId]!.counters?.["+1/+1"] ?? 0, what).toBe(what === "none" ? 0 : 1);
    }
  });

  it("Gideon's Triumph: the opponent sacrifices a creature that attacked or blocked this turn, two with a Gideon", () => {
    for (const withGideon of [false, true]) {
      let { s, ap, opp, ids } = setup([triumph()]);
      const attacker = putOnBattlefield(s, ap, vanilla("Attacker", 2, 2));
      const w1 = putOnBattlefield(s, opp, wall("Wall One"));
      const w2 = putOnBattlefield(s, opp, wall("Wall Two"));
      const idle = putOnBattlefield(s, opp, wall("Idle Wall"));
      if (withGideon) {
        const g = putOnBattlefield(s, ap, gideon());
        s.objects[g]!.counters = { loyalty: 4 };
      }
      s = combat(s, ap, [{ attacker, defender: opp }], opp, [{ blocker: w1, attacker }, { blocker: w2, attacker }]);
      s = toMain2(s, ap);
      s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
      const gone = [w1, w2].filter((id) => zone(s, id) === "graveyard").length;
      expect(gone, `Gideon ${withGideon}`).toBe(withGideon ? 2 : 1);
      expect(zone(s, idle)).toBe("battlefield");
    }
  });

  it("Gideon's Triumph: nothing to sacrifice if none of that player's creatures attacked or blocked", () => {
    let { s, ap, opp, ids } = setup([triumph()]);
    const idle = putOnBattlefield(s, opp, wall("Idle Wall"));
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    expect(zone(s, idle)).toBe("battlefield");
  });

  it("Vizier of Deferment: exiles a creature that attacked or blocked this turn until the next end step; any other stays", () => {
    for (const blocked of [true, false]) {
      let { s, ap, opp, ids } = setup([vizier()]);
      const attacker = putOnBattlefield(s, ap, vanilla("Attacker", 2, 2));
      const w = putOnBattlefield(s, opp, wall("Wall One"));
      s = combat(s, ap, [{ attacker, defender: opp }], opp, blocked ? [{ blocker: w, attacker }] : []);
      s = toMain2(s, ap);
      s = settle(run(s, planCast(s, ap, ids[0]!)), { me: [ap] });
      // The enters trigger's target.
      expect(s.pending?.kind).toBe("chooseTargets");
      s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(w)] });
      s = settle(s, { may: true });
      expect(zone(s, w), `blocked ${blocked}`).toBe(blocked ? "exile" : "battlefield");
      if (blocked) {
        s = passUntil(s, "end", ap);
        s = settle(s);
        const back = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Wall One");
        expect(back).toBeDefined();
        expect(s.objects[back!]!.controller ?? s.objects[back!]!.owner).toBe(opp);
      }
    }
  });

  it("Driftgloom Coyote: exiles an opponent's creature until it leaves; a +1/+1 counter if that creature had power 2 or less", () => {
    for (const [p, counter] of [[2, 1], [3, 0]] as const) {
      let { s, ap, opp, ids } = setup([coyote()]);
      const victim = putOnBattlefield(s, opp, vanilla(`Beast ${p}`, p, 4));
      s = settle(run(s, planCast(s, ap, ids[0]!)), { me: [ap] });
      expect(s.pending?.kind).toBe("chooseTargets");
      s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(victim)] });
      s = settle(s);
      const coy = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Driftgloom Coyote")!;
      expect(zone(s, victim)).toBe("exile");
      expect(s.objects[coy]!.counters?.["+1/+1"] ?? 0, `power ${p}`).toBe(counter);
      moveObject(s, coy, "graveyard");
      s = settle(s);
      expect(s.battlefield.some((id) => s.cards[s.objects[id]!.cardId]!.name === `Beast ${p}`)).toBe(true);
    }
  });

  it("Furious Forebear: when a creature you control dies, you may pay {1}{W} to return it from your graveyard to your hand", () => {
    for (const pay of [true, false]) {
      let { s, ap, ids } = setup([bolt()]);
      const fb = into(s, ap, forebear(), "graveyard");
      const mine = putOnBattlefield(s, ap, bear());
      s = run(s, planCast(s, ap, ids[0]!, [tgt(mine)]));
      // The {1}{W} paid as the trigger resolves comes from the pool.
      s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, W: 1, C: 1 };
      s = settle(s, { may: pay });
      expect(zone(s, mine)).toBe("graveyard");
      expect(zone(s, fb), `pay ${pay}`).toBe(pay ? "hand" : "graveyard");
    }
  });

  it("Furious Forebear: doesn't trigger when it dies at the same time as the creature", () => {
    let { s, ap, ids } = setup([wrath()]);
    const fb = putOnBattlefield(s, ap, forebear());
    putOnBattlefield(s, ap, bear());
    s = settle(run(s, planCast(s, ap, ids[0]!)), { may: true });
    expect(zone(s, fb)).toBe("graveyard");
  });

  it("Danitha, Sword of Hope: draws for an Equipment spell or a spell that targets a creature you control, once each turn", () => {
    for (const [what, draws] of [["sword", 1], ["pump mine", 1], ["pump theirs", 0], ["sword then pump", 1]] as const) {
      let { s, ap, opp, ids } = setup([sword(), pump()]);
      putOnBattlefield(s, ap, danitha());
      const mine = putOnBattlefield(s, ap, bear());
      const theirs = putOnBattlefield(s, opp, bear());
      const hand = s.players[ap]!.hand.length;
      if (what === "sword" || what === "sword then pump") s = settle(run(s, planCast(s, ap, ids[0]!)));
      if (what !== "sword") s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(what === "pump theirs" ? theirs : mine)])));
      const cast = what === "sword then pump" ? 2 : 1;
      expect(s.players[ap]!.hand.length, what).toBe(hand - cast + draws);
    }
  });

  it("Flames of the Blood Hand: 4 unpreventable damage, and that player gains no life this turn", () => {
    let { s, ap, opp, ids } = setup([flames(), heal()]);
    const life = s.players[opp]!.life;
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    expect(s.players[opp]!.life).toBe(life - 4);
    s = settle(run(s, planCast(s, ap, ids[1]!, [player(opp)])));
    expect(s.players[opp]!.life).toBe(life - 4);
    // Only that player.
    const mine = s.players[ap]!.life;
    gainLife(s, ap, 3);
    expect(s.players[ap]!.life).toBe(mine + 3);
  });

  it("Flames of the Blood Hand: aimed at a planeswalker, its controller gains no life this turn", () => {
    let { s, ap, opp, ids } = setup([flames()]);
    const w = putOnBattlefield(s, opp, walker());
    s.objects[w]!.counters = { loyalty: 6 };
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(w)])));
    expect(s.objects[w]!.counters?.loyalty).toBe(2);
    const life = s.players[opp]!.life;
    gainLife(s, opp, 3);
    expect(s.players[opp]!.life).toBe(life);
  });
});
