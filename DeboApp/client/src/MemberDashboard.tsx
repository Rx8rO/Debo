import React, { useState } from "react";
import { MemberDashboardResponse, RankEntry } from "@deboapp/gen-shared";

type Props = {
  data: MemberDashboardResponse | null;
  loading: boolean;
  error: string;
  onRefresh: () => Promise<void>;
};

const MemberDashboard: React.FC<Props> = ({ data, loading, error, onRefresh }) => {
  const [limit, setLimit] = useState<5 | 10>(5);
  const member = data?.member;
  const rows = limit === 5 ? data?.topFive ?? [] : data?.topTen ?? [];

  return (
    <section className="page-content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR COMMUNITY, YOUR PROGRESS</p>
          <h1>Member dashboard</h1>
          <p className="page-subtitle">Your level and place on the community leaderboard.</p>
        </div>
        <button className="button button-quiet" onClick={() => void onRefresh()} disabled={loading} type="button">
          <span aria-hidden="true">↻</span> {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="notice notice-error" role="alert">
          <strong>Could not load your community data.</strong>
          <span>{error}</span>
        </div>
      )}

      <div className="member-hero-grid">
        <article className="member-hero card">
          <div className="hero-decoration hero-decoration-one" />
          <div className="hero-decoration hero-decoration-two" />
          <div className="hero-topline">
            <span className="pill pill-member">MEMBER OVERVIEW</span>
            <span className="hero-spark" aria-hidden="true">✦</span>
          </div>
          <div className="member-greeting">
            <span className="avatar-placeholder" aria-hidden="true">{member?.displayName?.slice(0, 1).toUpperCase() || "M"}</span>
            <div>
              <p className="muted-label">WELCOME BACK</p>
              <h2>{member?.displayName || "Your profile"}</h2>
            </div>
          </div>
          <div className="hero-divider" />
          <div className="hero-stats">
            <div>
              <span className="muted-label">CURRENT LEVEL</span>
              <strong>{member ? member.level : "—"}</strong>
            </div>
            <div>
              <span className="muted-label">COMMUNITY RANK</span>
              <strong>{member ? (member.isRanked ? `#${member.rank}` : "Unranked") : "—"}</strong>
            </div>
            <div>
              <span className="muted-label">TOTAL XP</span>
              <strong>{member ? formatNumber(member.totalXp) : "—"}</strong>
            </div>
          </div>
          <div className="hero-caption">
            <span className="caption-mark" aria-hidden="true">↗</span>
            <span>Keep taking part in the community to earn XP and unlock new levels.</span>
          </div>
        </article>

        <article className="side-stat card">
          <div className="side-stat-icon" aria-hidden="true">✦</div>
          <p className="eyebrow">LEVELING</p>
          <h2>Every message can move you forward.</h2>
          <p className="side-stat-copy">Eligible messages earn XP based on this community’s settings. Level rewards are granted automatically when you reach their configured level.</p>
          <div className="side-stat-footer">
            <span className="status-dot" /> Public member view
          </div>
        </article>
      </div>

      <section className="leaderboard-section card">
        <div className="section-heading leaderboard-heading">
          <div>
            <p className="eyebrow">COMMUNITY STANDINGS</p>
            <h2>Leaderboard</h2>
            <p className="section-subtitle">Top members by total earned XP.</p>
          </div>
          <div className="segmented-control" role="group" aria-label="Leaderboard size">
            <button className={limit === 5 ? "selected" : ""} onClick={() => setLimit(5)} type="button">Top 5</button>
            <button className={limit === 10 ? "selected" : ""} onClick={() => setLimit(10)} type="button">Top 10</button>
          </div>
        </div>

        {loading && !data ? (
          <div className="list-loading"><span className="loading-orb small" />Loading leaderboard…</div>
        ) : error && !data ? (
          <div className="list-empty">
            <span className="empty-icon" aria-hidden="true">⌁</span>
            <strong>Community data isn’t connected</strong>
            <span>Open Debo in Root to load live member data.</span>
          </div>
        ) : rows.length === 0 ? (
          <div className="list-empty">
            <span className="empty-icon" aria-hidden="true">◇</span>
            <strong>No XP earned yet</strong>
            <span>The leaderboard will appear as members earn XP.</span>
          </div>
        ) : (
          <div className="leaderboard-table-wrap">
            <table className="leaderboard-table">
              <thead>
                <tr>
                  <th className="rank-col">RANK</th>
                  <th>MEMBER</th>
                  <th>LEVEL</th>
                  <th className="xp-col">TOTAL XP</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <LeaderboardRow key={row.userId} row={row} index={index} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="leaderboard-footnote">
          <span className="footnote-dot" /> Only XP-earners appear in the standings.
        </div>
      </section>
    </section>
  );
};

const LeaderboardRow: React.FC<{ row: RankEntry; index: number }> = ({ row, index }) => (
  <tr className={index < 3 ? `leader-row leader-row-${index + 1}` : "leader-row"}>
    <td><span className={index < 3 ? `rank-badge rank-badge-${index + 1}` : "rank-badge"}>{row.rank}</span></td>
    <td>
      <span className="leader-member">
        <span className="leader-avatar">{row.displayName.slice(0, 1).toUpperCase() || "?"}</span>
        <span>{row.displayName}</span>
      </span>
    </td>
    <td><span className="level-tag">Level {row.level}</span></td>
    <td className="xp-value">{formatNumber(row.totalXp)}</td>
  </tr>
);

function formatNumber(value: string): string {
  const number = Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat("en-US").format(number) : value;
}

export default MemberDashboard;
