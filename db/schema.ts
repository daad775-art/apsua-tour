import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
export const settings=sqliteTable('settings',{key:text('key').primaryKey(),value:text('value').notNull(),revision:integer('revision').notNull().default(1)});
export const records=sqliteTable('records',{id:text('id').primaryKey(),kind:text('kind').notNull(),owner:text('owner').notNull(),body:text('body').notNull(),status:text('status').notNull().default('pending'),created:integer('created').notNull(),updated:integer('updated').notNull()});
export const votes=sqliteTable('votes',{story:text('story').notNull(),user:text('user').notNull(),rating:integer('rating').notNull() },t=>[primaryKey({columns:[t.story,t.user]})]);
export const views=sqliteTable('views',{story:text('story').notNull(),visitor:text('visitor').notNull(),day:text('day').notNull()},t=>[primaryKey({columns:[t.story,t.visitor,t.day]})]);
