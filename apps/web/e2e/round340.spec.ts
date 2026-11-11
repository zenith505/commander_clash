// Round 340's prompt: Stumpsquall Hydra's "distribute X +1/+1 counters among it and any number of commanders" (the Hydra
// and every commander on the battlefield, anyone's; with the Hydra gone first, up to X among the commanders, none included).
import { expect, test } from "@playwright/test";
import { applyAction, invalidateCharacteristics, planCast, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playUntil, scene } from "./scene";
import { controls, resolveUntil } from "./ui";

/** You cast Stumpsquall Hydra with X = `x` in the engine; your Grizzly Bears and Ana's Llanowar Elves are commanders. */
function hydraScene(x: number, hand: string[] = []) {
  const s: GameState = scene({ hand: ["Stumpsquall Hydra", ...hand], board: [...LANDS, "Grizzly Bears"] }, [{ board: ["Llanowar Elves"] }]);
  const bears = one(s, "Grizzly Bears");
  const elves = one(s, "Llanowar Elves");
  s.objects[bears]!.isCommander = true;
  s.objects[elves]!.isCommander = true;
  invalidateCharacteristics(s);
  const hydra = idsOf(s, "Stumpsquall Hydra", "hand", 0)[0]!;
  let t = s;
  for (const a of planCast(t, 0, hydra, undefined, undefined, undefined, x)!) t = applyAction(t, a);
  return { s: t, hydra, bears, elves };
}

test("Stumpsquall Hydra: 3 counters among it, your commander and Ana's", async ({ page }) => {
  const { s: s0, hydra, bears, elves } = hydraScene(3);
  const s = playUntil(s0, (st) => st.pending?.kind === "distribute" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Stumpsquall Hydra: distribute 3 +1/+1 counters among any number of Stumpsquall Hydra and commanders (3 left)");
  const done = bar.getByRole("button", { name: "Done" });
  await expect(done).toBeDisabled();
  await page.locator(`[data-distribute="${hydra}"]`).getByRole("button", { name: "+" }).click();
  await page.locator(`[data-distribute="${bears}"]`).getByRole("button", { name: "+" }).click();
  await page.locator(`[data-distribute="${elves}"]`).getByRole("button", { name: "+" }).click();
  await expect(bar).toContainText("(0 left)");
  await done.click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[hydra]!.counters["+1/+1"]).toBe(1);
  expect(after.objects[bears]!.counters["+1/+1"]).toBe(1);
  expect(after.objects[elves]!.counters["+1/+1"]).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Stumpsquall Hydra bolted before its ability resolves: up to 2 among the commanders, one given out", async ({ page }) => {
  const { s: s0, hydra, bears, elves } = hydraScene(2, ["Lightning Bolt"]);
  // The Hydra resolves; with its trigger on the stack you bolt it.
  let s = playUntil(s0, (st) => st.objects[hydra]!.zone === "battlefield" && st.stack.length === 1 && st.stack[0]!.kind === "ability" && !st.pending);
  const bolt = idsOf(s, "Lightning Bolt", "hand", 0)[0]!;
  for (const a of planCast(s, 0, bolt, [{ kind: "object", id: hydra }])!) s = applyAction(s, a);
  s = playUntil(s, (st) => st.pending?.kind === "distribute" && st.pending.player === 0);
  expect(s.objects[hydra]!.zone).toBe("graveyard");
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Stumpsquall Hydra: distribute up to 2 +1/+1 counters among any number of commanders, if you want (2 left)");
  const done = bar.getByRole("button", { name: "Done" });
  await expect(done).toBeEnabled();
  await page.locator(`[data-distribute="${bears}"]`).getByRole("button", { name: "+" }).click();
  await expect(bar).toContainText("(1 left)");
  await done.click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[bears]!.counters["+1/+1"]).toBe(1);
  expect(after.objects[elves]!.counters["+1/+1"] ?? 0).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});
