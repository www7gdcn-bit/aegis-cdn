import { plans } from "@/lib/content";
import Reveal from "@/components/ui/Reveal";

function Check() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="mt-0.5 shrink-0">
      <path d="M5 12.5l4 4 10-10" stroke="#30D158" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Pricing() {
  return (
    <section id="pricing" className="bg-white py-24 sm:py-32">
      <div className="container-x">
        <Reveal>
          <p className="eyebrow text-center">Pricing</p>
          <h2 className="mx-auto mt-4 max-w-3xl text-center text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
            套餐简单,防护硬核
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-lg text-black/50">
            Simple plans. Serious protection. 支持月付 / 年付,随时升级。
          </p>
        </Reveal>

        <div className="mt-16 grid items-stretch gap-6 lg:grid-cols-3">
          {plans.map((p, i) => (
            <Reveal key={p.name} delay={i * 0.08} className="h-full">
              <div
                className={`flex h-full flex-col rounded-3xl p-8 transition-all duration-300 ${
                  p.featured
                    ? "scale-[1.02] bg-ink text-white shadow-[0_30px_80px_-30px_rgba(10,132,255,0.6)] ring-1 ring-brand/40"
                    : "border border-black/[0.08] bg-white text-ink hover:-translate-y-1 hover:shadow-[0_20px_60px_-24px_rgba(0,0,0,0.18)]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-semibold">{p.name}</h3>
                  {p.featured && (
                    <span className="rounded-full bg-brand px-3 py-1 text-xs font-medium text-white">最受欢迎</span>
                  )}
                </div>
                <p className={`mt-1 text-sm ${p.featured ? "text-white/60" : "text-black/45"}`}>{p.tagline}</p>

                <div className="mt-6 flex items-end gap-1">
                  <span className="text-4xl font-semibold tracking-tight">{p.price}</span>
                  <span className={`pb-1 text-sm ${p.featured ? "text-white/60" : "text-black/45"}`}>{p.period}</span>
                </div>

                <a
                  href={p.name === "Enterprise" ? "#cases" : "/register"}
                  className={`mt-6 w-full ${p.featured ? "btn-primary" : "btn-ghost-light"}`}
                >
                  {p.cta}
                </a>

                <ul className="mt-8 flex flex-1 flex-col gap-3">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2.5 text-[15px]">
                      <Check />
                      <span className={p.featured ? "text-white/85" : "text-black/70"}>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
