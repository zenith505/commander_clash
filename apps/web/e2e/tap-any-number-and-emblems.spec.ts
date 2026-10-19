// Harmony of Nature: "Tap any number of untapped creatures you control" asks which ones as it resolves: you click
// them, then Tap N (or Tap none). Elspeth, Sun's Champion's −7: the emblem shows by your name in your seat's header.
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { card, controls, menu, resolveUntil, seat } from "./ui";

test("Harmony of Nature: click two untapped creatures, Tap 2, and gain 8 life", async ({ page }) => {
  const s = scene({ hand: ["Harmony of Nature"], board: [...LANDS, "Grizzly Bears", "Grizzly Bears", "Grizzly Bears"] });
  const bears = idsOf(s, "Grizzly Bears", undefined, 0);
  await open(page, s);
  await card(page, "Harmony of Nature", s).click();
  await resolveUntil(page, (x) => x.pending?.kind === "pickPermanents");
  const bar = controls(page);
  await expect(bar).toContainText("Harmony of Nature: tap any number of untapped creatures you control: click them, then tap them.");
  await expect(bar.getByRole("button", { name: "Tap none" })).toBeEnabled();
  await page.locator(`[data-obj="${bears[0]}"]`).click();
  await page.locator(`[data-obj="${bears[2]}"]`).click();
  await bar.getByRole("button", { name: "Tap 2" }).click();
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending);
  expect(bears.map((id) => after.objects[id]!.tapped)).toEqual([true, false, true]);
  expect(after.players[0]!.life).toBe(48);
  expect(pageErrors(page)).toEqual([]);
});

test("Elspeth, Sun's Champion's −7: the emblem shows in your header, and your creatures get +2/+2 and flying", async ({ page }) => {
  const s = scene({ board: ["Elspeth, Sun's Champion", "Grizzly Bears"] });
  const elspeth = one(s, "Elspeth, Sun's Champion");
  s.objects[elspeth]!.counters.loyalty = 7;
  await open(page, s);
  await page.locator(`[data-obj="${elspeth}"]`).click();
  await menu(page).locator("button", { hasText: "emblem" }).click();
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending && (x.emblems ?? []).length === 1);
  const badge = seat(page, 0).locator("[data-emblem]");
  await expect(badge).toHaveText("✦ Emblem: Elspeth");
  await expect(badge).toHaveAttribute("title", /Creatures you control get \+2\/\+2 and have flying\./);
  const bears = one(after, "Grizzly Bears");
  await expect(page.locator(`[data-obj="${bears}"]`).first()).toContainText("4/4");
  expect(pageErrors(page)).toEqual([]);
});
