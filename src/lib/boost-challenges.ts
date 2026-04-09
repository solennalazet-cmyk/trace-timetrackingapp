// Curated challenge pools for the Daily Boost feature
// Brackets: <25%, 25-50%, 50-75%, >75%

export interface BoostChallenge {
  type: "time" | "revenue";
  message: string;
}

const TIME_CHALLENGES: Record<string, string[]> = {
  low: [
    "Start with just 15 minutes of focused work. Small steps build momentum.",
    "Try our Focus mode — a short session can shift your whole day.",
    "Switch to a completely different task. Fresh context boosts energy.",
    "Do something unrelated for 5 minutes — stretch, walk, breathe — then dive in.",
    "Set a timer for 25 minutes and work on your easiest task first.",
  ],
  mid: [
    "You're building momentum! Add one more focused session today.",
    "Try changing tasks — a fresh challenge can unlock a second wind.",
    "Block 30 minutes with no distractions. You'll surprise yourself.",
    "Step away for a quick walk, then come back for one more sprint.",
    "Use Focus mode for a 25-minute deep dive. You're closer than you think.",
  ],
  high: [
    "You're on a roll! One more session could push you over the line.",
    "Almost there — 15 more minutes and you'll feel unstoppable.",
    "Try a Pomodoro: 25 min focus + 5 min break. Finish strong.",
    "You've done the hard part. One last push to hit your target.",
    "Switch to something creative for variety — keep the energy flowing.",
  ],
  done: [
    "You've hit your target! Consider a bonus session to get ahead.",
    "Goal reached! Try exploring a new skill or side project today.",
    "Amazing consistency. Want to challenge yourself with 15 extra minutes?",
    "You're ahead of pace — perfect time to learn something new.",
    "Target crushed! Use this momentum to plan tomorrow's priorities.",
  ],
};

const REVENUE_CHALLENGES: Record<string, string[]> = {
  low: [
    "Reach out to one new prospect today. A single message can open doors.",
    "Post something valuable on social media — visibility drives opportunity.",
    "Browse a freelancer platform and apply to one relevant gig.",
    "Check if there's a local meetup or networking event this week.",
    "Send a follow-up to a past client. Warm leads convert faster.",
  ],
  mid: [
    "Update your portfolio with recent work — fresh showcases attract clients.",
    "Register for an industry event or webinar to expand your network.",
    "Reach out to two prospects today. Double the outreach, double the chances.",
    "Share a case study or win on LinkedIn. Let your work speak for you.",
    "Join an online community for freelancers in your niche. Connections compound.",
  ],
  high: [
    "You're close! Send a proposal to a warm lead this week.",
    "Review your pricing — are you charging what you're worth?",
    "Ask a happy client for a referral. Word of mouth is powerful.",
    "Post a testimonial or review on your website. Trust converts.",
    "Reach out to a complementary freelancer for collaboration opportunities.",
  ],
  done: [
    "Revenue target hit! Time to think about raising your rates.",
    "You've earned it. Consider investing in a tool or course to level up.",
    "Great milestone! Reach out to one dream client as a stretch goal.",
    "Target achieved — perfect time to plan next month's pipeline.",
    "Impressive work! Share your journey — it inspires others and attracts leads.",
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

export function getBoostChallenge(hourProgress: number, revenueProgress: number): BoostChallenge {
  // Pick the goal that's further from target (more helpful)
  const timeBracket = getBracket(hourProgress);
  const revBracket = getBracket(revenueProgress);

  // Alternate randomly but favour the weaker area
  const useRevenue = revenueProgress < hourProgress
    ? Math.random() < 0.65
    : Math.random() < 0.35;

  if (useRevenue && REVENUE_CHALLENGES[revBracket]) {
    return { type: "revenue", message: pickRandom(REVENUE_CHALLENGES[revBracket]) };
  }
  return { type: "time", message: pickRandom(TIME_CHALLENGES[timeBracket]) };
}

export function getCongratsMessage(): string {
  return pickRandom(CONGRATS_MESSAGES);
}
