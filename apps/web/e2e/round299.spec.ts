// Round 299 in the browser: casualty given by Silverquill, the Disputant on top of a spell's own, each instance its own
// pick (CR 702.153b); Dragon's Fire's behold, dealing the beheld Dragon's power; Molten Exhale cast in another player's
// end step only by beholding a Dragon (CR 601.3c).
import { expect, test } from "@playwright/test";
import { waitingOn } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, modal, resolveUntil } from "./ui";

test("Light 'Em Up with Silverquill: casualty 2 and 1, two picks, two copies", async ({ page }) => {
  const s = scene({ hand: ["Light 'Em Up"], board: [...LANDS, "Silverquill, the Disputant", "Hill Giant", "Grizzly Bears"] }, [{ board: ["Colossal Dreadmaw"] }]);
  const [giant, bears, wurm] = [one(s, "Hill Giant"), one(s, "Grizzly Bears"), one(s, "Colossal Dreadmaw")];
  await open(page, s);
  await card(page, "Light 'Em Up", s).click();
  await page.locator(`[data-obj="${wurm}"]`).click();
  const bar = page.locator(".targeting", { hasText: "casualty 2 and 1" });
  await expect(bar).toContainText("instance 1 of 2");
  await page.locator(`[data-obj="${giant}"]`).click();
  await bar.getByRole("button", { name: "Sacrifice and cast" }).click();
  const again = page.locator(".targeting", { hasText: "instance 2 of 2" });
  await expect(again).toBeVisible();
  await page.locator(`[data-obj="${bears}"]`).click();
  await again.getByRole("button", { name: "Sacrifice and cast" }).click();
  // Each copy may choose a new target; both keep the Dreadmaw.
  for (let i = 0; i < 2; i++) {
    await resolveUntil(page, (st) => st.pending?.kind === "copyTargets");
    await page.locator(".targeting").getByRole("button", { name: /^Keep target/ }).click();
  }
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[wurm]!.zone === "graveyard");
  expect(after.log.filter((l) => l.text === "Light 'Em Up deals 2 damage to Colossal Dreadmaw.")).toHaveLength(3);
  expect(after.objects[giant]!.zone).toBe("graveyard");
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Dragon's Fire: behold your Shivan Dragon for 5 damage instead of 3", async ({ page }) => {
  const s = scene({ hand: ["Dragon's Fire"], board: [...LANDS, "Shivan Dragon"] }, [{ board: ["Colossal Dreadmaw"] }]);
  const [dragon, wurm] = [one(s, "Shivan Dragon"), one(s, "Colossal Dreadmaw")];
  await open(page, s);
  await card(page, "Dragon's Fire", s).click();
  await page.locator(".targeting", { hasText: "as an additional cost, you may behold a Dragon" }).getByRole("button", { name: "Behold a Dragon" }).click();
  await page.locator(`[data-obj="${wurm}"]`).click();
  const pick = modal(page);
  await expect(pick).toContainText("Dragon's Fire: behold a Dragon");
  await pick.locator(`[data-pick="${dragon}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[wurm]!.damage > 0);
  expect(after.objects[wurm]!.damage).toBe(5);
  expect(pageErrors(page)).toEqual([]);
});

test("Molten Exhale in Ana's end step: cast as though it had flash by beholding a Dragon card from your hand", async ({ page }) => {
  const s0 = scene({ hand: ["Molten Exhale", "Shivan Dragon"], board: [...LANDS] }, [{ board: ["Hill Giant"] }], { step: "end" });
  const [dragon, giant] = [one(s0, "Shivan Dragon"), one(s0, "Hill Giant")];
  const s = playUntil(s0, (st) => st.activePlayer === 1 && st.step === "end" && waitingOn(st) === 0);
  await open(page, s);
  await card(page, "Molten Exhale", s).click();
  await page.locator(".targeting", { hasText: "as an additional cost, you may behold a Dragon" }).getByRole("button", { name: "Behold a Dragon" }).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  const pick = modal(page);
  await expect(pick).toContainText("Molten Exhale: behold a Dragon");
  await pick.locator(`[data-pick="${dragon}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "graveyard");
  expect(after.objects[dragon]!.zone).toBe("hand");
  expect(after.log.some((l) => /beholds Shivan Dragon from their hand/.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
