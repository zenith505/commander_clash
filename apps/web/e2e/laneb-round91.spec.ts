// Lane B round 91's choices in the browser: any land type chosen as an Aura enters (Traveler's Cloak, nonbasic types
// offered too), and which of two targets a spell's choice falls on as it resolves (Cannibalize).
import { expect, test } from "@playwright/test";
import { characteristics } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Traveler's Cloak: on our Grizzly Bears, pick Gate from every land type; the Bears have gatewalk", async ({ page }) => {
  const s = scene({ hand: ["Traveler's Cloak"], board: [...LANDS, "Grizzly Bears"] });
  const bears = one(s, "Grizzly Bears");
  await open(page, s);
  await card(page, "Traveler's Cloak", s).click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "landType" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("choose a land type");
  await expect(bar.getByRole("button", { name: "Desert" })).toBeVisible();
  await bar.getByRole("button", { name: "Gate" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.battlefield.some((id) => st.objects[id]!.attachedTo === bears));
  expect(characteristics(after, after.objects[bears]!).keywords).toContain("Gatewalk");
  expect(pageErrors(page)).toEqual([]);
});

test("Cannibalize: at Ana's Grizzly Bears and Hill Giant, exile the Giant; the Bears get two +1/+1 counters", async ({ page }) => {
  const s = scene({ hand: ["Cannibalize"], board: LANDS }, [{ board: ["Grizzly Bears", "Hill Giant"] }]);
  const [bears, giant] = [one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Cannibalize", s).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "splitTargets" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("choose one of the two creatures");
  await expect(bar.getByRole("button")).toHaveText(["Exile Grizzly Bears; put two +1/+1 counters on Hill Giant", "Exile Hill Giant; put two +1/+1 counters on Grizzly Bears"]);
  await bar.getByRole("button", { name: "Exile Hill Giant; put two +1/+1 counters on Grizzly Bears" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "exile");
  expect(after.objects[bears]!.counters["+1/+1"]).toBe(2);
  expect(pageErrors(page)).toEqual([]);
});
