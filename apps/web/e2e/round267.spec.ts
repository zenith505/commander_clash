// Round 267's prompts: Tranquil Frillback's "pay {G} up to three times" (at most three, however much mana you have), then
// "choose up to that many" modes; Chandra, Legacy of Fire's 0: click any number of your permanents to remove a loyalty
// counter from each.
import { expect, test } from "@playwright/test";
import { applyAction, planCast, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { controls, menu, resolveUntil } from "./ui";

test("Tranquil Frillback: pay {G} twice (three at most), then choose two modes", async ({ page }) => {
  let s: GameState = scene({ hand: ["Tranquil Frillback"], board: [...LANDS, "Forest", "Forest", "Forest"] }, [{ board: ["Sol Ring"] }]);
  const [frill, ring] = [one(s, "Tranquil Frillback"), one(s, "Sol Ring")];
  for (const a of planCast(s, 0, frill)!) s = applyAction(s, a);
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "payX" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("pay {G} how many times?");
  // Five Forests untapped: still three times at most.
  await expect(bar.getByRole("button", { name: "3 times ({G}{G}{G})" })).toBeVisible();
  await expect(bar.getByRole("button", { name: /^4 times/ })).toHaveCount(0);
  await bar.getByRole("button", { name: "2 times ({G}{G})" }).click();
  await bar.getByRole("button", { name: "Pay", exact: true }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseModes");
  const modes = page.locator(".mode-menu");
  await expect(modes).toContainText("choose up to two");
  await modes.getByRole("button", { name: /Destroy target artifact or enchantment/ }).click();
  await modes.getByRole("button", { name: /You gain 4 life/ }).click();
  await modes.getByRole("button", { name: "Done" }).click();
  await page.locator(`[data-obj="${ring}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[ring]!.zone === "graveyard");
  expect(after.players[0]!.life).toBe(44);
  expect(pageErrors(page)).toEqual([]);
});

test("Chandra, Legacy of Fire: 0, click Chandra and a creature, choose; one loyalty counter removed, one card to play", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Chandra, Legacy of Fire", "Grizzly Bears"] });
  const [chandra, bears] = [one(s, "Chandra, Legacy of Fire"), one(s, "Grizzly Bears")];
  s.objects[chandra]!.counters.loyalty = 4;
  const top = s.players[0]!.library[0]!;
  await open(page, s);
  await page.locator(`[data-obj="${chandra}"]`).first().click();
  await menu(page).locator("button", { hasText: "Remove a loyalty counter" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("click any number of your permanents to remove a loyalty counter from each");
  await page.locator(`[data-obj="${chandra}"]`).first().click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await bar.getByRole("button", { name: "Choose", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[top]!.zone === "exile");
  expect(after.objects[chandra]!.counters.loyalty).toBe(3);
  expect(after.objects[top]!.mayPlay).toMatchObject({ player: 0, until: "thisTurn" });
  expect(after.players[0]!.library[0]).not.toBe(top);
  expect(pageErrors(page)).toEqual([]);
});
