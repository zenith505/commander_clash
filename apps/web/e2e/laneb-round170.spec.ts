// Lane B round B170 in the browser: Kamahl's Summons asks you which creature cards to reveal from your hand (a Bear for
// each), and Heart-Shaped Herb's "you may sacrifice a creature" brings the creature's card back with three +1/+1 counters.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

test("Kamahl's Summons: reveal Hill Giant but not Grizzly Bears; you get one Bear, the bot reveals its creature too", async ({ page }) => {
  const s = scene({ hand: ["Kamahl's Summons", "Grizzly Bears", "Hill Giant", "Lightning Bolt"], board: LANDS }, [{ hand: ["Llanowar Elves"] }]);
  const [bears, giant, bolt, elves] = [one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Lightning Bolt"), one(s, "Llanowar Elves")];
  await open(page, s);
  await card(page, "Kamahl's Summons", s).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  // Only the creature cards can be revealed.
  expect([...(asked.pending as { cards: string[] }).cards].sort()).toEqual([bears, giant].sort());
  const pick = modal(page);
  await expect(pick).toContainText("you may reveal any number of creature cards (a token for each) from your hand");
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.getByRole("button", { name: "Reveal" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.battlefield.some((id) => st.objects[id]!.isToken));
  const tokens = (pid: number) => after.battlefield.filter((id) => after.objects[id]!.isToken && after.objects[id]!.controller === pid);
  expect(tokens(0)).toHaveLength(1);
  expect(tokens(1)).toHaveLength(1);
  expect(tokens(2)).toHaveLength(0);
  for (const id of [bears, giant, bolt]) expect(after.objects[id]!.zone).toBe("hand");
  expect(after.objects[elves]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});

test("Heart-Shaped Herb: Yes, sacrifice Grizzly Bears; it comes back as a 5/5 and you become the monarch", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Heart-Shaped Herb", "Grizzly Bears", "Hill Giant"] });
  const [herb, bears, giant] = [one(s, "Heart-Shaped Herb"), one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Heart-Shaped Herb", s).click();
  if (await menu(page).count()) await menu(page).locator("button", { hasText: "You may sacrifice a creature" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  await controls(page).getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  await page.locator(`[data-obj="${bears}"]`).click();
  await controls(page).getByRole("button", { name: "Sacrifice", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.monarch === 0);
  expect(after.objects[herb]!.zone).toBe("graveyard");
  expect(after.objects[bears]!.zone).toBe("battlefield");
  expect(after.objects[bears]!.counters?.["+1/+1"]).toBe(3);
  expect(after.objects[giant]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});
