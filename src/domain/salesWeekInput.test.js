import assert from "node:assert/strict";
import test from "node:test";
import { buildSalesWeekGrid, changedSalesDays, pasteIntoGrid, salesRowFromGrid, weekDates, weekStartFor } from "./salesWeekInput.js";

const depts = ["Kitchen Made", "Bought In", "Bar"];

test("week starts on Monday and has seven days", () => {
  assert.equal(weekStartFor("2026-10-24"), "2026-10-19");
  assert.deepEqual(weekDates("2026-10-19"), ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"]);
});

test("stored day loads into the grid with the unallocated part in Other", () => {
  const stored = [{ id: "s1", date: "2026-10-23", netSales: 2024.21, grossSales: 2426.19, serviceCharge: 245.85,
    departments: { "Kitchen Made": { netSales: 866.11, grossSales: 1039.35 }, "Bought In": { netSales: 158.11, grossSales: 189.1 }, Bar: { netSales: 883.32, grossSales: 1057.74 } } }];
  const grid = buildSalesWeekGrid("2026-10-19", stored, depts);
  const day = grid[4];
  assert.equal(day.storedId, "s1");
  assert.equal(day.cells.Bar.net, "883.32");
  assert.equal(day.other.net, "116.67");
  assert.equal(day.serviceCharge, "245.85");
  // Saving it unchanged is not a change.
  assert.deepEqual(changedSalesDays(grid, depts).save, []);
});

test("day total is the sum of the row; a missing net is worked out from the VAT rate", () => {
  const row = { date: "2026-10-20", storedId: "", cells: { "Kitchen Made": { gross: "120", net: "" }, Bar: { gross: "60", net: "50" } }, other: { gross: "", net: "" }, serviceCharge: "15" };
  const sale = salesRowFromGrid(row, depts, { vatRate: 20, idFactory: () => "new" });
  assert.equal(sale.departments["Kitchen Made"].netSales, 100);
  assert.equal(sale.netSales, 150);
  assert.equal(sale.grossSales, 180);
  assert.equal(sale.serviceCharge, 15);
  assert.equal(sale.id, "new");
});

test("only changed days are saved; cleared stored days are reported", () => {
  const stored = [
    { id: "a", date: "2026-10-19", netSales: 100, grossSales: 120, serviceCharge: 0, departments: { Bar: { netSales: 100, grossSales: 120 } } },
    { id: "b", date: "2026-10-20", netSales: 50, grossSales: 60, serviceCharge: 0, departments: { Bar: { netSales: 50, grossSales: 60 } } },
  ];
  const grid = buildSalesWeekGrid("2026-10-19", stored, depts);
  grid[0].serviceCharge = "12.5";
  grid[1].cells.Bar = { gross: "", net: "" };
  grid[2].cells["Kitchen Made"] = { gross: "240", net: "200" };
  const { save, cleared } = changedSalesDays(grid, depts, { idFactory: () => "n" });
  assert.deepEqual(save.map((row) => [row.date, row.id]), [["2026-10-19", "a"], ["2026-10-21", "n"]]);
  assert.deepEqual(cleared, ["2026-10-20"]);
});

test("pasting a block from a spreadsheet fills consecutive days and columns", () => {
  const grid = buildSalesWeekGrid("2026-10-19", [], depts);
  const next = pasteIntoGrid(grid, depts, 1, 0, "1,039.35\t866.11\n£500\t416.67\r\n");
  assert.deepEqual(next[1].cells["Kitchen Made"], { gross: "1039.35", net: "866.11" });
  assert.deepEqual(next[2].cells["Kitchen Made"], { gross: "500", net: "416.67" });
  assert.deepEqual(next[0].cells["Kitchen Made"], { gross: "", net: "" });
});
