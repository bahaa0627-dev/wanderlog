import React from 'react';
import { Mail } from 'lucide-react';

const Home: React.FC = () => {
  return (
    <main className="relative w-full h-[100dvh] flex flex-col items-center justify-between bg-vago-yellow text-vago-black overflow-hidden selection:bg-black selection:text-vago-yellow">
      
      {/* Header */}
      <header className="w-full flex justify-between items-center p-6 md:p-8 z-20 shrink-0">
        {/* VAGO Logo - Top Left */}
        <div className="text-2xl md:text-3xl font-bold tracking-tighter uppercase">VAGO</div>
        
        <a 
          href="mailto:blcubahaa0627@gmail.com" 
          className="group flex items-center gap-2 text-sm font-bold tracking-widest uppercase hover:opacity-60 transition-opacity"
        >
          <Mail size={16} />
          <span>Contact Us</span>
        </a>
      </header>

      {/* Main Content Area - Flex Column, Centered */}
      <div className="flex-1 w-full max-w-7xl mx-auto flex flex-col items-center justify-center px-4 min-h-0">
        
        {/* Image Container */}
        <div className="flex-1 w-full flex items-center justify-center min-h-0 relative">
          <div className="relative w-full h-full max-w-[105vh] max-h-[90vh] flex items-center justify-center">
             {/* Background Glow for depth */}
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[100%] h-[100%] bg-white/20 blur-3xl rounded-full -z-10 pointer-events-none"></div>
             
             <img 
               src="/front photo.png" 
               alt="VAGO" 
               className="w-full h-full object-contain drop-shadow-xl"
             />
          </div>
        </div>

        {/* Text Section */}
        <div className="shrink-0 text-center z-10 pt-4 pb-6 md:pb-10 flex flex-col items-center">
          <h1 className="text-[6vw] md:text-6xl lg:text-7xl xl:text-8xl font-bold leading-none tracking-tight uppercase whitespace-nowrap">
            VAGO <span className="font-normal lowercase tracking-normal">nel mondo</span>
          </h1>
          
          <p className="text-lg md:text-2xl lg:text-3xl font-medium mt-3 opacity-90 font-reem">
            Your flâneur, your story.
          </p>
        </div>

      </div>

      {/* Footer */}
      <footer className="w-full p-6 md:p-8 flex justify-end items-end text-[10px] md:text-xs font-bold uppercase tracking-widest opacity-40 shrink-0 z-20">
        <div>© {new Date().getFullYear()} VAGO</div>
      </footer>

    </main>
  );
};

export default Home;