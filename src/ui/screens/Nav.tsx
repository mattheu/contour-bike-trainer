import { Segmented } from '../components/Segmented';

/** The three collections, which is the whole nav: a profile is not a collection. */
export type ListScreen = 'rides' | 'routes' | 'workouts';

const OPTIONS = [
  { value: 'rides', label: 'Rides' },
  { value: 'routes', label: 'Routes' },
  { value: 'workouts', label: 'Workouts' },
] as const;

export function Nav({ value, onChange }: { value: ListScreen; onChange: (v: ListScreen) => void }) {
  return <Segmented options={OPTIONS} value={value} onChange={onChange} label="Section" />;
}
