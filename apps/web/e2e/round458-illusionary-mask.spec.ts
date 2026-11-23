// Round 458: Illusionary Mask. Activate it for X = 4 (four Mountains), choose Hill Giant from your hand (a secret choice),
// cast it face down as a 2/2 without paying its mana cost, then Shock it: it's turned face up instead of being dealt the
// damage, and is dealt it as a 3/3.
import { expect, test } from "@playwright/test";
import { one, open, pageErrors, scene } from "./scene";
import { card, controls, menu, resolveUntil } from "./ui";

test("Illusionary Mask: X = 4, choose Hill Giant, cast it face down, and Shock turns it face up as a 3/3", async ({ page }) => {
  const s = scene({ hand: ["Hill Giant", "Grizzly Bears", "Shock"], board: ["Mountain", "Mountain", "Mountain", "Mountain", "Mountain", "Illusionary Mask"] });
  const [mask, giant, bears] = [one(s, "Illusionary Mask"), one(s, "Hill Giant"), one(s, "Grizzly Bears")];
  await open(page, s);
  await page.locator(`[data-obj="${mask}"]`).first().click();
  const m = menu(page);
  if (await m.count()) await m.locator("button", { hasText: "You may choose a creature card" }).first().click();
  const x = page.locator(".x-pick");
  await x.getByLabel("X", { exact: true }).fill("4");
  await x.getByRole("button", { name: "X = 4" }).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "maskCard");
  // Only Hill Giant ({3}{R}) could be paid for with {R}{R}{R}{R}; Grizzly Bears needs {G}.
  expect(asked.pending?.kind === "chooseOption" && asked.pending.options).toEqual([giant, "none"]);
  const bar = controls(page);
  await expect(bar).toContainText("you may choose a creature card in your hand");
  await expect(bar.getByRole("button", { name: "Grizzly Bears" })).toHaveCount(0);
  await bar.getByRole("button", { name: "Hill Giant", exact: true }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "castFree" && st.pending.how === "mask");
  await expect(bar).toContainText("cast Hill Giant face down as a 2/2 creature spell without paying its mana cost?");
  await bar.getByRole("button", { name: "Cast it face down" }).click();
  const down = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[giant]!.zone === "battlefield");
  expect(down.objects[giant]!.faceDown).toBeTruthy();
  expect(down.objects[giant]!.maskFaceUp).toBe(true);
  expect(down.objects[bears]!.zone).toBe("hand");
  await card(page, "Shock", down).click();
  await page.locator(`[data-obj="${giant}"]`).first().click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[giant]!.damage === 2);
  expect(after.objects[giant]!.zone).toBe("battlefield");
  expect(after.objects[giant]!.faceDown).toBeFalsy();
  expect(after.log.some((l) => /Hill Giant/.test(l.text) && /face up/.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
