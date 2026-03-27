import app from "./app.js";
import { config } from "./config.js";
import { processPendingNotifications, retryFailedMessages } from "./services/notification-service.js";

app.listen(config.port, () => {
  console.log(`ForgeOps backend running on :${config.port}`);
});

setInterval(async () => {
  try {
    await processPendingNotifications();
    await retryFailedMessages();
  } catch (err) {
    console.error("Scheduler tick failed", err.message);
  }
}, 60 * 1000);
