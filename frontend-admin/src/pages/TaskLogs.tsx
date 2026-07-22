import { useState, useEffect } from 'react';
import { Activity, MessageSquare } from 'lucide-react';
import { fetchAllTaskEvents } from '../services/adminApi';
import type { TaskEvent } from '../types';

export default function TaskLogs() {
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEvents();
  }, []);

  async function loadEvents() {
    try {
      setLoading(true);
      const data = await fetchAllTaskEvents();
      setEvents(data);
    } catch (error) {
      console.error('Failed to load task events:', error);
    } finally {
      setLoading(false);
    }
  }

  function formatTime(dateStr: string) {
    const date = new Date(dateStr);
    return date.toLocaleString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Activity Logs
        </h1>
        <button
          onClick={loadEvents}
          className="btn btn-secondary"
        >
          รีเฟรชข้อมูล
        </button>
      </div>

      <div className="card p-6">
        {loading ? (
          <div className="text-center py-8 text-gray-500">กำลังโหลด...</div>
        ) : events.length === 0 ? (
          <div className="text-center py-8 text-gray-500">ไม่มีประวัติการทำงาน</div>
        ) : (
          <div className="flow-root">
            <ul className="-mb-8">
              {events.map((event, eventIdx) => (
                <li key={event.id}>
                  <div className="relative pb-8">
                    {eventIdx !== events.length - 1 ? (
                      <span
                        className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200"
                        aria-hidden="true"
                      />
                    ) : null}
                    <div className="relative flex space-x-3">
                      <div>
                        <span
                          className={`h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-white ${
                            event.event_type === 'comment'
                              ? 'bg-blue-50'
                              : 'bg-gray-50'
                          }`}
                        >
                          {event.event_type === 'comment' ? (
                            <MessageSquare className="h-4 w-4 text-blue-500" />
                          ) : (
                            <Activity className="h-4 w-4 text-gray-500" />
                          )}
                        </span>
                      </div>
                      <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                        <div>
                          <p className="text-sm text-gray-500">
                            <span className="font-medium text-gray-900 mr-2">
                              {event.user_first_name} {event.user_last_name}
                            </span>
                            {event.event_type === 'system' ? (
                              <span>
                                เปลี่ยนสถานะเป็น <span className="font-medium text-gray-900">{event.content}</span>
                              </span>
                            ) : (
                              <span>{event.content}</span>
                            )}
                          </p>
                        </div>
                        <div className="whitespace-nowrap text-right text-sm text-gray-500">
                          {formatTime(event.created_at)}
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
