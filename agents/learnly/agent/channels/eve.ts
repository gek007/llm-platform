import { defaultEveAuth, eveChannel } from "eve/channels/eve";
import { describePageContext, readPageContext } from "../../../../src/components/tutor/page-context";
import { routeAuthWalk } from "../lib/clerk-auth";

/**
 * Only verified Pro/admin Clerk users get in (see lib/clerk-auth.ts). No vercelOidc() or placeholderAuth():
 * the agent is reached only through the browser widget with a Clerk Bearer token.
 */
export default eveChannel({
  auth: routeAuthWalk(),
  onMessage(ctx) {
    const auth = defaultEveAuth(ctx);
    const page = readPageContext(ctx.eve.clientContext);
    // Replaces the client-supplied context with a server-normalised, labelled hint.
    return { auth, clientContext: [describePageContext(page)] };
  },
});
