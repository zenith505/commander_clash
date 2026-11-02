// Lane B round B81 in the browser: Anurid Scavenger's upkeep "sacrifice ~ unless you put a card from your graveyard on
// the bottom of your library": answer Yes, then pick the card in the graveyard picker; it goes to the bottom of your
// library and the Scavenger stays (CR 118.12, the choice made on resolution).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { controls, modal, resolveUntil } from "./ui";

test("Anurid Scavenger: Yes, then pick Lightning Bolt in your graveyard, and it goes to the bottom of your library", async ({ page }) => {
  const s0 = scene({ board: [...LANDS, "Anurid Scavenger"], yard: ["Grizzly Bears", "Lightning Bolt"] });
  const [scavenger, bears, bolt] = [one(s0, "Anurid Scavenger"), one(s0, "Grizzly Bears"), one(s0, "Lightning Bolt")];
  const s = playUntil(s0, (st) => st.turn > s0.turn && st.pending?.kind === "chooseMay" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Anurid Scavenger");
  await bar.getByRole("button", { name: "Yes" }).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  expect(asked.pending).toMatchObject({ kind: "searchLibrary", fromGraveyard: "libraryBottom", min: 1, max: 1 });
  const pick = modal(page);
  await expect(pick).toContainText("Anurid Scavenger: put a card from your graveyard on the bottom of your library");
  await pick.locator(`[data-pick="${bolt}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[bolt]!.zone === "library");
  expect(after.players[0]!.library.at(-1)).toBe(bolt);
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(after.objects[scavenger]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});
