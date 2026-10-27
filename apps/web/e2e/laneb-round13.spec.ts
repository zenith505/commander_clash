// Lane B round 13's prompt: an upkeep trigger's "unless you pay" (Vaporous Djinn: "~ phases out unless you pay {U}{U}").
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { controls, resolveUntil } from "./ui";

/** Your next upkeep, on Vaporous Djinn's question. */
const atDjinnUpkeep = () => {
  const s0 = scene({ board: [...LANDS, "Vaporous Djinn"] });
  const djinn = one(s0, "Vaporous Djinn");
  const s = playUntil(s0, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0 && st.activePlayer === 0 && st.step === "upkeep");
  return { s, djinn };
};

test("Vaporous Djinn: Pay {U}{U} in your upkeep and it stays", async ({ page }) => {
  const { s, djinn } = atDjinnUpkeep();
  expect(s.pending).toMatchObject({ kind: "chooseMay", player: 0, pay: { mana: "{U}{U}" } });
  await open(page, s);
  await expect(controls(page)).toContainText("Vaporous Djinn:");
  await controls(page).getByRole("button", { name: "Pay", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.pending?.kind !== "chooseMay" && st.stack.length === 0);
  expect(after.objects[djinn]!.zone).toBe("battlefield");
  const islands = after.battlefield.filter((id) => after.objects[id]!.controller === 0 && after.objects[id]!.tapped);
  expect(islands.length).toBe(2);
  expect(pageErrors(page)).toEqual([]);
});

test("Vaporous Djinn: Don't pay and it phases out", async ({ page }) => {
  const { s, djinn } = atDjinnUpkeep();
  await open(page, s);
  await controls(page).getByRole("button", { name: "Don't pay" }).click();
  const after = await resolveUntil(page, (st) => st.objects[djinn]!.zone === "phasedOut");
  expect(after.battlefield).not.toContain(djinn);
  expect(pageErrors(page)).toEqual([]);
});
