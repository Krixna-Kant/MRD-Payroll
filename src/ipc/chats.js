const { getDB } = require('../database/db');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

module.exports = function registerChatHandlers(ipcMain) {

  // ── Get Recent Chats ────────────────────────────────────────────────────────
  ipcMain.handle('chats:getRecent', async (_, userId) => {
    try {
      const db = getDB();
      // Get all chats where the user is a participant
      const chats = db.prepare(`
        SELECT c.*, 
               (SELECT content FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
               (SELECT created_at FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_at,
               (SELECT COUNT(*) FROM messages WHERE chat_id = c.id AND sender_id != ? AND status != 'seen') as unread_count
        FROM chats c
        JOIN chat_participants cp ON cp.chat_id = c.id
        WHERE cp.user_id = ?
        ORDER BY last_message_at DESC
      `).all(userId, userId);

      // For private chats, get the other participant's name
      for (const chat of chats) {
        if (chat.type === 'private') {
          const other = db.prepare(`
            SELECT u.full_name, u.username 
            FROM users u
            JOIN chat_participants cp ON cp.user_id = u.id
            WHERE cp.chat_id = ? AND cp.user_id != ?
          `).get(chat.id, userId);
          chat.display_name = other?.full_name || other?.username || 'Unknown';
        } else {
          chat.display_name = chat.name;
        }
      }

      return { success: true, chats };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── Get Message History ─────────────────────────────────────────────────────
  ipcMain.handle('chats:getMessages', async (_, { chatId, userId, limit = 50, offset = 0 }) => {
    try {
      const db = getDB();
      const messages = db.prepare(`
        SELECT m.*, u.full_name as sender_name, u.username as sender_username
        FROM messages m
        JOIN users u ON u.id = m.sender_id
        WHERE m.chat_id = ?
        ORDER BY m.created_at ASC
        LIMIT ? OFFSET ?
      `).all(chatId, limit, offset);

      // Mark as seen
      if (userId) {
        db.prepare(`UPDATE messages SET status = 'seen' WHERE chat_id = ? AND sender_id != ?`).run(chatId, userId);
      }

      return { success: true, messages };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── Send Message ────────────────────────────────────────────────────────────
  ipcMain.handle('chats:send', async (_, { chatId, senderId, content, type = 'text', attachmentPath = null }) => {
    try {
      const db = getDB();
      const result = db.prepare(`
        INSERT INTO messages (chat_id, sender_id, content, type, attachment_path, status, created_at)
        VALUES (?, ?, ?, ?, ?, 'sent', strftime('%s', 'now'))
      `).run(chatId, senderId, content, type, attachmentPath);

      return { success: true, messageId: result.lastInsertRowid };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── Start/Get Private Chat ──────────────────────────────────────────────────
  ipcMain.handle('chats:startPrivate', async (_, { userId, targetId }) => {
    try {
      const db = getDB();
      // Check if private chat already exists
      const existing = db.prepare(`
        SELECT c.id 
        FROM chats c
        JOIN chat_participants cp1 ON cp1.chat_id = c.id AND cp1.user_id = ?
        JOIN chat_participants cp2 ON cp2.chat_id = c.id AND cp2.user_id = ?
        WHERE c.type = 'private'
      `).get(userId, targetId);

      if (existing) return { success: true, chatId: existing.id };

      // Create new private chat
      const transaction = db.transaction(() => {
        const res = db.prepare(`INSERT INTO chats (type, created_by) VALUES ('private', ?)`).run(userId);
        const chatId = res.lastInsertRowid;
        db.prepare(`INSERT INTO chat_participants (chat_id, user_id) VALUES (?, ?)`).run(chatId, userId);
        db.prepare(`INSERT INTO chat_participants (chat_id, user_id) VALUES (?, ?)`).run(chatId, targetId);
        return chatId;
      });

      const chatId = transaction();
      return { success: true, chatId };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── Get All Users with Status ───────────────────────────────────────────────
  ipcMain.handle('chats:getUsers', async (_, currentUserId) => {
    try {
      const db = getDB();
      const now = Math.floor(Date.now() / 1000);
      const users = db.prepare(`
        SELECT id, username, full_name, role, last_active_at, status_message
        FROM users
        WHERE id != ?
        ORDER BY last_active_at DESC, full_name ASC
      `).all(currentUserId);

      // Determine online status (active in last 5 minutes)
      users.forEach(u => {
        if (!u.last_active_at) u.status = 'offline';
        else if (now - u.last_active_at < 300) u.status = 'online';
        else if (now - u.last_active_at < 900) u.status = 'away';
        else u.status = 'offline';
      });

      return { success: true, users };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── Update Presence ─────────────────────────────────────────────────────────
  ipcMain.handle('chats:updatePresence', async (_, userId) => {
    try {
      const db = getDB();
      db.prepare(`UPDATE users SET last_active_at = strftime('%s', 'now') WHERE id = ?`).run(userId);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── Create/Get Project Chat ─────────────────────────────────────────────────
  ipcMain.handle('chats:getProjectChat', async (_, { userId, projectId, projectName }) => {
    try {
      const db = getDB();
      let chat = db.prepare(`SELECT id FROM chats WHERE type = 'project' AND project_id = ?`).get(projectId);
      
      if (!chat) {
        const transaction = db.transaction(() => {
          const res = db.prepare(`INSERT INTO chats (name, type, project_id, created_by) VALUES (?, 'project', ?, ?)`).run(`${projectName} Team`, projectId, userId);
          const chatId = res.lastInsertRowid;
          db.prepare(`INSERT INTO chat_participants (chat_id, user_id) VALUES (?, ?)`).run(chatId, userId);
          return { id: chatId };
        });
        chat = transaction();
      } else {
        // Ensure user is participant
        const isPart = db.prepare(`SELECT chat_id FROM chat_participants WHERE chat_id = ? AND user_id = ?`).get(chat.id, userId);
        if (!isPart) {
          db.prepare(`INSERT INTO chat_participants (chat_id, user_id) VALUES (?, ?)`).run(chat.id, userId);
        }
      }

      return { success: true, chatId: chat.id };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

};
