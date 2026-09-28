import assert from "node:assert/strict";
import test from "node:test";
import { tableRowsMatchingQuery } from "./tableSearch.js";

test("table search returns every matching row rather than a visible subset", () => {
  const rows = [
    { id: "1", name: "Salmon fillet" },
    { id: "2", name: "Olives" },
    { id: "3", name: "Smoked salmon" },
  ];

  assert.deepEqual(tableRowsMatchingQuery(rows, "salmon").map((row) => row.id), ["1", "3"]);
  assert.equal(tableRowsMatchingQuery(rows, "").length, 3);
});
