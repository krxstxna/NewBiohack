import { CentralAnchor } from "./CentralAnchor";
import { EcosystemPod } from "./EcosystemPod";
import type { Metrics, PodId, Profile } from "../../types/profile";
import { buildPodPreview, getArchetypeHeader } from "../../lib/profileHelpers";
import { Button } from "../ui/Button";
import { GenoFitLogo } from "../ui/GenoFitLogo";

interface ProfileWhiteboardProps {
  userName: string;
  profile: Profile | null;
  metrics: Metrics | null;
  avatarSrc: string;
  loading?: boolean;
  status?: string;
  onOpenPod: (podId: PodId) => void;
  onContinueChat: () => void;
  onRetry?: () => void;
}

const PODS: PodId[] = ["training", "fuel", "recovery", "story"];

export function ProfileWhiteboard({
  userName,
  profile,
  metrics,
  avatarSrc,
  loading,
  status,
  onOpenPod,
  onContinueChat,
  onRetry,
}: ProfileWhiteboardProps) {
  const { name, tagline } = getArchetypeHeader(profile);
  const badge = profile?.archetype?.vq_cluster_label || name || undefined;

  const isError = status?.toLowerCase().includes("fail") || status?.toLowerCase().includes("error") || status?.toLowerCase().includes("could not");

  return (
    <div className="flex min-h-screen flex-col bg-[#F8FAFC]">
      <header className="border-b border-slate-100 bg-white/70 px-6 py-5 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4">
          <div className="rounded-2xl bg-slate-900 px-4 py-2.5 shadow-sm">
            <GenoFitLogo className="h-10 w-auto sm:h-11" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-slate-800 sm:text-3xl">
              Hi, <span className="text-teal-600">{userName || "there"}</span>
            </h1>
            {name ? (
              <p className="mt-1 text-sm italic text-slate-500">
                {name}
                {tagline ? ` — ${tagline}` : ""}
              </p>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center px-4 py-6 sm:px-8">
        {/* Mobile stack */}
        <div className="flex w-full flex-col items-center gap-4 md:hidden">
          {PODS.slice(0, 2).map((id) => (
            <EcosystemPod
              key={id}
              podId={id}
              preview={buildPodPreview(id, profile, metrics)}
              disabled={loading || !profile}
              onOpen={() => onOpenPod(id)}
            />
          ))}
          <CentralAnchor avatarSrc={avatarSrc} badge={badge} />
          {PODS.slice(2).map((id) => (
            <EcosystemPod
              key={id}
              podId={id}
              preview={buildPodPreview(id, profile, metrics)}
              disabled={loading || !profile}
              onOpen={() => onOpenPod(id)}
            />
          ))}
        </div>

        {/* Desktop whiteboard grid */}
        <div className="hidden w-full flex-1 md:grid md:min-h-[640px] md:grid-cols-3 md:grid-rows-3 md:items-center md:gap-6 lg:min-h-[720px] lg:gap-8">
          <div className="col-start-1 row-start-1 flex justify-end">
            <EcosystemPod
              podId="training"
              preview={buildPodPreview("training", profile, metrics)}
              disabled={loading || !profile}
              onOpen={() => onOpenPod("training")}
            />
          </div>
          <div className="col-start-3 row-start-1 flex justify-start">
            <EcosystemPod
              podId="fuel"
              preview={buildPodPreview("fuel", profile, metrics)}
              disabled={loading || !profile}
              onOpen={() => onOpenPod("fuel")}
            />
          </div>
          <div className="col-start-2 row-start-2 flex justify-center">
            <CentralAnchor avatarSrc={avatarSrc} badge={badge} />
          </div>
          <div className="col-start-1 row-start-3 flex justify-end">
            <EcosystemPod
              podId="recovery"
              preview={buildPodPreview("recovery", profile, metrics)}
              disabled={loading || !profile}
              onOpen={() => onOpenPod("recovery")}
            />
          </div>
          <div className="col-start-3 row-start-3 flex justify-start">
            <EcosystemPod
              podId="story"
              preview={buildPodPreview("story", profile, metrics)}
              disabled={loading || !profile}
              onOpen={() => onOpenPod("story")}
            />
          </div>
        </div>

        <div className="mt-8 flex w-full max-w-md flex-col items-center gap-4">
          <p className={`text-center text-sm ${isError ? "text-rose-600" : "text-slate-500"}`}>
            {status || "Tap a pillar to explore your profile"}
          </p>
          {isError && onRetry ? (
            <Button onClick={onRetry}>Retry analysis</Button>
          ) : null}
          <Button variant="secondary" onClick={onContinueChat}>
            Continue to chat
          </Button>
        </div>
      </main>
    </div>
  );
}
