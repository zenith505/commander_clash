// Round 351's prompts: Deification's planeswalker type picker as it enters (the creature type picker's search, with
// planeswalker types), and Repeated Reverberation's two copies of a loyalty ability (Keep target for each copy).
import { expect, test } from "@playwright/test";
import { objHasKeyword } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, menu, modal, resolveUntil } from "./ui";

test("Deification: cast it and choose Jace in the planeswalker type picker; Jace Beleren gets hexproof", async ({ page }) => {
  const s = scene({ hand: ["Deification"], board: [...LANDS, "Jace Beleren", "Grizzly Bears"] });
  const [deif, jace] = [one(s, "Deification"), one(s, "Jace Beleren")];
  // Its starting loyalty (CR 306.5b), as if it had been cast.
  s.objects[jace]!.counters.loyalty = 3;
  await open(page, s);
  await card(page, "Deification", s).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "planeswalkerType" && st.pending.player === 0);
  const options = (asked.pending as { options: string[] }).options;
  expect(options).toContain("Jace");
  expect(options).not.toContain("Bear");
  const pick = modal(page);
  await expect(pick).toContainText("Deification: choose a planeswalker type");
  await expect(pick.locator('button[data-type="Jace"]').first()).toContainText("1 yours");
  await pick.getByPlaceholder("Type to search…").fill("Jace");
  await pick.locator('button[data-type="Jace"]').click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[deif]!.zone === "battlefield");
  expect(after.objects[deif]!.chosen?.planeswalkerType).toBe("Jace");
  expect(objHasKeyword(after, after.objects[jace]!, "Hexproof")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Repeated Reverberation: then Jace Beleren's −1 at Ana; keep the target for both copies and Ana draws three", async ({ page }) => {
  const s = scene({ hand: ["Repeated Reverberation"], board: [...LANDS, "Jace Beleren"] });
  const jace = one(s, "Jace Beleren");
  s.objects[jace]!.counters.loyalty = 3;
  await open(page, s);
  await card(page, "Repeated Reverberation", s).click();
  const ready = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && !!st.nextCast?.some((d) => d.loyalty === "also"));
  const hand = ready.players[1]!.hand.length;
  await page.locator(`[data-obj="${jace}"]`).click();
  await menu(page).locator("button", { hasText: "Target player draws a card" }).click();
  await clickPlayer(page, 1);
  await resolveUntil(page, (st) => st.pending?.kind === "copyTargets" && st.pending.left === 2);
  const bar = page.locator(".targeting");
  await expect(bar).toContainText("2 copies left");
  await bar.getByRole("button", { name: /^Keep target/ }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "copyTargets" && st.pending.left === 1);
  await page.locator(".targeting").getByRole("button", { name: /^Keep target/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[1]!.hand.length === hand + 3, 60);
  expect(after.players[1]!.hand.length).toBe(hand + 3);
  expect(after.objects[jace]!.counters.loyalty).toBe(2);
  expect(pageErrors(page)).toEqual([]);
});
