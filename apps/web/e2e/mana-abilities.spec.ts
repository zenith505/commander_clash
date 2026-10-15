// Activated mana abilities with other costs (CR 605.1a): they resolve as soon as they're activated, without the stack
// (605.3b), from the ability menu, and paying for a spell uses the ones that need no choice.
import { expect, test } from "@playwright/test";
import { one, open, pageErrors, scene, state } from "./scene";
import { card, menu, resolveUntil } from "./ui";

test("Ashnod's Altar: sacrifice a creature from its menu, the {C}{C} is there at once and pays for a spell", async ({ page }) => {
  const s = scene({ hand: ["Hill Giant"], board: ["Ashnod's Altar", "Grizzly Bears", "Mountain", "Mountain"] });
  const [bears, giant] = [one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Ashnod's Altar", s).click();
  await menu(page).locator("button", { hasText: "Sacrifice a creature" }).click();
  const bar = page.locator(".targeting", { hasText: "sacrifice a creature (click it)" });
  await expect(bar.getByRole("button", { name: "Sacrifice and activate" })).toBeDisabled();
  await page.locator(`[data-obj="${bears}"]`).click();
  await bar.getByRole("button", { name: "Sacrifice and activate" }).click();
  await expect.poll(async () => (await state(page)).players[0]!.manaPool.C).toBe(2);
  const mid = await state(page);
  expect(mid.stack).toHaveLength(0);
  expect(mid.objects[bears]!.zone).toBe("graveyard");
  await card(page, "Hill Giant", s).click();
  await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[giant]!.zone === "battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Phyrexian Altar: its menu has a button for each color", async ({ page }) => {
  const s = scene({ board: ["Phyrexian Altar", "Grizzly Bears"] });
  const bears = one(s, "Grizzly Bears");
  await open(page, s);
  await card(page, "Phyrexian Altar", s).click();
  for (const c of ["W", "U", "B", "R", "G"]) await expect(menu(page).locator(`button:has([title='{${c}}'])`)).toHaveCount(1);
  await menu(page).locator("button:has([title='{B}'])").click();
  await page.locator(`[data-obj="${bears}"]`).click();
  await page.locator(".targeting").getByRole("button", { name: "Sacrifice and activate" }).click();
  await expect.poll(async () => (await state(page)).players[0]!.manaPool.B).toBe(1);
  const after = await state(page);
  expect(after.stack).toHaveLength(0);
  expect(after.pending).toBeNull();
  expect(pageErrors(page)).toEqual([]);
});

test("Casting a spell taps Mox Opal (with metalcraft) and Pristine Talisman for it", async ({ page }) => {
  const s = scene({ hand: ["Hill Giant"], board: ["Mox Opal", "Pristine Talisman", "Ornithopter", "Mountain", "Mountain"] });
  const [giant, mox, talisman] = [one(s, "Hill Giant"), one(s, "Mox Opal"), one(s, "Pristine Talisman")];
  await open(page, s);
  await card(page, "Hill Giant", s).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[giant]!.zone === "battlefield");
  expect(after.objects[mox]!.tapped).toBe(true);
  expect(after.objects[talisman]!.tapped).toBe(true);
  expect(after.players[0]!.life).toBe(41); // the Talisman's 1 life
  expect(pageErrors(page)).toEqual([]);
});
