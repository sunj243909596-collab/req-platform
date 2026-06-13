-- 一鍵修復 AI 對話數據
-- 用法：psql -h localhost -U postgres -d req_platform_db < scripts/fix-conversations.sql

BEGIN;

-- 1. 刪除流失敗產生的孤兒對話（message_count=0 且存在同名但有消息的對話）
DELETE FROM "Conversation"
WHERE id IN (
  SELECT c1.id
  FROM "Conversation" c1
  WHERE c1.message_count = 0
    AND EXISTS (
      SELECT 1 FROM "Conversation" c2
      WHERE c2.id > c1.id
        AND c2.user_id = c1.user_id
        AND c2.message_count > 0
    )
);

-- 2. 給沒有標題的對話補上標題（取第一條用戶消息前30字）
UPDATE "Conversation" c SET title = sub.title
FROM (
  SELECT m.conversation_id,
         left(regexp_replace(m.content, '\s+', ' ', 'g'), 30) as title
  FROM "ConversationMessage" m
  INNER JOIN (
    SELECT conversation_id, min(id) as first_msg_id
    FROM "ConversationMessage"
    WHERE role = 'user'
    GROUP BY conversation_id
  ) first_msg ON m.id = first_msg.first_msg_id
) sub
WHERE c.id = sub.conversation_id
  AND (c.title IS NULL OR c.title = '');

-- 3. 顯示修復結果
SELECT id, title, message_count, to_char(created_at, 'MM-DD HH24:MI') as created
FROM "Conversation"
ORDER BY id;

COMMIT;
