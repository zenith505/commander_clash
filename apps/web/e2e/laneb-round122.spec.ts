// Lane B round B122: Titania, Rugged Rumbler's "Ward—Discard a card or pay {2}": the spell's controller picks which cost
// to pay (or neither) on a prompt, then pays it.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("ward—discard a card or pay {2}: pick Pay {2}, pay, and the spell resolves", async ({ page }) => {
  const s = scene({ hand: ["Shock", "Grizzly Bears"], board: LANDS }, [{ board: ["Titania, Rugged Rumbler"] }]);
  const [titania, bears] = [one(s, "Titania, Rugged Rumbler"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Shock", s).click();
  await page.locator(`[data-obj="${titania}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "unlessWay");
  await expect(controls(page)).toContainText("which cost do you pay, or is Shock countered?");
  await expect(controls(page).getByRole("button", { name: "Discard a card" })).toBeVisible();
  await expect(controls(page).getByRole("button", { name: "Pay neither" })).toBeVisible();
  await controls(page).getByRole("button", { name: "Pay {2}" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "payUnless");
  await controls(page).getByRole("button", { name: "Pay", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[titania]!.damage).toBe(2);
  expect(after.objects[bears]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});

test("ward—discard a card or pay {2}: Pay neither counters the spell", async ({ page }) => {
  const s = scene({ hand: ["Shock", "Grizzly Bears"], board: LANDS }, [{ board: ["Titania, Rugged Rumbler"] }]);
  const [titania, shock, bears] = [one(s, "Titania, Rugged Rumbler"), one(s, "Shock"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Shock", s).click();
  await page.locator(`[data-obj="${titania}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "unlessWay");
  await controls(page).getByRole("button", { name: "Pay neither" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[titania]!.damage).toBe(0);
  expect(after.objects[shock]!.zone).toBe("graveyard");
  expect(after.objects[bears]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});
