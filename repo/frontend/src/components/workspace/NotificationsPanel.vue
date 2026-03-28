<script setup>
defineProps({
  notifForm: {
    type: Object,
    required: true
  },
  onSubscribeNotifications: {
    type: Function,
    required: true
  },
  notificationQuery: {
    type: Object,
    required: true
  },
  notificationPage: {
    type: Object,
    default: () => ({ page: 1, pageSize: 20, total: 0, data: [] })
  },
  notificationStatus: {
    type: String,
    default: ""
  },
  onLoadNotifications: {
    type: Function,
    required: true
  }
});
</script>

<template>
  <article class="card form-grid">
    <h3>Notifications</h3>
    <select v-model="notifForm.topic">
      <option value="TICKET_UPDATE">Ticket updates</option>
      <option value="REVIEW_OUTCOME">Review outcomes</option>
      <option value="ADOPTION_FOLLOWUP">Adoption follow-ups</option>
      <option value="RECEIPT_ACK">Receipt acknowledgments</option>
    </select>
    <select v-model="notifForm.frequency">
      <option value="IMMEDIATE">Immediate</option>
      <option value="HOURLY">Hourly digest</option>
      <option value="DAILY">Daily 6 PM</option>
    </select>
    <input v-model="notifForm.dndStart" type="time" placeholder="DND start" />
    <input v-model="notifForm.dndEnd" type="time" placeholder="DND end" />
    <button @click="onSubscribeNotifications">Save subscription</button>

    <h3>Notification inbox</h3>
    <select v-model="notificationQuery.status">
      <option value="">All statuses</option>
      <option value="PENDING">Pending</option>
      <option value="DELIVERED">Delivered</option>
    </select>
    <input v-model="notificationQuery.eventType" placeholder="Event type" />
    <input v-model.number="notificationQuery.page" type="number" min="1" placeholder="Page" />
    <input v-model.number="notificationQuery.pageSize" type="number" min="1" max="100" placeholder="Page size" />
    <button @click="onLoadNotifications">Load notifications</button>
    <p v-if="notificationStatus">{{ notificationStatus }}</p>
    <p>Total: {{ notificationPage.total }}</p>
    <pre>{{ notificationPage.data }}</pre>
  </article>
</template>
