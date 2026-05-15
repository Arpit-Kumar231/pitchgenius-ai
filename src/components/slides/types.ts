import { z } from "zod";

export type SlideSpec = {
  id: string;
  layoutId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  props: any;
};

export type Deck = {
  title: string;
  client: string;
  slides: SlideSpec[];
};

export type LayoutDef<T extends z.ZodTypeAny = z.ZodTypeAny> = {
  id: string;
  name: string;
  description: string;
  schema: T;
  Component: React.FC<{ data: z.infer<T> }>;
};