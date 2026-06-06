import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/Button";
import { getApiBase, formatApiError, parseApiResponse } from "../../api/client";

interface ChatWorkspaceProps {
  userName: string;
  history: { role: string; content: string }[];
  onHistoryChange: (history: { role: string; content: string }[]) => void;
  onOpenProfile: () => void;
}

export function ChatWorkspace({ userName, history, onHistoryChange, onOpenProfile }: ChatWorkspaceProps) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setLoading(true);
    const next = [...history, { role: "user", content: text }];
    onHistoryChange(next);
    try {
      const res = await fetch(`${getApiBase()}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
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
  };

  return (
    <div className="flex h-full min-h-screen flex-col bg-[#F8FAFC]">
      <header className="flex items-center justify-between border-b border-slate-100 bg-white/70 px-4 py-3 backdrop-blur-md sm:px-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">GenoFit</p>
          <p className="text-sm text-slate-500">Hi, {userName || "there"}</p>
        </div>
        <Button variant="secondary" className="px-4 py-2 text-xs" onClick={onOpenProfile}>
          My profile
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          {history.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-relaxed sm:max-w-[85%] ${
                  msg.role === "user"
                    ? "bg-emerald-500 text-white"
                    : "border border-slate-100 bg-white/70 text-slate-800 shadow-sm backdrop-blur-md"
                }`}
              >
                {msg.role === "user" ? (
                  msg.content
                ) : (
                  <div dangerouslySetInnerHTML={{ __html: msg.content }} />
                )}
              </div>
            </div>
          ))}
          {loading ? (
            <div className="text-sm text-slate-500">GenoFit is thinking…</div>
          ) : null}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-slate-100 bg-white/70 p-3 backdrop-blur-md sm:px-6 sm:py-4">
        <div className="mx-auto flex max-w-3xl gap-2">
          <textarea
            className="min-h-[44px] flex-1 resize-none rounded-2xl bg-white/90 px-4 py-3 text-sm text-slate-800 ring-1 ring-slate-200 outline-none transition-all duration-200 focus:ring-2 focus:ring-emerald-400"
            placeholder="Ask about your data…"
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <Button className="px-5" onClick={send} disabled={loading || !input.trim()}>
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
