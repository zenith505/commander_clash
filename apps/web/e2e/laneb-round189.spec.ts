// Lane B round B189 in the browser: Worldpurge's "Each player chooses up to seven cards in their hand, then shuffles the rest
// into their library": click the cards to keep, then "Keep".
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Worldpurge: keep Grizzly Bears and Hill Giant, the returned lands are shuffled into your library", async ({ page }) => {
  const s = scene({ hand: ["Worldpurge", "Grizzly Bears", "Hill Giant"], board: LANDS }, [{ board: ["Serra Angel"] }]);
  const [bears, giant, angel] = ["Grizzly Bears", "Hill Giant", "Serra Angel"].map((n) => one(s, n)) as [string, string, string];
  const library = s.players[0]!.library.length;
  await open(page, s);
  await card(page, "Worldpurge", s).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "discard" && st.pending.player === 0);
  expect(asked.pending).toMatchObject({ kind: "discard", count: 7, upTo: true, keep: true });
  // The lands came back too.
  expect(asked.players[0]!.hand.length).toBe(LANDS.length + 2);
  const bar = controls(page);
  await expect(bar).toContainText("click up to 7 cards in your hand to keep");
  // A fanned hand of 17: click each card on its uncovered left edge.
  await page.locator(`[data-obj="${bears}"]`).first().click({ position: { x: 6, y: 30 } });
  await page.locator(`[data-obj="${giant}"]`).first().click({ position: { x: 6, y: 30 } });
  await bar.getByRole("button", { name: "Keep" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.players[0]!.hand.length === 2);
  expect([...after.players[0]!.hand].sort()).toEqual([bears, giant].sort());
  expect(after.players[0]!.library.length).toBe(library + LANDS.length);
  // Ana's Serra Angel went back to her hand, and she kept it or shuffled it away.
  expect(["hand", "library"]).toContain(after.objects[angel]!.zone);
  expect(after.battlefield.filter((id) => !after.objects[id]!.isToken)).toEqual([]);
  expect(pageErrors(page)).toEqual([]);
});
