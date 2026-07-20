import { useState } from 'react';

interface ItinerarySummary {
  slug: string;
  title: string;
  region: string;
  duration_days: number;
  difficulty: string;
  total_distance: string;
  vehicle_requirement: string;
  ferry_dependent: boolean;
  best_season: string;
  spring_count: number;
  description: string;
}

interface ItineraryComparisonProps {
  itineraries: ItinerarySummary[];
}

const REGION_LABELS: Record<string, string> = {
  washington: 'Washington',
  alaska: 'Alaska',
  shasta: 'Shasta',
  colorado: 'Colorado + NM',
  rockies: 'Northern Rockies',
  desert: 'Desert Southwest',
};

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: '#2d7a3e',
  moderate: '#b8915f',
  strenuous: '#e67e22',
  expert: '#c0392b',
};

const VEHICLE_LABELS: Record<string, string> = {
  any: 'Any Vehicle',
  high_clearance: 'High Clearance',
  awd_4wd: 'AWD/4WD',
  not_winter_accessible: 'Not Winter Accessible',
};

function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <label
      onClick={(e) => { e.preventDefault(); onChange(); }}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem',
        borderRadius: '0.5rem', border: checked ? '2px solid #b8915f' : '1px solid #e5e0d8',
        background: checked ? '#faf8f5' : '#fff', cursor: 'pointer',
        fontFamily: 'Fraunces, serif', fontSize: '0.875rem', color: '#1a1a1a',
        transition: 'border-color 0.2s, background 0.2s', userSelect: 'none',
      }}
    >
      <span style={{
        width: '1rem', height: '1rem', borderRadius: '0.25rem', border: '1px solid #b8915f',
        background: checked ? '#b8915f' : '#fff', display: 'flex', alignItems: 'center',
        justifyContent: 'center', color: '#fff', fontSize: '0.7rem', flexShrink: 0,
      }}>
        {checked ? '✓' : ''}
      </span>
      {label}
    </label>
  );
}

function CompareRow({ label, values }: { label: string; values: (string | number)[] }) {
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid #e5e0d8' }}>
      <div style={{
        flex: '0 0 140px', padding: '0.75rem', fontWeight: 600, fontSize: '0.8rem',
        color: '#4a4a4a', textTransform: 'uppercase', letterSpacing: '0.05em',
        fontFamily: 'Fraunces, serif',
      }}>
        {label}
      </div>
      {values.map((val, i) => (
        <div key={i} style={{
          flex: 1, padding: '0.75rem', fontSize: '0.875rem', color: '#1a1a1a',
          fontFamily: 'Fraunces, serif',
        }}>
          {val}
        </div>
      ))}
    </div>
  );
}

export default function ItineraryComparison({ itineraries }: ItineraryComparisonProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (slug: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
      } else if (next.size < 3) {
        next.add(slug);
      }
      return next;
    });
  };

  const selectedItineraries = itineraries.filter((it) => selected.has(it.slug));

  if (itineraries.length < 2) {
    return (
      <p style={{ textAlign: 'center', color: '#4a4a4a', padding: '2rem', fontFamily: 'Fraunces, serif' }}>
        Once we have 2+ itineraries, you can compare them side-by-side here.
      </p>
    );
  }

  return (
    <div style={{ fontFamily: 'Fraunces, serif' }}>
      <p style={{ fontSize: '0.875rem', color: '#4a4a4a', marginBottom: '1rem' }}>
        Select 2-3 itineraries to compare ({selected.size}/3 selected)
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {itineraries.map((it) => (
          <Checkbox
            key={it.slug}
            checked={selected.has(it.slug)}
            onChange={() => toggle(it.slug)}
            label={it.title}
          />
        ))}
      </div>

      {selectedItineraries.length >= 2 ? (
        <div style={{
          border: '1px solid #e5e0d8', borderRadius: '0.75rem', overflow: 'hidden',
          background: '#fff',
        }}>
          <div style={{ display: 'flex', borderBottom: '2px solid #e5e0d8', background: '#faf8f5' }}>
            <div style={{ flex: '0 0 140px', padding: '0.75rem', fontWeight: 700, fontSize: '0.8rem', color: '#1a1a1a', textTransform: 'uppercase', fontFamily: 'Fraunces, serif' }}>
              Attribute
            </div>
            {selectedItineraries.map((it) => (
              <div key={it.slug} style={{ flex: 1, padding: '0.75rem', fontWeight: 700, fontSize: '0.9rem', color: '#1a1a1a', fontFamily: 'Fraunces, serif' }}>
                <a href={`/itineraries/${it.slug}`} style={{ color: '#1a1a1a', textDecoration: 'none' }}>
                  {it.title}
                </a>
              </div>
            ))}
          </div>
          <CompareRow label="Region" values={selectedItineraries.map((it) => REGION_LABELS[it.region] || it.region)} />
          <CompareRow label="Duration" values={selectedItineraries.map((it) => `${it.duration_days} days`)} />
          <CompareRow
            label="Difficulty"
            values={selectedItineraries.map((it) => (
              <span style={{ color: DIFFICULTY_COLORS[it.difficulty] || '#4a4a4a', fontWeight: 600, textTransform: 'capitalize' }}>
                {it.difficulty}
              </span> as unknown as string))}
          />
          <CompareRow label="Distance" values={selectedItineraries.map((it) => it.total_distance || '—')} />
          <CompareRow label="Vehicle" values={selectedItineraries.map((it) => VEHICLE_LABELS[it.vehicle_requirement] || it.vehicle_requirement)} />
          <CompareRow
            label="Ferry"
            values={selectedItineraries.map((it) => (it.ferry_dependent ? 'Required' : 'No'))}
          />
          <CompareRow label="Best Season" values={selectedItineraries.map((it) => it.best_season || '—')} />
          <CompareRow label="Springs" values={selectedItineraries.map((it) => `${it.spring_count} springs`)} />
        </div>
      ) : (
        <p style={{ textAlign: 'center', color: '#95a5a6', fontSize: '0.875rem', padding: '1rem' }}>
          Select at least 2 itineraries to see the comparison.
        </p>
      )}
    </div>
  );
}
