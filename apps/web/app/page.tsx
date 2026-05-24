import Nav from "@/components/site/Nav";
import Hero from "@/components/site/Hero";
import TrustLogos from "@/components/site/TrustLogos";
import Advantages from "@/components/site/Advantages";
import NodeMap from "@/components/site/NodeMap";
import ProtectionStats from "@/components/site/ProtectionStats";
import Pricing from "@/components/site/Pricing";
import Cases from "@/components/site/Cases";
import FAQ from "@/components/site/FAQ";
import CTA from "@/components/site/CTA";
import Footer from "@/components/site/Footer";

export default function HomePage() {
  return (
    <main>
      <Nav />
      <Hero />
      <TrustLogos />
      <Advantages />
      <NodeMap />
      <ProtectionStats />
      <Pricing />
      <Cases />
      <FAQ />
      <CTA />
      <Footer />
    </main>
  );
}
