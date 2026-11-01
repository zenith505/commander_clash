// Round 230: Stenn, Paranoid Partisan's "choose a card type other than creature or land" as it enters, and a loyalty
// ability a Talent gives the planeswalker it enchants (Elspeth's Talent), on that planeswalker's menu.
import { expect, test } from "@playwright/test";
import { invalidateCharacteristics } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, scene, state } from "./scene";
import { card, controls, menu, resolveUntil } from "./ui";

test("Stenn, Paranoid Partisan: choose a card type other than creature or land as it enters", async ({ page }) => {
  const s = scene({ hand: ["Stenn, Paranoid Partisan"], board: LANDS });
  const stenn = one(s, "Stenn, Paranoid Partisan");
  await open(page, s);
  await card(page, "Stenn, Paranoid Partisan", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "cardType");
  const bar = controls(page);
  await expect(bar).toContainText("Stenn, Paranoid Partisan: choose a card type");
  await expect(bar.getByRole("button")).toHaveText(["Artifact", "Battle", "Enchantment", "Instant", "Planeswalker", "Sorcery"]);
  await bar.getByRole("button", { name: "Sorcery" }).click();
  await expect.poll(async () => (await state(page)).objects[stenn]!.chosen?.cardType).toBe("Sorcery");
  expect(pageErrors(page)).toEqual([]);
});

test("Elspeth's Talent: the enchanted planeswalker's menu has the granted [+1], and activating it pumps your creatures", async ({ page }) => {
  const s = scene({ board: ["Jace Beleren", "Elspeth's Talent", "Grizzly Bears"] });
  const [jace, talent, bears] = [one(s, "Jace Beleren"), one(s, "Elspeth's Talent"), one(s, "Grizzly Bears")];
  s.objects[jace]!.counters.loyalty = 3;
  s.objects[talent]!.attachedTo = jace;
  invalidateCharacteristics(s);
  await open(page, s);
  await page.locator(`[data-obj="${jace}"]`).click();
  await menu(page).locator("button", { hasText: "Create three 1/1 white Soldier creature tokens" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && idsOf(st, "Soldier Token", "battlefield", 0).length === 3);
  expect(after.objects[jace]!.counters.loyalty).toBe(4);
  expect(after.objects[bears]!.zone).toBe("battlefield");
  expect(after.log.some((l) => l.text.includes("Elspeth's Talent"))).toBe(true);
  // One loyalty ability a turn (CR 606.3): the granted one and Jace's own are greyed out now.
  await page.locator(`[data-obj="${jace}"]`).click();
  await expect(menu(page).locator("button", { hasText: "Create three 1/1 white Soldier creature tokens" })).toBeDisabled();
  await expect(menu(page).locator("button", { hasText: "Each player draws a card" })).toBeDisabled();
  expect(pageErrors(page)).toEqual([]);
});
