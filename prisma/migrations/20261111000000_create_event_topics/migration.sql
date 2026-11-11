-- CreateTable
CREATE TABLE "event_topics" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "topic" TEXT NOT NULL,
    "tokens" INTEGER NOT NULL,

    CONSTRAINT "event_topics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_topics_event_id_idx" ON "event_topics"("event_id");

-- AddForeignKey
ALTER TABLE "event_topics" ADD CONSTRAINT "event_topics_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
