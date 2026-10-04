import { rootServer, RootBotStartState } from "@rootsdk/server-bot";
import { initializeAutomationBot } from "./automation";
import { initializeModerationBot } from "./moderation";

async function onStarting(state: RootBotStartState): Promise<void> {
  initializeModerationBot();
  initializeAutomationBot(state.communityId);
}

(async () => {
  await rootServer.lifecycle.start(onStarting);
})();
