// Round 126's prompts: Fandaniel's prompt naming the life lost, Bane of Bala Ged's exile pick, Eclipsed Realms' eight
// types, Aryel's and Hazel's "tap X untapped ..." costs, Gathering Stone's two "may"s, Light-Paws' search, Pippin's card
// type, Etchings of the Chosen's sacrifice of the chosen type and Geode Golem's free commander, tax paid.
import { expect, test } from "@playwright/test";
import { applyAction } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playUntil, playWithBots, scene, state } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

test("Fandaniel: at Ana's end step the prompt says what declining costs; decline and lose 4 life", async ({ page }) => {
  const s0 = scene({ board: ["Grizzly Bears"] }, [{ board: ["Fandaniel, Telophoroi Ascian"], yard: ["Lightning Bolt", "Lightning Bolt"] }]);
  const s = playUntil(s0, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Sacrifice a nontoken creature of your choice? If you don't, you lose 4 life.");
  await bar.getByRole("button", { name: "No" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[0]!.life < s.players[0]!.life);
  expect(after.players[0]!.life).toBe(s.players[0]!.life - 4);
  expect(after.objects[one(s, "Grizzly Bears")]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Bane of Bala Ged attacks you: click two of your permanents to exile", async ({ page }) => {
  const s0 = scene({ board: ["Grizzly Bears", "Hill Giant", "Plains"] }, [{ board: ["Bane of Bala Ged"] }]);
  let s = playUntil(s0, (st) => st.pending?.kind === "declareAttackers" && st.activePlayer === 1);
  s = applyAction(s, { type: "declareAttackers", player: 1, attacks: [{ attacker: one(s, "Bane of Bala Ged"), defender: 0 }] });
  s = playUntil(s, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  const [bears, giant, plains] = [one(s, "Grizzly Bears"), one(s, "Hill Giant"), idsOf(s, "Plains", "battlefield", 0)[0]!];
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Bane of Bala Ged:");
  await expect(bar).toContainText("click 2 (permanent) of yours to exile.");
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await page.locator(`[data-obj="${plains}"]`).first().click();
  await bar.getByRole("button", { name: "Exile", exact: true }).click();
  await expect.poll(async () => (await state(page)).objects[bears]!.zone).toBe("exile");
  const after = await state(page);
  expect(after.objects[plains]!.zone).toBe("exile");
  expect(after.objects[giant]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Eclipsed Realms: as it enters, choose one of its eight creature types", async ({ page }) => {
  const s = scene({ hand: ["Eclipsed Realms"] });
  const realms = one(s, "Eclipsed Realms");
  await open(page, s);
  await card(page, "Eclipsed Realms", s).click();
  const pick = modal(page);
  await expect(pick).toContainText("Eclipsed Realms: choose a creature type");
  await expect(pick).toContainText("The creature types it offers");
  for (const t of ["Elemental", "Elf", "Faerie", "Giant", "Goblin", "Kithkin", "Merfolk", "Treefolk"]) await expect(pick.getByRole("button", { name: t, exact: true })).toBeVisible();
  await expect(pick.getByRole("button", { name: "Human", exact: true })).toHaveCount(0);
  await pick.getByRole("button", { name: "Kithkin", exact: true }).click();
  await expect.poll(async () => (await state(page)).objects[realms]!.chosen?.type).toBe("Kithkin");
  expect(pageErrors(page)).toEqual([]);
});

test("Aryel: X = 2, target Ana's Grizzly Bears, then click two Knights to tap", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Aryel, Knight of Windgrace", "Knight of Autumn", "Knight of Meadowgrain"] }, [{ board: ["Grizzly Bears"] }]);
  const [aryel, giant] = [one(s, "Aryel, Knight of Windgrace"), one(s, "Grizzly Bears")];
  const knights = [one(s, "Knight of Autumn"), one(s, "Knight of Meadowgrain")];
  await open(page, s);
  await card(page, "Aryel, Knight of Windgrace", s).click();
  await menu(page).getByRole("button", { name: /Tap X untapped Knights/ }).click();
  const x = page.locator(".x-pick");
  await expect(x).toContainText("tap X untapped Knights you control");
  await x.getByLabel("X", { exact: true }).fill("2");
  await x.getByRole("button", { name: "X = 2" }).click();
  await page.locator(`[data-obj="${giant}"]`).first().click();
  const costBar = page.locator(".targeting");
  await expect(costBar).toContainText("tap 2 untapped Knights you control");
  for (const k of knights) await page.locator(`[data-obj="${k}"]`).first().click();
  await costBar.getByRole("button", { name: /activate/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "graveyard");
  expect(knights.every((k) => after.objects[k]!.tapped)).toBe(true);
  expect(after.objects[aryel]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Hazel of the Rootbloom: tap two tokens and pay 2 life for two mana in any combination of colors", async ({ page }) => {
  const s = scene({ board: ["Hazel of the Rootbloom"], tokens: ["Treasure", "Clue"] });
  const hazel = one(s, "Hazel of the Rootbloom");
  const tokens = s.battlefield.filter((id) => s.objects[id]!.isToken);
  await open(page, s);
  await card(page, "Hazel of the Rootbloom", s).click();
  await menu(page).getByRole("button", { name: /Tap X untapped tokens/ }).click();
  const x = page.locator(".x-pick");
  await x.getByLabel("X", { exact: true }).fill("2");
  await x.getByRole("button", { name: "X = 2" }).click();
  const costBar = page.locator(".targeting");
  await expect(costBar).toContainText("tap 2 untapped tokens you control");
  for (const t of tokens) await page.locator(`[data-obj="${t}"]`).first().click();
  await costBar.getByRole("button", { name: /activate/ }).click();
  const bar = page.locator(".mana-mix");
  await expect(bar).toContainText("add 2 mana in any combination of colors (2 left)");
  await bar.getByRole("button", { name: "Green plus one" }).click();
  await bar.getByRole("button", { name: "Black plus one" }).click();
  await bar.getByRole("button", { name: "Add" }).click();
  await expect.poll(async () => (await state(page)).players[0]!.manaPool.G).toBe(1);
  const after = await state(page);
  expect(after.players[0]!.manaPool.B).toBe(1);
  expect(after.players[0]!.life).toBe(s.players[0]!.life - 2);
  expect(tokens.every((t) => after.objects[t]!.tapped)).toBe(true);
  expect(after.objects[hazel]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Gathering Stone: at your upkeep an Elf on top; don't take it, then put it into your graveyard", async ({ page }) => {
  const s0 = scene({ board: ["Gathering Stone"], library: ["Llanowar Elves"] });
  s0.objects[one(s0, "Gathering Stone")]!.chosen = { type: "Elf" };
  const elves = one(s0, "Llanowar Elves");
  const s = playUntil(s0, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0 && st.activePlayer === 0 && st.turn > s0.turn);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Gathering Stone:");
  await expect(bar).toContainText("put it into your hand");
  await bar.getByRole("button", { name: "No" }).click();
  await expect(bar).toContainText("into your graveyard");
  await bar.getByRole("button", { name: "Yes" }).click();
  await expect.poll(async () => (await state(page)).objects[elves]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Light-Paws: cast Rancor on it, then search for Ethereal Armor (not another Rancor, not a costlier Aura)", async ({ page }) => {
  const s = scene({ hand: ["Rancor"], board: [...LANDS, "Light-Paws, Emperor's Voice"], library: ["Ethereal Armor", "Rancor", "Ancestral Mask"] });
  const lp = one(s, "Light-Paws, Emperor's Voice");
  const armor = one(s, "Ethereal Armor");
  const [, otherRancor] = idsOf(s, "Rancor");
  await open(page, s);
  await card(page, "Rancor", s).click();
  await page.locator(`[data-obj="${lp}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Light-Paws, Emperor's Voice:");
  await bar.getByRole("button", { name: "Yes" }).click();
  const m = modal(page);
  await expect(m.locator(`[data-pick="${armor}"]`)).toBeVisible();
  await expect(m.locator(`[data-pick="${otherRancor}"]`)).toHaveCount(0);
  await expect(m.locator(`[data-pick="${one(s, "Ancestral Mask")}"]`)).toHaveCount(0);
  await m.locator(`[data-pick="${armor}"]`).click();
  await m.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[armor]!.zone === "battlefield");
  expect(after.objects[armor]!.attachedTo).toBe(lp);
  expect(pageErrors(page)).toEqual([]);
});

test("Pippin: give your Grizzly Bears protection from instants, chosen with a button", async ({ page }) => {
  const s = scene({ board: ["Pippin, Guard of the Citadel", "Grizzly Bears"] });
  const bears = one(s, "Grizzly Bears");
  await open(page, s);
  await card(page, "Pippin, Guard of the Citadel", s).click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /protection from the card type/ }).click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.player === 0);
  const bar = controls(page);
  for (const t of ["Artifact", "Creature", "Enchantment", "Instant", "Land", "Planeswalker", "Sorcery"]) await expect(bar.getByRole("button", { name: t, exact: true })).toBeVisible();
  await bar.getByRole("button", { name: "Instant", exact: true }).click();
  await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  await expect(page.locator(`[data-obj="${bears}"]`).first()).toBeVisible();
  const after = await state(page);
  expect(JSON.stringify(after.effects)).toContain("Protection from instants");
  expect(pageErrors(page)).toEqual([]);
});

test("Etchings of the Chosen: sacrifice an Elf (the chosen type) to make your Grizzly Bears indestructible", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Etchings of the Chosen", "Llanowar Elves", "Grizzly Bears"] });
  s.objects[one(s, "Etchings of the Chosen")]!.chosen = { type: "Elf" };
  const [elves, bears] = [one(s, "Llanowar Elves"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Etchings of the Chosen", s).click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /Sacrifice a creature of the chosen type/ }).click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  const costBar = page.locator(".targeting");
  await expect(costBar).toContainText("sacrifice a creature of the chosen type");
  await page.locator(`[data-obj="${elves}"]`).first().click();
  await costBar.getByRole("button", { name: /activate/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[elves]!.zone === "graveyard");
  expect(after.objects[bears]!.zone).toBe("battlefield");
  expect(JSON.stringify(after.effects)).toContain("Indestructible");
  expect(pageErrors(page)).toEqual([]);
});

test("Geode Golem: after it hits Ana, cast your commander from the command zone, paying only the {2} commander tax", async ({ page }) => {
  const s0 = scene({ board: [...LANDS, "Geode Golem"] });
  const cmd = s0.players[0]!.command.find((id) => s0.objects[id]!.isCommander)!;
  s0.players[0]!.commanderCasts[cmd] = 1;
  const s = playWithBots(s0, (st) => st.pending?.kind === "castFree" && st.pending.player === 0, [[one(s0, "Geode Golem"), 1]]);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Geode Golem: cast Krosan Cloudscraper from the command zone without paying its mana cost? You still pay the commander tax");
  await bar.getByRole("button", { name: "Cast it", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[cmd]!.zone === "battlefield");
  const tapped = (st: typeof s) => st.battlefield.filter((id) => st.objects[id]!.tapped && st.cards[st.objects[id]!.cardId]!.types.includes("Land")).length;
  expect(tapped(after) - tapped(s)).toBe(2);
  expect(after.players[0]!.commanderCasts[cmd]).toBe(2);
  expect(pageErrors(page)).toEqual([]);
});
