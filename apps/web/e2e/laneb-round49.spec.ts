// Lane B round 49 in the browser: Never Happened's "You choose a nonland card from that player's graveyard or hand and
// exile it": one picker holding the revealed hand and then the graveyard, each card marked with its zone.
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, modal, resolveUntil } from "./ui";

test("Never Happened: pick a nonland card from the opponent's hand and graveyard together, here one from the graveyard", async ({ page }) => {
  const s = scene({ hand: ["Never Happened"], board: LANDS }, [{ hand: ["Grizzly Bears", "Forest"], yard: ["Hill Giant", "Swamp"] }]);
  const [bears, giant] = [one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  const forest = idsOf(s, "Forest", "hand", 1)[0]!;
  const swamp = idsOf(s, "Swamp", "graveyard", 1)[0]!;
  await open(page, s);
  await card(page, "Never Happened", s).click();
  await clickPlayer(page, 1);
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  await expect(pick).toContainText("Ana's hand and graveyard");
  // Lands from either zone are shown but can't be taken.
  await expect(pick.locator(`[data-pick="${forest}"]`)).toHaveClass(/dim/);
  await expect(pick.locator(`[data-pick="${swamp}"]`)).toHaveClass(/dim/);
  await expect(pick.locator(`[data-pick="${bears}"] .zone-label`)).toHaveText("hand");
  await expect(pick.locator(`[data-pick="${giant}"] .zone-label`)).toHaveText("graveyard");
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[giant]!.zone).toBe("exile");
  expect(after.objects[bears]!.zone).toBe("hand");
  expect(after.players[1]!.hand).toHaveLength(2);
  expect(pageErrors(page)).toEqual([]);
});
