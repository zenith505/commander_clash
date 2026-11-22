// Lane B round B293 in the browser: Soundwave, Sonic Spy (two creature tokens deal 3 combat damage to Ana; the trigger's
// target is Ana's Divination, mana value 3, not her Night's Whisper or Ben's Divination; casting the copy converts Soundwave).
import { expect, test } from "@playwright/test";
import { invalidateCharacteristics } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playUntil, scene } from "./scene";
import { attack, controls, modal, resolveUntil } from "./ui";

const SOUNDWAVE = "Soundwave, Sonic Spy // Soundwave, Superior Captain";

test("Soundwave, Sonic Spy: tokens deal 3 to Ana, exile her Divination, cast the copy and convert", async ({ page }) => {
  const s = scene({ board: [...LANDS, SOUNDWAVE, "Llanowar Elves", "Grizzly Bears"] }, [{ yard: ["Divination", "Night's Whisper"] }, { yard: ["Divination"] }]);
  const [sw, elves, bears, whisper] = [one(s, "Soundwave, Sonic Spy"), one(s, "Llanowar Elves"), one(s, "Grizzly Bears"), one(s, "Night's Whisper")];
  const [anaDiv] = idsOf(s, "Divination", "graveyard", 1);
  const [benDiv] = idsOf(s, "Divination", "graveyard", 2);
  // The Elves and the Bears are creature tokens here (the scene's way of giving you some).
  s.objects[elves]!.isToken = true;
  s.objects[bears]!.isToken = true;
  invalidateCharacteristics(s);
  await open(page, playUntil(s, (st) => st.pending?.kind === "declareAttackers"));
  await attack(page, [[elves, 1], [bears, 1]]);
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  expect(asked.players[1]!.life).toBe(40 - 3);
  await expect(modal(page).locator(`[data-pick="${whisper}"]`)).toHaveCount(0);
  await expect(modal(page).locator(`[data-pick="${benDiv}"]`)).toHaveCount(0);
  await modal(page).locator(`[data-pick="${anaDiv}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromAmong" && st.pending.player === 0);
  const bar = controls(page);
  await bar.getByRole("button", { name: "Divination" }).click();
  const offer = await resolveUntil(page, (st) => st.pending?.kind === "castFree" && st.pending.player === 0);
  expect(offer.objects[anaDiv!]!.zone).toBe("exile");
  const hand = offer.players[0]!.hand.length;
  await bar.getByRole("button", { name: "Cast it" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[0]!.hand.length === hand + 2);
  expect(after.objects[sw]!.face).toBe(1);
  expect(after.objects[anaDiv!]!.zone).toBe("exile");
  expect(after.objects[whisper]!.zone).toBe("graveyard");
  expect(after.objects[benDiv!]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});
