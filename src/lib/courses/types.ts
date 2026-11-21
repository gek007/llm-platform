// Mirrors Convex documents so these types can be replaced by `Doc<"...">` from convex/_generated/dataModel.
export type Id<TableName extends string> = string & { __tableName: TableName };

type SystemFields<TableName extends string> = {
  _id: Id<TableName>;
  _creationTime: number;
};

export type UserRole = "student" | "instructor" | "admin";

export type User = SystemFields<"users"> & {
  clerkId: string;
  name: string;
  role: UserRole;
};

export type CourseLevel = "beginner" | "intermediate" | "advanced";

export type CourseStatus = "draft" | "published" | "archived";

export type Course = SystemFields<"courses"> & {
  slug: string;
  title: string;
  summary: string;
  level: CourseLevel;
  status: CourseStatus;
  tags: string[];
  instructorId: Id<"users">;
};

export type LessonKind = "video" | "article" | "quiz";

export type Lesson = SystemFields<"lessons"> & {
  courseId: Id<"courses">;
  slug: string;
  title: string;
  summary: string;
  kind: LessonKind;
  order: number;
  durationMinutes: number;
};
