<script setup>
defineProps({
  auditQuery: {
    type: Object,
    required: true
  },
  auditPage: {
    type: Object,
    default: () => ({ page: 1, pageSize: 20, total: 0, data: [] })
  },
  auditStatus: {
    type: String,
    default: ""
  },
  onLoadAudit: {
    type: Function,
    required: true
  }
});
</script>

<template>
  <article class="card form-grid">
    <h3>Audit trail</h3>
    <input v-model="auditQuery.action" placeholder="Action (CREATE/UPDATE/APPROVE)" />
    <input v-model="auditQuery.entityType" placeholder="Entity type" />
    <input v-model.number="auditQuery.actorUserId" type="number" placeholder="Actor user ID" />
    <input v-model.number="auditQuery.page" type="number" min="1" placeholder="Page" />
    <input v-model.number="auditQuery.pageSize" type="number" min="1" max="100" placeholder="Page size" />
    <button @click="onLoadAudit">Load audit logs</button>
    <p v-if="auditStatus">{{ auditStatus }}</p>
    <p>Total: {{ auditPage.total }}</p>
    <pre>{{ auditPage.data }}</pre>
  </article>
</template>
