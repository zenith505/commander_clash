// Round 99's prompts: Vivi Ornitier's "X mana in any combination of {U} and/or {R}" (the mana bar with only those two
// colors), "you may pay {X}" (Well of Lost Dreams: pick X, then pay), Chain Lightning's "may pay {R}{R}" before copying,
// and a tiered spell's modes with their costs (Restoration Magic).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { card, clickPlayer, controls, menu, resolveUntil } from "./ui";

test("Vivi Ornitier: X mana of blue and/or red, X her power", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Vivi Ornitier"] });
  const vivi = one(s, "Vivi Ornitier");
  s.objects[vivi]!.counters["+1/+1"] = 2;
  await open(page, s);
  await card(page, "Vivi Ornitier", s).click();
  await menu(page).locator("[data-mix]").click();
  const bar = page.locator(".mana-mix");
  await expect(bar).toContainText("add 2 mana in any combination of blue and/or red (2 left)");
  await expect(bar.getByRole("button", { name: "Green plus one" })).toHaveCount(0);
  await expect(bar.getByRole("button", { name: "White plus one" })).toHaveCount(0);
  await bar.getByRole("button", { name: "Blue plus one" }).click();
  await bar.getByRole("button", { name: "Red plus one" }).click();
  await bar.getByRole("button", { name: "Add" }).click();
  await expect.poll(async () => (await state(page)).players[0]!.manaPool.U).toBe(1);
  expect((await state(page)).players[0]!.manaPool.R).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Well of Lost Dreams: gaining 3 life, pick X = 2, pay {2}, draw two", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Well of Lost Dreams", "Bottle Gnomes"], library: ["Hill Giant", "Grizzly Bears", "Llanowar Elves"] });
  await open(page, s);
  await card(page, "Bottle Gnomes", s).click();
  await menu(page).locator("button", { hasText: "You gain 3 life" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "payX");
  const bar = controls(page);
  await expect(bar).toContainText("Well of Lost Dreams:");
  await expect(bar.getByRole("button", { name: "X = 3" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "X = 4" })).toHaveCount(0);
  await bar.getByRole("button", { name: "X = 2" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay");
  await expect(bar).toContainText("Well of Lost Dreams: Pay 2");
  await bar.getByRole("button", { name: "Pay", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[0]!.hand.length === 2);
  expect(after.players[0]!.life).toBe(43);
  expect(after.battlefield.filter((id) => after.objects[id]!.tapped)).toHaveLength(2);
  expect(pageErrors(page)).toEqual([]);
});

test("Chain Lightning: hit your own Hill Giant, pay {R}{R}, and copy it at Ana", async ({ page }) => {
  const s = scene({ hand: ["Chain Lightning"], board: [...LANDS, "Hill Giant"] });
  const giant = one(s, "Hill Giant");
  await open(page, s);
  await card(page, "Chain Lightning", s).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay");
  const bar = controls(page);
  await expect(bar).toContainText("Chain Lightning: Pay RR to copy Chain Lightning?");
  await bar.getByRole("button", { name: "Pay", exact: true }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && !st.pending.pay);
  await expect(bar).toContainText("Copy Chain Lightning and choose a new target for the copy?");
  await bar.getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "copyTargets");
  await clickPlayer(page, 1);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[1]!.life === 37);
  expect(after.objects[giant]!.zone).toBe("graveyard");
  // {R}, then {R}{R}.
  expect(after.battlefield.filter((id) => after.objects[id]!.tapped)).toHaveLength(3);
  expect(pageErrors(page)).toEqual([]);
});

test("Restoration Magic: tiered, the mode menu shows each tier's cost, and the spell costs it", async ({ page }) => {
  const s = scene({ hand: ["Restoration Magic"], board: [...LANDS, "Hill Giant"] });
  const giant = one(s, "Hill Giant");
  await open(page, s);
  await card(page, "Restoration Magic", s).click();
  const modes = page.locator(".mode-menu");
  await expect(modes).toContainText("choose one");
  await modes.getByRole("button", { name: /^\+ \{1\} — Target permanent gains hexproof and indestructible until end of turn\. You gain 3 life\./ }).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[0]!.life === 43);
  expect(after.battlefield.filter((id) => after.objects[id]!.tapped)).toHaveLength(2); // {W} + {1}
  expect(pageErrors(page)).toEqual([]);
});
