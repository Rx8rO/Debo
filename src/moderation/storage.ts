import {
  ChannelGuid,
  rootServer,
  UserGuid,
} from "@rootsdk/server-bot";

const LOG_CHANNEL_KEY = "moderation:log-channel:v1";
const WARNINGS_KEY = "moderation:warnings:v1";

export type StoredWarning = {
  id: string;
  issuedAt: string;
  reason: string;
  moderatorId: UserGuid;
  targetName: string;
};

export type WarningArchive = Record<string, StoredWarning[]>;

export async function getLogChannelId(): Promise<ChannelGuid | undefined> {
  return rootServer.dataStore.appData.get<ChannelGuid>(LOG_CHANNEL_KEY);
}

export async function setLogChannelId(channelId: ChannelGuid): Promise<void> {
  await rootServer.dataStore.appData.set<ChannelGuid>({
    key: LOG_CHANNEL_KEY,
    value: channelId,
  });
}

export async function clearLogChannelId(): Promise<void> {
  await rootServer.dataStore.appData.delete(LOG_CHANNEL_KEY);
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
