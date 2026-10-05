import {
  ChannelMessageCreatedEvent,
  ChannelMessageEvent,
  MessageType,
  rootServer,
} from "@rootsdk/server-app";
import { checkModeratorRole, checkOwner } from "./moderation/access";
import { initializeBanTracking } from "./moderation/ban-tracking";
import { banMember } from "./moderation/commands/ban";
import { showBans } from "./moderation/commands/bans";
import {
  showModeratorHelp,
  showPublicHelp,
} from "./moderation/commands/help";
import { kickMember } from "./moderation/commands/kick";
import { purgeMessages } from "./moderation/commands/purge";
import { changeMemberRole } from "./moderation/commands/role";
import { showRoles } from "./moderation/commands/roles";
import { setLogChannel } from "./moderation/commands/set-log-channel";
import { setModChannel } from "./moderation/commands/set-mod-channel";
import { unbanMember } from "./moderation/commands/unban";
import { manageWarning } from "./moderation/commands/warn";
import { showWarnings } from "./moderation/commands/warnings";
import { describeError, reply } from "./moderation/common";
import { parseCommand } from "./moderation/parser";
import { CommandContext, ModerationCommand } from "./moderation/types";

const OWNER_ONLY_COMMANDS = new Set([
  "ban",
  "unban",
  "setmodchannel",
  "setlogchannel",
]);

const commands = new Map<string, ModerationCommand>([
  ["ban", (context, args) => banMember(context.event, args)],
  ["bans", (context, args) => showBans(context.event, args)],
  ["kick", (context, args) => kickMember(context.event, args)],
  ["help", (context) => showPublicHelp(context.event)],
  ["modhelp", (context) => showModeratorHelp(context.event)],
  ["purge", (context, args) => purgeMessages(context.event, args)],
  ["role", (context, args) => changeMemberRole(context.event, args)],
  ["roles", (context, args) => showRoles(context.event, args)],
  ["setmodchannel", (context, args) => setModChannel(context.event, args)],
  ["setlogchannel", (context, args) => setLogChannel(context.event, args)],
  ["unban", (context, args) => unbanMember(context.event, args)],
  ["warn", (context, args) => manageWarning(context.event, args)],
  ["warnings", (context, args) => showWarnings(context.event, args)],
]);

export function initializeModerationBot(): void {
  initializeBanTracking();
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

  // Public help is open to everyone. Owner-only actions bypass the Admin Role
  // check but fail closed unless the single Owner member is configured.
  if (parsed.name !== "help") {
    const ownerOnly = OWNER_ONLY_COMMANDS.has(parsed.name);
    const authorization = ownerOnly
      ? await checkOwner(event.userId)
      : await checkModeratorRole(event.userId);
    if (!authorization.allowed) {
      await reply(
        event,
        ownerOnly ? "You are not the owner meow 🐾" : "You are not an admin meow 🐾",
        5_000,
      );
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
