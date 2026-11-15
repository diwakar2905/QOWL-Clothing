-- Editable long-form copy for category and collection pages (SEO / shopper guidance).
ALTER TABLE "Category" ADD COLUMN "content" TEXT;
ALTER TABLE "Collection" ADD COLUMN "content" TEXT;
