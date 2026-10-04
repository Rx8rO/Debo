import { rootServer, RootBotStartState } from "@rootsdk/server-bot";
import { initializeModerationBot } from "./moderation";

async function onStarting(_state: RootBotStartState): Promise<void> {
  initializeModerationBot();
}

(async () => {
  await rootServer.lifecycle.start(onStarting);
})();
