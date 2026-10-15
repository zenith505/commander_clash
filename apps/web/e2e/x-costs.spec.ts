// X in an additional cost (CR 107.3a): the X picker names the cost, then the cards to pay it with are picked.
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene, state } from "./scene";
import { card, modal, resolveUntil } from "./ui";

test("Sickening Dreams: choose X, pick X cards to discard, X damage to each creature and player", async ({ page }) => {
  const s = scene({ hand: ["Sickening Dreams", "Grizzly Bears", "Hill Giant", "Llanowar Elves"], board: LANDS }, [{ board: ["Grizzly Bears"] }]);
  const [bears, giant, elves] = [idsOf(s, "Grizzly Bears", "hand", 0)[0]!, one(s, "Hill Giant"), one(s, "Llanowar Elves")];
  const theirs = idsOf(s, "Grizzly Bears", "battlefield", 1)[0]!;
  await open(page, s);
  await card(page, "Sickening Dreams", s).click();
  const x = page.locator(".x-pick");
  await expect(x).toContainText("and discard X cards: choose X (up to 3)");
  await x.getByLabel("X", { exact: true }).fill("2");
  await x.getByRole("button", { name: "X = 2" }).click();
  const pick = modal(page);
  await expect(pick).toContainText("Sickening Dreams: discard 2 cards");
  await expect(pick.locator("[data-pick]")).toHaveCount(3);
  await pick.locator(`[data-pick="${bears}"]`).click();
  await expect(pick.getByRole("button", { name: "Done" })).toBeDisabled();
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[one(s, "Sickening Dreams")]!.zone === "graveyard");
  expect([bears, giant, elves].map((id) => after.objects[id]!.zone)).toEqual(["graveyard", "graveyard", "hand"]);
  expect(after.objects[theirs]!.zone).toBe("graveyard");
  expect(after.players.map((p) => p.life)).toEqual([38, 38, 38, 38]);
  expect(pageErrors(page)).toEqual([]);
});

test("Toxic Deluge: choose X, pay X life, creatures get -X/-X", async ({ page }) => {
  const s = scene({ hand: ["Toxic Deluge"], board: LANDS }, [{ board: ["Grizzly Bears", "Hill Giant"] }]);
  const [bears, giant] = [one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Toxic Deluge", s).click();
  const x = page.locator(".x-pick");
  await expect(x).toContainText("and pay X life: choose X");
  await x.getByLabel("X", { exact: true }).fill("2");
  await x.getByRole("button", { name: "X = 2" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[one(s, "Toxic Deluge")]!.zone === "graveyard");
  expect(after.players[0]!.life).toBe(38);
  expect([bears, giant].map((id) => after.objects[id]!.zone)).toEqual(["graveyard", "battlefield"]);
  const now = await state(page);
  expect(now.log.some((e) => /casts Toxic Deluge with X=2/.test(e.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
