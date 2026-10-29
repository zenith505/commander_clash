// Round 212: blitz with a cost besides mana (pay 2 life, discard a card), Tenacious Underdog cast from the graveyard for
// its blitz cost, and Tetzimoc's "reveal this card from your hand" ability.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { menu, modal, resolveUntil } from "./ui";

test("Tenacious Underdog: from the graveyard only its blitz button casts it, for {2}{B}{B} and 2 life", async ({ page }) => {
  const s = scene({ board: LANDS, yard: ["Tenacious Underdog"] });
  const dog = one(s, "Tenacious Underdog");
  await open(page, s);
  await page.locator('[data-graveyard="0"]').click();
  await modal(page).locator(".card.playable", { hasText: "Tenacious Underdog" }).click();
  await expect(menu(page).getByRole("button", { name: "Cast from graveyard 1 B", exact: true })).toBeDisabled();
  await menu(page).getByRole("button", { name: /^Cast from graveyard: Blitz/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[dog]!.zone === "battlefield");
  expect(after.players[0]!.life).toBe(38);
  expect(pageErrors(page)).toEqual([]);
});

test("Sabin, Master Monk: blitz from hand asks which card to discard", async ({ page }) => {
  const s = scene({ board: LANDS, hand: ["Sabin, Master Monk", "Grizzly Bears"] });
  const [sabin, bears] = [one(s, "Sabin, Master Monk"), one(s, "Grizzly Bears")];
  await open(page, s);
  await page.locator(`[data-obj="${sabin}"]`).click();
  await menu(page).getByRole("button", { name: /^Blitz/ }).click();
  await modal(page).locator(`[data-pick="${bears}"]`).click();
  await modal(page).getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[sabin]!.zone === "battlefield");
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Tetzimoc, Primal Death: its ability is activated from hand and puts a prey counter on the target", async ({ page }) => {
  const s = scene({ board: LANDS, hand: ["Tetzimoc, Primal Death"] }, [{ board: ["Grizzly Bears"] }]);
  const [tetzimoc, bears] = [one(s, "Tetzimoc, Primal Death"), one(s, "Grizzly Bears")];
  await open(page, s);
  await page.locator(`[data-obj="${tetzimoc}"]`).click();
  await menu(page).getByRole("button", { name: /Reveal/ }).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && (st.objects[bears]!.counters.prey ?? 0) === 1);
  expect(after.objects[tetzimoc]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});
