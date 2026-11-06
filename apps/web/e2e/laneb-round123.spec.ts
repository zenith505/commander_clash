// Lane B round B123 in the browser: Gabriel Angelfire's upkeep choice of an ability, rampage 3 among them; and Ana's
// Demonic Hordes, unpaid, has you (the opponent Ana chose) pick one of Ana's lands for Ana to sacrifice.
import { expect, test } from "@playwright/test";
import { idsOf, one, open, pageErrors, playUntil, scene } from "./scene";
import { controls, resolveUntil } from "./ui";

test("Gabriel Angelfire: on your upkeep you choose rampage 3, and it has rampage until your next upkeep", async ({ page }) => {
  const s0 = scene({ board: ["Gabriel Angelfire"] });
  const gabriel = one(s0, "Gabriel Angelfire");
  const s = playUntil(s0, (st) => st.pending?.kind === "chooseOption" && st.pending.player === 0 && st.activePlayer === 0 && st.step === "upkeep");
  expect(s.pending).toMatchObject({ what: "keyword", options: ["Flying", "First strike", "Trample", "Rampage 3"] });
  await open(page, s);
  await expect(controls(page)).toContainText("Gabriel Angelfire: choose an ability");
  await controls(page).getByRole("button", { name: "Rampage 3", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  const gained = after.effects.filter((e) => e.affected.includes(gabriel) && e.duration === "yourNextUpkeep");
  expect(gained.flatMap((e) => e.mods)).toEqual([{ kind: "addKeywords", keywords: ["Rampage"] }, { kind: "addAbility", text: "Rampage 3" }]);
  expect(pageErrors(page)).toEqual([]);
});

test("Demonic Hordes: Ana doesn't pay, picks you, and you click which of Ana's lands Ana sacrifices", async ({ page }) => {
  // Ana has no Swamp, so can't pay {B}{B}{B}; Craw Wurm makes you the opponent with the most power on the battlefield.
  const s0 = scene({ board: ["Craw Wurm"] }, [{ board: ["Demonic Hordes", "Forest", "Mountain", "Island"] }]);
  const hordes = one(s0, "Demonic Hordes");
  const [forest, mountain, island] = [idsOf(s0, "Forest", "battlefield", 1)[0]!, idsOf(s0, "Mountain", "battlefield", 1)[0]!, idsOf(s0, "Island", "battlefield", 1)[0]!];
  const s = playUntil(s0, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "choose", options: expect.arrayContaining([forest, mountain, island]) });
  await open(page, s);
  await expect(controls(page)).toContainText("Demonic Hordes: click a land of the player whose Demonic Hordes it is: they sacrifice it.");
  await page.locator(`[data-obj="${mountain}"]`).click();
  await controls(page).getByRole("button", { name: "Choose", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.objects[mountain]!.zone === "graveyard" && st.stack.length === 0);
  expect(after.objects[forest]!.zone).toBe("battlefield");
  expect(after.objects[island]!.zone).toBe("battlefield");
  expect(after.objects[hordes]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
