// Lane B round 104 in the browser: Stream of Thought's "You shuffle up to four cards from your graveyard into your
// library": after Ana mills four, you click two of the cards in your graveyard, then Done; they go into your library.
import { expect, test } from "@playwright/test";
import { one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, modal, resolveUntil } from "./ui";

test("Stream of Thought: target Ana, she mills four, then you pick two cards in your graveyard to shuffle into your library", async ({ page }) => {
  const s = scene({ hand: ["Stream of Thought"], board: ["Island"], yard: ["Grizzly Bears", "Hill Giant", "Divination"] });
  const [bears, giant, div] = ["Grizzly Bears", "Hill Giant", "Divination"].map((n) => one(s, n));
  const anaLibrary = s.players[1]!.library.length;
  await open(page, s);
  await card(page, "Stream of Thought", s).click();
  // Its replicate cost: not paid.
  await page.getByRole("button", { name: "Don't pay" }).click();
  await clickPlayer(page, 1);
  const st = await resolveUntil(page, (x) => x.pending?.kind === "searchLibrary" && x.pending.player === 0);
  expect(st.players[1]!.library).toHaveLength(anaLibrary - 4);
  const shown = (st.pending as { cards: string[] }).cards;
  expect([...shown].sort()).toEqual([bears, giant, div].sort());
  const pick = modal(page);
  await pick.locator(`[data-pick="${bears}"]`).click();
  await pick.locator(`[data-pick="${div}"]`).click();
  await pick.getByRole("button", { name: "Done", exact: true }).click();
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending && x.objects[bears!]!.zone === "library");
  expect([bears, giant, div].map((id) => after.objects[id!]!.zone)).toEqual(["library", "graveyard", "library"]);
  expect(after.players[0]!.graveyard).toContain(one(s, "Stream of Thought"));
  expect(pageErrors(page)).toEqual([]);
});
