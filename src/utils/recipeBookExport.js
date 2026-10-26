import { recipeBookHtml, recipeBookPlainText } from "../domain/recipeBook.js";

// Copies one recipe as formatted text (Google Docs keeps the heading) and as plain text.
export async function copyRecipeForBook(entry) {
  const plain = recipeBookPlainText(entry);
  const html = recipeBookHtml(entry);
  if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
    await navigator.clipboard.write([new ClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([plain], { type: "text/plain" }),
    })]);
    return;
  }
  await navigator.clipboard.writeText(plain);
}

export async function downloadRecipeBookPdf(entries, { companyName = "", generatedAt = new Date().toISOString() } = {}) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const left = 48;
  const maxWidth = width - left * 2;
  let y = 64;
  const write = (text, { size = 10.5, style = "normal", gap = 4, color = [15, 23, 42] } = {}) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
    for (const line of doc.splitTextToSize(String(text), maxWidth)) {
      if (y > height - 56) { doc.addPage(); y = 56; }
      doc.text(line, left, y);
      y += size * 1.3;
    }
    y += gap;
  };

  write(companyName ? `${companyName} · Recipe book` : "Recipe book", { size: 22, style: "bold", gap: 6 });
  write(`${entries.length} recipes · ${String(generatedAt).slice(0, 10)}`, { size: 10, color: [100, 116, 139], gap: 18 });
  entries.forEach((entry, index) => {
    if (index > 0) {
      // Each recipe starts on a fresh page unless it fits in what is left of this one.
      const estimate = 60 + entry.ingredients.length * 14 + (entry.method ? 40 + Math.ceil(entry.method.length / 90) * 14 : 0);
      if (y + Math.min(estimate, 260) > height - 56) { doc.addPage(); y = 56; } else y += 14;
    }
    write(entry.title, { size: 16, style: "bold", gap: 2 });
    write(entry.yieldLine, { size: 10, style: "italic", color: [100, 116, 139], gap: 8 });
    entry.ingredients.forEach((line) => write(line, { gap: 1 }));
    if (entry.method) {
      y += 8;
      write("Method", { size: 12, style: "bold", gap: 2 });
      entry.method.split(/\n+/).filter((part) => part.trim()).forEach((part) => write(part.trim(), { gap: 4 }));
    }
  });
  doc.save(`recipe-book-${String(generatedAt).slice(0, 10)}.pdf`);
}
