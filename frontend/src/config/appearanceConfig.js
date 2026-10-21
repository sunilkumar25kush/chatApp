/**
 * Modular Appearance Studio Configuration Registry
 * Allows adding new themes, visual effects, and sound presets cleanly.
 */

export const BUILTIN_THEMES = [
  {
    id: 'galaxy',
    name: 'Galaxy Dark',
    icon: '🌌',
    category: 'Dark',
    theme: {
      primaryColor: '#8b5cf6',
      secondaryColor: '#6366f1',
      msgIncomingBg: 'rgba(30, 27, 75, 0.85)',
      msgIncomingText: '#e0e7ff',
      msgOutgoingBg: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
      msgOutgoingText: '#ffffff',
      chatBg: '#090a16',
      sidebarBg: '#0f1026',
      headerBg: '#0f1026',
      inputBg: 'rgba(30, 27, 75, 0.85)',
      borderRadius: '16px',
      fontFamily: "'Poppins', 'Outfit', sans-serif",
      accentGlow: '0 0 15px rgba(168, 85, 247, 0.4)',
      overlayOpacity: 0.25,
      overlayColor: '#050614',
      isLight: false,
      textColor: '#f1f5f9',
      textMuted: '#94a3b8',
      senderColor: '#818cf8',
    },
    defaultEffect: 'stars',
  },
  {
    id: 'cream-citrus',
    name: 'Cream & Citrus',
    icon: '🍊',
    category: 'Light',
    theme: {
      primaryColor: '#F0882C',
      secondaryColor: '#54A534',
      msgIncomingBg: '#ECEAC9',
      msgIncomingText: '#1C1C1C',
      msgOutgoingBg: 'linear-gradient(135deg, #F0882C 0%, #D9721A 100%)',
      msgOutgoingText: '#ffffff',
      chatBg: '#F7F1E3',
      sidebarBg: '#ECEAC9',
      headerBg: '#ECEAC9',
      inputBg: '#ffffff',
      borderRadius: '16px',
      fontFamily: "'Poppins', 'Times New Roman', 'Inter', sans-serif",
      accentGlow: '0 4px 16px rgba(240, 136, 44, 0.35)',
      overlayOpacity: 0.05,
      overlayColor: '#ECEAC9',
      isLight: true,
      textColor: '#1C1C1C',
      textMuted: '#7A7A7A',
      senderColor: '#3D8822',
    },
    defaultEffect: 'none',
  },
];

export const VISUAL_EFFECTS = [
  { id: 'none', name: 'None', icon: '🚫', type: 'none' },
  { id: 'stars', name: 'Cosmic Stars', icon: '✨', type: 'canvas_stars' },
  { id: 'glass', name: 'Frosted Glass', icon: '🌫', type: 'css_glass' },
  { id: 'galaxyglow', name: 'Galaxy Glow', icon: '🌌', type: 'canvas_glow' },
  { id: 'rain', name: 'Rain Drops', icon: '🌧', type: 'canvas_rain' },
  { id: 'snow', name: 'Snow Flakes', icon: '❄', type: 'canvas_snow' },
  { id: 'leaves', name: 'Falling Leaves', icon: '🍂', type: 'canvas_leaves' },
  { id: 'petals', name: 'Sakura Petals', icon: '🌸', type: 'canvas_petals' },
  { id: 'ripple', name: 'Water Ripple', icon: '🌊', type: 'css_ripple' },
  { id: 'embers', name: 'Ember Particles', icon: '🔥', type: 'canvas_embers' },
  { id: 'clouds', name: 'Floating Clouds', icon: '☁', type: 'css_clouds' },
  { id: 'fog', name: 'Fog Effect', icon: '💨', type: 'css_fog' },
  { id: 'aurora', name: 'Aurora Borealis', icon: '🌈', type: 'css_aurora' },
  { id: 'fireworks', name: 'Fireworks Light', icon: '🎇', type: 'canvas_fireworks' },
];

export const SOUND_PRESETS = [
  { id: 'default', name: 'Default Soft Pop' },
  { id: 'cyberpunk', name: 'Cyberpunk Neon' },
  { id: 'mechanical', name: 'Mechanical Click' },
  { id: 'retro', name: 'Retro Synth' },
];

export const getThemeById = (id) => {
  return BUILTIN_THEMES.find((t) => t.id === id) || BUILTIN_THEMES[0];
};

export const getEffectById = (id) => {
  return VISUAL_EFFECTS.find((e) => e.id === id) || VISUAL_EFFECTS[0];
};
