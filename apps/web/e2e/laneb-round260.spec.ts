// Lane B round B260 in the browser: the sacrifices Brutal Suppression and Drought add to other costs, picked on the
// battlefield after the spell's or ability's own choices (click the land, then "Sacrifice and cast", "Sacrifice and
// activate" or "Sacrifice for mana").
import { expect, test } from "@playwright/test";
import type { GameState } from "@cc/engine";
import { idsOf, one, open, pageErrors, scene, state } from "./scene";
import { menu } from "./ui";

test("Drought: cast Disfigure at Ana's Grizzly Bears, then click your Swamp to sacrifice it", async ({ page }) => {
  const s = scene({ hand: ["Disfigure"], board: ["Swamp"] }, [{ board: ["Drought", "Grizzly Bears"] }]);
  const [dis, swamp, bears] = [one(s, "Disfigure"), idsOf(s, "Swamp", "battlefield", 0)[0]!, idsOf(s, "Grizzly Bears", "battlefield", 1)[0]!];
  await open(page, s);
  await page.locator(`[data-obj="${dis}"]`).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  const pick = page.locator(".targeting", { hasText: "sacrifice a Swamp" });
  await expect(pick).toHaveCount(1);
  await expect(pick.getByRole("button", { name: "Sacrifice and cast" })).toBeDisabled();
  await page.locator(`[data-obj="${swamp}"]`).first().click();
  await pick.getByRole("button", { name: "Sacrifice and cast" }).click();
  let after: GameState = s;
  await expect.poll(async () => (after = await state(page)).objects[swamp]!.zone).toBe("graveyard");
  expect(after.objects[dis]!.zone).toBe("stack");
  expect(pageErrors(page)).toEqual([]);
});

test("Brutal Suppression: Errant Doomsayers taps Ana's Grizzly Bears, and you click a Forest to sacrifice", async ({ page }) => {
  const s = scene({ board: ["Errant Doomsayers", "Forest"] }, [{ board: ["Brutal Suppression", "Grizzly Bears"] }]);
  const [ed, forest, bears] = [one(s, "Errant Doomsayers"), idsOf(s, "Forest", "battlefield", 0)[0]!, idsOf(s, "Grizzly Bears", "battlefield", 1)[0]!];
  await open(page, s);
  await page.locator(`[data-obj="${ed}"]`).click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /Tap target creature/ }).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  const pick = page.locator(".targeting", { hasText: "sacrifice a land" });
  await expect(pick).toHaveCount(1);
  await page.locator(`[data-obj="${forest}"]`).first().click();
  await pick.getByRole("button", { name: "Sacrifice and activate" }).click();
  let after: GameState = s;
  await expect.poll(async () => (after = await state(page)).objects[forest]!.zone).toBe("graveyard");
  expect(after.objects[ed]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Drought: Graven Cairns's {B/R} mana ability, a Swamp sacrificed for it, adds {B}{B}", async ({ page }) => {
  const s = scene({ board: ["Graven Cairns", "Swamp", "Mountain"] }, [{ board: ["Drought"] }]);
  const [cairns, swamp] = [one(s, "Graven Cairns"), idsOf(s, "Swamp", "battlefield", 0)[0]!];
  await open(page, s);
  await page.locator(`[data-obj="${cairns}"]`).click();
  await menu(page).getByRole("button", { name: /add B B/ }).click();
  const pick = page.locator(".targeting", { hasText: "sacrifice a Swamp" });
  await expect(pick).toHaveCount(1);
  await page.locator(`[data-obj="${swamp}"]`).first().click();
  await pick.getByRole("button", { name: "Sacrifice for mana" }).click();
  let after: GameState = s;
  await expect.poll(async () => (after = await state(page)).objects[swamp]!.zone).toBe("graveyard");
  expect(after.players[0]!.manaPool.B).toBe(2);
  expect(after.objects[cairns]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
