-- CreateTable
CREATE TABLE "StyleSheet" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StyleSheet_pkey" PRIMARY KEY ("id")
);

INSERT INTO "StyleSheet" (id, content) VALUES (gen_random_uuid()::text, '');
