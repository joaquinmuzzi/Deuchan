// Light or dark, chosen with a button and shared by the popup and the dashboard. Without a choice
// the page follows the system. The choice is kept in chrome.storage.local.
const ICONS = { light: "☀", dark: "☾" };

const systemTheme = () => (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

function apply(button, theme) {
  document.documentElement.dataset.theme = theme;
  button.textContent = theme === "dark" ? ICONS.light : ICONS.dark;
  button.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
}

export async function setUpTheme(button) {
  const { theme } = await chrome.storage.local.get("theme");
  let current = theme === "light" || theme === "dark" ? theme : systemTheme();
  apply(button, current);
  button.addEventListener("click", () => {
    current = current === "dark" ? "light" : "dark";
    apply(button, current);
    chrome.storage.local.set({ theme: current });
  });
}
