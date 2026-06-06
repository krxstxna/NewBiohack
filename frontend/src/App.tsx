import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ProfileWhiteboard } from "./components/profile/ProfileWhiteboard";
import { ProfileDetail } from "./components/profile/ProfileDetail";
import { OnboardingFlow } from "./components/onboarding/OnboardingFlow";
import { ChatWorkspace } from "./components/chat/ChatWorkspace";
import { getApiBase, formatApiError, parseApiResponse } from "./api/client";
import type { GeneInfo, LabReport, Metrics, PodId, Profile } from "./types/profile";
import { GenoFitLogo } from "./components/ui/GenoFitLogo";
import { pickAvatar } from "./lib/profileHelpers";
import { clearSession, fetchSession, syncJunctionWearables } from "./lib/onboardingApi";

type View = "onboarding" | "profile" | "profile-detail" | "chat";

const STORAGE_KEY = "genofit_onboarding";

const JUNCTION_LABELS: Record<string, string> = {
  oura: "Oura",
  fitbit: "Fitbit",
  garmin: "Garmin",
};

interface OnboardingState {
  complete?: boolean;
  dashboardViewed?: boolean;
  name?: string;
}

function loadOnboarding(): OnboardingState {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveOnboarding(data: Partial<OnboardingState>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...loadOnboarding(), ...data }));
}

export default function App() {
  const [view, setView] = useState<View>("onboarding");
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [showReset, setShowReset] = useState(false);
  const [activePod, setActivePod] = useState<PodId>("training");
  const [userName, setUserName] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [genes, setGenes] = useState<Record<string, GeneInfo>>({});
  const [labReports, setLabReports] = useState<LabReport[]>([]);
  const [history, setHistory] = useState<{ role: string; content: string }[]>([]);
  const [pendingChatMessage, setPendingChatMessage] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileStatus, setProfileStatus] = useState("");
  const [ready, setReady] = useState(false);
  const avatarSrc = useMemo(() => pickAvatar(), []);

  const refreshSessionData = useCallback(async () => {
    try {
      const data = await fetchSession();
      if (data.genes) setGenes(data.genes as Record<string, GeneInfo>);
      if (data.lab_reports) setLabReports(data.lab_reports);
      if (data.metrics) setMetrics(data.metrics);
      if (data.profile && Object.keys(data.profile as object).length) setProfile(data.profile as Profile);
    } catch {
      // ignore
    }
  }, []);

  const finishToChat = (message?: string) => {
    saveOnboarding({ complete: true, dashboardViewed: true, name: userName });
    if (message) setPendingChatMessage(message);
    setView("chat");
  };

  const runProfileAnalyze = useCallback(async () => {
    setProfileLoading(true);
    setProfileStatus("Analyzing your profile…");
    try {
      const res = await fetch(`${getApiBase()}/profile/analyze`, { method: "POST" });
      const data = await parseApiResponse(res);
      if (!res.ok) throw new Error(formatApiError(data, res.status));
      setProfile(data.profile || null);
      if (data.metrics) setMetrics(data.metrics);
      setProfileStatus("Tap a pillar to explore your profile");
      return true;
    } catch (err) {
      setProfileStatus(err instanceof Error ? err.message : "Analysis failed");
      return false;
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const showProfileHub = async (name: string, incomingMetrics: Metrics | null = null) => {
    setUserName(name);
    saveOnboarding({ name, complete: true, dashboardViewed: false });
    if (incomingMetrics) setMetrics(incomingMetrics);
    setView("profile");
    await runProfileAnalyze();
  };

  const skipToChat = async (name: string) => {
    setUserName(name);
    saveOnboarding({ name, complete: true, dashboardViewed: true });
    await refreshSessionData();
    setView("chat");
  };

  const goToWelcome = () => {
    saveOnboarding({ complete: false, dashboardViewed: false });
    localStorage.removeItem("genofit_profile_avatar");
    setOnboardingStep(0);
    setView("onboarding");
  };

  const startOver = async () => {
    await clearSession();
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem("genofit_profile_avatar");
    window.location.href = window.location.pathname;
  };

  const openProfileHub = () => {
    setView("profile");
    if (!profile) {
      void runProfileAnalyze();
    } else {
      setProfileStatus("Tap a pillar to explore your profile");
    }
  };

  useEffect(() => {
    (async () => {
      if (new URLSearchParams(window.location.search).get("reset") === "1") {
        await clearSession();
        localStorage.removeItem(STORAGE_KEY);
        window.history.replaceState({}, "", window.location.pathname);
      }

      const saved = loadOnboarding();
      if (saved.name) setUserName(saved.name);

      const params = new URLSearchParams(window.location.search);
      const junctionProvider = params.get("junction_provider");
      if (junctionProvider) {
        window.history.replaceState({}, "", window.location.pathname);
        setOnboardingStep(2);
        setView("onboarding");
        setReady(true);

        if (params.get("state") !== "success") {
          return;
        }

        try {
          const data = await syncJunctionWearables(saved.name || "");
          if (data.metrics) setMetrics(data.metrics);
          if (saved.name) {
            await showProfileHub(saved.name, data.metrics || null);
          }
        } catch {
          // Stay on wearable step; user can retry
        }
        return;
      }

      try {
        const data = await fetchSession();
        if (data.profile && Object.keys(data.profile as object).length) {
          setProfile(data.profile as Profile);
        }
        if (data.metrics) setMetrics(data.metrics);
        if (data.genes) setGenes(data.genes as Record<string, GeneInfo>);
        if (data.lab_reports) setLabReports(data.lab_reports);
        if (data.history) setHistory(data.history);

        const hasData =
          !!data.has_genes ||
          !!data.has_metrics ||
          !!data.has_lab_reports ||
          (data.history_length || 0) > 0;
        setShowReset(hasData || !!saved.complete);

        const onboardingDone = saved.complete === true;
        const dashboardViewed = saved.dashboardViewed === true;

        if (onboardingDone && dashboardViewed) {
          setView("chat");
        } else if (onboardingDone && data.has_profile && data.has_metrics && !dashboardViewed) {
          setView("profile");
          setProfileStatus("Tap a pillar to explore your profile");
        } else if (onboardingDone) {
          setView("chat");
        } else {
          setView("onboarding");
          setOnboardingStep(0);
        }
      } catch {
        setShowReset(!!saved.complete);
        setView(saved.complete ? "chat" : "onboarding");
      } finally {
        setReady(true);
      }
    })();
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#F8FAFC]">
        <div className="rounded-2xl bg-slate-900 px-4 py-2.5 shadow-sm">
          <GenoFitLogo className="h-10 w-auto" />
        </div>
        <p className="text-slate-500">Loading GenoFit…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <AnimatePresence mode="wait">
        {view === "onboarding" && (
          <motion.div key="onboarding" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <OnboardingFlow
              initialName={userName}
              initialStep={onboardingStep}
              showReset={showReset}
              onNameSave={(name) => {
                setUserName(name);
                saveOnboarding({ name });
              }}
              onProfileReady={showProfileHub}
              onSkipToChat={skipToChat}
              onSessionRefresh={() => void refreshSessionData()}
            />
          </motion.div>
        )}

        {view === "profile" && (
          <motion.div key="profile" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <ProfileWhiteboard
              userName={userName}
              profile={profile}
              metrics={metrics}
              avatarSrc={avatarSrc}
              loading={profileLoading}
              status={profileStatus}
              onOpenPod={(podId) => {
                setActivePod(podId);
                setView("profile-detail");
              }}
              onContinueChat={() => finishToChat()}
              onRetry={() => void runProfileAnalyze()}
            />
          </motion.div>
        )}

        {view === "profile-detail" && (
          <motion.div key="detail" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
            <ProfileDetail
              podId={activePod}
              profile={profile}
              metrics={metrics}
              onBack={() => setView("profile")}
              onContinueChat={() => finishToChat()}
              onAskInChat={(message) => finishToChat(message)}
            />
          </motion.div>
        )}

        {view === "chat" && (
          <motion.div key="chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <ChatWorkspace
              userName={userName}
              profile={profile}
              genes={genes}
              labReports={labReports}
              metrics={metrics}
              history={history}
              pendingMessage={pendingChatMessage}
              onPendingMessageHandled={() => setPendingChatMessage(null)}
              onHistoryChange={setHistory}
              onOpenProfile={openProfileHub}
              onGoHome={goToWelcome}
              onStartOver={startOver}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
