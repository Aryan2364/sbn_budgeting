/**
 * The phone layout's words, for code that is not a complaints screen:
 * the screen-reader labels and fixed words inside shared primitives
 * ("Back", "Close", "Actions") on their PHONE paths only, and the shell.
 *
 * Every phone screen except Login is Gujarati (plan-phone D7, D9), so
 * these are GU_PHONE from the complaints strings file, re-exported under
 * a neutral name, so a primitive in components/ui never reaches into a
 * module's folder by name. Desktop paths keep the kit's English.
 */
export { GU_PHONE as PHONE_WORDS } from "@/components/complaints/gu"
