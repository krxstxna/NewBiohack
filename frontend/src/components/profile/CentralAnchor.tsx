import { motion } from "framer-motion";

interface CentralAnchorProps {
  avatarSrc: string;
  badge?: string;
}

export function CentralAnchor({ avatarSrc, badge }: CentralAnchorProps) {
  return (
    <div className="relative flex flex-col items-center justify-center">
      <motion.div
        className="relative flex h-36 w-36 items-center justify-center rounded-full bg-white/70 p-3 shadow-sm ring-1 ring-slate-100 backdrop-blur-md sm:h-44 sm:w-44 md:h-52 md:w-52"
        animate={{ scale: [1, 1.03, 1] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      >
        <img src={avatarSrc} alt="Your GenoFit twin" className="h-full w-full object-contain" />
      </motion.div>
      {badge ? (
        <span className="mt-3 max-w-[240px] truncate rounded-full border border-slate-100 bg-white/70 px-3 py-1 text-xs font-semibold text-slate-800 shadow-sm backdrop-blur-md">
          {badge}
        </span>
      ) : null}
    </div>
  );
}
