import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-12-18.acacia",
});

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

async function getBillingInterval(subscriptionId: string): Promise<string | null> {
  try {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    return sub.items?.data?.[0]?.price?.recurring?.interval ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200 });
  }

  const signature = req.headers.get("stripe-signature");
  const body = await req.text();

  let event: Stripe.Event;
  try {
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    if (webhookSecret) {
      event = stripe.webhooks.constructEvent(body, signature!, webhookSecret);
    } else {
      event = JSON.parse(body);
      console.warn("STRIPE_WEBHOOK_SECRET not set — skipping signature verification");
    }
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return new Response("Webhook signature verification failed", { status: 400 });
  }

  // Log event
  await supabase.from("webhook_logs").insert({
    event_type: event.type,
    stripe_event_id: event.id,
    payload: event as any,
  });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.supabase_user_id;
        if (userId && session.subscription) {
          const billingInterval = await getBillingInterval(session.subscription as string);
          await supabase
            .from("profiles")
            .update({
              plan: "pro",
              subscription_status: "active",
              stripe_subscription_id: session.subscription as string,
              stripe_customer_id: session.customer as string,
              billing_interval: billingInterval,
            })
            .eq("id", userId);
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("stripe_subscription_id", sub.id)
          .single();
        if (profile) {
          const plan = sub.status === "active" ? "pro" : "free";
          const billingInterval = sub.items?.data?.[0]?.price?.recurring?.interval ?? null;
          await supabase
            .from("profiles")
            .update({
              plan,
              subscription_status: sub.status,
              current_period_end: new Date(
                sub.current_period_end * 1000
              ).toISOString(),
              billing_interval: billingInterval,
            })
            .eq("id", profile.id);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("stripe_subscription_id", sub.id)
          .single();
        if (profile) {
          await supabase
            .from("profiles")
            .update({
              plan: "free",
              subscription_status: "canceled",
              current_period_end: new Date(
                sub.current_period_end * 1000
              ).toISOString(),
            })
            .eq("id", profile.id);
        }
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const { data: ourInvoice } = await supabase
          .from("invoices")
          .select("id")
          .eq("stripe_invoice_id", invoice.id)
          .single();
        if (ourInvoice) {
          await supabase
            .from("invoices")
            .update({ status: "paid", paid_at: new Date().toISOString() })
            .eq("id", ourInvoice.id);
          await supabase
            .from("time_entries")
            .update({ billing_status: "paid" })
            .eq("invoice_id", ourInvoice.id);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("stripe_customer_id", invoice.customer as string)
          .single();
        if (profile) {
          await supabase
            .from("profiles")
            .update({ subscription_status: "past_due" })
            .eq("id", profile.id);
        }
        break;
      }
    }
  } catch (err) {
    console.error("Webhook handler error:", err);
    await supabase
      .from("webhook_logs")
      .update({ error: err.message })
      .eq("stripe_event_id", event.id);
  }

  return new Response("OK", { status: 200 });
});
