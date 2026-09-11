import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { FormField } from "@/components/templates/form-page"

/**
 * Section 11.5. One card per group of related settings, and EACH CARD
 * HAS ITS OWN SAVE BUTTON - never one Save for the whole page.
 * Destructive settings sit in a separate card at the bottom with a
 * danger-coloured border.
 *
 * The fields reuse FormField from the form template rather than a
 * second set of settings-only field wrappers (section 4 rule 2).
 */
export default function SettingsGeneralPage() {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Organisation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-12 gap-6">
            <FormField
              span={6}
              label="Organisation name"
              required
              htmlFor="organisation-name"
            >
              <Input id="organisation-name" name="organisationName" />
            </FormField>
          </div>
        </CardContent>
        <CardFooter>
          <Button>Save organisation</Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-12 gap-6">
            <FormField span={6} label="Email address" htmlFor="contact-email">
              <Input
                id="contact-email"
                name="contactEmail"
                type="email"
                placeholder="name@company.com"
              />
            </FormField>
            <FormField span={4} label="Phone number" htmlFor="contact-phone">
              <Input id="contact-phone" name="contactPhone" type="tel" />
            </FormField>
          </div>
        </CardContent>
        <CardFooter>
          <Button>Save contact</Button>
        </CardFooter>
      </Card>

      {/* Section 11.5: destructive settings in their own card at the
          bottom, with a danger border. Section 15 attaches the
          confirmation dialog in Phase 4, when there is something real
          to delete and a consequence to state. */}
      <Card className="border-danger-border">
        <CardHeader>
          <CardTitle>Delete organisation</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-body text-text-secondary">
            Removes every project, site, budget and expense. This cannot
            be undone.
          </p>
        </CardContent>
        <CardFooter>
          <Button variant="danger">Delete organisation</Button>
        </CardFooter>
      </Card>
    </>
  )
}
