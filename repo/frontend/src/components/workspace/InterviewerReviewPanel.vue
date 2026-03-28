<script setup>
import { computed } from "vue";

const props = defineProps({
  reviewForm: {
    type: Object,
    required: true
  },
  reviewResult: {
    type: Object,
    default: null
  },
  reviewStatus: {
    type: String,
    default: ""
  },
  onLoadCandidate: {
    type: Function,
    required: true
  }
});

function formatSensitive(value) {
  if (value == null || value === "") return "Not available";
  const text = String(value);
  if (text.includes("*")) return text;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return "****-**-**";
  if (/^\d{4}$/.test(text)) return "****";
  return "****";
}

const displayCandidate = computed(() => {
  if (!props.reviewResult || typeof props.reviewResult !== "object") return null;
  return {
    id: props.reviewResult.id ?? "-",
    fullName: props.reviewResult.fullName || "-",
    email: props.reviewResult.email || "-",
    phone: props.reviewResult.phone || "-",
    dob: formatSensitive(props.reviewResult.dob),
    ssnLast4: formatSensitive(props.reviewResult.ssnLast4),
    duplicateFlag: Boolean(props.reviewResult.duplicateFlag),
    attachmentComplete: Boolean(props.reviewResult.attachmentCompleteness?.complete),
    missingAttachments: Array.isArray(props.reviewResult.attachmentCompleteness?.missingRequiredClasses)
      ? props.reviewResult.attachmentCompleteness.missingRequiredClasses
      : []
  };
});
</script>

<template>
  <article class="card form-grid">
    <h3>Assigned candidate review</h3>
    <input v-model="reviewForm.candidateId" placeholder="Candidate ID" />
    <button @click="onLoadCandidate">Load candidate</button>
    <p v-if="reviewStatus">{{ reviewStatus }}</p>
    <section v-if="displayCandidate" class="form-grid">
      <p>Candidate ID: {{ displayCandidate.id }}</p>
      <p>Name: {{ displayCandidate.fullName }}</p>
      <p>Email: {{ displayCandidate.email }}</p>
      <p>Phone: {{ displayCandidate.phone }}</p>
      <p>DOB: {{ displayCandidate.dob }}</p>
      <p>SSN last 4: {{ displayCandidate.ssnLast4 }}</p>
      <p>Duplicate flag: {{ displayCandidate.duplicateFlag ? "Yes" : "No" }}</p>
      <p>Attachment completeness: {{ displayCandidate.attachmentComplete ? "Complete" : "Incomplete" }}</p>
      <p v-if="displayCandidate.missingAttachments.length">
        Missing attachments: {{ displayCandidate.missingAttachments.join(", ") }}
      </p>
    </section>
  </article>
</template>
