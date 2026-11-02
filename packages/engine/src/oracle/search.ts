import { DRAFTED_NAME } from "./draft";
import type { AmountExpr, Effect, SameNameRef, SearchDest, TargetSpec } from "../abilities";
import { CREATURE_TYPES } from "../keywords";
import { NUMBER_WORDS, X, BASIC_TYPES } from "./words";
import { parseTargetPhrase } from "./targets";

const SEARCH_PRONOUN = "(?:it|them|that card|those cards|the card|those cards)";
// "... onto the battlefield with an additional +1/+1 counter on it" (Neoform): it enters with it (CR 614.1c).
// Magmatic Hellkite: "... onto the battlefield tapped with a stun counter on it" the same way.
const SEARCH_DEST = "(into your hand|onto the battlefield(?: tapped)?(?: with an additional \\+1/\\+1 counter on it| with a stun counter on it)?|into your graveyard)";

function searchDest(text: string): SearchDest {
  if (text === "into your hand") return { zone: "hand" };
  if (text === "into your graveyard") return { zone: "graveyard" };
  const counter = text.endsWith(" with an additional +1/+1 counter on it") ? ("+1/+1" as const) : text.endsWith(" with a stun counter on it") ? ("stun" as const) : undefined;
  return { zone: "battlefield", ...(/ tapped(?: with|$)/.test(text) ? { tapped: true } : {}), ...(counter ? { counters: { counter, n: 1 } } : {}) };
}

/**
 * "Search your library for a basic land card, reveal it, put it into your hand, then shuffle"
 * (CR 701.23), and the variants: "put one onto the battlefield tapped and the other into your
 * hand" (Cultivate), "then shuffle and put that card on top" (Vampiric Tutor).
 */
export function parseSearch(s: string, count?: (text: string) => AmountExpr | null, same?: (ref: string) => SameNameRef | null): Effect[] | null {
  const m = /^Search your library for (up to )?(a|an|one|two|three|four|five|six|seven|eight|nine|ten|X|any number of) (.+?)(?:, reveal (?:it|them|that card|those cards))?(?:,| and) ((?:put|then|exile) .+)$/i.exec(s);
  if (!m) return null;
  // "A permanent card with the same name as target nontoken creature" (Bifurcate), "a card with the same name as that
  // creature" (Remembrance): the search as without it, finding only cards with that name (CR 201.2), worked out as it
  // resolves (`same` says from what, registering a target if there is one).
  const sm = / with the same name as (.+)$/.exec(m[3]!);
  if (sm) {
    const ref = same?.(sm[1]!);
    const fx = ref && parseSearch(s.replace(sm[0], ""), count);
    if (!ref || fx?.length !== 1 || fx[0]!.type !== "search" || fx[0]!.oneEach || fx[0]!.oneOfEach || fx[0]!.filter?.anyOf) return null;
    return [{ ...fx[0]!, filter: { ...(fx[0]!.filter ?? { kind: "card" }), text: m[3]! }, sameName: ref }];
  }
  const upTo = !!m[1] || m[2] === "any number of";
  // "Up to X basic land cards" (New Frontiers): the X it was cast with. "X cards" (Insidious Dreams) too: as many as
  // there are, up to X (CR 701.23d).
  if (m[2] === "X" && !m[1] && !/^cards$/.test(m[3]!)) return null;
  const n = m[2] === "any number of" ? 99 : m[2] === "X" ? X : NUMBER_WORDS[m[2]!.toLowerCase()]!;
  const reveal = /, reveal /.test(s);
  const rest = m[4]!;
  // Alpine Houndmaster: "a card named A and/or a card named B": up to one of each (one search, CR 701.23).
  const both = /^card named ([A-Z][^~]*?) and\/or a card named ([A-Z][^~]*)$/.exec(m[3]!);
  if (both && n === 1 && !m[1]) {
    const r = new RegExp(`^put them ${SEARCH_DEST}, then shuffle$`, "i").exec(rest);
    if (!r || / or |\band\/or\b/.test(`${both[1]} ${both[2]}`)) return null;
    const filter: TargetSpec = { kind: "card", anyOf: [both[1]!, both[2]!].map((name) => ({ kind: "card" as const, named: name, text: `card named ${name}` })), text: m[3]! };
    return [{ type: "search", filter, n: 2, upTo: true, oneEach: true, reveal, dest: searchDest(r[1]!) }];
  }
  // Krosan Verge: "a Forest card and a Plains card", Yasharn: "a basic Forest card and a basic Plains card": up to one for
  // each (a search may find less, CR 701.23b), a dual land being either one but not both.
  // Axgard Armory: "an Aura card and/or an Equipment card": the same, up to one of each.
  // Invent: "an instant card and/or a sorcery card" likewise.
  // Aang's Journey: "a basic land card and a Shrine card".
  const pair = /^((?:basic )?(?:[A-Z][a-z]+|instant|sorcery|artifact|enchantment|land) card) and(?:\/or)? an? ((?:basic )?(?:[A-Z][a-z]+|instant|sorcery|artifact|enchantment|land) card)$/.exec(m[3]!);
  if (pair && n === 1 && !m[1]) {
    const r = new RegExp(`^(?:reveal them, )?put (?:them|those cards) ${SEARCH_DEST}, then shuffle$`, "i").exec(rest);
    const specs = [pair[1]!, pair[2]!].map((p) => parseSearchFilter(p));
    if (!r || specs.some((f) => !f)) return null;
    const anyOf = specs as TargetSpec[];
    return [{ type: "search", filter: { kind: "card", anyOf, text: `${pair[1]} and a ${pair[2]}` }, n: 2, upTo: true, oneOfEach: anyOf, reveal, dest: searchDest(r[1]!) }];
  }
  // Gaea's Balance: "a land card of each basic land type": up to one for each (rulings: you may fail to find any), a
  // land with two basic land types (Stomping Ground) being either one but not both; nonbasic ones count (rulings).
  if (m[3] === "land card of each basic land type" && n === 1 && !m[1]) {
    const r = new RegExp(`^(?:reveal them, )?put (?:them|those cards) ${SEARCH_DEST}, then shuffle$`, "i").exec(rest);
    const specs = ["Plains", "Island", "Swamp", "Mountain", "Forest"].map((t) => parseSearchFilter(`${t} card`));
    if (!r || specs.some((f) => !f)) return null;
    const anyOf = specs as TargetSpec[];
    return [{ type: "search", filter: { kind: "card", anyOf, text: "land card of each basic land type" }, n: 5, upTo: true, oneOfEach: anyOf, reveal, dest: searchDest(r[1]!) }];
  }
  // Conflux: "a white card, a blue card, a black card, a red card, and a green card": up to one for each, a multicolored
  // card being any one of its colors but not two of them (CR 701.23b). Shard Convergence, Gem of Becoming: "a Plains card,
  // an Island card, ...": by land type, a dual land being either one (rulings).
  const list = /, and an? /.test(m[3]!) ? `${m[2]} ${m[3]}`.split(/, (?:and )?/) : null;
  if (list && list.length >= 3 && n === 1 && !m[1] && list.every((x) => /^an? (?:white|blue|black|red|green|Plains|Island|Swamp|Mountain|Forest) card$/.test(x))) {
    const r = new RegExp(`^(?:reveal them, )?put (?:them|those cards) ${SEARCH_DEST}, then shuffle$`, "i").exec(rest);
    const specs = list.map((p) => parseSearchFilter(p.replace(/^an? /, "")));
    if (!r || specs.some((f) => !f)) return null;
    const anyOf = specs as TargetSpec[];
    return [{ type: "search", filter: { kind: "card", anyOf, text: list.map((x) => x.replace(/^an? /, "")).join(", ") }, n: list.length, upTo: true, oneOfEach: anyOf, reveal, dest: searchDest(r[1]!) }];
  }
  // "Up to four Minotaur creature cards with different names" (Deathbellow War Cry): no two with the same name, which is
  // one of each name offered (oneEach). Several of them only.
  // "Up to X creature cards with different names that each have mana value X" (Uncage the Menagerie): the X it was cast
  // with; a card with {X} in its mana cost counts X as 0 in the library (CR 202.3e, rulings).
  const eachX = / that each have mana value X$/.exec(m[3]!);
  // "Up to two basic land cards that share a land type" (Myriad Landscape): every card found has a land type in common
  // with each other one; one card alone is fine (rulings).
  const share = / that share a land type$/.exec(m[3]!);
  if (share && (n === 1 || eachX)) return null;
  // "Any number of creature cards with total mana value 6 or less" (Protean Hulk): all the cards found together, a card
  // with {X} in its mana cost counting X as 0 (CR 202.3e, rulings).
  const total = / with total mana value (\d+) or less$/.exec(m[3]!);
  if (total && (n === 1 || eachX || share)) return null;
  // Light-Paws: "an Aura card with mana value less than or equal to that Aura and with a different name than each Aura you
  // control": the Aura that entered (the trigger's subject, as it last existed), and the names of those you control as it
  // resolves.
  // Central Elevator: "a Room card that doesn't have the same name as a Room you control": the names of the unlocked doors
  // of Rooms you control as it resolves (a Room has only those, rulings).
  const unlike = / and with a different name than each ([A-Z][a-z]+) you control$/.exec(m[3]!) ?? / that doesn't have the same name as an? ([A-Z][a-z]+) you control$/.exec(m[3]!);
  const unlikeSpec = unlike ? parseSearchFilter(`${unlike[1]} card`) : undefined;
  if (unlike && (!unlikeSpec || n !== 1 || eachX || share || total)) return null;
  const phrase = eachX ? m[3]!.slice(0, eachX.index) : share ? m[3]!.slice(0, share.index) : total ? m[3]!.slice(0, total.index) : unlike ? m[3]!.slice(0, unlike.index).replace(/ with mana value less than or equal to that Aura$/, " with mana value less than or equal to that permanent's mana value") : m[3]!;
  // "That each have different names" (Tiamat) says the same.
  const different = / (?:with|that each have) different names$/.exec(phrase);
  if ((different && n === 1) || (eachX && !different)) return null;
  const filter00 = parseSearchFilter(different ? phrase.slice(0, different.index) : phrase, count);
  if (filter00 === null || (eachX && (!filter00 || filter00.bound)) || (unlike && !filter00)) return null;
  const filter0 = unlike ? { ...filter00!, notNamedAsYours: { ...unlikeSpec!, kind: "object" as const, text: `${unlike[1]} you control` }, text: m[3]! } : filter00;
  const filter = eachX ? { ...filter0!, bound: { key: "manaValue" as const, at: "exact" as const, amount: X }, text: `${filter0!.text} with mana value X` } : filter0;
  let r: RegExpExecArray | null;
  // An Aura put onto the battlefield this way: its controller chooses what it enchants as it enters (CR 303.4f).
  const base = { type: "search" as const, ...(filter ? { filter: different ? { ...filter, text: `${filter.text} with different names` } : share ? { ...filter, text: `${filter.text} that share a land type` } : total ? { ...filter, text: `${filter.text} with total mana value ${total[1]} or less` } : filter } : {}), n, upTo, reveal, ...(different ? { oneEach: true as const } : {}), ...(share ? { shareLandType: true as const } : {}), ...(total ? { totalMv: Number(total[1]) } : {}) };
  if ((r = new RegExp(`^put ${SEARCH_PRONOUN} ${SEARCH_DEST}, then shuffle$`, "i").exec(rest))) return [{ ...base, dest: searchDest(r[1]!) }];
  // Foresight, Manipulate Fate: "Search your library for three cards, exile them, then shuffle"; Selective Memory: "any
  // number of nonland cards".
  if (/^exile (?:them|it|that card), then shuffle$/i.test(rest) && !reveal) return [{ ...base, dest: { zone: "exile" }, away: true }];
  // "Put that card onto the battlefield attached to ~" (Light-Paws): an Aura, if it could enchant the source (rulings).
  if (filter?.subtypes?.length === 1 && filter.subtypes[0] === "Aura" && n === 1 && new RegExp(`^put ${SEARCH_PRONOUN} onto the battlefield attached to ~, then shuffle$`).test(rest)) return [{ ...base, dest: { zone: "battlefield", attachToSelf: true } }];
  if ((r = new RegExp(`^put one ${SEARCH_DEST} and the (?:other|rest) ${SEARCH_DEST}, then shuffle$`, "i").exec(rest)) && n === 2)
    return [{ ...base, dest: searchDest(r[1]!), others: searchDest(r[2]!) }];
  // Viewpoint Synchronization: "Put two of them onto the battlefield tapped and the other into your hand": with two or
  // fewer found, they all go to the first place (rulings).
  if ((r = new RegExp(`^put two of them ${SEARCH_DEST} and the other ${SEARCH_DEST}, then shuffle$`, "i").exec(rest)) && n === 3)
    return [{ ...base, dest: searchDest(r[1]!), others: searchDest(r[2]!), firstN: 2 }];
  // The shuffle and putting the card on top are one action (rulings).
  if (/^then shuffle and put (?:that card|the card|it) on top(?: of your library)?$/i.test(rest) && n === 1) return [{ ...base, dest: { zone: "libraryTop" } }];
  // "Then shuffle and put those cards on top in any order" (Goblin Recruiter, Insidious Dreams): the searcher orders them.
  // Scouting Trek's "then shuffle and put them on top" is the same: the owner orders cards put into a library together
  // (CR 401.4).
  if (/^then shuffle and put (?:those cards|them) on top(?: of your library)?(?: in any order)?$/i.test(rest) && n !== 1) return [{ ...base, dest: { zone: "libraryTop" } }];
  if (/^then shuffle and put that card third from the top$/i.test(rest) && n === 1) return [{ ...base, dest: { zone: "libraryTop", third: true } }];
  if (/^put (?:it|that card) on top of your library, then shuffle$/i.test(rest)) return null; // shuffled away again: not a real template
  return null;
}

/** What a search looks for: undefined for "a card", null when it isn't understood. */
export function parseSearchFilter(phrase: string, count?: (text: string) => AmountExpr | null): TargetSpec | undefined | null {
  // "Up to two artifact, creature, and/or enchantment cards" (Brightglass Gearhulk): each card is any one of those card
  // types, the same as "artifact, creature, or enchantment cards".
  const TYPE = "(?:artifact|creature|enchantment|instant|sorcery|land|planeswalker|battle)";
  // Smuggler Captain: nothing was noted in a draft, so nothing is found (TargetSpec.drafted, oracle/draft.ts).
  if (DRAFTED_NAME.test(phrase)) return { kind: "card", drafted: true, text: phrase };
  // Monument to Perfection: "a basic, Sphere, or Locus land card": a land card that's any of them.
  const kinds = /^((?:basic|[A-Z][a-z]+), (?:(?:basic|[A-Z][a-z]+), )*or (?:basic|[A-Z][a-z]+)) land card$/.exec(phrase);
  if (kinds) {
    const anyOf = kinds[1]!.split(/, (?:or )?/).map((k) => parseSearchFilter(`${k} land card`, count));
    if (anyOf.some((f) => !f || f.anyOf)) return null;
    return { kind: "card", types: ["Land"], notTypes: [], notColors: [], anyOf: anyOf as TargetSpec[], text: phrase };
  }
  const p = phrase.replace(/\bcards\b/g, "card").replace(new RegExp(`^((?:${TYPE}, )*${TYPE},?) and/or (${TYPE} card)\\b`), "$1 or $2");
  // Tallowisp: "an Aura card with enchant creature" (TargetSpec.enchantCreature, as Rootwater Shaman's).
  if (p === "Aura card with enchant creature") return { kind: "card", types: ["Enchantment"], notTypes: [], notColors: [], subtypes: ["Aura"], enchantCreature: true, text: p };
  // Call to the Kindred: "a creature card that shares a creature type with enchanted creature", bound as the look resolves.
  const kindred = /^(creature card) that shares a creature type with enchanted creature$/.exec(p);
  if (kindred) {
    const base = parseSearchFilter(kindred[1]!, count);
    return base ? { ...base, sharesTypeWithAttached: true, text: p } : null;
  }
  // Fang-Druid Summoner: "a creature card with no abilities", by its printed text (TargetSpec.noAbilities).
  const noAb = /^(.+ card) with no abilities$/.exec(p);
  if (noAb) {
    const base = parseSearchFilter(noAb[1]!, count);
    return base && !base.noAbilities ? { ...base, noAbilities: true, text: p } : null;
  }
  // Vizier of the Anointed: "a creature card with eternalize or embalm": either printed keyword (CR 702.128a, 702.129a).
  const embalm = /^(.+ card) with eternalize or embalm$/.exec(p);
  if (embalm) {
    const base = parseSearchFilter(embalm[1]!, count);
    if (!base || base.anyOf) return null;
    return { ...base, anyOf: ["Eternalize", "Embalm"].map((k) => ({ kind: "card" as const, keywords: [k], text: k.toLowerCase() })), text: p };
  }
  // Rootless Yew: "a creature card with power or toughness 6 or greater": either one (anyOf).
  const pOrT = /^(.+ card) with power or toughness (\d+) or greater$/.exec(p);
  if (pOrT) {
    const base = parseSearchFilter(pOrT[1]!, count);
    if (!base || base.anyOf) return null;
    const n = Number(pOrT[2]);
    return { ...base, anyOf: [{ kind: "card", power: { min: n }, text: `power ${n} or greater` }, { kind: "card", toughness: { min: n }, text: `toughness ${n} or greater` }], text: p };
  }
  // Pyre of Heroes: "a creature card that shares a creature type with the sacrificed creature and has mana value equal to
  // 1 plus that creature's mana value": the sacrificed creature as it last existed (rulings).
  const kin = /^(.+ card) that shares a creature type with the sacrificed creature and has (mana value equal to .+)$/.exec(p);
  if (kin) {
    const rest = parseSearchFilter(`${kin[1]!} with ${kin[2]!.replace(/\bthat creature's\b/, "the sacrificed creature's")}`, count);
    return rest ? { ...rest, sharesCreatureTypeWithSacrificed: true, text: p } : null;
  }
  // "A card with mana value less than or equal to the number of lands you control" (Beseech the Queen): counted as the
  // search resolves (TargetSpec.bound).
  const bound = count && (/ with (?:mana value|power|toughness) (?:(?:less|greater) than or )?equal to .+$/i.exec(p) ?? / with (?:mana value|power|toughness) X or (?:less|greater)$/.exec(p));
  if (bound) {
    const head = parseSearchFilter(p.slice(0, bound.index));
    const spec = head !== null && parseTargetPhrase(`card${bound[0]} from your graveyard`, { count });
    if (!spec || head === null || spec.kind !== "card" || !spec.bound) return null;
    return { ...(head ?? { kind: "card" }), bound: spec.bound, text: p };
  }
  // Night Dealings, Mercadian Lift: "a nonland card with mana value X": exactly the X announced (CR 107.3a).
  const exactX = / with mana value X$/.exec(p);
  if (exactX) {
    const head = parseSearchFilter(p.slice(0, exactX.index));
    if (head === null) return null;
    return { ...(head ?? { kind: "card" }), bound: { key: "manaValue", at: "exact", amount: X }, text: p };
  }
  // Sisay, Weatherlight Captain: "a legendary permanent card with mana value less than ~'s power": at most one less, which
  // below 0 matches nothing.
  const under = count && / with mana value less than (?!or )(.+)$/.exec(p);
  if (under) {
    const head = parseSearchFilter(p.slice(0, under.index));
    const amount = count(under[1]!);
    if (head === null || !amount || amount.plus !== undefined || amount.times !== undefined) return null;
    return { ...(head ?? { kind: "card" }), bound: { key: "manaValue", at: "most", amount: { ...amount, plus: -1, signed: true } }, text: p };
  }
  // Transit Mage: "an artifact card with mana value 4 or 5": either one, a range of two.
  const twoMv = / with mana value (\d+) or (\d+)$/.exec(p);
  if (twoMv && Number(twoMv[2]) === Number(twoMv[1]) + 1) {
    const head = parseSearchFilter(p.slice(0, twoMv.index));
    return head === null || head?.manaValue ? null : { ...(head ?? { kind: "card" }), manaValue: { min: Number(twoMv[1]), max: Number(twoMv[2]) }, text: p };
  }
  // Meek Attack: "a creature card with total power and toughness 5 or less": the two printed numbers added up (an * is 0).
  const totalPT = / with total power and toughness (\d+) or (less|greater)$/.exec(p);
  if (totalPT) {
    const head = parseSearchFilter(p.slice(0, totalPT.index));
    return !head || !head.types?.includes("Creature") || head.totalPT ? null : { ...head, totalPT: totalPT[2] === "less" ? { max: Number(totalPT[1]) } : { min: Number(totalPT[1]) }, text: p };
  }
  // "A creature card with an even mana value" (Gyruda, Doom of Depths; zero is even, X counts 0 off the stack, CR 202.3e).
  const parity = / with an? (even|odd) mana value$/.exec(p);
  if (parity) {
    const head = parseSearchFilter(p.slice(0, parity.index));
    return head === null || head?.manaValue ? null : { ...(head ?? { kind: "card" }), manaValue: { parity: parity[1] as "even" | "odd" }, text: p };
  }
  if (/^card$/i.test(p)) return undefined;
  // Paradox Surveyor: "a card with {X} in its mana cost" (CR 107.3, by the card's printed mana cost).
  if (p === "card with {X} in its mana cost") return { kind: "card", xInCost: true, text: p };
  // Coralhelm Chronicler: "a card with a kicker ability", multikicker too (rulings), by the card's own text (CR 702.33).
  if (p === "card with a kicker ability") return { kind: "card", kickerAbility: true, text: p };
  // Tezzeret's Gatebreaker: "a blue or artifact card": a card of that color or of that card type.
  const colorOrType = /^(white|blue|black|red|green) or (artifact|creature|enchantment|instant|sorcery|land|planeswalker) card$/.exec(p);
  if (colorOrType) {
    const subs = [`${colorOrType[1]} card`, `${colorOrType[2]} card`].map((x) => plainFilter(x));
    return subs.every((x) => x) ? { kind: "card", anyOf: subs as TargetSpec[], text: p } : null;
  }
  if (p === "card that shares a color with a legendary creature you control") return { kind: "card", colorOfYourLegend: true, text: p };
  // "If it's a land or double-faced card" (Invasion of Pyrulea, CR 712.1).
  if (p === "double-faced card") return { kind: "card", doubleFaced: true, text: p };
  const dfc = /^(.+) or double-faced card$/.exec(p);
  if (dfc) {
    const first = parseSearchFilter(`${dfc[1]} card`);
    return first ? { kind: "card", anyOf: [first, { kind: "card", doubleFaced: true, text: "double-faced card" }], text: p } : null;
  }
  if (/^card named ~$/.test(p)) return { kind: "card", named: "~", text: "card named ~" };
  // "Dragon cards not named ~" (Tiamat): any other name.
  const notSelf = /^(.+ card) not named ~$/.exec(p);
  if (notSelf) {
    const head = parseSearchFilter(notSelf[1]!);
    return head ? { ...head, notNamed: "~", text: p } : null;
  }
  // "A card named Ajani, Valiant Protector": that card's name, as printed.
  const named = /^card named ([A-Z][^~]*)$/.exec(phrase);
  if (named && /\b(?:or|and\/or)\b/.test(named[1]!)) {
    // "A card named Festering Newt or Bubbling Cauldron", "a card named Ionize or a card named Electrolyze", "a card named
    // Halvar, God of Battle or an Equipment card": either one. A name may itself hold "or" (Fight or Flight, Truth or
    // Tale: one word each side, as every such name is), so "A or B" splits only between names of two or more words.
    const or = /^(.+?) or (?:a card named (.+)|(an? .+ card))$/.exec(named[1]!) ?? /^(.+ .+) or ([A-Z].* .+)$/.exec(named[1]!);
    if (!or || / or |\band\/or\b/.test(or[1]!) || (or[2] && / or |\band\/or\b/.test(or[2]))) return null;
    const other = or[2] ? { kind: "card" as const, named: or[2], text: `card named ${or[2]}` } : parseSearchFilter(or[3]!.replace(/^an? /, ""));
    if (!other) return null;
    return { kind: "card", anyOf: [{ kind: "card", named: or[1]!, text: `card named ${or[1]}` }, other], text: p };
  }
  if (named) return { kind: "card", named: named[1]!, text: `card named ${named[1]}` };
  // "A basic Forest, Plains, or Island card" (Brokers Hideout): a basic land card with any one of those types.
  const basics = /^basic ([A-Z][a-z]+(?:, [A-Z][a-z]+)*,? or [A-Z][a-z]+) card$/.exec(p);
  if (basics) {
    const subs = basics[1]!.split(/,? or |, /).map((t) => parseSearchFilter(`basic ${t} card`));
    if (subs.some((x) => !x)) return null;
    return { kind: "card", anyOf: subs as TargetSpec[], text: p };
  }
  // "Basic land cards and/or Town cards" (Reach the Horizon): cards of either kind, in any mix.
  const andOr = /^(.+ card) and\/or (.+ card)$/.exec(p);
  if (andOr) {
    const subs = [andOr[1]!, andOr[2]!].map((x) => parseSearchFilter(x));
    if (subs.some((x) => !x)) return null;
    return { kind: "card", anyOf: subs as TargetSpec[], text: p };
  }
  // "An artifact card with a mana ability" (Moonsilver Key): an activated or triggered one (CR 605.1).
  const manaAb = /^(.+ card) with a mana ability$/.exec(p);
  if (manaAb) {
    const head = parseSearchFilter(manaAb[1]!);
    return head ? { ...head, manaAbility: true, text: p } : null;
  }
  // "Spells with flash or flying" (Errant and Giada, as cards): a card with either keyword.
  // "A creature card with deathtouch, hexproof, reach, or trample" (Mwonvuli Beast Tracker): any one of them, printed on
  // the card (rulings).
  const manyKw = /^(.*?card) with ((?:[a-z]+, )+)or ([a-z]+)$/.exec(p);
  const twoKw = manyKw ? [manyKw[0], manyKw[1], ...manyKw[2]!.split(", ").filter(Boolean), manyKw[3]] : /^(.*?card) with ([a-z]+) or ([a-z]+)$/.exec(p);
  if (twoKw) {
    const subs = twoKw.slice(2).map((k) => parseSearchFilter(`${twoKw[1]} with ${k}`));
    if (subs.some((x) => !x?.keywords?.length)) return null;
    return { kind: "card", anyOf: subs as TargetSpec[], text: p };
  }
  // "A snow permanent card, a legendary card, or a Saga card" (Search for Glory): a card that fits any one of them.
  const parts = p.split(/,? or an? |, an? /);
  // "An instant card or a card with flash" (Waterlogged Teachings). "A basic Plains card or a creature card with mana value
  // 1 or less" (Starfield Shepherd).
  if (parts.length > 1 && parts.every((x) => / card$|^card with [a-z]+$| card with a mana ability$| card with mana value \d+ or (?:less|greater)$|^card with \{X\} in its mana cost$/.test(x))) {
    const subs = parts.map((x) => parseSearchFilter(x));
    if (subs.some((x) => !x)) return null;
    return { kind: "card", anyOf: subs as TargetSpec[], text: p.replace(/\bcard\b(?=,| or )/g, "card") };
  }
  // "A land card with a basic land type" (Boseiju, Who Endures): a Plains, Island, Swamp, Mountain or Forest card (CR 205.3i).
  // Slimefoot's Survey: "up to two land cards that each have a basic land type": the same for each card (rulings: a
  // nonbasic one too, two of one type or of different ones).
  if (/^land card (?:with a basic land type|that each have a basic land type)$/.test(p)) return { kind: "card", types: ["Land"], subtypes: [...BASIC_TYPES], text: "land card with a basic land type" };
  // "A card that's exactly two colors" (Guildpact Paragon, CR 105.2).
  const two = /^(.*?)card that(?:'s| is| (isn't|is not)) exactly two colors$/.exec(p);
  if (two) {
    const head = parseSearchFilter(`${two[1]}card`);
    return head === null ? null : { ...(head ?? { kind: "card" }), colorCount: two[2] ? "notTwo" : "two", text: p };
  }
  const plain = plainFilter(p);
  if (plain) return plain;
  // "An instant, sorcery, or Dragon card" (Dragonologist): a card of any one of those card types or that creature type.
  // "A Knight, Aura, Equipment, or legendary artifact card" (Acclaimed Contender): the last one with a supertype.
  const mixed = /^((?:[A-Za-z]+, )+[A-Za-z]+),? or ((?:legendary )?[A-Za-z]+) card$/.exec(p);
  if (mixed && /[A-Z]/.test(p)) {
    const subs = [...mixed[1]!.split(", "), mixed[2]!].map((w) => plainFilter(`${w} card`));
    if (subs.some((x) => !x)) return null;
    return { kind: "card", anyOf: subs as TargetSpec[], text: p };
  }
  // "An artifact creature card or Vehicle card" (Szarekh), "a Hero or enchantment card" (Rick Jones): either one.
  // "An artifact or Dragon card" (Magda, Brazen Outlaw).
  // "A Bird or basic land card" (Sazh Katzroy).
  const either = /^(.+ card) or (.+ card)$/.exec(p) ?? /^([A-Z][a-z]+) or ((?:basic )?[a-z]+ card)$/.exec(p) ?? /^([a-z]+) or ([A-Z][a-z]+ card)$/.exec(p);
  if (either && !/,| or /.test(either[1]!) && !/,| or /.test(either[2]!)) {
    const subs = [either[1]!.replace(/^([A-Za-z]+)$/, "$1 card"), either[2]!].map((x) => plainFilter(x));
    if (subs.some((x) => !x)) return null;
    return { kind: "card", anyOf: subs as TargetSpec[], text: p };
  }
  return null;
}

function plainFilter(p: string): TargetSpec | null {
  // Only plain card qualities: "with different names", "with mana value X or less" and the like aren't modeled. "With
  // mana value 2" (Tribute Mage) is exactly that.
  if (/ with (different|the same)| X /.test(p) || !/card( with (mana value|power|toughness) \d+(?: or (less|greater))?| with an? (even|odd) mana value| with mana cost \{\d+\}(?: or \{\d+\})?| with (?!the |a |an |different )[a-z]+(?: strike)?)?$/i.test(p)) return null;
  const spec = parseTargetPhrase(`${p} from your graveyard`);
  if (!spec || spec.kind !== "card") return null;
  const { owner: _owner, ...rest } = spec;
  return { ...rest, text: p };
}

/**
 * "A card name", "any card name", "a nonland card name", "a card name other than a basic land card name" (CR 201.4):
 * the cards whose names may be chosen, by their Oracle characteristics (201.4a); `names` undefined for any card.
 * Null when it isn't understood.
 */
export function parseCardNameChoice(phrase: string): { names?: TargetSpec } | null {
  const m = /^(?:an?|any) ((?:[a-z]+(?:, | ))*?)card name( other than a basic land card name)?$/.exec(phrase);
  if (!m) return null;
  const words = m[1]!.trim();
  const filter = words ? parseSearchFilter(`${words} card`) : undefined;
  if (filter === null || (words && !filter)) return null;
  const names: TargetSpec | undefined = m[2] ? { ...(filter ?? { kind: "card" }), notSupertypes: [...(filter?.notSupertypes ?? []), "Basic"], text: `${words ? `${words} ` : ""}card other than a basic land card` } : filter;
  return names ? { names } : {};
}
