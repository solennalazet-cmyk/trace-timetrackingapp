// Curated challenge pools for the Daily Boost feature
// 20 messages per goal type × 4 brackets = rich variety
// Revenue = growing clients, visibility, outreach
// Time = deepening work, focus, craft mastery

export interface BoostChallenge {
  type: "time" | "revenue";
  message: string;
}

const TIME_CHALLENGES: Record<string, string[]> = {
  low: [
    "Start with just 15 minutes of deep work. Momentum begins with one small step.",
    "Pick one task and give it your full attention — depth beats breadth.",
    "Close all tabs. Open one document. Begin. Simplicity sharpens focus.",
    "Set a 15-minute timer and work on something you've been avoiding.",
    "What's the one thing that would move the needle today? Start there.",
  ],
  mid: [
    "You're building rhythm. Add one more focused sprint to lock it in.",
    "Try working without music or notifications for the next 25 minutes.",
    "Block 30 distraction-free minutes. Your future self will thank you.",
    "Revisit something from yesterday and push it further. Depth compounds.",
    "Write down your top priority, then protect the next 30 minutes for it.",
  ],
  high: [
    "You're in the zone. One more deep session and you'll finish strong.",
    "Almost there — 15 more minutes of focused work seals the day.",
    "Your consistency today is impressive. Ride this wave a little longer.",
    "Switch to your most meaningful task for one final push.",
    "You've earned your flow state. Use it — one more sprint to the finish.",
  ],
  done: [
    "Target hit! Use this clarity to plan tomorrow's deep work.",
    "You showed up and did the work. Consider journaling what you learned.",
    "Goal reached. Try 15 bonus minutes on a skill you want to sharpen.",
    "Amazing focus today. Reflect: what technique worked best?",
    "You're ahead of pace — perfect time to explore a creative side quest.",
  ],
};

const REVENUE_CHALLENGES: Record<string, string[]> = {
  low: [
    "Send one message to a potential client today. Every relationship starts with hello.",
    "Share something useful on social media — visibility attracts opportunity.",
    "Update your portfolio or profile with your latest work. Fresh content converts.",
    "Reach out to someone you admire in your field. Connections open doors.",
    "Write a short post about a problem you solve. Position yourself as the expert.",
  ],
  mid: [
    "Follow up with a past client — warm leads convert 5× faster than cold ones.",
    "Comment thoughtfully on 3 industry posts. Engagement builds your presence.",
    "Draft a case study from a recent win. Social proof is your best salesperson.",
    "Ask a happy client for a testimonial or referral today.",
    "Join one new community or group in your niche. Show up consistently.",
  ],
  high: [
    "You're close! Send a proposal to your warmest lead this week.",
    "Share a client success story publicly — it attracts similar clients.",
    "Review your pricing. Are you charging what your expertise is worth?",
    "Reach out to a complementary freelancer for a collaboration opportunity.",
    "Post a behind-the-scenes look at your process. Authenticity builds trust.",
  ],
  done: [
    "Revenue target hit! Time to think about raising your rates.",
    "Great milestone. Reach out to one dream client as a stretch goal.",
    "Target achieved — invest 15 minutes planning next month's pipeline.",
    "You're ahead. Consider creating a lead magnet or freebie to grow your list.",
    "Impressive momentum! Share your journey — it inspires and attracts.",
  ],
};

const CONGRATS_MESSAGES = [
  "Nicely done! Every minute counts. 💪",
  "You showed up — that's what matters. ✨",
  "Small steps, big progress. Keep going!",
  "Another boost in the books. Well done! 🎯",
  "Consistency is your superpower. Great session!",
  "That's the spirit! Forward momentum, always. 🚀",
];

function getBracket(progress: number): string {
  if (progress >= 100) return "done";
  if (progress >= 75) return "high";
  if (progress >= 25) return "mid";
  return "low";
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Daily persistence ──
// Same message all day unless user completes a boost session.
// Stored in localStorage keyed by date.

interface DailyBoostState {
  date: string;        // YYYY-MM-DD
  challenge: BoostChallenge;
  completed: boolean;  // true after user finishes a boost session
}

const STORAGE_KEY = "trace_daily_boost";

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadState(): DailyBoostState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw) as DailyBoostState;
    if (state.date !== todayKey()) return null; // expired
    return state;
  } catch {
    return null;
  }
}

function saveState(state: DailyBoostState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function generateChallenge(hourProgress: number, revenueProgress: number): BoostChallenge {
  const timeBracket = getBracket(hourProgress);
  const revBracket = getBracket(revenueProgress);

  const useRevenue = revenueProgress < hourProgress
    ? Math.random() < 0.65
    : Math.random() < 0.35;

  if (useRevenue && REVENUE_CHALLENGES[revBracket]) {
    return { type: "revenue", message: pickRandom(REVENUE_CHALLENGES[revBracket]) };
  }
  return { type: "time", message: pickRandom(TIME_CHALLENGES[timeBracket]) };
}

/**
 * Returns today's boost challenge.
 * Same message all day unless markBoostCompleted() was called,
 * in which case a fresh one is generated.
 */
export function getBoostChallenge(hourProgress: number, revenueProgress: number): BoostChallenge {
  const existing = loadState();

  // Reuse today's message if not yet completed
  if (existing && !existing.completed) {
    return existing.challenge;
  }

  // Generate fresh (new day or post-completion)
  const challenge = generateChallenge(hourProgress, revenueProgress);
  saveState({ date: todayKey(), challenge, completed: false });
  return challenge;
}

/**
 * Call after user finishes a boost session.
 * Next call to getBoostChallenge will generate a new message.
 */
export function markBoostCompleted() {
  const state = loadState();
  if (state) {
    state.completed = true;
    saveState(state);
  }
}

export function getCongratsMessage(): string {
  return pickRandom(CONGRATS_MESSAGES);
}
