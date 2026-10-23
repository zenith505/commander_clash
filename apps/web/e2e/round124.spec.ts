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

test("Abdel Adrian: choose any number of your other nonland permanents to exile, or none", async ({ page }) => {
  const s = scene({ hand: ["Abdel Adrian, Gorion's Ward"], board: [...LANDS, "Grizzly Bears", "Elvish Visionary"] });
  const [bears, visionary] = [one(s, "Grizzly Bears"), one(s, "Elvish Visionary")];
  await open(page, s);
  await card(page, "Abdel Adrian, Gorion's Ward", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.action === "choose");
  const bar = controls(page);
  await expect(bar).toContainText("any number of other nonland permanents");
  await expect(bar.getByRole("button", { name: "Choose none", exact: true })).toBeVisible();
  await page.locator(`[data-obj="${visionary}"]`).click();
  await bar.getByRole("button", { name: "Choose", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.triggerQueue.length === 0 && st.objects[visionary]!.zone === "exile");
  expect(after.objects[bears]!.zone).toBe("battlefield");
  expect(after.battlefield.filter((id) => after.objects[id]!.isToken)).toHaveLength(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Elspeth Conquers Death III: the returned card gets the kind of counter you choose", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Elspeth Conquers Death"], yard: ["Grizzly Bears"] });
  const [saga, bears] = [one(s, "Elspeth Conquers Death"), one(s, "Grizzly Bears")];
  s.objects[saga]!.counters = { lore: 2 };
  // Its third lore counter comes as the precombat main phase begins (CR 714.3b).
  s.step = "draw";
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets");
  await page.locator(`[data-pick="${bears}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "counterKind");
  const bar = controls(page);
  await expect(bar).toContainText("choose the kind of counter to put on Grizzly Bears");
  await bar.getByRole("button", { name: "A +1/+1 counter", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "battlefield");
  expect(after.objects[bears]!.counters["+1/+1"]).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});
