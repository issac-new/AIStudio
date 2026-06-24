// overlay/scripts/add-matrixchat-i18n.mjs
import { readFileSync, writeFileSync } from 'fs';

const matrixChatKeys = {
  actionDelete: 'Delete', actionEdit: 'Edit', actionReply: 'Reply',
  addReaction: 'Add Reaction', addTopic: 'Add Topic', allThreads: 'All Threads',
  backToThreads: 'Back to Threads', bold: 'Bold', cancel: 'Cancel',
  code: 'Code', codeBlock: 'Code Block', comingSoon: 'Coming Soon',
  confirmDelete: 'Confirm Delete', confirmDeleteAction: 'Are you sure you want to delete this message?',
  copyLink: 'Copy Link', copyText: 'Copy Text', createRoom: 'Create Room',
  delete: 'Delete', deleteReasonPlaceholder: 'Reason (optional)',
  edit: 'Edit', editMessagePlaceholder: 'Edit message...',
  edited: 'edited', editingMessage: 'Editing message',
  emoji: 'Emoji', failed: 'Failed', favorite: 'Favorite',
  forward: 'Forward', forwardMessage: 'Forward Message',
  forwardingMessage: 'Forwarding message...',
  historyLoadError: 'Server error, unable to load earlier history',
  ignoreUser: 'Ignore User', inviteFailed: 'Invite failed',
  inviteSending: 'Sending invite...', inviteToRoom: 'Invite to Room',
  inviteUser: 'Invite User', italic: 'Italic', joinRoom: 'Join Room',
  kickUser: 'Kick User', leaveRoom: 'Leave Room',
  linkCopied: 'Link copied', loading: 'Loading...',
  loadingThreads: 'Loading threads...', markAllThreadsRead: 'Mark all threads as read',
  memberAdmin: 'Admin', memberDefault: 'Member', memberInvited: 'Invited',
  memberMod: 'Moderator', memberSearch: 'Search members',
  messageSendFailed: 'Failed to send message', messageSending: 'Sending...',
  myThreads: 'My Threads', newMessages: 'New messages',
  noMembersFound: 'No members found', noResults: 'No results',
  noRoomSelected: 'No room selected', noRooms: 'No rooms',
  noThreadsDesc: 'No threads in this room yet', noThreadsTitle: 'No Threads',
  noUsersFound: 'No users found', notAuthenticated: 'Not authenticated',
  offline: 'Offline', online: 'Online', options: 'Options',
  paginateLoading: 'Loading more...', people: 'People',
  publicRoom: 'Public Room', replyInThread: 'Reply in Thread',
  replyMessagePlaceholder: 'Reply...',
  roomEncryption: 'Encrypted room', roomIdOrAlias: 'Room ID or alias',
  roomInfo: 'Room Info', roomMembers: 'Room Members',
  roomName: 'Room Name', roomPublic: 'Public',
  save: 'Save', search: 'Search', searchHint: 'Search rooms and people',
  searchRooms: 'Search Rooms', searchUsers: 'Search Users',
  searchUsersHint: 'Search by username or display name',
  send: 'Send', sendMessage: 'Send Message', sent: 'Sent',
  showAll: 'Show All', showLess: 'Show Less', startChat: 'Start Chat',
  stateBanned: 'banned', stateChangedName: 'changed display name',
  stateInvited: 'was invited', stateJoined: 'joined',
  stateKicked: 'was kicked', stateLeft: 'left',
  stateLoadingOlder: 'Loading older messages...',
  stateNoMoreHistory: 'No more history', stateReason: 'Reason',
  stateRejectedInvite: 'rejected the invitation',
  stateRoomCreated: 'Room created', stateUnbanned: 'was unbanned',
  stateWithdrewInvite: 'withdrew invitation',
  suggestions: 'Suggestions', syncConnecting: 'Connecting...',
  syncError: 'Connection error', thread: 'Thread',
  threadStartDisabled: 'Cannot start a thread from a message with an existing relation',
  threads: 'Threads', threadsMenu: 'Threads',
  typingMany: '{n} people are typing...', typingOne: '{user} is typing...',
  typingTwo: '{user1} and {user2} are typing...',
  unavailable: 'Unavailable', undecryptable: 'Unable to decrypt message',
  unencrypted: 'Unencrypted', unignoreUser: 'Unignore User',
  uploadFile: 'Upload File', videoCall: 'Video Call', voiceCall: 'Voice Call',
};

function addMatrixChat(filePath) {
  let content = readFileSync(filePath, 'utf8');

  // Build the matrixChat section
  let section = '\n  matrixChat: {\n';
  for (const [k, v] of Object.entries(matrixChatKeys)) {
    section += `    ${k}: '${v.replace(/'/g, "\\'")}',\n`;
  }
  section += '  },\n';

  // Insert before the final closing brace
  const lastBrace = content.lastIndexOf('}');
  content = content.slice(0, lastBrace) + section + content.slice(lastBrace);

  writeFileSync(filePath, content);
  console.log(`Added matrixChat section (${Object.keys(matrixChatKeys).length} keys) to ${filePath}`);
}

const enPath = '/Volumes/nvme2230/lab/ncwk/upstream/hermes-studio/packages/client/src/i18n/locales/en.ts';
addMatrixChat(enPath);
