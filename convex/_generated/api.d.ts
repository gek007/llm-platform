/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as chapters from "../chapters.js";
import type * as courses from "../courses.js";
import type * as enrollments from "../enrollments.js";
import type * as generation from "../generation.js";
import type * as http from "../http.js";
import type * as lessons from "../lessons.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_completion from "../lib/completion.js";
import type * as lib_engineTypes from "../lib/engineTypes.js";
import type * as lib_enrollment from "../lib/enrollment.js";
import type * as lib_grading from "../lib/grading.js";
import type * as lib_seedChapteredData from "../lib/seedChapteredData.js";
import type * as lib_seedData from "../lib/seedData.js";
import type * as lib_slugs from "../lib/slugs.js";
import type * as lib_testAttempts from "../lib/testAttempts.js";
import type * as mux from "../mux.js";
import type * as muxData from "../muxData.js";
import type * as playback from "../playback.js";
import type * as playbackData from "../playbackData.js";
import type * as progress from "../progress.js";
import type * as resources from "../resources.js";
import type * as seed from "../seed.js";
import type * as tests from "../tests.js";
import type * as users from "../users.js";
import type * as viewer from "../viewer.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  chapters: typeof chapters;
  courses: typeof courses;
  enrollments: typeof enrollments;
  generation: typeof generation;
  http: typeof http;
  lessons: typeof lessons;
  "lib/access": typeof lib_access;
  "lib/auth": typeof lib_auth;
  "lib/completion": typeof lib_completion;
  "lib/engineTypes": typeof lib_engineTypes;
  "lib/enrollment": typeof lib_enrollment;
  "lib/grading": typeof lib_grading;
  "lib/seedChapteredData": typeof lib_seedChapteredData;
  "lib/seedData": typeof lib_seedData;
  "lib/slugs": typeof lib_slugs;
  "lib/testAttempts": typeof lib_testAttempts;
  mux: typeof mux;
  muxData: typeof muxData;
  playback: typeof playback;
  playbackData: typeof playbackData;
  progress: typeof progress;
  resources: typeof resources;
  seed: typeof seed;
  tests: typeof tests;
  users: typeof users;
  viewer: typeof viewer;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
