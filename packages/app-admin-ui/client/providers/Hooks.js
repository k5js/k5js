import React, { useContext, createContext } from 'react';
const HooksContext = createContext();

const defaultHooks = {
  // Intentionally empty for now
};

export const useUIHooks = listKey => {
  const hooks = useContext(HooksContext);
  return { ...hooks, ...(hooks[listKey] || {}) };
};
export const HooksProvider = ({ hooks, children }) => {
  return (
    <HooksContext.Provider value={{ ...defaultHooks, ...hooks }}>{children}</HooksContext.Provider>
  );
};
