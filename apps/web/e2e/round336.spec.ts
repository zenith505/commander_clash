// Round 336: Weeping Angel's prevention shuffles the creature it would deal combat damage to into its owner's library.
// When another prevention (here a shield counter) would apply to that damage too, the creature's controller chooses
// which applies (CR 616.1); taking the Angel's sends your creature away.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { attack, controls, resolveUntil } from "./ui";

test("Weeping Angel blocks your creature with a shield counter: you choose which prevention applies", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Prized Unicorn"] }, [{ board: ["Weeping Angel"] }]);
  const unicorn = one(s, "Prized Unicorn");
  s.objects[unicorn]!.counters.shield = 1;
  await open(page, s);
  await controls(page).getByRole("button", { name: "Pass" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "declareAttackers");
  await attack(page, [[unicorn, 1]]);
  // Prized Unicorn: all creatures able to block it do so, so the Angel blocks; its first strike damage comes first.
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "damageShield");
  expect(asked.objects[unicorn]!.zone).toBe("battlefield");
  await expect(controls(page)).toContainText("Damage from Weeping Angel to Prized Unicorn: which applies?");
  await expect(controls(page).getByRole("button", { name: "Prevent the damage another way" })).toBeVisible();
  await controls(page).getByRole("button", { name: "Weeping Angel: prevent it and shuffle Prized Unicorn into its owner's library" }).click();
  const after = await resolveUntil(page, (st) => st.step === "endCombat" || st.step === "main2");
  expect(after.objects[unicorn]!.zone).toBe("library");
  expect(after.players[0]!.library).toContain(unicorn);
  expect(pageErrors(page)).toEqual([]);
});

test("Weeping Angel: choosing the shield counter keeps your creature", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Prized Unicorn"] }, [{ board: ["Weeping Angel"] }]);
  const unicorn = one(s, "Prized Unicorn");
  s.objects[unicorn]!.counters.shield = 1;
  await open(page, s);
  await controls(page).getByRole("button", { name: "Pass" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "declareAttackers");
  await attack(page, [[unicorn, 1]]);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "damageShield");
  await controls(page).getByRole("button", { name: "Prevent the damage another way" }).click();
  const after = await resolveUntil(page, (st) => st.step === "endCombat" || st.step === "main2");
  expect(after.objects[unicorn]!.zone).toBe("battlefield");
  expect(after.objects[unicorn]!.counters.shield ?? 0).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});
