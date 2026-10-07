import React from 'react';
import { comparisonMoney as money, comparisonUnit as unit } from '../domain/latestProductComparison.js';

export function articleDifference(article) {
  if (article.delta == null) return 'Not comparable';
  if (Math.abs(article.delta)<1e-7) return 'Same price';
  return `${money(Math.abs(article.delta),article.currency)}/${unit(article.unit)} ${article.delta>0?'cheaper':'more expensive'} (${Math.abs(article.percent).toFixed(1)}%)`;
}
export default function ProductSupplierComparison({ product, onOpenInvoice }) {
  const comparison=product.comparison;
  const card=article=><article className={`mf-supplier-article ${article.isCheapest?'is-cheapest':''}`} key={article.key}>
    <header><div><h3>{article.supplier}</h3><span>{article.code || 'Article code not recorded'}</span></div><div className="mf-article-badges">{article.isCurrentSupplier && <strong>Current supplier</strong>}{article.isCheapest && <strong>Cheapest comparable</strong>}</div></header>
    <p>{article.description || 'Description not recorded'}</p>
    <dl className="mf-detail-list">
      <dt>Brand / specification</dt><dd>{[article.brand,article.specification].filter(Boolean).join(' · ') || 'Not recorded'}</dd>
      <dt>Pack</dt><dd>{article.pack || 'Not recorded'}</dd>
      <dt>Invoice quantity / billing unit</dt><dd>{article.purchaseQuantity ?? 'Not recorded'} · {article.billingUnit || 'Not recorded'}</dd>
      <dt>Original net unit price</dt><dd>{money(article.billedNetPrice,article.currency)}</dd>
      <dt>Net pack price</dt><dd>{money(article.netPackPrice,article.currency)}</dd>
      <dt>Normalised price</dt><dd>{article.valid?`${money(article.price,article.currency)}/${unit(article.unit)}`:'Not comparable'}</dd>
      <dt>Against current supplier</dt><dd>{articleDifference(article)}</dd>
      <dt>Price date</dt><dd>{article.date || 'Not recorded'}</dd>
      <dt>Source invoice</dt><dd>{article.invoiceId ? <button className="ghost mini-button" type="button" onClick={()=>onOpenInvoice?.(article.invoiceId)}>{article.invoiceNumber}</button> : "No confirmed invoice"}</dd>
      <dt>Equivalence</dt><dd>{article.status.includes('equivalence')?'Needs equivalence review':article.equivalence}</dd>
      <dt>Conversion / review</dt><dd>{article.status}</dd>
    </dl>
  </article>;
  return <div className="mf-supplier-comparison">
    <p>Latest confirmed price for each supplier article, by invoice date. These are recorded prices, not live quotations.</p>
    <p>Current supplier: <strong>{product.supplier || 'Not selected'}</strong>. {comparison.status}</p>
    {comparison.current && <p>Current comparable price: <strong>{comparison.current.valid?`${money(comparison.current.price,comparison.current.currency)}/${unit(comparison.current.unit)}`:comparison.current.status}</strong>{comparison.current.date && ` · ${comparison.current.date}`}</p>}
    <h3>Comparable articles ({comparison.comparable.length})</h3>
    {comparison.comparable.map(card)}
    {!comparison.comparable.length && <p>No comparable confirmed prices.</p>}
    {comparison.review.length>0 && <section aria-label="Articles to review"><h3>To review ({comparison.review.length})</h3><p>Excluded from the cheapest-price ranking.</p>{comparison.review.map(card)}</section>}
    {!comparison.articles.length && <p>No confirmed supplier articles are available. Demo prices and unconfirmed invoices are excluded.</p>}
  </div>;
}
