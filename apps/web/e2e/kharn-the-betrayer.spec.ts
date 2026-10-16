// Khârn the Betrayer: blocked, its damage is prevented and you choose which opponent gains control of it (CR 615.5);
// then "When you lose control of ~, draw two cards".
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { clickPlayer, controls, resolveUntil } from "./ui";

test("Khârn the Betrayer: blocked, you choose the opponent who gains control of it, and you draw two", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Khârn the Betrayer"] }, [{ board: ["Razorgrass Screen"] }]);
  const kharn = one(s, "Khârn the Betrayer");
  const hand = s.players[0]!.hand.length;
  await open(page, s);
  await controls(page).getByRole("button", { name: "Pass" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "declareAttackers");
  // It attacks each combat if able: the prompt says so, and "No attacks" is off.
  await expect(controls(page)).toContainText("Khârn the Betrayer attacks each combat if able");
  await page.locator(`[data-obj="${kharn}"]`).click();
  await clickPlayer(page, 1);
  await controls(page).getByRole("button", { name: "Attack with 1" }).click();
  // Razorgrass Screen blocks each combat if able; Khârn is dealt damage, and you're asked.
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "damageShield");
  await expect(controls(page)).toContainText("Khârn the Betrayer: which opponent gains control of it?");
  await controls(page).getByRole("button", { name: "Ben" }).click();
  const after = await resolveUntil(page, (st) => st.players[0]!.hand.length === hand + 2);
  expect(after.objects[kharn]!.zone).toBe("battlefield");
  expect(after.effects.some((e) => e.affected?.includes(kharn) && e.controller === 2 && e.mods.some((m) => m.kind === "control"))).toBe(true);
  const mid = await state(page);
  expect(mid.objects[one(s, "Razorgrass Screen")]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});
