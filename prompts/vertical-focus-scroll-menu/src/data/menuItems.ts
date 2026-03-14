export interface MenuItem {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  color: string; // neon accent color
  gradient: [string, string];
}

export const menuItems: MenuItem[] = [
  {
    id: 'discover',
    title: 'Discover',
    subtitle: 'Explore new experiences',
    icon: '🔮',
    color: '#a855f7',
    gradient: ['#7c3aed', '#a855f7'],
  },
  {
    id: 'trending',
    title: 'Trending',
    subtitle: 'What\'s hot right now',
    icon: '🔥',
    color: '#f97316',
    gradient: ['#ea580c', '#f97316'],
  },
  {
    id: 'favorites',
    title: 'Favorites',
    subtitle: 'Your saved collection',
    icon: '💎',
    color: '#06b6d4',
    gradient: ['#0891b2', '#06b6d4'],
  },
  {
    id: 'music',
    title: 'Music',
    subtitle: 'Beats and playlists',
    icon: '🎵',
    color: '#ec4899',
    gradient: ['#db2777', '#ec4899'],
  },
  {
    id: 'photos',
    title: 'Photos',
    subtitle: 'Memories and moments',
    icon: '📸',
    color: '#10b981',
    gradient: ['#059669', '#10b981'],
  },
  {
    id: 'messages',
    title: 'Messages',
    subtitle: 'Stay connected',
    icon: '💬',
    color: '#3b82f6',
    gradient: ['#2563eb', '#3b82f6'],
  },
  {
    id: 'settings',
    title: 'Settings',
    subtitle: 'Customize your vibe',
    icon: '⚙️',
    color: '#8b5cf6',
    gradient: ['#7c3aed', '#8b5cf6'],
  },
  {
    id: 'profile',
    title: 'Profile',
    subtitle: 'Your digital identity',
    icon: '👤',
    color: '#f43f5e',
    gradient: ['#e11d48', '#f43f5e'],
  },
  {
    id: 'wallet',
    title: 'Wallet',
    subtitle: 'Payments and rewards',
    icon: '💳',
    color: '#eab308',
    gradient: ['#ca8a04', '#eab308'],
  },
  {
    id: 'notifications',
    title: 'Notifications',
    subtitle: 'Alerts and updates',
    icon: '🔔',
    color: '#14b8a6',
    gradient: ['#0d9488', '#14b8a6'],
  },
  {
    id: 'explore',
    title: 'Explore',
    subtitle: 'Venture into the unknown',
    icon: '🌍',
    color: '#6366f1',
    gradient: ['#4f46e5', '#6366f1'],
  },
  {
    id: 'camera',
    title: 'Camera',
    subtitle: 'Capture the moment',
    icon: '📷',
    color: '#d946ef',
    gradient: ['#c026d3', '#d946ef'],
  },
];
