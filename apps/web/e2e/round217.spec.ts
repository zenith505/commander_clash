// Round 217: Ill-Gotten Gains: "Each player discards their hand, then returns up to three cards from their graveyard to
// their hand": you choose up to three of your graveyard's cards, the cards just discarded among them.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, modal, resolveUntil } from "./ui";

test("Ill-Gotten Gains: return up to three cards from your graveyard after discarding your hand", async ({ page }) => {
  const s = scene({ hand: ["Ill-Gotten Gains", "Hill Giant"], board: LANDS, yard: ["Grizzly Bears", "Lightning Bolt", "Runeclaw Bear", "Shock"] });
  const [gains, giant, bears, bolt, runeclaw, shock] = ["Ill-Gotten Gains", "Hill Giant", "Grizzly Bears", "Lightning Bolt", "Runeclaw Bear", "Shock"].map((n) => one(s, n)) as [string, string, string, string, string, string];
  await open(page, s);
  await card(page, "Ill-Gotten Gains", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const pick = modal(page);
  await expect(pick).toContainText("you may return up to 3 cards from your graveyard to your hand");
  // The Hill Giant you just discarded is there too.
  await expect(pick.locator(`[data-pick="${giant}"]`)).toHaveCount(1);
  for (const id of [giant, bears, bolt]) await pick.locator(`[data-pick="${id}"]`).click();
  await expect(pick.locator("[data-found]")).toHaveCount(3);
  // A fourth can't be added.
  await pick.locator(`[data-pick="${runeclaw}"]`).click();
  await expect(pick.locator("[data-found]")).toHaveCount(3);
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[gains]!.zone === "exile");
  expect([giant, bears, bolt].map((id) => after.objects[id]!.zone)).toEqual(["hand", "hand", "hand"]);
  expect([runeclaw, shock].map((id) => after.objects[id]!.zone)).toEqual(["graveyard", "graveyard"]);
  expect(pageErrors(page)).toEqual([]);
});
