<script setup>
defineProps({
  candidateForm: {
    type: Object,
    required: true
  },
  appFormFields: {
    type: Array,
    default: () => []
  },
  lastCandidateId: {
    type: [String, Number],
    default: ""
  },
  candidateUploadStatus: {
    type: String,
    default: ""
  },
  isSubmittingCandidate: {
    type: Boolean,
    default: false
  },
  candidateOutcome: {
    type: Object,
    default: () => ({
      duplicateFlag: false,
      duplicateDetails: "",
      completeness: null,
      classification: ""
    })
  },
  onCandidateFileChange: {
    type: Function,
    required: true
  },
  onSubmitCandidate: {
    type: Function,
    required: true
  },
  getFormEntry: {
    type: Function,
    required: true
  }
});
</script>

<template>
  <article class="card form-grid">
    <h3>Candidate application</h3>
    <input v-model="candidateForm.fullName" placeholder="Full name" />
    <input v-model="candidateForm.email" placeholder="Email" />
    <input v-model="candidateForm.phone" placeholder="Phone" />
    <input v-model="candidateForm.dob" type="date" />
    <input v-model="candidateForm.ssnLast4" placeholder="SSN last 4" maxlength="4" />
    <input type="file" accept=".pdf,.jpg,.jpeg,.png" @change="onCandidateFileChange" />
    <div v-for="field in appFormFields" :key="field.field_key">
      <input
        v-model="getFormEntry(field.field_key).fieldValue"
        :placeholder="`${field.label}${field.is_required ? ' *' : ''}`"
      />
    </div>
    <button :disabled="isSubmittingCandidate" @click="onSubmitCandidate">
      {{ isSubmittingCandidate ? "Submitting..." : "Submit application" }}
    </button>
    <p v-if="lastCandidateId">Application ID: {{ lastCandidateId }}</p>
    <p v-if="candidateOutcome.duplicateDetails">{{ candidateOutcome.duplicateDetails }}</p>
    <p v-if="candidateOutcome.completeness">
      Completeness: {{ candidateOutcome.completeness.complete ? "Complete" : "Incomplete" }}
    </p>
    <p
      v-if="candidateOutcome.completeness && candidateOutcome.completeness.missingRequiredClasses?.length"
    >
      Missing required: {{ candidateOutcome.completeness.missingRequiredClasses.join(", ") }}
    </p>
    <p v-if="candidateOutcome.classification">{{ candidateOutcome.classification }}</p>
    <p v-if="candidateUploadStatus">{{ candidateUploadStatus }}</p>
  </article>
</template>
