import {
  ChannelGuid,
  ChannelType,
  Client,
  CommunityRoleGuid,
  rootServer,
} from "@rootsdk/server-app";
import { DeboDashboardServiceBase } from "@deboapp/gen-server";
import {
  AdminDashboardResponse,
  ChannelOption,
  ChannelRequest,
  Empty,
  FilterTermsRequest,
  MemberDashboardResponse,
  RankEntry,
  RewardLevelRequest,
  RewardMapping,
  RewardRoleRequest,
  RoleOption,
  UpdateAutomationConfigRequest,
} from "@deboapp/gen-shared";
import {
  addDashboardFilterTerms,
  addDashboardRewardRole,
  clearDashboardFilterTerms,
  clearDashboardRewardLevel,
  getAutomationDashboardSnapshot,
  getMemberDashboardSnapshot,
  getSpamTimeoutRoleIdForDashboard,
  removeDashboardFilterTerms,
  removeDashboardRewardRole,
  saveDashboardAutomationConfig,
} from "./automation";
import { checkModeratorRole, checkOwner } from "./moderation/access";
import {
  clearLogChannelId,
  clearModChannelId,
  getLogChannelId,
  getModChannelId,
  setLogChannelId,
  setModChannelId,
} from "./moderation/storage";

export class DeboDashboardService extends DeboDashboardServiceBase {
  async getMemberDashboard(
    _request: Empty,
    client: Client,
  ): Promise<MemberDashboardResponse> {
    const snapshot = await getMemberDashboardSnapshot(client.userId);
    return {
      member: toRankEntry(snapshot.member),
      topFive: snapshot.topFive.map(toRankEntry),
      topTen: snapshot.topTen.map(toRankEntry),
    };
  }

  async getAdminDashboard(
    _request: Empty,
    client: Client,
  ): Promise<AdminDashboardResponse> {
    const [owner, moderator] = await Promise.all([
      checkOwner(client.userId),
      checkModeratorRole(client.userId),
    ]);
    if (!owner.allowed && !moderator.allowed) {
      return emptyAdminDashboard();
    }

    const response = emptyAdminDashboard();
    response.allowed = true;
    response.isOwner = owner.allowed;
    response.modChannelId = String((await getModChannelId()) ?? "");
    response.logChannelId = String((await getLogChannelId()) ?? "");

    // Existing command policy is Owner-only for these configuration values.
    // Do not leak them to an Admin Role moderator who is not the Owner.
    if (!owner.allowed) return response;

    const [{ config, filterWords }, roles, channels] = await Promise.all([
      getAutomationDashboardSnapshot(),
      getRoleOptions().catch((error: unknown) => {
        console.warn("Debo could not load community roles for the dashboard:", error);
        return [];
      }),
      getTextChannelOptions().catch((error: unknown) => {
        console.warn("Debo could not load text channels for the dashboard:", error);
        return [];
      }),
    ]);
    response.xpMinPerMessage = config.xpMinPerMessage;
    response.xpMaxPerMessage = config.xpMaxPerMessage;
    response.xpCooldownSeconds = config.xpCooldownSeconds;
    response.spamMessageLimit = config.spamMessageLimit;
    response.spamWindowSeconds = config.spamWindowSeconds;
    response.spamTimeoutSeconds = config.spamTimeoutSeconds;
    response.spamTimeoutRoleId = String(
      getSpamTimeoutRoleIdForDashboard() ?? "",
    );
    response.rewardMappings = await getRewardMappings(
      config.rewardRolesByLevel,
    );
    response.filterWords = filterWords;
    response.roles = roles;
    response.channels = channels;
    return response;
  }

  async saveAutomationConfig(
    request: UpdateAutomationConfigRequest,
    client: Client,
  ): Promise<Empty> {
    await requireOwner(client);
    await saveDashboardAutomationConfig({
      xpMinPerMessage: request.xpMinPerMessage,
      xpMaxPerMessage: request.xpMaxPerMessage,
      xpCooldownSeconds: request.xpCooldownSeconds,
      spamMessageLimit: request.spamMessageLimit,
      spamWindowSeconds: request.spamWindowSeconds,
      spamTimeoutSeconds: request.spamTimeoutSeconds,
      spamTimeoutRoleId: request.spamTimeoutRoleId,
    });
    return {};
  }

  async addRewardRole(
    request: RewardRoleRequest,
    client: Client,
  ): Promise<Empty> {
    await requireOwner(client);
    await addDashboardRewardRole(request.level, request.roleId);
    return {};
  }

  async removeRewardRole(
    request: RewardRoleRequest,
    client: Client,
  ): Promise<Empty> {
    await requireOwner(client);
    await removeDashboardRewardRole(request.level, request.roleId);
    return {};
  }

  async clearRewardLevel(
    request: RewardLevelRequest,
    client: Client,
  ): Promise<Empty> {
    await requireOwner(client);
    await clearDashboardRewardLevel(request.level);
    return {};
  }

  async addFilterTerms(
    request: FilterTermsRequest,
    client: Client,
  ): Promise<Empty> {
    await requireOwner(client);
    await addDashboardFilterTerms(request.terms);
    return {};
  }

  async removeFilterTerms(
    request: FilterTermsRequest,
    client: Client,
  ): Promise<Empty> {
    await requireOwner(client);
    await removeDashboardFilterTerms(request.terms);
    return {};
  }

  async clearFilter(_request: Empty, client: Client): Promise<Empty> {
    await requireOwner(client);
    await clearDashboardFilterTerms();
    return {};
  }

  async setModChannel(
    request: ChannelRequest,
    client: Client,
  ): Promise<Empty> {
    await requireOwner(client);
    const channelId = await validateTextChannel(request.channelId);
    await setModChannelId(channelId);
    return {};
  }

  async clearModChannel(_request: Empty, client: Client): Promise<Empty> {
    await requireOwner(client);
    await clearModChannelId();
    return {};
  }

  async setLogChannel(
    request: ChannelRequest,
    client: Client,
  ): Promise<Empty> {
    await requireOwner(client);
    const channelId = await validateTextChannel(request.channelId);
    await setLogChannelId(channelId);
    return {};
  }

  async clearLogChannel(_request: Empty, client: Client): Promise<Empty> {
    await requireOwner(client);
    await clearLogChannelId();
    return {};
  }
}

function emptyAdminDashboard(): AdminDashboardResponse {
  return {
    allowed: false,
    isOwner: false,
    xpMinPerMessage: 0,
    xpMaxPerMessage: 0,
    xpCooldownSeconds: 0,
    spamMessageLimit: 0,
    spamWindowSeconds: 0,
    spamTimeoutSeconds: 0,
    spamTimeoutRoleId: "",
    rewardMappings: [],
    filterWords: [],
    roles: [],
    channels: [],
    modChannelId: "",
    logChannelId: "",
  };
}

function toRankEntry(entry: {
  userId: string;
  displayName: string;
  rank: number;
  level: number;
  totalXp: string;
  isRanked: boolean;
}): RankEntry {
  return {
    userId: entry.userId,
    displayName: entry.displayName,
    rank: entry.rank,
    level: entry.level,
    totalXp: entry.totalXp,
    isRanked: entry.isRanked,
  };
}

async function getRewardMappings(
  mappings: Record<string, CommunityRoleGuid[]>,
): Promise<RewardMapping[]> {
  const levels = Object.keys(mappings)
    .map(Number)
    .sort((a, b) => a - b);
  return Promise.all(
    levels.map(async (level) => ({
      level,
      roles: await Promise.all(
        (mappings[String(level)] ?? []).map((roleId) =>
          getRoleOption(roleId),
        ),
      ),
    })),
  );
}

async function getRoleOptions(): Promise<RoleOption[]> {
  const roles = await rootServer.community.communityRoles.list();
  return roles
    .map((role) => ({ id: String(role.id), name: role.name }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function getRoleOption(roleId: CommunityRoleGuid): Promise<RoleOption> {
  try {
    const role = await rootServer.community.communityRoles.get({ id: roleId });
    return { id: String(role.id), name: role.name };
  } catch {
    return { id: String(roleId), name: `Missing role (${roleId})` };
  }
}

async function getTextChannelOptions(): Promise<ChannelOption[]> {
  const groups = await rootServer.community.channelGroups.list();
  const nested = await Promise.all(
    groups.map(async (group) => {
      const channels = await rootServer.community.channels.list({
        channelGroupId: group.id,
      });
      return channels
        .filter(
          (channel) =>
            (channel.channelType === ChannelType.Text ||
              channel.channelType === ChannelType.ThreadedText) &&
            channel.channelPermission.channelCreateMessage,
        )
        .map((channel) => ({
          id: String(channel.id),
          name: `${group.name} / #${channel.name}`,
        }));
    }),
  );
  return nested.flat().sort((left, right) => left.name.localeCompare(right.name));
}

async function validateTextChannel(value: string): Promise<ChannelGuid> {
  const channelId = value.trim() as ChannelGuid;
  if (!channelId) throw new Error("Choose a text channel first.");
  const channel = await rootServer.community.channels.get({ id: channelId });
  if (
    channel.channelType !== ChannelType.Text &&
    channel.channelType !== ChannelType.ThreadedText
  ) {
    throw new Error("Mod and Logs destinations must be text channels.");
  }
  if (!channel.channelPermission.channelCreateMessage) {
    throw new Error("Debo needs permission to create messages in the selected channel.");
  }
  return channel.id;
}

async function requireOwner(client: Client): Promise<void> {
  const authorization = await checkOwner(client.userId);
  if (!authorization.allowed) {
    throw new Error("Only the selected Debo Owner can change these settings.");
  }
}
