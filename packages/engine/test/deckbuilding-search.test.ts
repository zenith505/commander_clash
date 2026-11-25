// The deck builder's card search, in Scryfall's syntax, over real card data (the browser tests' card file).

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCardQuery, searchCards, type CardDef } from "../src";
import { card } from "./helpers";

const CARDS: CardDef[] = JSON.parse(readFileSync(new URL("../../../apps/web/e2e/cards.json", import.meta.url), "utf8"));
const names = (q: string) => searchCards(CARDS, q).map((c) => c.name);
const has = (q: string, ...want: string[]) => {
  const got = names(q);
  for (const w of want) expect(got, `${q} should find ${w}`).toContain(w);
};
const hasNot = (q: string, ...unwanted: string[]) => {
  const got = names(q);
  for (const w of unwanted) expect(got, `${q} shouldn't find ${w}`).not.toContain(w);
};
const every = (q: string, test: (d: CardDef) => boolean) => {
  const got = searchCards(CARDS, q);
  expect(got.length, `${q} finds something`).toBeGreaterThan(0);
  for (const d of got) expect(test(d), `${q}: ${d.name}`).toBe(true);
};

describe("deck builder search (Scryfall syntax)", () => {
  it("bare words match names, all of them, ignoring case and accents", () => {
    has("sol ring", "Sol Ring");
    has("bolt", "Lightning Bolt");
    every("lightning bolt", (d) => /lightning/i.test(d.name) && /bolt/i.test(d.name));
    has("altair", "Altaïr Ibn-La'Ahad");
    expect(names("")).toHaveLength(CARDS.length);
  });

  it("exact names with ! and quoted phrases", () => {
    expect(names('!"Sol Ring"')).toEqual(["Sol Ring"]);
    expect(names("!counterspell")).toEqual(["Counterspell"]);
    every('"lightning bolt"', (d) => /lightning bolt/i.test(d.name));
  });

  it("t: and o: match type lines and rules text (of any face), o:/regex/ too", () => {
    // Each part can match a different face (The Legend of Yangchen's back face is the creature), as on Scryfall.
    every("t:legendary t:creature", (d) => (d.faces ?? [d]).some((f) => f.typeLine.includes("Legendary")) && (d.faces ?? [d]).some((f) => f.typeLine.includes("Creature")));
    every("t:instant", (d) => (d.faces ?? [d]).some((f) => f.typeLine.includes("Instant")));
    has("o:\"deals 3 damage\" t:instant", "Lightning Bolt");
    has("o:/counter target (spell|creature)/", "Counterspell");
    // `~` stands for the card's own name.
    has('o:"~ deals 3 damage"', "Lightning Bolt");
    // A modal double-faced card's back face is searched too.
    has("t:land o:\"enters tapped\" kazandu", "Kazandu Mammoth // Kazandu Valley");
  });

  it("o: leaves out reminder text, fo: includes it", () => {
    const mace = card("+2 Mace", "Artifact — Equipment", "{1}{W}", { oracleText: "Equipped creature gets +2/+2.\nEquip {3} ({3}: Attach to target creature you control. Equip only as a sorcery.)" });
    expect(searchCards([mace], 'o:"attach to target"')).toEqual([]);
    expect(searchCards([mace], 'fo:"attach to target"')).toEqual([mace]);
    expect(searchCards([mace], 'o:"equip {3}"')).toEqual([mace]);
  });

  it("c: is at least those colors, c= exactly, c<= at most, c:c colorless, c:m multicolored", () => {
    every("c:r", (d) => d.colors.includes("R") || !!d.faces?.some((f) => f.colors.includes("R")));
    every("c=ur", (d) => [...new Set([...(d.faces ?? [d]).flatMap((f) => f.colors)])].sort().join("") === "RU");
    every("c<=g", (d) => (d.faces ?? [d]).every((f) => f.colors.every((c) => c === "G")));
    every("c:c t:artifact", (d) => (d.faces ?? [d]).every((f) => f.colors.length === 0));
    has("c:c", "Sol Ring");
    every("c:m", (d) => new Set((d.faces ?? [d]).flatMap((f) => f.colors)).size >= 2);
    has("c:izzet", "Fire // Ice");
    every("c:2", (d) => new Set((d.faces ?? [d]).flatMap((f) => f.colors)).size === 2);
    every("c>=3", (d) => new Set((d.faces ?? [d]).flatMap((f) => f.colors)).size >= 3);
    every("id:m", (d) => d.colorIdentity.length >= 2);
  });

  it("id: is within that color identity (for a commander's deck), id= exactly", () => {
    every("id:g", (d) => d.colorIdentity.every((c) => c === "G"));
    has("id:g", "Llanowar Elves", "Sol Ring", "Forest");
    hasNot("id:g", "Lightning Bolt");
    every("id=esper", (d) => [...d.colorIdentity].sort().join("") === "BUW");
    every("id>=wubrg", (d) => d.colorIdentity.length === 5);
    every("commander:c", (d) => d.colorIdentity.length === 0);
  });

  it("mana value, power, toughness and their comparisons", () => {
    every("mv>=7", (d) => d.cmc >= 7);
    every("cmc=1 t:instant", (d) => d.cmc === 1);
    every("mv:even", (d) => d.cmc % 2 === 0);
    every("pow>=5 t:creature", (d) => (d.faces ?? [d]).some((f) => Number(f.power) >= 5));
    // On the same face: Aang, Swift Savior is 2/3 and its back face 5/5.
    every("t:creature pow>tou", (d) => (d.faces ?? [d]).some((f) => Number(f.power) > Number(f.toughness)));
    hasNot("pow>tou", "Aang, Swift Savior // Aang and La, Ocean's Fury");
    every("pt>=10", (d) => (d.faces ?? [d]).some((f) => Number(f.power) + Number(f.toughness) >= 10));
  });

  it("m: matches mana symbols in the cost", () => {
    has("m:{U}{U}", "Counterspell");
    has("m:uu", "Counterspell");
    hasNot("m:uu", "Lightning Bolt");
    expect(names("m={U}{U} t:instant")).toContain("Counterspell");
    // Any face's cost (Jadzi's back face, Journey to the Oracle, costs {2}{G}{G}).
    every("m:{2}{G}{G}", (d) => (d.faces ?? [d]).some((f) => (f.manaCost.match(/\{G\}/g) ?? []).length >= 2));
    has("m:{2}{G}{G}", "Jadzi, Oracle of Arcavios // Journey to the Oracle");
  });

  it("is:, kw:, r:, s:, year: and produces:", () => {
    every("is:commander", (d) => d.supertypes.includes("Legendary") || /can be your commander/i.test(d.oracleText));
    every("is:gamechanger", (d) => !!(d as CardDef & { gameChanger?: boolean }).gameChanger);
    has("is:gamechanger", "Force of Will", "Cyclonic Rift");
    every("kw:flying", (d) => d.keywords.includes("Flying"));
    every("r:mythic", (d) => (d as CardDef & { rarity?: string }).rarity === "mythic");
    every("r>=rare", (d) => ["rare", "mythic", "special"].includes((d as CardDef & { rarity?: string }).rarity!));
    const sol = CARDS.find((c) => c.name === "Sol Ring") as CardDef & { set: string; releasedAt: string };
    has(`s:${sol.set} sol`, "Sol Ring");
    has(`year=${sol.releasedAt.slice(0, 4)} sol ring`, "Sol Ring");
    every("produces:g t:land", (d) => (d.producedMana ?? []).includes("G"));
    every("is:mdfc", (d) => d.layout === "modal_dfc");
  });

  it("negation, or, parentheses", () => {
    every("t:creature -t:legendary c=g", (d) => !d.supertypes.includes("Legendary"));
    const either = names("!counterspell or !\"lightning bolt\"");
    expect(either.sort()).toEqual(["Counterspell", "Lightning Bolt"]);
    every("(t:instant or t:sorcery) c=r mv=1", (d) => d.types.includes("Instant") || d.types.includes("Sorcery"));
    every("-(c:r or c:g) t:creature", (d) => !d.colors.includes("R") && !d.colors.includes("G"));
  });

  it("order: and dir: sort the results", () => {
    const byMv = searchCards(CARDS, "t:creature c=g order:mv dir:desc");
    for (let i = 1; i < byMv.length; i++) expect(byMv[i - 1]!.cmc).toBeGreaterThanOrEqual(byMv[i]!.cmc);
    const byName = searchCards(CARDS, "c=g t:creature");
    for (let i = 1; i < byName.length; i++) expect(byName[i - 1]!.name.localeCompare(byName[i]!.name)).toBeLessThanOrEqual(0);
  });

  it("reports what it can't use, and matches as if that part weren't there", () => {
    const q = parseCardQuery("usd<5 sol ring");
    expect(q.problems).toHaveLength(1);
    expect(q.problems[0]).toMatch(/usd/);
    expect(searchCards(CARDS, q).map((c) => c.name)).toContain("Sol Ring");
    expect(parseCardQuery("c:purple").problems[0]).toMatch(/unknown color/);
    expect(parseCardQuery("f:modern").problems[0]).toMatch(/Commander/);
    expect(parseCardQuery("f:commander").problems).toEqual([]);
    expect(parseCardQuery("(t:elf").problems[0]).toMatch(/parenthesis/);
  });
});
