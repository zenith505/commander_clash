// Terminus: all creatures go to the bottom of their owners' libraries; each owner orders their own (CR 401.4), you in
// the arrange prompt, the bots on their own, and then they all move at once.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, modal, resolveUntil } from "./ui";

test("Terminus: order your creatures going to the bottom of your library", async ({ page }) => {
  const s = scene({ hand: ["Terminus"], board: [...LANDS, "Grizzly Bears", "Hill Giant"] }, [{ board: ["Goblin Piker"] }]);
  const bears = one(s, "Grizzly Bears");
  const giant = one(s, "Hill Giant");
  const piker = one(s, "Goblin Piker");
  await open(page, s);
  await card(page, "Terminus", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "arrangeTop" && st.pending.player === 0);
  const arrange = page.locator(".modal.arrange");
  await expect(arrange).toContainText("Terminus: put 2 cards on the bottom of your library in any order");
  await arrange.getByRole("button", { name: "Done" }).click();
  await expect(modal(page)).toHaveCount(0);
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.triggerQueue.length === 0);
  const lib = after.players[0]!.library;
  expect(lib.slice(-2).sort()).toEqual([bears, giant].sort());
  expect(after.players[1]!.library.at(-1)).toBe(piker);
  expect(pageErrors(page)).toEqual([]);
});
