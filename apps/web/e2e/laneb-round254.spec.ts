// Lane B round B254 in the browser: Rhystic Cave's menu button (tap it for one mana of a color unless any player pays {1}),
// and its question when another player taps one (Pay or Don't pay).
import { expect, test } from "@playwright/test";
import { applyAction } from "@cc/engine";
import { idsOf, one, open, pageErrors, scene, state } from "./scene";
import { controls, menu } from "./ui";

test("Rhystic Cave: its menu button adds {R} unless any player pays {1}; the bots don't, so you get {R}", async ({ page }) => {
  const s = scene({ board: ["Rhystic Cave"] });
  const cave = one(s, "Rhystic Cave");
  await open(page, s);
  await page.locator(`[data-obj="${cave}"]`).first().click();
  await menu(page).getByRole("button", { name: "↷ : add R unless any player pays 1" }).click();
  let after = s;
  await expect.poll(async () => (after = await state(page)).players[0]!.manaPool.R).toBe(1);
  expect(after.objects[cave]!.tapped).toBe(true);
  expect(after.pending).toBeNull();
  expect(after.log.filter((l) => / doesn't pay \{1\} for Rhystic Cave\./.test(l.text)).length).toBe(3);
  expect(pageErrors(page)).toEqual([]);
});

test("Ana's Rhystic Cave: you're asked first; Pay taps your Mountain and Ana adds no mana", async ({ page }) => {
  let s = scene({ board: ["Mountain"] }, [{ board: ["Rhystic Cave"] }]);
  const [cave, mountain] = [one(s, "Rhystic Cave"), idsOf(s, "Mountain", "battlefield", 0)[0]!];
  // Ana holds priority in your main phase (as after you pass) and taps it for {G}.
  s.priority = 1;
  s = applyAction(s, { type: "activateMana", player: 1, objectId: cave, mana: "G" });
  expect(s.pending).toMatchObject({ kind: "payUnless", player: 0, manaUnless: true });
  await open(page, s);
  const bar = controls(page).filter({ hasText: "Ana adds" });
  await expect(bar).toContainText("Rhystic Cave:");
  await bar.getByRole("button", { name: "Pay", exact: true }).click();
  let after = s;
  await expect.poll(async () => (after = await state(page)).pending).toBeNull();
  expect(after.objects[mountain]!.tapped).toBe(true);
  expect(after.players[1]!.manaPool.G).toBe(0);
  expect(after.players[0]!.manaPool.R).toBe(0);
  expect(after.log.some((l) => l.text === "Rhystic Cave adds no mana.")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Ana's Rhystic Cave: Don't pay, and the other bots don't either, so Ana adds {G}", async ({ page }) => {
  let s = scene({ board: ["Mountain"] }, [{ board: ["Rhystic Cave"] }]);
  const cave = one(s, "Rhystic Cave");
  s.priority = 1;
  s = applyAction(s, { type: "activateMana", player: 1, objectId: cave, mana: "G" });
  await open(page, s);
  await controls(page).filter({ hasText: "Ana adds" }).getByRole("button", { name: "Don't pay" }).click();
  let after = s;
  await expect.poll(async () => (after = await state(page)).players[1]!.manaPool.G).toBe(1);
  expect(after.pending).toBeNull();
  expect(after.log.some((l) => l.text === "You doesn't pay {1} for Rhystic Cave.")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
