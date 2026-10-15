import { Segmented } from '../components/Segmented';

/** The three collections, which is the whole nav: a profile is not a collection. */
export type ListScreen = 'rides' | 'routes' | 'workouts';

// What you can ride first, what you have ridden last: the two collections you pick a
// session from lead, and the history you look back at follows them.
const OPTIONS = [
  { value: 'routes', label: 'Routes' },
  { value: 'workouts', label: 'Workouts' },
  { value: 'rides', label: 'Rides' },
] as const;

export function Nav({ value, onChange }: { value: ListScreen; onChange: (v: ListScreen) => void }) {
  return <Segmented options={OPTIONS} value={value} onChange={onChange} label="Section" />;
}
