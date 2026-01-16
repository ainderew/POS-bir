export const simulateScan = (barcode: string) => {
  const events = barcode.split('').map(char => 
    new KeyboardEvent('keydown', { key: char, bubbles: true })
  );
  events.forEach(e => window.dispatchEvent(e));
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
};
