import { createContext, useContext } from "react";

/**
 * Provides the user's preferred week start day (0=Sun … 6=Sat).
 * Default is 1 (Monday). Set at app level from user_settings.
 */
const WeekStartContext = createContext<0 | 1 | 2 | 3 | 4 | 5 | 6>(1);

export const WeekStartProvider = WeekStartContext.Provider;

export function useWeekStart(): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  return useContext(WeekStartContext);
}
