// Round 189's prompts: SOLDIER Military Program's "choose one. If you control a commander, you may choose both
// instead", then its "up to two Soldiers" pick; By Invitation Only's number, then the creatures you sacrifice.
import { expect, test } from "@playwright/test";
import { invalidateCharacteristics, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

/** Our commander on the battlefield instead of in the command zone. */
function commanderOut(s: GameState) {
  const id = s.players[0]!.command.find((x) => s.objects[x]!.isCommander)!;
  s.players[0]!.command = s.players[0]!.command.filter((x) => x !== id);
  s.objects[id]!.zone = "battlefield";
  s.battlefield.push(id);
  invalidateCharacteristics(s);
  return s;
}

test("SOLDIER Military Program: with a commander, choose both; a Soldier token, then +1/+1 counters on up to two Soldiers", async ({ page }) => {
  const s = commanderOut(scene({ commander: "Isamaru, Hound of Konda", board: ["SOLDIER Military Program", "Goldmeadow Harrier", "Kinscaer Sentry"] }));
  const [harrier, sentry] = [one(s, "Goldmeadow Harrier"), one(s, "Kinscaer Sentry")];
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseModes");
  const modes = page.locator(".mode-menu");
  await expect(modes).toContainText("SOLDIER Military Program");
  await modes.getByRole("button", { name: /Create a 1\/1 white Soldier/ }).click();
  await modes.getByRole("button", { name: /Put a \+1\/\+1 counter on each of up to two Soldiers/ }).click();
  await modes.getByRole("button", { name: "Done" }).click();
  const st = await resolveUntil(page, (x) => x.pending?.kind === "pickPermanents" && x.pending.player === 0);
  const token = st.battlefield.find((id) => st.objects[id]!.isToken)!;
  expect(token).toBeTruthy();
  const bar = controls(page);
  await expect(bar).toContainText("click up to two Soldiers of yours");
  await expect(bar.getByRole("button", { name: "Put none" })).toBeEnabled();
  await page.locator(`[data-obj="${harrier}"]`).click();
  await page.locator(`[data-obj="${token}"]`).click();
  await bar.getByRole("button", { name: "Put counters" }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && x.objects[harrier]!.counters["+1/+1"] === 1);
  expect([after.objects[token]!.counters["+1/+1"], after.objects[sentry]!.counters["+1/+1"] ?? 0]).toEqual([1, 0]);
  expect(pageErrors(page)).toEqual([]);
});

test("SOLDIER Military Program without a commander: one mode only, chosen with one click", async ({ page }) => {
  const s = scene({ board: ["SOLDIER Military Program", "Goldmeadow Harrier"] });
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseModes");
  const modes = page.locator(".mode-menu");
  await expect(modes.getByRole("button", { name: "Done" })).toHaveCount(0);
  await modes.getByRole("button", { name: /Create a 1\/1 white Soldier/ }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && x.battlefield.some((id) => x.objects[id]!.isToken));
  expect(after.battlefield.filter((id) => after.objects[id]!.isToken)).toHaveLength(1);
  expect(pageErrors(page)).toEqual([]);
});

test("By Invitation Only: choose 2, then click the two creatures of yours to sacrifice", async ({ page }) => {
  const s = scene({ hand: ["By Invitation Only"], board: [...LANDS, "Grizzly Bears", "Hill Giant", "Goblin Piker"] }, [{ board: ["Ornithopter"] }]);
  const [bears, giant, piker, thopter] = [one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Goblin Piker"), one(s, "Ornithopter")];
  await open(page, s);
  await card(page, "By Invitation Only", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "number" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("choose a number between 0 and 13");
  await bar.getByRole("button", { name: "Number plus one" }).click();
  await bar.getByRole("button", { name: "Number plus one" }).click();
  await bar.getByRole("button", { name: "Choose 2" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  await page.locator(`[data-obj="${bears}"]`).click();
  await page.locator(`[data-obj="${piker}"]`).click();
  await bar.getByRole("button", { name: "Sacrifice", exact: true }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && x.objects[bears]!.zone === "graveyard");
  expect([bears, giant, piker, thopter].map((id) => after.objects[id]!.zone)).toEqual(["graveyard", "battlefield", "graveyard", "graveyard"]);
  expect(pageErrors(page)).toEqual([]);
});
