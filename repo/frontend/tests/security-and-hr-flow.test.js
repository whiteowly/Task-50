import { test, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";

const apiRequestMock = vi.fn();
const apiFormRequestMock = vi.fn();

vi.mock("../src/api.js", () => ({
  apiRequest: (...args) => apiRequestMock(...args),
  apiFormRequest: (...args) => apiFormRequestMock(...args)
}));

import { useHrWorkspace } from "../src/composables/useHrWorkspace.js";
import InterviewerReviewPanel from "../src/components/workspace/InterviewerReviewPanel.vue";

beforeEach(() => {
  apiRequestMock.mockReset();
  apiFormRequestMock.mockReset();
});

test("interviewer panel renders explicit masked sensitive fields", () => {
  const wrapper = mount(InterviewerReviewPanel, {
    props: {
      reviewForm: { candidateId: "101" },
      reviewStatus: "Candidate loaded.",
      onLoadCandidate: vi.fn(),
      reviewResult: {
        id: 101,
        fullName: "Candidate One",
        email: "c1@example.com",
        phone: "555-0101",
        dob: "1992-01-10",
        ssnLast4: "1234",
        duplicateFlag: true,
        attachmentCompleteness: { complete: false, missingRequiredClasses: ["RESUME"] },
        token: "should-not-be-rendered"
      }
    }
  });

  expect(wrapper.text()).toContain("DOB: ****-**-**");
  expect(wrapper.text()).toContain("SSN last 4: ****");
  expect(wrapper.text()).toContain("Missing attachments: RESUME");
  expect(wrapper.text()).not.toContain("should-not-be-rendered");
  expect(wrapper.find("pre").exists()).toBe(false);
});

test("HR flow surfaces duplicate/completeness/classification outcomes", async () => {
  const workspace = useHrWorkspace();
  workspace.candidateForm.value.fullName = "New Candidate";
  workspace.candidateForm.value.dob = "1994-01-01";
  workspace.candidateForm.value.ssnLast4 = "7788";
  workspace.candidateForm.value.formData = [{ fieldKey: "work_eligibility", fieldValue: "yes" }];
  workspace.onCandidateFileChange({ target: { files: [new File(["resume"], "resume.pdf", { type: "application/pdf" })] } });

  apiRequestMock.mockResolvedValueOnce({
    id: 321,
    duplicateFlag: true,
    attachmentCompleteness: {
      complete: false,
      missingRequiredClasses: ["IDENTITY_DOC"]
    },
    uploadToken: "upload-token"
  });
  apiFormRequestMock.mockResolvedValueOnce({
    id: "doc-1",
    classification: "IDENTITY_DOC",
    attachmentCompleteness: {
      complete: false,
      missingRequiredClasses: ["IDENTITY_DOC"]
    }
  });

  await workspace.submitCandidate();

  expect(workspace.lastCandidateId.value).toBe(321);
  expect(workspace.candidateOutcome.value.duplicateFlag).toBe(true);
  expect(workspace.candidateOutcome.value.duplicateDetails).toContain("Potential duplicate");
  expect(workspace.candidateOutcome.value.completeness?.missingRequiredClasses).toContain("IDENTITY_DOC");
  expect(workspace.candidateOutcome.value.classification).toBe("Attachment classification (authoritative): IDENTITY_DOC.");
  expect(workspace.candidateUploadStatus.value).toContain("Remaining required items: IDENTITY_DOC");
});

test("HR flow falls back to filename inference when backend classification is absent", async () => {
  const workspace = useHrWorkspace();
  workspace.candidateForm.value.fullName = "Fallback Candidate";
  workspace.candidateForm.value.dob = "1993-02-01";
  workspace.candidateForm.value.ssnLast4 = "4455";
  workspace.candidateForm.value.formData = [{ fieldKey: "work_eligibility", fieldValue: "yes" }];
  workspace.onCandidateFileChange({ target: { files: [new File(["resume"], "resume_2026.pdf", { type: "application/pdf" })] } });

  apiRequestMock.mockResolvedValueOnce({
    id: 654,
    duplicateFlag: false,
    attachmentCompleteness: {
      complete: true,
      missingRequiredClasses: []
    },
    uploadToken: "upload-token"
  });
  apiFormRequestMock.mockResolvedValueOnce({ id: "doc-2" });

  await workspace.submitCandidate();

  expect(workspace.candidateOutcome.value.classification).toBe("Attachment classification (fallback): RESUME.");
  expect(workspace.candidateUploadStatus.value).toContain("Application and attachment uploaded successfully.");
  expect(workspace.candidateUploadStatus.value).toContain("Attachment classification (fallback): RESUME.");
});

test("candidate submit ignores duplicate clicks while in flight", async () => {
  const workspace = useHrWorkspace();
  workspace.candidateForm.value.fullName = "Race Candidate";
  workspace.candidateForm.value.dob = "1990-01-01";
  workspace.candidateForm.value.ssnLast4 = "2222";
  workspace.candidateForm.value.formData = [{ fieldKey: "work_eligibility", fieldValue: "yes" }];

  let release;
  apiRequestMock.mockImplementationOnce(() => new Promise((resolve) => {
    release = resolve;
  }));

  const first = workspace.submitCandidate();
  const second = workspace.submitCandidate();
  expect(workspace.isSubmittingCandidate.value).toBe(true);
  expect(apiRequestMock).toHaveBeenCalledTimes(1);
  release({ id: 999, duplicateFlag: false, attachmentCompleteness: { complete: true, missingRequiredClasses: [] } });
  await Promise.all([first, second]);
  expect(workspace.isSubmittingCandidate.value).toBe(false);
  expect(workspace.lastCandidateId.value).toBe(999);
});

test("candidate submit/upload ignores duplicate clicks and posts once", async () => {
  const workspace = useHrWorkspace();
  workspace.candidateForm.value.fullName = "Upload Race";
  workspace.candidateForm.value.dob = "1990-01-01";
  workspace.candidateForm.value.ssnLast4 = "3333";
  workspace.candidateForm.value.formData = [{ fieldKey: "work_eligibility", fieldValue: "yes" }];
  workspace.onCandidateFileChange({ target: { files: [new File(["doc"], "resume.pdf", { type: "application/pdf" })] } });

  let release;
  apiRequestMock.mockImplementationOnce(() => new Promise((resolve) => {
    release = resolve;
  }));
  apiFormRequestMock.mockResolvedValueOnce({ id: "doc-11", classification: "RESUME" });

  const first = workspace.submitCandidate();
  const second = workspace.submitCandidate();

  expect(apiRequestMock).toHaveBeenCalledTimes(1);
  release({
    id: 111,
    duplicateFlag: false,
    attachmentCompleteness: { complete: true, missingRequiredClasses: [] },
    uploadToken: "upload-111"
  });
  await Promise.all([first, second]);

  expect(apiRequestMock).toHaveBeenCalledTimes(1);
  expect(apiFormRequestMock).toHaveBeenCalledTimes(1);
  expect(workspace.isSubmittingCandidate.value).toBe(false);
});
