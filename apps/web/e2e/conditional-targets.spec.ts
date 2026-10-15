// Targets that depend on an optional cost (CR 702.33g, 702.166d, 702.174m): the targeting panel asks only for the ones
// the spell has, cast the way it's being cast, and bargain is asked before the targets when one depends on it.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, modal, resolveUntil } from "./ui";

test("Into the Flood Maw: with the gift promised it targets any nonland permanent instead of a creature", async ({ page }) => {
  const s = scene({ hand: ["Into the Flood Maw"], board: LANDS }, [{ board: ["Grizzly Bears", "Sol Ring"] }]);
  const [bears, ring] = [one(s, "Grizzly Bears"), one(s, "Sol Ring")];
  await open(page, s);
  await card(page, "Into the Flood Maw", s).click();
  await page.locator(".gift-pick").getByRole("button", { name: "Gift Ana" }).click();
  const panel = page.locator(".targeting", { hasText: "Into the Flood Maw" });
  await expect(panel).toContainText("nonland permanent an opponent controls");
  await expect(panel).toContainText("(1/1)");
  await page.locator(`[data-obj="${ring}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[ring]!.zone).toBe("hand");
  expect(after.objects[bears]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Into the Flood Maw: without the gift only a creature can be targeted", async ({ page }) => {
  const s = scene({ hand: ["Into the Flood Maw"], board: LANDS }, [{ board: ["Grizzly Bears", "Sol Ring"] }]);
  const [bears, ring] = [one(s, "Grizzly Bears"), one(s, "Sol Ring")];
  await open(page, s);
  await card(page, "Into the Flood Maw", s).click();
  await page.locator(".gift-pick").getByRole("button", { name: "No gift" }).click();
  const panel = page.locator(".targeting", { hasText: "Into the Flood Maw" });
  await expect(panel).toContainText("creature an opponent controls");
  await page.locator(`[data-obj="${ring}"]`).click(); // not a creature: nothing happens
  await expect(panel).toBeVisible();
  await page.locator(`[data-obj="${bears}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[bears]!.zone).toBe("hand");
  expect(after.objects[ring]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Jilt: kicked, it asks for a second creature to deal 2 damage to", async ({ page }) => {
  const s = scene({ hand: ["Jilt"], board: LANDS }, [{ board: ["Grizzly Bears", "Hill Giant"] }]);
  const [bears, giant] = [one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Jilt", s).click();
  await page.getByRole("button", { name: "Kick it" }).click();
  const panel = page.locator(".targeting", { hasText: "Jilt" });
  await expect(panel).toContainText("(1/2)");
  await page.locator(`[data-obj="${giant}"]`).click();
  await expect(panel).toContainText("(2/2)");
  await page.locator(`[data-obj="${bears}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[giant]!.zone).toBe("hand");
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Brave the Wilds: bargain is asked first; bargained, a land you pick becomes a 3/3 Elemental", async ({ page }) => {
  const s = scene({ hand: ["Brave the Wilds"], board: [...LANDS, "Ornithopter"] });
  const thopter = one(s, "Ornithopter");
  await open(page, s);
  await card(page, "Brave the Wilds", s).click();
  const bar = page.locator(".targeting", { hasText: "bargain: you may sacrifice an artifact, enchantment, or token" });
  await expect(bar).toBeVisible();
  await page.locator(`[data-obj="${thopter}"]`).click();
  await bar.getByRole("button", { name: "Sacrifice and cast" }).click();
  await expect(page.locator(".targeting", { hasText: "land you control" })).toBeVisible();
  // The Forest on top of its pile.
  const top = page.locator(".card.targetable", { hasText: "Forest" }).last();
  const forest = (await top.getAttribute("data-obj"))!;
  await top.click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  await modal(page).getByRole("button", { name: "Find nothing" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[thopter]!.zone).toBe("graveyard");
  await expect(page.locator(`[data-obj="${forest}"]`)).toContainText("3/3");
  expect(pageErrors(page)).toEqual([]);
});

test("Brave the Wilds: cast without bargaining, there's nothing to target", async ({ page }) => {
  const s = scene({ hand: ["Brave the Wilds"], board: [...LANDS, "Ornithopter"] });
  const thopter = one(s, "Ornithopter");
  await open(page, s);
  await card(page, "Brave the Wilds", s).click();
  await page.locator(".targeting", { hasText: "bargain" }).getByRole("button", { name: "Cast without" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  await expect(page.locator(".targeting", { hasText: "land you control" })).toHaveCount(0);
  await modal(page).getByRole("button", { name: "Find nothing" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[thopter]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});
