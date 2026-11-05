// Round 275 in the browser: Wall of Shards' cumulative upkeep "An opponent gains 1 life": Yes to keep it, then an
// opponent picked for each age counter (the same one may be picked twice, rulings); No sacrifices it.
import { expect, test } from "@playwright/test";
import { one, open, pageErrors, playUntil, scene } from "./scene";
import { controls, resolveUntil } from "./ui";

/** Your next upkeep, with Wall of Shards' cumulative upkeep asking you (two age counters by then). */
function shardsUpkeep() {
  const s0 = scene({ board: ["Wall of Shards"] });
  const wall = one(s0, "Wall of Shards");
  s0.objects[wall]!.counters.age = 1;
  return { wall, s: playUntil(s0, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0) };
}

test("Wall of Shards: Yes, then Ana for the first age counter and Ben for the second; each gains 1 life", async ({ page }) => {
  const { wall, s } = shardsUpkeep();
  const life = s.players.map((p) => p.life);
  await open(page, s);
  await expect(controls(page)).toContainText("Have opponents gain 2 life in all (1 for each age counter) to keep Wall of Shards (cumulative upkeep)? If you don't, sacrifice Wall of Shards.");
  await controls(page).getByRole("button", { name: "Yes", exact: true }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption");
  await expect(controls(page)).toContainText("choose an opponent to gain 1 life (1 of 2)");
  await controls(page).getByRole("button", { name: "Ana", exact: true }).click();
  await expect(controls(page)).toContainText("choose an opponent to gain 1 life (2 of 2)");
  await controls(page).getByRole("button", { name: "Ben", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.players[1]!.life === life[1]! + 1);
  expect(after.players.map((p) => p.life)).toEqual([life[0], life[1]! + 1, life[2]! + 1, life[3]]);
  expect(after.objects[wall]!.zone).toBe("battlefield");
  expect(after.objects[wall]!.counters.age).toBe(2);
  expect(pageErrors(page)).toEqual([]);
});

test("Wall of Shards: No sacrifices it and nobody gains life", async ({ page }) => {
  const { wall, s } = shardsUpkeep();
  const life = s.players.map((p) => p.life);
  await open(page, s);
  await controls(page).getByRole("button", { name: "No", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[wall]!.zone === "graveyard");
  expect(after.players.map((p) => p.life)).toEqual(life);
  expect(pageErrors(page)).toEqual([]);
});
