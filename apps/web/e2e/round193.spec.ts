// Round 193's prompts: Beatrix, Loyal General's "attach any number of Equipment you control" picker (Equipment only, not
// Auras), and Primal Surge's "you may put it onto the battlefield", asked again after each permanent card.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Beatrix: at the beginning of combat, target Grizzly Bears, pick both Equipment and attach them", async ({ page }) => {
  const s = scene({ board: ["Beatrix, Loyal General", "Grizzly Bears", "Bonesplitter", "Lightning Greaves"] });
  const [bears, splitter, greaves] = [one(s, "Grizzly Bears"), one(s, "Bonesplitter"), one(s, "Lightning Greaves")];
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.step === "beginCombat");
  await page.locator(`[data-obj="${bears}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.action === "attach");
  const bar = controls(page);
  await expect(bar).toContainText("click any number of your Equipment to attach to Grizzly Bears");
  await expect(bar.getByRole("button", { name: "Attach none" })).toBeVisible();
  await page.locator(`[data-obj="${splitter}"]`).click();
  await page.locator(`[data-obj="${greaves}"]`).click();
  await bar.getByRole("button", { name: "Attach 2" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[greaves]!.attachedTo === bears);
  expect(after.objects[splitter]!.attachedTo).toBe(bears);
  expect(pageErrors(page)).toEqual([]);
});

test("Primal Surge: Yes puts Grizzly Bears onto the battlefield and asks again; No leaves Hill Giant in exile", async ({ page }) => {
  const s = scene({ hand: ["Primal Surge"], board: LANDS, library: ["Grizzly Bears", "Hill Giant", "Ornithopter"] });
  const [bears, giant, thopter] = [one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Ornithopter")];
  await open(page, s);
  await card(page, "Primal Surge", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay");
  const bar = controls(page);
  await expect(bar).toContainText("Put Grizzly Bears onto the battlefield? If you don't, Primal Surge is done.");
  await bar.getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.objects[bears]!.zone === "battlefield");
  await expect(bar).toContainText("Put Hill Giant onto the battlefield?");
  await bar.getByRole("button", { name: "No" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "exile");
  expect(after.objects[bears]!.zone).toBe("battlefield");
  expect(after.objects[thopter]!.zone).toBe("library");
  expect(pageErrors(page)).toEqual([]);
});
