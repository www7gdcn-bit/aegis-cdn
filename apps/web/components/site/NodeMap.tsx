"use client";

import { motion } from "framer-motion";

// 伪地理坐标(百分比),营造全球节点分布观感
const nodes = [
  { x: 18, y: 38 }, { x: 26, y: 30 }, { x: 30, y: 52 }, { x: 44, y: 28 },
  { x: 48, y: 44 }, { x: 52, y: 60 }, { x: 60, y: 34 }, { x: 68, y: 26 },
  { x: 74, y: 46 }, { x: 80, y: 36 }, { x: 84, y: 58 }, { x: 38, y: 66 },
];
const hub = { x: 50, y: 42 };

const stats = [
  { v: "200+", l: "边缘节点" },
  { v: "60+", l: "国家 / 地区" },
  { v: "< 30ms", l: "平均延迟" },
];

export default function NodeMap() {
  return (
    <section id="network" className="relative overflow-hidden bg-ink py-24 text-white sm:py-32">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[600px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/10 blur-[140px]" />
      <div className="container-x relative grid items-center gap-12 lg:grid-cols-[1.4fr_1fr]">
        {/* 地图 */}
        <div className="relative aspect-[16/9] w-full">
          <svg viewBox="0 0 100 56" className="h-full w-full" preserveAspectRatio="none">
            {/* 连线 */}
            {nodes.map((n, i) => (
              <motion.line
                key={`l${i}`}
                x1={hub.x} y1={hub.y * 0.56} x2={n.x} y2={n.y * 0.56}
                stroke="url(#g)" strokeWidth={0.25}
                initial={{ pathLength: 0, opacity: 0 }}
                whileInView={{ pathLength: 1, opacity: 0.5 }}
                viewport={{ once: true }}
                transition={{ duration: 1.2, delay: 0.1 + i * 0.06, ease: "easeOut" }}
              />
            ))}
            <defs>
              <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#0A84FF" />
                <stop offset="100%" stopColor="#30D158" />
              </linearGradient>
            </defs>
          </svg>

          {/* 节点光点 */}
          {nodes.map((n, i) => (
            <span
              key={`n${i}`}
              className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand animate-pulseGlow"
              style={{ left: `${n.x}%`, top: `${n.y}%`, animationDelay: `${i * 0.25}s` }}
            >
              <span className="absolute inset-0 rounded-full bg-brand/40 blur-[6px]" />
            </span>
          ))}
          {/* 中心枢纽 */}
          <span
            className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent"
            style={{ left: `${hub.x}%`, top: `${hub.y}%` }}
          >
            <span className="absolute inset-0 animate-ping rounded-full bg-accent/60" />
          </span>
        </div>

        {/* 文案 + 统计 */}
        <div>
          <p className="eyebrow">Global Network</p>
          <h2 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
            离用户更近,<br />在世界每个角落
          </h2>
          <p className="mt-5 max-w-md text-white/55">
            智能调度将请求引导至最优边缘节点,降低延迟、就近清洗,让全球访问如本地般顺滑。
          </p>
          <div className="mt-10 grid grid-cols-3 gap-4">
            {stats.map((s) => (
              <div key={s.l} className="glass px-3 py-5 text-center">
                <div className="text-2xl font-semibold text-white sm:text-3xl">{s.v}</div>
                <div className="mt-1 text-xs text-white/50">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
