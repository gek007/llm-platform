import { eveChannel } from "eve/channels/eve";
import { channelAuth } from "../lib/channel-auth";

/**
 * Service-to-service only: a valid HS256 JWT signed with COURSE_BUILDER_CHANNEL_SECRET on every
 * request, even on `eve dev` (no browser auth). The only exception is the local server `eve eval`
 * starts for itself; see lib/channel-auth.ts.
 */
export default eveChannel({ auth: channelAuth() });
