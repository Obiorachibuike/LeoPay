/**
 * Applies the stored (or system) theme before first paint so there is no
 * flash of the wrong theme. Runs before hydration; React never re-renders it.
 */
const script = `
(function(){
  try {
    var stored = localStorage.getItem('leopay-theme');
    var systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = stored === 'light' || stored === 'dark' ? stored : (systemDark ? 'dark' : 'light');
    var root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.style.colorScheme = theme;
    root.dataset.theme = theme;
  } catch (e) {}
})();
`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
