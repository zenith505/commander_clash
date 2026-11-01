// Round 233: Sunder the Gateway's "Incubate 2, then transform an Incubator token you control" (you choose which one as it
// resolves, the new one or another), and Ethereal Valkyrie's "exile a card from your hand face down. It becomes foretold."
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, modal, resolveUntil } from "./ui";

test("Sunder the Gateway: pick which Incubator token you control transforms", async ({ page }) => {
  const s = scene({ hand: ["Sunder the Gateway", "Sunder the Gateway"], board: LANDS }, [{ board: ["Sol Ring"] }]);
  const ring = one(s, "Sol Ring");
  await open(page, s);
  await card(page, "Sunder the Gateway", s, 0).click();
  const modes = page.locator(".mode-menu");
  await modes.getByRole("button", { name: /Destroy target nontoken artifact/ }).click();
  await page.locator(`[data-obj="${ring}"]`).click();
  const first = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[ring]!.zone === "graveyard" && st.battlefield.some((id) => st.objects[id]!.isToken && st.objects[id]!.controller === 0));
  const older = first.battlefield.find((id) => first.objects[id]!.isToken && first.objects[id]!.controller === 0)!;
  await card(page, "Sunder the Gateway", s, 1).click();
  await modes.getByRole("button", { name: /then transform an Incubator token you control/ }).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  // Two Incubators to choose from: the one just made and the older one.
  expect(asked.battlefield.filter((id) => asked.objects[id]!.isToken && asked.objects[id]!.controller === 0)).toHaveLength(2);
  const bar = controls(page);
  await expect(bar).toContainText("click an Incubator token you control to transform it, then choose it.");
  await page.locator(`[data-obj="${older}"]`).click();
  await bar.getByRole("button", { name: "Choose", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && !!st.objects[older]!.tokenBackUp);
  expect(after.objects[older]!.counters["+1/+1"]).toBe(2);
  expect(pageErrors(page)).toEqual([]);
});

test("Ethereal Valkyrie: draw, then pick the card from your hand to exile face down, foretold", async ({ page }) => {
  const s = scene({ hand: ["Ethereal Valkyrie", "Hill Giant"], board: LANDS });
  const giant = one(s, "Hill Giant");
  await open(page, s);
  await card(page, "Ethereal Valkyrie", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const pick = modal(page);
  await expect(pick).toContainText("to exile face down");
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "exile");
  expect(after.objects[giant]!.foretold).toBe(true);
  expect(after.objects[giant]!.mayPlay).toMatchObject({ until: "foretell", foretellReduce: 2 });
  expect(pageErrors(page)).toEqual([]);
});
