// Lane B round B233 in the browser: Oracle en-Vec's question to you as its target opponent (choose any number of your
// creatures, which must attack during your next turn while the others can't), and A Killer Among Us's secret choice of
// Human, Merfolk or Goblin, shown only to you on the enchantment.
import { expect, test } from "@playwright/test";
import { applyAction, planActivate, waitingOn } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Oracle en-Vec: Ana targets you; you choose your Grizzly Bears, so during your next turn it attacks if able and Hill Giant can't", async ({ page }) => {
  let s = scene({ board: ["Grizzly Bears", "Hill Giant"] }, [{ board: ["Oracle en-Vec"] }]);
  const [bears, giant, oracle] = [one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Oracle en-Vec")];
  s = playUntil(s, (st) => st.activePlayer === 1 && st.step === "main1" && !st.pending && !st.stack.length && waitingOn(st) === 1);
  for (const a of planActivate(s, 1, oracle, 0, [{ kind: "player", id: 0 }])!) s = applyAction(s, a);
  s = playUntil(s, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("choose any number of creatures you control: during your next turn they attack if able and no other creature can attack");
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await bar.getByRole("button", { name: "Choose", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && !st.stack.length && !!st.chosenAttackers);
  const entry = Object.values(after.chosenAttackers!)[0]!;
  expect(entry.player).toBe(0);
  expect(entry.chosen).toEqual([`${bears}@${after.objects[bears]!.zoneChanges ?? 0}`]);
  expect(entry.chosen.some((k) => k.startsWith(`${giant}@`))).toBe(false);
  expect(after.log.some((l) => l.text === "You chooses Grizzly Bears: during their next turn, those creatures attack if able and other creatures can't attack.")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("A Killer Among Us: cast it, the three tokens enter, and you secretly choose Goblin, shown on the enchantment", async ({ page }) => {
  const s = scene({ hand: ["A Killer Among Us"], board: LANDS });
  await open(page, s);
  await card(page, "A Killer Among Us", s).click();
  const st = await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "secretType");
  const bar = controls(page);
  await expect(bar).toContainText("A Killer Among Us: secretly choose Human, Merfolk, or Goblin");
  expect(st.battlefield.filter((id) => /^(Human|Merfolk|Goblin) Token$/.test(st.cards[st.objects[id]!.cardId]!.name)).length).toBe(3);
  await bar.getByRole("button", { name: "Goblin", exact: true }).click();
  const after = await resolveUntil(page, (x) => !x.pending && !x.stack.length && !!x.objects[one(x, "A Killer Among Us")]!.secretType);
  const killer = one(after, "A Killer Among Us");
  expect(after.objects[killer]!.secretType).toMatchObject({ type: "Goblin", by: 0 });
  await expect(page.locator(`[data-obj="${killer}"]`).first()).toContainText("Goblin (secret)");
  expect(after.log.some((l) => l.text === "You secretly chooses a creature type for A Killer Among Us.")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
