// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import { sqliteTable, text, integer, primaryKey, index } from "drizzle-orm/sqlite-core";

export const profiles = sqliteTable("profiles", {
  userId: text("user_id").primaryKey(),
  settings: text("settings").notNull(),
});
export const cards = sqliteTable("cards", {
  userId: text("user_id").notNull(),
  wordId: text("word_id").notNull(),
  bookId: text("book_id").notNull(),
  word: text("word").notNull(),
  data: text("data").notNull(),
  due: text("due").notNull(),
  version: integer("version").notNull().default(1),
}, t => [primaryKey({ columns: [t.userId, t.wordId] }), index("cards_user_due").on(t.userId, t.due)]);
export const reviews = sqliteTable("reviews", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  wordId: text("word_id").notNull(),
  bookId: text("book_id").notNull(),
  word: text("word").notNull(),
  rating: integer("rating").notNull(),
  reviewedAt: text("reviewed_at").notNull(),
  day: text("day").notNull(),
  isNew: integer("is_new").notNull(),
  duration: integer("duration").notNull(),
}, t => [index("reviews_user_day").on(t.userId, t.day)]);
export const customWords = sqliteTable("custom_words", {
  userId: text("user_id").notNull(),
  id: text("id").notNull(),
  data: text("data").notNull(),
  createdAt: text("created_at").notNull(),
}, t => [primaryKey({ columns: [t.userId, t.id] })]);
