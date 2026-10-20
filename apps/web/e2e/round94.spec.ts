// Round 94's prompts: Selvala's "add X mana in any combination of colors" (a bar to pick how much of each color) and
// Dauthi Voidwalker's "choose an exiled card an opponent owns with a void counter on it" (a picker over exiled cards).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { card, menu, modal, resolveUntil } from "./ui";

test("Selvala: add three mana in any combination of colors, chosen color by color", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Selvala, Heart of the Wilds", "Hill Giant"] });
  await open(page, s);
  await card(page, "Selvala, Heart of the Wilds", s).click();
  await menu(page).locator("[data-mix]").click();
  const bar = page.locator(".mana-mix");
  await expect(bar).toContainText("add 3 mana in any combination of colors (3 left)");
  const add = bar.getByRole("button", { name: "Add" });
  await expect(add).toBeDisabled();
  await bar.getByRole("button", { name: "Red plus one" }).click();
  await bar.getByRole("button", { name: "Red plus one" }).click();
  await bar.getByRole("button", { name: "Blue plus one" }).click();
  await expect(bar).toContainText("(0 left)");
  await expect(bar.getByRole("button", { name: "Green plus one" })).toBeDisabled();
  await bar.getByRole("button", { name: "Blue minus one" }).click();
  await bar.getByRole("button", { name: "White plus one" }).click();
  await add.click();
  await expect.poll(async () => (await state(page)).players[0]!.manaPool.R).toBe(2);
  const after = await state(page);
  expect(after.players[0]!.manaPool.W).toBe(1);
  expect(after.players[0]!.manaPool.U).toBe(0);
  expect(after.objects[one(after, "Selvala, Heart of the Wilds")]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Dauthi Voidwalker: choose an opponent's exiled card with a void counter and play it free this turn", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Dauthi Voidwalker"] }, [{ exile: ["Hill Giant", "Shock"] }]);
  const [giant, shock] = [one(s, "Hill Giant"), one(s, "Shock")];
  s.objects[giant]!.counters = { void: 1 };
  await open(page, s);
  await card(page, "Dauthi Voidwalker", s).click();
  await menu(page).getByRole("button", { name: /Sacrifice/ }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  await expect(pick).toContainText("Exiled cards");
  // Only the card with a void counter is offered.
  await expect(pick.locator(`[data-pick="${shock}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && !!st.objects[giant]!.mayPlay);
  expect(after.objects[giant]!.mayPlay).toMatchObject({ player: 0, free: true });
  expect(after.objects[one(after, "Dauthi Voidwalker")]?.zone ?? "graveyard").not.toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});
