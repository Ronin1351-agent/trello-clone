import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  index,
  unique,
  jsonb,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

// Enums
export const cardTypeEnum = pgEnum('card_type', ['story', 'bug', 'task']);
export const teamRoleEnum = pgEnum('team_role', ['owner', 'admin', 'member']);

// Users
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }),
  displayName: varchar('display_name', { length: 100 }).notNull(),
  avatarUrl: varchar('avatar_url', { length: 500 }),
  googleId: varchar('google_id', { length: 255 }).unique(),
  microsoftId: varchar('microsoft_id', { length: 255 }).unique(),
  language: varchar('language', { length: 5 }).notNull().default('en'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Teams
export const teams = pgTable('teams', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Team Memberships
export const teamMemberships = pgTable(
  'team_memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: teamRoleEnum('role').notNull().default('member'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.teamId, t.userId), index('idx_tm_team').on(t.teamId), index('idx_tm_user').on(t.userId)],
);

// Boards
export const boards = pgTable(
  'boards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    backgroundImage: text('background_image'),
    description: text('description'),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    isArchived: boolean('is_archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_boards_team').on(t.teamId)],
);

// Columns
export const columns = pgTable(
  'columns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    boardId: uuid('board_id').notNull().references(() => boards.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    position: varchar('position', { length: 50 }).notNull(),
    wipLimit: integer('wip_limit'),
    color: varchar('color', { length: 7 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_columns_board').on(t.boardId), index('idx_columns_board_pos').on(t.boardId, t.position)],
);

// Swimlanes
export const swimlanes = pgTable(
  'swimlanes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    boardId: uuid('board_id').notNull().references(() => boards.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    position: varchar('position', { length: 50 }).notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_swimlanes_board').on(t.boardId)],
);

// Cards
export const cards = pgTable(
  'cards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    boardId: uuid('board_id').notNull().references(() => boards.id, { onDelete: 'cascade' }),
    columnId: uuid('column_id').notNull().references(() => columns.id, { onDelete: 'cascade' }),
    swimlaneId: uuid('swimlane_id').notNull().references(() => swimlanes.id),
    parentCardId: uuid('parent_card_id').references((): AnyPgColumn => cards.id, { onDelete: 'set null' }),
    cardType: cardTypeEnum('card_type').notNull().default('task'),
    title: varchar('title', { length: 500 }).notNull(),
    coverAttachmentId: uuid('cover_attachment_id').references((): AnyPgColumn => attachments.id, { onDelete: 'set null' }),
    coverMode: varchar('cover_mode', { length: 10 }).notNull().default('cover'),
    description: text('description'),
    position: varchar('position', { length: 50 }).notNull(),
    dueDate: timestamp('due_date', { withTimezone: true }),
    isArchived: boolean('is_archived').notNull().default(false),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_cards_col_swim').on(t.columnId, t.swimlaneId, t.position),
    index('idx_cards_parent').on(t.parentCardId),
    index('idx_cards_board').on(t.boardId),
  ],
);

// Card Assignees
export const cardAssignees = pgTable(
  'card_assignees',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cardId: uuid('card_id').notNull().references(() => cards.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.cardId, t.userId), index('idx_ca_card').on(t.cardId), index('idx_ca_user').on(t.userId)],
);

// Comments
export const comments = pgTable(
  'comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cardId: uuid('card_id').notNull().references(() => cards.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_comments_card').on(t.cardId)],
);

// Labels (board-scoped)
export const labels = pgTable(
  'labels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    boardId: uuid('board_id').notNull().references(() => boards.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 50 }).notNull(),
    color: varchar('color', { length: 7 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.boardId, t.name), index('idx_labels_board').on(t.boardId)],
);

// Card Labels (junction table)
export const cardLabels = pgTable(
  'card_labels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cardId: uuid('card_id').notNull().references(() => cards.id, { onDelete: 'cascade' }),
    labelId: uuid('label_id').notNull().references(() => labels.id, { onDelete: 'cascade' }),
  },
  (t) => [
    unique().on(t.cardId, t.labelId),
    index('idx_cl_card').on(t.cardId),
    index('idx_cl_label').on(t.labelId),
  ],
);

// Activities
export const activities = pgTable(
  'activities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    boardId: uuid('board_id').notNull().references(() => boards.id, { onDelete: 'cascade' }),
    cardId: uuid('card_id').references(() => cards.id, { onDelete: 'set null' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    action: varchar('action', { length: 50 }).notNull(),
    entityType: varchar('entity_type', { length: 30 }).notNull(),
    entityId: uuid('entity_id').notNull(),
    metadata: text('metadata'), // JSON string
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_activities_board_created').on(t.boardId, t.createdAt),
    index('idx_activities_card').on(t.cardId),
  ],
);

// Notifications
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    activityId: uuid('activity_id').notNull().references(() => activities.id, { onDelete: 'cascade' }),
    isRead: boolean('is_read').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_notif_user_unread').on(t.userId, t.isRead),
    index('idx_notif_user_created').on(t.userId, t.createdAt),
  ],
);

// Board Templates
export const boardTemplates = pgTable(
  'board_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    teamId: uuid('team_id').references(() => teams.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description'),
    isSystem: boolean('is_system').notNull().default(false),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    config: jsonb('config').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_templates_team').on(t.teamId)],
);

// Board Shares
export const boardShares = pgTable(
  'board_shares',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    boardId: uuid('board_id').notNull().references(() => boards.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    token: varchar('token', { length: 64 }).unique(),
    permission: varchar('permission', { length: 20 }).notNull().default('read'),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_bs_board').on(t.boardId),
    index('idx_bs_user').on(t.userId),
    index('idx_bs_token').on(t.token),
  ],
);

// Attachments
export const attachments = pgTable(
  'attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cardId: uuid('card_id').notNull().references(() => cards.id, { onDelete: 'cascade' }),
    uploadedBy: uuid('uploaded_by').notNull().references(() => users.id),
    filename: varchar('filename', { length: 255 }).notNull(),
    storagePath: varchar('storage_path', { length: 500 }).notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_attachments_card').on(t.cardId)],
);

// Password Reset Tokens
export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(), // SHA-256 hex = 64 chars
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_prt_user').on(t.userId)],
);

// Refresh Tokens
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 255 }).notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [index('idx_rt_user').on(t.userId)],
);
