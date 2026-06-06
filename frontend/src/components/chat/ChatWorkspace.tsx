import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "../ui/Button";
import { ChatSidebar } from "./ChatSidebar";
import { BubbleRadarPanel } from "../charts/BubbleRadarPanel";
import { getApiBase, formatApiError, parseApiResponse } from "../../api/client";
import type { GeneInfo, LabReport, Metrics, Profile } from "../../types/profile";
import { getChatIntro } from "../../lib/profileContent";

interface ChatWorkspaceProps {
  userName: string;
  profile: Profile | null;
  genes: Record<string, GeneInfo>;
  labReports: LabReport[];
  metrics: Metrics | null;
  history: { role: string; content: string }[];
  pendingMessage?: string | null;
  onPendingMessageHandled?: () => void;
  onHistoryChange: (history: { role: string; content: string }[]) => void;
  onOpenProfile: () => void;
  onGoHome: () => void;
  onStartOver: () => void;
}

export function ChatWorkspace({
  userName,
  profile,
  genes,
  labReports,
  metrics,
  history,
  pendingMessage,
  onPendingMessageHandled,
  onHistoryChange,
  onOpenProfile,
  onGoHome,
  onStartOver,
}: ChatWorkspaceProps) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [introShown, setIntroShown] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingHandledRef = useRef<string | null>(null);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;
      setInput("");
      setLoading(true);
      const next = [...history, { role: "user", content: trimmed }];
      onHistoryChange(next);
      try {
        const res = await fetch(`${getApiBase()}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed }),
        });
        const data = await parseApiResponse(res);
        if (!res.ok) throw new Error(formatApiError(data, res.status));
        onHistoryChange([...next, { role: "assistant", content: data.reply || "" }]);
      } catch (err) {
        onHistoryChange([
          ...next,
          { role: "assistant", content: err instanceof Error ? err.message : "Something went wrong" },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [history, loading, onHistoryChange],
  );

  useEffect(() => {
    const container = messagesRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [history, loading]);

  useEffect(() => {
    if (introShown || history.length > 0) return;
    const intro = getChatIntro(profile, userName);
    onHistoryChange([{ role: "assistant", content: intro }]);
    setIntroShown(true);
  }, [history.length, introShown, onHistoryChange, profile, userName]);

  useEffect(() => {
    if (!pendingMessage || pendingHandledRef.current === pendingMessage) return;
    pendingHandledRef.current = pendingMessage;
    void sendMessage(pendingMessage);
    onPendingMessageHandled?.();
  }, [pendingMessage, onPendingMessageHandled, sendMessage]);

  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  return (
    <div className="flex h-screen flex-col lg:flex-row">
      <ChatSidebar
        userName={userName}
        genes={genes}
        labReports={labReports}
        metrics={metrics}
        onGoHome={onGoHome}
        onOpenProfile={onOpenProfile}
        onStartOver={onStartOver}
        onSendChip={(prompt) => void sendMessage(prompt)}
      />

      <div className="flex min-h-0 flex-1 flex-col bg-[#F8FAFC]">
        <div className="shrink-0 border-b border-slate-100 bg-white/50 px-3 py-3 backdrop-blur-md sm:px-6">
          <div className="mx-auto max-w-3xl">
            <BubbleRadarPanel profile={profile} />
          </div>
        </div>

        <div
          ref={messagesRef}
          className="mx-auto h-64 w-full max-w-3xl shrink-0 overflow-y-auto px-3 py-4 sm:h-72 sm:px-6"
        >
          <div className="flex flex-col gap-3">
            {history.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" ? (
                  <div className="mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-sm font-bold text-white">
                    G
                  </div>
                ) : null}
                <div
                  className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-relaxed sm:max-w-[85%] ${
                    msg.role === "user"
                      ? "bg-emerald-500 text-white"
                      : "border border-slate-100 bg-white/70 text-slate-800 shadow-sm backdrop-blur-md"
                  }`}
                >
                  {msg.role === "user" ? msg.content : <div dangerouslySetInnerHTML={{ __html: msg.content }} />}
                </div>
              </div>
            ))}
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span className="inline-flex gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.2s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.1s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
                </span>
                GenoFit is thinking…
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="mt-auto shrink-0 border-t border-slate-100 bg-white/70 p-3 backdrop-blur-md sm:px-6 sm:py-4">
          <div className="mx-auto flex max-w-3xl gap-2">
            <textarea
              ref={textareaRef}
              className="min-h-[44px] flex-1 resize-none rounded-2xl bg-white/90 px-4 py-3 text-sm text-slate-800 ring-1 ring-slate-200 outline-none transition-all duration-200 focus:ring-2 focus:ring-emerald-400"
              placeholder="Ask about your data…"
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                autoResize();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendMessage(input);
                }
              }}
            />
            <Button className="px-5" onClick={() => void sendMessage(input)} disabled={loading || !input.trim()}>
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
