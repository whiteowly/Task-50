import { ref } from "vue";
import { apiFormRequest, apiRequest } from "../api.js";

export function useHrWorkspace() {
  const candidateForm = ref({ fullName: "", email: "", phone: "", dob: "", ssnLast4: "", source: "PORTAL", formData: [] });
  const appFormFields = ref([]);
  const candidateAttachment = ref(null);
  const lastCandidateId = ref("");
  const candidateUploadStatus = ref("");
  const candidateOutcome = ref({
    duplicateFlag: false,
    duplicateDetails: "",
    completeness: null,
    classification: ""
  });
  const scoreForm = ref({ candidateId: "", ruleVersionId: "", courseworkScores: [0], midtermScores: [0], finalScores: [0], creditHours: 3 });
  const interviewerReviewForm = ref({ candidateId: "" });
  const interviewerReviewResult = ref(null);
  const interviewerReviewStatus = ref("");
  const isSubmittingCandidate = ref(false);

  function inferAttachmentClassification(fileName) {
    const normalized = String(fileName || "").toLowerCase();
    if (normalized.includes("resume")) return "RESUME";
    if (normalized.includes("id") || normalized.includes("license")) return "IDENTITY_DOC";
    if (normalized.includes("cert")) return "CERTIFICATION";
    return "OTHER";
  }

  function readBackendClassification(payload) {
    if (!payload || typeof payload !== "object") return null;
    const candidates = [
      payload.classification,
      payload.attachmentClassification,
      payload.attachment_classification,
      payload.metadata?.classification,
      payload.attachmentCompleteness?.classification,
      payload.attachmentCompleteness?.uploadedClassification,
      payload.attachmentCompleteness?.detectedClassification
    ];
    const found = candidates.find((item) => typeof item === "string" && item.trim().length > 0);
    return found ? found.trim() : null;
  }

  function formatCompletenessStatus(completeness) {
    const missing = Array.isArray(completeness?.missingRequiredClasses)
      ? completeness.missingRequiredClasses
      : [];
    if (missing.length) {
      return `Missing required attachments: ${missing.join(", ")}.`;
    }
    if (completeness?.complete === true) {
      return "Required attachments complete.";
    }
    return "Attachment completeness pending.";
  }

  function setApplicationFormFields(fields) {
    appFormFields.value = fields;
    candidateForm.value.formData = fields.map((field) => ({ fieldKey: field.field_key, fieldValue: "" }));
  }

  async function submitCandidate() {
    if (isSubmittingCandidate.value) return;
    isSubmittingCandidate.value = true;
    candidateUploadStatus.value = "";
    candidateOutcome.value = {
      duplicateFlag: false,
      duplicateDetails: "",
      completeness: null,
      classification: ""
    };
    try {
      const created = await apiRequest("/hr/applications", { method: "POST", body: JSON.stringify(candidateForm.value) });
      lastCandidateId.value = created.id;

      const duplicateFlag = Boolean(created?.duplicateFlag);
      const completeness = created?.attachmentCompleteness && typeof created.attachmentCompleteness === "object"
        ? created.attachmentCompleteness
        : null;
      candidateOutcome.value = {
        duplicateFlag,
        duplicateDetails: duplicateFlag ? "Potential duplicate candidate detected." : "No duplicate detected.",
        completeness,
        classification: candidateAttachment.value ? "Attachment selected for upload." : "No attachment selected."
      };

      if (!candidateAttachment.value) {
        candidateUploadStatus.value = `Application submitted. No attachment uploaded. ${candidateOutcome.value.duplicateDetails} ${formatCompletenessStatus(completeness)}`;
        return;
      }

      const formData = new FormData();
      formData.append("file", candidateAttachment.value);
      const headers = {};
      if (created.uploadToken) headers["x-candidate-upload-token"] = created.uploadToken;

      try {
        const attachmentResult = await apiFormRequest(`/hr/applications/${created.id}/attachments`, formData, { headers });
        const completenessFromResponse = attachmentResult?.attachmentCompleteness && typeof attachmentResult.attachmentCompleteness === "object"
          ? attachmentResult.attachmentCompleteness
          : completeness;
        candidateOutcome.value.completeness = completenessFromResponse;

        const backendClass = readBackendClassification(attachmentResult);
        if (backendClass) {
          candidateOutcome.value.classification = `Attachment classification (authoritative): ${backendClass}.`;
        } else {
          const fallbackClass = inferAttachmentClassification(candidateAttachment.value?.name || "");
          candidateOutcome.value.classification = `Attachment classification (fallback): ${fallbackClass}.`;
        }

        const missing = Array.isArray(completenessFromResponse?.missingRequiredClasses)
          ? completenessFromResponse.missingRequiredClasses
          : [];
        candidateUploadStatus.value = missing.length
          ? `Application submitted. Attachment uploaded. Remaining required items: ${missing.join(", ")}. ${candidateOutcome.value.duplicateDetails} ${candidateOutcome.value.classification}`
          : `Application and attachment uploaded successfully. ${candidateOutcome.value.duplicateDetails} ${candidateOutcome.value.classification}`;
      } catch (uploadErr) {
        candidateUploadStatus.value = `Application submitted, but attachment upload failed: ${uploadErr.message}`;
      }
    } catch (err) {
      candidateUploadStatus.value = `Application submission failed: ${err.message}`;
    } finally {
      isSubmittingCandidate.value = false;
    }
  }

  function getFormEntry(fieldKey) {
    const found = candidateForm.value.formData.find((item) => item.fieldKey === fieldKey);
    if (found) return found;
    const created = { fieldKey, fieldValue: "" };
    candidateForm.value.formData.push(created);
    return created;
  }

  function onCandidateFileChange(event) {
    candidateAttachment.value = event.target.files?.[0] || null;
  }

  async function computeScore() {
    await apiRequest("/rules/score", { method: "POST", body: JSON.stringify(scoreForm.value) });
  }

  async function loadInterviewerCandidate() {
    interviewerReviewStatus.value = "";
    interviewerReviewResult.value = null;
    if (!interviewerReviewForm.value.candidateId) {
      interviewerReviewStatus.value = "Candidate ID is required.";
      return;
    }
    try {
      interviewerReviewResult.value = await apiRequest(`/hr/candidates/${interviewerReviewForm.value.candidateId}`);
      interviewerReviewStatus.value = "Candidate loaded.";
    } catch (err) {
      interviewerReviewStatus.value = `Unable to load candidate: ${err.message}`;
    }
  }

  return {
    candidateForm,
    appFormFields,
    lastCandidateId,
    candidateUploadStatus,
    candidateOutcome,
    scoreForm,
    interviewerReviewForm,
    interviewerReviewResult,
    interviewerReviewStatus,
    isSubmittingCandidate,
    setApplicationFormFields,
    submitCandidate,
    getFormEntry,
    onCandidateFileChange,
    computeScore,
    loadInterviewerCandidate
  };
}
