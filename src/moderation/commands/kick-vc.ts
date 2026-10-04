import {
  Channel,
  ChannelGuid,
  ChannelMessageCreatedEvent,
  ChannelType,
  rootServer,
} from "@rootsdk/server-bot";
import { getMentionedUser } from "../command-helpers";
import {
  describeError,
  reply,
  safeInlineText,
  sleep,
} from "../common";
import { getLogChannelOrReply, logActionAndReply } from "../logging";
import { getTrackedVoiceChannelIds } from "../voice-tracking";
import { CommandToken } from "../types";

type VoiceChannelCandidate = {
  channelId: ChannelGuid;
  name: string;
  canKick?: boolean;
};

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

  const modChannelId = await getLogChannelOrReply(event);
  if (!modChannelId) return;

  // Check all voice channels visible to Debo, and include sessions found through
  // Root's live voice events in other channels. The event cache covers sessions
  // that began after Debo started; private channels still need voiceKick access.
  const inventory = await listAccessibleVoiceChannels();
  const matchingChannels = new Map<ChannelGuid, VoiceChannelCandidate>();
  const inspectedChannels = new Set<ChannelGuid>();
  let lookupFailures = inventory.failures;

  for (let index = 0; index < inventory.channels.length; index += 1) {
    const channel = inventory.channels[index];
    try {
      const session = await rootServer.community.channelWebRtcs.list({
        channelId: channel.id,
      });
      inspectedChannels.add(channel.id);
      if (session.members.some((member) => member.userId === target.userId)) {
        matchingChannels.set(channel.id, {
          channelId: channel.id,
          name: channel.name,
          canKick: channel.channelPermission.channelVoiceKick,
        });
      }
    } catch (error: unknown) {
      lookupFailures += 1;
      console.warn(`Could not inspect voice channel ${channel.name}:`, error);
    }

    if (index < inventory.channels.length - 1) {
      // Stay under Root's approximate query limit while scanning channels.
      await sleep(60);
    }
  }

  const trackedChannelIds = getTrackedVoiceChannelIds(target.userId);
  for (let index = 0; index < trackedChannelIds.length; index += 1) {
    const channelId = trackedChannelIds[index];
    if (matchingChannels.has(channelId) || inspectedChannels.has(channelId)) continue;

    try {
      const channel = await rootServer.community.channels.get({ id: channelId });
      if (channel.channelType !== ChannelType.Voice) continue;
      matchingChannels.set(channelId, {
        channelId,
        name: channel.name,
        canKick: channel.channelPermission.channelVoiceKick,
      });
    } catch (error: unknown) {
      // The session event can identify a private channel even when channels.get
      // cannot return its metadata. Try the scoped kick API; Root still enforces
      // the channel's actual voiceKick permission.
      matchingChannels.set(channelId, {
        channelId,
        name: String(channelId),
      });
      console.info(`Voice channel metadata is not visible for ${channelId}:`, error);
    }

    if (index < trackedChannelIds.length - 1) {
      await sleep(60);
    }
  }

  if (matchingChannels.size === 0) {
    const message =
      lookupFailures > 0
        ? `I could not verify all voice channels and could not find ${safeTargetName}. Give Debo access to the voice channels, then have the member reconnect and try again. No one was kicked.`
        : `${safeTargetName} is not in a voice session Debo can currently detect. If they joined before Debo started, have them reconnect; make sure Debo can access the voice channel.`;
    await reply(event, message);
    return;
  }

  const allMatches = [...matchingChannels.values()];
  const permissionDenied = allMatches.filter((channel) => channel.canKick === false);
  const kickable = allMatches.filter((channel) => channel.canKick !== false);

  if (kickable.length === 0) {
    const channelNames = permissionDenied
      .map((channel) => safeInlineText(channel.name, 100))
      .join(", ");
    await reply(
      event,
      `I found ${safeTargetName} in ${channelNames}, but Debo lacks voiceKick access there. Grant Debo channel visibility and voiceKick permission, then try again.`,
    );
    return;
  }

  const kickedChannels: VoiceChannelCandidate[] = [];
  const failedChannels: VoiceChannelCandidate[] = [];
  const failureMessages: string[] = [];

  for (let index = 0; index < kickable.length; index += 1) {
    const channel = kickable[index];
    try {
      await rootServer.community.channelWebRtcs.kick({
        channelId: channel.channelId,
        userId: target.userId,
      });
      kickedChannels.push(channel);
    } catch (error: unknown) {
      failedChannels.push(channel);
      failureMessages.push(describeError(error));
      console.error(
        `Could not kick ${target.userId} from voice channel ${channel.name}:`,
        error,
      );
    }

    if (index < kickable.length - 1) {
      // Root classifies voice kick as a call with an approximate one/sec limit.
      await sleep(1_050);
    }
  }

  if (kickedChannels.length === 0) {
    await reply(
      event,
      `Root refused to kick ${safeTargetName} from voice. Check Debo's visibility and voiceKick permission for those channels. ${failureMessages[0] ?? ""}`.trim(),
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
  if (permissionDenied.length > 0) {
    const names = permissionDenied
      .map((channel) => safeInlineText(channel.name, 100))
      .join(", ");
    failureNotes.push(`Missing voiceKick access in: ${names}.`);
  }
  if (lookupFailures > 0) {
    failureNotes.push(`Could not inspect ${lookupFailures} other voice channel(s).`);
  }
  const failureDetails = failureNotes.length > 0 ? ` ${failureNotes.join(" ")}` : "";

  await logActionAndReply(
    event,
    modChannelId,
    {
      action: "Voice participant kicked",
      targetUserId: target.userId,
      targetName: target.displayName,
      details: `Removed from: ${channelNames}.${failureDetails}`,
    },
    `Kicked ${safeTargetName} from voice: ${channelNames}.${failureDetails}`,
  );
}

async function listAccessibleVoiceChannels(): Promise<{
  channels: Channel[];
  failures: number;
}> {
  let groups;
  try {
    groups = await rootServer.community.channelGroups.list();
  } catch (error: unknown) {
    console.warn("Could not list visible voice channel groups:", error);
    return { channels: [], failures: 1 };
  }

  const voiceChannels: Channel[] = [];
  let failures = 0;

  for (let index = 0; index < groups.length; index += 1) {
    try {
      const channels = await rootServer.community.channels.list({
        channelGroupId: groups[index].id,
      });
      voiceChannels.push(
        ...channels.filter((channel) => channel.channelType === ChannelType.Voice),
      );
    } catch (error: unknown) {
      failures += 1;
      console.warn(`Could not list channels in group ${groups[index].name}:`, error);
    }

    if (index < groups.length - 1) {
      await sleep(60);
    }
  }

  return { channels: voiceChannels, failures };
}
