import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { GenoFitLogo } from "../ui/GenoFitLogo";
import type { Metrics } from "../../types/profile";
import type { LabUploadResult } from "../../lib/onboardingApi";
import {
  clearSession,
  connectJunctionWearable,
  fetchSession,
  formatFetchError,
  labUploadSummary,
  metricsStatus,
  reportLabel,
  uploadAppleHealth,
  uploadLabReports,
} from "../../lib/onboardingApi";

interface OnboardingFlowProps {
  initialName?: string;
  initialStep?: number;
  showReset?: boolean;
  onNameSave: (name: string) => void;
  onProfileReady: (name: string, metrics: Metrics | null) => void;
  onSkipToChat: (name: string) => void;
}

type UploadState = "idle" | "loading" | "ok" | "error";

const JUNCTION_PROVIDERS: Record<string, string> = {
  oura: "Oura",
  fitbit: "Fitbit",
};

const CATEGORIES = ["Bloodwork", "ancestry", "gut microbiome", "other genetic"];

function truncate(text: string, max: number) {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export function OnboardingFlow({
  initialName = "",
  initialStep = 0,
  showReset = false,
  onNameSave,
  onProfileReady,
  onSkipToChat,
}: OnboardingFlowProps) {
  const [step, setStep] = useState(initialStep);
  const [name, setName] = useState(initialName);
  const [labStatus, setLabStatus] = useState<{ state: UploadState; text: string }>({ state: "idle", text: "" });
  const [wearableStatus, setWearableStatus] = useState<{ state: UploadState; text: string }>({
    state: "idle",
    text: "",
  });
  const [labFiles, setLabFiles] = useState<{ name: string; ok: boolean; subtitle?: string }[]>([]);
  const [uploadedLabNames, setUploadedLabNames] = useState<Set<string>>(new Set());
  const [selectedWearable, setSelectedWearable] = useState<string | null>(null);
  const labInputRef = useRef<HTMLInputElement>(null);
  const appleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setStep(initialStep);
  }, [initialStep]);

  useEffect(() => {
    void (async () => {
      try {
        const data = await fetchSession();
        if (!data.has_lab_reports && !data.has_genes) return;
        const reports = data.lab_reports || [];
        const rows = reports.map((r) => ({
          name: r.filename || "Report",
          ok: true,
          subtitle: reportLabel(r.report_type),
        }));
        setLabFiles(rows);
        setUploadedLabNames(new Set(reports.map((r) => r.filename || "").filter(Boolean)));
        setLabStatus({ state: "ok", text: labUploadSummary({ lab_reports: reports, genes: data.genes as LabUploadResult["genes"] }) });
      } catch {
        // Session unavailable — user can still upload
      }
    })();
  }, []);

  const goToProfile = (metrics: Metrics | null) => {
    onProfileReady(name.trim(), metrics);
  };

  const handleLabUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    const incoming = Array.from(files);
    const newFiles = incoming.filter((f) => !uploadedLabNames.has(f.name));
    if (!newFiles.length) {
      setLabStatus({ state: "ok", text: `${uploadedLabNames.size} file(s) already added` });
      return;
    }

    setLabStatus({ state: "loading", text: `Parsing ${newFiles.length} PDF${newFiles.length > 1 ? "s" : ""}…` });
    try {
      const data = await uploadLabReports(newFiles);
      const nextNames = new Set(uploadedLabNames);
      const nextRows = [...labFiles];

      for (const fileName of data.files_processed || []) {
        nextNames.add(fileName);
        const report = (data.lab_reports || []).find((r) => r.filename === fileName);
        nextRows.push({ name: fileName, ok: true, subtitle: report ? reportLabel(report.report_type) : undefined });
      }
      for (const fail of data.files_failed || []) {
        nextRows.push({ name: fail.filename, ok: false, subtitle: "Could not read" });
      }

      setUploadedLabNames(nextNames);
      setLabFiles(nextRows);
      setLabStatus({ state: "ok", text: labUploadSummary(data) });
    } catch (err) {
      setLabStatus({ state: "error", text: formatFetchError(err) });
    }
  };

  const handleAppleUpload = async (file: File | undefined) => {
    if (!file) return;
    setWearableStatus({ state: "loading", text: `Syncing ${file.name}…` });
    try {
      const data = await uploadAppleHealth(file, name.trim());
      setWearableStatus({ state: "ok", text: metricsStatus(data.metrics, data.junction) });
      window.setTimeout(() => goToProfile(data.metrics || null), 600);
    } catch (err) {
      setWearableStatus({ state: "error", text: formatFetchError(err) });
    }
  };

  const handleJunctionConnect = async (wearable: string) => {
    const label = JUNCTION_PROVIDERS[wearable] || wearable;
    setSelectedWearable(wearable);
    setWearableStatus({ state: "loading", text: `Connecting ${label}…` });
    try {
      const data = await connectJunctionWearable(wearable, name.trim());
      if (data.link_web_url) {
        window.location.href = data.link_web_url;
        return;
      }
      const count = Object.keys(data.metrics || {}).filter(
        (k) => !k.startsWith("junction_") && k !== "sources",
      ).length;
      const mode = data.connection?.mode;
      let status = count
        ? `${count} metrics synced`
        : mode === "demo"
          ? `${label} demo data connected — syncing may take a moment`
          : `${label} connected`;
      if (data.junction?.sources?.length) status += ` · Junction (${data.junction.sources.join(", ")})`;
      if (data.junction?.errors?.length) status += ` · ${data.junction.errors[0]}`;
      setWearableStatus({ state: "ok", text: status });
      window.setTimeout(() => goToProfile(data.metrics || null), count ? 600 : 1200);
    } catch (err) {
      setWearableStatus({ state: "error", text: formatFetchError(err) });
    }
  };

  const statusClass = (state: UploadState) =>
    state === "error" ? "text-rose-600" : state === "loading" ? "text-teal-600" : "text-slate-500";

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] p-6">
      <div className="w-full max-w-md rounded-[32px] border border-slate-100 bg-white/70 p-8 shadow-sm backdrop-blur-md">
        <div className="mb-6 flex justify-center">
          <div className="rounded-2xl bg-slate-900 px-4 py-2.5 shadow-sm">
            <GenoFitLogo className="h-10 w-auto" />
          </div>
        </div>

        {step === 0 && (
          <>
            <h1 className="text-2xl font-bold text-slate-800">Hi there,</h1>
            <p className="mt-2 text-slate-500">What is your name?</p>
            <Input
              className="mt-6"
              placeholder="Your name"
              value={name}
              maxLength={40}
              autoComplete="given-name"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) {
                  onNameSave(name.trim());
                  setStep(1);
                }
              }}
            />
            <p className="mt-4 text-sm text-slate-500">GenoFit is here to help</p>
            <Button
              className="mt-8 w-full"
              disabled={!name.trim()}
              onClick={() => {
                onNameSave(name.trim());
                setStep(1);
              }}
            >
              Continue
            </Button>
            {showReset ? (
              <button
                type="button"
                className="mt-4 w-full text-sm text-slate-500 underline"
                onClick={async () => {
                  await clearSession();
                  localStorage.removeItem("genofit_onboarding");
                  window.location.href = window.location.pathname;
                }}
              >
                Clear previous session &amp; start fresh
              </button>
            ) : null}
          </>
        )}

        {step === 1 && (
          <>
            <h2 className="text-xl font-bold text-slate-800">
              Hi, <span className="text-teal-600">{name.trim() || "there"}</span>
            </h2>
            <p className="mt-2 text-slate-500">Please upload test results</p>
            <p className="mt-1 text-sm text-slate-500">PDF lab reports — select one or many</p>

            <label className="mt-6 flex h-24 w-24 cursor-pointer items-center justify-center rounded-full border-2 border-dashed border-emerald-300 bg-emerald-50/50 transition-colors hover:border-emerald-400 hover:bg-emerald-50">
              <input
                ref={labInputRef}
                type="file"
                accept=".pdf,application/pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  void handleLabUpload(e.target.files);
                  e.target.value = "";
                }}
              />
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-600">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </label>

            {labStatus.text ? (
              <p className={`mt-3 text-sm ${statusClass(labStatus.state)}`}>{labStatus.text}</p>
            ) : null}

            {labFiles.length > 0 ? (
              <ul className="mt-4 w-full space-y-1 text-left text-sm text-slate-700">
                {labFiles.map((row) => (
                  <li key={`${row.name}-${row.subtitle || ""}`} className={row.ok ? "" : "text-rose-600"}>
                    {truncate(row.name, 32)}
                    {row.subtitle ? <span className="ml-2 text-slate-500">{row.subtitle}</span> : null}
                  </li>
                ))}
              </ul>
            ) : null}

            <Button className="mt-8 w-full" onClick={() => setStep(2)}>
              Continue
            </Button>
            <button type="button" className="mt-4 w-full text-sm text-slate-500 underline" onClick={() => setStep(2)}>
              skip
            </button>

            <ul className="mt-6 space-y-1 text-center text-xs text-slate-400">
              {CATEGORIES.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="text-center text-xl font-bold text-slate-800">Connect to wearable data</h2>

            <div className="mt-8 flex items-center justify-center gap-4">
              {(["oura", "fitbit", "apple"] as const).map((wearable) => (
                <button
                  key={wearable}
                  type="button"
                  onClick={() => {
                    if (wearable === "apple") {
                      setSelectedWearable("apple");
                      setWearableStatus({ state: "idle", text: "Upload Apple Health export.xml" });
                      appleInputRef.current?.click();
                    } else {
                      void handleJunctionConnect(wearable);
                    }
                  }}
                  className={`flex h-16 w-16 items-center justify-center text-lg font-bold transition-all ${
                    selectedWearable === wearable
                      ? "bg-emerald-500 text-white shadow-md"
                      : "border border-slate-200 bg-white/90 text-slate-700 hover:bg-slate-100"
                  } ${wearable === "oura" ? "rounded-full" : "rounded-2xl"}`}
                  title={wearable === "apple" ? "Apple Health" : JUNCTION_PROVIDERS[wearable] || wearable}
                >
                  {wearable === "oura" ? "O" : wearable === "fitbit" ? "F" : "A"}
                </button>
              ))}
            </div>

            <input
              ref={appleInputRef}
              type="file"
              accept=".xml,text/xml"
              className="hidden"
              onChange={(e) => {
                void handleAppleUpload(e.target.files?.[0]);
                e.target.value = "";
              }}
            />

            <button
              type="button"
              className="mx-auto mt-6 block text-sm text-slate-500 underline"
              onClick={() => appleInputRef.current?.click()}
            >
              Other
            </button>

            {wearableStatus.text ? (
              <p className={`mt-4 text-center text-sm ${statusClass(wearableStatus.state)}`}>{wearableStatus.text}</p>
            ) : null}

            <button
              type="button"
              className="mx-auto mt-8 block text-sm text-slate-500 underline"
              onClick={() => onSkipToChat(name.trim())}
            >
              skip
            </button>
          </>
        )}

        <div className="mt-8 flex justify-center gap-2">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`h-2 w-2 rounded-full transition-colors ${step === i ? "bg-emerald-500" : "bg-slate-200"}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
