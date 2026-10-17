// Voting (CR 701.38): a button for each choice, the votes made before yours in the prompt; a permanent shows whose it is.
// An extra vote you may take or leave (Ballot Broker) has a "No additional vote" button.
import { expect, test } from "@playwright/test";
import { idsOf, LANDS, open, pageErrors, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Council's Judgment: vote for a permanent you don't control; the most votes is exiled", async ({ page }) => {
  const s = scene({ hand: ["Council's Judgment"], board: LANDS }, [{ board: ["Sol Ring"] }, { board: ["Grizzly Bears"] }]);
  const ring = idsOf(s, "Sol Ring", "battlefield", 1)[0]!;
  await open(page, s);
  await card(page, "Council's Judgment", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "vote" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Council's Judgment: vote: vote for a nonland permanent you don't control");
  await expect(bar.getByRole("button", { name: "Grizzly Bears (Ben)" })).toBeVisible();
  await bar.getByRole("button", { name: "Sol Ring (Ana)" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0);
  expect(after.objects[ring]!.zone).toBe("exile");
  expect(after.log.some((l) => l.text === "You votes for Sol Ring (Ana).")).toBe(true);
  expect(after.log.filter((l) => / votes for /.test(l.text)).length).toBe(4);
  expect(pageErrors(page)).toEqual([]);
});

test("Ballot Broker: vote for a word, then take or leave the additional vote", async ({ page }) => {
  const s = scene({ hand: ["Tyrant's Choice"], board: [...LANDS, "Ballot Broker"] });
  await open(page, s);
  await card(page, "Tyrant's Choice", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "vote" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar.getByRole("button", { name: "death", exact: true })).toBeVisible();
  await bar.getByRole("button", { name: "torture", exact: true }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "vote" && st.pending.player === 0 && st.pending.options.includes("none"));
  await expect(bar).toContainText("vote an additional time");
  await bar.getByRole("button", { name: "No additional vote" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0);
  expect(after.log.filter((l) => l.text.startsWith("You votes for")).length).toBe(1);
  expect(after.log.filter((l) => / votes for /.test(l.text)).length).toBe(4);
  expect(pageErrors(page)).toEqual([]);
});
