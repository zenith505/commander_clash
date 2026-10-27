// Lane B round 12's prompts: a kicker cost that isn't mana (Vicious Offering's "Kicker—Sacrifice a creature"), and
// turning a face-down creature face up for a morph cost that isn't mana (reveal a card, return a permanent).
import { expect, test } from "@playwright/test";
import { applyAction, planCast, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, menu, modal, resolveUntil } from "./ui";

/** `name` from your hand cast face down for {3} in the engine and resolved, before the page opens. */
const faceDown = (s: GameState, name: string) => {
  const id = one(s, name);
  for (const a of planCast(s, 0, id, undefined, undefined, "auto", undefined, { faceDown: true })!) s = applyAction(s, a);
  return { s: playUntil(s, (st) => st.objects[id]!.zone === "battlefield" && st.stack.length === 0 && !st.pending && st.priority === 0), id };
};

test("Vicious Offering: Kick it, target Ana's Hill Giant, then click a creature of yours to sacrifice", async ({ page }) => {
  const s = scene({ hand: ["Vicious Offering"], board: [...LANDS, "Grizzly Bears"] }, [{ board: ["Hill Giant"] }]);
  const [bears, giant] = [one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Vicious Offering", s).click();
  await expect(page.locator(".targeting")).toContainText("pay kicker (sacrifice a creature)?");
  await page.getByRole("button", { name: "Kick it" }).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  const bar = page.locator(".targeting", { hasText: "sacrifice a creature (click it)" });
  await expect(bar.getByRole("button", { name: "Sacrifice and cast" })).toBeDisabled();
  await page.locator(`[data-obj="${bears}"]`).click();
  await bar.getByRole("button", { name: "Sacrifice and cast" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "graveyard");
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Watcher of the Roost: Turn face up, then reveal a white card from your hand; you gain 2 life", async ({ page }) => {
  const { s, id } = faceDown(scene({ hand: ["Watcher of the Roost", "Savannah Lions", "Grizzly Bears"], board: LANDS }), "Watcher of the Roost");
  const lions = one(s, "Savannah Lions");
  await open(page, s);
  await page.locator(`[data-obj="${id}"]`).first().click();
  await menu(page).getByRole("button", { name: /Turn face up: morph reveal a white card in your hand/ }).click();
  const pick = modal(page);
  await expect(pick).toContainText("Turn face up (morph reveal a white card in your hand): reveal a white card");
  // Only the white card is offered.
  await expect(pick.locator(`[data-pick="${one(s, "Grizzly Bears")}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${lions}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => !st.objects[id]!.faceDown && st.stack.length === 0 && !st.pending);
  expect(after.objects[lions]!.zone).toBe("hand");
  expect(after.players[0]!.life).toBe(s.players[0]!.life + 2);
  expect(pageErrors(page)).toEqual([]);
});

test("Raven Guild Initiate: Turn face up, then click a Bird you control to return it to your hand", async ({ page }) => {
  const { s, id } = faceDown(scene({ hand: ["Raven Guild Initiate"], board: [...LANDS, "Birds of Paradise"] }), "Raven Guild Initiate");
  const birds = one(s, "Birds of Paradise");
  await open(page, s);
  await page.locator(`[data-obj="${id}"]`).first().click();
  await menu(page).getByRole("button", { name: /Turn face up: morph return a Bird/ }).click();
  const bar = page.locator(".targeting", { hasText: "return a Bird you control to hand (click it)" });
  await expect(bar.getByRole("button", { name: "Return and turn face up" })).toBeDisabled();
  await page.locator(`[data-obj="${birds}"]`).click();
  await bar.getByRole("button", { name: "Return and turn face up" }).click();
  const after = await resolveUntil(page, (st) => !st.objects[id]!.faceDown);
  expect(after.objects[birds]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});
