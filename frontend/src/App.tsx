import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ProfileWhiteboard } from "./components/profile/ProfileWhiteboard";
import { ProfileDetail } from "./components/profile/ProfileDetail";
import { OnboardingFlow } from "./components/onboarding/OnboardingFlow";
import { ChatWorkspace } from "./components/chat/ChatWorkspace";
import { getApiBase, formatApiError, parseApiResponse } from "./api/client";
import type { Metrics, PodId, Profile } from "./types/profile";
import { pickAvatar } from "./lib/profileHelpers";

type View = "onboarding" | "profile" | "profile-detail" | "chat";

const STORAGE_KEY = "genofit_onboarding";

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
  const [activePod, setActivePod] = useState<PodId>("training");
  const [userName, setUserName] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [history, setHistory] = useState<{ role: string; content: string }[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileStatus, setProfileStatus] = useState("");
  const [ready, setReady] = useState(false);
  const avatarSrc = useMemo(() => pickAvatar(), []);

  const finishToChat = () => {
    saveOnboarding({ complete: true, dashboardViewed: true, name: userName });
    setView("chat");
  };

  const runProfileAnalyze = async () => {
    setProfileLoading(true);
    setProfileStatus("Analyzing your profile…");
    try {
      const res = await fetch(`${getApiBase()}/profile/analyze`, { method: "POST" });
      const data = await parseApiResponse(res);
      if (!res.ok) throw new Error(formatApiError(data, res.status));
      setProfile(data.profile || null);
      if (data.metrics) setMetrics(data.metrics);
      setProfileStatus("Tap a pillar to explore your profile");
    } catch (err) {
      setProfileStatus(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setProfileLoading(false);
    }
  };

  const showProfileHub = async (name: string) => {
    setUserName(name);
    saveOnboarding({ name, complete: true });
    setView("profile");
    await runProfileAnalyze();
  };

  useEffect(() => {
    const saved = loadOnboarding();
    if (saved.name) setUserName(saved.name);

    (async () => {
      try {
        const res = await fetch(`${getApiBase()}/session`);
        const data = await parseApiResponse(res);
        if (data.profile && Object.keys(data.profile).length) setProfile(data.profile);
        if (data.metrics) setMetrics(data.metrics);
        if (data.history) setHistory(data.history);

        if (saved.complete && saved.dashboardViewed) {
          setView("chat");
        } else if (saved.complete && data.has_profile) {
          setView("profile");
          setProfileStatus("Tap a pillar to explore your profile");
        } else if (!saved.complete) {
          setView("onboarding");
        } else {
          setView("chat");
        }
      } catch {
        setView(saved.complete ? "chat" : "onboarding");
      } finally {
        setReady(true);
      }
    })();
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] text-slate-500">
        Loading GenoFit…
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
              onComplete={showProfileHub}
              onSkipToChat={(name) => {
                setUserName(name);
                saveOnboarding({ name, complete: true, dashboardViewed: true });
                setView("chat");
              }}
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
              onContinueChat={finishToChat}
            />
          </motion.div>
        )}

        {view === "profile-detail" && (
          <motion.div key="detail" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
            <ProfileDetail
              podId={activePod}
              profile={profile}
              onBack={() => setView("profile")}
              onContinueChat={finishToChat}
            />
          </motion.div>
        )}

        {view === "chat" && (
          <motion.div key="chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <ChatWorkspace
              userName={userName}
              history={history}
              onHistoryChange={setHistory}
              onOpenProfile={() => setView("profile")}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
