import {
  ChannelGuid,
  ChannelWebRtcEvent,
  ChannelWebRtcUserAttachEvent,
  ChannelWebRtcUserDetachEvent,
  DeviceGuid,
  rootServer,
  UserGuid,
} from "@rootsdk/server-bot";

// Voice attach/detach events also let Debo remember sessions in channels that
// are not returned by the channel-list API because they are private/restricted.
const activeVoiceSessions = new Map<
  UserGuid,
  Map<ChannelGuid, Set<DeviceGuid>>
>();

export function initializeVoiceTracking(): void {
  rootServer.community.channelWebRtcs.on(
    ChannelWebRtcEvent.ChannelWebRtcUserAttach,
    trackVoiceAttach,
  );
  rootServer.community.channelWebRtcs.on(
    ChannelWebRtcEvent.ChannelWebRtcUserDetach,
    trackVoiceDetach,
  );
}

export function getTrackedVoiceChannelIds(userId: UserGuid): ChannelGuid[] {
  return [...(activeVoiceSessions.get(userId)?.keys() ?? [])];
}

function trackVoiceAttach(event: ChannelWebRtcUserAttachEvent): void {
  let channels = activeVoiceSessions.get(event.userId);
  if (!channels) {
    channels = new Map<ChannelGuid, Set<DeviceGuid>>();
    activeVoiceSessions.set(event.userId, channels);
  }

  let devices = channels.get(event.channelId);
  if (!devices) {
    devices = new Set<DeviceGuid>();
    channels.set(event.channelId, devices);
  }
  devices.add(event.deviceId);
}

function trackVoiceDetach(event: ChannelWebRtcUserDetachEvent): void {
  const channels = activeVoiceSessions.get(event.userId);
  const devices = channels?.get(event.channelId);
  if (!channels || !devices) return;

  devices.delete(event.deviceId);
  if (devices.size === 0) channels.delete(event.channelId);
  if (channels.size === 0) activeVoiceSessions.delete(event.userId);
}
