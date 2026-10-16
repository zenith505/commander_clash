// The Sieges' "As this enchantment enters, choose Khans or Dragons" (anchor words, CR 614.12b): a button for each word.
// Bigger on the Inside: the enchanted land's granted "{T}: Target player adds two mana of any one color" from its menu,
// at yourself, then the color buttons; your next spell has cascade.
import { expect, test } from "@playwright/test";
import { idsOf, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, controls, menu, resolveUntil } from "./ui";

test("Palace Siege: choose Khans or Dragons as it enters", async ({ page }) => {
  const s = scene({ hand: ["Palace Siege"], board: ["Swamp", "Swamp", "Swamp", "Swamp", "Swamp"] });
  const siege = one(s, "Palace Siege");
  await open(page, s);
  await card(page, "Palace Siege", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption");
  const bar = controls(page);
  await expect(bar).toContainText("Palace Siege: choose Khans or Dragons");
  await expect(bar.getByRole("button", { name: "Khans", exact: true })).toBeVisible();
  await bar.getByRole("button", { name: "Dragons", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.objects[siege]?.zone === "battlefield");
  expect(after.objects[siege]!.chosen?.anchor).toBe("Dragons");
  expect(after.log.some((l) => l.text === "You chooses Dragons for Palace Siege.")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Bigger on the Inside: tap the enchanted land, target yourself, choose a color", async ({ page }) => {
  const s = scene({ board: ["Bigger on the Inside", "Forest"] });
  const [aura, forest] = [one(s, "Bigger on the Inside"), idsOf(s, "Forest", "battlefield", 0)[0]!];
  s.objects[aura]!.attachedTo = forest;
  await open(page, s);
  await page.locator(`[data-obj="${forest}"]`).first().click();
  await menu(page).locator("button", { hasText: "Target player adds two mana" }).click();
  await clickPlayer(page, 0);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "color");
  await controls(page).getByRole("button", { name: "Red" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.players[0]!.manaPool.R === 2);
  expect(after.nextCast).toEqual([expect.objectContaining({ controller: 0, cascade: true })]);
  expect(pageErrors(page)).toEqual([]);
});
