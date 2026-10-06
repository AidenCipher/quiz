import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import Home from './pages/Home';
import Play from './pages/Play';

// Host and big-screen code is split out so phones only download the player app.
const HostHome = lazy(() => import('./pages/HostHome'));
const Builder = lazy(() => import('./pages/Builder'));
const Live = lazy(() => import('./pages/Live'));
const Screen = lazy(() => import('./pages/Screen'));
const Results = lazy(() => import('./pages/Results'));

const wrap = (el: React.ReactNode) => <Suspense fallback={<div style={{ padding: 24 }}>Loading…</div>}>{el}</Suspense>;

const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  { path: '/j/:pin', element: <Play /> },
  { path: '/host', element: wrap(<HostHome />) },
  { path: '/host/quiz/:id', element: wrap(<Builder />) },
  { path: '/host/live/:pin', element: wrap(<Live />) },
  { path: '/host/results/:id', element: wrap(<Results />) },
  { path: '/screen/:pin', element: wrap(<Screen />) },
  { path: '*', element: <Home /> },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
