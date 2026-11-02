// Round 241's prompts: Zareth San, the Trickster's ability from your hand (a cost picker for the unblocked attacking Rogue
// it returns), then the choice of what Zareth attacks as it enters (CR 508.4: not ninjutsu, so not necessarily what the
// Rogue was attacking).
import { expect, test } from "@playwright/test";
import { applyAction, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { controls, menu, resolveUntil } from "./ui";

test("Zareth San: return your unblocked attacking Rogue, then choose whom Zareth attacks", async ({ page }) => {
  let s: GameState = scene({ hand: ["Zareth San, the Trickster"], board: ["Merfolk Windrobber", ...LANDS] });
  const [zareth, rogue] = [one(s, "Zareth San, the Trickster"), one(s, "Merfolk Windrobber")];
  // In the engine: you attack Ana with the Rogue, and no one blocks.
  s = playUntil(s, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0);
  s = applyAction(s, { type: "declareAttackers", player: 0, attacks: [{ attacker: rogue, defender: 1 }] });
  s = playUntil(s, (st) => st.step === "declareBlockers" && !st.pending && st.priority === 0 && st.stack.length === 0);
  await open(page, s);
  await page.locator(`[data-obj="${zareth}"]`).first().click();
  await menu(page).getByRole("button", { name: /Return an unblocked attacking Rogue/ }).click();
  const bar = page.locator(".targeting", { hasText: "return an unblocked attacking Rogue you control to hand" });
  await expect(bar.getByRole("button", { name: "Return and activate" })).toBeDisabled();
  await page.locator(`[data-obj="${rogue}"]`).first().click();
  await bar.getByRole("button", { name: "Return and activate" }).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "attackWhom" && st.pending.player === 0);
  expect(asked.objects[rogue]!.zone).toBe("hand");
  const prompt = controls(page);
  await expect(prompt).toContainText("choose what Zareth San, the Trickster attacks");
  await prompt.getByRole("button", { name: "Ben", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.objects[zareth]!.zone === "battlefield" && st.stack.length === 0);
  expect(after.objects[zareth]!.attacking).toBe(2);
  expect(after.objects[zareth]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
