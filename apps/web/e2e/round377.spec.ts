// Round 377: Garth One-Eye's name buttons and the copy cast for its cost, Stalking Leonin's secret opponent and its reveal
// against an attacker, and Sphinx Ambassador's hidden search, the name its victim chooses and the "put it onto the
// battlefield" question.
import { expect, test } from "@playwright/test";
import { applyAction, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playUntil, scene } from "./scene";
import { attack, card, controls, menu, modal, resolveUntil } from "./ui";

const GARTH_NAMES = ["Disenchant", "Braingeyser", "Terror", "Shivan Dragon", "Regrowth", "Black Lotus"];

test("Garth One-Eye: choose Black Lotus from the six names, cast the copy, get a Black Lotus token", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Garth One-Eye"] });
  const garth = one(s, "Garth One-Eye");
  await open(page, s);
  await page.locator(`[data-obj="${garth}"]`).click();
  if (await menu(page).count()) await menu(page).locator("button", { hasText: "Choose a card name" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "namedCopy" && st.pending.player === 0);
  const pick = page.locator(".named-copy-pick");
  await expect(pick).toContainText("Garth One-Eye:");
  for (const n of GARTH_NAMES) await expect(pick.getByRole("button", { name: n, exact: true })).toHaveCount(1);
  await pick.getByRole("button", { name: "Black Lotus", exact: true }).click();
  const offer = await resolveUntil(page, (st) => st.pending?.kind === "castFree" && st.pending.player === 0);
  expect(offer.pending?.kind === "castFree" && offer.pending.how).toBe("paid");
  await controls(page).getByRole("button", { name: "Cast it" }).click();
  const isLotus = (st: GameState, id: string) => st.objects[id]!.isToken && st.cards[st.objects[id]!.cardId]?.name === "Black Lotus" && st.objects[id]!.controller === 0;
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.battlefield.some((id) => isLotus(st, id)));
  expect(after.namesChosenFor?.[`${garth}@${after.objects[garth]!.zoneChanges ?? 0}`]).toEqual(["Black Lotus"]);
  expect(after.objects[garth]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Stalking Leonin: its enters trigger asks you to secretly choose an opponent", async ({ page }) => {
  const s = scene({ hand: ["Stalking Leonin"], board: LANDS });
  const leonin = one(s, "Stalking Leonin");
  await open(page, s);
  await card(page, "Stalking Leonin", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "opponent" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Stalking Leonin: secretly choose an opponent");
  await expect(bar.getByRole("button", { name: "You (you)", exact: true })).toHaveCount(0);
  await bar.getByRole("button", { name: "Ben", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[leonin]!.zone === "battlefield");
  expect(after.objects[leonin]!.chosen).toMatchObject({ player: 2, secret: true });
  expect(after.log.some((l) => l.text === "You secretly chooses an opponent for Stalking Leonin.")).toBe(true);
  expect(after.log.some((l) => /Ben/.test(l.text) && /Stalking Leonin/.test(l.text))).toBe(false);
  expect(pageErrors(page)).toEqual([]);
});

test("Stalking Leonin: reveal Ana, the player you chose, to exile Ana's Hill Giant attacking you", async ({ page }) => {
  let s = scene({ board: ["Stalking Leonin"] }, [{ board: ["Hill Giant"] }]);
  const [leonin, giant] = [one(s, "Stalking Leonin"), one(s, "Hill Giant")];
  s.objects[leonin]!.chosen = { player: 1, secret: true };
  // Ana attacks you with Hill Giant; the page opens with you holding priority in her declare attackers step.
  s = playUntil(s, (st) => st.pending?.kind === "declareAttackers" && st.activePlayer === 1);
  s = applyAction(s, { type: "declareAttackers", player: 1, attacks: [{ attacker: giant, defender: 0 }] });
  s = playUntil(s, (st) => st.step === "declareAttackers" && st.activePlayer === 1 && !st.pending && st.stack.length === 0 && st.priority === 0);
  expect(s.objects[giant]!.attacking).toBe(0);
  await open(page, s);
  await page.locator(`[data-obj="${leonin}"]`).click();
  await menu(page).locator("button", { hasText: "Reveal the player you chose" }).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  const after = await resolveUntil(page, (st) => st.objects[giant]!.zone === "exile");
  expect(after.log.some((l) => l.text === "You reveals the player chosen for Stalking Leonin: Ana.")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Sphinx Ambassador: search Ana's library for Hill Giant, Ana names another card, put it onto the battlefield", async ({ page }) => {
  const s = scene({ board: ["Sphinx Ambassador"] }, [{ library: ["Hill Giant", "Shivan Dragon"] }]);
  const sphinx = one(s, "Sphinx Ambassador");
  const giant = idsOf(s, "Hill Giant", "library", 1)[0]!;
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0);
  await attack(page, [[sphinx, 1]]);
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const pick = modal(page);
  await expect(pick).toContainText("a card in Ana's library");
  await pick.locator(`[data-pick="${giant}"]`).click();
  if (await pick.getByRole("button", { name: "Done" }).count()) await pick.getByRole("button", { name: "Done" }).click();
  // Ana (a bot) doesn't see your pick: it names its best creature card, Shivan Dragon.
  const ask = await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  expect(ask.log.some((l) => /searches Ana's library and chooses a card, keeping it hidden/.test(l.text))).toBe(true);
  const bar = controls(page);
  await expect(bar).toContainText("Put Hill Giant onto the battlefield under your control (Ana named Shivan Dragon)");
  await bar.getByRole("button", { name: "Yes" }).click();
  const after = await resolveUntil(page, (st) => st.objects[giant]!.zone === "battlefield");
  expect(after.objects[giant]!.controller).toBe(0);
  expect(after.objects[giant]!.owner).toBe(1);
  expect(after.log.some((l) => l.text === "Ana shuffles their library.")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Sphinx Ambassador: when Ana's Sphinx hits you, you name a card without being told what it found", async ({ page }) => {
  let s = scene({ library: ["Hill Giant"] }, [{ board: ["Sphinx Ambassador"] }]);
  const sphinx = one(s, "Sphinx Ambassador");
  const giant = idsOf(s, "Hill Giant", "library", 0)[0]!;
  s = playUntil(s, (st) => st.pending?.kind === "declareAttackers" && st.activePlayer === 1);
  s = applyAction(s, { type: "declareAttackers", player: 1, attacks: [{ attacker: sphinx, defender: 0 }] });
  s = playUntil(s, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "cardName" && st.pending.player === 0);
  // Ana found a card (her bot picks your Hill Giant), and the log doesn't say which.
  const searched = s.log.findIndex((l) => /Ana searches You's library and chooses a card, keeping it hidden/.test(l.text));
  expect(searched).toBeGreaterThanOrEqual(0);
  expect(s.log.slice(searched).some((l) => /Hill Giant/.test(l.text))).toBe(false);
  await open(page, s);
  const pick = modal(page);
  await expect(pick).toContainText("Sphinx Ambassador: choose a card name: if the card Ana found in your library is a creature card without that name");
  await pick.locator("input").fill("hill giant");
  await pick.locator('[data-name="Hill Giant"]').click();
  // You named it: it stays in your library, and you shuffle.
  const after = await resolveUntil(page, (st) => st.log.some((l) => l.text === "You shuffles their library."));
  expect(after.objects[giant]!.zone).toBe("library");
  expect(after.log.some((l) => l.text === "The card Ana found stays in You's library: You named Hill Giant.")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
