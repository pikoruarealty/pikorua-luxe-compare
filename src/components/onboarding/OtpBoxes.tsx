import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

/** Six single-character inputs that behave like one field: typing advances,
 *  backspace retreats, and a pasted or SMS-autofilled code spreads across the
 *  row instead of landing entirely in one box. Submits itself once full. */
export function OtpBoxes({
  onComplete,
  disabled = false,
  /** Bump to clear the boxes and refocus — e.g. after a rejected code. */
  resetKey = 0,
  /** Bump to play a shake. */
  shakeKey = 0,
}: {
  onComplete: (code: string) => void;
  disabled?: boolean;
  resetKey?: number;
  shakeKey?: number;
}) {
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (resetKey === 0) return;
    setDigits(["", "", "", "", "", ""]);
    const t = setTimeout(() => refs.current[0]?.focus(), 50);
    return () => clearTimeout(t);
  }, [resetKey]);

  const fillFrom = (start: number, chars: string) => {
    const next = [...digits];
    for (let k = 0; k < chars.length && start + k < 6; k++) next[start + k] = chars[k];
    setDigits(next);
    const lastFilled = Math.min(start + chars.length, 6) - 1;
    refs.current[Math.max(0, lastFilled)]?.focus();
    if (next.every((d) => d.length === 1)) onComplete(next.join(""));
  };

  const handleChange = (i: number, raw: string) => {
    const cleaned = raw.replace(/\D/g, "");
    if (cleaned.length > 1) return fillFrom(i, cleaned);
    const v = cleaned.slice(-1);
    const next = [...digits];
    next[i] = v;
    setDigits(next);
    if (v && i < 5) refs.current[i + 1]?.focus();
    if (next.every((d) => d.length === 1)) onComplete(next.join(""));
  };

  // maxLength=1 truncates a pasted code before onChange sees it, so paste is
  // read straight off the clipboard instead.
  const handlePaste = (i: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const cleaned = e.clipboardData.getData("text").replace(/\D/g, "");
    if (!cleaned) return;
    e.preventDefault();
    fillFrom(i, cleaned);
  };

  const handleKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      refs.current[i - 1]?.focus();
      const next = [...digits];
      next[i - 1] = "";
      setDigits(next);
    }
  };

  return (
    <motion.div
      key={shakeKey}
      animate={shakeKey ? { x: [0, -8, 8, -8, 8, 0] } : {}}
      transition={{ duration: 0.4 }}
      className="flex justify-center gap-2"
    >
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKey(i, e)}
          onPaste={(e) => handlePaste(i, e)}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          disabled={disabled}
          aria-label={`Digit ${i + 1} of 6`}
          className="h-[52px] w-12 rounded-card border border-border bg-background text-center text-lg text-foreground outline-none focus:border-champagne disabled:opacity-60"
        />
      ))}
    </motion.div>
  );
}
