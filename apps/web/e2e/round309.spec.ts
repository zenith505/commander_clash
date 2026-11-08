// Round 309's prompts: Wall of Stolen Identity's copy choice (then the copied creature is tapped and stays tapped), and
// Deepfathom Echo's "you may have it become a copy of another creature you control", clicked as it resolves.
import { expect, test } from "@playwright/test";
import { characteristics } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Wall of Stolen Identity: enter as a copy of Ana's Hill Giant, which is tapped and doesn't untap", async ({ page }) => {
  const s = scene({ hand: ["Wall of Stolen Identity"], board: LANDS }, [{ board: ["Hill Giant", "Grizzly Bears"] }]);
  const [wall, giant] = [one(s, "Wall of Stolen Identity"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Wall of Stolen Identity", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "copy");
  const pick = page.locator(".copy-pick");
  await expect(pick).toContainText("Wall of Stolen Identity: enter as a copy of");
  await pick.getByRole("button", { name: /Hill Giant/ }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.triggerQueue.length === 0 && st.objects[giant]!.tapped);
  const c = characteristics(after, after.objects[wall]!);
  expect(c.name).toBe("Hill Giant");
  expect(c.subtypes).toEqual(expect.arrayContaining(["Giant", "Wall"]));
  expect(c.keywords).toContain("Defender");
  // Round the table to Ana's next turn: her Hill Giant stays tapped.
  const later = playUntil(after, (st) => st.activePlayer === 1 && st.step === "main1");
  expect(later.objects[giant]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Deepfathom Echo: at the beginning of combat it explores, then you click Hill Giant for it to become a copy of", async ({ page }) => {
  let s = scene({ board: [...LANDS, "Deepfathom Echo", "Hill Giant"] }, [{ board: ["Craw Wurm"] }]);
  const [echo, giant, wurm] = [one(s, "Deepfathom Echo"), one(s, "Hill Giant"), one(s, "Craw Wurm")];
  s = playUntil(s, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  // Only your other creatures: not Ana's Craw Wurm, not the Echo itself.
  expect(s.pending?.kind === "pickPermanents" && s.pending.options).toEqual([giant]);
  expect(s.pending?.kind === "pickPermanents" && s.pending.options).not.toContain(wurm);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("for Deepfathom Echo to become a copy of until end of turn");
  await page.locator(`[data-obj="${giant}"]`).first().click();
  await bar.getByRole("button", { name: "Choose", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && characteristics(st, st.objects[echo]!).name === "Hill Giant");
  expect(characteristics(after, after.objects[echo]!).power).toBe(3);
  expect(pageErrors(page)).toEqual([]);
});
