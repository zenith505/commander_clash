// "Target player skips their next draw step" (CR 614.10): Fatigue targets an opponent by clicking their name, their
// seat shows the pending skip, and it goes away once their draw step has been skipped. Meditate's skipped turn shows on
// your own seat.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, resolveUntil, seat } from "./ui";

test("Fatigue: the opponent's seat shows the skipped draw step until it's skipped", async ({ page }) => {
  const s = scene({ hand: ["Fatigue", "Meditate"], board: LANDS });
  await open(page, s);
  await card(page, "Fatigue", s).click();
  await clickPlayer(page, 1);
  let st = await resolveUntil(page, (x) => x.stack.length === 0 && x.objects[one(s, "Fatigue")]!.zone === "graveyard");
  expect(st.players[1]!.skips).toEqual([{ what: "draw" }]);
  await expect(seat(page, 1)).toContainText("Skips next draw step");
  await card(page, "Meditate", s).click();
  st = await resolveUntil(page, (x) => x.stack.length === 0 && x.objects[one(s, "Meditate")]!.zone === "graveyard");
  await expect(seat(page, 0)).toContainText("Skips next turn");
  // Seat 1's turn comes and its draw step is skipped.
  st = await resolveUntil(page, (x) => x.activePlayer === 1 && x.step === "main1", 200);
  expect(st.players[1]!.skips).toBeUndefined();
  await expect(seat(page, 1)).not.toContainText("Skips");
  expect(pageErrors(page)).toEqual([]);
});
