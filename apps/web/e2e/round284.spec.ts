// Round 284 in the browser: Weaver of Lies turned face up asks for any number of target creatures with morph abilities
// and turns them face down; Dermoplasm turned face up offers the creature cards with a morph ability in your hand.
import { expect, test } from "@playwright/test";
import { applyAction, planCast, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { menu, modal, resolveUntil } from "./ui";

/** `name` from your hand cast face down for {3} in the engine and resolved, before the page opens. */
const faceDown = (s: GameState, name: string) => {
  const id = one(s, name);
  for (const a of planCast(s, 0, id, undefined, undefined, "auto", undefined, { faceDown: true })!) s = applyAction(s, a);
  return { s: playUntil(s, (st) => st.objects[id]!.zone === "battlefield" && st.stack.length === 0 && !st.pending && st.priority === 0), id };
};

test("Weaver of Lies: Turn face up, click the two creatures with morph; both are turned face down", async ({ page }) => {
  const { s, id } = faceDown(scene({ hand: ["Weaver of Lies"], board: [...LANDS, "Island", "Island", "Exalted Angel", "Grizzly Bears"] }, [{ board: ["Willbender"] }]), "Weaver of Lies");
  const [angel, bender, bears] = [one(s, "Exalted Angel"), one(s, "Willbender"), one(s, "Grizzly Bears")];
  await open(page, s);
  await page.locator(`[data-obj="${id}"]`).first().click();
  await menu(page).getByRole("button", { name: /Turn face up: morph/ }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets");
  await expect(page.locator(".targeting")).toContainText("optional");
  await page.locator(`[data-obj="${angel}"]`).click();
  // With both creatures that have morph picked, there's nothing else to target: the ability goes on the stack.
  await page.locator(`[data-obj="${bender}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && !!st.objects[bender]!.faceDown);
  expect(after.objects[angel]!.faceDown).toBe("morph");
  expect(after.objects[bender]!.faceDown).toBe("morph");
  expect(after.objects[bears]!.faceDown).toBeFalsy();
  expect(after.objects[id]!.faceDown).toBeFalsy();
  expect(pageErrors(page)).toEqual([]);
});

test("Dermoplasm: Turn face up, pick the morph creature card from your hand; Dermoplasm returns to your hand", async ({ page }) => {
  const { s, id } = faceDown(scene({ hand: ["Dermoplasm", "Exalted Angel", "Grizzly Bears"], board: [...LANDS, "Island", "Island"] }), "Dermoplasm");
  const [angel, bears] = [one(s, "Exalted Angel"), one(s, "Grizzly Bears")];
  await open(page, s);
  await page.locator(`[data-obj="${id}"]`).first().click();
  await menu(page).getByRole("button", { name: /Turn face up: morph/ }).click();
  const st = await resolveUntil(page, (x) => x.pending?.kind === "searchLibrary");
  expect(st.pending).toMatchObject({ kind: "searchLibrary", player: 0, cards: [angel], fromHand: true });
  const pick = modal(page);
  await expect(pick.locator(`[data-pick="${bears}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${angel}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending && x.objects[angel]!.zone === "battlefield");
  expect(after.objects[angel]!.faceDown).toBeFalsy();
  expect(after.objects[id]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});
