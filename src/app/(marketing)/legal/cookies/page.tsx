import type { Metadata } from "next";
import { PageHero, Prose } from "@/components/marketing/page-hero";

export const metadata: Metadata = { title: "Cookie policy" };

export default function CookiesPage() {
  return (
    <>
      <PageHero eyebrow="Legal" title="Cookie policy" description="The cookies LeoPay actually sets, and why." />
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
        <Prose>
          <p>
            LeoPay uses the minimum cookies required to operate the service. We do not run advertising or cross-site
            tracking cookies, and we do not embed third-party analytics scripts in this deployment.
          </p>
          <h2>Cookies we set</h2>
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-surface-2 text-[11px] uppercase tracking-[0.08em] text-muted">
                <tr>
                  <th className="px-4 py-2.5">Name</th>
                  <th className="px-4 py-2.5">Purpose</th>
                  <th className="px-4 py-2.5">Type</th>
                  <th className="px-4 py-2.5">Duration</th>
                </tr>
              </thead>
              <tbody className="[&_td]:border-t [&_td]:border-border [&_td]:px-4 [&_td]:py-2.5">
                <tr>
                  <td className="font-mono text-[12px]">leopay_session</td>
                  <td>Keeps you signed in. HTTP-only, SameSite=Lax, Secure in production.</td>
                  <td>Essential</td>
                  <td>Up to 30 days</td>
                </tr>
                <tr>
                  <td className="font-mono text-[12px]">leopay_org</td>
                  <td>Remembers which organization workspace you are viewing.</td>
                  <td>Essential</td>
                  <td>1 year</td>
                </tr>
                <tr>
                  <td className="font-mono text-[12px]">leopay-theme</td>
                  <td>Stores your light/dark preference in local storage (not a cookie).</td>
                  <td>Preference</td>
                  <td>Until cleared</td>
                </tr>
              </tbody>
            </table>
          </div>
          <h2>Managing cookies</h2>
          <p>
            You can block or delete cookies in your browser settings. Blocking the session cookie will prevent you from
            signing in. Clearing local storage resets your theme preference to your system setting.
          </p>
        </Prose>
      </div>
    </>
  );
}
