import {
  ChannelMessageCreatedEvent,
  ErrorCodeType,
  RootApiException,
  rootServer,
  UserGuid,
} from "@rootsdk/server-bot";
import { CommandToken, MentionToken } from "./types";

export type MentionedUser = {
  userId: UserGuid;
  displayName: string;
};

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

export async function reply(
  event: ChannelMessageCreatedEvent,
  content: string,
): Promise<void> {
  try {
    await rootServer.community.channelMessages.create({
      channelId: event.channelId,
      content,
    });
  } catch (error: unknown) {
    console.error("Could not send a moderation command reply:", error);
  }
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
