import React from "react";

export default function ServerPages({ offset, count, total, loading, onPage }) {
  return <div className="table-toolbar" aria-label="Pagination">
    <span role="status">Showing {total ? offset + 1 : 0}–{offset + count} of {total}</span>
    <button type="button" disabled={loading || offset === 0} onClick={() => onPage(Math.max(0, offset - 25))}>Previous</button>
    <button type="button" disabled={loading || offset + count >= total} onClick={() => onPage(offset + 25)}>Next</button>
  </div>;
}
