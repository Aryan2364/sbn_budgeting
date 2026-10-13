/**
 * The install settings - section 41.12 rule 9, section 0.1 items 1 and 9.
 *
 * TRACKING'S OWN (plan-phone Phase 5). Ported from the kit's placeholder
 * module with Sadbhavna's own name and colours.
 *
 * THE ONE PLACE OUTSIDE globals.css THAT HOLDS A COLOUR VALUE (section 1
 * rule 1's exception). The web app manifest, the theme-color tag and the
 * drawn app icons are read by the phone and the browser, not through CSS,
 * so they cannot read a token. The three colours below are copies, by
 * hand, of three tokens in globals.css:
 *
 *   THEME          = --primary             (the theme colour, 41.12 rule 9;
 *                                           the status bar, 41.13 rule 4)
 *   BACKGROUND     = --surface             (the background colour, 41.12
 *                                           rule 9: the splash screen)
 *   ON_THEME       = --primary-foreground  (the mark drawn on the icon)
 *
 * THEY ARE EDITED WITH THE BRAND BLOCK: change --primary or --surface in
 * globals.css and change them here in the same commit.
 *
 * Nothing else in the project imports these colours. A screen never uses
 * them: screens use the tokens.
 */

/** The app's name under its icon and in the phone's app list. */
const APP_NAME = "Sadbhavna"

/**
 * The name under the icon where space is short. 12 characters or fewer
 * (41.12 rule 9); app/install-manifest/route.ts refuses a longer one.
 * "Sadbhavna" is 9 characters.
 */
const APP_SHORT_NAME = "Sadbhavna"

const INSTALL_COLOURS = {
  /** = --primary in globals.css. */
  theme: "#174443",
  /** = --surface in globals.css. */
  background: "#ffffff",
  /** = --primary-foreground in globals.css: the mark on the icon's primary ground. */
  onTheme: "#ffffff",
} as const

/**
 * 41.13 rule 4: on iPhone, a dark brand uses the black-translucent status
 * bar setting (primary shows behind light icons), a light brand the
 * default setting. Sadbhavna's #174443 is dark.
 */
const IPHONE_STATUS_BAR: "black-translucent" | "default" = "black-translucent"

export { APP_NAME, APP_SHORT_NAME, INSTALL_COLOURS, IPHONE_STATUS_BAR }
