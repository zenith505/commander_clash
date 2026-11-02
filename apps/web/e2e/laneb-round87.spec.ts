// Lane B round 87: Sphinx of the Chimes's "Discard two nonland cards with the same name: Draw four cards." The cost
// picker only takes two cards that share a name.
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { menu, modal, resolveUntil } from "./ui";

test("Sphinx of the Chimes: discard two cards with the same name to draw four", async ({ page }) => {
  const s = scene({ hand: ["Shock", "Shock", "Lightning Bolt"], board: [...LANDS, "Sphinx of the Chimes"] });
  const sphinx = one(s, "Sphinx of the Chimes");
  const [shock1, shock2] = idsOf(s, "Shock", "hand");
  const bolt = one(s, "Lightning Bolt");
  await open(page, s);
  await page.locator(`[data-obj="${sphinx}"]`).click();
  await menu(page).getByRole("button", { name: /Discard two nonland cards with the same name/ }).click();
  const pick = modal(page);
  await expect(pick).toContainText("discard 2 nonland cards with the same name");
  await pick.locator(`[data-pick="${shock1}"]`).click();
  await pick.locator(`[data-pick="${bolt}"]`).click();
  // A Shock and a Lightning Bolt don't share a name.
  await expect(pick.getByRole("button", { name: "Done" })).toBeDisabled();
  await pick.locator(`[data-pick="${bolt}"]`).click();
  await pick.locator(`[data-pick="${shock2}"]`).click();
  await expect(pick.getByRole("button", { name: "Done" })).toBeEnabled();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[shock1!]!.zone).toBe("graveyard");
  expect(after.objects[shock2!]!.zone).toBe("graveyard");
  expect(after.objects[bolt]!.zone).toBe("hand");
  expect(after.players[after.turnOrder[0]!]!.hand.length).toBe(5);
  expect(pageErrors(page)).toEqual([]);
});
