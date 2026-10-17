// The card database keeps every face of split, flip, double-faced, meld, adventurer and preparation cards
// (CR 709, 710, 712, 715, 722), built from Scryfall card objects by cardFromScryfall (tools/build-cards.ts), from a
// small extract of the bulk file that tools/scryfall-extract.mjs writes.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { cardFromScryfall, isFullySupported } from "../src";

// Scryfall card objects as the bulk files have them (fields the build doesn't read left out).
const printing = { object: "card", lang: "en", set_type: "expansion", legalities: { commander: "legal" }, highres_image: true, frame: "2015", border_color: "black" };
const img = (id: string, side = "front") => ({ normal: `https://cards.scryfall.io/normal/${side}/${id}.jpg`, art_crop: `https://cards.scryfall.io/art_crop/${side}/${id}.jpg` });

const delver = {
  ...printing,
  oracle_id: "edd531b9-f615-4399-8c8c-1c5e18c4acbf",
  name: "Delver of Secrets // Insectile Aberration",
  layout: "transform",
  cmc: 1,
  type_line: "Creature — Human Wizard // Creature — Human Insect",
  color_identity: ["U"],
  keywords: ["Flying", "Transform"],
  set: "dbl",
  released_at: "2022-01-28",
  rarity: "uncommon",
  card_faces: [
    {
      object: "card_face",
      name: "Delver of Secrets",
      mana_cost: "{U}",
      type_line: "Creature — Human Wizard",
      oracle_text:
        "At the beginning of your upkeep, look at the top card of your library. You may reveal that card. If an instant or sorcery card is revealed this way, transform this creature.",
      colors: ["U"],
      power: "1",
      toughness: "1",
      image_uris: img("delver"),
    },
    {
      object: "card_face",
      name: "Insectile Aberration",
      mana_cost: "",
      type_line: "Creature — Human Insect",
      oracle_text: "Flying",
      colors: ["U"],
      color_indicator: ["U"],
      power: "3",
      toughness: "2",
      image_uris: img("delver", "back"),
    },
  ],
};

const fireIce = {
  ...printing,
  oracle_id: "ae92942b-919c-4ea9-b693-85fcef765d5a",
  name: "Fire // Ice",
  layout: "split",
  mana_cost: "{1}{R} // {1}{U}",
  cmc: 4,
  type_line: "Instant // Instant",
  colors: ["R", "U"],
  color_identity: ["R", "U"],
  keywords: [],
  set: "ddj",
  released_at: "2012-09-07",
  rarity: "uncommon",
  image_uris: img("fire-ice"),
  card_faces: [
    { object: "card_face", name: "Fire", mana_cost: "{1}{R}", type_line: "Instant", oracle_text: "Fire deals 2 damage divided as you choose among one or two targets." },
    { object: "card_face", name: "Ice", mana_cost: "{1}{U}", type_line: "Instant", oracle_text: "Tap target permanent.\nDraw a card." },
  ],
};

const bonecrusher = {
  ...printing,
  oracle_id: "d6d72f5f-8f5d-4180-b514-f22ff5482902",
  name: "Bonecrusher Giant // Stomp",
  layout: "adventure",
  mana_cost: "{2}{R} // {1}{R}",
  cmc: 3,
  type_line: "Creature — Giant // Instant — Adventure",
  colors: ["R"],
  color_identity: ["R"],
  keywords: [],
  set: "eld",
  released_at: "2019-10-04",
  rarity: "rare",
  image_uris: img("bonecrusher"),
  card_faces: [
    {
      object: "card_face",
      name: "Bonecrusher Giant",
      mana_cost: "{2}{R}",
      type_line: "Creature — Giant",
      oracle_text: "Whenever this creature becomes the target of a spell, this creature deals 2 damage to that spell's controller.",
      power: "4",
      toughness: "3",
    },
    { object: "card_face", name: "Stomp", mana_cost: "{1}{R}", type_line: "Instant — Adventure", oracle_text: "Damage can't be prevented this turn. Stomp deals 2 damage to any target." },
  ],
};

const valki = {
  ...printing,
  oracle_id: "907ae517-22d5-4ac7-bc3a-3f4d5eaeeb57",
  name: "Valki, God of Lies // Tibalt, Cosmic Impostor",
  layout: "modal_dfc",
  cmc: 2,
  type_line: "Legendary Creature — God // Legendary Planeswalker — Tibalt",
  color_identity: ["B", "R"],
  keywords: [],
  produced_mana: ["R"],
  set: "khm",
  released_at: "2021-02-05",
  rarity: "mythic",
  card_faces: [
    {
      object: "card_face",
      name: "Valki, God of Lies",
      mana_cost: "{1}{B}",
      type_line: "Legendary Creature — God",
      oracle_text:
        "When Valki enters, each opponent reveals their hand. For each opponent, exile a creature card they revealed this way until Valki leaves the battlefield.\n{X}: Choose a creature card exiled with Valki with mana value X. Valki becomes a copy of that card.",
      colors: ["B"],
      power: "2",
      toughness: "1",
      image_uris: img("valki"),
    },
    {
      object: "card_face",
      name: "Tibalt, Cosmic Impostor",
      mana_cost: "{5}{R}",
      type_line: "Legendary Planeswalker — Tibalt",
      oracle_text:
        "As Tibalt enters, you get an emblem with \"You may play cards exiled with Tibalt, Cosmic Impostor, and you may spend mana as though it were mana of any color to cast those spells.\"\n+2: Exile the top card of each player's library.\n−3: Exile target artifact or creature.\n−8: Exile all cards from all graveyards. Add {R}{R}{R}.",
      colors: ["R"],
      loyalty: "5",
      image_uris: img("valki", "back"),
    },
  ],
};

const akki = {
  ...printing,
  oracle_id: "akki-lavarunner",
  name: "Akki Lavarunner // Tok-Tok, Volcano Born",
  layout: "flip",
  mana_cost: "{3}{R}",
  cmc: 4,
  type_line: "Creature — Goblin Warrior // Legendary Creature — Goblin Shaman",
  colors: ["R"],
  color_identity: ["R"],
  keywords: ["Haste", "Protection"],
  set: "chk",
  released_at: "2004-10-01",
  rarity: "rare",
  image_uris: img("akki"),
  card_faces: [
    { object: "card_face", name: "Akki Lavarunner", mana_cost: "{3}{R}", type_line: "Creature — Goblin Warrior", oracle_text: "Haste\nWhenever this creature deals damage to an opponent, flip it.", power: "1", toughness: "1" },
    {
      object: "card_face",
      name: "Tok-Tok, Volcano Born",
      mana_cost: "",
      type_line: "Legendary Creature — Goblin Shaman",
      oracle_text: "Protection from red\nIf a red source would deal damage to a player, it deals that much damage plus 1 to that player instead.",
      power: "2",
      toughness: "2",
    },
  ],
};

const meldParts = [
  { object: "related_card", component: "meld_part", name: "Gisela, the Broken Blade" },
  { object: "related_card", component: "meld_part", name: "Bruna, the Fading Light" },
  { object: "related_card", component: "meld_result", name: "Brisela, Voice of Nightmares" },
];
const gisela = {
  ...printing,
  oracle_id: "gisela",
  name: "Gisela, the Broken Blade",
  layout: "meld",
  mana_cost: "{2}{W}{W}",
  cmc: 4,
  type_line: "Legendary Creature — Angel Horror",
  oracle_text:
    "Flying, first strike, lifelink\nAt the beginning of your end step, if you both own and control Gisela, the Broken Blade and a creature named Bruna, the Fading Light, exile them, then meld them into Brisela, Voice of Nightmares.",
  power: "4",
  toughness: "3",
  colors: ["W"],
  color_identity: ["W"],
  keywords: ["Flying", "First strike", "Lifelink", "Meld"],
  all_parts: meldParts,
  set: "emn",
  released_at: "2016-07-22",
  rarity: "mythic",
};
const brisela = {
  ...printing,
  oracle_id: "brisela",
  name: "Brisela, Voice of Nightmares",
  layout: "meld",
  mana_cost: "",
  cmc: 11,
  type_line: "Legendary Creature — Eldrazi Angel",
  oracle_text: "Flying, first strike, vigilance, lifelink\nYour opponents can't cast spells with mana value 3 or less.",
  power: "9",
  toughness: "10",
  colors: ["W"],
  color_identity: ["W"],
  keywords: ["Flying", "First strike", "Vigilance", "Lifelink"],
  all_parts: meldParts,
  set: "emn",
  released_at: "2016-07-22",
  rarity: "mythic",
};

describe("card faces from Scryfall", () => {
  it("a transforming card keeps its front face's characteristics and adds both faces (CR 712.8a)", () => {
    const d = cardFromScryfall(delver);
    // What the card database had before faces were kept.
    expect(d).toMatchObject({
      name: "Delver of Secrets // Insectile Aberration",
      manaCost: "{U}",
      cmc: 1,
      typeLine: "Creature — Human Wizard // Creature — Human Insect",
      types: ["Creature"],
      subtypes: ["Human", "Wizard"],
      oracleText: delver.card_faces[0]!.oracle_text,
      power: "1",
      toughness: "1",
      colors: ["U"],
      colorIdentity: ["U"],
      imageUrl: img("delver").normal,
      layout: "transform",
    });
    expect(d.faces).toEqual([
      {
        name: "Delver of Secrets",
        manaCost: "{U}",
        typeLine: "Creature — Human Wizard",
        supertypes: [],
        types: ["Creature"],
        subtypes: ["Human", "Wizard"],
        oracleText: delver.card_faces[0]!.oracle_text,
        power: "1",
        toughness: "1",
        colors: ["U"],
        imageUrl: img("delver").normal,
        artUrl: img("delver").art_crop,
      },
      {
        name: "Insectile Aberration",
        manaCost: "",
        typeLine: "Creature — Human Insect",
        supertypes: [],
        types: ["Creature"],
        subtypes: ["Human", "Insect"],
        oracleText: "Flying",
        power: "3",
        toughness: "2",
        colors: ["U"],
        colorIndicator: ["U"],
        imageUrl: img("delver", "back").normal,
        artUrl: img("delver", "back").art_crop,
      },
    ]);
    expect(isFullySupported(d)).toBe(false);
  });

  it("a split card's halves each have their own mana cost and color (CR 709.1, 202.2); the image is the card's", () => {
    const d = cardFromScryfall(fireIce);
    expect(d.manaCost).toBe("{1}{R} // {1}{U}");
    expect(d.faces!.map((f) => [f.name, f.manaCost, f.types, f.colors, f.oracleText])).toEqual([
      ["Fire", "{1}{R}", ["Instant"], ["R"], "Fire deals 2 damage divided as you choose among one or two targets."],
      ["Ice", "{1}{U}", ["Instant"], ["U"], "Tap target permanent.\nDraw a card."],
    ]);
    expect(d.faces!.some((f) => f.imageUrl)).toBe(false);
    expect(d.imageUrl).toBe(img("fire-ice").normal);
    expect(isFullySupported(d)).toBe(false);
  });

  it("an adventurer card's Adventure (CR 715.2) and a modal double-faced card's back (712.3)", () => {
    const giant = cardFromScryfall(bonecrusher);
    expect(giant.faces![1]).toMatchObject({ name: "Stomp", manaCost: "{1}{R}", types: ["Instant"], subtypes: ["Adventure"], colors: ["R"] });
    expect(giant.faces![0]).toMatchObject({ name: "Bonecrusher Giant", power: "4", toughness: "3" });
    const v = cardFromScryfall(valki);
    expect(v.faces![1]).toMatchObject({ name: "Tibalt, Cosmic Impostor", manaCost: "{5}{R}", supertypes: ["Legendary"], types: ["Planeswalker"], subtypes: ["Tibalt"], loyalty: "5", colors: ["R"] });
    expect(v.faces![1]!.power).toBeUndefined();
    expect(v.producedMana).toEqual(["R"]);
  });

  it("a flip card's flipped half keeps the card's mana cost and color (CR 710.1c)", () => {
    const d = cardFromScryfall(akki);
    expect(d.faces![1]).toMatchObject({ name: "Tok-Tok, Volcano Born", manaCost: "{3}{R}", colors: ["R"], supertypes: ["Legendary"], power: "2", toughness: "2" });
  });

  it("a meld pair and the melded permanent they become (CR 712.5c), which can't be in a deck (712.4b)", () => {
    const g = cardFromScryfall(gisela);
    const b = cardFromScryfall(brisela);
    const meld = { parts: ["Bruna, the Fading Light", "Gisela, the Broken Blade"], result: "Brisela, Voice of Nightmares" };
    expect(g.meld).toEqual(meld);
    expect(b.meld).toEqual(meld);
    expect(g.faces).toBeUndefined();
    expect(isFullySupported(b)).toBe(false);
  });

  it("a card with one face has no faces or meld", () => {
    const bears = cardFromScryfall({ ...printing, oracle_id: "bears", name: "Grizzly Bears", layout: "normal", mana_cost: "{1}{G}", cmc: 2, type_line: "Creature — Bear", oracle_text: "", power: "2", toughness: "2", colors: ["G"], color_identity: ["G"], keywords: [] });
    expect(bears.faces).toBeUndefined();
    expect(bears.meld).toBeUndefined();
    expect(isFullySupported(bears)).toBe(true);
  });

  it('"Time Lord" is one creature type (CR 205.3m), so a rebuilt card database fixes the old split', () => {
    const doctor = cardFromScryfall({ ...printing, oracle_id: "eighth", name: "The Eighth Doctor", layout: "normal", type_line: "Legendary Creature — Time Lord Doctor", color_identity: [], keywords: [] });
    expect(doctor.subtypes).toEqual(["Time Lord", "Doctor"]);
  });
});

describe("tools/scryfall-extract.mjs", () => {
  const script = join(import.meta.dirname, "..", "..", "..", "tools", "scryfall-extract.mjs");
  const toJsonl = (xs: object[]) => xs.map((x) => JSON.stringify(x)).join("\n") + "\n";

  it("keeps the printing the game shows for each English oracle card, every field the build uses, and the rulings", () => {
    const dir = mkdtempSync(join(tmpdir(), "scryfall-"));
    const old = { ...delver, id: "old", released_at: "2011-09-30", frame: "2003", prices: { usd: "0.25" }, purchase_uris: { tcgplayer: "x" } };
    const promo = { ...delver, id: "promo", promo: true, released_at: "2023-01-01" };
    const german = { ...fireIce, id: "de", lang: "de" };
    const token = { ...printing, id: "tok", oracle_id: "tok", name: "Spirit", layout: "token" };
    const funny = { ...gisela, id: "un", oracle_id: "un", name: "Un-card", set_type: "funny" };
    // Windows unzips a download into a folder of the same name.
    execFileSync("mkdir", ["-p", join(dir, "unique-artwork-1.jsonl")]);
    writeFileSync(join(dir, "unique-artwork-1.jsonl", "unique-artwork-1.jsonl"), toJsonl([old, { ...delver, id: "new" }, promo, german, fireIce, token, funny, gisela, brisela]));
    const ruling = { object: "ruling", oracle_id: delver.oracle_id, source: "wotc", published_at: "2021-09-24", comment: "A ruling." };
    writeFileSync(join(dir, "rulings-1.jsonl"), toJsonl([ruling]));
    const out = join(dir, "out");
    execFileSync("node", [script, join(dir, "unique-artwork-1.jsonl"), join(dir, "rulings-1.jsonl"), "--out", out], { encoding: "utf8" });
    const cards = gunzipSync(readFileSync(join(out, "scryfall-oracle-cards.jsonl.gz"))).toString("utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(cards.map((c) => c.id ?? c.name)).toEqual(["Brisela, Voice of Nightmares", "new", "Fire // Ice", "Gisela, the Broken Blade"]);
    expect(cards[1].card_faces).toEqual(delver.card_faces);
    expect(cards[3].all_parts).toEqual(meldParts);
    expect(cards.some((c) => c.prices || c.purchase_uris)).toBe(false);
    // Built again from the extract, the cards are the same.
    expect(cards.map(cardFromScryfall)).toEqual([brisela, { ...delver, id: "new" }, fireIce, gisela].map(cardFromScryfall));
    const rulings = gunzipSync(readFileSync(join(out, "scryfall-rulings.jsonl.gz"))).toString("utf8");
    expect(JSON.parse(rulings)).toEqual(ruling);
  });

  it("--push commits only the extract to a new branch on origin, leaving the working tree and index alone", () => {
    const dir = mkdtempSync(join(tmpdir(), "scryfall-push-"));
    const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
    git(dir, "init", "-q", "--bare", "origin.git");
    git(dir, "init", "-q", "work");
    const work = join(dir, "work");
    git(work, "config", "user.name", "Test");
    git(work, "config", "user.email", "test@example.com");
    git(work, "remote", "add", "origin", join(dir, "origin.git"));
    writeFileSync(join(work, "README.md"), "hi\n");
    git(work, "add", "README.md");
    git(work, "commit", "-q", "-m", "first");
    writeFileSync(join(work, "README.md"), "local change\n");
    writeFileSync(join(dir, "cards.jsonl"), toJsonl([fireIce]));
    execFileSync("node", [script, join(dir, "cards.jsonl"), "--out", join(dir, "out"), "--push", "data/scryfall-test"], { cwd: work, stdio: "pipe" });
    expect(git(join(dir, "origin.git"), "ls-tree", "--name-only", "data/scryfall-test")).toBe("scryfall-oracle-cards.jsonl.gz");
    expect(git(join(dir, "origin.git"), "rev-list", "--count", "data/scryfall-test")).toBe("1");
    expect(git(work, "status", "--porcelain")).toBe("M README.md");
    expect(readFileSync(join(work, "README.md"), "utf8")).toBe("local change\n");
  });
});
