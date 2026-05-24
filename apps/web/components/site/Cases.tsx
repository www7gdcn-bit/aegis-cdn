import { cases } from "@/lib/content";
import Reveal from "@/components/ui/Reveal";

export default function Cases() {
  return (
    <section id="cases" className="bg-mist py-24 sm:py-32">
      <div className="container-x">
        <Reveal>
          <p className="eyebrow text-center">Customers</p>
          <h2 className="mx-auto mt-4 max-w-3xl text-center text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
            从流量洪峰到风平浪静
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-lg text-black/50">
            From spikes to silence.
          </p>
        </Reveal>

        <div className="mt-16 grid gap-6 lg:grid-cols-3">
          {cases.map((c, i) => (
            <Reveal key={c.industry} delay={i * 0.08}>
              <figure className="flex h-full flex-col rounded-3xl border border-black/[0.06] bg-white p-8">
                <span className="w-fit rounded-full bg-brand/10 px-3 py-1 text-xs font-medium text-brand">
                  {c.industry}
                </span>
                <p className="mt-5 text-lg font-medium leading-snug text-ink">{c.result}</p>
                <figcaption className="mt-auto pt-6 text-[15px] italic text-black/45">
                  “{c.quote}”
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
