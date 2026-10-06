import { create } from 'zustand';
import type { ServerMsg } from '@quiz/shared/protocol';
import { initialView, reduce, type GameView } from './reduce';

interface Store extends GameView {
  apply: (msg: ServerMsg) => void;
  set: (patch: Partial<GameView>) => void;
  reset: () => void;
  dismissWarned: () => void;
  dropNotice: (id: string) => void;
  dropSuspect: (key: string) => void;
}

export const useGame = create<Store>((set) => ({
  ...initialView(),
  apply: (msg) => set((s) => reduce(s, msg)),
  set: (patch) => set(patch),
  reset: () => set(initialView()),
  dismissWarned: () => set({ warned: null }),
  dropNotice: (id) => set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })),
  dropSuspect: (key) => set((s) => ({ suspects: s.suspects.filter((x) => x.key !== key) })),
}));
