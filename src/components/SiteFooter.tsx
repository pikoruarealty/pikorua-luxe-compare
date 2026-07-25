import { Link } from "@tanstack/react-router";
import { Heart, MessageCircle } from "lucide-react";

const WHATSAPP_NUMBER = "916354359222";
const WHATSAPP_MESSAGE = "Hi PIKORUA, I'd like to know more about your luxury residences.";
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`;

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-(--glass-border) bg-card/40">
      <div className="container-lux py-14">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-[1.4fr_1fr_1fr]">
          {/* Brand */}
          <div>
            <Link
              to="/"
              className="group inline-flex items-center gap-3 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne/50 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
            >
              <span className="grid h-10 w-10 place-items-center rounded-full gold-border transition-transform duration-500 group-hover:rotate-8">
                <span className="font-display text-base gold-text">P</span>
              </span>
              <div className="leading-tight">
                <p className="font-display text-xl leading-none text-ivory">PIKORUA</p>
                <p className="mt-1 font-label text-[9px] tracking-luxury text-champagne">
                  Property Consultant
                </p>
              </div>
            </Link>
            <p className="mt-5 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
              An editorial suite for comparing ultra-luxury residences. Curated by Pikorua's
              private-client advisory to help you decide with clarity.
            </p>
          </div>

          {/* Explore */}
          <div>
            <p className="font-label text-[10px] tracking-luxury text-champagne">Explore</p>
            <ul className="mt-4 space-y-3 text-[13px]">
              <li>
                <a href="/#suite" className="text-muted-foreground transition hover:text-champagne">
                  Comparison Suite
                </a>
              </li>
              <li>
                <a
                  href="/#collection"
                  className="text-muted-foreground transition hover:text-champagne"
                >
                  The Collection
                </a>
              </li>
              <li>
                <Link
                  to="/favorites"
                  className="inline-flex items-center gap-1.5 text-muted-foreground transition hover:text-champagne"
                >
                  <Heart className="h-3 w-3" /> Saved Residences
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <p className="font-label text-[10px] tracking-luxury text-champagne">Speak with us</p>
            <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
              Questions about a residence, pricing, or possession? Our advisors reply within the
              hour.
            </p>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex items-center gap-2 rounded-full border border-champagne/40 bg-champagne/10 px-5 py-2.5 text-[11px] tracking-luxury text-ivory transition hover:border-champagne hover:bg-champagne/20 hover:text-champagne"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              WhatsApp Advisory
            </a>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-(--glass-border) pt-6 sm:flex-row">
          <p className="text-[11px] text-muted-foreground">
            © {new Date().getFullYear()} Pikorua Realty. All rights reserved.
          </p>
          <p className="font-label text-[10px] tracking-luxury text-muted-foreground">
            Compare · Decide · Reside
          </p>
        </div>
      </div>
    </footer>
  );
}
