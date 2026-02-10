import React from 'react';
import Home from './components/Home';

const App: React.FC = () => {
  return (
    <div className="min-h-screen w-full bg-vago-yellow text-vago-black selection:bg-black selection:text-vago-yellow overflow-x-hidden">
      <Home />
    </div>
  );
};

export default App;