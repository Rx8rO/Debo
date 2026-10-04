import {
  ChannelMessageCreatedEvent,
  rootServer,
} from "@rootsdk/server-bot";
import {
  getCommunityMemberName,
  reply,
  replyUnlessInChannel,
  rootUserMention,
} from "../common";
import { postTextToLogChannel } from "../logging";
import { getLogChannelId } from "../storage";

const HELP_TEXT = [
  "**Debo commands**",
  "!rank — show your level, total XP, progress, and rank in this community.",
  "!rank @user — show another member's level, XP, progress, and community rank.",
  "!levelconfig [xp|cooldown|rolelevel] [value] — view or update leveling values (Admin Role only).",
  "!spamconfig [limit|window|timeout] [value] — view or update spam controls (Admin Role only).",
  "!kick @user [reason] — remove a member without banning them; reason is optional.",
  "!ban @user reason — permanently ban a member; reason is required.",
  "!unban userID — unban the active ban for a Root user ID (parentheses are optional).",
  "!bans — list currently banned users, user IDs, reasons, and ban dates when available.",
  "!purge count — delete up to 100 recent messages before this command.",
  "!purge @user count — delete up to 100 messages by that member, scanning older history as needed.",
  "!warn @user reason — save a dated warning; reason is required.",
  "!warnings — show warning totals; !warnings @user — show that member's warning history.",
  "!warn remove @user number — remove the numbered warning shown in the history.",
  "!role add @user role-name-or-mention — add a role.",
  "!role remove @user role-name-or-mention — remove a role.",
  "!roles — list all community roles and their Root IDs in the mod channel.",
  "!setmodchannel — set this channel for moderation logs and reports.",
  "!setmodchannel clear — remove this community's configured mod channel.",
  "!help — show this command list.",
].join("\n");

export async function showModerationHelp(
  event: ChannelMessageCreatedEvent,
): Promise<void> {
  const requesterName = await getCommunityMemberName(event.userId);
  const requester = rootUserMention(event.userId, requesterName);
  const modChannelId = await getLogChannelId();

  if (modChannelId) {
    try {
      const channel = await rootServer.community.channels.get({
        id: modChannelId,
      });
      if (channel.channelPermission.channelCreateMessage) {
        await postTextToLogChannel(
          modChannelId,
          `Help requested by ${requester}\n\n${HELP_TEXT}`,
        );
        await replyUnlessInChannel(
          event,
          modChannelId,
          "I posted the command list in the mod channel.",
        );
        return;
      }
    } catch (error: unknown) {
      console.error("Could not send the help list to the mod channel:", error);
    }
  }

  await reply(
    event,
    `I could not access a configured mod channel, so here is the command list instead.\n\n${HELP_TEXT}`,
  );
}
