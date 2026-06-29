diff --git a/packages/client/src/i18n/locales/en.ts b/packages/client/src/i18n/locales/en.ts
index fdc761f3..81993ab9 100644
--- a/packages/client/src/i18n/locales/en.ts
+++ b/packages/client/src/i18n/locales/en.ts
@@ -78,6 +78,7 @@ export default {
   common: {
     loading: 'Loading...',
     cancel: 'Cancel',
+    search: 'Search',
     delete: 'Delete',
     edit: 'Edit',
     save: 'Save',
@@ -186,6 +187,9 @@ export default {
     history: 'History',
     jobs: 'Jobs',
     kanban: 'Kanban',
+    swarmKanban: 'Swarm kanban',
+    matrixChat: 'Matrix Chat',
+    cockpit: 'Cockpit',
     workflow: 'Workflow',
     models: 'Models',
     profiles: 'Profiles',
@@ -727,6 +731,10 @@ export default {
   // Kanban
   kanban: {
     title: 'Kanban Board',
+    diagnostics: 'Diagnostics',
+    workerLog: 'Worker Log',
+    loadingLog: 'Loading log...',
+    searchPlaceholder: 'Search tasks...',
     createTask: 'New Task',
     noTasks: 'No tasks',
     allStatuses: 'All Statuses',
@@ -1838,6 +1846,9 @@ export default {
       mimoStylePromptHint: 'Optional — describe the speaking style in natural language',
       mimoStylePromptPlaceholder: 'e.g., Bright and bouncy tone, fast pace',
     },
+    matrixIdentity: {
+      title: 'Matrix Identity', userId: 'User ID', displayName: 'Display Name', homeserver: 'Homeserver', role: 'Role', authSource: 'Auth Source', passwordManagedByMatrix: 'Password is managed by your Matrix homeserver', changeMatrixPassword: 'Change Matrix Password', passwordChanged: 'Matrix password changed successfully',
+    },
   },
   githubPreview: {
     title: "Version Preview",
@@ -2266,4 +2277,16 @@ export default {
     new_0_6_13_5: 'Desktop updates are more reliable: Windows upgrades close stale Hermes Studio processes, Cloudflare is checked first, and GitHub remains the fallback feed',
     new_0_6_13_6: 'Release automation now keeps Web UI and Docker releases out of GitHub Latest while full desktop releases are manually promoted to Latest',
   },
+
+  matrix: {
+    options: 'Options', threadStartDisabled: 'Cannot start a thread from a message with an existing relation', undecryptable: 'Unable to decrypt message', historyLoadError: 'Server error, unable to load earlier history',
+  },
+
+  cockpit: {
+    modeWorkspace: 'Workspace', editTitlePlaceholder: 'Title', actions: 'Actions', specify: 'Specify', decompose: 'Decompose', moveToTriage: 'Move to triage', moveToReady: 'Move to ready', moveToBlocked: 'Mark blocked', moveToDone: 'Mark done', moveToArchived: 'Archive', unblock: 'Unblock', reclaim: 'Reclaim', reassign: 'Reassign', reassignProfile: 'Reassign profile', recovery: 'Recovery', diagnostics: 'Diagnostics', notifyHomeChannels: 'Notify home channels', subscribe: 'Subscribe', unsubscribe: 'Unsubscribe', comments: 'Comments', addCommentPlaceholder: 'Add a comment…', confirmDone: 'Mark this task as done? This will complete the task in the kanban board.', confirmArchive: 'Archive this task? Archived tasks are hidden from the board but can be restored.', confirmBlocked: 'Mark this task as blocked? Blocked tasks are paused until unblocked.', completionSummaryRequired: 'Completion summary is required before marking a task as done.', evaluation: 'Evaluation', saveDraft: 'Save draft', parentTasks: 'Parent tasks', childTasks: 'Child tasks', parentIdPlaceholder: 'Parent task id', childIdPlaceholder: 'Child task id', pendingLinksHint: 'pending link changes', assignee: 'Assignee', selectAssignee: 'Select assignee…', description: 'Description', descriptionPlaceholder: 'Task description…', add: 'Add', attachments: 'Attachments', noAttachments: 'No attachments', uploadFile: 'Upload file', none: 'None', historySearchPlaceholder: 'Search history…', historyToday: 'Today', historyWeek: 'This Week', historyMonth: 'This Month', historyCategory: 'Category', historyCatEvent: 'Events', historyCatComment: 'Comments', historyActive: 'Active', historyDone: 'Done', notifyTitle: 'Notifications', notifyUnread: 'unread', notifySource: 'Source', notifyAll: 'All', notifyMatrix: 'Matrix', notifyChat: 'Chat', notifyGroup: 'Group', notifyEmpty: 'No unread messages', notifyClickHint: 'Click an item to open the chat', notifyReadAll: 'Mark all as read', attention: 'Attention', backToWork: 'Back to Work', openFull: 'Open Full Page', saySomething: 'Say something...', send: 'Send', noTaskSelected: 'No task selected', collabWith: 'Collab with', addCollab: 'Chat & Collab', addCollabTitle: 'Add Collaborator', collaborationMap: 'Collaboration Map', handleLater: 'Handle Later', taskFiles: 'Task Files', currentTaskWorkspace: 'Current task workspace', filterFiles: 'Filter files...', history: 'History', historyTitle: 'History', historyTime: 'Time', historyAction: 'Action', historyStatus: 'Status', historyArchived: 'Archived', restore: 'Restore', maximize: 'Maximize', modeWork: 'Work', modeTerm: 'Terminal', schedule: 'Schedule', today: 'Today', scheduleEvents: 'Schedule Events', scheduleEmpty: 'No events for this date', scheduleAddTodo: 'Add Todo', scheduleTodoPlaceholder: 'What needs to be done?', templateManager: 'Template Manager', templateName: 'Template name...', saveAsTemplate: 'Save as Template', applyTemplate: 'Apply', deleteTemplate: 'Delete', noTemplates: 'No templates saved', termExit: 'Exit Terminal', timeline: 'Timeline', pending: 'Pending', done: 'Done', olderHistory: '{n} older entries', search: 'Search', priority: 'Priority', yourDecision: 'Your Decision', recommend: 'Recommended', riskTags: 'Risk Tags', agentPrefilled: 'Agent pre-filled', reviewOpinion: 'Review Opinion', submit: 'Submit', newCollabFromArchive: 'New Collab from Template', readOnly: 'Read Only',
+  },
+
+  matrixChat: {
+    actionDelete: 'Delete', adminTools: 'Admin Tools', actionEdit: 'Edit', actionReply: 'Reply', addReaction: 'Add Reaction', addTopic: 'Add Topic', allThreads: 'All Threads', backToThreads: 'Back to Threads', banUser: 'Ban', bold: 'Bold', cancel: 'Cancel', changeAvatar: 'Change Avatar', code: 'Code', codeBlock: 'Code Block', comingSoon: 'Coming Soon', confirmDelete: 'Confirm Delete', confirmDeleteAction: 'Are you sure you want to delete this message?', confirmLeave: 'Click again to confirm', copyLink: 'Copy Link', copyText: 'Copy Text', createRoom: 'Create Room', delete: 'Delete', deleteReasonPlaceholder: 'Reason (optional)', disabled: 'Disabled', edit: 'Edit', editMessagePlaceholder: 'Edit message...', edited: 'edited', editingMessage: 'Editing message', emoji: 'Emoji', enabled: 'Enabled', encryption: 'Encryption', eventNotFound: 'Event not found', exportChatMenu: 'Export Chat', exportChatDescription: 'Export all messages from this room as a JSON file.', exportFailed: 'Failed to export chat', exportSuccess: '{count} messages exported', exporting: 'Exporting...', extensionsMenu: 'Extensions', failed: 'Failed', favorite: 'Favorite', filesMenu: 'Files', forward: 'Forward', forwardMessage: 'Forward Message', forwardingMessage: 'Forwarding message...', historyLoadError: 'Server error, unable to load earlier history', historyWorldReadable: 'History visible to anyone', historyShared: 'History visible to members since they joined', historyInvited: 'History visible to invited members', historyJoined: 'History visible to members', ignoreUser: 'Ignore User', inviteFailed: 'Invite failed', inviteSending: 'Sending invite...', inviteToRoom: 'Invite to Room', inviteUser: 'Invite User', italic: 'Italic', joinRoom: 'Join Room', kickUser: 'Kick User', leaveRoom: 'Leave Room', leaveFailed: 'Failed to leave room', leaveRoomConfirm: 'Are you sure you want to leave "{room}"?', linkCopied: 'Link copied', loading: 'Loading...', loadMore: 'Load more', loadingThreads: 'Loading threads...', markAllThreadsRead: 'Mark all threads as read', memberAdmin: 'Admin', memberCount: '{count} members', memberDefault: 'Member', memberInvited: 'Invited', memberMod: 'Moderator', memberSearch: 'Search members', members: 'Members', messageSendFailed: 'Failed to send message', messageSending: 'Sending...', minutesAgo: '{n}m ago', hoursAgo: '{n}h ago', daysAgo: '{n}d ago', justNow: 'just now', myThreads: 'My Threads', newMessages: 'New messages', noExtensions: 'No integrations', noExtensionsHint: 'Add integrations from the integration manager', noFilesFound: 'No files found', noMembersFound: 'No members found', noPinnedMessages: 'No pinned messages', noResults: 'No results', noRoomSelected: 'No room selected', noRooms: 'No rooms', noThreadsDesc: 'No threads in this room yet', noThreadsTitle: 'No Threads', noUsersFound: 'No users found', noTopic: 'No topic set', notAuthenticated: 'Not authenticated', notifications: 'Notifications', notifyAllMessages: 'All messages', notifyMentions: 'Mentions only', notifyNone: 'None', notTrusted: 'Not trusted', offline: 'Offline', online: 'Online', openWidget: 'Open widget', options: 'Options', paginateLoading: 'Loading more...', people: 'People', pinnedMessages: 'Pinned Messages', pollsMenu: 'Polls', pollEnded: 'Closed', pollActive: 'Active', noPolls: 'No polls yet', untitledPoll: 'Untitled Poll', votes: 'votes', powerLevel: 'Power Level', powerLevelValue: '{level}', publicRoom: 'Public Room', replyInThread: 'Reply in Thread', replyMessagePlaceholder: 'Reply...', reportFailed: 'Failed to submit report', reportReason: 'Reason for report...', reportRoom: 'Report Room', reportRoomDescription: 'Report this room to the server administrator. Please describe the issue.', reportSpamAbuse: 'Spam or abuse', roomAlias: 'Room Alias', roomEncryption: 'Encrypted room', roomId: 'Room ID', roomIdOrAlias: 'Room ID or alias', roomInfo: 'Room Info', roomMembers: 'Room Members', roomName: 'Room Name', roomPublic: 'Public', roomSettings: 'Room Settings', roomTopic: 'Topic', save: 'Save', saving: 'Saving...', search: 'Search', searchHint: 'Search rooms and people', searchResultCount: '{count} results', searchRooms: 'Search Rooms', searchUsers: 'Search Users', searchUsersHint: 'Search by username or display name', send: 'Send', sendMessage: 'Send Message', sent: 'Sent', showAll: 'Show All', showLess: 'Show Less', shareRoom: 'Share Room', startChat: 'Start Chat', stateBanned: 'banned', stateChangedName: 'changed display name', stateInvited: 'was invited', stateJoined: 'joined', stateKicked: 'was kicked', stateLeft: 'left', stateReason: 'Reason', stateRejectedInvite: 'rejected the invitation', stateRoomCreated: 'Room created', stateUnbanned: 'was unbanned', stateWithdrewInvite: 'withdrew invitation', suggestions: 'Suggestions', submitting: 'Submitting...', syncConnecting: 'Connecting...', syncError: 'Connection error', thread: 'Thread', threadStartDisabled: 'Cannot start a thread from a message with an existing relation', threads: 'Threads', threadsMenu: 'Threads', typingMany: '{n} people are typing...', typingOne: '{user} is typing...', typingTwo: '{user1} and {user2} are typing...', trusted: 'Trusted', unavailable: 'Unavailable', undecryptable: 'Unable to decrypt message', unencrypted: 'Unencrypted', unignoreUser: 'Unignore User', unpinAll: 'Unpin all', unpinMessage: 'Unpin message', unknownFile: 'Unknown file', uploadFile: 'Upload File', videoCall: 'Video Call', voiceCall: 'Voice Call',
+  },
 }
