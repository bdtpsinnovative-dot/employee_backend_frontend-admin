import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  CheckSquare,
  Square,
  Flame,
  Tag,
  Layers,
  ExternalLink,
  FileText,
  X,
  Link2,
  Filter,
  AlertCircle,
  Edit3,
  Trash2,
  Save,
  Paperclip,
  CheckCircle2,
  Users,
  History,
  Plus,
} from 'lucide-react';
import type { AdminTask, User, Brand, TaskCategory, TaskSubItem, TaskList, TaskCard } from '../../types';
import { avatarUrl } from './taskUtils';
import {
  fetchTaskSubItems,
  createTaskCard,
  toggleTaskSubItem,
  deleteTaskSubItem,
  fetchTaskTrello,
  updateTaskCard,
  updateTaskList,
} from '../../services/adminApi';

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
  brandMap: _brandMap,
  categoryMap: _categoryMap,
  onBack: _onBack,
  onRefreshTask,
  currentUser,
}) => {
  const [subItems, setSubItems] = useState<TaskSubItem[]>([]);
  const [trelloLists, setTrelloLists] = useState<TaskList[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerAssignees, setDrawerAssignees] = useState<string[]>([]);
  const [showInvitePopover, setShowInvitePopover] = useState(false);

  // Filter Toolbar State
  type FilterMode = 'all' | 'pending' | 'overdue' | 'high_priority' | 'completed';
  const [activeFilter, setActiveFilter] = useState<FilterMode>('all');

  const todayStr = new Date().toISOString().split('T')[0];

  const filterCard = (card: TaskCard) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'completed') return card.status === 'completed';
    if (activeFilter === 'pending') return card.status !== 'completed';
    if (activeFilter === 'high_priority') return card.priority === 'high' || card.priority === 'urgent';
    if (activeFilter === 'overdue') {
      if (card.status === 'completed') return false;
      const isCardOverdue = card.due_date ? card.due_date.split('T')[0] < todayStr : false;
      const isSubOverdue = card.sub_items?.some(
        (s) => !s.is_done && s.due_date && s.due_date.split('T')[0] < todayStr
      );
      return isCardOverdue || isSubOverdue;
    }
    return true;
  };

  const filterSubItem = (item: TaskSubItem) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'completed') return item.is_done;
    if (activeFilter === 'pending') return !item.is_done;
    if (activeFilter === 'high_priority') return item.priority === 'high';
    if (activeFilter === 'overdue') {
      return !item.is_done && !!(item.due_date && item.due_date.split('T')[0] < todayStr);
    }
    return true;
  };

  // Right Sidebar Edit Drawer State
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<TaskCard | null>(null);
  const [editingList, setEditingList] = useState<TaskList | null>(null);
  const [drawerTitle, setDrawerTitle] = useState('');
  const [drawerDueDate, setDrawerDueDate] = useState('');
  const [drawerPriority, setDrawerPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [drawerStatus, setDrawerStatus] = useState<'pending' | 'in_progress' | 'completed'>('in_progress');
  const [drawerComment, setDrawerComment] = useState('');
  const [isSavingDrawer, setIsSavingDrawer] = useState(false);

  // Selected Sub-item for "การดำเนินการรายการย่อย" Drawer
  const [editingSubItem, setEditingSubItem] = useState<TaskSubItem | null>(null);
  const [subTitle, setSubTitle] = useState('');
  const [subStartDate, setSubStartDate] = useState('');
  const [subDueDate, setSubDueDate] = useState('');
  const [subLinkUrl, setSubLinkUrl] = useState('');
  const [subAttachmentUrl, setSubAttachmentUrl] = useState('');
  const [subRequirements, setSubRequirements] = useState('');
  const [subVerificationResult, setSubVerificationResult] = useState<'pass' | 'fail' | null>(null);
  const [subVerificationNotes, setSubVerificationNotes] = useState('');
  const [subAdminComment, setSubAdminComment] = useState('');
  const [isSavingSubDrawer, setIsSavingSubDrawer] = useState(false);

  const openDrawerForSubItem = (sub: TaskSubItem) => {
    setEditingSubItem(sub);
    setEditingCard(null);
    setEditingList(null);
    setSubTitle(sub.title);
    setSubStartDate((sub as any).start_date ? (sub as any).start_date.split('T')[0] : '');
    setSubDueDate(sub.due_date ? sub.due_date.split('T')[0] : '');
    setSubLinkUrl(sub.link_url && !sub.link_url.includes('example.com') ? sub.link_url : '');
    setSubAttachmentUrl(sub.attachment_url || '');
    setSubRequirements(sub.notes || '');
    setSubVerificationResult(sub.is_done ? 'pass' : null);
    setSubVerificationNotes(sub.verification_notes || '');
    setSubAdminComment(sub.admin_comment || '');
    setIsDrawerOpen(true);
  };

  const handleSaveSubDrawer = async () => {
    if (!editingSubItem) return;
    setIsSavingSubDrawer(true);
    try {
      editingSubItem.title = subTitle;
      (editingSubItem as any).start_date = subStartDate || undefined;
      editingSubItem.due_date = subDueDate || undefined;
      editingSubItem.link_url = subLinkUrl.trim() || undefined;
      editingSubItem.attachment_url = subAttachmentUrl.trim() || undefined;
      editingSubItem.notes = subRequirements.trim() || undefined;
      editingSubItem.is_done = subVerificationResult === 'pass';
      editingSubItem.verification_notes = subVerificationNotes.trim() || undefined;
      editingSubItem.admin_comment = subAdminComment.trim() || undefined;

      setSubItems((prev) =>
        prev.map((s) => (s.id === editingSubItem.id ? { ...editingSubItem } : s))
      );

      await loadSubItems();
      onRefreshTask(true);
      setIsDrawerOpen(false);
    } catch (err: any) {
      alert(err.message || 'บันทึกข้อมูลล้มเหลว');
    } finally {
      setIsSavingSubDrawer(false);
    }
  };

  // New Sub-Item in Drawer state
  const [newSubTitle, setNewSubTitle] = useState('');
  const [newSubDueDate, setNewSubDueDate] = useState('');

  const openDrawerForCard = (card: TaskCard, list?: TaskList) => {
    setEditingSubItem(null);
    setEditingCard(card);
    setEditingList(list || null);
    setDrawerTitle(card.title);
    setDrawerDueDate(card.due_date ? card.due_date.split('T')[0] : '');
    setDrawerPriority((card.priority as any) || 'medium');
    setDrawerStatus(card.status === 'completed' ? 'completed' : 'in_progress');
    setDrawerComment(card.description || card.admin_comment || '');
    setDrawerAssignees(card.assignee_ids || []);
    setShowInvitePopover(false);
    setIsDrawerOpen(true);
  };

  const openDrawerForList = (list: TaskList) => {
    setEditingSubItem(null);
    setEditingList(list);
    setEditingCard(null);
    setDrawerTitle(list.name);
    setDrawerDueDate(list.due_date ? list.due_date.split('T')[0] : task.due_date ? task.due_date.split('T')[0] : '');
    setDrawerPriority('medium');
    setDrawerStatus('in_progress');
    setDrawerComment('');
    setDrawerAssignees(list.assignee_ids || []);
    setShowInvitePopover(false);
    setIsDrawerOpen(true);
  };

  const handleSaveDrawer = async () => {
    setIsSavingDrawer(true);
    try {
      if (editingCard) {
        await updateTaskCard(editingCard.id, {
          title: drawerTitle,
          due_date: drawerDueDate || undefined,
          priority: drawerPriority,
          status: drawerStatus,
          description: drawerComment,
          assignee_ids: drawerAssignees,
        });

        if (newSubTitle.trim()) {
          await createTaskCard(editingCard.list_id, {
            title: newSubTitle.trim(),
            priority: drawerPriority,
            due_date: newSubDueDate || undefined,
          });
          setNewSubTitle('');
          setNewSubDueDate('');
        }
      } else if (editingList) {
        await updateTaskList(editingList.id, {
          name: drawerTitle,
          due_date: drawerDueDate || undefined,
          assignee_ids: drawerAssignees,
        });

        if (newSubTitle.trim()) {
          await createTaskCard(editingList.id, {
            title: newSubTitle.trim(),
            priority: drawerPriority,
            due_date: newSubDueDate || undefined,
          });
          setNewSubTitle('');
          setNewSubDueDate('');
        }
      }

      await loadSubItems();
      onRefreshTask(true);
      setIsDrawerOpen(false);
    } catch (err: any) {
      alert(err.message || 'บันทึกข้อมูลล้มเหลว');
    } finally {
      setIsSavingDrawer(false);
    }
  };

  const handleDeleteSubItem = async (subId: string) => {
    if (!confirm('ต้องการลบรายการย่อยนี้หรือไม่?')) return;
    try {
      await deleteTaskSubItem(subId);
      await loadSubItems();
      onRefreshTask(true);
      if (editingCard) {
        setEditingCard({
          ...editingCard,
          sub_items: editingCard.sub_items?.filter((s) => s.id !== subId),
        });
      }
    } catch (e: any) {
      alert(e.message || 'ลบไม่สำเร็จ');
    }
  };

  // Document Link Modal State
  const [activeDocumentItem, setActiveDocumentItem] = useState<{ id: string; title: string; link_url?: string } | null>(null);
  const [editLinkUrl, setEditLinkUrl] = useState('');

  const formatDateDDMM = (dateStr?: string) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}`;
  };

  const loadSubItems = async () => {
    setLoading(true);
    try {
      const [items, lists] = await Promise.all([
        fetchTaskSubItems(task.id),
        fetchTaskTrello(task.id).catch(() => []),
      ]);
      setSubItems(items);
      setTrelloLists(lists);
    } catch (err) {
      console.error('Failed to load sub items or trello lists', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubItems();
  }, [task.id]);

  const handleToggleDone = async (item: TaskSubItem) => {
    try {
      const updated = await toggleTaskSubItem(item.id);
      setSubItems((prev) =>
        prev.map((s) => (s.id === item.id ? { ...s, is_done: updated.is_done } : s))
      );
      onRefreshTask(true);
    } catch (e: any) {
      alert(e.message || 'สลับสถานะไม่สำเร็จ');
    }
  };

  const handleSaveDocumentLink = () => {
    if (!activeDocumentItem) return;
    const updatedUrl = editLinkUrl.trim();

    setSubItems((prev) =>
      prev.map((s) => (s.id === activeDocumentItem.id ? { ...s, link_url: updatedUrl } : s))
    );

    setActiveDocumentItem(null);
  };

  const handleOpenExternalUrl = (url?: string) => {
    if (!url || url.includes('example.com')) return;
    let targetUrl = url;
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = `https://${targetUrl}`;
    }
    window.open(targetUrl, '_blank', 'noopener,noreferrer');
  };

  const displayLists = trelloLists.length > 0 ? trelloLists : (task.lists || []);
  const displaySubItems = subItems.length > 0 ? subItems : (task.sub_items || []);

  // Demo fallback rows without broken placeholder URLs
  const defaultDemoItems: TaskSubItem[] = [
    {
      id: 'demo-1',
      task_id: task.id,
      title: 'ติดต่อ Shipping',
      is_done: true,
      sort_order: 1,
      created_at: new Date().toISOString(),
      phase: '1',
      priority: 'medium',
      due_date: '2026-07-14',
      notes: 'Logistic Shipping / Freight forwarder',
    },
    {
      id: 'demo-2',
      task_id: task.id,
      title: 'หา Freight Forwarder มาเทียบราคา',
      is_done: true,
      sort_order: 2,
      created_at: new Date().toISOString(),
      phase: '1',
      priority: 'medium',
      due_date: '2026-07-15',
    },
    {
      id: 'demo-3',
      task_id: task.id,
      title: 'การใช้การของแบรนด์คู่แข่งโดยเฉพาะ MCM',
      is_done: true,
      sort_order: 3,
      created_at: new Date().toISOString(),
      phase: '2',
      priority: 'low',
      due_date: '2026-02-16',
      notes: '1. compare กลุ่มกระเบื้อง\n- แบรนด์อะไรบ้าง\n- แบรนด์เหล่านี้ราคาเท่าไหร่ขนาดเท่าไหร่',
    },
    {
      id: 'demo-4',
      task_id: task.id,
      title: 'สินค้า WallCraft Series ที่ 4',
      is_done: true,
      sort_order: 4,
      created_at: new Date().toISOString(),
      phase: '2',
      priority: 'medium',
      due_date: '2026-03-20',
    },
    {
      id: 'demo-5',
      task_id: task.id,
      title: 'Database ลงข้อมูลโครงการ',
      is_done: true,
      sort_order: 5,
      created_at: new Date().toISOString(),
      phase: '2',
      priority: 'medium',
      due_date: '2026-02-13',
    },
  ];

  const activeSubItems = displaySubItems.length > 0 ? displaySubItems : defaultDemoItems;

  // Group activeSubItems by phase for row-spanning merged phase cells
  const subItemsByPhase: { phase: string; title: string; items: TaskSubItem[] }[] = [];
  const phaseGroupMap: Record<string, TaskSubItem[]> = {};

  activeSubItems.forEach((item) => {
    const pKey = item.phase || '1';
    if (!phaseGroupMap[pKey]) phaseGroupMap[pKey] = [];
    phaseGroupMap[pKey].push(item);
  });

  Object.keys(phaseGroupMap).forEach((pKey) => {
    const items = phaseGroupMap[pKey];
    const defaultPhaseNames: Record<string, string> = {
      '1': 'Partner & Deal With Suppliers',
      '2': 'Market Research & Competitors Analysis',
      '3': 'Product Design & Development',
      '4': 'Production & Quality Control',
    };
    subItemsByPhase.push({
      phase: pKey,
      title: defaultPhaseNames[pKey] || task.title || `Phase ${pKey}`,
      items,
    });
  });

  // Enrich effectiveLists with activeSubItems so ALL sub-items from task_sub_items are always displayed
  const fallbackLists: TaskList[] = [
    { id: 'phase-1', name: 'Phase 1', task_id: task.id, sort_order: 1, created_at: new Date().toISOString() },
    { id: 'phase-2', name: 'Phase 2', task_id: task.id, sort_order: 2, created_at: new Date().toISOString() },
    { id: 'phase-3', name: 'Phase 3', task_id: task.id, sort_order: 3, created_at: new Date().toISOString() },
    { id: 'phase-4', name: 'Phase 4', task_id: task.id, sort_order: 4, created_at: new Date().toISOString() },
  ];

  const effectiveLists: TaskList[] = (displayLists.length > 0 ? displayLists : fallbackLists).map(
    (list: TaskList, listIdx: number) => {
      const phaseNumStr = String(listIdx + 1);
      const existingCards = list.cards || [];
      const phaseSubItems = activeSubItems.filter(
        (s) => s.phase === phaseNumStr || (!s.phase && listIdx === 0)
      );

      if (existingCards.length === 0) {
        if (phaseSubItems.length > 0) {
          const virtualCard: TaskCard = {
            id: `card-phase-${phaseNumStr}`,
            list_id: list.id,
            title: list.name,
            description: '',
            sort_order: 1,
            created_at: new Date().toISOString(),
            status: 'in_progress',
            priority: 'medium',
            due_date: phaseSubItems[0]?.due_date || list.due_date || task.due_date,
            sub_items: phaseSubItems.filter(filterSubItem),
          };
          return {
            ...list,
            cards: [virtualCard],
          };
        }
      } else {
        const cardsWithSubItems = existingCards.map((card: TaskCard) => {
          let ownSubItems: TaskSubItem[] = [];
          if (card.sub_items && card.sub_items.length > 0) {
            ownSubItems = card.sub_items;
          } else {
            ownSubItems = activeSubItems.filter((s) => (s as any).card_id === card.id);
          }
          return {
            ...card,
            sub_items: ownSubItems.filter(filterSubItem),
          };
        });
        return {
          ...list,
          cards: cardsWithSubItems,
        };
      }

      return list;
    }
  );

  // Pre-render rows cleanly with rowSpan merging for items in the same Phase
  const renderedRows = effectiveLists.flatMap((list: TaskList) => {
      const cards = (list.cards || []).filter(filterCard);
      const totalCards = cards.length;

      if (totalCards === 0) {
        return [
          <tr key={list.id} className="hover:bg-blue-50/30 transition-colors border-b-2 border-slate-300">
            <td className="px-3 py-3 border-r border-slate-200 text-center align-middle text-slate-700 font-mono text-[11px] font-bold bg-slate-50/70">
              {list.due_date ? new Date(list.due_date).toLocaleDateString('th-TH') : '-'}
            </td>
            <td className="px-4 py-3 border-r border-slate-200 align-middle font-bold text-blue-900 bg-blue-50/40">
              <div className="text-xs font-bold text-blue-950 leading-tight">
                {list.name}
              </div>
            </td>
            <td colSpan={6} className="px-4 py-3 text-slate-400 italic text-xs">
              ยังไม่มีการ์ดงานย่อยในรายการนี้
            </td>
          </tr>
        ];
      }

      return cards.map((card: TaskCard, cardIdx: number) => {
        const itemPriority = card.priority || 'medium';
        const isDone = card.status === 'completed';
        const isFirstInList = cardIdx === 0;
        const isLastInList = cardIdx === totalCards - 1;

        return (
          <tr
            key={card.id}
            className={`hover:bg-blue-50/30 transition-colors ${
              isLastInList ? 'border-b-2 border-slate-300' : 'border-b border-slate-100/60'
            } ${isDone ? 'bg-slate-50/50' : ''}`}
          >
             {/* 1. Due Date (Card level) */}
             <td className="p-0 border-r border-slate-200 text-center align-top bg-slate-50/50 w-28 min-w-[100px]">
               <div className="h-[36px] px-1 flex items-center justify-center w-full">
                 <input
                   type="date"
                   value={card.due_date ? card.due_date.substring(0, 10) : ''}
                   onChange={(e) => {
                     card.due_date = e.target.value || undefined;
                     setTrelloLists([...trelloLists]);
                   }}
                   className="bg-transparent font-mono text-[11px] text-amber-955 font-bold border-none text-center focus:bg-white focus:ring-1 focus:ring-blue-500 rounded p-1 w-full focus:outline-none cursor-pointer"
                 />
               </div>
             </td>

            {/* 2. PROJECT (Merged across list items - Click to open Right Sidebar Drawer) */}
            {isFirstInList && (
              <td
                rowSpan={totalCards}
                onClick={() => openDrawerForList(list)}
                title="กดเพื่อเปิดสไลด์บาร์ ข้อมูลบอร์ดหลัก"
                className="px-2 py-2 border-r border-b-2 border-slate-300 align-top font-bold text-blue-900 bg-blue-50/40 w-20 max-w-[80px] cursor-pointer hover:bg-amber-100/60 transition-colors"
              >
                <div className="flex flex-col items-center gap-1.5 pt-1">
                  <input
                    type="text"
                    value={list.name}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      list.name = e.target.value;
                      setTrelloLists([...trelloLists]);
                    }}
                    className="w-full bg-transparent font-bold text-blue-955 text-xs text-center border-none focus:bg-white focus:ring-1 focus:ring-blue-500 rounded p-1 focus:outline-none"
                  />
                  {list.assignee_ids && list.assignee_ids.length > 0 && (
                    <div className="flex items-center -space-x-1 justify-center flex-wrap select-none pt-1">
                      {list.assignee_ids.map((uid) => {
                        const u = userMap[uid];
                        if (!u) return null;
                        return (
                          <div
                            key={uid}
                            className="w-4 h-4 rounded-full bg-indigo-50 border border-slate-200 flex items-center justify-center text-indigo-700 text-[7px] font-bold cursor-help shrink-0"
                            title={`ผู้รับผิดชอบบอร์ด: ${u.nickname || u.first_name}`}
                          >
                            {(u.nickname || u.first_name).charAt(0)}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </td>
            )}

            {/* 3. Priority */}
            <td className="px-3 py-2 border-r border-slate-200 text-center align-top">
              <div className="h-[36px] flex items-center justify-center">
                <select
                  value={itemPriority}
                  onChange={(e) => {
                    card.priority = e.target.value as any;
                    setTrelloLists([...trelloLists]);
                  }}
                  className={`px-2 py-1 text-[10px] font-bold rounded-full border bg-white cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                    itemPriority === 'high' || itemPriority === 'urgent' ? 'text-red-700 border-red-300' :
                    itemPriority === 'medium' ? 'text-amber-700 border-amber-300' :
                    'text-emerald-700 border-emerald-300'
                  }`}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
            </td>

            {/* 4. DETAILS */}
            <td className="p-0 border-r border-slate-200 align-top">
              <div className="h-[36px] px-3 flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    value={card.title}
                    onChange={(e) => {
                      card.title = e.target.value;
                      setTrelloLists([...trelloLists]);
                    }}
                    className="w-full bg-transparent font-bold text-slate-800 text-xs border-none focus:bg-white focus:ring-1 focus:ring-blue-500 rounded px-1 focus:outline-none"
                  />
                  {card.description && (
                    <div className="text-[10px] text-slate-500 line-clamp-1 font-normal px-1">
                      {card.description}
                    </div>
                  )}
                </div>

                {/* Card Assignee Avatars */}
                {card.assignee_ids && card.assignee_ids.length > 0 && (
                  <div className="flex items-center -space-x-1 shrink-0 select-none">
                    {card.assignee_ids.map((uid) => {
                      const u = userMap[uid];
                      if (!u) return null;
                      return (
                        <div
                          key={uid}
                          className="w-4.5 h-4.5 rounded-full bg-blue-50 border border-slate-200 flex items-center justify-center text-blue-700 text-[8px] font-bold cursor-help shrink-0"
                          title={`ผู้รับผิดชอบการ์ด: ${u.nickname || u.first_name}`}
                        >
                          {(u.nickname || u.first_name).charAt(0)}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              {card.sub_items && card.sub_items.length > 0 && (
                <div className="mt-1 mb-2 ml-4 pl-3 border-l-2 border-blue-400/60 flex flex-col gap-1 select-none w-[calc(100%-16px)] bg-slate-50/70 py-1.5 rounded-r-lg shadow-2xs">
                  {card.sub_items.map((sub: TaskSubItem) => (
                    <div
                      key={sub.id}
                      className="px-2 min-h-[26px] flex items-center gap-2 text-[11px] hover:bg-white rounded-md transition-all group"
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleDone(sub);
                        }}
                        className="text-slate-400 hover:text-emerald-600 cursor-pointer shrink-0"
                      >
                        {sub.is_done ? (
                          <CheckSquare className="w-3.5 h-3.5 text-emerald-600 fill-emerald-50 shrink-0" />
                        ) : (
                          <Square className="w-3.5 h-3.5 text-slate-400 shrink-0 group-hover:border-slate-500" />
                        )}
                      </button>
                      <span className="text-[10px] text-blue-500 font-bold select-none shrink-0">↳</span>
                      <input
                        type="text"
                        value={sub.title}
                        onChange={(e) => {
                          sub.title = e.target.value;
                          setSubItems([...subItems]);
                        }}
                        className={`w-full bg-transparent text-[11px] border-none focus:bg-white focus:ring-1 focus:ring-blue-500 rounded px-1.5 focus:outline-none ${
                          sub.is_done ? 'text-slate-400 line-through' : 'text-slate-700 font-medium'
                        }`}
                      />
                    </div>
                  ))}
                </div>
              )}
            </td>


            {/* Assignment */}
            <td className="px-3 py-2 border-r border-slate-200 text-center align-top">
              <div className="h-[36px] flex items-center justify-center">
                <select
                  value={card.assignee_ids && card.assignee_ids.length > 0 ? card.assignee_ids[0] : ''}
                  onChange={async (e) => {
                    const newUserId = e.target.value;
                    const newAssigneeIds = newUserId ? [newUserId] : [];
                    card.assignee_ids = newAssigneeIds;
                    setTrelloLists([...trelloLists]);
                    try {
                      await updateTaskCard(card.id, {
                        title: card.title,
                        assignee_ids: newAssigneeIds,
                      });
                      onRefreshTask(true);
                    } catch (err: any) {
                      console.error('Failed to update card assignee', err);
                    }
                  }}
                  className="px-2 py-1 bg-white border border-slate-300 rounded-md text-[10px] font-bold text-slate-700 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">เลือกผู้รับผิดชอบ</option>
                  {(() => {
                    const taskAssigneeIds = (task.assignee_ids && task.assignee_ids.length > 0
                      ? task.assignee_ids
                      : task.assigned_to
                      ? [task.assigned_to]
                      : []);
                    const candidates = taskAssigneeIds
                      .map((id) => userMap[id])
                      .filter(Boolean)
                      .filter((u) => u.id !== currentUser?.id);

                    return candidates.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nickname || u.first_name}
                      </option>
                    ));
                  })()}
                </select>
              </div>
            </td>

            {/* Status */}
            <td className="px-3 py-2 border-r border-slate-200 text-center align-top">
              <div className="h-[36px] flex items-center justify-center">
                <select
                  value={card.status}
                  onChange={(e) => {
                    card.status = e.target.value as any;
                    setTrelloLists([...trelloLists]);
                  }}
                  className={`px-2 py-1 text-[10px] font-extrabold rounded-full border bg-white cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                    isDone ? 'text-emerald-800 border-emerald-300 bg-emerald-50' : 'text-amber-800 border-amber-300 bg-amber-50'
                  }`}
                >
                  <option value="in_progress">Doing</option>
                  <option value="completed">Done</option>
                </select>
              </div>
            </td>

            {/* List Checkbox */}
            <td className="px-2 py-2 border-r border-slate-200 text-center align-top">
              <div className="h-[36px] flex items-center justify-center">
                <div className="p-1 text-slate-700">
                  {isDone ? <CheckSquare className="w-4 h-4 text-emerald-600 fill-emerald-50 inline" /> : <Square className="w-4 h-4 text-slate-400 inline" />}
                </div>
              </div>
            </td>

            {/* NOTE / Remark */}
            <td className="px-4 py-2 border-r border-slate-200 align-top text-slate-600 text-xs">
              <div className="h-[36px] flex items-center">
                {card.admin_comment || '-'}
              </div>
            </td>

            {/* Link / Files */}
            <td className="px-3 py-2 text-center align-top">
              <div className="h-[36px] flex items-center justify-center">
                {(() => {
                  const firstSubItemWithLink = card.sub_items?.find((s: TaskSubItem) => s.link_url && !s.link_url.includes('example.com'));
                  const cardLinkUrl = firstSubItemWithLink?.link_url;
                  return cardLinkUrl ? (
                    <button
                      onClick={() => handleOpenExternalUrl(cardLinkUrl)}
                      className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1 rounded-md transition-all active:scale-95"
                    >
                      <FileText className="w-3 h-3 text-indigo-600" />
                      <span>เปิดเอกสาร</span>
                    </button>
                  ) : (
                    <span className="text-slate-400 italic text-[11px]">-</span>
                  );
                })()}
              </div>
            </td>
          </tr>
        );
      });
    });

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-500 text-sm font-semibold font-sans">
        กำลังโหลดแผ่นงานโครงการ...
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Spreadsheet Header Banner */}
      <div className="bg-white border-2 border-slate-300 rounded-2xl shadow-xs overflow-hidden">
        <div className="bg-slate-900 p-6 text-white border-b-4 border-blue-600">
          <h1 className="text-2xl md:text-3xl font-black tracking-wider uppercase text-blue-300 font-mono">
            {task.title}
          </h1>
          <p className="text-xs md:text-sm text-slate-300 font-medium mt-1">
            แผ่นงานแสดงลำดับเวลาโครงการ (Project Timeline Sheet & Action Items)
          </p>
        </div>

        {/* Action Filter Bar */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="text-slate-500 font-bold mr-1 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span>ตัวกรอง:</span>
            </span>

            <button
              type="button"
              onClick={() => setActiveFilter('all')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                activeFilter === 'all'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              ทั้งหมด
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter('pending')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                activeFilter === 'pending'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-amber-50 border border-slate-200'
              }`}
            >
              <span>งานยังไม่เสร็จ</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter('overdue')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                activeFilter === 'overdue'
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'bg-white text-red-600 hover:bg-red-50 border border-red-200'
              }`}
            >
              <AlertCircle className="w-3.5 h-3.5" />
              <span>งานเลยกำหนด</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter('high_priority')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                activeFilter === 'high_priority'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-rose-50 border border-slate-200'
              }`}
            >
              <Flame className="w-3.5 h-3.5 text-rose-500" />
              <span>High Priority</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter('completed')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                activeFilter === 'completed'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-emerald-50 border border-slate-200'
              }`}
            >
              <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />
              <span>เสร็จสิ้นแล้ว</span>
            </button>
          </div>
        </div>

        {/* Interactive Spreadsheet Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs font-sans min-w-[950px]">
            <thead>
              <tr className="bg-slate-800 text-slate-100 font-bold uppercase tracking-wider text-[11px] border-b-2 border-slate-900 select-none">
                <th className="px-3 py-3 w-28 text-center border-r border-slate-700 font-bold bg-slate-900/80 text-amber-300">DUE DATE</th>
                <th className="px-2 py-3 border-r border-slate-700 w-20 max-w-[80px] text-center">PROJECT</th>
                <th className="px-3 py-3 w-24 text-center border-r border-slate-700">Priority</th>
                <th className="px-4 py-3 border-r border-slate-700 flex-1">DETAILS</th>
                <th className="px-3 py-3 w-28 text-center border-r border-slate-700">Assignment</th>
                <th className="px-3 py-3 w-24 text-center border-r border-slate-700">Status</th>
                <th className="px-2 py-3 w-16 text-center border-r border-slate-700">List</th>
                <th className="px-4 py-3 border-r border-slate-700">NOTE / Remark</th>
                <th className="px-3 py-3 w-28 text-center">Link / Files</th>
              </tr>
            </thead>

            <tbody className="divide-y-0 bg-white font-medium">
              {renderedRows}
            </tbody>
          </table>
        </div>
      </div>

      {/* Document Link Modal */}
      {activeDocumentItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-base">จัดการเอกสาร & ไฟล์แนบ</h3>
              </div>
              <button
                onClick={() => setActiveDocumentItem(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">รายการงานย่อย</p>
                <p className="text-sm font-bold text-slate-900 mt-0.5">{activeDocumentItem.title}</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Link2 className="w-4 h-4 text-indigo-600" />
                  <span>URL ลิงก์เอกสาร (Google Drive, Sheet, PDF หรือเว็บไซต์)</span>
                </label>
                <input
                  type="url"
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  value={editLinkUrl}
                  onChange={(e) => setEditLinkUrl(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                {editLinkUrl.trim() && (
                  <button
                    type="button"
                    onClick={() => handleOpenExternalUrl(editLinkUrl)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-all"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>ทดสอบเปิดลิงก์</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setActiveDocumentItem(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                >
                  ยกเลิก
                </button>

                <button
                  type="button"
                  onClick={handleSaveDocumentLink}
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-all"
                >
                  บันทึกข้อมูล
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Right Sidebar Edit Drawer */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-xs flex justify-end">
          <div className="bg-white w-full max-w-lg h-full shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between border-b-4 border-blue-600">
              <div className="flex items-center gap-2.5">
                {(editingCard || editingSubItem) ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (editingSubItem) {
                        setEditingSubItem(null);
                      } else if (editingCard) {
                        setEditingCard(null);
                      }
                    }}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl transition-all cursor-pointer flex items-center justify-center shrink-0 border border-slate-700"
                    title="กลับไปหน้าก่อนหน้า"
                  >
                    <ArrowLeft className="w-5 h-5 text-slate-200" />
                  </button>
                ) : (
                  <Edit3 className="w-5 h-5 text-amber-400 shrink-0" />
                )}
                <div>
                  <h3 className="font-extrabold text-base">
                    {editingCard ? 'การ์ดงาน' : editingSubItem ? 'การดำเนินการรายการย่อย' : 'ข้อมูลบอร์ดหลัก'}
                  </h3>
                  <p className="text-xs text-slate-300">
                    {editingCard
                      ? 'รายการย่อย, ไฟล์หลักฐาน, รายละเอียดการ์ดงาน และความคิดเห็นจากผู้ดูแล'
                      : editingSubItem
                      ? 'รายละเอียดรายการย่อย, กำหนดส่ง, หลักฐาน และบันทึกการตรวจสอบ'
                      : 'แก้ไขข้อมูลบอร์ดหลัก, การ์ดงาน และรายการย่อย'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {editingSubItem && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('คุณต้องการลบรายการย่อยนี้หรือไม่?')) {
                        handleDeleteSubItem(editingSubItem.id);
                        setIsDrawerOpen(false);
                      }
                    }}
                    className="p-1.5 text-rose-400 hover:text-rose-200 rounded-lg transition-colors cursor-pointer mr-1"
                    title="ลบรายการย่อย"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
                {!editingCard && !editingSubItem && (
                  <button
                    type="button"
                    onClick={() => setIsDrawerOpen(false)}
                    className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                    title="ปิดสไลด์บาร์"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {editingCard ? (
                /* ========================================================================= */
                /* SCREEN B (MOBILE APP SCREENSHOT): "การ์ดงาน"                                */
                /* ========================================================================= */
                <div className="space-y-6">
                  {/* 1. รายการย่อย */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <CheckSquare className="w-4 h-4 text-indigo-600" />
                        <span>รายการย่อย</span>
                      </span>
                      <span className="text-[11px] text-slate-400 font-normal">
                        {editingCard.sub_items?.length || 0} รายการ
                      </span>
                    </label>

                    <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                      {editingCard.sub_items && editingCard.sub_items.length > 0 ? (
                        editingCard.sub_items.map((sub) => (
                          <div
                            key={sub.id}
                            className="flex items-center justify-between gap-2 p-3 bg-slate-50 border border-slate-200/90 rounded-2xl text-xs"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <button
                                type="button"
                                onClick={() => handleToggleDone(sub)}
                                className="text-slate-400 hover:text-emerald-600 cursor-pointer shrink-0"
                              >
                                {sub.is_done ? (
                                  <CheckSquare className="w-5 h-5 text-emerald-600 fill-emerald-50" />
                                ) : (
                                  <Square className="w-5 h-5 text-slate-400" />
                                )}
                              </button>
                              <div className="space-y-0.5 min-w-0">
                                <p className={`truncate font-semibold ${sub.is_done ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                                  {sub.title}
                                </p>
                                {sub.due_date && (
                                  <p className="text-[10px] text-slate-500 font-mono">
                                    เริ่ม - {formatDateDDMM(sub.due_date)}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => openDrawerForSubItem(sub)}
                                className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-bold transition-all cursor-pointer"
                              >
                                <span>ตรวจงาน</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteSubItem(sub.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 rounded-xl transition-colors cursor-pointer"
                                title="ลบรายการย่อย"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-slate-400 italic">ยังไม่มีรายการย่อยในการ์ดนี้</p>
                      )}
                    </div>
                  </div>

                  {/* 2. เพิ่มไฟล์แนบหลักฐาน */}
                  <div className="space-y-2 pt-2 border-t border-slate-200">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Paperclip className="w-4 h-4 text-indigo-600" />
                      <span>เพิ่มไฟล์แนบหลักฐาน</span>
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          const url = prompt('ระบุ URL ไฟล์หลักฐาน:', subAttachmentUrl);
                          if (url) setSubAttachmentUrl(url);
                        }}
                        className="flex flex-col items-center justify-center p-3.5 bg-blue-50/60 hover:bg-blue-100/80 border border-blue-200 rounded-2xl text-blue-700 transition-all active:scale-95 cursor-pointer"
                      >
                        <Paperclip className="w-5 h-5 mb-1 text-blue-600" />
                        <span className="text-xs font-bold">แนบไฟล์</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const url = prompt('ระบุ URL ลิงก์เอกสาร:', subLinkUrl);
                          if (url) setSubLinkUrl(url);
                        }}
                        className="flex flex-col items-center justify-center p-3.5 bg-emerald-50/60 hover:bg-emerald-100/80 border border-emerald-200 rounded-2xl text-emerald-700 transition-all active:scale-95 cursor-pointer"
                      >
                        <Link2 className="w-5 h-5 mb-1 text-emerald-600" />
                        <span className="text-xs font-bold">แนบลิงก์</span>
                      </button>
                    </div>
                  </div>

                  {/* 3. รายละเอียดการ์ดงาน */}
                  <div className="space-y-3 pt-2 border-t border-slate-200">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-slate-600" />
                      <span>รายละเอียดการ์ดงาน</span>
                    </label>
                    <input
                      type="text"
                      value={drawerTitle}
                      onChange={(e) => setDrawerTitle(e.target.value)}
                      placeholder="ชื่องาน..."
                      className="w-full px-3.5 py-2.5 text-xs bg-slate-100/80 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-800"
                    />

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700">วันกำหนดส่ง</label>
                      <input
                        type="date"
                        value={drawerDueDate}
                        onChange={(e) => setDrawerDueDate(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-xs bg-slate-100/80 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono text-slate-700 font-semibold"
                      />
                    </div>

                    {/* Card Assignees Selector */}
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-indigo-600" />
                        <span>ผู้รับผิดชอบการ์ดนี้ (Card Assignees)</span>
                      </label>
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {/* Current Card Members */}
                        {drawerAssignees.map((uid) => {
                          const u = userMap[uid];
                          if (!u) return null;
                          return (
                            <div
                              key={uid}
                              className="flex items-center gap-1.5 pl-1.5 pr-1 py-1 bg-blue-50 border border-blue-200 rounded-full text-xs text-blue-700 font-bold"
                            >
                              <img
                                src={avatarUrl(u.avatar_url) || undefined}
                                alt={u.nickname || u.first_name}
                                className="w-5 h-5 rounded-full object-cover border border-white"
                              />
                              <span className="text-[11px]">{u.nickname || u.first_name}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setDrawerAssignees((prev) => prev.filter((id) => id !== uid));
                                }}
                                className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-blue-100 text-blue-500 hover:text-blue-700 cursor-pointer transition-all"
                              >
                                &times;
                              </button>
                            </div>
                          );
                        })}

                        {/* The "+" Button to invite */}
                        <button
                          type="button"
                          onClick={() => setShowInvitePopover(!showInvitePopover)}
                          className="w-7 h-7 rounded-full border-2 border-dashed border-slate-300 hover:border-blue-500 hover:bg-blue-50 flex items-center justify-center text-slate-400 hover:text-blue-600 transition-all cursor-pointer"
                          title="มอบหมายงานให้พนักงาน"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Popover / Candidate selection list */}
                      {showInvitePopover && (
                        <div className="mt-2 p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                            เลือกมอบหมายการ์ดให้ผู้รับผิดชอบงานหลัก:
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {(() => {
                              const taskAssigneeIds = (task.assignee_ids && task.assignee_ids.length > 0
                                ? task.assignee_ids
                                : task.assigned_to
                                ? [task.assigned_to]
                                : []);
                              const candidates = taskAssigneeIds
                                .map((id: string) => userMap[id])
                                .filter(Boolean)
                                .filter((u) => u.id !== currentUser?.id)
                                .filter((u) => !drawerAssignees.includes(u.id));

                              return candidates.length > 0 ? (
                                candidates.map((u) => (
                                  <button
                                    key={u.id}
                                    type="button"
                                    onClick={() => {
                                      setDrawerAssignees((prev) => [...prev, u.id]);
                                    }}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-full text-xs font-semibold text-slate-700 hover:text-blue-700 transition-all cursor-pointer active:scale-95 shadow-2xs"
                                  >
                                    <img
                                      src={avatarUrl(u.avatar_url) || undefined}
                                      alt={u.nickname || u.first_name}
                                      className="w-4 h-4 rounded-full object-cover border border-white"
                                    />
                                    <span>{u.nickname || u.first_name}</span>
                                  </button>
                                ))
                              ) : (
                                <span className="text-xs text-slate-400 italic">
                                  มอบหมายพนักงานหลักของงานนี้ครบทุกคนแล้ว
                                </span>
                              );
                            })()}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 4. ความคิดเห็นจากผู้ดูแล */}
                  <div className="p-4 bg-amber-50/60 border border-amber-200/90 rounded-2xl space-y-3 pt-3">
                    <label className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-amber-600" />
                      <span>ความคิดเห็นจากผู้ดูแล</span>
                    </label>
                    <textarea
                      rows={3}
                      value={drawerComment}
                      onChange={(e) => setDrawerComment(e.target.value)}
                      placeholder="พิมพ์ความคิดเห็นหรือคำแนะนำผู้ดูแล..."
                      className="w-full px-3.5 py-2.5 text-xs bg-white border border-amber-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-800"
                    />
                    <button
                      type="button"
                      disabled={isSavingDrawer}
                      onClick={handleSaveDrawer}
                      className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all active:scale-98 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <Save className="w-4 h-4" />
                      <span>{isSavingDrawer ? 'กำลังบันทึก...' : 'บันทึกความคิดเห็น'}</span>
                    </button>
                  </div>
                </div>
              ) : editingSubItem ? (
                /* ========================================================================= */
                /* FULL MOBILE APP SCREENSHOT DESIGN: "การดำเนินการรายการย่อย"               */
                /* ========================================================================= */
                <div className="space-y-6">
                  {/* 1. หัวข้อรายการย่อย */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">หัวข้อรายการย่อย</label>
                    <input
                      type="text"
                      value={subTitle}
                      onChange={(e) => setSubTitle(e.target.value)}
                      placeholder="กรอกหัวข้อรายการย่อย..."
                      className="w-full px-3.5 py-3 text-sm bg-slate-100/80 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold text-slate-800"
                    />
                  </div>

                  {/* 2. วันที่เริ่มต้น & วันครบกำหนด */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700">วันที่เริ่มต้น</label>
                      <div className="relative flex items-center">
                        <input
                          type="date"
                          value={subStartDate}
                          onChange={(e) => setSubStartDate(e.target.value)}
                          className="w-full px-3.5 py-2.5 text-xs bg-slate-100/80 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-slate-700 font-semibold"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700">วันครบกำหนด</label>
                      <div className="relative flex items-center">
                        <input
                          type="date"
                          value={subDueDate}
                          onChange={(e) => setSubDueDate(e.target.value)}
                          className="w-full px-3.5 py-2.5 text-xs bg-slate-100/80 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono text-slate-700 font-semibold"
                        />
                        {subDueDate && (
                          <button
                            type="button"
                            onClick={() => setSubDueDate('')}
                            className="absolute right-2 text-slate-400 hover:text-slate-600 p-1"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 3. แนบหลักฐาน */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Paperclip className="w-4 h-4 text-indigo-600" />
                      <span>แนบหลักฐาน</span>
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const url = prompt('ระบุ URL ไฟล์หลักฐาน:', subAttachmentUrl);
                          if (url !== null) setSubAttachmentUrl(url);
                        }}
                        className="flex flex-col items-center justify-center p-3 bg-blue-50/60 hover:bg-blue-100/80 border border-blue-200 rounded-2xl text-blue-700 transition-all active:scale-95 cursor-pointer"
                      >
                        <Paperclip className="w-5 h-5 mb-1 text-blue-600" />
                        <span className="text-[11px] font-bold">แนบไฟล์</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const url = prompt('ระบุ URL ลิงก์เอกสาร:', subLinkUrl);
                          if (url !== null) setSubLinkUrl(url);
                        }}
                        className="flex flex-col items-center justify-center p-3 bg-emerald-50/60 hover:bg-emerald-100/80 border border-emerald-200 rounded-2xl text-emerald-700 transition-all active:scale-95 cursor-pointer"
                      >
                        <Link2 className="w-5 h-5 mb-1 text-emerald-600" />
                        <span className="text-[11px] font-bold">แนบลิงก์</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSubAttachmentUrl('');
                          setSubLinkUrl('');
                        }}
                        className="flex flex-col items-center justify-center p-3 bg-rose-50/60 hover:bg-rose-100/80 border border-rose-200 rounded-2xl text-rose-700 transition-all active:scale-95 cursor-pointer"
                      >
                        <Trash2 className="w-5 h-5 mb-1 text-rose-500" />
                        <span className="text-[11px] font-bold">ล้างหลักฐาน</span>
                      </button>
                    </div>

                    {(subLinkUrl || subAttachmentUrl) && (
                      <div className="p-3 bg-slate-100 border border-slate-200 rounded-xl text-xs space-y-1">
                        {subLinkUrl && (
                          <div className="flex items-center justify-between text-indigo-700 truncate font-mono text-[11px]">
                            <span>🔗 {subLinkUrl}</span>
                            <button
                              type="button"
                              onClick={() => handleOpenExternalUrl(subLinkUrl)}
                              className="text-xs font-bold underline shrink-0 ml-2"
                            >
                              เปิดลิงก์
                            </button>
                          </div>
                        )}
                        {subAttachmentUrl && (
                          <div className="flex items-center justify-between text-blue-700 truncate font-mono text-[11px]">
                            <span>📎 {subAttachmentUrl}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 4. ข้อกำหนดในการตรวจสอบงาน */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">ข้อกำหนดในการตรวจสอบงาน</label>
                    <textarea
                      rows={3}
                      value={subRequirements}
                      onChange={(e) => setSubRequirements(e.target.value)}
                      placeholder="กรอกรายละเอียดข้อกำหนดในการตรวจสอบงาน..."
                      className="w-full px-3.5 py-2.5 text-xs bg-slate-100/80 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                    />
                  </div>

                  {/* 5. ประวัติการตรวจสอบงาน */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <History className="w-4 h-4 text-slate-500" />
                      <span>ประวัติการตรวจสอบงาน</span>
                    </label>
                    <div className="p-3.5 bg-slate-100/60 border border-slate-200 rounded-xl text-center text-xs text-slate-400 italic">
                      {editingSubItem.verification_notes ? (
                        <p className="text-left text-slate-700 font-medium not-italic">{editingSubItem.verification_notes}</p>
                      ) : (
                        <span>ยังไม่มีประวัติการตรวจสอบของรายการนี้</span>
                      )}
                    </div>
                  </div>

                  {/* 6. บันทึกผลการตรวจสอบใหม่ */}
                  <div className="space-y-2 pt-2 border-t border-slate-200">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Edit3 className="w-4 h-4 text-blue-600" />
                      <span>บันทึกผลการตรวจสอบใหม่</span>
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setSubVerificationResult('pass')}
                        className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          subVerificationResult === 'pass'
                            ? 'bg-emerald-100 text-emerald-800 border-2 border-emerald-500 shadow-2xs'
                            : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200'
                        }`}
                      >
                        <CheckCircle2 className={`w-4 h-4 ${subVerificationResult === 'pass' ? 'text-emerald-600' : 'text-slate-400'}`} />
                        <span>✓ ผ่าน</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSubVerificationResult('fail')}
                        className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          subVerificationResult === 'fail'
                            ? 'bg-rose-100 text-rose-800 border-2 border-rose-500 shadow-2xs'
                            : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200'
                        }`}
                      >
                        <X className={`w-4 h-4 ${subVerificationResult === 'fail' ? 'text-rose-600' : 'text-slate-400'}`} />
                        <span>✕ ไม่ผ่าน</span>
                      </button>
                    </div>

                    <textarea
                      rows={2}
                      value={subVerificationNotes}
                      onChange={(e) => setSubVerificationNotes(e.target.value)}
                      placeholder="ระบุคำอธิบายหรือเหตุผลการตรวจสอบรอบนี้..."
                      className="w-full px-3.5 py-2.5 text-xs bg-slate-100/80 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                    />
                  </div>

                  {/* 7. ความคิดเห็นจากผู้ดูแล */}
                  <div className="space-y-1.5 pt-2 border-t border-slate-200">
                    <label className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-amber-600" />
                      <span>ความคิดเห็นจากผู้ดูแล</span>
                    </label>
                    <textarea
                      rows={2}
                      value={subAdminComment}
                      onChange={(e) => setSubAdminComment(e.target.value)}
                      placeholder="พิมพ์ความคิดเห็นหรือข้อสังเกตของผู้ดูแล..."
                      className="w-full px-3.5 py-2.5 text-xs bg-amber-50/50 border border-amber-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-800"
                    />
                  </div>

                  {/* 8. ปุ่มบันทึกข้อมูล */}
                  <div className="pt-4">
                    <button
                      type="button"
                      disabled={isSavingSubDrawer}
                      onClick={handleSaveSubDrawer}
                      className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-2xl shadow-md transition-all active:scale-98 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <Save className="w-4 h-4" />
                      <span>{isSavingSubDrawer ? 'กำลังบันทึกข้อมูล...' : 'บันทึกข้อมูล'}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* LEVEL 1: ข้อมูลบอร์ดหลัก */}
                  <div className="space-y-4 pb-2 border-b border-slate-200">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-blue-900 bg-blue-100/70 border border-blue-300 px-3 py-1 rounded-full flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5 text-blue-600" />
                        <span>ระดับที่ 1: ข้อมูลบอร์ดหลัก</span>
                      </span>
                    </div>

                    {/* Title Input */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700">หัวข้อโครงการ หรือชื่องาน</label>
                      <input
                        type="text"
                        value={drawerTitle}
                        onChange={(e) => setDrawerTitle(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-800"
                      />
                    </div>

                    {/* Due Date & Priority */}
                    <div className="grid grid-cols-2 gap-3">
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
                        <label className="text-xs font-bold text-slate-700">Priority</label>
                        <select
                          value={drawerPriority}
                          onChange={(e) => setDrawerPriority(e.target.value as any)}
                          className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-700"
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                      </div>
                    </div>



                    {/* Task Assignees */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-blue-600" />
                        <span>ผู้รับผิดชอบงาน</span>
                      </label>
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {(() => {
                          const ids = (task.assignee_ids && task.assignee_ids.length > 0
                            ? task.assignee_ids
                            : task.assigned_to
                            ? [task.assigned_to]
                            : []);
                          const assignees = ids.map((id: string) => userMap[id]).filter(Boolean);

                          return assignees.length > 0 ? (
                            assignees.map((u: User) => (
                              <div
                                key={u.id}
                                className="flex items-center gap-2 px-2.5 py-1 bg-slate-100 border border-slate-200 rounded-full text-xs"
                              >
                                <img
                                  src={avatarUrl(u.avatar_url) || undefined}
                                  alt={`${u.first_name} ${u.last_name}`}
                                  className="w-5 h-5 rounded-full object-cover border border-white"
                                />
                                <span className="font-bold text-slate-800 text-[11px]">
                                  {u.nickname || u.first_name}
                                </span>
                              </div>
                            ))
                          ) : (
                            <span className="text-xs text-slate-400 italic">ยังไม่ได้ระบุผู้รับผิดชอบ</span>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* LEVEL 2: การ์ดงานและรายการย่อยซ้อนในการ์ดของตัวเอง */}
                  <div className="space-y-4 pt-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-amber-900 bg-amber-100/70 border border-amber-300 px-3 py-1 rounded-full flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-amber-600" />
                        <span>ระดับที่ 2: รายการการ์ดงานและรายการย่อย</span>
                      </span>
                    </div>

                    {/* Cards list with sub-items nested inside each card */}
                    <div className="space-y-3.5 max-h-[420px] overflow-y-auto pr-1">
                      {(() => {
                        const targetList = editingList || (trelloLists.length > 0 ? trelloLists[0] : null);
                        const cardsToShow = targetList?.cards || (editingCard ? [editingCard] : []);

                        return cardsToShow.length > 0 ? (
                          cardsToShow.map((c) => {
                            const cardSubs = activeSubItems.filter(
                              (s) => (s as any).card_id === c.id || (c.sub_items && c.sub_items.some((cs) => cs.id === s.id))
                            );

                            return (
                              <div
                                key={c.id}
                                className="p-3.5 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-2.5 shadow-2xs"
                              >
                                {/* Card Header */}
                                <div
                                  onClick={() => openDrawerForCard(c, targetList || undefined)}
                                  className="flex items-center justify-between gap-2 text-xs p-1.5 hover:bg-amber-100/60 rounded-xl cursor-pointer transition-colors group"
                                  title="กดเพื่อเปิดสไลด์บาร์ การ์ดงาน"
                                >
                                  <div className="space-y-0.5 min-w-0">
                                    <p className="font-bold text-slate-800 text-sm truncate group-hover:text-blue-700 transition-colors">{c.title}</p>
                                    {c.due_date && (
                                      <p className="text-[11px] text-amber-800 font-mono font-semibold">
                                        กำหนดส่ง: {formatDateDDMM(c.due_date)}
                                      </p>
                                    )}
                                  </div>
                                  <span className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full border shrink-0 ${
                                    c.status === 'completed' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-amber-100 text-amber-800 border-amber-300'
                                  }`}>
                                    {c.status === 'completed' ? 'Done' : 'Doing'}
                                  </span>
                                </div>

                                {/* Nested Sub-items Checklist inside this card */}
                                <div className="pt-2 border-t border-slate-200 space-y-1.5">
                                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-600">
                                    <span>รายการย่อยในการ์ดนี้</span>
                                    <span className="text-[10px] text-slate-400 font-normal">{cardSubs.length} รายการ</span>
                                  </div>

                                  {cardSubs.length > 0 ? (
                                    cardSubs.map((sub) => (
                                      <div
                                        key={sub.id}
                                        className="flex items-center justify-between gap-2 p-2 bg-white border border-slate-200 rounded-xl text-xs"
                                      >
                                        <div className="flex items-center gap-2 min-w-0">
                                          <button
                                            type="button"
                                            onClick={() => handleToggleDone(sub)}
                                            className="text-slate-400 hover:text-emerald-600 cursor-pointer shrink-0"
                                          >
                                            {sub.is_done ? (
                                              <CheckSquare className="w-4 h-4 text-emerald-600 fill-emerald-50" />
                                            ) : (
                                              <Square className="w-4 h-4 text-slate-400" />
                                            )}
                                          </button>
                                          <span className={`truncate ${sub.is_done ? 'line-through text-slate-400' : 'text-slate-700 font-medium'}`}>
                                            {sub.title}
                                          </span>
                                        </div>

                                        <div className="flex items-center gap-1.5 shrink-0">
                                          {sub.due_date && (
                                            <span className="text-[10px] font-bold text-slate-600 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded font-mono">
                                              {formatDateDDMM(sub.due_date)}
                                            </span>
                                          )}
                                          <button
                                            type="button"
                                            onClick={() => openDrawerForSubItem(sub)}
                                            className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1"
                                          >
                                            <span>ตรวจงาน</span>
                                          </button>
                                        </div>
                                      </div>
                                    ))
                                  ) : (
                                    <p className="text-[11px] text-slate-400 italic">ไม่มีรายการย่อยในการ์ดนี้</p>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <p className="text-xs text-slate-400 italic">ยังไม่มีการ์ดงานในบอร์ดนี้</p>
                        );
                      })()}
                    </div>
                  </div>

              {/* Description / Comment */}
              <div className="space-y-1.5 pt-2 border-t border-slate-200">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-slate-500" />
                  <span>รายละเอียดเพิ่มเติม / หมายเหตุ</span>
                </label>
                <textarea
                  rows={3}
                  value={drawerComment}
                  onChange={(e) => setDrawerComment(e.target.value)}
                  placeholder="เพิ่มคำอธิบายหรือหมายเหตุงาน..."
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-normal text-slate-800"
                />
              </div>

              {/* Document Link & Attachments (task_attachments) */}
              <div className="space-y-1.5 pt-2 border-t border-slate-200">
                <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Paperclip className="w-4 h-4 text-indigo-600" />
                    <span>เอกสารแนบ & ลิงก์ไฟล์งาน (Task Attachments)</span>
                  </span>
                </label>
                {(() => {
                  const subWithLink = (editingCard as any)?.sub_items?.find((s: TaskSubItem) => s.link_url && !s.link_url.includes('example.com'));
                  const validUrl = subWithLink?.link_url || (task as any).link_url;

                  return validUrl && !validUrl.includes('example.com') ? (
                    <div className="flex items-center justify-between p-3 bg-indigo-50/60 border border-indigo-200 rounded-xl text-xs">
                      <div className="flex items-center gap-2 truncate min-w-0">
                        <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
                        <span className="truncate font-mono font-medium text-indigo-950">{validUrl}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleOpenExternalUrl(validUrl)}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 bg-white hover:bg-indigo-100 border border-indigo-300 px-2.5 py-1 rounded-lg shrink-0 transition-all cursor-pointer"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>เปิดเอกสาร</span>
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">ไม่มีไฟล์แนบหรือลิงก์เอกสาร</p>
                  );
                })()}
              </div>

              {/* Work Submission & Verification (task_submissions) */}
              <div className="space-y-1.5 pt-2 border-t border-slate-200">
                <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>สถานะการส่งตรวจงาน (Task Submission Status)</span>
                  </span>
                </label>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
                  <div className="space-y-0.5">
                    <p className="font-bold text-slate-800">
                      {task.status === 'completed' ? 'ผ่านการอนุมัติแล้ว (Approved)' : 'อยู่ระหว่างดำเนินงาน (In Progress)'}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {(task as any).verification_notes || (task as any).admin_comment || 'งานนี้ได้รับการติดตามตามมาตรฐานองค์กร'}
                    </p>
                  </div>
                  <span className={`px-2.5 py-1 text-[10px] font-extrabold rounded-full ${
                    task.status === 'completed' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-amber-100 text-amber-900 border border-amber-300'
                  }`}>
                    {task.status === 'completed' ? 'Approved' : 'Pending'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

            {/* Drawer Footer Actions (Only for Card/List Editing) */}
            {!editingSubItem && (
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(false)}
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
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
