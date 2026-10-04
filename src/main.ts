import { rootServer, RootBotStartState } from "@rootsdk/server-bot";
import { initializeWelcomeBot } from "./example";

async function onStarting(state: RootBotStartState): Promise<void> {
  initializeWelcomeBot();
}

(async () => {
  await rootServer.lifecycle.start(onStarting);
})();
