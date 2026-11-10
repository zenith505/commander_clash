// Lane B round B169 in the browser: Moonlight Bargain's picker takes the cards to keep from the top five, says how much
// life that pays, and puts the rest into the graveyard.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, modal, resolveUntil } from "./ui";

test("Moonlight Bargain: keep two of the top five for 4 life; the other three go to the graveyard", async ({ page }) => {
  const top = ["Shock", "Opt", "Grizzly Bears", "Hill Giant", "Lightning Bolt"];
  const s = scene({ hand: ["Moonlight Bargain"], board: LANDS, library: top });
  const [shock, opt, bears, giant, bolt] = top.map((n) => one(s, n)) as [string, string, string, string, string];
  await open(page, s);
  await card(page, "Moonlight Bargain", s).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  expect([...(asked.pending as { cards: string[] }).cards].sort()).toEqual([shock, opt, bears, giant, bolt].sort());
  const pick = modal(page);
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.locator(`[data-pick="${bolt}"]`).click();
  await expect(pick).toContainText("You'll pay 4 life.");
  await expect(pick).toContainText("into your graveyard");
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "hand");
  expect(after.objects[bolt]!.zone).toBe("hand");
  for (const id of [shock, opt, bears]) expect(after.objects[id]!.zone).toBe("graveyard");
  expect(after.players[0]!.life).toBe(36);
  expect(pageErrors(page)).toEqual([]);
});
