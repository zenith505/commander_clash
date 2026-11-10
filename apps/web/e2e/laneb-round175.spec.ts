// Lane B round B175 in the browser: Torrent Elemental's ability from your exile pile (it works only there), Thrill-Kill
// Disciple's squad cost of {1} and a discard paid twice, and Fatal Fissure's delayed earthbend asking for a land you
// control when the chosen creature dies.
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { card, controls, menu, modal, resolveUntil, seat } from "./ui";

test("Torrent Elemental: from your exile pile, {3}{B/G}{B/G} puts it onto the battlefield tapped", async ({ page }) => {
  const s = scene({ exile: ["Torrent Elemental"], board: LANDS });
  const te = one(s, "Torrent Elemental");
  await open(page, s);
  await seat(page, 0).locator(".zone", { hasText: "Exile" }).click();
  await modal(page).locator(".card.playable").click();
  await menu(page).getByRole("button", { name: /Put Torrent Elemental from exile onto the battlefield tapped/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[te]!.zone === "battlefield");
  expect(after.objects[te]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Thrill-Kill Disciple: squad twice, {1} and a discarded card each time, two token copies", async ({ page }) => {
  const s = scene({ hand: ["Thrill-Kill Disciple", "Grizzly Bears", "Hill Giant", "Lightning Bolt"], board: LANDS });
  const [tk, bears, giant, bolt] = [one(s, "Thrill-Kill Disciple"), one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Lightning Bolt")];
  await open(page, s);
  await card(page, "Thrill-Kill Disciple", s).click();
  const bar = page.locator(".targeting", { hasText: "how many times?" });
  await expect(bar).toContainText("squad ({1}, discard a card), how many times?");
  await bar.getByRole("button", { name: "Kick one more time" }).click();
  await bar.getByRole("button", { name: "Kick one more time" }).click();
  await bar.getByRole("button", { name: "Pay 2 times" }).click();
  const pick = modal(page);
  await expect(pick).toContainText("discard");
  await pick.locator(`[data-pick="${bears}"]`).click();
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[tk]!.zone === "battlefield" && st.battlefield.filter((id) => st.objects[id]!.isToken && st.cards[st.objects[id]!.cardId]!.name === "Thrill-Kill Disciple").length === 2);
  expect([after.objects[bears]!.zone, after.objects[giant]!.zone, after.objects[bolt]!.zone]).toEqual(["graveyard", "graveyard", "hand"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Fatal Fissure: when the chosen Grizzly Bears dies this turn, click a land you control to earthbend 4", async ({ page }) => {
  const s = scene({ hand: ["Fatal Fissure", "Lightning Bolt"], board: ["Grizzly Bears", "Mountain", "Swamp", "Swamp", "Forest"] });
  const [bears, forest] = [one(s, "Grizzly Bears"), idsOf(s, "Forest", "battlefield", 0)[0]!];
  await open(page, s);
  await card(page, "Fatal Fissure", s).click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[one(s, "Fatal Fissure")]!.zone === "graveyard");
  await card(page, "Lightning Bolt", s).click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  await expect(controls(page).or(page.locator(".targeting")).first()).toContainText("land you control");
  await page.locator(`[data-obj="${forest}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && (st.objects[forest]!.counters["+1/+1"] ?? 0) === 4);
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});
