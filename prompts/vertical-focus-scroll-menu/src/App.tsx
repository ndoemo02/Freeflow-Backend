import ScrollMenu from './components/ScrollMenu';

export function App() {
  return (
    <div className="fixed inset-0 bg-[#0a0a14] overflow-hidden">
      {/* Subtle grid background */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      />

      {/* Ambient orbs */}
      <div className="absolute top-[10%] left-[15%] w-64 h-64 rounded-full bg-purple-600/[0.06] blur-[80px] animate-pulse" />
      <div className="absolute bottom-[15%] right-[10%] w-72 h-72 rounded-full bg-blue-500/[0.05] blur-[90px] animate-pulse" style={{ animationDelay: '2s' }} />
      <div className="absolute top-[60%] left-[60%] w-48 h-48 rounded-full bg-cyan-400/[0.04] blur-[70px] animate-pulse" style={{ animationDelay: '4s' }} />

      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-30 px-5 pt-12 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-white/90 text-xl font-bold tracking-tight">Menu</h1>
            <p className="text-white/30 text-xs mt-0.5">Scroll or swipe to navigate</p>
          </div>
          <div className="w-9 h-9 rounded-full bg-white/[0.06] border border-white/[0.08] flex items-center justify-center backdrop-blur-sm">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-white/40">
              <circle cx="8" cy="3" r="1.5" fill="currentColor" />
              <circle cx="8" cy="8" r="1.5" fill="currentColor" />
              <circle cx="8" cy="13" r="1.5" fill="currentColor" />
            </svg>
          </div>
        </div>
      </header>

      {/* Main scroll menu */}
      <main className="absolute inset-0 pt-24 pb-20">
        <div className="w-full max-w-md mx-auto h-full px-4">
          <ScrollMenu />
        </div>
      </main>

      {/* Bottom bar */}
      <footer className="absolute bottom-0 left-0 right-0 z-30 px-5 pb-8 pt-4">
        <div className="flex items-center justify-center gap-1">
          <div className="w-1 h-1 rounded-full bg-white/20" />
          <div className="w-1 h-1 rounded-full bg-white/40" />
          <div className="w-1 h-1 rounded-full bg-white/20" />
        </div>
        <p className="text-center text-white/20 text-[10px] mt-2 font-medium tracking-widest uppercase">
          ↕ Scroll · Click · Arrow Keys
        </p>
      </footer>
    </div>
  );
}
