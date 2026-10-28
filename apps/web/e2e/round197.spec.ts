// Round 197 in the browser: blight as a cost (CR 701.68a): click the creature you control that gets the -1/-1 counters,
// for an ability (Sting-Slinger) or a spell's "blight 1 or pay {3}" (Bogslither's Embrace); and the optional additional
// costs "you may blight 1" (Cinder Strike) and "you may behold a Dragon" (Piercing Exhale), offered like kicker.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, menu, modal, resolveUntil } from "./ui";

test("Sting-Slinger: blight 1 on your Grizzly Bears, not Ana's Hill Giant, for 2 damage to each opponent", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Sting-Slinger", "Grizzly Bears"] }, [{ board: ["Hill Giant"] }]);
  const [slinger, bears, giant] = [one(s, "Sting-Slinger"), one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  const life = s.players[1]!.life;
  await open(page, s);
  await card(page, "Sting-Slinger", s).click();
  await menu(page).locator("button", { hasText: "2 damage" }).click();
  const bar = page.locator(".targeting", { hasText: "blight 1 (put a -1/-1 counter on a creature you control)" });
  const done = bar.getByRole("button", { name: "Blight and activate" });
  await expect(done).toBeDisabled();
  await page.locator(`[data-obj="${giant}"]`).click();
  await expect(done).toBeDisabled();
  await page.locator(`[data-obj="${bears}"]`).click();
  await done.click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[1]!.life < life);
  expect(after.players[1]!.life).toBe(life - 2);
  expect(after.objects[bears]!.counters["-1/-1"]).toBe(1);
  expect(after.objects[giant]!.counters["-1/-1"] ?? 0).toBe(0);
  expect(after.objects[slinger]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Cinder Strike: choose to blight 1 as you cast it, and it deals 4 damage to Ana's Hill Giant", async ({ page }) => {
  const s = scene({ hand: ["Cinder Strike"], board: [...LANDS, "Grizzly Bears"] }, [{ board: ["Hill Giant"] }]);
  const [bears, giant] = [one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Cinder Strike", s).click();
  const offer = page.locator(".targeting", { hasText: "as an additional cost, you may blight 1" });
  await offer.getByRole("button", { name: "Blight 1" }).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  const bar = page.locator(".targeting", { hasText: "blight 1 (put a -1/-1 counter on a creature you control)" });
  await page.locator(`[data-obj="${bears}"]`).click();
  await bar.getByRole("button", { name: "Blight and cast" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "graveyard");
  expect(after.objects[giant]!.zone).toBe("graveyard");
  expect(after.objects[bears]!.counters["-1/-1"]).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Bogslither's Embrace: blight 1 instead of paying {3}, then exile Ana's Hill Giant", async ({ page }) => {
  const s = scene({ hand: ["Bogslither's Embrace"], board: [...LANDS, "Grizzly Bears"] }, [{ board: ["Hill Giant"] }]);
  const [bears, giant] = [one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Bogslither's Embrace", s).click();
  // Which way to pay is announced first (CR 601.2b), then the target (601.2c).
  await page.locator(".targeting", { hasText: "as an additional cost" }).getByRole("button", { name: "Blight 1" }).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  await page.locator(".targeting", { hasText: "blight 1 (put a -1/-1 counter" }).getByRole("button", { name: "Blight and cast" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "exile");
  expect(after.objects[giant]!.zone).toBe("exile");
  expect(after.objects[bears]!.counters["-1/-1"]).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Piercing Exhale: behold your Shivan Dragon as you cast it, then surveil 2 after the bite", async ({ page }) => {
  const s = scene({ hand: ["Piercing Exhale"], board: [...LANDS, "Shivan Dragon"] }, [{ board: ["Hill Giant"] }]);
  const [dragon, giant] = [one(s, "Shivan Dragon"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Piercing Exhale", s).click();
  await page.locator(".targeting", { hasText: "as an additional cost, you may behold a Dragon" }).getByRole("button", { name: "Behold a Dragon" }).click();
  await page.locator(`[data-obj="${dragon}"]`).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  const pick = modal(page);
  await expect(pick).toContainText("Piercing Exhale: behold a Dragon");
  await pick.locator(`[data-pick="${dragon}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.pending?.kind === "arrangeTop");
  expect(after.pending).toMatchObject({ kind: "arrangeTop", how: "surveil", player: 0 });
  expect(after.objects[giant]!.damage).toBe(5);
  expect(pageErrors(page)).toEqual([]);
});
