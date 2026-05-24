import Reveal from "@/components/ui/Reveal";

export default function CTA() {
  return (
    <section className="relative overflow-hidden bg-ink py-28 text-white sm:py-36">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[400px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/20 blur-[130px]" />
      <div className="container-x relative text-center">
        <Reveal>
          <h2 className="mx-auto max-w-3xl text-5xl font-semibold tracking-tight sm:text-6xl">
            流量再猛,<span className="text-gradient-brand">也准备好了</span>
          </h2>
          <p className="mt-5 text-lg text-white/55">Ready when the traffic isn&apos;t.</p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a href="/register" className="btn-primary w-full sm:w-auto">立即接入</a>
            <a href="#cases" className="btn-ghost-dark w-full sm:w-auto">预约演示</a>
          </div>
          <p className="mt-6 text-sm text-white/40">5 分钟接入 · 无需改动源站 · 7 天试用</p>
        </Reveal>
      </div>
    </section>
  );
}
