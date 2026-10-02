-- Pin flag for Lakupak AI chats. Existing rows stay unpinned.

ALTER TABLE "AiConversation" ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false;
