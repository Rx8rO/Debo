import { ChannelMessageCreatedEvent } from "@rootsdk/server-bot";
import { getMentionedUser } from "../command-helpers";
import { reply, safeInlineText } from "../common";
import { getLogChannelOrReply, postTextToLogChannel } from "../logging";
import { getWarningArchive, StoredWarning } from "../storage";
import { CommandToken } from "../types";

export async function showWarnings(
  event: ChannelMessageCreatedEvent,
  args: CommandToken[],
): Promise<void> {
  if (args.length > 1) {
    await reply(event, "Usage: !warnings, or !warnings @user.");
    return;
  }

  const target = args.length === 1 ? getMentionedUser(event, args[0]) : undefined;
  if (args.length === 1 && !target) {
    await reply(event, "Usage: !warnings @user. Mention one member.");
    return;
  }

  const logChannelId = await getLogChannelOrReply(event);
  if (!logChannelId) return;

  const archive = await getWarningArchive();
  const content = target
    ? formatUserWarnings(target.displayName, archive[target.userId] ?? [])
    : formatWarningTotals(archive);

  await postTextToLogChannel(logChannelId, content);
  await reply(event, "Warning information was posted in the configured moderation log channel.");
}

function formatUserWarnings(name: string, warnings: StoredWarning[]): string {
  if (warnings.length === 0) {
    return `**Warnings for ${safeInlineText(name, 100)}**\nNo warnings are recorded.`;
  }

  const lines = warnings.map((warning, index) => {
    const date = formatDate(warning.issuedAt);
    return `${index + 1}. ${date} — ${safeInlineText(warning.reason, 600)} (by ${warning.moderatorId})`;
  });

  return [
    `**Warnings for ${safeInlineText(name, 100)} (${warnings.length})**`,
    ...lines,
  ].join("\n");
}

function formatWarningTotals(archive: Record<string, StoredWarning[]>): string {
  const entries = Object.entries(archive)
    .filter(([, warnings]) => warnings.length > 0)
    .map(([userId, warnings]) => ({
      userId,
      warnings,
      name: warnings[warnings.length - 1]?.targetName || userId,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  if (entries.length === 0) {
    return "**Warning totals**\nNo warnings are recorded.";
  }

  return [
    `**Warning totals for ${entries.length} member${entries.length === 1 ? "" : "s"}**`,
    ...entries.map(
      ({ userId, warnings, name }) =>
        `- ${safeInlineText(name, 100)} (${userId}): ${warnings.length}`,
    ),
  ].join("\n");
}

function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return safeInlineText(isoDate, 50);

  return `${new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date)} UTC`;
}
