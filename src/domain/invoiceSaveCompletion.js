export function invoiceSaveFailureMessage(result = {}) {
  const reason = result.error?.message || result.invoice?.syncError || "Cloud did not confirm the invoice save.";
  return `Save not confirmed. Pending work is preserved. ${reason}`;
}

export async function completeInvoiceSaveLearning(result = {}, persistLearning = async () => ({ persisted: [], skipped: [] })) {
  if (!result.persisted) return { ...result, learning: null, message: invoiceSaveFailureMessage(result) };
  try {
    const learning = await persistLearning(result.invoice);
    const reason = learning?.skipped?.[0]?.reason;
    return {
      ...result,
      learning,
      message: reason
        ? `Invoice saved to cloud. Reusable learning pending: ${reason}`
        : "Invoice and reusable learning saved to cloud.",
    };
  } catch (error) {
    return {
      ...result,
      learning: { persisted: [], skipped: [{ reason: error.message || "Reusable learning failed." }] },
      message: `Invoice saved to cloud. Reusable learning pending: ${error.message || "Reusable learning failed."}`,
    };
  }
}
