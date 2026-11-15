// Lane B round B220 in the browser: Cultural Exchange's two picks (any number of one player's creatures, then as many of
// the other's); Spirit-Sister's Call's end step question and its sacrifice among permanents sharing a card type; Jailbreak's
// second target, chosen once the opponent's card has entered; Fervent Mastery cast for {2}{R}{R}, its opponent chosen.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, clickPlayer, controls, menu, modal, resolveUntil } from "./ui";
import { controllerOf, type GameState } from "@cc/engine";

const ctl = (s: GameState, id: string) => controllerOf(s, s.objects[id]!);

test("Cultural Exchange: Ana's Grizzly Bears and Hill Giant exchanged for Ben's Craw Wurm and Serra Angel", async ({ page }) => {
  const s = scene({ hand: ["Cultural Exchange"], board: LANDS }, [{ board: ["Grizzly Bears", "Hill Giant"] }, { board: ["Craw Wurm", "Serra Angel", "Llanowar Elves"] }]);
  const [bears, giant, wurm, angel, elves] = [one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Craw Wurm"), one(s, "Serra Angel"), one(s, "Llanowar Elves")];
  await open(page, s);
  await card(page, "Cultural Exchange", s).click();
  await clickPlayer(page, 1);
  await clickPlayer(page, 2);
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("choose any number of creatures");
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await page.locator(`[data-obj="${giant}"]`).first().click();
  await bar.getByRole("button", { name: "Choose", exact: true }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0 && st.pending.min === undefined);
  await expect(bar).toContainText("choose 2 creatures");
  await page.locator(`[data-obj="${wurm}"]`).first().click();
  // One isn't enough: the button waits for the second.
  await expect(bar.getByRole("button", { name: "Choose", exact: true })).toBeDisabled();
  await page.locator(`[data-obj="${angel}"]`).first().click();
  await bar.getByRole("button", { name: "Choose", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && ctl(st, wurm) === 1);
  expect([bears, giant].map((id) => ctl(after, id))).toEqual([2, 2]);
  expect([wurm, angel, elves].map((id) => ctl(after, id))).toEqual([1, 1, 2]);
  expect(pageErrors(page)).toEqual([]);
});

test("Spirit-Sister's Call: at your end step, Craw Wurm comes back for a sacrificed Grizzly Bears; Sol Ring isn't offered", async ({ page }) => {
  let s = scene({ board: ["Spirit-Sister's Call", "Grizzly Bears", "Llanowar Elves", "Sol Ring"], yard: ["Craw Wurm"] });
  const [bears, elves, ring, wurm] = [one(s, "Grizzly Bears"), one(s, "Llanowar Elves"), one(s, "Sol Ring"), one(s, "Craw Wurm")];
  s = playUntil(s, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  await open(page, s);
  await modal(page).locator(`[data-pick="${wurm}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Sacrifice a permanent that shares a card type with the chosen card?");
  await bar.getByRole("button", { name: "Yes" }).click();
  const pick = await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  expect(pick.pending?.kind === "pickPermanents" && pick.pending.options.includes(ring)).toBe(false);
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await bar.getByRole("button", { name: "Sacrifice", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[wurm]!.zone === "battlefield");
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect([elves, ring].map((id) => after.objects[id]!.zone)).toEqual(["battlefield", "battlefield"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Jailbreak: Ana's Hill Giant returns under her control; then Llanowar Elves, not Craw Wurm, returns from your graveyard", async ({ page }) => {
  const s = scene({ hand: ["Jailbreak"], board: LANDS, yard: ["Llanowar Elves", "Craw Wurm"] }, [{ yard: ["Hill Giant"] }]);
  const [giant, elves, wurm] = [one(s, "Hill Giant"), one(s, "Llanowar Elves"), one(s, "Craw Wurm")];
  await open(page, s);
  await card(page, "Jailbreak", s).click();
  await modal(page).locator(`[data-pick="${giant}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  await expect(modal(page).locator(`[data-pick="${wurm}"]`)).toHaveCount(0);
  await modal(page).locator(`[data-pick="${elves}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[elves]!.zone === "battlefield");
  expect(after.objects[giant]!.zone).toBe("battlefield");
  expect(ctl(after, giant)).toBe(1);
  expect(ctl(after, elves)).toBe(0);
  expect(after.objects[wurm]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Fervent Mastery: cast for {2}{R}{R}, you choose Ana, who discards and draws; then you search for up to three cards", async ({ page }) => {
  const s = scene({ hand: ["Fervent Mastery"], board: LANDS, library: ["Hill Giant", "Craw Wurm"] }, [{ hand: ["Grizzly Bears", "Divination"] }]);
  const [giant, wurm] = [one(s, "Hill Giant"), one(s, "Craw Wurm")];
  await open(page, s);
  await card(page, "Fervent Mastery", s).click();
  await menu(page).getByRole("button", { name: "Cast it for 2 R R" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "opponent" && st.pending.player === 0);
  await controls(page).getByRole("button", { name: "Ana" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  await modal(page).locator(`[data-pick="${giant}"]`).click();
  await modal(page).locator(`[data-pick="${wurm}"]`).click();
  await modal(page).getByRole("button", { name: /^(Done|Take|Choose|Put)/ }).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "graveyard");
  expect(after.objects[wurm]!.zone).toBe("graveyard");
  // Ana answered for herself, as a bot, and has two cards in hand again.
  expect(after.players[1]!.hand.length).toBe(2);
  expect(after.log.some((l) => /Fervent Mastery/.test(typeof l === "string" ? l : JSON.stringify(l)))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
