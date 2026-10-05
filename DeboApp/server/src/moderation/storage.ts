import {
  ChannelGuid,
  CommunityMemberBanGuid,
  rootServer,
  UserGuid,
} from "@rootsdk/server-app";

// The old shared channel key becomes a legacy mod-channel fallback so existing
// communities keep private reports where they were already configured.
const LEGACY_SHARED_CHANNEL_KEY = "moderation:log-channel:v1";
const MOD_CHANNEL_KEY = "moderation:mod-channel:v1";
const ACTION_LOG_CHANNEL_KEY = "moderation:action-log-channel:v1";
const WARNINGS_KEY = "moderation:warnings:v1";
const BANS_KEY = "moderation:bans:v1";

export type StoredWarning = {
  id: string;
  issuedAt: string;
  reason: string;
  moderatorId: UserGuid;
  targetName: string;
};

export type WarningArchive = Record<string, StoredWarning[]>;

export type StoredBan = {
  banId: CommunityMemberBanGuid;
  userId: UserGuid;
  issuedAt: string;
  reason: string;
  moderatorId: UserGuid;
  targetName: string;
};

export type BanArchive = Record<string, StoredBan>;

export async function getModChannelId(): Promise<ChannelGuid | undefined> {
  const configuredChannel = await rootServer.dataStore.appData.get<ChannelGuid>(
    MOD_CHANNEL_KEY,
  );
  if (configuredChannel) return configuredChannel;

  // Older versions used one channel for both private reports and action logs.
  return rootServer.dataStore.appData.get<ChannelGuid>(
    LEGACY_SHARED_CHANNEL_KEY,
  );
}

export async function setModChannelId(channelId: ChannelGuid): Promise<void> {
  await rootServer.dataStore.appData.set<ChannelGuid>({
    key: MOD_CHANNEL_KEY,
    value: channelId,
  });
}

export async function clearModChannelId(): Promise<void> {
  await rootServer.dataStore.appData.delete(MOD_CHANNEL_KEY);
  await rootServer.dataStore.appData.delete(LEGACY_SHARED_CHANNEL_KEY);
}

export async function getLogChannelId(): Promise<ChannelGuid | undefined> {
  return rootServer.dataStore.appData.get<ChannelGuid>(ACTION_LOG_CHANNEL_KEY);
}

export async function setLogChannelId(channelId: ChannelGuid): Promise<void> {
  await rootServer.dataStore.appData.set<ChannelGuid>({
    key: ACTION_LOG_CHANNEL_KEY,
    value: channelId,
  });
}

export async function clearLogChannelId(): Promise<void> {
  await rootServer.dataStore.appData.delete(ACTION_LOG_CHANNEL_KEY);
}

export async function getWarningArchive(): Promise<WarningArchive> {
  const stored = await rootServer.dataStore.appData.get<WarningArchive>(
    WARNINGS_KEY,
  );
  return stored && typeof stored === "object" ? stored : {};
}

export async function addWarning(
  userId: UserGuid,
  warning: StoredWarning,
): Promise<number> {
  const updated = await rootServer.dataStore.appData.update<WarningArchive>(
    WARNINGS_KEY,
    (current) => {
      const archive = current && typeof current === "object" ? current : {};
      return {
        ...archive,
        [userId]: [...(archive[userId] ?? []), warning],
      };
    },
    {},
  );

  return updated[userId]?.length ?? 0;
}

/** warningNumber is the 1-based number shown by !warnings @user. */
export async function removeWarning(
  userId: UserGuid,
  warningNumber: number,
): Promise<StoredWarning | undefined> {
  let removed: StoredWarning | undefined;

  await rootServer.dataStore.appData.update<WarningArchive>(
    WARNINGS_KEY,
    (current) => {
      const archive = current && typeof current === "object" ? current : {};
      const next: WarningArchive = { ...archive };
      const userWarnings = [...(next[userId] ?? [])];
      removed = userWarnings.splice(warningNumber - 1, 1)[0];

      if (userWarnings.length > 0) {
        next[userId] = userWarnings;
      } else {
        delete next[userId];
      }

      return next;
    },
    {},
  );

  return removed;
}

export async function getBanArchive(): Promise<BanArchive> {
  const stored = await rootServer.dataStore.appData.get<BanArchive>(BANS_KEY);
  return stored && typeof stored === "object" ? stored : {};
}

export async function saveBanRecord(record: StoredBan): Promise<void> {
  await rootServer.dataStore.appData.update<BanArchive>(
    BANS_KEY,
    (current) => {
      const archive = current && typeof current === "object" ? current : {};
      return { ...archive, [record.banId]: record };
    },
    {},
  );
}

/** Store observed bans only when !ban has not already saved richer metadata. */
export async function saveBanRecordIfMissing(record: StoredBan): Promise<void> {
  await rootServer.dataStore.appData.update<BanArchive>(
    BANS_KEY,
    (current) => {
      const archive = current && typeof current === "object" ? current : {};
      if (archive[record.banId]) return archive;
      return { ...archive, [record.banId]: record };
    },
    {},
  );
}

export async function removeBanRecord(
  banId: CommunityMemberBanGuid,
): Promise<void> {
  await rootServer.dataStore.appData.update<BanArchive>(
    BANS_KEY,
    (current) => {
      const archive = current && typeof current === "object" ? current : {};
      const next: BanArchive = { ...archive };
      delete next[banId];
      return next;
    },
    {},
  );
}
