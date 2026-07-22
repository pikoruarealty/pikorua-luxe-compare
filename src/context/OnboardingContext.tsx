import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getSessionProfile,
  saveQuizAnswers as saveQuizAnswersFn,
  signOutProfile,
} from "@/lib/profile.functions";
import { useActivityLog } from "@/hooks/use-activity-log";

export type OnboardingPhase = "idle" | "auth" | "welcome" | "site-preview" | "quiz" | "complete";

export interface UserProfile {
  name: string;
  email: string;
  phone: string;
  profession: "job" | "business" | "investor" | "other";
  businessName?: string;
  uid: string;
  /** Optional extras the user can add on the Account page (stored locally). */
  city?: string;
  notes?: string;
}

export interface QuizAnswers {
  /** Undefined for answers saved before the location step existed. */
  state?: string;
  city?: string;
  bhk: string[];
  propertyType: string[];
  budgetRange: string;
  budgetSub: string;
}

interface OnboardingContextValue {
  phase: OnboardingPhase;
  setPhase: (p: OnboardingPhase) => void;
  userProfile: UserProfile | null;
  setUserProfile: (p: UserProfile) => void;
  quizAnswers: QuizAnswers | null;
  setQuizAnswers: (a: QuizAnswers | null) => void;
  completeOnboarding: (answers: QuizAnswers | null) => void;
  quizEditMode: boolean;
  openQuizForEdit: () => void;
  cancelQuizEdit: () => void;
  /** Open the auth flow after a high-intent action (save, full report). Once per session. */
  requestAuth: () => void;
  /** Auth-only gate for shared links: identify, then skip the preference quiz. */
  requestGatedAuth: () => void;
  finishGatedAuth: () => void;
  authOnly: boolean;
  signOut: () => Promise<void>;
  hydrated: boolean;
}

const Ctx = createContext<OnboardingContextValue | null>(null);

const STORAGE_DONE = "pikorua:onboarding-complete";
const STORAGE_PROFILE = "pikorua:user-profile";
const STORAGE_QUIZ = "pikorua:quiz-answers";

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<OnboardingPhase>("idle");
  const [userProfile, setUserProfileState] = useState<UserProfile | null>(null);
  const [quizAnswers, setQuizAnswersState] = useState<QuizAnswers | null>(null);
  const [quizEditMode, setQuizEditMode] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const getSessionProfileFn = useServerFn(getSessionProfile);
  const saveQuizFn = useServerFn(saveQuizAnswersFn);
  const signOutFn = useServerFn(signOutProfile);
  const logActivity = useActivityLog();

  // Fast local hydrate for instant UI; then reconcile with server.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    // 1. Optimistic local cache.
    try {
      const profileRaw = window.localStorage.getItem(STORAGE_PROFILE);
      const quizRaw = window.localStorage.getItem(STORAGE_QUIZ);
      const done = window.localStorage.getItem(STORAGE_DONE);
      if (profileRaw) setUserProfileState(JSON.parse(profileRaw));
      if (quizRaw) setQuizAnswersState(JSON.parse(quizRaw));
      if (done === "true") setPhase("complete");
    } catch {
      // ignore
    }

    // 2. Server is source of truth.
    (async () => {
      try {
        const server = await getSessionProfileFn();
        if (cancelled) return;
        if (server) {
          // Preserve locally-stored extras (city, notes) that the server
          // profile doesn't carry.
          let extras: Pick<UserProfile, "city" | "notes"> = {};
          try {
            const localRaw = window.localStorage.getItem(STORAGE_PROFILE);
            if (localRaw) {
              const lp = JSON.parse(localRaw) as Partial<UserProfile>;
              extras = { city: lp.city, notes: lp.notes };
            }
          } catch {
            // ignore
          }
          const profile: UserProfile = {
            ...extras,
            name: server.name ?? "",
            email: server.email ?? "",
            phone: server.phone,
            profession: (server.profession as UserProfile["profession"]) ?? "other",
            businessName: server.businessName ?? undefined,
            uid: server.id,
          };
          setUserProfileState(profile);
          window.localStorage.setItem(STORAGE_PROFILE, JSON.stringify(profile));
          if (server.quizAnswers) {
            setQuizAnswersState(server.quizAnswers as QuizAnswers);
            window.localStorage.setItem(STORAGE_QUIZ, JSON.stringify(server.quizAnswers));
          }
          window.localStorage.setItem(STORAGE_DONE, "true");
          setPhase("complete");
        } else {
          // No server session → clear stale local data so onboarding can run.
          window.localStorage.removeItem(STORAGE_DONE);
          window.localStorage.removeItem(STORAGE_PROFILE);
          window.localStorage.removeItem(STORAGE_QUIZ);
          setUserProfileState(null);
          setQuizAnswersState(null);
          setPhase("idle");
        }
      } catch {
        // network fail → keep local cache
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [getSessionProfileFn]);

  const setUserProfile = useCallback((p: UserProfile) => {
    setUserProfileState(p);
    try {
      window.localStorage.setItem(STORAGE_PROFILE, JSON.stringify(p));
    } catch {
      // ignore
    }
  }, []);

  const setQuizAnswers = useCallback((a: QuizAnswers | null) => {
    setQuizAnswersState(a);
    try {
      if (a) window.localStorage.setItem(STORAGE_QUIZ, JSON.stringify(a));
    } catch {
      // ignore
    }
  }, []);

  const completeOnboarding = useCallback(
    (answers: QuizAnswers | null) => {
      setQuizAnswersState(answers);
      try {
        if (answers) window.localStorage.setItem(STORAGE_QUIZ, JSON.stringify(answers));
        window.localStorage.setItem(STORAGE_DONE, "true");
      } catch {
        // ignore
      }
      setQuizEditMode(false);
      setPhase("complete");
      if (answers) {
        saveQuizFn({ data: { answers } })
          .then(() => logActivity("quiz_completed", null, answers as never))
          .catch(() => {
            // best effort; local cache still holds it
          });
      }
    },
    [saveQuizFn, logActivity],
  );

  const openQuizForEdit = useCallback(() => {
    setQuizEditMode(true);
    setPhase("quiz");
  }, []);

  // Auth is invited after a high-intent action rather than forced on scroll —
  // and only once per session, so a dismissal is respected.
  const authPrompted = useRef(false);
  const requestAuth = useCallback(() => {
    if (authPrompted.current || userProfile) return;
    authPrompted.current = true;
    setPhase((p) => (p === "idle" || p === "complete" ? "auth" : p));
  }, [userProfile]);

  // A shared comparison link is its own destination: the recipient must
  // identify themselves, but asking them for BHK/budget preferences would be
  // asking about a search they never started. Auth only, then straight through
  // to the comparison they were sent.
  const [authOnly, setAuthOnly] = useState(false);
  const requestGatedAuth = useCallback(() => {
    if (userProfile) return;
    setAuthOnly(true);
    setPhase("auth");
  }, [userProfile]);

  const finishGatedAuth = useCallback(() => {
    setAuthOnly(false);
    completeOnboarding(null);
  }, [completeOnboarding]);

  const cancelQuizEdit = useCallback(() => {
    setQuizEditMode(false);
    setPhase("complete");
  }, []);

  const signOut = useCallback(async () => {
    try {
      await signOutFn();
    } catch {
      // ignore
    }
    try {
      window.localStorage.removeItem(STORAGE_DONE);
      window.localStorage.removeItem(STORAGE_PROFILE);
      window.localStorage.removeItem(STORAGE_QUIZ);
    } catch {
      // ignore
    }
    setUserProfileState(null);
    setQuizAnswersState(null);
    setQuizEditMode(false);
    setPhase("idle");
  }, [signOutFn]);

  const value = useMemo<OnboardingContextValue>(
    () => ({
      phase,
      setPhase,
      userProfile,
      setUserProfile,
      quizAnswers,
      setQuizAnswers,
      completeOnboarding,
      quizEditMode,
      openQuizForEdit,
      cancelQuizEdit,
      requestAuth,
      requestGatedAuth,
      finishGatedAuth,
      authOnly,
      signOut,
      hydrated,
    }),
    [
      phase,
      userProfile,
      quizAnswers,
      setUserProfile,
      setQuizAnswers,
      completeOnboarding,
      quizEditMode,
      openQuizForEdit,
      cancelQuizEdit,
      requestAuth,
      requestGatedAuth,
      finishGatedAuth,
      authOnly,
      signOut,
      hydrated,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOnboarding(): OnboardingContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useOnboarding must be used within OnboardingProvider");
  return v;
}
