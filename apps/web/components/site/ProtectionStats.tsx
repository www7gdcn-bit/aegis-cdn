import { capabilities, protectionStats } from "@/lib/content";
import Counter from "@/components/ui/Counter";
import Reveal from "@/components/ui/Reveal";

export default function ProtectionStats() {
  return (
    <section id="protection" className="bg-white py-24 sm:py-32">
      <div className="container-x">
        <Reveal>
          <p className="eyebrow text-center">Protection in Numbers</p>
          <h2 className="mx-auto mt-4 max-w-3xl text-center text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
            那些你从未察觉的攻击,<br className="hidden sm:block" />我们都挡下了
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-lg text-black/50">
            See the attacks you never felt.
          </p>
        </Reveal>

        <div className="mt-16 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {protectionStats.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.08}>
              <div className="rounded-3xl border border-black/[0.06] bg-mist p-8 text-center">
                <div className="text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
                  <Counter to={s.to} decimals={s.decimals} suffix={s.suffix} />
                </div>
                <div className="mt-2 text-sm text-black/50">{s.label}</div>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.1}>
          <div className="mt-12 flex flex-wrap justify-center gap-3">
            {capabilities.map((c) => (
              <span
                key={c}
                className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-black/65"
              >
                {c}
              </span>
            ))}
          </div>
          <p className="mt-8 text-center text-xs text-black/35">
            * 容量级 DDoS 清洗依托上游网络与清洗中心能力提供;L7 防护(CC / WAF / 限速)由平台实时生效。
          </p>
        </Reveal>
      </div>
    </section>
  );
}
