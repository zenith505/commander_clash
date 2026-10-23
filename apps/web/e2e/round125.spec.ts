// Round 125's prompts: Library of Leng's "put it on top instead" pick, ...
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Library of Leng: Faithless Looting's discards, then click one to put on top of your library instead", async ({ page }) => {
  const s = scene({ hand: ["Faithless Looting", "Hill Giant"], board: [...LANDS, "Library of Leng"], library: ["Grizzly Bears", "Shock"] });
  const [giant, shock] = [one(s, "Hill Giant"), one(s, "Shock")];
  await open(page, s);
  await card(page, "Faithless Looting", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "discard");
  await page.locator(`[data-obj="${giant}"]`).click();
  await page.locator(`[data-obj="${shock}"]`).click();
  await controls(page).getByRole("button", { name: "Discard", exact: true }).click();
  const bar = controls(page);
  await expect(bar).toContainText("Faithless Looting: you discard Hill Giant, Shock. Click any of them to put on top of your library instead of into your graveyard.");
  await expect(bar.getByRole("button", { name: "All to the graveyard", exact: true })).toBeVisible();
  await page.locator(`[data-obj="${shock}"]`).click();
  await bar.getByRole("button", { name: "Put 1 on top", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0);
  expect(after.players[0]!.library[0]).toBe(shock);
  expect(after.objects[giant]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});
