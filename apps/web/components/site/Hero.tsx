"use client";

import { motion } from "framer-motion";

const ease = [0.16, 1, 0.3, 1] as const;

export default function Hero() {
  return (
    <section id="top" className="relative overflow-hidden bg-ink pt-32 pb-24 text-white sm:pt-40 sm:pb-32">
      {/* 背景:网格 + 光球 */}
      <div className="pointer-events-none absolute inset-0 bg-grid" />
      <div className="pointer-events-none absolute left-1/2 top-[-10%] h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-brand/25 blur-[120px]" />
      <div className="pointer-events-none absolute right-[8%] top-[30%] h-72 w-72 rounded-full bg-accent/15 blur-[110px]" />

      <div className="container-x relative">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease }}
          className="mx-auto mb-7 flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs text-white/70 backdrop-blur"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          全球 200+ 边缘节点 · 智能调度 · 实时防护
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease, delay: 0.05 }}
          className="mx-auto max-w-4xl text-center text-[44px] font-semibold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl"
        >
          Enterprise<br />
          <span className="text-gradient-brand">Anti-DDoS CDN</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease, delay: 0.15 }}
          className="mx-auto mt-6 max-w-2xl text-center text-lg text-white/65 sm:text-xl"
        >
          Global Acceleration · Intelligent Protection · Always Online
          <span className="mt-2 block text-base text-white/45">
            企业级高防 CDN —— 让每一次访问更快、更安全、永不中断。
          </span>
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease, delay: 0.25 }}
          className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <a href="#pricing" className="btn-primary w-full sm:w-auto">立即接入</a>
          <a href="#protection" className="btn-ghost-dark w-full sm:w-auto">查看防护能力</a>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.5 }}
          className="mx-auto mt-14 flex max-w-3xl flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-white/45"
        >
          <span>T 级清洗能力</span>
          <span className="hidden sm:inline">·</span>
          <span>99.99% 可用性</span>
          <span className="hidden sm:inline">·</span>
          <span>5 分钟接入</span>
          <span className="hidden sm:inline">·</span>
          <span>无需改动源站</span>
        </motion.div>
      </div>
    </section>
  );
}
