export const playSound = (type: 'success' | 'error' | 'new_item') => {
  const sounds = {
    success: '/sounds/beep.mp3',   // Standard beep
    error: '/sounds/error.mp3',    // Bonk/Buzz
    new_item: '/sounds/chime.mp3', // Pleasant chime
  };

  const audio = new Audio(sounds[type]);
  audio.volume = 0.5;
  audio.play().catch(e => console.warn("Audio play failed", e));
};
