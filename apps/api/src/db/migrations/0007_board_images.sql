ALTER TABLE "boards" ADD COLUMN "background_image" text;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "cover_attachment_id" uuid;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "cover_mode" varchar(10) DEFAULT 'cover' NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_cover_attachment_id_attachments_id_fk" FOREIGN KEY ("cover_attachment_id") REFERENCES "public"."attachments"("id") ON DELETE set null ON UPDATE no action;