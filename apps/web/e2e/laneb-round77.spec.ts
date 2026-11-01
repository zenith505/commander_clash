// Lane B round 77 in the browser: Disciple of Phenax's "target player reveals a number of cards from their hand" (you pick
// which cards to reveal, then the bot picks one for you to discard), and Rescuer Sphinx's "as this creature enters, you
// may return a nonland permanent you control" (click it, then Return, or Return none).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, playWithBots, scene } from "./scene";
import { card, controls, modal, resolveUntil } from "./ui";

test("Disciple of Phenax: Ana's Disciple makes you reveal two cards of your choice; she picks one for you to discard", async ({ page }) => {
  let s = scene({ hand: ["Opt", "Shock", "Divination", "Lightning Bolt"] }, [{ hand: ["Disciple of Phenax"], board: ["Swamp", "Swamp", "Swamp", "Swamp"] }]);
  const [opt, shock, divination, bolt] = [one(s, "Opt"), one(s, "Shock"), one(s, "Divination"), one(s, "Lightning Bolt")];
  s = playWithBots(s, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  await open(page, s);
  const pick = modal(page);
  await expect(pick).toContainText("Disciple of Phenax: reveal 2 cards from your hand; Ana chooses one of them for you to discard");
  await pick.locator(`[data-pick="${opt}"]`).click();
  await pick.locator(`[data-pick="${shock}"]`).click();
  await pick.getByRole("button", { name: "Reveal", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[0]!.hand.length === 3);
  expect([opt, shock].filter((id) => after.objects[id]!.zone === "graveyard")).toHaveLength(1);
  expect(after.objects[divination]!.zone).toBe("hand");
  expect(after.objects[bolt]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});

test("Rescuer Sphinx: return Sol Ring as it enters; it enters with a +1/+1 counter", async ({ page }) => {
  const s = scene({ hand: ["Rescuer Sphinx"], board: [...LANDS, "Sol Ring"] });
  const [sphinx, sol] = [one(s, "Rescuer Sphinx"), one(s, "Sol Ring")];
  await open(page, s);
  await card(page, "Rescuer Sphinx", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("you may return a nonland permanent you control to its owner's hand as it enters");
  await expect(bar.getByRole("button", { name: "Return none" })).toBeEnabled();
  await page.locator(`[data-obj="${sol}"]`).first().click();
  await bar.getByRole("button", { name: "Return", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[sphinx]!.zone === "battlefield");
  expect(after.objects[sol]!.zone).toBe("hand");
  expect(after.objects[sphinx]!.counters["+1/+1"]).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Rescuer Sphinx: Return none, and it enters without a counter", async ({ page }) => {
  const s = scene({ hand: ["Rescuer Sphinx"], board: [...LANDS, "Sol Ring"] });
  const [sphinx, sol] = [one(s, "Rescuer Sphinx"), one(s, "Sol Ring")];
  await open(page, s);
  await card(page, "Rescuer Sphinx", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  await controls(page).getByRole("button", { name: "Return none" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[sphinx]!.zone === "battlefield");
  expect(after.objects[sol]!.zone).toBe("battlefield");
  expect(after.objects[sphinx]!.counters["+1/+1"] ?? 0).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});
