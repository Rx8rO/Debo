import React, { useEffect, useState } from "react";
import { deboDashboardServiceClient } from "@deboapp/gen-client";
import { Empty, AdminDashboardResponse, MemberDashboardResponse } from "@deboapp/gen-shared";
import AdminDashboard from "./AdminDashboard";
import MemberDashboard from "./MemberDashboard";
import "./styles.css";

type DashboardView = "member" | "admin";

const App: React.FC = () => {
  const [view, setView] = useState<DashboardView>("member");
  const [memberData, setMemberData] = useState<MemberDashboardResponse | null>(null);
  const [adminData, setAdminData] = useState<AdminDashboardResponse | null>(null);
  const [memberLoading, setMemberLoading] = useState(true);
  const [adminLoading, setAdminLoading] = useState(true);
  const [memberError, setMemberError] = useState("");
  const [adminError, setAdminError] = useState("");

  const refreshMember = async (): Promise<void> => {
    setMemberLoading(true);
    setMemberError("");
    try {
      setMemberData(await deboDashboardServiceClient.getMemberDashboard({}));
    } catch (error: unknown) {
      setMemberError(readableError(error));
    } finally {
      setMemberLoading(false);
    }
  };

  const refreshAdmin = async (): Promise<AdminDashboardResponse | null> => {
    setAdminLoading(true);
    setAdminError("");
    try {
      const data = await deboDashboardServiceClient.getAdminDashboard({} as Empty);
      setAdminData(data);
      if (!data.allowed) setView("member");
      return data;
    } catch (error: unknown) {
      setAdminError(readableError(error));
      setAdminData(null);
      return null;
    } finally {
      setAdminLoading(false);
    }
  };

  useEffect(() => {
    void refreshMember();
    void refreshAdmin();
  }, []);

  const canOpenAdmin = adminData?.allowed === true;

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#member" onClick={() => setView("member")}>
          <span className="brand-mark" aria-hidden="true">D</span>
          <span className="brand-copy">
            <strong>DEBO</strong>
            <small>COMMUNITY DASHBOARDS</small>
          </span>
        </a>
        <nav className="dashboard-nav" aria-label="Dashboards">
          <button
            className={view === "member" ? "nav-button active" : "nav-button"}
            onClick={() => setView("member")}
            type="button"
          >
            <span className="nav-icon" aria-hidden="true">◈</span>
            Member
          </button>
          {canOpenAdmin && (
            <button
              className={view === "admin" ? "nav-button active" : "nav-button"}
              onClick={() => setView("admin")}
              type="button"
            >
              <span className="nav-icon" aria-hidden="true">▦</span>
              Admin / Mod
            </button>
          )}
          {!canOpenAdmin && adminLoading && (
            <span className="nav-checking">Checking access…</span>
          )}
        </nav>
        <div className="topbar-status">
          <span className="status-dot" />
          <span>{canOpenAdmin ? (adminData?.isOwner ? "Owner access" : "Moderator access") : "Community member"}</span>
        </div>
      </header>

      {view === "member" ? (
        <MemberDashboard
          data={memberData}
          loading={memberLoading}
          error={memberError}
          onRefresh={refreshMember}
        />
      ) : canOpenAdmin && adminData ? (
        <AdminDashboard
          data={adminData}
          error={adminError}
          loading={adminLoading}
          onRefresh={refreshAdmin}
        />
      ) : (
        <section className="page-content">
          <div className="empty-state card">
            <div className="loading-orb" />
            <h2>Checking dashboard access</h2>
            <p>Debo verifies your community role on the server before opening moderation tools.</p>
          </div>
        </section>
      )}

      <footer className="app-footer">
        <span>DEBO · COMMUNITY MANAGEMENT</span>
        <span>Member and Admin / Mod dashboards</span>
      </footer>
    </main>
  );
};

function readableError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "The dashboard could not connect to Debo. Open the App in Root and try again.";
}

export default App;
