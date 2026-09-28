import assert from "node:assert/strict";
import test from "node:test";
import { displayValueForDataAvailability } from "./valuePresentation.js";

const money = (value) => `GBP ${Number(value).toFixed(2)}`;

test("no sales data displays a muted empty value", () => {
  assert.equal(displayValueForDataAvailability(0, false, money), "–");
});

test("a real zero waste record remains visible", () => {
  assert.equal(displayValueForDataAvailability(0, true, money), "GBP 0.00");
});

test("unavailable GP displays a muted empty value", () => {
  assert.equal(displayValueForDataAvailability(0, false, (value) => `${value.toFixed(1)}%`), "–");
});

test("a real zero business value remains visible", () => {
  assert.equal(displayValueForDataAvailability(0, true, money), "GBP 0.00");
});

test("a supplier with no invoice data displays a muted empty value", () => {
  assert.equal(displayValueForDataAvailability(0, false, money), "–");
});

test("a supplier real zero invoice remains visible", () => {
  assert.equal(displayValueForDataAvailability(0, true, money), "GBP 0.00");
});
