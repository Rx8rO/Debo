import {
  ChannelMessageCreatedEvent,
  ChannelMessageEvent,
  CommunityGuid,
  CommunityRoleGuid,
  MessageType,
  ReadOnlyMemberGroup,
  rootServer,
  UserGuid,
} from "@rootsdk/server-bot";
import { checkModeratorRole, checkOwner } from "./moderation/access";
import {
  describeError,
  getCommunityMemberName,
  getMentionedUser,
  getRoleMention,
  reply,
  rootUserMention,
  safeInlineText,
  sleep,
} from "./moderation/common";
import { parseCommand, tokenToText } from "./moderation/parser";
import { getLogChannelId } from "./moderation/storage";
import { CommandToken } from "./moderation/types";

type AutomationConfig = {
  xpMinPerMessage: number;
  xpMaxPerMessage: number;
  xpCooldownSeconds: number;
  rewardRolesByLevel: Record<string, CommunityRoleGuid[]>;
  spamMessageLimit: number;
  spamWindowSeconds: number;
  spamTimeoutSeconds: number;
};

type UserXpRecord = {
  totalXp: number;
  lastXpAt: number;
  lastAwardMessageId?: string;
  /** Legacy field retained so XP records from v1.5.0 remain valid. */
  assignedRewardRoleId?: CommunityRoleGuid;
  assignedRewardRoleIds?: CommunityRoleGuid[];
};

type StoredSpamTimeout = {
  until: number;
  /** Only roles Debo added are removed when this temporary timeout ends. */
  addedRoleIds: CommunityRoleGuid[];
};

type LevelProgress = {
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
};

type FilteredWordMatcher = {
  word: string;
  pattern: RegExp;
};

const DEFAULT_CONFIG: AutomationConfig = {
  xpMinPerMessage: 5,
  xpMaxPerMessage: 10,
  xpCooldownSeconds: 60,
  rewardRolesByLevel: {},
  spamMessageLimit: 5,
  spamWindowSeconds: 1,
  spamTimeoutSeconds: 10,
};
const XP_PER_LEVEL_STEP = 100;
const MAX_XP_PER_MESSAGE = 10_000;
const MAX_MANUAL_XP_AMOUNT = 1_000_000;
const MAX_XP_COOLDOWN_SECONDS = 86_400;
const MAX_REWARD_LEVEL = 1_000;
const MAX_SPAM_MESSAGE_LIMIT = 1_000;
const MAX_SPAM_WINDOW_SECONDS = 60;
const MAX_SPAM_TIMEOUT_SECONDS = 86_400;
const MAX_FILTER_WORDS = 100;
const MAX_FILTER_WORD_LENGTH = 80;
const XP_KEY_PART = "xp:";
const SPAM_TIMEOUT_KEY_PART = "spam-timeout:";
const FILTER_WORDS_KEY_PART = "filter-words";
const CONFIG_KEY_PART = "config";

let storagePrefix: string | undefined;
let initialization: Promise<void> = Promise.resolve();
let initialized = false;
let configCache: AutomationConfig = { ...DEFAULT_CONFIG };
const messageTimes = new Map<UserGuid, number[]>();
const activeTimeouts = new Map<UserGuid, StoredSpamTimeout>();
const timeoutTimers = new Map<UserGuid, ReturnType<typeof setTimeout>>();
const xpRecordsByUser = new Map<UserGuid, UserXpRecord>();
const rewardAssignmentsInFlight = new Set<UserGuid>();
let configuredFilterWords: string[] = [];
let filterWordMatchers: FilteredWordMatcher[] = [];

/** Register the community-scoped XP, rank, and anti-spam message handler. */
export function initializeAutomationBot(communityId: CommunityGuid): void {
  if (initialized) return;

  initialized = true;
  storagePrefix = `debo:automation:v1:${String(communityId)}`;
  initialization = Promise.all([
    loadAutomationConfig(),
    restoreSpamTimeouts(),
    loadFilteredWords(),
  ]).then(() => undefined);

  rootServer.community.channelMessages.on(
    ChannelMessageEvent.ChannelMessageCreated,
    onMessage,
  );
}

/** A new member starts at level 1; each level-up requires 100 more XP. */
export function calculateLevelProgress(totalXp: number): LevelProgress {
  const xp = Number.isFinite(totalXp)
    ? Math.max(0, Math.min(Math.floor(totalXp), Number.MAX_SAFE_INTEGER))
    : 0;
  let levelUps = Math.floor(
    (Math.sqrt(1 + (8 * xp) / XP_PER_LEVEL_STEP) - 1) / 2,
  );

  // Correct for floating-point rounding around exact level boundaries.
  while (levelUps > 0 && xpRequiredForLevel(levelUps) > xp) levelUps -= 1;
  while (xpRequiredForLevel(levelUps + 1) <= xp) levelUps += 1;

  return {
    level: levelUps + 1,
    xpIntoLevel: xp - xpRequiredForLevel(levelUps),
    xpForNextLevel: (levelUps + 1) * XP_PER_LEVEL_STEP,
  };
}

async function onMessage(event: ChannelMessageCreatedEvent): Promise<void> {
  if (event.messageType !== MessageType.UserMessage) return;

  await initialization;

  const parsed = parseCommand(event.messageContent);
  let authorizedFilterCommand = false;
  try {
    authorizedFilterCommand = await isAuthorizedFilterCommand(event, parsed);
  } catch (error: unknown) {
    console.error("Debo could not verify access to a filter command:", error);
  }
  if (!authorizedFilterCommand) {
    try {
      if (await checkAndHandleWordFilter(event)) return;
    } catch (error: unknown) {
      console.error("Debo could not check this message against the word filter:", error);
    }
  }

  try {
    if (await checkAndHandleSpam(event)) return;
  } catch (error: unknown) {
    console.error("Debo could not check this message for spam:", error);
  }

  if (parsed) {
    try {
      switch (parsed.name) {
        case "rank":
          await showRank(event, parsed.args);
          break;
        case "ranks":
          await showTopRanks(event, parsed.args, 5);
          break;
        case "ranks10":
          await showTopRanks(event, parsed.args, 10);
          break;
        case "level":
          await showLevel(event, parsed.args);
          break;
        case "levelconfig":
          await configureLeveling(event, parsed.args);
          break;
        case "filter":
          await configureWordFilter(event, parsed.args);
          break;
        case "spamconfig":
          await configureSpam(event, parsed.args);
          break;
        case "xp":
          await addMemberXp(event, parsed.args);
          break;
        case "levelreset":
          await resetMemberLevel(event, parsed.args);
          break;
        default:
          // Commands (including moderation commands) do not earn XP.
          break;
      }
    } catch (error: unknown) {
      console.error(`Automation command !${parsed.name} failed:`, error);
      if (
        ["rank", "ranks", "ranks10", "level", "levelconfig", "filter", "spamconfig", "xp", "levelreset"].includes(parsed.name)
      ) {
        await reply(
          event,
          `!${parsed.name} could not be completed: ${describeError(error)}. Check Debo's Root permissions and try again.`,
        );
      }
    }
    return;
  }

  try {
    await awardMessageXp(event);
  } catch (error: unknown) {
    console.error("Debo could not save message XP:", error);
  }
}

async function loadAutomationConfig(): Promise<void> {
  try {
    const stored = await rootServer.dataStore.appData.get<
      Partial<AutomationConfig> & {
        additionalRewardRolesByLevel?: unknown;
      }
    >(configKey());
    configCache = normalizeConfig(stored);
  } catch (error: unknown) {
    configCache = { ...DEFAULT_CONFIG };
    console.error("Could not load Debo's automation settings:", error);
  }
}

async function loadFilteredWords(): Promise<void> {
  try {
    const stored = await rootServer.dataStore.appData.get<unknown>(filterWordsKey());
    setFilteredWordCache(normalizeFilterWords(stored));
  } catch (error: unknown) {
    setFilteredWordCache([]);
    console.error("Could not load Debo's filtered words:", error);
  }
}

function normalizeConfig(value: unknown): AutomationConfig {
  const source =
    value && typeof value === "object"
      ? (value as Partial<AutomationConfig> & {
          additionalRewardRolesByLevel?: unknown;
        })
      : {};
  const xpMinPerMessage = boundedInteger(
    source.xpMinPerMessage,
    DEFAULT_CONFIG.xpMinPerMessage,
    1,
    MAX_XP_PER_MESSAGE,
  );
  const configuredXpMax = boundedInteger(
    source.xpMaxPerMessage,
    DEFAULT_CONFIG.xpMaxPerMessage,
    1,
    MAX_XP_PER_MESSAGE,
  );
  const rewardRolesByLevel =
    source.rewardRolesByLevel !== undefined
      ? normalizeRewardMappings(source.rewardRolesByLevel)
      : migrateLegacyRewardMappings(source.additionalRewardRolesByLevel);

  return {
    xpMinPerMessage,
    xpMaxPerMessage: Math.max(xpMinPerMessage, configuredXpMax),
    xpCooldownSeconds: boundedInteger(
      source.xpCooldownSeconds,
      DEFAULT_CONFIG.xpCooldownSeconds,
      0,
      MAX_XP_COOLDOWN_SECONDS,
    ),
    rewardRolesByLevel,
    spamMessageLimit: boundedInteger(
      source.spamMessageLimit,
      DEFAULT_CONFIG.spamMessageLimit,
      1,
      MAX_SPAM_MESSAGE_LIMIT,
    ),
    spamWindowSeconds: boundedNumber(
      source.spamWindowSeconds,
      DEFAULT_CONFIG.spamWindowSeconds,
      0.1,
      MAX_SPAM_WINDOW_SECONDS,
    ),
    spamTimeoutSeconds: boundedInteger(
      source.spamTimeoutSeconds,
      DEFAULT_CONFIG.spamTimeoutSeconds,
      0,
      MAX_SPAM_TIMEOUT_SECONDS,
    ),
  };
}

function normalizeRewardMappings(
  value: unknown,
): Record<string, CommunityRoleGuid[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const mappings: Record<string, CommunityRoleGuid[]> = {};
  for (const [key, roleIds] of Object.entries(value)) {
    const level = Number(key);
    if (
      !Number.isSafeInteger(level) ||
      level < 1 ||
      level > MAX_REWARD_LEVEL ||
      !Array.isArray(roleIds)
    ) {
      continue;
    }

    const validRoleIds = Array.from(
      new Set(roleIds.filter((roleId): roleId is string => typeof roleId === "string")),
    ) as CommunityRoleGuid[];
    if (validRoleIds.length > 0) mappings[String(level)] = validRoleIds;
  }
  return mappings;
}

function migrateLegacyRewardMappings(value: unknown): Record<string, CommunityRoleGuid[]> {
  const legacyMappings = normalizeRewardMappings(value);
  const migrated: Record<string, CommunityRoleGuid[]> = {};
  for (const [levelText, roleIds] of Object.entries(legacyMappings)) {
    // Older builds started at level 0. Shift legacy reward levels so each role
    // still unlocks at the same XP threshold under the new level-1 baseline.
    const legacyLevel = Number(levelText);
    const newLevel = Math.min(MAX_REWARD_LEVEL, legacyLevel + 1);
    const key = String(newLevel);
    migrated[key] = Array.from(new Set([...(migrated[key] ?? []), ...roleIds]));
  }
  return migrated;
}

function boundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  return typeof value === "number" && Number.isSafeInteger(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;
}

function boundedNumber(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;
}

async function saveAutomationConfig(config: AutomationConfig): Promise<void> {
  const normalized = normalizeConfig(config);
  await rootServer.dataStore.appData.set<AutomationConfig>({
    key: configKey(),
    value: normalized,
  });
  configCache = normalized;
}

async function awardMessageXp(event: ChannelMessageCreatedEvent): Promise<void> {
  const config = configCache;
  const now = Date.now();
  const messageId = String(event.id);
  const xpAward = randomInteger(config.xpMinPerMessage, config.xpMaxPerMessage);
  const cached = xpRecordsByUser.get(event.userId);
  const cooldownMs = config.xpCooldownSeconds * 1_000;
  if (cached && now - cached.lastXpAt < cooldownMs) return;

  const record = await rootServer.dataStore.appData.update<UserXpRecord>(
    xpKey(event.userId),
    (stored) => {
      const current = normalizeXpRecord(stored);
      if (
        current.lastAwardMessageId === messageId ||
        now - current.lastXpAt < cooldownMs
      ) {
        return current;
      }

      return {
        ...current,
        totalXp: Math.min(
          Number.MAX_SAFE_INTEGER,
          current.totalXp + xpAward,
        ),
        lastXpAt: now,
        lastAwardMessageId: messageId,
      };
    },
    emptyXpRecord(),
  );
  cacheXpRecord(event.userId, record);

  if (record.lastAwardMessageId === messageId) {
    await ensureLevelRewards(event, event.userId, record, config);
  }
}

function emptyXpRecord(): UserXpRecord {
  return { totalXp: 0, lastXpAt: 0 };
}

function cacheXpRecord(userId: UserGuid, record: UserXpRecord): void {
  const current = xpRecordsByUser.get(userId);
  if (
    !current ||
    record.totalXp > current.totalXp ||
    (record.totalXp === current.totalXp && record.lastXpAt >= current.lastXpAt)
  ) {
    xpRecordsByUser.set(userId, record);
  }
}

function normalizeXpRecord(value: unknown): UserXpRecord {
  const source =
    value && typeof value === "object"
      ? (value as Partial<UserXpRecord>)
      : {};
  const totalXp =
    typeof source.totalXp === "number" && Number.isFinite(source.totalXp)
      ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(source.totalXp)))
      : 0;
  const lastXpAt =
    typeof source.lastXpAt === "number" && Number.isFinite(source.lastXpAt)
      ? Math.max(0, source.lastXpAt)
      : 0;
  const assignedRoleIds = Array.isArray(source.assignedRewardRoleIds)
    ? source.assignedRewardRoleIds.filter(
        (roleId): roleId is CommunityRoleGuid => typeof roleId === "string",
      )
    : [];
  if (typeof source.assignedRewardRoleId === "string") {
    assignedRoleIds.push(source.assignedRewardRoleId as CommunityRoleGuid);
  }

  return {
    totalXp,
    lastXpAt,
    ...(typeof source.lastAwardMessageId === "string"
      ? { lastAwardMessageId: source.lastAwardMessageId }
      : {}),
    ...(typeof source.assignedRewardRoleId === "string"
      ? { assignedRewardRoleId: source.assignedRewardRoleId as CommunityRoleGuid }
      : {}),
    assignedRewardRoleIds: Array.from(new Set(assignedRoleIds)),
  };
}

async function ensureLevelRewards(
  event: ChannelMessageCreatedEvent,
  userId: UserGuid,
  record: UserXpRecord,
  config: AutomationConfig,
): Promise<void> {
  const progress = calculateLevelProgress(record.totalXp);
  const rewards = new Set<CommunityRoleGuid>();

  for (const [levelText, roleIds] of Object.entries(
    config.rewardRolesByLevel,
  )) {
    if (Number(levelText) <= progress.level) {
      for (const roleId of roleIds) rewards.add(roleId);
    }
  }

  const alreadyAssigned = new Set(record.assignedRewardRoleIds ?? []);
  const missingRoles = Array.from(rewards).filter(
    (roleId) => !alreadyAssigned.has(roleId),
  );
  if (missingRoles.length === 0 || rewardAssignmentsInFlight.has(userId)) return;

  rewardAssignmentsInFlight.add(userId);
  try {
    const stored = normalizeXpRecord(
      await rootServer.dataStore.appData.get<UserXpRecord>(xpKey(userId)),
    );
    cacheXpRecord(userId, stored);
    const storedAssignments = new Set(stored.assignedRewardRoleIds ?? []);
    const currentRoles = await rootServer.community.communityMemberRoles.list({
      userId,
    });
    const memberRoleIds = new Set(currentRoles.communityRoleIds);

    for (const roleId of missingRoles) {
      if (storedAssignments.has(roleId)) continue;
      try {
        if (!memberRoleIds.has(roleId)) {
          await rootServer.community.communityMemberRoles.add({
            communityRoleId: roleId,
            userIds: [userId],
          });
          memberRoleIds.add(roleId);

          const memberName = await getCommunityMemberName(userId);
          const roleName = await getCommunityRoleName(roleId);
          await reply(
            event,
            `🎉 Congratulations, ${rootUserMention(userId, memberName)}! You reached level ${progress.level} and earned ${roleName}!`,
          );
        }

        const updated = await rootServer.dataStore.appData.update<UserXpRecord>(
          xpKey(userId),
          (current) => {
            const normalized = normalizeXpRecord(current);
            return {
              ...normalized,
              assignedRewardRoleIds: Array.from(
                new Set([...(normalized.assignedRewardRoleIds ?? []), roleId]),
              ),
            };
          },
          emptyXpRecord(),
        );
        const normalizedUpdated = normalizeXpRecord(updated);
        cacheXpRecord(userId, normalizedUpdated);
        storedAssignments.add(roleId);
      } catch (error: unknown) {
        console.warn(`Could not assign a configured level reward role (${roleId}):`, error);
      }
    }
  } catch (error: unknown) {
    // Keep the XP award even if the community has not granted Debo role access.
    console.warn("Could not assign the configured level reward roles:", error);
  } finally {
    rewardAssignmentsInFlight.delete(userId);
  }
}

async function showRank(
  event: ChannelMessageCreatedEvent,
  args: CommandToken[],
): Promise<void> {
  let userId = event.userId;
  let displayName: string;

  if (args.length === 0) {
    displayName = await getCommunityMemberName(userId);
  } else if (args.length === 1) {
    const mentionedUser = await resolveMentionedUser(event, args[0]);
    if (!mentionedUser) {
      await reply(event, "Usage: !rank or !rank @user");
      return;
    }
    userId = mentionedUser.userId;
    displayName = mentionedUser.displayName;
  } else {
    await reply(event, "Usage: !rank or !rank @user");
    return;
  }

  const leaderboard = await getLeaderboard();
  const totalXp = await getMemberTotalXp(userId, leaderboard);
  if (
    totalXp > 0 &&
    !leaderboard.some(
      (entry) => normalizeUserId(entry.userId) === normalizeUserId(userId),
    )
  ) {
    leaderboard.push({ userId, totalXp });
    leaderboard.sort(compareLeaderboardEntries);
  }

  const rankIndex = leaderboard.findIndex(
    (entry) => normalizeUserId(entry.userId) === normalizeUserId(userId),
  );
  const progress = calculateLevelProgress(totalXp);
  const rankLine = rankIndex < 0 ? "Unranked" : `#${rankIndex + 1}`;
  const memberMention = rootUserMention(userId, displayName);

  await reply(
    event,
    `**Rank for ${memberMention}**\n**Rank:** ${rankLine}\n**Level:** ${progress.level}\n**XP:** ${formatNumber(totalXp)}`,
  );
}

type LeaderboardEntry = { userId: UserGuid; totalXp: number };

async function getMemberTotalXp(
  userId: UserGuid,
  leaderboard: LeaderboardEntry[],
): Promise<number> {
  const targetEntry = leaderboard.find(
    (entry) => normalizeUserId(entry.userId) === normalizeUserId(userId),
  );
  if (targetEntry) return targetEntry.totalXp;

  const record = normalizeXpRecord(
    await rootServer.dataStore.appData.get<UserXpRecord>(xpKey(userId)),
  );
  cacheXpRecord(userId, record);
  return record.totalXp;
}

async function showTopRanks(
  event: ChannelMessageCreatedEvent,
  args: CommandToken[],
  limit: 5 | 10,
): Promise<void> {
  const command = limit === 5 ? "!ranks" : "!ranks10";
  if (args.length !== 0) {
    await reply(event, `Usage: ${command}`);
    return;
  }

  const topMembers = (await getLeaderboard()).slice(0, limit);
  if (topMembers.length === 0) {
    await reply(event, "No members have earned XP yet.");
    return;
  }

  const rows = await Promise.all(
    topMembers.map(async (entry, index) => {
      const name = await getCommunityMemberName(entry.userId);
      const progress = calculateLevelProgress(entry.totalXp);
      return `#${index + 1} ${rootUserMention(entry.userId, name)} — Level ${progress.level} · ${formatNumber(entry.totalXp)} XP`;
    }),
  );
  await reply(event, [`**Top ${limit} members**`, ...rows].join("\n"));
}

async function showLevel(
  event: ChannelMessageCreatedEvent,
  args: CommandToken[],
): Promise<void> {
  let userId = event.userId;
  let displayName = await getCommunityMemberName(userId);
  const isSelfLookup = args.length === 0;

  if (args.length === 1) {
    const mentionedUser = await resolveMentionedUser(event, args[0]);
    if (!mentionedUser) {
      await reply(event, "Usage: !level or !level @user");
      return;
    }
    userId = mentionedUser.userId;
    displayName = mentionedUser.displayName;
  } else if (args.length > 1) {
    await reply(event, "Usage: !level or !level @user");
    return;
  }

  const leaderboard = await getLeaderboard();
  const totalXp = await getMemberTotalXp(userId, leaderboard);
  const level = calculateLevelProgress(totalXp).level;
  const subject = isSelfLookup
    ? "Your level"
    : `Level for ${rootUserMention(userId, displayName)}`;
  await reply(event, `**${subject}:** ${level}`);
}

async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  const prefix = xpKeyPrefix();
  const values = await rootServer.dataStore.appData.select<UserXpRecord>(
    `${escapeLikePattern(prefix)}%`,
  );
  const byMember = new Map<string, LeaderboardEntry>();

  for (const entry of values) {
    const userId = entry.key.slice(prefix.length) as UserGuid;
    const record = normalizeXpRecord(entry.value);
    const normalizedId = normalizeUserId(userId);
    const current = byMember.get(normalizedId);
    if (userId && record.totalXp > 0 && (!current || record.totalXp > current.totalXp)) {
      byMember.set(normalizedId, { userId, totalXp: record.totalXp });
    }
  }

  const leaderboard = Array.from(byMember.values());
  leaderboard.sort(compareLeaderboardEntries);
  return leaderboard;
}

function normalizeUserId(userId: UserGuid): string {
  return String(userId).trim().replace(/[{}]/g, "").toLowerCase();
}

function normalizePersonName(name: string): string {
  return name.trim().replace(/^@+/, "").toLocaleLowerCase();
}

async function resolveMentionedUser(
  event: ChannelMessageCreatedEvent,
  token: CommandToken | undefined,
): Promise<ReturnType<typeof getMentionedUser>> {
  const mentionedUser = getMentionedUser(event, token);
  if (!mentionedUser) return undefined;

  const references = event.referenceMaps?.users ?? [];
  const idReference = references.find(
    (candidate) =>
      normalizeUserId(candidate.userId) === normalizeUserId(mentionedUser.userId),
  );
  if (idReference) {
    return { userId: idReference.userId, displayName: idReference.name };
  }

  try {
    const member = await rootServer.community.communityMembers.get({
      userId: mentionedUser.userId,
    });
    return {
      userId: member.userId,
      displayName: member.nickname || mentionedUser.displayName,
    };
  } catch {
    // The mention may contain an alias or stale GUID; try its reference name.
  }

  const nameReference = references.find(
    (candidate) =>
      normalizePersonName(candidate.name) ===
      normalizePersonName(mentionedUser.displayName),
  );
  if (nameReference) {
    return { userId: nameReference.userId, displayName: nameReference.name };
  }

  const member = await findUniqueCommunityMemberByName(mentionedUser.displayName);
  return member
    ? { userId: member.userId, displayName: member.nickname }
    : mentionedUser;
}

async function findUniqueCommunityMemberByName(
  name: string,
): Promise<{ userId: UserGuid; nickname: string } | undefined> {
  try {
    const members = await rootServer.community.communityMembers.listAll();
    const matches = members.filter(
      (member) => normalizePersonName(member.nickname) === normalizePersonName(name),
    );
    return matches.length === 1 ? matches[0] : undefined;
  } catch (error: unknown) {
    console.warn("Could not resolve a mention by community member name:", error);
    return undefined;
  }
}

function compareLeaderboardEntries(
  left: LeaderboardEntry,
  right: LeaderboardEntry,
): number {
  return (
    right.totalXp - left.totalXp ||
    String(left.userId).localeCompare(String(right.userId))
  );
}

async function configureLeveling(
  event: ChannelMessageCreatedEvent,
  args: CommandToken[],
): Promise<void> {
  if (!(await requireAutomationOwner(event))) return;
  if (args.length === 0) {
    await reply(event, formatLevelingConfig(configCache));
    return;
  }

  if (typeof args[0] !== "string") {
    await reply(event, levelConfigUsage());
    return;
  }

  const field = args[0].toLowerCase();
  if (field === "reward") {
    await configureRewardMapping(event, args.slice(1), configCache);
    return;
  }

  const config = { ...configCache };
  if (field === "xp") {
    if (args.length !== 3) {
      await reply(event, "Usage: !levelconfig xp <minimum> <maximum>");
      return;
    }
    const minimum = readInteger(tokenToText(args[1]), 1, MAX_XP_PER_MESSAGE);
    const maximum = readInteger(tokenToText(args[2]), 1, MAX_XP_PER_MESSAGE);
    if (minimum === undefined || maximum === undefined || minimum > maximum) {
      await reply(
        event,
        `XP range must be two whole numbers from 1 to ${MAX_XP_PER_MESSAGE}, with the minimum no greater than the maximum.`,
      );
      return;
    }
    config.xpMinPerMessage = minimum;
    config.xpMaxPerMessage = maximum;
    await saveAutomationConfig(config);
    await reply(
      event,
      `Saved: each eligible message will award a random ${minimum}–${maximum} XP.`,
    );
    return;
  }

  if (args.length !== 2) {
    await reply(event, levelConfigUsage());
    return;
  }

  const rawValue = tokenToText(args[1]);
  if (field === "cooldown") {
    const value = readInteger(rawValue, 0, MAX_XP_COOLDOWN_SECONDS);
    if (value === undefined) {
      await reply(event, `XP cooldown must be a whole number from 0 to ${MAX_XP_COOLDOWN_SECONDS} seconds.`);
      return;
    }
    config.xpCooldownSeconds = value;
    await saveAutomationConfig(config);
    await reply(
      event,
      value === 0
        ? "Saved: XP has no cooldown; every eligible message can award XP."
        : `Saved: a member can earn XP once every ${value} seconds.`,
    );
    return;
  }

  await reply(event, levelConfigUsage());
}

async function configureRewardMapping(
  event: ChannelMessageCreatedEvent,
  args: CommandToken[],
  currentConfig: AutomationConfig,
): Promise<void> {
  const action = typeof args[0] === "string" ? args[0].toLowerCase() : "";

  if (action === "list" && args.length === 1) {
    await listLevelRewards(event, currentConfig);
    return;
  }

  if (action === "clear" && args.length === 2) {
    const level = readInteger(tokenToText(args[1]), 1, MAX_REWARD_LEVEL);
    if (level === undefined) {
      await reply(event, `Reward level must be a whole number from 1 to ${MAX_REWARD_LEVEL}.`);
      return;
    }
    const config = { ...currentConfig, rewardRolesByLevel: { ...currentConfig.rewardRolesByLevel } };
    delete config.rewardRolesByLevel[String(level)];
    await saveAutomationConfig(config);
    await reply(event, `Cleared reward roles for level ${level}.`);
    return;
  }

  if ((action === "add" || action === "remove") && args.length === 3) {
    const level = readInteger(tokenToText(args[1]), 1, MAX_REWARD_LEVEL);
    const mentionedRole = getRoleMention(args[2]);
    if (level === undefined || !mentionedRole) {
      await reply(
        event,
        "Usage: !levelconfig reward add <level> @role or !levelconfig reward remove <level> @role",
      );
      return;
    }

    const roleId = mentionedRole.roleId as CommunityRoleGuid;
    const mappingKey = String(level);
    const currentRoleIds = currentConfig.rewardRolesByLevel[mappingKey] ?? [];
    const config = {
      ...currentConfig,
      rewardRolesByLevel: { ...currentConfig.rewardRolesByLevel },
    };

    if (action === "add") {
      let roleName = mentionedRole.displayName;
      try {
        const role = await rootServer.community.communityRoles.get({ id: roleId });
        roleName = role.name;
      } catch {
        await reply(event, "I could not find that role in this community. Mention a community role and try again.");
        return;
      }
      if (currentRoleIds.includes(roleId)) {
        await reply(event, `That role is already configured as a level ${level} reward.`);
        return;
      }
      config.rewardRolesByLevel[mappingKey] = [...currentRoleIds, roleId];
      await saveAutomationConfig(config);
      await reply(
        event,
        `Saved: @${safeInlineText(roleName, 80)} will be added when a member reaches level ${level}.`,
      );
      return;
    }

    if (!currentRoleIds.includes(roleId)) {
      await reply(event, `That role is not configured as a level ${level} reward.`);
      return;
    }
    const remainingRoleIds = currentRoleIds.filter((id) => id !== roleId);
    if (remainingRoleIds.length > 0) {
      config.rewardRolesByLevel[mappingKey] = remainingRoleIds;
    } else {
      delete config.rewardRolesByLevel[mappingKey];
    }
    await saveAutomationConfig(config);
    await reply(event, `Removed that role from the level ${level} reward list.`);
    return;
  }

  await reply(
    event,
    "Usage: !levelconfig reward list | add <level> @role | remove <level> @role | clear <level>",
  );
}

async function listLevelRewards(
  event: ChannelMessageCreatedEvent,
  config: AutomationConfig,
): Promise<void> {
  const lines: string[] = ["**Configured level rewards**"];
  const levels = Object.keys(config.rewardRolesByLevel)
    .map(Number)
    .sort((left, right) => left - right);
  for (const level of levels) {
    const roleIds = config.rewardRolesByLevel[String(level)] ?? [];
    for (const roleId of roleIds) {
      lines.push(`Level ${level}: ${await getCommunityRoleName(roleId)}`);
    }
  }

  if (lines.length === 1) lines.push("No reward roles are configured.");
  await reply(event, lines.join("\n"));
}

async function getCommunityRoleName(roleId: CommunityRoleGuid): Promise<string> {
  try {
    const role = await rootServer.community.communityRoles.get({ id: roleId });
    return `@${safeInlineText(role.name, 80)}`;
  } catch {
    return `role ID ${roleId}`;
  }
}

function levelConfigUsage(): string {
  return [
    "Leveling: !levelconfig xp <min> <max> | cooldown <seconds>",
    "Rewards: !levelconfig reward list | add <level> @role | remove <level> @role | clear <level>",
  ].join("\n");
}

async function configureSpam(
  event: ChannelMessageCreatedEvent,
  args: CommandToken[],
): Promise<void> {
  if (!(await requireAutomationOwner(event))) return;
  if (args.length === 0) {
    await reply(event, formatSpamConfig(configCache));
    return;
  }

  if (args.length !== 2 || typeof args[0] !== "string") {
    await reply(
      event,
      "Usage: !spamconfig [limit <messages> | window <seconds> | timeout <seconds>]",
    );
    return;
  }

  const field = args[0].toLowerCase();
  const rawValue = tokenToText(args[1]);
  const config = { ...configCache };

  if (field === "limit") {
    const value = readInteger(rawValue, 1, MAX_SPAM_MESSAGE_LIMIT);
    if (value === undefined) {
      await reply(event, `Spam message limit must be a whole number from 1 to ${MAX_SPAM_MESSAGE_LIMIT}.`);
      return;
    }
    config.spamMessageLimit = value;
    await saveAutomationConfig(config);
    await reply(event, `Saved: messages above ${value} per window will be deleted.`);
    return;
  }

  if (field === "window") {
    const value = readDecimal(rawValue, 0.1, MAX_SPAM_WINDOW_SECONDS);
    if (value === undefined) {
      await reply(event, `Spam window must be between 0.1 and ${MAX_SPAM_WINDOW_SECONDS} seconds.`);
      return;
    }
    config.spamWindowSeconds = value;
    await saveAutomationConfig(config);
    await reply(
      event,
      `Saved: the spam limit is measured over ${formatSeconds(value)} seconds.`,
    );
    return;
  }

  if (field === "timeout") {
    const value = readInteger(rawValue, 0, MAX_SPAM_TIMEOUT_SECONDS);
    if (value === undefined) {
      await reply(event, `Spam timeout must be a whole number from 0 to ${MAX_SPAM_TIMEOUT_SECONDS} seconds.`);
      return;
    }
    config.spamTimeoutSeconds = value;
    await saveAutomationConfig(config);
    await reply(
      event,
      value === 0
        ? "Saved: timed spam suppression is disabled; messages over the limit will still be deleted."
        : `Saved: after a spam trigger, further messages will be suppressed for ${value} seconds.`,
    );
    return;
  }

  await reply(
    event,
    "Usage: !spamconfig [limit <messages> | window <seconds> | timeout <seconds>]",
  );
}

async function configureWordFilter(
  event: ChannelMessageCreatedEvent,
  args: CommandToken[],
): Promise<void> {
  if (!(await requireAutomationOwner(event))) return;

  const action = typeof args[0] === "string" ? args[0].toLowerCase() : "";
  if (action === "list" && args.length === 1) {
    if (configuredFilterWords.length === 0) {
      await reply(event, "No filtered words are configured; word filtering is disabled.");
      return;
    }
    await replyFilteredWordList(event, configuredFilterWords);
    return;
  }

  if (action === "clear" && args.length === 1) {
    await saveFilteredWords([]);
    await reply(event, "Cleared the filtered-word list. Word filtering is now disabled.");
    return;
  }

  if ((action === "add" || action === "remove") && args.length >= 2) {
    const valueTokens = args.slice(1);
    if (valueTokens.some((token) => typeof token !== "string")) {
      await reply(event, filterCommandUsage());
      return;
    }

    const input = valueTokens.map((token) => token as string).join(" ");
    const parsed = parseFilterWordInput(input);
    if (parsed.invalidWords.length > 0) {
      await reply(
        event,
        `These entries are invalid or longer than ${MAX_FILTER_WORD_LENGTH} characters: ${parsed.invalidWords.map((word) => formatFilterLogCode(word, MAX_FILTER_WORD_LENGTH)).join(", ")}`,
      );
      return;
    }
    if (parsed.words.length === 0) {
      await reply(event, filterCommandUsage());
      return;
    }

    if (action === "add") {
      const existing = new Set(configuredFilterWords);
      const wordsToAdd = parsed.words.filter((word) => !existing.has(word));
      if (configuredFilterWords.length + wordsToAdd.length > MAX_FILTER_WORDS) {
        await reply(
          event,
          `The filtered-word list can contain at most ${MAX_FILTER_WORDS} unique words or phrases.`,
        );
        return;
      }
      if (wordsToAdd.length === 0) {
        await reply(event, "Those words are already in the filtered-word list.");
        return;
      }

      await saveFilteredWords([...configuredFilterWords, ...wordsToAdd]);
      await reply(
        event,
        `Added ${wordsToAdd.length} filtered word${wordsToAdd.length === 1 ? "" : "s"}. There are now ${configuredFilterWords.length} configured.`,
      );
      return;
    }

    const wordsToRemove = new Set(parsed.words);
    const remainingWords = configuredFilterWords.filter(
      (word) => !wordsToRemove.has(word),
    );
    const removedCount = configuredFilterWords.length - remainingWords.length;
    if (removedCount === 0) {
      await reply(event, "None of those words were in the filtered-word list.");
      return;
    }

    await saveFilteredWords(remainingWords);
    await reply(
      event,
      `Removed ${removedCount} filtered word${removedCount === 1 ? "" : "s"}. There are now ${configuredFilterWords.length} configured.`,
    );
    return;
  }

  await reply(event, filterCommandUsage());
}

async function replyFilteredWordList(
  event: ChannelMessageCreatedEvent,
  words: string[],
): Promise<void> {
  const messages: string[] = [];
  let current = `**Filtered words (${words.length})**`;

  for (const [index, word] of words.entries()) {
    const line = `${index + 1}. ${formatFilterLogCode(word, MAX_FILTER_WORD_LENGTH)}`;
    if (current.length + line.length + 1 > 1_400) {
      messages.push(current);
      current = "**Filtered words (continued)**";
    }
    current += `\n${line}`;
  }
  messages.push(current);

  for (let index = 0; index < messages.length; index += 1) {
    await reply(event, messages[index]);
    if (index < messages.length - 1) await sleep(250);
  }
}

function filterCommandUsage(): string {
  return [
    "Owner-only filter commands:",
    "!filter add word1,word2 — add multiple words or phrases in one command.",
    "!filter list — show the configured list.",
    "!filter remove word1,word2 — remove words from the list.",
    "!filter clear — remove all words and disable filtering.",
  ].join("\n");
}

async function addMemberXp(
  event: ChannelMessageCreatedEvent,
  args: CommandToken[],
): Promise<void> {
  if (!(await requireAutomationAdmin(event))) return;
  if (args.length !== 3 || typeof args[0] !== "string" || args[0].toLowerCase() !== "add") {
    await reply(event, `Usage: !xp add <amount> @user (1–${MAX_MANUAL_XP_AMOUNT} XP)`);
    return;
  }

  const amount = readInteger(tokenToText(args[1]), 1, MAX_MANUAL_XP_AMOUNT);
  const target = await resolveMentionedUser(event, args[2]);
  if (amount === undefined || !target) {
    await reply(event, `Usage: !xp add <amount> @user (1–${MAX_MANUAL_XP_AMOUNT} XP)`);
    return;
  }

  const record = await rootServer.dataStore.appData.update<UserXpRecord>(
    xpKey(target.userId),
    (stored) => {
      const current = normalizeXpRecord(stored);
      return {
        ...current,
        totalXp: Math.min(Number.MAX_SAFE_INTEGER, current.totalXp + amount),
      };
    },
    emptyXpRecord(),
  );
  const normalized = normalizeXpRecord(record);
  cacheXpRecord(target.userId, normalized);
  await ensureLevelRewards(event, target.userId, normalized, configCache);

  const progress = calculateLevelProgress(normalized.totalXp);
  await reply(
    event,
    `Added ${formatNumber(amount)} XP to ${rootUserMention(target.userId, target.displayName)}. Their total is ${formatNumber(normalized.totalXp)} XP (level ${progress.level}).`,
  );
}

async function resetMemberLevel(
  event: ChannelMessageCreatedEvent,
  args: CommandToken[],
): Promise<void> {
  if (!(await requireAutomationAdmin(event))) return;
  const target =
    args.length === 1 ? await resolveMentionedUser(event, args[0]) : undefined;
  if (!target) {
    await reply(event, "Usage: !levelreset @user");
    return;
  }

  await rootServer.dataStore.appData.update<UserXpRecord>(
    xpKey(target.userId),
    () => ({ totalXp: 0, lastXpAt: 0, assignedRewardRoleIds: [] }),
    emptyXpRecord(),
  );
  xpRecordsByUser.delete(target.userId);
  await reply(
    event,
    `Reset ${rootUserMention(target.userId, target.displayName)} to level 1 with 0 XP. This does not remove roles they already earned.`,
  );
}

async function isAuthorizedFilterCommand(
  event: ChannelMessageCreatedEvent,
  parsed: ReturnType<typeof parseCommand>,
): Promise<boolean> {
  if (parsed?.name !== "filter" || typeof parsed.args[0] !== "string") {
    return false;
  }
  const action = parsed.args[0].toLowerCase();
  if (!["add", "list", "remove", "clear"].includes(action)) return false;
  return (await checkOwner(event.userId)).allowed;
}

async function requireAutomationOwner(
  event: ChannelMessageCreatedEvent,
): Promise<boolean> {
  const authorization = await checkOwner(event.userId);
  if (authorization.allowed) return true;

  await reply(event, "You are not the owner meow 🐾", 5_000);
  return false;
}

async function requireAutomationAdmin(
  event: ChannelMessageCreatedEvent,
): Promise<boolean> {
  const authorization = await checkModeratorRole(event.userId);
  if (authorization.allowed) return true;

  await reply(event, "You are not an admin meow 🐾", 5_000);
  return false;
}

function formatLevelingConfig(config: AutomationConfig): string {
  const rewardCount = Object.values(config.rewardRolesByLevel).reduce(
    (count, roleIds) => count + roleIds.length,
    0,
  );
  return [
    "**Leveling configuration**",
    `Random XP per eligible message: ${config.xpMinPerMessage}–${config.xpMaxPerMessage}`,
    `XP cooldown: ${config.xpCooldownSeconds} seconds${config.xpCooldownSeconds === 0 ? " (disabled)" : ""}`,
    `Configured level rewards: ${rewardCount}`,
    "Level 1 starts at 0 XP; level 2 takes 100 XP and each later level requires 100 more XP than the previous one.",
    "Use !levelconfig reward list to view rewards; reward add/remove/clear commands manage any level.",
    "Use !levelconfig xp <min> <max> or !levelconfig cooldown <seconds> to change leveling values.",
  ].join("\n");
}

function formatSpamConfig(config: AutomationConfig): string {
  const timeoutRoleConfigured = getConfiguredRoleId("spamTimeoutRole") !== undefined;
  const timeoutDescription =
    config.spamTimeoutSeconds === 0
      ? "disabled"
      : `${config.spamTimeoutSeconds} seconds`;
  const roleDescription = timeoutRoleConfigured
    ? "selected; configure that role to deny sending messages in the channels you want protected"
    : "not selected; Debo will still delete the member's messages during the timeout, but Root will not block them from attempting to send";

  return [
    "**Spam protection configuration**",
    `Limit: ${config.spamMessageLimit} messages per ${formatSeconds(config.spamWindowSeconds)} seconds; messages above the limit are deleted.`,
    `Additional timeout: ${timeoutDescription}.`,
    `Spam timeout role: ${roleDescription}.`,
    "Set values with !spamconfig limit <messages>, !spamconfig window <seconds>, or !spamconfig timeout <seconds>.",
  ].join("\n");
}

function readInteger(
  value: string,
  minimum: number,
  maximum: number,
): number | undefined {
  if (!/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : undefined;
}

function readDecimal(
  value: string,
  minimum: number,
  maximum: number,
): number | undefined {
  if (!/^\d+(?:\.\d+)?$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : undefined;
}

async function checkAndHandleWordFilter(
  event: ChannelMessageCreatedEvent,
): Promise<boolean> {
  const normalizedMessage = event.messageContent.normalize("NFKC");
  const matches = getFilteredWordMatchers()
    .filter(({ pattern }) => pattern.test(normalizedMessage))
    .map(({ word }) => word);

  if (matches.length === 0) return false;

  let deleted = false;
  try {
    await rootServer.community.channelMessages.delete({
      channelId: event.channelId,
      id: event.id,
    });
    deleted = true;
  } catch (error: unknown) {
    console.warn("The word filter matched a message but could not delete it:", error);
  }

  await logFilteredMessage(event, matches, deleted);
  return true;
}

function getFilteredWordMatchers(): FilteredWordMatcher[] {
  return filterWordMatchers;
}

function setFilteredWordCache(words: string[]): void {
  configuredFilterWords = words;
  filterWordMatchers = buildFilteredWordMatchers(words);
}

function buildFilteredWordMatchers(words: string[]): FilteredWordMatcher[] {
  return words.map((word) => {
    const escapedWord = escapeRegExp(word).replace(/\s+/g, "\\s+");
    const pattern = new RegExp(
      String.raw`(^|[^\p{L}\p{N}\p{M}_])(${escapedWord})(?=$|[^\p{L}\p{N}\p{M}_])`,
      "iu",
    );
    return { word, pattern };
  });
}

function normalizeFilterWords(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const words = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const word = normalizeFilterWord(entry);
    if (word) words.add(word);
    if (words.size >= MAX_FILTER_WORDS) break;
  }
  return Array.from(words);
}

function parseFilterWordInput(raw: string): {
  words: string[];
  invalidWords: string[];
} {
  const words = new Set<string>();
  const invalidWords: string[] = [];
  for (const value of raw.split(/[,;\r\n]+/)) {
    if (!value.trim()) continue;
    const word = normalizeFilterWord(value);
    if (word) words.add(word);
    else invalidWords.push(value.trim());
  }
  return { words: Array.from(words), invalidWords };
}

function normalizeFilterWord(value: string): string | undefined {
  const word = value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (
    word.length === 0 ||
    word.length > MAX_FILTER_WORD_LENGTH ||
    !/[\p{L}\p{N}]/u.test(word)
  ) {
    return undefined;
  }
  return word;
}

async function saveFilteredWords(words: string[]): Promise<void> {
  const normalized = normalizeFilterWords(words);
  await rootServer.dataStore.appData.set<string[]>({
    key: filterWordsKey(),
    value: normalized,
  });
  setFilteredWordCache(normalized);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function logFilteredMessage(
  event: ChannelMessageCreatedEvent,
  matchedWords: string[],
  deleted: boolean,
): Promise<void> {
  try {
    const logChannelId = await getLogChannelId();
    if (!logChannelId) {
      console.warn(
        "A filtered message was handled, but no Logs channel is configured. Run !setlogchannel to enable filter audit logs.",
      );
      return;
    }

    const channel = await rootServer.community.channels.get({ id: logChannelId });
    if (!channel.channelPermission.channelCreateMessage) {
      console.warn("Debo cannot post filtered-message audits in the Logs channel.");
      return;
    }

    const memberName = await getCommunityMemberName(event.userId);
    const listedMatches = matchedWords
      .slice(0, 5)
      .map((word) => formatFilterLogCode(word, MAX_FILTER_WORD_LENGTH))
      .join(", ");
    const extraMatches =
      matchedWords.length > 5 ? ` (and ${matchedWords.length - 5} more)` : "";
    const originalMessage = formatFilterLogCode(event.messageContent, 850);
    const content = [
      `**${deleted ? "Filtered message deleted" : "Word-filter delete failed"}**`,
      `Member: ${formatFilterLogCode(memberName, 100)} (${formatFilterLogCode(String(event.userId), 100)})`,
      `Channel ID: ${formatFilterLogCode(String(event.channelId), 100)}`,
      `Detected word${matchedWords.length === 1 ? "" : "s"}: ${listedMatches}${extraMatches}`,
      `Original message: ${originalMessage}`,
      `Time (UTC): ${new Date().toISOString()}`,
    ].join("\n");

    await rootServer.community.channelMessages.create({
      channelId: logChannelId,
      content,
    });
  } catch (error: unknown) {
    console.error("Could not post a word-filter audit to the Logs channel:", error);
  }
}

function formatFilterLogCode(value: string, maximumLength: number): string {
  const safeValue = safeInlineText(value, maximumLength)
    .replace(/`/g, "'")
    .replace(/@/g, "@\u200b");
  const truncated = value.length > maximumLength ? `${safeValue}…` : safeValue;
  const backtick = String.fromCharCode(96);
  return `${backtick}${truncated}${backtick}`;
}

async function checkAndHandleSpam(
  event: ChannelMessageCreatedEvent,
): Promise<boolean> {
  const now = Date.now();
  const activeTimeout = activeTimeouts.get(event.userId);
  if (activeTimeout && activeTimeout.until > now) {
    await deleteSpamMessage(event);
    return true;
  }
  if (activeTimeout) {
    void expireSpamTimeout(event.userId, activeTimeout.until);
  }

  const config = configCache;
  const windowMs = config.spamWindowSeconds * 1_000;
  const recent = (messageTimes.get(event.userId) ?? []).filter(
    (sentAt) => now - sentAt < windowMs,
  );
  recent.push(now);
  messageTimes.set(event.userId, recent);

  if (recent.length <= config.spamMessageLimit) return false;

  if (config.spamTimeoutSeconds > 0) {
    // Set the in-memory state immediately, so concurrent messages are hidden
    // while the role API and persistent store calls are still in flight.
    void startSpamTimeout(
      event.userId,
      now + config.spamTimeoutSeconds * 1_000,
    ).catch((error: unknown) => {
      console.error("Could not start Debo's spam timeout:", error);
    });
  }
  await deleteSpamMessage(event);
  return true;
}

async function deleteSpamMessage(
  event: ChannelMessageCreatedEvent,
): Promise<void> {
  try {
    await rootServer.community.channelMessages.delete({
      channelId: event.channelId,
      id: event.id,
    });
  } catch (error: unknown) {
    console.warn("Could not delete an over-limit message:", error);
  }
}

async function startSpamTimeout(
  userId: UserGuid,
  until: number,
): Promise<void> {
  const previous = activeTimeouts.get(userId);
  const state: StoredSpamTimeout = {
    until,
    addedRoleIds: [...(previous?.addedRoleIds ?? [])],
  };
  activeTimeouts.set(userId, state);
  await persistSpamTimeout(userId, state);

  const timeoutRoleId = getConfiguredRoleId("spamTimeoutRole");
  if (timeoutRoleId) {
    try {
      const currentRoles = await rootServer.community.communityMemberRoles.list({
        userId,
      });
      if (!currentRoles.communityRoleIds.includes(timeoutRoleId)) {
        await rootServer.community.communityMemberRoles.add({
          communityRoleId: timeoutRoleId,
          userIds: [userId],
        });
        if (!state.addedRoleIds.includes(timeoutRoleId)) {
          state.addedRoleIds.push(timeoutRoleId);
        }
      }
    } catch (error: unknown) {
      // Message deletion/suppression continues even if Root rejects the role.
      console.warn("Could not assign the configured spam timeout role:", error);
    }
  }

  activeTimeouts.set(userId, state);
  await persistSpamTimeout(userId, state);
  if (Date.now() >= state.until) {
    await expireSpamTimeout(userId, state.until);
  } else {
    scheduleSpamTimeoutExpiry(userId, state);
  }
}

async function persistSpamTimeout(
  userId: UserGuid,
  state: StoredSpamTimeout,
): Promise<void> {
  try {
    await rootServer.dataStore.appData.set<StoredSpamTimeout>({
      key: spamTimeoutKey(userId),
      value: state,
    });
  } catch (error: unknown) {
    console.error("Could not persist a spam timeout:", error);
  }
}

async function restoreSpamTimeouts(): Promise<void> {
  try {
    const records = await rootServer.dataStore.appData.select<StoredSpamTimeout>(
      `${escapeLikePattern(spamTimeoutKeyPrefix())}%`,
    );
    for (const record of records) {
      const userId = record.key.slice(spamTimeoutKeyPrefix().length) as UserGuid;
      if (!userId || !isStoredSpamTimeout(record.value)) continue;
      activeTimeouts.set(userId, record.value);
      scheduleSpamTimeoutExpiry(userId, record.value);
    }
  } catch (error: unknown) {
    console.error("Could not restore active spam timeouts:", error);
  }
}

function isStoredSpamTimeout(value: unknown): value is StoredSpamTimeout {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<StoredSpamTimeout>;
  return (
    typeof record.until === "number" &&
    Number.isFinite(record.until) &&
    Array.isArray(record.addedRoleIds) &&
    record.addedRoleIds.every((roleId) => typeof roleId === "string")
  );
}

function scheduleSpamTimeoutExpiry(
  userId: UserGuid,
  state: StoredSpamTimeout,
  retryDelayMs = 0,
): void {
  const previousTimer = timeoutTimers.get(userId);
  if (previousTimer) clearTimeout(previousTimer);

  const delay = Math.max(retryDelayMs, state.until - Date.now(), 0);
  const timer = setTimeout(() => {
    timeoutTimers.delete(userId);
    void expireSpamTimeout(userId, state.until);
  }, delay);
  timeoutTimers.set(userId, timer);
}

async function expireSpamTimeout(
  userId: UserGuid,
  expectedUntil: number,
): Promise<void> {
  let state = activeTimeouts.get(userId);
  if (state && state.until !== expectedUntil) return;

  if (!state) {
    try {
      const stored = await rootServer.dataStore.appData.get<StoredSpamTimeout>(
        spamTimeoutKey(userId),
      );
      if (isStoredSpamTimeout(stored)) state = stored;
    } catch (error: unknown) {
      console.warn("Could not read a spam timeout during cleanup:", error);
      return;
    }
  }

  if (!state || state.until !== expectedUntil) return;
  if (state.until > Date.now()) {
    activeTimeouts.set(userId, state);
    scheduleSpamTimeoutExpiry(userId, state);
    return;
  }

  // A newer timeout may have started while this cleanup was waiting on storage.
  const latest = activeTimeouts.get(userId);
  if (latest && latest.until !== expectedUntil) return;

  try {
    if (state.addedRoleIds.length > 0) {
      const currentRoles = await rootServer.community.communityMemberRoles.list({
        userId,
      });
      const rolesToRemove = state.addedRoleIds.filter((roleId) =>
        currentRoles.communityRoleIds.includes(roleId),
      );
      if (rolesToRemove.length > 0) {
        for (const roleId of rolesToRemove) {
          await rootServer.community.communityMemberRoles.remove({
            communityRoleId: roleId,
            userIds: [userId],
          });
        }
      }
    }
  } catch (error: unknown) {
    console.warn("Could not remove a temporary spam timeout role:", error);
    activeTimeouts.set(userId, state);
    scheduleSpamTimeoutExpiry(userId, state, 5_000);
    return;
  }

  try {
    await rootServer.dataStore.appData.delete(spamTimeoutKey(userId));
    if (activeTimeouts.get(userId)?.until === expectedUntil) {
      activeTimeouts.delete(userId);
    }
  } catch (error: unknown) {
    console.warn("Could not clear an expired spam timeout record:", error);
    activeTimeouts.set(userId, state);
    scheduleSpamTimeoutExpiry(userId, state, 5_000);
  }
}

function getConfiguredRoleId(
  settingKey: "spamTimeoutRole",
): CommunityRoleGuid | undefined {
  const rawSetting = rootServer.globalSettings?.automation?.[settingKey];
  if (!rawSetting || typeof rawSetting !== "object") return undefined;

  const roleSetting = rawSetting as ReadOnlyMemberGroup;
  return Array.isArray(roleSetting.communityRoleIds)
    ? roleSetting.communityRoleIds[0]
    : undefined;
}

function xpRequiredForLevel(level: number): number {
  return XP_PER_LEVEL_STEP * (level * (level + 1)) / 2;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function randomInteger(minimum: number, maximum: number): number {
  return Math.floor(Math.random() * (maximum - minimum + 1)) + minimum;
}

function formatSeconds(value: number): string {
  return String(Number(value.toFixed(2)));
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\_%]/g, "\\$&");
}

function configKey(): string {
  return `${getStoragePrefix()}:${CONFIG_KEY_PART}`;
}

function filterWordsKey(): string {
  return `${getStoragePrefix()}:${FILTER_WORDS_KEY_PART}`;
}

function xpKeyPrefix(): string {
  return `${getStoragePrefix()}:${XP_KEY_PART}`;
}

function xpKey(userId: UserGuid): string {
  return `${xpKeyPrefix()}${String(userId)}`;
}

function spamTimeoutKeyPrefix(): string {
  return `${getStoragePrefix()}:${SPAM_TIMEOUT_KEY_PART}`;
}

function spamTimeoutKey(userId: UserGuid): string {
  return `${spamTimeoutKeyPrefix()}${String(userId)}`;
}

function getStoragePrefix(): string {
  if (!storagePrefix) {
    throw new Error("Automation started without a community ID.");
  }
  return storagePrefix;
}
