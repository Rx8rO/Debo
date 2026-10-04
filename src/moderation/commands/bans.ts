import {
  ChannelMessageCreatedEvent,
  CommunityMemberBan,
  rootServer,
} from "@rootsdk/server-bot";
import {
  getCommunityMemberName,
  reply,
  replyUnlessInChannel,
  rootUserMention,
  safeInlineText,
} from "../common";
import { getLogChannelOrReply, postTextToLogChannel } from "../logging";
import { getBanArchive, StoredBan } from "../storage";
import { CommandToken } from "../types";

export async function showBans(
  event: ChannelMessageCreatedEvent,
  args: CommandToken[],
): Promise<void> {
  if (args.length !== 0) {
    await reply(event, "Usage: !bans.");
    return;
  }

  const modChannelId = await getLogChannelOrReply(event);
  if (!modChannelId) return;

  const [activeBans, archive] = await Promise.all([
    rootServer.community.communityMemberBans.list(),
    getBanArchive(),
  ]);
  const requesterName = await getCommunityMemberName(event.userId);
  const content = [
    `Requested by ${rootUserMention(event.userId, requesterName)}`,
    formatBanList(activeBans, archive),
  ].join("\n\n");

  // Ban information stays in the mod channel; a confirmation is only needed
  // when the command was issued elsewhere.
  await postTextToLogChannel(modChannelId, content);
  await replyUnlessInChannel(
    event,
    modChannelId,
    "I posted the active ban list in the mod channel.",
  );
}

function formatBanList(
  activeBans: CommunityMemberBan[],
  archive: Record<string, StoredBan>,
): string {
  if (activeBans.length === 0) {
    return "**Active bans**\nNo users are currently banned.";
  }

  const entries = activeBans
    .map((ban) => {
      const stored = archive[ban.id];
      return {
        ban,
        stored,
        sortTime: stored ? Date.parse(stored.issuedAt) : 0,
      };
    })
    .sort((left, right) => right.sortTime - left.sortTime);

  const lines = entries.flatMap(({ ban, stored }, index) => {
    const targetName = safeInlineText(stored?.targetName || String(ban.userId), 100);
    const issuedAt = stored
      ? formatDate(stored.issuedAt)
      : "Unavailable (ban date not recorded by Debo)";
    const reason = safeInlineText(
      ban.reason || stored?.reason || "Not provided",
      600,
    );
    const moderatorId = stored?.moderatorId || ban.agentUserId;
    const details = [
      `${index + 1}. **${targetName}**`,
      `   User ID: ${ban.userId}`,
      `   Banned: ${issuedAt}`,
      `   Reason: ${reason}`,
      `   Banned by: ${moderatorId}`,
    ];
    if (ban.expiresAt) {
      details.push(`   Expires: ${formatDate(ban.expiresAt)}`);
    }
    return details;
  });

  return [
    `**Active bans (${activeBans.length})**`,
    ...lines,
    "Date note: Root does not expose the creation date for older or untracked bans; Debo records dates for bans created while tracking is active.",
  ].join("\n");
}

function formatDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";

  return `${new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date)} UTC`;
}
