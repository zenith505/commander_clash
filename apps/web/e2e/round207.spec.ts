// Round 207: ward costs "discard a card at random" (Alpharael, Stonechosen) and "get five poison counters" (The Serpent
// Society): the prompt says what paying does, and Pay pays it.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("ward—discard a card at random: Pay discards one of your cards and the spell resolves", async ({ page }) => {
  const s = scene({ hand: ["Murder", "Grizzly Bears", "Hill Giant"], board: LANDS }, [{ board: ["Alpharael, Stonechosen"] }]);
  const alpharael = one(s, "Alpharael, Stonechosen");
  await open(page, s);
  await card(page, "Murder", s).click();
  await page.locator(`[data-obj="${alpharael}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "payUnless");
  await expect(controls(page)).toContainText("discard a card at random or Murder is countered");
  await controls(page).getByRole("button", { name: "Pay", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[alpharael]!.zone).toBe("graveyard");
  expect(after.players[0]!.hand).toHaveLength(1);
  expect(after.players[0]!.graveyard).toHaveLength(2);
  expect(pageErrors(page)).toEqual([]);
});

test("ward—get five poison counters: Don't pay counters the spell, Pay gives you the counters", async ({ page }) => {
  const s = scene({ hand: ["Murder", "Swords to Plowshares"], board: LANDS }, [{ board: ["The Serpent Society"] }]);
  const society = one(s, "The Serpent Society");
  await open(page, s);
  await card(page, "Murder", s).click();
  await page.locator(`[data-obj="${society}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "payUnless");
  await expect(controls(page)).toContainText("get 5 poison counters or Murder is countered");
  await controls(page).getByRole("button", { name: "Don't pay" }).click();
  let after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[society]!.zone).toBe("battlefield");
  expect(after.players[0]!.poison ?? 0).toBe(0);
  await card(page, "Swords to Plowshares", after).click();
  await page.locator(`[data-obj="${society}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "payUnless");
  await controls(page).getByRole("button", { name: "Pay", exact: true }).click();
  after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.players[0]!.poison).toBe(5);
  expect(after.objects[society]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});
