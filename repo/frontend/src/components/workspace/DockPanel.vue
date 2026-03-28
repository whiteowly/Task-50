<script setup>
defineProps({
  dockForm: {
    type: Object,
    required: true
  },
  onSubmitDock: {
    type: Function,
    required: true
  },
  dockStatus: {
    type: String,
    default: ""
  },
  isSubmittingDock: {
    type: Boolean,
    default: false
  }
});
</script>

<template>
  <article class="card form-grid">
    <h3>Dock scheduling (30 minutes)</h3>
    <input v-model="dockForm.siteId" placeholder="Site ID" />
    <input v-model="dockForm.poNumber" placeholder="PO Number" />
    <label>
      Start time
      <input v-model="dockForm.startAt" type="datetime-local" />
    </label>
    <label>
      End time
      <input v-model="dockForm.endAt" type="datetime-local" />
    </label>
    <textarea v-model="dockForm.notes" placeholder="Notes" />
    <button :disabled="isSubmittingDock" @click="onSubmitDock">
      {{ isSubmittingDock ? "Saving..." : "Save appointment" }}
    </button>
    <p v-if="dockStatus">{{ dockStatus }}</p>
  </article>
</template>
