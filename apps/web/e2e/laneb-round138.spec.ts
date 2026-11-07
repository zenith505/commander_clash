// Lane B round B138 in the browser: Invoke the Ancients' counter for each Spirit, Kindle the Carnage's "you may repeat
// this process", and Expel the Unworthy's kicker letting it target any creature (CR 702.33g).
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Invoke the Ancients: a reach counter for the first Spirit, a trample counter for the second", async ({ page }) => {
  const s = scene({ hand: ["Invoke the Ancients"], board: [...LANDS, "Forest", "Forest"] });
  await open(page, s);
  await card(page, "Invoke the Ancients", s).click();
  const first = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "either");
  const bar = controls(page);
  await expect(bar).toContainText("Invoke the Ancients: choose one for Spirit Token (1 of 2)");
  const a = first.pending?.kind === "chooseOption" ? first.pending.about! : "";
  await bar.getByRole("button", { name: "Put a reach counter" }).click();
  const second = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "either" && st.pending.about !== a);
  await expect(bar).toContainText("(2 of 2)");
  const b = second.pending?.kind === "chooseOption" ? second.pending.about! : "";
  await bar.getByRole("button", { name: "Put a trample counter" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[a]!.counters).toEqual({ reach: 1 });
  expect(after.objects[b]!.counters).toEqual({ trample: 1 });
  expect(pageErrors(page)).toEqual([]);
});

test("Kindle the Carnage: Yes discards again; Ana's Grizzly Bears takes 1 damage each time and dies once it's done", async ({ page }) => {
  const s = scene({ hand: ["Kindle the Carnage", "Shock", "Shock"], board: LANDS }, [{ board: ["Grizzly Bears"] }]);
  const bears = one(s, "Grizzly Bears");
  const shocks = idsOf(s, "Shock", "hand", 0);
  await open(page, s);
  await card(page, "Kindle the Carnage", s).click();
  const mid = await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0 && !!st.pending.repeat);
  expect(mid.objects[bears]!.damage).toBe(1);
  const bar = controls(page);
  await expect(bar).toContainText("Kindle the Carnage:");
  await bar.getByRole("button", { name: "Yes", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[one(s, "Kindle the Carnage")]!.zone === "graveyard");
  expect(shocks.map((id) => after.objects[id]!.zone)).toEqual(["graveyard", "graveyard"]);
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Expel the Unworthy: kicked, it exiles Ana's Hill Giant (mana value 4) and Ana gains 4 life", async ({ page }) => {
  const s = scene({ hand: ["Expel the Unworthy"], board: LANDS }, [{ board: ["Hill Giant"] }]);
  const giant = one(s, "Hill Giant");
  await open(page, s);
  await card(page, "Expel the Unworthy", s).click();
  await page.getByRole("button", { name: "Kick it" }).click();
  const panel = page.locator(".targeting", { hasText: "Expel the Unworthy" });
  await expect(panel).toBeVisible();
  await page.locator(`[data-obj="${giant}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[one(s, "Expel the Unworthy")]!.zone === "graveyard");
  expect(after.objects[giant]!.zone).toBe("exile");
  expect(after.players[1]!.life).toBe(44);
  expect(pageErrors(page)).toEqual([]);
});

test("Expel the Unworthy: not kicked, Ana's Hill Giant can't be chosen", async ({ page }) => {
  const s = scene({ hand: ["Expel the Unworthy"], board: LANDS }, [{ board: ["Hill Giant", "Grizzly Bears"] }]);
  const [giant, bears] = [one(s, "Hill Giant"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Expel the Unworthy", s).click();
  await page.getByRole("button", { name: "Don't kick" }).click();
  const panel = page.locator(".targeting", { hasText: "Expel the Unworthy" });
  await expect(panel).toBeVisible();
  await page.locator(`[data-obj="${giant}"]`).first().click(); // mana value 4: nothing happens
  await expect(panel).toBeVisible();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[one(s, "Expel the Unworthy")]!.zone === "graveyard");
  expect(after.objects[bears]!.zone).toBe("exile");
  expect(after.objects[giant]!.zone).toBe("battlefield");
  expect(after.players[1]!.life).toBe(42);
  expect(pageErrors(page)).toEqual([]);
});
