import { siteAPI, scheduledReminders } from '../lib/site-api';
import shell from '../lib/site-shell';
import { installationAsset } from '../lib/app-icons';
declare const __APSUA_BUILD_ID__:string;
const pageShell=shell.replace('</head>','<script>window.apsuaPageBuildId='+JSON.stringify(__APSUA_BUILD_ID__)+'</script></head>');
import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";

export default {
  fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    const path=new URL(request.url).pathname;
    const asset=installationAsset(request);if(asset)return asset;
    if(path.startsWith('/api/'))return siteAPI(request,env as any,ctx);
    if(['GET','HEAD'].includes(request.method)&&(path==='/'||path==='/index.html'||/^\/(catalog|administrator|journal|account|transfer|map|faq|tour)(\/|$)/.test(path)))return new Response(request.method==='HEAD'?null:pageShell,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    return runWithConnectorBinding(binding, () => handler.fetch(request, env, ctx));
  },
  // build 146: trip reminders. Runs when a Cron Trigger is configured for this Worker (e.g. every 15 minutes);
  // without it, reminders are swept opportunistically by /api/state traffic at most every 10 minutes.
  scheduled(_controller: unknown, env: Cloudflare.Env, ctx: ExecutionContext) {
    ctx.waitUntil(scheduledReminders(env as any).catch(() => 0));
  },
};
