// Lane B round 97 in the browser: Adarkar Unicorn's mana ("Spend this mana only to pay cumulative upkeep costs") pays
// Mystic Remora's cumulative upkeep from the Pay button.
import { expect, test } from "@playwright/test";
import { one, open, pageErrors, playUntil, scene } from "./scene";
import { controls, resolveUntil } from "./ui";

test("Adarkar Unicorn pays Mystic Remora's cumulative upkeep {2}: Pay taps it for {C}{U} and Remora stays", async ({ page }) => {
  const s0 = scene({ board: ["Adarkar Unicorn", "Mystic Remora"] });
  const [unicorn, remora] = [one(s0, "Adarkar Unicorn"), one(s0, "Mystic Remora")];
  s0.objects[remora]!.counters.age = 1;
  const s = playUntil(s0, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  expect(s.pending).toMatchObject({ kind: "chooseMay", upkeepOf: remora });
  await open(page, s);
  await expect(controls(page)).toContainText("Mystic Remora");
  const pay = controls(page).getByRole("button", { name: "Pay", exact: true });
  await expect(pay).toBeEnabled();
  await pay.click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[unicorn]!.tapped);
  expect(after.objects[remora]!.zone).toBe("battlefield");
  expect(after.objects[remora]!.counters.age).toBe(2);
  expect(pageErrors(page)).toEqual([]);
});
