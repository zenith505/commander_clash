// Lane B round B226 in the browser: Shimmer's land type chosen as it enters (Ana's Islands get phasing), Hall of Gemstone's
// color chosen at your upkeep (a Forest then taps for the chosen color), and foretelling on Ana's turn for {1} with Cosmos
// Charger.
import { expect, test } from "@playwright/test";
import { applyAction, botActions, characteristics, waitingOn, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, controls, menu, resolveUntil } from "./ui";

test("Shimmer: choose Island as it enters; Ana's Islands have phasing, her Forest doesn't", async ({ page }) => {
  const s = scene({ hand: ["Shimmer"], board: LANDS }, [{ board: ["Island", "Island", "Forest"] }]);
  const anaIslands = idsOf(s, "Island", "battlefield", 1);
  const anaForest = idsOf(s, "Forest", "battlefield", 1)[0]!;
  await open(page, s);
  await card(page, "Shimmer", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "landType" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("choose a land type");
  // Any land type, nonbasic ones too.
  await expect(bar.getByRole("button", { name: "Desert" })).toBeVisible();
  await bar.getByRole("button", { name: "Island", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.battlefield.some((id) => st.objects[id]!.chosen?.landType === "Island"));
  expect(anaIslands).toHaveLength(2);
  for (const id of anaIslands) expect(characteristics(after, after.objects[id]!).keywords).toContain("Phasing");
  expect(characteristics(after, after.objects[anaForest]!).keywords).not.toContain("Phasing");
  expect(pageErrors(page)).toEqual([]);
});

test("Hall of Gemstone: at your upkeep choose blue; then in your main phase a Forest taps for {U}", async ({ page }) => {
  let s = scene({ board: [...LANDS, "Hall of Gemstone"] });
  const hall = one(s, "Hall of Gemstone");
  // The other players choose at their own upkeeps (bots); then it's your upkeep and your question.
  s = playUntil(s, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "color" && st.pending.player === 0 && st.activePlayer === 0);
  const forest = idsOf(s, "Forest", "battlefield", 0).at(-1)!; // the top of the pile
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("choose a color");
  await bar.getByRole("button", { name: "Blue" }).click();
  // Until end of turn: in your first main phase too.
  const chosen = await resolveUntil(page, (st) => st.step === "main1" && st.activePlayer === 0 && st.stack.length === 0 && !st.pending && (st.landManaRules ?? []).some((r) => r.turn === st.turn && r.mana === "U" && r.colored));
  expect(chosen.objects[hall]!.zone).toBe("battlefield");
  await page.locator(`[data-obj="${forest}"]`).click();
  const after = await resolveUntil(page, (st) => st.objects[forest]!.tapped === true);
  expect(after.players[0]!.manaPool).toMatchObject({ U: 1, G: 0 });
  expect(pageErrors(page)).toEqual([]);
});

test("Cosmos Charger: on Ana's turn, foretell Augury Raven from your hand for {1}", async ({ page }) => {
  let s: GameState = scene({ hand: ["Augury Raven"], board: [...LANDS, "Cosmos Charger"] });
  const raven = one(s, "Augury Raven");
  // On to Ana's end step with priority for you (her main phase with an empty stack doesn't stop for you).
  for (let i = 0; i < 400 && !(s.activePlayer === 1 && s.step === "end" && !s.stack.length && !s.pending && waitingOn(s) === 0); i++) {
    const pid = waitingOn(s)!;
    s = applyAction(s, pid === 0 ? (s.pending?.player === 0 ? botActions(s, 0)[0]! : { type: "passPriority", player: 0 }) : botActions(s, pid)[0]!);
  }
  expect([s.activePlayer, s.step]).toEqual([1, "end"]);
  const untapped = s.battlefield.filter((id) => !s.objects[id]!.tapped).length;
  await open(page, s);
  await card(page, "Augury Raven", s).click();
  const foretell = menu(page).getByRole("button", { name: /^Foretell/ });
  await expect(foretell).toBeEnabled();
  await expect(foretell.locator("[title='{1}']")).toHaveCount(1);
  await foretell.click();
  const after = await resolveUntil(page, (st) => st.objects[raven]!.zone === "exile");
  expect(after.objects[raven]!.foretold).toBe(true);
  expect([after.activePlayer, after.step]).toEqual([1, "end"]);
  expect(after.battlefield.filter((id) => !after.objects[id]!.tapped)).toHaveLength(untapped - 1);
  expect(pageErrors(page)).toEqual([]);
});
