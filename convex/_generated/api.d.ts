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
import type * as http from "../http.js";
import type * as lessons from "../lessons.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_engineTypes from "../lib/engineTypes.js";
import type * as lib_grading from "../lib/grading.js";
import type * as lib_seedData from "../lib/seedData.js";
import type * as mux from "../mux.js";
import type * as muxData from "../muxData.js";
import type * as playback from "../playback.js";
import type * as playbackData from "../playbackData.js";
import type * as progress from "../progress.js";
import type * as seed from "../seed.js";
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
  http: typeof http;
  lessons: typeof lessons;
  "lib/access": typeof lib_access;
  "lib/auth": typeof lib_auth;
  "lib/engineTypes": typeof lib_engineTypes;
  "lib/grading": typeof lib_grading;
  "lib/seedData": typeof lib_seedData;
  mux: typeof mux;
  muxData: typeof muxData;
  playback: typeof playback;
  playbackData: typeof playbackData;
  progress: typeof progress;
  seed: typeof seed;
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
