import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("fail stalled generation jobs", { minutes: 5 }, internal.engine.failStalledJobs);

export default crons;
