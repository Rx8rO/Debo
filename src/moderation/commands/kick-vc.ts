import {
  Channel,
  ChannelMessageCreatedEvent,
  ChannelType,
  rootServer,
} from "@rootsdk/server-bot";
import { getMentionedUser } from "../command-helpers";
import { reply, safeInlineText, sleep } from "../common";
import { getLogChannelOrReply, logActionAndReply } from "../logging";
import { CommandToken } from "../types";

export async function kickVoiceMember(
  event: ChannelMessageCreatedEvent,
  args: CommandToken[],
): Promise<void> {
  const target = getMentionedUser(event, args[0]);
  if (!target || args.length !== 1) {
    await reply(event, "Usage: !kick vc @user. Mention one member currently in voice.");
    return;
  }

  const safeTargetName = safeInlineText(target.displayName, 100);

  if (target.userId === event.userId) {
    await reply(event, "You cannot kick yourself from voice with Debo.");
    return;
  }

  const logChannelId = await getLogChannelOrReply(event);
  if (!logChannelId) return;

  const voiceChannels = await listAccessibleVoiceChannels();
  if (voiceChannels.length === 0) {
    await reply(event, "Debo cannot see any voice channels in this community.");
    return;
  }

  const matchingChannels: Channel[] = [];
  let lookupFailures = 0;

  for (let index = 0; index < voiceChannels.length; index += 1) {
    const channel = voiceChannels[index];
    try {
      const session = await rootServer.community.channelWebRtcs.list({
        channelId: channel.id,
      });
      if (session.members.some((member) => member.userId === target.userId)) {
        matchingChannels.push(channel);
      }
    } catch (error: unknown) {
      lookupFailures += 1;
      console.warn(`Could not inspect voice channel ${channel.name}:`, error);
    }

    if (index < voiceChannels.length - 1) {
      // Voice-session listings are queries; stay below Root's approximate query limit.
      await sleep(60);
    }
  }

  if (matchingChannels.length === 0) {
    const message =
      lookupFailures > 0
        ? `I could not verify all voice channels. Make sure Debo can access them, then try again. ${safeTargetName} was not kicked.`
        : `${safeTargetName} is not currently in a voice channel Debo can see.`;
    await reply(event, message);
    return;
  }

  const permissionDeniedChannels = matchingChannels.filter(
    (channel) => !channel.channelPermission.channelVoiceKick,
  );
  const kickableChannels = matchingChannels.filter(
    (channel) => channel.channelPermission.channelVoiceKick,
  );

  if (kickableChannels.length === 0) {
    const channelNames = matchingChannels
      .map((channel) => safeInlineText(channel.name, 100))
      .join(", ");
    await reply(
      event,
      `I found ${safeTargetName} in ${channelNames}, but Debo lacks the voice-kick permission there. Grant Debo voiceKick access in those channels, then try again.`,
    );
    return;
  }

  const kickedChannels: Channel[] = [];
  const failedChannels: Channel[] = [];

  for (let index = 0; index < kickableChannels.length; index += 1) {
    const channel = kickableChannels[index];
    try {
      await rootServer.community.channelWebRtcs.kick({
        channelId: channel.id,
        userId: target.userId,
      });
      kickedChannels.push(channel);
    } catch (error: unknown) {
      failedChannels.push(channel);
      console.error(`Could not kick ${target.userId} from voice channel ${channel.name}:`, error);
    }

    if (index < kickableChannels.length - 1) {
      // Root classifies voice kick as a call with an approximate one/sec limit.
      await sleep(1_050);
    }
  }

  if (kickedChannels.length === 0) {
    await reply(
      event,
      `Debo could not kick ${safeTargetName} from voice. Check its voice-kick permission and channel access.`,
    );
    return;
  }

  const channelNames = kickedChannels
    .map((channel) => safeInlineText(channel.name, 100))
    .join(", ");
  const failureNotes: string[] = [];
  if (failedChannels.length > 0) {
    const names = failedChannels
      .map((channel) => safeInlineText(channel.name, 100))
      .join(", ");
    failureNotes.push(`Could not kick from: ${names}.`);
  }
  if (permissionDeniedChannels.length > 0) {
    const names = permissionDeniedChannels
      .map((channel) => safeInlineText(channel.name, 100))
      .join(", ");
    failureNotes.push(`Missing voiceKick permission in: ${names}.`);
  }
  if (lookupFailures > 0) {
    failureNotes.push(`Could not inspect ${lookupFailures} other voice channel(s).`);
  }
  const failureDetails = failureNotes.length > 0 ? ` ${failureNotes.join(" ")}` : "";

  await logActionAndReply(
    event,
    logChannelId,
    {
      action: "Voice participant kicked",
      targetUserId: target.userId,
      targetName: target.displayName,
      details: `Removed from: ${channelNames}.${failureDetails}`,
    },
    `Kicked ${safeTargetName} from voice: ${channelNames}.${failureDetails}`,
  );
}

async function listAccessibleVoiceChannels(): Promise<Channel[]> {
  const groups = await rootServer.community.channelGroups.list();
  const voiceChannels: Channel[] = [];

  for (let index = 0; index < groups.length; index += 1) {
    const channels = await rootServer.community.channels.list({
      channelGroupId: groups[index].id,
    });
    voiceChannels.push(
      ...channels.filter((channel) => channel.channelType === ChannelType.Voice),
    );

    if (index < groups.length - 1) {
      await sleep(60);
    }
  }

  return voiceChannels;
}
