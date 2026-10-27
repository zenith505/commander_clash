// Round 188's prompts: "choose odd or even" (Extinction Event) and Lotus Vale's two untapped lands to sacrifice.
import { expect, test } from "@playwright/test";
import { applyAction, planCast, waitingOn, type Action, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { controls, resolveUntil } from "./ui";

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => applyAction(x, a), s);
};
/** Everyone passes until there's a prompt (or nothing left to resolve). */
const passToPrompt = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = applyAction(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

test("Extinction Event: choose odd or even, and each creature with mana value of that quality is exiled", async ({ page }) => {
  const s0 = scene({ hand: ["Extinction Event"], board: [...LANDS, "Grizzly Bears", "Llanowar Elves"] }, [{ board: ["Hill Giant", "Savannah Lions"] }]);
  const [bears, elves, giant, lions] = ["Grizzly Bears", "Llanowar Elves", "Hill Giant", "Savannah Lions"].map((n) => one(s0, n)) as [string, string, string, string];
  const s = passToPrompt(run(s0, planCast(s0, 0, one(s0, "Extinction Event"))));
  expect(s.pending).toMatchObject({ kind: "chooseOption", player: 0, what: "parity" });
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Extinction Event: choose odd or even (zero is even)");
  await expect(bar.getByRole("button")).toHaveText(["Odd", "Even"]);
  await bar.getByRole("button", { name: "Even" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[bears]!.zone === "exile");
  expect([bears, elves, giant, lions].map((id) => after.objects[id]!.zone)).toEqual(["exile", "battlefield", "exile", "battlefield"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Lotus Vale: play it, click two untapped lands to sacrifice, and it enters", async ({ page }) => {
  const s = scene({ hand: ["Lotus Vale"], board: ["Swamp", "Mountain", "Island"] });
  const vale = one(s, "Lotus Vale");
  const [first, second, island] = ["Swamp", "Mountain", "Island"].map((n) => idsOf(s, n, "battlefield", 0)[0]!) as [string, string, string];
  await open(page, s);
  await page.locator(`[data-obj="${vale}"]`).first().click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.action === "sacrifice");
  expect(asked.pending).toMatchObject({ kind: "pickPermanents", count: 2 });
  const bar = controls(page);
  await expect(bar).toContainText("Lotus Vale: sacrifice 2 untapped lands for it to enter");
  const done = bar.getByRole("button", { name: "Sacrifice", exact: true });
  await page.locator(`[data-obj="${first}"]`).first().click();
  await expect(done).toBeDisabled();
  await page.locator(`[data-obj="${island}"]`).first().click();
  await expect(done).toBeEnabled();
  await done.click();
  const after = await resolveUntil(page, (st) => !st.pending && st.objects[vale]!.zone === "battlefield");
  expect([first, second, island].map((id) => after.objects[id]!.zone)).toEqual(["graveyard", "battlefield", "graveyard"]);
  expect(pageErrors(page)).toEqual([]);
});
