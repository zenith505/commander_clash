// PR #12: dividing damage among targets, and picking the extra mana's color (Fertile Ground).
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene, state } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Arc Lightning: pick two of up to three targets, then split the damage with − and +", async ({ page }) => {
  const s = scene({ hand: ["Arc Lightning"], board: LANDS }, [{ board: ["Llanowar Elves", "Grizzly Bears", "Hill Giant"] }]);
  const [elves, bears, giant] = [one(s, "Llanowar Elves"), one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Arc Lightning", s).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  await expect(page.locator(".targeting")).toContainText("choose any target (optional, up to 2 more)");
  await page.locator(`[data-obj="${bears}"]`).click();
  await page.locator(".targeting").getByRole("button", { name: "Done" }).click();
  const panel = page.locator(".targeting", { hasText: "divide the damage" });
  const giantRow = panel.locator(".divide", { hasText: "Hill Giant" });
  const bearsRow = panel.locator(".divide", { hasText: "Grizzly Bears" });
  await expect(giantRow.locator("strong")).toHaveText("2");
  await expect(bearsRow.locator("strong")).toHaveText("1");
  await expect(bearsRow.getByRole("button", { name: "−" })).toBeDisabled();
  // Take one from the Giant: the confirm button says the total is short until it's given to the Bears.
  await giantRow.getByRole("button", { name: "−" }).click();
  await expect(panel.getByRole("button", { name: "Done" })).toHaveCount(0);
  await bearsRow.getByRole("button", { name: "+" }).click();
  await expect(bearsRow.locator("strong")).toHaveText("2");
  await panel.getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  const after = await state(page);
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(after.objects[giant]!.damage).toBe(1);
  expect(after.objects[elves]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Fertile Ground: tapping the enchanted land offers each color for the extra mana", async ({ page }) => {
  const s = scene({ hand: ["Fertile Ground"], board: LANDS });
  const forest = idsOf(s, "Forest", "battlefield").at(-1)!; // the top of the pile
  await open(page, s);
  await card(page, "Fertile Ground", s).click();
  await page.locator(`[data-obj="${forest}"]`).click();
  await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[one(s, "Fertile Ground")]!.zone === "battlefield");
  await page.locator(`[data-obj="${forest}"]`).click();
  const menu = page.locator(".ability-menu");
  await expect(menu).toBeVisible();
  await expect(menu.locator("button:has([title='{W}'])")).toHaveCount(1);
  await expect(menu.locator("button:has([title='{B}'])")).toHaveCount(1);
  await menu.locator("button:has([title='{B}'])").click();
  const after = await state(page);
  expect(after.players[0]!.manaPool).toMatchObject({ G: 1, B: 1 });
  expect(pageErrors(page)).toEqual([]);
});
