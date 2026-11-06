// Lane B round B117 in the browser: Watchers of the Dead activated by an opponent asks you which two cards in your
// graveyard to keep; the rest of your graveyard is exiled (a "keep" picker over your graveyard).
import { expect, test } from "@playwright/test";
import { applyAction, planActivate, waitingOn, type GameState } from "@cc/engine";
import { one, open, pageErrors, playUntil, scene } from "./scene";
import { modal, resolveUntil } from "./ui";

test("Watchers of the Dead: keep two cards in your graveyard, the third is exiled", async ({ page }) => {
  let s: GameState = scene({ yard: ["Grizzly Bears", "Hill Giant", "Lightning Bolt"] }, [{ board: ["Watchers of the Dead"] }]);
  const [w, bears, giant, bolt] = [one(s, "Watchers of the Dead"), one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Lightning Bolt")];
  s = playUntil(s, (st) => st.activePlayer === 1 && st.step === "main1" && !st.pending && !st.stack.length && waitingOn(st) === 1);
  for (const a of planActivate(s, 1, w, 0)!) s = applyAction(s, a);
  s = playUntil(s, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  expect(s.pending).toMatchObject({ kind: "searchLibrary", fromGraveyard: "keep", min: 2, max: 2 });
  await open(page, s);
  const pick = modal(page);
  await expect(pick).toContainText("in your graveyard to keep; the rest of your graveyard is exiled");
  await pick.locator(`[data-pick="${bears}"]`).click();
  await pick.locator(`[data-pick="${bolt}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.objects[giant]!.zone === "exile");
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(after.objects[bolt]!.zone).toBe("graveyard");
  expect(after.objects[w]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});
