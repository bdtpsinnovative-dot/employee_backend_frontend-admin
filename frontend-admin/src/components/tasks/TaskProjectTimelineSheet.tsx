import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Tag,
  Layers,
  FileText,
  X,
  Link2,
  Filter,
  Trash2,
  Save,
  Paperclip,
  Plus,
  PlusCircle,
  CheckCircle2,
  Users
} from 'lucide-react';
import type { AdminTask, User, Brand, TaskCategory, TaskList } from '../../types';
import { avatarUrl } from './taskUtils';
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
  deleteTaskSubItem,
  createSubItemVerification,
  uploadFile,
} from '../../services/adminApi';

const isValidUUID = (id: string): boolean => {
  if (!id) return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

interface TaskProjectTimelineSheetProps {
  task: AdminTask;
  userMap: Record<string, User>;
  brandMap: Record<string, Brand>;
  categoryMap: Record<string, TaskCategory>;
  onBack?: () => void;
  onRefreshTask: (silent?: boolean) => void;
  currentUser: User | null;
}

export const TaskProjectTimelineSheet: React.FC<TaskProjectTimelineSheetProps> = ({
  task,
  userMap,
  brandMap,
  categoryMap,
  onBack,
  onRefreshTask,
  currentUser: _currentUser,
}) => {
  const [trelloLists, setTrelloLists] = useState<TaskList[]>([]);
  const users = Object.values(userMap);
  const [loading, setLoading] = useState(true);
  const [drawerAssignees, setDrawerAssignees] = useState<string[]>([]);
  const [showCreateListModal, setShowCreateListModal] = useState(false);
  const [showDrawerInvitePopover, setShowDrawerInvitePopover] = useState(false);
  const [drawerActiveTab, setDrawerActiveTab] = useState<'info' | 'attachments'>('info');

  // Custom premium modal states
  const [activeModal, setActiveModal] = useState<'add_card' | 'attach_file' | 'attach_link' | 'verify_subitem' | null>(null);
  const [modalTitle, setModalTitle] = useState('');
  const [modalInputVal1, setModalInputVal1] = useState('');
  const [modalSelectVal, setModalSelectVal] = useState<'pass' | 'fail'>('pass');
  const [isModalSubmitting, setIsModalSubmitting] = useState(false);
  const [modalTargetId, setModalTargetId] = useState<string | null>(null);
  const [modalScope, setModalScope] = useState<'list' | 'card'>('card');
  const fileInputRef = useRef<HTMLInputElement>(null);
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
  const [drawerAttachments, setDrawerAttachments] = useState<{ name: string; url: string; type: 'file' | 'link' }[]>([]);
  const [drawerDueDate, setDrawerDueDate] = useState('');
  const [drawerPriority, setDrawerPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [drawerStatus, setDrawerStatus] = useState<'in_progress' | 'completed'>('in_progress');
  const [drawerComment, setDrawerComment] = useState('');
  const [isSavingDrawer, setIsSavingDrawer] = useState(false);


  // Create List Modal State
  const [createListName, setCreateListName] = useState('');
  const [createListDueDate, setCreateListDueDate] = useState('');
  const [createListPriority, setCreateListPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [createListFirstCardName, setCreateListFirstCardName] = useState('');
  const [createListAssigneeIds, setCreateListAssigneeIds] = useState<string[]>([]);
  const [createListDescription, setCreateListDescription] = useState('');
  const [showInvitePopover, setShowInvitePopover] = useState(false);
  const [isCreatingList, setIsCreatingList] = useState(false);

  // Filter Toolbar State
  type FilterMode = 'all' | 'pending' | 'overdue' | 'high_priority' | 'completed';
  const [activeFilter, setActiveFilter] = useState<FilterMode>('all');

  const todayStr = new Date().toISOString().split('T')[0];

  const loadSubItems = async () => {
    try {
      const lists = await fetchTaskTrello(task.id).catch(() => []);
      setTrelloLists(lists);
    } catch (err) {
      console.error('Failed to load trello lists', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubItems();
  }, [task.id]);

  const handleToggleListStatus = async (list: TaskList, currentStatus?: string) => {
    const newStatus = currentStatus === 'completed' ? 'in_progress' : 'completed';
    try {
      await updateTaskList(list.id, { status: newStatus });
      await loadSubItems();
      onRefreshTask(true);
    } catch (err) {
      console.error('Failed to toggle status', err);
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

      const updatedLists = await fetchTaskTrello(task.id).catch(() => []);
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
      alert('บันทึกข้อมูลการ์ดงานสำเร็จ');
    } catch (err) {
      console.error('Failed to save card', err);
      alert('บันทึกการ์ดงานล้มเหลว');
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
      const updatedLists = await fetchTaskTrello(task.id).catch(() => []);
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
    if (!confirm('ต้องการลบรายการย่อยนี้ใช่หรือไม่?')) return;
    try {
      await deleteTaskSubItem(itemId);
      const updatedLists = await fetchTaskTrello(task.id).catch(() => []);
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
      const updatedLists = await fetchTaskTrello(task.id).catch(() => []);
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
            name: modalInputVal1.trim(),
            url: modalInputVal1.trim(),
            type: 'link',
          },
        ]);
        setActiveModal(null);
      } else {
        if (!editingCardSubView) return;
        await createCardAttachment(editingCardSubView.id, {
          name: modalInputVal1.trim(),
          url: modalInputVal1.trim(),
          type: 'link',
        });
        const updatedLists = await fetchTaskTrello(task.id).catch(() => []);
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
    if (!confirm('ต้องการลบไฟล์แนบนี้ใช่หรือไม่?')) return;
    try {
      await deleteCardAttachment(attId);
      const updatedLists = await fetchTaskTrello(task.id).catch(() => []);
      setTrelloLists(updatedLists);
      const updatedList = updatedLists.find(l => l.id === editingList?.id);
      if (updatedList) {
        setEditingList(updatedList);
        const updatedCard = updatedList.cards?.find(c => c.id === editingCardSubView.id);
        if (updatedCard) setCardAttachmentsInput(updatedCard.attachments || []);
      }
      onRefreshTask(true);
    } catch (err) {
      console.error('Failed to delete attachment', err);
    }
  };

  const handleDeleteCard = async (cardId: string) => {
    if (!window.confirm('คุณต้องการลบการ์ดงานนี้ใช่หรือไม่?')) return;
    try {
      await deleteTaskCard(cardId);
      const updatedLists = await fetchTaskTrello(task.id).catch(() => []);
      setTrelloLists(updatedLists);
      if (editingList) {
        const updatedList = updatedLists.find(l => l.id === editingList.id);
        if (updatedList) setEditingList(updatedList);
      }
      onRefreshTask(true);
    } catch (err) {
      console.error('Failed to delete card', err);
    }
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
          alert('อัปโหลดไฟล์สำเร็จ');
        } else {
          if (editingCardSubView) {
            await createCardAttachment(editingCardSubView.id, { name, url: res.url, type: 'file' });
            const updatedLists = await fetchTaskTrello(task.id).catch(() => []);
            setTrelloLists(updatedLists);
            const updatedList = updatedLists.find(l => l.id === editingList?.id);
            if (updatedList) {
              setEditingList(updatedList);
              const updatedCard = updatedList.cards?.find(c => c.id === editingCardSubView.id);
              if (updatedCard) setCardAttachmentsInput(updatedCard.attachments || []);
            }
            onRefreshTask(true);
            alert('อัปโหลดไฟล์แนบในการ์ดสำเร็จ');
          }
        }
      } else {
        alert('อัปโหลดไฟล์ล้มเหลว');
      }
    } catch (err) {
      console.error(err);
      alert('อัปโหลดไฟล์ล้มเหลว');
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
      const updatedLists = await fetchTaskTrello(task.id).catch(() => []);
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

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createListName.trim()) return;
    setIsCreatingList(true);
    try {
      const newList = await createTaskList(task.id, {
        name: createListName.trim(),
        due_date: createListDueDate || undefined,
        priority: createListPriority,
        status: 'in_progress',
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
    if (!window.confirm('คุณต้องการลบรายการนี้ใช่หรือไม่?')) return;
    try {
      await deleteTaskList(listId);
      await loadSubItems();
      onRefreshTask(true);
    } catch (err) {
      console.error('Failed to delete list', err);
    }
  };

  const handleOpenExternalUrl = (url: string) => {
    if (!url) return;
    let targetUrl = url.trim();
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
    
  };

  const brand = brandMap[task.brand_id || ''];
  const category = categoryMap[task.category_id || ''];

  const displayLists = trelloLists.length > 0 ? trelloLists : (task.lists || []);

  const fallbackLists: TaskList[] = [
    { id: 'phase-1', name: 'Phase 1', task_id: task.id, sort_order: 1, created_at: new Date().toISOString(), priority: 'medium', status: 'in_progress' },
    { id: 'phase-2', name: 'Phase 2', task_id: task.id, sort_order: 2, created_at: new Date().toISOString(), priority: 'medium', status: 'in_progress' },
    { id: 'phase-3', name: 'Phase 3', task_id: task.id, sort_order: 3, created_at: new Date().toISOString(), priority: 'medium', status: 'in_progress' },
    { id: 'phase-4', name: 'Phase 4', task_id: task.id, sort_order: 4, created_at: new Date().toISOString(), priority: 'medium', status: 'in_progress' },
  ];

  const effectiveLists = displayLists.length > 0 ? displayLists : fallbackLists;

  const filteredLists = effectiveLists.filter((list) => {
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

  const renderedRows = filteredLists.map((list: TaskList) => {
    const listPriority = list.priority || 'medium';
    const listStatus = list.status || 'in_progress';
    const listDetails = list.description || '';
    const listNote = list.admin_comment || '';

    return (
      <tr key={list.id} onClick={() => openDrawerForList(list)} className="hover:bg-blue-50/50 hover:border-blue-300 transition-colors border-b border-slate-200 cursor-pointer">
        {/* 1. DUE DATE */}
        <td className="px-3 py-3 border-r border-slate-200 text-center align-middle text-slate-700 font-mono text-[11px] font-bold bg-slate-50/70">
          {list.due_date ? new Date(list.due_date).toLocaleDateString('th-TH') : '-'}
        </td>

        {/* 2. PROJECT */}
        <td 
          className="px-4 py-3 border-r border-slate-200 align-middle font-bold text-blue-900 bg-blue-50/40 transition-colors"
        >
          <span className="bg-amber-100/50 text-amber-900 px-2 py-1 rounded-md text-xs font-bold leading-tight">
            {list.name}
          </span>
        </td>

        {/* 3. PRIORITY */}
        <td className="px-3 py-2 border-r border-slate-200 text-center align-middle">
          <div className="flex items-center justify-center">
            <span className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full border ${
              listPriority === 'high' ? 'bg-red-50 text-red-800 border-red-200' :
              listPriority === 'medium' ? 'bg-amber-50 text-amber-800 border-amber-200' :
              'bg-emerald-50 text-emerald-800 border-emerald-200'
            }`}>
              {listPriority.charAt(0).toUpperCase() + listPriority.slice(1)}
            </span>
          </div>
        </td>

        {/* 4. DETAILS */}
        <td className="px-4 py-3 border-r border-slate-200 align-middle text-slate-700 text-xs max-w-[250px]">
          <div className="line-clamp-2" title={listDetails}>{listDetails || '-'}</div>
        </td>

        {/* 5. ASSIGNMENT */}
        <td className="px-3 py-2 border-r border-slate-200 text-center align-middle">
          <div className="flex items-center justify-center -space-x-1">
            {list.assignee_ids && list.assignee_ids.length > 0 ? (
              list.assignee_ids.map((uid) => {
                const u = userMap[uid];
                if (!u) return null;
                return (
                  <img
                    key={u.id}
                    src={avatarUrl(u.avatar_url) || undefined}
                    alt={u.nickname || u.first_name}
                    className="w-6 h-6 rounded-full object-cover border border-white shadow-2xs"
                    title={`${u.nickname || u.first_name} (${u.department})`}
                  />
                );
              })
            ) : (
              <span className="text-slate-400">-</span>
            )}
          </div>
        </td>

        {/* 6. STATUS */}
        <td className="px-3 py-2 border-r border-slate-200 text-center align-middle">
          <span className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full border ${
            listStatus === 'completed' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-amber-100 text-amber-900 border-amber-300'
          }`}>
            {listStatus === 'completed' ? 'Done' : 'Doing'}
          </span>
        </td>

        {/* 7. LIST */}
        <td className="px-3 py-2 border-r border-slate-200 text-center align-middle" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={listStatus === 'completed'}
            onChange={() => handleToggleListStatus(list, listStatus)}
            className="w-3.5 h-3.5 text-blue-600 rounded cursor-pointer border-slate-300 focus:ring-blue-500/20"
          />
        </td>

        {/* 8. NOTE / REMARK */}
        <td className="px-4 py-3 border-r border-slate-200 align-middle text-slate-700 text-xs max-w-[250px]">
          <div className="line-clamp-2" title={listNote}>{listNote || '-'}</div>
        </td>

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
      <div className="p-4 md:p-6 space-y-6">
        {/* Back button */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 bg-white border border-slate-200 hover:bg-slate-50 rounded-full shadow-2xs transition-all active:scale-95 cursor-pointer"
            title="ย้อนกลับ"
          >
            <ArrowLeft className="w-4 h-4 text-slate-500" />
          </button>
          <span className="text-xs font-bold text-slate-500">ย้อนกลับ</span>
        </div>
        {/* Spreadsheet Header Banner */}
        <div className="bg-white border-2 border-slate-300 rounded-2xl shadow-xs overflow-hidden">
          <div className="bg-slate-900 p-6 text-white border-b-4 border-blue-600">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-2xl md:text-3xl font-black tracking-wider uppercase text-blue-300 font-mono">
                  {task.title}
                </h1>
                <p className="text-slate-400 text-xs mt-1 font-semibold">
                  แผ่นงานแสดงลำดับเวลาโครงการ (Project Timeline Sheet & Action Items)
                </p>
              </div>

              {/* Action Toolbar */}
              <div className="flex items-center gap-2">
                {brand && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-extrabold bg-blue-900/60 text-blue-200 rounded-xl border border-blue-800">
                    <Tag className="w-3.5 h-3.5 text-blue-400" />
                    <span>{brand.name}</span>
                  </span>
                )}
                {category && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-extrabold bg-indigo-900/60 text-indigo-200 rounded-xl border border-indigo-800">
                    <Layers className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{category.name}</span>
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setShowCreateListModal(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>เพิ่มคอร์สงาน</span>
                </button>
              </div>
            </div>

            {/* Filter Row */}
            <div className="flex flex-wrap items-center gap-2 mt-6 pt-6 border-t border-slate-800/80">
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
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
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
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
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
                    : 'bg-slate-800 text-red-400 border-red-950/20 hover:bg-slate-700'
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
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
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
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                เสร็จสิ้นแล้ว
              </button>
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs font-sans min-w-[950px]">
              <thead>
                <tr className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200 select-none">
                  <th className="px-3 py-3 w-28 text-center border-r border-slate-200">DUE DATE</th>
                  <th className="px-2 py-3 border-r border-slate-200 w-32 min-w-[120px] text-center">PROJECT</th>
                  <th className="px-3 py-3 w-24 text-center border-r border-slate-200">PRIORITY</th>
                  <th className="px-4 py-3 border-r border-slate-200 w-1/4 max-w-[250px]">DETAILS</th>
                  <th className="px-3 py-3 w-28 text-center border-r border-slate-200">ASSIGNMENT</th>
                  <th className="px-3 py-3 w-24 text-center border-r border-slate-200">STATUS</th>
                  <th className="px-2 py-3 w-16 text-center border-r border-slate-200">LIST</th>
                  <th className="px-4 py-3 border-r border-slate-200 w-1/4 max-w-[250px]">NOTE / REMARK</th>
                  <th className="px-2 py-3 w-[80px] text-center">LINK / FILES</th>
                </tr>
              </thead>
              <tbody className="divide-y-0 bg-white font-medium">
                {renderedRows}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Edit List Drawer */}
      {editingList && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-xs flex justify-end">
          <div className="bg-white w-full max-w-lg h-full shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-200">
{editingCardSubView ? (
              <div className="bg-slate-900 text-white p-5 flex items-center gap-3 border-b-4 border-blue-600">
                <button
                  type="button"
                  onClick={() => setEditingCardSubView(null)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-6 h-6" />
                </button>
                <div className="flex flex-col">
                  <span className="text-sm font-extrabold tracking-wide uppercase">การ์ดงาน</span>
                  <span className="text-[10px] text-slate-400 font-medium">รายการย่อย, ไฟล์หลักฐาน, รายละเอียดการ์ดงาน และความคิดเห็นจากผู้ดูแล</span>
                </div>
              </div>
            ) : (
              <div className="bg-slate-900 text-white p-5 flex items-center justify-between border-b-4 border-blue-600">
                <div className="flex items-center gap-2.5">
                  <FileText className="w-5 h-5 text-indigo-400" />
                  <span className="text-sm font-extrabold tracking-wide uppercase">แก้ไขข้อมูลคอร์สงาน</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      if (editingList) {
                        await handleDeleteList(editingList.id);
                        setEditingList(null);
                      }
                    }}
                    className="p-1 text-slate-400 hover:text-red-500 rounded-lg transition-colors cursor-pointer"
                    title="ลบรายการคอร์สงานนี้"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingList(null)}
                    className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
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
                              onClick={() => handleDeleteCardAttachment(att.id)}
                              className="text-rose-500 p-1 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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
                      const u = users.find(x => x.id === uid);
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
                      className="w-8 h-8 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400 hover:border-slate-500 hover:text-slate-600 transition-all cursor-pointer bg-slate-50"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  {showCardAssigneePopover && (
                    <div className="absolute z-[70] bottom-full mb-2 bg-white border border-slate-200 rounded-xl shadow-lg p-2 max-h-40 overflow-y-auto w-64 animate-in fade-in slide-in-from-bottom-2 duration-150">
                      {users.map(u => {
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
                            className="w-full flex items-center justify-between p-1.5 hover:bg-slate-50 rounded-lg text-left text-xs font-semibold cursor-pointer"
                          >
                            <div className="flex items-center gap-2">
                              <img src={avatarUrl(u?.avatar_url) || undefined} className="w-5 h-5 rounded-full object-cover" />
                              <span>{u.nickname || u.first_name}</span>
                            </div>
                            {isAssigned && <span className="text-blue-600 font-bold">✓</span>}
                          </button>
                        );
                      })}
                    </div>
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
                        <option value="low">Low (ต่ำ)</option>
                        <option value="medium">Medium (ปานกลาง)</option>
                        <option value="high">High (สูง)</option>
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
                      <option value="in_progress">Doing (กำลังทำ)</option>
                      <option value="completed">Completed (เสร็จสิ้น)</option>
                    </select>
                  </div>

                  {/* มอบหมายให้ (Assignees) */}
                  <div className="space-y-1.5 relative">
                    <label className="text-xs font-bold text-slate-700">มอบหมายให้ (Assignees)</label>
                    <div className="flex flex-wrap items-center gap-2">
                      {drawerAssignees.map(uid => {
                        const u = users.find(x => x.id === uid);
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
                        className="w-8 h-8 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400 hover:border-slate-500 hover:text-slate-600 transition-all cursor-pointer bg-slate-50"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    {showDrawerInvitePopover && (
                      <div className="absolute z-[70] bottom-full mb-2 bg-white border border-slate-200 rounded-xl shadow-lg p-2 max-h-40 overflow-y-auto w-64 animate-in fade-in slide-in-from-bottom-2 duration-150">
                        {users.map(u => {
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
                              className="w-full flex items-center justify-between p-1.5 hover:bg-slate-50 rounded-lg text-left text-xs font-semibold cursor-pointer"
                            >
                              <div className="flex items-center gap-2">
                                <img src={avatarUrl(u?.avatar_url) || undefined} className="w-5 h-5 rounded-full object-cover" />
                                <span>{u.nickname || u.first_name}</span>
                              </div>
                              {isAssigned && <span className="text-blue-600 font-bold">✓</span>}
                            </button>
                          );
                        })}
                      </div>
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

                  {/* เอกสารแนบ & ลิงก์ไฟล์งาน */}
                  <div className="space-y-3 pt-2 border-t border-slate-200">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Paperclip className="w-4 h-4 text-indigo-600" />
                      <span>เอกสารแนบ & ลิงก์ไฟล์งาน (Attachments)</span>
                    </label>
                    
                    {drawerAttachments.length > 0 ? (
                      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                        {drawerAttachments.map((att, idx) => (
                          <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                            <div className="flex items-center gap-2 truncate min-w-0">
                              {att.type === 'link' ? <Link2 className="w-4 h-4 text-indigo-600 shrink-0" /> : <Paperclip className="w-4 h-4 text-blue-600 shrink-0" />}
                              <span className="truncate font-semibold text-slate-800">{att.name || att.url}</span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleOpenExternalUrl(att.url)}
                                className="text-xs text-indigo-600 hover:underline font-bold cursor-pointer"
                              >
                                เปิด
                              </button>
                              <button
                                type="button"
                                onClick={() => setDrawerAttachments(drawerAttachments.filter((_, i) => i !== idx))}
                                className="text-rose-500 hover:text-rose-700 p-1 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic text-center py-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">ยังไม่มีเอกสารแนบในคอร์สงานนี้</p>
                    )}

                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setModalScope('list');
                          fileInputRef.current?.click();
                        }}
                        className="flex items-center justify-center gap-1.5 p-2 border border-dashed border-indigo-300 hover:border-indigo-500 rounded-xl text-indigo-700 text-xs font-bold transition-all active:scale-95 cursor-pointer bg-indigo-50/20"
                      >
                        <Paperclip className="w-4 h-4 text-indigo-600" />
                        <span>แนบไฟล์ (ลิงก์)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setModalTitle('แนบลิงก์ภายนอก');
                          setModalInputVal1('');
                          setModalScope('list');
                          setActiveModal('attach_link');
                        }}
                        className="flex items-center justify-center gap-1.5 p-2 border border-dashed border-emerald-300 hover:border-emerald-500 rounded-xl text-emerald-700 text-xs font-bold transition-all active:scale-95 cursor-pointer bg-emerald-50/20"
                      >
                        <Link2 className="w-4 h-4 text-emerald-600" />
                        <span>แนบลิงก์</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

              </>
            )}

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
              {editingCardSubView ? (
                <>
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
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setEditingList(null)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-all cursor-pointer"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveDrawer}
                    disabled={isSavingDrawer}
                    className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    <span>{isSavingDrawer ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}</span>
                  </button>
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
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
              <h3 className="font-extrabold text-sm flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-blue-400" />
                <span>เพิ่มบอร์ดงานใหม่</span>
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowCreateListModal(false);
                  setShowInvitePopover(false);
                }}
                className="text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Form */}
            <form onSubmit={handleCreateList}>
              <div className="p-6 space-y-4">
                {/* 1. ชื่อบอร์ดงาน */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">ชื่อบอร์ดงาน (Project Name) <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={createListName}
                    onChange={(e) => setCreateListName(e.target.value)}
                    required
                    placeholder="เช่น ออกแบบหน้าเว็บ..."
                    className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-800"
                  />
                </div>

                {/* 2. รายละเอียดบอร์ดงาน */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">รายละเอียดบอร์ดงาน (Board Details/Description)</label>
                  <textarea
                    rows={3}
                    value={createListDescription}
                    onChange={(e) => setCreateListDescription(e.target.value)}
                    placeholder="รายละเอียดเพิ่มเติมของบอร์ดงาน..."
                    className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-normal text-slate-800"
                  />
                </div>

                {/* 3. กำหนดส่ง & ความสำคัญ */}
                <div className="grid grid-cols-2 gap-3">
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
                    <label className="text-xs font-bold text-slate-700">ความสำคัญ (Priority)</label>
                    <select
                      value={createListPriority}
                      onChange={(e) => setCreateListPriority(e.target.value as any)}
                      className="w-full px-3 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800"
                    >
                      <option value="low">Low (ต่ำ)</option>
                      <option value="medium">Medium (ปานกลาง)</option>
                      <option value="high">High (สูง)</option>
                    </select>
                  </div>
                </div>

                {/* 4. มอบหมายให้ */}
                <div className="space-y-1.5 relative">
                  <label className="text-xs font-bold text-slate-700">มอบหมายให้</label>
                  <div className="flex flex-wrap items-center gap-2">
                    {createListAssigneeIds.map(uid => {
                      const u = users.find(x => x.id === uid);
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
                      className="w-8 h-8 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400 hover:border-slate-500 hover:text-slate-600 transition-all cursor-pointer bg-slate-50"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  {showInvitePopover && (
                    <div className="absolute z-[70] bottom-full mb-2 bg-white border border-slate-200 rounded-xl shadow-lg p-2 max-h-40 overflow-y-auto w-64 animate-in fade-in slide-in-from-bottom-2 duration-150">
                      {users.map(u => {
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
                            className="w-full flex items-center justify-between p-1.5 hover:bg-slate-50 rounded-lg text-left text-xs font-semibold cursor-pointer"
                          >
                            <div className="flex items-center gap-2">
                              <img src={avatarUrl(u?.avatar_url) || undefined} className="w-5 h-5 rounded-full object-cover" />
                              <span>{u.nickname || u.first_name}</span>
                            </div>
                            {isAssigned && <span className="text-blue-600 font-bold">✓</span>}
                          </button>
                        );
                      })}
                    </div>
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
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between border-b-2 border-blue-600">
              <span className="text-xs font-black uppercase tracking-wider">{modalTitle}</span>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="text-slate-400 hover:text-white transition-colors cursor-pointer"
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

              {activeModal === 'attach_link' && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 uppercase">URL ลิงก์ภายนอก</label>
                  <input
                    type="text"
                    value={modalInputVal1}
                    onChange={(e) => setModalInputVal1(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold text-slate-800"
                    autoFocus
                  />
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
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
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
                  (activeModal === 'attach_link' && !modalInputVal1.trim())
                }
                onClick={() => {
                  if (activeModal === 'add_card') submitAddNewCard();
                  else if (activeModal === 'attach_link') submitAddCardAttachmentLink();
                  else if (activeModal === 'verify_subitem') submitVerifySubItem();
                }}
                className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
              >
                {isModalSubmitting ? 'กำลังบันทึก...' : 'ตกลง'}
              </button>
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
    </>
  );
};
