// Round 131's prompt: Zada, Hedron Grinder's copies go on the stack in the order you choose (rulings), one creature at a
// time, the creature picked first getting the copy put on the stack first (so it resolves last).
import { expect, test } from "@playwright/test";
import { applyAction, planCast } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene, state } from "./scene";
import { controls, resolveUntil } from "./ui";

test("Zada: you pick Hill Giant first, so its copy of Giant Growth goes on the stack under Grizzly Bears'", async ({ page }) => {
  let s = scene({ hand: ["Giant Growth"], board: [...LANDS, "Zada, Hedron Grinder", "Grizzly Bears", "Hill Giant"] });
  const [zada, bears, giant] = [one(s, "Zada, Hedron Grinder"), one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  for (const a of planCast(s, 0, one(s, "Giant Growth"), [{ kind: "object", id: zada }])!) s = applyAction(s, a);
  s = playUntil(s, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "copyOrder" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("choose the creature the next copy of Giant Growth targets");
  await expect(bar.getByRole("button", { name: "Grizzly Bears (You)" })).toBeVisible();
  await bar.getByRole("button", { name: "Hill Giant (You)" }).click();
  // Both copies are on the stack above Giant Growth: Hill Giant's first, Grizzly Bears' on top.
  await expect.poll(async () => (await state(page)).stack.length).toBe(3);
  const mid = await state(page);
  const target = (i: number) => (mid.stack[i]!.targets?.[0] as { id: string }).id;
  expect([target(1), target(2)]).toEqual([giant, bears]);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect([zada, bears, giant].every((id) => after.objects[id]!.zone === "battlefield")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
