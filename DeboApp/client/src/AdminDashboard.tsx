import React, { FormEvent, useEffect, useState } from "react";
import { deboDashboardServiceClient } from "@deboapp/gen-client";
import {
  AdminDashboardResponse,
  ChannelOption,
  Empty,
} from "@deboapp/gen-shared";

type Props = {
  data: AdminDashboardResponse;
  error: string;
  loading: boolean;
  onRefresh: () => Promise<AdminDashboardResponse | null>;
};

type ConfigForm = {
  xpMinPerMessage: string;
  xpMaxPerMessage: string;
  xpCooldownSeconds: string;
  spamMessageLimit: string;
  spamWindowSeconds: string;
  spamTimeoutSeconds: string;
  spamTimeoutRoleId: string;
};

type Feedback = { kind: "success" | "error"; message: string } | null;

const AdminDashboard: React.FC<Props> = ({ data, error, loading, onRefresh }) => {
  const [config, setConfig] = useState<ConfigForm>(() => toForm(data));
  const [rewardLevel, setRewardLevel] = useState("1");
  const [rewardRoleId, setRewardRoleId] = useState("");
  const [filterInput, setFilterInput] = useState("");
  const [modChannelId, setModChannelId] = useState(data.modChannelId);
  const [logChannelId, setLogChannelId] = useState(data.logChannelId);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    setConfig(toForm(data));
    setModChannelId(data.modChannelId);
    setLogChannelId(data.logChannelId);
    if (!rewardRoleId && data.roles.length > 0) setRewardRoleId(data.roles[0].id);
  }, [data]);

  const runAction = async (action: () => Promise<void>, successMessage: string): Promise<void> => {
    setBusy(true);
    setFeedback(null);
    try {
      await action();
      const latest = await onRefresh();
      if (latest?.allowed) setFeedback({ kind: "success", message: successMessage });
    } catch (actionError: unknown) {
      setFeedback({ kind: "error", message: readError(actionError) });
    } finally {
      setBusy(false);
    }
  };

  const handleSaveConfig = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    await runAction(async () => {
      await deboDashboardServiceClient.saveAutomationConfig({
        xpMinPerMessage: Number(config.xpMinPerMessage),
        xpMaxPerMessage: Number(config.xpMaxPerMessage),
        xpCooldownSeconds: Number(config.xpCooldownSeconds),
        spamMessageLimit: Number(config.spamMessageLimit),
        spamWindowSeconds: Number(config.spamWindowSeconds),
        spamTimeoutSeconds: Number(config.spamTimeoutSeconds),
        spamTimeoutRoleId: config.spamTimeoutRoleId,
      });
    }, "Automation settings saved.");
  };

  const addReward = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    await runAction(async () => {
      await deboDashboardServiceClient.addRewardRole({
        level: Number(rewardLevel),
        roleId: rewardRoleId,
      });
    }, "Level reward added.");
  };

  const removeReward = async (level: number, roleId: string): Promise<void> => {
    await runAction(async () => {
      await deboDashboardServiceClient.removeRewardRole({ level, roleId });
    }, "Reward role removed.");
  };

  const clearRewardLevel = async (level: number): Promise<void> => {
    await runAction(async () => {
      await deboDashboardServiceClient.clearRewardLevel({ level });
    }, `Level ${level} rewards cleared.`);
  };

  const addFilterTerms = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    await runAction(async () => {
      await deboDashboardServiceClient.addFilterTerms({ terms: filterInput });
      setFilterInput("");
    }, "Filtered terms added.");
  };

  const removeFilterTerm = async (term: string): Promise<void> => {
    await runAction(async () => {
      await deboDashboardServiceClient.removeFilterTerms({ terms: term });
    }, "Filtered term removed.");
  };

  const clearFilter = async (): Promise<void> => {
    if (!globalThis.confirm("Remove every configured filter term? Word filtering will be disabled until a term is added.")) return;
    await runAction(async () => {
      await deboDashboardServiceClient.clearFilter({} as Empty);
    }, "The filter list is clear; word filtering is now disabled.");
  };

  const saveChannel = async (kind: "mod" | "logs", channelId: string): Promise<void> => {
    if (!channelId) {
      setFeedback({ kind: "error", message: "Choose a text channel first." });
      return;
    }
    await runAction(async () => {
      if (kind === "mod") await deboDashboardServiceClient.setModChannel({ channelId });
      else await deboDashboardServiceClient.setLogChannel({ channelId });
    }, kind === "mod" ? "Mod reports channel saved." : "Logs channel saved.");
  };

  const clearChannel = async (kind: "mod" | "logs"): Promise<void> => {
    await runAction(async () => {
      if (kind === "mod") await deboDashboardServiceClient.clearModChannel({} as Empty);
      else await deboDashboardServiceClient.clearLogChannel({} as Empty);
    }, kind === "mod" ? "Mod reports channel cleared." : "Logs channel cleared.");
  };

  const updateConfig = (key: keyof ConfigForm, value: string): void => {
    setConfig((current) => ({ ...current, [key]: value }));
  };

  return (
    <section className="page-content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">COMMUNITY CONTROL ROOM</p>
          <h1>Admin / Mod dashboard</h1>
          <p className="page-subtitle">Manage Debo’s automation and moderation setup for this community.</p>
        </div>
        <div className="heading-actions">
          <span className={data.isOwner ? "pill pill-owner" : "pill pill-moderator"}>{data.isOwner ? "OWNER" : "ADMIN ROLE"}</span>
          <button className="button button-quiet" onClick={() => void onRefresh()} disabled={loading || busy} type="button">
            <span aria-hidden="true">↻</span> {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && <div className="notice notice-error" role="alert"><strong>Could not refresh dashboard.</strong><span>{error}</span></div>}
      {feedback && <div className={`notice notice-${feedback.kind}`} role={feedback.kind === "error" ? "alert" : "status"}><span>{feedback.message}</span></div>}

      {!data.isOwner ? (
        <ModeratorInfo />
      ) : (
        <>
          <section className="admin-section">
            <div className="section-heading section-heading-compact">
              <div>
                <p className="eyebrow">AUTOMATION</p>
                <h2>Leveling & anti-spam</h2>
                <p className="section-subtitle">Values are validated and saved on Debo’s server.</p>
              </div>
              <span className="section-index">01</span>
            </div>
            <form className="config-grid" onSubmit={(event) => void handleSaveConfig(event)}>
              <article className="config-card card">
                <div className="card-title-row">
                  <span className="card-icon icon-violet" aria-hidden="true">✦</span>
                  <div><h3>Leveling</h3><p>XP earned from eligible messages.</p></div>
                </div>
                <div className="field-grid">
                  <NumberField label="Minimum XP" value={config.xpMinPerMessage} onChange={(value) => updateConfig("xpMinPerMessage", value)} min={1} max={10000} />
                  <NumberField label="Maximum XP" value={config.xpMaxPerMessage} onChange={(value) => updateConfig("xpMaxPerMessage", value)} min={1} max={10000} />
                  <NumberField className="field-full" label="XP cooldown (seconds)" value={config.xpCooldownSeconds} onChange={(value) => updateConfig("xpCooldownSeconds", value)} min={0} max={86400} />
                </div>
                <p className="field-hint">Set the cooldown to 0 to award XP on every eligible message.</p>
              </article>

              <article className="config-card card">
                <div className="card-title-row">
                  <span className="card-icon icon-orange" aria-hidden="true">⌁</span>
                  <div><h3>Anti-spam</h3><p>Message burst detection and timeout.</p></div>
                </div>
                <div className="field-grid">
                  <NumberField label="Message limit" value={config.spamMessageLimit} onChange={(value) => updateConfig("spamMessageLimit", value)} min={1} max={1000} />
                  <NumberField label="Window (seconds)" value={config.spamWindowSeconds} onChange={(value) => updateConfig("spamWindowSeconds", value)} min={0.1} max={60} step="0.1" />
                  <NumberField label="Timeout (seconds)" value={config.spamTimeoutSeconds} onChange={(value) => updateConfig("spamTimeoutSeconds", value)} min={0} max={86400} />
                  <label className="field field-full">
                    <span>Temporary spam role <span className="field-optional">OPTIONAL</span></span>
                    <select value={config.spamTimeoutRoleId} onChange={(event) => updateConfig("spamTimeoutRoleId", event.target.value)}>
                      <option value="">No timeout role</option>
                      {data.roles.map((role) => <option value={role.id} key={role.id}>{role.name}</option>)}
                    </select>
                  </label>
                </div>
                <p className="field-hint">The role is optional. If used, configure its channel permissions in Root; messages above the limit are still deleted without it.</p>
              </article>

              <div className="config-submit-row">
                <span>Changes apply to this community only.</span>
                <button className="button button-primary" type="submit" disabled={busy || loading}>{busy ? "Saving…" : "Save automation settings"}</button>
              </div>
            </form>
          </section>

          <section className="admin-section">
            <div className="section-heading section-heading-compact">
              <div>
                <p className="eyebrow">LEVEL PROGRESSION</p>
                <h2>Level rewards</h2>
                <p className="section-subtitle">Assign one or more community roles to a level. Existing mappings stay in place.</p>
              </div>
              <span className="section-index">02</span>
            </div>
            <div className="card reward-card">
              <form className="inline-form reward-form" onSubmit={(event) => void addReward(event)}>
                <NumberField label="Level" value={rewardLevel} onChange={setRewardLevel} min={1} max={1000} />
                <label className="field">
                  <span>Community role</span>
                  <select value={rewardRoleId} onChange={(event) => setRewardRoleId(event.target.value)} required>
                    <option value="" disabled>Select a role…</option>
                    {data.roles.map((role) => <option value={role.id} key={role.id}>{role.name}</option>)}
                  </select>
                </label>
                <button className="button button-primary" type="submit" disabled={busy || !rewardRoleId}>{busy ? "Saving…" : "Add reward"}</button>
              </form>
              {data.rewardMappings.length === 0 ? (
                <div className="compact-empty"><span className="empty-icon" aria-hidden="true">◇</span><span>No level rewards are configured yet.</span></div>
              ) : (
                <div className="reward-list">
                  {data.rewardMappings.map((mapping) => (
                    <div className="reward-row" key={mapping.level}>
                      <div className="reward-level"><span>LEVEL</span><strong>{mapping.level}</strong></div>
                      <div className="reward-role-list">
                        {mapping.roles.map((role) => (
                          <span className="role-chip" key={role.id}>
                            <span className="role-chip-dot" />{role.name}
                            <button className="chip-remove" aria-label={`Remove ${role.name} from level ${mapping.level}`} onClick={() => void removeReward(mapping.level, role.id)} disabled={busy} type="button">×</button>
                          </span>
                        ))}
                      </div>
                      <button className="text-button danger-text" onClick={() => void clearRewardLevel(mapping.level)} disabled={busy} type="button">Clear level</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="admin-section">
            <div className="section-heading section-heading-compact">
              <div>
                <p className="eyebrow">MESSAGE SAFETY</p>
                <h2>Word filter</h2>
                <p className="section-subtitle">Only terms you add are filtered. The list is empty and filtering is disabled until you add a term.</p>
              </div>
              <span className="section-index">03</span>
            </div>
            <div className="card filter-card">
              <form className="filter-add-form" onSubmit={(event) => void addFilterTerms(event)}>
                <label className="field filter-input-field">
                  <span>Add words or phrases</span>
                  <input type="text" value={filterInput} onChange={(event) => setFilterInput(event.target.value)} placeholder="Separate multiple terms with commas" maxLength={500} />
                </label>
                <button className="button button-primary" type="submit" disabled={busy || !filterInput.trim()}>{busy ? "Saving…" : "Add terms"}</button>
              </form>
              <div className="filter-list-header">
                <div><span className="field-label">CONFIGURED TERMS</span><span className="count-badge">{data.filterWords.length}</span></div>
                {data.filterWords.length > 0 && <button className="text-button danger-text" onClick={() => void clearFilter()} disabled={busy} type="button">Clear all</button>}
              </div>
              {data.filterWords.length === 0 ? (
                <div className="filter-empty"><span className="filter-empty-icon" aria-hidden="true">⌕</span><div><strong>Filtering is off</strong><span>Add explicit terms above to enable the word filter.</span></div></div>
              ) : (
                <div className="filter-term-list">
                  {data.filterWords.map((term) => (
                    <span className="filter-term" key={term}>{term}<button className="chip-remove" aria-label={`Remove filter term ${term}`} onClick={() => void removeFilterTerm(term)} disabled={busy} type="button">×</button></span>
                  ))}
                </div>
              )}
              <p className="field-hint">Matching is case-insensitive and catches common obfuscation patterns. A match is deleted and audited, and the author receives a same-channel reply that auto-deletes after 10 seconds.</p>
            </div>
          </section>

          <section className="admin-section last-admin-section">
            <div className="section-heading section-heading-compact">
              <div>
                <p className="eyebrow">MODERATION WORKFLOW</p>
                <h2>Report & audit channels</h2>
                <p className="section-subtitle">Keep private moderator reports separate from action and filter audit logs.</p>
              </div>
              <span className="section-index">04</span>
            </div>
            <div className="channel-config-grid">
              <ChannelCard
                title="Mod reports"
                description="Private reports and moderation notices."
                icon="◌"
                value={modChannelId}
                channels={data.channels}
                busy={busy}
                onChange={setModChannelId}
                onSave={() => void saveChannel("mod", modChannelId)}
                onClear={() => void clearChannel("mod")}
              />
              <ChannelCard
                title="Action & filter logs"
                description="Audit entries for moderation actions and filtered messages."
                icon="≋"
                value={logChannelId}
                channels={data.channels}
                busy={busy}
                onChange={setLogChannelId}
                onSave={() => void saveChannel("logs", logChannelId)}
                onClear={() => void clearChannel("logs")}
              />
            </div>
          </section>
        </>
      )}
    </section>
  );
};

const ModeratorInfo: React.FC = () => (
  <section className="card moderator-info-card">
    <span className="card-icon icon-blue" aria-hidden="true">▦</span>
    <div>
      <p className="eyebrow">MODERATOR ACCESS</p>
      <h2>Your Admin Role is active.</h2>
      <p>The current Debo policy keeps automation, reward, filter, and channel configuration Owner-only. Ask the selected Owner to make those changes here. Your moderation commands remain available in community chat.</p>
      <div className="command-pills"><span>!modhelp</span><span>!warn</span><span>!warnings</span><span>!unwarn</span><span>!purge</span></div>
    </div>
  </section>
);

const ChannelCard: React.FC<{
  title: string;
  description: string;
  icon: string;
  value: string;
  channels: ChannelOption[];
  busy: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
  onClear: () => void;
}> = ({ title, description, icon, value, channels, busy, onChange, onSave, onClear }) => (
  <article className="channel-card card">
    <div className="card-title-row">
      <span className="card-icon icon-blue" aria-hidden="true">{icon}</span>
      <div><h3>{title}</h3><p>{description}</p></div>
    </div>
    <label className="field">
      <span>Text channel</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select a channel…</option>
        {channels.map((channel) => <option value={channel.id} key={channel.id}>{channel.name}</option>)}
      </select>
    </label>
    {channels.length === 0 && <p className="field-hint">No text channels were returned. Check Debo’s Root channel permissions.</p>}
    <div className="channel-actions">
      <button className="button button-secondary" onClick={onSave} disabled={busy || !value} type="button">Save channel</button>
      <button className="text-button" onClick={onClear} disabled={busy || !value} type="button">Clear</button>
    </div>
  </article>
);

const NumberField: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  min: number;
  max: number;
  step?: string;
  className?: string;
}> = ({ label, value, onChange, min, max, step, className = "" }) => (
  <label className={`field ${className}`}>
    <span>{label}</span>
    <input type="number" value={value} onChange={(event) => onChange(event.target.value)} min={min} max={max} step={step ?? 1} required />
  </label>
);

function toForm(data: AdminDashboardResponse): ConfigForm {
  return {
    xpMinPerMessage: String(data.xpMinPerMessage),
    xpMaxPerMessage: String(data.xpMaxPerMessage),
    xpCooldownSeconds: String(data.xpCooldownSeconds),
    spamMessageLimit: String(data.spamMessageLimit),
    spamWindowSeconds: String(data.spamWindowSeconds),
    spamTimeoutSeconds: String(data.spamTimeoutSeconds),
    spamTimeoutRoleId: data.spamTimeoutRoleId,
  };
}

function readError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "The change could not be saved. Check Debo’s permissions and try again.";
}

export default AdminDashboard;
