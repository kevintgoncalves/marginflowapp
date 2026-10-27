import React, { useMemo, useState } from "react";
import { Plus, Search, Trash2, X } from "lucide-react";
import { costRecipe } from "../../domain/recipeCosting.js";
import {
  PREP_LINE_TYPES,
  estimatePrepLine,
  prepTotals,
  rankFreeImportCandidates,
  recipePrepLine,
  valueRecipePrep,
} from "../../domain/stocktakeFreeImport.js";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const money = (value) => (value === null || value === undefined ? "–" : gbp.format(Number(value) || 0));

function recipeUnits(base) {
  if (base === "kg") return ["g", "kg"];
  if (base === "l") return ["ml", "l"];
  return ["portion"];
}

// Prep counted in the stocktake: recipes valued at the current recipe cost, and estimated values
// by zone. Shown and totalled apart from the counted products.
export default function StocktakePrepLines({ canEdit = true, costingContext, department = "", index, lines = [], onChange }) {
  const [query, setQuery] = useState("");
  const recipeIndex = useMemo(() => ({ entries: (index?.entries || []).filter((entry) => entry.type === "recipe") }), [index]);
  const hits = useMemo(() => (query.trim() ? rankFreeImportCandidates(query, recipeIndex, { limit: 6 }).candidates : []), [query, recipeIndex]);
  const totals = prepTotals(lines);
  const update = (id, patch) => onChange(lines.map((line) => {
    if (line.id !== id) return line;
    const next = { ...line, ...patch };
    return next.type === PREP_LINE_TYPES.RECIPE ? valueRecipePrep(next, costingContext) : { ...next, value: patch.value === undefined ? next.value : patch.value };
  }));
  const addRecipe = (hit) => {
    const costed = costRecipe(hit.id, costingContext);
    const base = costed.yieldBase?.base || "portion";
    const unit = base === "kg" ? "kg" : base === "l" ? "l" : "portion";
    onChange([...lines, valueRecipePrep(recipePrepLine({ recipeId: hit.id, recipeName: hit.name, quantity: 1, unit, unitCost: costed.baseCost || 0, department }), costingContext)]);
    setQuery("");
  };
  const addZone = () => onChange([...lines, estimatePrepLine({ zone: "", value: 0, department })]);

  return (
    <div className="stocktake-prep">
      <div className="panel-head">
        <div><h3>Prep</h3><span>Recipes at the current recipe cost, and estimated values by zone.</span></div>
        <div className="import-review-totals"><span>Recipes {money(totals.recipe)}</span><span>Estimated {money(totals.estimate)}</span></div>
      </div>
      {lines.map((line) => (line.type === PREP_LINE_TYPES.RECIPE ? (
        <div className="stocktake-prep-row recipe" key={line.id}>
          <span className="stocktake-prep-name"><strong>{line.recipeName}</strong><small>{line.unitCost ? `${money(line.unitCost)}/${line.unit === "portion" ? "portion" : (line.unit === "g" || line.unit === "kg" ? "kg" : "l")}` : "Recipe cost to check"}</small></span>
          <input aria-label={`${line.recipeName} quantity`} disabled={!canEdit} min="0" step="any" type="number" value={line.quantity} onChange={(event) => update(line.id, { quantity: event.target.value })} />
          <select aria-label={`${line.recipeName} unit`} disabled={!canEdit} value={line.unit} onChange={(event) => update(line.id, { unit: event.target.value })}>
            {recipeUnits(costingContext ? costRecipe(line.recipeId, costingContext).yieldBase?.base : "").map((unit) => <option key={unit} value={unit}>{unit}</option>)}
            {!recipeUnits(costingContext ? costRecipe(line.recipeId, costingContext).yieldBase?.base : "").includes(line.unit) && <option value={line.unit}>{line.unit}</option>}
          </select>
          <strong className="stocktake-prep-value">{money(line.value)}</strong>
          {canEdit && <button className="icon danger" aria-label="Remove prep line" onClick={() => onChange(lines.filter((item) => item.id !== line.id))} type="button"><Trash2 size={15} /></button>}
        </div>
      ) : (
        <div className="stocktake-prep-row estimate" key={line.id}>
          <input aria-label="Zone" disabled={!canEdit} placeholder="Zone, e.g. Big freezer" value={line.zone} onChange={(event) => update(line.id, { zone: event.target.value })} />
          <span className="stocktake-prep-tag">Estimate</span>
          <input aria-label={`${line.zone || "Zone"} estimated value`} disabled={!canEdit} min="0" step="0.01" type="number" value={line.value} onChange={(event) => update(line.id, { value: event.target.value })} />
          <strong className="stocktake-prep-value">{money(line.value)}</strong>
          {canEdit && <button className="icon danger" aria-label="Remove prep line" onClick={() => onChange(lines.filter((item) => item.id !== line.id))} type="button"><Trash2 size={15} /></button>}
        </div>
      )))}
      {canEdit && (
        <div className="stocktake-prep-add">
          <div className="ingredient-search">
            <span className="ingredient-search-field">
              <Search size={15} aria-hidden="true" />
              <input aria-label="Add a recipe" autoComplete="off" placeholder="Add a recipe (e.g. Dukkah)" value={query} onChange={(event) => setQuery(event.target.value)} />
              {query && <button aria-label="Clear search" className="icon" onClick={() => setQuery("")} type="button"><X size={14} /></button>}
            </span>
            {query.trim() && (
              <div className="ingredient-suggestions" role="listbox">
                {hits.map((hit) => <button key={hit.id} onClick={() => addRecipe(hit)} role="option" aria-selected="false" type="button"><strong>{hit.name}</strong><span>Recipe</span></button>)}
                {!hits.length && <small>No recipe found.</small>}
              </div>
            )}
          </div>
          <button className="ghost" onClick={addZone} type="button"><Plus size={15} />Zone estimate</button>
        </div>
      )}
    </div>
  );
}
