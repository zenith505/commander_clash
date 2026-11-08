// Round 311's new prompt: Azra Oddsmaker's "you may discard a card. If you do, choose a creature" at the beginning of
// combat, a pick among anyone's creatures; when the chosen one deals combat damage to a player this turn, you draw two.
import { expect, test } from "@playwright/test";
import { open, one, pageErrors, scene } from "./scene";
import { attack, card, controls, resolveUntil } from "./ui";

test("Azra Oddsmaker: discard Hill Giant, choose Grizzly Bears; it hits Ana (no blockers) and you draw two cards", async ({ page }) => {
  const s = scene({ hand: ["Hill Giant", "Opt"], board: ["Azra Oddsmaker", "Grizzly Bears"] }, [{}, { board: ["Craw Wurm"] }]);
  const [giant, bears, wurm] = [one(s, "Hill Giant"), one(s, "Grizzly Bears"), one(s, "Craw Wurm")];
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  const bar = controls(page);
  await bar.getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "discard" && st.pending.player === 0);
  await card(page, "Hill Giant", s).click();
  await bar.getByRole("button", { name: "Discard" }).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  // Anyone's creature: Ben's Craw Wurm is a choice too.
  expect((asked.pending as { options: string[] }).options).toEqual(expect.arrayContaining([bears, wurm]));
  await expect(bar).toContainText("click a creature (anyone's), then choose it");
  await page.locator(`[data-obj="${bears}"]`).click();
  await bar.getByRole("button", { name: "Choose", exact: true }).click();
  const chosen = await resolveUntil(page, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0);
  expect(chosen.objects[giant]!.zone).toBe("graveyard");
  expect(chosen.players[0]!.hand).toHaveLength(1);
  await attack(page, [[bears, 1]]);
  const after = await resolveUntil(page, (st) => st.players[1]!.life < s.players[1]!.life && st.stack.length === 0 && !st.pending, 60);
  expect(after.players[1]!.life).toBe(s.players[1]!.life - 2);
  expect(after.players[0]!.hand).toHaveLength(3);
  expect(pageErrors(page)).toEqual([]);
});
