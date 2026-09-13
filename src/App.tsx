import React, { useState, useEffect } from 'react';
import LoginScreen from './components/LoginScreen';
import MainLayout from './components/MainLayout';
import { app } from './linkpoint/app';

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Basic init
    app.init();

    // Check if session exists (restoring logic can go here later)

  }, []);

  return (
    <>
      {isAuthenticated ? (
        <MainLayout />
      ) : (
        <LoginScreen onLoginSuccess={() => setIsAuthenticated(true)} />
      )}
    </>
  );
};

export default App;
