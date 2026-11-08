// Lane B round B151's prompt: Nahiri's Sacrifice, whose X is in its additional cost ("sacrifice an artifact or creature
// with mana value X", CR 107.3a, 601.2b): the X picker names that cost, the X damage is divided among the target
// creatures, then only a permanent with that mana value can be clicked to sacrifice.
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { card, resolveUntil } from "./ui";

test("Nahiri's Sacrifice: X = 4, two creatures 2 and 2, then Hill Giant (mana value 4) sacrificed", async ({ page }) => {
  const s = scene({ hand: ["Nahiri's Sacrifice"], board: [...LANDS, "Hill Giant", "Gray Ogre"] }, [{ board: ["Grizzly Bears", "Llanowar Elves"] }]);
  const [giant, ogre] = [one(s, "Hill Giant"), one(s, "Gray Ogre")];
  const [bears, elves] = [idsOf(s, "Grizzly Bears", "battlefield", 1)[0]!, idsOf(s, "Llanowar Elves", "battlefield", 1)[0]!];
  await open(page, s);
  await card(page, "Nahiri's Sacrifice", s).click();
  const x = page.locator(".x-pick");
  await expect(x).toContainText("sacrifice an artifact or creature with mana value X");
  await x.getByLabel("X", { exact: true }).fill("4");
  await x.getByRole("button", { name: "X = 4" }).click();
  const bar = page.locator(".targeting");
  await page.locator(`[data-obj="${bears}"]`).click();
  await page.locator(`[data-obj="${elves}"]`).click();
  await bar.getByRole("button", { name: "Done" }).click();
  const panel = page.locator(".targeting", { hasText: "divide the damage" });
  await expect(panel.locator(".divide", { hasText: "Grizzly Bears" }).locator("strong")).toHaveText("2");
  await expect(panel.locator(".divide", { hasText: "Llanowar Elves" }).locator("strong")).toHaveText("2");
  await panel.getByRole("button", { name: "Done" }).click();
  // Only the mana value 4 creature can pay the cost, not Gray Ogre (3).
  const sac = page.locator(".targeting", { hasText: "sacrifice an artifact or creature with mana value 4 (click it)" });
  await page.locator(`[data-obj="${ogre}"]`).click();
  await expect(sac.getByRole("button", { name: "Sacrifice and cast" })).toBeDisabled();
  await page.locator(`[data-obj="${giant}"]`).click();
  await sac.getByRole("button", { name: "Sacrifice and cast" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[one(s, "Nahiri's Sacrifice")]!.zone === "graveyard");
  expect([giant, ogre, bears, elves].map((id) => after.objects[id]!.zone)).toEqual(["graveyard", "battlefield", "graveyard", "graveyard"]);
  expect(pageErrors(page)).toEqual([]);
});
