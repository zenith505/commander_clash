// Lane B round B242 in the browser: Last Light of Durin's Day's sixth quest counter, then its search of your hand and/or
// library, chosen as "Hand only" (no shuffle) or "Hand and library".
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { controls, modal, resolveUntil } from "./ui";

const game = () => {
  const s = scene({ hand: ["Mountain", "Shivan Dragon"], board: [...LANDS, "Last Light of Durin's Day"] });
  const light = one(s, "Last Light of Durin's Day");
  s.objects[light]!.counters.quest = 5;
  return { s, light, mountain: idsOf(s, "Mountain", "hand", 0)[0]!, dragon: one(s, "Shivan Dragon") };
};

test("Last Light of Durin's Day: play a Mountain, it's sacrificed and you search only your hand for Shivan Dragon", async ({ page }) => {
  const { s, light, mountain, dragon } = game();
  const order = [...s.players[0]!.library];
  await open(page, s);
  await page.locator(`[data-obj="${mountain}"]`).first().click();
  const mid = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption");
  expect(mid.objects[light]!.zone).toBe("graveyard");
  await expect(controls(page)).toContainText("search your library too (then shuffle), or only your hand?");
  await controls(page).getByRole("button", { name: "Hand only" }).click();
  const pick = modal(page);
  await pick.locator(`[data-pick="${dragon}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[dragon]!.zone === "battlefield");
  expect(after.players[0]!.library).toEqual(order);
  expect(after.log.some((l) => l.text === "You searches their hand, finds a card (Shivan Dragon).")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Last Light of Durin's Day: searching your hand and library too, then shuffling", async ({ page }) => {
  const { s, mountain, dragon } = game();
  await open(page, s);
  await page.locator(`[data-obj="${mountain}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption");
  await controls(page).getByRole("button", { name: "Hand and library" }).click();
  const pick = modal(page);
  await pick.locator(`[data-pick="${dragon}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[dragon]!.zone === "battlefield");
  expect(after.log.some((l) => l.text === "You searches their hand and library, finds a card (Shivan Dragon), and shuffles.")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
