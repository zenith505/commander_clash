// Round 103's prompts: Comet Storm's X and multikicker, then one more target for each kick; Shatterskull Smashing's X
// divided among up to two targets (twice X from 6); Chandra, Torch of Defiance's +1 offering the exiled card to cast now;
// Planar Genesis's land pick, then a card for your hand when you take none.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

test("Comet Storm: X, kicked once, two targets each dealt X", async ({ page }) => {
  const s = scene({ hand: ["Comet Storm"], board: LANDS }, [{ board: ["Grizzly Bears", "Hill Giant"] }]);
  const [bears, giant] = [one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Comet Storm", s).click();
  await page.getByRole("button", { name: "Kick one more time" }).click();
  await page.getByRole("button", { name: "Kick once" }).click();
  const x = page.locator(".x-pick");
  await x.getByLabel("X", { exact: true }).fill("3");
  await x.getByRole("button", { name: "X = 3" }).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[one(s, "Comet Storm")]!.zone === "graveyard");
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(after.objects[giant]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Shatterskull Smashing: X = 6 divides twice X between two creatures", async ({ page }) => {
  const s = scene({ hand: ["Shatterskull Smashing // Shatterskull, the Hammer Pass"], board: LANDS }, [{ board: ["Grizzly Bears", "Hill Giant"] }]);
  const [bears, giant] = [one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  const smash = one(s, "Shatterskull Smashing");
  await open(page, s);
  await card(page, "Shatterskull Smashing", s).click();
  await menu(page).getByRole("button", { name: /^Cast it/ }).click();
  const x = page.locator(".x-pick");
  await x.getByLabel("X", { exact: true }).fill("6");
  await x.getByRole("button", { name: "X = 6" }).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  const panel = page.locator(".targeting", { hasText: "divide the damage" });
  await expect(panel).toBeVisible();
  const bearsRow = panel.locator(".divide", { hasText: "Grizzly Bears" });
  const giantRow = panel.locator(".divide", { hasText: "Hill Giant" });
  // Twelve to divide: 6 and 6 to start; move 4 from the Bears to the Giant.
  await expect(bearsRow.locator("strong")).toHaveText("6");
  for (let i = 0; i < 4; i++) {
    await bearsRow.getByRole("button", { name: "−" }).click();
    await giantRow.getByRole("button", { name: "+" }).click();
  }
  await expect(giantRow.locator("strong")).toHaveText("10");
  await panel.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[smash]!.zone === "graveyard");
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(after.objects[giant]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Chandra, Torch of Defiance: +1 offers the exiled card; casting it means no damage", async ({ page }) => {
  const s = scene({ board: ["Chandra, Torch of Defiance", ...LANDS], library: ["Grizzly Bears"] });
  const [chandra, bears] = [one(s, "Chandra, Torch of Defiance"), one(s, "Grizzly Bears")];
  await open(page, s);
  await page.locator(`[data-obj="${chandra}"]`).click();
  await menu(page).locator("button", { hasText: "Exile the top card of your library" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "castFree" && st.pending.objectId === bears);
  await expect(controls(page)).toContainText("cast Grizzly Bears from exile");
  await controls(page).getByRole("button", { name: "Cast it" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "battlefield");
  expect(after.players.map((p) => p.life)).toEqual([40, 40, 40, 40]);
  expect(pageErrors(page)).toEqual([]);
});

test("Planar Genesis: take no land, then pick a card for your hand", async ({ page }) => {
  const s = scene({ hand: ["Planar Genesis"], board: LANDS, library: ["Grizzly Bears", "Forest", "Hill Giant", "Opt"] });
  const giant = one(s, "Hill Giant");
  await open(page, s);
  await card(page, "Planar Genesis", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.min === 0);
  await modal(page).getByRole("button", { name: "Take none" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.min === 1);
  await modal(page).locator(`[data-pick="${giant}"]`).click();
  await modal(page).getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[giant]!.zone).toBe("hand");
  expect(after.players[0]!.library.slice(-3).sort()).toEqual([one(s, "Grizzly Bears"), one(s, "Opt"), s.players[0]!.library[1]!].sort());
  expect(pageErrors(page)).toEqual([]);
});
