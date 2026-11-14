-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cartId" TEXT;

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "isExchange" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "note" TEXT;

