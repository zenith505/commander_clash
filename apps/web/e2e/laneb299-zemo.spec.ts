// Round B299 (Lane B): Baron Helmut Zemo's boast, "Exile any number of black cards from your graveyard with fifteen or more
// black mana symbols among their mana costs: Copy those exiled cards. You may cast up to three of the copies without paying
// their mana costs.": the graveyard picker counts black mana symbols, then the copies are cast one at a time.
import { expect, test } from "@playwright/test";
import { one, open, pageErrors, scene } from "./scene";
import { controls, menu, modal, resolveUntil } from "./ui";

test("Baron Helmut Zemo: exile black cards with fifteen black mana symbols, then cast a copy of Night's Whisper", async ({ page }) => {
  const yard = ["Phyrexian Obliterator", "Necropotence", "Ashenmoor Liege", "Sign in Blood", "Dismember", "Night's Whisper", "Sludge Crawler"];
  const s = scene({ board: ["Baron Helmut Zemo"], yard }, [], { step: "main2" });
  const zemo = one(s, "Baron Helmut Zemo");
  const [obl, nec, liege, sign, dis, whisper, sludge] = yard.map((n) => one(s, n));
  // It attacked this turn (CR 702.142a).
  s.objects[zemo]!.attacked = { turn: s.turn, n: 1 };
  const hand0 = s.players[0]!.hand.length;
  const life0 = s.players[0]!.life;
  await open(page, s);
  await page.locator(`[data-obj="${zemo}"]`).click();
  await menu(page).getByRole("button", { name: /black cards/ }).click();
  const pick = modal(page);
  await expect(pick).toContainText("Baron Helmut Zemo: exile black cards from your graveyard with 15 or more black mana symbols among their mana costs");
  // Sludge Crawler is devoid: colorless, so not a black card.
  await expect(pick.locator(`[data-pick="${sludge}"]`)).toHaveCount(0);
  for (const id of [obl, nec, liege, sign, dis]) await pick.locator(`[data-pick="${id}"]`).click();
  // 4 + 3 + 3 (hybrid {B/R}) + 2 + 2 (Phyrexian {B/P}): fourteen.
  await expect(pick).toContainText("black mana symbols 14 of 15");
  await expect(pick.getByRole("button", { name: "Done" })).toBeDisabled();
  await pick.locator(`[data-pick="${whisper}"]`).click();
  await expect(pick).toContainText("black mana symbols 15 of 15");
  await pick.getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromAmong" && st.pending.player === 0);
  const bar = controls(page);
  await bar.getByRole("button", { name: "Night's Whisper" }).click();
  await bar.getByRole("button", { name: "Cast it" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromAmong" && !st.pending.options.includes(whisper));
  await bar.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[0]!.hand.length === hand0 + 2);
  expect(after.players[0]!.life).toBe(life0 - 2);
  // The cards stay exiled; the copy is gone.
  expect([obl, nec, liege, sign, dis, whisper].map((id) => after.objects[id]!.zone)).toEqual(Array(6).fill("exile"));
  expect(after.objects[sludge]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});
