// Lane B round B148 in the browser: Archangel of Strife asks you war or peace as it enters (you first, on your turn), the
// bots answer theirs; Celestial Judgment has you click one creature of each power, and the rest are destroyed.
import { expect, test } from "@playwright/test";
import { idsOf, LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Archangel of Strife: you choose war, then each other player chooses; your creatures get +3/+0", async ({ page }) => {
  const s = scene({ hand: ["Archangel of Strife"], board: [...LANDS, "Grizzly Bears"] }, [{ board: ["Hill Giant"] }]);
  const angel = one(s, "Archangel of Strife");
  const bears = idsOf(s, "Grizzly Bears", "battlefield", 0)[0]!;
  await open(page, s);
  await card(page, "Archangel of Strife", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "playerWord" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Archangel of Strife: choose war or peace");
  await expect(bar.getByRole("button", { name: "Peace", exact: true })).toBeVisible();
  await bar.getByRole("button", { name: "War", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && Object.keys(st.objects[angel]!.chosen?.byPlayer ?? {}).length === 4);
  expect(after.objects[angel]!.chosen!.byPlayer![0]).toBe("war");
  expect(after.log.some((l) => l.text === "You chooses war for Archangel of Strife.")).toBe(true);
  expect(after.objects[bears]!.zone).toBe("battlefield");
  await expect(page.locator(`[data-obj="${bears}"]`).first()).toContainText("5/2");
  expect(pageErrors(page)).toEqual([]);
});

test("Celestial Judgment: click one creature of each power (anyone's); the others are destroyed", async ({ page }) => {
  const s = scene({ hand: ["Celestial Judgment"], board: [...LANDS, "Grizzly Bears"] }, [{ board: ["Grizzly Bears", "Hill Giant"] }]);
  const mine = idsOf(s, "Grizzly Bears", "battlefield", 0)[0]!;
  const theirs = idsOf(s, "Grizzly Bears", "battlefield", 1)[0]!;
  const giant = one(s, "Hill Giant");
  await open(page, s);
  await card(page, "Celestial Judgment", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Celestial Judgment: click one creature of each power (anyone's), then choose them");
  await page.locator(`[data-obj="${mine}"]`).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  await bar.getByRole("button", { name: "Choose", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[theirs]!.zone === "graveyard");
  expect(after.objects[mine]!.zone).toBe("battlefield");
  expect(after.objects[giant]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});
