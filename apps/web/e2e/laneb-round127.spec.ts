// Lane B round B127 in the browser: Anthropede's "you may discard a card or pay {2}. When you do, destroy target Room"
// (the choice of payment, then the Room destroyed); Last Rites' "discard any number of cards", then a nonland card from
// the target player's revealed hand for each one; Psychic Theft's pick from the revealed hand, exiled for you to cast.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, controls, modal, resolveUntil } from "./ui";

test("Anthropede: pay {2} as it enters, and the opponent's Room is destroyed", async ({ page }) => {
  const s = scene({ hand: ["Anthropede", "Grizzly Bears"], board: LANDS }, [{ board: ["Bottomless Pool // Locker Room"] }]);
  const room = one(s, "Bottomless Pool // Locker Room");
  const bears = one(s, "Grizzly Bears");
  await open(page, s);
  await card(page, "Anthropede", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "punisher" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Discard a card or pay {2}? If you do, destroy target Room.");
  await expect(bar.getByRole("button", { name: "Discard a card" })).toHaveCount(1);
  await expect(bar.getByRole("button", { name: "Don't" })).toHaveCount(1);
  await bar.getByRole("button", { name: "Pay {2}" }).click();
  // Then the payment itself, with the usual "pay or don't pay" prompt (the lands tap for it).
  await resolveUntil(page, (st) => st.pending?.kind !== "chooseOption" && !!st.pending && st.pending.player === 0);
  await expect(bar).toContainText("pay");
  await bar.getByRole("button", { name: "Pay", exact: true }).click();
  // The reflexive trigger: "When you do, destroy target Room" targets the Room now (CR 603.12).
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  await page.locator(`[data-obj="${room}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[room]!.zone === "graveyard");
  expect(after.objects[bears]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});

test("Last Rites: discard two cards, then pick two nonland cards from Ana's revealed hand", async ({ page }) => {
  const s = scene({ hand: ["Last Rites", "Grizzly Bears", "Hill Giant"], board: LANDS }, [{ hand: ["Lightning Bolt", "Shock", "Llanowar Elves", "Forest"] }]);
  const [bears, giant, bolt, shock, elves] = ["Grizzly Bears", "Hill Giant", "Lightning Bolt", "Shock", "Llanowar Elves"].map((n) => one(s, n)) as [string, string, string, string, string];
  await open(page, s);
  await card(page, "Last Rites", s).click();
  await clickPlayer(page, 1);
  await resolveUntil(page, (st) => st.pending?.kind === "discard" && st.pending.player === 0);
  const bar = controls(page);
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await page.locator(`[data-obj="${giant}"]`).first().click();
  await bar.getByRole("button", { name: "Discard" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const pick = modal(page);
  await expect(pick.locator(`[data-pick="${bolt}"]`)).toHaveCount(1);
  for (const id of [bolt, elves]) await pick.locator(`[data-pick="${id}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bolt]!.zone === "graveyard");
  expect([bears, giant, bolt, elves, shock].map((id) => after.objects[id]!.zone)).toEqual(["graveyard", "graveyard", "graveyard", "graveyard", "hand"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Psychic Theft: pick Ana's instant from her revealed hand; it's exiled for you to cast", async ({ page }) => {
  const s = scene({ hand: ["Psychic Theft"], board: LANDS }, [{ hand: ["Lightning Bolt", "Grizzly Bears"] }]);
  const [bolt, bears] = ["Lightning Bolt", "Grizzly Bears"].map((n) => one(s, n)) as [string, string];
  await open(page, s);
  await card(page, "Psychic Theft", s).click();
  await clickPlayer(page, 1);
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const pick = modal(page);
  await pick.locator(`[data-pick="${bolt}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bolt]!.zone === "exile");
  expect(after.objects[bolt]!.mayPlay?.player).toBe(0);
  expect(after.objects[bears]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});
