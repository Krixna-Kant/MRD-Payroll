/**
 * Workforce Connect - Real-Time Internal Chat System
 */
const Chat = (() => {
    let _isOpen = false;
    let _currentChatId = null;
    let _currentUser = null;
    let _pollingInterval = null;
    let _statusInterval = null;
    let _lastMessageId = 0;

    async function init() {
        _currentUser = AppState.get('user');
        if (!_currentUser) {
            // Wait for user to login if not already
            EventBus.on('state:user', (user) => {
                if (user) {
                    _currentUser = user;
                    startChatServices();
                }
            });
            return;
        }

        startChatServices();
    }

    function startChatServices() {
        setupEventListeners();
        loadRecentChats();
        startStatusUpdates();
        updateGlobalUnreadCount();
    }

    function setupEventListeners() {
        const fab = document.getElementById('chat-fab');
        const container = document.getElementById('chat-container');
        const closeBtn = document.getElementById('chat-close');
        const backBtn = document.getElementById('chat-back');
        const sendBtn = document.getElementById('chat-send');
        const input = document.getElementById('chat-input');
        const searchInput = document.getElementById('chat-user-search');

        fab.addEventListener('click', () => {
            _isOpen = !_isOpen;
            container.classList.toggle('active', _isOpen);
            if (_isOpen) loadRecentChats();
        });

        closeBtn.addEventListener('click', () => {
            _isOpen = false;
            container.classList.remove('active');
        });

        backBtn.addEventListener('click', () => {
            document.getElementById('chat-main').classList.remove('active');
            document.getElementById('chat-sidebar').classList.remove('hidden');
            _currentChatId = null;
            clearInterval(_pollingInterval);
            loadRecentChats();
        });

        sendBtn.addEventListener('click', sendMessage);
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });

        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            if (term.length > 0) {
                searchUsers(term);
            } else {
                loadRecentChats();
            }
        });
    }

    async function loadRecentChats() {
        const res = await window.electronAPI.getRecentChats(_currentUser.id);
        if (!res.success) return;

        const listEl = document.getElementById('chat-list');
        if (res.chats.length === 0) {
            listEl.innerHTML = `<div class="p-8 text-center text-muted text-sm">No recent chats.<br>Search for a team member to start.</div>`;
            return;
        }

        listEl.innerHTML = res.chats.map(c => `
            <div class="chat-item" onclick="Chat.openChat(${c.id}, '${c.display_name}', '${c.type}')">
                <div class="chat-avatar">${c.display_name.charAt(0)}</div>
                <div class="chat-info">
                    <div class="chat-name-row">
                        <span class="chat-name">${Helpers.escapeHtml(c.display_name)}</span>
                        <span class="chat-time">${c.last_message_at ? Helpers.formatTime(c.last_message_at * 1000) : ''}</span>
                    </div>
                    <div class="chat-last-msg">${Helpers.escapeHtml(c.last_message || 'No messages yet')}</div>
                </div>
                ${c.unread_count > 0 ? `<div class="badge badge-danger" style="border-radius:10px; min-width:20px">${c.unread_count}</div>` : ''}
            </div>
        `).join('');
    }

    async function searchUsers(term) {
        const res = await window.electronAPI.getChatUsers(_currentUser.id);
        if (!res.success) return;

        const filtered = res.users.filter(u => 
            u.full_name?.toLowerCase().includes(term) || 
            u.username?.toLowerCase().includes(term) ||
            u.role?.toLowerCase().includes(term)
        );

        const listEl = document.getElementById('chat-list');
        if (filtered.length === 0) {
            listEl.innerHTML = `<div class="p-8 text-center text-muted text-sm">No members found.</div>`;
            return;
        }

        listEl.innerHTML = filtered.map(u => `
            <div class="chat-item" onclick="Chat.startPrivateChat(${u.id}, '${u.full_name || u.username}')">
                <div class="chat-avatar">
                    ${(u.full_name || u.username).charAt(0)}
                    <div class="status-dot status-${u.status}"></div>
                </div>
                <div class="chat-info">
                    <div class="chat-name">${Helpers.escapeHtml(u.full_name || u.username)}</div>
                    <div class="chat-last-msg">${u.role.toUpperCase()} • ${u.status.toUpperCase()}</div>
                </div>
            </div>
        `).join('');
    }

    async function startPrivateChat(targetId, targetName) {
        const res = await window.electronAPI.startPrivateChat(_currentUser.id, targetId);
        if (res.success) {
            openChat(res.chatId, targetName, 'private');
        }
    }

    async function openChat(chatId, name, type) {
        _currentChatId = chatId;
        document.getElementById('chat-sidebar').classList.add('hidden');
        const main = document.getElementById('chat-main');
        main.classList.add('active');

        document.getElementById('active-chat-name').textContent = name;
        document.getElementById('active-chat-avatar').textContent = name.charAt(0);
        document.getElementById('active-chat-status').textContent = type.charAt(0).toUpperCase() + type.slice(1);

        loadMessages(chatId);
        
        // Start real-time polling
        clearInterval(_pollingInterval);
        _pollingInterval = setInterval(() => loadMessages(chatId, true), 3000);
    }

    async function loadMessages(chatId, isPolling = false) {
        const res = await window.electronAPI.getChatMessages({ chatId, userId: _currentUser.id });
        if (!res.success) return;

        const body = document.getElementById('chat-messages-body');
        
        // If polling and no new messages, don't re-render
        if (isPolling && res.messages.length > 0) {
            const latestId = res.messages[res.messages.length - 1].id;
            if (latestId === _lastMessageId) return;
            _lastMessageId = latestId;
        } else if (!isPolling && res.messages.length > 0) {
            _lastMessageId = res.messages[res.messages.length - 1].id;
        }

        // Get chat type to determine if we show names
        const chatType = document.getElementById('active-chat-status').textContent.toLowerCase();

        body.innerHTML = res.messages.map(m => {
            const isMe = m.sender_id === _currentUser.id;
            const showName = !isMe && chatType !== 'private';
            
            return `
                <div class="message ${isMe ? 'message-sent' : 'message-received'}">
                    ${showName ? `<div style="font-size:11px; font-weight:700; color:#51557E; margin-bottom:4px">${Helpers.escapeHtml(m.sender_name || m.sender_username)}</div>` : ''}
                    <div class="message-content">${Helpers.escapeHtml(m.content)}</div>
                    <div class="message-info">
                        ${Helpers.formatTime(m.created_at * 1000)}
                        ${isMe ? (m.status === 'seen' ? '<span style="color:#53bdeb; font-size:12px; margin-left:2px">✔✔</span>' : '<span style="font-size:12px; margin-left:2px">✔</span>') : ''}
                    </div>
                </div>
            `;
        }).join('');

        body.scrollTop = body.scrollHeight;
    }

    async function sendMessage() {
        const input = document.getElementById('chat-input');
        const content = input.value.trim();
        if (!content || !_currentChatId) return;

        input.value = '';
        const res = await window.electronAPI.sendChatMessage(_currentChatId, _currentUser.id, content);
        if (res.success) {
            loadMessages(_currentChatId);
        }
    }

    function startStatusUpdates() {
        // Update presence every 30 seconds
        _statusInterval = setInterval(() => {
            window.electronAPI.updatePresence(_currentUser.id);
            updateGlobalUnreadCount();
        }, 30000);
        
        // Initial presence update
        window.electronAPI.updatePresence(_currentUser.id);
    }

    async function updateGlobalUnreadCount() {
        const res = await window.electronAPI.getRecentChats(_currentUser.id);
        if (res.success) {
            const total = res.chats.reduce((sum, c) => sum + (c.unread_count || 0), 0);
            const badge = document.getElementById('chat-global-unread');
            if (total > 0) {
                badge.textContent = total;
                badge.style.display = 'block';
            } else {
                badge.style.display = 'none';
            }
        }
    }

    return { init, openChat, startPrivateChat };
})();

// Export to window for onclick handlers
window.Chat = Chat;
