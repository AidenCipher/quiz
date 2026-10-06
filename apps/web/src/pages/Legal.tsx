import { Link } from 'react-router';
import { Page } from '../components/Chrome';
import { missingBusinessDetails, site } from '../lib/site';

const Missing = ({ what }: { what: string }) => (
  <strong style={{ color: '#b00020' }}>[{what}: not provided by the operator yet]</strong>
);

export function Operator() {
  return (
    <>
      <strong>{site.operator || <Missing what="operator name" />}</strong>
      <br />
      {site.address || <Missing what="postal address" />}
      {site.country && (
        <>
          <br />
          {site.country}
        </>
      )}
      <br />
      {site.email ? <a href={`mailto:${site.email}`}>{site.email}</a> : <Missing what="contact email" />}
    </>
  );
}

export function Privacy() {
  return (
    <Page title="Privacy policy">
      <p>
        This policy explains what {site.name} collects, why, who can see it, and how to have it deleted. It is written
        in plain language on purpose.
      </p>

      <h2>Who is responsible</h2>
      <p>
        <Operator />
      </p>

      <h2>What we collect</h2>
      <h3>If you play (no account needed)</h3>
      <ul>
        <li>
          <strong>Nickname</strong> that you type, and an <strong>avatar</strong> you build from cartoon parts. Please
          do not use your real name.
        </li>
        <li>
          <strong>Your answers</strong>, how quickly you answered, and your score and rank in that game.
        </li>
        <li>
          <strong>Tab-switch events</strong>: while a question is open, whether you left the quiz tab or app, for how
          long, and what that cost in points. We never record what you switched to. The host can turn this off for a
          game. Flags are shown to everyone in the room, and the host can clear them.
        </li>
        <li>
          A random <strong>player ID and secret token</strong> so a refresh or a lost connection puts you back in the
          same seat. The token is stored on your device and, on our server, only as a one-way hash.
        </li>
      </ul>
      <h3>If you host</h3>
      <ul>
        <li>
          An opaque Google account identifier and your Google display name, from “Sign in with Google”. We do not ask
          for or store your email address or profile picture.
        </li>
        <li>
          The quizzes you write (including any images you upload and their alt text) and the results of games you ran.
        </li>
      </ul>
      <h3>What we do not collect</h3>
      <p>
        Real names, email addresses of players, phone numbers, location, device identifiers, advertising identifiers,
        contacts, photos, microphone or camera data. There is no analytics, advertising or tracking software in{' '}
        {site.name}, and no third-party scripts.
      </p>
      <h3>Technical data</h3>
      <p>
        Our hosting provider, Cloudflare, necessarily sees your IP address and request details to deliver the site, and
        may keep logs under its own policy. We use IP addresses only in short-lived server memory to slow down repeated
        PIN guesses; we do not store them in our database. Our own logs record events and counts (for example “a flag
        was raised”), not nicknames or answers.
      </p>

      <h2>Why we use it</h2>
      <ul>
        <li>
          To run the quiz you chose to join or host: scoring, ranking, reconnecting, showing results. (Performing the
          service you asked for.)
        </li>
        <li>
          To keep games fair: detecting tab switches and applying the point penalties described on the{' '}
          <Link to="/trust">Trust &amp; safety</Link> page. (Our legitimate interest in fair games; a human host can
          override every flag.)
        </li>
        <li>To sign hosts in and keep their quizzes. (Performing the service.)</li>
      </ul>
      <p>We do not sell data, show ads, build advertising profiles, or use your data to train AI models.</p>

      <h2>Who can see it</h2>
      <ul>
        <li>
          <strong>Everyone in the same game</strong> sees nicknames, avatars, scores, ranks and flags. That is how the
          game works.
        </li>
        <li>
          <strong>The host</strong> of the game sees the full results table, the flag log and can download it as a CSV
          file.
        </li>
        <li>
          <strong>Cloudflare, Inc.</strong> runs our servers and database on our behalf (processor).
        </li>
        <li>
          <strong>Google</strong> only if you are a host signing in with Google.
        </li>
      </ul>

      <h2>How long we keep it</h2>
      <table>
        <thead>
          <tr>
            <th scope="col">Data</th>
            <th scope="col">Kept for</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Live game (players, answers, flags)</td>
            <td>
              Deleted from the live game server about 10 minutes after the host ends the game, and in any case within
              about 6 hours of the game finishing or being abandoned.
            </td>
          </tr>
          <tr>
            <td>Saved results of a finished game</td>
            <td>{site.retention.resultsDays} days, then deleted automatically. The host can delete them earlier.</td>
          </tr>
          <tr>
            <td>Host account, quizzes</td>
            <td>Until the host deletes the account.</td>
          </tr>
          <tr>
            <td>Host sign-in session</td>
            <td>{site.retention.sessionDays} days or until sign-out.</td>
          </tr>
          <tr>
            <td>Seat token and nickname on your device</td>
            <td>Until you leave the game, the game ends, or you clear your browser data.</td>
          </tr>
        </tbody>
      </table>

      <h2>Children</h2>
      <p>
        {site.name} is designed for classrooms and events, so children may play. We collect no more from a child than
        from anyone else: a nickname, an avatar, answers and scores. There are no accounts, no email addresses and no
        advertising for players. Before joining, every player confirms that they are old enough to join on their own or
        that a parent, guardian or teacher has agreed. Before opening a game, every host confirms that they have the
        school's or parents' permission to use {site.name} with any players under 16 (or the age set by local law).
        Hosts are responsible for that permission. Parents and guardians can ask for deletion at any time (see below).
      </p>

      <h2>Your rights</h2>
      <p>
        Depending on where you live (for example under the GDPR, UK GDPR or India's DPDP Act) you can ask to see,
        correct, delete or restrict your data, object to its use, and complain to your data protection authority. The
        quickest ways are on the <Link to="/delete-data">Delete my data</Link> page:
      </p>
      <ul>
        <li>
          Players: “Leave and erase my data” inside the game removes you immediately, including from the saved results.
        </li>
        <li>Hosts: download all your data, delete individual results, or delete your whole account in one click.</li>
        <li>Anything else: write to us and we will reply within 30 days.</li>
      </ul>

      <h2>Where data is processed</h2>
      <p>
        Cloudflare operates a global network, so data may be processed outside your country. Cloudflare and Google
        publish their own safeguards for international transfers.
      </p>

      <h2>Changes</h2>
      <p>
        If we change this policy in a way that matters, we will update the date at the top and, for new data uses, ask
        again.
      </p>

      <h2>Contact</h2>
      <p>
        <Operator />
      </p>
    </Page>
  );
}

export function Cookies() {
  const row = (name: string, kind: string, purpose: string, expires: string) => (
    <tr key={name}>
      <th scope="row">
        <code>{name}</code>
      </th>
      <td>{kind}</td>
      <td>{purpose}</td>
      <td>{expires}</td>
    </tr>
  );
  return (
    <Page title="Cookie and storage policy">
      <p>
        {site.name} uses <strong>only strictly necessary</strong> cookies and browser storage. We do not use analytics,
        advertising, social-media or other tracking cookies, and no third party sets any cookie or storage on our pages.
        That is why there is no “accept all / reject all” choice: there is nothing optional to switch on.
      </p>
      <table>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Type</th>
            <th scope="col">What it is for</th>
            <th scope="col">Lasts</th>
          </tr>
        </thead>
        <tbody>
          {row(
            'qa_session',
            'Cookie (HttpOnly, SameSite=Lax, Secure over HTTPS)',
            'Keeps a host signed in. Players never receive it.',
            `${site.retention.sessionDays} days, or until sign-out`,
          )}
          {row(
            'qa_oauth_state',
            'Cookie (HttpOnly)',
            'Protects “Sign in with Google” against forged requests.',
            '10 minutes',
          )}
          {row(
            'qa:player:<game PIN>',
            'Browser storage',
            'Your seat token, nickname and avatar, so a refresh puts you back in the same game with your score.',
            'Until you leave, the game ends, or you clear site data',
          )}
          {row(
            'qa:profile',
            'Browser storage',
            'Remembers your nickname and avatar for next time. Only saved if you tick “Remember me on this device”.',
            'Until you clear site data',
          )}
          {row('qa:muted', 'Browser storage', 'Remembers that a host muted the sound.', 'Until you clear site data')}
          {row(
            'qa:notice',
            'Browser storage',
            'Remembers that you dismissed the storage notice.',
            'Until you clear site data',
          )}
        </tbody>
      </table>
      <p>
        The game also asks your browser to keep the screen awake during a game (Screen Wake Lock). That is a browser
        feature, not storage, and nothing is saved.
      </p>
      <h2>Managing and deleting</h2>
      <p>
        You can delete all of this in your browser's settings (look for “site data” or “cookies”). The game will still
        work, but you will have to sign in or rejoin again. Players can also erase their game data from inside the game;
        see <Link to="/delete-data">Delete my data</Link>.
      </p>
      <h2>If this changes</h2>
      <p>
        If we ever add anything that is not strictly necessary, we will ask for your permission first and list it here.
        Nothing optional is switched on by default.
      </p>
    </Page>
  );
}

export function Trust() {
  return (
    <Page title="Trust & safety">
      <p>
        What we do to keep games fair and your data safe. We only list things that are true of the code running today.
      </p>

      <h2>Fair play, in the open</h2>
      <ul>
        <li>
          The server keeps the clock, the answers and the scores. A phone cannot change a score, an answer time or a
          deadline.
        </li>
        <li>
          Phones never receive the question text, the option text or the correct answer. Only the big screen does, and
          the answer is revealed only after the question closes.
        </li>
        <li>
          While a question is open we notice when a player leaves the quiz tab or app (and for how long). Short slips
          cost nothing; longer ones void the answer and can deduct points or, after repeated flags, remove the player.
          The host sees every flag and can clear one, which refunds the penalty for everyone. Everyone in the room can
          see flags.
        </li>
        <li>Hosts can switch tab-switch checking off for a game and change every threshold.</li>
      </ul>
      <h3>What we cannot see</h3>
      <p>
        A second device, a friend's screen, paper notes or a voice assistant. We record only that a tab was hidden and
        for how long, never what you opened. Phone calls, low-battery pop-ups or a screen that locks can raise a false
        flag, which is why the host can clear flags.
      </p>

      <h2>Your data</h2>
      <ul>
        <li>
          No analytics, advertising, tracking pixels or third-party scripts. The font is served from our own site.
        </li>
        <li>
          Players need no account and no email address. We store a nickname, an avatar code, answers and timings, and
          delete them on a schedule (see the <Link to="/privacy">privacy policy</Link>).
        </li>
        <li>Seat tokens are stored on our server only as SHA-256 hashes.</li>
        <li>
          Host controls need a signed ticket that expires after one minute, issued only to the signed-in owner of the
          game. Guessing a PIN does not give control.
        </li>
        <li>
          The site is served over HTTPS and sets a Content-Security-Policy that only allows scripts from our own origin.
        </li>
        <li>
          Question text is shown as plain text, never as HTML. Nicknames pass a word filter and the host can rename or
          remove anyone.
        </li>
      </ul>

      <h2>Children</h2>
      <p>
        Players confirm they may join before the Join button works, and hosts confirm they have permission to run a game
        with children. We recommend nicknames instead of real names, and we never ask for a name, email or phone number
        from players.
      </p>

      <h2>Report a problem</h2>
      <p>
        Found a security issue, inappropriate content or a privacy problem? Write to{' '}
        {site.email ? <a href={`mailto:${site.email}`}>{site.email}</a> : <Missing what="contact email" />}. We read
        every report.
      </p>
    </Page>
  );
}

export function Refunds() {
  return (
    <Page title="Pricing & refunds">
      <p>
        <strong>{site.name} is free.</strong> It does not take payments of any kind: no subscription, no purchases
        inside the app, no “premium” tier, no fees for hosts or players, and no paid add-ons. Because nothing is
        charged, there is nothing to refund.
      </p>
      <h2>No hidden costs</h2>
      <ul>
        <li>We do not collect card or bank details anywhere in the app.</li>
        <li>
          Any mobile-data charges from your own carrier are between you and them; we do not control or add to them.
        </li>
        <li>We do not ask for money, donations or “tips”, and nothing is pre-selected on any form.</li>
      </ul>
      <h2>If that ever changes</h2>
      <p>
        If paid features are introduced, we will publish the full price, including taxes, before anyone is asked to pay;
        show the total before payment; spell out the refund terms on this page before any purchase; and never charge for
        something you already use for free today.
      </p>
      <p>
        Questions? Write to{' '}
        {site.email ? <a href={`mailto:${site.email}`}>{site.email}</a> : <Missing what="contact email" />}.
      </p>
    </Page>
  );
}

export function Credits() {
  return (
    <Page title="Credits & licences" updated={false}>
      <h2>Fonts</h2>
      <p>
        Text is set in <strong>Inter</strong>, © The Inter Project Authors, licensed under the SIL Open Font License
        1.1. It is bundled with the site (self-hosted), not loaded from Google or any other third party. The licence
        text is in the <a href="/third-party-notices.txt">third-party notices</a>.
      </p>
      <h2>Images and artwork</h2>
      <p>
        The avatar parts, the detective owl, the shapes and every icon are original artwork made for {site.name} and
        drawn as SVG in the source code. We use no stock photos, no third-party illustrations and no emoji images (emoji
        are drawn by your device's own font).
      </p>
      <p>
        Images that hosts add to their own questions belong to the host, who must only upload images they have the right
        to use. Hosts add a text description for every image.
      </p>
      <h2>Software</h2>
      <p>
        {site.name} is built with open-source software under permissive licences (MIT, ISC and OFL). The complete list
        with licence names is in the <a href="/third-party-notices.txt">third-party notices</a>.
      </p>
    </Page>
  );
}

export function Contact() {
  const missing = missingBusinessDetails();
  return (
    <Page title="Contact & business details" updated={false}>
      <p>
        <Operator />
      </p>
      {missing.length > 0 && (
        <p role="alert" style={{ background: '#fdecec', padding: 10, borderRadius: 8 }}>
          This installation has not been given its {missing.join(', ')}. If you are the operator, set them before going
          live (see the README).
        </p>
      )}
      <p>
        For privacy requests see <Link to="/delete-data">Delete my data</Link>; for security or safety reports see{' '}
        <Link to="/trust">Trust &amp; safety</Link>.
      </p>
    </Page>
  );
}

export function DeleteData() {
  return (
    <Page title="Delete my data">
      <p>You have the right to have your data deleted. Here is how, depending on who you are.</p>

      <h2>I played a game</h2>
      <ol>
        <li>
          <strong>During the game:</strong> open the menu at the bottom of your phone screen and choose{' '}
          <em>Leave and erase my data</em>. You disappear from the game at once; your nickname, answers and flags are
          removed and will not appear in the saved results.
        </li>
        <li>
          <strong>After the game:</strong> your nickname and score sit in the host's saved results for{' '}
          {site.retention.resultsDays} days and are then deleted automatically. You can ask the host to delete the
          result, or write to us with the nickname you used and the approximate date and time of the game. We hold no
          names or emails for players, so we cannot identify you any other way; the more detail you give, the faster we
          can find it.
        </li>
      </ol>
      <p>
        <strong>Parents and guardians</strong> can make the same request for a child.
      </p>

      <h2>I am a host</h2>
      <p>
        Sign in on the <Link to="/host">host page</Link>. At the bottom of “My quizzes” you can{' '}
        <strong>download all your data</strong>, <strong>delete any finished game's results</strong>, and{' '}
        <strong>delete your account</strong>. Deleting the account erases your profile, sign-in sessions, quizzes,
        questions, images and every saved result immediately.
      </p>

      <h2>Write to us</h2>
      <p>
        {site.email ? (
          <>
            Email <a href={`mailto:${site.email}?subject=Data%20deletion%20request`}>{site.email}</a> with the subject
            “Data deletion request”.
          </>
        ) : (
          <Missing what="contact email" />
        )}{' '}
        We will confirm and act within 30 days, usually much sooner.
      </p>
    </Page>
  );
}
