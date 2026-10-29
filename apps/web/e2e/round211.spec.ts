// Round 211: Marina Vendrell's "lock or unlock a door of target Room you control": the locked doors to unlock and the
// unlocked ones to lock, in one choice.
import { expect, test } from "@playwright/test";
import { applyAction, characteristics, planActivate, type GameState } from "@cc/engine";
import { one, open, pageErrors, scene } from "./scene";
import { controls, resolveUntil } from "./ui";

test("Marina Vendrell: lock the unlocked door of a Room", async ({ page }) => {
  let s: GameState = scene({ board: ["Marina Vendrell", "Bottomless Pool // Locker Room"] });
  const [marina, room] = [one(s, "Marina Vendrell"), one(s, "Bottomless Pool // Locker Room")];
  s.objects[room]!.unlocked = [0];
  const plan = planActivate(s, 0, marina, 0, [{ kind: "object", id: room }]);
  expect(plan).not.toBeNull();
  for (const a of plan!) s = applyAction(s, a);
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "unlockDoor");
  const bar = controls(page);
  await expect(bar).toContainText("choose a door to lock or unlock");
  await expect(bar.getByRole("button", { name: "Unlock Locker Room" })).toHaveCount(1);
  await bar.getByRole("button", { name: "Lock Bottomless Pool" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && !st.objects[room]!.unlocked?.length);
  expect(characteristics(after, after.objects[room]!).name).not.toBe("Bottomless Pool");
  expect(pageErrors(page)).toEqual([]);
});
