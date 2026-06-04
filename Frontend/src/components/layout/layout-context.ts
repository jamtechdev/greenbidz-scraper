import { createContext, useContext } from 'react';

export interface LayoutCtx {
  /** Desktop sidebar collapsed to a slim icon rail (used by the render screen). */
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}

export const LayoutContext = createContext<LayoutCtx>({
  collapsed: false,
  setCollapsed: () => {},
});

export const useLayout = () => useContext(LayoutContext);
