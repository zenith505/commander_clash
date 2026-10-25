// Round 156's prompts: Tannuk, Steadfast Second's Warp button on artifact and red creature cards in your hand, and
// Reluctant Role Model's survival choice among three kinds of counter.
import { expect, test } from "@playwright/test";
import { one, open, pageErrors, scene } from "./scene";
import { card, controls, menu, resolveUntil } from "./ui";

test("Tannuk: Hill Giant in your hand has a Warp button for {2}{R}", async ({ page }) => {
  const s = scene({ hand: ["Hill Giant"], board: ["Tannuk, Steadfast Second", "Mountain", "Mountain", "Mountain", "Forest", "Forest"] });
  const giant = one(s, "Hill Giant");
  await open(page, s);
  await card(page, "Hill Giant", s).click();
  await expect(menu(page).getByRole("button", { name: /^Cast/ })).toBeVisible();
  await menu(page).getByRole("button", { name: /^Warp/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[giant]!.zone === "battlefield");
  expect(after.objects[giant]!.castAlt).toBe("grantedWarp");
  expect(after.log.some((l) => l.text === "You casts Hill Giant for its warp cost.")).toBe(true);
  // Paid {2}{R}: three lands tapped, two left.
  expect(Object.values(after.objects).filter((o) => o.zone === "battlefield" && o.owner === 0 && o.tapped)).toHaveLength(3);
  expect(pageErrors(page)).toEqual([]);
});

test("Reluctant Role Model: tapped at your second main phase, choose a lifelink counter", async ({ page }) => {
  const s = scene({ board: ["Reluctant Role Model"] }, [], { step: "endCombat" });
  const role = one(s, "Reluctant Role Model");
  s.objects[role]!.tapped = true;
  await open(page, s);
  const t = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption");
  expect(t.pending).toMatchObject({ what: "counterKind", options: ["flying", "lifelink", "+1/+1"] });
  const bar = controls(page);
  await expect(bar.getByRole("button", { name: "flying" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "+1/+1" })).toBeVisible();
  await bar.getByRole("button", { name: "lifelink" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && (st.objects[role]!.counters?.lifelink ?? 0) === 1);
  expect(after.objects[role]!.counters?.flying).toBeUndefined();
  expect(pageErrors(page)).toEqual([]);
});
