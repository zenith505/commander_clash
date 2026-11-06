// Round 283 in the browser: Binding Negotiation reveals the target opponent's hand; with no nonland card chosen from
// it, you may put a face-up exiled card that player owns into their graveyard (a picker over their exiled cards).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, modal, resolveUntil } from "./ui";

test("Binding Negotiation: choose no card from the hand, then put the opponent's exiled card into their graveyard", async ({ page }) => {
  const s = scene({ hand: ["Binding Negotiation"], board: LANDS }, [{ hand: ["Lightning Bolt"], exile: ["Hill Giant"] }, { exile: ["Shock"] }]);
  const [bolt, giant, shock] = [one(s, "Lightning Bolt"), one(s, "Hill Giant"), one(s, "Shock")];
  await open(page, s);
  await card(page, "Binding Negotiation", s).click();
  await clickPlayer(page, 1);
  // The revealed hand first: choose nothing.
  const fromHand = await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  expect(fromHand.pending).toMatchObject({ kind: "searchLibrary", player: 0, cards: [bolt], min: 0 });
  await page.getByRole("button", { name: "Take none" }).click();
  // Then the exiled cards Ana owns, face up: the Giant, not Ben's Shock.
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.exiled === true);
  const pick = modal(page);
  await expect(pick.locator(`[data-pick="${shock}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0);
  expect(after.objects[giant]!.zone).toBe("graveyard");
  expect(after.players[1]!.graveyard).toContain(giant);
  expect(after.objects[bolt]!.zone).toBe("hand");
  expect(after.objects[shock]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});
