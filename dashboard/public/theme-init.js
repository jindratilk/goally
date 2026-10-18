// Resolve appearance before the first paint, including when storage is blocked.
(() => {
  let theme = 'system';
  try {
    const stored = localStorage.getItem('goally-theme');
    if (stored === 'light' || stored === 'dark') theme = stored;
  } catch {}
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]').content = dark ? '#191a17' : '#f7f7f4';
})();
