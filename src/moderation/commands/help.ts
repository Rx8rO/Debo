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

const PUBLIC_HELP_TEXT = [
  "**Debo public commands**",
  "!rank — show your rank, level, and XP.",
  "!rank @user — show another member's rank, level, and XP.",
  "!ranks — show the top 5 members with their levels and XP.",
  "!ranks10 — show the top 10 members with their levels and XP.",
  "!level — show your level only.",
  "!level @user — show another member's level only.",
  "!help — show this public command list.",
].join("\n");

const ADMIN_COMMANDS = [
  "!modhelp — post the complete command list in the mod channel (Admin Role only).",
  "!levelconfig — show XP, cooldown, and reward settings.",
  "!levelconfig xp min max — set the random XP range.",
  "!levelconfig cooldown seconds — set the per-member XP cooldown.",
  "!levelconfig reward add level @role — add a role reward for any level.",
  "!levelconfig reward list/remove/clear — manage configured level rewards.",
  "!xp add amount @user — grant XP to a member.",
  "!levelreset @user — reset a member to level 1 with 0 XP.",
  "!spamconfig [limit|window|timeout] [value] — view or update spam controls.",
  "!kick @user [reason] — remove a member without banning them.",
  "!ban @user reason — permanently ban a member.",
  "!unban userID — unban the active ban for a Root user ID.",
  "!bans — list currently banned users and ban details.",
  "!purge count — delete up to 100 recent messages before the command.",
  "!purge @user count — delete up to 100 messages by that member.",
  "!warn @user reason — save a dated warning.",
  "!warnings [@user] — show warning totals or a member's history.",
  "!warn remove @user number — remove a warning by its listed number.",
  "!role add @user role-name-or-mention — add a role.",
  "!role remove @user role-name-or-mention — remove a role.",
  "!roles — list community roles and their Root IDs.",
  "!setmodchannel — set this channel for moderation logs and reports.",
  "!setmodchannel clear — clear the configured mod channel.",
  "!setlogchannel — compatibility alias for !setmodchannel.",
].join("\n");

const MODERATOR_HELP_TEXT = [
  "**Debo complete command list**",
  PUBLIC_HELP_TEXT.replace("**Debo public commands**", "**Public commands**"),
  "**Admin Role commands**",
  ADMIN_COMMANDS,
].join("\n");

/** Public help always contains only commands available to everyone. */
export async function showPublicHelp(
  event: ChannelMessageCreatedEvent,
): Promise<void> {
  await reply(event, PUBLIC_HELP_TEXT);
}

/** Full command help is sent only to the configured moderation channel. */
export async function showModeratorHelp(
  event: ChannelMessageCreatedEvent,
): Promise<void> {
  const modChannelId = await getLogChannelId();
  if (!modChannelId) {
    await reply(
      event,
      "The mod channel is not set. An admin can run !setmodchannel in the channel where moderator help should be posted.",
    );
    return;
  }

  try {
    const channel = await rootServer.community.channels.get({
      id: modChannelId,
    });
    if (!channel.channelPermission.channelCreateMessage) {
      await reply(
        event,
        "I cannot post in the configured mod channel. Check Debo's channel permissions and try !modhelp again.",
      );
      return;
    }

    const requesterName = await getCommunityMemberName(event.userId);
    const requester = rootUserMention(event.userId, requesterName);
    await postTextToLogChannel(
      modChannelId,
      `Moderator help requested by ${requester}\n\n${MODERATOR_HELP_TEXT}`,
    );
    await replyUnlessInChannel(
      event,
      modChannelId,
      "I posted the full command list in the mod channel.",
    );
  } catch (error: unknown) {
    console.error("Could not send moderator help to the mod channel:", error);
    await reply(
      event,
      "I could not access the configured mod channel. Check the channel settings and Debo's permissions, then try !modhelp again.",
    );
  }
}
