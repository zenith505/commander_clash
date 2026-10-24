import type { Amount, Modification, SearchDest, PayCost } from "../abilities";
import { power, toughness } from "../cards";
import { player } from "../game";
import { describeAmount } from "../amounts";
import { keywordLabel } from "../keywords";
import type { Color, GameState, PlayerId } from "../types";

export const COLOR_NAMES: Record<Color, string> = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" };

/** "{2} and 1 life", "{E}{E}", for prompts and logs. */
export function describePay(pay: PayCost): string {
  return [pay.mana, pay.life ? `${pay.life} life` : "", pay.energy ? "{E}".repeat(pay.energy) : ""].filter(Boolean).join(" and ");
}

/** "onto the battlefield tapped", for search prompts. */
export function describeDest(d: SearchDest): string {
  return d.zone === "hand"
    ? "into your hand"
    : d.zone === "battlefield"
      ? `onto the battlefield${d.tapped ? " tapped" : ""}`
      : d.zone === "libraryTop"
        ? d.third ? "into your library third from the top" : "on top of your library"
        : d.zone === "graveyard"
          ? "into your graveyard"
          : d.zone === "cast"
            ? "to cast"
            : "into exile";
}

const sign = (n: Amount) => (typeof n !== "number" ? describeAmount(n) : n >= 0 ? `+${n}` : `${n}`);

/** "gets +2/+2 and gains flying", for the log. */
export function describeMods(s: GameState, mods: Modification[], controller: PlayerId, plural = false): string {
  const parts: string[] = [];
  for (const m of mods) {
    if (m.kind === "cantBlock" || m.kind === "cantAttack") {
      parts.push(`can't ${m.kind === "cantBlock" ? "block" : "attack"}`);
      continue;
    }
    if (m.kind === "cantBeBlocked") {
      parts.push("can't be blocked");
      continue;
    }
    if (m.kind === "cantAttackPlayers") {
      const who = Array.isArray(m.players) ? m.players.map((p) => player(s, p).name) : [];
      parts.push(who.length ? `can't attack ${who.join(" or ")} or their planeswalkers${m.combat !== undefined ? " this combat" : ""}` : `can attack anyone${m.combat !== undefined ? " this combat" : ""}`);
      continue;
    }
    if (m.kind === "cantAttackYou") {
      parts.push(`can't attack ${player(s, controller).name} or their planeswalkers`);
      continue;
    }
    if (m.kind === "goad" && m.notGoaded) {
      parts.push(`attack${plural ? "" : "s"} each combat if able and attack${plural ? "" : "s"} a player other than ${player(s, controller).name} if able`);
      continue;
    }
    if (m.kind === "goad") {
      parts.push(`${plural ? "are" : "is"} goaded by ${player(s, controller).name}`);
      continue;
    }
    if (m.kind === "cantActivate") {
      parts.push(`can't have ${plural ? "their" : "its"} activated abilities activated`);
      continue;
    }
    if (m.kind === "doesntUntap") {
      parts.push(plural ? "don't untap" : "doesn't untap");
      continue;
    }
    if (m.kind === "modifyPT") parts.push(`gets ${sign(m.power)}/${sign(m.toughness)}`);
    else if (m.kind === "setPT") parts.push(`has base power and toughness ${describeAmount(m.power)}/${describeAmount(m.toughness)}`);
    else if (m.kind === "setName") parts.push(`is named ${m.name}`);
    else if (m.kind === "setPower") parts.push(`has base power ${describeAmount(m.power)}`);
    else if (m.kind === "setToughness") parts.push(`has base toughness ${describeAmount(m.toughness)}`);
    else if (m.kind === "switchPT") parts.push("has its power and toughness switched");
    else if (m.kind === "addKeywords") parts.push(`gains ${m.keywords.map((k) => keywordLabel(k, (x) => player(s, x).name)).join(", ").toLowerCase()}`);
    else if (m.kind === "addAbility") parts.push(`gains "${m.text.replace(/~/g, "this creature")}"`);
    else if (m.kind === "removeKeywords") parts.push(`loses ${m.keywords.join(", ").toLowerCase()}`);
    else if (m.kind === "loseAllAbilities") parts.push("loses all abilities");
    else if (m.kind === "control") parts.push(`comes under ${player(s, controller).name}'s control`);
    else if (m.kind === "cantBeBlockedBy") parts.push(`can't be blocked by ${m.filter.text}`);
    else if (m.kind === "setColors") parts.push(`becomes ${m.colors.map((c) => COLOR_NAMES[c].toLowerCase()).join(" and ") || "colorless"}`);
    else if (m.kind === "setLandTypes") parts.push(`becomes ${m.subtypes.map((t) => (t === "Plains" ? t : `${/^[AEIOU]/.test(t) ? "an" : "a"} ${t}`)).join(" ")}`);
    else if (m.kind === "setSubtypes" || m.kind === "setTypes" || m.kind === "addTypes")
      parts.push(`becomes ${[...("types" in m ? m.types : []), ...m.subtypes].join(" ")}`.trim());
    else parts.push(m.kind.replace(/([A-Z])/g, " $1").toLowerCase());
  }
  const out = parts.join(" and ");
  // "Arcbound Worker and Germ get +1/+1 and gain flying"
  return plural ? out.replace(/\b(gets|gains|loses|comes|becomes|has)\b/g, (w) => ({ gets: "get", gains: "gain", loses: "lose", comes: "come", becomes: "become", has: "have" })[w]!).replace("have its power and toughness switched", "have their power and toughness switched") : out;
}
