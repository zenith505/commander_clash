// Round 242: "Suspend X—{X}{3}{U}. X can't be 0." (Aeon Chronicler): the Suspend X button opens the X picker, at least 1
// and up to what your mana pays; the card is exiled with X time counters (CR 702.62a).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { card, menu } from "./ui";

test("Suspend X: choose X in the picker (at least 1), pay {X}{3}{U}, exile it with X time counters", async ({ page }) => {
  const s = scene({ hand: ["Aeon Chronicler"], board: LANDS });
  const ac = one(s, "Aeon Chronicler");
  await open(page, s);
  await card(page, "Aeon Chronicler", s).click();
  await menu(page).getByRole("button", { name: /^Suspend X/ }).click();
  const x = page.locator(".x-pick");
  // Fifteen lands: {3}{U} and up to 11 more.
  await expect(x).toContainText("Suspend Aeon Chronicler");
  await expect(x).toContainText("choose X (up to 11 with your mana)");
  // X can't be 0: it starts at 1 and can't go lower.
  await expect(x.getByLabel("X", { exact: true })).toHaveValue("1");
  await expect(x.getByRole("button", { name: "X minus one" })).toBeDisabled();
  await x.getByLabel("X", { exact: true }).fill("0");
  await expect(x.getByLabel("X", { exact: true })).toHaveValue("1");
  await x.getByLabel("X", { exact: true }).fill("3");
  await x.getByRole("button", { name: "X = 3" }).click();
  await expect(x).toHaveCount(0);
  const now = await state(page);
  expect(now.objects[ac]!.zone).toBe("exile");
  expect(now.objects[ac]!.counters.time).toBe(3);
  expect(now.battlefield.filter((id) => now.objects[id]!.tapped)).toHaveLength(7);
  expect(pageErrors(page)).toEqual([]);
});
