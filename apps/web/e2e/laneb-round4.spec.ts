// Lane B round 4's prompts: Recover's "pay or exile" from the graveyard (Resize), Reinforce X from your hand (Wren's Run
// Hydra: choose X, then the target) and a Mana Battery's buttons for how many charge counters to remove.
import { expect, test } from "@playwright/test";
import { applyAction, planCast, waitingOn, type Action, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { card, controls, menu, resolveUntil } from "./ui";

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => applyAction(x, a), s);
};
/** Everyone passes until there's a prompt (or nothing left to resolve). */
const passToPrompt = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = applyAction(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

test("Recover: your creature dies; pay {1}{G} and Resize returns from your graveyard to your hand", async ({ page }) => {
  const s0 = scene({ board: [...LANDS, "Grizzly Bears"], hand: ["Murder"], yard: ["Resize"] });
  const [bears, resize] = [one(s0, "Grizzly Bears"), one(s0, "Resize")];
  const s = passToPrompt(run(s0, planCast(s0, 0, one(s0, "Murder"), [{ kind: "object", id: bears }])));
  expect(s.pending).toMatchObject({ kind: "chooseMay", player: 0, pay: { mana: "{1}{G}" } });
  await open(page, s);
  await expect(controls(page)).toContainText("Resize:");
  await controls(page).getByRole("button", { name: "Pay", exact: true }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && x.objects[resize]!.zone === "hand");
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Recover: don't pay, and Resize is exiled", async ({ page }) => {
  const s0 = scene({ board: [...LANDS, "Grizzly Bears"], hand: ["Murder"], yard: ["Resize"] });
  const [bears, resize] = [one(s0, "Grizzly Bears"), one(s0, "Resize")];
  const s = passToPrompt(run(s0, planCast(s0, 0, one(s0, "Murder"), [{ kind: "object", id: bears }])));
  await open(page, s);
  await controls(page).getByRole("button", { name: "Don't pay" }).click();
  await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && x.objects[resize]!.zone === "exile");
  expect(pageErrors(page)).toEqual([]);
});

test("Wren's Run Hydra: reinforce X from your hand, X = 3, at your creature", async ({ page }) => {
  const s = scene({ hand: ["Wren's Run Hydra"], board: [...LANDS, "Grizzly Bears"] });
  const [hydra, bears] = [one(s, "Wren's Run Hydra"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Wren's Run Hydra", s).click();
  await menu(page).locator("button", { hasText: "Reinforce" }).click();
  const x = page.locator(".x-pick");
  await x.getByLabel("X", { exact: true }).fill("3");
  await x.getByRole("button", { name: "X = 3" }).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.counters["+1/+1"] === 3);
  expect(after.objects[hydra]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Green Mana Battery: tap it and remove two charge counters for {G}{G}{G}", async ({ page }) => {
  const s = scene({ board: ["Green Mana Battery"] });
  const battery = one(s, "Green Mana Battery");
  s.objects[battery]!.counters.charge = 2;
  await open(page, s);
  await card(page, "Green Mana Battery", s).click();
  await expect(menu(page).locator("button", { hasText: "Remove no charge counters from it" })).toHaveCount(1);
  await expect(menu(page).locator("button", { hasText: "Remove a charge counter from it" })).toHaveCount(1);
  await menu(page).locator("button", { hasText: "Remove 2 charge counters from it" }).click();
  let after: GameState | undefined;
  await expect.poll(async () => (after = await state(page)).players[0]!.manaPool.G).toBe(3);
  expect(after!.objects[battery]!.counters.charge ?? 0).toBe(0);
  expect(after!.objects[battery]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
