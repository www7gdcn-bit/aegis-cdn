"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { faqs } from "@/lib/content";

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="bg-white py-24 sm:py-32">
      <div className="container-x max-w-3xl">
        <p className="eyebrow text-center">FAQ</p>
        <h2 className="mt-4 text-center text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
          常见问题
        </h2>

        <div className="mt-12 divide-y divide-black/10 border-y border-black/10">
          {faqs.map((f, i) => {
            const active = open === i;
            return (
              <div key={i}>
                <button
                  className="flex w-full items-center justify-between gap-4 py-5 text-left"
                  onClick={() => setOpen(active ? null : i)}
                  aria-expanded={active}
                >
                  <span className="text-[17px] font-medium text-ink">{f.q}</span>
                  <span
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border border-black/10 text-black/50 transition-transform duration-300 ${
                      active ? "rotate-45" : ""
                    }`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                    </svg>
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {active && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden"
                    >
                      <p className="pb-5 pr-10 text-[15px] leading-relaxed text-black/55">{f.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
