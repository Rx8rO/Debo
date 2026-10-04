import {
  ChannelMessageCreatedEvent,
  ChannelMessageEvent,
  MessageType,
  rootServer,
} from "@rootsdk/server-bot";
import { checkModeratorRole } from "./moderation/access";
import { banMember } from "./moderation/commands/ban";
import { showModerationHelp } from "./moderation/commands/help";
import { kickMember } from "./moderation/commands/kick";
import { purgeMessages } from "./moderation/commands/purge";
import { changeMemberRole } from "./moderation/commands/role";
import { setLogChannel } from "./moderation/commands/set-log-channel";
import { manageWarning } from "./moderation/commands/warn";
import { showWarnings } from "./moderation/commands/warnings";
import { describeError, reply } from "./moderation/common";
import { parseCommand } from "./moderation/parser";
import { CommandContext, ModerationCommand } from "./moderation/types";

const commands = new Map<string, ModerationCommand>([
  ["ban", (context, args) => banMember(context.event, args)],
  ["kick", (context, args) => kickMember(context.event, args)],
  ["modhelp", (context) => showModerationHelp(context.event)],
  ["purge", (context, args) => purgeMessages(context.event, args)],
  ["role", (context, args) => changeMemberRole(context.event, args)],
  ["setlogchannel", (context, args) => setLogChannel(context.event, args)],
  ["warn", (context, args) => manageWarning(context.event, args)],
  ["warnings", (context, args) => showWarnings(context.event, args)],
]);

export function initializeModerationBot(): void {
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
  if (parsed.name !== "modhelp") {
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
