import { NextRequest } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ─── POST — export a GHL Snapshot JSON for this agent ────────────────────────
// Generates a ready-to-import GHL Snapshot containing:
//   • Abandoned cart SMS workflow (trigger → delay → send SMS → webhook action)
//   • Custom Value storing the agent's webhook URL + secret
//   • Setup instructions embedded in the snapshot metadata

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSessionUser(req);
  if (!session) return unauthorized();

  const { id } = await params;

  const agent = await prisma.agent.findFirst({
    where: { id, userId: session.userId },
  });
  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://sms2cart.com";
  const webhookUrl = `${appUrl}/api/webhook/ghl/${id}`;
  const webhookSecret = (agent as any).ghlWebhookSecret ?? "";
  const ghlDeployed = !!(agent as any).ghlDeployed;

  if (!ghlDeployed) {
    return Response.json(
      { error: "Deploy the agent to GHL first before exporting a snapshot." },
      { status: 400 }
    );
  }

  // ── Build GHL Snapshot JSON ─────────────────────────────────────────────────
  // GHL Snapshot format: a JSON object importable via GHL → Settings → Snapshots
  const snapshotId = `sms2cart-${id.slice(0, 8)}`;
  const now = new Date().toISOString();

  const snapshot = {
    meta: {
      name: `SMS2Cart — ${agent.storeName}`,
      description: `Abandoned cart SMS recovery workflow for ${agent.storeName}. Powered by SMS2Cart.com. Bot: ${agent.botName}.`,
      version: "1.0",
      generatedAt: now,
      generatedBy: "SMS2Cart.com",
      agentId: id,
      storeName: agent.storeName,
      botName: agent.botName,
    },

    // ── Custom Values — store the webhook details inside GHL ────────────────
    customValues: [
      {
        key: `sms2cart_webhook_url_${id.slice(0, 8)}`,
        name: `SMS2Cart Webhook URL (${agent.storeName})`,
        value: webhookUrl,
        description: "Paste this URL into the Webhook action in the abandoned cart workflow.",
      },
      {
        key: `sms2cart_webhook_secret_${id.slice(0, 8)}`,
        name: `SMS2Cart Webhook Secret (${agent.storeName})`,
        value: webhookSecret,
        description: "HMAC secret for verifying inbound webhook signatures. Keep private.",
      },
      {
        key: `sms2cart_opening_message_${id.slice(0, 8)}`,
        name: `SMS2Cart Opening Message (${agent.storeName})`,
        value: agent.openingMessage,
        description: "Opening SMS template. Use {{contact.first_name}} and {{custom_value.product_name}} in GHL.",
      },
    ],

    // ── Workflows ────────────────────────────────────────────────────────────
    workflows: [
      {
        id: `wf-${snapshotId}-cart-recovery`,
        name: `Abandoned Cart Recovery — ${agent.storeName}`,
        description: "Triggers when a Shopify cart is abandoned. Waits 1 hour, then sends opening SMS. Routes all replies through SMS2Cart AI.",
        status: "draft",
        trigger: {
          type: "SHOPIFY_ABANDONED_CHECKOUT",
          name: "Shopify Abandoned Cart",
          filters: [],
          waitBeforeFiring: {
            value: 1,
            unit: "hours",
            description: "Wait 1 hour before sending first message (adjust to your preference).",
          },
        },
        actions: [
          {
            step: 1,
            type: "IF_ELSE",
            name: "Check: Has opted out?",
            description: "Skip contacts who have unsubscribed.",
            conditions: [
              {
                field: "contact.dnd_sms",
                operator: "equals",
                value: false,
              },
            ],
            yesPath: "send-sms",
            noPath: "end",
          },
          {
            step: 2,
            id: "send-sms",
            type: "SMS",
            name: "Send Opening SMS",
            message: agent.openingMessage
              .replace(/{customer_name}/g, "{{contact.first_name}}")
              .replace(/{bot_name}/g, agent.botName)
              .replace(/{store_name}/g, agent.storeName)
              .replace(/{product_name}/g, "{{contact.last_abandoned_product}}"),
            fromNumber: "{{location.twilio_number}}",
            note: "Sends the bot's opening message. Make sure your GHL location has an SMS number configured.",
          },
          {
            step: 3,
            type: "WAIT",
            name: "Wait for Reply",
            waitFor: "INBOUND_SMS",
            timeout: { value: 24, unit: "hours" },
            onTimeout: "end",
            description: "Wait up to 24 hours for the customer to reply. If no reply, end workflow.",
          },
          {
            step: 4,
            type: "WEBHOOK",
            name: "Route Reply to SMS2Cart AI",
            method: "POST",
            url: webhookUrl,
            headers: {
              "Content-Type": "application/json",
              "X-GHL-Signature": "{{webhook.hmac_sha256}}",
            },
            body: {
              contactId: "{{contact.id}}",
              conversationId: "{{conversation.id}}",
              body: "{{message.body}}",
              firstName: "{{contact.first_name}}",
              lastName: "{{contact.last_name}}",
              phone: "{{contact.phone}}",
            },
            successCriteria: { statusCode: 200 },
            note: "Routes the customer reply to SMS2Cart, which generates the AI response and sends it back via GHL Conversations API automatically.",
          },
          {
            step: 5,
            type: "WAIT",
            name: "Continue conversation loop",
            waitFor: "INBOUND_SMS",
            timeout: { value: 72, unit: "hours" },
            onTimeout: "end",
            description: "The conversation continues automatically. SMS2Cart handles all replies via the webhook. This wait catches any further inbound messages.",
          },
        ],
      },

      // ── Inbound SMS routing workflow ────────────────────────────────────
      {
        id: `wf-${snapshotId}-inbound-router`,
        name: `SMS2Cart Inbound Router — ${agent.storeName}`,
        description: "Catches any inbound SMS not already handled by the cart recovery workflow and routes them to SMS2Cart AI.",
        status: "draft",
        trigger: {
          type: "INBOUND_SMS",
          name: "Customer Sends SMS",
          filters: [
            {
              field: "conversation.status",
              operator: "not_equals",
              value: "closed",
              description: "Only route open conversations.",
            },
          ],
        },
        actions: [
          {
            step: 1,
            type: "WEBHOOK",
            name: "Route to SMS2Cart AI",
            method: "POST",
            url: webhookUrl,
            headers: {
              "Content-Type": "application/json",
            },
            body: {
              contactId: "{{contact.id}}",
              conversationId: "{{conversation.id}}",
              body: "{{message.body}}",
              firstName: "{{contact.first_name}}",
              lastName: "{{contact.last_name}}",
              phone: "{{contact.phone}}",
            },
            successCriteria: { statusCode: 200 },
          },
        ],
      },
    ],

    // ── Setup checklist ──────────────────────────────────────────────────────
    setupInstructions: {
      title: `How to import this snapshot into GHL — ${agent.storeName}`,
      steps: [
        "In GHL, go to Settings → Snapshots → Import Snapshot → Upload this JSON file.",
        "After import, open Automations and find 'Abandoned Cart Recovery — " + agent.storeName + "'.",
        "Edit the workflow and activate it.",
        "Ensure your GHL location has a Twilio SMS number configured under Settings → Phone Numbers.",
        "Connect your Shopify store to GHL via Settings → Integrations → Shopify.",
        "Test by placing and abandoning a cart on your Shopify store.",
        `Webhook URL to verify: ${webhookUrl}`,
        webhookSecret
          ? `Webhook Secret (for HMAC verification): ${webhookSecret}`
          : "No webhook secret set — deploy the agent first to generate one.",
      ],
      webhookUrl,
      webhookSecret,
      agentId: id,
    },
  };

  // Return as a downloadable JSON file
  const filename = `sms2cart-snapshot-${agent.storeName.toLowerCase().replace(/\s+/g, "-")}-${id.slice(0, 6)}.json`;

  return new Response(JSON.stringify(snapshot, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
