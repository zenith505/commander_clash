// Lane B round B130 in the browser: Nimble Hobbit's "you may sacrifice a Food or pay {2}{W}. When you do, tap target
// creature an opponent controls" as it attacks (the choice of payment, the Food sacrificed, then the target).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { attack, controls, resolveUntil } from "./ui";

test("Nimble Hobbit: sacrifice a Food as it attacks, then tap Ana's creature", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Nimble Hobbit", "Golden Egg"] }, [{ board: ["Grizzly Bears"] }]);
  const [hobbit, egg, bears] = [one(s, "Nimble Hobbit"), one(s, "Golden Egg"), one(s, "Grizzly Bears")];
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0);
  await attack(page, [[hobbit, 1]]);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "punisher" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("tap target creature an opponent controls");
  await expect(bar.getByRole("button", { name: "Pay {2}{W}" })).toHaveCount(1);
  await expect(bar.getByRole("button", { name: "Don't" })).toHaveCount(1);
  await bar.getByRole("button", { name: "Sacrifice a Food" }).click();
  // The reflexive trigger targets as it's put on the stack (CR 603.12): Ana's Bears.
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  await page.locator(`[data-obj="${bears}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.tapped);
  expect(after.objects[egg]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});
