// Lane B round B231 in the browser: Back from the Brink (exile a creature card from your graveyard and pay its mana cost
// for a token copy), Cyclopean Tomb's choice of the land whose mire counters are removed, and Kheru Mind-Eater (cast the
// card Ana exiled face down from her hand).
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, playUntil, playWithBots, scene } from "./scene";
import { controls, menu, modal, resolveUntil, seat } from "./ui";

test("Back from the Brink: exile Serra Angel from your graveyard, pay {3}{W}{W}, get a token copy", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Back from the Brink"], yard: ["Serra Angel", "Grizzly Bears"] });
  const [brink, angel, bears] = [one(s, "Back from the Brink"), one(s, "Serra Angel"), one(s, "Grizzly Bears")];
  await open(page, s);
  await page.locator(`[data-obj="${brink}"]`).first().click();
  await menu(page).locator("button", { hasText: "Exile a creature card from your graveyard" }).click();
  const pick = modal(page);
  await expect(pick).toContainText("Back from the Brink: exile from your graveyard a creature card");
  await pick.locator(`[data-pick="${angel}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.battlefield.some((id) => st.objects[id]!.isToken && st.cards[st.objects[id]!.cardId]?.name === "Serra Angel"));
  expect(after.objects[angel]!.zone).toBe("exile");
  expect(after.objects[bears]!.zone).toBe("graveyard");
  // Five of the lands paid {3}{W}{W}.
  expect(after.battlefield.filter((id) => after.objects[id]!.tapped).length).toBe(5);
  expect(pageErrors(page)).toEqual([]);
});

test("Cyclopean Tomb: at your upkeep after it's gone, choose the Island; its mire counter goes, the Forest's stays", async ({ page }) => {
  const s0 = scene({ board: ["Forest", "Island"], yard: ["Cyclopean Tomb"] });
  const [tomb, forest, island] = [one(s0, "Cyclopean Tomb"), idsOf(s0, "Forest", "battlefield", 0)[0]!, idsOf(s0, "Island", "battlefield", 0)[0]!];
  // As if the Tomb had put a mire counter on each and then been destroyed.
  for (const id of [forest, island]) s0.objects[id]!.counters.mire = 1;
  const key = `${tomb}@${(s0.objects[tomb]!.zoneChanges ?? 0) - 1}`;
  s0.mireTomb = { [key]: [forest, island].map((id) => ({ land: `${id}@${s0.objects[id]!.zoneChanges ?? 0}` })) };
  s0.delayed = [{ when: "eachYourUpkeep", controller: 0, sourceCardId: s0.objects[tomb]!.cardId, subject: { id: tomb, zc: s0.objects[tomb]!.zoneChanges ?? 0 }, body: { targets: [], effects: [{ type: "tombRemove", key }], text: "remove all mire counters from a land" }, turn: s0.turn, step: s0.step }];
  const s = playUntil(s0, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "mireLand");
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("choose a land to remove all mire counters from");
  await expect(bar.getByRole("button", { name: "Forest (You, 1 mire counter)" })).toBeVisible();
  await bar.getByRole("button", { name: "Island (You, 1 mire counter)" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && (st.objects[island]!.counters.mire ?? 0) === 0);
  expect(after.objects[forest]!.counters.mire).toBe(1);
  expect(after.mireTomb?.[key]?.find((l) => l.land.startsWith(`${island}@`))?.removed).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Kheru Mind-Eater: it hits Ana, she exiles her Grizzly Bears face down, you cast it from her exile", async ({ page }) => {
  const s0 = scene({ board: [...LANDS, "Kheru Mind-Eater"] }, [{ hand: ["Grizzly Bears"] }]);
  const [eater, bears] = [one(s0, "Kheru Mind-Eater"), one(s0, "Grizzly Bears")];
  const s = playWithBots(s0, (st) => st.step === "main2" && st.activePlayer === 0 && !st.stack.length && !st.pending && st.objects[bears]!.zone === "exile", [[eater, 1]]);
  expect(s.objects[bears]!.hiddenExile?.seen).toContain(0);
  await open(page, s);
  await seat(page, 1).locator(".zone", { hasText: "Exile" }).click();
  await expect(modal(page).locator(".zone-tag")).toHaveText("face down");
  await modal(page).locator(".card.playable").click();
  await menu(page).getByRole("button", { name: /^Cast it/ }).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "battlefield");
  expect(after.objects[bears]!.controller).toBe(0);
  expect(after.objects[bears]!.owner).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});
