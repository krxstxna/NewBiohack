import { useState } from "react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

interface OnboardingFlowProps {
  initialName?: string;
  onComplete: (name: string) => void;
  onSkipToChat: (name: string) => void;
}

export function OnboardingFlow({ initialName = "", onComplete, onSkipToChat }: OnboardingFlowProps) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(initialName);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] p-6">
      <div className="w-full max-w-md rounded-[32px] border border-slate-100 bg-white/70 p-8 shadow-sm backdrop-blur-md">
        {step === 0 && (
          <>
            <h1 className="text-2xl font-bold text-slate-800">Hi there,</h1>
            <p className="mt-2 text-slate-500">What is your name?</p>
            <Input
              className="mt-6"
              placeholder="Your name"
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
            />
            <p className="mt-4 text-sm text-slate-500">GenoFit is here to help</p>
            <Button className="mt-8 w-full" disabled={!name.trim()} onClick={() => setStep(1)}>
              Continue
            </Button>
          </>
        )}

        {step === 1 && (
          <>
            <h2 className="text-xl font-bold text-slate-800">Welcome, {name}</h2>
            <p className="mt-2 text-slate-500">Upload labs and connect wearables in the full app flow.</p>
            <p className="mt-4 text-sm text-slate-500">For now, continue to your profile whiteboard.</p>
            <Button className="mt-8 w-full" onClick={() => onComplete(name.trim())}>
              Build my profile
            </Button>
            <button
              type="button"
              className="mt-4 w-full text-sm text-slate-500 underline"
              onClick={() => onSkipToChat(name.trim())}
            >
              Skip to chat
            </button>
          </>
        )}
      </div>
    </div>
  );
}
