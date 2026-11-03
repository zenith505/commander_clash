// Round 261's prompts: The Mimeoplasm (exile two creature cards from graveyards: the one it copies, then the other for
// +1/+1 counters equal to its power) and Kaito, Dancing Shadow (return a creature that dealt combat damage, then a second
// loyalty ability this turn).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { attack, card, controls, menu, passTo, resolveUntil } from "./ui";

test("The Mimeoplasm: exile Elvish Visionary and Ana's Colossal Dreadmaw; it enters as Elvish Visionary with six +1/+1 counters and draws", async ({ page }) => {
  const s = scene({ hand: ["The Mimeoplasm"], board: LANDS, yard: ["Elvish Visionary"], library: ["Wastes"] }, [{ yard: ["Colossal Dreadmaw"] }]);
  const [mime, elf, maw, wastes] = ["The Mimeoplasm", "Elvish Visionary", "Colossal Dreadmaw", "Wastes"].map((n) => one(s, n)) as [string, string, string, string];
  await open(page, s);
  await card(page, "The Mimeoplasm", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "copy");
  const bar = controls(page);
  await expect(bar).toContainText("The Mimeoplasm: you may exile two creature cards from graveyards: first the one it enters as a copy of");
  await expect(bar.getByRole("button", { name: "Don't exile" })).toBeVisible();
  await bar.getByRole("button", { name: /^Elvish Visionary/ }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "copyOther");
  await expect(bar).toContainText("a copy of Elvish Visionary: choose the other creature card to exile (+1/+1 counters equal to its power)");
  await bar.getByRole("button", { name: "Colossal Dreadmaw (Ana's graveyard, power 6)" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[mime]!.zone === "battlefield" && st.objects[wastes]!.zone === "hand");
  expect(after.objects[mime]!.counters["+1/+1"]).toBe(6);
  expect([elf, maw].map((id) => after.objects[id]!.zone)).toEqual(["exile", "exile"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Kaito, Dancing Shadow: return the Grizzly Bears that dealt combat damage, then activate Kaito's 0 a second time this turn", async ({ page }) => {
  const s = scene({ board: ["Kaito, Dancing Shadow", "Grizzly Bears"], library: ["Wastes", "Island", "Swamp"] });
  const [kaito, bears] = [one(s, "Kaito, Dancing Shadow"), one(s, "Grizzly Bears")];
  s.objects[kaito]!.counters.loyalty = 3;
  await open(page, s);
  await card(page, "Kaito, Dancing Shadow", s).click();
  await menu(page).locator("button", { hasText: "0: Draw a card" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0);
  await attack(page, [[bears, 1]]);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Kaito, Dancing Shadow: Return one of them to its owner's hand?");
  await bar.getByRole("button", { name: "Yes" }).click();
  const back = await passTo(page, "main2");
  expect(back.objects[bears]!.zone).toBe("hand");
  const hand = back.players[0]!.hand.length;
  await card(page, "Kaito, Dancing Shadow", s).click();
  await menu(page).locator("button", { hasText: "0: Draw a card" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[0]!.hand.length === hand + 1);
  expect(after.objects[kaito]!.counters.loyalty).toBe(3);
  expect(pageErrors(page)).toEqual([]);
});
