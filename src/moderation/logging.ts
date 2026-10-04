import {
  ChannelGuid,
  ChannelMessageCreatedEvent,
  rootServer,
  UserGuid,
} from "@rootsdk/server-bot";
import { reply, safeInlineText } from "./common";
import { getLogChannelId } from "./storage";

export type ModerationLogEntry = {
  action: string;
  targetUserId: UserGuid;
  targetName: string;
  reason?: string;
  details?: string;
};

export async function getLogChannelOrReply(
  event: ChannelMessageCreatedEvent,
): Promise<ChannelGuid | undefined> {
  const channelId = await getLogChannelId();

  if (!channelId) {
    await reply(
      event,
      "The moderation log channel is not set. Run !setlogchannel in the channel you want to use.",
    );
    return undefined;
  }

  try {
    const channel = await rootServer.community.channels.get({ id: channelId });
    if (!channel.channelPermission.channelCreateMessage) {
      await reply(
        event,
        "Debo cannot post in the configured moderation log channel. Give Debo access to send messages there, then run !setlogchannel again.",
      );
      return undefined;
    }
    return channelId;
  } catch (error: unknown) {
    console.error("The configured moderation log channel is unavailable:", error);
    await reply(
      event,
      "I cannot access the configured moderation log channel. Run !setlogchannel again in a channel Debo can access, and make sure Debo can post there.",
    );
    return undefined;
  }
}

export async function sendModerationLog(
  channelId: ChannelGuid,
  event: ChannelMessageCreatedEvent,
  entry: ModerationLogEntry,
): Promise<void> {
  let moderatorName = String(event.userId);
  try {
    const moderator = await rootServer.community.communityMembers.get({
      userId: event.userId,
    });
    moderatorName = moderator.nickname || moderatorName;
  } catch {
    // IDs are still enough to identify the actor if their profile is unavailable.
  }

  const lines = [
    `**${safeInlineText(entry.action, 80)}**`,
    `Target: ${safeInlineText(entry.targetName, 100)} (${entry.targetUserId})`,
    `Moderator: ${safeInlineText(moderatorName, 100)} (${event.userId})`,
  ];

  if (entry.details) {
    lines.push(`Details: ${safeInlineText(entry.details, 300)}`);
  }

  if (entry.reason !== undefined) {
    lines.push(`Reason: ${safeInlineText(entry.reason || "Not provided", 700)}`);
  }

  lines.push(`Time: ${new Date().toISOString()}`);

  await rootServer.community.channelMessages.create({
    channelId,
    content: lines.join("\n"),
  });
}

export async function logActionAndReply(
  event: ChannelMessageCreatedEvent,
  channelId: ChannelGuid,
  entry: ModerationLogEntry,
  successMessage: string,
): Promise<void> {
  try {
    await sendModerationLog(channelId, event, entry);
    await reply(event, successMessage);
  } catch (error: unknown) {
    console.error("The moderation action succeeded, but its log could not be sent:", error);
    await reply(
      event,
      `${successMessage} Warning: I could not post the log. Check Debo's access to the configured log channel.`,
    );
  }
}

export async function postTextToLogChannel(
  channelId: ChannelGuid,
  content: string,
): Promise<void> {
  const chunks = splitIntoChunks(content, 1700);

  for (let index = 0; index < chunks.length; index += 1) {
    await rootServer.community.channelMessages.create({
      channelId,
      content: chunks[index],
    });

    if (index < chunks.length - 1) {
      // Root's approximate channel-message command limit is five requests/sec.
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

function splitIntoChunks(content: string, maximumLength: number): string[] {
  if (content.length <= maximumLength) return [content];

  const chunks: string[] = [];
  let current = "";

  for (const line of content.split("\n")) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length <= maximumLength) {
      current = candidate;
      continue;
    }

    if (current) chunks.push(current);

    if (line.length > maximumLength) {
      for (let start = 0; start < line.length; start += maximumLength) {
        chunks.push(line.slice(start, start + maximumLength));
      }
      current = "";
    } else {
      current = line;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}
