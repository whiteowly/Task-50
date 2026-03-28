import { test, expect, vi, beforeEach } from "vitest";

const apiRequestMock = vi.fn();
const apiFormRequestMock = vi.fn();

vi.mock("../src/api.js", () => ({
  apiRequest: (...args) => apiRequestMock(...args),
  apiFormRequest: (...args) => apiFormRequestMock(...args)
}));

import { useReceivingWorkspace } from "../src/composables/useReceivingWorkspace.js";

beforeEach(() => {
  apiRequestMock.mockReset();
  apiFormRequestMock.mockReset();
});

test("receiving workspace uploads and lists receipt documents via API endpoints", async () => {
  const workspace = useReceivingWorkspace({ user: { siteId: 1 } });
  workspace.receiptDocumentForm.value.receiptId = "55";
  workspace.receiptDocumentForm.value.poLineNo = "1";
  workspace.receiptDocumentForm.value.batchNo = "B-55";
  workspace.receiptDocumentForm.value.title = "BOL";
  workspace.receiptDocumentForm.value.file = new File(["pdf"], "bol.pdf", { type: "application/pdf" });

  apiFormRequestMock.mockResolvedValueOnce({ id: "doc-55" });
  apiRequestMock.mockResolvedValueOnce([
    { id: "doc-55", original_name: "bol.pdf", mime_type: "application/pdf" }
  ]);

  await workspace.uploadReceiptDocument();

  expect(apiFormRequestMock).toHaveBeenCalledTimes(1);
  expect(apiFormRequestMock.mock.calls[0][0]).toBe("/receiving/receipts/55/documents");
  expect(apiRequestMock).toHaveBeenCalledWith("/receiving/receipts/55/documents");
  expect(workspace.receiptDocuments.value).toHaveLength(1);
  expect(workspace.receiptDocumentStatus.value).toBe("Documents loaded.");
});

test("receiving workspace requires inspection status in receipt payload", async () => {
  const workspace = useReceivingWorkspace({ user: { siteId: 1 } });
  workspace.receiptForm.value.lines[0].inspectionStatus = "PASS";
  workspace.receiptForm.value.lines[0].batchNo = "B-100";
  apiRequestMock.mockResolvedValueOnce({ id: 22 });

  await workspace.submitReceipt();

  const [, options] = apiRequestMock.mock.calls[0];
  const payload = JSON.parse(options.body);
  expect(payload.lines[0].inspectionStatus).toBe("PASS");
  expect(payload.lines[0].batchNo).toBe("B-100");
});

test("dock scheduling enforces exact 30-minute window", async () => {
  const workspace = useReceivingWorkspace({ user: { siteId: 1 } });
  workspace.dockForm.value.siteId = "1";
  workspace.dockForm.value.poNumber = "PO-DOCK-1";
  workspace.dockForm.value.startAt = "2026-04-10T09:00";
  workspace.dockForm.value.endAt = "2026-04-10T09:20";

  await workspace.submitDock();

  expect(workspace.dockStatus.value).toBe("Dock window must be exactly 30 minutes.");
  expect(apiRequestMock).not.toHaveBeenCalled();
});

test("dock submit ignores duplicate clicks while request in flight", async () => {
  const workspace = useReceivingWorkspace({ user: { siteId: 1 } });
  workspace.dockForm.value.siteId = "1";
  workspace.dockForm.value.poNumber = "PO-DOCK-2";
  workspace.dockForm.value.startAt = "2026-04-10T09:00";
  workspace.dockForm.value.endAt = "2026-04-10T09:30";

  let release;
  apiRequestMock.mockImplementationOnce(() => new Promise((resolve) => {
    release = resolve;
  }));

  const first = workspace.submitDock();
  const second = workspace.submitDock();
  expect(workspace.isSubmittingDock.value).toBe(true);
  expect(apiRequestMock).toHaveBeenCalledTimes(1);
  release({ ok: true });
  await Promise.all([first, second]);
  expect(workspace.isSubmittingDock.value).toBe(false);
  expect(workspace.dockStatus.value).toBe("Appointment saved.");
});

test("receiving submission requires discrepancy resolution inputs", async () => {
  const workspace = useReceivingWorkspace({ user: { siteId: 1 } });
  workspace.receiptForm.value.lines[0].qtyExpected = 10;
  workspace.receiptForm.value.lines[0].qtyReceived = 8;
  workspace.receiptForm.value.lines[0].discrepancyType = "";
  workspace.receiptForm.value.lines[0].dispositionNote = "";

  await workspace.submitReceipt();

  expect(workspace.receiptSubmitStatus.value).toContain("Discrepancy lines must include");
  expect(apiRequestMock).not.toHaveBeenCalled();
  expect(workspace.isSubmittingReceipt.value).toBe(false);
});

test("receipt submit ignores duplicate clicks while request in flight", async () => {
  const workspace = useReceivingWorkspace({ user: { siteId: 1 } });
  workspace.receiptForm.value.lines[0].qtyExpected = 10;
  workspace.receiptForm.value.lines[0].qtyReceived = 10;
  workspace.receiptForm.value.lines[0].discrepancyType = "";
  workspace.receiptForm.value.lines[0].dispositionNote = "";

  let release;
  apiRequestMock.mockImplementationOnce(() => new Promise((resolve) => {
    release = resolve;
  }));

  const first = workspace.submitReceipt();
  const second = workspace.submitReceipt();
  expect(workspace.isSubmittingReceipt.value).toBe(true);
  expect(apiRequestMock).toHaveBeenCalledTimes(1);
  release({ id: 300 });
  await Promise.all([first, second]);
  expect(workspace.isSubmittingReceipt.value).toBe(false);
  expect(workspace.receiptSubmitStatus.value).toBe("Receipt submitted.");
});
