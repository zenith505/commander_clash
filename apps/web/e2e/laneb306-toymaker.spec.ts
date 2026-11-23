// Lane B round B306 in the browser: The Celestial Toymaker's attack trigger. You separate the top three cards into a
// face-down pile and a face-up pile (both exiled) for the defending player to choose from; and when Ana's Toymaker attacks
// you, you choose which of her piles goes into her hand, the face-down one shown as card backs.
import { expect, test } from "@playwright/test";
import { applyAction, botActions, waitingOn, type GameState } from "@cc/engine";
import { LANDS, idsOf, open, pageErrors, scene } from "./scene";
import { attack, controls, modal, resolveUntil } from "./ui";

const TOP = ["Hill Giant", "Shock", "Sol Ring"];

test("The Celestial Toymaker: attacking Ana, you put Hill Giant in the face-down pile; both piles are exiled and Ana picks one for your hand", async ({ page }) => {
  const s = scene({ board: [...LANDS, "The Celestial Toymaker"], library: TOP });
  const toy = idsOf(s, "The Celestial Toymaker", "battlefield")[0]!;
  const [giant, shock, ring] = TOP.map((n) => idsOf(s, n, "library", 0)[0]!) as [string, string, string];
  await open(page, s);
  await controls(page).getByRole("button", { name: "Pass" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "declareAttackers");
  await attack(page, [[toy, 1]]);
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const sep = modal(page);
  await expect(sep).toContainText("The Celestial Toymaker: separate your cards into a face-down pile and a face-up pile. Choose the cards for the face-down pile");
  await expect(sep).toContainText("Both piles are exiled; a pile may be empty. The defending player chooses one for your hand; the other stays in exile.");
  await sep.locator(`[data-pick="${giant}"]`).click();
  await expect(sep).toContainText("Face-down pile");
  await sep.getByRole("button", { name: "Done", exact: true }).click();
  // Ana's bot chooses; the other pile stays in exile.
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && [giant, shock, ring].every((id) => x.objects[id]!.zone !== "library"));
  const zones = [giant, shock, ring].map((id) => after.objects[id]!.zone);
  expect(zones[1]).toBe(zones[2]);
  expect(new Set([zones[0], zones[1]])).toEqual(new Set(["hand", "exile"]));
  expect(after.log.some((l) => l.text === "You exiles 1 card in a face-down pile and Shock, Sol Ring in a face-up pile (The Celestial Toymaker).")).toBe(true);
  expect(after.turnLog?.pileOrGuess?.length).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("The Celestial Toymaker: Ana's Toymaker attacks you; you see her face-up pile and only card backs for the other, and put the face-up pile into her hand", async ({ page }) => {
  let s = scene({ board: LANDS }, [{ board: [...LANDS, "The Celestial Toymaker"], library: TOP }]);
  const toy = idsOf(s, "The Celestial Toymaker", "battlefield", 1)[0]!;
  const three = TOP.map((n) => idsOf(s, n, "library", 1)[0]!);
  // In the engine: on to Ana's turn; she attacks you with the Toymaker and splits the cards; then your choice.
  for (let i = 0; i < 3000 && !(s.pending?.kind === "chooseOption" && s.pending.what === "pile" && s.pending.player === 0); i++) {
    const pid = waitingOn(s)!;
    const pend = s.pending;
    if (pend?.kind === "declareAttackers") s = applyAction(s, { type: "declareAttackers", player: pid, attacks: pid === 1 ? [{ attacker: toy, defender: 0 }] : [] });
    else if (pend?.kind === "declareBlockers") s = applyAction(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (pend && pid !== 0) s = applyAction(s, botActions(s, pid)[0]!);
    else s = applyAction(s, { type: "passPriority", player: pid });
  }
  expect(s.pending).toMatchObject({ kind: "chooseOption", player: 0, what: "pile", pileMode: "faceDown", of: 1 });
  const piles = (s.pending as { piles: [string[], string[]] }).piles;
  await open(page, s);
  const picker = modal(page);
  await expect(picker).toContainText("choose the pile to put into Ana's hand (the other stays in exile)");
  const down = picker.locator('[data-pile="0"]');
  await expect(down.locator(".card.back")).toHaveCount(piles[0].length);
  for (const id of piles[0]) await expect(down).not.toContainText(s.cards[s.objects[id]!.cardId]!.name);
  await picker.getByRole("button", { name: "Put the face-up pile into Ana's hand" }).click();
  const after = await resolveUntil(page, (x) => !(x.pending?.kind === "chooseOption" && x.pending.what === "pile") && three.every((id) => x.objects[id]!.zone !== "library"));
  expect(piles[1].every((id) => after.objects[id]!.zone === "hand")).toBe(true);
  expect(piles[0].every((id) => after.objects[id]!.zone === "exile")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
