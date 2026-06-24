// overlay/scripts/add-i18n-keys.mjs — add missing i18n keys to locale files
import { readFileSync, writeFileSync } from 'fs';

function addKeys(filePath) {
  let content = readFileSync(filePath, 'utf8');

  // 1. Matrix chat keys (extend existing matrix section)
  content = content.replace(
    "historyLoadError: 'Server error, unable to load earlier history',",
    `historyLoadError: 'Server error, unable to load earlier history',
    stateRoomCreated: 'Room created',
    bold: 'Bold',
    italic: 'Italic',
    code: 'Code',
    codeBlock: 'Code block',
    emoji: 'Emoji',
    uploadFile: 'Upload file',
    sendMessage: 'Send message',
    searchRooms: 'Search rooms',
    stateJoined: 'Joined',
    stateInvited: 'Invited',
    stateLoadingOlder: 'Loading older messages...',
    stateNoMoreHistory: 'No more history',`
  );

  // 2. Common keys
  content = content.replace(
    "cancel: 'Cancel',",
    `cancel: 'Cancel',
    search: 'Search',
    refresh: 'Refresh',
    open: 'Open',`
  );

  // 3. Kanban top-level keys
  content = content.replace(
    "diagnostics: 'Diagnostics',",
    `diagnostics: 'Diagnostics',
    searchPlaceholder: 'Search tasks...',
    tenant: 'Tenant',
    allTenants: 'All Tenants',
    assignee: 'Assignee',
    showArchived: 'Show Archived',
    lanesByProfile: 'Lanes by Profile',
    confirmDone: 'Mark this task as done?',
    confirmArchive: 'Archive this task?',
    confirmBlocked: 'Mark this task as blocked?',
    completionSummary: 'Completion Summary',
    tasksNeedAttention: 'Tasks Need Attention',
    untitled: 'Untitled',
    unassigned: 'Unassigned',
    maximizeDrawer: 'Maximize Drawer',
    clickToEdit: 'Click to edit',
    clickToEditAssignee: 'Click to edit assignee',
    workspace: 'Workspace',
    createdBy: 'Created by',
    description: 'Description',
    dependencies: 'Dependencies',
    parents: 'Parents',
    none: 'None',
    children: 'Children',
    events: 'Events',
    workerLog: 'Worker Log',
    loadingLog: 'Loading log...',
    runHistory: 'Run History',
    comments: 'Comments',
    addComment: 'Add comment',
    parent: 'Parent',
    child: 'Child',
    comment: 'Comment',
    attachments: 'Attachments',
    uploadFile: 'Upload file',
    noAttachments: 'No attachments',
    notifyHomeChannels: 'Notify Home Channels',
    sendNotifications: 'Send Notifications',
    reassignTo: 'Reassign to',`
  );

  // 4. Kanban orchestration subsection
  content = content.replace(
    'action: {\n      loadDiagnostics:',
    `orchestration: {
      manualTitle: 'Manual Orchestration',
      expandTitle: 'Expand Orchestration',
      mode: 'Mode',
      manual: 'Manual',
      settings: 'Settings',
    },
    action: {
      nudgeDispatcher: 'Nudge Dispatcher',
      loadDiagnostics:`
  );

  // 5. Kanban trash + columnSubtitles
  content = content.replace(
    'columns: {\n      triage:',
    `trash: { dropHere: 'Drop here to archive' },
    columnSubtitles: {
      triage: 'Needs triage',
      todo: 'Todo items',
      scheduled: 'Scheduled tasks',
      ready: 'Ready to run',
      running: 'Currently running',
      blocked: 'Blocked tasks',
      done: 'Completed tasks',
      archived: 'Archived tasks',
    },
    columns: {\n      triage:`
  );

  // 6. Archive in action
  content = content.replace(
    "loadDiagnostics: 'Load Diagnostics',",
    `loadDiagnostics: 'Load Diagnostics',
      archive: 'Archive',`
  );

  writeFileSync(filePath, content);
  console.log(`Updated: ${filePath}`);
}

const enPath = '/Volumes/nvme2230/lab/ncwk/upstream/hermes-studio/packages/client/src/i18n/locales/en.ts';
addKeys(enPath);
