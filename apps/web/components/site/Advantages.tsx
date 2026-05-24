import { advantages } from "@/lib/content";
import { icons } from "@/components/ui/Icons";
import Reveal from "@/components/ui/Reveal";

export default function Advantages() {
  return (
    <section id="advantages" className="bg-mist py-24 sm:py-32">
      <div className="container-x">
        <Reveal>
          <p className="eyebrow text-center">Why AegisCDN</p>
          <h2 className="mx-auto mt-4 max-w-3xl text-center text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
            为规模而生,为从容而设计
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-lg text-black/50">
            Built for scale. Designed for calm.
          </p>
        </Reveal>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {advantages.map((a, i) => {
            const Icon = icons[a.icon];
            return (
              <Reveal key={a.title} delay={i * 0.08}>
                <div className="group h-full rounded-3xl border border-black/[0.06] bg-white p-7 shadow-[0_8px_40px_-16px_rgba(0,0,0,0.12)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_60px_-20px_rgba(10,132,255,0.35)]">
                  <div className="mb-6 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-brand/10 to-accent/10 text-brand">
                    {Icon ? <Icon /> : null}
                  </div>
                  <h3 className="text-xl font-semibold text-ink">{a.title}</h3>
                  <p className="mt-1 text-sm font-medium text-brand">{a.en}</p>
                  <p className="mt-3 text-[15px] leading-relaxed text-black/55">{a.desc}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
