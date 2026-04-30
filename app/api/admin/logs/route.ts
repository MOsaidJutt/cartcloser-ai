import { NextRequest } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";

export const dynamic = "force-dynamic";

const LOG_CANDIDATES = [
  "/root/.pm2/logs/sms2cart-out.log",
  "/root/.pm2/logs/sms2cart-error.log",
  process.env.PM2_LOG_PATH ?? "",
].filter(Boolean);

function findLogFile(): string | null {
  for (const f of LOG_CANDIDATES) {
    try {
      if (fs.existsSync(f)) return f;
    } catch {}
  }
  return null;
}

export async function GET(req: NextRequest) {
  const session = getSessionUser(req);
  if (!session) return unauthorized();
  if (!isAdmin(session.email)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const logFile = findLogFile();

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const send = (line: string) => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ line })}\n\n`));
        } catch {}
      };

      if (!logFile) {
        send("[terminal] No PM2 log file found. Showing live console output only.");
        send("[terminal] Expected: /root/.pm2/logs/sms2cart-out.log");
        controller.close();
        return;
      }

      // Tail last 200 lines then follow
      const tail = spawn("tail", ["-f", "-n", "200", logFile], { stdio: ["ignore", "pipe", "pipe"] });

      tail.stdout.on("data", (data: Buffer) => {
        const lines = data.toString().split("\n");
        for (const line of lines) {
          if (line.trim()) send(line);
        }
      });

      tail.stderr.on("data", (data: Buffer) => {
        send(`[stderr] ${data.toString().trim()}`);
      });

      tail.on("error", (err) => {
        send(`[error] Failed to tail log: ${err.message}`);
        controller.close();
      });

      req.signal.addEventListener("abort", () => {
        try { tail.kill(); } catch {}
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
