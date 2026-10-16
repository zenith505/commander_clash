// "As this creature enters, choose a player" (True-Name Nemesis): a button for each player still in the game, then it
// has protection from the one chosen (CR 702.16k).
import { expect, test } from "@playwright/test";
import { one, open, pageErrors, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("True-Name Nemesis: choose a player as it enters", async ({ page }) => {
  const s = scene({ hand: ["True-Name Nemesis"], board: ["Island", "Island", "Island"] });
  const nemesis = one(s, "True-Name Nemesis");
  await open(page, s);
  await card(page, "True-Name Nemesis", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption");
  const bar = controls(page);
  await expect(bar).toContainText("True-Name Nemesis: choose a player");
  for (const name of ["You (you)", "Ana", "Ben", "Cy"]) await expect(bar.getByRole("button", { name, exact: true })).toBeVisible();
  await bar.getByRole("button", { name: "Ben", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.objects[nemesis]?.zone === "battlefield");
  expect(after.objects[nemesis]!.chosen?.player).toBe(2);
  expect(after.log.some((l) => l.text === "You chooses Ben for True-Name Nemesis.")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
