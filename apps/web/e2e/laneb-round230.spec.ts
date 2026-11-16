// Lane B round B230 in the browser: Glyph of Reincarnation, after combat, destroys the creature your Wall blocked this turn,
// and you choose the creature card from its controller's graveyard that enters under its owner's control.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, modal, resolveUntil } from "./ui";

test("Glyph of Reincarnation: destroy the Grizzly Bears your Wall blocked; choose Hill Giant from Ana's graveyard, which enters under Ana's control", async ({ page }) => {
  const s = scene({ hand: ["Glyph of Reincarnation"], board: [...LANDS, "Wall of Wood"] }, [{ board: ["Grizzly Bears"], yard: ["Hill Giant"] }], { step: "main2" });
  const [wall, bears, giant] = [one(s, "Wall of Wood"), one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  // Earlier this turn the Wall blocked Ana's Grizzly Bears (as the engine logs a block).
  const key = (id: string) => `${id}@${s.objects[id]!.zoneChanges ?? 0}`;
  s.turnLog = { ...s.turnLog, blocks: [{ blocker: key(wall), attacker: key(bears), combat: 0, ac: 1 }] };
  await open(page, s);
  await card(page, "Glyph of Reincarnation", s).click();
  await page.locator(`[data-obj="${wall}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const pick = modal(page);
  await expect(pick).toContainText("a creature card in Ana's graveyard");
  await expect(pick.locator(`[data-pick="${bears}"]`)).toBeVisible();
  await pick.locator(`[data-pick="${giant}"]`).click();
  const done = pick.getByRole("button", { name: /^(Done|Take|Choose|Put)/ });
  if (await done.count()) await done.first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "battlefield");
  expect([after.objects[bears]!.zone, after.objects[giant]!.controller, after.objects[wall]!.zone]).toEqual(["graveyard", 1, "battlefield"]);
  expect(pageErrors(page)).toEqual([]);
});
