import {
  ChannelMessageCreatedEvent,
  UserGuid,
  rootServer,
} from "@rootsdk/server-bot";
import {
  getCommunityMemberName,
  reply,
  safeInlineText,
} from "../common";
import { getLogChannelOrReply, logActionAndReply } from "../logging";
import { getBanArchive, removeBanRecord } from "../storage";
import { CommandToken } from "../types";

export async function unbanMember(
  event: ChannelMessageCreatedEvent,
  args: CommandToken[],
): Promise<void> {
  const userId = parseUserId(args);
  if (!userId) {
    await reply(event, "Usage: !unban userID. You may wrap the Root user ID in parentheses.");
    return;
  }

  const modChannelId = await getLogChannelOrReply(event);
  if (!modChannelId) return;

  const activeBans = await rootServer.community.communityMemberBans.list();
  const activeBan = activeBans.find((ban) => ban.userId === userId);
  if (!activeBan) {
    await reply(event, `There is no active ban for user ID ${userId}.`);
    return;
  }

  const archive = await getBanArchive();
  const stored = archive[activeBan.id];
  const targetName =
    stored?.targetName || (await getCommunityMemberName(activeBan.userId));
  const safeTargetName = safeInlineText(targetName, 100);

  await rootServer.community.communityMemberBans.delete({ userId });

  try {
    await removeBanRecord(activeBan.id);
  } catch (error: unknown) {
    // Root's active ban list is authoritative, so the successful unban still
    // disappears from !bans even if this auxiliary metadata cleanup fails.
    console.warn("The unban succeeded, but Debo could not clear stored ban metadata:", error);
  }

  const originalReason =
    activeBan.reason || stored?.reason || "No reason was recorded";
  await logActionAndReply(
    event,
    modChannelId,
    {
      action: "Member unbanned",
      targetUserId: userId,
      targetName,
      details: `Original ban reason: ${originalReason}`,
    },
    `Unbanned ${safeTargetName} (user ID: ${userId}).`,
  );
}

function parseUserId(args: CommandToken[]): UserGuid | undefined {
  if (args.length !== 1 || typeof args[0] !== "string") return undefined;

  const userId = args[0]
    .trim()
    .replace(/^\(/, "")
    .replace(/\)$/, "");
  if (!userId || userId.length > 128 || /[\s()[\]<>]/.test(userId)) {
    return undefined;
  }

  return userId as UserGuid;
}
