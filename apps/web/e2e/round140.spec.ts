// Round 140: Ghostly Dancers asks which of its two choices to make and then which locked door to unlock, and Hakbal
// of the Surging Soul asks which Merfolk explores next.
import { expect, test } from "@playwright/test";
import { characteristics } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Ghostly Dancers: choose to unlock a door rather than return an enchantment, then which locked door", async ({ page }) => {
  const s = scene({ hand: ["Ghostly Dancers"], board: [...LANDS, "Bottomless Pool // Locker Room"], yard: ["Leyline of Sanctity"] });
  const [room, leyline] = [one(s, "Bottomless Pool // Locker Room"), one(s, "Leyline of Sanctity")];
  await open(page, s);
  await card(page, "Ghostly Dancers", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "either");
  const bar = controls(page);
  await expect(bar.getByRole("button", { name: "Return an enchantment card" })).toHaveCount(1);
  await bar.getByRole("button", { name: "Unlock a locked door" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "unlockDoor");
  await expect(bar.getByRole("button", { name: "Bottomless Pool" })).toHaveCount(1);
  await bar.getByRole("button", { name: "Locker Room" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[room]!.unlocked?.length === 1);
  expect(after.objects[room]!.unlocked).toEqual([1]);
  expect(characteristics(after, after.objects[room]!).name).toBe("Locker Room");
  expect(after.objects[leyline]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Hakbal of the Surging Soul: at the beginning of combat you pick which Merfolk explores first", async ({ page }) => {
  const s = scene({ board: ["Hakbal of the Surging Soul", "Merfolk Looter"], library: ["Grizzly Bears"] });
  const [hakbal, looter, bears] = [one(s, "Hakbal of the Surging Soul"), one(s, "Merfolk Looter"), one(s, "Grizzly Bears")];
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.what === "creature to explore next");
  const bar = controls(page);
  await page.locator(`[data-obj="${looter}"]`).click();
  await bar.getByRole("button", { name: "Choose", exact: true }).click();
  // The Looter explores first and reveals Grizzly Bears: keep it on top.
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.card === bears);
  await expect(bar).toContainText("Put Grizzly Bears into your graveyard?");
  await bar.getByRole("button", { name: "No" }).click();
  // Then Hakbal explores, with no question, reveals it again and gets its counter (CR 701.44a): into the graveyard this time.
  const now = await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.card === bears && (st.objects[hakbal]!.counters["+1/+1"] ?? 0) === 1);
  expect(now.objects[looter]!.counters["+1/+1"]).toBe(1);
  expect(now.objects[bears]!.zone).toBe("library");
  await bar.getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (st) => !st.pending && st.objects[bears]!.zone === "graveyard");
  expect(pageErrors(page)).toEqual([]);
});
