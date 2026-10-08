/**
 * Funny callouts shown on the projector and on phones: after each question a random player gets a spotlight line
 * that nods to a meme or vine, and every player who got it wrong or didn't answer gets their own.
 *
 * Rules for every line in the bank: kind to the person, about the answer (never about intelligence, looks or
 * background), no swearing, no real people. Memes and vines are named or alluded to in our own words; no clips,
 * images or song lyrics are reproduced.
 */

export type CalloutKind = 'wrong' | 'none' | 'fast' | 'streak' | 'allCorrect' | 'allWrong' | 'flag';
export type CalloutMood = 'happy' | 'shock' | 'sleepy' | 'sideeye' | 'proud' | 'party';
export type CalloutFx = 'boom' | 'tumbleweed' | 'confetti' | 'fire' | 'zzz' | 'rain';

export interface Callout {
  id: string;
  kind: CalloutKind;
  mood: CalloutMood;
  emoji: string;
  text: string;
  /** The meme or vine it nods to, shown as a small tag. */
  ref?: string;
  fx?: CalloutFx;
  playerId?: string;
  nickname?: string;
}

interface Line {
  text: string;
  emoji: string;
  mood: CalloutMood;
  ref?: string;
  fx?: CalloutFx;
}

const l = (text: string, emoji: string, mood: CalloutMood, ref?: string, fx?: CalloutFx): Line => ({
  text,
  emoji,
  mood,
  ref,
  fx,
});

const wrong: Line[] = [
  l(
    'Looked at the right answer and said “Road work ahead?” Not today, {name}.',
    '🚧',
    'sideeye',
    'Vine: Road Work Ahead',
    'boom',
  ),
  l(
    'Surprised Pikachu face: {name}. (The correct answer is also surprised.)',
    '😮',
    'shock',
    'Meme: Surprised Pikachu',
    'boom',
  ),
  l('This is fine. {name}’s answer is fine. Everything is fine.', '🔥', 'shock', 'Meme: This Is Fine', 'boom'),
  l('And I oop— {name}!', '🫢', 'shock', 'Vine: And I Oop', 'boom'),
  l('VINE BOOM. {name}’s answer just hit the floor.', '💥', 'shock', 'Sound: Vine boom', 'boom'),
  l(
    '{name} said “what are those?” to the right answer and walked away.',
    '👟',
    'sideeye',
    'Vine: What Are Those?',
    'rain',
  ),
  l('Hide-the-pain {name}: smiling, while the answer key disagrees.', '😬', 'sideeye', 'Meme: Hide the Pain Harold'),
  l('{name} speedran a wrong answer. New personal best!', '⏱️', 'happy', 'Gaming: Speedrun', 'boom'),
  l('Oof. {name}, that one stung a little.', '😵', 'shock', 'Sound: Roblox oof', 'boom'),
  l('Nobody: … {name}: confidently wrong.', '😎', 'sideeye', 'Meme: Nobody:', 'rain'),
  l('{name} has entered the chat and left the correct answer behind.', '🚪', 'sideeye'),
  l('Bruh. {name}, probably, right now.', '😐', 'sideeye', 'Meme: Bruh'),
  l('{name}: “I know this one!” The quiz: “You really do not.”', '🙃', 'sideeye', undefined, 'rain'),
  l('{name} chose chaos. The answer key chose a different chaos.', '🌀', 'shock'),
  l(
    '{name} said “trust me bro” to the answer key. The answer key left them on read.',
    '🫠',
    'sideeye',
    'Slang: Trust me bro',
  ),
  l('That answer was not it, {name}. It was not giving… correct.', '💅', 'sideeye', 'Slang: It’s giving', 'boom'),
  l('{name}’s aura took −500 on that one. Recovery arc loading.', '✨', 'shock', 'Slang: Aura points', 'boom'),
  l(
    '{name} understood the assignment. A different assignment, but still.',
    '📝',
    'happy',
    'Slang: Understood the assignment',
  ),
  l('Lowkey close, highkey wrong. Respectfully, {name}.', '🤏', 'sideeye', 'Slang: Lowkey, highkey'),
  l('{name} is cooked. (Only this question. Only a little.)', '🍳', 'shock', 'Slang: Cooked', 'fire'),
  l(
    'Main character energy, wrong answer energy. {name}, we’re rooting for the sequel.',
    '🎬',
    'happy',
    'Slang: Main character',
  ),
  l('{name} pressed Seen on the right answer and replied with something else.', '👁️', 'sideeye', 'Insta: Seen'),
  l('The right answer slid into {name}’s DMs. {name} left it on read.', '📩', 'sideeye', 'Insta: Left on read'),
  l('{name} posted a wrong answer. The comments are just “ratio.”', '💬', 'sideeye', 'Meme: Ratio', 'rain'),
  l('{name} ate, but the answer key said “that’s not on the menu.”', '🍽️', 'sideeye', 'Slang: Ate'),
  l('Mid answer, {name}. Next one will slap. We believe in you.', '🫶', 'happy', 'Slang: Mid'),
  l('Delulu is the solulu, {name}. The quiz disagrees today.', '🦄', 'sideeye', 'Slang: Delulu is the solulu'),
  l('{name} entered sigma mode. Sigma picked the wrong option.', '🐺', 'sideeye', 'Meme: Sigma', 'boom'),
  l('L + ratio + wrong option. Take the L gracefully, {name}.', '📉', 'sideeye', 'Meme: L + ratio', 'boom'),
  l('{name} needs to touch grass. And then re-read the question.', '🌱', 'sideeye', 'Slang: Touch grass'),
  l('That answer was pure brainrot, {name}. Lovable brainrot.', '🧠', 'shock', 'Slang: Brainrot', 'rain'),
  l('That answer was not very demure, not very mindful, {name}.', '🧘', 'sideeye', 'Trend: Very demure'),
  l('Crash out? Never. {name} just took a small detour to the wrong answer.', '🛣️', 'happy', 'Slang: Crash out'),
  l(
    'Red light, green light: {name} moved. Eliminated (this question only).',
    '🔴',
    'shock',
    'Show: Squid Game',
    'boom',
  ),
  l('A blue shell hit {name} right at the finish line.', '🐢', 'shock', 'Gaming: Mario Kart', 'boom'),
  l('{name} used Tackle. It missed. Pikachu is concerned.', '⚡', 'sideeye', 'Gaming: Pokémon'),
  l('{name}’s answer was sus. Emergency meeting!', '🚨', 'sideeye', 'Gaming: Among Us', 'boom'),
  l('Creeper energy: {name}’s answer exploded quietly.', '🟩', 'shock', 'Gaming: Minecraft', 'boom'),
  l('Babu Bhaiya would have picked that too, {name}. Pure Hera Pheri energy.', '🕶️', 'happy', 'Bollywood: Hera Pheri'),
  l(
    'Sharma ji’s kid got this one. Just kidding, {name}. The next one is yours.',
    '🏅',
    'happy',
    'Meme: Sharma ji ka beta',
  ),
  l('Rasode mein kaun tha? Apparently {name}’s answer was.', '🍲', 'shock', 'Meme: Rasode mein kaun tha'),
  l(
    '{name} has entered the Upside Down. The right answer stayed in Hawkins.',
    '🙃',
    'shock',
    'Show: Stranger Things',
    'boom',
  ),
  l('{name} doesn’t feel so good… that answer just got snapped.', '🫰', 'shock', 'Movie: Avengers', 'boom'),
  l('The Sorting Hat put {name}’s answer in Nope.', '🎩', 'sideeye', 'Movie: Harry Potter'),
  l('{name}’s answer got archived. Nobody liked it, and nobody saw it.', '🗂️', 'sideeye', 'Insta: Archive'),
  l(
    'Instagram vs reality: {name} thought it was right. Reality: filter off.',
    '📸',
    'sideeye',
    'Insta: Instagram vs reality',
  ),
  l('{name} shared that answer to Close Friends only. Even they said “hmm.”', '💚', 'sideeye', 'Insta: Close Friends'),
  l('That answer was a Story, {name}: gone in 24 hours. Move on.', '⏳', 'happy', 'Insta: Stories'),
  l('Reel it back, {name}. That answer needs a retake.', '🎞️', 'sideeye', 'Insta: Reels'),
  l('{name} got shadowbanned from the leaderboard for exactly one question.', '👻', 'shock', 'Insta: Shadowban'),
];

const none: Line[] = [
  l('{name} left the chat. Tumbleweed delivered.', '🌵', 'sleepy', undefined, 'tumbleweed'),
  l(
    'Why are you running, {name}? Oh. You just never answered.',
    '🏃',
    'sideeye',
    'Vine: Why Are You Running?',
    'tumbleweed',
  ),
  l(
    '“Look at all those chickens,” said {name}, ignoring the timer.',
    '🐔',
    'sleepy',
    'Vine: Look At All Those Chickens',
    'zzz',
  ),
  l('{name} is buffering… Please hold.', '⏳', 'sleepy', undefined, 'zzz'),
  l('{name} saw the question and chose peace.', '☮️', 'sleepy', undefined, 'zzz'),
  l('Still waiting on {name}. Imagine elevator music.', '🛗', 'sleepy', 'Meme: Elevator music', 'zzz'),
  l('{name} is on Do Not Disturb.', '🔕', 'sleepy', undefined, 'zzz'),
  l('{name} dodged the question like a pro. Nope.', '🙈', 'sideeye', 'Meme: Nope', 'tumbleweed'),
  l('{name} is in their ghost era. We saw the question; they saw nothing.', '👻', 'sleepy', 'Slang: Ghosted', 'zzz'),
  l('{name} left the question on read.', '👀', 'sideeye', 'Insta: Left on read', 'tumbleweed'),
  l('{name} is on a digital detox. Bold. Wrong week.', '📵', 'sleepy', 'Trend: Digital detox', 'zzz'),
  l('Seen at 0:00. Reply: never. Classic {name}.', '✔️', 'sideeye', 'Insta: Seen', 'tumbleweed'),
  l('{name} muted this question.', '🔇', 'sleepy', 'Insta: Mute', 'zzz'),
  l('NPC mode: {name} stood perfectly still while the timer ran.', '🧍', 'sleepy', 'Meme: NPC', 'tumbleweed'),
  l('{name} said “one sec” and got lost in Reels.', '📱', 'sleepy', 'Insta: Reels', 'zzz'),
  l(
    '{name} is built different. Different meaning: did not answer.',
    '🛠️',
    'sideeye',
    'Slang: Built different',
    'tumbleweed',
  ),
  l('This question lives rent free in {name}’s head, and still no answer.', '🏠', 'sleepy', 'Slang: Rent free', 'zzz'),
  l('{name} skipped the question like an ad. Five seconds, then gone.', '⏭️', 'sideeye', undefined, 'tumbleweed'),
  l('{name} got lost in the group chat. Sending a search party.', '💬', 'sleepy', undefined, 'zzz'),
  l('Red light, green light: {name} froze until time ran out.', '🔴', 'sleepy', 'Show: Squid Game', 'tumbleweed'),
  l(
    'Hera Pheri pause: {name} is thinking… and thinking… and thinking.',
    '🤔',
    'sleepy',
    'Bollywood: Hera Pheri',
    'zzz',
  ),
  l('{name} went to touch grass mid-question.', '🌿', 'sleepy', 'Slang: Touch grass', 'tumbleweed'),
  l('{name} was locked in. Just not on this question.', '🔒', 'sideeye', 'Slang: Locked in', 'tumbleweed'),
];

const fast: Line[] = [
  l('{name} answered before the question finished loading. Zoom zoom!', '🏎️', 'proud', undefined, 'confetti'),
  l('Stonks. {name} is up a thousand points.', '📈', 'proud', 'Meme: Stonks', 'confetti'),
  l('Absolute cinema: {name}’s answer.', '🎬', 'proud', 'Meme: Absolute Cinema', 'confetti'),
  l('{name} woke up and chose accuracy.', '☀️', 'proud', undefined, 'confetti'),
  l('Big brain time: {name}.', '🧠', 'party', 'Meme: Big Brain', 'confetti'),
  l('{name} is cooking. Somebody check the oven.', '🍳', 'party', 'Slang: Cooking', 'confetti'),
  l('Too easy for {name}. Bring harder questions.', '😎', 'proud', undefined, 'confetti'),
  l('{name} ate and left no crumbs. Fast and right.', '🍽️', 'party', 'Slang: Ate and left no crumbs', 'confetti'),
  l('{name} has rizz… for the right answer. Fast, too.', '😏', 'proud', 'Slang: Rizz', 'confetti'),
  l('No cap: {name} answered before the rest of us blinked.', '🧢', 'proud', 'Slang: No cap', 'confetti'),
  l('{name} is giving main character. Correct and quick.', '💅', 'party', 'Slang: It’s giving', 'confetti'),
  l('W from {name}. Big W. Biggest W.', '🏆', 'party', 'Meme: W', 'confetti'),
  l('Aura +1000 for {name}. Fastest fingers in the room.', '✨', 'proud', 'Slang: Aura points', 'confetti'),
  l('{name} said “easy” and meant it. Speedrun, any percent.', '🎮', 'proud', 'Gaming: Speedrun', 'confetti'),
  l('Victory Royale for {name}. Drops in, answers first.', '🏁', 'party', 'Gaming: Fortnite', 'confetti'),
  l('{name} just grabbed a Mario Kart star. Zooming past everyone.', '⭐', 'party', 'Gaming: Mario Kart', 'confetti'),
  l('Slay, {name}. Slay hard.', '💃', 'party', 'Slang: Slay', 'confetti'),
  l('Certified lightning from {name}. Somebody call the algorithm.', '⚡', 'proud', 'Insta: Algorithm', 'confetti'),
  l('{name} went viral for that speed. One million views.', '📲', 'party', 'Insta: Viral', 'confetti'),
  l('Blue tick energy: {name}’s answer is verified.', '✔️', 'proud', 'Insta: Verified', 'confetti'),
  l('Michelin-star quick, {name}. Cooked, plated, served.', '🍽️', 'proud', 'Slang: Cooking', 'confetti'),
  l('Tuff. Just tuff, {name}.', '💪', 'proud', 'Slang: Tuff', 'confetti'),
];

const streak: Line[] = [
  l('{name} is on FIRE: {streak} in a row! Call the fire department.', '🔥', 'party', undefined, 'fire'),
  l('{streak} in a row for {name}. Is that a cheat code? ↑↑↓↓←→←→BA', '🎮', 'party', 'Gaming: Konami code', 'fire'),
  l('{name}’s streak: {streak}. The quiz is sweating.', '💦', 'proud', undefined, 'fire'),
  l('{streak} in a row. {name} is locked in. Do not disturb.', '🔒', 'proud', 'Slang: Locked in', 'fire'),
  l('{name} is on a {streak}-answer heater. Somebody hold the leaderboard.', '🌡️', 'party', undefined, 'fire'),
  l('{streak} for {name} without a miss. We’re so back.', '🙌', 'party', 'Meme: We’re so back', 'fire'),
  l('{name}: {streak} W’s in a row. The W key is stuck.', '🏆', 'party', 'Meme: W', 'fire'),
  l('{name} has {streak} in a row. Chat, is this real?', '💬', 'shock', 'Meme: Chat, is this real?', 'fire'),
  l('Aura farming: {name} is {streak} answers deep.', '✨', 'proud', 'Slang: Aura farming', 'fire'),
  l('{name} is cooking: {streak} dishes, zero burns.', '🍳', 'party', 'Slang: Cooking', 'fire'),
  l('{streak} streak! {name}’s Snapstreak flame is not going out.', '🔥', 'party', 'Insta: Streaks', 'fire'),
  l(
    '{name} entered the Super Saiyan era: {streak} correct and still rising.',
    '⚡',
    'party',
    'Show: Dragon Ball',
    'fire',
  ),
  l('{streak} straight for {name}. Not even a blue shell can stop this.', '🏎️', 'proud', 'Gaming: Mario Kart', 'fire'),
  l('{name}: {streak} in a row. Main character arc unlocked.', '🎬', 'party', 'Slang: Main character', 'fire'),
  l('{name} is on {streak}. The algorithm only shows {name} now.', '📲', 'proud', 'Insta: Algorithm', 'fire'),
  l('{streak} in a row. {name} stays winning.', '👑', 'party', 'Meme: Winning', 'fire'),
];

const allCorrect: Line[] = [
  l('Everyone got it right. This room is cracked.', '🤯', 'party', undefined, 'confetti'),
  l('Unanimous! Even the owl is impressed.', '🦉', 'party', undefined, 'confetti'),
  l('A perfect round. Nobody told the question it was supposed to be hard.', '🎉', 'party', undefined, 'confetti'),
  l(
    'Whole room ate. No crumbs. It’s giving classroom genius.',
    '🍽️',
    'party',
    'Slang: Ate and left no crumbs',
    'confetti',
  ),
  l(
    'Everybody understood the assignment. The teacher is shook.',
    '📝',
    'party',
    'Slang: Understood the assignment',
    'confetti',
  ),
  l('100% W. The group chat is going to be unbearable.', '🏆', 'party', 'Meme: W', 'confetti'),
  l('Entire room: locked in. Aura levels: legendary.', '✨', 'proud', 'Slang: Locked in', 'confetti'),
  l('Gotta catch ’em all? The room did. Every single answer.', '🔴', 'party', 'Gaming: Pokémon', 'confetti'),
  l('Clean sweep. Slay, everyone.', '💃', 'party', 'Slang: Slay', 'confetti'),
];

const allWrong: Line[] = [
  l('Nobody got that one. The question wins this round.', '🏆', 'proud', 'Meme: Nobody:', 'boom'),
  l('Plot twist: the whole room fell for it.', '🌪️', 'shock', undefined, 'rain'),
  l('Class discussion time: what just happened?', '🧐', 'sideeye', undefined, 'boom'),
  l('Whole room is cooked on that one. Group hug at the leaderboard.', '🍳', 'shock', 'Slang: Cooked', 'boom'),
  l('Collective L. We take it together. It’s giving plot twist.', '📉', 'sideeye', 'Meme: L + ratio', 'boom'),
  l('That question was a boss fight and the whole room got one-shot.', '👾', 'shock', 'Gaming: Boss fight', 'boom'),
  l('Zero rizz points for anyone on that one.', '😶', 'sideeye', 'Slang: Rizz', 'rain'),
  l('That question was built different.', '🛠️', 'shock', 'Slang: Built different', 'boom'),
  l('The group chat is about to explode: “WHAT WAS THE ANSWER?!”', '💬', 'shock', undefined, 'rain'),
  l('Round one of Squid Game: the entire room just got eliminated.', '🔴', 'shock', 'Show: Squid Game', 'boom'),
  l('A silence so loud that even Hoot hid.', '🦉', 'sleepy', undefined, 'zzz'),
];

const flagBySeverity: Record<'minor' | 'moderate' | 'major', Line[]> = {
  minor: [
    l('Distracted Boyfriend, but the quiz is {name}’s other tab.', '👀', 'sideeye', 'Meme: Distracted Boyfriend'),
    l('{name} looked away for a second… we saw that.', '👀', 'sideeye'),
    l('{name} checked Instagram for one second. We can tell.', '📱', 'sideeye', 'Insta: Doomscrolling'),
    l('{name} had a Reels emergency. It was brief.', '🎞️', 'sideeye', 'Insta: Reels'),
    l('Quick tab hop from {name}. Fast, but not fast enough.', '🐇', 'sideeye'),
  ],
  moderate: [
    l('Sir, this is a quiz. {name} left the tab.', '🫡', 'sideeye'),
    l('{name} was acting sus.', '📮', 'sideeye', 'Meme: Sus'),
    l('{name}: not very demure, not very mindful. Left the tab.', '🧘', 'sideeye', 'Trend: Very demure'),
    l('{name} is in their ghost era. Out of the quiz, that is.', '👻', 'sideeye', 'Slang: Ghosted'),
    l('That tab switch is giving “I have a secret,” {name}.', '🤫', 'sideeye', 'Slang: It’s giving'),
    l('{name} is the impostor in the other tab.', '🚨', 'sideeye', 'Gaming: Among Us'),
  ],
  major: [
    l('Caught in 4K: {name}!', '📸', 'shock', 'Meme: Caught in 4K', 'boom'),
    l('{name} has the whole room’s full attention. Congratulations?', '🔦', 'shock', undefined, 'boom'),
    l('Busted! {name} just got ratio’d by the anti-cheat.', '🚔', 'shock', 'Meme: Ratio', 'boom'),
    l('{name}: “It wasn’t me.” The logs: “It was.”', '📜', 'shock', undefined, 'boom'),
    l('Plot twist: {name} was the impostor all along.', '🚨', 'shock', 'Gaming: Among Us', 'boom'),
    l('The Detective Owl has entered the chat. {name} has left the building.', '🕵️', 'shock', undefined, 'boom'),
  ],
};

/** Shown on a phone the moment an answer is locked in (no names, nothing sent anywhere). */
export const LOCK_IN_QUIPS = [
  'Locked in. No take-backs. 🔒',
  'Bold choice. Let’s see… 👀',
  'Confidence level: unreasonable 😎',
  'The quiz gods have heard you.',
  'Calculated. Or guessed. We’ll find out.',
  'Sent! The owl is nervous. 🦉',
  'No cap, that’s the one. 🧢',
  'Locked in. Aura on the line. ✨',
  'Sent it. Now we pray. 🙏',
  'It’s giving confident. 💅',
  'Seen ✓✓ by the quiz.',
  'Posted to your Story. 24 hours of suspense. 📲',
  'Delulu is the solulu. 🦄',
  'Bet. 🫡',
  'Main character move. 🎬',
  'That’s a sigma pick. 🐺',
];

const BANK: Record<Exclude<CalloutKind, 'flag'>, Line[]> = { wrong, none, fast, streak, allCorrect, allWrong };

/* ---------------------------------------------------------------------- */
/* Randomness                                                              */
/* ---------------------------------------------------------------------- */

/** Deterministic PRNG so a reveal re-sent after a host action keeps the same callouts. */
export function seededRand(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(items: T[], rand: () => number): T => items[Math.floor(rand() * items.length)]!;

/**
 * A line from `bank` for question number `index`: the bank is shuffled once per `key` (game, player or kind) and
 * walked in that order, so the same line never comes back until every other line has been used.
 */
function lineFrom(bank: Line[], key: string, index: number): Line {
  const rand = seededRand(key);
  const order = bank.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return bank[order[Math.abs(index) % bank.length]!]!;
}

/** Streak call-outs are for milestones only (3, 5, 7, 10, 15, 20 …), not on every question of a streak. */
export const isStreakMoment = (n: number): boolean => n === 3 || n === 5 || n === 7 || (n >= 10 && n % 5 === 0);

const fill = (text: string, vars: { name?: string; streak?: number }) =>
  text.replace('{name}', vars.name ?? 'Someone').replace('{streak}', String(vars.streak ?? 0));

function make(
  kind: CalloutKind,
  line: Line,
  id: string,
  vars: { name?: string; streak?: number; playerId?: string },
): Callout {
  return {
    id,
    kind,
    mood: line.mood,
    emoji: line.emoji,
    text: fill(line.text, vars),
    ref: line.ref,
    fx: line.fx,
    playerId: vars.playerId,
    nickname: vars.name,
  };
}

/** A flag quip, chosen when the flag is raised. Not deterministic: it is stored with the flag. */
export function flagCallout(
  severity: 'minor' | 'moderate' | 'major',
  name: string,
  playerId: string,
  flagId: string,
  rand: () => number = Math.random,
): Callout {
  return make('flag', pick(flagBySeverity[severity], rand), `flag-${flagId}`, { name, playerId });
}

/* ---------------------------------------------------------------------- */
/* Choosing who gets the spotlight                                         */
/* ---------------------------------------------------------------------- */

export type Outcome = 'right' | 'wrong' | 'none' | 'voided';
export interface PlayerOutcome {
  id: string;
  nickname: string;
  outcome: Outcome;
  /** Server-measured answer time for this question, if they answered. */
  tMs: number | null;
  streak: number;
}

export interface QuestionCallouts {
  /** One spotlight for the whole room (projector and phones). */
  spotlight: Callout | null;
  /** A line for everyone who got it wrong or didn't answer, plus streak holders. */
  personal: Map<string, Callout>;
}

/**
 * Pure and seeded: the same question outcome always gives the same callouts.
 * `avoid` holds players who were spotlighted recently, so the same person is not picked every round.
 */
export function computeCallouts(input: {
  /** Identifies the game; lines are shuffled per game so two games do not play out the same. */
  seed: string;
  /** The question number, used to walk through the shuffled lines without repeating one. */
  index?: number;
  players: PlayerOutcome[];
  limitMs: number;
  avoid?: string[];
}): QuestionCallouts {
  const { seed, players, limitMs } = input;
  const index = input.index ?? 0;
  const avoid = new Set(input.avoid ?? []);
  const rand = seededRand(`${seed}:${index}`);
  const personal = new Map<string, Callout>();

  const rights = players.filter((p) => p.outcome === 'right');
  const wrongs = players.filter((p) => p.outcome === 'wrong');
  const nones = players.filter((p) => p.outcome === 'none');
  const counted = players.filter((p) => p.outcome !== 'voided');

  const forPlayer = (kind: Exclude<CalloutKind, 'flag'>, p: PlayerOutcome): Callout =>
    make(kind, lineFrom(BANK[kind], `${seed}:p:${p.id}:${kind}`, index), `${seed}:${index}:${p.id}`, {
      name: p.nickname,
      streak: p.streak,
      playerId: p.id,
    });
  /** The room-wide spotlight: one shuffle per game and kind, so consecutive spotlights never share a line. */
  const spotFor = (kind: Exclude<CalloutKind, 'flag'>, p: PlayerOutcome): Callout =>
    make(kind, lineFrom(BANK[kind], `${seed}:spot:${kind}`, index), `${seed}:${index}:${p.id}`, {
      name: p.nickname,
      streak: p.streak,
      playerId: p.id,
    });

  for (const p of wrongs) personal.set(p.id, forPlayer('wrong', p));
  for (const p of nones) personal.set(p.id, forPlayer('none', p));
  for (const p of rights) if (isStreakMoment(p.streak)) personal.set(p.id, forPlayer('streak', p));

  // Group moments beat individual ones when they apply.
  if (counted.length >= 3 && counted.every((p) => p.outcome === 'right')) {
    return {
      spotlight: make('allCorrect', lineFrom(BANK.allCorrect, `${seed}:all:right`, index), `${seed}:${index}:all`, {}),
      personal,
    };
  }
  if (counted.length >= 3 && counted.every((p) => p.outcome === 'wrong' || p.outcome === 'none')) {
    return {
      spotlight: make('allWrong', lineFrom(BANK.allWrong, `${seed}:all:wrong`, index), `${seed}:${index}:all`, {}),
      personal,
    };
  }

  const fresh = <T extends PlayerOutcome>(list: T[]) => {
    const notRecent = list.filter((p) => !avoid.has(p.id));
    return notRecent.length ? notRecent : list;
  };
  const fastRights = rights.filter((p) => p.tMs !== null && p.tMs < limitMs * 0.4);
  const streakers = rights.filter((p) => isStreakMoment(p.streak));

  type Option = { kind: Exclude<CalloutKind, 'flag'>; weight: number; pool: PlayerOutcome[] };
  const options: Option[] = (
    [
      { kind: 'wrong', weight: 4, pool: wrongs },
      { kind: 'none', weight: 3, pool: nones },
      { kind: 'fast', weight: 3, pool: fastRights },
      { kind: 'streak', weight: 2, pool: streakers },
    ] as Option[]
  ).filter((o) => o.pool.length > 0);
  if (!options.length) return { spotlight: null, personal };

  let roll = rand() * options.reduce((n, o) => n + o.weight, 0);
  const chosen = options.find((o) => (roll -= o.weight) < 0) ?? options[options.length - 1]!;
  const who = pick(fresh(chosen.pool), rand);
  const spotlight = spotFor(chosen.kind, who);
  personal.set(who.id, spotlight);
  return { spotlight, personal };
}

export const CALLOUT_BANK_SIZE =
  Object.values(BANK).reduce((n, l) => n + l.length, 0) +
  Object.values(flagBySeverity).reduce((n, l) => n + l.length, 0);

/** Exposed for tests: every line, so they can be checked for tone and shape. */
export const ALL_LINES: { kind: CalloutKind; line: Line }[] = [
  ...(Object.entries(BANK) as [Exclude<CalloutKind, 'flag'>, Line[]][]).flatMap(([kind, lines]) =>
    lines.map((line) => ({ kind, line })),
  ),
  ...Object.values(flagBySeverity).flatMap((lines) => lines.map((line) => ({ kind: 'flag' as const, line }))),
];

const DEMO_NAMES = ['Riya', 'Dev', 'Asha', 'Kabir', 'Meera', 'Zoya', 'Arjun', 'Ira'];

/** A random sample callout for the home page ("Roast someone"), with a made-up player name. */
export function demoCallout(rand: () => number = Math.random): Callout {
  const kinds: Exclude<CalloutKind, 'flag'>[] = ['wrong', 'none', 'fast', 'streak', 'wrong', 'none'];
  const kind = kinds[Math.floor(rand() * kinds.length)]!;
  const name = DEMO_NAMES[Math.floor(rand() * DEMO_NAMES.length)]!;
  return make(kind, pick(BANK[kind], rand), `demo-${Math.floor(rand() * 1e9)}`, {
    name,
    streak: 3 + Math.floor(rand() * 4),
  });
}
