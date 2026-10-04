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
import { postTextToChannel } from "../logging";
import { getModChannelId } from "../storage";

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
  "!modhelp — post the complete command list in the mod channel.",
  "!xp add amount @user — grant XP to a member.",
  "!levelreset @user — reset a member to level 1 with 0 XP.",
  "!kick @user [reason] — remove a member without banning them; logs to the Logs channel.",
  "!bans — post the active ban report in the Mod channel.",
  "!purge count — delete up to 100 recent messages before the command.",
  "!purge @user count — delete up to 100 messages by that member.",
  "!warn @user reason — issue a warning and log it to the Logs channel.",
  "!warnings [@user] — post warning totals or a member's history in the Mod channel.",
  "!warn remove @user number — remove a warning and log the action.",
  "!role add @user role-name-or-mention — add a role and log the action.",
  "!role remove @user role-name-or-mention — remove a role and log the action.",
  "!roles — post community roles and their Root IDs in the Mod channel.",
].join("\n");

const OWNER_COMMANDS = [
  "!ban @user reason — permanently ban a member and log the action.",
  "!unban userID — unban the active ban for a Root user ID and log the action.",
  "!spamconfig [limit|window|timeout] [value] — view or update spam controls.",
  "!levelconfig — view XP, cooldown, and reward settings.",
  "!levelconfig xp min max — set the random XP range.",
  "!levelconfig cooldown seconds — set the per-member XP cooldown.",
  "!levelconfig reward add level @role — add a role reward for any level.",
  "!levelconfig reward list/remove/clear — manage configured level rewards.",
  "!setmodchannel — set the private Mod channel (or add clear to remove it).",
  "!setlogchannel — set the Logs channel for moderation actions and automatic filter audits (or add clear to remove it).",
].join("\n");

const MODERATOR_HELP_TEXT = [
  "**Debo complete command list**",
  "Admin Role commands require the configured Admin Role; Owner-only commands require the single member selected as Owner in Global Settings.",
  "Use a private Mod channel for reports and this help, and a separate Logs channel for moderation-action and automatic filter audit logs. Configure them with !setmodchannel and !setlogchannel.",
  "The automatic word filter includes fuck by default; add terms in Global Settings → Automation → Additional Filtered Words. Matching messages are deleted and logged in Logs; only Admin Role members bypass this filter.",
  PUBLIC_HELP_TEXT.replace("**Debo public commands**", "**Public commands**"),
  "**Admin Role commands**",
  ADMIN_COMMANDS,
  "**Owner-only commands**",
  OWNER_COMMANDS,
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
  const modChannelId = await getModChannelId();
  if (!modChannelId) {
    await reply(
      event,
      "The Mod channel is not set. The configured Owner can run !setmodchannel in the channel where moderator help should be posted.",
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
        "I cannot post in the configured Mod channel. Check Debo's channel permissions and try !modhelp again.",
      );
      return;
    }

    const requesterName = await getCommunityMemberName(event.userId);
    const requester = rootUserMention(event.userId, requesterName);
    await postTextToChannel(
      modChannelId,
      `Moderator help requested by ${requester}\n\n${MODERATOR_HELP_TEXT}`,
    );
    await replyUnlessInChannel(
      event,
      modChannelId,
      "I posted the full command list in the Mod channel.",
    );
  } catch (error: unknown) {
    console.error("Could not send moderator help to the Mod channel:", error);
    await reply(
      event,
      "I could not access the configured Mod channel. Check the channel settings and Debo's permissions, then try !modhelp again.",
    );
  }
}
