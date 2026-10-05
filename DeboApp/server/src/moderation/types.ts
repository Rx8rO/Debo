import type { ChannelMessageCreatedEvent } from "@rootsdk/server-app";

export type MentionEntity = "user" | "role" | "channel";

export type MentionToken = {
  kind: "mention";
  entity: MentionEntity;
  id: string;
  label: string;
};

export type CommandToken = string | MentionToken;

export type ParsedCommand = {
  name: string;
  args: CommandToken[];
};

export type CommandContext = {
  event: ChannelMessageCreatedEvent;
};

export type ModerationCommand = (
  context: CommandContext,
  args: CommandToken[],
) => Promise<void>;
