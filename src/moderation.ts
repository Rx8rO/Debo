import {
  ChannelMessageCreatedEvent,
  ChannelMessageEvent,
  MessageType,
  rootServer,
} from "@rootsdk/server-bot";
import { checkModeratorRole } from "./moderation/access";
import { initializeBanTracking } from "./moderation/ban-tracking";
import { initializeVoiceTracking } from "./moderation/voice-tracking";
import { banMember } from "./moderation/commands/ban";
import { showBans } from "./moderation/commands/bans";
import { showModerationHelp } from "./moderation/commands/help";
import { kickMember } from "./moderation/commands/kick";
import { kickVoiceMember } from "./moderation/commands/kick-vc";
import { purgeMessages } from "./moderation/commands/purge";
import { changeMemberRole } from "./moderation/commands/role";
import { showRoles } from "./moderation/commands/roles";
import { setModChannel } from "./moderation/commands/set-log-channel";
import { unbanMember } from "./moderation/commands/unban";
import { manageWarning } from "./moderation/commands/warn";
import { showWarnings } from "./moderation/commands/warnings";
import { describeError, reply } from "./moderation/common";
import { parseCommand } from "./moderation/parser";
import { CommandContext, ModerationCommand } from "./moderation/types";

const commands = new Map<string, ModerationCommand>([
  ["ban", (context, args) => banMember(context.event, args)],
  ["bans", (context, args) => showBans(context.event, args)],
  [
    "kick",
    (context, args) => {
      if (typeof args[0] === "string" && args[0].toLowerCase() === "vc") {
        return kickVoiceMember(context.event, args.slice(1));
      }
      return kickMember(context.event, args);
    },
  ],
  ["help", (context) => showModerationHelp(context.event)],
  ["purge", (context, args) => purgeMessages(context.event, args)],
  ["role", (context, args) => changeMemberRole(context.event, args)],
  ["roles", (context, args) => showRoles(context.event, args)],
  ["setmodchannel", (context, args) => setModChannel(context.event, args)],
  // Preserve the old command as an alias so existing moderators aren't caught out.
  ["setlogchannel", (context, args) => setModChannel(context.event, args)],
  ["unban", (context, args) => unbanMember(context.event, args)],
  ["warn", (context, args) => manageWarning(context.event, args)],
  ["warnings", (context, args) => showWarnings(context.event, args)],
]);

export function initializeModerationBot(): void {
  initializeBanTracking();
  initializeVoiceTracking();
  rootServer.community.channelMessages.on(
    ChannelMessageEvent.ChannelMessageCreated,
    onMessage,
  );
}

async function onMessage(event: ChannelMessageCreatedEvent): Promise<void> {
  if (event.messageType !== MessageType.UserMessage) return;

  const parsed = parseCommand(event.messageContent);
  if (!parsed) return;

  const handler = commands.get(parsed.name);
  if (!handler) return;

  // Help is harmless and can be used while a community tests its setup.
  if (parsed.name !== "help") {
    const authorization = await checkModeratorRole(event.userId);
    if (!authorization.allowed) {
      const message =
        authorization.reason === "not-configured"
          ? "Moderation is not configured yet. Choose an Admin Role in Debo's Global Settings first."
          : "You do not have the configured Admin Role, so Debo did not run that command.";
      await reply(event, message);
      return;
    }
  }

  try {
    const context: CommandContext = { event };
    await handler(context, parsed.args);
  } catch (error: unknown) {
    console.error(`Moderation command !${parsed.name} failed:`, error);
    await reply(
      event,
      `!${parsed.name} could not be completed: ${describeError(error)}. Check the command format and Debo's Root permissions.`,
    );
  }
}
