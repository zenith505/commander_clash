// Lane B, round 60: unsupported cards no earlier round wrote down, EDHREC rank about 19,800 to 15,000, least played first
// (`npm run popular -- --least`), and the cards the round's templates also finished (Origin of Iron Man, Somnophore,
// Clergy and Knight of the Holy Nimbus).

import { describe, expect, it } from "vitest";
import { act, addEffect, card, passUntil, putOnBattlefield, scry, setup } from "./helpers";
import { abilitiesOf, botActions, castProblem, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, moveObject, planActivate, power, toughness, planCast, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";
const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty, answering choices as the bots would; the choices a test makes stop it. */
const settle = (s: GameState, stopAt: (s: GameState) => boolean = () => false) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (stopAt(s)) break;
    const p = s.pending;
    if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Plays on (no attacks or blocks unless asked, the bots answering other questions) until `stop`. */
const goUntil = (s: GameState, stop: (s: GameState) => boolean) => {
  for (let i = 0; i < 3000; i++) {
    if (stop(s)) return s;
    const p = s.pending;
    const pid = waitingOn(s)!;
    if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: pid });
  }
  throw new Error("never got there");
};
const at = (kind: string, pid: PlayerId) => (s: GameState) => s.pending?.kind === kind && s.pending.player === pid;
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const ply = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const spell = (s: GameState, id: string): TargetChoice => ({ kind: "stack", id: s.stack.find((x) => x.objectId === id)!.id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const nameOf = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]!.name;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = [], choices: CostChoices = {}) => run(s, planCast(s, pid, id, targets, undefined, undefined, undefined, choices));
/** Moves a new card for `def` into `pid`'s hand, library (on top) or graveyard. */
const toZone = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "library" | "graveyard" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Passes to the declare attackers step of the active player's turn and declares `attackers` at `defender`; stops at the first question. */
const attackWith = (s: GameState, attackers: string[], defender: PlayerId) => {
  for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  s = act(s, { type: "declareAttackers", player: s.activePlayer, attacks: attackers.map((attacker) => ({ attacker, defender })) });
  for (let i = 0; i < 50 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const toBlocks = (s: GameState) => {
  for (let i = 0; i < 50 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Leaves only `keep` in `pid`'s hand (setup's hand also holds the seven cards drawn). */
const onlyHand = (s: GameState, pid: PlayerId, keep: string[]) => {
  const p = s.players[pid]!;
  for (const id of p.hand.filter((id) => !keep.includes(id))) {
    s.objects[id]!.zone = "exile";
    p.exile.push(id);
  }
  p.hand = p.hand.filter((id) => keep.includes(id));
};
const counters = (s: GameState, id: string, kind = "+1/+1") => s.objects[id]!.counters?.[kind] ?? 0;
const answerMay = (s: GameState, pid: PlayerId, yes: boolean) => act(s, { type: "chooseMay", player: pid, yes });
/** Passes until `pid` is asked to choose targets for a trigger, then chooses `targets`. */
const triggerTargets = (s: GameState, pid: PlayerId, targets: TargetChoice[]) => {
  s = settle(s, at("chooseTargets", pid));
  expect(s.pending?.kind).toBe("chooseTargets");
  return act(s, { type: "chooseTargets", player: pid, targets } as Action);
};


// Real oracle text (Scryfall).
const curse = (): CardDef => ({"oracleId":"71de5f9a-73e4-4a93-b199-b280687f71eb","name":"Curse of Conformity","manaCost":"{4}{W}","cmc":5,"typeLine":"Enchantment — Aura Curse","supertypes":[],"types":["Enchantment"],"subtypes":["Aura","Curse"],"oracleText":"Enchant player\nNonlegendary creatures enchanted player controls have base power and toughness 3/3 and lose all creature types.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"layout":"normal"}) as CardDef;
const neutrinos = (): CardDef => ({"oracleId":"b1462c82-7702-451b-b612-990353a79ac4","name":"The Neutrinos","manaCost":"{2}{R}{W}","cmc":4,"typeLine":"Legendary Creature — Elf Rebel","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Elf","Rebel"],"oracleText":"Flying\nAlliance — Whenever another creature you control enters, The Neutrinos get +1/+0 until end of turn.\nWhenever The Neutrinos attack, exile up to one target creature you own, then return it to the battlefield under your control tapped and attacking.","power":"2","toughness":"4","colors":["R","W"],"colorIdentity":["R","W"],"keywords":["Flying","Alliance"],"layout":"normal"}) as CardDef;
const fantasticar = (): CardDef => ({"oracleId":"9b0abb58-4e2c-45dc-99b1-61a4cb79354b","name":"The Fantasticar","manaCost":"{3}","cmc":3,"typeLine":"Legendary Artifact — Vehicle","supertypes":["Legendary"],"types":["Artifact"],"subtypes":["Vehicle"],"oracleText":"Flying\nWhenever you cast a noncreature spell, you may have The Fantasticar become an artifact creature until end of turn.\nWhenever you cast your fourth noncreature spell each turn, you may sacrifice The Fantasticar. If you do, create four 4/4 colorless Construct artifact creature tokens with flying and haste.","power":"4","toughness":"4","colors":[],"colorIdentity":[],"keywords":["Flying"],"layout":"normal"}) as CardDef;
const othelm = (): CardDef => ({"oracleId":"4ee401bf-dc86-41a9-84f9-57aa0a314d08","name":"Othelm, Sigardian Outcast","manaCost":"{1}{G}{W}","cmc":3,"typeLine":"Legendary Creature — Human","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human"],"oracleText":"{2}, {T}: Choose target creature card in your graveyard that was put there from the battlefield this turn. Return it to the battlefield tapped.\nPartner—Friends forever (You can have two commanders if both have this ability.)","power":"2","toughness":"2","colors":["G","W"],"colorIdentity":["G","W"],"keywords":["Partner"],"layout":"normal"}) as CardDef;
const spear = (): CardDef => ({"oracleId":"e7a0b370-913d-4e96-8fb4-5df168405073","name":"The Spear of Bashenga","manaCost":"{4}{W}","cmc":5,"typeLine":"Legendary Artifact — Equipment","supertypes":["Legendary"],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"When The Spear of Bashenga enters, if there is no monarch, you become the monarch.\nEquipped creature gets +2/+2 and has vigilance.\nWhenever equipped creature attacks the monarch, destroy target tapped nonland permanent that player controls.\nEquip {2}","colors":["W"],"colorIdentity":["W"],"keywords":["Equip"],"layout":"normal"}) as CardDef;
const okoye = (): CardDef => ({"oracleId":"8fbfc5b1-2146-4d07-a5fe-5f025da31bd6","name":"Okoye, Mighty and Adored","manaCost":"{2}{G}{W}","cmc":4,"typeLine":"Legendary Creature — Human Warrior Hero","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Warrior","Hero"],"oracleText":"When Okoye enters, you become the monarch.\nAt the beginning of combat on your turn, put a +1/+1 counter on target creature. Whenever that creature attacks the monarch this turn, it gains double strike and trample until end of turn.","power":"3","toughness":"3","colors":["G","W"],"colorIdentity":["G","W"],"keywords":[],"layout":"normal"}) as CardDef;
const conduit = (): CardDef => ({"oracleId":"1c4cf7c9-9dc5-49da-8d43-1ecd41c74ad3","name":"Conduit of Storms // Conduit of Emrakul","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Werewolf Horror // Creature — Eldrazi Werewolf","supertypes":[],"types":["Creature"],"subtypes":["Werewolf","Horror"],"oracleText":"Whenever this creature attacks, add {R} at the beginning of your next main phase this turn.\n{3}{R}{R}: Transform this creature.","power":"2","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":["Transform"],"producedMana":["C","R"],"layout":"transform","faces":[{"name":"Conduit of Storms","manaCost":"{2}{R}","typeLine":"Creature — Werewolf Horror","supertypes":[],"types":["Creature"],"subtypes":["Werewolf","Horror"],"oracleText":"Whenever this creature attacks, add {R} at the beginning of your next main phase this turn.\n{3}{R}{R}: Transform this creature.","power":"2","toughness":"3","colors":["R"]},{"name":"Conduit of Emrakul","manaCost":"","typeLine":"Creature — Eldrazi Werewolf","supertypes":[],"types":["Creature"],"subtypes":["Eldrazi","Werewolf"],"oracleText":"Whenever this creature attacks, add {C}{C} at the beginning of your next main phase this turn.","power":"5","toughness":"4","colors":[]}]}) as CardDef;
const nekoTe = (): CardDef => ({"oracleId":"a1d2944e-6668-4157-aac5-54572759c05c","name":"Neko-Te","manaCost":"{3}","cmc":3,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Whenever equipped creature deals damage to a creature, tap that creature. That creature doesn't untap during its controller's untap step for as long as this Equipment remains on the battlefield.\nWhenever equipped creature deals damage to a player, that player loses 1 life.\nEquip {2}","colors":[],"colorIdentity":[],"keywords":["Equip"],"layout":"normal"}) as CardDef;
const originIronMan = (): CardDef => ({"oracleId":"6abb489e-cc62-42d7-b898-3e5095037e75","name":"Origin of Iron Man","manaCost":"{4}{U}","cmc":5,"typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — Tap up to one target creature. It doesn't untap during its controller's untap step for as long as this Saga remains on the battlefield.\nII — Draw two cards.\nIII — You may put an artifact card with mana value 5 or less from your hand onto the battlefield.","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"saga"}) as CardDef;
const somnophore = (): CardDef => ({"oracleId":"86541bba-7db8-4893-addf-8a4a42168ce4","name":"Somnophore","manaCost":"{2}{U}{U}","cmc":4,"typeLine":"Creature — Illusion","supertypes":[],"types":["Creature"],"subtypes":["Illusion"],"oracleText":"Flying\nWhenever this creature deals damage to a player, tap target creature that player controls. That creature doesn't untap during its controller's untap step for as long as this creature remains on the battlefield.","power":"2","toughness":"2","colors":["U"],"colorIdentity":["U"],"keywords":["Flying"],"layout":"normal"}) as CardDef;
const moira = (): CardDef => ({"oracleId":"db02644b-820f-4102-b1f6-ed8fac40baf8","name":"Moira Brown, Guide Author","manaCost":"{1}{R}{W}","cmc":3,"typeLine":"Legendary Creature — Human Citizen","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Citizen"],"oracleText":"When Moira Brown enters, create a colorless Book Equipment artifact token named Wasteland Survival Guide with \"Equipped creature gets +1/+1 for each quest counter among permanents you control\" and equip {1}.\nWhenever you attack, put a quest counter on target nonland permanent you control.","power":"2","toughness":"3","colors":["R","W"],"colorIdentity":["R","W"],"keywords":[],"layout":"normal"}) as CardDef;
const surgeEngine = (): CardDef => ({"oracleId":"864d9db7-34ca-4440-8d6d-096f9eddedd4","name":"Surge Engine","manaCost":"{2}","cmc":2,"typeLine":"Artifact Creature — Construct","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Construct"],"oracleText":"Defender\n{U}: This creature loses defender and gains \"This creature can't be blocked.\"\n{2}{U}: This creature becomes blue and has base power and toughness 5/4. Activate only if this creature doesn't have defender.\n{4}{U}{U}: Draw three cards. Activate only if this creature is blue and only once.","power":"3","toughness":"2","colors":[],"colorIdentity":["U"],"keywords":["Defender"],"layout":"normal"}) as CardDef;
const allSuns = (): CardDef => ({"oracleId":"a97d9a72-2e47-491b-b1db-9829a9abbbd7","name":"All Suns' Dawn","manaCost":"{4}{G}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"For each color, return up to one target card of that color from your graveyard to your hand. Exile All Suns' Dawn.","colors":["G"],"colorIdentity":["G"],"keywords":[],"layout":"normal"}) as CardDef;
const legerdemain = (): CardDef => ({"oracleId":"107d5f67-1395-444f-b612-c5cc770df956","name":"Legerdemain","manaCost":"{2}{U}{U}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Exchange control of target artifact or creature and another target permanent that shares one of those types with it. (This effect lasts indefinitely.)","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"}) as CardDef;
const investigators = (): CardDef => ({"oracleId":"cc9088c4-6f6b-4a1a-90f1-794eb1e938c6","name":"Phenomenon Investigators","manaCost":"{2}{U}{B}","cmc":4,"typeLine":"Creature — Human Detective","supertypes":[],"types":["Creature"],"subtypes":["Human","Detective"],"oracleText":"As this creature enters, choose Believe or Doubt.\n• Believe — Whenever a nontoken creature you control dies, create a 2/2 black Horror enchantment creature token.\n• Doubt — At the beginning of your end step, you may return a nonland permanent you own to your hand. If you do, draw a card.","power":"3","toughness":"4","colors":["B","U"],"colorIdentity":["B","U"],"keywords":[],"layout":"normal"}) as CardDef;
const heirloom = (): CardDef => ({"oracleId":"1374498c-58fd-40b9-b63b-f87fedc42e58","name":"Neglected Heirloom // Ashmouth Blade","manaCost":"{1}","cmc":1,"typeLine":"Artifact — Equipment // Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +1/+1.\nWhen equipped creature transforms, transform this Equipment.\nEquip {1}","colors":[],"colorIdentity":[],"keywords":["Transform","Equip"],"layout":"transform","faces":[{"name":"Neglected Heirloom","manaCost":"{1}","typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +1/+1.\nWhen equipped creature transforms, transform this Equipment.\nEquip {1}","colors":[]},{"name":"Ashmouth Blade","manaCost":"","typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +3/+3 and has first strike.\nEquip {3}","colors":[]}]}) as CardDef;
const procession = (): CardDef => ({"oracleId":"a656ad7f-133f-4d93-919a-43bcf1f815f3","name":"Profane Procession // Tomb of the Dusk Rose","manaCost":"{1}{W}{B}","cmc":3,"typeLine":"Legendary Enchantment // Legendary Land","supertypes":["Legendary"],"types":["Enchantment"],"subtypes":[],"oracleText":"{3}{W}{B}: Exile target creature. Then if there are three or more cards exiled with Profane Procession, transform it.","colors":["B","W"],"colorIdentity":["B","W"],"keywords":["Transform"],"producedMana":["B","G","R","U","W"],"layout":"transform","faces":[{"name":"Profane Procession","manaCost":"{1}{W}{B}","typeLine":"Legendary Enchantment","supertypes":["Legendary"],"types":["Enchantment"],"subtypes":[],"oracleText":"{3}{W}{B}: Exile target creature. Then if there are three or more cards exiled with Profane Procession, transform it.","colors":["B","W"]},{"name":"Tomb of the Dusk Rose","manaCost":"","typeLine":"Legendary Land","supertypes":["Legendary"],"types":["Land"],"subtypes":[],"oracleText":"(Transforms from Profane Procession.)\n{T}: Add one mana of any color.\n{2}{W}{B}, {T}: Put a creature card exiled with this permanent onto the battlefield under your control.","colors":[]}]}) as CardDef;
const tetzin = (): CardDef => ({"oracleId":"e12b38e5-621b-4b2c-8c04-c15c41d4fc70","name":"Tetzin, Gnome Champion // The Golden-Gear Colossus","manaCost":"{U}{R}{W}","cmc":3,"typeLine":"Legendary Artifact Creature — Gnome // Legendary Artifact Creature — Gnome","supertypes":["Legendary"],"types":["Artifact","Creature"],"subtypes":["Gnome"],"oracleText":"Whenever Tetzin or another double-faced artifact you control enters, mill three cards. You may put an artifact card from among them into your hand.\nCraft with six artifacts {4} ({4}, Exile this artifact, Exile the six from among other permanents you control and/or cards from your graveyard: Return this card transformed under its owner's control. Craft only as a sorcery.)","power":"2","toughness":"2","colors":["R","U","W"],"colorIdentity":["R","U","W"],"keywords":["Craft","Vigilance","Transform","Trample","Mill"],"layout":"transform","faces":[{"name":"Tetzin, Gnome Champion","manaCost":"{U}{R}{W}","typeLine":"Legendary Artifact Creature — Gnome","supertypes":["Legendary"],"types":["Artifact","Creature"],"subtypes":["Gnome"],"oracleText":"Whenever Tetzin or another double-faced artifact you control enters, mill three cards. You may put an artifact card from among them into your hand.\nCraft with six artifacts {4} ({4}, Exile this artifact, Exile the six from among other permanents you control and/or cards from your graveyard: Return this card transformed under its owner's control. Craft only as a sorcery.)","power":"2","toughness":"2","colors":["R","U","W"]},{"name":"The Golden-Gear Colossus","manaCost":"","typeLine":"Legendary Artifact Creature — Gnome","supertypes":["Legendary"],"types":["Artifact","Creature"],"subtypes":["Gnome"],"oracleText":"Vigilance, trample\nWhenever The Golden-Gear Colossus enters or attacks, transform up to one other target double-faced artifact you control. Create two 1/1 colorless Gnome artifact creature tokens.","power":"6","toughness":"6","colors":["R","U","W"],"colorIndicator":["R","U","W"]}]}) as CardDef;
const strangler = (): CardDef => ({"oracleId":"ffc1fe11-0ecb-4497-a266-0817c79477e9","name":"Vengeful Strangler // Strangling Grasp","manaCost":"{1}{B}","cmc":2,"typeLine":"Creature — Human Rogue // Enchantment — Aura","supertypes":[],"types":["Creature"],"subtypes":["Human","Rogue"],"oracleText":"This creature can't block.\nWhen this creature dies, return it to the battlefield transformed under your control attached to target creature or planeswalker an opponent controls.","power":"2","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":["Transform","Enchant"],"layout":"transform","faces":[{"name":"Vengeful Strangler","manaCost":"{1}{B}","typeLine":"Creature — Human Rogue","supertypes":[],"types":["Creature"],"subtypes":["Human","Rogue"],"oracleText":"This creature can't block.\nWhen this creature dies, return it to the battlefield transformed under your control attached to target creature or planeswalker an opponent controls.","power":"2","toughness":"1","colors":["B"]},{"name":"Strangling Grasp","manaCost":"","typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature or planeswalker an opponent controls\nAt the beginning of your upkeep, enchanted permanent's controller sacrifices a nonland permanent of their choice, then that player loses 1 life.","colors":["B"],"colorIndicator":["B"]}]}) as CardDef;
const mesmeric = (): CardDef => ({"oracleId":"21c82044-6e16-4e41-a6d0-e4d7cb42f37c","name":"Mesmeric Sliver","manaCost":"{3}{U}","cmc":4,"typeLine":"Creature — Sliver","supertypes":[],"types":["Creature"],"subtypes":["Sliver"],"oracleText":"All Slivers have \"When this permanent enters, you may fateseal 1.\" (To fateseal 1, its controller looks at the top card of an opponent's library, then they may put that card on the bottom of that library.)","power":"2","toughness":"2","colors":["U"],"colorIdentity":["U"],"keywords":["Fateseal"],"layout":"normal"}) as CardDef;
const clergy = (): CardDef => ({"oracleId":"66566999-f70a-4f14-9bf0-23325295a977","name":"Clergy of the Holy Nimbus","manaCost":"{W}","cmc":1,"typeLine":"Creature — Human Cleric","supertypes":[],"types":["Creature"],"subtypes":["Human","Cleric"],"oracleText":"If this creature would be destroyed, regenerate it.\n{1}: This creature can't be regenerated this turn. Only your opponents may activate this ability.","power":"1","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":["Regenerate"],"layout":"normal"}) as CardDef;
const knightNimbus = (): CardDef => ({"oracleId":"4e92c705-19c2-42df-ad12-808d272c505e","name":"Knight of the Holy Nimbus","manaCost":"{W}{W}","cmc":2,"typeLine":"Creature — Human Rebel Knight","supertypes":[],"types":["Creature"],"subtypes":["Human","Rebel","Knight"],"oracleText":"Flanking (Whenever a creature without flanking blocks this creature, the blocking creature gets -1/-1 until end of turn.)\nIf this creature would be destroyed, regenerate it. (Tap it, remove it from combat, and heal all damage on it.)\n{2}: This creature can't be regenerated this turn. Only your opponents may activate this ability.","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":["Flanking","Heal","Regenerate"],"layout":"normal"}) as CardDef;

const spinIntoMyth = (): CardDef => ({"oracleId":"4a4cf6e2-8673-45b8-bc21-cd030f312cd1","name":"Spin into Myth","manaCost":"{4}{U}","cmc":5,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Put target creature on top of its owner's library, then fateseal 2. (To fateseal 2, look at the top two cards of an opponent's library, then put any number of them on the bottom of that player's library and the rest on top in any order.)","colors":["U"],"colorIdentity":["U"],"keywords":["Fateseal"],"layout":"normal"}) as CardDef;

// Test cards.
const vanilla = (name: string, typeLine: string, cost: string, cmc: number, p: number, t: number, extra: Partial<CardDef> = {}) => card(name, typeLine, cost, { cmc, power: String(p), toughness: String(t), ...extra });
const bearC = (name = "Plain Bear", p = 2, t = 2) => vanilla(name, "Creature — Bear", "{1}{G}", 2, p, t, { colors: ["G"] });
const knight = (name = "Test Knight", kw = "Vigilance") => vanilla(name, "Creature — Human Knight", "{1}{W}", 2, 2, 2, { colors: ["W"], keywords: [kw], oracleText: kw });
const pinger = (name = "Test Pinger") => vanilla(name, "Creature — Human Wizard", "{1}{U}", 2, 1, 1, { colors: ["U"], oracleText: "{T}: Draw a card." });
const giant = (name = "Test Giant", cmc = 5) => vanilla(name, "Creature — Giant", `{${cmc - 1}}{R}`, cmc, 5, 5, { colors: ["R"] });
const flyer = (name = "Test Bird") => vanilla(name, "Creature — Bird", "{1}{W}", 2, 1, 1, { colors: ["W"], keywords: ["Flying"], oracleText: "Flying" });
const opt = (name = "Test Opt") => card(name, "Instant", "{U}", { cmc: 1, colors: ["U"], oracleText: "Draw a card." });
const bolt = (name = "Test Bolt") => card(name, "Instant", "{R}", { cmc: 1, colors: ["R"], oracleText: "Test Bolt deals 3 damage to any target.".replace("Test Bolt", name) });
const boros = (name = "Test Boros Bolt") => card(name, "Instant", "{R}{W}", { cmc: 2, colors: ["R", "W"], oracleText: `${name} deals 2 damage to any target.` });
const reanimate = () => card("Test Reanimate", "Sorcery", "{B}", { cmc: 1, colors: ["B"], oracleText: "Return target creature card from your graveyard to the battlefield." });
const trinket = (name = "Test Trinket", cmc = 1) => card(name, "Artifact", `{${cmc}}`, { cmc, colors: [], oracleText: "" });
const testLand = (name = "Test Land") => card(name, "Land", "", { oracleText: "" });
const tokensNamed = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.isToken && controllerOf(s, s.objects[id]!) === pid && nameOf(s, id).replace(/ Token$/, "") === name);
/** Its activated abilities can't be activated (Arrest's rule, game.ts). */
const locked = (s: GameState, id: string) => !!characteristics(s, s.objects[id]!).cantActivate;
/** Bushido 1, granted as an ability: its "blocks or becomes blocked" trigger (CR 702.45a). */
const bushido = (s: GameState, id: string) => abilitiesOf(s, s.objects[id]!).triggers.some((tr) => tr.event === "selfBlocksOrBecomesBlocked");
/** Takes `pid`'s lands off the battlefield and leaves exactly `pool` to pay with. */
const poolOnly = (s: GameState, pid: PlayerId, pool: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  for (const id of s.battlefield.filter((x) => s.objects[x]!.controller === pid && characteristics(s, s.objects[x]!).types.includes("Land"))) {
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "exile";
    s.players[pid]!.exile.push(id);
  }
  s.players[pid]!.manaPool = { ...s.players[pid]!.manaPool, ...pool };
  invalidateCharacteristics(s);
};
const kw = (s: GameState, id: string) => characteristics(s, s.objects[id]!).keywords;
const nextOf = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % 4]!;
/** Plays on to the beginning of `pid`'s next upkeep, stopping before its triggers resolve. */
const toUpkeep = (s: GameState, pid: PlayerId) => goUntil(s, (x) => x.step === "upkeep" && x.activePlayer === pid);
const activateNow = (s: GameState, pid: PlayerId, id: string, index: number, targets: TargetChoice[] = []) => run(s, planActivate(s, pid, id, index, targets));

const equipIndex = (s: GameState, id: string) => abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => a.equip);
/** Answers each "may" with `yes(prompt)`, the bots answering other questions, until the stack is empty. */
const settleMay = (s: GameState, pid: PlayerId, yes: (prompt: string) => boolean) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay" && p.player === pid) s = act(s, { type: "chooseMay", player: pid, yes: yes(p.prompt) });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const legend = (name = "Test Legend") => vanilla(name, "Legendary Creature — Human Soldier", "{1}{W}", 2, 2, 2, { colors: ["W"], supertypes: ["Legendary"] });
const fight = () => card("Test Fight", "Sorcery", "{G}", { cmc: 1, colors: ["G"], oracleText: "Target creature you control fights target creature you don't control." });
const glorious = () => card("Test Glorious Anthem", "Enchantment", "{1}{W}", { cmc: 2, colors: ["W"], oracleText: "Creatures you control get +1/+1." });
const enchCreature = () => vanilla("Test Enchantment Creature", "Enchantment Creature — Nymph", "{1}{W}", 2, 2, 2, { colors: ["W"] });
const wreck = () => card("Test Wreck", "Instant", "{B}", { cmc: 1, colors: ["B"], oracleText: "Destroy target creature." });

describe("Lane B round 60", () => {
  it("are fully supported", () => {
    supported(curse(), neutrinos(), fantasticar(), othelm(), spear(), okoye(), conduit(), nekoTe(), originIronMan(), somnophore(), moira(), surgeEngine(), allSuns(), legerdemain(), investigators(), heirloom(), procession(), tetzin(), strangler(), mesmeric(), spinIntoMyth(), clergy(), knightNimbus());
  });

  it("Curse of Conformity: nonlegendary creatures enchanted player controls are 3/3 with no creature types; legendary ones and yours aren't", () => {
    const { s, ap, opp } = setup([]);
    const c = putOnBattlefield(s, ap, curse());
    s.objects[c]!.attachedToPlayer = opp;
    const theirs = putOnBattlefield(s, opp, bearC("Their Bear", 1, 1));
    const theirLegend = putOnBattlefield(s, opp, legend());
    const mine = putOnBattlefield(s, ap, bearC("My Bear"));
    addEffect(s, opp, [theirs], [{ kind: "modifyPT", power: 1, toughness: 1 }], "game");
    invalidateCharacteristics(s);
    expect(pt(s, theirs)).toBe("4/4"); // 3/3 base, then +1/+1 (layer 7c after 7b)
    expect(characteristics(s, s.objects[theirs]!).subtypes).toEqual([]);
    expect(pt(s, theirLegend)).toBe("2/2");
    expect(characteristics(s, s.objects[theirLegend]!).subtypes).toContain("Soldier");
    expect(pt(s, mine)).toBe("2/2");
    expect(characteristics(s, s.objects[mine]!).subtypes).toContain("Bear");
  });
  it("The Neutrinos: attacking flickers a creature you own; it comes back tapped and attacking the player you choose", () => {
    const { s: s0, ap, opp } = setup([]);
    const neu = putOnBattlefield(s0, ap, neutrinos());
    const bear = putOnBattlefield(s0, ap, bearC());
    const third = nextOf(s0, opp);
    let s = attackWith(s0, [neu], opp);
    expect(s.pending?.kind).toBe("chooseTargets");
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(bear)] });
    s = settle(s, at("chooseOption", ap));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "attackWhom", player: ap });
    s = act(s, { type: "chooseOption", player: ap, choice: String(third) });
    s = settle(s);
    expect(zone(s, bear)).toBe("battlefield");
    expect(s.objects[bear]!.tapped).toBe(true);
    expect(s.objects[bear]!.attacking).toBe(third);
    expect(s.objects[neu]!.attacking).toBe(opp);
    // It wasn't declared as an attacker: no "attacks" trigger of its own, and it deals combat damage to that player.
    s = passUntil(s, "main2", ap);
    expect(life(s, third)).toBe(38);
  });

  it("The Neutrinos: outside combat the creature only comes back (no attack); another creature entering pumps them", () => {
    const { s: s0, ap } = setup([]);
    const neu = putOnBattlefield(s0, ap, neutrinos());
    const r = toZone(s0, ap, reanimate(), "hand");
    const dead = toZone(s0, ap, bearC("Dead Bear"), "graveyard");
    let s = settle(castNow(s0, ap, r, [tgt(dead)]));
    expect(zone(s, dead)).toBe("battlefield");
    expect(pt(s, neu)).toBe("3/4");
  });

  it("The Fantasticar: a noncreature spell may animate it; the fourth one each turn may sacrifice it for four 4/4 Constructs", () => {
    const { s: s0, ap } = setup([]);
    const car = putOnBattlefield(s0, ap, fantasticar());
    const spells = [opt("Opt A"), opt("Opt B"), opt("Opt C"), opt("Opt D")].map((d) => toZone(s0, ap, d, "hand"));
    poolOnly(s0, ap, { U: 4 });
    let s = settleMay(castNow(s0, ap, spells[0]!), ap, () => true);
    expect(characteristics(s, s.objects[car]!).types).toContain("Creature");
    for (const id of spells.slice(1, 3)) s = settleMay(castNow(s, ap, id), ap, () => true);
    expect(zone(s, car)).toBe("battlefield");
    s = settleMay(castNow(s, ap, spells[3]!), ap, () => true);
    expect(zone(s, car)).toBe("graveyard");
    const constructs = tokensNamed(s, ap, "Construct");
    expect(constructs.length).toBe(4);
    expect(pt(s, constructs[0]!)).toBe("4/4");
    expect(kw(s, constructs[0]!)).toEqual(expect.arrayContaining(["Flying", "Haste"]));
  });

  it("The Fantasticar: declining the sacrifice keeps it, and makes nothing", () => {
    const { s: s0, ap } = setup([]);
    const car = putOnBattlefield(s0, ap, fantasticar());
    const spells = [opt("Opt A"), opt("Opt B"), opt("Opt C"), opt("Opt D")].map((d) => toZone(s0, ap, d, "hand"));
    poolOnly(s0, ap, { U: 4 });
    let s = s0;
    for (const id of spells) s = settleMay(castNow(s, ap, id), ap, (p) => !/sacrifice/i.test(p));
    expect(zone(s, car)).toBe("battlefield");
    expect(tokensNamed(s, ap, "Construct").length).toBe(0);
  });

  it("Othelm: a creature card put into your graveyard from the battlefield this turn comes back tapped; a discarded one can't", () => {
    const { s: s0, ap } = setup([]);
    const othelmId = putOnBattlefield(s0, ap, othelm());
    const bear = putOnBattlefield(s0, ap, bearC());
    const discarded = toZone(s0, ap, bearC("Discarded Bear"), "graveyard");
    const w = toZone(s0, ap, wreck(), "hand");
    let s = settle(castNow(s0, ap, w, [tgt(bear)]));
    expect(zone(s, bear)).toBe("graveyard");
    expect(planActivate(s, ap, othelmId, 0, [tgt(discarded)])).toBeNull();
    s = settle(activateNow(s, ap, othelmId, 0, [tgt(bear)]));
    expect(zone(s, bear)).toBe("battlefield");
    expect(s.objects[bear]!.tapped).toBe(true);
    expect(controllerOf(s, s.objects[bear]!)).toBe(ap);
  });

  it("The Spear of Bashenga: with no monarch you become it; an equipped creature attacking the monarch destroys a tapped nonland permanent of theirs", () => {
    const { s: s0, ap, opp, ids } = setup([spear()]);
    let s = settle(castNow(s0, ap, ids[0]!));
    expect(s.monarch).toBe(ap);
    const sp = ids[0]!;
    const bear = putOnBattlefield(s, ap, bearC());
    s = settle(activateNow(s, ap, sp, equipIndex(s, sp), [tgt(bear)]));
    expect(pt(s, bear)).toBe("4/4");
    expect(kw(s, bear)).toContain("Vigilance");
    const tapped = putOnBattlefield(s, opp, trinket("Their Trinket"));
    s.objects[tapped]!.tapped = true;
    const untapped = putOnBattlefield(s, opp, trinket("Their Other Trinket"));
    s.monarch = opp;
    s = attackWith(s, [bear], opp);
    expect(s.pending?.kind).toBe("chooseTargets");
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(untapped)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(tapped)] }));
    expect(zone(s, tapped)).toBe("graveyard");
    expect(zone(s, untapped)).toBe("battlefield");
  });

  it("The Spear of Bashenga: attacking a player who isn't the monarch does nothing", () => {
    const { s: s0, ap, opp } = setup([]);
    const sp = putOnBattlefield(s0, ap, spear());
    const bear = putOnBattlefield(s0, ap, bearC());
    s0.objects[sp]!.attachedTo = bear;
    const tapped = putOnBattlefield(s0, opp, trinket("Their Trinket"));
    s0.objects[tapped]!.tapped = true;
    s0.monarch = nextOf(s0, opp);
    invalidateCharacteristics(s0);
    const s = settle(attackWith(s0, [bear], opp));
    expect(zone(s, tapped)).toBe("battlefield");
  });

  it("Okoye: at the beginning of combat a +1/+1 counter; that creature attacking the monarch gains double strike and trample", () => {
    const { s: s0, ap, opp, ids } = setup([okoye()]);
    let s = settle(castNow(s0, ap, ids[0]!));
    expect(s.monarch).toBe(ap);
    const bear = putOnBattlefield(s, ap, bearC());
    s.monarch = opp;
    s = goUntil(s, at("chooseTargets", ap));
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(bear)] }));
    expect(counters(s, bear)).toBe(1);
    expect(kw(s, bear)).not.toContain("Double strike");
    s = settle(attackWith(s, [bear], opp));
    expect(kw(s, bear)).toEqual(expect.arrayContaining(["Double strike", "Trample"]));
    s = passUntil(s, "main2", ap);
    expect(life(s, opp)).toBe(34);
  });

  it("Okoye: that creature attacking someone who isn't the monarch gains nothing", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, okoye());
    const bear = putOnBattlefield(s0, ap, bearC());
    s0.monarch = nextOf(s0, opp);
    let s = goUntil(s0, at("chooseTargets", ap));
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(bear)] }));
    s = settle(attackWith(s, [bear], opp));
    expect(kw(s, bear)).not.toContain("Double strike");
  });

  it("Conduit of Storms: attacking adds {R} at the beginning of your next main phase this turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, ap, conduit());
    let s = settle(attackWith(s0, [c], opp));
    expect(s.players[ap]!.manaPool.R ?? 0).toBe(0);
    s = goUntil(s, (x) => x.step === "main2" && !x.stack.length && !x.triggerQueue.length && !x.pending);
    expect(s.players[ap]!.manaPool.R).toBe(1);
  });

  it("Neko-Te: the creature equipped creature damages is tapped and doesn't untap while Neko-Te stays; a damaged player loses 1 more life", () => {
    const { s: s0, ap, opp } = setup([]);
    const neko = putOnBattlefield(s0, ap, nekoTe());
    const bear = putOnBattlefield(s0, ap, bearC());
    s0.objects[neko]!.attachedTo = bear;
    const theirs = putOnBattlefield(s0, opp, giant("Their Giant"));
    const f = toZone(s0, ap, fight(), "hand");
    invalidateCharacteristics(s0);
    let s = settle(castNow(s0, ap, f, [tgt(bear), tgt(theirs)]));
    expect(zone(s, bear)).toBe("graveyard");
    expect(s.objects[theirs]!.tapped).toBe(true);
    s = toUpkeep(s, opp);
    expect(s.objects[theirs]!.tapped).toBe(true);
    s = settle(s);
    // Neko-Te leaves: it untaps as usual from then on.
    moveObject(s, neko, "graveyard");
    invalidateCharacteristics(s);
    s = toUpkeep(goUntil(s, (x) => x.activePlayer !== opp), opp);
    expect(s.objects[theirs]!.tapped).toBe(false);
  });

  it("Neko-Te: combat damage to a player makes them lose 1 more life", () => {
    const { s: s0, ap, opp } = setup([]);
    const neko = putOnBattlefield(s0, ap, nekoTe());
    const bear = putOnBattlefield(s0, ap, bearC());
    s0.objects[neko]!.attachedTo = bear;
    invalidateCharacteristics(s0);
    let s = settle(attackWith(s0, [bear], opp));
    s = goUntil(s, (x) => x.step === "main2" && !x.stack.length && !x.triggerQueue.length && !x.pending);
    expect(life(s, opp)).toBe(37);
  });

  it("Origin of Iron Man: I taps a creature that doesn't untap for as long as the Saga remains", () => {
    const { s: s0, ap, opp, ids } = setup([originIronMan()]);
    const theirs = putOnBattlefield(s0, opp, giant("Their Giant"));
    let s = castNow(s0, ap, ids[0]!);
    s = triggerTargets(s, ap, [tgt(theirs)]);
    s = settle(s);
    expect(s.objects[theirs]!.tapped).toBe(true);
    s = toUpkeep(s, opp);
    expect(s.objects[theirs]!.tapped).toBe(true);
    s = settle(s);
    moveObject(s, ids[0]!, "graveyard");
    invalidateCharacteristics(s);
    s = toUpkeep(goUntil(s, (x) => x.activePlayer !== opp), opp);
    expect(s.objects[theirs]!.tapped).toBe(false);
  });

  it("Somnophore: combat damage to a player taps a creature of theirs that stays tapped while Somnophore remains", () => {
    const { s: s0, ap, opp } = setup([]);
    const som = putOnBattlefield(s0, ap, somnophore());
    const theirs = putOnBattlefield(s0, opp, giant("Their Giant"));
    let s = attackWith(s0, [som], opp);
    s = toBlocks(s);
    s = act(s, { type: "declareBlockers", player: opp, blocks: [] });
    s = goUntil(s, at("chooseTargets", ap));
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(theirs)] });
    s = settle(s);
    expect(s.objects[theirs]!.tapped).toBe(true);
    s = toUpkeep(s, opp);
    expect(s.objects[theirs]!.tapped).toBe(true);
    expect(zone(s, som)).toBe("battlefield");
  });

  it("Moira Brown: a Book Equipment token named Wasteland Survival Guide; attacking puts a quest counter that pumps the equipped creature", () => {
    const { s: s0, ap, opp, ids } = setup([moira()]);
    let s = settle(castNow(s0, ap, ids[0]!));
    const guide = s.battlefield.find((id) => s.objects[id]!.isToken && controllerOf(s, s.objects[id]!) === ap)!;
    expect(nameOf(s, guide)).toMatch(/^Wasteland Survival Guide/);
    expect(characteristics(s, s.objects[guide]!).subtypes).toEqual(["Book", "Equipment"]);
    expect(characteristics(s, s.objects[guide]!).types).toEqual(["Artifact"]);
    const bear = putOnBattlefield(s, ap, bearC());
    s = settle(activateNow(s, ap, guide, equipIndex(s, guide), [tgt(bear)]));
    expect(pt(s, bear)).toBe("2/2");
    s = attackWith(s, [bear], opp);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(guide)] }));
    expect(counters(s, guide, "quest")).toBe(1);
    expect(pt(s, bear)).toBe("3/3");
  });

  it("Surge Engine: loses defender, then becomes a blue 5/4, then draws three only once", () => {
    const { s: s0, ap } = setup([]);
    const se = putOnBattlefield(s0, ap, surgeEngine());
    poolOnly(s0, ap, { U: 9, C: 9 });
    expect(planActivate(s0, ap, se, 1, [])).toBeNull();
    expect(planActivate(s0, ap, se, 2, [])).toBeNull();
    let s = settle(activateNow(s0, ap, se, 0));
    expect(kw(s, se)).not.toContain("Defender");
    s = settle(activateNow(s, ap, se, 1));
    expect(pt(s, se)).toBe("5/4");
    expect(characteristics(s, s.objects[se]!).colors).toEqual(["U"]);
    const hand = s.players[ap]!.hand.length;
    s = settle(activateNow(s, ap, se, 2));
    expect(s.players[ap]!.hand.length).toBe(hand + 3);
    expect(planActivate(s, ap, se, 2, [])).toBeNull();
  });

  it("All Suns' Dawn: up to one card of each color back to your hand, then it's exiled", () => {
    const { s: s0, ap, ids } = setup([allSuns()]);
    const w = toZone(s0, ap, knight("White Card"), "graveyard");
    const u = toZone(s0, ap, pinger("Blue Card"), "graveyard");
    const rw = toZone(s0, ap, boros("Boros Card"), "graveyard");
    const land = toZone(s0, ap, testLand("Colorless Card"), "graveyard");
    const none: TargetChoice = { kind: "none" } as TargetChoice;
    // White, blue, black, red, green: the Boros card can't be both the white and the red one.
    expect(planCast(s0, ap, ids[0]!, [tgt(rw), tgt(u), none, tgt(rw), none])).toBeNull();
    expect(planCast(s0, ap, ids[0]!, [tgt(land), none, none, none, none])).toBeNull();
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(w), tgt(u), none, tgt(rw), none]));
    for (const id of [w, u, rw]) expect(zone(s, id)).toBe("hand");
    expect(zone(s, land)).toBe("graveyard");
    expect(zone(s, ids[0]!)).toBe("exile");
  });

  it("Legerdemain: exchanges an artifact or creature with another permanent sharing one of those types", () => {
    const { s: s0, ap, opp, ids } = setup([legerdemain()]);
    const mine = putOnBattlefield(s0, ap, bearC());
    const myTrinket = putOnBattlefield(s0, ap, trinket("My Trinket"));
    const theirs = putOnBattlefield(s0, opp, giant("Their Giant"));
    const theirLand = putOnBattlefield(s0, opp, testLand("Their Land"));
    expect(planCast(s0, ap, ids[0]!, [tgt(myTrinket), tgt(theirs)])).toBeNull();
    expect(planCast(s0, ap, ids[0]!, [tgt(mine), tgt(theirLand)])).toBeNull();
    expect(planCast(s0, ap, ids[0]!, [tgt(mine), tgt(mine)])).toBeNull();
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(mine), tgt(theirs)]));
    expect(controllerOf(s, s.objects[mine]!)).toBe(opp);
    expect(controllerOf(s, s.objects[theirs]!)).toBe(ap);
  });

  it("Legerdemain: an artifact creature and an artifact share a type", () => {
    const { s: s0, ap, opp, ids } = setup([legerdemain()]);
    const golem = putOnBattlefield(s0, ap, vanilla("My Golem", "Artifact Creature — Golem", "{3}", 3, 3, 3));
    const theirs = putOnBattlefield(s0, opp, trinket("Their Trinket"));
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(golem), tgt(theirs)]));
    expect(controllerOf(s, s.objects[golem]!)).toBe(opp);
    expect(controllerOf(s, s.objects[theirs]!)).toBe(ap);
  });

  it("Phenomenon Investigators: Doubt returns a nonland permanent you own, even one an opponent controls, and draws", () => {
    const { s: s0, ap, opp, ids } = setup([investigators()]);
    let s = castNow(s0, ap, ids[0]!);
    s = settle(s, at("chooseOption", ap));
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap });
    const opts = (s.pending as { options: string[] }).options;
    s = act(s, { type: "chooseOption", player: ap, choice: opts.find((o) => /doubt/i.test(o)) ?? opts[1]! });
    s = settle(s);
    const stolen = putOnBattlefield(s, opp, bearC("Stolen Bear"));
    s.objects[stolen]!.owner = ap;
    const theirOwn = putOnBattlefield(s, opp, bearC("Their Bear"));
    invalidateCharacteristics(s);
    s = goUntil(s, (x) => x.pending?.kind === "chooseMay" && x.pending.player === ap);
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = settle(s, at("pickPermanents", ap));
    expect(s.pending?.kind).toBe("pickPermanents");
    const options = (s.pending as { options: string[] }).options;
    expect(options).toContain(stolen);
    expect(options).not.toContain(theirOwn);
    const hand = s.players[ap]!.hand.length;
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [stolen] }));
    expect(zone(s, stolen)).toBe("hand");
    expect(s.players[ap]!.hand).toContain(stolen);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
  });

  it("Neglected Heirloom: when the equipped creature transforms, it transforms too", () => {
    const { s: s0, ap } = setup([]);
    const h = putOnBattlefield(s0, ap, heirloom());
    const c = putOnBattlefield(s0, ap, conduit());
    poolOnly(s0, ap, { R: 5, C: 5 });
    let s = settle(activateNow(s0, ap, h, equipIndex(s0, h), [tgt(c)]));
    expect(pt(s, c)).toBe("3/4");
    s = settle(activateNow(s, ap, c, abilitiesOf(s, s.objects[c]!).activated.findIndex((a) => !a.equip)));
    expect(nameOf(s, c)).toMatch(/Conduit/);
    expect(s.objects[c]!.face).toBe(1);
    expect(s.objects[h]!.face).toBe(1);
    expect(pt(s, c)).toBe("8/7");
    expect(kw(s, c)).toContain("First strike");
  });

  it("Profane Procession: the third exiled card transforms it; Tomb of the Dusk Rose puts one of them onto the battlefield", () => {
    const { s: s0, ap, opp } = setup([]);
    const pp = putOnBattlefield(s0, ap, procession());
    const theirs = [giant("Giant A"), giant("Giant B"), giant("Giant C")].map((d) => putOnBattlefield(s0, opp, d));
    poolOnly(s0, ap, { W: 9, B: 9, C: 9 });
    let s = s0;
    for (const [i, id] of theirs.entries()) {
      s = settle(activateNow(s, ap, pp, 0, [tgt(id)]));
      expect(zone(s, id)).toBe("exile");
      expect(s.objects[pp]!.face ?? 0).toBe(i === 2 ? 1 : 0);
    }
    expect(characteristics(s, s.objects[pp]!).types).toEqual(["Land"]);
    const idx = abilitiesOf(s, s.objects[pp]!).activated.findIndex((a) => /exiled/.test(a.text ?? ""));
    expect(idx).toBeGreaterThanOrEqual(0);
    s = settle(activateNow(s, ap, pp, idx));
    const back = s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === ap && /^Giant/.test(nameOf(s, id)));
    expect(back.length).toBe(1);
  });

  it("Profane Procession: two exiled cards don't transform it", () => {
    const { s: s0, ap, opp } = setup([]);
    const pp = putOnBattlefield(s0, ap, procession());
    const theirs = [giant("Giant A"), giant("Giant B")].map((d) => putOnBattlefield(s0, opp, d));
    poolOnly(s0, ap, { W: 9, B: 9, C: 9 });
    let s = s0;
    for (const id of theirs) s = settle(activateNow(s, ap, pp, 0, [tgt(id)]));
    expect(s.objects[pp]!.face ?? 0).toBe(0);
  });

  it("The Golden-Gear Colossus: entering or attacking transforms up to one other double-faced artifact you control and makes two Gnomes", () => {
    const { s: s0, ap, opp } = setup([]);
    const col = putOnBattlefield(s0, ap, tetzin());
    s0.objects[col]!.face = 1;
    const h = putOnBattlefield(s0, ap, heirloom());
    const single = putOnBattlefield(s0, ap, trinket("Single-Faced Trinket"));
    invalidateCharacteristics(s0);
    expect(pt(s0, col)).toBe("6/6");
    let s = attackWith(s0, [col], opp);
    expect(s.pending?.kind).toBe("chooseTargets");
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(single)] })).toThrow();
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(col)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(h)] }));
    expect(s.objects[h]!.face).toBe(1);
    expect(tokensNamed(s, ap, "Gnome").length).toBe(2);
  });

  it("Vengeful Strangler: dying, it returns as Strangling Grasp on an opponent's creature; their sacrifice still costs them 1 life", () => {
    const { s: s0, ap, opp } = setup([]);
    const vs = putOnBattlefield(s0, ap, strangler());
    const theirs = putOnBattlefield(s0, opp, giant("Their Giant"));
    const w = toZone(s0, ap, wreck(), "hand");
    let s = castNow(s0, ap, w, [tgt(vs)]);
    s = triggerTargets(s, ap, [tgt(theirs)]);
    s = settle(s);
    expect(zone(s, vs)).toBe("battlefield");
    expect(s.objects[vs]!.face).toBe(1);
    expect(s.objects[vs]!.attachedTo).toBe(theirs);
    expect(controllerOf(s, s.objects[vs]!)).toBe(ap);
    s = toUpkeep(s, ap);
    const before = life(s, opp);
    s = settle(s);
    // Their only nonland permanent is the enchanted Giant: they sacrifice it, the Aura goes, and they still lose 1 life.
    expect(zone(s, theirs)).toBe("graveyard");
    expect(zone(s, vs)).toBe("graveyard");
    expect(life(s, opp)).toBe(before - 1);
  });

  it("Mesmeric Sliver: you may fateseal 1 as it enters, choosing whose library; the card can go to the bottom", () => {
    const { s: s0, ap, opp, ids } = setup([mesmeric()]);
    const top = toZone(s0, opp, bearC("Their Top Card"), "library");
    let s = castNow(s0, ap, ids[0]!);
    s = settle(s, at("chooseMay", ap));
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = settle(s, at("chooseOption", ap));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "opponent", player: ap });
    expect((s.pending as { options: string[] }).options.length).toBe(3);
    s = act(s, { type: "chooseOption", player: ap, choice: String(opp) });
    s = settle(s, at("arrangeTop", ap));
    expect(s.pending?.kind).toBe("arrangeTop");
    s = settle(act(s, { type: "arrangeTop", player: ap, top: [], away: [top] }));
    const lib = s.players[opp]!.library;
    expect(lib[lib.length - 1]).toBe(top);
  });

  it("Spin into Myth: the creature goes on top of its owner's library, then fateseal 2 sees it and can bottom it", () => {
    const { s: s0, ap, opp, ids } = setup([spinIntoMyth()]);
    const theirs = putOnBattlefield(s0, opp, giant("Their Giant"));
    const second = s0.players[opp]!.library[0]!;
    let s = castNow(s0, ap, ids[0]!, [tgt(theirs)]);
    s = settle(s, at("chooseOption", ap));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "opponent" });
    s = act(s, { type: "chooseOption", player: ap, choice: String(opp) });
    s = settle(s, at("arrangeTop", ap));
    expect(s.pending).toMatchObject({ kind: "arrangeTop", how: "scry", owner: opp });
    expect((s.pending as { cards: string[] }).cards).toEqual([theirs, second]);
    s = settle(act(s, { type: "arrangeTop", player: ap, top: [second], away: [theirs] }));
    const lib = s.players[opp]!.library;
    expect(lib[0]).toBe(second);
    expect(lib[lib.length - 1]).toBe(theirs);
  });

  it("Mesmeric Sliver: other Slivers have it too", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, mesmeric());
    const other = vanilla("Test Sliver", "Creature — Sliver", "{1}{G}", 2, 2, 2, { colors: ["G"] });
    const id = putOnBattlefield(s0, ap, other);
    expect(abilitiesOf(s0, s0.objects[id]!).triggers.some((t) => t.event === "selfEnters")).toBe(true);
  });

  it("Clergy of the Holy Nimbus: destroyed, it regenerates without a shield; an opponent's {1} stops that this turn; its controller can't", () => {
    const { s: s0, ap, opp } = setup([]);
    const cl = putOnBattlefield(s0, ap, clergy());
    const w1 = toZone(s0, ap, wreck(), "hand");
    let s = settle(castNow(s0, ap, w1, [tgt(cl)]));
    expect(zone(s, cl)).toBe("battlefield");
    expect(s.objects[cl]!.tapped).toBe(true);
    expect(planActivate(s, ap, cl, 0, [])).toBeNull();
    s = act(s, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(opp);
    s.players[opp]!.manaPool = { ...s.players[opp]!.manaPool, C: 1 };
    s = settle(activateNow(s, opp, cl, 0));
    const w2 = toZone(s, ap, wreck(), "hand");
    s = settle(castNow(s, ap, w2, [tgt(cl)]));
    expect(zone(s, cl)).toBe("graveyard");
  });

  it("Knight of the Holy Nimbus: regenerates whenever it would be destroyed, again and again", () => {
    const { s: s0, ap } = setup([]);
    const kn = putOnBattlefield(s0, ap, knightNimbus());
    let s = s0;
    for (let i = 0; i < 2; i++) {
      const w = toZone(s, ap, wreck(), "hand");
      s = settle(castNow(s, ap, w, [tgt(kn)]));
      expect(zone(s, kn)).toBe("battlefield");
    }
  });
});
