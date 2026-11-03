// Lane B round 100 in the browser: Wake to Slaughter's two graveyard targets and the opponent you choose to pick which
// goes to your hand; the other returns with haste.
import { expect, test } from "@playwright/test";
import { characteristics } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, modal, resolveUntil } from "./ui";

test("Wake to Slaughter: two creature cards from your graveyard, an opponent you choose picks one for your hand, the other returns with haste", async ({ page }) => {
  const s = scene({ hand: ["Wake to Slaughter"], board: LANDS, yard: ["Hill Giant", "Grizzly Bears"] });
  const [giant, bears] = [one(s, "Hill Giant"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Wake to Slaughter", s).click();
  const pick = modal(page);
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.locator(`[data-pick="${bears}"]`).click();
  if (await pick.getByRole("button", { name: "Done", exact: true }).count()) await pick.getByRole("button", { name: "Done", exact: true }).click();
  // You choose which opponent picks.
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "opponent");
  await controls(page).getByRole("button", { name: "Ana", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone !== "graveyard" && st.objects[bears]!.zone !== "graveyard");
  const [inHand, back] = after.objects[giant]!.zone === "hand" ? [giant, bears] : [bears, giant];
  expect(after.objects[inHand]!.zone).toBe("hand");
  expect(after.objects[back]!.zone).toBe("battlefield");
  expect(after.objects[back]!.controller).toBe(0);
  expect(characteristics(after, after.objects[back]!).keywords).toContain("Haste");
  expect(pageErrors(page)).toEqual([]);
});
