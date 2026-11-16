// Lane B round B234 in the browser: Fight or Flight asks you to separate an opponent's creatures into two piles at the
// beginning of combat on their turn (only the pile they choose can attack), and Stand or Fall's pile choice asks you, a
// defending player, which of your two piles of creatures can block.
import { expect, test } from "@playwright/test";
import { one, open, pageErrors, playUntil, scene } from "./scene";
import { controls, resolveUntil } from "./ui";

test("Fight or Flight: at the beginning of combat on Ana's turn you separate her creatures; she picks the pile that can attack", async ({ page }) => {
  let s = scene({ board: ["Fight or Flight"] }, [{ board: ["Grizzly Bears", "Hill Giant"] }]);
  const [bears, giant] = [one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  s = playUntil(s, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0 && st.pending.action === "pile");
  expect(s.activePlayer).toBe(1);
  expect(s.step).toBe("beginCombat");
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("separate all creatures Ana controls into two piles");
  await expect(bar).toContainText("only the creatures in it can attack this turn");
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await bar.getByRole("button", { name: "First pile: 1, second pile: 1", exact: true }).click();
  const after = await resolveUntil(page, (st) => !!st.pilesOnlyThisTurn?.length);
  const entry = after.pilesOnlyThisTurn![0]!;
  expect(entry.kind).toBe("attack");
  expect(entry.ids.length).toBe(1);
  expect([`${bears}@${after.objects[bears]!.zoneChanges ?? 0}`, `${giant}@${after.objects[giant]!.zoneChanges ?? 0}`]).toContain(entry.ids[0]);
  expect(after.log.some((l) => l.text.startsWith("You separates Ana's creatures into two piles: Grizzly Bears; and Hill Giant."))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Stand or Fall: Ana separates your creatures at the beginning of combat on her turn; you choose the pile that can block", async ({ page }) => {
  let s = scene({ board: ["Grizzly Bears", "Hill Giant"] }, [{ board: ["Stand or Fall"] }]);
  s = playUntil(s, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "pile" && st.pending.player === 0);
  const pend = s.pending as Extract<NonNullable<typeof s.pending>, { kind: "chooseOption" }>;
  expect(pend.pileMode).toBe("canBlock");
  const second = pend.piles![1]!;
  await open(page, s);
  await expect(page.locator(".modal")).toContainText("choose a pile of your creatures: only the creatures in it can block this turn");
  await page.getByRole("button", { name: "Only pile 2 can block", exact: true }).click();
  const after = await resolveUntil(page, (st) => !!st.pilesOnlyThisTurn?.length);
  const entry = after.pilesOnlyThisTurn![0]!;
  expect(entry.kind).toBe("block");
  expect(entry.ids).toEqual(second.map((id) => `${id}@${after.objects[id]!.zoneChanges ?? 0}`));
  expect(after.log.some((l) => l.text.startsWith("You chooses pile 2"))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
