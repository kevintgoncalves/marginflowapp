function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve("");
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export async function readInvoiceWithAI({ file, invoiceText = "" }) {
  const dataUrl = file ? await fileToDataUrl(file) : "";
  const response = await fetch("/.netlify/functions/read-invoice-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      invoiceText,
      fileName: file?.name || "",
      fileType: file?.type || "",
      fileData: dataUrl
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "AI invoice read failed");
  }

  return data;
}
