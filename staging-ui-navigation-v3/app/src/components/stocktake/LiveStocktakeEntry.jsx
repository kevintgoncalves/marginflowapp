import React, { useMemo, useRef, useState } from "react";
import { Edit3, PackageSearch, Plus, Search, Trash2 } from "lucide-react";
import { rankProductCandidates } from "../../domain/productMatching.js";
import { parseImportedStockCount, stocktakeEntryFromProduct } from "../../domain/stocktakeImport.js";

function displayUnit(product = {}) {
  return product.unit || product.unitOfMeasure || product.packSize || "Unit not set";
}

export default function LiveStocktakeEntry({
  canEdit = true,
  department = "",
  departmentNames = [],
  lines = [],
  onApplyEntries,
  onCreateProduct,
  onRemove,
  productIndex,
  products = [],
}) {
  const [view, setView] = useState("count");
  const [query, setQuery] = useState("");
  const [browseDepartment, setBrowseDepartment] = useState(department || "All departments");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [status, setStatus] = useState("");
  const searchRef = useRef(null);
  const countedLines = lines.filter((line) => line.matchedProductId && line.quantity !== null && line.quantity !== undefined);
  const countedByProduct = useMemo(() => new Map(countedLines.map((line) => [line.matchedProductId, line])), [countedLines]);
  const activeProducts = useMemo(() => products.filter((product) => product.active !== false), [products]);
  const selectedProduct = activeProducts.find((product) => product.id === selectedProductId) || null;
  const candidates = useMemo(() => {
    if (query.trim()) return rankProductCandidates(query, productIndex, { limit: 5, minimumScore: 0.2 }).map((entry) => entry.product);
    return activeProducts
      .filter((product) => browseDepartment === "All departments" || product.department === browseDepartment)
      .sort((left, right) => String(left.name || "").localeCompare(String(right.name || "")))
      .slice(0, 12);
  }, [activeProducts, browseDepartment, productIndex, query]);

  const selectProduct = (product) => {
    const current = countedByProduct.get(product.id);
    setSelectedProductId(product.id);
    setQuantity(current ? String(current.quantity) : "");
    setStatus("");
  };

  const submitCount = () => {
    if (!selectedProduct || !canEdit) return;
    const parsed = parseImportedStockCount(quantity);
    if (!parsed.hasCount || parsed.invalid) {
      setStatus("Enter zero or a positive quantity.");
      return;
    }
    const replacing = countedByProduct.has(selectedProduct.id);
    onApplyEntries([stocktakeEntryFromProduct(selectedProduct, parsed.count, { department, source: "live" })]);
    setStatus(`${selectedProduct.name} ${replacing ? "updated" : "counted"}: ${parsed.count}.`);
    setSelectedProductId("");
    setQuantity("");
    setQuery("");
    setTimeout(() => searchRef.current?.focus(), 0);
  };

  return (
    <div className="live-stocktake">
      <div className="stocktake-progress">
        <strong>{countedLines.length} products counted</strong>
        <div className="segmented-control" aria-label="Live Stock Take view">
          <button className={view === "count" ? "active" : ""} onClick={() => setView("count")} type="button">Count</button>
          <button className={view === "review" ? "active" : ""} onClick={() => setView("review")} type="button">Review</button>
        </div>
      </div>

      {view === "count" ? (
        <div className="live-count-layout">
          <section className="live-product-finder">
            <label className="search-field">
              <Search size={17} />
              <input ref={searchRef} autoFocus placeholder="Search products" value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
            <label className="browse-filter">Browse<select value={browseDepartment} onChange={(event) => setBrowseDepartment(event.target.value)}>
              <option>All departments</option>
              {departmentNames.map((name) => <option key={name}>{name}</option>)}
            </select></label>
            <div className="live-product-results" role="listbox" aria-label="Matching products">
              {candidates.map((product) => {
                const current = countedByProduct.get(product.id);
                return (
                  <button className={selectedProductId === product.id ? "live-product-option selected" : "live-product-option"} key={product.id} onClick={() => selectProduct(product)} type="button">
                    <span><strong>{product.name}</strong><small>{displayUnit(product)}{product.department ? ` · ${product.department}` : ""}</small></span>
                    <span>{current ? `Counted ${current.quantity}` : "Select"}</span>
                  </button>
                );
              })}
              {!candidates.length && <div className="empty-search-state"><PackageSearch size={20} /><span>No existing product found</span></div>}
            </div>
            {canEdit && query.trim() && !candidates.some((product) => String(product.name || "").toLowerCase() === query.trim().toLowerCase()) && (
              <button className="ghost" onClick={() => onCreateProduct({ name: query.trim(), department })} type="button"><Plus size={15} />Create product</button>
            )}
          </section>

          <section className="live-count-entry" aria-label="Selected product count">
            {selectedProduct ? (
              <>
                <div><span>Product</span><strong>{selectedProduct.name}</strong></div>
                <div><span>Unit</span><strong>{displayUnit(selectedProduct)}</strong></div>
                {countedByProduct.has(selectedProduct.id) && <div className="current-count"><span>Current count</span><strong>{countedByProduct.get(selectedProduct.id).quantity}</strong></div>}
                <label>Quantity<input inputMode="decimal" min="0" step="0.01" type="number" value={quantity} onChange={(event) => setQuantity(event.target.value)} onKeyDown={(event) => event.key === "Enter" && submitCount()} /></label>
                <button disabled={!canEdit} onClick={submitCount} type="button"><Plus size={17} />{countedByProduct.has(selectedProduct.id) ? "Update count" : "Add count"}</button>
              </>
            ) : <div className="empty-selection"><PackageSearch size={24} /><span>Select an existing product</span></div>}
          </section>
        </div>
      ) : (
        <div className="live-count-review">
          {countedLines.map((line) => (
            <div className="live-review-row" key={line.matchedProductId || line.id}>
              <span><strong>{line.productName}</strong><small>{line.unit || line.packSize || "Unit not set"}</small></span>
              <strong>{line.quantity}</strong>
              {canEdit && <div className="row-actions">
                <button className="icon" title="Edit count" onClick={() => {
                  const product = activeProducts.find((candidate) => candidate.id === line.matchedProductId);
                  if (product) selectProduct(product);
                  setView("count");
                }} type="button"><Edit3 size={15} /></button>
                <button className="icon danger" title="Remove count" onClick={() => onRemove(line.matchedProductId)} type="button"><Trash2 size={15} /></button>
              </div>}
            </div>
          ))}
          {!countedLines.length && <div className="empty-selection"><PackageSearch size={24} /><span>No products counted</span></div>}
        </div>
      )}
      {status && <div className="invoice-status info">{status}</div>}
    </div>
  );
}
