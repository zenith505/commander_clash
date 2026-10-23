import type { CompiledCard, ManaAbility, TargetSpec, TriggeredAbility } from "./abilities";
import { characteristics, offFieldColored, offFieldTyped, printedKeywords, type PTPart } from "./layers";
import { cleavedText, compileCard, compileGranted, normalizeSelf, overloadedText } from "./oracle";
import { COLORS, type CardDef, type Color, type GameObject, type GameState, type ManaType, type ObjectId, type PlayerId } from "./types";
import { manaValue, parseManaCost } from "./mana";
import { faceKey, isRoom, registerFace, registerRoom, restingDef, roomKey, sameName } from "./faces";
import { objectMatches, printedMatches } from "./effects/targeting";

/** The creature this one is paired with (CR 702.95b), if the pair still stands. See checkPairs for when it breaks. */
export function pairedWith(s: GameState, o: GameObject): GameObject | undefined {
  const p = o.paired;
  if (!p || o.zone !== "battlefield") return undefined;
  const other = s.objects[p.id];
  return other && other.zone === "battlefield" && (other.zoneChanges ?? 0) === p.zc && other.paired?.id === o.id ? other : undefined;
}

export { SUPPORTED_KEYWORDS, stripReminder, type SupportedKeyword } from "./keywords";
import { canonicalKeyword, SUPPORTED_KEYWORDS, stripReminder, subtypeSet, type SupportedKeyword } from "./keywords";

const BASIC_LAND_MANA: Record<string, Color> = { Plains: "W", Island: "U", Swamp: "B", Mountain: "R", Forest: "G" };

/**
 * What a face-down spell or permanent is (CR 708.2a): a 2/2 creature with no text, no name, no
 * subtypes and no mana cost; with disguise, also ward {2} (CR 702.168a). Colorless, mana value 0.
 * These are its copiable values (CR 613.2b): everything else still applies on top.
 */
const faceDownCard = (oracleId: string, ward: boolean): CardDef => ({
  oracleId,
  name: "Face-down creature",
  manaCost: "",
  cmc: 0,
  typeLine: "Creature",
  supertypes: [],
  types: ["Creature"],
  subtypes: [],
  oracleText: ward ? "Ward {2}" : "",
  power: "2",
  toughness: "2",
  colors: [],
  colorIdentity: [],
  keywords: ward ? ["Ward"] : [],
});
export const FACE_DOWN = faceDownCard("face-down", false);
export const FACE_DOWN_WARD = faceDownCard("face-down-ward", true);

/**
 * Its copiable values before face-down status (CR 613.2a): the latest copy effect that began after it entered
 * (CR 707.4), or what it entered as a copy of (CR 707.5), or its own card.
 */
const copiedId = (o: GameObject): string => withDoors(o, roomlessId(o));

/** Its copiable values' key before a Room's unlocked designations are applied (CR 709.5: they aren't copiable values). */
const roomlessId = (o: GameObject): string => o.copyEffects?.[o.copyEffects.length - 1]?.key ?? o.copyOf ?? ownId(o);

/** The Room `o` is by its copiable values (CR 709.5), whatever doors it has unlocked, or undefined if it isn't one. */
export function roomOf(s: GameState, o: GameObject): CardDef | undefined {
  if (o.faceDown) return undefined;
  const d = s.cards[roomlessId(o)];
  return d && isRoom(restingDef(d)) ? restingDef(d) : undefined;
}

/**
 * A permanent that has just become a Room without having entered as one (a Clone or a "becomes a copy" effect copying a
 * Room, a Room turned face up) has neither unlocked designation (CR 709.5c-d): both its doors are locked.
 */
export function lockIfRoom(s: GameState, o: GameObject): void {
  if (o.zone !== "battlefield" || o.unlocked !== undefined || !roomOf(s, o)) return;
  o.unlocked = [];
  registerRoom(s, cardIdOf(o));
}

/** A Room permanent's: what it is with its unlocked doors (CR 709.5), copied or not (the designations aren't copied). */
const withDoors = (o: GameObject, key: string): string => (o.unlocked !== undefined ? roomKey(key, o.unlocked) : key);

/**
 * Its own card, or the face of it that's up (faces.ts, CR 709.3b, 710.1b, 712.8), or the combined back face a melded
 * permanent has the characteristics of (712.8g, meld.ts).
 */
const ownId = (o: GameObject): string => o.melded ?? (o.face !== undefined ? faceKey(o.cardId, o.face) : o.cardId);

/** Its definition's key: face-down values (layer 1b, CR 613.2b), or what it's a copy of (layer 1a), or its own card. */
/** Disguised and cloaked permanents have ward {2} (CR 702.168a, 701.58a). */
const withWard = (o: GameObject) => o.faceDown === "disguise" || o.faceDown === "cloak";
export const cardIdOf = (o: GameObject): string => (o.faceDown ? (withWard(o) ? FACE_DOWN_WARD.oracleId : FACE_DOWN.oracleId) : copiedId(o));

/** The card definition an object uses right now: its own, what it copies, or a face-down one (CR 613.2, 708.2). */
export const defOf = (s: GameState, o: GameObject): CardDef => {
  const out = ownDefOf(s, o);
  if (o.zone === "battlefield" || o.zone === "phasedOut" || o.zone === "merged") return o.textFrom ? withTextOf(s, out, o.textFrom) : out;
  // Outside the battlefield, effects like Maskwood Nexus's change a creature card's or spell's creature types.
  return offFieldColored(s, o, offFieldTyped(s, o, offFieldCreatureDef(out)));
};

/**
 * `d` with the rules text of the definition `from` (an exchange of text boxes, CR 612.5): its keywords and text, where
 * that card's name, which meant that object, now means this one (CR 201.5). Registered in GameState.cards under a key of
 * its own, so it compiles and caches like any card.
 */
function withTextOf(s: GameState, d: CardDef, from: string): CardDef {
  const key = `${d.oracleId}|text:${from}`;
  const hit = s.cards[key];
  if (hit) return hit;
  const src = s.cards[from];
  if (!src) return d;
  const text = normalizeSelf(src).replace(/~/g, d.name);
  const out: CardDef = { ...d, oracleId: key, oracleText: text, keywords: [...src.keywords] };
  s.cards[key] = out;
  return out;
}

const offFieldCreatures = new Map<string, CardDef>();

/**
 * Grist, the Hunger Tide anywhere but the battlefield: "it's a 1/1 Insect creature in addition to its other types" (its
 * own static ability, which works in every other zone, CR 113.6b; rulings: a Legendary Planeswalker Creature — Grist
 * Insect).
 */
export function offFieldCreatureDef(d: CardDef): CardDef {
  const off = compileCard(d).offFieldCreature;
  if (!off) return d;
  const hit = offFieldCreatures.get(d.oracleId);
  if (hit) return hit;
  const types = [...d.types.filter((t) => t !== "Creature"), "Creature"] as CardDef["types"];
  const subtypes = [...d.subtypes, off.subtype];
  const typeLine = `${[...d.supertypes, ...types].join(" ")} — ${subtypes.join(" ")}`;
  const out: CardDef = { ...d, types, subtypes, typeLine, power: off.power, toughness: off.toughness };
  offFieldCreatures.set(d.oracleId, out);
  return out;
}

/**
 * Its definition without the type changes that work outside the battlefield (defOf): what a copy of it copies, since
 * those aren't copiable values (CR 707.2).
 */
export const ownDefOf = (s: GameState, o: GameObject): CardDef => {
  if (o.faceDown) return withWard(o) ? FACE_DOWN_WARD : FACE_DOWN;
  const key = copiedId(o);
  // A face's definition is registered as the face is turned up (setFace); a game built by hand may not have done that.
  if (!s.cards[key] && key === ownId(o) && o.face !== undefined) registerFace(s, o, o.face);
  if (!s.cards[key] && o.unlocked !== undefined) registerRoom(s, key);
  const found = s.cards[key];
  if (!found) throw new Error(`missing card def ${key}`);
  // A card with faces has its resting characteristics unless a face is up (CR 709.4, 712.8a, 715.4).
  const d = restingDef(found);
  return o.bestowed ? bestowedDef(d) : o.prototyped ? prototypedDef(d) : o.overloaded ? overloadedDef(d) : o.cleaved ? cleavedDef(d) : o.mutating ? mutatingDef(d, o.owner) : d;
};

const mutatingDefs = new Map<string, CardDef>();

/**
 * A mutating creature spell (CR 702.140a): the card, targeting a non-Human creature with the same owner as the spell
 * (`mutateOwner`, see spellTargetSpecs). Its characteristics are the card's.
 */
export function mutatingDef(d: CardDef, owner: PlayerId): CardDef {
  const key = `${d.oracleId}|mutating:${owner}`;
  const hit = mutatingDefs.get(key);
  if (hit) return hit;
  const out: CardDef = { ...d, oracleId: key, mutateOwner: owner };
  mutatingDefs.set(key, out);
  return out;
}

const overloaded = new Map<string, CardDef>();

/**
 * An overloaded spell (CR 702.96a, 612): its text with every instance of the word "target" changed to "each", outside
 * the overload ability itself, so it has no targets (702.96b). Its mana cost doesn't change (rulings).
 */
export function overloadedDef(d: CardDef): CardDef {
  const hit = overloaded.get(d.oracleId);
  if (hit) return hit;
  const out: CardDef = { ...d, oracleId: `${d.oracleId}|overloaded`, oracleText: overloadedText(d.oracleText) };
  overloaded.set(d.oracleId, out);
  return out;
}

const cleaved = new Map<string, CardDef>();

/** A spell cast for its cleave cost (CR 702.148a): its text without the words in square brackets. */
export function cleavedDef(d: CardDef): CardDef {
  const hit = cleaved.get(d.oracleId);
  if (hit) return hit;
  const out: CardDef = { ...d, oracleId: `${d.oracleId}|cleaved`, oracleText: cleavedText(d.oracleText) };
  cleaved.set(d.oracleId, out);
  return out;
}

const prototyped = new Map<string, CardDef>();

/**
 * A prototyped spell or permanent (CR 718.3b): the card with its alternative mana cost, power and toughness, and the
 * colors of that mana cost (CR 105.2). These are copiable values (718.2a), so copies of it are the same.
 */
export function prototypedDef(d: CardDef): CardDef {
  const hit = prototyped.get(d.oracleId);
  if (hit) return hit;
  const m = /^Prototype ((?:\{[^}]+\})+) — (\d+)\/(\d+)/m.exec(d.oracleText);
  if (!m) return d;
  const cost = m[1]!;
  const colors = (["W", "U", "B", "R", "G"] as Color[]).filter((c) => [...cost.matchAll(/\{([^}]+)\}/g)].some((x) => x[1]!.split("/").includes(c)));
  const out: CardDef = { ...d, oracleId: `${d.oracleId}|prototyped`, manaCost: cost, cmc: manaValue(parseManaCost(cost)), power: m[2]!, toughness: m[3]!, colors };
  prototyped.set(d.oracleId, out);
  return out;
}

const bestowed = new Map<string, CardDef>();

/**
 * What a bestowed spell or permanent is (CR 702.103b): an Aura enchantment with enchant creature, not a creature. Its
 * creature types go with the creature type (CR 205.1a), and so do its power and toughness. This isn't a copiable
 * value (CR 707.2), so copies of it use the card itself (`cardIdOf`).
 */
export function bestowedDef(d: CardDef): CardDef {
  const hit = bestowed.get(d.oracleId);
  if (hit) return hit;
  const types = d.types.filter((t) => t !== "Creature");
  const subtypes = [...d.subtypes.filter((t) => subtypeSet(t) !== "Creature"), "Aura"];
  const { power: _p, toughness: _t, ...rest } = d;
  const out: CardDef = {
    ...rest,
    oracleId: `${d.oracleId}|bestowed`,
    types,
    subtypes,
    typeLine: `${[...d.supertypes, ...types].join(" ")} — ${subtypes.join(" ")}`,
    oracleText: `Enchant creature\n${d.oracleText}`,
  };
  bestowed.set(d.oracleId, out);
  return out;
}

/**
 * What a face-down permanent will be once turned face up: its card, or what a copy effect made it a copy of while
 * face down, whose morph cost (if any) turns it face up (CR 707.3, examples).
 */
export const faceUpDefOf = (s: GameState, o: GameObject): CardDef => restingDef(s.cards[copiedId(o)]!);

/** The card itself, face up: what its owner (or controller, while it's face down, CR 708.5) sees. */
export const realDefOf = (s: GameState, o: GameObject): CardDef => restingDef(s.cards[o.cardId]!);

export const isType = (d: CardDef, t: string) => d.types.includes(t);

/** "Name: ability text", with the card's name where the text says "~" (itself). */
export const describeAbility = (d: CardDef, text: string) => `${d.name}: ${text.replace(/~/g, d.name)}`;
/** A permanent that was cast this turn: it entered as its spell resolved, this turn (Emrakul, the World Anew's protection). */
export const wasCastThisTurn = (s: GameState, o: GameObject) => o.zone === "battlefield" && !!o.wasCast && o.enteredTurn === s.turn;
/** Its characteristics as a source of protection-relevant quality, with whether it was cast this turn. */
export const withCastThisTurn = <T extends object>(s: GameState, o: GameObject, c: T): T & { castThisTurn?: true } => (wasCastThisTurn(s, o) ? { ...c, castThisTurn: true as const } : c);
export const isPermanentCard = (d: CardDef) =>
  ["Artifact", "Creature", "Enchantment", "Land", "Planeswalker", "Battle"].some((t) => d.types.includes(t));
export const hasKeyword = (d: CardDef, k: SupportedKeyword) => d.keywords.some((x) => x.toLowerCase() === k.toLowerCase());

// A station card's power and toughness are in a striation, its own only while that applies (CR 721.2b-c).
const ptInStriation = (d: CardDef) => d.keywords.includes("Station");
export function basePower(d: CardDef): number {
  return ptInStriation(d) ? 0 : Number.parseInt(d.power ?? "0", 10) || 0;
}
export function baseToughness(d: CardDef): number {
  return ptInStriation(d) ? 0 : Number.parseInt(d.toughness ?? "0", 10) || 0;
}
/** Current power and toughness, after all continuous effects and counters (CR 613.4). */
export const power = (s: GameState, o: GameObject) => characteristics(s, o).power;
/**
 * Its base power (rulings on Kutzil): printed, or from a characteristic-defining ability or an effect that sets it
 * (CR 613.4a-b), whichever applied last; not changed by modifications or counters (613.4c).
 */
export function basePowerNow(s: GameState, o: GameObject): number {
  const c = characteristics(s, o);
  const set = [...c.pt].reverse().find((p) => p.kind === "set");
  return set ? set.power : c.printedPower;
}
export const toughness = (s: GameState, o: GameObject) => characteristics(s, o).toughness;

/** Is this object of card type `t` right now (after type-changing effects)? */
export const objIsType = (s: GameState, o: GameObject, t: string) => characteristics(s, o).types.includes(t);

/** Does this permanent have keyword `k` right now (printed, granted, or not lost)? */
/** Whether it can be sacrificed: not if it "can't be sacrificed" (CR 701.21; rulings on Alexios), for a cost or by an effect. */
export function canBeSacrificed(s: GameState, o: GameObject): boolean {
  return !characteristics(s, o).cantBeSacrificed;
}

export function objHasKeyword(s: GameState, o: GameObject, k: SupportedKeyword | string): boolean {
  return characteristics(s, o).keywords.some((x) => x.toLowerCase() === k.toLowerCase());
}

export const NO_ABILITIES: CompiledCard = { triggers: [], activated: [], mana: [], statics: [], entersTapped: false, unsupported: [], textKeywords: [] };

/**
 * The abilities an object has right now: its card's, unless an effect removed them, then the ones effects
 * gave it (CR 613.1f).
 */
export function abilitiesOf(s: GameState, o: GameObject): CompiledCard {
  const c = characteristics(s, o);
  let own = withGranted(c.hasPrintedAbilities ? compileCard(defOf(s, o)) : NO_ABILITIES, c.grantedAbilities);
  // Decayed's triggered ability (CR 702.147a), however it got the keyword: printed, granted, or from a decayed counter.
  if (c.keywords.includes("Decayed")) own = withDecayed(own);
  // "{U}: Counter target spell with the chosen name" (Declaration of Naught): its targets are the name chosen for it.
  if (o.chosen?.name !== undefined) own = withChosenName(own, o.chosen.name);
  // Each card encoded on it gives it "Whenever this creature deals combat damage to a player, you may copy the encoded
  // card and you may cast the copy without paying its mana cost" for as long as it's encoded (CR 702.99a, c).
  const encoded = o.zone === "battlefield" ? (o.encoded ?? []).filter((e) => s.objects[e.id]?.zone === "exile" && (s.objects[e.id]!.zoneChanges ?? 0) === e.zc) : [];
  if (encoded.length) own = { ...own, triggers: [...own.triggers, ...encoded.map((e) => cipherTrigger(defOf(s, s.objects[e.id]!).name, e))] };
  const lent = o.zone === "battlefield" && c.hasPrintedAbilities ? exiledLentTo(s, o) : [];
  if (lent.length) own = withLent(own, lent);
  return own.borrows && o.zone === "battlefield" && !borrowing ? withBorrowed(s, o, own) : own;
}

/**
 * Agatha's Soul Cauldron, Hazel's Brewmaster (CompiledCard.lendsExiled): the cards whose activated abilities this
 * permanent has now, from each permanent its controller controls that lends them to it (a creature of theirs with a
 * +1/+1 counter on it, a Food of theirs): the
 * creature cards still exiled with that permanent as the object it is now (CR 607.2a, 400.7).
 */
export function exiledLentTo(s: GameState, o: GameObject): CardDef[] {
  // Agatha's Soul Cauldron lends them to creatures with +1/+1 counters, Hazel's Brewmaster to Foods: nothing to look
  // for on anything else.
  if (o.zone !== "battlefield" || !s.linkedExile || !((o.counters["+1/+1"] ?? 0) > 0 || characteristics(s, o).subtypes.includes("Food"))) return [];
  const out: CardDef[] = [];
  const you = characteristics(s, o).controller;
  for (const id of s.battlefield) {
    const p = s.objects[id]!;
    const pc = characteristics(s, p);
    if (pc.controller !== you || !pc.hasPrintedAbilities) continue;
    const lend = compileCard(defOf(s, p)).lendsExiled;
    if (!lend || !objectMatches(s, lend.to, o, you, false)) continue;
    for (const l of s.linkedExile[`${p.id}@${p.zoneChanges ?? 0}`] ?? []) {
      const card = s.objects[l.id];
      if (card?.zone === "exile" && (card.zoneChanges ?? 0) === l.zc && printedMatches(lend.cards, defOf(s, card))) out.push(defOf(s, card));
    }
  }
  return out;
}

const lentCache = new WeakMap<CompiledCard, Map<string, CompiledCard>>();
/** Its own abilities and the activated ones of these cards (not those that work only from another zone, nor equip or loyalty abilities). */
function withLent(own: CompiledCard, cards: CardDef[]): CompiledCard {
  const key = cards.map((d) => d.name).join("|");
  let byKey = lentCache.get(own);
  if (!byKey) lentCache.set(own, (byKey = new Map()));
  let hit = byKey.get(key);
  if (!hit) {
    const usable = (a: CompiledCard["activated"][number]) => !a.zone && !a.equip && a.loyalty === undefined && !a.loyaltyX;
    hit = { ...own, activated: [...own.activated, ...cards.flatMap((d) => compileCard(d).activated.filter(usable))] };
    byKey.set(key, hit);
  }
  return hit;
}

/** While working out the abilities a permanent borrows: the lenders' own abilities, without what they borrow (no loops). */
let borrowing = false;
const ids = new WeakMap<CompiledCard, number>();
let nextCompiledId = 1;
const idOf = (c: CompiledCard) => ids.get(c) ?? (ids.set(c, nextCompiledId), nextCompiledId++);
const borrowed = new WeakMap<CompiledCard, Map<string, CompiledCard>>();

/**
 * What a permanent with "~ has all activated abilities of ..." (CompiledCard.borrows) borrows from now: the permanents
 * (`objects`) or graveyard cards (`cards`) matching it. A lender's own borrowing isn't followed (no loops).
 */
export function lendersOf(s: GameState, o: GameObject, b: NonNullable<CompiledCard["borrows"]>): { objects: GameObject[]; cards: CardDef[] } {
  const out = { objects: [] as GameObject[], cards: [] as CardDef[] };
  if (o.zone !== "battlefield" || borrowing) return out;
  const c = characteristics(s, o);
  borrowing = true;
  try {
    if (b.graveyard) {
      for (const pid of s.turnOrder)
        if (!b.yours || pid === c.controller)
          for (const id of s.players[pid]!.graveyard) {
            const d = defOf(s, s.objects[id]!);
            if (printedMatches(b.filter, d)) out.cards.push(d);
          }
    } else
      for (const id of s.battlefield) {
        const x = s.objects[id]!;
        if (b.other && x.id === o.id) continue;
        if (!objectMatches(s, b.filter, x, c.controller, false)) continue;
        if (b.notSameName && sameName(characteristics(s, x).name, c.name)) continue;
        out.objects.push(x);
      }
  } finally {
    borrowing = false;
  }
  return out;
}

/**
 * "~ has all activated abilities of ..." (CompiledCard.borrows): its own abilities, then the activated abilities of each
 * permanent or graveyard card it borrows from, as that object has them now (CR 613.1f: after layer 6 for permanents; a
 * card in a graveyard has its printed ones). "~" in them is this object (rulings). Its mana abilities are borrowed in
 * manaAbilitiesOn.
 */
function withBorrowed(s: GameState, o: GameObject, own: CompiledCard): CompiledCard {
  const found = lendersOf(s, o, own.borrows!);
  borrowing = true;
  let lenders: CompiledCard[];
  try {
    lenders = [...found.objects.map((x) => abilitiesOf(s, x)), ...found.cards.map((d) => compileCard(d))];
  } finally {
    borrowing = false;
  }
  if (!lenders.length) return own;
  const key = lenders.map(idOf).join(",");
  let byKey = borrowed.get(own);
  if (!byKey) borrowed.set(own, (byKey = new Map()));
  let hit = byKey.get(key);
  if (!hit) {
    const usable = (a: CompiledCard["activated"][number]) => !a.zone && !a.equip && a.loyalty === undefined && !a.loyaltyX;
    hit = { ...own, activated: [...own.activated, ...lenders.flatMap((l) => l.activated.filter(usable).map((a) => ({ ...a, borrowed: true as const })))] };
    byKey.set(key, hit);
  }
  return hit;
}

/** The cards in exile haunting this permanent (CR 702.55b), for showing it. */
export function hauntedBy(s: GameState, o: GameObject): GameObject[] {
  if (o.zone !== "battlefield") return [];
  const zc = o.zoneChanges ?? 0;
  return s.turnOrder.flatMap((pid) => s.players[pid]!.exile.map((id) => s.objects[id]!).filter((c) => c.haunting?.id === o.id && c.haunting.zc === zc));
}

const DECAYED_TRIGGER: TriggeredAbility = {
  event: "selfAttacks",
  body: { targets: [], effects: [{ type: "delayed", when: "endOfCombat", effects: [{ type: "sacrifice", what: { ref: "subject" } }], text: "sacrifice ~" }], text: "Decayed: when ~ attacks, sacrifice it at end of combat." },
};
const decayed = new WeakMap<CompiledCard, CompiledCard>();
function withDecayed(base: CompiledCard): CompiledCard {
  let hit = decayed.get(base);
  if (!hit) decayed.set(base, (hit = { ...base, triggers: [...base.triggers, DECAYED_TRIGGER] }));
  return hit;
}

const cipherTrigger = (name: string, e: { id: ObjectId; zc: number }): TriggeredAbility => ({
  event: "selfDealsCombatDamageToPlayer",
  body: { targets: [], effects: [{ type: "castCipher", card: e.id, zc: e.zc }], text: `Whenever ~ deals combat damage to a player, you may copy the encoded card (${name}) and you may cast the copy without paying its mana cost.` },
});

const named = new WeakMap<CompiledCard, Map<string, CompiledCard>>();
/** Activated abilities whose targets are "with the chosen name", with that name filled in (TargetSpec.chosen "name"). */
function withChosenName(base: CompiledCard, name: string): CompiledCard {
  if (!base.activated.some((a) => a.body.targets.some((t) => t.chosen === "name"))) return base;
  let byName = named.get(base);
  if (!byName) named.set(base, (byName = new Map()));
  let hit = byName.get(name);
  if (!hit) {
    const bind = (t: TargetSpec): TargetSpec => (t.chosen === "name" ? (({ chosen: _, ...rest }) => ({ ...rest, named: name }))(t) : t);
    byName.set(name, (hit = { ...base, activated: base.activated.map((a) => ({ ...a, body: { ...a.body, targets: a.body.targets.map(bind) } })) }));
  }
  return hit;
}

const merged = new WeakMap<CompiledCard, Map<string, CompiledCard>>();
/** A card's abilities plus granted ones (`grantedAbilities` texts), after them in that order. */
export function withGranted(base: CompiledCard, granted: readonly string[]): CompiledCard {
  if (!granted.length) return base;
  const key = granted.join("\u0000");
  let byKey = merged.get(base);
  if (!byKey) merged.set(base, (byKey = new Map()));
  let hit = byKey.get(key);
  if (!hit) {
    const extra = granted.map(compileGranted);
    hit = {
      ...base,
      triggers: [...base.triggers, ...extra.flatMap((x, i) => x.triggers.map((t) => (t.oncePerTurn ? { ...t, grant: i } : t)))],
      activated: [...base.activated, ...extra.flatMap((x) => x.activated)],
      mana: [...base.mana, ...extra.flatMap((x) => x.mana)],
    };
    // Granted static abilities that aren't layer effects (grants.ts GRANTED_FIELDS); the layer ones are in layers.ts.
    const more = <K extends "costMods" | "countMods" | "othersEnterWithCounters" | "entersWithAdditional">(k: K) => {
      const all: unknown[] = [...(base[k] ?? []), ...extra.flatMap((x): unknown[] => x[k] ?? [])];
      if (all.length) hit![k] = all as CompiledCard[K];
    };
    more("costMods");
    more("countMods");
    more("othersEnterWithCounters");
    more("entersWithAdditional");
    // Dungeon Delver's granted "Room abilities ... trigger an additional time": one more per instance (rulings).
    const rooms = (base.roomsTwice ?? 0) + extra.reduce((n, x) => n + (x.roomsTwice ?? 0), 0);
    if (rooms) hit.roomsTwice = rooms;
    if (extra.some((x) => x.firstDrawLook)) hit.firstDrawLook = true;
    byKey.set(key, hit);
  }
  return hit;
}

/** How a permanent differs from its printed card right now, for display. */
export interface Modifications {
  /** Net +1/+1 counters (negative when -1/-1 counters dominate). */
  plusCounters: number;
  /** Other counters by kind (loyalty, charge, ...). */
  otherCounters: Record<string, number>;
  /** Net P/T change from effects (not counters) that add or subtract. */
  effectPower: number;
  effectToughness: number;
  /** Some of that change ends at end of turn. */
  temporary: boolean;
  /** Power/toughness were set or switched by an effect. */
  setOrSwitched: boolean;
  /** Each step, for tooltips. */
  pt: PTPart[];
  /** Keywords it has that the printed card doesn't. */
  grantedKeywords: string[];
  /** Printed keywords it no longer has. */
  lostKeywords: string[];
  /** Quoted abilities effects gave it ("~" is this permanent). */
  grantedAbilities: string[];
  lostAllAbilities: boolean;
}

export function modifications(s: GameState, o: GameObject): Modifications {
  const d = defOf(s, o);
  const c = characteristics(s, o);
  const has = (list: string[], k: string) => list.some((x) => x.toLowerCase() === k.toLowerCase());
  const otherCounters: Record<string, number> = {};
  for (const [k, n] of Object.entries(o.counters)) if (n > 0 && k !== "+1/+1" && k !== "-1/-1") otherCounters[k] = n;
  const mods = c.pt.filter((p) => p.kind === "modify");
  return {
    plusCounters: (o.counters["+1/+1"] ?? 0) - (o.counters["-1/-1"] ?? 0),
    otherCounters,
    effectPower: mods.reduce((n, p) => n + p.power, 0),
    effectToughness: mods.reduce((n, p) => n + p.toughness, 0),
    temporary: c.pt.some((p) => p.untilEndOfTurn && p.kind !== "counters"),
    setOrSwitched: c.pt.some((p) => p.kind === "set" || p.kind === "switch"),
    pt: c.pt,
    grantedKeywords: c.keywords.filter((k) => !has(printedKeywords(d), k)),
    lostKeywords: printedKeywords(d).filter((k) => !!canonicalKeyword(k) && !has(c.keywords, k)),
    grantedAbilities: c.grantedAbilities,
    lostAllAbilities: !c.hasPrintedAbilities,
  };
}

/**
 * Colors of mana a card can make with its own mana abilities, without paying mana: its basic
 * land types' abilities (CR 305.6) and its printed ones.
 */
export function manaAbilities(d: CardDef): ManaType[] {
  const out = new Set<ManaType>();
  for (const st of d.subtypes) {
    const c = BASIC_LAND_MANA[st];
    if (c) out.add(c);
  }
  for (const ab of compileCard(d).mana) {
    if (ab.manaCost) continue;
    if (ab.produces.kind === "fixed") ab.produces.mana.forEach((m) => out.add(m));
    else if (ab.produces.kind === "oneOf") ab.produces.options.forEach((m) => out.add(m));
    else COLORS.forEach((c) => out.add(c));
  }
  return [...out];
}

/** The intrinsic "{T}: Add [mana]." of a basic land type (CR 305.6). */
export const basicLandManaAbility = (subtype: string): ManaAbility | null => {
  const c = BASIC_LAND_MANA[subtype];
  return c ? { text: `{T}: Add {${c}}.`, manaCost: "", tap: true, sacrificeSelf: false, produces: { kind: "fixed", mana: [c] } } : null;
};

/** Split a Scryfall type line ("Legendary Creature — Elf Druid") into its parts. CR 205 */
export function parseTypeLine(typeLine: string): Pick<CardDef, "supertypes" | "types" | "subtypes"> {
  const front = typeLine.split(" // ")[0] ?? "";
  const [left = "", right = ""] = front.split(" — ");
  const SUPER = ["Legendary", "Basic", "Snow", "World", "Ongoing", "Host"];
  const words = left.trim().split(/\s+/).filter(Boolean);
  return {
    supertypes: words.filter((w) => SUPER.includes(w)),
    types: words.filter((w) => !SUPER.includes(w)),
    // "Time Lord" is one creature type of two words (CR 205.3m).
    subtypes: right.trim().replace(/\bTime Lord\b/g, "Time_Lord").split(/\s+/).filter(Boolean).map((w) => (w === "Time_Lord" ? "Time Lord" : w)),
  };
}

/** Do these cards all share a land type (CR 205.3i), each with every other? "Two basic land cards that share a land type" (Myriad Landscape). */
export function shareLandType(defs: CardDef[]): boolean {
  const types = (d: CardDef) => d.subtypes.filter((t) => subtypeSet(t) === "Land");
  return defs.every((a, i) => defs.every((b, j) => i === j || types(a).some((t) => types(b).includes(t))));
}
