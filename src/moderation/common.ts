import {
  ChannelGuid,
  ChannelMessage,
  ChannelMessageCreatedEvent,
  ErrorCodeType,
  MessageGuid,
  RootApiException,
  rootServer,
  UserGuid,
} from "@rootsdk/server-bot";
import { CommandToken, MentionToken } from "./types";

export type MentionedUser = {
  userId: UserGuid;
  displayName: string;
};

let deletionQueue: Promise<void> = Promise.resolve();

export function getMentionedUser(
  event: ChannelMessageCreatedEvent,
  token: CommandToken | undefined,
): MentionedUser | undefined {
  if (typeof token === "string" || !token || token.entity !== "user") {
    return undefined;
  }

  const mention = token as MentionToken;
  const reference = event.referenceMaps?.users?.find(
    (user) => user.userId === mention.id,
  );
  const displayName =
    reference?.name || mention.label.replace(/^@/, "") || mention.id;

  return {
    userId: mention.id as UserGuid,
    displayName,
  };
}

export function getRoleMention(
  token: CommandToken | undefined,
): { roleId: string; displayName: string } | undefined {
  if (typeof token === "string" || !token || token.entity !== "role") {
    return undefined;
  }

  return {
    roleId: token.id,
    displayName: token.label.replace(/^@/, ""),
  };
}

/** Send a visible reply connected to the user's command. */
export async function reply(
  event: ChannelMessageCreatedEvent,
  content: string,
  deleteAfterMs?: number,
): Promise<ChannelMessage | undefined> {
  try {
    const message = await rootServer.community.channelMessages.create({
      channelId: event.channelId,
      content,
      parentMessageIds: [event.id],
      needsParentMessageNotification: true,
    });

    if (deleteAfterMs !== undefined) {
      scheduleMessageDeletion(event.channelId, message.id, deleteAfterMs);
    }

    return message;
  } catch (replyError: unknown) {
    // If Root rejects the parent link, try to deliver the response as a normal
    // channel message so a command failure does not become invisible.
    try {
      const message = await rootServer.community.channelMessages.create({
        channelId: event.channelId,
        content,
      });

      if (deleteAfterMs !== undefined) {
        scheduleMessageDeletion(event.channelId, message.id, deleteAfterMs);
      }

      return message;
    } catch (error: unknown) {
      console.error("Could not send a moderation command reply:", replyError, error);
      return undefined;
    }
  }
}

export function scheduleMessageDeletion(
  channelId: ChannelGuid,
  messageId: MessageGuid,
  deleteAfterMs: number,
): void {
  setTimeout(() => {
    deletionQueue = deletionQueue
      .then(async () => {
        // Message deletion is a write; pace queued removals below Root's limit.
        await sleep(250);
        await rootServer.community.channelMessages.delete({
          channelId,
          id: messageId,
        });
      })
      .catch((error: unknown) => {
        console.warn("Could not auto-delete a temporary moderation message:", error);
      });
  }, deleteAfterMs);
}

export async function getCommunityMemberName(
  userId: UserGuid,
): Promise<string> {
  try {
    const member = await rootServer.community.communityMembers.get({ userId });
    return member.nickname || String(userId);
  } catch {
    return String(userId);
  }
}

/** Build a safe Root mention so the requester is visible in the log-channel report. */
export function rootUserMention(userId: UserGuid, name: string): string {
  const label =
    safeInlineText(name, 80)
      .replace(/[\[\]()`]/g, "")
      .replace(/^@+/, "")
      .trim() || String(userId);
  return `[@${label}](root://user/${userId})`;
}

export function describeError(error: unknown): string {
  if (error instanceof RootApiException) {
    const name = ErrorCodeType[error.errorCode];
    return `Root API ${name ?? "error"} (${error.errorCode})`;
  }

  if (error instanceof Error) {
    return error.message.slice(0, 250);
  }

  return "an unknown error";
}

export function safeInlineText(value: string, maxLength = 700): string {
  return value
    .replace(/\[[^\]]*\]\(root:\/\/[^)]+\)/gi, "[reference]")
    .replace(/root:\/\/(?:user|role|channel)\/[^\s)]+/gi, "[reference]")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .slice(0, maxLength);
}

export function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
