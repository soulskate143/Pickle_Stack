'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { loadOpenPlay, loadTournaments } from '../lib/storage';
import { computeStandings, getEntrantName } from '../lib/tournament';
import type { OpenPlaySession, Tournament } from '../lib/types';

// ─── Types ────────────────────────────────────────────────────────────────────

type CameraType = 'webcam' | 'url';

interface CameraSlot {
  id: string;
  label: string;
  type: CameraType;
  deviceId?: string; // for webcam
  url?: string;      // for URL stream
}

const CAMERAS_KEY = 'pb_live_cameras';

function loadCameras(): CameraSlot[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CAMERAS_KEY);
    return raw ? (JSON.parse(raw) as CameraSlot[]) : [];
  } catch {
    return [];
  }
}

function saveCameras(slots: CameraSlot[]) {
  localStorage.setItem(CAMERAS_KEY, JSON.stringify(slots));
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function elapsed(startTime: number): string {
  const secs = Math.floor((Date.now() - startTime) / 1000);
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ─── Webcam feed ──────────────────────────────────────────────────────────────

function WebcamFeed({ deviceId }: { deviceId?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setErr(null);
    let stream: MediaStream | null = null;

    navigator.mediaDevices
      .getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId } } : true,
        audio: false,
      })
      .then((s) => {
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
        }
      })
      .catch((e: Error) => setErr(e.message));

    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [deviceId]);

  if (err) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-zinc-900 text-zinc-500">
        <span className="text-3xl">📷</span>
        <p className="text-xs text-center px-4">{err}</p>
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      className="w-full h-full object-cover"
    />
  );
}

// ─── URL feed ─────────────────────────────────────────────────────────────────

function UrlFeed({ url }: { url: string }) {
  const [imgErr, setImgErr] = useState(false);

  // Heuristic: treat as MJPEG image stream if no recognisable video extension
  const videoExts = ['.mp4', '.webm', '.ogg', '.m3u8', '.mov'];
  const isVideo = videoExts.some((e) => url.toLowerCase().includes(e));

  if (!isVideo && !imgErr) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt="Camera feed"
        className="w-full h-full object-cover"
        onError={() => setImgErr(true)}
      />
    );
  }

  return (
    <video
      src={url}
      autoPlay
      muted
      playsInline
      className="w-full h-full object-cover"
      onError={() => {}}
    />
  );
}

// ─── Single camera panel ──────────────────────────────────────────────────────

function CameraPanel({
  slot,
  onMaximize,
  isMaximized,
}: {
  slot: CameraSlot;
  onMaximize: () => void;
  isMaximized?: boolean;
}) {
  return (
    <div className="relative w-full h-full bg-zinc-900 overflow-hidden rounded-lg group">
      {slot.type === 'webcam' ? (
        <WebcamFeed deviceId={slot.deviceId} />
      ) : slot.url ? (
        <UrlFeed url={slot.url} />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-zinc-700">
          <span className="text-4xl">📷</span>
        </div>
      )}

      {/* Label overlay */}
      <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-gradient-to-t from-black/70 to-transparent">
        <span className="text-xs font-semibold text-white/80">{slot.label}</span>
      </div>

      {/* Maximize / minimize button */}
      <button
        onClick={onMaximize}
        title={isMaximized ? 'Minimize' : 'Maximize'}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 hover:bg-black/80 text-white rounded-md px-2 py-1 text-xs font-semibold flex items-center gap-1"
      >
        {isMaximized ? '⊡ Minimize' : '⛶ Expand'}
      </button>
    </div>
  );
}

// ─── Score board ──────────────────────────────────────────────────────────────

function ScoreBoard({ tick }: { tick: number }) {
  const [openPlay, setOpenPlay] = useState<OpenPlaySession | null>(null);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setOpenPlay(loadOpenPlay());
    const all = loadTournaments();
    setTournaments(all);
    // Auto-select first active tournament only on initial load
    setSelectedId((prev) => {
      if (prev && all.find((t) => t.id === prev)) return prev;
      return all.find((t) => t.status === 'active')?.id ?? all[0]?.id ?? null;
    });
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, [refresh]);

  const selectedTournament = tournaments.find((t) => t.id === selectedId) ?? null;
  const activeCourts = openPlay?.courts.filter((c) => c.game !== null) ?? [];
  const queueCount = openPlay?.queue.length ?? 0;

  return (
    <div className="flex flex-col gap-4 overflow-y-auto h-full pr-1">

      {/* Open play courts */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
            Courts
          </span>
          <span className="text-[10px] text-zinc-600">
            {activeCourts.length} active · {queueCount} in queue
          </span>
        </div>

        {activeCourts.length === 0 ? (
          <p className="text-xs text-zinc-600 italic">No active games</p>
        ) : (
          <div className="flex flex-col gap-2">
            {activeCourts.map((court) => (
              <div
                key={court.id}
                className="bg-zinc-800 rounded-lg px-3 py-2 border border-zinc-700"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-pb-green-light uppercase tracking-wide">
                    Court {court.id}
                  </span>
                  <span className="text-[11px] font-mono text-orange-400">
                    {tick >= 0 && elapsed(court.game!.startTime)}
                  </span>
                </div>

                {/* Team A vs Team B layout */}
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    {court.game!.players.slice(0, 2).map((p) => (
                      <div key={p.id} className="text-[13px] font-semibold text-white leading-snug truncate">
                        {p.name}
                      </div>
                    ))}
                  </div>
                  <div className="text-zinc-600 text-sm font-bold shrink-0">vs</div>
                  <div className="flex-1 text-right">
                    {court.game!.players.slice(2, 4).map((p) => (
                      <div key={p.id} className="text-[13px] font-semibold text-white leading-snug truncate">
                        {p.name}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Queue preview */}
        {queueCount > 0 && (
          <div className="mt-2 px-3 py-2 bg-zinc-800/50 rounded-lg border border-zinc-800">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">
              Up next ({queueCount} waiting)
            </span>
            <div className="flex flex-wrap gap-1 mt-1">
              {openPlay!.queue.slice(0, 4).map((p, i) => (
                <span
                  key={p.id}
                  className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${
                    i < 4 ? 'bg-pb-green/30 text-pb-green-light' : 'bg-zinc-800 text-zinc-500'
                  }`}
                >
                  {p.name}
                </span>
              ))}
              {queueCount > 4 && (
                <span className="text-[11px] text-zinc-600">+{queueCount - 4} more</span>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Tournament picker + display */}
      <section className="border-t border-zinc-800 pt-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 shrink-0">
            Tournament
          </span>
          {selectedTournament?.status === 'active' && (
            <span className="text-[10px] text-orange-400 font-semibold">LIVE</span>
          )}
        </div>

        {tournaments.length === 0 ? (
          <p className="text-xs text-zinc-600 italic">No tournaments</p>
        ) : (
          <select
            value={selectedId ?? ''}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
          >
            {tournaments.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}{t.status === 'active' ? ' 🟠' : t.status === 'completed' ? ' ✓' : ''}
              </option>
            ))}
          </select>
        )}

        {selectedTournament && (
          selectedTournament.format === 'round-robin' ? (
            <RRLiveStandings tournament={selectedTournament} />
          ) : (
            <ElimLiveStatus tournament={selectedTournament} />
          )
        )}
      </section>
    </div>
  );
}

// ─── Round-robin live standings ───────────────────────────────────────────────

function RRLiveStandings({ tournament }: { tournament: Tournament }) {
  const standings = computeStandings(tournament);
  const done = tournament.matches.filter((m) => m.status === 'completed').length;
  const total = tournament.matches.length;

  return (
    <div className="flex flex-col gap-2">
      <div className="w-full bg-zinc-800 rounded-full h-1 overflow-hidden">
        <div
          className="h-full bg-orange-500 rounded-full transition-all"
          style={{ width: total ? `${(done / total) * 100}%` : '0%' }}
        />
      </div>
      <span className="text-[10px] text-zinc-600">{done}/{total} matches played</span>

      <table className="w-full text-[12px] mt-1">
        <tbody>
          {standings.slice(0, 8).map((s, i) => (
            <tr key={s.entrantId} className={`border-b border-zinc-800 ${i === 0 ? 'text-orange-400' : 'text-zinc-300'}`}>
              <td className="py-1 pr-2 text-zinc-600 w-5">{i + 1}</td>
              <td className="py-1 flex-1 font-medium truncate max-w-[120px]">
                {getEntrantName(tournament, s.entrantId)}
              </td>
              <td className="py-1 px-2 text-right font-bold">{s.wins}W</td>
              <td className="py-1 text-right text-zinc-600">{s.losses}L</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Single-elim live status ──────────────────────────────────────────────────

function ElimLiveStatus({ tournament }: { tournament: Tournament }) {
  const rounds = Array.from(new Set(tournament.matches.map((m) => m.round))).sort(
    (a, b) => a - b
  );
  const totalRounds = rounds.length;

  // Show last 2 rounds (semis + final)
  const focusRounds = rounds.slice(-2);

  return (
    <div className="flex flex-col gap-3">
      {focusRounds.map((r, ri) => {
        const label =
          r === rounds[totalRounds - 1]
            ? 'Final'
            : r === rounds[totalRounds - 2]
            ? 'Semi-Finals'
            : `Round ${r}`;
        const matches = tournament.matches
          .filter((m) => m.round === r)
          .sort((a, b) => a.slot - b.slot);

        return (
          <div key={r}>
            <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
              {label}
            </span>
            <div className="flex flex-col gap-1 mt-1">
              {matches.map((m) => {
                const n1 = m.entrant1Id ? getEntrantName(tournament, m.entrant1Id) : 'TBD';
                const n2 = m.entrant2Id ? getEntrantName(tournament, m.entrant2Id) : 'TBD';
                const done = m.status === 'completed';
                return (
                  <div
                    key={m.id}
                    className="flex items-center gap-1 bg-zinc-800 rounded px-2 py-1.5 border border-zinc-700"
                  >
                    <span className={`flex-1 text-[12px] truncate ${m.winnerId === m.entrant1Id ? 'text-orange-400 font-bold' : 'text-zinc-300'}`}>
                      {n1}
                    </span>
                    {done && (
                      <span className="text-[11px] font-mono bg-zinc-700 px-1 rounded text-zinc-400">
                        {m.score1}-{m.score2}
                      </span>
                    )}
                    <span className="text-zinc-700 text-[10px] px-1">vs</span>
                    {done && (
                      <span className="text-[11px] font-mono bg-zinc-700 px-1 rounded text-zinc-400">
                        {m.score2}-{m.score1}
                      </span>
                    )}
                    <span className={`flex-1 text-right text-[12px] truncate ${m.winnerId === m.entrant2Id ? 'text-orange-400 font-bold' : 'text-zinc-300'}`}>
                      {n2}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Camera config panel ──────────────────────────────────────────────────────

function ConfigPanel({
  slots,
  onChange,
  onClose,
}: {
  slots: CameraSlot[];
  onChange: (slots: CameraSlot[]) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<CameraSlot[]>(slots);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    navigator.mediaDevices
      .enumerateDevices()
      .then((all) => setDevices(all.filter((d) => d.kind === 'videoinput')));
  }, []);

  function addSlot() {
    if (draft.length >= 4) return;
    setDraft([...draft, { id: uid(), label: `Camera ${draft.length + 1}`, type: 'webcam' }]);
  }

  function removeSlot(id: string) {
    setDraft(draft.filter((s) => s.id !== id));
  }

  function updateSlot(id: string, patch: Partial<CameraSlot>) {
    setDraft(draft.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function save() {
    onChange(draft);
    saveCameras(draft);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center px-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h2 className="font-bold text-white">Camera Setup</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors text-xl leading-none">×</button>
        </div>

        <div className="p-5 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
          {draft.map((slot, i) => (
            <div key={slot.id} className="bg-zinc-800 rounded-xl p-4 flex flex-col gap-3 border border-zinc-700">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wide">Camera {i + 1}</span>
                <button
                  onClick={() => removeSlot(slot.id)}
                  className="text-zinc-600 hover:text-red-400 transition-colors text-sm"
                >
                  Remove
                </button>
              </div>

              <input
                value={slot.label}
                onChange={(e) => updateSlot(slot.id, { label: e.target.value })}
                placeholder="Label (e.g. Court 1)"
                className="bg-zinc-700 border border-zinc-600 rounded-lg px-3 py-1.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />

              <div className="flex gap-2">
                {(['webcam', 'url'] as CameraType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => updateSlot(slot.id, { type: t, url: undefined, deviceId: undefined })}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      slot.type === t
                        ? 'bg-orange-500 text-white'
                        : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600'
                    }`}
                  >
                    {t === 'webcam' ? '📷 Webcam' : '🔗 Stream URL'}
                  </button>
                ))}
              </div>

              {slot.type === 'webcam' && (
                <select
                  value={slot.deviceId ?? ''}
                  onChange={(e) => updateSlot(slot.id, { deviceId: e.target.value || undefined })}
                  className="bg-zinc-700 border border-zinc-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="">Default camera</option>
                  {devices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Camera ${d.deviceId.slice(0, 6)}`}
                    </option>
                  ))}
                </select>
              )}

              {slot.type === 'url' && (
                <input
                  value={slot.url ?? ''}
                  onChange={(e) => updateSlot(slot.id, { url: e.target.value })}
                  placeholder="http://192.168.1.x/stream  or  rtsp://..."
                  className="bg-zinc-700 border border-zinc-600 rounded-lg px-3 py-1.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              )}
            </div>
          ))}

          {draft.length < 4 && (
            <button
              onClick={addSlot}
              className="border-2 border-dashed border-zinc-700 hover:border-orange-500 rounded-xl py-3 text-sm text-zinc-500 hover:text-orange-400 transition-colors"
            >
              + Add Camera (max 4)
            </button>
          )}
        </div>

        <div className="px-5 py-4 border-t border-zinc-800 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={save}
            className="px-5 py-2 bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main live page ───────────────────────────────────────────────────────────

export default function LivePage() {
  const [cameras, setCameras] = useState<CameraSlot[]>([]);
  const [configOpen, setConfigOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const [maximizedId, setMaximizedId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<'cameras' | 'scores'>('scores');

  useEffect(() => {
    setCameras(loadCameras());
  }, []);

  // Timer for court elapsed times
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // ESC to minimize
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMaximizedId(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function requestFullscreen() {
    document.documentElement.requestFullscreen?.().catch(() => {});
  }

  function toggleMaximize(id: string) {
    setMaximizedId((prev) => (prev === id ? null : id));
  }

  const camCount = cameras.length;
  const cameraGridCols = camCount <= 1 ? 'grid-cols-1' : 'grid-cols-2';
  const maximizedSlot = maximizedId ? cameras.find((c) => c.id === maximizedId) : null;

  return (
    <>
      {/* Header bar */}
      <header className="flex items-center justify-between px-4 py-1.5 bg-zinc-900 border-b border-zinc-800 shrink-0">
        <span className="flex items-center gap-1.5 bg-red-600/20 border border-red-600/40 text-red-400 text-[11px] font-bold px-2 py-0.5 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          LIVE
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setConfigOpen(true)}
            className="text-zinc-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-zinc-800 text-sm flex items-center gap-1.5"
          >
            <span>⚙</span> <span className="hidden sm:inline">Cameras</span>
          </button>
          <button
            onClick={requestFullscreen}
            className="text-zinc-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-zinc-800 text-sm"
            title="Full screen"
          >
            ⛶
          </button>
          <a
            href="/"
            className="text-zinc-600 hover:text-zinc-400 transition-colors text-xs px-2"
          >
            ← Back
          </a>
        </div>
      </header>

      {/* Mobile tab switcher */}
      <div className="flex sm:hidden border-b border-zinc-800 bg-zinc-900 shrink-0">
        {(['scores', 'cameras'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setMobileTab(tab)}
            className={`flex-1 py-2 text-xs font-semibold capitalize transition-colors ${
              mobileTab === tab
                ? 'text-orange-400 border-b-2 border-orange-400'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {tab === 'cameras' ? '📷 Cameras' : '📊 Scores'}
          </button>
        ))}
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* Camera area — hidden on mobile when scores tab active */}
        <div className={`min-w-0 p-3 ${camCount === 0 ? 'flex items-center justify-center' : ''}
          ${mobileTab === 'cameras' ? 'flex flex-1' : 'hidden sm:flex sm:flex-1'}`}>
          {camCount === 0 ? (
            <div className="flex flex-col items-center gap-4 text-zinc-700">
              <span className="text-6xl">📷</span>
              <p className="text-sm">No cameras configured</p>
              <button
                onClick={() => setConfigOpen(true)}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2 rounded-lg text-sm transition-colors"
              >
                ⚙ Set up cameras
              </button>
            </div>
          ) : maximizedSlot ? (
            <CameraPanel
              key={maximizedSlot.id}
              slot={maximizedSlot}
              onMaximize={() => setMaximizedId(null)}
              isMaximized
            />
          ) : (
            <div className={`grid ${cameraGridCols} gap-2 w-full h-full`}>
              {cameras.map((slot) => (
                <CameraPanel
                  key={slot.id}
                  slot={slot}
                  onMaximize={() => toggleMaximize(slot.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Score sidebar — full width on mobile when scores tab active */}
        <aside className={`shrink-0 border-zinc-800 bg-zinc-900 p-4 flex flex-col min-h-0 overflow-hidden
          ${mobileTab === 'scores' ? 'flex w-full' : 'hidden sm:flex sm:w-72 sm:border-l'}`}>
          <ScoreBoard tick={tick} />
        </aside>
      </div>

      {configOpen && (
        <ConfigPanel
          slots={cameras}
          onChange={setCameras}
          onClose={() => setConfigOpen(false)}
        />
      )}
    </>
  );
}
