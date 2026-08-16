import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";

export function LegalPage({
  eyebrow,
  title,
  intro,
  sections,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  sections: Array<{ title: string; paragraphs: string[] }>;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="container-lux max-w-4xl pt-32 pb-16">
        <p className="text-xs font-semibold tracking-[0.18em] text-champagne uppercase">
          {eyebrow}
        </p>
        <h1 className="mt-4 font-display text-4xl font-extrabold sm:text-6xl">{title}</h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground">{intro}</p>
        <p className="mt-4 text-xs text-muted-foreground">Last updated: 16 August 2026</p>
        <div className="mt-12 divide-y divide-border border-y border-border">
          {sections.map((section) => (
            <section key={section.title} className="py-8">
              <h2 className="font-display text-2xl font-bold">{section.title}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="mt-4 max-w-3xl leading-7 text-muted-foreground">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
