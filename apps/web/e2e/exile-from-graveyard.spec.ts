// Exiling cards from a graveyard: "Target player exiles a card from their graveyard" (Scrabbling Claws) asks that player
// to pick one as it resolves; "Exile a card from your graveyard" as an ability's cost (Stonerise Spirit) is picked from
// your graveyard as you activate it.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, menu, modal, resolveUntil } from "./ui";

test("Scrabbling Claws: target yourself, then pick the card to exile from your graveyard", async ({ page }) => {
  const s = scene({ board: ["Scrabbling Claws"], yard: ["Grizzly Bears", "Hill Giant"] });
  const [bears, giant] = [one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Scrabbling Claws", s).click();
  await menu(page).locator("button", { hasText: "Target player exiles" }).click();
  await clickPlayer(page, 0);
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  await expect(pick).toContainText("exile a card from your graveyard");
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[giant]!.zone).toBe("exile");
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Stonerise Spirit: exile a card from your graveyard to activate it", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Stonerise Spirit", "Grizzly Bears"], yard: ["Hill Giant", "Shock"] });
  const [bears, giant, shock] = [one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Shock")];
  await open(page, s);
  await card(page, "Stonerise Spirit", s).click();
  await menu(page).locator("button", { hasText: "Exile a card from your graveyard" }).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  const pick = modal(page);
  await expect(pick).toContainText("Stonerise Spirit: exile from your graveyard a card");
  await pick.locator(`[data-pick="${shock}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[shock]!.zone).toBe("exile");
  expect(after.objects[giant]!.zone).toBe("graveyard");
  expect(after.effects.some((e) => e.affected?.includes(bears) && e.mods.some((m) => m.kind === "addKeywords" && m.keywords.includes("Flying")))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
