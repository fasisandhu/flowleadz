import Nav from "@/components/site/Nav";
import Hero from "@/components/site/Hero";
import Problem from "@/components/site/Problem";
import Solution from "@/components/site/Solution";
import Automation from "@/components/site/Automation";
import Services from "@/components/site/Services";
import Process from "@/components/site/Process";
import Results from "@/components/site/Results";
import WhyUs from "@/components/site/WhyUs";
import FinalCTA from "@/components/site/FinalCTA";
import Footer from "@/components/site/Footer";

export default function SiteRoot() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Problem />
        <Solution />
        <Automation />
        <Services />
        <Process />
        <Results />
        <WhyUs />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}
