// Lane B round B166 in the browser: Bribe Taker asks, for each kind of counter on permanents you control, whether to put
// a +1/+1 counter, a counter of that kind, or no counter on it.
import { expect, test } from "@playwright/test";
import { invalidateCharacteristics } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Bribe Taker: a +1/+1 counter for the +1/+1 kind, a shield counter for the shield kind", async ({ page }) => {
  const s = scene({ hand: ["Bribe Taker"], board: ["Hill Giant", ...LANDS] });
  const [taker, giant] = [one(s, "Bribe Taker"), one(s, "Hill Giant")];
  s.objects[giant]!.counters = { "+1/+1": 2, shield: 1 };
  invalidateCharacteristics(s);
  await open(page, s);
  await card(page, "Bribe Taker", s).click();
  let st = await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "bribeCounter");
  expect(st.pending?.kind === "chooseOption" && st.pending.counterKind).toBe("+1/+1");
  const bar = controls(page);
  await expect(bar).toContainText("Bribe Taker");
  await expect(bar.getByRole("button", { name: "No counter", exact: true })).toBeVisible();
  await bar.getByRole("button", { name: "Put a +1/+1 counter on it", exact: true }).click();
  st = await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "bribeCounter" && x.pending.counterKind === "shield");
  expect(st.pending?.kind === "chooseOption" && st.pending.labels).toEqual(["Put a +1/+1 counter on it", "Put a shield counter on it", "No counter"]);
  await bar.getByRole("button", { name: "Put a shield counter on it", exact: true }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && x.objects[taker]!.zone === "battlefield" && Object.keys(x.objects[taker]!.counters).length > 0);
  expect(after.objects[taker]!.counters).toEqual({ "+1/+1": 1, shield: 1 });
  expect(pageErrors(page)).toEqual([]);
});

test("Bribe Taker: No counter leaves it without one", async ({ page }) => {
  const s = scene({ hand: ["Bribe Taker"], board: ["Hill Giant", ...LANDS] });
  const [taker, giant] = [one(s, "Bribe Taker"), one(s, "Hill Giant")];
  s.objects[giant]!.counters = { charge: 3 };
  invalidateCharacteristics(s);
  await open(page, s);
  await card(page, "Bribe Taker", s).click();
  await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "bribeCounter" && x.pending.counterKind === "charge");
  await controls(page).getByRole("button", { name: "No counter", exact: true }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && x.objects[taker]!.zone === "battlefield");
  expect(after.objects[taker]!.counters).toEqual({});
  expect(pageErrors(page)).toEqual([]);
});
