// Round 144: behold (CR 701.4a). Champions of the Perfect's "behold an Elf and exile it" is picked from your hand and your
// battlefield together; Kinsbaile Aspirant's "behold a Kithkin or pay {2}" asks which way first.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, modal, resolveUntil } from "./ui";

test("Champions of the Perfect: behold an Elf from your hand or battlefield and exile it", async ({ page }) => {
  const s = scene({ hand: ["Champions of the Perfect", "Elvish Mystic"], board: [...LANDS, "Llanowar Elves", "Goldmeadow Harrier"] });
  const [champions, mystic, llanowar, harrier] = [one(s, "Champions of the Perfect"), one(s, "Elvish Mystic"), one(s, "Llanowar Elves"), one(s, "Goldmeadow Harrier")];
  await open(page, s);
  await card(page, "Champions of the Perfect", s).click();
  const pick = modal(page);
  await expect(pick).toContainText("Champions of the Perfect: behold an Elf and exile it");
  // The Elf card in hand and the Elf on the battlefield; not the Kithkin, not Champions itself.
  await expect(pick.locator(`[data-pick="${mystic}"]`)).toHaveCount(1);
  await expect(pick.locator(`[data-pick="${llanowar}"]`)).toHaveCount(1);
  await expect(pick.locator(`[data-pick="${harrier}"]`)).toHaveCount(0);
  await expect(pick.locator(`[data-pick="${champions}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${llanowar}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[champions]!.zone === "battlefield");
  expect(after.objects[llanowar]!.zone).toBe("exile");
  expect(after.objects[mystic]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});

test("Kinsbaile Aspirant: choose to behold a Kithkin rather than pay {2}, then pick the Kithkin", async ({ page }) => {
  const s = scene({ hand: ["Kinsbaile Aspirant"], board: [...LANDS, "Goldmeadow Harrier"] });
  const [aspirant, harrier] = [one(s, "Kinsbaile Aspirant"), one(s, "Goldmeadow Harrier")];
  await open(page, s);
  await card(page, "Kinsbaile Aspirant", s).click();
  await page.getByRole("button", { name: "behold a Kithkin" }).click();
  const pick = modal(page);
  await expect(pick).toContainText("Kinsbaile Aspirant: behold a Kithkin");
  await pick.locator(`[data-pick="${harrier}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[aspirant]!.zone === "battlefield");
  expect(after.objects[harrier]!.zone).toBe("battlefield");
  expect(after.log.some((e) => e.text === "You beholds Goldmeadow Harrier.")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
