const fs = require('fs');
const file = '/Users/nattamonchotikul/employee_backend_frontend-admin/frontend-admin/src/pages/Tasks.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Add viewMode state
content = content.replace(
`  // ─── UI state ──
  const [showForm, setShowForm]         = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);`,
`  // ─── UI state ──
  const [showForm, setShowForm]         = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [viewMode, setViewMode]         = useState<'list' | 'board'>('list');`
);

// 2. Update Header
content = content.replace(
`      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ margin: 0 }}>จัดการงาน (Task Board)</h2>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn-primary"
            style={{ background: 'rgba(255,255,255,0.7)', color: 'var(--text-main)', border: '1px solid var(--border-color)', backdropFilter: 'blur(8px)' }}
            onClick={() => setShowSettings(!showSettings)}
          >
            <i className="fa-solid fa-gear" style={{ color: 'var(--blue)', marginRight: 6 }}></i>
            จัดการ Brand / หมวดหมู่
          </button>
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            <i className="fa-solid fa-plus"></i> มอบหมายงานใหม่ (Modal)
          </button>
        </div>
      </div>`,
`      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <h2 style={{ margin: 0 }}>จัดการงาน (Tasks)</h2>
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.8)', borderRadius: 12, padding: 4, backdropFilter: 'blur(10px)' }}>
            <button 
              onClick={() => setViewMode('list')} 
              style={{ background: viewMode === 'list' ? '#fff' : 'transparent', color: viewMode === 'list' ? 'var(--blue)' : 'var(--text-gray)', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: '0.2s', display: 'flex', alignItems: 'center', gap: 6, boxShadow: viewMode === 'list' ? '0 2px 5px rgba(0,0,0,0.05)' : 'none' }}>
              <i className="fa-solid fa-list"></i> List
            </button>
            <button 
              onClick={() => setViewMode('board')} 
              style={{ background: viewMode === 'board' ? '#fff' : 'transparent', color: viewMode === 'board' ? 'var(--blue)' : 'var(--text-gray)', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: '0.2s', display: 'flex', alignItems: 'center', gap: 6, boxShadow: viewMode === 'board' ? '0 2px 5px rgba(0,0,0,0.05)' : 'none' }}>
              <i className="fa-solid fa-border-all"></i> Board
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn-primary"
            style={{ background: 'rgba(255,255,255,0.7)', color: 'var(--text-main)', border: '1px solid rgba(255,255,255,0.9)', backdropFilter: 'blur(8px)' }}
            onClick={() => setShowSettings(!showSettings)}
          >
            <i className="fa-solid fa-gear" style={{ color: 'var(--blue)', marginRight: 6 }}></i>
            จัดการ Brand / หมวดหมู่
          </button>
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            <i className="fa-solid fa-plus"></i> มอบหมายงานใหม่
          </button>
        </div>
      </div>`
);

// 3. Update Kanban Board Block
const startToken = `{/* ── Kanban Board (Trello-Style Drag and Drop) ── */}`;
const endToken = `{/* ── Task Detail Modal ── */}`;
const startIndex = content.indexOf(startToken);
const endIndex = content.indexOf(endToken);

if (startIndex === -1 || endIndex === -1) {
  console.log("Tokens not found for Kanban Board!");
  process.exit(1);
}

const replacementBlock = `      {/* ── Views (List / Board) ── */}
      {!loading && !error && viewMode === 'list' && (
        <div className="table-card" style={{ padding: 0, background: '#fff', boxShadow: '0 15px 35px rgba(0,0,0,0.03)' }}>
          <table style={{ minWidth: 1000, margin: 0 }}>
            <thead style={{ background: '#F8FAFC' }}>
              <tr>
                <th style={{ width: 120 }}>PHASE</th>
                <th style={{ width: 100 }}>Priority</th>
                <th>DETAILS</th>
                <th style={{ width: 120 }}>Status</th>
                <th style={{ width: 120 }}>Due Date</th>
                <th style={{ width: 150 }}>Assignment</th>
                <th style={{ width: 100 }}>List</th>
                <th style={{ width: 100 }}>Note / Remark</th>
                <th style={{ width: 60, textAlign: 'center' }}>Link</th>
              </tr>
            </thead>
            <tbody>
              {tasks.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-gray)' }}>ไม่มีข้อมูลงาน</td>
                </tr>
              )}
              {tasks.map(task => {
                const category = task.category_id ? categoryMap[task.category_id] : null;
                const brand = task.brand_id ? brandMap[task.brand_id] : null;
                const overdue = task.status !== 'completed' && isOverdue(task.due_date);
                const assignees = task.assignee_ids
                  ? task.assignee_ids.map(id => userMap[id]).filter(Boolean)
                  : (task.assigned_to ? [userMap[task.assigned_to]].filter(Boolean) : []);
                
                // Mock priority based on due date closeness
                let priorityLabel = 'Low';
                let priorityColor = '#10B981';
                let priorityBg = '#D1FAE5';
                if (overdue) { priorityLabel = 'High'; priorityColor = '#EF4444'; priorityBg = '#FEE2E2'; }
                else if (new Date(task.due_date).getTime() - new Date().getTime() < 3 * 24 * 60 * 60 * 1000) { priorityLabel = 'Medium'; priorityColor = '#F59E0B'; priorityBg = '#FEF3C7'; }

                return (
                  <tr key={task.id} style={{ borderBottom: '1px solid #F1F5F9', cursor: 'pointer', transition: '0.2s' }} 
                      onClick={() => setSelectedTask(task)}
                      onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: 13 }}>
                      {category ? category.name : (brand ? brand.name : '-')}
                    </td>
                    <td>
                      <span style={{ background: priorityBg, color: priorityColor, padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>
                        {priorityLabel}
                      </span>
                    </td>
                    <td style={{ maxWidth: 300 }}>
                      <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{task.title}</div>
                      {task.description && (
                        <div style={{ fontSize: 12, color: 'var(--text-gray)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{task.description}</div>
                      )}
                    </td>
                    <td>
                      <span style={{ background: STATUS_CONFIG[task.status as TaskStatus].bg, color: STATUS_CONFIG[task.status as TaskStatus].color, border: \`1px solid \${STATUS_CONFIG[task.status as TaskStatus].border}\`, padding: '4px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
                        {STATUS_CONFIG[task.status as TaskStatus].label}
                      </span>
                    </td>
                    <td style={{ fontSize: 13, fontWeight: 600, color: overdue ? '#EF4444' : 'var(--text-main)' }}>
                      {formatDate(task.due_date)} {overdue && '⚠️'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        {assignees.slice(0, 3).map((u, i) => (
                          <div key={u.id} style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--blue-light)', border: '2px solid #fff', overflow: 'hidden', marginLeft: i > 0 ? -8 : 0, zIndex: 3 - i, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {u.avatar_url ? <img src={avatarUrl(u.avatar_url)!} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue)' }}>{u.first_name[0]}</span>}
                          </div>
                        ))}
                        {assignees.length > 3 && (
                          <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#E2E8F0', border: '2px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: -8, zIndex: 0, fontSize: 10, fontWeight: 700, color: 'var(--text-main)' }}>
                            +{assignees.length - 3}
                          </div>
                        )}
                      </div>
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--text-gray)' }}>-</td>
                    <td style={{ fontSize: 13, color: 'var(--text-gray)' }}>-</td>
                    <td style={{ textAlign: 'center' }}>
                      <i className="fa-solid fa-link" style={{ color: '#CBD5E1', cursor: 'pointer' }} onClick={e => { e.stopPropagation(); alert('ยังไม่มีข้อมูล Link'); }}></i>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Kanban Board (Trello-Style Drag and Drop) ── */}
      {!loading && !error && viewMode === 'board' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, alignItems: 'start', overflowX: 'auto', paddingBottom: 20 }}>
          {columns.map(col => {
            const cfg = STATUS_CONFIG[col];
            const colTasks = tasks.filter(t => t.status === col);
            return (
              <div
                key={col}
                onDragOver={e => e.preventDefault()}
                onDrop={e => handleDrop(e, col)}
                className="glass-panel"
                style={{ borderRadius: 20, padding: 0, overflow: 'hidden', border: \`1px solid rgba(255,255,255,0.8)\`, background: 'rgba(255,255,255,0.5)', minWidth: 300 }}
              >
                {/* Column Header */}
                <div style={{ background: 'rgba(255,255,255,0.7)', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: \`1px solid rgba(255,255,255,0.9)\` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: cfg.dot, display: 'inline-block' }}></span>
                    <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-main)' }}>{cfg.label}</span>
                  </div>
                  <span style={{ background: '#F1F5F9', color: 'var(--text-gray)', borderRadius: 12, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>
                    {colTasks.length}
                  </span>
                </div>

                {/* Cards Container */}
                <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14, minHeight: 400 }}>
                  {colTasks.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-gray)', fontSize: 13, border: '2px dashed #E2E8F0', borderRadius: 14 }}>
                      ลากการ์ดมาวางที่นี่
                    </div>
                  )}
                  {colTasks.map(task => {
                    const brand = task.brand_id ? brandMap[task.brand_id] : null;
                    const category = task.category_id ? categoryMap[task.category_id] : null;
                    const overdue = col !== 'completed' && isOverdue(task.due_date);

                    const assignees = task.assignee_ids
                      ? task.assignee_ids.map(id => userMap[id]).filter(Boolean)
                      : (task.assigned_to ? [userMap[task.assigned_to]].filter(Boolean) : []);

                    let priorityColor = 'transparent';
                    if (overdue) priorityColor = '#EF4444';
                    else if (new Date(task.due_date).getTime() - new Date().getTime() < 3 * 24 * 60 * 60 * 1000) priorityColor = '#F59E0B';
                    else priorityColor = '#10B981';

                    return (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={e => handleDragStart(e, task.id)}
                        onClick={() => setSelectedTask(task)}
                        style={{
                          background: '#fff',
                          borderRadius: 16,
                          padding: '16px',
                          cursor: 'grab',
                          border: '1px solid #F1F5F9',
                          borderLeft: \`4px solid \${priorityColor}\`,
                          boxShadow: '0 4px 15px rgba(0,0,0,0.03)',
                          transition: 'transform 0.15s, box-shadow 0.15s',
                          opacity: actionLoading === task.id ? 0.5 : 1
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.transform = 'translateY(-2px)';
                          e.currentTarget.style.boxShadow = '0 8px 25px rgba(0,0,0,0.08)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.transform = '';
                          e.currentTarget.style.boxShadow = '0 4px 15px rgba(0,0,0,0.03)';
                        }}
                      >
                        {/* Tags */}
                        {(brand || category) && (
                          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                            {brand && (
                              <span style={{ background: 'var(--blue-light)', color: 'var(--blue)', border: '1px solid var(--blue-mid)', borderRadius: 10, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                                {brand.name}
                              </span>
                            )}
                            {category && (
                              <span style={{ background: '#FEF3C7', color: '#B45309', border: '1px solid #FDE68A', borderRadius: 10, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                                {category.name}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Title */}
                        <div style={{ fontWeight: 700, fontSize: 14.5, color: 'var(--text-main)', marginBottom: 6, lineHeight: 1.4 }}>
                          {task.title}
                        </div>
                        {task.description && (
                          <div style={{ fontSize: 12.5, color: 'var(--text-gray)', marginBottom: 12, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                            {task.description}
                          </div>
                        )}

                        {/* Footer */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTop: '1px dashed #E2E8F0' }}>
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            <div style={{ display: 'flex' }}>
                              {assignees.slice(0, 3).map((u, i) => (
                                <div key={u.id} title={\`\${u.first_name} \${u.last_name}\`}
                                  style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--blue-light)', border: '2px solid #fff', overflow: 'hidden', marginLeft: i > 0 ? -8 : 0, zIndex: 3 - i, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  {u.avatar_url ? <img src={avatarUrl(u.avatar_url)!} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--blue)' }}>{u.first_name[0]}</span>}
                                </div>
                              ))}
                              {assignees.length > 3 && (
                                <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#E2E8F0', border: '2px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: -8, zIndex: 0, fontSize: 9, fontWeight: 700, color: 'var(--text-main)' }}>
                                  +{assignees.length - 3}
                                </div>
                              )}
                            </div>
                          </div>

                          <span style={{ fontSize: 12, fontWeight: 600, color: overdue ? '#EF4444' : 'var(--text-gray)' }}>
                            <i className={\`fa-solid fa-calendar-\${overdue ? 'xmark' : 'check'}\`} style={{ marginRight: 4 }}></i>
                            {formatDate(task.due_date)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
      
      `;

content = content.substring(0, startIndex) + replacementBlock + content.substring(endIndex);
fs.writeFileSync(file, content);
console.log("Updated Tasks.tsx");
