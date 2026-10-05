import { rootServer, RootAppStartState } from "@rootsdk/server-app";
import { initializeAutomationBot } from "./automation";
import { DeboDashboardService } from "./dashboardService";
import { initializeModerationBot } from "./moderation";

rootServer.lifecycle.addService(new DeboDashboardService());

async function onStarting(state: RootAppStartState): Promise<void> {
  initializeModerationBot();
  initializeAutomationBot(state.communityId);
}

(async () => {
  await rootServer.lifecycle.start(onStarting);
})();
