// Round 338's prompt: One Last Job's third mode returns an Equipment card from your graveyard attached to a creature you
// control, the creature chosen as it resolves (a picker of your creatures, by name).
import { expect, test } from "@playwright/test";
import { applyAction, planCast } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playUntil, scene } from "./scene";
import { controls, resolveUntil } from "./ui";

test("One Last Job returning Bonesplitter: pick Elite Vanguard to carry it", async ({ page }) => {
  const s0 = scene({ hand: ["One Last Job"], board: [...LANDS, "Grizzly Bears", "Elite Vanguard"], yard: ["Bonesplitter"] });
  const [job] = idsOf(s0, "One Last Job", "hand", 0);
  const [eq] = idsOf(s0, "Bonesplitter", "graveyard", 0);
  const vanguard = one(s0, "Elite Vanguard");
  let s = s0;
  for (const a of planCast(s, 0, job!, [{ kind: "object", id: eq! }], [2])!) s = applyAction(s, a);
  s = playUntil(s, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "attachHost" && st.pending.player === 0);
  await open(page, s);
  await expect(controls(page)).toContainText("One Last Job: choose a creature you control for Bonesplitter to enter attached to");
  await expect(controls(page).getByRole("button", { name: "Grizzly Bears" })).toBeVisible();
  await controls(page).getByRole("button", { name: "Elite Vanguard" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[eq!]!.zone === "battlefield");
  expect(after.objects[eq!]!.attachedTo).toBe(vanguard);
  expect(pageErrors(page)).toEqual([]);
});
