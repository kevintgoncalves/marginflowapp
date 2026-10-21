import test from "node:test";
import assert from "node:assert/strict";
import { normalizeExtractedLineQuantities as norm } from "./invoiceParsing.js";

test("Elite cases and splits become single items at the single price", () => {
  const barista = norm({ rawDescription: "COTTESWOLD DAIRY WHOLE BARISTA MILK", packSize: "6 x 2LTR", quantity: 3, unitCost: 10.74, casePrice: 10.74, lineTotal: 14.32 });
  assert.equal(barista.quantity, 8);
  assert.equal(barista.unitCost, 1.79);
  assert.deepEqual([barista.conversionRule.baseQuantity, barista.conversionRule.baseUnit], [2, "l"]);
  const cases = norm({ packSize: "6 x 2LTR", quantity: 2, unitCost: 11.34, casePrice: 11.34, lineTotal: 22.68 });
  assert.equal(cases.quantity, 12);
  const feta = norm({ packSize: "6 x 900G", quantity: 1, unitCost: 64.05, lineTotal: 10.68 });
  assert.deepEqual([feta.quantity, feta.unitCost, feta.conversionRule.baseQuantity], [1, 10.68, 0.9]);
  const crackers = norm({ packSize: "16 x 40G", quantity: 2, unitCost: 19.5, casePrice: 19.5, lineTotal: 39 });
  assert.equal(crackers.quantity, 32);
  assert.ok(Math.abs(crackers.conversionRule.baseQuantity - 0.04) < 1e-9);
});

test("lines that were not supplied are kept as Missing with no value", () => {
  const liver = norm({ rawDescription: "1kg Gressingham Duck Liver (EACH) *** NOT AVAILABLE ***", quantity: 0, unitCost: 5.5, lineTotal: 0 });
  assert.deepEqual([liver.quantity, liver.lineTotal, liver.lineStatus], [1, 0, "Missing"]);
  const monk = norm({ rawDescription: "MONKFISH: TAIL 2-4KG --> This product is not available", quantity: 3, unitCost: 31.3, lineTotal: 0 });
  assert.equal(monk.lineStatus, "Missing");
});

test("ordinary lines are left alone", () => {
  const line = { packSize: "1 x 2.5KG", quantity: 1, unitCost: 39.94, lineTotal: 39.94 };
  assert.deepEqual(norm(line), line);
  const tg = { packSize: "X100G BAG", quantity: 2, unitCost: 1.5, lineTotal: 3 };
  assert.deepEqual(norm(tg), tg);
});
