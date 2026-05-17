import { create } from "zustand";
import type { Deck, SlideSpec } from "@/components/slides/types";

type DeckState = {
  deck: Deck;
  activeIndex: number;
  activeTemplateId: string | null;
  setActiveTemplateId: (id: string | null) => void;
  setDeck: (d: Deck) => void;
  reset: () => void;
  setActive: (i: number) => void;
  upsertSlide: (index: number, slide: SlideSpec) => void;
  replaceSlide: (index: number, slide: SlideSpec) => void;
  removeSlide: (index: number) => void;
  addSlide: (index: number, slide: SlideSpec) => void;
  setMeta: (m: { title?: string; client?: string }) => void;
};

const empty: Deck = { title: "Untitled Pitchbook", client: "", slides: [] };

export const useDeck = create<DeckState>((set) => ({
  deck: empty,
  activeIndex: 0,
  activeTemplateId: null,
  setActiveTemplateId: (id) => set({ activeTemplateId: id }),
  setDeck: (d) => set({ deck: d, activeIndex: 0 }),
  reset: () => set({ deck: empty, activeIndex: 0 }),
  setActive: (i) => set({ activeIndex: i }),
  upsertSlide: (index, slide) =>
    set((s) => {
      const next = [...s.deck.slides];
      next[index] = slide;
      return { deck: { ...s.deck, slides: next }, activeIndex: index };
    }),
  replaceSlide: (index, slide) =>
    set((s) => {
      const next = [...s.deck.slides];
      if (index < 0 || index >= next.length) return s;
      next[index] = slide;
      return { deck: { ...s.deck, slides: next } };
    }),
  removeSlide: (index) =>
    set((s) => ({
      deck: { ...s.deck, slides: s.deck.slides.filter((_, i) => i !== index) },
      activeIndex: Math.max(0, Math.min(s.activeIndex, s.deck.slides.length - 2)),
    })),
  addSlide: (index, slide) =>
    set((s) => {
      const next = [...s.deck.slides];
      next.splice(index, 0, slide);
      return { deck: { ...s.deck, slides: next }, activeIndex: index };
    }),
  setMeta: (m) => set((s) => ({ deck: { ...s.deck, ...m } })),
}));