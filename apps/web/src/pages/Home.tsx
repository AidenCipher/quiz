import { useState } from 'react';
import { Link, useNavigate } from 'react-router';

export default function Home() {
  const nav = useNavigate();
  const [pin, setPin] = useState('');
  const authFailed = new URLSearchParams(location.search).get('auth') === 'failed';
  return (
    <main className="dark-surface" style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 400, textAlign: 'center' }}>
        <div style={{ fontSize: 56 }} aria-hidden="true">
          ▲◆●■
        </div>
        <h1 style={{ fontSize: 40, margin: '4px 0 24px', letterSpacing: -1 }}>Quiz Arena</h1>
        {authFailed && (
          <div role="alert" style={{ background: '#3b1218', borderRadius: 12, padding: 10, marginBottom: 16 }}>
            Google sign-in didn't complete. Please try again.
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (/^\d{6}$/.test(pin)) nav(`/j/${pin}`);
          }}
        >
          <label htmlFor="pin" className="sr-only">
            Game PIN
          </label>
          <input
            id="pin"
            className="input input-dark"
            style={{ minHeight: 64, fontSize: 32, textAlign: 'center', letterSpacing: 8, fontWeight: 800 }}
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            placeholder="Game PIN"
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          />
          <button
            className="btn btn-primary btn-lg"
            style={{ width: '100%', marginTop: 12 }}
            disabled={pin.length !== 6}
            type="submit"
          >
            Join game
          </button>
        </form>
        <div className="muted-on-dark" style={{ margin: '28px 0 8px' }}>
          Running a quiz?
        </div>
        <Link to="/host" className="btn btn-dark btn-lg" style={{ width: '100%' }}>
          Host a quiz
        </Link>
      </div>
    </main>
  );
}
