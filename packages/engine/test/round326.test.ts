// Round 326 (Lane A, skip-list cards): "Choose target creature card in a graveyard that was put there from the battlefield
// this turn. Put that card onto the battlefield under your control." (Grim Return); a target "with mana value 2 or 3"
// (Frodo, Determined Hero); {0} rather than a cycling cost (Gavi, Nest Warden; New Perspectives); "Each opponent must
// attack with at least one creature each combat if able." (Seeker of Slaanesh); "You may put an Elf or Tyvar card from your
// graveyard onto the battlefield." (Harald Unites the Elves); an optional extra draw that makes that player's spells cost
// {2} more this turn (Academy Loremaster).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { activatedCosts, activationCost, applyAction, botActions, compileCard, controllerOf, invalidateCharacteristics, isFullySupported, legalTargets, moveObject, planActivate, planCast, spellCost, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; other players' questions as the bots would. Stops at any question of `me`'s. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) s = act(s, botActions(s, p.player)[0]!);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** A card in `pid`'s `zone`. */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const bear = (name = "Test Bear", extra: Partial<CardDef> = {}) => card(name, "Creature — Bear", "{1}{G}", { cmc: 2, power: "2", toughness: "2", ...extra });
/** The mana a cost asks for, each colored symbol 1. */
const generic = (c: { symbols: { kind: string; amount?: number }[] }, extra = 0) => extra + c.symbols.reduce((n, y) => n + (y.kind === "generic" ? (y.amount ?? 0) : 1), 0);
const spellMana = (s: GameState, pid: PlayerId, id: string) => ((c) => generic(c.cost, c.extra))(spellCost(s, pid, s.objects[id]!));
const cycling = (d: CardDef) => compileCard(d).activated.findIndex((a) => a.cycling);

// Real oracle text (Scryfall).
const grim = (): CardDef => ({"oracleId":"c1d54d0c-53fc-474c-ba89-2aa1be3bf27d","name":"Grim Return","manaCost":"{2}{B}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Choose target creature card in a graveyard that was put there from the battlefield this turn. Put that card onto the battlefield under your control.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/5/15b69f74-3b54-4db4-abf3-b71db8cc9562.jpg?1783939923","artUrl":"https://cards.scryfall.io/art_crop/front/1/5/15b69f74-3b54-4db4-abf3-b71db8cc9562.jpg?1783939923","commanderLegal":"legal","set":"m14","releasedAt":"2013-07-19","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const frodo = (): CardDef => ({"oracleId":"ae50be07-c8bc-45db-b47d-701c5d9ee633","name":"Frodo, Determined Hero","manaCost":"{1}{W}","cmc":2,"typeLine":"Legendary Creature — Halfling Warrior","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Halfling","Warrior"],"oracleText":"Whenever Frodo enters or attacks, you may attach target Equipment you control with mana value 2 or 3 to Frodo.\nDuring your turn, prevent all damage that would be dealt to Frodo.","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/2/226694d7-ba9b-4e79-b45a-634769815e74.jpg?1783916176","artUrl":"https://cards.scryfall.io/art_crop/front/2/2/226694d7-ba9b-4e79-b45a-634769815e74.jpg?1783916176","commanderLegal":"legal","set":"ltr","releasedAt":"2023-06-23","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const gavi = (): CardDef => ({"oracleId":"716a3bb8-04bd-41f5-a568-131f175e00a6","name":"Gavi, Nest Warden","manaCost":"{2}{U}{R}{W}","cmc":5,"typeLine":"Legendary Creature — Human Shaman","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Shaman"],"oracleText":"You may pay {0} rather than pay the cycling cost of the first card you cycle each turn.\nWhenever you draw your second card each turn, create a 2/2 red and white Dinosaur Cat creature token.","power":"2","toughness":"5","colors":["R","U","W"],"colorIdentity":["R","U","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/0/80bc07d5-bdbb-4a6d-8958-0c172ea80245.jpg?1783931232","artUrl":"https://cards.scryfall.io/art_crop/front/8/0/80bc07d5-bdbb-4a6d-8958-0c172ea80245.jpg?1783931232","commanderLegal":"legal","set":"c20","releasedAt":"2020-04-17","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const perspectives = (): CardDef => ({"oracleId":"e1b8a89a-b308-4fc5-ada7-61de6e21b7f9","name":"New Perspectives","manaCost":"{5}{U}","cmc":6,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, draw three cards.\nAs long as you have seven or more cards in hand, you may pay {0} rather than pay cycling costs.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/5/c56b5290-997d-44de-ac83-4bc9a9911858.jpg?1783936518","artUrl":"https://cards.scryfall.io/art_crop/front/c/5/c56b5290-997d-44de-ac83-4bc9a9911858.jpg?1783936518","commanderLegal":"legal","set":"akh","releasedAt":"2017-04-28","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const seeker = (): CardDef => ({"oracleId":"47af21d3-b43f-4101-81cf-ca44db1a2706","name":"Seeker of Slaanesh","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Demon","supertypes":[],"types":["Creature"],"subtypes":["Demon"],"oracleText":"Haste\nAllure of Slaanesh — Each opponent must attack with at least one creature each combat if able.","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":["Haste","Allure of Slaanesh"],"imageUrl":"https://cards.scryfall.io/normal/front/9/f/9f07e21c-a775-43bb-90a2-545a5e1b909b.jpg?1783920882","artUrl":"https://cards.scryfall.io/art_crop/front/9/f/9f07e21c-a775-43bb-90a2-545a5e1b909b.jpg?1783920882","commanderLegal":"legal","set":"40k","releasedAt":"2022-10-07","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const harald = (): CardDef => ({"oracleId":"d0cc7e79-69dc-4f9d-9eed-1848f8ddb1be","name":"Harald Unites the Elves","manaCost":"{2}{B}{G}","cmc":4,"typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — Mill three cards. You may put an Elf or Tyvar card from your graveyard onto the battlefield.\nII — Put a +1/+1 counter on each Elf you control.\nIII — Whenever an Elf you control attacks this turn, target creature an opponent controls gets -1/-1 until end of turn.","colors":["B","G"],"colorIdentity":["B","G"],"keywords":["Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/e/7/e7c5f681-0145-45e9-b943-ca9784cfdea0.jpg?1783928196","artUrl":"https://cards.scryfall.io/art_crop/front/e/7/e7c5f681-0145-45e9-b943-ca9784cfdea0.jpg?1783928196","commanderLegal":"legal","set":"khm","releasedAt":"2021-02-05","rarity":"rare","layout":"saga","gameChanger":false} as CardDef);
const lore = (): CardDef => ({"oracleId":"7d540860-ae94-4773-a526-aaffca3eb057","name":"Academy Loremaster","manaCost":"{U}{U}","cmc":2,"typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"At the beginning of each player's draw step, that player may draw an additional card. If they do, spells they cast this turn cost {2} more to cast.","power":"2","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/f/9fca4c4f-a77b-483e-9da4-574ba2e3d179.jpg?1783921356","artUrl":"https://cards.scryfall.io/art_crop/front/9/f/9fca4c4f-a77b-483e-9da4-574ba2e3d179.jpg?1783921356","commanderLegal":"legal","set":"dmu","releasedAt":"2022-09-09","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const decree = (): CardDef => ({"oracleId":"67a98359-6f02-4556-ad47-c01b643686d6","name":"Decree of Justice","manaCost":"{X}{X}{2}{W}{W}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Create X 4/4 white Angel creature tokens with flying.\nCycling {2}{W} ({2}{W}, Discard this card: Draw a card.)\nWhen you cycle this card, you may pay {X}. If you do, create X 1/1 white Soldier creature tokens.","colors":["W"],"colorIdentity":["W"],"keywords":["Cycling"],"imageUrl":"https://cards.scryfall.io/normal/front/5/5/55d084fb-231f-4296-9db3-e4edf7ecfe1f.jpg?1783938640","artUrl":"https://cards.scryfall.io/art_crop/front/5/5/55d084fb-231f-4296-9db3-e4edf7ecfe1f.jpg?1783938640","commanderLegal":"legal","set":"ddo","releasedAt":"2015-02-27","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const bonesplitter = (): CardDef => ({"oracleId":"452e3f5f-ce17-4682-966b-5cc100210aee","name":"Bonesplitter","manaCost":"{1}","cmc":1,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +2/+0.\nEquip {1}","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/a/e/ae31d513-7412-4467-b497-a7183ff29a42.jpg?1783944980","artUrl":"https://cards.scryfall.io/art_crop/front/a/e/ae31d513-7412-4467-b497-a7183ff29a42.jpg?1783944980","commanderLegal":"legal","set":"pal03","releasedAt":"2003-01-01","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const vulshok = (): CardDef => ({"oracleId":"12a8adc4-927f-4314-b2ef-9c647ace68d5","name":"Vulshok Morningstar","manaCost":"{2}","cmc":2,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +2/+2.\nEquip {2} ({2}: Attach to target creature you control. Equip only as a sorcery.)","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/a/c/acf00de0-af24-4ef9-8ac2-135e6b53a8fd.jpg?1783944415","artUrl":"https://cards.scryfall.io/art_crop/front/a/c/acf00de0-af24-4ef9-8ac2-135e6b53a8fd.jpg?1783944415","commanderLegal":"legal","set":"dst","releasedAt":"2004-02-06","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const sword = (): CardDef => ({"oracleId":"2ccdc60a-49a9-44b9-a7af-0ebf18b26785","name":"Sword of Fire and Ice","manaCost":"{3}","cmc":3,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +2/+2 and has protection from red and from blue.\nWhenever equipped creature deals combat damage to a player, this Equipment deals 2 damage to any target and you draw a card.\nEquip {2}","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/c/f/cf767c80-ba6e-4206-89a2-727307145ed5.jpg?1783937247","artUrl":"https://cards.scryfall.io/art_crop/front/c/f/cf767c80-ba6e-4206-89a2-727307145ed5.jpg?1783937247","commanderLegal":"legal","set":"mps","releasedAt":"2016-09-30","rarity":"special","layout":"normal","gameChanger":false} as CardDef);
const promenade = (): CardDef => ({"oracleId":"7df3e379-c217-416e-a1c8-46338608c49e","name":"Elvish Promenade","manaCost":"{3}{G}","cmc":4,"typeLine":"Kindred Sorcery — Elf","supertypes":[],"types":["Kindred","Sorcery"],"subtypes":["Elf"],"oracleText":"Create a 1/1 green Elf Warrior creature token for each Elf you control.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/c/ec9d5049-c1a6-4186-952e-bd7481b1974a.jpg?1783942865","artUrl":"https://cards.scryfall.io/art_crop/front/e/c/ec9d5049-c1a6-4186-952e-bd7481b1974a.jpg?1783942865","commanderLegal":"legal","set":"lrw","releasedAt":"2007-10-12","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const tyvar = (): CardDef => ({"oracleId":"14c8a590-88ec-4982-ad7b-36a219ff6de7","name":"Tyvar Kell","manaCost":"{2}{G}{G}","cmc":4,"typeLine":"Legendary Planeswalker — Tyvar","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Tyvar"],"oracleText":"Elves you control have \"{T}: Add {B}.\"\n+1: Put a +1/+1 counter on up to one target Elf. Untap it. It gains deathtouch until end of turn.\n0: Create a 1/1 green Elf Warrior creature token.\n−6: You get an emblem with \"Whenever you cast an Elf spell, it gains haste until end of turn and you draw two cards.\"","loyalty":"3","colors":["G"],"colorIdentity":["B","G"],"keywords":[],"producedMana":["B"],"imageUrl":"https://cards.scryfall.io/normal/front/8/d/8d18008f-10d2-4cdf-b4b5-7675782a8b0d.jpg?1783928203","artUrl":"https://cards.scryfall.io/art_crop/front/8/d/8d18008f-10d2-4cdf-b4b5-7675782a8b0d.jpg?1783928203","commanderLegal":"legal","set":"khm","releasedAt":"2021-02-05","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const juggernaut = (): CardDef => ({"oracleId":"4ac9116f-36bc-4d71-b696-d6ee064e1d58","name":"Juggernaut","manaCost":"{4}","cmc":4,"typeLine":"Artifact Creature — Juggernaut","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Juggernaut"],"oracleText":"This creature attacks each combat if able.\nThis creature can't be blocked by Walls.","power":"5","toughness":"3","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/f/dfebeab7-44cf-4895-bdd5-04cbb2c700d7.jpg?1783934958","artUrl":"https://cards.scryfall.io/art_crop/front/d/f/dfebeab7-44cf-4895-bdd5-04cbb2c700d7.jpg?1783934958","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const wraith = (): CardDef => ({"oracleId":"bd7867f4-4f58-49c2-9c24-a124dfdb506d","name":"Street Wraith","manaCost":"{3}{B}{B}","cmc":5,"typeLine":"Creature — Wraith","supertypes":[],"types":["Creature"],"subtypes":["Wraith"],"oracleText":"Swampwalk (This creature can't be blocked as long as defending player controls a Swamp.)\nCycling—Pay 2 life. (Pay 2 life, Discard this card: Draw a card.)","power":"3","toughness":"4","colors":["B"],"colorIdentity":["B"],"keywords":["Landwalk","Swampwalk","Cycling"],"imageUrl":"https://cards.scryfall.io/normal/front/7/d/7d078cad-7f2b-4bef-b637-46aec9c8ed36.jpg?1783927808","artUrl":"https://cards.scryfall.io/art_crop/front/7/d/7d078cad-7f2b-4bef-b637-46aec9c8ed36.jpg?1783927808","commanderLegal":"legal","set":"tsr","releasedAt":"2021-03-19","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const edge = (): CardDef => ({"oracleId":"42d86827-6459-42fc-86b6-6eb055604c36","name":"Edge of Autumn","manaCost":"{1}{G}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"If you control four or fewer lands, search your library for a basic land card, put it onto the battlefield tapped, then shuffle.\nCycling—Sacrifice a land. (Sacrifice a land, Discard this card: Draw a card.)","colors":["G"],"colorIdentity":["G"],"keywords":["Cycling"],"imageUrl":"https://cards.scryfall.io/normal/front/0/3/03998e86-ef67-4329-b106-61252f3f532a.jpg?1783943096","artUrl":"https://cards.scryfall.io/art_crop/front/0/3/03998e86-ef67-4329-b106-61252f3f532a.jpg?1783943096","commanderLegal":"legal","set":"fut","releasedAt":"2007-05-04","rarity":"common","layout":"normal","gameChanger":false} as CardDef);

describe("round 326", () => {
  it("are fully supported", () => supported(grim(), frodo(), gavi(), perspectives(), seeker(), harald(), lore()));
});

describe("round 326: Grim Return", () => {
  it("puts a creature card put into any graveyard from the battlefield this turn onto the battlefield under your control", () => {
    const { s: s0, ap, opp, ids } = setup([grim()]);
    const died = putOnBattlefield(s0, opp, bear("Dead Bear"));
    moveObject(s0, died, "graveyard");
    // A discarded creature card wasn't put there from the battlefield (rulings).
    const discarded = into(s0, opp, bear("Discarded Bear"), "graveyard");
    invalidateCharacteristics(s0);
    const spec = compileCard(grim()).spell!.targets[0]!;
    const legal = legalTargets(s0, spec, ap).map((t) => (t.kind === "object" ? t.id : t.kind));
    expect(legal).toContain(died);
    expect(legal).not.toContain(discarded);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: died }])), ap);
    expect(s.objects[died]!.zone).toBe("battlefield");
    expect(controllerOf(s, s.objects[died]!)).toBe(ap);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });
  it("can't target a creature card that died on an earlier turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const died = putOnBattlefield(s0, opp, bear("Dead Bear"));
    moveObject(s0, died, "graveyard");
    const s = passUntil(s0, "upkeep", opp);
    const spec = compileCard(grim()).spell!.targets[0]!;
    expect(legalTargets(s, spec, ap).map((t) => (t.kind === "object" ? t.id : t.kind))).not.toContain(died);
  });
});

describe("round 326: Frodo, Determined Hero", () => {
  it("as it enters, attaches an Equipment you control with mana value 2 or 3 (not 1)", () => {
    const { s: s0, ap, ids } = setup([frodo()]);
    const b = putOnBattlefield(s0, ap, bonesplitter());
    const v = putOnBattlefield(s0, ap, vulshok());
    const w = putOnBattlefield(s0, ap, sword());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    expect(s.pending?.kind).toBe("chooseTargets");
    const spec = compileCard(frodo()).triggers[0]!.body.targets[0]!;
    const legal = legalTargets(s, spec, ap).map((t) => (t.kind === "object" ? t.id : t.kind));
    expect(legal.sort()).toEqual([v, w].sort());
    expect(legal).not.toContain(b);
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: w }] });
    s = settle(s, ap);
    if (s.pending?.kind === "chooseMay") s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(s.objects[w]!.attachedTo).toBe(ids[0]!);
  });
});

describe("round 326: Gavi, Nest Warden and New Perspectives", () => {
  it("Gavi: {0} rather than the cycling cost of the first card cycled each turn, then the cost as printed", () => {
    const { s: s0, ap, ids } = setup([decree(), decree()]);
    putOnBattlefield(s0, ap, gavi());
    const ab = compileCard(decree()).activated[cycling(decree())]!;
    expect(generic(activationCost(s0, ap, s0.objects[ids[0]!]!, ab))).toBe(0);
    let s = run(s0, planActivate(s0, ap, ids[0]!, cycling(decree())));
    // No mana was spent: nothing of ours is tapped. The card was still discarded (rulings).
    expect(s.battlefield.filter((id) => s.objects[id]!.tapped && controllerOf(s, s.objects[id]!) === ap)).toEqual([]);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    // "When you cycle this card, you may pay {X}": as the bot answers.
    s = settle(s, ap);
    while (s.pending?.player === ap) s = settle(act(s, botActions(s, ap)[0]!), ap);
    // The second card cycled this turn pays {2}{W}.
    expect(generic(activationCost(s, ap, s.objects[ids[1]!]!, ab))).toBe(3);
  });
  it("Gavi: a card cycled before Gavi came under your control counts (rulings)", () => {
    const { s: s0, ap, ids } = setup([decree(), decree()]);
    let s = settle(run(s0, planActivate(s0, ap, ids[0]!, cycling(decree()))), ap);
    while (s.pending?.player === ap) s = settle(act(s, botActions(s, ap)[0]!), ap);
    putOnBattlefield(s, ap, gavi());
    invalidateCharacteristics(s);
    const ab = compileCard(decree()).activated[cycling(decree())]!;
    expect(generic(activationCost(s, ap, s.objects[ids[1]!]!, ab))).toBe(3);
  });
  it("New Perspectives: free cycling only with seven or more cards in hand, the card cycled counted", () => {
    const { s: s0, ap, ids } = setup([decree()]);
    putOnBattlefield(s0, ap, perspectives());
    invalidateCharacteristics(s0);
    const ab = compileCard(decree()).activated[cycling(decree())]!;
    const hand = s0.players[ap]!.hand;
    // Exactly seven, Decree of Justice among them.
    while (hand.length > 7) {
      const id = hand.find((x) => x !== ids[0])!;
      hand.splice(hand.indexOf(id), 1);
      s0.objects[id]!.zone = "library";
      s0.players[ap]!.library.push(id);
    }
    while (hand.length < 7) into(s0, ap, bear(`Filler ${hand.length}`), "hand");
    expect(generic(activationCost(s0, ap, s0.objects[ids[0]!]!, ab))).toBe(0);
    const six = structuredClone(s0);
    const out = six.players[ap]!.hand.find((x) => x !== ids[0])!;
    six.players[ap]!.hand.splice(six.players[ap]!.hand.indexOf(out), 1);
    six.objects[out]!.zone = "library";
    six.players[ap]!.library.push(out);
    expect(generic(activationCost(six, ap, six.objects[ids[0]!]!, ab))).toBe(3);
    // With {X} in a cycling cost, paying {0} makes X 0 (rulings): an X of 1 pays the cost as printed.
    const xCycler = card("Test X Cycler", "Sorcery", "{1}{U}", { cmc: 2, colors: ["U"], oracleText: "Draw a card.\nCycling {X}{U}" });
    expect(isFullySupported(xCycler)).toBe(true);
    const xc = into(s0, ap, xCycler, "hand");
    const xab = compileCard(xCycler).activated[cycling(xCycler)]!;
    expect(generic(activationCost(s0, ap, s0.objects[xc]!, xab, undefined, 0))).toBe(0);
    expect(generic(activationCost(s0, ap, s0.objects[xc]!, xab, undefined, 1))).toBeGreaterThan(0);
  });
  it("Gavi: {0} rather than a cycling cost that isn't mana (Street Wraith's 2 life, Edge of Autumn's land)", () => {
    const { s: s0, ap, ids } = setup([wraith(), edge()]);
    putOnBattlefield(s0, ap, gavi());
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planActivate(s0, ap, ids[0]!, cycling(wraith()))), ap);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(40);
    // The second card cycled this turn pays its own cost: a land sacrificed.
    const edgeAb = compileCard(edge()).activated[cycling(edge())]!;
    expect(activatedCosts(edgeAb, 0, s.objects[ids[1]!]!, s, ap)).toHaveLength(1);
    expect(() => applyAction(s, { type: "activateAbility", player: ap, objectId: ids[1]!, index: cycling(edge()) })).toThrow();
    const { s: t0, ap: ap2, ids: ids2 } = setup([edge()]);
    putOnBattlefield(t0, ap2, gavi());
    invalidateCharacteristics(t0);
    const landsOf = (st: GameState) => st.battlefield.filter((id) => controllerOf(st, st.objects[id]!) === ap2 && st.cards[st.objects[id]!.cardId]!.types.includes("Land")).length;
    const before = landsOf(t0);
    s = settle(applyAction(t0, { type: "activateAbility", player: ap2, objectId: ids2[0]!, index: cycling(edge()) }), ap2);
    expect(s.objects[ids2[0]!]!.zone).toBe("graveyard");
    expect(landsOf(s)).toBe(before);
  });
  it("an opponent's Gavi or New Perspectives does nothing for you", () => {
    const { s: s0, ap, opp, ids } = setup([decree()]);
    putOnBattlefield(s0, opp, gavi());
    invalidateCharacteristics(s0);
    const ab = compileCard(decree()).activated[cycling(decree())]!;
    expect(generic(activationCost(s0, ap, s0.objects[ids[0]!]!, ab))).toBe(3);
  });
});

describe("round 326: Seeker of Slaanesh", () => {
  it("each opponent must attack with at least one creature if able, any one, at anyone", () => {
    const { s: s0, ap, opp } = setup([]);
    const other = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    putOnBattlefield(s0, other, seeker());
    const a = putOnBattlefield(s0, ap, bear());
    putOnBattlefield(s0, ap, bear("Test Bear Two"));
    const s = passUntil(s0, "declareAttackers", ap);
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [] })).toThrow(/at least one creature/);
    // One attacker obeys it, at any opponent, Seeker's controller or not.
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] })).not.toThrow();
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: other }] })).not.toThrow();
  });
  it("asks nothing when no creature can attack, or only by paying a cost; not of its controller", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, seeker());
    const sick = putOnBattlefield(s0, ap, bear("Test Sick Bear"));
    const s = passUntil(s0, "declareAttackers", ap);
    s.objects[sick]!.controlledSinceTurn = s.turn;
    invalidateCharacteristics(s);
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [] })).not.toThrow();
    // Its controller's own creatures are free to stay home.
    const { s: t0, ap: ap2 } = setup([]);
    putOnBattlefield(t0, ap2, seeker());
    putOnBattlefield(t0, ap2, bear());
    const t = passUntil(t0, "declareAttackers", ap2);
    expect(() => act(t, { type: "declareAttackers", player: ap2, attacks: [] })).not.toThrow();
  });
  it("the bot sends its toughest creature when it would otherwise stay home", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, seeker());
    // A wall of blockers at every opponent makes the bot want to stay home.
    for (const d of s0.turnOrder.filter((p) => p !== ap)) for (let i = 0; i < 2; i++) putOnBattlefield(s0, d, card(`Test Giant ${d}${i}`, "Creature — Giant", "{5}{R}", { cmc: 6, power: "9", toughness: "9" }));
    const thopter = putOnBattlefield(s0, ap, ornithopter());
    putOnBattlefield(s0, ap, bear("Test Weak Bear", { power: "1", toughness: "1" }));
    const s = passUntil(s0, "declareAttackers", ap);
    const plan = botActions(s, ap);
    const decl = plan.find((x) => x.type === "declareAttackers") as Extract<Action, { type: "declareAttackers" }>;
    expect(decl.attacks.map((x) => x.attacker)).toEqual([thopter]);
    expect(() => run(s, plan)).not.toThrow();
  });
});

describe("round 326: Harald Unites the Elves", () => {
  it("chapter I: mill three, then an Elf or Tyvar permanent card from your graveyard onto the battlefield", () => {
    const { s: s0, ap, ids } = setup([harald()]);
    const t = into(s0, ap, tyvar(), "graveyard");
    // A kindred sorcery is an Elf card, but not a permanent card: it can't be put onto the battlefield (CR 400.4a).
    const promo = into(s0, ap, promenade(), "graveyard");
    const juggy = into(s0, ap, juggernaut(), "graveyard");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    expect(s.players[ap]!.graveyard.length).toBe(6);
    expect(s.pending?.kind).toBe("searchLibrary");
    const offered = (s.pending as { cards: string[] }).cards;
    expect(offered).toContain(t);
    expect(offered).not.toContain(promo);
    expect(offered).not.toContain(juggy);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [t] }), ap);
    expect(s.objects[t]!.zone).toBe("battlefield");
    expect(controllerOf(s, s.objects[t]!)).toBe(ap);
  });
});

describe("round 326: Academy Loremaster", () => {
  it("the player whose draw step it is may draw another card; if they do, their spells cost {2} more this turn", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, lore());
    let s = passUntil(s0, "draw", opp);
    s = settle(s, opp);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: opp });
    const hand = s.players[opp]!.hand.length;
    s = settle(act(s, { type: "chooseMay", player: opp, yes: true }), opp);
    expect(s.players[opp]!.hand.length).toBe(hand + 1);
    const spell = into(s, opp, bear(), "hand");
    expect(spellMana(s, opp, spell)).toBe(4);
    // Not the Loremaster's controller's spells.
    const mine = into(s, ap, bear("My Bear"), "hand");
    expect(spellMana(s, ap, mine)).toBe(2);
    // Over at the end of the turn.
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(opp) + 1) % 4]!);
    expect(spellMana(s, opp, spell)).toBe(2);
  });
  it("declining keeps their costs as they are", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, lore());
    let s = settle(passUntil(s0, "draw", opp), opp);
    const hand = s.players[opp]!.hand.length;
    s = settle(act(s, { type: "chooseMay", player: opp, yes: false }), opp);
    expect(s.players[opp]!.hand.length).toBe(hand);
    const spell = into(s, opp, bear(), "hand");
    expect(spellMana(s, opp, spell)).toBe(2);
  });
});
