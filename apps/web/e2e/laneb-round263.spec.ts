// Lane B round B263 in the browser: Guardian Angel cast with X on your Hill Giant, then its "Pay {1}" button for one more
// shield; Blood of the Martyr's question when your Shock would deal damage to your Grizzly Bears; Torrent of Lava's ability
// on your Hill Giant while Ana's Torrent is on the stack.
import { expect, test } from "@playwright/test";
import { applyAction, planCast, waitingOn, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene, state } from "./scene";
import { card, controls, menu, resolveUntil } from "./ui";

test("Guardian Angel: X = 1 on your Hill Giant, then click Pay {1} twice: the next 3 damage to it is prevented", async ({ page }) => {
  const s = scene({ hand: ["Guardian Angel"], board: [...LANDS, "Hill Giant"] });
  const [angel, giant] = [one(s, "Guardian Angel"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Guardian Angel", s).click();
  const x = page.locator(".x-pick");
  await expect(x).toBeVisible();
  await x.getByLabel("X", { exact: true }).fill("1");
  await x.getByRole("button", { name: "X = 1" }).click();
  await expect(page.locator(".targeting", { hasText: "Guardian Angel" })).toBeVisible();
  await page.locator(`[data-obj="${giant}"]`).first().click();
  const cast = await resolveUntil(page, (st) => st.objects[angel]!.zone === "graveyard" && st.stack.length === 0);
  expect(cast.objects[giant]!.preventNext).toBe(1);
  const pay = controls(page).getByRole("button", { name: "Pay {1}: prevent 1 more to Hill Giant" });
  await expect(pay).toBeEnabled();
  await pay.click();
  let mid: GameState = cast;
  await expect.poll(async () => (mid = await state(page)).objects[giant]!.preventNext).toBe(2);
  expect(mid.stack.length).toBe(0);
  await pay.click();
  await expect.poll(async () => (await state(page)).objects[giant]!.preventNext).toBe(3);
  expect(pageErrors(page)).toEqual([]);
});

test("Blood of the Martyr: your Shock would deal 2 damage to your Grizzly Bears; click to have it dealt to you instead", async ({ page }) => {
  let s: GameState = scene({ hand: ["Blood of the Martyr", "Shock"], board: [...LANDS, "Grizzly Bears"] });
  const [blood, shock, bears] = [one(s, "Blood of the Martyr"), one(s, "Shock"), one(s, "Grizzly Bears")];
  for (const a of planCast(s, 0, blood)!) s = applyAction(s, a);
  s = playUntil(s, (st) => st.objects[blood]!.zone === "graveyard" && st.stack.length === 0 && waitingOn(st) === 0);
  for (const a of planCast(s, 0, shock, [{ kind: "object", id: bears }])!) s = applyAction(s, a);
  s = playUntil(s, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "damageShield" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Blood of the Martyr: Shock would deal 2 damage to Grizzly Bears. Have that damage dealt to you instead?");
  await expect(bar.getByRole("button", { name: "Don't redirect it" })).toBeVisible();
  await bar.getByRole("button", { name: /^Deal it to .* instead$/ }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.objects[shock]!.zone === "graveyard");
  expect(after.objects[bears]!.zone).toBe("battlefield");
  expect(after.objects[bears]!.damage).toBe(0);
  expect(after.players[0]!.life).toBe(38);
  expect(pageErrors(page)).toEqual([]);
});

test("Torrent of Lava: Ana casts it with X = 3; click your Hill Giant's new ability; it survives and her Grizzly Bears die", async ({ page }) => {
  let s: GameState = scene({ board: [...LANDS, "Hill Giant"] }, [{ hand: ["Torrent of Lava"], board: ["Mountain", "Mountain", "Mountain", "Mountain", "Mountain", "Grizzly Bears"] }]);
  const [giant, torrent, bears] = [one(s, "Hill Giant"), one(s, "Torrent of Lava"), one(s, "Grizzly Bears")];
  s = playUntil(s, (st) => st.activePlayer === 1 && st.step === "main1" && !st.pending && waitingOn(st) === 1 && st.stack.length === 0);
  for (const a of planCast(s, 1, torrent, undefined, undefined, undefined, 3)!) s = applyAction(s, a);
  s = playUntil(s, (st) => st.stack.length === 1 && !st.pending && waitingOn(st) === 0);
  await open(page, s);
  await card(page, "Hill Giant", s).click();
  await menu(page).locator("button", { hasText: "Prevent the next 1 damage that would be dealt to Hill Giant by Torrent of Lava this turn." }).click();
  let mid: GameState = s;
  await expect.poll(async () => (mid = await state(page)).objects[giant]!.tapped).toBe(true);
  expect(mid.stack.some((x) => x.kind === "spell" && x.objectId === torrent)).toBe(true);
  const after = await resolveUntil(page, (st) => st.objects[torrent]!.zone === "graveyard");
  expect(after.objects[giant]!.zone).toBe("battlefield");
  expect(after.objects[giant]!.damage).toBe(2);
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});
