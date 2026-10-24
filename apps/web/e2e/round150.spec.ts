// Round 150's prompt: Necrodominance's "you may pay any amount of life. If you do, draw that many cards" (− / + and
// "Pay N life").
import { expect, test } from "@playwright/test";
import { open, pageErrors, scene } from "./scene";
import { controls, resolveUntil } from "./ui";

test("Necrodominance: at your end step, pay 2 life with + and draw two cards", async ({ page }) => {
  const s = scene({ board: ["Necrodominance"] }, [], { step: "main2" });
  const hand = s.players[0]!.hand.length;
  const life = s.players[0]!.life;
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "payLife");
  const bar = controls(page);
  await expect(bar).toContainText("Necrodominance:");
  await expect(bar.getByRole("button", { name: "Number minus one" })).toBeDisabled(); // 0 is the least
  const plus = bar.getByRole("button", { name: "Number plus one" });
  await plus.click();
  await plus.click();
  await bar.getByRole("button", { name: "Pay 2 life" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[0]!.life < life);
  expect(after.players[0]!.life).toBe(life - 2);
  expect(after.players[0]!.hand.length).toBe(hand + 2);
  expect(pageErrors(page)).toEqual([]);
});
