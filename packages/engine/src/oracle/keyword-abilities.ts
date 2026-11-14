import type { CopyExcept } from "../copies";
import type { AbilityBody, Amount, CounterKind, ActivatedAbility, TriggeredAbility, StaticAbility, Effect, ObjRef, AdditionalCost, StaticCondition, TargetSpec, TokenSpec, PayCost, CastFromGraveyard, CompiledCard, EntersOption } from "../abilities";
import { CREATURE_TYPES, subtypeSet } from "../keywords";
import { parseManaCost } from "../mana";
import type { CardDef, FaceDownKind } from "../types";
import { NUM, num, keywordOf, plainMana, xMana, sacrificeSelf, pumpSelf, BASIC_TYPES, capital, singular, singularWord } from "./words";
import { parseBody, parsePayCost } from "./body";
import { parseSearchFilter } from "./search";
import { parseTargetPhrase, pickFilter, PLANESWALKER_TYPES } from "./targets";
import { parseStaticCondition } from "./statics";
import { parseCount } from "./counts";

/** "sacrifice a creature", "discard a card", "pay 3 life", "exile a creature card from your graveyard". */
/**
 * Keywords about casting from a graveyard and what happens to the spell after: flashback
 * (CR 702.34), jump-start (702.133), retrace (702.81), escape (702.138), buyback (702.27),
 * rebound (702.88), unearth (702.84). Null if the line is none of these.
 */
export function parseGraveyardKeyword(
  line: string,
  d: CardDef,
): { fromGraveyard: CastFromGraveyard } | { fromExile: true; fromGraveyard?: CastFromGraveyard } | { buyback: string; costs?: AdditionalCost[]; text?: string } | { rebound: true } | { escapesWith: number } | { unearth: ActivatedAbility } | "fail" | null {
  const isSpell = d.types.includes("Instant") || d.types.includes("Sorcery");
  let m: RegExpExecArray | null;
  // The Visions cycle: "Flashback {8}{W}{W}. This spell costs {X} less to cast this way, where X is ...": less generic
  // mana only when it's cast with its own flashback, counted as the cost is determined (CR 601.2f, 118.7a).
  if ((m = /^(Flashback \{[^.]+?)\. ~ costs \{X\} less to cast this way, where X is (.+?)\.?$/.exec(line))) {
    const r = parseGraveyardKeyword(m[1]!, d);
    const less = parseCount(m[2]!, null);
    const way = r && r !== "fail" && "fromGraveyard" in r ? r.fromGraveyard : undefined;
    if (way?.kind !== "flashback" || !less || !("count" in less)) return "fail";
    return { fromGraveyard: { ...way, less } };
  }
  // Viral Spawning: "Corrupted — As long as an opponent has three or more poison counters and ~ is in your graveyard, it
  // has flashback {2}{G}.": flashback (CR 702.34a) it has only while the condition holds, so it can be cast that way only
  // then (checked as it's cast, CR 601.2), and exiled as a flashback spell however the condition changes after.
  if ((m = /^As long as (.+?) and ~ is in your graveyard, it has flashback (.+?)\.?$/.exec(line))) {
    const self: StaticAbility = { affects: { kind: "self" }, mods: [], text: line };
    const cond = parseStaticCondition(m[1]!, self);
    const r = parseGraveyardKeyword(`Flashback ${m[2]}`, d);
    const way = r && r !== "fail" && "fromGraveyard" in r && !("fromExile" in r) ? r.fromGraveyard : undefined;
    if (!cond || way?.kind !== "flashback" || way.if) return "fail";
    return { fromGraveyard: { ...way, if: cond } };
  }
  // Not "Flashback costs you pay cost {2} less" (Catalyst Stone), a static ability about flashback.
  if ((m = /^(Flashback|Escape)(?: (?!costs )|—)(.+?)\.?$/.exec(line))) {
    const kind = m[1] === "Flashback" ? "flashback" : "escape";
    if (kind === "flashback" && !isSpell) return "fail";
    const parts = m[2]!.split(", ");
    const mana = /^(\{[^}]+\})+$/.test(parts[0]!) ? parts.shift()! : undefined;
    // "Flashback {X}{R}{R}{R}" (Devil's Play): X chosen as it's cast from the graveyard, on a card with X in its mana cost
    // (CR 107.3a, 601.2b).
    if (mana && (!parseManaCost(mana).supported || (parseManaCost(mana).hasX && !(kind === "flashback" && parseManaCost(d.manaCost).hasX)))) return "fail";
    const costs: AdditionalCost[] = [];
    for (const part of parts) {
      // Escape's "Exile two other cards from your graveyard": other than this card, which is on the stack by then.
      // "Flashback—{R}{R}, Discard X cards" (Conflagrate): the spell's X (CR 107.3a).
      const c = parseAdditionalCost(part.replace(/^Exile (\w+) other /, "exile $1 "), true);
      if (!c) return "fail";
      costs.push(c);
    }
    return { fromGraveyard: { kind, ...(mana ? { mana } : {}), costs, exile: kind === "flashback" } };
  }
  // "You may cast this card from your graveyard" (Skaab Ruinator), "... as long as you control a Zombie" (Gravecrawler),
  // "... by discarding a card in addition to paying its other costs" (Dragon Man): a permission to cast it from there,
  // paying its mana cost (CR 601.2, 118.9 doesn't apply: it's not an alternative cost).
  // "You may cast ~ from exile" (Misthollow Griffin), "... from your graveyard or from exile" (Squee, the Immortal): its
  // owner may cast it from exile, paying its mana cost and following the normal timing rules (rulings).
  if (/^You may cast (?:~|this card) from exile\.?$/.test(line)) return { fromExile: true };
  // "You may cast this card from your graveyard using its warp ability" (Timeline Culler): a permission to cast it from
  // there only for its warp cost (CR 702.185a), so it's exiled at the next end step and may be cast from exile later.
  // Detective's Phoenix: "You may cast this card from your graveyard using its bestow ability": the same, for its bestow
  // cost (CR 702.103a); it's an Aura spell then, and a creature again if its target is illegal or it becomes unattached
  // (CR 702.103e, f).
  if (/^You may cast (?:~|this card) from your graveyard using its bestow ability\.?$/.test(line)) return /^Bestow—/m.test(d.oracleText) ? { fromGraveyard: { kind: "permission", costs: [], exile: false, alt: "bestow" } } : "fail";
  if (/^You may cast (?:~|this card) from your graveyard using its warp ability\.?$/.test(line)) return /^Warp—/m.test(d.oracleText) ? { fromGraveyard: { kind: "permission", costs: [], exile: false, alt: "warp" } } : "fail";
  // "You may cast this card from your graveyard using its blitz ability" (Tenacious Underdog): the same, for its blitz cost
  // (CR 702.152a); a blitzed creature is sacrificed at the next end step, so it may be cast this way again.
  // "You may cast this card from your graveyard using its mutate ability" (Brokkos, Apex of Forever): only for its mutate
  // cost (rulings), at its normal timing, merging with a target non-Human creature you own (CR 702.140a).
  if (/^You may cast (?:~|this card) from your graveyard using its mutate ability\.?$/.test(line)) return /^Mutate \{/m.test(d.oracleText) ? { fromGraveyard: { kind: "permission", costs: [], exile: false, alt: "mutate" } } : "fail";
  if (/^You may cast (?:~|this card) from your graveyard using its blitz ability\.?$/.test(line)) return /^Blitz[— ]/m.test(d.oracleText) ? { fromGraveyard: { kind: "permission", costs: [], exile: false, alt: "blitz" } } : "fail";
  // Undead Sprinter: "You may cast ~ from your graveyard if a non-Zombie creature died this turn. If you do, ~ enters with a
  // +1/+1 counter on it.": the spell cast with this permission, not another way (rulings on Worldheart Phoenix), enters
  // with them (CR 614.1c).
  if ((m = new RegExp(`^(You may cast (?:~|this card) from your graveyard[^.]*?)\\. If you do, (?:~|it) enters with ${NUM} ([+-]1/[+-]1|finality) counters? on it\\.?$`).exec(line))) {
    const r = parseGraveyardKeyword(m[1]!, d);
    const way = r && r !== "fail" && "fromGraveyard" in r && !("fromExile" in r) ? r.fromGraveyard : undefined;
    if (!way || way.kind !== "permission" || way.entersWith) return "fail";
    return { fromGraveyard: { ...way, entersWith: { counter: m[3]! as CounterKind, n: num(m[2]!) } } };
  }
  // Worldheart Phoenix: "You may cast ~ from your graveyard by paying {W}{U}{B}{R}{G} rather than paying its mana cost": a
  // permission with an alternative cost (CR 118.9), so at the usual timing (rulings).
  if ((m = /^You may cast (?:~|this card) from your graveyard by paying ((?:\{[WUBRGC\d]\})+) rather than paying its mana cost\.?$/.exec(line)))
    return parseManaCost(m[1]!).supported ? { fromGraveyard: { kind: "permission", mana: m[1]!, costs: [], exile: false } } : "fail";
  // Glimpse the Cosmos: "As long as you control a Giant, you may cast ~ from your graveyard by paying {U} rather than paying
  // its mana cost. If you cast ~ this way and it would be put into your graveyard, exile it instead.": the same permission
  // only while the condition holds as it's cast (CR 601.2), at the usual timing (rulings), and a replacement for its going
  // to the graveyard only (CR 614.1a), not flashback's for its leaving the stack. Cast with another permission, neither
  // applies (rulings).
  if ((m = /^As long as (.+?), you may cast (?:~|this card) from your graveyard by paying ((?:\{[WUBRGC\d]\})+) rather than paying its mana cost\. If you cast (?:~|this card) this way and it would be put into your graveyard, exile it instead\.?$/.exec(line))) {
    const cond = parseStaticCondition(m[1]!, { affects: { kind: "self" }, mods: [], text: line });
    return cond && parseManaCost(m[2]!).supported ? { fromGraveyard: { kind: "permission", mana: m[2]!, costs: [], exile: false, if: cond, exileIfToGraveyard: true } } : "fail";
  }
  // Scourge of Nel Toth: "You may cast this creature from your graveyard by paying {B}{B} and sacrificing two creatures
  // rather than paying its mana cost": the same, the sacrifice part of that cost (CR 118.9, 601.2h), at the usual timing.
  // Squee, Dubious Monarch: "... by paying {3}{R} and exiling four other cards from your graveyard ...": the same, the
  // cards exiled as it's cast from there (not escape, rulings).
  if ((m = /^You may cast (?:~|this card|this creature) from your graveyard by paying ((?:\{[WUBRGC\d]\})+) and (sacrificing|exiling) ([^.]+?) rather than paying its mana cost\.?$/.exec(line))) {
    const sac = parseAdditionalCost(`${m[2] === "exiling" ? "Exile" : "Sacrifice"} ${m[3]}`, true);
    return parseManaCost(m[1]!).supported && sac ? { fromGraveyard: { kind: "permission", mana: m[1]!, costs: [sac], exile: false } } : "fail";
  }
  // Risen Executioner: "You may cast ~ from your graveyard if you pay {1} more to cast it for each other creature card in
  // your graveyard": a permission with a cost increase (CR 601.2f), at the usual timing (rulings).
  if ((m = /^You may cast (?:~|this creature) from your graveyard if you pay \{1\} more to cast it for each (.+)\.$/.exec(line))) {
    const more = parseCount(m[1]!, null, true);
    return more ? { fromGraveyard: { kind: "permission", costs: [], exile: false, more } } : "fail";
  }
  if (/^You may cast (?:~|this card) from your graveyard or from exile\.?$/.test(line)) return { fromExile: true, fromGraveyard: { kind: "permission", costs: [], exile: false } };
  if ((m = /^You may cast (?:~|this card|this creature) from your graveyard(?: (?:as long as|if) (.+?))?(?: by (.+?) in addition to paying its other costs)?$/.exec(line.replace(/\.$/, "")))) {
    const self: StaticAbility = { affects: { kind: "self" }, mods: [], text: line };
    const cond = m[1] ? parseStaticCondition(m[1], self) : undefined;
    if (cond === null) return "fail";
    const costs: AdditionalCost[] = [];
    // "Paying 3 life and discarding a card": the gerunds as the costs they name.
    const gerund: Record<string, string> = { discarding: "Discard", paying: "Pay", sacrificing: "Sacrifice", exiling: "Exile", tapping: "Tap", removing: "Remove" };
    for (const part of m[2] ? m[2].split(/,? and (?=discarding|paying|sacrificing|exiling|tapping|removing)|, (?=discarding|paying|sacrificing|exiling|tapping|removing)/) : []) {
      const w = /^(\w+) (.+)$/.exec(part);
      const c = w && gerund[w[1]!] ? parseAdditionalCost(`${gerund[w[1]!]} ${w[2]}`, true) : null;
      if (!c) return "fail";
      costs.push(c);
    }
    return { fromGraveyard: { kind: "permission", costs, exile: false, ...(cond ? { if: cond } : {}) } };
  }
  // Aftermath (CR 702.127a): "You may cast this half of this split card from your graveyard", "This half can't be cast
  // from any zone other than a graveyard", and exiled if it would leave the stack after being cast from a graveyard.
  if (/^Aftermath$/.test(line)) return isSpell && d.layout === "split" ? { fromGraveyard: { kind: "aftermath", costs: [], exile: true } } : "fail";
  // Disturb (CR 702.146a): "You may cast this card transformed from your graveyard by paying [cost] rather than its mana
  // cost", on a double-faced card's front face.
  if ((m = /^Disturb ((?:\{[^}]+\})+)$/.exec(line))) {
    if (d.layout !== "transform" || (d.faceOf && d.faceOf.face !== 0) || !parseManaCost(m[1]!).supported || parseManaCost(m[1]!).hasX) return "fail";
    return { fromGraveyard: { kind: "disturb", mana: m[1]!, costs: [], exile: false, face: 1 } };
  }
  if (/^Jump-start$/.test(line)) return isSpell ? { fromGraveyard: { kind: "jumpStart", costs: [{ kind: "discard", n: 1 }], exile: true } } : "fail";
  if (/^Retrace$/.test(line)) return { fromGraveyard: { kind: "retrace", costs: [{ kind: "discard", n: 1, filter: { kind: "card", types: ["Land"], text: "land card" } }], exile: false } };
  // Mayhem (CR 702.187b): "As long as you discarded this card this turn, you may cast it from your graveyard by paying
  // [cost] rather than paying its mana cost." Mayhem without a cost (a land you may play, 702.187c) isn't supported.
  if ((m = /^Mayhem ((?:\{[^}]+\})+)$/.exec(line))) {
    if (!parseManaCost(m[1]!).supported || parseManaCost(m[1]!).hasX) return "fail";
    return { fromGraveyard: { kind: "mayhem", mana: m[1]!, costs: [], exile: false } };
  }
  // Harmonize (CR 702.180a): "You may cast this card from your graveyard by paying [cost] and tapping up to one untapped
  // creature you control rather than paying this spell's mana cost", less that creature's power; then it's exiled. An
  // {X} in it only when the mana cost has one too (Nature's Rhythm, Zenith Festival).
  if ((m = /^Harmonize ((?:\{[^}]+\})+)$/.exec(line))) {
    const cost = parseManaCost(m[1]!);
    if (!isSpell || !cost.supported || (cost.hasX && !parseManaCost(d.manaCost).hasX)) return "fail";
    return { fromGraveyard: { kind: "harmonize", mana: m[1]!, costs: [], exile: true } };
  }
  if (/^Rebound$/.test(line)) return isSpell ? { rebound: true } : "fail";
  if ((m = /^Buyback ((?:\{[^}]+\})+)$/.exec(line))) return isSpell && parseManaCost(m[1]!).supported && !parseManaCost(m[1]!).hasX ? { buyback: m[1]! } : "fail";
  // "Buyback—Sacrifice a land.", "Buyback—Pay 3 life, Discard a card at random." (CR 702.27a): costs that aren't mana.
  if ((m = /^Buyback—(.+?)\.?$/.exec(line))) {
    if (!isSpell) return "fail";
    const costs = m[1]!.split(", ").map((part) => parseAdditionalCost(part));
    return costs.every((c) => c) ? { buyback: "", costs: costs as AdditionalCost[], text: m[1]!.replace(/^./, (c) => c.toLowerCase()).replace(/, (\w)/g, (_, c: string) => ` and ${c.toLowerCase()}`) } : "fail";
  }
  if ((m = new RegExp(`^~ escapes with ${NUM} \\+1/\\+1 counters? on it\\.$`).exec(line))) return { escapesWith: num(m[1]!) };
  // Salvation Colossus: "Unearth—Pay eight {E}": the cost is energy alone (CR 107.14, 702.84a).
  if ((m = new RegExp(`^Unearth—Pay ${NUM} \\{E\\}\\.?$`).exec(line))) {
    return {
      unearth: {
        manaCost: "",
        energyCost: num(m[1]!),
        tap: false,
        sacrificeSelf: false,
        sorcerySpeed: true,
        zone: "graveyard",
        body: { targets: [], effects: [{ type: "unearth" }], text: "Return ~ from your graveyard to the battlefield. It gains haste. Exile it at the beginning of the next end step or if it would leave the battlefield." },
        text: `Unearth—Pay ${m[1]} {E}`,
      },
    };
  }
  if ((m = /^Unearth ((?:\{[^}]+\})+)$/.exec(line))) {
    if (!parseManaCost(m[1]!).supported || parseManaCost(m[1]!).hasX) return "fail";
    return {
      unearth: {
        manaCost: m[1]!,
        tap: false,
        sacrificeSelf: false,
        sorcerySpeed: true,
        zone: "graveyard",
        body: { targets: [], effects: [{ type: "unearth" }], text: "Return ~ from your graveyard to the battlefield. It gains haste. Exile it at the beginning of the next end step or if it would leave the battlefield." },
        text: `Unearth ${m[1]}`,
      },
    };
  }
  return null;
}

/**
 * Keywords about costs: echo (CR 702.30), cumulative upkeep (702.24), evoke (702.74), dash (702.109),
 * delve (702.66), living weapon (702.92) and For Mirrodin! (702.163), scavenge (702.97), bestow (702.103), madness (702.35),
 * suspend (702.62), casualty (702.153), dredge (702.52), plot (702.170), blitz (702.152), warp (702.185).
 */
export function parseCostKeyword(
  line: string,
  d: CardDef,
): {
  alt?: NonNullable<CompiledCard["altCosts"]>[number];
  trigger?: TriggeredAbility;
  activated?: ActivatedAbility;
  delve?: true;
  assist?: true;
  faceDown?: { kind: FaceDownKind; cost: string; costs?: AdditionalCost[]; text?: string };
  madness?: string;
  madnessLife?: number;
  miracle?: string;
  suspend?: { n: number; cost: string; x?: true };
  plot?: string;
  foretell?: string;
  casualty?: number;
  casualtyX?: true;
  dredge?: number;
  impending?: number;
} | "fail" | null {
  let m: RegExpExecArray | null;
  // "You may pay {W}{U}{B}{R}{G} rather than pay ~'s mana cost" (Bringers), "You may pay {1} and return a basic land you
  // control to its owner's hand rather than pay ~'s mana cost" (Borderposts): an alternative cost (CR 118.9). The returned
  // land may be one just tapped for mana (rulings: mana abilities come before costs are paid, CR 601.2g-h).
  // "You may sacrifice two Mountains rather than pay ~'s mana cost" (Fireblast), "You may pay 1 life and exile a blue card
  // from your hand ..." (Force of Will), "If you control a Swamp, you may pay 4 life ..." (Snuff Out), "If four or more
  // creatures are attacking, you may pay {1}{W} ..." (Arrow Volley Trap): only while that's true, as it's cast (CR 601.2b).
  // "If an opponent controls an Island and you control a Mountain, you may cast ~ without paying its mana cost" (Mogg
  // Salvage): any opponent's Island, checked only as it's cast (rulings); its mana value doesn't change (CR 118.9c).
  // More Than Meets the Eye (CR 702.162a): "You may cast this card converted by paying [cost] rather than its mana cost",
  // its back face up on the stack (rulings), on a transforming double-faced card's front face.
  if ((m = /^More Than Meets the Eye ((?:\{[^}]+\})+)$/.exec(line)))
    return d.layout === "transform" && (d.faceOf?.face ?? 0) === 0 && plainMana(m[1]!) ? { alt: { kind: "convert", mana: m[1]! } } : "fail";
  // Qasali Ambusher: "If a creature is attacking you and you control a Forest and a Plains, you may cast ~ without paying its
  // mana cost and as though it had flash.": a creature attacking you, not a planeswalker of yours, and lands with both
  // subtypes, one land or two (rulings), checked as it's cast (CR 601.2b); the flash only for this cost (CR 601.3).
  if ((m = /^If (a creature is attacking you) and you control (an? [A-Z][a-z]+) and (an? [A-Z][a-z]+), you may cast ~ without paying its mana cost and as though it had flash\.$/.exec(line))) {
    const conds = [altCondition(m[1]!), altCondition(`you control ${m[2]}`), altCondition(`you control ${m[3]}`)];
    if (conds.some((c) => !c)) return "fail";
    return { alt: { kind: "alternative", mana: "", if: { kind: "allOf", conds: conds as StaticCondition[] }, text: "without paying its mana cost", flash: true } };
  }
  if ((m = /^If (.+), you may cast ~ without paying its mana cost\.?$/.exec(line) ?? /^If (~ is the first spell you've cast this game), you may cast it without paying its mana cost\.$/.exec(line))) {
    // Once Upon a Time: "If ~ is the first spell you've cast this game": none cast before it (rulings: its first chance is
    // the first player's upkeep), only as an alternative cost's condition, checked as it's cast.
    const cond = m[1] === "~ is the first spell you've cast this game" ? ({ kind: "noSpellsCastThisGame" } as const) : altCondition(m[1]!);
    return cond ? { alt: { kind: "alternative", mana: "", if: cond, text: "without paying its mana cost" } } : "fail";
  }
  // "If you control a Forest, rather than pay ~'s mana cost, you may have an opponent gain 3 life" (Invigorate), "...
  // have each other player gain 6 life" (Reverent Silence). A player who can't gain life can't be had gain it (CR 119.7).
  if ((m = /^If ([^,]+), rather than pay ~'s mana cost, you may have (an opponent|each other player) gain (\d+) life\.?$/.exec(line))) {
    const cond = altCondition(m[1]!);
    if (!cond) return "fail";
    const each = m[2] === "each other player";
    return { alt: { kind: "alternative", mana: "", costs: [{ kind: "giveLife", n: Number(m[3]), ...(each ? { each: true as const } : {}) }], if: cond, text: `have ${m[2]} gain ${m[3]} life` } };
  }
  // Asmoranomardicadaistinaculdacar: "As long as you've discarded a card this turn, you may pay {B/R} to cast ~" (it has no
  // mana cost, so only this way, CR 118.6): an alternative cost, only while that's true as it's cast (CR 601.2b).
  if ((m = /^As long as ([^,]+), you may pay ((?:\{[^}]+\})+) to cast ~\.$/.exec(line))) {
    const cond = altCondition(m[1]!);
    return cond && plainMana(m[2]!) ? { alt: { kind: "alternative", mana: m[2]!, if: cond } } : "fail";
  }
  // "You may pay {R}{G} rather than pay ~'s mana cost. Spend only mana produced by Treasures to cast it this way."
  // (Security Rhox): only mana a Treasure made can pay it (CR 106.3).
  if ((m = /^You may pay ((?:\{[^}]+\})+) rather than pay ~'s mana cost\. Spend only mana produced by Treasures to cast it this way\.$/.exec(line)))
    return plainMana(m[1]!) ? { alt: { kind: "alternative", mana: m[1]!, treasureOnly: true } } : "fail";
  if ((m = /^(?:(?:Raid — )?If ([^,]+), )?[Yy]ou may (.+?) rather than pay ~'s mana cost(?: if ([^,]+?))?\.?$/.exec(line))) {
    const when = m[1] ?? m[3];
    const cond = when ? altCondition(when) : undefined;
    if (cond === null) return "fail";
    let mana = "";
    const costs: AdditionalCost[] = [];
    // An X in it is the spell's (the Shoals' "a red card with mana value X", CR 107.3a).
    const allowX = /\{X\}/.test(d.manaCost);
    // One cost with "and" in it ("discard an Island card and another card"), or several joined by "and".
    const whole = parseAdditionalCost(m[2]!, allowX);
    for (const part of whole ? [] : m[2]!.split(" and ")) {
      const pay = /^pay ((?:\{[^}]+\})+)$/.exec(part);
      if (pay && !mana && !costs.length) {
        if (!plainMana(pay[1]!)) return "fail";
        mana = pay[1]!;
        continue;
      }
      const c = parseAdditionalCost(part, allowX);
      if (!c) return "fail";
      costs.push(c);
    }
    if (whole) costs.push(whole);
    const text = m[2]!.replace(/^pay (?:\{[^}]+\})+(?: and )?/, "");
    return { alt: { kind: "alternative", mana, ...(costs.length ? { costs } : {}), ...(cond ? { if: cond } : {}), ...(text ? { text } : {}) } };
  }
  // Mutate (CR 702.140a): cast for it, it's a mutating creature spell targeting a non-Human creature with the same owner
  // (see mutatingDef).
  if ((m = /^Mutate ((?:\{[^}]+\})+)$/.exec(line))) return plainMana(m[1]!) && d.types.includes("Creature") ? { alt: { kind: "mutate", mana: m[1]! } } : "fail";
  // Bestow (CR 702.103a). (Cast bestowed, the card is an Aura: see bestowedDef.)
  // A bestow cost with {X} (Nyxborn Hydra's {X}{G}{G}): X is announced and paid as for the mana cost (CR 107.3a), only when
  // the card's own mana cost has the X its text uses.
  // Detective's Phoenix: "Bestow—{R}, Collect evidence 6.": the bestow cost is that mana and the evidence (CR 702.103a,
  // 701.59a), all of it paid to cast it bestowed (CR 601.2f, h).
  if ((m = /^Bestow—((?:\{[^}]+\})+), Collect evidence (\d+)\.?$/.exec(line))) return plainMana(m[1]!) ? { alt: { kind: "bestow", mana: m[1]!, costs: [{ kind: "collectEvidence", n: Number(m[2]) }] } } : "fail";
  if ((m = /^Bestow(?: |—)(.+?)\.?$/.exec(line))) return /^(\{[^}]+\})+$/.test(m[1]!) && (plainMana(m[1]!) || (plainMana(m[1]!.replace(/\{X\}/g, "")) && parseManaCost(m[1]!).supported && /\{X\}/.test(d.manaCost))) ? { alt: { kind: "bestow", mana: m[1]! } } : "fail";
  // Madness (CR 702.35a).
  // Miracle [cost] (CR 702.94a): a mana cost, without an X the mana cost doesn't have.
  if ((m = /^Miracle ((?:\{[^}]+\})+)$/.exec(line))) return parseManaCost(m[1]!).supported && (!/\{X\}/.test(m[1]!) || /\{X\}/.test(d.manaCost)) ? { miracle: m[1]! } : "fail";
  if (/^Miracle\b/.test(line)) return "fail";
  if ((m = /^Madness(?: |—)(.+?)\.?$/.exec(line))) {
    // "Madness—Pay six {C}" (Emrakul, the World Anew): that many {C}, a mana cost (CR 107.4c, 202.1).
    const pay = new RegExp(`^Pay ${NUM} (\\{C\\})$`).exec(m[1]!);
    // "Madness—{2}{B}, Pay 8 life" (Shadowgrange Archfiend): the mana and the life, both paid as it's cast.
    const life = /^((?:\{[^}]+\})+), Pay (\d+) life$/.exec(m[1]!);
    const cost = pay ? pay[2]!.repeat(num(pay[1]!)) : life ? life[1]! : m[1]!;
    // "Madness {X}{B}{B}" (From Under the Floorboards): X is announced as it's cast for its madness cost (CR 107.3a).
    return /^(\{[^}]+\})+$/.test(cost) && (plainMana(cost) || (xMana(cost) && !life)) ? { madness: cost, ...(life ? { madnessLife: Number(life[2]) } : {}) } : "fail";
  }
  // Suspend N—[cost] (CR 702.62a).
  if ((m = /^Suspend (\d+)—((?:\{[^}]+\})+)$/.exec(line))) return plainMana(m[2]!) ? { suspend: { n: Number(m[1]), cost: m[2]! } } : "fail";
  // "Suspend X—{X}{3}{U}. X can't be 0." (Aeon Chronicler): X time counters, the X paid in the suspend cost (CR 107.3).
  if ((m = /^Suspend X—(\{X\}(?:\{[^}X]+\})+)\. X can't be 0\.$/.exec(line))) return plainMana(m[1]!.replace("{X}", "")) ? { suspend: { n: 0, cost: m[1]!, x: true } } : "fail";
  if (/^Suspend\b/.test(line)) return "fail";
  // Casualty N (CR 702.153a): an optional additional cost, and "when you cast this spell, if a casualty cost was paid
  // for it, copy it. If the spell has any targets, you may choose new targets for the copy."
  if ((m = /^Casualty (\d+)$/.exec(line))) {
    return {
      casualty: Number(m[1]),
      trigger: { event: "selfCast", ifCasualty: true, body: { targets: [], effects: [{ type: "copySpell", spell: "cause", n: 1, newTargets: true }], text: "Casualty: copy ~. You may choose new targets for the copy." } },
    };
  }
  // Ob Nixilis, the Adversary: "Casualty X. The copy isn't legendary and has starting loyalty X.": X chosen as it's cast
  // (CR 601.2b, rulings), a creature with power X or greater sacrificed (CR 702.153a); the copy's exceptions are copiable
  // values (CR 707.9b): not legendary, and it enters with X loyalty counters (CR 306.5b). It becomes a token as it
  // resolves (CR 608.3f).
  if (/^Casualty X\. The copy isn't legendary and has starting loyalty X\.$/.test(line) && d.types.includes("Planeswalker")) {
    return {
      casualty: 0,
      casualtyX: true,
      trigger: { event: "selfCast", ifCasualty: true, body: { targets: [], effects: [{ type: "copySpell", spell: "cause", n: 1, newTargets: true, except: { notLegendary: true }, casualtyLoyalty: true }], text: "Casualty X: copy ~. The copy isn't legendary and has starting loyalty X." } },
    };
  }
  if (/^Casualty\b/.test(line)) return "fail";
  // Dredge N (CR 702.52a).
  if ((m = /^Dredge (\d+)$/.exec(line))) return { dredge: Number(m[1]) };
  // Morph, megamorph, disguise (CR 702.37, 702.168).
  // "Morph—Pay 5 life.", "Morph—Reveal a white card in your hand.", "Morph—Return two Islands you control to their owner's
  // hand.": a morph cost that isn't mana (CR 702.37a, 118.8), paid as it's turned face up (702.37e).
  if ((m = /^Morph—([A-Z][^{}]+?)\.?$/.exec(line))) {
    const text = m[1]!.replace(/^./, (c) => c.toLowerCase());
    const cost = parseAdditionalCost(text.replace(/ in your hand$/, " from your hand"));
    if (!cost || !["payLife", "discard", "reveal", "sacrifice", "returnToHand"].includes(cost.kind) || ("x" in cost && cost.x) || (cost.kind === "discard" && cost.random) || (cost.kind === "reveal" && cost.orControl)) return "fail";
    return { faceDown: { kind: "morph", cost: "", costs: [cost], text } };
  }
  if ((m = /^(Morph|Megamorph|Disguise)(?: |—)(.+?)\.?$/.exec(line))) {
    const cost = m[2]!;
    // "Disguise {X}{3}{W}", "Morph {X}{X}{R}": X chosen as it's turned face up (CR 107.3d), for its own abilities (702.37f, 702.168e).
    const withX = parseManaCost(cost).supported && parseManaCost(cost).hasX;
    if (!/^(\{[^}]+\})+$/.test(cost) || !(plainMana(cost) || withX)) return "fail";
    return { faceDown: { kind: m[1]!.toLowerCase() as FaceDownKind, cost } };
  }
  if ((m = /^Echo(?: |—)(.+?)\.?$/.exec(line))) {
    const cost = m[1]!;
    // "Echo—Discard a card.", "Echo—Sacrifice two lands." (CR 702.30a, 118.8): "sacrifice it unless you discard a card",
    // a choice made as the trigger resolves; with nothing to pay it with, it's sacrificed.
    if (!/\{/.test(cost) && /^[A-Z]/.test(cost)) {
      const keep = parseBody(`Sacrifice ~ unless you ${cost.replace(/^./, (c) => c.toLowerCase())}.`, { selfIt: true });
      const may = keep?.effects.length === 1 && !keep.targets.length ? keep.effects[0] : undefined;
      if (may?.type !== "may" || may.otherwise?.length !== 1 || may.otherwise[0] !== sacrificeSelf) return "fail";
      return { trigger: { event: "yourUpkeep", ifEcho: true, body: { targets: [], effects: [{ ...may, echo: true, text: `Pay echo (${cost.replace(/^./, (c) => c.toLowerCase())}) to keep ~` }], text: `Echo—${cost}: at the beginning of your upkeep, if ~ came under your control since the beginning of your last upkeep, sacrifice it unless you ${cost.replace(/^./, (c) => c.toLowerCase())}.` } } };
    }
    if (!/^(\{[^}]+\})+$/.test(cost) || !plainMana(cost)) return "fail";
    const text = `Echo ${cost}: at the beginning of your upkeep, if ~ came under your control since the beginning of your last upkeep, sacrifice it unless you pay ${cost}.`;
    return {
      trigger: {
        event: "yourUpkeep",
        ifEcho: true,
        // Paying it is what "When ~'s echo cost is paid" triggers on (Shah of Naar Isle).
        body: { targets: [], effects: [{ type: "may", effects: [{ type: "echoPaid" }], pay: { mana: cost }, otherwise: [sacrificeSelf], keep: true, echo: true, text: `Pay echo ${cost} to keep ~` }], text },
      },
    };
  }
  if ((m = /^Cumulative upkeep(?: |—)(.+?)\.?$/.exec(line))) {
    // "Cumulative upkeep {R} or {G}" (Earthen Goo): {R} or {G} for each age counter, chosen each time, which is a hybrid
    // {R/G} for each (CR 702.24a, 107.4e).
    // Aboroth: "Cumulative upkeep—Put a -1/-1 counter on ~": a -1/-1 counter for each age counter, which can always be
    // put (CR 702.24a, 118.3); a creature with no toughness left then dies (CR 704.5f).
    const counterCost = /^Cumulative upkeep—Put an? (-1\/-1|\+1\/\+1) counter on ~\.?$/.exec(line);
    if (counterCost) {
      const kind = counterCost[1]!;
      return {
        trigger: {
          event: "yourUpkeep",
          body: { targets: [], effects: [{ type: "cumulativeUpkeep", pay: {}, selfCounter: kind }], text: `Cumulative upkeep—put a ${kind} counter on ~: at the beginning of your upkeep, put an age counter on ~, then sacrifice it unless you put a ${kind} counter on it for each age counter on it.` },
        },
      };
    }
    // Karplusan Minotaur: "Cumulative upkeep—Flip a coin": a coin flipped for each age counter, all of them once begun (rulings),
    // each called, so won or lost (CR 705.2), which can always be done.
    if (/^Cumulative upkeep—Flip a coin\.?$/.test(line))
      return {
        trigger: {
          event: "yourUpkeep",
          body: { targets: [], effects: [{ type: "cumulativeUpkeep", pay: {}, flipCost: true }], text: "Cumulative upkeep—flip a coin: at the beginning of your upkeep, put an age counter on ~, then sacrifice it unless you flip a coin for each age counter on it." },
        },
      };
    // Psychic Vortex: "Cumulative upkeep—Draw a card": a card drawn for each age counter, which can always be done (an
    // empty library is a loss at the next state check, rulings), the draws replaced or not (rulings).
    if (/^Cumulative upkeep—Draw a card\.?$/.test(line))
      return {
        trigger: {
          event: "yourUpkeep",
          body: { targets: [], effects: [{ type: "cumulativeUpkeep", pay: {}, drawCost: true }], text: "Cumulative upkeep—draw a card: at the beginning of your upkeep, put an age counter on ~, then sacrifice it unless you draw a card for each age counter on it." },
        },
      };
    // Phyrexian Soulgorger: "Cumulative upkeep—Sacrifice a creature": a different creature for each age counter, ~ itself
    // one of them if you like, or ~ is sacrificed (rulings, CR 702.24a). Polar Kraken: "Sacrifice a land", the same with
    // lands.
    const sacCost = /^Cumulative upkeep—Sacrifice a (creature|land)\.?$/.exec(line);
    if (sacCost)
      return {
        trigger: {
          event: "yourUpkeep",
          body: { targets: [], effects: [{ type: "cumulativeUpkeep", pay: {}, sacrificeCost: { kind: "object", types: [sacCost[1] === "land" ? "Land" : "Creature"], notTypes: [], notColors: [], controller: "you", text: sacCost[1]! } }], text: `Cumulative upkeep—sacrifice a ${sacCost[1]}: at the beginning of your upkeep, put an age counter on ~, then sacrifice it unless you sacrifice a ${sacCost[1]} for each age counter on it.` },
        },
      };
    // Vexing Sphinx: "Cumulative upkeep—Discard a card": a card for each age counter, all of them or none (CR 702.24a,
    // 701.9b: with fewer cards in hand it can't be paid).
    if (/^Cumulative upkeep—Discard a card\.?$/.test(line))
      return {
        trigger: {
          event: "yourUpkeep",
          body: { targets: [], effects: [{ type: "cumulativeUpkeep", pay: {}, discardCost: true }], text: "Cumulative upkeep—discard a card: at the beginning of your upkeep, put an age counter on ~, then sacrifice it unless you discard a card for each age counter on it." },
        },
      };
    // Sheltering Ancient: "Cumulative upkeep—Put a +1/+1 counter on a creature an opponent controls": a creature an opponent
    // controls for each age counter, the same one or different ones, any opponents', untargeted (rulings).
    if (/^Cumulative upkeep—Put a \+1\/\+1 counter on a creature an opponent controls\.?$/.test(line))
      return {
        trigger: {
          event: "yourUpkeep",
          body: { targets: [], effects: [{ type: "cumulativeUpkeep", pay: {}, oppCreatureCounter: "+1/+1" }], text: "Cumulative upkeep—put a +1/+1 counter on a creature an opponent controls: at the beginning of your upkeep, put an age counter on ~, then sacrifice it unless you put a +1/+1 counter on a creature an opponent controls for each age counter on it." },
        },
      };
    // Herald of Leshrac (round 367): "Cumulative upkeep—Gain control of a land you don't control": a different land for each
    // age counter, chosen as it resolves, not targeted (rulings).
    if (/^Cumulative upkeep—Gain control of a land you don't control\.?$/.test(line))
      return {
        trigger: {
          event: "yourUpkeep",
          body: { targets: [], effects: [{ type: "cumulativeUpkeep", pay: {}, gainControlCost: { kind: "object", types: ["Land"], notTypes: [], notColors: [], controller: "opponent", text: "land you don't control" } }], text: "Cumulative upkeep—gain control of a land you don't control: at the beginning of your upkeep, put an age counter on ~, then sacrifice it unless you gain control of a different land you don't control for each age counter on it." },
        },
      };
    // Wall of Shards: "Cumulative upkeep—An opponent gains 1 life": an opponent chosen for each age counter, the same one or
    // different ones (rulings), each able to gain life (CR 119.7), then all of it paid at once or none (CR 702.24a).
    if (/^Cumulative upkeep—An opponent gains 1 life\.?$/.test(line))
      return {
        trigger: {
          event: "yourUpkeep",
          body: { targets: [], effects: [{ type: "cumulativeUpkeep", pay: {}, giveLife: 1 }], text: "Cumulative upkeep—an opponent gains 1 life: at the beginning of your upkeep, put an age counter on ~, then sacrifice it unless an opponent you choose gains 1 life for each age counter on it." },
        },
      };
    // Jötun Grunt: "Cumulative upkeep—Put two cards from a single graveyard on the bottom of their owner's library": two
    // cards for each age counter, each two from one graveyard, a different graveyard for each counter allowed (rulings);
    // all of it paid at once or none (CR 702.24a), unpayable with too few cards (CR 118.3).
    if (/^Cumulative upkeep—Put two cards from a single graveyard on the bottom of their owner's library\.?$/.test(line))
      return {
        trigger: {
          event: "yourUpkeep",
          body: { targets: [], effects: [{ type: "cumulativeUpkeep", pay: {}, yardPairsToBottom: true }], text: "Cumulative upkeep—put two cards from a single graveyard on the bottom of their owner's library: at the beginning of your upkeep, put an age counter on ~, then sacrifice it unless you put two cards from a single graveyard on the bottom of their owner's library for each age counter on it." },
        },
      };
    // Varchild's War-Riders: "Cumulative upkeep—Have an opponent create a 1/1 red Survivor creature token": an opponent
    // chosen for each age counter, the same one or different ones (rulings), each creating that token under their own
    // control (CR 111.2), all of it paid at once or none (CR 702.24a).
    const giveToken = /^Cumulative upkeep—Have an opponent create (an? [^.]+ creature token)\.?$/.exec(line);
    if (giveToken) {
      const made = parseBody(`You create ${giveToken[1]}.`, {});
      const [create] = made?.effects ?? [];
      if (!made || made.targets.length || made.effects.length !== 1 || create?.type !== "createToken" || create.n !== 1 || create.who?.ref !== "you" || Object.keys(create).some((k) => !["type", "who", "n", "token"].includes(k))) return "fail";
      return {
        trigger: {
          event: "yourUpkeep",
          body: { targets: [], effects: [{ type: "cumulativeUpkeep", pay: {}, giveToken: create.token }], text: `Cumulative upkeep—have an opponent create ${giveToken[1]}: at the beginning of your upkeep, put an age counter on ~, then sacrifice it unless you have an opponent create ${giveToken[1]} for each age counter on it.` },
        },
      };
    }
    // Thought Lash (round B210): "Cumulative upkeep—Exile the top card of your library": the top card for each age counter,
    // all of them or none (CR 702.24a), unpayable with fewer cards in the library (CR 118.3).
    if (/^Cumulative upkeep—Exile the top card of your library\.?$/.test(line))
      return {
        trigger: {
          event: "yourUpkeep",
          body: { targets: [], effects: [{ type: "cumulativeUpkeep", pay: {}, exileTopCost: true }], text: "Cumulative upkeep—exile the top card of your library: at the beginning of your upkeep, put an age counter on ~, then sacrifice it unless you exile the top card of your library for each age counter on it." },
        },
      };
    // Braid of Fire: "Cumulative upkeep—Add {R}": adding mana is the cost (rulings), {R} for each age counter, which can
    // always be paid; what isn't spent empties from the pool as the upkeep step ends (CR 500.4).
    const adds = /^Cumulative upkeep—Add ((?:\{[WUBRGC]\})+)\.?$/.exec(line);
    if (adds)
      return {
        trigger: {
          event: "yourUpkeep",
          body: { targets: [], effects: [{ type: "cumulativeUpkeep", pay: {}, addMana: adds[1]! }], text: `Cumulative upkeep—add ${adds[1]}: at the beginning of your upkeep, put an age counter on ~, then sacrifice it unless you add ${adds[1]} for each age counter on it.` },
        },
      };
    const raw = m[1]!.replace(/^Pay /, "").replace(/^\{([WUBRG])\} or \{([WUBRG])\}$/, (x, a: string, b: string) => (a !== b ? `{${a}/${b}}` : x));
    const pay = parsePayCost(raw);
    if (!pay || (pay.mana && !plainMana(pay.mana))) return "fail"; // "Sacrifice a creature", ...
    const what = describePayText(pay);
    return {
      trigger: {
        event: "yourUpkeep",
        body: { targets: [], effects: [{ type: "cumulativeUpkeep", pay }], text: `Cumulative upkeep ${what}: at the beginning of your upkeep, put an age counter on ~, then sacrifice it unless you pay ${what} for each age counter on it.` },
      },
    };
  }
  // Plot [cost] (CR 702.170a): exile it from your hand as a special action, cast it free on a later turn.
  if ((m = /^Plot ((?:\{[^}]+\})+)$/.exec(line))) return plainMana(m[1]!) && !d.types.includes("Land") ? { plot: m[1]! } : "fail";
  if (/^Plot\b/.test(line)) return "fail";
  // Foretell [cost] (CR 702.143a). An {X} foretell cost isn't modeled.
  // "Foretell {X}{X}{W}" (Starnheim Unleashed): X is announced as it's cast for that cost (CR 107.3a, rulings).
  if ((m = /^Foretell ((?:\{[^}]+\})+)$/.exec(line))) return (plainMana(m[1]!) || xMana(m[1]!)) && !d.types.includes("Land") ? { foretell: m[1]! } : "fail";
  if (/^Foretell\b/.test(line)) return "fail";
  // Impending N—[cost] (CR 702.176a): an alternative cost; paid, it enters with N time counters and isn't a creature while
  // it has one; "At the beginning of your end step, if this permanent's impending cost was paid and it has a time counter
  // on it, remove a time counter from it" (an intervening if, CR 603.4).
  if ((m = /^Impending (\d+)—((?:\{[^}]+\})+)$/.exec(line))) {
    if (!plainMana(m[2]!) || !d.types.includes("Creature")) return "fail";
    return {
      alt: { kind: "impending", mana: m[2]! },
      impending: Number(m[1]),
      trigger: { event: "yourEndStep", ifCond: { kind: "self", is: "impending" }, body: { targets: [], effects: [{ type: "removeCounters", what: { ref: "self" }, counter: "time", n: 1 }], text: "Remove a time counter from ~." } },
    };
  }
  if (/^Impending\b/.test(line)) return "fail";
  // Blitz [cost] (CR 702.152a) and warp [cost] (CR 702.185a): alternative costs that send the permanent away at the next
  // end step. "Blitz—{2}{B}{B}, Discard a card" isn't modeled; "Warp—{B}, Pay 2 life" (Timeline Culler) is: the life is
  // paid along with the warp cost (CR 118.9, 601.2h).
  if ((m = /^Warp—((?:\{[^}]+\})+), (Pay \d+ life)\.?$/.exec(line))) {
    const cost = parseAdditionalCost(m[2]!);
    if (!plainMana(m[1]!) || cost?.kind !== "payLife" || !d.types.some((ty) => ["Creature", "Artifact", "Enchantment", "Planeswalker", "Battle"].includes(ty))) return "fail";
    return { alt: { kind: "warp", mana: m[1]!, costs: [cost], text: m[2]!.replace(/^P/, "p") } };
  }
  // "Blitz—{2}{B}{B}, Pay 2 life." (Tenacious Underdog), "Blitz—{2}{R}{R}, Discard a card." (Sabin, Master Monk): the
  // life or the discard is part of the blitz cost, paid with its mana (CR 702.152a, 118.9, 601.2h).
  if ((m = /^Blitz—((?:\{[^}]+\})+), (Pay \d+ life|Discard a card)\.?$/.exec(line))) {
    const cost = parseAdditionalCost(m[2]!);
    if (!plainMana(m[1]!) || (cost?.kind !== "payLife" && cost?.kind !== "discard") || !d.types.includes("Creature")) return "fail";
    return { alt: { kind: "blitz", mana: m[1]!, costs: [cost], text: m[2]!.replace(/^[PD]/, (c) => c.toLowerCase()) } };
  }
  // Not "Blitz costs you pay cost {1} less ..." (Henzie "Toolbox" Torre), a static ability about blitz.
  if ((m = /^(Blitz|Warp)(?: |—)(?!costs\b)(.+?)\.?$/.exec(line))) {
    const mana = m[2]!;
    // "Warp {X}{G}" (Broodguard Elite): an {X} the mana cost has too, announced as it's cast (CR 107.3a).
    if (!/^(\{[^}]+\})+$/.test(mana) || !(plainMana(mana) || (m[1] === "Warp" && xMana(mana) && /\{X\}/.test(d.manaCost)))) return "fail";
    if (m[1] === "Blitz") return d.types.includes("Creature") ? { alt: { kind: "blitz", mana } } : "fail";
    return d.types.some((ty) => ["Creature", "Artifact", "Enchantment", "Planeswalker", "Battle"].includes(ty)) ? { alt: { kind: "warp", mana } } : "fail";
  }
  // "Evoke—Exile a white card from your hand" (Solitude): an evoke cost that isn't mana (CR 702.74a), paid instead of the
  // mana cost; the card being cast is on the stack by then, so it can't pay for itself (CR 601.2a).
  if ((m = /^Evoke—(Exile an? [a-z]+ card from your hand)\.?$/.exec(line))) {
    const cost = parseAdditionalCost(m[1]!);
    if (cost?.kind !== "exileFromHand") return "fail";
    return {
      alt: { kind: "evoke", mana: "", costs: [cost], text: m[1]!.replace(/^E/, "e") },
      trigger: { event: "selfEnters", ifEvoked: true, body: { targets: [], effects: [sacrificeSelf], text: "When ~ enters, if its evoke cost was paid, its controller sacrifices it." } },
    };
  }
  if ((m = /^(Evoke|Dash) ((?:\{[^}]+\})+)$/.exec(line))) {
    const mana = m[2]!;
    if (!plainMana(mana)) return "fail";
    if (m[1] === "Dash") return d.types.includes("Creature") ? { alt: { kind: "dash", mana } } : "fail";
    return {
      alt: { kind: "evoke", mana },
      trigger: { event: "selfEnters", ifEvoked: true, body: { targets: [], effects: [sacrificeSelf], text: "When ~ enters, if its evoke cost was paid, its controller sacrifices it." } },
    };
  }
  // Emerge [cost] (CR 702.119a), "Emerge from artifact [cost]" (702.119b): sacrifice a creature (an artifact) as part of
  // this alternative cost; the total cost is reduced by its mana value (see spellCost).
  if ((m = /^Emerge(?: from (artifact))? ((?:\{[^}]+\})+)$/.exec(line))) {
    const sac = parseAdditionalCost(m[1] ? "sacrifice an artifact" : "sacrifice a creature");
    return plainMana(m[2]!) && sac ? { alt: { kind: "emerge", mana: m[2]!, costs: [sac] } } : "fail";
  }
  if (/^Emerge\b/.test(line)) return "fail";
  // Freerunning [cost] (CR 702.173a); {X} costs aren't modeled.
  if ((m = /^Freerunning ((?:\{[^}]+\})+)$/.exec(line))) return plainMana(m[1]!) && !/\{X\}/.test(m[1]!) ? { alt: { kind: "freerunning", mana: m[1]! } } : "fail";
  // "Freerunning—Return a blue creature you control to its owner's hand." (Escape Detection): a freerunning cost that isn't
  // mana (CR 702.173a, 118.8), paid instead of the mana cost.
  if ((m = /^Freerunning—(Return an? [a-z]+ creature you control to its owner's hand)\.?$/.exec(line))) {
    const cost = parseAdditionalCost(m[1]!.replace(/^R/, "r"));
    return cost?.kind === "returnToHand" ? { alt: { kind: "freerunning", mana: "", costs: [cost], text: m[1]!.replace(/^R/, "r") } } : "fail";
  }
  if (/^Freerunning\b/.test(line)) return "fail";
  // Surge [cost] (CR 702.117a): if you've cast another spell this turn (no teammates here); spectacle [cost] (702.137a):
  // if an opponent lost life this turn. Alternative costs, so not with an {X} the mana cost doesn't have.
  if ((m = /^(Surge|Spectacle) ((?:\{[^}]+\})+)$/.exec(line))) {
    // "Surge {X}{R}" (Fall of the Titans): an {X} the mana cost has too, announced as it's cast (CR 107.3a).
    if (!(plainMana(m[2]!) || (xMana(m[2]!) && /\{X\}/.test(d.manaCost)))) return "fail";
    return m[1] === "Surge" ? { alt: { kind: "surge", mana: m[2]!, if: { kind: "castAnother" } } } : { alt: { kind: "spectacle", mana: m[2]!, if: { kind: "opponentLostLife" } } };
  }
  if (/^(Surge|Spectacle)\b/.test(line)) return "fail";
  // Prowl [cost] (CR 702.76a): if a player was dealt combat damage this turn by a source you controlled that had any of
  // this spell's creature types (checked as it's cast, the damage as it was dealt).
  if ((m = /^Prowl ((?:\{[^}]+\})+)$/.exec(line))) return plainMana(m[1]!) && !/\{X\}/.test(m[1]!) ? { alt: { kind: "prowl", mana: m[1]!, if: { kind: "prowl" } } } : "fail";
  if (/^Prowl\b/.test(line)) return "fail";
  // Cleave [cost] (CR 702.148a): an alternative cost for an instant or sorcery; cast for it, the words in square brackets
  // are gone from its text (compile checks that text too).
  if ((m = /^Cleave ((?:\{[^}]+\})+)$/.exec(line))) {
    // Lantern Flare: "Cleave {X}{R}{W}": one X, announced only when it's cast for that cost (CR 107.3a), its mana cost has none.
    const xs = (m[1]!.match(/\{X\}/g) ?? []).length;
    if (!(xs ? xMana(m[1]!) : plainMana(m[1]!)) || xs > 1 || (xs && /\{X\}/.test(d.manaCost)) || !d.types.some((ty) => ty === "Instant" || ty === "Sorcery")) return "fail";
    return { alt: { kind: "cleave", mana: m[1]! } };
  }
  if (/^Cleave\b/.test(line)) return "fail";
  // Overload [cost] (CR 702.96a): an alternative cost for an instant or sorcery; compile checks its "each" text.
  if ((m = /^Overload ((?:\{[^}]+\})+)$/.exec(line))) {
    // An overload cost with {X} (Street Spasm's {X}{X}{R}{R}): X is announced and paid for each {X} in it (CR 107.3a,
    // 107.4b); only when the spell's own text has the X.
    const xOk = plainMana(m[1]!.replace(/\{X\}/g, "")) && parseManaCost(m[1]!).supported && /\{X\}/.test(d.manaCost);
    if (!(plainMana(m[1]!) || xOk) || !d.types.some((ty) => ty === "Instant" || ty === "Sorcery")) return "fail";
    return { alt: { kind: "overload", mana: m[1]! } };
  }
  if (/^Overload\b/.test(line)) return "fail";
  // Sneak [cost] (CR 702.190a): during your declare blockers step, cast it for [cost] and by returning an unblocked
  // attacker you control to its owner's hand; a permanent spell enters tapped and attacking (702.190b).
  if ((m = /^Sneak ((?:\{[^}]+\})+)$/.exec(line)))
    return plainMana(m[1]!)
      ? { alt: { kind: "sneak", mana: m[1]!, costs: [{ kind: "returnToHand", filter: { kind: "object", types: ["Creature"], controller: "you", text: "unblocked attacker you control" }, n: 1, unblockedAttacker: true }] } }
      : "fail";
  if (/^Sneak\b/.test(line)) return "fail";
  // Web-slinging [cost] (CR 702.188a): "You may cast this spell by paying [cost] and returning a tapped creature you
  // control to its owner's hand rather than paying its mana cost", an alternative cost.
  if ((m = /^Web-slinging ((?:\{[^}]+\})+)$/.exec(line))) {
    if (!plainMana(m[1]!)) return "fail";
    const r = parseCostKeyword(`You may pay ${m[1]} and return a tapped creature you control to its owner's hand rather than pay ~'s mana cost`, d);
    return r === "fail" || !r?.alt ? "fail" : { alt: { ...r.alt, text: `web-slinging: return a tapped creature you control to its owner's hand`, webSlinging: true } };
  }
  if (/^Web-slinging\b/.test(line)) return "fail";
  if (line === "Delve") return { delve: true };
  if (line === "Assist") return { assist: true }; // CR 702.132a
  if (line === "Living weapon") {
    if (!d.subtypes.includes("Equipment")) return "fail";
    const germ: TokenSpec = { name: "Phyrexian Germ", power: 0, toughness: 0, colors: ["B"], types: ["Creature"], subtypes: ["Phyrexian", "Germ"], keywords: [] };
    return {
      trigger: {
        event: "selfEnters",
        body: {
          targets: [],
          effects: [
            { type: "createToken", who: { ref: "you" }, n: 1, token: germ },
            { type: "attach", what: { ref: "created" } },
          ],
          text: "Living weapon: when ~ enters, create a 0/0 black Phyrexian Germ creature token, then attach ~ to it.",
        },
      },
    };
  }
  if (line === "For Mirrodin!") {
    // CR 702.163a: "When this Equipment enters, create a 2/2 red Rebel creature token, then attach this Equipment to it."
    if (!d.subtypes.includes("Equipment")) return "fail";
    const rebel: TokenSpec = { name: "Rebel", power: 2, toughness: 2, colors: ["R"], types: ["Creature"], subtypes: ["Rebel"], keywords: [] };
    return {
      trigger: {
        event: "selfEnters",
        body: {
          targets: [],
          effects: [
            { type: "createToken", who: { ref: "you" }, n: 1, token: rebel },
            { type: "attach", what: { ref: "created" } },
          ],
          text: "For Mirrodin!: when ~ enters, create a 2/2 red Rebel creature token, then attach ~ to it.",
        },
      },
    };
  }
  if (line === "Job select") {
    // CR 702.182a: "When this Equipment enters, create a 1/1 colorless Hero creature token, then attach this Equipment to it."
    if (!d.subtypes.includes("Equipment")) return "fail";
    const hero: TokenSpec = { name: "Hero", power: 1, toughness: 1, colors: [], types: ["Creature"], subtypes: ["Hero"], keywords: [] };
    return {
      trigger: {
        event: "selfEnters",
        body: {
          targets: [],
          effects: [
            { type: "createToken", who: { ref: "you" }, n: 1, token: hero },
            { type: "attach", what: { ref: "created" } },
          ],
          text: "Job select: when ~ enters, create a 1/1 colorless Hero creature token, then attach ~ to it.",
        },
      },
    };
  }
  // Embalm and eternalize (CR 702.128, 702.129): exile it from your graveyard to create a token copy of it.
  // "Eternalize—{3}{U}{U}, Discard a card" (Sinuous Striker): a discard as part of the cost (CR 702.129a, 602.2b); the card
  // itself is in the graveyard, so it can't be the one discarded (rulings).
  if ((m = /^(Embalm|Eternalize)(?: |—)((?:\{[^}]+\})+)(?:, (Discard a card))?\.?$/.exec(line))) {
    const cost = m[2]!;
    if (!plainMana(cost)) return "fail";
    const extra = m[3] ? parseAdditionalCost(m[3].toLowerCase()) : undefined;
    const embalm = m[1] === "Embalm";
    const except: CopyExcept = embalm ? { colors: ["W"], addSubtypes: ["Zombie"], noManaCost: true } : { pt: [4, 4], colors: ["B"], addSubtypes: ["Zombie"], noManaCost: true };
    return {
      activated: {
        manaCost: cost,
        keyword: embalm ? "Embalm" : "Eternalize",
        tap: false,
        ...(extra ? { costs: [extra] } : {}),
        sacrificeSelf: false,
        sorcerySpeed: true,
        zone: "graveyard",
        exileSelf: true,
        body: {
          targets: [],
          effects: [{ type: "createTokenCopy", who: { ref: "you" }, n: 1, what: { ref: "self" }, except, ofSource: true, ...(embalm ? { embalmed: true as const } : {}) }],
          text: `Create a token that's a copy of ~, except it's a ${embalm ? "white" : "4/4 black"} Zombie ${d.subtypes.join(" ")} with no mana cost.`,
        },
        text: `${m[1]} ${cost}${m[3] ? `, ${m[3]}` : ""}`,
      },
    };
  }
  // Encore (CR 702.141a): "[Cost], Exile this card from your graveyard: For each opponent, create a token that's a copy
  // of this card that attacks that opponent this turn if able. The tokens gain haste. Sacrifice them at the beginning of
  // the next end step. Activate only as a sorcery."
  if ((m = /^Encore ((?:\{[^}]+\})+)$/.exec(line))) {
    if (!plainMana(m[1]!)) return "fail";
    return {
      activated: {
        manaCost: m[1]!,
        tap: false,
        sacrificeSelf: false,
        sorcerySpeed: true,
        zone: "graveyard",
        exileSelf: true,
        body: {
          targets: [],
          effects: [{ type: "encore" }, { type: "delayed", when: "nextEndStep", each: "created", effects: [{ type: "sacrifice", what: { ref: "subject" } }], text: "sacrifice ~" }],
          text: "For each opponent, create a token that's a copy of ~ that attacks that opponent this turn if able. The tokens gain haste. Sacrifice them at the beginning of the next end step.",
        },
        text: `Encore ${m[1]}`,
      },
    };
  }
  // Outlast (CR 702.107a): "[Cost], {T}: Put a +1/+1 counter on this creature. Activate only as a sorcery."
  if ((m = /^Outlast ((?:\{[^}]+\})+)$/.exec(line))) {
    const cost = m[1]!;
    if (!plainMana(cost)) return "fail";
    return {
      activated: {
        manaCost: cost,
        tap: true,
        sacrificeSelf: false,
        sorcerySpeed: true,
        body: { targets: [], effects: [{ type: "counters", what: { ref: "self" }, counter: "+1/+1", n: 1 }], text: "Put a +1/+1 counter on ~." },
        text: `Outlast ${cost}`,
        outlast: true,
      },
    };
  }
  // Craft (CR 702.167a): "[Cost], Exile this permanent, Exile [materials] from among permanents you control and/or cards in
  // your graveyard: Return this card to the battlefield transformed under its owner's control. Activate only as a sorcery."
  // Materials named by a card type or subtype alone ("creature", "two artifacts", "Island") are permanents of that type
  // or cards of it in your graveyard (702.167b). Other materials ("one or more creatures", "two that share a card type")
  // aren't modeled.
  if ((m = /^Craft with (.+?) ((?:\{[^}]+\})+)$/.exec(line))) {
    const cost = m[2]!;
    const craftAbility = (c: Extract<AdditionalCost, { kind: "craft" }>): { activated: ActivatedAbility } => ({
      activated: {
        manaCost: cost,
        tap: false,
        sacrificeSelf: false,
        sorcerySpeed: true,
        exileSelf: true,
        keyword: "Craft",
        costs: [c],
        body: {
          targets: [],
          effects: [{ type: "putOntoBattlefield", what: { ref: "selfCard", exiledAsCost: true }, transformed: true, owner: true, linkCostExiled: true }],
          text: "Return ~ to the battlefield transformed under its owner's control.",
        },
        text: `Craft with ${m![1]} ${cost}`,
      },
    });
    // "Craft with one or more creatures" (Altar of the Wretched), "one or more Dinosaurs" (Saheeli's Lattice): that many or
    // more, any mix of permanents and graveyard cards (CR 702.167a-b). "Craft with one or more" alone (Sunbird Standard):
    // any other permanents you control and/or cards in your graveyard (its reminder text). "Four or more red instant
    // and/or sorcery cards" (Ore-Rich Stalactite): the word "card" makes them cards in your graveyard only (CR 702.167b is
    // for a type without "card"; 109.2).
    const more = /^(one|two|three|four|five|six) or more(?: (.+))?$/.exec(m[1]!);
    if (more) {
      if (!plainMana(cost)) return "fail";
      const n = num(more[1]!);
      if (more[2] === undefined) return craftAbility({ kind: "craft", n, orMore: true, filter: { kind: "object", types: [], notTypes: [], notColors: [], text: "permanents and/or cards" } });
      const cards = /^(?:(white|blue|black|red|green) )?(\w+) and\/or (\w+) cards$/.exec(more[2]);
      if (cards) {
        const filter = parseSearchFilter(`${cards[1] ? `${cards[1]} ` : ""}${cards[2]} or ${cards[3]} card`);
        if (filter?.kind !== "card" || filter.types?.length !== 2) return "fail";
        return craftAbility({ kind: "craft", n, orMore: true, cardsOnly: true, filter: { ...filter, text: more[2] } });
      }
      if (!/^[A-Za-z]+s$/.test(more[2])) return "fail";
      const filter = pickFilter(singular(more[2]));
      if (!filter || filter.kind !== "object" || filter.controller || !(filter.types?.length || filter.subtypes?.length)) return "fail";
      return craftAbility({ kind: "craft", n, orMore: true, filter: { ...filter, text: more[2] } });
    }
    // "Craft with a Dinosaur, a Merfolk, a Pirate, and a Vampire" (Throne of the Grim Captain): one object for each, four
    // separate objects (rulings: one changeling isn't enough).
    const list = /^an? ([A-Z][a-z]+), an? ([A-Z][a-z]+), an? ([A-Z][a-z]+), and an? ([A-Z][a-z]+)$/.exec(m[1]!);
    if (list) {
      if (!plainMana(cost)) return "fail";
      const slots = list.slice(1, 5).map((w) => pickFilter(w!));
      if (slots.some((f) => !f || f.kind !== "object" || f.controller || f.types?.length || f.subtypes?.length !== 1)) return "fail";
      const subtypes = slots.map((f) => f!.subtypes![0]!);
      return craftAbility({ kind: "craft", n: 4, slots: slots.map((f) => ({ ...f!, text: f!.subtypes![0]! })), filter: { kind: "object", types: [], notTypes: [], notColors: [], subtypes, text: `${subtypes.slice(0, -1).join(", ")} and ${subtypes[subtypes.length - 1]}` } });
    }
    const mat = /^(?:(two|three|four|five|six) )?([A-Za-z]+)$/.exec(m[1]!);
    if (!plainMana(cost) || !mat) return "fail";
    const n = mat[1] ? num(mat[1]) : 1;
    const word = n > 1 ? singular(mat[2]!) : mat[2]!;
    const filter = pickFilter(word);
    if (!filter || filter.kind !== "object" || filter.controller || !(filter.types?.length || filter.subtypes?.length) || (n > 1) === (word === mat[2])) return "fail";
    return {
      activated: {
        manaCost: cost,
        tap: false,
        sacrificeSelf: false,
        sorcerySpeed: true,
        exileSelf: true,
        keyword: "Craft",
        costs: [{ kind: "craft", n, filter: { ...filter, text: n > 1 ? mat[2]! : word } }],
        body: {
          targets: [],
          effects: [{ type: "putOntoBattlefield", what: { ref: "selfCard", exiledAsCost: true }, transformed: true, owner: true, linkCostExiled: true }],
          text: "Return ~ to the battlefield transformed under its owner's control.",
        },
        text: `Craft with ${m[1]} ${cost}`,
      },
    };
  }
  if ((m = /^Scavenge ((?:\{[^}]+\})+)$/.exec(line))) {
    const cost = m[1]!;
    // Dodgy Jalopy: a "*" power from its characteristic-defining ability, which works in the graveyard too (CR 604.3), as
    // the card is exiled to pay the cost (rulings); compile checks the card has one.
    if (d.power === "*" && plainMana(cost))
      return {
        activated: {
          manaCost: cost,
          tap: false,
          sacrificeSelf: false,
          sorcerySpeed: true,
          zone: "graveyard",
          exileSelf: true,
          scavengeVariable: true,
          body: {
            targets: [{ kind: "object", types: ["Creature"], text: "target creature" }],
            effects: [{ type: "counters", what: { ref: "target", index: 0 }, counter: "+1/+1", n: { count: { kind: "scavengedPower" } } }],
            text: "Put a number of +1/+1 counters equal to this card's power on target creature.",
          },
          text: `Scavenge ${cost}`,
        },
      };
    if (!plainMana(cost) || !/^\d+$/.test(d.power ?? "")) return "fail";
    const n = Number(d.power);
    return {
      activated: {
        manaCost: cost,
        tap: false,
        sacrificeSelf: false,
        sorcerySpeed: true,
        zone: "graveyard",
        exileSelf: true,
        body: {
          targets: [{ kind: "object", types: ["Creature"], text: "target creature" }],
          effects: [{ type: "counters", what: { ref: "target", index: 0 }, counter: "+1/+1", n }],
          text: `Put ${n} +1/+1 counter${n === 1 ? "" : "s"} on target creature.`,
        },
        text: `Scavenge ${cost}`,
      },
    };
  }
  return null;
}

/** "{1}", "1 life", "{B} and 1 life", "{E}", as printed in a cost. */
function describePayText(pay: PayCost): string {
  return [pay.mana, pay.life ? `${pay.life} life` : "", pay.energy ? "{E}".repeat(pay.energy) : ""].filter(Boolean).join(" and ");
}

/**
 * A cost beyond mana: "sacrifice a creature", "discard two cards", "pay 3 life", ... With `allowX` (a spell's costs),
 * "pay X life", "discard X cards", "sacrifice X lands" too, X being announced as it's cast (CR 107.3a).
 */
/** An alternative cost's "if ...": one condition, or several joined by "and" (Mogg Salvage), all checked as it's cast (CR 601.2b). */
function altCondition(text: string): StaticCondition | null {
  const one = (t: string) => parseStaticCondition(t, { affects: { kind: "self" }, mods: [], text: "" });
  const whole = one(text);
  if (whole) return whole;
  const conds = text.split(" and ").map(one);
  return conds.length > 1 && conds.every((c) => c) ? { kind: "allOf", conds: conds as StaticCondition[] } : null;
}

/** Blight N as a cost (CR 701.68a): N -1/-1 counters, all on one creature you control (rulings), ~ included. */
export const blightCost = (n: number): AdditionalCost => ({ kind: "putCounter", counter: "-1/-1", n, filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], controller: "you", text: "creature you control" }, blight: true });

export function parseAdditionalCost(text: string, allowX = false): AdditionalCost | null {
  let m: RegExpExecArray | null;
  if ((m = /^blight (\d+)$/i.exec(text)) && Number(m[1]) > 0) return blightCost(Number(m[1]));
  // Soul Immolation: "blight X", X announced as it's cast (CR 107.3a), all on one creature you control (rulings).
  if (allowX && /^blight X$/i.test(text)) return { ...blightCost(0), x: true } as AdditionalCost;
  // Lethal Sting: "put a -1/-1 counter on a creature you control": not castable without one (rulings).
  if (/^put a -1\/-1 counter on a creature you control$/i.test(text)) return { kind: "putCounter", counter: "-1/-1", n: 1, filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], controller: "you", text: "creature you control" } };
  const isX = (w: string) => allowX && w === "X";
  const many = (w: string) => (isX(w) ? { n: 0, x: true as const } : { n: num(w) });
  if (/^forage$/i.test(text)) return { kind: "forage" }; // CR 701.61a
  // Nethergoyf: "Exile any number of other cards from your graveyard with four or more card types among them" (as its
  // escape cost): any number of cards, other than the card being cast (it's on the stack by then, CR 601.2a), whose card
  // types together number four or more (CR 205.2a: artifact, battle, creature, enchantment, instant, kindred, land,
  // planeswalker, sorcery; rulings).
  if ((m = new RegExp(`^exile any number of (?:other )?cards from your graveyard with ${NUM} or more card types among them$`, "i").exec(text))) return { kind: "exileFromGraveyard", n: 1, cardTypes: num(m[1]!) };
  // Nahiri's Sacrifice: "sacrifice an artifact or creature with mana value X": X announced as it's cast, then one of
  // them with exactly that mana value (CR 107.3a, 601.2b, rulings), as Sidisi's ability does.
  if (allowX && (m = /^sacrifice an? (artifact or creature|artifact|creature) with mana value X$/i.exec(text))) {
    const spec = parseTargetPhrase(m[1]!);
    if (spec?.kind !== "object" || spec.controller || spec.combat) return null;
    return { kind: "sacrifice", filter: { ...spec, text: `${m[1]} with mana value X` }, n: 1, mvX: true };
  }
  if ((m = new RegExp(`^sacrifice (${NUM.slice(1, -1)}|X) (.+)$`, "i").exec(text)) && (m[1] !== "X" || allowX)) {
    const n = many(m[1]!);
    const phrase = n.n === 1 && !n.x ? m[2]! : m[2]!.split(" ").map(singularWord).join(" ");
    const spec = parseTargetPhrase(phrase);
    if (spec?.kind !== "object" || spec.controller || spec.combat) return null;
    return { kind: "sacrifice", filter: { ...spec, text: m[2]! }, ...n };
  }
  // Tectonic Split: "sacrifice half the lands you control, rounded up".
  if ((m = /^sacrifice half the (.+?) you control, rounded up$/i.exec(text))) {
    const spec = parseTargetPhrase(m[1]!.split(" ").map(singularWord).join(" "));
    if (spec?.kind !== "object" || spec.controller || spec.combat) return null;
    return { kind: "sacrifice", filter: { ...spec, text: m[1]! }, n: 0, half: "up" };
  }
  // "Discard an Island card and another card" (Foil): two cards, one of them an Island card.
  if ((m = /^discard an? (.+? card) and another card$/i.exec(text))) {
    const oneOf = parseSearchFilter(m[1]!);
    return oneOf ? { kind: "discard", n: 2, oneOf } : null;
  }
  if ((m = new RegExp(`^discard ${NUM} cards?( at random)?$`, "i").exec(text))) return { kind: "discard", n: num(m[1]!), ...(m[2] ? { random: true as const } : {}) };
  // "Discard X cards", "discard X land cards", "discard X cards at random".
  if (allowX && (m = /^discard X (?:(.+?) )?cards( at random)?$/i.exec(text))) {
    const filter = m[1] ? parseSearchFilter(`${m[1]} card`) : undefined;
    if (filter === null || (filter && m[2])) return null;
    return { kind: "discard", n: 0, x: true, ...(filter ? { filter } : {}), ...(m[2] ? { random: true as const } : {}) };
  }
  // "Discard a Mountain card" (Flameshot).
  if ((m = new RegExp(`^discard ${NUM} (.+?) cards?$`, "i").exec(text))) {
    const filter = parseSearchFilter(`${m[2]} card`);
    return filter ? { kind: "discard", n: num(m[1]!), filter } : null;
  }
  if (/^reveal your hand$/i.test(text)) return { kind: "revealHand" };
  // Necrotic Fumes: "exile a creature you control": chosen as the spell is cast (CR 601.2h), exiled, not sacrificed.
  if ((m = /^exile an? ([a-z]+) you control$/i.exec(text))) {
    const spec = parseTargetPhrase(m[1]!);
    if (spec?.kind !== "object" || spec.controller || spec.combat) return null;
    return { kind: "sacrifice", filter: { ...spec, text: `${m[1]} you control` }, n: 1, exile: true };
  }
  // Processor Assault: "put a card an opponent owns from exile into that player's graveyard", exactly one (rulings).
  if (/^put a card an opponent owns from exile into that player's graveyard$/i.test(text)) return { kind: "exileFromGraveyard", n: 1, process: true };
  // "Removing six counters from among creatures you control" (Quilled Greatwurm): any mix of counters on those
  // permanents, chosen as it's paid (CR 601.2h).
  if ((m = new RegExp(`^remove ${NUM} counters from among creatures you control$`, "i").exec(text)))
    return { kind: "removeCounters", n: num(m[1]!), filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], controller: "you", text: "creatures you control" } };
  // "Exile a red card with mana value X from your hand" (the Shoals): X is the spell's (CR 107.3a).
  if (allowX && (m = /^exile an? (.+? card) with mana value X from your hand$/i.exec(text))) {
    const filter = parseSearchFilter(m[1]!);
    return filter ? { kind: "exileFromHand", n: 1, filter: { ...filter, text: `${m[1]} with mana value X` }, mvX: true } : null;
  }
  // "Exile a blue card from your hand", "exile two red cards from your hand" (Force of Will, Fury of the Horde).
  if ((m = new RegExp(`^exile ${NUM} (?:(.+?) )?cards? from your hand$`, "i").exec(text))) {
    const filter = m[2] ? parseSearchFilter(`${m[2]} card`) : undefined;
    return filter === null ? null : { kind: "exileFromHand", n: num(m[1]!), ...(filter ? { filter } : {}) };
  }
  // "Tap an untapped creature you control" (Lashknife), "tap four untapped creatures you control with flying" (Sephara).
  // "Tap an untapped red creature you control other than ~" (Impelled Giant): not the source.
  if ((m = new RegExp(`^tap ${NUM} untapped (.+?) you control( with .+?)?( other than ~)?$`, "i").exec(text))) {
    // Warlord's Elite: "tap two untapped artifacts, creatures, and/or lands you control": any two, each one of them.
    const kinds = m[2]!.replace(/,? and\/or /, ", or ").replace(/^([a-z]+), or ([a-z]+)$/, "$1 or $2");
    const filter = parseTargetPhrase(`${num(m[1]!) > 1 ? kinds.split(" ").map((w) => (w.endsWith(",") ? `${singularWord(w.slice(0, -1))},` : singularWord(w))).join(" ") : kinds}${m[3] ?? ""}`);
    return filter?.kind === "object" && !filter.controller && !filter.combat && filter.tapped === undefined ? { kind: "tap", filter: { ...filter, text: `untapped ${m[2]} you control${m[3] ?? ""}${m[4] ? " other than ~" : ""}` }, n: num(m[1]!), ...(m[4] ? { other: true } : {}) } : null;
  }
  // "Collect evidence 3" (CR 701.59a): exile cards from your graveyard with total mana value 3 or more.
  if ((m = /^collect evidence (\d+)$/i.exec(text))) return { kind: "collectEvidence", n: Number(m[1]) };
  if ((m = /^pay (\d+) life$/i.exec(text))) return { kind: "payLife", n: Number(m[1]) };
  if (allowX && /^pay X life$/i.test(text)) return { kind: "payLife", n: 0, x: true };
  // "Return X Swamps you control to their owner's hand" (Infernal Harvest).
  if (allowX && (m = /^return X (.+?) you control to their owner's hand$/i.exec(text))) {
    const spec = parseTargetPhrase(m[1]!.split(" ").map(singularWord).join(" "));
    if (spec?.kind !== "object" || spec.controller || spec.combat || spec.tapped !== undefined) return null;
    return { kind: "returnToHand", filter: { ...spec, controller: "you", text: `${m[1]} you control` }, n: 0, x: true };
  }
  // "Return two Islands you control to their owner's hand" (Gush).
  if ((m = new RegExp(`^return ${NUM} (.+?) you control to their owner's hand$`, "i").exec(text)) && num(m[1]!) > 1) {
    const spec = parseTargetPhrase(m[2]!.split(" ").map(singularWord).join(" "));
    if (spec?.kind !== "object" || spec.controller || spec.combat || spec.tapped !== undefined) return null;
    return { kind: "returnToHand", filter: { ...spec, controller: "you", text: `${m[2]} you control` }, n: num(m[1]!) };
  }
  // "Return a land you control to its owner's hand" (Deprive), "a tapped creature" (web-slinging, CR 702.188a).
  if ((m = /^return an? (.+?) you control to its owner's hand$/i.exec(text))) {
    const spec = parseTargetPhrase(m[1]!);
    if (spec?.kind !== "object" || spec.controller || spec.combat || spec.tapped === false) return null;
    return { kind: "returnToHand", filter: { ...spec, controller: "you", text: `${m[1]} you control` }, n: 1 };
  }
  // Behold (CR 701.4a): "behold an Elf", "behold a Kithkin and exile it" (exile an Elf you control or an Elf card from your
  // hand), "behold a Gamma creature" (Hulk's Thunderclap: a Gamma creature card or a Gamma creature you control). A
  // subtype only, as yet. Countersculpt: "behold a Jace", a planeswalker type: a Jace you control or a Jace card.
  if ((m = /^behold an? ([A-Z][a-z]+)( creature)?( and exile it)?$/.exec(text)) && (subtypeSet(m[1]!) || (!m[2] && PLANESWALKER_TYPES.has(m[1]!)))) {
    const st = m[1]!;
    const creature = m[2] ? { types: ["Creature"] } : {};
    return { kind: "reveal", filter: { kind: "card", subtypes: [st], ...creature, text: `${st}${m[2] ?? ""} card` }, n: 1, orControl: { kind: "object", subtypes: [st], ...creature, controller: "you", text: `${st}${m[2] ?? ""} you control` }, ...(m[3] ? { exile: true as const } : {}) };
  }
  // Monstrous Emergence: "choose a creature you control or reveal a creature card from your hand": beholding a creature in
  // all but name (CR 701.4a), a creature card from the hand or a creature you control, which the spell's text then names.
  if (text === "choose a creature you control or reveal a creature card from your hand") return { kind: "reveal", filter: { kind: "card", types: ["Creature"], text: "creature" }, n: 1, orControl: { kind: "object", types: ["Creature"], controller: "you", text: "creature you control" } };
  if ((m = /^reveal an? (.+? card) from your hand$/i.exec(text))) {
    const filter = parseSearchFilter(m[1]!);
    return filter ? { kind: "reveal", filter, n: 1 } : null;
  }
  // "Exile the top creature card of your graveyard" (Necratog), "exile the top three black cards of your graveyard"
  // (Spinning Darkness): the topmost cards there that match, so nothing to choose (CR 404.1; see graveyard.ts).
  if ((m = new RegExp(`^exile the top (?:${NUM} )?(.+?) of your graveyard$`, "i").exec(text))) {
    const n = m[1] ? num(m[1]) : 1;
    if (!Number.isInteger(n) || n < 1 || (n === 1 ? !/\bcard$/.test(m[2]!) : !/\bcards$/.test(m[2]!))) return null;
    const filter = parseSearchFilter(n > 1 ? m[2]!.replace(/cards$/, "card") : m[2]!);
    if (filter === null) return null;
    return { kind: "exileFromGraveyard", n, top: true, ...(filter ? { filter } : {}) };
  }
  // Gallia, Tragic Host: "Exile another creature card from your graveyard": not the card whose ability it is, which never
  // pays for itself anyway (see game.ts's candidates).
  if ((m = /^exile another (.+? card) from your graveyard$/i.exec(text))) {
    const filter = parseSearchFilter(m[1]!);
    return filter ? { kind: "exileFromGraveyard", n: 1, filter } : null;
  }
  // Battlefield Scrounger: "Put three cards from your graveyard on the bottom of your library": chosen as for an exile,
  // put on the bottom in the order chosen (CR 401.4).
  if ((m = new RegExp(`^put (${NUM.slice(1, -1)}) cards from your graveyard on the bottom of your library$`, "i").exec(text))) return { kind: "exileFromGraveyard", n: num(m[1]!), toBottom: true };
  // Despoiler of Souls: "Exile two other creature cards from your graveyard", the same.
  if ((m = new RegExp(`^exile (${NUM.slice(1, -1)}|X) (?:other )?(.+?) from your graveyard$`, "i").exec(text)) && (m[1] !== "X" || allowX)) {
    const filter = parseSearchFilter(m[1] === "X" ? m[2]!.replace(/cards$/, "card") : m[2]!);
    if (filter === null) return null;
    return { kind: "exileFromGraveyard", ...many(m[1]!), ...(filter ? { filter } : {}) };
  }
  return null;
}

/**
 * A line of keywords where some are abilities in their own right: "Prowess", "Ward {2}",
 * "Cycling {1}{U}", "Crew 3", "Convoke", possibly mixed with simple keywords ("Flying, ward {2}").
 * Returns what they add, or null if any part isn't one we support.
 */
interface KeywordParts {
  triggers: TriggeredAbility[];
  activated: ActivatedAbility[];
  convoke: boolean;
  improvise: boolean;
  affinity: TargetSpec[];
  /** Modular N's "enters with N +1/+1 counters" (CR 702.43a). */
  plusCounters: number;
  bloodthirst: number;
  bloodthirstX?: true;
  entersOptions: EntersOption[];
  statics: StaticAbility[];
  /** Fading N's fade counters, vanishing N's time counters (CR 702.32a, 702.63a). */
  entersCounter?: { counter: CounterKind; n: number };
  devour?: { n: number; filter: TargetSpec };
  /** Sunburst (CR 702.44a); "Modular—Sunburst" always means +1/+1 counters (702.44c). */
  sunburst?: { counter?: "+1/+1" };
  amplify?: number;
  enlist?: boolean;
  /** Undaunted's instances (CR 702.125c). */
  undaunted?: number;
  /** Epic (CR 702.50a), on an instant or sorcery. */
  epic?: boolean;
  paradigm?: boolean;
}

/** CR 702.189a: "Whenever this creature attacks, add N {R}. Until end of combat, you don't lose this mana as steps and phases end." */
export function firebending(n: Amount, text: string): TriggeredAbility {
  const add = typeof n === "number" ? "{R}".repeat(n) : "X {R}";
  return { event: "selfAttacks", body: { targets: [], effects: [{ type: "addCombatMana", n }], text: `${text.charAt(0).toUpperCase()}${text.slice(1)}: add ${add}. Until end of combat, you don't lose this mana as steps and phases end.` } };
}

export function keywordAbilities(line: string, d: CardDef): KeywordParts | null {
  const out: KeywordParts = { triggers: [], activated: [], convoke: false, improvise: false, affinity: [], plusCounters: 0, bloodthirst: 0, entersOptions: [], statics: [] };
  const plus = (n: Amount, what: ObjRef = { ref: "self" }): Effect => ({ type: "counters", what, counter: "+1/+1", n });
  // "Ward—{2}, Pay 2 life" is one keyword; so is "Mobilize X, where X is ..." and "Recover—Pay half your life, rounded up".
  for (const raw of line.split(/(?<!ward—(?:\{[^}]+\})+)(?<!^mobilize X)(?<!^recover—pay half your life)[,;]\s*/i)) {
    const p = raw.trim();
    let m: RegExpExecArray | null;
    if (keywordOf(p)) continue;
    if (/^prowess$/i.test(p)) {
      // CR 702.108a: "Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn."
      out.triggers.push({
        event: "castSpell",
        cast: { by: "you", spell: { kind: "spell", notTypes: ["Creature"], text: "noncreature spell" } },
        body: { targets: [], effects: [{ type: "continuous", what: { ref: "self" }, mods: [{ kind: "modifyPT", power: 1, toughness: 1 }], duration: "endOfTurn" }], text: "Prowess: ~ gets +1/+1 until end of turn." },
      });
    } else if (/^increment$/i.test(p)) {
      // CR 702.191a: "Whenever you cast a spell, if this permanent is a creature and the amount of mana spent to cast that
      // spell is greater than this creature's power or this creature's toughness, put a +1/+1 counter on this creature."
      // Each instance triggers separately (702.191b); the "if" is checked again as it resolves (CR 603.4).
      out.triggers.push({
        event: "castSpell",
        cast: { by: "you", spell: { kind: "spell", text: "spell" } },
        ifCond: { kind: "increment" },
        body: { targets: [], effects: [{ type: "counters", what: { ref: "self" }, counter: "+1/+1", n: 1 }], text: "Increment: put a +1/+1 counter on ~." },
      });
    } else if (/^extort$/i.test(p)) {
      // CR 702.101a: "Whenever you cast a spell, you may pay {W/B}. If you do, each opponent loses 1 life and you
      // gain life equal to the total life lost this way." Each instance triggers separately (702.101b).
      const drain: Effect = { type: "loseLife", who: { ref: "eachOpponent" }, n: 1, drain: true };
      out.triggers.push({
        event: "castSpell",
        cast: { by: "you", spell: { kind: "spell", text: "spell" } },
        body: { targets: [], effects: [{ type: "may", effects: [drain], pay: { mana: "{W/B}" }, text: "pay {W/B}. If you do, each opponent loses 1 life and you gain that much life" }], text: "Extort: you may pay {W/B}. If you do, each opponent loses 1 life and you gain life equal to the total life lost this way." },
      });
    } else if (/^convoke$/i.test(p)) out.convoke = true;
    else if (/^improvise$/i.test(p)) out.improvise = true;
    else if (/^storm$/i.test(p)) {
      // CR 702.40a: "When you cast this spell, copy it for each other spell that was cast before it this turn. If the
      // spell has any targets, you may choose new targets for any of the copies."
      out.triggers.push({ event: "selfCast", body: { targets: [], effects: [{ type: "copySpell", spell: "cause", n: "storm", newTargets: true }], text: "Storm: copy ~ for each other spell cast before it this turn." } });
    } else if (/^demonstrate$/i.test(p)) {
      // CR 702.144a: "When you cast this spell, you may copy it and you may choose new targets for the copy. If you copy
      // the spell, choose an opponent. That player copies the spell and may choose new targets for that copy."
      const copy: Effect = { type: "copySpell", spell: "cause", n: 1, newTargets: true, demonstrate: true };
      out.triggers.push({ event: "selfCast", body: { targets: [], effects: [{ type: "may", effects: [copy], text: "copy ~ (an opponent you choose then copies it too)" }], text: "Demonstrate: you may copy ~. If you do, choose an opponent to also copy it. Players may choose new targets for their copies." } });
    } else if (/^gravestorm$/i.test(p)) {
      // CR 702.69a: "When you cast this spell, copy it for each permanent that was put into a graveyard from the
      // battlefield this turn. If the spell has any targets, you may choose new targets for any of the copies."
      // Counted as the trigger resolves; each instance triggers (702.69b).
      out.triggers.push({ event: "selfCast", body: { targets: [], effects: [{ type: "copySpell", spell: "cause", n: { count: { kind: "toGraveyardThisTurn" } }, newTargets: true }], text: "Gravestorm: copy ~ for each permanent put into a graveyard from the battlefield this turn." } });
    } else if (/^epic$/i.test(p)) {
      // CR 702.50a: "For the rest of the game, you can't cast spells," and "At the beginning of each of your upkeeps for
      // the rest of the game, copy this spell except for its epic ability. If the spell has any targets, you may choose
      // new targets for the copy." Both happen as it resolves, after its other instructions.
      if (!d.types.some((ty) => ty === "Instant" || ty === "Sorcery")) return null;
      out.epic = true;
    } else if (/^paradigm$/i.test(p)) {
      // CR 702.192a: "If this is the first time a spell you control with this spell's name has resolved this game, at
      // the beginning of each of your precombat main phases for the rest of the game, create a copy of this object in
      // exile. You may cast the copy without paying its mana cost" and "Exile this spell", as it resolves.
      if (!d.types.some((ty) => ty === "Instant" || ty === "Sorcery")) return null;
      out.paradigm = true;
    } else if (/^undaunted$/i.test(p)) {
      // CR 702.125a: "This spell costs {1} less to cast for each opponent you have"; players who left aren't counted
      // (702.125b), and each instance applies (702.125c).
      out.undaunted = (out.undaunted ?? 0) + 1;
    } else if (/^cascade$/i.test(p)) {
      // CR 702.85a: "When you cast this spell, exile cards from the top of your library until you exile a nonland card
      // whose mana value is less than this spell's mana value. You may cast that card without paying its mana cost if
      // the resulting spell's mana value is less than this spell's mana value. Then put all cards exiled this way that
      // weren't cast on the bottom of your library in a random order." Each instance triggers (CR 702.85c).
      out.triggers.push({ event: "selfCast", body: { targets: [], effects: [{ type: "cascade" }], text: "Cascade: exile cards from the top of your library until you exile a cheaper nonland card. You may cast it without paying its mana cost." } });
    }
    else if ((m = /^ripple (\d+)$/i.exec(p))) {
      // CR 702.60a; each instance triggers separately (702.60b).
      out.triggers.push({ event: "selfCast", body: rippleBody(Number(m[1])) });
    }
    else if ((m = /^affinity for ((?:artifact |snow |historic )?\w+)$/i.exec(p))) {
      // CR 702.41a: "This spell costs {1} less to cast for each [text] you control." "Affinity for artifact creatures" (Urza,
      // Chief Artificer): each artifact creature. Razor Golem: "Affinity for Plains"; Icebreaker Kraken: "Affinity for snow
      // lands". "Affinity for historic permanents" (Banish to Another Universe): artifacts, legendaries and Sagas (CR 700.6).
      const spec = parseTargetPhrase(m[1] === "Plains" ? "Plains" : m[1]!.split(" ").map(singular).join(" "));
      if (spec?.kind !== "object") return null;
      out.affinity.push({ ...spec, controller: "you", text: `${m[1]} you control` });
    }
    else if (/^toxic \d+$/i.test(p)) continue; // a static ability, read from the keywords (see textKeywords)
    else if (/^exalted$/i.test(p)) {
      // CR 702.83a: "Whenever a creature you control attacks alone, that creature gets +1/+1 until end of turn."
      // Each instance triggers separately (CR 702.83a).
      out.triggers.push({
        event: "creatureYouControlAttacksAlone",
        body: { targets: [], effects: [{ type: "continuous", what: { ref: "subject" }, mods: [{ kind: "modifyPT", power: 1, toughness: 1 }], duration: "endOfTurn" }], text: "Exalted: that creature gets +1/+1 until end of turn." },
      });
    }
    else if (/^melee$/i.test(p)) {
      // CR 702.121a: "Whenever this creature attacks, it gets +1/+1 until end of turn for each opponent you attacked
      // with a creature this combat." Each instance triggers separately (702.121b).
      const n = { count: { kind: "opponentsAttacked" as const } };
      out.triggers.push({ event: "selfAttacks", body: { targets: [], effects: [{ type: "continuous", what: { ref: "self" }, mods: [{ kind: "modifyPT", power: n, toughness: n }], duration: "endOfTurn" }], text: "Melee: ~ gets +1/+1 until end of turn for each opponent you attacked with a creature this combat." } });
    } else if ((m = /^bushido (\d+)$/i.exec(p))) {
      // CR 702.45a: "Whenever this creature blocks or becomes blocked, it gets +N/+N until end of turn."
      const n = Number(m[1]);
      out.triggers.push({ event: "selfBlocksOrBecomesBlocked", body: { targets: [], effects: [pumpSelf(n, n)], text: `Bushido ${n}: ~ gets +${n}/+${n} until end of turn.` } });
    } else if ((m = /^frenzy (\d+)$/i.exec(p))) {
      // CR 702.68a: "Whenever this creature attacks and isn't blocked, it gets +N/+0 until end of turn."
      const n = Number(m[1]);
      out.triggers.push({ event: "selfAttacksUnblocked", body: { targets: [], effects: [pumpSelf(n, 0)], text: `Frenzy ${n}: ~ gets +${n}/+0 until end of turn.` } });
    } else if (/^flanking$/i.test(p)) {
      // CR 702.25a: "Whenever a creature without flanking blocks this creature, the blocking creature gets -1/-1 until end of turn."
      out.triggers.push({
        event: "selfBlockedByCreature",
        subjectFilter: { kind: "object", types: ["Creature"], notKeywords: ["Flanking"], text: "creature without flanking" },
        body: { targets: [], effects: [{ type: "continuous", what: { ref: "subject" }, mods: [{ kind: "modifyPT", power: -1, toughness: -1 }], duration: "endOfTurn" }], text: "Flanking: the blocking creature gets -1/-1 until end of turn." },
      });
    } else if ((m = /^rampage (\d+)$/i.exec(p))) {
      // CR 702.23a: "Whenever this creature becomes blocked, it gets +N/+N until end of turn for each creature blocking it beyond the first."
      const n = Number(m[1]);
      out.triggers.push({
        event: "selfBecomesBlocked",
        body: { targets: [], effects: [{ type: "pumpPerBlocker", what: { ref: "self" }, power: n, toughness: n, beyondFirst: true }], text: `Rampage ${n}: ~ gets +${n}/+${n} until end of turn for each creature blocking it beyond the first.` },
      });
    } else if (/^(persist|undying)$/i.test(p)) {
      // CR 702.79a / 702.93a: "When this permanent is put into a graveyard from the battlefield, if it had no
      // -1/-1 (+1/+1) counters on it, return it to the battlefield under its owner's control with a -1/-1 (+1/+1) counter on it."
      const counter = /^persist$/i.test(p) ? "-1/-1" : "+1/+1";
      out.triggers.push({
        event: "selfDies",
        ifNoCounter: counter,
        body: { targets: [], effects: [{ type: "returnToBattlefield", counter }], text: `${p.charAt(0).toUpperCase()}${p.slice(1).toLowerCase()}: return ~ to the battlefield with a ${counter} counter on it.` },
      });
    } else if ((m = /^renown (\d+)$/i.exec(p))) {
      // CR 702.112a: "When this creature deals combat damage to a player, if it isn't renowned, put N +1/+1
      // counters on it and it becomes renowned."
      const n = Number(m[1]);
      out.triggers.push({ event: "selfDealsCombatDamageToPlayer", ifNotRenowned: true, body: { targets: [], effects: [{ type: "renown", n }], text: `Renown ${n}: if ~ isn't renowned, put ${n} +1/+1 counter${n > 1 ? "s" : ""} on it and it becomes renowned.` } });
    } else if ((m = /^fabricate (\d+)$/i.exec(p))) {
      // CR 702.123a: "When this permanent enters, you may put N +1/+1 counters on it. If you don't, create N 1/1 colorless Servo artifact creature tokens."
      const n = Number(m[1]);
      const servo: TokenSpec = { name: "Servo", power: 1, toughness: 1, colors: [], types: ["Artifact", "Creature"], subtypes: ["Servo"], keywords: [] };
      out.triggers.push({
        event: "selfEnters",
        body: {
          targets: [],
          effects: [{ type: "may", effects: [plus(n)], text: `put ${n} +1/+1 counter${n > 1 ? "s" : ""} on ~ (otherwise create ${n} Servo${n > 1 ? "s" : ""})`, otherwise: [{ type: "createToken", who: { ref: "you" }, n, token: servo }] }],
          text: `Fabricate ${n}: put ${n} +1/+1 counter${n > 1 ? "s" : ""} on ~ or create ${n} 1/1 Servo${n > 1 ? "s" : ""}.`,
        },
      });
    } else if ((m = /^graft (\d+)$/i.exec(p))) {
      // CR 702.58a: "This permanent enters with N +1/+1 counters on it" and "Whenever another creature enters, if this
      // permanent has a +1/+1 counter on it, you may move a +1/+1 counter from this permanent onto that creature."
      out.plusCounters += Number(m[1]);
      const text = "move a +1/+1 counter from ~ onto that creature";
      out.triggers.push({
        event: "permanentEnters",
        enters: { filter: { kind: "object", types: ["Creature"], text: "creature" }, other: true },
        ifCond: { kind: "selfCounter", counter: "+1/+1" },
        body: { targets: [], effects: [{ type: "may", effects: [{ type: "moveCounter", counter: "+1/+1", from: { ref: "self" }, to: { ref: "subject" } }], text }], text: `Graft: you may ${text}.` },
      });
    } else if ((m = /^modular(?: (\d+)|—(sunburst))$/i.exec(p))) {
      // CR 702.43a: "This permanent enters with N +1/+1 counters on it" and "When this permanent is put into a graveyard
      // from the battlefield, you may put a +1/+1 counter on target artifact creature for each +1/+1 counter on this permanent."
      // "Modular—Sunburst": a +1/+1 counter for each color of mana spent to cast it instead (CR 702.44c).
      if (m[2]) {
        if (out.sunburst) return null;
        out.sunburst = { counter: "+1/+1" };
      } else out.plusCounters += Number(m[1]);
      const text = "put a +1/+1 counter on target artifact creature for each +1/+1 counter on ~";
      out.triggers.push({
        event: "selfToGraveyard",
        body: {
          targets: [{ kind: "object", allTypes: ["Artifact", "Creature"], text: "target artifact creature" }],
          effects: [{ type: "may", effects: [{ type: "counters", what: { ref: "target", index: 0 }, counter: "+1/+1", n: 1, perLastKnownCounter: "+1/+1" }], text }],
          text: `Modular: you may ${text}.`,
        },
      });
    } else if ((m = /^amplify (\d+)$/i.exec(p))) {
      // CR 702.38a; two instances would each work separately (702.38b): not modeled.
      if (out.amplify) return null;
      out.amplify = Number(m[1]);
    } else if (/^sunburst$/i.test(p)) {
      // CR 702.44a: "If this object is entering as a creature, ignoring any type-changing effects that would affect it, it
      // enters with a +1/+1 counter on it for each color of mana spent to cast it. Otherwise, it enters with a charge
      // counter on it for each color of mana spent to cast it." Two instances would each work (702.44d): not modeled.
      if (out.sunburst) return null;
      out.sunburst = {};
    } else if ((m = /^afflict (\d+)$/i.exec(p))) {
      // CR 702.130a: "Whenever this creature becomes blocked, defending player loses N life."
      const n = Number(m[1]);
      out.triggers.push({ event: "selfBecomesBlocked", body: { targets: [], effects: [{ type: "loseLife", who: { ref: "eventPlayer" }, n }], text: `Afflict ${n}: defending player loses ${n} life.` } });
    } else if ((m = /^annihilator (\d+)$/i.exec(p))) {
      // CR 702.86a: "Whenever this creature attacks, defending player sacrifices N permanents of their choice."
      const n = Number(m[1]);
      out.triggers.push({ event: "selfAttacks", body: { targets: [], effects: [{ type: "pick", who: { ref: "eventPlayer" }, filter: { kind: "object", text: "permanent" }, n, action: "sacrifice" }], text: `Annihilator ${n}: defending player sacrifices ${n} permanent${n === 1 ? "" : "s"}.` } });
    } else if (/^ingest$/i.test(p)) {
      // CR 702.115a: "Whenever this creature deals combat damage to a player, that player exiles the top card of their library."
      out.triggers.push({ event: "selfDealsCombatDamageToPlayer", body: { targets: [], effects: [{ type: "exileTop", who: { ref: "eventPlayer" }, n: 1 }], text: "Ingest: that player exiles the top card of their library." } });
    } else if (/^dethrone$/i.test(p)) {
      // CR 702.105a: "Whenever this creature attacks the player with the most life or tied for most life, put a +1/+1 counter on this creature."
      out.triggers.push({ event: "selfAttacks", attacksMostLife: true, body: { targets: [], effects: [plus(1)], text: "Dethrone: put a +1/+1 counter on ~." } });
    } else if (/^enlist$/i.test(p)) {
      // CR 702.154a: "As this creature attacks, you may tap up to one untapped creature you control that you didn't
      // choose to attack with and that either has haste or has been under your control continuously since this turn
      // began. When you do, this creature gets +X/+0 until end of turn, where X is the tapped creature's power."
      // Each instance works on its own (702.154d): not modeled.
      if (out.enlist) return null;
      out.enlist = true;
      out.triggers.push({
        event: "selfEnlists",
        body: { targets: [], effects: [{ type: "continuous", what: { ref: "self" }, mods: [{ kind: "modifyPT", power: { count: { kind: "power", of: { ref: "subject" } } }, toughness: 0 }], duration: "endOfTurn" }], text: "Enlist: ~ gets +X/+0 until end of turn, where X is the enlisted creature's power." },
      });
    } else if (/^training$/i.test(p)) {
      // CR 702.149a: "Whenever this creature and at least one other creature with power greater than this
      // creature's power attack, put a +1/+1 counter on this creature."
      out.triggers.push({ event: "selfAttacks", training: true, body: { targets: [], effects: [plus(1)], text: "Training: put a +1/+1 counter on ~." } });
    } else if ((m = /^fading (\d+)$/i.exec(p))) {
      // CR 702.32a: "This permanent enters with N fade counters on it" and "At the beginning of your upkeep,
      // remove a fade counter from this permanent. If you can't, sacrifice the permanent."
      if (out.entersCounter) return null;
      out.entersCounter = { counter: "fade", n: Number(m[1]) };
      out.triggers.push({ event: "yourUpkeep", body: { targets: [], effects: [{ type: "removeSelfCounter", counter: "fade", orSacrifice: true }], text: "Fading: remove a fade counter from ~. If you can't, sacrifice it." } });
    } else if ((m = /^vanishing(?: (\d+))?$/i.exec(p))) {
      // CR 702.63a-b: "This permanent enters with N time counters on it," "At the beginning of your upkeep, if this
      // permanent has a time counter on it, remove a time counter from it," and "When the last time counter is
      // removed from this permanent, sacrifice it."
      if (m[1]) {
        if (out.entersCounter) return null;
        out.entersCounter = { counter: "time", n: Number(m[1]) };
      }
      out.triggers.push({
        event: "yourUpkeep",
        ifCond: { kind: "selfCounter", counter: "time" },
        body: { targets: [], effects: [{ type: "removeSelfCounter", counter: "time" }], text: "Vanishing: if ~ has a time counter on it, remove a time counter from it." },
      });
      out.triggers.push({ event: "selfLastTimeCounterRemoved", body: { targets: [], effects: [sacrificeSelf], text: "Vanishing: when the last time counter is removed from ~, sacrifice it." } });
    } else if (/^evolve$/i.test(p)) {
      // CR 702.100a
      out.triggers.push({ event: "anotherCreatureYouControlEnters", ifEvolves: true, body: { targets: [], effects: [{ type: "evolve" }], text: "Evolve: if that creature is bigger, put a +1/+1 counter on ~." } });
    } else if (/^battle cry$/i.test(p)) {
      // CR 702.91a: "Whenever this creature attacks, each other attacking creature gets +1/+0 until end of turn."
      out.triggers.push({
        event: "selfAttacks",
        body: { targets: [], effects: [{ type: "continuous", what: { ref: "allCreatures", other: true, attacking: true }, mods: [{ kind: "modifyPT", power: 1, toughness: 0 }], duration: "endOfTurn" }], text: "Battle cry: each other attacking creature gets +1/+0 until end of turn." },
      });
    } else if ((m = /^firebending (\d+)$/i.exec(p))) {
      out.triggers.push(firebending(Number(m[1]), p));
    } else if (/^provoke$/i.test(p)) {
      // CR 702.39a: "Whenever this creature attacks, you may choose to have target creature defending player controls
      // block this creature this combat if able. If you do, untap that creature." Each instance triggers (702.39b).
      const it: ObjRef = { ref: "target", index: 0 };
      out.triggers.push({
        event: "selfAttacks",
        body: {
          targets: [{ kind: "object", types: ["Creature"], controller: "eventPlayer", text: "target creature defending player controls" }],
          effects: [{ type: "may", effects: [{ type: "mustBlockSource", what: it }, { type: "untap", what: it }], text: "have target creature defending player controls block ~ this combat if able and untap it" }],
          text: "Provoke: you may have target creature defending player controls untap and block ~ if able.",
        },
      });
    } else if (/^mentor$/i.test(p)) {
      // CR 702.134a: "Whenever this creature attacks, put a +1/+1 counter on target attacking creature with lesser power."
      out.triggers.push({
        event: "selfAttacks",
        body: {
          targets: [{ kind: "object", types: ["Creature"], combat: "attacking", lesserPowerThanSource: true, text: "target attacking creature with lesser power" }],
          effects: [{ type: "counters", what: { ref: "target", index: 0 }, counter: "+1/+1", n: 1 }],
          text: "Mentor: put a +1/+1 counter on target attacking creature with lesser power.",
        },
      });
    } else if ((m = /^champion an? (.+)$/i.exec(p))) {
      // CR 702.72a: "When this permanent enters, sacrifice it unless you exile another [object] you control" and "When
      // this permanent leaves the battlefield, return the exiled card to the battlefield under its owner's control."
      const spec = parseTargetPhrase(`${m[1]} you control`);
      if (spec?.kind !== "object") return null;
      const what = `${/^[aeiou]/i.test(m[1]!) ? "an" : "a"} ${m[1]}`;
      out.triggers.push({ event: "selfEnters", body: { targets: [], effects: [{ type: "champion", filter: { ...spec, text: `another ${m[1]} you control` } }], text: `Champion ${what}: sacrifice ~ unless you exile another ${m[1]} you control.` } });
      out.triggers.push({ event: "selfLeaves", body: { targets: [], effects: [{ type: "returnChampioned" }], text: "Champion: return the exiled card to the battlefield under its owner's control." } });
    } else if (/^exploit$/i.test(p)) {
      // CR 702.110a: "When this creature enters, you may sacrifice a creature."
      out.triggers.push({ event: "selfEnters", body: { targets: [], effects: [{ type: "exploit" }], text: "Exploit: you may sacrifice a creature." } });
    } else if (/^soulbond$/i.test(p)) {
      // CR 702.95a: "When this creature enters, if you control both this creature and another creature and both are
      // unpaired, you may pair this creature with another unpaired creature you control for as long as both remain
      // creatures on the battlefield under your control" and "Whenever another creature you control enters, if you
      // control both that creature and this one and both are unpaired, you may pair that creature with this creature
      // for as long as both remain creatures on the battlefield under your control."
      out.triggers.push({ event: "selfEnters", ifSoulbond: true, body: { targets: [], effects: [{ type: "soulbond" }], text: "Soulbond: you may pair ~ with another unpaired creature you control." } });
      out.triggers.push({ event: "anotherCreatureYouControlEnters", ifSoulbond: true, body: { targets: [], effects: [{ type: "soulbond" }], text: "Soulbond: you may pair that creature with ~." } });
    } else if (/^living metal$/i.test(p)) {
      // CR 702.161a: "During your turn, this permanent is an artifact creature in addition to its other types", with its
      // printed power and toughness (rulings).
      out.statics.push({ affects: { kind: "self" }, mods: [{ kind: "addTypes", types: ["Artifact", "Creature"], subtypes: [] }], condition: { kind: "yourTurn" }, text: "Living metal: during your turn, ~ is an artifact creature in addition to its other types." });
    } else if (/^riot$/i.test(p)) out.entersOptions.push("riot"); // CR 702.136a; each instance works separately (702.136b)
    else if (/^unleash$/i.test(p)) {
      // CR 702.98a: "You may have this permanent enter with an additional +1/+1 counter on it" and "This
      // permanent can't block as long as it has a +1/+1 counter on it" (any +1/+1 counter, rulings).
      out.entersOptions.push("unleash");
      out.statics.push({ affects: { kind: "self" }, mods: [{ kind: "cantBlock" }], condition: { kind: "selfCounter", counter: "+1/+1" }, text: "Unleash: ~ can't block as long as it has a +1/+1 counter on it." });
    } else if ((m = /^afterlife (\d+)$/i.exec(p))) {
      // CR 702.135a: "When this permanent is put into a graveyard from the battlefield, create N 1/1 white and black
      // Spirit creature tokens with flying." Each instance triggers (702.135b).
      const n = Number(m[1]);
      const spirit: TokenSpec = { name: "Spirit", power: 1, toughness: 1, colors: ["W", "B"], types: ["Creature"], subtypes: ["Spirit"], keywords: ["Flying"] };
      out.triggers.push({ event: "selfToGraveyard", body: { targets: [], effects: [{ type: "createToken", who: { ref: "you" }, n, token: spirit }], text: `Afterlife ${n}: create ${n === 1 ? "a" : n} 1/1 white and black Spirit creature token${n > 1 ? "s" : ""} with flying.` } });
    } else if ((m = /^recover ((?:\{[0-9WUBRG]\})+)$/i.exec(p))) {
      // CR 702.59a: "When a creature is put into your graveyard from the battlefield, you may pay [cost]. If you do, return
      // this card from your graveyard to your hand. Otherwise, exile this card." It works only from the graveyard; a card
      // no longer there is neither returned nor exiled, so then there's nothing to ask (checked like an intervening "if",
      // CR 603.4: paying would do nothing).
      const cost = m[1]!.toUpperCase();
      out.triggers.push({
        event: "permanentDies",
        dies: { filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], owner: "you", text: "creature you own" } },
        body: { targets: [], effects: [{ type: "may", pay: { mana: cost }, effects: [{ type: "bounce", what: { ref: "selfCard" } }], otherwise: [{ type: "exile", what: { ref: "selfCard" } }], text: `pay ${cost} to return ~ to your hand (otherwise ~ is exiled)` }], text: `Recover ${cost}: you may pay ${cost}. If you do, return ~ from your graveyard to your hand. Otherwise, exile ~.` },
        zone: "graveyard",
        ifCond: { kind: "selfInGraveyard" },
      });
    } else if (/^recover—pay half your life, rounded up\.?$/i.test(p)) {
      // Garza's Assassin: the same with "pay half your life, rounded up" (CR 702.59a, 119.4, 107.1a): half the life total
      // as it's paid.
      out.triggers.push({
        event: "permanentDies",
        dies: { filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], owner: "you", text: "creature you own" } },
        body: { targets: [], effects: [{ type: "may", payLife: { count: { kind: "life", who: { ref: "you" } }, half: "up" }, effects: [{ type: "bounce", what: { ref: "selfCard" } }], otherwise: [{ type: "exile", what: { ref: "selfCard" } }], text: "pay half your life, rounded up, to return ~ to your hand (otherwise ~ is exiled)" }], text: "Recover—Pay half your life, rounded up: you may pay half your life, rounded up. If you do, return ~ from your graveyard to your hand. Otherwise, exile ~." },
        zone: "graveyard",
        ifCond: { kind: "selfInGraveyard" },
      });
    } else if ((m = /^bloodthirst (\d+)$/i.exec(p))) out.bloodthirst += Number(m[1]); // CR 702.54a
    else if (/^bloodthirst X$/i.test(p) && !out.bloodthirstX) out.bloodthirstX = true; // CR 702.54b
    else if ((m = /^devour(?: (artifact|food|land))? (\d+)$/i.exec(p))) {
      // CR 702.82a, c: "Devour [quality] N": as it enters, sacrifice any number of [quality] permanents (creatures).
      if (out.devour) return null;
      const q = m[1]?.toLowerCase();
      const filter: TargetSpec =
        q === "artifact" ? { kind: "object", types: ["Artifact"], text: "artifact" }
        : q === "food" ? { kind: "object", subtypes: ["Food"], text: "Food" }
        : q === "land" ? { kind: "object", types: ["Land"], text: "land" }
        : { kind: "object", types: ["Creature"], text: "creature" };
      out.devour = { n: Number(m[2]), filter };
    }
    else if ((m = /^soulshift (\d+)$/i.exec(p))) {
      // CR 702.46a: "When this permanent is put into a graveyard from the battlefield, you may return target
      // Spirit card with mana value N or less from your graveyard to your hand."
      const n = Number(m[1]);
      const text = `return target Spirit card with mana value ${n} or less from your graveyard to your hand`;
      out.triggers.push({
        event: "selfDies",
        body: {
          targets: [{ kind: "card", owner: "you", subtypes: ["Spirit"], manaValue: { max: n }, text: `target Spirit card with mana value ${n} or less from your graveyard` }],
          effects: [{ type: "may", effects: [{ type: "bounce", what: { ref: "target", index: 0 } }], text }],
          text: `Soulshift ${n}: you may ${text}.`,
        },
      });
    } else if ((m = /^ward—pay (\d+) life\.?$/i.exec(p))) {
      // CR 702.21a with a life cost: "counter that spell or ability unless that player pays N life".
      const life = Number(m[1]);
      out.triggers.push({
        event: "becomesTargetOfOpponent",
        body: { targets: [], effects: [{ type: "counterUnlessPays", unless: { cost: "{0}", life }, ward: true }], text: `Ward—Pay ${life} life: counter that spell or ability unless its controller pays ${life} life.` },
      });
    } else if ((m = /^ward—((?:\{(?:\d+|[WUBRGC])\})+), pay (\d+) life\.?$/i.exec(p))) {
      // "Ward—{2}, Pay 2 life" (Gisa, the Hellraiser): both (CR 702.21a).
      const life = Number(m[2]);
      out.triggers.push({
        event: "becomesTargetOfOpponent",
        body: { targets: [], effects: [{ type: "counterUnlessPays", unless: { cost: m[1]!, life }, ward: true }], text: `Ward—${m[1]}, Pay ${life} life: counter that spell or ability unless its controller pays ${m[1]} and ${life} life.` },
      });
    } else if ((m = /^ward—pay life equal to (?:~|this creature)'s power\.?$/i.exec(p))) {
      // Phyrexian Fleshgorger, Raubahn: its power as the ward trigger resolves, or as it last existed (CR 608.2h).
      out.triggers.push({
        event: "becomesTargetOfOpponent",
        body: { targets: [], effects: [{ type: "counterUnlessPays", unless: { cost: "{0}", lifeAmount: { count: { kind: "power", of: { ref: "self" } } } }, ward: true }], text: "Ward—Pay life equal to ~'s power: counter that spell or ability unless its controller pays that much life." },
      });
    } else if ((m = /^ward—sacrifice (a|an|two|three) ([a-z][a-z0-9 ,]*?)\.?$/i.exec(p))) {
      // "Ward—Sacrifice a creature" (Vein Ripper), "a legendary artifact or legendary creature" (Sauron), "two
      // permanents" (Ulamog): permanents of that player's choice they control (CR 702.21a, 701.21a).
      const n = num(m[1]!);
      const words = n === 1 ? m[2]! : m[2]!.replace(/s$/, "");
      const filter = /\bor\b(?! (?:greater|less)\b)|,/.test(words) && !/^legendary artifact or legendary creature$/i.test(words) ? null : parseTargetPhrase(words);
      if (filter?.kind !== "object" || filter.controller || n < 1) return null;
      {
        const text = words;
        out.triggers.push({
          event: "becomesTargetOfOpponent",
          body: { targets: [], effects: [{ type: "counterUnlessPays", unless: { cost: "{0}", sacrifice: { n, filter: { ...filter, text } } }, ward: true }], text: `Ward—Sacrifice ${m[1]} ${m[2]}: counter that spell or ability unless its controller sacrifices ${m[1]} ${m[2]}.` },
        });
      }
    } else if ((m = /^ward—discard a card or pay ((?:\{(?:\d+|[WUBRGC])\})+)\.?$/i.exec(p))) {
      // "Ward—Discard a card or pay {2}" (Titania, Rugged Rumbler): counter it unless that player discards a card or pays
      // {2}, their choice (CR 702.21a).
      out.triggers.push({
        event: "becomesTargetOfOpponent",
        body: { targets: [], effects: [{ type: "counterUnlessPays", unless: { cost: "{0}", discard: 1, label: "Discard a card", orElse: { cost: m[1]!, label: `Pay ${m[1]}` } }, ward: true }], text: `Ward—Discard a card or pay ${m[1]}: counter that spell or ability unless its controller discards a card or pays ${m[1]}.` },
      });
    } else if ((m = /^ward—discard (a|two) cards?\.?$/i.exec(p))) {
      // CR 702.21a with a discard cost: "counter that spell or ability unless that player discards a card".
      const n = m[1] === "a" ? 1 : 2;
      out.triggers.push({
        event: "becomesTargetOfOpponent",
        body: { targets: [], effects: [{ type: "counterUnlessPays", unless: { cost: "{0}", discard: n }, ward: true }], text: `Ward—Discard ${m[1]} card${n === 1 ? "" : "s"}: counter that spell or ability unless its controller discards ${m[1]} card${n === 1 ? "" : "s"}.` },
      });
    } else if ((m = /^ward—discard (a|two) cards? at random\.?$/i.exec(p))) {
      // "Ward—Discard a card at random" (Alpharael, Stonechosen): the cards are chosen at random as they pay (CR 701.9c).
      const n = m[1] === "a" ? 1 : 2;
      out.triggers.push({
        event: "becomesTargetOfOpponent",
        body: { targets: [], effects: [{ type: "counterUnlessPays", unless: { cost: "{0}", discardRandom: n }, ward: true }], text: `Ward—Discard ${m[1]} card${n === 1 ? "" : "s"} at random: counter that spell or ability unless its controller discards ${m[1]} card${n === 1 ? "" : "s"} at random.` },
      });
    } else if ((m = new RegExp(`^ward—get ${NUM} poison counters?\\.?$`, "i").exec(p))) {
      // "Ward—Get five poison counters" (The Serpent Society): any player can get poison counters, so they can always pay
      // (CR 118.3, 122.1f).
      const n = num(m[1]!.toLowerCase());
      out.triggers.push({
        event: "becomesTargetOfOpponent",
        body: { targets: [], effects: [{ type: "counterUnlessPays", unless: { cost: "{0}", poison: n }, ward: true }], text: `Ward—Get ${m[1]} poison counter${n === 1 ? "" : "s"}: counter that spell or ability unless its controller gets ${m[1]} poison counter${n === 1 ? "" : "s"}.` },
      });
    } else if ((m = /^ward—blight (\d+)\.?$/i.exec(p))) {
      // "Ward—Blight 2" (Auntie Ool, Cursewretch): counter it unless that player puts two -1/-1 counters on one creature
      // they control (CR 702.21a, 701.68a), which they can't choose to do with no creature (701.68b).
      const n = Number(m[1]);
      out.triggers.push({
        event: "becomesTargetOfOpponent",
        body: { targets: [], effects: [{ type: "counterUnlessPays", unless: { cost: "{0}", blight: n }, ward: true }], text: `Ward—Blight ${n}: counter that spell or ability unless its controller blights ${n}.` },
      });
    } else if ((m = /^ward—collect evidence (\d+)\.?$/i.exec(p))) {
      // "Ward—Collect evidence 4" (Axebane Ferox): counter it unless that player exiles cards with total mana value 4 or
      // more from their graveyard (CR 702.21a, 701.59a), which they can't choose to do without enough (rulings).
      const n = Number(m[1]);
      out.triggers.push({
        event: "becomesTargetOfOpponent",
        body: { targets: [], effects: [{ type: "counterUnlessPays", unless: { cost: "{0}", collectEvidence: n }, ward: true }], text: `Ward—Collect evidence ${n}: counter that spell or ability unless its controller collects evidence ${n}.` },
      });
    } else if ((m = /^ward—waterbend \{(\d+)\}\.?$/i.exec(p))) {
      // "Ward—Waterbend {4}" (The Unagi of Kyoshi Island): counter it unless that player pays {4}, tapping their
      // artifacts and creatures for {1} each of it if they like (CR 702.21a, 701.67a).
      const n = Number(m[1]);
      out.triggers.push({
        event: "becomesTargetOfOpponent",
        body: { targets: [], effects: [{ type: "counterUnlessPays", unless: { cost: `{${n}}`, waterbend: n }, ward: true }], text: `Ward—Waterbend {${n}}: counter that spell or ability unless its controller waterbends {${n}}.` },
      });
    } else if ((m = /^ward ((?:\{(?:\d+|[WUBRGC])\})+)$/i.exec(p))) {
      // CR 702.21a: "Whenever this permanent becomes the target of a spell or ability an opponent
      // controls, counter that spell or ability unless that player pays [cost]."
      out.triggers.push({
        event: "becomesTargetOfOpponent",
        body: { targets: [], effects: [{ type: "counterUnlessPays", unless: { cost: m[1]! }, ward: true }], text: `Ward ${m[1]}: counter that spell or ability unless its controller pays ${m[1]}.` },
      });
    } else if ((m = /^(commander )?ninjutsu ((?:\{(?:\d+|[WUBRGC]|[WUBRG]\/[WUBRGP])\})+)$/i.exec(p))) {
      // CR 702.49a: "[Cost], Reveal this card from your hand, Return an unblocked attacking creature you control to
      // its owner's hand: Put this card onto the battlefield from your hand tapped and attacking." Commander ninjutsu
      // works from the command zone too (CR 702.49d); it isn't casting, so there's no commander tax.
      const cmd = !!m[1];
      out.activated.push({
        manaCost: m[2]!,
        tap: false,
        sacrificeSelf: false,
        sorcerySpeed: false,
        zone: "hand",
        keyword: "Ninjutsu", // commander ninjutsu is a ninjutsu ability (CR 702.49d)
        ...(cmd ? { orCommand: true as const } : {}),
        costs: [{ kind: "returnToHand", filter: { kind: "object", types: ["Creature"], controller: "you", text: "unblocked attacker you control" }, n: 1, unblockedAttacker: true }],
        body: { targets: [], effects: [{ type: "ninjutsu" }], text: cmd ? "Put ~ onto the battlefield tapped and attacking." : "Put ~ onto the battlefield from your hand tapped and attacking." },
        text: `${cmd ? "Commander ninjutsu" : "Ninjutsu"} ${m[2]}`,
      });
    } else if (/^myriad$/i.test(p)) {
      // CR 702.116a: "Whenever this creature attacks, for each opponent other than defending player, you may create a
      // token that's a copy of this creature that's tapped and attacking that player ... exile the tokens at end of combat."
      out.triggers.push({
        event: "selfAttacks",
        body: {
          targets: [],
          effects: [
            { type: "myriad" },
            { type: "delayed", when: "endOfCombat", each: "created", effects: [{ type: "exile", what: { ref: "subject" } }], text: "exile ~" },
          ],
          text: "Myriad: for each opponent other than defending player, you may create a token copy of ~ that's tapped and attacking that player. Exile the tokens at end of combat.",
        },
      });
    } else if ((m = /^mobilize (\d+)$/i.exec(p) ?? /^mobilize X, where X is (?:the number of )?(.+)$/i.exec(p))) {
      // CR 702.181a: "Whenever this creature attacks, create N tapped and attacking 1/1 red Warrior creature tokens.
      // Sacrifice them at the beginning of the next end step." "Mobilize X, where X is ..." (Avenger of the Fallen; "its
      // power" granted by Infantry Shield): X counted as the trigger resolves (CR 608.2h).
      const fixed = /^\d+$/.test(m[1]!);
      const x = fixed ? null : parseCount(m[1]!.replace(/^its power$/, "~'s power"), null, true);
      if (!fixed && !x) return null;
      const n: Amount = fixed ? Number(m[1]) : x!;
      const warrior: TokenSpec = { name: "Warrior", power: 1, toughness: 1, colors: ["R"], types: ["Creature"], subtypes: ["Warrior"], keywords: [] };
      out.triggers.push({
        event: "selfAttacks",
        body: {
          targets: [],
          effects: [
            { type: "createToken", who: { ref: "you" }, n, token: warrior, tapped: true, attacking: true },
            { type: "delayed", when: "nextEndStep", each: "created", effects: [{ type: "sacrifice", what: { ref: "subject" } }], text: "sacrifice ~" },
          ],
          text: fixed ? `Mobilize ${n}: create ${n === 1 ? "a" : n} tapped and attacking 1/1 red Warrior creature token${(n as number) > 1 ? "s" : ""}. Sacrifice ${(n as number) > 1 ? "them" : "it"} at the beginning of the next end step.` : `Mobilize X, where X is ${m[1]}: create X tapped and attacking 1/1 red Warrior creature tokens. Sacrifice them at the beginning of the next end step.`,
        },
      });
    } else if ((m = /^cycling ((?:\{(?:\d+|X|[WUBRGC]|[WUBRG]\/[WUBRGP])\})+)$/i.exec(p))) {
      // CR 702.29a: "[Cost], Discard this card: Draw a card." Only while the card is in your hand. An {X} in it (Shark
      // Typhoon) is chosen as it's activated (CR 107.3k), for "When you cycle this card" to use (rulings).
      out.activated.push({
        manaCost: m[1]!,
        tap: false,
        sacrificeSelf: false,
        sorcerySpeed: false,
        zone: "hand",
        discardSelf: true,
        cycling: true,
        body: { targets: [], effects: [{ type: "draw", who: { ref: "you" }, n: 1 }], text: "Draw a card." },
        text: `Cycling ${m[1]}`,
      });
    } else if ((m = /^cycling—pay (\d+) life\.?$/i.exec(p))) {
      // Street Wraith: "Cycling—Pay 2 life." The same ability with a life payment for its cost (CR 702.29a, 119.4).
      out.activated.push({
        manaCost: "",
        lifeCost: Number(m[1]),
        tap: false,
        sacrificeSelf: false,
        sorcerySpeed: false,
        zone: "hand",
        discardSelf: true,
        cycling: true,
        body: { targets: [], effects: [{ type: "draw", who: { ref: "you" }, n: 1 }], text: "Draw a card." },
        text: `Cycling—Pay ${m[1]} life`,
      });
    } else if ((m = /^cycling—(sacrifice an? [a-z]+)\.?$/i.exec(p)) && parseAdditionalCost(m[1]!)) {
      // Edge of Autumn: "Cycling—Sacrifice a land." The same ability with a sacrifice for its cost (CR 702.29a, 602.2b).
      out.activated.push({
        manaCost: "",
        costs: [parseAdditionalCost(m[1]!)!],
        tap: false,
        sacrificeSelf: false,
        sorcerySpeed: false,
        zone: "hand",
        discardSelf: true,
        cycling: true,
        body: { targets: [], effects: [{ type: "draw", who: { ref: "you" }, n: 1 }], text: "Draw a card." },
        text: `Cycling—${m[1]}`,
      });
    } else if ((m = /^reinforce (\d+|X)—((?:\{(?:\d+|[WUBRGC]|[WUBRG]\/[WUBRGP])\})+|\{X\}(?:\{(?:\d+|[WUBRGC])\})+)$/i.exec(p)) && (m[1] === "X") === m[2]!.startsWith("{X}")) {
      // CR 702.77a: "[Cost], Discard this card: Put N +1/+1 counters on target creature." Only from a hand (702.77b).
      // "Reinforce X—{X}{W}{W}" (Swell of Courage): X counters, the X paid (CR 107.3).
      const n: Amount = m[1] === "X" ? { count: { kind: "x" } } : Number(m[1]);
      out.activated.push({
        manaCost: m[2]!,
        tap: false,
        sacrificeSelf: false,
        sorcerySpeed: false,
        zone: "hand",
        discardSelf: true,
        body: { targets: [{ kind: "object", types: ["Creature"], text: "target creature" }], effects: [plus(n, { ref: "target", index: 0 })], text: `Put ${n === 1 ? "a +1/+1 counter" : `${m[1]} +1/+1 counters`} on target creature.` },
        text: `Reinforce ${m[1]}—${m[2]}`,
      });
    } else if ((m = /^transmute ((?:\{(?:\d+|[WUBRGC]|[WUBRG]\/[WUBRGP])\})+)$/i.exec(p))) {
      // CR 702.53a: "[Cost], Discard this card: Search your library for a card with the same mana value as the discarded
      // card, reveal that card, and put it into your hand. Then shuffle your library. Activate only as a sorcery."
      // Only in a hand, where a card's mana value is its printed one (CR 202.3).
      const mv = d.cmc;
      out.activated.push({
        manaCost: m[1]!,
        tap: false,
        sacrificeSelf: false,
        sorcerySpeed: true,
        zone: "hand",
        discardSelf: true,
        body: { targets: [], effects: [{ type: "search", filter: { kind: "card", manaValue: { min: mv, max: mv }, text: `card with mana value ${mv}` }, n: 1, upTo: false, reveal: true, dest: { zone: "hand" } }], text: `Search your library for a card with mana value ${mv}, reveal it, put it into your hand, then shuffle.` },
        text: `Transmute ${m[1]}`,
      });
    } else if ((m = /^transfigure ((?:\{(?:\d+|[WUBRGC]|[WUBRG]\/[WUBRGP])\})+)$/i.exec(p))) {
      // CR 702.71a: "[Cost], Sacrifice this permanent: Search your library for a creature card with the same mana value as
      // this permanent and put it onto the battlefield. Then shuffle your library. Activate only as a sorcery." Only on the
      // battlefield (rulings), its mana value as it was sacrificed: its printed one, or the copied one for a copy.
      const mv = d.cmc;
      out.activated.push({
        manaCost: m[1]!,
        tap: false,
        sacrificeSelf: true,
        sorcerySpeed: true,
        body: { targets: [], effects: [{ type: "search", filter: { kind: "card", types: ["Creature"], notTypes: [], notColors: [], manaValue: { min: mv, max: mv }, text: `creature card with mana value ${mv}` }, n: 1, upTo: false, reveal: false, dest: { zone: "battlefield" } }], text: `Search your library for a creature card with mana value ${mv}, put it onto the battlefield, then shuffle.` },
        text: `Transfigure ${m[1]}`,
      });
    } else if ((m = /^([a-z]+(?: [a-z]+)?)cycling ((?:\{(?:\d+|[WUBRGC]|[WUBRG]\/[WUBRGP])\})+)$/i.exec(p))) {
      // CR 702.29e: "[Type]cycling [cost]" means "[Cost], Discard this card: Search your library for a
      // [type] card, reveal it, put it into your hand, then shuffle." It's a cycling ability (702.29f).
      const type = m[1]!
        .split(" ")
        .map((w) => (CREATURE_TYPES.has(capital(w.toLowerCase())) || BASIC_TYPES.includes(capital(w.toLowerCase())) ? capital(w.toLowerCase()) : w.toLowerCase()))
        .join(" ");
      const filter = parseSearchFilter(`${type} card`);
      if (!filter) return null;
      out.activated.push({
        manaCost: m[2]!,
        tap: false,
        sacrificeSelf: false,
        sorcerySpeed: false,
        zone: "hand",
        discardSelf: true,
        cycling: true,
        body: { targets: [], effects: [{ type: "search", filter, n: 1, upTo: false, reveal: true, dest: { zone: "hand" } }], text: `Search your library for a ${filter.text}, reveal it, put it into your hand, then shuffle.` },
        text: `${capital(m[1]!.toLowerCase())}cycling ${m[2]}`,
      });
    } else if ((m = /^crew (\d+)$/i.exec(p)) && d.subtypes.includes("Vehicle")) {
      // CR 702.122a: "Tap any number of other untapped creatures you control with total power N or
      // greater: This permanent becomes an artifact creature until end of turn." It keeps its other
      // types and subtypes, Vehicle included (CR 205.1b).
      out.activated.push({
        manaCost: "",
        tap: false,
        sacrificeSelf: false,
        sorcerySpeed: false,
        crew: Number(m[1]),
        body: {
          targets: [],
          effects: [{ type: "continuous", what: { ref: "self" }, mods: [{ kind: "addTypes", types: ["Artifact", "Creature"], subtypes: [] }], duration: "endOfTurn" }, { type: "becameCrewed" }],
          text: "~ becomes an artifact creature until end of turn.",
        },
        text: `Crew ${m[1]}`,
      });
    } else if ((m = /^level up ((?:\{[0-9WUBRGC]+\})+)$/i.exec(p))) {
      // CR 702.87a: "[Cost]: Put a level counter on this permanent. Activate only as a sorcery."
      out.activated.push({
        manaCost: m[1]!,
        tap: false,
        sacrificeSelf: false,
        sorcerySpeed: true,
        body: { targets: [], effects: [{ type: "counters", what: { ref: "self" }, counter: "level", n: 1 }], text: "Put a level counter on ~." },
        text: `Level up ${m[1]}`,
      });
    } else if (/^station$/i.test(p)) {
      // CR 702.184a: "Tap another untapped creature you control: Put a number of charge counters on this permanent equal
      // to the tapped creature's power. Activate only as a sorcery." X is that power as the ability resolves (rulings).
      out.activated.push({
        manaCost: "",
        tap: false,
        sacrificeSelf: false,
        sorcerySpeed: true,
        station: true,
        body: { targets: [], effects: [{ type: "counters", what: { ref: "self" }, counter: "charge", n: { count: { kind: "stationPower" } } }], text: "Put charge counters equal to the tapped creature's power on ~." },
        text: "Station",
      });
    } else if ((m = /^saddle (\d+)$/i.exec(p))) {
      // CR 702.171a: "Tap any number of other untapped creatures you control with total power N or greater: This
      // permanent becomes saddled until end of turn. Activate only as a sorcery."
      out.activated.push({
        manaCost: "",
        tap: false,
        sacrificeSelf: false,
        sorcerySpeed: true,
        crew: Number(m[1]),
        saddle: true,
        body: { targets: [], effects: [{ type: "becomeSaddled", what: { ref: "self" } }], text: "~ becomes saddled until end of turn." },
        text: `Saddle ${m[1]}`,
      });
    } else return null;
  }
  return out;
}

/**
 * Keywords that the card data only names generically ("Protection", "Toxic") but whose
 * details are in the text: "Protection from black", "Toxic 2". These replace the generic
 * ones in the printed characteristics (see layers.ts).
 */
export function textKeywords(line: string): string[] {
  const out: string[] = [];
  for (const raw of line.split(/[,;]\s*/)) {
    const p = raw.trim();
    if (/^(?:protection|hexproof) from /i.test(p) && keywordOf(p)) out.push(keywordOf(p)!);
    const tox = /^toxic (\d+)$/i.exec(p);
    if (tox) out.push(`Toxic ${tox[1]}`);
    // Scryfall's keyword list leaves it out (Thrasta, Tempest's Roar): CR 702.19c.
    if (/^trample over planeswalkers$/i.test(p)) out.push("Trample over planeswalkers");
    // Master of the Hunt's Wolves of the Hunt: "bands with other creatures named Wolves of the Hunt" (CR 702.22b), a token
    // ability no card data lists.
    if (/^bands with other /i.test(p) && keywordOf(p)) out.push(keywordOf(p)!);
  }
  return out;
}

export function isKeywordLine(line: string): boolean {
  return line
    .split(/[,;]\s*/)
    .every((p) => !!keywordOf(p));
}

/**
 * Ripple N (CR 702.60a): "When you cast this spell, you may reveal the top N cards of your library. If you do, you may
 * cast any of those cards with the same name as this spell without paying their mana costs, then put all revealed
 * cards not cast this way on the bottom of your library in any order." `of`: given by Thrumming Stone, the spell cast.
 */
export function rippleBody(n: number, of?: "cause"): AbilityBody {
  return {
    targets: [],
    effects: [{ type: "may", effects: [{ type: "ripple", n, ...(of ? { of } : {}) }], text: `reveal the top ${n} cards of your library (ripple ${n})` }],
    text: `Ripple ${n}: you may reveal the top ${n} cards of your library and cast those with the same name as ${of ? "that spell" : "~"} without paying their mana costs. Put the rest on the bottom of your library in any order.`,
  };
}
