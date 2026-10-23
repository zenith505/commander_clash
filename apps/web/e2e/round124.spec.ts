// Round 124's prompts: ward—waterbend asks the targeting player to pay, and the Pay button taps their artifacts and
// creatures for what their mana can't pay (CR 701.67a).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("The Unagi of Kyoshi Island: Lightning Bolt at it, ward—waterbend {4} paid by tapping four creatures", async ({ page }) => {
  const s = scene({ hand: ["Lightning Bolt"], board: ["Mountain", "Grizzly Bears", "Grizzly Bears", "Grizzly Bears", "Grizzly Bears"] }, [{ board: ["The Unagi of Kyoshi Island"] }]);
  const unagi = one(s, "The Unagi of Kyoshi Island");
  await open(page, s);
  await card(page, "Lightning Bolt", s).click();
  await card(page, "The Unagi of Kyoshi Island", s, 0, 1).click();
  await resolveUntil(page, (st) => st.pending?.kind === "payUnless");
  const bar = controls(page);
  await expect(bar).toContainText("waterbend: your artifacts and creatures can each pay {1} of up to 4");
  await bar.getByRole("button", { name: "Pay, tapping 4 artifacts or creatures", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[unagi]!.damage).toBe(3);
  expect(after.battlefield.filter((id) => after.cards[after.objects[id]!.cardId]!.name === "Grizzly Bears").every((id) => after.objects[id]!.tapped)).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Katara, Seeking Revenge: \"Pay waterbend\" taps two creatures for {2} of it, and she doesn't discard", async ({ page }) => {
  const s = scene({ hand: ["Katara, Seeking Revenge"], board: ["Island", "Island", "Island", "Swamp", "Grizzly Bears", "Grizzly Bears"], library: ["Hill Giant"] });
  const katara = one(s, "Katara, Seeking Revenge");
  await open(page, s);
  await card(page, "Katara, Seeking Revenge", s).click();
  const bar = page.locator(".targeting");
  await expect(bar).toContainText("pay waterbend");
  await bar.getByRole("button", { name: "Pay waterbend", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[katara]!.zone === "battlefield");
  expect(after.battlefield.filter((id) => after.cards[after.objects[id]!.cardId]!.name === "Grizzly Bears").every((id) => after.objects[id]!.tapped)).toBe(true);
  expect(after.players[0]!.hand.map((id) => after.cards[after.objects[id]!.cardId]!.name)).toEqual(["Hill Giant"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Benevolent River Spirit: cast with two Islands, its waterbend {5} paid by tapping five creatures", async ({ page }) => {
  const s = scene({ hand: ["Benevolent River Spirit"], board: ["Island", "Island", "Grizzly Bears", "Grizzly Bears", "Grizzly Bears", "Grizzly Bears", "Grizzly Bears"] });
  const spirit = one(s, "Benevolent River Spirit");
  await open(page, s);
  await card(page, "Benevolent River Spirit", s).click();
  const after = await resolveUntil(page, (st) => st.objects[spirit]!.zone === "battlefield" && st.stack.length === 0);
  expect(after.battlefield.filter((id) => after.cards[after.objects[id]!.cardId]!.name === "Grizzly Bears").every((id) => after.objects[id]!.tapped)).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Deadpool, Trading Card: as it enters, exchange its text box with Ana's Serra Angel", async ({ page }) => {
  const s = scene({ hand: ["Deadpool, Trading Card"], board: LANDS }, [{ board: ["Serra Angel"] }]);
  const [deadpool, angel] = [one(s, "Deadpool, Trading Card"), one(s, "Serra Angel")];
  await open(page, s);
  await card(page, "Deadpool, Trading Card", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "exchangeText");
  const bar = controls(page);
  await expect(bar).toContainText("you may exchange its text box with another creature's");
  await expect(bar.getByRole("button", { name: "Don't exchange", exact: true })).toBeVisible();
  await bar.getByRole("button", { name: "Serra Angel (Ana)", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[deadpool]!.zone === "battlefield");
  expect(after.objects[deadpool]!.textFrom).toBeTruthy();
  expect(after.objects[angel]!.textFrom).toBeTruthy();
  expect(pageErrors(page)).toEqual([]);
});

test("Xantcha, Sleeper Agent: its caster chooses the opponent it enters under the control of", async ({ page }) => {
  const s = scene({ hand: ["Xantcha, Sleeper Agent"], board: LANDS });
  const xantcha = one(s, "Xantcha, Sleeper Agent");
  const ana = s.players.find((p) => p.name === "Ana")!.id;
  await open(page, s);
  await card(page, "Xantcha, Sleeper Agent", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "controlOpponent");
  const bar = controls(page);
  await expect(bar).toContainText("choose an opponent to control it");
  await bar.getByRole("button", { name: "Ana", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[xantcha]!.zone === "battlefield");
  expect(after.objects[xantcha]!.controller).toBe(ana);
  expect(pageErrors(page)).toEqual([]);
});
