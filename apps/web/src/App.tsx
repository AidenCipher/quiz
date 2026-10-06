import { lazy, Suspense } from 'react';
import { createBrowserRouter, Outlet, RouterProvider } from 'react-router';
import { StorageNotice } from './components/Chrome';
import Home from './pages/Home';
import Play from './pages/Play';

// Host and big-screen code is split out so phones only download the player app.
const HostHome = lazy(() => import('./pages/HostHome'));
const Builder = lazy(() => import('./pages/Builder'));
const Live = lazy(() => import('./pages/Live'));
const Screen = lazy(() => import('./pages/Screen'));
const Results = lazy(() => import('./pages/Results'));
const legal = <K extends keyof typeof import('./pages/Legal')>(name: K) =>
  lazy(() => import('./pages/Legal').then((m) => ({ default: m[name] as React.ComponentType })));
const Privacy = legal('Privacy');
const Cookies = legal('Cookies');
const Trust = legal('Trust');
const Refunds = legal('Refunds');
const Credits = legal('Credits');
const Contact = legal('Contact');
const DeleteData = legal('DeleteData');

const wrap = (el: React.ReactNode) => <Suspense fallback={<div style={{ padding: 24 }}>Loading…</div>}>{el}</Suspense>;

function Root() {
  return (
    // The notice takes its own row, so it can never cover a link, a button or part of a game.
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <Outlet />
      </div>
      <StorageNotice />
    </div>
  );
}

const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/j/:pin', element: <Play /> },
      { path: '/host', element: wrap(<HostHome />) },
      { path: '/host/quiz/:id', element: wrap(<Builder />) },
      { path: '/host/live/:pin', element: wrap(<Live />) },
      { path: '/host/results/:id', element: wrap(<Results />) },
      { path: '/screen/:pin', element: wrap(<Screen />) },
      { path: '/privacy', element: wrap(<Privacy />) },
      { path: '/cookies', element: wrap(<Cookies />) },
      { path: '/trust', element: wrap(<Trust />) },
      { path: '/refunds', element: wrap(<Refunds />) },
      { path: '/credits', element: wrap(<Credits />) },
      { path: '/contact', element: wrap(<Contact />) },
      { path: '/delete-data', element: wrap(<DeleteData />) },
      { path: '*', element: <Home /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
