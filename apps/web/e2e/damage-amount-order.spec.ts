// Damage amount replacements: when Furnace of Rath and Lashknife Barrier both change the damage to your creature, you
// choose which applies first (CR 616.1). Taking 1 away first and then doubling leaves Hill Giant at 2 damage, not 3.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { attack, controls, resolveUntil } from "./ui";

test("Furnace of Rath and Lashknife Barrier: you choose which applies first to the damage to your creature", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Hill Giant", "Furnace of Rath", "Lashknife Barrier"] }, [{ board: ["Razorgrass Screen"] }]);
  const giant = one(s, "Hill Giant");
  await open(page, s);
  await controls(page).getByRole("button", { name: "Pass" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "declareAttackers");
  await attack(page, [[giant, 1]]);
  // Razorgrass Screen blocks each combat if able and deals 2 damage to Hill Giant.
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "damageShield");
  await expect(controls(page)).toContainText("Damage to Hill Giant: which applies first?");
  await expect(controls(page).getByRole("button", { name: "Double it (Furnace of Rath)" })).toBeVisible();
  await controls(page).getByRole("button", { name: "Take 1 away (Lashknife Barrier)" }).click();
  const after = await resolveUntil(page, (st) => st.step === "endCombat" || st.step === "main2");
  expect(after.objects[giant]!.zone).toBe("battlefield");
  expect(after.objects[giant]!.damage).toBe(2);
  expect(after.objects[one(s, "Razorgrass Screen")]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});
