// Round 442: Auspicious Starrix (mutated onto Grizzly Bears from its Mutate button: Lightning Bolt stays exiled, Sol Ring
// enters) and Arna Kennerüd, Skycaptain (your equipped Grizzly Bears attacks: its counter doubles and a Bonesplitter token
// enters attached to it).
import { expect, test } from "@playwright/test";
import { characteristics, invalidateCharacteristics, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { attack, card, controls, menu, passTo, resolveUntil } from "./ui";

test("Auspicious Starrix: mutate onto Grizzly Bears; cards are exiled until a permanent card, which enters", async ({ page }) => {
  const s = scene({ hand: ["Auspicious Starrix"], board: [...LANDS, "Grizzly Bears"], library: ["Lightning Bolt", "Sol Ring"] });
  const [bears, bolt, ring] = [one(s, "Grizzly Bears"), one(s, "Lightning Bolt"), one(s, "Sol Ring")];
  await open(page, s);
  await card(page, "Auspicious Starrix", s).click();
  await menu(page).getByRole("button", { name: /^Mutate/ }).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "mutate");
  await controls(page).getByRole("button", { name: /^On top/ }).click();
  const after = await resolveUntil(page, (st: GameState) => !st.pending && st.stack.length === 0 && st.objects[ring]!.zone === "battlefield");
  invalidateCharacteristics(after);
  expect(characteristics(after, after.objects[bears]!).name).toBe("Auspicious Starrix");
  expect(after.objects[bolt]!.zone).toBe("exile");
  expect(after.objects[ring]!.controller).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Arna Kennerüd: your equipped Grizzly Bears attacks; its counter doubles and a Bonesplitter token enters on it", async ({ page }) => {
  const s = scene({ board: ["Arna Kennerüd, Skycaptain", "Grizzly Bears", "Bonesplitter"] });
  const [bears, splitter] = [one(s, "Grizzly Bears"), one(s, "Bonesplitter")];
  s.objects[splitter]!.attachedTo = bears;
  s.objects[bears]!.counters["+1/+1"] = 1;
  invalidateCharacteristics(s);
  await open(page, s);
  await passTo(page, "declareAttackers");
  await attack(page, [[bears, 1]]);
  const after = await resolveUntil(page, (st: GameState) => !st.pending && st.stack.length === 0 && st.battlefield.some((id) => st.objects[id]!.isToken));
  const tokens = after.battlefield.filter((id) => after.objects[id]!.isToken);
  expect(tokens.map((id) => after.cards[after.objects[id]!.cardId]!.name)).toEqual(["Bonesplitter"]);
  expect(after.objects[tokens[0]!]!.attachedTo).toBe(bears);
  expect(after.objects[bears]!.counters["+1/+1"]).toBe(2);
  await expect(page.locator(`[data-obj="${tokens[0]}"]`).first()).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});
