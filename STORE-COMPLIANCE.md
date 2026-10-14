# Play Store and App Store checklist

What the app already does to meet Google Play and Apple App Store rules, and what you still
fill in on the store websites. (The full listing copy and privacy-form answers are in the
"Rosier App — Store Launch Guide" doc.)

## Already built into the app

| Rule | How the app meets it |
| --- | --- |
| Account deletion inside the app (Apple 5.1.1(v), Google Play) | Profile → Delete my account. Requests show in admin → **Account deletions**. |
| Account deletion web link (Google Play) | `https://YOUR-SERVER/delete-account` |
| Privacy policy, reachable in the app and on the web | Profile → Privacy policy, the login screen, and `/privacy` |
| Terms of use | Profile → Terms of use, the login screen ("By continuing you agree…"), and `/terms` |
| Refund and shipping policies | Profile → Refunds & returns, and Shipping policy (links set in the admin panel) |
| Grievance officer (India Consumer Protection E-Commerce Rules 2020, IT Rules 2021) | Shown on `/privacy` and `/terms`. Fill in the name and email in the admin panel. |
| User-generated content: report and remove (Apple 1.2) | A **Report** button on every review. It hides the review for that person, and the team sees it in admin → **Reported reviews**. Reviews are moderated in Judge.me before they're published. |
| Payments for physical goods (Apple 3.1.3(e)) | Shopify checkout. No in-app purchase needed. |
| Minimal permissions (Google Play photo and video policy) | No storage or media permissions on Android: photos use the system photo picker. Microphone and draw-over-apps permissions are blocked. Camera is used only for an optional profile photo. |
| iOS privacy manifest and encryption | `PrivacyInfo.xcprivacy` with the required reasons, and `ITSAppUsesNonExemptEncryption = false` |
| No tracking | No ad or tracking SDKs, so no App Tracking Transparency prompt is needed |
| Backups of personal data | `allowBackup` is off on Android |
| Data retention | App-usage records are deleted automatically after 13 months |
| Target SDK | Targets Android 16 (API 36), which meets Google Play's current requirement |

## You fill in (store websites and admin panel)

**Admin panel → Privacy, terms & account deletion**
- Company address, support email, **grievance officer** name and email.
- Check the refund and shipping policy links open your website pages.
- Have a lawyer or CA read the privacy policy and terms before launch.

**Google Play Console**
- Privacy policy URL: `/privacy`. Account deletion URL: `/delete-account`.
- Data safety form: use the answers in the launch guide.
- App access: give reviewers the test email inbox and the login steps.
- Content rating questionnaire; target audience **18+**; Ads: **No**.
- Use an **organisation** developer account (D-U-N-S), so no 14-day closed test is required.

**App Store Connect**
- Privacy policy URL: `/privacy`. Support URL: your website contact page.
- App Privacy: use the answers in the launch guide.
- App Review notes: the test email inbox and login steps, plus "Physical goods, paid on
  Shopify checkout. Reviews are moderated in Judge.me and can be reported in the app."
- Age rating questionnaire.

## Before each release

- Test on a real Android phone and iPhone:
  - login
  - a real order
  - a notification
  - delete account (with a test account)
  - report a review
- Bump nothing by hand: store builds number themselves (`autoIncrement` in `eas.json`).
