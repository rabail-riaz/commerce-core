-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('PENDING', 'LABEL_CREATED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'CANCELLED', 'RETURNED');

-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('RETURN_REQUESTED', 'APPROVED', 'PICKUP', 'SHIPMENT', 'RECEIVED', 'INSPECTION', 'REFUND', 'REPLACEMENT', 'REJECTED');

-- CreateTable
CREATE TABLE "Courier" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "StoreStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Courier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourierAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "courierId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "credentials" JSONB,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourierAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "courierAccountId" TEXT,
    "trackingNumber" TEXT,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'PENDING',
    "shippedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentStatusHistory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "status" "ShipmentStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Return" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "shipmentId" TEXT,
    "status" "ReturnStatus" NOT NULL DEFAULT 'RETURN_REQUESTED',
    "reason" TEXT,
    "resolution" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Return_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnStatusHistory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "status" "ReturnStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReturnStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Courier_tenantId_status_idx" ON "Courier"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Courier_tenantId_id_key" ON "Courier"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Courier_tenantId_code_key" ON "Courier"("tenantId", "code");

-- CreateIndex
CREATE INDEX "CourierAccount_tenantId_courierId_idx" ON "CourierAccount"("tenantId", "courierId");

-- CreateIndex
CREATE INDEX "CourierAccount_tenantId_status_idx" ON "CourierAccount"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CourierAccount_tenantId_id_key" ON "CourierAccount"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CourierAccount_tenantId_courierId_name_key" ON "CourierAccount"("tenantId", "courierId", "name");

-- CreateIndex
CREATE INDEX "Shipment_tenantId_orderId_createdAt_idx" ON "Shipment"("tenantId", "orderId", "createdAt");

-- CreateIndex
CREATE INDEX "Shipment_tenantId_status_createdAt_idx" ON "Shipment"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Shipment_tenantId_courierAccountId_idx" ON "Shipment"("tenantId", "courierAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_tenantId_id_key" ON "Shipment"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_tenantId_trackingNumber_key" ON "Shipment"("tenantId", "trackingNumber");

-- CreateIndex
CREATE INDEX "ShipmentStatusHistory_tenantId_shipmentId_createdAt_idx" ON "ShipmentStatusHistory"("tenantId", "shipmentId", "createdAt");

-- CreateIndex
CREATE INDEX "ShipmentStatusHistory_tenantId_status_createdAt_idx" ON "ShipmentStatusHistory"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Return_tenantId_orderId_createdAt_idx" ON "Return"("tenantId", "orderId", "createdAt");

-- CreateIndex
CREATE INDEX "Return_tenantId_status_createdAt_idx" ON "Return"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Return_tenantId_id_key" ON "Return"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Return_tenantId_shipmentId_key" ON "Return"("tenantId", "shipmentId");

-- CreateIndex
CREATE INDEX "ReturnStatusHistory_tenantId_returnId_createdAt_idx" ON "ReturnStatusHistory"("tenantId", "returnId", "createdAt");

-- CreateIndex
CREATE INDEX "ReturnStatusHistory_tenantId_status_createdAt_idx" ON "ReturnStatusHistory"("tenantId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "Courier" ADD CONSTRAINT "Courier_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierAccount" ADD CONSTRAINT "CourierAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierAccount" ADD CONSTRAINT "CourierAccount_tenantId_courierId_fkey" FOREIGN KEY ("tenantId", "courierId") REFERENCES "Courier"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_tenantId_orderId_fkey" FOREIGN KEY ("tenantId", "orderId") REFERENCES "Order"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_tenantId_courierAccountId_fkey" FOREIGN KEY ("tenantId", "courierAccountId") REFERENCES "CourierAccount"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentStatusHistory" ADD CONSTRAINT "ShipmentStatusHistory_tenantId_shipmentId_fkey" FOREIGN KEY ("tenantId", "shipmentId") REFERENCES "Shipment"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Return" ADD CONSTRAINT "Return_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Return" ADD CONSTRAINT "Return_tenantId_orderId_fkey" FOREIGN KEY ("tenantId", "orderId") REFERENCES "Order"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Return" ADD CONSTRAINT "Return_tenantId_shipmentId_fkey" FOREIGN KEY ("tenantId", "shipmentId") REFERENCES "Shipment"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnStatusHistory" ADD CONSTRAINT "ReturnStatusHistory_tenantId_returnId_fkey" FOREIGN KEY ("tenantId", "returnId") REFERENCES "Return"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
