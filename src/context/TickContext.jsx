import { createContext, useContext, useState, useEffect } from 'react';

const TickContext = createContext(0);

export function TickProvider({ children }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  return <TickContext.Provider value={tick}>{children}</TickContext.Provider>;
}

export function useTickContext() {
  return useContext(TickContext);
}

export { TickContext };
