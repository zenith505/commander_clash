// Round 121's prompts: forage (CR 701.61a) asks which way to pay when both are possible, then the Food or the three
// graveyard cards; "forage or pay {B}" (Feed the Cycle) offers both; Arachne, Psionic Weaver asks for an opponent, shows
// their hand, then asks for a card type other than creature.
import { expect, test } from "@playwright/test";
import { spellCost } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

test("Camellia: forage by sacrificing a Food, chosen over exiling three cards; the sacrifice makes a Squirrel", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Camellia, the Seedmiser"], tokens: ["Food"], yard: ["Grizzly Bears", "Hill Giant", "Shock"] });
  const food = s.battlefield.find((id) => s.objects[id]!.isToken && s.cards[s.objects[id]!.cardId]!.subtypes.includes("Food"))!;
  await open(page, s);
  await card(page, "Camellia, the Seedmiser", s).click();
  await menu(page).locator("button", { hasText: "Forage" }).click();
  const forage = page.locator(".forage-pick");
  await expect(forage).toContainText("Camellia, the Seedmiser: forage by");
  await forage.getByRole("button", { name: "Sacrificing a Food" }).click();
  const bar = page.locator(".targeting", { hasText: "sacrifice a Food to forage" });
  await expect(bar.getByRole("button", { name: "Sacrifice and activate" })).toBeDisabled();
  await page.locator(`[data-obj="${food}"]`).click();
  await bar.getByRole("button", { name: "Sacrifice and activate" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.battlefield.some((id) => st.cards[st.objects[id]!.cardId]!.name === "Squirrel Token"));
  expect(after.objects[food]?.zone ?? "gone").not.toBe("battlefield");
  const squirrel = after.battlefield.find((id) => after.cards[after.objects[id]!.cardId]!.name === "Squirrel Token")!;
  expect(after.objects[squirrel]!.counters["+1/+1"]).toBe(1);
  for (const n of ["Grizzly Bears", "Hill Giant", "Shock"]) expect(after.objects[one(s, n)]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Feed the Cycle: forage rather than pay {B}, exiling three cards from your graveyard (no Food to sacrifice)", async ({ page }) => {
  const s = scene({ hand: ["Feed the Cycle"], board: LANDS, yard: ["Grizzly Bears", "Hill Giant", "Shock", "Llanowar Elves"] }, [{ board: ["Hill Giant"] }]);
  const spell = one(s, "Feed the Cycle");
  const victim = s.battlefield.find((id) => s.objects[id]!.controller === 1 && s.cards[s.objects[id]!.cardId]!.name === "Hill Giant")!;
  const yard = [one(s, "Grizzly Bears"), one(s, "Shock"), one(s, "Llanowar Elves")];
  await open(page, s);
  await card(page, "Feed the Cycle", s).click();
  const or = page.locator(".targeting", { hasText: "as an additional cost" });
  await expect(or.getByRole("button", { name: "Pay {B}" })).toBeEnabled();
  await or.getByRole("button", { name: "Forage" }).click();
  await page.locator(`[data-obj="${victim}"]`).click();
  // No Food: straight to the three cards.
  const pick = modal(page);
  await expect(pick).toContainText("exile three cards from your graveyard to forage");
  for (const id of yard) await pick.locator(`[data-pick="${id}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[spell]!.zone === "graveyard");
  expect(after.objects[victim]!.zone).toBe("graveyard");
  for (const id of yard) expect(after.objects[id]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});

test("Arachne, Psionic Weaver: choose Ana, see her hand, then name sorcery (creature isn't offered); her sorcery costs {1} more", async ({ page }) => {
  const s = scene({ hand: ["Arachne, Psionic Weaver"], board: LANDS }, [{ hand: ["Night's Whisper"] }]);
  const arachne = one(s, "Arachne, Psionic Weaver");
  await open(page, s);
  await card(page, "Arachne, Psionic Weaver", s).click();
  await menu(page).getByRole("button", { name: /^Cast/ }).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar.getByRole("button", { name: "You (you)", exact: true })).toHaveCount(0);
  await bar.getByRole("button", { name: "Ana", exact: true }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "cardType");
  await expect(page.locator(".log")).toContainText("Night's Whisper");
  await expect(bar.getByRole("button", { name: "Creature", exact: true })).toHaveCount(0);
  await bar.getByRole("button", { name: "Sorcery", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.objects[arachne]!.zone === "battlefield" && st.stack.length === 0);
  expect(after.objects[arachne]!.chosen?.cardType).toBe("Sorcery");
  expect(spellCost(after, 1, after.objects[one(s, "Night's Whisper")]!).extra).toBe(2); // {1}{B}, one more
  expect(pageErrors(page)).toEqual([]);
});
