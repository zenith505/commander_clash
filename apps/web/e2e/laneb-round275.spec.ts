// Lane B round B275 in the browser: Tawnos's Coffin (exile Ana's Grizzly Bears with your Pacifism on it, then untap the
// Coffin in your untap step: the Bears come back tapped with its +1/+1 counter and the Pacifism on it) and Takklemaggot
// (your enchanted Grizzly Bears dies; you choose Ana's Llanowar Elves for it to enchant).
import { expect, test } from "@playwright/test";
import { invalidateCharacteristics } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, controls, menu, resolveUntil } from "./ui";

test("Tawnos's Coffin: exile Ana's Grizzly Bears and your Pacifism on it; untapping the Coffin brings both back", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Tawnos's Coffin", "Pacifism"] }, [{ board: ["Grizzly Bears"] }]);
  const [box, pac, bears] = [one(s, "Tawnos's Coffin"), one(s, "Pacifism"), one(s, "Grizzly Bears")];
  s.objects[pac]!.attachedTo = bears;
  s.objects[bears]!.counters = { "+1/+1": 1 };
  invalidateCharacteristics(s);
  await open(page, s);
  await page.locator(`[data-obj="${box}"]`).click();
  await menu(page).getByRole("button", { name: /Exile target creature/ }).click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  let now = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "exile");
  expect(now.objects[pac]!.zone).toBe("exile");
  expect(now.objects[box]!.tapped).toBe(true);
  // Round the table (in the engine, for speed) to your next untap step, where you choose what stays tapped.
  now = playUntil(now, (st) => st.pending?.kind === "pickPermanents" && st.pending.action === "keepTapped" && st.pending.player === 0);
  expect(now.objects[bears]!.zone).toBe("exile");
  await open(page, now);
  await expect(controls(page)).toContainText("Untap step: click the permanents you want to keep tapped");
  await controls(page).getByRole("button", { name: "Untap all" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "battlefield" && st.objects[pac]!.zone === "battlefield");
  expect(after.objects[bears]!.controller).toBe(1);
  expect(after.objects[bears]!.tapped).toBe(true);
  expect(after.objects[bears]!.counters["+1/+1"]).toBe(1);
  expect(after.objects[pac]!.attachedTo).toBe(bears);
  expect(after.objects[pac]!.controller).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Takklemaggot: your enchanted Grizzly Bears dies and you choose Ana's Llanowar Elves for it to enchant", async ({ page }) => {
  const s = scene({ hand: ["Shock"], board: [...LANDS, "Grizzly Bears", "Takklemaggot", "Hill Giant"] }, [{ board: ["Llanowar Elves"] }]);
  const [takk, bears, giant, elves] = [one(s, "Takklemaggot"), one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Llanowar Elves")];
  s.objects[takk]!.attachedTo = bears;
  invalidateCharacteristics(s);
  await open(page, s);
  await card(page, "Shock", s).click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /^Cast/ }).first().click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  // The Bears' controller (you) chooses; Takklemaggot isn't targeting, so any creature it could enchant is offered.
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "enchant" && st.pending.player === 0);
  expect([...(asked.pending as { options: string[] }).options].sort()).toEqual([giant, elves].sort());
  const bar = controls(page);
  await expect(bar).toContainText("choose a creature for Takklemaggot to enchant");
  await bar.getByRole("button", { name: /Llanowar Elves/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[takk]!.zone === "battlefield");
  expect(after.objects[takk]!.attachedTo).toBe(elves);
  expect(after.objects[takk]!.controller).toBe(0);
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});
