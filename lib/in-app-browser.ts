// Google has refused OAuth sign-in from embedded in-app browsers (TikTok,
// Instagram, Facebook, Messenger, Line, WeChat...) since 2021 — a security
// policy on Google's side, not something fixable from this app. It shows up
// as a "disallowed_useragent" error with zero way around it except leaving
// the in-app browser. Confirmed as the likely cause of TikTok traffic (see
// this site's own /login "Continuer avec Google" button) converting at 0%:
// a real visitor arriving from a TikTok video's link opens the site inside
// TikTok's own embedded browser, taps "Continuer avec Google", and hits
// Google's block screen instead of a real login. Detecting these user
// agents lets the login page steer people to email/password instead, which
// has no such restriction and works fine inside any embedded browser.
const IN_APP_BROWSER_PATTERNS = [
  /musical_ly/i, // TikTok
  /instagram/i,
  /FBAN|FBAV|FB_IAB/i, // Facebook app / in-app browser
  /Line\//i, // LINE
  /MicroMessenger/i, // WeChat
  /Snapchat/i,
];

export function isInAppBrowser(userAgent: string): boolean {
  return IN_APP_BROWSER_PATTERNS.some((pattern) => pattern.test(userAgent));
}
