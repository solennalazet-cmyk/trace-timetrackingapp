import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

const PrivacyPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground px-4 py-6 max-w-2xl mx-auto">
      <Button
        variant="ghost"
        size="sm"
        className="mb-4 -ml-2 text-muted-foreground"
        onClick={() => navigate(-1)}
      >
        <ArrowLeft className="w-4 h-4 mr-1" />
        Back
      </Button>

      <h1 className="text-2xl font-bold mb-1">Privacy Policy</h1>
      <p className="text-xs text-muted-foreground mb-6">Last updated: April 2026</p>

      <div className="space-y-6 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="text-base font-semibold text-foreground mb-2">1. What Trace Collects</h2>
          <p>When you use Trace without an account, your data (time entries, clients, projects, tasks) is stored <strong>only in your browser's local storage</strong>. We do not collect or transmit any of it.</p>
          <p className="mt-2">When you create an account, we store:</p>
          <ul className="list-disc ml-5 mt-1 space-y-1">
            <li>Your email address and display name</li>
            <li>Time entries, clients, projects, and tasks you create</li>
            <li>App preferences and settings</li>
            <li>Billing information (processed by Stripe — we never see your full card number)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground mb-2">2. How Your Data Is Stored</h2>
          <p>Authenticated user data is stored on secure, managed cloud infrastructure (EU-hosted). All connections use TLS encryption in transit. Access to the database is restricted by row-level security — each user can only read and modify their own records.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground mb-2">3. Who Can See Your Data</h2>
          <p><strong>Other users:</strong> No. Row-level security ensures complete isolation between accounts.</p>
          <p className="mt-1"><strong>Trace team:</strong> As the data controller, the Trace team has administrative access to the database for support and maintenance purposes. We will never share, sell, or use your data for advertising.</p>
          <p className="mt-1"><strong>Third parties:</strong> We use Stripe for payment processing. Stripe's privacy policy applies to billing data. No other third parties receive your data.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground mb-2">4. Your Rights (GDPR)</h2>
          <p>If you're in the EU/EEA, you have the right to:</p>
          <ul className="list-disc ml-5 mt-1 space-y-1">
            <li><strong>Access</strong> — Export your data at any time via the app's export feature</li>
            <li><strong>Rectification</strong> — Edit your entries, clients, and profile directly</li>
            <li><strong>Erasure</strong> — Delete your account and all associated data from Settings</li>
            <li><strong>Portability</strong> — Export your data as PDF or CSV</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground mb-2">5. Cookies & Local Storage</h2>
          <p>Trace does not use tracking cookies, analytics cookies, or advertising pixels. We use <code className="text-xs bg-muted px-1 py-0.5 rounded">localStorage</code> solely for app functionality (anonymous data, user preferences, active timer state). This is classified as "strictly necessary" under ePrivacy and does not require a cookie consent banner.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground mb-2">6. Data Retention</h2>
          <p>Your data is retained for as long as your account is active. Deleted entries are soft-deleted and permanently removed after 7 days. If you delete your account, all data is erased permanently.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground mb-2">7. Contact</h2>
          <p>For privacy-related questions or data requests, contact us at the email provided in the app's About section.</p>
        </section>

        <p className="text-xs text-muted-foreground/60 pt-4 border-t border-border">
          This policy may be updated from time to time. Continued use of Trace after changes constitutes acceptance.
        </p>
      </div>
    </div>
  );
};

export default PrivacyPage;
