import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getNotificationSender, getNotificationTargetUrl, formatNotificationBody } from '../../utils/notificationHelpers';
import { NotificationAvatar } from '../common/NotificationAvatar';
import {
  Bell,
  ArrowLeft,
  Tag,
  Layers,
  FileText,
  X,
  Link2,
  Filter,
  Trash2,
  Pencil,
  Save,
  Paperclip,
  Plus,
  PlusCircle,
  CheckCircle2,
  Users,
  Clock3,
  RefreshCw,
  RotateCcw,
  Star,
} from 'lucide-react';
import type { AdminTask, User, Brand, TaskCategory, TaskList, TaskEvent } from '../../types';
import { avatarUrl } from './taskUtils';
import {
  TaskAttachmentPanel,
  type AttachmentUploadState,
  type TaskAttachment,
} from './TaskAttachmentPanel';
import {
  fetchTaskTrello,
  updateTaskList,
  deleteTaskList,
  createTaskList,
  createTaskCard,
  deleteTaskCard,
  updateTaskCard,
  createCardSubItem,
  createCardAttachment,
  deleteCardAttachment,
  updateCardAttachment,
  deleteTaskSubItem,
  createSubItemVerification,
  uploadFile,
  fetchTaskEvents,
  fetchTrashTaskLists,
  restoreTaskList,
  markNotificationRead,
  fetchDailyTaskLists,
} from '../../services/adminApi';
import { getTaskNotificationRefreshKey } from './taskNotificationRefresh';

const isValidUUID = (id: string): boolean => {
  if (!id) return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

const BOARD_ACTIVITY_LABELS: Record<string, string> = {
  board_created: 'สร้างบอร์ด',
  board_deleted: 'ลบบอร์ด',
  board_updated: 'แก้ไขบอร์ด',
  board_name_changed: 'เปลี่ยนชื่อบอร์ด',
  board_description_changed: 'แก้ไขรายละเอียด',
  board_start_date_changed: 'เปลี่ยนวันเริ่มต้น',
  board_due_date_changed: 'เปลี่ยนกำหนดส่ง',
  board_priority_changed: 'เปลี่ยนความสำคัญ',
  board_status_changed: 'เปลี่ยนสถานะ',
  board_revision_requested: 'ส่งแก้ไขงาน',
  board_note_changed: 'แก้ไขหมายเหตุ',
  board_attachment_added: 'เพิ่มเอกสาร',
  board_attachment_removed: 'ลบเอกสาร',
  board_assignees_added: 'เพิ่มผู้รับผิดชอบ',
  board_assignees_removed: 'นำผู้รับผิดชอบออก',
  board_order_changed: 'เปลี่ยนลำดับบอร์ด',
  card_created: 'สร้างการ์ดงาน',
  card_updated: 'แก้ไขการ์ดงาน',
  card_status_changed: 'เปลี่ยนสถานะการ์ด',
  card_moved: 'ย้ายการ์ดงาน',
  card_deleted: 'ลบการ์ดงาน',
  sub_item_created: 'เพิ่มงานย่อย',
  sub_item_updated: 'แก้ไขงานย่อย',
  sub_item_status_changed: 'เปลี่ยนสถานะงานย่อย',
  sub_item_verified: 'ตรวจงานย่อย',
  sub_item_deleted: 'ลบงานย่อย',
  attachment_created: 'เพิ่มไฟล์แนบ',
  attachment_deleted: 'ลบไฟล์แนบ',
  comment_added: 'แสดงความคิดเห็น',
};

const getBoardActivityLabel = (action?: string): string => {
  if (!action) return 'กิจกรรมบอร์ด';
  return BOARD_ACTIVITY_LABELS[action] || 'กิจกรรมบอร์ด';
};

const SUB_TASK_STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  waiting: {
    label: 'รอรับ',
    bg: 'bg-sky-50',
    text: 'text-sky-700',
    border: 'border-sky-200'
  },
  pending: {
    label: 'รอทำ',
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    border: 'border-slate-300'
  },
  in_progress: {
    label: 'กำลังทำ',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200'
  },
  in_review: {
    label: 'รอตรวจ',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200'
  },
  revision: {
    label: 'แก้ไข',
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200'
  },
  completed: {
    label: 'เสร็จสิ้น',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200'
  }
};


import type { AppNotification } from '../../services/adminApi';

interface TaskProjectTimelineSheetProps {
  task: AdminTask;
  tasks?: AdminTask[];
  userMap: Record<string, User>;
  brandMap: Record<string, Brand>;
  categoryMap: Record<string, TaskCategory>;
  onRefreshTask: (silent?: boolean) => void;
  currentUser: User | null;
  notifications?: AppNotification[];
  setNotifications?: React.Dispatch<React.SetStateAction<AppNotification[]>>;
}

export const TaskProjectTimelineSheet: React.FC<TaskProjectTimelineSheetProps> = ({
  task,
  tasks = [],
  userMap,
  brandMap,
  categoryMap,
  onRefreshTask,
  currentUser: _currentUser,
  notifications = [],
  setNotifications,
}) => {
  const navigate = useNavigate();
  const [trelloLists, setTrelloLists] = useState<TaskList[]>([]);

  const allTasksMap = useMemo(() => {
    return Object.fromEntries(tasks.map((t) => [t.id, t]));
  }, [tasks]);

  // Candidate assignees for subtasks/lists/cards are strictly limited to
  // members assigned to this parent project/task (unless viewing the aggregated daily board).
  const projectAssigneeIds = useMemo(() => {
    if (task.id === 'daily') {
      return Object.keys(userMap);
    }
    const ids = new Set<string>();
    if (task.assignee_ids && task.assignee_ids.length > 0) {
      task.assignee_ids.forEach((id) => ids.add(id));
    }
    if (task.assigned_to) {
      ids.add(task.assigned_to);
    }
    if (task.assigned_by) {
      ids.add(task.assigned_by);
    }
    return Array.from(ids);
  }, [task.id, task.assignee_ids, task.assigned_by, task.assigned_to, userMap]);

  const projectMemberUsers = useMemo(() => {
    if (task.id === 'daily') {
      return Object.values(userMap).filter((u) => u.status === 'active');
    }
    return projectAssigneeIds
      .map((id) => userMap[id])
      .filter((u): u is User => Boolean(u && u.status === 'active'));
  }, [task.id, projectAssigneeIds, userMap]);
  const canSubmitRevision = Boolean(
    _currentUser &&
      (_currentUser.role === 'admin' || projectAssigneeIds.includes(_currentUser.id)),
  );
  const hasUnreadMainTaskNotif = notifications.some(n => {
    if (n.is_read) return false;
    let tId: string | null = null;
    if (n.metadata) {
      let meta = n.metadata;
      if (typeof meta === 'string') {
        try {
          meta = JSON.parse(meta);
        } catch {}
      }
      if (meta && typeof meta === 'object') {
        tId = meta.task_id || null;
      }
    }
    return task.id === 'daily' ? true : tId === task.id;
  });
  const taskNotificationRefreshKey = useMemo(
    () => getTaskNotificationRefreshKey(notifications, task.id),
    [notifications, task.id],
  );
  const [loading, setLoading] = useState(true);
  const [drawerAssignees, setDrawerAssignees] = useState<string[]>([]);
  const [showCreateListModal, setShowCreateListModal] = useState(false);
  const [showDrawerInvitePopover, setShowDrawerInvitePopover] = useState(false);
  const [drawerActiveTab, setDrawerActiveTab] = useState<'info' | 'attachments'>('info');

  // Custom premium modal states
  const [activeModal, setActiveModal] = useState<'add_card' | 'attach_file' | 'attach_link' | 'edit_link' | 'verify_subitem' | null>(null);
  const [modalTitle, setModalTitle] = useState('');
  const [modalInputVal1, setModalInputVal1] = useState('');
  const [modalInputVal2, setModalInputVal2] = useState('');
  const [modalSelectVal, setModalSelectVal] = useState<'pass' | 'fail'>('pass');
  const [isModalSubmitting, setIsModalSubmitting] = useState(false);
  const [modalTargetId, setModalTargetId] = useState<string | null>(null);
  const [modalScope, setModalScope] = useState<'list' | 'card'>('card');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [customAlert, setCustomAlert] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [activityList, setActivityList] = useState<TaskList | null>(null);
  const [activityEvents, setActivityEvents] = useState<TaskEvent[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [mainTaskNotifModalOpen, setMainTaskNotifModalOpen] = useState(false);
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [revisionReasonInput, setRevisionReasonInput] = useState('');
  const [isSubmittingRevision, setIsSubmittingRevision] = useState(false);

  const handleOpenMainTaskNotif = async () => {
    setMainTaskNotifModalOpen(true);
    // Find all unread notifications matching this main task ID
    const unreadMatching = notifications.filter(n => {
      if (n.is_read) return false;
      let tId: string | null = null;
      if (n.metadata) {
        let meta = n.metadata;
        if (typeof meta === 'string') {
          try {
            meta = JSON.parse(meta);
          } catch {}
        }
        if (meta && typeof meta === 'object') {
          tId = meta.task_id || null;
        }
      }
      return task.id === 'daily' ? true : tId === task.id;
    });

    if (unreadMatching.length > 0 && setNotifications) {
      // Mark them as read locally in state immediately
      setNotifications(prev =>
        prev.map(n => unreadMatching.some(m => m.id === n.id) ? { ...n, is_read: true } : n)
      );

      // Call API in background to mark them as read in DB
      for (const n of unreadMatching) {
        try {
          await markNotificationRead(n.id);
        } catch {}
      }
    }
  };

  const handleProjectNotifClick = async (notif: AppNotification) => {
    if (!notif.is_read) {
      try {
        await markNotificationRead(notif.id);
        if (setNotifications) {
          setNotifications(prev =>
            prev.map(n => (n.id === notif.id ? { ...n, is_read: true } : n))
          );
        }
      } catch (err) {
        console.error('Failed to mark read:', err);
      }
    }
    setMainTaskNotifModalOpen(false);

    let meta: Record<string, any> | null = null;
    if (notif.metadata) {
      if (typeof notif.metadata === 'string') {
        try { meta = JSON.parse(notif.metadata); } catch {}
      } else if (typeof notif.metadata === 'object') {
        meta = notif.metadata;
      }
    }

    if (meta?.task_id === task.id && meta?.list_id) {
      const lists = trelloLists.length > 0 ? trelloLists : (task.lists || []);
      const matched = lists.find(l => l.id === meta.list_id);
      if (matched) {
        openDrawerForList(matched);
        return;
      }
    }

    const targetUrl = getNotificationTargetUrl(notif);
    navigate(targetUrl);
  };


  const showCustomAlert = (message: string, type: 'success' | 'error' = 'success') => {
    setCustomAlert({ message, type });
  };

  const openActivityLog = async (list: TaskList) => {
    setActivityList(list);
    setActivityEvents([]);
    setActivityLoading(true);
    try {
      const parentTaskId = list.task_id || task.id;
      const events = await fetchTaskEvents(parentTaskId, { listId: list.id });
      setActivityEvents(events);
    } catch (error) {
      console.error('Failed to load board activity:', error);
    } finally {
      setActivityLoading(false);
    }
  };
  const [editingCardSubView, setEditingCardSubView] = useState<any | null>(null);
  
  // Card edit states
  const [cardDescInput, setCardDescInput] = useState('');
  const [cardDueDateInput, setCardDueDateInput] = useState('');
  const [cardPriorityInput, setCardPriorityInput] = useState<'low' | 'medium' | 'high'>('medium');
  const [cardAssigneesInput, setCardAssigneesInput] = useState<string[]>([]);
  const [cardAdminCommentInput, setCardAdminCommentInput] = useState('');
  const [cardAttachmentsInput, setCardAttachmentsInput] = useState<any[]>([]);
  const [cardSubItemsInput, setCardSubItemsInput] = useState<any[]>([]);
  const [showCardAssigneePopover, setShowCardAssigneePopover] = useState(false);
  const [newSubItemTitle, setNewSubItemTitle] = useState('');
  const [isSavingCard, setIsSavingCard] = useState(false);


  const [viewingAttachmentsList, setViewingAttachmentsList] = useState<TaskList | null>(null);
  
  // Drawer editing state
  const [editingList, setEditingList] = useState<TaskList | null>(null);
  const [drawerTitle, setDrawerTitle] = useState('');
  const [drawerAdminComment, setDrawerAdminComment] = useState('');
  const [drawerAttachments, setDrawerAttachments] = useState<TaskAttachment[]>([]);
  const [drawerUploadState, setDrawerUploadState] = useState<AttachmentUploadState>({
    uploadingCount: 0,
    failedCount: 0,
  });
  const [drawerDueDate, setDrawerDueDate] = useState('');
  const [drawerPriority, setDrawerPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [drawerStatus, setDrawerStatus] = useState<'waiting' | 'pending' | 'in_progress' | 'in_review' | 'completed' | 'revision'>('waiting');
  const [drawerComment, setDrawerComment] = useState('');
  const [isSavingDrawer, setIsSavingDrawer] = useState(false);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);


  // Create List Modal State
  const [createListName, setCreateListName] = useState('');
  const [createListDueDate, setCreateListDueDate] = useState('');
  const [createListPriority, setCreateListPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [createListStatus, setCreateListStatus] = useState<'waiting' | 'pending' | 'in_progress' | 'in_review' | 'completed' | 'revision'>('waiting');
  const [createListFirstCardName, setCreateListFirstCardName] = useState('');
  const [createListAssigneeIds, setCreateListAssigneeIds] = useState<string[]>([]);

  const [createListDescription, setCreateListDescription] = useState('');
  const [showInvitePopover, setShowInvitePopover] = useState(false);
  const [isCreatingList, setIsCreatingList] = useState(false);

  // Filter Toolbar State
  type FilterMode = 'all' | 'pending' | 'overdue' | 'high_priority' | 'completed' | 'trash';
  const [activeFilter, setActiveFilter] = useState<FilterMode>('all');
  const [trashLists, setTrashLists] = useState<TaskList[]>([]);

  // Reusable Confirmation Modal
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    confirmText?: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    description: '',
    onConfirm: () => {},
  });

  const todayStr = new Date().toISOString().split('T')[0];

  const getRemainingDays = (deletedAtStr?: string) => {
    if (!deletedAtStr) return 30;
    const deletedAt = new Date(deletedAtStr);
    const diffTime = Math.abs(new Date().getTime() - deletedAt.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const remaining = 30 - diffDays;
    return remaining < 0 ? 0 : remaining;
  };

  const loadSubItems = async () => {
    try {
      if (activeFilter === 'trash') {
        const lists = await fetchTrashTaskLists(task.id).catch(() => []);
        setTrashLists(lists);
      } else {
        const lists = await (task.id === 'daily' ? fetchDailyTaskLists() : fetchTaskTrello(task.id)).catch(() => []);
        setTrelloLists(lists);
      }
    } catch (err) {
      console.error('Failed to load trello lists', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubItems();
  }, [task.id, activeFilter, taskNotificationRefreshKey]);

  const handleToggleListStatus = async (list: TaskList, currentStatus?: string) => {
    const newStatus = currentStatus === 'completed' ? 'in_progress' : 'completed';
    
    // 1. Optimistic Update for instant real-time response
    setTrelloLists(prevLists => 
      prevLists.map(l => l.id === list.id ? { ...l, status: newStatus } : l)
    );

    // 2. Network sync in background
    try {
      await updateTaskList(list.id, { status: newStatus });
      // Remove loadSubItems() call to prevent database write-delay from flashing/reverting the UI state
      onRefreshTask(true);
    } catch (err) {
      console.error('Failed to toggle status', err);
      // Revert if API call fails
      setTrelloLists(prevLists => 
        prevLists.map(l => l.id === list.id ? { ...l, status: currentStatus as any } : l)
      );
      showCustomAlert('อัปเดตสถานะบอร์ดงานล้มเหลว', 'error');
    }
  };

  const handleOpenCardSubView = (card: any) => {
    setEditingCardSubView(card);
    setCardDescInput(card.description || '');
    setCardDueDateInput(card.due_date ? card.due_date.split('T')[0] : '');
    setCardPriorityInput(card.priority || 'medium');
    setCardAssigneesInput(card.assignee_ids || []);
    setCardAdminCommentInput(card.admin_comment || '');
    setCardAttachmentsInput(card.attachments || []);
    setCardSubItemsInput(card.sub_items || []);
    setShowCardAssigneePopover(false);
    setNewSubItemTitle('');
  };

  const handleSaveCardSubView = async () => {
    if (!editingCardSubView) return;
    setIsSavingCard(true);
    try {
      await updateTaskCard(editingCardSubView.id, {
        title: editingCardSubView.title,
        description: cardDescInput,
        due_date: cardDueDateInput || undefined,
        priority: cardPriorityInput,
        assignee_ids: cardAssigneesInput,
        admin_comment: cardAdminCommentInput || undefined,
      });

      const updatedLists = await (task.id === 'daily' ? fetchDailyTaskLists() : fetchTaskTrello(task.id)).catch(() => []);
      setTrelloLists(updatedLists);
      
      const updatedList = updatedLists.find(l => l.id === editingList?.id);
      if (updatedList) {
        setEditingList(updatedList);
        const updatedCard = updatedList.cards?.find(c => c.id === editingCardSubView.id);
        if (updatedCard) {
          setEditingCardSubView(updatedCard);
          setCardSubItemsInput(updatedCard.sub_items || []);
          setCardAttachmentsInput(updatedCard.attachments || []);
        }
      }
      onRefreshTask(true);
      showCustomAlert('บันทึกข้อมูลการ์ดงานสำเร็จ', 'success');
    } catch (err) {
      console.error('Failed to save card', err);
      showCustomAlert('บันทึกการ์ดงานล้มเหลว', 'error');
    } finally {
      setIsSavingCard(false);
    }
  };

  const handleAddCardSubItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubItemTitle.trim() || !editingCardSubView) return;
    try {
      await createCardSubItem(editingCardSubView.id, newSubItemTitle.trim());
      setNewSubItemTitle('');
      const updatedLists = await (task.id === 'daily' ? fetchDailyTaskLists() : fetchTaskTrello(task.id)).catch(() => []);
      setTrelloLists(updatedLists);
      const updatedList = updatedLists.find(l => l.id === editingList?.id);
      if (updatedList) {
        setEditingList(updatedList);
        const updatedCard = updatedList.cards?.find(c => c.id === editingCardSubView.id);
        if (updatedCard) setCardSubItemsInput(updatedCard.sub_items || []);
      }
      onRefreshTask(true);
    } catch (err) {
      console.error('Failed to add sub item', err);
    }
  };

  const handleDeleteCardSubItem = async (itemId: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'ลบรายการย่อย?',
      description: 'คุณต้องการลบรายการย่อยนี้ใช่หรือไม่? ข้อมูลนี้จะถูกลบอย่างถาวรและไม่สามารถกู้คืนกลับมาได้อีก',
      confirmText: 'ลบรายการย่อย',
      onConfirm: async () => {
        try {
          await deleteTaskSubItem(itemId);
          const updatedLists = await (task.id === 'daily' ? fetchDailyTaskLists() : fetchTaskTrello(task.id)).catch(() => []);
          setTrelloLists(updatedLists);
          const updatedList = updatedLists.find(l => l.id === editingList?.id);
          if (updatedList) {
            setEditingList(updatedList);
            const updatedCard = updatedList.cards?.find(c => c.id === editingCardSubView.id);
            if (updatedCard) setCardSubItemsInput(updatedCard.sub_items || []);
          }
          onRefreshTask(true);
        } catch (err) {
          console.error('Failed to delete sub item', err);
        }
      }
    });
  };

  const handleVerifySubItem = (itemId: string) => {
    setModalTitle('ผลการตรวจสอบงานย่อย');
    setModalSelectVal('pass');
    setModalInputVal1('');
    setModalTargetId(itemId);
    setActiveModal('verify_subitem');
  };

  const submitVerifySubItem = async () => {
    if (!modalTargetId || !editingCardSubView) return;
    setIsModalSubmitting(true);
    try {
      await createSubItemVerification(modalTargetId, {
        status: modalSelectVal,
        verification_notes: modalInputVal1.trim(),
      });
      const updatedLists = await (task.id === 'daily' ? fetchDailyTaskLists() : fetchTaskTrello(task.id)).catch(() => []);
      setTrelloLists(updatedLists);
      const updatedList = updatedLists.find(l => l.id === editingList?.id);
      if (updatedList) {
        setEditingList(updatedList);
        const updatedCard = updatedList.cards?.find(c => c.id === editingCardSubView.id);
        if (updatedCard) setCardSubItemsInput(updatedCard.sub_items || []);
      }
      setActiveModal(null);
      onRefreshTask(true);
    } catch (err) {
      console.error('Failed to verify sub item', err);
    } finally {
      setIsModalSubmitting(false);
    }
  };

  const handleAddCardAttachment = (type: 'file' | 'link') => {
    if (!editingCardSubView) return;
    setModalScope('card');
    if (type === 'file') {
      fileInputRef.current?.click();
    } else {
      setModalTitle('แนบลิงก์ภายนอก');
      setModalInputVal1('');
      setModalInputVal2('');
      setActiveModal('attach_link');
    }
  };

  const submitAddCardAttachmentLink = async () => {
    if (!modalInputVal1.trim()) return;
    setIsModalSubmitting(true);
    try {
      if (modalScope === 'list') {
        setDrawerAttachments([
          ...drawerAttachments,
          {
            name: modalInputVal2.trim() || modalInputVal1.trim(),
            url: modalInputVal1.trim(),
            type: 'link',
          },
        ]);
        setActiveModal(null);
      } else {
        if (!editingCardSubView) return;
        await createCardAttachment(editingCardSubView.id, {
          name: modalInputVal2.trim() || modalInputVal1.trim(),
          url: modalInputVal1.trim(),
          type: 'link',
        });
        const updatedLists = await (task.id === 'daily' ? fetchDailyTaskLists() : fetchTaskTrello(task.id)).catch(() => []);
        setTrelloLists(updatedLists);
        const updatedList = updatedLists.find(l => l.id === editingList?.id);
        if (updatedList) {
          setEditingList(updatedList);
          const updatedCard = updatedList.cards?.find(c => c.id === editingCardSubView.id);
          if (updatedCard) setCardAttachmentsInput(updatedCard.attachments || []);
        }
        setActiveModal(null);
        onRefreshTask(true);
      }
    } catch (err) {
      console.error('Failed to add attachment link', err);
    } finally {
      setIsModalSubmitting(false);
    }
  };

  const handleDeleteCardAttachment = async (attId: string) => {
    if (modalScope === 'list') {
      const idx = parseInt(attId, 10);
      if (!isNaN(idx)) {
        setDrawerAttachments((prev) => prev.filter((_, i) => i !== idx));
      }
      setActiveModal(null);
    } else {
      if (!confirm('ต้องการลบไฟล์แนบนี้ใช่หรือไม่?')) return;
      try {
        await deleteCardAttachment(attId);
        const updatedLists = await (task.id === 'daily' ? fetchDailyTaskLists() : fetchTaskTrello(task.id)).catch(() => []);
        setTrelloLists(updatedLists);
        const updatedList = updatedLists.find(l => l.id === editingList?.id);
        if (updatedList) {
          setEditingList(updatedList);
          const updatedCard = updatedList.cards?.find(c => c.id === editingCardSubView.id);
          if (updatedCard) setCardAttachmentsInput(updatedCard.attachments || []);
        }
        setActiveModal(null);
        onRefreshTask(true);
      } catch (err) {
        console.error('Failed to delete attachment', err);
      }
    }
  };

  const submitUpdateCardAttachment = async () => {
    if (!modalTargetId || !modalInputVal1.trim()) return;
    const name = modalInputVal2.trim() || modalInputVal1.trim();
    const url = modalInputVal1.trim();

    if (modalScope === 'list') {
      const idx = parseInt(modalTargetId, 10);
      if (!isNaN(idx)) {
        setDrawerAttachments((prev) =>
          prev.map((att, i) => (i === idx ? { ...att, name, url } : att))
        );
      }
      setActiveModal(null);
    } else {
      setIsModalSubmitting(true);
      try {
        await updateCardAttachment(modalTargetId, { name, url });

        const updatedLists = await (task.id === 'daily' ? fetchDailyTaskLists() : fetchTaskTrello(task.id)).catch(() => []);
        setTrelloLists(updatedLists);
        const updatedList = updatedLists.find(l => l.id === editingList?.id);
        if (updatedList) {
          setEditingList(updatedList);
          const updatedCard = updatedList.cards?.find(c => c.id === editingCardSubView.id);
          if (updatedCard) setCardAttachmentsInput(updatedCard.attachments || []);
        }
        setActiveModal(null);
        onRefreshTask(true);
      } catch (err) {
        console.error('Failed to update attachment', err);
      } finally {
        setIsModalSubmitting(false);
      }
    }
  };

  const handleDeleteCard = async (cardId: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'ลบการ์ดงานหลัก?',
      description: 'คุณต้องการลบการ์ดงานหลักนี้ใช่หรือไม่? รายการย่อย ไฟล์หลักฐานทั้งหมดในการ์ดนี้จะถูกลบออกอย่างถาวรทันที',
      confirmText: 'ลบการ์ดงาน',
      onConfirm: async () => {
        try {
          await deleteTaskCard(cardId);
          const updatedLists = await (task.id === 'daily' ? fetchDailyTaskLists() : fetchTaskTrello(task.id)).catch(() => []);
          setTrelloLists(updatedLists);
          if (editingList) {
            const updatedList = updatedLists.find(l => l.id === editingList.id);
            if (updatedList) setEditingList(updatedList);
          }
          onRefreshTask(true);
        } catch (err) {
          console.error('Failed to delete card', err);
        }
      }
    });
  };

    const handleDirectFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const res = await uploadFile(file);
      if (res.ok && res.url) {
        const name = file.name;
        if (modalScope === 'list') {
          setDrawerAttachments(prev => [...prev, { name, url: res.url, type: 'file' }]);
          showCustomAlert('อัปโหลดไฟล์สำเร็จ', 'success');
        } else {
          if (editingCardSubView) {
            await createCardAttachment(editingCardSubView.id, { name, url: res.url, type: 'file' });
            const updatedLists = await (task.id === 'daily' ? fetchDailyTaskLists() : fetchTaskTrello(task.id)).catch(() => []);
            setTrelloLists(updatedLists);
            const updatedList = updatedLists.find(l => l.id === editingList?.id);
            if (updatedList) {
              setEditingList(updatedList);
              const updatedCard = updatedList.cards?.find(c => c.id === editingCardSubView.id);
              if (updatedCard) setCardAttachmentsInput(updatedCard.attachments || []);
            }
            onRefreshTask(true);
            showCustomAlert('อัปโหลดไฟล์แนบในการ์ดสำเร็จ', 'success');
          }
        }
      } else {
        showCustomAlert('อัปโหลดไฟล์ล้มเหลว', 'error');
      }
    } catch (err) {
      console.error(err);
      showCustomAlert('อัปโหลดไฟล์ล้มเหลว', 'error');
    } finally {
      e.target.value = '';
    }
  };

  const handleAddNewCardClick = () => {
    setModalTitle('เพิ่มการ์ดงานย่อยใหม่');
    setModalInputVal1('');
    setActiveModal('add_card');
  };

  const submitAddNewCard = async () => {
    if (!modalInputVal1.trim() || !editingList) return;
    setIsModalSubmitting(true);
    try {
      const newCard = await createTaskCard(editingList.id, {
        title: modalInputVal1.trim(),
        priority: 'medium',
      });
      const updatedLists = await (task.id === 'daily' ? fetchDailyTaskLists() : fetchTaskTrello(task.id)).catch(() => []);
      setTrelloLists(updatedLists);
      const updatedList = updatedLists.find(l => l.id === editingList.id);
      if (updatedList) setEditingList(updatedList);
      
      setActiveModal(null);
      handleOpenCardSubView(newCard);
      onRefreshTask(true);
    } catch (err) {
      console.error('Failed to create card', err);
    } finally {
      setIsModalSubmitting(false);
    }
  };

  const handleSaveDrawer = async () => {
    if (!editingList) return;
    if (drawerUploadState.uploadingCount > 0) {
      showCustomAlert('กรุณารอให้อัปโหลดไฟล์เสร็จก่อนบันทึก', 'error');
      return;
    }
    if (drawerUploadState.failedCount > 0) {
      showCustomAlert('มีไฟล์อัปโหลดไม่สำเร็จ กรุณาลองใหม่หรือนำไฟล์นั้นออกก่อนบันทึก', 'error');
      return;
    }
    setIsSavingDrawer(true);
    try {
      await updateTaskList(editingList.id, {
        name: drawerTitle,
        due_date: drawerDueDate || undefined,
        priority: drawerPriority,
        status: drawerStatus,
        description: drawerComment,
        assignee_ids: drawerAssignees,
        admin_comment: drawerAdminComment,
        attachments: drawerAttachments,
      });
      setEditingList(null);
      await loadSubItems();
      onRefreshTask(true);
    } catch (err) {
      console.error('Failed to update list details', err);
    } finally {
      setIsSavingDrawer(false);
    }
  };

  const handleSubmitRevision = async (reason: string) => {
    if (!editingList) return;
    if (drawerUploadState.uploadingCount > 0 || drawerUploadState.failedCount > 0) {
      showCustomAlert('กรุณาจัดการไฟล์ที่กำลังอัปโหลดหรืออัปโหลดไม่สำเร็จก่อนส่งแก้ไข', 'error');
      return;
    }
    setIsSubmittingRevision(true);
    try {
      const finalComment = reason.trim() || drawerAdminComment;
      await updateTaskList(editingList.id, {
        name: drawerTitle,
        due_date: drawerDueDate || undefined,
        priority: drawerPriority,
        status: 'revision',
        description: drawerComment,
        assignee_ids: drawerAssignees,
        admin_comment: finalComment,
        attachments: drawerAttachments,
      });
      setShowRevisionModal(false);
      setEditingList(null);
      await loadSubItems();
      onRefreshTask(true);
      showCustomAlert('ส่งแก้ไขงานย่อยสำเร็จ', 'success');
    } catch (err: any) {
      console.error('Failed to submit revision', err);
      const errMsg = err?.response?.data?.error || err?.message || 'ส่งแก้ไขงานย่อยล้มเหลว';
      showCustomAlert(errMsg, 'error');
    } finally {
      setIsSubmittingRevision(false);
    }
  };

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createListName.trim()) return;
    setIsCreatingList(true);
    try {
      const newList = await createTaskList(task.id, {
        name: createListName.trim(),
        due_date: createListDueDate || undefined,
        priority: createListPriority,
        status: createListStatus,
        description: createListDescription.trim() || undefined,
        assignee_ids: createListAssigneeIds,
      });

      // If they provided a first card name, create it
      if (newList && newList.id && createListFirstCardName.trim()) {
        await createTaskCard(newList.id, {
          title: createListFirstCardName.trim(),
          priority: createListPriority,
        });
      }

      setCreateListName('');
      setCreateListDueDate('');
      setCreateListPriority('medium');
      setCreateListStatus('waiting');
      setCreateListFirstCardName('');
      setCreateListAssigneeIds([]);
      setCreateListDescription('');
      setShowCreateListModal(false);
      setShowInvitePopover(false);
      await loadSubItems();
      onRefreshTask(true);
    } catch (err) {
      console.error('Failed to create task list', err);
    } finally {
      setIsCreatingList(false);
    }
  };

  const handleDeleteList = async (listId: string) => {
    if (!isValidUUID(listId)) {
      setTrelloLists(trelloLists.filter(l => l.id !== listId));
      return;
    }
    setConfirmModal({
      isOpen: true,
      title: 'ย้ายงานย่อยไปถังขยะ?',
      description: 'คุณต้องการย้ายงานย่อยนี้ไปยังถังขยะใช่หรือไม่? การ์ดงานและรายการย่อยทั้งหมดในงานย่อยนี้จะถูกย้ายไปด้วย โดยระบบจะทำการลบออกอย่างถาวรโดยอัตโนมัติเมื่อครบ 30 วัน',
      confirmText: 'ย้ายไปถังขยะ',
      onConfirm: async () => {
        try {
          await deleteTaskList(listId);
          await loadSubItems();
          onRefreshTask(true);
        } catch (err) {
          console.error('Failed to delete list', err);
        }
      }
    });
  };

  const handleOpenExternalUrl = (url: string) => {
    if (!url) return;
    let targetUrl = url.trim();
    if (targetUrl.startsWith('r2://')) {
      targetUrl = targetUrl.replace('r2://', 'https://pub-2a877f7cc07b481ca09dec82cb240465.r2.dev/');
    }
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = 'https://' + targetUrl;
    }
    window.open(targetUrl, '_blank', 'noopener,noreferrer');
  };

  const openDrawerForList = (list: TaskList) => {
    setEditingList(list);
    setDrawerTitle(list.name);
    setDrawerDueDate(list.due_date ? list.due_date.split('T')[0] : '');
    setDrawerPriority(list.priority || 'medium');
    setDrawerStatus(list.status || 'in_progress');
    setDrawerComment(list.description || '');
    setDrawerAssignees(list.assignee_ids || []);
    setDrawerAdminComment(list.admin_comment || '');
    setDrawerAttachments(list.attachments || []);
    setDrawerUploadState({ uploadingCount: 0, failedCount: 0 });
  };

  const [searchParams] = useSearchParams();
  const targetListId = searchParams.get('listId');
  const handledTargetListIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!targetListId || handledTargetListIdRef.current === targetListId) return;
    const lists = trelloLists.length > 0 ? trelloLists : (task.lists || []);
    if (lists.length === 0) return;
    const matched = lists.find((l) => l.id === targetListId);
    if (matched) {
      handledTargetListIdRef.current = targetListId;
      openDrawerForList(matched);
    }
  }, [targetListId, trelloLists, task.lists]);

  const drawerHasUnsavedChanges = (): boolean => {
    if (!editingList) return false;
    if (drawerTitle !== editingList.name) return true;
    if (drawerComment !== (editingList.description || '')) return true;
    if (drawerAdminComment !== (editingList.admin_comment || '')) return true;
    if (drawerDueDate !== (editingList.due_date ? editingList.due_date.split('T')[0] : '')) return true;
    if (drawerPriority !== (editingList.priority || 'medium')) return true;
    if (drawerStatus !== (editingList.status || 'in_progress')) return true;
    const origAssignees = (editingList.assignee_ids || []).slice().sort().join(',');
    const currAssignees = drawerAssignees.slice().sort().join(',');
    if (origAssignees !== currAssignees) return true;
    const origAtt = JSON.stringify(editingList.attachments || []);
    const currAtt = JSON.stringify(drawerAttachments);
    if (origAtt !== currAtt) return true;
    if (drawerUploadState.uploadingCount > 0 || drawerUploadState.failedCount > 0) return true;
    return false;
  };

  const handleCloseDrawer = () => {
    if (drawerUploadState.uploadingCount > 0) {
      showCustomAlert('กำลังอัปโหลดไฟล์ กรุณารอให้อัปโหลดเสร็จก่อนปิดหน้าต่าง', 'error');
      return;
    }
    if (drawerHasUnsavedChanges()) {
      setShowUnsavedModal(true);
    } else {
      setEditingList(null);
    }
  };

  const brand = brandMap[task.brand_id || ''];
  const category = categoryMap[task.category_id || ''];

  const displayLists = trelloLists.length > 0 ? trelloLists : (task.lists || []);

  const fallbackLists: TaskList[] = [];

  const effectiveLists = displayLists.length > 0 ? displayLists : fallbackLists;

  const filteredLists = activeFilter === 'trash' ? trashLists : effectiveLists.filter((list) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'completed') return list.status === 'completed';
    if (activeFilter === 'pending') return list.status !== 'completed';
    if (activeFilter === 'high_priority') return list.priority === 'high';
    if (activeFilter === 'overdue') {
      if (list.status === 'completed') return false;
      return list.due_date ? list.due_date.split('T')[0] < todayStr : false;
    }
    return true;
  });

  const sortedLists = [...filteredLists].sort((a, b) => {
    const aDue = a.due_date && !a.due_date.startsWith('0001-01-01') ? new Date(a.due_date).getTime() : Infinity;
    const bDue = b.due_date && !b.due_date.startsWith('0001-01-01') ? new Date(b.due_date).getTime() : Infinity;

    if (aDue !== bDue) {
      return aDue - bDue;
    }

    if (a.sort_order !== b.sort_order) {
      return a.sort_order - b.sort_order;
    }

    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bTime - aTime;
  });

  // Notes are optional and usually empty. Keep the main timeline compact until
  // at least one row actually contains a note.
  const showNoteColumn = sortedLists.some((list) => Boolean(list.admin_comment?.trim()));

  const renderedRows = sortedLists.map((list: TaskList) => {
    const listPriority = list.priority || 'medium';
    const listStatus = list.status || 'in_progress';
    const listDetails = list.description || '';
    const listNote = list.admin_comment || '';

    // Relative due date calculation for sub-tasks (งานย่อย)
    const isCompletedList = listStatus === 'completed';
    const isInReviewList = listStatus === 'in_review';
    const hasDueDate = !!list.due_date && !list.due_date.startsWith('0001-01-01');
    let dueBadge = null;

    if (hasDueDate && list.due_date) {
      const listDueDateStr = list.due_date.split('T')[0];
      const isOverdue = !isCompletedList && !isInReviewList && listDueDateStr < todayStr;
      const formattedDate = new Date(list.due_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });

      if (isOverdue) {
        const targetDate = new Date(listDueDateStr);
        const todayDate = new Date(todayStr);
        const diffTime = todayDate.getTime() - targetDate.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 3600 * 24));
        const overdueText = diffDays > 0 ? `เลยกำหนด ${diffDays} วัน` : 'เลยกำหนด';

        dueBadge = (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-red-50 text-red-700 border border-red-200 font-extrabold whitespace-nowrap shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
            <span>{overdueText} ({formattedDate})</span>
          </span>
        );
      } else if (isCompletedList) {
        dueBadge = (
          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold whitespace-nowrap">
            {formattedDate}
          </span>
        );
      } else if (isInReviewList) {
        dueBadge = (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-blue-50 text-blue-700 border border-blue-200 font-bold whitespace-nowrap shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse shrink-0" />
            <span>รอตรวจ ({formattedDate})</span>
          </span>
        );
      } else if (listDueDateStr === todayStr) {
        dueBadge = (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-amber-50 text-amber-800 border border-amber-200 font-bold whitespace-nowrap shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
            <span>วันนี้ ({formattedDate})</span>
          </span>
        );
      } else {
        dueBadge = (
          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-600 border border-slate-200 font-medium whitespace-nowrap">
            {formattedDate}
          </span>
        );
      }
    } else {
      dueBadge = <span className="text-slate-400 font-medium text-[11px]">-</span>;
    }


    return (
      <tr 
        key={list.id} 
        onClick={() => { if (activeFilter === 'trash') return; openDrawerForList(list); }} 
        className={`hover:bg-blue-50/50 hover:border-blue-300 transition-colors border-b border-slate-200 ${activeFilter === 'trash' ? 'cursor-default' : 'cursor-pointer'}`}
      >
        {/* 1. DUE DATE */}
        <td className="px-3 py-3 border-r border-slate-200 text-center align-middle bg-slate-50/70">
          {dueBadge}
        </td>

        {/* 1.5 MAIN TASK (เฉพาะหน้างานรายวันรวม) */}
        {task.id === 'daily' && (
          <td className="px-3 py-3 border-r border-slate-200 align-middle">
            {(() => {
              const parentTask = list.task_id ? allTasksMap[list.task_id] : null;
              const mainTitle = list.task_title || list.project_name || parentTask?.title || '';
              return (
                <span className="font-bold text-slate-800 text-xs leading-snug break-words line-clamp-2" title={mainTitle}>
                  {mainTitle || '-'}
                </span>
              );
            })()}
          </td>
        )}

        {/* 1.8 BRAND (คอลัมน์แบรนด์) */}
        <td className="px-3 py-3 border-r border-slate-200 text-center align-middle">
          {(() => {
            const parentTask = list.task_id ? allTasksMap[list.task_id] : null;
            const brandId = list.brand_id || parentTask?.brand_id || task.brand_id || null;
            const rowBrand = (brandId ? brandMap[brandId] : null) ||
                             (list.brand_name ? { id: brandId || '', name: list.brand_name, sort_order: 0, created_at: '' } : null);
            const brandName = rowBrand?.name || list.brand_name || '';

            if (!brandName) {
              return <span className="text-slate-400 font-medium text-xs">-</span>;
            }

            return (
              <span className="font-semibold text-slate-800 text-xs leading-snug" title={brandName}>
                {brandName}
              </span>
            );
          })()}
        </td>

        {/* 2. รายละเอียดงาน (PROJECT / SUBTASK) */}
        <td className="px-4 py-3 border-r border-slate-200 align-middle">
          <div className="flex items-start gap-2.5">
            <Star className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1 min-w-0">
              <span className="font-bold text-slate-850 text-xs leading-snug break-words" title={list.name}>
                {list.name}
              </span>
            </div>
          </div>
        </td>

        {/* 5. PRIORITY */}
        <td className="px-3 py-2 border-r border-slate-200 text-center align-middle">
          <div className="flex items-center justify-center">
            <span className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full border ${
              listPriority === 'high' || listPriority === 'urgent' ? 'bg-red-50 text-red-800 border-red-200' :
              listPriority === 'medium' ? 'bg-amber-50 text-amber-800 border-amber-200' :
              'bg-emerald-50 text-emerald-800 border-emerald-200'
            }`}>
              {listPriority === 'urgent' ? 'Urgent' : listPriority.charAt(0).toUpperCase() + listPriority.slice(1)}
            </span>
          </div>
        </td>

        {/* 6. DETAILS */}
        <td className="px-4 py-3 border-r border-slate-200 align-middle text-slate-700 text-xs max-w-[250px]">
          <div className="line-clamp-2" title={listDetails}>{listDetails || '-'}</div>
        </td>

        {/* 7. ASSIGNMENT */}
        <td className="px-3 py-2 border-r border-slate-200 text-center align-middle">
          <div className="flex items-center justify-center -space-x-1.5 overflow-hidden">
            {list.assignee_ids && list.assignee_ids.length > 0 ? (
              list.assignee_ids.map((uid) => {
                const u = userMap[uid];
                const dispName = u ? (u.nickname ? `${u.first_name} (${u.nickname})` : u.first_name) : 'พนักงาน';
                const avatar = u?.avatar_url ? avatarUrl(u.avatar_url) : null;
                return avatar ? (
                  <img
                    key={uid}
                    src={avatar}
                    alt={dispName}
                    className="w-6 h-6 rounded-full object-cover border-2 border-white shadow-2xs shrink-0"
                    title={`${dispName}${u?.department ? ` - ${u.department}` : ''}`}
                  />
                ) : (
                  <div
                    key={uid}
                    className="w-6 h-6 rounded-full bg-blue-100 border-2 border-white flex items-center justify-center text-blue-700 font-bold text-[9px] shadow-2xs shrink-0"
                    title={`${dispName}${u?.department ? ` - ${u.department}` : ''}`}
                  >
                    {u?.first_name?.charAt(0) || 'U'}
                  </div>
                );
              })
            ) : (
              <span className="text-slate-400 text-xs italic">-</span>
            )}
          </div>
        </td>

        {/* 6. STATUS */}
        <td className="w-28 min-w-[92px] px-2 py-2 border-r border-slate-200 text-center align-middle">
          {activeFilter === 'trash' ? (
            <span className="inline-flex items-center justify-center whitespace-nowrap px-2 py-0.5 text-[10px] font-bold rounded-full bg-red-50 text-red-750 border border-red-200">
              เหลือ {getRemainingDays(list.deleted_at)} วัน
            </span>
          ) : (
            (() => {
              const statusCfg = SUB_TASK_STATUS_CONFIG[listStatus] || SUB_TASK_STATUS_CONFIG.in_progress;
              return (
                <span className={`inline-flex items-center justify-center gap-1 whitespace-nowrap px-2 py-0.5 text-[10px] font-bold rounded-full border ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}>
                  {listStatus === 'completed' && <CheckCircle2 className="w-3 h-3 shrink-0" />}
                  {statusCfg.label}
                </span>
              );
            })()
          )}
        </td>

        {/* 7. LIST */}
        <td className="px-3 py-2 border-r border-slate-200 text-center align-middle" onClick={(e) => e.stopPropagation()}>
          {activeFilter === 'trash' ? (
            <button
              onClick={async () => {
                try {
                  await restoreTaskList(list.id);
                  showCustomAlert('กู้คืนงานย่อยสำเร็จ', 'success');
                  loadSubItems();
                  onRefreshTask(true);
                } catch (err) {
                  console.error('Failed to restore list', err);
                  showCustomAlert('กู้คืนงานย่อยล้มเหลว', 'error');
                }
              }}
              className="px-2.5 py-1 text-[10px] font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-all cursor-pointer"
            >
              กู้คืน
            </button>
          ) : (
            <input
              type="checkbox"
              checked={listStatus === 'completed'}
              onChange={() => handleToggleListStatus(list, listStatus)}
              className="w-3.5 h-3.5 text-blue-600 rounded cursor-pointer border-slate-300 focus:ring-blue-500/20"
            />
          )}
        </td>

        {/* 8. NOTE / REMARK */}
        {showNoteColumn && (
          <td className="w-40 max-w-[180px] px-3 py-3 border-r border-slate-200 align-middle text-slate-700 text-xs">
            {listNote ? (
              <div className="flex items-start gap-1.5 min-w-0" title={listNote}>
                <FileText className="w-3.5 h-3.5 mt-0.5 shrink-0 text-indigo-500" />
                <span className="line-clamp-2">{listNote}</span>
              </div>
            ) : (
              <span className="text-slate-400">-</span>
            )}
          </td>
        )}

        {/* 9. LINK / FILES */}
        <td className="px-2 py-2 align-middle font-semibold" style={{ minWidth: 80 }} onClick={(e) => e.stopPropagation()}>
          {list.attachments && list.attachments.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 justify-center">
              {list.attachments.slice(0, 1).map((att, i) => (
                <button
                  key={i}
                  onClick={() => handleOpenExternalUrl(att.url)}
                  className={`inline-flex items-center justify-center w-7 h-7 rounded-md transition-all active:scale-95 cursor-pointer border ${
                    att.type === 'link'
                      ? 'text-indigo-700 bg-indigo-50 border-indigo-200 hover:bg-indigo-100'
                      : 'text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100'
                  }`}
                  title={att.name || att.url}
                >
                  {att.type === 'link' ? <Link2 className="w-3.5 h-3.5 shrink-0" /> : <Paperclip className="w-3.5 h-3.5 shrink-0" />}
                </button>
              ))}
              {list.attachments.length > 1 && (
                <button
                  type="button"
                  onClick={() => setViewingAttachmentsList(list)}
                  className="inline-flex items-center justify-center w-7 h-7 rounded-md text-slate-500 bg-slate-100 border border-slate-200 hover:bg-slate-200 transition-all text-[10px] font-bold cursor-pointer"
                  title="ดูเอกสารทั้งหมด"
                >
                  +{list.attachments.length - 1}
                </button>
              )}
            </div>
          ) : (
            <span className="text-slate-400 text-center block">-</span>
          )}
        </td>
      </tr>
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-500 text-sm font-semibold font-sans">
        กำลังโหลดแผ่นงานโครงการ...
      </div>
    );
  }

  return (
    <>
      <div className="task-timeline-sheet p-4 md:p-6 space-y-6">

        {/* Spreadsheet Header Banner */}
        <div className="task-timeline-banner bg-white border-2 border-slate-300 rounded-2xl shadow-xs overflow-hidden">
          <div className="task-timeline-banner-head bg-slate-50 p-6 text-slate-800 border-b border-slate-200">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-xl md:text-2xl font-black tracking-wider uppercase text-slate-800">
                  {task.title}
                </h1>
                <p className="text-slate-500 text-xs mt-1 font-semibold">
                  แผ่นงานแสดงลำดับเวลาโครงการ (Project Timeline Sheet & Action Items)
                </p>
              </div>

              {/* Action Toolbar */}
              <div className="flex items-center gap-2">
                {brand && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-extrabold bg-blue-50 text-blue-700 rounded-xl border border-blue-200">
                    <Tag className="w-3.5 h-3.5 text-blue-600" />
                    <span>{brand.name}</span>
                  </span>
                )}
                {category && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-extrabold bg-violet-50 text-violet-700 rounded-xl border border-violet-200">
                    <Layers className="w-3.5 h-3.5 text-violet-600" />
                    <span>{category.name}</span>
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setShowCreateListModal(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>เพิ่มงานย่อย</span>
                </button>
              </div>
            </div>

            {/* Filter Row */}
            <div className="flex flex-wrap items-center gap-2 mt-6 pt-6 border-t border-slate-200">
              <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-500 flex items-center gap-1">
                <Filter className="w-3 h-3 text-slate-500" />
                <span>ตัวกรอง:</span>
              </span>
              <button
                type="button"
                onClick={() => setActiveFilter('all')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeFilter === 'all'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
                }`}
              >
                ทั้งหมด
              </button>
              <button
                type="button"
                onClick={() => setActiveFilter('pending')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeFilter === 'pending'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
                }`}
              >
                งานยังไม่เสร็จ
              </button>
              <button
                type="button"
                onClick={() => setActiveFilter('overdue')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                  activeFilter === 'overdue'
                    ? 'bg-red-600 text-white border-red-700 shadow-xs'
                    : 'bg-white text-red-500 border border-red-200 hover:bg-red-50/50'
                }`}
              >
                งานเลยกำหนด
              </button>
              <button
                type="button"
                onClick={() => setActiveFilter('high_priority')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeFilter === 'high_priority'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
                }`}
              >
                High Priority
              </button>
              <button
                type="button"
                onClick={() => setActiveFilter('completed')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeFilter === 'completed'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
                }`}
              >
                เสร็จสิ้นแล้ว
              </button>
              <button
                type="button"
                onClick={() => handleOpenMainTaskNotif()}
                style={{ display: 'none' }}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                  hasUnreadMainTaskNotif
                    ? 'bg-rose-50 text-rose-700 border-rose-250 hover:bg-rose-100/70 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
                title="ดูการแจ้งเตือนและการเปลี่ยนแปลงของงานหลักทั้งหมด"
              >
                <Bell className={`w-3.5 h-3.5 ${hasUnreadMainTaskNotif ? 'text-rose-600 animate-pulse' : 'text-slate-500'}`} />
                <span>แจ้งเตือน</span>
                {hasUnreadMainTaskNotif && (
                  <span className="w-1.5 h-1.5 bg-rose-600 rounded-full flex relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-450 opacity-75"></span>
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveFilter('trash')}
                className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                  activeFilter === 'trash'
                    ? 'bg-red-600 text-white border-red-700 shadow-xs'
                    : 'bg-white text-red-650 hover:bg-red-50/50 border-red-200'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>ถังขยะงานย่อย (30 วัน)</span>
              </button>
            </div>
          </div>

          {/* Table Container */}
          <div className="task-timeline-table-wrap overflow-x-auto">
            <table className={`w-full text-left border-collapse text-xs font-sans ${task.id === 'daily' ? (showNoteColumn ? 'min-w-[1200px]' : 'min-w-[1100px]') : (showNoteColumn ? 'min-w-[1050px]' : 'min-w-[960px]')}`}>
              <thead>
                <tr className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200 select-none">
                  <th className="px-3 py-3 w-28 text-center border-r border-slate-200">DUE DATE</th>
                  {task.id === 'daily' && (
                    <th className="px-3 py-3 border-r border-slate-200 w-44 min-w-[150px] text-left">งานหลัก</th>
                  )}
                  <th className="px-3 py-3 border-r border-slate-200 w-32 min-w-[105px] text-center">แบรนด์</th>
                  <th className="px-4 py-3 border-r border-slate-200 min-w-[200px] text-left">รายละเอียดงาน</th>
                  <th className="px-3 py-3 w-24 text-center border-r border-slate-200">PRIORITY</th>
                  <th className="px-4 py-3 border-r border-slate-200 w-1/4 max-w-[250px]">DETAILS</th>
                  <th className="px-3 py-3 w-28 text-center border-r border-slate-200">ASSIGNMENT</th>
                  <th className="w-28 min-w-[92px] px-2 py-3 text-center border-r border-slate-200 whitespace-nowrap">
                    {activeFilter === 'trash' ? 'REMAINING' : 'STATUS'}
                  </th>
                  <th className="px-2 py-3 w-16 text-center border-r border-slate-200">
                    {activeFilter === 'trash' ? 'RESTORE' : 'LIST'}
                  </th>
                  {showNoteColumn && (
                    <th className="w-40 max-w-[180px] px-3 py-3 border-r border-slate-200">NOTE</th>
                  )}
                  <th className="px-2 py-3 w-[80px] text-center">LINK / FILES</th>
                </tr>
              </thead>
              <tbody className="divide-y-0 bg-white font-medium">
                {renderedRows.length > 0 ? (
                  renderedRows
                ) : (
                  <tr>
                    <td colSpan={task.id === 'daily' ? (showNoteColumn ? 11 : 10) : (showNoteColumn ? 10 : 9)} className="px-6 py-12 text-center text-slate-400 font-semibold italic text-sm bg-slate-50/50">
                      ยังไม่ได้เพิ่มงานย่อย
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Edit List Drawer */}
      {editingList && (
        <div
          className="task-timeline-edit-overlay fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-xs flex justify-end"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) handleCloseDrawer();
          }}
        >
          <div
            className="task-timeline-edit-drawer bg-white w-full max-w-lg h-full shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-200"
            onMouseDown={(event) => event.stopPropagation()}
          >
{editingCardSubView ? (
              <div className="bg-slate-50 text-slate-800 p-5 flex items-center gap-3 border-b border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingCardSubView(null)}
                  className="p-1 text-slate-500 hover:text-slate-800 rounded-lg transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-6 h-6" />
                </button>
                <div className="flex flex-col">
                  <span className="text-sm font-extrabold tracking-wide uppercase text-slate-800">การ์ดงาน</span>
                  <span className="text-[10px] text-slate-500 font-medium">รายการย่อย, ไฟล์หลักฐาน, รายละเอียดการ์ดงาน และความคิดเห็นจากผู้ดูแล</span>
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 text-slate-800 p-5 flex items-center justify-between border-b border-slate-200">
                <div className="flex items-center gap-2.5">
                  <FileText className="w-5 h-5 text-indigo-600" />
                  <span className="text-sm font-extrabold tracking-wide uppercase text-slate-800">แก้ไขข้อมูลงานย่อย</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void openActivityLog(editingList)}
                    className="p-1 text-slate-500 hover:text-indigo-600 rounded-lg transition-colors cursor-pointer"
                    title="ดูประวัติกิจกรรมของบอร์ดนี้"
                    aria-label="ดูประวัติกิจกรรมของบอร์ดนี้"
                  >
                    <Clock3 className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (editingList) {
                        await handleDeleteList(editingList.id);
                        setEditingList(null);
                      }
                    }}
                    disabled={drawerUploadState.uploadingCount > 0}
                    className="p-1 text-slate-500 hover:text-red-600 rounded-lg transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    title={drawerUploadState.uploadingCount > 0 ? 'กรุณารอให้อัปโหลดไฟล์เสร็จก่อน' : 'ลบงานย่อยนี้'}
                    aria-label="ลบงานย่อยนี้"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleCloseDrawer}
                    className="p-1 text-slate-500 hover:text-slate-800 rounded-lg transition-colors cursor-pointer"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>
            )}

            {/* Drawer Navigation Tabs */}
            {editingCardSubView ? (
              /* CARD SUB-VIEW DETAILS (EXACTLY MATCHING USER SCREENSHOT) */
              <div className="flex-1 overflow-y-auto p-6 space-y-6 animate-in fade-in duration-150">
                {/* 1. รายการย่อย (Sub-items) */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                      <span>รายการย่อย</span>
                    </span>
                    <span className="text-xs text-slate-500 font-semibold">{cardSubItemsInput.length} รายการ</span>
                  </div>

                  {cardSubItemsInput.length > 0 ? (
                    <div className="space-y-2.5">
                      {cardSubItemsInput.map(sub => (
                        <div key={sub.id} className="p-3 bg-white border border-slate-200 rounded-2xl flex items-center justify-between gap-3 shadow-2xs">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-700">{sub.title}</p>
                            <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                              เริ่ม - {sub.start_date ? new Date(sub.start_date).toLocaleDateString('th-TH', {day: 'numeric', month: 'numeric'}) : '-'}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleVerifySubItem(sub.id)}
                              className={`px-3 py-1 text-[11px] font-bold text-white rounded-lg transition-all active:scale-95 cursor-pointer ${
                                sub.status === 'completed' ? 'bg-emerald-600' : 'bg-blue-600 hover:bg-blue-700'
                              }`}
                            >
                              {sub.status === 'completed' ? 'ผ่านแล้ว' : 'ตรวจงาน'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteCardSubItem(sub.id)}
                              className="text-slate-400 hover:text-red-500 p-1 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic text-center py-4 bg-slate-50 border border-dashed border-slate-200 rounded-xl">ยังไม่มีรายการย่อยในการ์ดนี้</p>
                  )}

                  {/* Add Sub-item Form */}
                  <form onSubmit={handleAddCardSubItem} className="flex items-center gap-2 pt-1">
                    <input
                      type="text"
                      placeholder="พิมพ์รายการย่อยใหม่..."
                      value={newSubItemTitle}
                      onChange={e => setNewSubItemTitle(e.target.value)}
                      className="flex-1 px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                    />
                    <button
                      type="submit"
                      className="px-3.5 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg cursor-pointer transition-all"
                    >
                      เพิ่ม
                    </button>
                  </form>
                </div>

                {/* 2. เพิ่มไฟล์แนบหลักฐาน */}
                <div className="space-y-3 pt-3 border-t border-slate-200">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Paperclip className="w-4 h-4 text-indigo-600" />
                    <span>เพิ่มไฟล์แนบหลักฐาน</span>
                  </label>

                  {cardAttachmentsInput.length > 0 && (
                    <div className="space-y-2">
                      {cardAttachmentsInput.map((att, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                          <span className="truncate font-semibold text-slate-700">{att.name || att.url}</span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleOpenExternalUrl(att.url)}
                              className="text-xs text-blue-600 hover:underline font-bold cursor-pointer"
                            >
                              เปิด
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setModalTitle(att.type === 'link' ? 'แก้ไขลิงก์แนบ' : 'แก้ไขไฟล์แนบ');
                                setModalInputVal1(att.url);
                                setModalInputVal2(att.name || '');
                                setModalTargetId(att.id);
                                setModalScope('card');
                                setActiveModal('edit_link');
                              }}
                              className="text-slate-500 hover:text-indigo-600 p-1 cursor-pointer transition-all active:scale-95"
                              title="แก้ไขไฟล์แนบ/ลิงก์"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => handleAddCardAttachment('file')}
                      className="flex items-center justify-center gap-1.5 p-3.5 border border-dashed border-indigo-200 hover:border-indigo-400 rounded-2xl text-indigo-700 text-xs font-bold transition-all active:scale-95 cursor-pointer bg-indigo-50/10"
                    >
                      <Paperclip className="w-4 h-4 text-indigo-600" />
                      <span>แนบไฟล์</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddCardAttachment('link')}
                      className="flex items-center justify-center gap-1.5 p-3.5 border border-dashed border-emerald-200 hover:border-emerald-400 rounded-2xl text-emerald-700 text-xs font-bold transition-all active:scale-95 cursor-pointer bg-emerald-50/10"
                    >
                      <Link2 className="w-4 h-4 text-emerald-600" />
                      <span>แนบลิงก์</span>
                    </button>
                  </div>
                </div>

                {/* 3. รายละเอียดการ์ดงาน */}
                <div className="space-y-1.5 pt-3 border-t border-slate-200">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-slate-600" />
                    <span>รายละเอียดการ์ดงาน</span>
                  </label>
                  <input
                    type="text"
                    value={cardDescInput}
                    onChange={e => setCardDescInput(e.target.value)}
                    placeholder="รายละเอียดงาน..."
                    className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold text-slate-800"
                  />
                </div>

                {/* 4. วันกำหนดส่ง */}
                <div className="space-y-1.5 pt-1">
                  <label className="text-xs font-bold text-slate-700">วันกำหนดส่ง</label>
                  <input
                    type="date"
                    value={cardDueDateInput}
                    onChange={e => setCardDueDateInput(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold text-slate-800"
                  />
                </div>

                {/* 5. ผู้รับผิดชอบการ์ดนี้ (Card Assignees) */}
                <div className="space-y-2 relative pt-2 border-t border-slate-100">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-indigo-600" />
                    <span>ผู้รับผิดชอบการ์ดนี้ (Card Assignees)</span>
                  </label>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {cardAssigneesInput.map(uid => {
                      const u = userMap[uid];
                      return (
                        <div key={uid} className="relative group cursor-pointer" onClick={() => setCardAssigneesInput(cardAssigneesInput.filter(x => x !== uid))}>
                          <img
                            src={avatarUrl(u?.avatar_url) || undefined}
                            alt={u ? (u.nickname || u.first_name) : ''}
                            className="w-8 h-8 rounded-full border-2 border-white shadow-xs object-cover"
                            title={u ? (u.nickname || u.first_name) : ''}
                          />
                          <div className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                            ×
                          </div>
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => setShowCardAssigneePopover(!showCardAssigneePopover)}
                      className={`w-8 h-8 rounded-full border-2 border-dashed flex items-center justify-center transition-all cursor-pointer ${
                        showCardAssigneePopover
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-600'
                          : 'border-slate-300 text-slate-400 hover:border-slate-500 hover:text-slate-600 bg-slate-50'
                      }`}
                      title="เลือกผู้รับผิดชอบการ์ด"
                    >
                      <Plus className={`w-4 h-4 transition-transform duration-150 ${showCardAssigneePopover ? 'rotate-45' : ''}`} />
                    </button>
                  </div>

                  {showCardAssigneePopover && (
                    <>
                      <div
                        className="fixed inset-0 z-[65]"
                        onClick={() => setShowCardAssigneePopover(false)}
                      />
                      <div className="absolute z-[70] bottom-full mb-2 bg-white border border-slate-200 rounded-xl shadow-xl p-2.5 max-h-56 overflow-y-auto w-64 animate-in fade-in slide-in-from-bottom-2 duration-150">
                        <div className="flex items-center justify-between px-1.5 py-1 mb-1.5 border-b border-slate-100">
                          <span className="text-[11px] font-bold text-slate-600">เลือกผู้รับผิดชอบการ์ด</span>
                          <button
                            type="button"
                            onClick={() => setShowCardAssigneePopover(false)}
                            className="text-slate-400 hover:text-slate-700 p-0.5 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
                            title="ปิด"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {projectMemberUsers.length > 0 ? (
                          projectMemberUsers.map(u => {
                            const isAssigned = cardAssigneesInput.includes(u.id);
                            return (
                              <button
                                key={u.id}
                                type="button"
                                onClick={() => {
                                  if (isAssigned) {
                                    setCardAssigneesInput(cardAssigneesInput.filter(id => id !== u.id));
                                  } else {
                                    setCardAssigneesInput([...cardAssigneesInput, u.id]);
                                  }
                                }}
                                className="w-full flex items-center justify-between p-2 hover:bg-slate-50 rounded-lg text-left text-xs font-semibold cursor-pointer transition-colors"
                              >
                                <div className="flex items-center gap-2">
                                  <img src={avatarUrl(u?.avatar_url) || undefined} className="w-5 h-5 rounded-full object-cover" />
                                  <span className="text-slate-700">{u.nickname || u.first_name}</span>
                                </div>
                                {isAssigned && <span className="text-blue-600 font-bold">✓</span>}
                              </button>
                            );
                          })
                        ) : (
                          <div className="p-2.5 text-center text-xs text-slate-400 italic">
                            ไม่มีสมาชิกในงานหลัก (กรุณาเพิ่มผู้รับผิดชอบที่งานหลักก่อน)
                          </div>
                        )}
                        <div className="mt-2 pt-1.5 border-t border-slate-100">
                          <button
                            type="button"
                            onClick={() => setShowCardAssigneePopover(false)}
                            className="w-full py-1 text-[11px] font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer text-center"
                          >
                            เสร็จสิ้น / ปิด
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* 6. ความคิดเห็นจากผู้ดูแล */}
                <div className="p-4 bg-amber-50/40 border border-amber-200 rounded-2xl space-y-3 pt-3">
                  <label className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-amber-600" />
                    <span>ความคิดเห็นจากผู้ดูแล</span>
                  </label>
                  <textarea
                    rows={3}
                    value={cardAdminCommentInput}
                    onChange={e => setCardAdminCommentInput(e.target.value)}
                    placeholder="พิมพ์ความคิดเห็นหรือคำแนะนำผู้ดูแล..."
                    className="w-full px-3.5 py-2.5 text-xs bg-white border border-amber-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-800"
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="flex border-b border-slate-200 bg-slate-50 px-4">
              <button
                type="button"
                onClick={() => setDrawerActiveTab('info')}
                className={`flex-1 py-3 text-xs font-bold text-center border-b-2 transition-all cursor-pointer ${
                  drawerActiveTab === 'info'
                    ? 'border-blue-600 text-blue-600 bg-white'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100/50'
                }`}
              >
                ข้อมูลทั่วไป (General Info)
              </button>
              
              <button
                type="button"
                onClick={() => setDrawerActiveTab('attachments')}
                className={`flex-1 py-3 text-xs font-bold text-center border-b-2 transition-all cursor-pointer ${
                  drawerActiveTab === 'attachments'
                    ? 'border-blue-600 text-blue-600 bg-white'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100/50'
                }`}
              >
                เอกสาร & หมายเหตุ (Docs & Notes)
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {drawerActiveTab === 'info' ? (
                /* TAB 1: GENERAL INFO */
                <div className="space-y-5 animate-in fade-in duration-150">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">ชื่อรายการคอร์สงาน</label>
                    <input
                      type="text"
                      value={drawerTitle}
                      onChange={(e) => setDrawerTitle(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-800"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3.5">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700">วันกำหนดส่ง</label>
                      <input
                        type="date"
                        value={drawerDueDate}
                        onChange={(e) => setDrawerDueDate(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold text-slate-800"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700">ความสำคัญ (Priority)</label>
                      <select
                        value={drawerPriority}
                        onChange={(e) => setDrawerPriority(e.target.value as any)}
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800"
                      >
                        <option value="urgent">🔥 งานด่วนมาก (Urgent)</option>
                        <option value="high">🟠 งานด่วน (High)</option>
                        <option value="medium">⚡ งานด่วนปานกลาง (Medium)</option>
                        <option value="low">🌱 งานไม่รีบ (Low)</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">สถานะงาน (Status)</label>
                    <select
                      value={drawerStatus}
                      onChange={(e) => setDrawerStatus(e.target.value as any)}
                      className="w-full px-3 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800"
                    >
                      <option value="waiting">รอรับ</option>
                      <option value="pending">รอทำ</option>
                      <option value="in_progress">กำลังทำ</option>
                      <option value="in_review">รอตรวจ</option>
                      <option value="revision">แก้ไข</option>
                      <option value="completed">เสร็จสิ้น</option>
                    </select>
                  </div>

                  {/* มอบหมายให้ (Assignees) */}
                  <div className="space-y-1.5 relative">
                    <label className="text-xs font-bold text-slate-700">มอบหมายให้ (Assignees)</label>
                    <div className="flex flex-wrap items-center gap-2">
                      {drawerAssignees.map(uid => {
                        const u = userMap[uid];
                        return (
                          <div key={uid} className="relative group cursor-pointer" onClick={() => setDrawerAssignees(drawerAssignees.filter(x => x !== uid))}>
                            <img
                              src={avatarUrl(u?.avatar_url) || undefined}
                              alt={u ? (u.nickname || u.first_name) : ''}
                              className="w-8 h-8 rounded-full border-2 border-white shadow-xs object-cover"
                              title={u ? (u.nickname || u.first_name) : ''}
                            />
                            <div className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                              ×
                            </div>
                          </div>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => setShowDrawerInvitePopover(!showDrawerInvitePopover)}
                        className={`w-8 h-8 rounded-full border-2 border-dashed flex items-center justify-center transition-all cursor-pointer ${
                          showDrawerInvitePopover
                            ? 'border-blue-500 bg-blue-50 text-blue-600'
                            : 'border-slate-300 text-slate-400 hover:border-slate-500 hover:text-slate-600 bg-slate-50'
                        }`}
                        title="เลือกผู้รับผิดชอบ"
                      >
                        <Plus className={`w-4 h-4 transition-transform duration-150 ${showDrawerInvitePopover ? 'rotate-45' : ''}`} />
                      </button>
                    </div>
                    {showDrawerInvitePopover && (
                      <>
                        <div
                          className="fixed inset-0 z-[65]"
                          onClick={() => setShowDrawerInvitePopover(false)}
                        />
                        <div className="absolute z-[70] bottom-full mb-2 bg-white border border-slate-200 rounded-xl shadow-xl p-2.5 max-h-56 overflow-y-auto w-64 animate-in fade-in slide-in-from-bottom-2 duration-150">
                          <div className="flex items-center justify-between px-1.5 py-1 mb-1.5 border-b border-slate-100">
                            <span className="text-[11px] font-bold text-slate-600">เลือกผู้รับผิดชอบ</span>
                            <button
                              type="button"
                              onClick={() => setShowDrawerInvitePopover(false)}
                              className="text-slate-400 hover:text-slate-700 p-0.5 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
                              title="ปิด"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          {projectMemberUsers.length > 0 ? (
                            projectMemberUsers.map(u => {
                              const isAssigned = drawerAssignees.includes(u.id);
                              return (
                                <button
                                  key={u.id}
                                  type="button"
                                  onClick={() => {
                                    if (isAssigned) {
                                      setDrawerAssignees(drawerAssignees.filter(id => id !== u.id));
                                    } else {
                                      setDrawerAssignees([...drawerAssignees, u.id]);
                                    }
                                  }}
                                  className="w-full flex items-center justify-between p-2 hover:bg-slate-50 rounded-lg text-left text-xs font-semibold cursor-pointer transition-colors"
                                >
                                  <div className="flex items-center gap-2">
                                    <img src={avatarUrl(u?.avatar_url) || undefined} className="w-5 h-5 rounded-full object-cover" />
                                    <span className="text-slate-700">{u.nickname || u.first_name}</span>
                                  </div>
                                  {isAssigned && <span className="text-blue-600 font-bold text-sm">✓</span>}
                                </button>
                              );
                            })
                          ) : (
                            <div className="p-2.5 text-center text-xs text-slate-400 italic">
                              ไม่มีสมาชิกในงานหลัก (กรุณาเพิ่มผู้รับผิดชอบที่งานหลักก่อน)
                            </div>
                          )}
                          <div className="mt-2 pt-1.5 border-t border-slate-100">
                            <button
                              type="button"
                              onClick={() => setShowDrawerInvitePopover(false)}
                              className="w-full py-1 text-[11px] font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer text-center"
                            >
                              เสร็จสิ้น / ปิด
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">รายละเอียดเพิ่มเติม (Details)</label>
                    <textarea
                      rows={4}
                      value={drawerComment}
                      onChange={(e) => setDrawerComment(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-normal text-slate-800"
                      placeholder="พิมพ์รายละเอียดของคอร์สงาน..."
                    />
                  </div>

                  {/* การ์ดงาน (Cards) Section */}
                  <div className="space-y-4 pt-4 border-t border-slate-200">
                    {/* Cards List Header & Add Button */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">รายการการ์ดงานในคอร์สนี้ ({editingList.cards?.length || 0})</span>
                        <button
                          type="button"
                          onClick={handleAddNewCardClick}
                          className="px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer transition-all active:scale-95 flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>เพิ่มการ์ดงาน</span>
                        </button>
                      </div>
                      {editingList.cards && editingList.cards.length > 0 ? (
                        <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                          {editingList.cards.map(card => (
                            <div key={card.id} onClick={() => handleOpenCardSubView(card)} className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-2xs hover:shadow-xs transition-all flex items-center justify-between gap-3 cursor-pointer hover:border-blue-400">
                              <div className="min-w-0 flex-1">
                                <p className="font-bold text-slate-800 text-xs truncate">{card.title}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${
                                    card.priority === 'high' 
                                      ? 'bg-rose-50 text-rose-700 border-rose-200' 
                                      : card.priority === 'medium'
                                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                                      : 'bg-slate-50 text-slate-600 border-slate-200'
                                  }`}>
                                    {card.priority === 'high' ? 'High' : card.priority === 'medium' ? 'Medium' : 'Low'}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteCard(card.id);
                                  }}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                                  title="ลบการ์ดงาน"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>


                </div>

              ) : (
                /* TAB 2: ATTACHMENTS & COMMENTS */
                <div className="space-y-5 animate-in fade-in duration-150">
                  {/* NOTE / Remark (admin_comment) */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">NOTE / Remark (ความคิดเห็นจากผู้ดูแล)</label>
                    <textarea
                      rows={5}
                      value={drawerAdminComment}
                      onChange={(e) => setDrawerAdminComment(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-normal text-slate-800"
                      placeholder="เพิ่มคำอธิบายหรือความคิดเห็นผู้ดูแล..."
                    />
                  </div>

                  <TaskAttachmentPanel
                    attachments={drawerAttachments}
                    disabled={isSavingDrawer}
                    onAddAttachment={(attachment) => {
                      setDrawerAttachments((current) => [...current, attachment]);
                    }}
                    onRemoveAttachment={(index) => {
                      const attachment = drawerAttachments[index];
                      if (!attachment) return;

                      setConfirmModal({
                        isOpen: true,
                        title: 'ลบไฟล์แนบ?',
                        description: `ต้องการลบ "${attachment.name || 'ไฟล์แนบ'}" ออกจากรายการนี้ใช่หรือไม่?`,
                        confirmText: 'ลบไฟล์',
                        onConfirm: () => {
                          setDrawerAttachments((current) => current.filter((_, currentIndex) => currentIndex !== index));
                        },
                      });
                    }}
                    onEditAttachment={(index, attachment) => {
                      setModalTitle(attachment.type === 'link' ? 'แก้ไขลิงก์แนบ' : 'แก้ไขไฟล์แนบ');
                      setModalInputVal1(attachment.url);
                      setModalInputVal2(attachment.name || '');
                      setModalTargetId(String(index));
                      setModalScope('list');
                      setActiveModal('edit_link');
                    }}
                    onOpenAttachment={handleOpenExternalUrl}
                    onAddLink={() => {
                      setModalTitle('แนบลิงก์ภายนอก');
                      setModalInputVal1('');
                      setModalInputVal2('');
                      setModalScope('list');
                      setActiveModal('attach_link');
                    }}
                    onUploadStateChange={setDrawerUploadState}
                  />
                </div>
              )}
            </div>

              </>
            )}

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
              {editingCardSubView ? (
                <>
                  <div />
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setEditingCardSubView(null)}
                      className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-all cursor-pointer"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveCardSubView}
                      disabled={isSavingCard}
                      className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
                    >
                      <Save className="w-4 h-4" />
                      <span>{isSavingCard ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}</span>
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {/* สมาชิกโปรเจกต์และผู้มอบหมายงานส่งแก้ไขได้เฉพาะสถานะที่พร้อมตรวจ/แก้ไข */}
                  {canSubmitRevision &&
                  (drawerStatus === 'in_review' ||
                    drawerStatus === 'completed' ||
                    drawerStatus === 'revision') ? (
                    <button
                      type="button"
                      onClick={() => {
                        setRevisionReasonInput(drawerAdminComment || '');
                        setShowRevisionModal(true);
                      }}
                      disabled={drawerUploadState.uploadingCount > 0 || drawerUploadState.failedCount > 0}
                      title={drawerUploadState.uploadingCount > 0 || drawerUploadState.failedCount > 0 ? 'กรุณาจัดการไฟล์แนบให้เรียบร้อยก่อน' : undefined}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-300 rounded-xl transition-all active:scale-95 cursor-pointer shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <RotateCcw className="w-4 h-4 text-rose-600" />
                      <span>ส่งแก้ไข</span>
                    </button>
                  ) : (
                    <div />
                  )}

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleCloseDrawer}
                      className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-all cursor-pointer"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveDrawer}
                      disabled={isSavingDrawer || drawerUploadState.uploadingCount > 0 || drawerUploadState.failedCount > 0}
                      title={drawerUploadState.failedCount > 0 ? 'กรุณาลองอัปโหลดใหม่หรือนำไฟล์ที่ล้มเหลวออก' : undefined}
                      className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
                    >
                      <Save className="w-4 h-4" />
                      <span>
                        {isSavingDrawer
                          ? 'กำลังบันทึก...'
                          : drawerUploadState.uploadingCount > 0
                            ? `กำลังอัปโหลด ${drawerUploadState.uploadingCount} ไฟล์`
                            : drawerUploadState.failedCount > 0
                              ? 'มีไฟล์อัปโหลดไม่สำเร็จ'
                              : 'บันทึกข้อมูล'}
                      </span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create List Modal */}
      {showCreateListModal && (
        <div className="fixed inset-0 z-[60] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="bg-slate-50 text-slate-800 px-6 py-4 flex items-center justify-between border-b border-slate-200">
              <h3 className="font-extrabold text-sm flex items-center gap-2 text-slate-800">
                <PlusCircle className="w-5 h-5 text-blue-600" />
                <span>เพิ่มงานย่อยใหม่</span>
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowCreateListModal(false);
                  setShowInvitePopover(false);
                }}
                className="text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Form */}
            <form onSubmit={handleCreateList}>
              <div className="p-6 space-y-4">
                {/* 1. ชื่องานย่อย */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">ชื่องานย่อย <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={createListName}
                    onChange={(e) => setCreateListName(e.target.value)}
                    required
                    placeholder="เช่น ออกแบบหน้าเว็บ..."
                    className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-800"
                  />
                </div>

                {/* 2. รายละเอียดงานย่อย */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">รายละเอียดงานย่อย</label>
                  <textarea
                    rows={3}
                    value={createListDescription}
                    onChange={(e) => setCreateListDescription(e.target.value)}
                    placeholder="รายละเอียดเพิ่มเติมของงานย่อย..."
                    className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-normal text-slate-800"
                  />
                </div>

                {/* 3. กำหนดส่ง & ความสำคัญ & สถานะ */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">วันที่กำหนดส่ง</label>
                    <input
                      type="date"
                      value={createListDueDate}
                      onChange={(e) => setCreateListDueDate(e.target.value)}
                      className="w-full px-3 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold text-slate-800"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">ความสำคัญ</label>
                    <select
                      value={createListPriority}
                      onChange={(e) => setCreateListPriority(e.target.value as any)}
                      className="w-full px-3 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800"
                    >
                      <option value="urgent">🔥 งานด่วนมาก (Urgent)</option>
                      <option value="high">🟠 งานด่วน (High)</option>
                      <option value="medium">⚡ งานด่วนปานกลาง (Medium)</option>
                      <option value="low">🌱 งานไม่รีบ (Low)</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">สถานะ</label>
                    <select
                      value={createListStatus}
                      onChange={(e) => setCreateListStatus(e.target.value as any)}
                      className="w-full px-3 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800"
                    >
                      <option value="waiting">รอรับ</option>
                      <option value="pending">รอทำ</option>
                      <option value="in_progress">กำลังทำ</option>
                      <option value="in_review">รอตรวจ</option>
                      <option value="revision">แก้ไข</option>
                      <option value="completed">เสร็จสิ้น</option>
                    </select>
                  </div>
                </div>

                {/* 4. มอบหมายให้ */}
                <div className="space-y-1.5 relative">
                  <label className="text-xs font-bold text-slate-700">มอบหมายให้</label>
                  <div className="flex flex-wrap items-center gap-2">
                    {createListAssigneeIds.map(uid => {
                      const u = userMap[uid];
                      return (
                        <div key={uid} className="relative group cursor-pointer" onClick={() => setCreateListAssigneeIds(createListAssigneeIds.filter(x => x !== uid))}>
                          <img
                            src={avatarUrl(u?.avatar_url) || undefined}
                            alt={u ? (u.nickname || u.first_name) : ''}
                            className="w-8 h-8 rounded-full border-2 border-white shadow-xs object-cover"
                            title={u ? (u.nickname || u.first_name) : ''}
                          />
                          <div className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                            ×
                          </div>
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => setShowInvitePopover(!showInvitePopover)}
                      className={`w-8 h-8 rounded-full border-2 border-dashed flex items-center justify-center transition-all cursor-pointer ${
                        showInvitePopover
                          ? 'border-blue-500 bg-blue-50 text-blue-600'
                          : 'border-slate-300 text-slate-400 hover:border-slate-500 hover:text-slate-600 bg-slate-50'
                      }`}
                      title="เลือกผู้รับผิดชอบ"
                    >
                      <Plus className={`w-4 h-4 transition-transform duration-150 ${showInvitePopover ? 'rotate-45' : ''}`} />
                    </button>
                  </div>
                  {showInvitePopover && (
                    <>
                      <div
                        className="fixed inset-0 z-[65]"
                        onClick={() => setShowInvitePopover(false)}
                      />
                      <div className="absolute z-[70] bottom-full mb-2 bg-white border border-slate-200 rounded-xl shadow-xl p-2.5 max-h-56 overflow-y-auto w-64 animate-in fade-in slide-in-from-bottom-2 duration-150">
                        <div className="flex items-center justify-between px-1.5 py-1 mb-1.5 border-b border-slate-100">
                          <span className="text-[11px] font-bold text-slate-600">เลือกผู้รับผิดชอบ</span>
                          <button
                            type="button"
                            onClick={() => setShowInvitePopover(false)}
                            className="text-slate-400 hover:text-slate-700 p-0.5 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
                            title="ปิด"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {projectMemberUsers.length > 0 ? (
                          projectMemberUsers.map(u => {
                            const isAssigned = createListAssigneeIds.includes(u.id);
                            return (
                              <button
                                key={u.id}
                                type="button"
                                onClick={() => {
                                  if (isAssigned) {
                                    setCreateListAssigneeIds(createListAssigneeIds.filter(id => id !== u.id));
                                  } else {
                                    setCreateListAssigneeIds([...createListAssigneeIds, u.id]);
                                  }
                                }}
                                className="w-full flex items-center justify-between p-2 hover:bg-slate-50 rounded-lg text-left text-xs font-semibold cursor-pointer transition-colors"
                              >
                                <div className="flex items-center gap-2">
                                  <img src={avatarUrl(u?.avatar_url) || undefined} className="w-5 h-5 rounded-full object-cover" />
                                  <span className="text-slate-700">{u.nickname || u.first_name}</span>
                                </div>
                                {isAssigned && <span className="text-blue-600 font-bold text-sm">✓</span>}
                              </button>
                            );
                          })
                        ) : (
                          <div className="p-2.5 text-center text-xs text-slate-400 italic">
                            ไม่มีสมาชิกในงานหลัก (กรุณาเพิ่มผู้รับผิดชอบที่งานหลักก่อน)
                          </div>
                        )}
                        <div className="mt-2 pt-1.5 border-t border-slate-100">
                          <button
                            type="button"
                            onClick={() => setShowInvitePopover(false)}
                            className="w-full py-1 text-[11px] font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer text-center"
                          >
                            เสร็จสิ้น / ปิด
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>


              </div>
              
              {/* Footer */}
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateListModal(false);
                    setShowInvitePopover(false);
                  }}
                  className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-all cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isCreatingList}
                  className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{isCreatingList ? 'กำลังบันทึก...' : 'บันทึก'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Custom Center Modals for Premium Inputs */}
      {activeModal && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="bg-slate-50 text-slate-800 px-5 py-4 flex items-center justify-between border-b border-slate-200">
              <span className="text-xs font-black uppercase tracking-wider text-slate-800">{modalTitle}</span>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              {activeModal === 'add_card' && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 uppercase">ระบุชื่อการ์ดงานย่อยใหม่</label>
                  <input
                    type="text"
                    value={modalInputVal1}
                    onChange={(e) => setModalInputVal1(e.target.value)}
                    placeholder="ระบุชื่องาน..."
                    className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold text-slate-800"
                    autoFocus
                  />
                </div>
              )}

              {(activeModal === 'attach_link' || activeModal === 'edit_link') && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase">ชื่อลิงก์</label>
                    <input
                      type="text"
                      value={modalInputVal2}
                      onChange={(e) => setModalInputVal2(e.target.value)}
                      placeholder="เช่น เอกสาร Figma, แหล่งอ้างอิง..."
                      className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold text-slate-800"
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase">URL ลิงก์ภายนอก *</label>
                    <input
                      type="text"
                      value={modalInputVal1}
                      onChange={(e) => setModalInputVal1(e.target.value)}
                      placeholder="https://..."
                      className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold text-slate-800"
                    />
                  </div>
                </div>
              )}



              {activeModal === 'verify_subitem' && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase">ผลการประเมินงานย่อย</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setModalSelectVal('pass')}
                        className={`py-2.5 text-xs font-bold rounded-xl border transition-all active:scale-95 cursor-pointer ${
                          modalSelectVal === 'pass'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-300 ring-2 ring-emerald-500/20'
                            : 'bg-white text-slate-600 border-slate-200'
                        }`}
                      >
                        ผ่านงาน (Pass)
                      </button>
                      <button
                        type="button"
                        onClick={() => setModalSelectVal('fail')}
                        className={`py-2.5 text-xs font-bold rounded-xl border transition-all active:scale-95 cursor-pointer ${
                          modalSelectVal === 'fail'
                            ? 'bg-rose-50 text-rose-700 border-rose-300 ring-2 ring-rose-500/20'
                            : 'bg-white text-slate-600 border-slate-200'
                        }`}
                      >
                        ไม่ผ่าน (Fail)
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase">ความเห็นการตรวจสอบ</label>
                    <textarea
                      rows={3}
                      value={modalInputVal1}
                      onChange={(e) => setModalInputVal1(e.target.value)}
                      placeholder="ระบุข้อความ..."
                      className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold text-slate-800"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2.5">
              {activeModal === 'edit_link' ? (
                <button
                  type="button"
                  onClick={() => {
                    if (modalTargetId) handleDeleteCardAttachment(modalTargetId);
                  }}
                  className="px-4 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 hover:border-rose-300 rounded-xl transition-all cursor-pointer"
                >
                  ลบลิงก์นี้
                </button>
              ) : (
                <div />
              )}
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-all cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  disabled={
                    isModalSubmitting ||
                    (activeModal === 'add_card' && !modalInputVal1.trim()) ||
                    ((activeModal === 'attach_link' || activeModal === 'edit_link') && !modalInputVal1.trim())
                  }
                  onClick={() => {
                    if (activeModal === 'add_card') submitAddNewCard();
                    else if (activeModal === 'attach_link') submitAddCardAttachmentLink();
                    else if (activeModal === 'edit_link') submitUpdateCardAttachment();
                    else if (activeModal === 'verify_subitem') submitVerifySubItem();
                  }}
                  className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
                >
                  {isModalSubmitting ? 'กำลังบันทึก...' : 'ตกลง'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hidden File Input for Direct Uploads */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleDirectFileUpload}
        className="hidden"
      />

      {/* Premium Centered Custom Alert Modal */}
      {customAlert && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-xs w-full border border-slate-200 text-center animate-in zoom-in-95 duration-150 space-y-4">
            <div className="flex items-center justify-center">
              <div className={`p-3.5 rounded-full ${
                customAlert.type === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
              }`}>
                <CheckCircle2 className="w-8 h-8" />
              </div>
            </div>
            <div className="space-y-1">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                {customAlert.type === 'success' ? 'ทำรายการสำเร็จ' : 'เกิดข้อผิดพลาด'}
              </h4>
              <p className="text-[11px] text-slate-500 font-bold leading-normal">{customAlert.message}</p>
            </div>
            <button
              type="button"
              onClick={() => setCustomAlert(null)}
              className="w-full py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 transition-all rounded-xl shadow-md cursor-pointer"
            >
              ตกลง
            </button>
          </div>
        </div>
      )}

      {/* View All Attachments Modal */}
      {viewingAttachmentsList && (
        <div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden border border-slate-200 flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-150">
            <div className="bg-slate-50 p-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-extrabold text-slate-800 flex items-center gap-2 text-sm">
                <Paperclip className="w-4 h-4 text-indigo-500" />
                เอกสารทั้งหมด
              </h3>
              <button
                type="button"
                onClick={() => setViewingAttachmentsList(null)}
                className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto space-y-2">
              {viewingAttachmentsList.attachments?.map((att, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleOpenExternalUrl(att.url)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all hover:shadow-md cursor-pointer text-left ${
                    att.type === 'link'
                      ? 'border-indigo-100 bg-indigo-50/50 hover:border-indigo-300'
                      : 'border-blue-100 bg-blue-50/50 hover:border-blue-300'
                  }`}
                >
                  <div className={`p-2 rounded-lg ${att.type === 'link' ? 'bg-indigo-100 text-indigo-600' : 'bg-blue-100 text-blue-600'}`}>
                    {att.type === 'link' ? <Link2 className="w-4 h-4" /> : <Paperclip className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <p className={`text-sm font-bold truncate ${att.type === 'link' ? 'text-indigo-900' : 'text-blue-900'}`}>
                      {att.name || (att.type === 'link' ? 'แนบลิงก์ภายนอก' : 'แนบไฟล์')}
                    </p>
                    <p className="text-xs text-slate-500 truncate mt-0.5">{att.url}</p>
                  </div>
                </button>
              ))}
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50/50">
              <button
                type="button"
                onClick={() => setViewingAttachmentsList(null)}
                className="w-full py-2.5 px-4 text-sm font-bold text-slate-700 bg-slate-200 hover:bg-slate-300 rounded-xl transition-all cursor-pointer"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Board activity log */}
      {activityList && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200 flex flex-col max-h-[82vh] animate-in zoom-in-95 duration-150">
            <div className="bg-slate-50 p-4 border-b border-slate-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                  <Clock3 className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-extrabold text-slate-800 text-sm truncate">ประวัติกิจกรรมของบอร์ด</h3>
                  <p className="text-[11px] text-slate-500 truncate">{activityList.name} · ใครทำอะไรและเมื่อไร</p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => void openActivityLog(activityList)}
                  className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                  title="รีเฟรชประวัติ"
                  aria-label="รีเฟรชประวัติ"
                >
                  <RefreshCw className={`w-4 h-4 ${activityLoading ? 'animate-spin' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={() => setActivityList(null)}
                  className="p-2 text-slate-400 hover:text-slate-700 rounded-lg transition-colors cursor-pointer"
                  aria-label="ปิดประวัติกิจกรรม"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {activityLoading ? (
                <div className="py-12 flex flex-col items-center gap-2 text-slate-400 text-xs">
                  <RefreshCw className="w-5 h-5 animate-spin text-indigo-500" />
                  กำลังโหลดประวัติกิจกรรม...
                </div>
              ) : activityEvents.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  <Clock3 className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  ยังไม่มีประวัติกิจกรรมของบอร์ดนี้
                </div>
              ) : (
                <div className="relative space-y-3">
                  <div className="absolute left-4 top-3 bottom-3 w-px bg-indigo-100" />
                  {activityEvents.map((event) => {
                    const operator = `${event.user_first_name || ''} ${event.user_last_name || ''}`.trim() || 'ผู้ใช้งานระบบ';
                    const date = new Date(event.created_at);
                    const actionLabel = event.content || event.action || 'ทำรายการในบอร์ด';
                    return (
                      <div key={event.id} className="relative flex gap-3 pl-0">
                        <div className="relative z-10 w-8 h-8 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center shrink-0">
                          <Clock3 className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-800 truncate">{operator}</p>
                              <p className="text-xs text-slate-600 mt-0.5 break-words">{actionLabel}</p>
                            </div>
                            <time className="text-[10px] text-slate-400 whitespace-nowrap" dateTime={event.created_at}>
                              {Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('th-TH', {
                                day: '2-digit', month: '2-digit', year: 'numeric',
                                hour: '2-digit', minute: '2-digit',
                              })}
                            </time>
                          </div>
                          {event.action && (
                            <span className="inline-block mt-2 px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[10px] text-indigo-600 font-semibold">
                              {getBoardActivityLabel(event.action)}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Unsaved Changes Guard Modal */}
      {showUnsavedModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200 text-left">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">มีข้อมูลที่ยังไม่ได้บันทึก</h3>
                <p className="text-xs text-slate-500 mt-0.5">คุณได้แก้ไขข้อมูลในฟอร์มนี้ แต่ยังไม่ได้กดบันทึก</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-6">หากปิดเดี๋ยวนี้ การเปลี่ยนแปลงทั้งหมดจะหายไป ต้องการดำเนินการต่อหรือไม่?</p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowUnsavedModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all cursor-pointer"
              >
                กลับไปแก้ไข
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowUnsavedModal(false);
                  setEditingList(null);
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-red-500 hover:bg-red-600 rounded-xl transition-all cursor-pointer shadow"
              >
                ปิดโดยไม่บันทึก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reusable Beautiful Confirm Modal */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200 text-left">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-6 h-6 text-red-650" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">{confirmModal.title}</h3>
                <p className="text-xs text-slate-500">กรุณายืนยันการทำรายการลบข้อมูล</p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 text-xs text-slate-600 leading-relaxed mb-6 font-semibold">
              {confirmModal.description}
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                onClick={() => {
                  confirmModal.onConfirm();
                  setConfirmModal({ ...confirmModal, isOpen: false });
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 active:bg-red-800 rounded-xl shadow-xs transition-all cursor-pointer"
              >
                {confirmModal.confirmText || 'ยืนยันการลบ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Task Notifications Modal */}
      {mainTaskNotifModalOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150 text-left">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="bg-slate-50 p-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center">
                  <Bell className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-800 text-sm">การแจ้งเตือนโครงการ</h3>
                  <p className="text-[10px] text-slate-500 font-semibold truncate max-w-[280px]">
                    โครงการ: {task.title}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMainTaskNotifModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* List */}
            <div className="p-4 overflow-y-auto space-y-3 flex-1">
              {(() => {
                const listNotifs = notifications.filter(n => {
                  let tId: string | null = null;
                  if (n.metadata) {
                    let meta = n.metadata;
                    if (typeof meta === 'string') {
                      try {
                        meta = JSON.parse(meta);
                      } catch {}
                    }
                    if (meta && typeof meta === 'object') {
                      tId = meta.task_id || null;
                    }
                  }
                  return task.id === 'daily' ? true : tId === task.id;
                });

                if (listNotifs.length === 0) {
                  return (
                    <div className="py-12 text-center text-slate-400 text-xs font-semibold">
                      <Bell className="w-8 h-8 mx-auto mb-2 opacity-30 text-slate-350" />
                      ยังไม่มีประวัติการแจ้งเตือนของโครงการนี้
                    </div>
                  );
                }

                const usersList = Object.values(userMap);
                return listNotifs.map(n => {
                  const sender = getNotificationSender(n, usersList);
                  const formattedBody = formatNotificationBody(n.body, usersList);
                  return (
                    <div
                      key={n.id}
                      onClick={() => handleProjectNotifClick(n)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer group flex items-start gap-3 hover:shadow-xs hover:border-indigo-300 hover:bg-white ${
                        !n.is_read
                          ? 'bg-blue-50/60 border-blue-200'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      {/* Avatar with Action Badge / Fallback Icon */}
                      <NotificationAvatar
                        notification={n}
                        sender={sender}
                        size="md"
                        className="mt-0.5"
                      />

                      {/* Content */}
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex justify-between items-start gap-2">
                          <p className="text-xs font-bold text-slate-850 group-hover:text-blue-600 transition-colors leading-snug">
                            {n.title}
                          </p>
                          <span className="text-[9px] text-slate-450 font-semibold shrink-0">
                            {new Date(n.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-xs text-slate-605 leading-snug">
                          {formattedBody}
                        </p>
                        <p className="text-[9px] text-slate-405 font-medium pt-0.5">
                          {new Date(n.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                        </p>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Footer */}
            <div className="bg-slate-50 px-4 py-3 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setMainTaskNotifModalOpen(false)}
                className="w-full sm:w-auto px-5 py-2 text-xs font-bold text-slate-700 bg-slate-200 hover:bg-slate-300 rounded-xl transition-all cursor-pointer text-center"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revision Modal (ระบุเหตุผลส่งแก้ไข) */}
      {showRevisionModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 text-rose-600 font-bold text-sm">
                <RotateCcw className="w-5 h-5" />
                <span>ส่งแก้ไขงานย่อย</span>
              </div>
              <button
                type="button"
                onClick={() => setShowRevisionModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-slate-500 font-medium">
                รายการงานย่อย: <span className="font-bold text-slate-800">{editingList?.name}</span>
              </p>
              <p className="text-[11px] text-slate-400">
                เมื่อส่งแก้ไข ระบบจะปรับสถานะงานเป็น <span className="font-bold text-rose-600">"แก้ไข"</span> และแจ้งเตือนผู้รับผิดชอบงานนี้ทันที
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">
                เหตุผล / รายละเอียดที่ต้องแก้ไข <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={4}
                value={revisionReasonInput}
                onChange={(e) => setRevisionReasonInput(e.target.value)}
                placeholder="ระบุจุดที่ต้องปรับปรุง หรือข้อเสนอแนะเพิ่มเติม..."
                autoFocus
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500 focus:bg-white text-slate-800 resize-none font-normal"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowRevisionModal(false)}
                disabled={isSubmittingRevision}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => handleSubmitRevision(revisionReasonInput)}
                disabled={isSubmittingRevision}
                className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
              >
                {isSubmittingRevision ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>กำลังส่งแก้ไข...</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>ยืนยันส่งแก้ไข</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
